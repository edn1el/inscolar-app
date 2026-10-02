const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { load, save, nextId } = require('../lib/db');
const { isEmail, passwordRules, isCedula, isPhoneDigits, formatPhoneDO } = require('../lib/validate');
const { logEvent } = require('../lib/audit');

const router = express.Router();

const MFA_TTL_MS = 5 * 60 * 1000; // 5 minutos
const RESET_TTL_MS = 15 * 60 * 1000; // 15 minutos
const RESET_MAX_ATTEMPTS = 2;
const RESET_WINDOW_MS = 24 * 60 * 60 * 1000;

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, passwordHistory, ...rest } = u;
  return {...rest, auditEnabled: u.role === 'Administrador' && require('../lib/audit-contract').enabled(u)};
}

function findByEmail(db, email) {
  return db.users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase());
}

// ---- estado inicial ----
router.get('/setup-needed', (req, res) => {
  const db = load();
  const hasAdmin = db.users.some((u) => u.role === 'Administrador');
  res.json({ needed: !hasAdmin });
});

router.post('/setup', (req, res) => {
  const db = load();
  const hasAdmin = db.users.some((u) => u.role === 'Administrador');
  if (hasAdmin) return res.status(409).json({ error: 'Ya existe un administrador. Este paso ya no está disponible.' });

  const { nombre, email, password, confirmPassword } = req.body || {};
  const errors = [];
  if (!nombre || nombre.trim().length < 3) errors.push('El nombre completo es obligatorio.');
  if (!isEmail(email)) errors.push('Correo electrónico inválido.');
  if (findByEmail(db, email)) errors.push('Ese correo ya está en uso.');
  errors.push(...passwordRules(password, { min: 8, max: 25 }));
  if (password !== confirmPassword) errors.push('Las contraseñas no coinciden.');
  if (errors.length) return res.status(400).json({ errors });

  const user = {
    id: nextId(db.users, 'u'),
    nombre: nombre.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    passwordHistory: [],
    role: 'Administrador',
    institucionId: null,
    estado: 'Activo',
    sexo: null,
    telefonoFijo: '',
    telefonoMovil: '',
    cedula: null,
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    lastAccess: null,
  };
  db.users.push(user);
  save(db);
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

// ---- login ----
router.post('/login', (req, res) => {
  const db = load();
  const { email, password } = req.body || {};
  const user = findByEmail(db, email);
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    logEvent(db, { actor: user || null, accion: 'Inicio de sesión fallido', entidad: 'Usuario', entidadId: user ? user.id : null, detalle: `Intento con: ${(email || '').trim()}` });
    save(db);
    return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
  }
  if (user.estado === 'Inactivo') {
    logEvent(db, { actor: user, accion: 'Inicio de sesión fallido', entidad: 'Usuario', entidadId: user.id, detalle: 'Cuenta desactivada' });
    save(db);
    return res.status(403).json({ error: 'Esta cuenta está desactivada. Contacta a un administrador.' });
  }

  if (user.mustChangePassword) {
    req.session.pendingUserId = user.id;
    req.session.pendingPurpose = 'force_change';
    return res.json({ status: 'must_change_password' });
  }

  if (user.mfaEnabled) {
    const { deviceToken } = req.body || {};
    db.trustedDevices = db.trustedDevices || [];
    const isTrusted = db.trustedDevices.find(d => d.userId === user.id && d.token === deviceToken && new Date(d.expiresAt) > new Date());
    
    if (!isTrusted) {
      const code = genCode();
      db.mfaCodes = db.mfaCodes.filter((c) => c.userId !== user.id);
      db.mfaCodes.push({ userId: user.id, code, expiresAt: new Date(Date.now() + MFA_TTL_MS).toISOString() });
      save(db);
      req.session.pendingUserId = user.id;
      req.session.pendingPurpose = 'mfa';
      return res.json({
        status: 'mfa_required',
        method: user.mfaMethod,
        maskedEmail: user.email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '•'.repeat(Math.min(b.length, 3)) + c),
        devCode: code, // sin servicio real de correo/SMS: se muestra en la respuesta para poder probar el flujo
      });
    }
  }

  req.session.userId = user.id;
  user.lastAccess = new Date().toISOString();
  logEvent(db, { actor: user, accion: 'Inicio de sesión exitoso', entidad: 'Usuario', entidadId: user.id });
  save(db);
  res.json({ status: 'ok', user: publicUser(user) });
});

router.post('/mfa/verify', (req, res) => {
  const db = load();
  const userId = req.session.pendingUserId;
  if (!userId || req.session.pendingPurpose !== 'mfa') return res.status(400).json({ error: 'No hay una verificación pendiente.' });
  const { code, rememberDevice } = req.body || {};
  const entry = db.mfaCodes.find((c) => c.userId === userId);
  const pendingUser = db.users.find((u) => u.id === userId);
  if (!entry || entry.code !== String(code || '') || new Date(entry.expiresAt) < new Date()) {
    logEvent(db, { actor: pendingUser || null, accion: 'Inicio de sesión fallido', entidad: 'Usuario', entidadId: pendingUser ? pendingUser.id : null, detalle: 'Código de verificación inválido o expirado' });
    save(db);
    return res.status(400).json({ error: 'Código inválido o expirado.' });
  }
  db.mfaCodes = db.mfaCodes.filter((c) => c.userId !== userId);
  
  let newDeviceToken = null;
  if (rememberDevice) {
    newDeviceToken = crypto.randomBytes(32).toString('hex');
    db.trustedDevices = db.trustedDevices || [];
    db.trustedDevices.push({ userId, token: newDeviceToken, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() });
  }

  const user = db.users.find((u) => u.id === userId);
  user.lastAccess = new Date().toISOString();
  logEvent(db, { actor: user, accion: 'Inicio de sesión exitoso', entidad: 'Usuario', entidadId: user.id, detalle: 'Con verificación en dos pasos' });
  save(db);
  req.session.userId = userId;
  delete req.session.pendingUserId;
  delete req.session.pendingPurpose;
  res.json({ status: 'ok', user: publicUser(user), deviceToken: newDeviceToken });
});

router.post('/mfa/resend', (req, res) => {
  const db = load();
  const userId = req.session.pendingUserId;
  if (!userId || req.session.pendingPurpose !== 'mfa') return res.status(400).json({ error: 'No hay una verificación pendiente.' });
  const code = genCode();
  db.mfaCodes = db.mfaCodes.filter((c) => c.userId !== userId);
  db.mfaCodes.push({ userId, code, expiresAt: new Date(Date.now() + MFA_TTL_MS).toISOString() });
  save(db);
  res.json({ devCode: code });
});

// ---- cambio obligatorio de contraseña (tras temporal / reseteo admin) ----
router.post('/force-change', (req, res) => {
  const db = load();
  const userId = req.session.pendingUserId;
  if (!userId || req.session.pendingPurpose !== 'force_change') return res.status(400).json({ error: 'No hay un cambio pendiente.' });
  const user = db.users.find((u) => u.id === userId);
  const { currentPassword, newPassword, confirmNewPassword } = req.body || {};
  if (!bcrypt.compareSync(currentPassword || '', user.passwordHash)) {
    return res.status(400).json({ errors: ['La contraseña temporal no es correcta.'] });
  }
  const errors = passwordRules(newPassword, { min: 8, max: 15 });
  if (newPassword !== confirmNewPassword) errors.push('Las contraseñas no coinciden.');
  const allPrevious = [user.passwordHash, ...(user.passwordHistory || [])].slice(0, 5);
  if (allPrevious.some((h) => bcrypt.compareSync(newPassword || '', h))) {
    errors.push('No puede coincidir con ninguna de las últimas 5 contraseñas.');
  }
  if (errors.length) return res.status(400).json({ errors });

  user.passwordHistory = [user.passwordHash, ...(user.passwordHistory || [])].slice(0, 5);
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  logEvent(db, {actor:user, accion:"Contraseña cambiada", entidad:"Usuario", entidadId:user.id});
  user.mustChangePassword = false;
  user.lastAccess = new Date().toISOString();
  save(db);

  req.session.userId = userId;
  delete req.session.pendingUserId;
  delete req.session.pendingPurpose;
  res.json({ status: 'ok', user: publicUser(user) });
});

// ---- registro de tutor (autoservicio) ----
router.post('/register', (req, res) => {
  const db = load();
  const { nombre, apellido, cedula, telefono, email, password, confirmPassword } = req.body || {};
  const errors = [];
  if (!nombre || !nombre.trim()) errors.push('El nombre es obligatorio.');
  if (!apellido || !apellido.trim()) errors.push('El apellido es obligatorio.');
  if (!isCedula(cedula)) errors.push('La cédula debe contener exactamente 11 dígitos numéricos.');
  if (!isPhoneDigits(telefono, 10)) errors.push('El teléfono debe contener exactamente 10 dígitos numéricos.');
  if (!isEmail(email)) errors.push('Correo electrónico inválido.');
  if (findByEmail(db, email)) errors.push('Ese correo ya está en uso.');
  if (db.users.some((u) => u.cedula === cedula)) errors.push('Esa cédula ya está registrada.');
  errors.push(...passwordRules(password, { min: 8, max: 15 }));
  if (password !== confirmPassword) errors.push('Las contraseñas no coinciden.');
  if (errors.length) return res.status(400).json({ errors });

  const user = {
    id: nextId(db.users, 'u'),
    nombre: `${nombre.trim()} ${apellido.trim()}`,
    email: email.trim().toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 10),
    passwordHistory: [],
    role: 'Tutor',
    institucionId: null,
    estado: 'Activo',
    sexo: null,
    telefonoFijo: '',
    telefonoMovil: formatPhoneDO(telefono),
    cedula,
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: new Date().toISOString(),
    lastAccess: new Date().toISOString(),
  };
  db.users.push(user);
  save(db);
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
});

// ---- recuperar contraseña ----
router.post('/forgot', (req, res) => {
  const db = load();
  const { email } = req.body || {};
  const emailLower = String(email || '').toLowerCase();
  
  if (!db.forgotAttempts) db.forgotAttempts = {};
  
  const now = Date.now();
  const attempts = db.forgotAttempts[emailLower] || { count: 0, windowStart: new Date(now).toISOString() };
  if (now - new Date(attempts.windowStart).getTime() > RESET_WINDOW_MS) {
    attempts.count = 0;
    attempts.windowStart = new Date(now).toISOString();
  }
  if (attempts.count >= RESET_MAX_ATTEMPTS) {
    return res.status(429).json({ error: `Máximo ${RESET_MAX_ATTEMPTS} intentos de recuperación cada 24 horas.` });
  }
  attempts.count += 1;
  db.forgotAttempts[emailLower] = attempts;
  save(db);

  const user = findByEmail(db, email);
  // Respuesta genérica aunque el correo no exista, para no filtrar qué cuentas existen.
  if (!user) return res.json({ status: 'sent', attemptsUsed: attempts.count, attemptsMax: RESET_MAX_ATTEMPTS });

  const token = crypto.randomBytes(16).toString('hex');
  db.resetTokens = db.resetTokens.filter((t) => t.userId !== user.id);
  const requestId=crypto.randomUUID();
  db.resetTokens.push({ userId: user.id, token, requestId, expiresAt: new Date(now + RESET_TTL_MS).toISOString(), used: false });
  db.recoveryRequests.push({id:requestId,userId:user.id,createdAt:new Date(now).toISOString(),completedAt:null});
  save(db);

  res.json({
    status: 'sent',
    attemptsUsed: attempts.count,
    attemptsMax: RESET_MAX_ATTEMPTS,
    devToken: token, // sin servicio real de correo: se expone para poder probar el flujo end-to-end
  });
});

router.post('/reset', (req, res) => {
  const db = load();
  const { token, newPassword, confirmNewPassword } = req.body || {};
  const entry = db.resetTokens.find((t) => t.token === token);
  if (!entry || entry.used || new Date(entry.expiresAt) < new Date()) {
    return res.status(400).json({ error: 'El enlace de recuperación no es válido o ya expiró.' });
  }
  const user = db.users.find((u) => u.id === entry.userId);
  const errors = passwordRules(newPassword, { min: 8, max: 15 });
  if (newPassword !== confirmNewPassword) errors.push('Las contraseñas no coinciden.');
  const allPrevious = [user.passwordHash, ...(user.passwordHistory || [])].slice(0, 5);
  if (allPrevious.some((h) => bcrypt.compareSync(newPassword || '', h))) {
    errors.push('No puede coincidir con ninguna de las últimas 5 contraseñas.');
  }
  if (errors.length) return res.status(400).json({ errors });

  user.passwordHistory = [user.passwordHash, ...(user.passwordHistory || [])].slice(0, 5);
  user.passwordHash = bcrypt.hashSync(newPassword, 10);
  logEvent(db, {actor:user, accion:"Contraseña recuperada", entidad:"Usuario", entidadId:user.id});
  entry.used = true;
  const recovery=db.recoveryRequests.find(r=>r.id===entry.requestId);
  if(recovery)recovery.completedAt=new Date().toISOString();
  save(db);
  res.json({ status: 'ok' });
});

router.get('/me', (req, res) => {
  const db = load();
  const user = db.users.find((u) => u.id === req.session.userId);
  res.json({ user: publicUser(user) });
});

router.post('/logout', (req, res) => {
  const db = load();
  const user = db.users.find((u) => u.id === req.session.userId);
  if (user) {
    logEvent(db, { actor: user, accion: 'Cierre de sesión', entidad: 'Usuario', entidadId: user.id });
    save(db);
  }
  req.session.destroy(() => res.json({ status: 'ok' }));
});

module.exports = router;
