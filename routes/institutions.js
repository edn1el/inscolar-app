const express = require('express');
const { load, save, nextId } = require('../lib/db');
const { requireAuth, requireAdmin } = require('../lib/middleware');
const { isPhoneDigits, formatPhoneDO } = require('../lib/validate');
const { logEvent, instantanea } = require('../lib/audit');
const CAMPOS_INSTITUCION = ['nombre', 'rnc', 'correo', 'telefono', 'direccion', 'provincia', 'municipio', 'distrito', 'tipo', 'estado', 'lat', 'lng', 'ubicacionExacta', 'logo', 'fondo'];
const { haversineKm, dentroDeRD } = require('../lib/geo');

// Punto marcado a mano en el formulario. Devuelve { lat, lng }, null (sin punto) o un error.
function parseUbicacion(body) {
  if (body.lat === undefined && body.lng === undefined) return undefined; // el formulario no lo envió
  if (body.lat === '' || body.lng === '' || body.lat === null) return null;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!dentroDeRD(lat, lng)) return { error: 'La ubicación marcada debe estar dentro de República Dominicana.' };
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const router = express.Router();

const DISTRITO_RE = /^\d{2}-\d{2}$/;

// ---- foto/portada de una institución (HU: fondo real por institución + overlay) ----
const FOTOS_DIR = path.join(__dirname, '..', 'data', 'uploads', 'instituciones');
if (!fs.existsSync(FOTOS_DIR)) fs.mkdirSync(FOTOS_DIR, { recursive: true });
const FOTO_MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const FOTO_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
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

// ---- listado (público) ----
function withRating(inst, db) {
  const ratings = db.ratings.filter((r) => r.institucionId === inst.id);
  const promedio = ratings.length ? ratings.reduce((s, r) => s + r.estrellas, 0) / ratings.length : null;
  return { ...inst, calificacionPromedio: promedio, totalCalificaciones: ratings.length };
}

router.get('/', (req, res) => {
  const { load } = require('../lib/db');
  const db = load();
  let currentUser = null;
  if (req.session && req.session.userId) {
    currentUser = db.users.find((u) => u.id === req.session.userId && u.estado !== 'Inactivo');
  }

  const { q, provincia, estado, calificacionMin, municipio, lat, lng, radioKm } = req.query;
  
  // Extraer todos los municipios antes de filtrar, para que los selects de UI tengan la lista completa
  // o filtrada si deciden hacerlo dinámico.
  const municipios = Array.from(new Set(db.institutions.map((i) => i.municipio).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'es'));
  
  let list = db.institutions.slice();
  
  // Filtro de estado: si no hay sesión iniciada, o no es admin/soporte, forzar 'Activo'.
  const isAdminOrSupport = currentUser && ['Administrador', 'Soporte'].includes(currentUser.role);
  if (!isAdminOrSupport) {
    list = list.filter((i) => (i.estado || 'Activo') === 'Activo');
  } else if (estado && estado !== 'Todos') {
    list = list.filter((i) => (i.estado || 'Activo') === estado);
  }

  if (q) {
    const qq = q.toLowerCase();
    list = list.filter((i) => i.nombre.toLowerCase().includes(qq) || (i.distrito || '').toLowerCase().includes(qq));
  }
  if (provincia && provincia !== 'Todas') list = list.filter((i) => i.provincia === provincia);
  if (municipio && municipio !== 'Todos') list = list.filter((i) => i.municipio === municipio);
  list.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  let withRatings = list.map((i) => withRating(i, db));
  // HU024: el filtro por calificación no está disponible para el personal de institución.
  const puedeFiltrarPorCalificacion = !(currentUser && currentUser.role === 'Personal de institución');
  if (puedeFiltrarPorCalificacion && calificacionMin && calificacionMin !== 'Cualquiera') {
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

  const page = parseInt(req.query.page);
  const limit = parseInt(req.query.limit);
  let paginatedInstitutions = withRatings;
  if (!isNaN(page) && !isNaN(limit)) {
    const start = (page - 1) * limit;
    paginatedInstitutions = withRatings.slice(start, start + limit);
  }

  res.json({
    total: db.institutions.length,
    totalFiltradas: withRatings.length,
    page: isNaN(page) ? null : page,
    limit: isNaN(limit) ? null : limit,
    institutions: paginatedInstitutions,
    municipios
  });
});

// Centros de municipio, para que el formulario muestre la ubicación aproximada.
router.get('/meta/municipios-coords', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json(require('../lib/municipios-coords'));
});

// HU026: vista de detalle de una institución (público).
router.get('/:id', (req, res) => {
  const { load } = require('../lib/db');
  const db = load();
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution) return res.status(404).json({ error: 'Institución no encontrada.' });
  res.json({ institution: withRating(institution, db) });
});

const uploadInstitucion = multer({
  storage: fotoStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max para fondo, logo se valida manual a 5MB
  fileFilter: (req, file, cb) => cb(null, FOTO_ALLOWED_MIME.includes(file.mimetype)),
}).fields([{ name: 'logo', maxCount: 1 }, { name: 'fondo', maxCount: 1 }]);

// Wrapper middleware to catch multer errors
function handleUploadInstitucion(req, res, next) {
  uploadInstitucion(req, res, (err) => {
    if (err instanceof multer.MulterError || err) {
      return res.status(400).json({ errors: ['Error al subir imágenes. Asegúrate de que sean JPG/PNG/WEBP y no superen el tamaño permitido.'] });
    }
    next();
  });
}

function processUploadedFiles(req, db, errors, previousLogo, previousFondo) {
  let newLogo = null;
  let newFondo = null;
  
  if (req.files) {
    if (req.files.logo && req.files.logo[0]) {
      const file = req.files.logo[0];
      if (file.size > 5 * 1024 * 1024) errors.push('El logo no puede superar los 5 MB.');
      else newLogo = { storageFile: file.filename, mimeType: file.mimetype, uploadedAt: new Date().toISOString() };
    }
    if (req.files.fondo && req.files.fondo[0]) {
      const file = req.files.fondo[0];
      if (file.size > 10 * 1024 * 1024) errors.push('El fondo no puede superar los 10 MB.');
      else newFondo = { storageFile: file.filename, mimeType: file.mimetype, uploadedAt: new Date().toISOString() };
    }
  }

  // Cleanup files if validation failed
  if (errors.length && req.files) {
    if (req.files.logo && req.files.logo[0]) fs.unlink(req.files.logo[0].path, () => {});
    if (req.files.fondo && req.files.fondo[0]) fs.unlink(req.files.fondo[0].path, () => {});
    return { logo: null, fondo: null };
  }

  return { logo: newLogo || previousLogo, fondo: newFondo || previousFondo };
}

// ---- administración de instituciones (solo Administrador/Soporte) ----
router.post('/', requireAuth, requireAdmin, handleUploadInstitucion, (req, res) => {
  const db = req.db;
  const { nombre, provincia, distrito, tipo, direccion, telefono, municipio, rnc, correo, estado } = req.body || {};
  const errors = [];
  if (!nombre || nombre.trim().length < 3) errors.push('El nombre de la institución es obligatorio.');
  if (!provincia) errors.push('Selecciona la provincia.');
  if (!direccion || direccion.trim().length < 5) errors.push('La dirección es obligatoria.');
  if (!rnc || !/^\d{9}$/.test(rnc)) errors.push('El RNC debe tener exactamente 9 dígitos.');
  if (!correo || !/^\S+@\S+\.\S+$/.test(correo)) errors.push('Ingresa un correo institucional válido.');
  if (telefono && !isPhoneDigits(telefono, 10)) errors.push('El teléfono debe contener exactamente 10 dígitos.');
  
  if (nombre && db.institutions.some((i) => i.nombre.trim().toLowerCase() === String(nombre).trim().toLowerCase())) {
    errors.push('Ya existe una institución con ese nombre.');
  }
  if (rnc && db.institutions.some((i) => i.rnc === rnc)) {
    errors.push('Ya existe una institución con ese RNC.');
  }
  if (correo && db.institutions.some((i) => i.correo && i.correo.toLowerCase() === correo.toLowerCase())) {
    errors.push('Ya existe una institución con ese correo.');
  }

  const ubicacion = parseUbicacion(req.body || {});
  if (ubicacion && ubicacion.error) errors.push(ubicacion.error);

  const { logo, fondo } = processUploadedFiles(req, db, errors, null, null);

  if (errors.length) return res.status(400).json({ errors });

  const institution = {
    id: nextId(db.institutions, 'i'),
    nombre: nombre.trim(),
    rnc,
    correo: correo.toLowerCase(),
    provincia,
    distrito: distrito ? distrito.trim() : null,
    tipo: normalizeTipo(tipo),
    direccion: direccion.trim(),
    telefono: telefono ? formatPhoneDO(telefono) : '',
    municipio: (municipio || '').trim(),
    estado: estado === 'Inactivo' ? 'Inactivo' : 'Activo',
    logo,
    fondo,
    ...(ubicacion && !ubicacion.error ? { lat: ubicacion.lat, lng: ubicacion.lng, ubicacionExacta: true } : {}),
    createdAt: new Date().toISOString(),
  };
  db.institutions.push(institution);
  logEvent(db, { actor: req.currentUser, accion: 'Institución creada', entidad: 'Institución', entidadId: institution.id, detalle: institution.nombre, datos: instantanea(institution, CAMPOS_INSTITUCION) });
  save(db);
  res.json({ institution });
});

// Admin y Soporte modifican cualquier institución; el personal de institución solo la suya
// y únicamente sus datos de contacto e imagen. La identidad oficial (nombre, RNC, ubicación
// administrativa, tipo y estado) sigue siendo del administrador (HU033).
const CAMPOS_SOLO_ADMIN = ['nombre', 'rnc', 'provincia', 'municipio', 'distrito', 'tipo', 'estado'];
function puedeEditarInstitucion(req, res, next) {
  const u = req.currentUser;
  if (['Administrador', 'Soporte'].includes(u.role)) return next();
  if (u.role === 'Personal de institución' && u.institucionId === req.params.id) {
    req.soloDatosDeContacto = true;
    return next();
  }
  return res.status(403).json({ error: 'No tienes permiso para modificar esta institución.' });
}

router.put('/:id', requireAuth, puedeEditarInstitucion, handleUploadInstitucion, (req, res) => {
  if (req.soloDatosDeContacto && req.body) CAMPOS_SOLO_ADMIN.forEach((c) => { delete req.body[c]; });
  const db = req.db;
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution) {
    // Delete files if not found
    if (req.files) {
      if (req.files.logo) fs.unlink(req.files.logo[0].path, () => {});
      if (req.files.fondo) fs.unlink(req.files.fondo[0].path, () => {});
    }
    return res.status(404).json({ error: 'Institución no encontrada.' });
  }

  const { nombre, provincia, distrito, tipo, direccion, telefono, municipio, rnc, correo, estado } = req.body || {};
  const errors = [];
  if (nombre !== undefined && nombre.trim().length < 3) errors.push('El nombre de la institución es obligatorio.');
  if (direccion !== undefined && direccion.trim().length < 5) errors.push('La dirección es obligatoria.');
  if (rnc !== undefined && !/^\d{9}$/.test(rnc)) errors.push('El RNC debe tener exactamente 9 dígitos.');
  if (correo !== undefined && !/^\S+@\S+\.\S+$/.test(correo)) errors.push('Ingresa un correo institucional válido.');
  if (telefono && !isPhoneDigits(telefono, 10)) errors.push('El teléfono debe contener exactamente 10 dígitos.');
  
  if (nombre && db.institutions.some((i) => i.id !== institution.id && i.nombre.trim().toLowerCase() === String(nombre).trim().toLowerCase())) {
    errors.push('Ya existe otra institución con ese nombre.');
  }
  if (rnc && db.institutions.some((i) => i.id !== institution.id && i.rnc === rnc)) {
    errors.push('Ya existe otra institución con ese RNC.');
  }
  if (correo && db.institutions.some((i) => i.id !== institution.id && i.correo && i.correo.toLowerCase() === correo.toLowerCase())) {
    errors.push('Ya existe otra institución con ese correo.');
  }

  const ubicacion = parseUbicacion(req.body || {});
  if (ubicacion && ubicacion.error) errors.push(ubicacion.error);

  const { logo, fondo } = processUploadedFiles(req, db, errors, institution.logo, institution.fondo);

  if (errors.length) return res.status(400).json({ errors });

  const antes = instantanea(institution, CAMPOS_INSTITUCION);
  if (nombre) institution.nombre = nombre.trim();
  if (rnc) institution.rnc = rnc;
  if (correo) institution.correo = correo.toLowerCase();
  if (provincia) institution.provincia = provincia;
  if (distrito) institution.distrito = distrito.trim();
  if (tipo) institution.tipo = normalizeTipo(tipo);
  if (direccion !== undefined) institution.direccion = direccion.trim();
  if (telefono !== undefined) institution.telefono = telefono ? formatPhoneDO(telefono) : '';
  if (municipio !== undefined) institution.municipio = municipio.trim();
  if (estado !== undefined) institution.estado = estado === 'Inactivo' ? 'Inactivo' : 'Activo';
  if (ubicacion) { institution.lat = ubicacion.lat; institution.lng = ubicacion.lng; institution.ubicacionExacta = true; }
  else if (ubicacion === null) { delete institution.ubicacionExacta; } // vuelve a la ubicación por municipio

  if (logo && institution.logo && logo.storageFile !== institution.logo.storageFile) {
    fs.unlink(path.join(FOTOS_DIR, institution.logo.storageFile), () => {});
  }
  if (fondo && institution.fondo && fondo.storageFile !== institution.fondo.storageFile) {
    fs.unlink(path.join(FOTOS_DIR, institution.fondo.storageFile), () => {});
  }
  
  institution.logo = logo;
  institution.fondo = fondo;

  logEvent(db, { actor: req.currentUser, accion: 'Institución modificada', entidad: 'Institución', entidadId: institution.id, detalle: institution.nombre, antes, despues: instantanea(institution, CAMPOS_INSTITUCION) });
  save(db);
  res.json({ institution });
});

router.post('/:id/toggle-estado', requireAuth, requireAdmin, (req, res) => {
  const db = req.db;
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution) return res.status(404).json({ error: 'Institución no encontrada.' });
  const estadoAnterior = institution.estado || 'Activo';
  institution.estado = estadoAnterior === 'Activo' ? 'Inactivo' : 'Activo';
  logEvent(db, { actor: req.currentUser, accion: institution.estado === 'Activo' ? 'Institución activada' : 'Institución desactivada', entidad: 'Institución', entidadId: institution.id, detalle: institution.nombre, antes: { estado: estadoAnterior }, despues: { estado: institution.estado } });
  save(db);
  res.json({ institution });
});

// HU061: mostrar el calendario de citas de una institución (cualquier usuario autenticado
// lo puede consultar; el personal de esa institución y Administración ven el detalle
// completo, los demás roles ven solo cuántas citas hay cada día).
const CALENDAR_DETAIL_ROLES = ['Administrador', 'Soporte'];
router.get('/:id/calendar', requireAuth, (req, res) => {
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


// ---- Imágenes de una institución ----
router.get('/:id/logo', (req, res) => {
  const { load } = require('../lib/db');
  const db = load();
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution || !institution.logo || !institution.logo.storageFile) {
    return res.status(404).json({ error: 'Esta institución no tiene un logo registrado.' });
  }
  const filePath = path.join(FOTOS_DIR, institution.logo.storageFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'La imagen ya no está disponible.' });
  res.setHeader('Content-Type', institution.logo.mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
});

router.get('/:id/fondo', (req, res) => {
  const { load } = require('../lib/db');
  const db = load();
  const institution = db.institutions.find((i) => i.id === req.params.id);
  if (!institution || !institution.fondo || !institution.fondo.storageFile) {
    return res.status(404).json({ error: 'Esta institución no tiene un fondo registrado.' });
  }
  const filePath = path.join(FOTOS_DIR, institution.fondo.storageFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'La imagen ya no está disponible.' });
  res.setHeader('Content-Type', institution.fondo.mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
});

// Foto de portada heredada de los datos de demo (campo foto).
router.get('/:id/foto', (req, res) => {
  const { load } = require('../lib/db');
  const db = load();
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
