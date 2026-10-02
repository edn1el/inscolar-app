#!/usr/bin/env node
/**
 * F2.1 Permission Matrix Tests
 * Tests the API directly loading express routes without a network call,
 * so sessions work properly within a single process.
 */
const http = require('http');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const express = require(path.join(ROOT, 'node_modules/express'));
const session = require(path.join(ROOT, 'node_modules/express-session'));
const { load, save } = require(path.join(ROOT, 'lib/db'));

// Set up minimal express to test routes
const app = express();
app.use(express.json());
app.use(session({
  secret: 'test-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// Mount routes
const authRouter = require(path.join(ROOT, 'routes/auth'));
const usersRouter = require(path.join(ROOT, 'routes/users'));
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);

const server = http.createServer(app);

// Test helper using http module with cookie jar
function request(options, body, cookies) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: '127.0.0.1',
      port: 3099,
      method: options.method || 'GET',
      path: options.path,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(cookies ? { 'Cookie': cookies } : {})
      }
    };
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(body), setCookie: res.headers['set-cookie'] }); }
        catch(e) { resolve({ status: res.statusCode, body: {}, setCookie: res.headers['set-cookie'] }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function parseCookie(setCookieHeaders) {
  if (!setCookieHeaders) return '';
  return setCookieHeaders.map(c => c.split(';')[0]).join('; ');
}

let pass = 0; let fail = 0;
function assert(label, condition, details) {
  if (condition) { console.log(`  ✅ ${label}`); pass++; }
  else { console.log(`  ❌ ${label}${details ? ': '+JSON.stringify(details) : ''}`); fail++; }
}

// Activate soporte for testing
async function runTests() {
  const db = load();
  const soporte = db.users.find(u => u.role === 'Soporte');
  const prevEstado = soporte.estado;
  const prevHash = soporte.passwordHash;
  const prevHistory = [...(soporte.passwordHistory || [])];
  // La cuenta de Soporte de la demo está inactiva y con cambio de contraseña pendiente
  // a propósito (para demostrar los poderes del administrador). La prueba la habilita
  // solo mientras corre y la deja como estaba al final.
  const prevMustChange = soporte.mustChangePassword;
  soporte.estado = 'Activo';
  soporte.mustChangePassword = false;
  save(db);

  server.listen(3099, async () => {
    console.log('\n=== F2.1 MATRIZ DE PERMISOS - RESULTADOS DE PRUEBA ===\n');

    // --- Login sessions ---
    const adminLoginRes = await request({ method: 'POST', path: '/api/auth/login' },
      { email: 'maria.rosario@inscolar.do', password: 'Inscolar#2026' });
    const adminCookie = parseCookie(adminLoginRes.setCookie);
    assert('Admin login (HU006)', adminLoginRes.status === 200 && adminLoginRes.body.user?.role === 'Administrador');

    const soporteLoginRes = await request({ method: 'POST', path: '/api/auth/login' },
      { email: soporte.email, password: 'Inscolar#2026' });
    const soporteCookie = parseCookie(soporteLoginRes.setCookie);
    assert('Soporte login (HU006)', soporteLoginRes.status === 200 && soporteLoginRes.body.user?.role === 'Soporte');

    console.log('\n--- CREACIÓN DE USUARIOS ---');

    // Admin crea Admin (HU002 - permitido)
    let r = await request({ method: 'POST', path: '/api/users' },
      { role: 'Administrador', nombre: 'Admin Test F2', email: 'admintest_f21@test.do' }, adminCookie);
    assert('Admin puede crear Administrador (HU002)', r.status === 200 && r.body.user?.role === 'Administrador');

    // Admin crea Soporte (HU003 - permitido)
    r = await request({ method: 'POST', path: '/api/users' },
      { role: 'Soporte', nombre: 'Soporte Test F2', email: 'soportetest_f21@test.do' }, adminCookie);
    assert('Admin puede crear Soporte (HU003)', r.status === 200 && r.body.user?.role === 'Soporte');

    const instId = load().institutions[0].id;

    // Admin crea Personal (HU004 - permitido)
    r = await request({ method: 'POST', path: '/api/users' },
      { role: 'Personal de institución', nombre: 'Personal Test F2', email: 'personaltest_f21@test.do', institucionId: instId }, adminCookie);
    assert('Admin puede crear Personal (HU004)', r.status === 200 && r.body.user?.role === 'Personal de institución');

    // FUN-02: Soporte intenta crear Administrador → DEBE SER 403
    r = await request({ method: 'POST', path: '/api/users' },
      { role: 'Administrador', nombre: 'Hack Admin', email: 'hackadmin_f21@test.do' }, soporteCookie);
    assert('FUN-02 FIX: Soporte NO puede crear Administrador (HU002)', r.status === 403, r.body);

    // Soporte intenta crear Soporte → DEBE SER 403 (HU003)
    r = await request({ method: 'POST', path: '/api/users' },
      { role: 'Soporte', nombre: 'Hack Soporte', email: 'hacksoporte_f21@test.do' }, soporteCookie);
    assert('Soporte NO puede crear otro Soporte (HU003)', r.status === 403, r.body);

    // Soporte intenta crear Auditoría → DEBE SER 403
    r = await request({ method: 'POST', path: '/api/users' },
      { role: 'Auditoría', nombre: 'Hack Audit', email: 'hackaudit_f21@test.do' }, soporteCookie);
    assert('Soporte NO puede crear Auditoría', r.status === 403, r.body);

    // Soporte crea Personal → DEBE SER 200 (HU004)
    r = await request({ method: 'POST', path: '/api/users' },
      { role: 'Personal de institución', nombre: 'Personal Soporte F2', email: 'psoportetest_f21@test.do', institucionId: instId }, soporteCookie);
    assert('Soporte puede crear Personal de institución (HU004)', r.status === 200 && r.body.user?.role === 'Personal de institución');

    console.log('\n--- ACTIVAR / DESACTIVAR (HU013/HU014) ---');

    // Solo Admin puede toggle-estado - primero probar que Soporte no puede
    const adminId = load().users.find(u => u.email === 'maria.rosario@inscolar.do').id;
    r = await request({ method: 'POST', path: `/api/users/${adminId}/toggle-estado` }, null, soporteCookie);
    assert('Soporte NO puede desactivar Administrador (HU013/HU014)', r.status === 403, r.body);

    const soporteId = load().users.find(u => u.email === soporte.email).id;
    r = await request({ method: 'POST', path: `/api/users/${soporteId}/toggle-estado` }, null, soporteCookie);
    assert('Soporte NO puede desactivar otro usuario (HU013/HU014)', r.status === 403, r.body);

    // Admin intenta desactivarse a sí mismo → 403
    r = await request({ method: 'POST', path: `/api/users/${adminId}/toggle-estado` }, null, adminCookie);
    assert('Admin NO puede desactivarse a sí mismo', r.status === 403, r.body);

    // Admin desactiva a otro Administrador (admintest_f21@test.do) cuando quedan varios → OK
    const newAdminId = load().users.find(u => u.email === 'admintest_f21@test.do').id;
    r = await request({ method: 'POST', path: `/api/users/${newAdminId}/toggle-estado` }, null, adminCookie);
    assert('Admin puede desactivar a otro Administrador cuando quedan varios', r.status === 200 && r.body.user?.estado === 'Inactivo', r.body);

    // Reactivación del otro Administrador
    r = await request({ method: 'POST', path: `/api/users/${newAdminId}/toggle-estado` }, null, adminCookie);
    assert('Admin puede reactivar a otro Administrador', r.status === 200 && r.body.user?.estado === 'Activo', r.body);

    console.log('\n--- EDICIÓN DE USUARIOS (HU015) ---');

    // Admin intenta cambiar su propio rol → 403
    r = await request({ method: 'PUT', path: `/api/users/${adminId}` }, { role: 'Soporte' }, adminCookie);
    assert('Admin NO puede cambiar su propio rol', r.status === 403, r.body);

    // Soporte intenta editar Admin → 403
    r = await request({ method: 'PUT', path: `/api/users/${adminId}` },
      { nombre: 'Hacked' }, soporteCookie);
    assert('Soporte NO puede editar Administrador (HU015)', r.status === 403, r.body);

    // Soporte editar Personal → OK
    const personalId = load().users.find(u => u.email === 'personaltest_f21@test.do').id;
    r = await request({ method: 'PUT', path: `/api/users/${personalId}` },
      { nombre: 'Personal Editado F2' }, soporteCookie);
    assert('Soporte puede editar Personal de institución (HU015)', r.status === 200, r.body);

    // Soporte no puede cambiar rol a Admin
    r = await request({ method: 'PUT', path: `/api/users/${personalId}` },
      { role: 'Administrador' }, soporteCookie);
    assert('Soporte NO puede cambiar rol a Administrador (HU015)', r.status === 403, r.body);

    console.log('\n--- RESET DE CONTRASEÑA (HU016) ---');

    // Soporte reset Admin → 403
    r = await request({ method: 'POST', path: `/api/users/${adminId}/reset-password` }, null, soporteCookie);
    assert('Soporte NO puede resetear contraseña de Administrador (HU016)', r.status === 403, r.body);

    // Soporte reset Personal → OK
    r = await request({ method: 'POST', path: `/api/users/${personalId}/reset-password` }, null, soporteCookie);
    assert('Soporte puede resetear contraseña de Personal (HU016)', r.status === 200, r.body);

    // Ahora que terminamos las pruebas con Soporte, el Admin puede desactivarlo (test HU014)
    r = await request({ method: 'POST', path: `/api/users/${soporteId}/toggle-estado` }, null, adminCookie);
    assert('Admin puede desactivar Soporte (HU014)', r.status === 200, r.body);

    // Admin reset cualquiera → OK
    r = await request({ method: 'POST', path: `/api/users/${soporteId}/reset-password` }, null, adminCookie);
    assert('Admin puede resetear contraseña de cualquier usuario (HU016)', r.status === 200, r.body);

    // Restaurar datos
    const db2 = load();
    const s2 = db2.users.find(u => u.email === soporte.email);
    s2.estado = prevEstado;
    s2.passwordHash = prevHash;
    s2.passwordHistory = prevHistory;
    s2.mustChangePassword = prevMustChange;
    // Eliminar usuarios de prueba
    db2.users = db2.users.filter(u => !u.email.endsWith('@test.do'));
    save(db2);
    console.log('Base de datos restaurada.');

    server.close();
    process.exit(fail > 0 ? 1 : 0);
  });
}

runTests().catch(e => { console.error(e); process.exit(1); });
