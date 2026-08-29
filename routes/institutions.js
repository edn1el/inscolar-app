const express = require('express');
const { load, save, nextId } = require('../lib/db');
const { requireAuth, requireAdmin } = require('../lib/middleware');
const { isPhoneDigits, formatPhoneDO } = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

const DISTRITO_RE = /^\d{2}-\d{2}$/;

function normalizeTipo(v) {
  return v === 'Privado' ? 'Privado' : 'Público';
}

// ---- listado (cualquier usuario autenticado la puede consultar, p.ej. para formularios) ----
function withRating(inst, db) {
  const ratings = db.ratings.filter((r) => r.institucionId === inst.id);
  const promedio = ratings.length ? ratings.reduce((s, r) => s + r.estrellas, 0) / ratings.length : null;
  return { ...inst, calificacionPromedio: promedio, totalCalificaciones: ratings.length };
}

router.get('/', (req, res) => {
  const db = req.db;
  const { q, provincia, estado, calificacionMin, municipio } = req.query;
  const municipios = Array.from(new Set(db.institutions.map((i) => i.municipio).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
  let list = db.institutions.slice();
  if (q) {
    const qq = q.toLowerCase();
    list = list.filter((i) => i.nombre.toLowerCase().includes(qq) || (i.distrito || '').toLowerCase().includes(qq));
  }
  if (provincia && provincia !== 'Todas') list = list.filter((i) => i.provincia === provincia);
  if (estado && estado !== 'Todos') list = list.filter((i) => (i.estado || 'Activo') === estado);
  if (municipio && municipio !== 'Todos') list = list.filter((i) => i.municipio === municipio);
  list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  let withRatings = list.map((i) => withRating(i, db));
  if (calificacionMin && calificacionMin !== 'Cualquiera') {
    const min = Number(calificacionMin);
    withRatings = withRatings.filter((i) => i.calificacionPromedio !== null && i.calificacionPromedio >= min);
  }
  res.json({ total: db.institutions.length, institutions: withRatings, municipios });
});

// ---- administración de instituciones (solo Administrador/Soporte) ----
router.post('/', requireAdmin, (req, res) => {
  const db = req.db;
  const { nombre, provincia, distrito, tipo, direccion, telefono, municipio } = req.body || {};
  const errors = [];
  if (!nombre || nombre.trim().length < 3) errors.push('El nombre de la institución es obligatorio.');
  if (!provincia) errors.push('Selecciona la provincia.');
  if (!distrito || !DISTRITO_RE.test(distrito)) errors.push('El distrito educativo debe tener el formato 00-00.');
  if (telefono && !isPhoneDigits(telefono, 10)) errors.push('El teléfono debe contener exactamente 10 dígitos.');
  if (nombre && db.institutions.some((i) => i.nombre.trim().toLowerCase() === String(nombre).trim().toLowerCase())) {
    errors.push('Ya existe una institución con ese nombre.');
  }
  if (errors.length) return res.status(400).json({ errors });

  const institution = {
    id: nextId(db.institutions, 'i'),
    nombre: nombre.trim(),
    provincia,
    distrito: distrito.trim(),
    tipo: normalizeTipo(tipo),
    direccion: (direccion || '').trim(),
    telefono: telefono ? formatPhoneDO(telefono) : '',
    municipio: (municipio || '').trim(),
    estado: 'Activo',
    createdAt: new Date().toISOString(),
  };
  db.institutions.push(institution);
  save(db);
  res.json({ institution });
});

router.put('/:id', requireAdmin, (req, res) => {
  const db = req.db;
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution) return res.status(404).json({ error: 'Institución no encontrada.' });

  const { nombre, provincia, distrito, tipo, direccion, telefono, municipio } = req.body || {};
  const errors = [];
  if (nombre !== undefined && nombre.trim().length < 3) errors.push('El nombre de la institución es obligatorio.');
  if (distrito !== undefined && distrito && !DISTRITO_RE.test(distrito)) errors.push('El distrito educativo debe tener el formato 00-00.');
  if (telefono && !isPhoneDigits(telefono, 10)) errors.push('El teléfono debe contener exactamente 10 dígitos.');
  if (nombre && db.institutions.some((i) => i.id !== institution.id && i.nombre.trim().toLowerCase() === String(nombre).trim().toLowerCase())) {
    errors.push('Ya existe otra institución con ese nombre.');
  }
  if (errors.length) return res.status(400).json({ errors });

  if (nombre) institution.nombre = nombre.trim();
  if (provincia) institution.provincia = provincia;
  if (distrito) institution.distrito = distrito.trim();
  if (tipo) institution.tipo = normalizeTipo(tipo);
  if (direccion !== undefined) institution.direccion = direccion.trim();
  if (telefono !== undefined) institution.telefono = telefono ? formatPhoneDO(telefono) : '';
  if (municipio !== undefined) institution.municipio = municipio.trim();
  save(db);
  res.json({ institution });
});

router.post('/:id/toggle-estado', requireAdmin, (req, res) => {
  const db = req.db;
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution) return res.status(404).json({ error: 'Institución no encontrada.' });
  institution.estado = (institution.estado || 'Activo') === 'Activo' ? 'Inactivo' : 'Activo';
  save(db);
  res.json({ institution });
});

module.exports = router;
