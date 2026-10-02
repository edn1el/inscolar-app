const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { load, save, nextId } = require('../lib/db');
const { requireAuth, requireAdminOnly, requireAdminOrSupport, requireCanManageRole, ROLES_QUE_SOPORTE_PUEDE_GESTIONAR } = require('../lib/middleware');
const { notifyAdmins } = require('../lib/notify');
const { sendMail } = require('../lib/mailer');
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
  const w = words[crypto.randomInt(0, words.length)];
  const digits = String(crypto.randomInt(1000, 10000));
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

router.post('/me/mfa/start', async (req, res) => {
  const db = req.db;
  const { method } = req.body || {};
  const code = String(Math.floor(100000 + Math.random() * 900000));
  db.mfaCodes = db.mfaCodes.filter((c) => c.userId !== req.currentUser.id);
  db.mfaCodes.push({ userId: req.currentUser.id, code, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), pendingMethod: method || 'correo' });
  save(db);
  // El metodo "app" (autenticador) es simulado en este prototipo: no se genero
  // nunca un secreto TOTP real ni un QR real, asi que no tiene correo que mandar.
  if (method === 'app') return res.json({ devCode: code });
  const sent = await sendMail(db, {
    to: req.currentUser.email,
    subject: 'Inscolar: código de verificación',
    text: `Tu código de verificación es: ${code}\nVence en 5 minutos.`,
  });
  res.json({ devCode: sent.via === 'smtp' ? undefined : code });
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
// HU013/HU014: listado - Admin ve todos; Soporte solo ve Personal e institución y Tutor
router.get('/', requireAdminOrSupport, (req, res) => {
  const db = req.db;
  const { q, role, estado, institucionId } = req.query;
  const isSupport = req.currentUser.role === 'Soporte';
  let list = db.users.slice();
  // Soporte no puede ver ni gestionar Admin, Soporte ni Auditoría (HU015 reglas de negocio)
  if (isSupport) list = list.filter((u) => ROLES_QUE_SOPORTE_PUEDE_GESTIONAR.includes(u.role));
  if (q) {
    const qq = q.toLowerCase();
    list = list.filter((u) => u.nombre.toLowerCase().includes(qq) || u.email.toLowerCase().includes(qq));
  }
  if (role && role !== 'Todos') list = list.filter((u) => u.role === role);
  if (estado && estado !== 'Todos') list = list.filter((u) => u.estado === estado);
  if (institucionId && institucionId !== 'Todas') list = list.filter((u) => u.institucionId === institucionId);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ total: list.length, users: list.map((u) => publicUser(u, db)) });
});

// HU002 (Admin crea Admin), HU003 (Admin crea Soporte), HU004 (Admin o Soporte crean Personal).
// FUN-02 FIX: validar aquí explícitamente quién puede crear qué rol.
router.post('/', requireAdminOrSupport, (req, res) => {
  const db = req.db;
  const { role, nombre, email, institucionId } = req.body || {};
  const isSupport = req.currentUser.role === 'Soporte';
  const errors = [];

  // FUN-02: Soporte solo puede crear Personal de institución (no Admin, Soporte ni Auditoría)
  if (isSupport && !ROLES_QUE_SOPORTE_PUEDE_GESTIONAR.includes(role)) {
    return res.status(403).json({ error: 'Soporte solo puede crear usuarios de tipo Personal de institución.' });
  }

  const validRoles = isSupport
    ? ['Personal de institución'] // Soporte solo ve y crea Personal (HU004)
    : ['Administrador', 'Soporte', 'Personal de institución', 'Auditoría'];
  if (!validRoles.includes(role)) errors.push('Rol inválido o no permitido para tu nivel de acceso.');
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
  res.json({ user: publicUser(user, db), emailStatus: 'pendiente de envío (simulado en demo)', devTempPassword: tempPassword });
});

// HU015: Admin edita cualquier usuario; Soporte solo edita Personal o Tutor.
router.put('/:id', requireAdminOrSupport, (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });

  // Verificar que Soporte no intente modificar Admin, otro Soporte o Auditoría
  const isSupport = req.currentUser.role === 'Soporte';
  if (isSupport && !ROLES_QUE_SOPORTE_PUEDE_GESTIONAR.includes(user.role)) {
    return res.status(403).json({ error: 'Soporte solo puede modificar usuarios de tipo Personal de institución o Tutor.' });
  }
  // Soporte no puede editar otros roles privilegiados
  const { nombre, email, institucionId, role } = req.body || {};
  if (role && role !== user.role) {
    return res.status(403).json({ error: 'La modificación de roles de usuarios existentes no está permitida.' });
  }
  const errors = [];
  if (email && !isEmail(email)) errors.push('Correo electrónico inválido.');
  if (email && db.users.some((u) => u.id !== user.id && u.email.toLowerCase() === String(email).toLowerCase())) {
    errors.push('Este correo ya está en uso por otro usuario.');
  }
  if (nombre) user.nombre = nombre.trim();
  if (email) user.email = email.trim().toLowerCase();
  if (institucionId !== undefined) user.institucionId = user.role === 'Personal de institución' ? institucionId : null;
  const camposEditados = [nombre && 'nombre', email && 'correo', institucionId !== undefined && 'institución'].filter(Boolean);
  logEvent(db, { actor: req.currentUser, accion: 'Usuario modificado', entidad: 'Usuario', entidadId: user.id, detalle: camposEditados.length ? `Campos: ${camposEditados.join(', ')}` : '' });
  save(db);

  res.json({ user: publicUser(user, db) });
});

// HU013/HU014: solo Admin puede activar o desactivar usuarios.
router.post('/:id/toggle-estado', requireAdminOnly, (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  
  if (user.estado === 'Activo') {
    if (user.id === req.currentUser.id) {
      return res.status(403).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }
    if (user.role === 'Administrador') {
      const activeAdmins = db.users.filter(u => u.role === 'Administrador' && u.estado === 'Activo' && u.id !== user.id);
      if (activeAdmins.length === 0) {
        return res.status(403).json({ error: 'No puedes desactivar al último Administrador activo del sistema.' });
      }
    }
  }

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

// HU016: Admin y Soporte pueden resetear contraseñas; Soporte solo para Personal/Tutor.
router.post('/:id/reset-password', requireAdminOrSupport, (req, res) => {
  const db = req.db;
  const user = db.users.find((u) => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  // Soporte no puede resetear contraseña de Admin/Soporte/Auditoría
  if (req.currentUser.role === 'Soporte' && !ROLES_QUE_SOPORTE_PUEDE_GESTIONAR.includes(user.role)) {
    return res.status(403).json({ error: 'Soporte solo puede restablecer contraseñas de Personal de institución o Tutor.' });
  }
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
  res.json({ status: 'ok', emailStatus: 'pendiente de envío (simulado en demo)', devTempPassword: tempPassword });
});

module.exports = router;
