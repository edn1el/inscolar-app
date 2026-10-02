const express = require('express');
const { save, nextId } = require('../lib/db');
const { requireAuth } = require('../lib/middleware');
const { logEvent } = require('../lib/audit');
const { citasOcupadas } = require('../lib/periods');

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

  // No se puede bajar el límite por debajo de las citas que ya ocupan cupo.
  if (citasR.range && citasR.range.limiteCitas) {
    const ocupadas = citasOcupadas(db, institucion.id, citasR.range);
    if (citasR.range.limiteCitas < ocupadas) {
      errors.push(`Periodo de citas: no se puede bajar el límite a ${citasR.range.limiteCitas} porque ya hay ${ocupadas} cita(s) ocupando cupo en ese periodo.`);
    }
  }

  if (errors.length) return res.status(400).json({ errors });

  const antes = JSON.parse(JSON.stringify({ inscripcion: period.inscripcion || null, documentos: period.documentos || null, citas: period.citas || null, documentosRequeridos: period.documentosRequeridos || [] }));
  if (body.inscripcion !== undefined) period.inscripcion = inscripcionR.range;
  if (body.documentos !== undefined) period.documentos = documentosR.range;
  if (body.citas !== undefined) period.citas = citasR.range;
  if (documentosRequeridos !== undefined) period.documentosRequeridos = documentosRequeridos;
  period.updatedAt = new Date().toISOString();

  // HU123-HU125: cada tipo de cambio queda como su propio evento, con el valor anterior y el nuevo.
  const detalle = `${institucion.nombre} · ciclo ${period.cicloEscolar}`;
  const base = { actor: u, entidad: 'Periodo', entidadId: period.id, detalle, datos: { institucionId: institucion.id, cicloEscolar: period.cicloEscolar } };
  const igual = (a, b) => JSON.stringify(a || null) === JSON.stringify(b || null);
  const rango = (r) => (r ? { desde: r.desde, hasta: r.hasta } : null);
  let registrados = 0;
  if (!igual(rango(antes.inscripcion), rango(period.inscripcion))) { logEvent(db, { ...base, accion: 'Periodo de inscripción modificado', antes: { periodo: rango(antes.inscripcion) }, despues: { periodo: rango(period.inscripcion) } }); registrados++; }
  if (!igual(rango(antes.documentos), rango(period.documentos))) { logEvent(db, { ...base, accion: 'Periodo de envío de documentos modificado', antes: { periodo: rango(antes.documentos) }, despues: { periodo: rango(period.documentos) } }); registrados++; }
  if (!igual(rango(antes.citas), rango(period.citas))) { logEvent(db, { ...base, accion: 'Periodo para agendar citas modificado', antes: { periodo: rango(antes.citas) }, despues: { periodo: rango(period.citas) } }); registrados++; }
  const limite = (c) => (c && c.limiteCitas) || null;
  if (limite(antes.citas) !== limite(period.citas)) { logEvent(db, { ...base, accion: 'Límite de citas modificado', antes: { limiteCitas: limite(antes.citas) }, despues: { limiteCitas: limite(period.citas) } }); registrados++; }
  if (!igual(antes.documentosRequeridos, period.documentosRequeridos || [])) { logEvent(db, { ...base, accion: 'Documentos requeridos modificados', antes: { documentosRequeridos: antes.documentosRequeridos }, despues: { documentosRequeridos: period.documentosRequeridos || [] } }); registrados++; }
  if (!registrados) logEvent(db, { ...base, accion: 'Periodo de ciclo modificado', detalle: detalle + ' · sin cambios' });
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

  // No se elimina un periodo que ya tiene actividad asociada (se perdería el contexto de esas solicitudes).
  const inscripcionesDelCiclo = db.enrollments.filter((e) => e.institucionId === institucion.id && e.cicloEscolar === period.cicloEscolar);
  if (tipo === 'inscripcion' && inscripcionesDelCiclo.length) {
    return res.status(400).json({ error: 'No se puede eliminar el periodo de inscripción porque ya tiene solicitudes asociadas.' });
  }
  if (tipo === 'documentos') {
    const ids = new Set(inscripcionesDelCiclo.map((e) => e.id));
    if ((db.documents || []).some((d) => ids.has(d.enrollmentId))) {
      return res.status(400).json({ error: 'No se puede eliminar el periodo de documentos porque ya se enviaron documentos en este ciclo.' });
    }
  }
  if (tipo === 'citas' && period.citas && citasOcupadas(db, institucion.id, period.citas) > 0) {
    return res.status(400).json({ error: 'No se puede eliminar el periodo de citas porque ya hay citas agendadas en él.' });
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

  const tieneSolicitudes = db.enrollments.some((e) => e.institucionId === institucion.id && e.cicloEscolar === period.cicloEscolar);
  const tieneCitas = period.citas && citasOcupadas(db, institucion.id, period.citas) > 0;
  if (tieneSolicitudes || tieneCitas) {
    return res.status(400).json({ error: `No se puede eliminar el ciclo ${period.cicloEscolar} porque ya tiene ${tieneSolicitudes ? 'solicitudes de inscripción' : 'citas agendadas'} asociadas.` });
  }

  db.periods = db.periods.filter((p) => p.id !== period.id);
  logEvent(db, { actor: u, accion: 'Configuración de periodo eliminada', entidad: 'Periodo', entidadId: period.id, detalle: `${institucion.nombre} · ciclo ${period.cicloEscolar}` });
  save(db);
  res.json({ status: 'ok' });
});

module.exports = router;
