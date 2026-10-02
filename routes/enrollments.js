const express = require('express');
const { load, save, nextId } = require('../lib/db');
const { requireAuth } = require('../lib/middleware');
const { notifyUser } = require('../lib/notify');
const { logEvent } = require('../lib/audit');
const { findPeriod, withinRange } = require('../lib/periods');

const router = express.Router();
router.use(requireAuth);

const GRADOS = [
  'Pre-Primario', '1ro de Primaria', '2do de Primaria', '3ro de Primaria', '4to de Primaria',
  '5to de Primaria', '6to de Primaria', '1ro de Secundaria', '2do de Secundaria',
  '3ro de Secundaria', '4to de Secundaria', '5to de Secundaria', '6to de Secundaria',
];
const CICLO_RE = /^\d{4}-\d{4}$/;
const STAFF_ROLES = ['Administrador', 'Soporte'];
function publicEnrollment(e, db) {
  const student = db.students.find((s) => s.id === e.studentId);
  const institucion = db.institutions.find((i) => i.id === e.institucionId);
  const tutor = db.users.find((u) => u.id === e.tutorId);
  return {
    ...e,
    estudianteNombre: student ? student.nombre : '—',
    institucionNombre: institucion ? institucion.nombre : '—',
    tutorNombre: tutor ? tutor.nombre : '—',
  };
}


// ---- borradores de inscripcion (F5.2) ----

// Constantes de expiracion. Para pruebas, se pueden sobreescribir mediante query param.
const DRAFT_EXPIRE_MINS = 20;

function sweepExpiredDrafts(db) {
  if (!db.drafts) db.drafts = [];
  const now = Date.now();
  let changed = false;
  for (const d of db.drafts) {
    if (!d.estado && d.expiresAt <= now) {
      d.estado = 'Abandonada';
      logEvent(db, { actor: null, accion: 'Borrador abandonado por inactividad', entidad: 'Borrador', entidadId: d.id });
      changed = true;
    }
  }
  if (changed) save(db);
}

router.post('/drafts', (req, res) => {
  const db = req.db;
  sweepExpiredDrafts(db);
  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo tutores pueden crear borradores.' });
  
  const testMinutes = DRAFT_EXPIRE_MINS;
  const draft = {
    id: nextId(db.drafts || [], 'd'),
    tutorId: u.id,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    expiresAt: Date.now() + (testMinutes * 60 * 1000),
    data: req.body || {}
  };
  
  if (!db.drafts) db.drafts = [];
  db.drafts.push(draft);
  save(db);
  res.json({ draft });
});

router.get('/drafts/:id', (req, res) => {
  const db = req.db;
  sweepExpiredDrafts(db);
  const u = req.currentUser;
  const draft = (db.drafts || []).find(d => d.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'Borrador expirado o inexistente.' });
  if (draft.tutorId !== u.id) return res.status(403).json({ error: 'No autorizado.' });
  if (draft.estado) return res.status(410).json({ error: 'Borrador expirado o finalizado.' });
  
  res.json({ draft, timeRemaining: draft.expiresAt - Date.now() });
});

router.put('/drafts/:id', (req, res) => {
  const db = req.db;
  sweepExpiredDrafts(db);
  const u = req.currentUser;
  const draft = (db.drafts || []).find(d => d.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'Borrador expirado o inexistente.' });
  if (draft.tutorId !== u.id) return res.status(403).json({ error: 'No autorizado.' });
  if (draft.estado) return res.status(410).json({ error: 'Borrador expirado o finalizado.' });
  
  const testMinutes = DRAFT_EXPIRE_MINS;
  
  // Registrar actividad
  draft.lastActivity = Date.now();
  draft.expiresAt = Date.now() + (testMinutes * 60 * 1000);
  
  // Guardar datos si vienen en el body
  if (req.body && Object.keys(req.body).length > 0) {
    draft.data = { ...draft.data, ...req.body };
  }
  
  save(db);
  res.json({ draft, timeRemaining: draft.expiresAt - Date.now() });
});

router.delete('/drafts/:id', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const draft = (db.drafts || []).find(d => d.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'Borrador expirado o inexistente.' });
  if (draft.tutorId !== u.id) return res.status(403).json({ error: 'No autorizado.' });
  if (draft.estado) return res.status(410).json({ error: 'Borrador expirado o finalizado.' });
  
  // Borrar
  draft.estado = 'Abandonada';
  save(db);
  res.json({ status: 'ok' });
});


// ---- estudiantes (hijos/as del tutor) ----
router.get('/students', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  let list = db.students;
  if (u.role === 'Tutor') list = list.filter((s) => s.tutorId === u.id);
  else if (!STAFF_ROLES.includes(u.role)) list = [];
  res.json({ students: list });
});

router.post('/students', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo un tutor puede registrar estudiantes.' });
  const { nombre, fechaNacimiento, documento } = req.body || {};
  const errors = [];
  if (!nombre || nombre.trim().length < 3) errors.push('El nombre del estudiante es obligatorio.');
  if (!fechaNacimiento || isNaN(new Date(fechaNacimiento).getTime())) errors.push('La fecha de nacimiento no es válida.');
  if (errors.length) return res.status(400).json({ errors });

  const student = {
    id: nextId(db.students, 's'),
    tutorId: u.id,
    nombre: nombre.trim(),
    fechaNacimiento,
    documento: (documento || '').trim(),
    createdAt: new Date().toISOString(),
  };
  db.students.push(student);
  save(db);
  res.json({ student });
});

// ---- inscripciones ----
router.get('/enrollments', (req, res) => {
  const db = req.db;

  const u = req.currentUser;
  const { estado, institucionId } = req.query;
  let list = db.enrollments.slice();

  if (u.role === 'Tutor') list = list.filter((e) => e.tutorId === u.id);
  else if (u.role === 'Personal de institución') list = list.filter((e) => e.institucionId === u.institucionId);
  else if (!STAFF_ROLES.includes(u.role)) list = [];

  if (estado && estado !== 'Todos') list = list.filter((e) => e.estado === estado);
  if (institucionId && institucionId !== 'Todas' && STAFF_ROLES.includes(u.role)) {
    list = list.filter((e) => e.institucionId === institucionId);
  }

  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ total: list.length, enrollments: list.map((e) => publicEnrollment(e, db)) });
});

router.post('/enrollments', (req, res) => {
  const db = req.db;

  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo un tutor puede crear una solicitud de inscripción.' });

  const { studentId, institucionId, gradoSolicitado, cicloEscolar, draftId } = req.body || {};
  const errors = [];
  let student = db.students.find((s) => s.id === studentId && s.tutorId === u.id);
  sweepExpiredDrafts(db);
  const draft = draftId && (db.drafts || []).find(d => d.id === draftId);
  if (draftId && (!draft || draft.tutorId !== u.id)) return res.status(403).json({ error: 'Borrador no autorizado.' });
  if (draft && draft.enrollmentId) return res.json({ enrollment: publicEnrollment(db.enrollments.find(e => e.id === draft.enrollmentId), db) });
  if (draft && draft.estado) return res.status(410).json({ error: 'Borrador expirado o finalizado.' });
  if (studentId === 'new' && draft) {
    const n = req.body.newStudent || {};
    if (typeof n.nombre === 'string' && n.nombre.trim().length >= 3 && n.fechaNacimiento && !isNaN(new Date(n.fechaNacimiento).getTime())) {
      student = { id: nextId(db.students, 's'), tutorId: u.id, nombre: n.nombre.trim(), fechaNacimiento: n.fechaNacimiento, documento: '', createdAt: new Date().toISOString() };
    }
  }
  if (draft && ['institucionId', 'gradoSolicitado', 'cicloEscolar'].some(k => draft.data[k] !== req.body[k])) errors.push('La solicitud no coincide con el borrador guardado.');
  if (!student) errors.push('Selecciona un estudiante válido.');
  const institucion = db.institutions.find((i) => i.id === institucionId);
  if (!institucion) errors.push('Selecciona una institución válida.');
  else if ((institucion.estado || 'Activo') !== 'Activo') errors.push('Esa institución no está activa actualmente.');
  if (!GRADOS.includes(gradoSolicitado)) errors.push('Selecciona un grado válido.');
  if (!cicloEscolar || !CICLO_RE.test(cicloEscolar)) errors.push('Selecciona un ciclo escolar válido.');
  if (student && institucion && db.enrollments.some((e) =>
    e.studentId === student.id && e.institucionId === institucion.id && e.cicloEscolar === cicloEscolar &&
    !['Rechazada', 'Abandonada'].includes(e.estado)
  )) {
    errors.push('Ya existe una solicitud activa para este estudiante en esa institución y ciclo.');
  }
  if (institucion && cicloEscolar) {
    const period = findPeriod(db, institucion.id, cicloEscolar);
    if (period && !withinRange(period.inscripcion)) {
      errors.push(`El periodo de inscripción del ciclo ${cicloEscolar} para esta institución no está abierto actualmente.`);
    }
  }
  if (draft && institucion) {
    const p = findPeriod(db, institucionId, cicloEscolar);
    const required = require('../lib/requirements').requirements(p && p.documentosRequeridos, gradoSolicitado);
    if (required.some(r => !db.documents.some(d => d.draftId === draft.id && d.tutorId === u.id && d.tipoDocumento === r.tipo && d.estado !== 'Rechazado' && d.size <= r.maxSizeMB * 1024 * 1024 && r.formatos.some(f => ({PDF:'application/pdf', JPG:'image/jpeg', JPEG:'image/jpeg', PNG:'image/png'})[f] === d.mimeType)))) errors.push('Carga todos los documentos requeridos antes de enviar.');
  }
  if (errors.length) return res.status(400).json({ errors });

  const period = findPeriod(db, institucionId, cicloEscolar);
  const enrollment = {
    id: nextId(db.enrollments, 'e'),
    studentId: student.id,
    tutorId: u.id,
    institucionId: institucion.id,
    gradoSolicitado,
    cicloEscolar,
    estado: 'Enviada',
    contactoTutor: { nombre: String(req.body.tutorName || u.nombre || '').trim(), telefono: String(req.body.tutorPhone || u.telefonomovil || '').trim() },
    motivoRechazo: '',
    requisitosSnapshot: require('../lib/requirements').requirements(period && period.documentosRequeridos, gradoSolicitado),
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  if (studentId === 'new') db.students.push(student);
  db.enrollments.push(enrollment);
  if (draft) { draft.estado = 'Enviada'; draft.enrollmentId = enrollment.id; }
  
  if (draftId && db.documents) {
    db.documents.forEach(d => {
      if (d.draftId === draftId && d.tutorId === u.id) {
        d.enrollmentId = enrollment.id;
        d.institucionId = enrollment.institucionId;
        delete d.draftId;
      }
    });
  }
  logEvent(db, { actor: u, accion: 'Inscripción creada', entidad: 'Inscripción', entidadId: enrollment.id, detalle: `${institucion.nombre} · ${gradoSolicitado}` });
  save(db);
  res.json({ enrollment: publicEnrollment(enrollment, db) });
});

router.post('/enrollments/:id/decidir', (req, res) => {
  const db = req.db;

  const u = req.currentUser;
  const enrollment = db.enrollments.find((e) => e.id === req.params.id);
  if (!enrollment) return res.status(404).json({ error: 'Solicitud no encontrada.' });

  const canDecide = STAFF_ROLES.includes(u.role) || (u.role === 'Personal de institución' && u.institucionId === enrollment.institucionId);
  if (!canDecide) return res.status(403).json({ error: 'No tienes permiso para decidir esta solicitud.' });
  if (!['Pendiente', 'Enviada', 'En revisión'].includes(enrollment.estado)) return res.status(400).json({ error: 'Esta solicitud ya fue decidida.' });

  const { estado, motivo } = req.body || {};
  if (!['Aprobada', 'Rechazada'].includes(estado)) return res.status(400).json({ error: 'Decisión inválida.' });
  if (estado === 'Rechazada' && (!motivo || !motivo.trim())) return res.status(400).json({ error: 'Indica el motivo del rechazo.' });

  enrollment.estado = estado;
  enrollment.motivoRechazo = estado === 'Rechazada' ? motivo.trim() : '';
  enrollment.decidedAt = new Date().toISOString();
  enrollment.decidedBy = u.id;
  logEvent(db, { actor: u, accion: estado === 'Aprobada' ? 'Inscripción aprobada' : 'Inscripción rechazada', entidad: 'Inscripción', entidadId: enrollment.id, detalle: estado === 'Rechazada' ? enrollment.motivoRechazo : '' });

  const tutor = db.users.find((t) => t.id === enrollment.tutorId);
  if (tutor) {
    const student = db.students.find((s) => s.id === enrollment.studentId);
    notifyUser(db, {
      recipient: tutor,
      campo: 'Estado de inscripción',
      anterior: 'Pendiente',
      nuevo: estado,
      actor: u,
      userNombre: student ? student.nombre : tutor.nombre,
    });
  }

  save(db);
  res.json({ enrollment: publicEnrollment(enrollment, db) });
});


router.post('/enrollments/:id/correcciones', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const enrollment = db.enrollments.find((e) => e.id === req.params.id);
  if (!enrollment) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (enrollment.tutorId !== u.id) return res.status(403).json({ error: 'No tienes permiso.' });
  if (enrollment.estado !== 'Documentos pendientes') return res.status(400).json({ error: 'La solicitud no está en estado de corrección.' });
  
  const required = require('../lib/requirements').requirements(enrollment.requisitosSnapshot, enrollment.gradoSolicitado);
  const docs = db.documents.filter(d => d.enrollmentId === enrollment.id).sort((a,b) => new Date(b.uploadedAt)-new Date(a.uploadedAt));
  if (required.some(r => { const d = docs.find(d => d.tipoDocumento === r.tipo); return !d || d.estado === 'Rechazado'; })) return res.status(400).json({ error: 'Carga las correcciones de todos los documentos requeridos.' });
  enrollment.estado = 'En revisión';
  logEvent(db, { actor: u, accion: 'Correcciones enviadas', entidad: 'Inscripción', entidadId: enrollment.id, detalle: 'Documentos actualizados' });
  save(db);
  res.json({ enrollment: publicEnrollment(enrollment, db) });
});

router.post('/enrollments/:id/cancelar', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const enrollment = db.enrollments.find((e) => e.id === req.params.id);
  if (!enrollment) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (enrollment.tutorId !== u.id) return res.status(403).json({ error: 'No tienes permiso para cancelar esta solicitud.' });
  if (!['Pendiente', 'Enviada', 'En revisión'].includes(enrollment.estado)) return res.status(400).json({ error: 'Solo se puede cancelar una solicitud pendiente.' });

  logEvent(db, { actor: u, accion: 'Inscripción cancelada', entidad: 'Inscripción', entidadId: enrollment.id, detalle: `Ciclo ${enrollment.cicloEscolar}` });
  db.enrollments = db.enrollments.filter((e) => e.id !== enrollment.id);
  save(db);
  res.json({ status: 'ok' });
});

module.exports = router;
