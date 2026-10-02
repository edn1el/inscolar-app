const express = require('express');
const { save, nextId } = require('../lib/db');
const { requireAuth } = require('../lib/middleware');
const { logEvent } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

const STAFF_ROLES = ['Administrador', 'Soporte'];
const CICLO_RE = /^\d{4}-\d{4}$/;
const DOC_TYPES = ['Acta de nacimiento', 'Cédula o identificación del tutor', 'Certificado de notas', 'Foto 2x2', 'Otro'];
const SUBPERIODOS = ['inscripcion', 'documentos', 'citas'];
const NOMBRE_SUBPERIODO = {
  inscripcion: 'Periodo de inscripción',
  documentos: 'Periodo de envío de documentos',
  citas: 'Periodo para agendar citas',
};

function canManage(u, institucionId) {
  return STAFF_ROLES.includes(u.role) || (u.role === 'Personal de institución' && u.institucionId === institucionId);
}

function parseRange(body, incluirLimite) {
  const { desde, hasta, limiteCitas } = body || {};
  if (!desde && !hasta) return { range: null, errors: [] };
  const errors = [];
  const from = new Date(desde);
  const to = new Date(hasta);
  if (!desde || isNaN(from.getTime())) errors.push('La fecha "desde" no es válida.');
  if (!hasta || isNaN(to.getTime())) errors.push('La fecha "hasta" no es válida.');
  if (!errors.length && from > to) errors.push('La fecha "desde" debe ser anterior o igual a la fecha "hasta".');
  let limite = null;
  if (incluirLimite && limiteCitas !== undefined && limiteCitas !== null && limiteCitas !== '') {
    const n = Number(limiteCitas);
    if (!Number.isInteger(n) || n < 1) errors.push('El límite de citas debe ser un número entero mayor a 0.');
    else limite = n;
  }
  if (errors.length) return { range: null, errors };
  const range = { desde: from.toISOString(), hasta: to.toISOString() };
  if (incluirLimite) range.limiteCitas = limite;
  return { range, errors: [] };
}

// ---- listar los ciclos configurados de una institucion ----
router.get('/institutions/:id/periods', (req, res) => {
  const db = req.db;
  const { cicloEscolar } = req.query;
  let list = db.periods.filter((p) => p.institucionId === req.params.id);
  if (cicloEscolar) list = list.filter((p) => p.cicloEscolar === cicloEscolar);
  
  // Clonar profundamente para no mutar la DB y añadir la ocupación
  list = JSON.parse(JSON.stringify(list));
  
  for (const period of list) {
    if (period.citas && period.citas.limiteCitas) {
      const occupied = db.appointments.filter(a => 
        a.institucionId === req.params.id && 
        (a.estado === 'Pendiente' || a.estado === 'Aceptada' || a.estado === 'Confirmada') &&
        new Date(a.createdAt) >= new Date(period.citas.desde) && 
        new Date(a.createdAt) <= new Date(new Date(period.citas.hasta).setHours(23, 59, 59, 999))
      ).length;
      period.citas.ocupados = occupied;
    }
  }
  
  list.sort((a, b) => b.cicloEscolar.localeCompare(a.cicloEscolar));
  res.json({ periods: list, tiposDocumentoDisponibles: DOC_TYPES });
});

// ---- crear una configuracion vacia para un ciclo ----
router.post('/institutions/:id/periods', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });
  if (!canManage(u, institucion.id)) return res.status(403).json({ error: 'No tienes permiso para configurar periodos de esta institución.' });

  const { cicloEscolar } = req.body || {};
  const errors = [];
  if (!cicloEscolar || !CICLO_RE.test(cicloEscolar)) errors.push('Selecciona un ciclo escolar válido (formato 0000-0000).');
  if (cicloEscolar && db.periods.some((p) => p.institucionId === institucion.id && p.cicloEscolar === cicloEscolar)) {
    errors.push('Ya existe una configuración de periodos para ese ciclo. Modifícala en vez de crear otra.');
  }
  if (errors.length) return res.status(400).json({ errors });

  const period = {
    id: nextId(db.periods, 'per'),
    institucionId: institucion.id,
    cicloEscolar,
    inscripcion: null,
    documentos: null,
    citas: null,
    documentosRequeridos: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.periods.push(period);
  logEvent(db, { actor: u, accion: 'Periodo de ciclo creado', entidad: 'Periodo', entidadId: period.id, detalle: `${institucion.nombre} · ciclo ${cicloEscolar}` });
  save(db);
  res.json({ period });
});

// ---- modificar una configuracion (rangos + limite + documentos requeridos) ----
router.put('/institutions/:id/periods/:periodId', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });
  if (!canManage(u, institucion.id)) return res.status(403).json({ error: 'No tienes permiso para configurar periodos de esta institución.' });
  const period = db.periods.find((p) => p.id === req.params.periodId && p.institucionId === institucion.id);
  if (!period) return res.status(404).json({ error: 'Configuración de periodo no encontrada.' });

  const body = req.body || {};
  const errors = [];

  const inscripcionR = parseRange(body.inscripcion, false);
  errors.push(...inscripcionR.errors.map((e) => `Periodo de inscripción: ${e}`));
  const documentosR = parseRange(body.documentos, false);
  errors.push(...documentosR.errors.map((e) => `Periodo de documentos: ${e}`));
  const citasR = parseRange(body.citas, true);
  errors.push(...citasR.errors.map((e) => `Periodo de citas: ${e}`));

  let documentosRequeridos;
  if (body.documentosRequeridos !== undefined) {
    documentosRequeridos = Array.isArray(body.documentosRequeridos) ? body.documentosRequeridos : [];
    const invalid = documentosRequeridos.filter((d) => !DOC_TYPES.includes(d));
    if (invalid.length) errors.push(`Tipo(s) de documento no reconocido(s): ${invalid.join(', ')}.`);
  }

  if (citasR.range && citasR.range.limiteCitas !== undefined && citasR.range.limiteCitas !== null) {
    const newLimit = citasR.range.limiteCitas;
    const occupiedCount = db.appointments.filter(a =>
      a.institucionId === institucion.id &&
      (a.estado === 'Pendiente' || a.estado === 'Aceptada' || a.estado === 'Confirmada') &&
      new Date(a.createdAt) >= new Date(citasR.range.desde) &&
      new Date(a.createdAt) <= new Date(new Date(citasR.range.hasta).setHours(23, 59, 59, 999))
    ).length;
    
    if (newLimit < occupiedCount) {
      errors.push(`Periodo de citas: No se puede reducir el límite a ${newLimit} porque ya hay ${occupiedCount} cita(s) ocupada(s) en este periodo.`);
    }
  }

  if (errors.length) return res.status(400).json({ errors });

  if (body.inscripcion !== undefined) period.inscripcion = inscripcionR.range;
  if (body.documentos !== undefined) period.documentos = documentosR.range;
  if (body.citas !== undefined) period.citas = citasR.range;
  if (documentosRequeridos !== undefined) period.documentosRequeridos = documentosRequeridos;
  period.updatedAt = new Date().toISOString();

  logEvent(db, { actor: u, accion: 'Periodo de ciclo modificado', entidad: 'Periodo', entidadId: period.id, detalle: `${institucion.nombre} · ciclo ${period.cicloEscolar}` });
  save(db);
  res.json({ period });
});

// ---- eliminar un sub-periodo especifico (HU040/041/042) ----
router.delete('/institutions/:id/periods/:periodId/:tipo', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });
  if (!canManage(u, institucion.id)) return res.status(403).json({ error: 'No tienes permiso para configurar periodos de esta institución.' });
  const period = db.periods.find((p) => p.id === req.params.periodId && p.institucionId === institucion.id);
  if (!period) return res.status(404).json({ error: 'Configuración de periodo no encontrada.' });
  const { tipo } = req.params;
  if (!SUBPERIODOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de periodo inválido.' });

  // Validaciones antes de eliminar
  if (tipo === 'inscripcion') {
    const hasEnrollments = db.enrollments.some(e => e.institucionId === institucion.id && e.cicloEscolar === period.cicloEscolar);
    if (hasEnrollments) return res.status(400).json({ error: 'No se puede eliminar el período porque ya tiene solicitudes de inscripción asociadas.' });
  } else if (tipo === 'documentos') {
    // Buscar si hay documentos subidos para inscripciones de este ciclo
    const cycleEnrollmentIds = db.enrollments.filter(e => e.institucionId === institucion.id && e.cicloEscolar === period.cicloEscolar).map(e => e.id);
    const hasDocuments = db.documents.some(d => cycleEnrollmentIds.includes(d.enrollmentId));
    if (hasDocuments) return res.status(400).json({ error: 'No se puede eliminar el período porque ya existen documentos enviados.' });
  } else if (tipo === 'citas') {
    const pCitas = period.citas;
    if (pCitas) {
      const hasAppointments = db.appointments.some(a => a.institucionId === institucion.id && a.fechaHoraSolicitada >= pCitas.desde && a.fechaHoraSolicitada <= pCitas.hasta);
      if (hasAppointments) return res.status(400).json({ error: 'No se puede eliminar el período porque ya existen citas agendadas.' });
    }
  }

  period[tipo] = null;
  period.updatedAt = new Date().toISOString();
  logEvent(db, { actor: u, accion: `${NOMBRE_SUBPERIODO[tipo]} eliminado`, entidad: 'Periodo', entidadId: period.id, detalle: `${institucion.nombre} · ciclo ${period.cicloEscolar}` });
  save(db);
  res.json({ period });
});

// ---- eliminar toda la configuracion de un ciclo ----
router.delete('/institutions/:id/periods/:periodId', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });
  if (!canManage(u, institucion.id)) return res.status(403).json({ error: 'No tienes permiso para configurar periodos de esta institución.' });
  const period = db.periods.find((p) => p.id === req.params.periodId && p.institucionId === institucion.id);
  if (!period) return res.status(404).json({ error: 'Configuración de periodo no encontrada.' });

  db.periods = db.periods.filter((p) => p.id !== period.id);
  logEvent(db, { actor: u, accion: 'Configuración de periodo eliminada', entidad: 'Periodo', entidadId: period.id, detalle: `${institucion.nombre} · ciclo ${period.cicloEscolar}` });
  save(db);
  res.json({ status: 'ok' });
});

module.exports = router;
