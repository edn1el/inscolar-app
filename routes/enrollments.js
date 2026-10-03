const express = require('express');
const { load, save, nextId } = require('../lib/db');
const { requireAuth } = require('../lib/middleware');
const { notifyUser } = require('../lib/notify');
const { logEvent } = require('../lib/audit');
const { findPeriod, withinRange } = require('../lib/periods');
const { upload, borrarArchivos, mensajeError } = require('../lib/document-upload');

const router = express.Router();
router.use(requireAuth);

const GRADOS = [
  'Pre-Primario', '1ro de Primaria', '2do de Primaria', '3ro de Primaria', '4to de Primaria',
  '5to de Primaria', '6to de Primaria', '1ro de Secundaria', '2do de Secundaria',
  '3ro de Secundaria', '4to de Secundaria', '5to de Secundaria', '6to de Secundaria',
];
const CICLO_RE = /^\d{4}-\d{4}$/;
const STAFF_ROLES = ['Administrador', 'Soporte'];
const DIAS_INACTIVIDAD_ABANDONO = 30;

// HU058: si una solicitud de inscripcion lleva mas de DIAS_INACTIVIDAD_ABANDONO dias
// en estado Pendiente sin que la institucion la decida, se marca automaticamente como
// Abandonada. Este prototipo no tiene un proceso en segundo plano, asi que el barrido
// se hace de forma perezosa cada vez que alguien lista las inscripciones.
function sweepAbandonedEnrollments(db) {
  const now = Date.now();
  const limiteMs = DIAS_INACTIVIDAD_ABANDONO * 24 * 60 * 60 * 1000;
  let changed = false;
  for (const e of db.enrollments) {
    if (e.estado === 'Pendiente' && now - new Date(e.createdAt).getTime() > limiteMs) {
      e.estado = 'Abandonada';
      e.decidedAt = new Date().toISOString();
      e.decidedBy = null;
      logEvent(db, { actor: null, accion: 'Inscripción abandonada por inactividad', entidad: 'Inscripción', entidadId: e.id, detalle: `Ciclo ${e.cicloEscolar} · ${DIAS_INACTIVIDAD_ABANDONO} días sin respuesta`, antes: { estado: 'Pendiente' }, despues: { estado: 'Abandonada' } });
      const tutor = db.users.find((t) => t.id === e.tutorId);
      if (tutor) {
        const student = db.students.find((s) => s.id === e.studentId);
        notifyUser(db, {
          recipient: tutor,
          campo: 'Estado de inscripción',
          anterior: 'Pendiente',
          nuevo: 'Abandonada',
          actor: { id: null, nombre: 'Sistema' },
          userNombre: student ? student.nombre : tutor.nombre,
        });
      }
      changed = true;
    }
  }
  if (changed) save(db);
}

function publicEnrollment(e, db) {
  const student = db.students.find((s) => s.id === e.studentId);
  const institucion = db.institutions.find((i) => i.id === e.institucionId);
  const tutor = db.users.find((u) => u.id === e.tutorId);
  return {
    ...e,
    estudianteNombre: student ? student.nombre : '—',
    institucionNombre: institucion ? institucion.nombre : '—',
    tutorNombre: tutor ? tutor.nombre : '—',
    documentos: resumenDocumentos(e, db),
  };
}

// Estado de los documentos requeridos de una solicitud: cuántos exige la institución,
// cuántos están entregados (pendientes o aceptados) y cuántos aceptados.
function resumenDocumentos(e, db) {
  const period = findPeriod(db, e.institucionId, e.cicloEscolar);
  const requeridos = period && Array.isArray(period.documentosRequeridos) ? period.documentosRequeridos : [];
  const docs = (db.documents || []).filter((d) => d.enrollmentId === e.id);
  const ultimo = (t) => docs.filter((d) => d.tipoDocumento === t).slice(-1)[0];
  const estados = requeridos.map((t) => ({ tipo: t, estado: ultimo(t) ? ultimo(t).estado : 'Falta' }));
  return {
    requeridos: requeridos.length,
    entregados: estados.filter((x) => x.estado === 'Pendiente' || x.estado === 'Aceptado').length,
    aceptados: estados.filter((x) => x.estado === 'Aceptado').length,
    total: docs.length,
  };
}

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
  sweepAbandonedEnrollments(db);
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

// HU046: la solicitud se envía junto con los documentos que la institución exige
// para ese ciclo (HU044). Cada archivo llega como documento_<n> con su tipo en tipo_<n>.
router.post('/enrollments', (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) { borrarArchivos(req.files); return res.status(400).json({ errors: [mensajeError(err)] }); }
    next();
  });
}, (req, res) => {
  const db = req.db;
  sweepAbandonedEnrollments(db);
  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo un tutor puede crear una solicitud de inscripción.' });

  const { studentId, institucionId, gradoSolicitado, cicloEscolar } = req.body || {};
  const errors = [];
  const student = db.students.find((s) => s.id === studentId && s.tutorId === u.id);
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
  let requeridos = [];
  if (institucion && cicloEscolar) {
    const period = findPeriod(db, institucion.id, cicloEscolar);
    if (period && !withinRange(period.inscripcion)) {
      errors.push(`El periodo de inscripción del ciclo ${cicloEscolar} para esta institución no está abierto actualmente.`);
    }
    requeridos = period && Array.isArray(period.documentosRequeridos) ? period.documentosRequeridos : [];
    if (requeridos.length && period.documentos && !withinRange(period.documentos)) {
      errors.push(`El periodo para el envío de documentos del ciclo ${cicloEscolar} no está abierto, así que no se pueden entregar los documentos requeridos.`);
    }
  }
  // Documentos adjuntos: documento_<n> + tipo_<n>. Un archivo con formato no permitido
  // no llega (lo descarta el filtro), así que ese requisito cuenta como faltante.
  const body = req.body || {};
  const entregados = (req.files || [])
    .map((f) => { const m = /^documento_(\d+)$/.exec(f.fieldname); return m ? { file: f, tipo: String(body['tipo_' + m[1]] || '').trim().slice(0, 80) } : null; })
    .filter((d) => d && d.tipo);
  const faltan = requeridos.filter((t) => !entregados.some((d) => d.tipo === t));
  if (faltan.length) errors.push(`Faltan documentos requeridos: ${faltan.join(', ')}. Adjunta cada uno en PDF, JPG o PNG (máx. 5 MB).`);
  if (errors.length) { borrarArchivos(req.files); return res.status(400).json({ errors }); }

  const enrollment = {
    id: nextId(db.enrollments, 'e'),
    studentId: student.id,
    tutorId: u.id,
    institucionId: institucion.id,
    gradoSolicitado,
    cicloEscolar,
    estado: 'Pendiente',
    motivoRechazo: '',
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  db.enrollments.push(enrollment);
  logEvent(db, { actor: u, accion: 'Inscripción creada', entidad: 'Inscripción', entidadId: enrollment.id, detalle: `${institucion.nombre} · ${gradoSolicitado}`, datos: { institucionId: institucion.id, institucion: institucion.nombre, estudiante: student.nombre, gradoSolicitado, cicloEscolar: enrollment.cicloEscolar, estado: enrollment.estado, documentosAdjuntos: entregados.map((d) => d.tipo) } });
  for (const { file, tipo } of entregados) {
    const document = {
      id: nextId(db.documents, 'd'),
      enrollmentId: enrollment.id,
      institucionId: enrollment.institucionId,
      tutorId: enrollment.tutorId,
      tipoDocumento: tipo,
      nombreArchivo: file.originalname,
      storageFile: file.filename,
      mimeType: file.mimetype,
      size: file.size,
      estado: 'Pendiente',
      motivoRechazo: '',
      uploadedAt: new Date().toISOString(),
      decidedAt: null,
      decidedBy: null,
    };
    db.documents.push(document);
    logEvent(db, { actor: u, accion: 'Documento subido', entidad: 'Documento', entidadId: document.id, detalle: `${tipo} — ${file.originalname}`, datos: { inscripcionId: enrollment.id, tipoDocumento: tipo, archivo: file.originalname, tamanoBytes: file.size, formato: file.mimetype, alIniciarLaSolicitud: true } });
  }
  save(db);
  res.json({ enrollment: publicEnrollment(enrollment, db) });
});

router.post('/enrollments/:id/decidir', (req, res) => {
  const db = req.db;
  sweepAbandonedEnrollments(db);
  const u = req.currentUser;
  const enrollment = db.enrollments.find((e) => e.id === req.params.id);
  if (!enrollment) return res.status(404).json({ error: 'Solicitud no encontrada.' });

  const canDecide = STAFF_ROLES.includes(u.role) || (u.role === 'Personal de institución' && u.institucionId === enrollment.institucionId);
  if (!canDecide) return res.status(403).json({ error: 'No tienes permiso para decidir esta solicitud.' });
  if (enrollment.estado !== 'Pendiente') return res.status(400).json({ error: 'Esta solicitud ya fue decidida.' });

  const { estado, motivo } = req.body || {};
  if (!['Aprobada', 'Rechazada'].includes(estado)) return res.status(400).json({ error: 'Decisión inválida.' });
  if (estado === 'Rechazada' && (!motivo || !motivo.trim())) return res.status(400).json({ error: 'Indica el motivo del rechazo.' });

  enrollment.estado = estado;
  enrollment.motivoRechazo = estado === 'Rechazada' ? motivo.trim() : '';
  enrollment.decidedAt = new Date().toISOString();
  enrollment.decidedBy = u.id;
  logEvent(db, { actor: u, accion: estado === 'Aprobada' ? 'Inscripción aprobada' : 'Inscripción rechazada', entidad: 'Inscripción', entidadId: enrollment.id, detalle: estado === 'Rechazada' ? enrollment.motivoRechazo : '', antes: { estado: 'Pendiente' }, despues: { estado }, datos: estado === 'Rechazada' ? { motivo: enrollment.motivoRechazo } : undefined });

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

router.post('/enrollments/:id/cancelar', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const enrollment = db.enrollments.find((e) => e.id === req.params.id);
  if (!enrollment) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (enrollment.tutorId !== u.id) return res.status(403).json({ error: 'No tienes permiso para cancelar esta solicitud.' });
  if (enrollment.estado !== 'Pendiente') return res.status(400).json({ error: 'Solo se puede cancelar una solicitud pendiente.' });

  logEvent(db, { actor: u, accion: 'Inscripción cancelada', entidad: 'Inscripción', entidadId: enrollment.id, detalle: `Ciclo ${enrollment.cicloEscolar}`, antes: { estado: 'Pendiente' }, despues: { estado: 'Cancelada por el tutor' }, datos: { institucionId: enrollment.institucionId, estudiante: enrollment.estudianteNombre } });
  db.enrollments = db.enrollments.filter((e) => e.id !== enrollment.id);
  save(db);
  res.json({ status: 'ok' });
});

module.exports = router;
