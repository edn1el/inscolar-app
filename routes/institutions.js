const express = require('express');
const { load, save, nextId } = require('../lib/db');
const { requireAuth, requireAdmin } = require('../lib/middleware');
const { isPhoneDigits, formatPhoneDO } = require('../lib/validate');
const { logEvent } = require('../lib/audit');
const { haversineKm } = require('../lib/geo');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const router = express.Router();
router.use(requireAuth);

const DISTRITO_RE = /^\d{2}-\d{2}$/;

// ---- foto/portada de una institución (HU: fondo real por institución + overlay) ----
const FOTOS_DIR = path.join(__dirname, '..', 'data', 'uploads', 'instituciones');
if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR, { recursive: true });
const FOTO_MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const FOTO_ALLOWED_MIME = ['image/jpeg', 'image/png'];
const fotoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, FOTOS_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 6).replace(/[^a-zA-Z0-9.]/g, '') || '.jpg';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});
const uploadFoto = multer({
  storage: fotoStorage,
  limits: { fileSize: FOTO_MAX_SIZE },
  fileFilter: (req, file, cb) => cb(null, FOTO_ALLOWED_MIME.includes(file.mimetype)),
});

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
  const { q, provincia, estado, calificacionMin, municipio, lat, lng, radioKm } = req.query;
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

  // HU021: filtrar/ordenar por la ubicación actual del dispositivo (enviada por el navegador).
  const userLat = Number(lat);
  const userLng = Number(lng);
  if (lat !== undefined && lng !== undefined && !isNaN(userLat) && !isNaN(userLng)) {
    withRatings = withRatings.map((i) => ({
      ...i,
      distanciaKm: typeof i.lat === 'number' && typeof i.lng === 'number'
        ? Math.round(haversineKm(userLat, userLng, i.lat, i.lng) * 10) / 10
        : null,
    }));
    const radio = Number(radioKm);
    if (radioKm && !isNaN(radio) && radio > 0) {
      withRatings = withRatings.filter((i) => i.distanciaKm !== null && i.distanciaKm <= radio);
    }
    withRatings.sort((a, b) => {
      if (a.distanciaKm === null) return 1;
      if (b.distanciaKm === null) return -1;
      return a.distanciaKm - b.distanciaKm;
    });
  }

  res.json({ total: db.institutions.length, institutions: withRatings, municipios });
});

// HU026: vista de detalle de una institución (cualquier usuario autenticado la puede consultar).
router.get('/:id', (req, res) => {
  const db = req.db;
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution) return res.status(404).json({ error: 'Institución no encontrada.' });
  res.json({ institution: withRating(institution, db) });
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
  logEvent(db, { actor: req.currentUser, accion: 'Institución creada', entidad: 'Institución', entidadId: institution.id, detalle: institution.nombre });
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
  logEvent(db, { actor: req.currentUser, accion: 'Institución modificada', entidad: 'Institución', entidadId: institution.id, detalle: institution.nombre });
  save(db);
  res.json({ institution });
});

router.post('/:id/toggle-estado', requireAdmin, (req, res) => {
  const db = req.db;
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution) return res.status(404).json({ error: 'Institución no encontrada.' });
  institution.estado = (institution.estado || 'Activo') === 'Activo' ? 'Inactivo' : 'Activo';
  logEvent(db, { actor: req.currentUser, accion: institution.estado === 'Activo' ? 'Institución activada' : 'Institución desactivada', entidad: 'Institución', entidadId: institution.id, detalle: institution.nombre });
  save(db);
  res.json({ institution });
});

// HU061: mostrar el calendario de citas de una institución (cualquier usuario autenticado
// lo puede consultar; el personal de esa institución y Administración ven el detalle
// completo, los demás roles ven solo cuántas citas hay cada día).
const CALENDAR_DETAIL_ROLES = ['Administrador', 'Soporte'];
router.get('/:id/calendar', (req, res) => {
  const db = req.db;
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution) return res.status(404).json({ error: 'Institución no encontrada.' });

  const u = req.currentUser;
  const detalle = CALENDAR_DETAIL_ROLES.includes(u.role) || (u.role === 'Personal de institución' && u.institucionId === institution.id);

  const { mes } = req.query;
  const now = new Date();
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth() + 1; // 1-12
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    const [y, m] = mes.split('-').map(Number);
    if (m >= 1 && m <= 12) { year = y; month = m; }
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1)); // exclusivo

  const dias = {};
  for (const a of db.appointments) {
    if (a.institucionId !== institution.id) continue;
    const when = new Date(a.fechaHoraConfirmada || a.fechaHoraSolicitada);
    if (when < start || when >= end) continue;
    const key = when.toISOString().slice(0, 10);
    if (!dias[key]) dias[key] = [];
    const entry = { id: a.id, hora: when.toISOString(), estado: a.estado };
    if (detalle) {
      const tutorUser = db.users.find((t) => t.id === a.tutorId);
      const student = a.studentId ? db.students.find((s) => s.id === a.studentId) : null;
      entry.motivo = a.motivo;
      entry.tutorNombre = tutorUser ? tutorUser.nombre : '—';
      entry.estudianteNombre = student ? student.nombre : null;
    }
    dias[key].push(entry);
  }
  for (const key of Object.keys(dias)) {
    dias[key].sort((a, b) => new Date(a.hora) - new Date(b.hora));
  }

  res.json({
    institucion: { id: institution.id, nombre: institution.nombre },
    mes: `${year}-${String(month).padStart(2, '0')}`,
    detalle,
    dias,
  });
});


// ---- foto/portada de una institución (solo Administrador/Soporte la pueden cambiar) ----
router.post('/:id/foto', requireAdmin, (req, res, next) => {
  uploadFoto.single('foto')(req, res, (err) => {
    if (err instanceof multer.MulterError || err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen no puede pesar más de 5 MB.' : 'No se pudo subir la imagen. Usa JPG o PNG.';
      return res.status(400).json({ errors: [msg] });
    }
    next();
  });
}, (req, res) => {
  const db = req.db;
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Institución no encontrada.' });
  }
  if (!req.file) return res.status(400).json({ errors: ['Selecciona una imagen JPG o PNG de hasta 5 MB.'] });

  const previous = institution.foto;
  institution.foto = {
    storageFile: req.file.filename,
    mimeType: req.file.mimetype,
    uploadedAt: new Date().toISOString(),
  };
  if (previous && previous.storageFile) {
    fs.unlink(path.join(FOTOS_DIR, previous.storageFile), () => {});
  }
  logEvent(db, { actor: req.currentUser, accion: 'Foto de institución actualizada', entidad: 'Institución', entidadId: institution.id, detalle: institution.nombre });
  save(db);
  res.json({ institution: withRating(institution, db) });
});

router.delete('/:id/foto', requireAdmin, (req, res) => {
  const db = req.db;
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution) return res.status(404).json({ error: 'Institución no encontrada.' });
  if (institution.foto && institution.foto.storageFile) {
    fs.unlink(path.join(FOTOS_DIR, institution.foto.storageFile), () => {});
  }
  institution.foto = null;
  logEvent(db, { actor: req.currentUser, accion: 'Foto de institución eliminada', entidad: 'Institución', entidadId: institution.id, detalle: institution.nombre });
  save(db);
  res.json({ institution: withRating(institution, db) });
});

router.get('/:id/foto', (req, res) => {
  const db = req.db;
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution || !institution.foto || !institution.foto.storageFile) {
    return res.status(404).json({ error: 'Esta institución no tiene una foto registrada.' });
  }
  const filePath = path.join(FOTOS_DIR, institution.foto.storageFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'La imagen ya no está disponible.' });
  res.setHeader('Content-Type', institution.foto.mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
