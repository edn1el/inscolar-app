const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { load, save, nextId } = require('../lib/db');
const { requireAuth, requireAdmin } = require('../lib/middleware');
const { notifyAdmins } = require('../lib/notify');
const { logEvent } = require('../lib/audit');
const { isEmail, passwordRules, isPhoneDigits, formatPhoneDO } = require('../lib/validate');

const router = express.Router();
router.use(requireAuth);

// ---- foto de perfil (HU: usuarios configuran su propia foto) ----
const FOTOS_DIR = path.join(__dirname, '..', 'data', 'uploads', 'usuarios');
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

function publicUser(u, db) {
  if (!u) return null;
  const { passwordHash, passwordHistory, recoveryAttempts, ...rest } = u;
  const institucion = db && u.institucionId ? db.institutions.find((i) => i.id === u.institucionId) : null;
  return { ...rest, institucionNombre: institucion ? institucion.nombre : null };
}

function genTempPassword() {
  const words = ['Insc', 'Esco', 'Aula', 'Beca'];
  const w = words[Math.floor(Math.random() * words.length)];
  const digits = String(Math.floor(1000 + Math.random() * 9000));
  return `${w}-2026-${digits}`;
}

// ---- mi perfil ----
router.get('/me/profile', (req, res) => {
  res.json({ user: publicUser(req.currentUser, req.db) });
});

router.put('/me/profile', (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.currentUser.id);
  const { telefonoFijo, telefonoMovil, sexo } = req.body || {};
  const errors = [];
  if (telefonoFijo && !isPhoneDigits(telefonoFijo, 10)) errors.push('El teléfono fijo debe contener exactamente 10 dígitos.');
  if (telefonoMovil && !isPhoneDigits(telefonoMovil, 10)) errors.push('El teléfono móvil debe contener exactamente 10 dígitos.');
  if (errors.length) return res.status(400).json({ errors });

  if (telefonoFijo !== undefined) user.telefonoFijo = telefonoFijo ? formatPhoneDO(telefonoFijo) : '';
  if (telefonoMovil !== undefined) user.telefonoMovil = telefonoMovil ? formatPhoneDO(telefonoMovil) : '';
  if (sexo) user.sexo = sexo;
  save(db);
  res.json({ user: publicUser(user, db) });
});

router.post('/me/password', (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.currentUser.id);
  const { currentPassword, newPassword, confirmNewPassword } = req.body || {};
  if (!bcrypt.compareSync(currentPassword || '', user.passwordHash)) {
    return res.status(400).json({ errors: ['La contraseña actual no es correcta.'] });
  }
  const errors = passwordRules(newPassword, { min: 8, max: 15 });
  if (newPassword !== confirmNewPassword) errors.push('Las contraseñas no coinciden.');
  const allPrevious = [user.passwordHash, ...(user.passwordHistory || [])].slice(0, 5);
  if (allPrevious.some((h) => bcrypt.compareSync(newPassword || '', h))) {
    errors.push('No puede repetir ninguna de las últimas 5 contraseñas.');
  }
  if (errors.length) return res.status(400).json({ errors });

  user.passwordHistory = [user.passwordHash, ...(user.passwordHistory || [])].slice(0, 5);
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  save(db);
  res.json({ status: 'ok' });
});

router.get('/me/mfa', (req, res) => {
  res.json({ enabled: req.currentUser.mfaEnabled, method: req.currentUser.mfaMethod });
});

router.post('/me/mfa/start', (req, res) => {
  const db = req.db;
  const { method } = req.body || {};
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.mfaCodes = db.mfaCodes.filter((c) => c.userId !== req.currentUser.id);
  db.mfaCodes.push({ userId: req.currentUser.id, code, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), pendingMethod: method || 'correo' });
  save(db);
  res.json({ devCode: code });
});

router.post('/me/mfa/confirm', (req, res) => {
  const db = req.db;
  const { code } = req.body || {};
  const entry = db.mfaCodes.find((c) => c.userId === req.currentUser.id);
  if (!entry || entry.code !== String(code || '') || new Date(entry.expiresAt) < new Date()) {
    return res.status(400).json({ error: 'Código inválido o expirado.' });
  }
  const user = db.users.find((u) => u.id === req.currentUser.id);
  user.mfaEnabled = true;
  user.mfaMethod = entry.pendingMethod || 'correo';
  db.mfaCodes = db.mfaCodes.filter((c) => c.userId !== req.currentUser.id);
  save(db);
  res.json({ enabled: true, method: user.mfaMethod });
});

router.post('/me/mfa/disable', (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.currentUser.id);
  user.mfaEnabled = false;
  save(db);
  res.json({ enabled: false });
});

// HU066: preferencias del propio usuario para notificaciones por correo.
router.put('/me/notification-prefs', (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.currentUser.id);
  const { notifyByEmail } = req.body || {};
  user.notifyByEmail = notifyByEmail !== false;
  save(db);
  res.json({ user: publicUser(user, db) });
});

// ---- foto de perfil ----
router.post('/me/foto', (req, res, next) => {
  uploadFoto.single('foto')(req, res, (err) => {
    if (err instanceof multer.MulterError || err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'La imagen no puede pesar más de 5 MB.' : 'No se pudo subir la imagen. Usa JPG o PNG.';
      return res.status(400).json({ errors: [msg] });
    }
    next();
  });
}, (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.currentUser.id);
  if (!req.file) return res.status(400).json({ errors: ['Selecciona una imagen JPG o PNG de hasta 5 MB.'] });

  const previous = user.foto;
  user.foto = {
    storageFile: req.file.filename,
    mimeType: req.file.mimetype,
    uploadedAt: new Date().toISOString(),
  };
  if (previous && previous.storageFile) {
    fs.unlink(path.join(FOTOS_DIR, previous.storageFile), () => {});
  }
  logEvent(db, { actor: req.currentUser, accion: 'Foto de perfil actualizada', entidad: 'Usuario', entidadId: user.id, detalle: user.nombre });
  save(db);
  res.json({ user: publicUser(user, db) });
});

router.delete('/me/foto', (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.currentUser.id);
  if (user.foto && user.foto.storageFile) {
    fs.unlink(path.join(FOTOS_DIR, user.foto.storageFile), () => {});
  }
  user.foto = null;
  logEvent(db, { actor: req.currentUser, accion: 'Foto de perfil eliminada', entidad: 'Usuario', entidadId: user.id, detalle: user.nombre });
  save(db);
  res.json({ user: publicUser(user, db) });
});

router.get('/:id/foto', (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user || !user.foto || !user.foto.storageFile) {
    return res.status(404).json({ error: 'Este usuario no tiene una foto de perfil registrada.' });
  }
  const filePath = path.join(FOTOS_DIR, user.foto.storageFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'La imagen ya no está disponible.' });
  res.setHeader('Content-Type', user.foto.mimeType || 'image/jpeg');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
});

// ---- administración de usuarios ----
router.get('/', requireAdmin, (req, res) => {
  const db = req.db;
  const { q, role, estado, institucionId } = req.query;
  let list = db.users.slice();
  if (q) {
    const qq = q.toLowerCase();
    list = list.filter((u) => u.nombre.toLowerCase().includes(qq) || u.email.toLowerCase().includes(qq));
  }
  if (role && role !== 'Todos') list = list.filter((u) => u.role === role);
  if (estado && estado !== 'Todos') list = list.filter((u) => u.estado === estado);
  if (institucionId && institucionId !== 'Todas') list = list.filter((u) => u.institucionId === institucionId);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ total: db.users.length, users: list.map((u) => publicUser(u, db)) });
});

router.post('/', requireAdmin, (req, res) => {
  const db = req.db;
  const { role, nombre, email, institucionId } = req.body || {};
  const errors = [];
  const validRoles = ['Administrador', 'Soporte', 'Personal de institución', 'Auditoría'];
  if (!validRoles.includes(role)) errors.push('Rol inválido.');
  if (!nombre || nombre.trim().length < 3) errors.push('El nombre completo es obligatorio.');
  if (!isEmail(email)) errors.push('Correo electrónico inválido.');
  if (db.users.some((u) => u.email.toLowerCase() === String(email || '').toLowerCase())) errors.push('Ese correo ya está en uso.');
  if (role === 'Personal de institución' && !institucionId) errors.push('Selecciona la institución vinculada.');
  if (errors.length) return res.status(400).json({ errors });

  const tempPassword = genTempPassword();
  const user = {
    id: nextId(db.users, 'u'),
    nombre: nombre.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: bcrypt.hashSync(tempPassword, 10),
    passwordHistory: [],
    role,
    institucionId: role === 'Personal de institución' ? institucionId : null,
    estado: 'Activo',
    sexo: null,
    telefonoFijo: '',
    telefonoMovil: '',
    cedula: null,
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: true,
    createdAt: new Date().toISOString(),
    lastAccess: null,
  };
  db.users.push(user);
  logEvent(db, { actor: req.currentUser, accion: 'Usuario creado', entidad: 'Usuario', entidadId: user.id, detalle: `${user.nombre} (${user.role})` });
  save(db);
  res.json({ user: publicUser(user, db), devTempPassword: tempPassword });
});

router.put('/:id', requireAdmin, (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const { nombre, email, role, institucionId } = req.body || {};
  const errors = [];
  if (email && !isEmail(email)) errors.push('Correo electrónico inválido.');
  if (email && db.users.some((u) => u.id !== user.id && u.email.toLowerCase() === String(email).toLowerCase())) {
    errors.push('Este correo ya está en uso por otro usuario.');
  }
  if (errors.length) return res.status(400).json({ errors });

  const wasAdmin = user.role === 'Administrador';
  const roleChanged = role && role !== user.role;
  const prevRole = user.role;

  if (nombre) user.nombre = nombre.trim();
  if (email) user.email = email.trim().toLowerCase();
  if (role) user.role = role;
  if (institucionId !== undefined) user.institucionId = role === 'Personal de institución' ? institucionId : null;
  const camposEditados = [nombre && 'nombre', email && 'correo', roleChanged && 'rol', institucionId !== undefined && 'institución'].filter(Boolean);
  logEvent(db, { actor: req.currentUser, accion: 'Usuario modificado', entidad: 'Usuario', entidadId: user.id, detalle: camposEditados.length ? `Campos: ${camposEditados.join(', ')}` : '' });
  save(db);

  if (roleChanged && (wasAdmin || user.role === 'Administrador')) {
    notifyAdmins(db, { affectedUser: user, campo: 'Rol', anterior: prevRole, nuevo: user.role, actor: req.currentUser });
    save(db);
  }
  res.json({ user: publicUser(user, db) });
});

router.post('/:id/toggle-estado', requireAdmin, (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const prev = user.estado;
  user.estado = prev === 'Activo' ? 'Inactivo' : 'Activo';
  logEvent(db, { actor: req.currentUser, accion: user.estado === 'Activo' ? 'Usuario activado' : 'Usuario desactivado', entidad: 'Usuario', entidadId: user.id, detalle: user.nombre });
  save(db);
  if (user.role === 'Administrador') {
    notifyAdmins(db, { affectedUser: user, campo: 'Estado', anterior: prev, nuevo: user.estado, actor: req.currentUser });
    save(db);
  }
  res.json({ user: publicUser(user, db) });
});

router.post('/:id/reset-password', requireAdmin, (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const tempPassword = genTempPassword();
  user.passwordHistory = [user.passwordHash, ...(user.passwordHistory || [])].slice(0, 5);
  user.passwordHash = bcrypt.hashSync(tempPassword, 10);
  user.mustChangePassword = true;
  logEvent(db, { actor: req.currentUser, accion: 'Contraseña de usuario restablecida', entidad: 'Usuario', entidadId: user.id, detalle: user.nombre });
  save(db);
  if (user.role === 'Administrador') {
    notifyAdmins(db, { affectedUser: user, campo: 'Contraseña restablecida', actor: req.currentUser });
    save(db);
  }
  res.json({ status: 'ok', devTempPassword: tempPassword });
});

module.exports = router;
