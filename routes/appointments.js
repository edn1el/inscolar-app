const express = require('express');
const { load, save, nextId } = require('../lib/db');
const { requireAuth } = require('../lib/middleware');
const { notifyUser } = require('../lib/notify');
const { logEvent } = require('../lib/audit');
const { citasPeriodStatus } = require('../lib/periods');

const router = express.Router();
router.use(requireAuth);

const MOTIVOS = ['Entrega de documentos', 'Entrevista de admisión', 'Seguimiento académico', 'Otro'];
const STAFF_ROLES = ['Administrador', 'Soporte'];

function publicAppointment(a, db) {
  const institucion = db.institutions.find((i) => i.id === a.institucionId);
  const tutor = db.users.find((u) => u.id === a.tutorId);
  const student = a.studentId ? db.students.find((s) => s.id === a.studentId) : null;
  return {
    ...a,
    institucionNombre: institucion ? institucion.nombre : '—',
    tutorNombre: tutor ? tutor.nombre : '—',
    estudianteNombre: student ? student.nombre : null,
  };
}

router.get('/appointments', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const { estado, institucionId } = req.query;
  let list = db.appointments.slice();

  if (u.role === 'Tutor') list = list.filter((a) => a.tutorId === u.id);
  else if (u.role === 'Personal de institución') list = list.filter((a) => a.institucionId === u.institucionId);
  else if (!STAFF_ROLES.includes(u.role)) list = [];

  if (estado && estado !== 'Todos') list = list.filter((a) => a.estado === estado);
  if (institucionId && institucionId !== 'Todas' && STAFF_ROLES.includes(u.role)) {
    list = list.filter((a) => a.institucionId === institucionId);
  }

  list.sort((a, b) => new Date(a.fechaHoraSolicitada) - new Date(b.fechaHoraSolicitada));
  res.json({ total: list.length, appointments: list.map((a) => publicAppointment(a, db)) });
});

router.post('/appointments', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo un tutor puede solicitar una cita.' });

  const { institucionId, studentId, motivo, fechaHoraSolicitada, notas } = req.body || {};
  const errors = [];
  const institucion = db.institutions.find((i) => i.id === institucionId);
  if (!institucion) errors.push('Selecciona una institución válida.');
  else if ((institucion.estado || 'Activo') !== 'Activo') errors.push('Esa institución no está activa actualmente.');
  if (!MOTIVOS.includes(motivo)) errors.push('Selecciona un motivo válido.');
  const when = new Date(fechaHoraSolicitada);
  if (!fechaHoraSolicitada || isNaN(when.getTime())) errors.push('Selecciona una fecha y hora válidas.');
  else if (when.getTime() <= Date.now()) errors.push('La fecha y hora deben ser en el futuro.');
  let student = null;
  if (studentId) {
    student = db.students.find((s) => s.id === studentId && s.tutorId === u.id);
    if (!student) errors.push('El estudiante seleccionado no es válido.');
  }
  let activePeriod = null;
  if (institucion) {
    const { hasConfig, active } = citasPeriodStatus(db, institucion.id);
    if (hasConfig && !active) {
      errors.push('No hay un periodo habilitado para agendar citas en esta institución actualmente.');
    } else if (active) {
      activePeriod = active;
      const limite = active.citas.limiteCitas;
      if (limite) {
        const count = db.appointments.filter((a) =>
          a.institucionId === institucion.id && 
          (a.estado === 'Pendiente' || a.estado === 'Aceptada' || a.estado === 'Confirmada') &&
          new Date(a.createdAt) >= new Date(active.citas.desde) && 
          new Date(a.createdAt) <= new Date(new Date(active.citas.hasta).setHours(23, 59, 59, 999))
        ).length;
        if (count >= limite) errors.push(`Se alcanzó el límite de citas (${limite}) para el periodo actual de esta institución.`);
      }
    }
  }
  if (errors.length) return res.status(400).json({ errors });

  const appointment = {
    id: nextId(db.appointments, 'c'),
    tutorId: u.id,
    studentId: student ? student.id : null,
    institucionId: institucion.id,
    motivo,
    notas: (notas || '').trim(),
    fechaHoraSolicitada: when.toISOString(),
    fechaHoraConfirmada: null,
    estado: 'Pendiente',
    motivoCancelacion: '',
    motivoRechazo: '',
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  db.appointments.push(appointment);
  logEvent(db, { actor: u, accion: 'Cita creada', entidad: 'Cita', entidadId: appointment.id, detalle: `${institucion.nombre} · ${motivo}` });
  save(db);
  res.json({ appointment: publicAppointment(appointment, db) });
});

router.post('/appointments/:id/confirmar', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const appointment = db.appointments.find((a) => a.id === req.params.id);
  if (!appointment) return res.status(404).json({ error: 'Cita no encontrada.' });

  const canDecide = STAFF_ROLES.includes(u.role) || (u.role === 'Personal de institución' && u.institucionId === appointment.institucionId);
  if (!canDecide) return res.status(403).json({ error: 'No tienes permiso para confirmar esta cita.' });
  if (appointment.estado !== 'Pendiente') return res.status(400).json({ error: 'Esta cita ya fue decidida.' });

  const { fechaHoraConfirmada } = req.body || {};
  let finalWhen = appointment.fechaHoraSolicitada;
  if (fechaHoraConfirmada) {
    const w = new Date(fechaHoraConfirmada);
    if (isNaN(w.getTime())) return res.status(400).json({ errors: ['La fecha y hora confirmadas no son válidas.'] });
    finalWhen = w.toISOString();
  }

  appointment.estado = 'Confirmada';
  appointment.fechaHoraConfirmada = finalWhen;
  appointment.decidedAt = new Date().toISOString();
  appointment.decidedBy = u.id;
  logEvent(db, { actor: u, accion: 'Cita confirmada', entidad: 'Cita', entidadId: appointment.id, detalle: '' });

  const tutorConfirm = db.users.find((t) => t.id === appointment.tutorId);
  if (tutorConfirm) {
    notifyUser(db, {
      recipient: tutorConfirm,
      campo: 'Estado de cita',
      anterior: 'Pendiente',
      nuevo: 'Confirmada',
      actor: u,
      userNombre: tutorConfirm.nombre,
    });
  }

  save(db);
  res.json({ appointment: publicAppointment(appointment, db) });
});

// HU054: rechazar una cita Pendiente (distinto de cancelar, que tambien aplica a una
// cita ya Confirmada). Solo el personal de la institucion o Administracion puede rechazar,
// y siempre requiere un motivo.
router.post('/appointments/:id/rechazar', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const appointment = db.appointments.find((a) => a.id === req.params.id);
  if (!appointment) return res.status(404).json({ error: 'Cita no encontrada.' });

  const canDecide = STAFF_ROLES.includes(u.role) || (u.role === 'Personal de institución' && u.institucionId === appointment.institucionId);
  if (!canDecide) return res.status(403).json({ error: 'No tienes permiso para rechazar esta cita.' });
  if (appointment.estado !== 'Pendiente') return res.status(400).json({ error: 'Solo se puede rechazar una cita pendiente.' });

  const { motivo } = req.body || {};
  if (!motivo || !motivo.trim()) return res.status(400).json({ error: 'Indica el motivo del rechazo.' });

  appointment.estado = 'Rechazada';
  appointment.motivoRechazo = motivo.trim();
  appointment.decidedAt = new Date().toISOString();
  appointment.decidedBy = u.id;
  logEvent(db, { actor: u, accion: 'Cita rechazada', entidad: 'Cita', entidadId: appointment.id, detalle: appointment.motivoRechazo });

  const tutorReject = db.users.find((t) => t.id === appointment.tutorId);
  if (tutorReject) {
    notifyUser(db, {
      recipient: tutorReject,
      campo: 'Estado de cita',
      anterior: 'Pendiente',
      nuevo: 'Rechazada',
      actor: u,
      userNombre: tutorReject.nombre,
    });
  }

  save(db);
  res.json({ appointment: publicAppointment(appointment, db) });
});

router.post('/appointments/:id/cancelar', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const appointment = db.appointments.find((a) => a.id === req.params.id);
  if (!appointment) return res.status(404).json({ error: 'Cita no encontrada.' });

  const isOwner = appointment.tutorId === u.id;
  const isStaffOfInst = u.role === 'Personal de institución' && u.institucionId === appointment.institucionId;
  const canCancel = isOwner || isStaffOfInst || STAFF_ROLES.includes(u.role);
  if (!canCancel) return res.status(403).json({ error: 'No tienes permiso para cancelar esta cita.' });
  if (appointment.estado === 'Cancelada' || appointment.estado === 'Rechazada') {
    return res.status(400).json({ error: 'Esta cita ya fue decidida y no se puede cancelar.' });
  }

  const { motivo } = req.body || {};
  if (!isOwner && (!motivo || !motivo.trim())) return res.status(400).json({ error: 'Indica el motivo de la cancelación.' });

  const estadoAnterior = appointment.estado;
  appointment.estado = 'Cancelada';
  appointment.motivoCancelacion = (motivo || '').trim();
  appointment.decidedAt = new Date().toISOString();
  appointment.decidedBy = u.id;
  logEvent(db, { actor: u, accion: 'Cita cancelada', entidad: 'Cita', entidadId: appointment.id, detalle: appointment.motivoCancelacion });

  // Si fue el propio tutor quien cancelo, no hace falta notificarlo de su propia accion.
  if (!isOwner) {
    const tutorCancel = db.users.find((t) => t.id === appointment.tutorId);
    if (tutorCancel) {
      notifyUser(db, {
        recipient: tutorCancel,
        campo: 'Estado de cita',
        anterior: estadoAnterior,
        nuevo: 'Cancelada',
        actor: u,
        userNombre: tutorCancel.nombre,
      });
    }
  }

  save(db);
  res.json({ appointment: publicAppointment(appointment, db) });
});

module.exports = router;
