const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const bcrypt = require('bcryptjs');
const { chromium, expect } = require('playwright/test');

// Ejecuta la aplicación real; todas las escrituras van a una copia temporal.
test('login y sesión en Chromium', { timeout: 120000 }, async (t) => {
  const root = path.resolve(__dirname, '..');
  const pendingPaths = ['data/db.json', 'test_puppeteer.js'].filter(p => fs.existsSync(path.join(root, p)));
  const originals = pendingPaths.map(p => fs.readFileSync(path.join(root, p)));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inscolar-login-'));
  const dbPath = path.join(dir, 'db.json');
  const db = JSON.parse(fs.readFileSync(path.join(root, 'data/db.json')));
  const password = 'LoginTest#2026';
  const hash = bcrypt.hashSync(password, 4);
  for (const user of db.users) {
    Object.assign(user, { passwordHash: hash, estado: 'Activo', mfaEnabled: false, mustChangePassword: false });
  }
  db.users.find(u => u.id === 'u008').mfaEnabled = true;
  db.users.find(u => u.id === 'u005').mustChangePassword = true;
  db.users.find(u => u.id === 'u009').estado = 'Inactivo';
  fs.writeFileSync(dbPath, JSON.stringify(db));
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  let server = spawn(process.execPath, ['server.js'], {
    cwd: root, env: { ...process.env, PORT: String(port), DB_PATH: dbPath }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.stdout.on('data', chunk => { if (String(chunk).includes('corriendo en')) resolve(); });
      server.stderr.on('data', chunk => reject(new Error(String(chunk))));
      server.once('error', reject);
      server.once('exit', code => reject(new Error(`Servidor terminó: ${code}`)));
    });
    browser = await chromium.launch({ headless: true });
    const base = `http://127.0.0.1:${port}`;
    const tutor = db.users.find(u => u.id === 'u002');
    async function scenario(name, run, options = {}) {
      await t.test(name, async () => {
        const context = await browser.newContext(options);
        const page = await context.newPage();
        page.setDefaultTimeout(7000);
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        try { await run(page, context); assert.deepEqual(errors, []); }
        finally { await context.close(); }
      });
    }
    async function login(page, user = tutor, redirect = '', enteredPassword = password) {
      await page.goto(`${base}/#/login${redirect ? '?redirect=' + encodeURIComponent(redirect) : ''}`);
      await page.locator('#login-form').waitFor();
      await page.locator('[name=email]').fill(user.email);
      await page.locator('[name=password]').fill(enteredPassword);
      const response = page.waitForResponse(r => r.url().endsWith('/api/auth/login'));
      await page.locator('#login-form button[type=submit]').click();
      return await (await response).json();
    }
    async function profile(page, user) {
      await expect(page).toHaveURL(/#\/app\/perfil$/);
      await expect(page.locator('.main')).toContainText(user.email);
      await expect(page.locator('.main')).toContainText(user.role);
      const session = await page.evaluate(async () => (await fetch('/api/auth/me')).json());
      assert.equal(session.user.id, user.id);
    }
    await scenario('ruta raíz sin sesión abre búsqueda pública', async page => {
      await page.goto(base + '/#/');
      await expect(page.locator('#search-form')).toBeVisible();
    });
    await scenario('error de arranque muestra Reintentar y recupera sin recargar', async page => {
      await page.route('**/api/auth/setup-needed', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({error:'Servidor reiniciándose'}) }));
      await page.goto(base + '/#/');
      await expect(page.locator('#retry-route')).toBeVisible();
      await expect(page.locator('#root')).toContainText('Servidor reiniciándose');
      await page.unroute('**/api/auth/setup-needed');
      await page.locator('#retry-route').click();
      await expect(page.locator('#search-form')).toBeVisible();
    });
    await scenario('petición sin respuesta tiene límite y permite reintentar', async page => {
      await page.clock.install();
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route('**/api/auth/me', async route => { await gate; await route.abort().catch(() => {}); });
      const requestStarted = page.waitForRequest(r => r.url().endsWith('/api/auth/me'));
      await page.goto(base + '/#/');
      await requestStarted;
      await page.clock.fastForward(15001);
      await expect(page.locator('#retry-route')).toBeVisible();
      await expect(page.locator('#root')).toContainText('tardó demasiado');
      release();
      await page.unroute('**/api/auth/me');
      await page.locator('#retry-route').click();
      await expect(page.locator('#search-form')).toBeVisible();
    });
    for (const role of ['Administrador', 'Tutor', 'Personal de institución', 'Soporte', 'Auditoría']) {
      const user = db.users.find(u => u.role === role);
      await scenario(`${role}: autenticar, menú, cookie, recarga y cierre`, async (page, context) => {
        const result = await login(page, user);
        assert.equal(result.status, 'ok');
        assert.equal(result.user.role, role);
        await profile(page, user);
        assert.ok((await context.cookies()).some(c => c.name === 'connect.sid' && c.httpOnly));
        const canManage = ['Administrador', 'Soporte'].includes(role);
        await expect(page.locator('[data-nav="#/app/usuarios"]')).toHaveCount(canManage ? 1 : 0);
        const users = await context.request.get(`${base}/api/users`);
        assert.equal(users.status(), canManage ? 200 : 403);
        await page.reload(); // Solo prueba de recuperación; la aplicación no recarga.
        await profile(page, user);
        await page.locator('#logout-btn').click();
        await page.locator('#login-form').waitFor();
        assert.equal((await (await context.request.get(`${base}/api/auth/me`)).json()).user, null);
        await page.locator('[name=email]').fill(tutor.email);
        await page.locator('[name=password]').fill(password);
        await page.locator('#login-form button[type=submit]').click();
        await profile(page, tutor);
      });
    }
    await scenario('respuesta tardía no reemplaza la navegación elegida por el usuario', async (page, context) => {
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      let received;
      const responseReady = new Promise(resolve => { received = resolve; });
      await page.route('**/api/auth/login', async route => {
        const response = await route.fetch();
        received();
        await gate;
        await route.fulfill({ response });
      });
      await page.goto(`${base}/#/login`);
      await page.locator('#login-form').waitFor();
      await page.locator('[name=email]').fill(tutor.email);
      await page.locator('[name=password]').fill(password);
      await page.locator('#login-form button[type=submit]').click();
      await responseReady;
      await page.evaluate(() => { location.hash = '#/forgot'; });
      await page.locator('#forgot-form').waitFor();
      const response = page.waitForResponse(r => r.url().endsWith('/api/auth/login'));
      release();
      await response;
      assert.equal((await (await context.request.get(`${base}/api/auth/me`)).json()).user.id, tutor.id);
      await expect(page.locator('#forgot-form')).toBeVisible();
      await page.evaluate(() => { location.hash = '#/app/perfil'; });
      await profile(page, tutor);
    });
    await scenario('contraseña incorrecta: error visible, sin sesión y reintento', async page => {
      await login(page, tutor, '', 'incorrecta');
      await expect(page.locator('#err')).toContainText('Correo o contraseña incorrectos');
      await expect(page.locator('#login-form button[type=submit]')).toBeEnabled();
      assert.equal((await page.evaluate(async () => (await fetch('/api/auth/me')).json())).user, null);
      await page.locator('[name=password]').fill(password);
      await page.locator('#login-form button[type=submit]').click();
      await profile(page, tutor);
    });
    await scenario('cuenta inactiva rechazada', async page => {
      await login(page, db.users.find(u => u.id === 'u009'));
      await expect(page.locator('#err')).toContainText('desactivada');
      assert.equal((await page.evaluate(async () => (await fetch('/api/auth/me')).json())).user, null);
    });
    for (const mode of ['paused', 'reduced', 'missing', 'throw', 'reject', 'pending']) {
      await scenario(`animación ${mode}: no bloquea login ni deja hook activo`, async page => {
        if (mode === 'missing') await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
        await page.goto(`${base}/#/login`);
        await page.locator('#login-form').waitFor();
        await page.evaluate(() => { window.__loginDocument = 'original'; });
        if (mode === 'paused') await page.locator('#pause-particles').click();
        if (['throw', 'reject', 'pending'].includes(mode)) await page.evaluate(mode => {
          window._triggerLoginSuccess = () => {
            if (mode === 'throw') throw new Error('animación rota');
            if (mode === 'reject') return Promise.reject(new Error('animación rota'));
            return new Promise(() => {});
          };
        }, mode);
        await page.locator('[name=email]').fill(tutor.email);
        await page.locator('[name=password]').fill(password);
        await page.locator('#login-form button[type=submit]').click();
        await profile(page, tutor);
        assert.equal(await page.evaluate(() => window._triggerLoginSuccess ?? null), null);
        assert.equal(await page.evaluate(() => window.__loginDocument), 'original');
      }, mode === 'reduced' ? { reducedMotion: 'reduce' } : {});
    }
    await scenario('destino interno se decodifica una sola vez', async page => {
      const target = '#/app/perfil?tag=%25';
      await login(page, tutor, target);
      await expect(page).toHaveURL(base + '/' + target);
      await expect(page.locator('.main')).toContainText(tutor.email);
    });
    await scenario('destino externo vuelve al perfil', async page => {
      await login(page, tutor, 'https://example.com/');
      await profile(page, tutor);
    });
    await scenario('Tutor conserva institución al abrir inscripción', async page => {
      await login(page, tutor, '#/app/inscripciones/nueva?inst=i001');
      await expect(page).toHaveURL(/#\/app\/inscripciones\/nueva\?inst=i001$/);
      await expect(page.locator('.stepper')).toBeVisible();
    });
    await scenario('Personal no recibe destino exclusivo de Tutor', async page => {
      const staff = db.users.find(u => u.id === 'u003');
      await login(page, staff, '#/app/inscripciones/nueva?inst=i001');
      await profile(page, staff);
    });
    await scenario('MFA: sesión solo después de verificar código', async (page, context) => {
      const user = db.users.find(u => u.id === 'u008');
      const result = await login(page, user, '#/app/inscripciones/nueva?inst=i001');
      assert.equal(result.status, 'mfa_required');
      await page.locator('#mfa-form').waitFor();
      assert.equal((await (await context.request.get(`${base}/api/auth/me`)).json()).user, null);
      for (let i = 0; i < 6; i++) await page.locator(`.otp[data-i="${i}"]`).fill(result.devCode[i]);
      await page.locator('#mfa-form button[type=submit]').click();
      await expect(page).toHaveURL(/#\/app\/inscripciones\/nueva\?inst=i001$/);
      await expect(page.locator('.stepper')).toBeVisible();
      assert.equal((await (await context.request.get(`${base}/api/auth/me`)).json()).user.id, user.id);
      await page.reload();
      await expect(page.locator('.stepper')).toBeVisible();
      assert.equal((await (await context.request.get(`${base}/api/auth/me`)).json()).user.id, user.id);
    });
    await scenario('cambio obligatorio: sesión solo después de cambiar contraseña', async (page, context) => {
      const user = db.users.find(u => u.id === 'u005');
      assert.equal((await login(page, user, '#/app/inscripciones/nueva?inst=i001')).status, 'must_change_password');
      await page.locator('#fc-form').waitFor();
      assert.equal((await (await context.request.get(`${base}/api/auth/me`)).json()).user, null);
      await page.locator('[name=currentPassword]').fill(password);
      await page.locator('[name=newPassword]').fill('NuevaClave#2026');
      await page.locator('[name=confirmNewPassword]').fill('NuevaClave#2026');
      await page.locator('#fc-form button[type=submit]').click();
      await profile(page, user);
      await page.reload();
      await profile(page, user);
    });
    await scenario('sesión vencida durante wizard vuelve a login y recupera borrador sin abandonar',async(page,context)=>{
      await login(page,tutor,'#/app/inscripciones/nueva?inst=i001');
      await page.locator('#student-sel').waitFor();await page.locator('#step-form button[type=submit]').click();
      const saved=page.waitForResponse(r=>r.url().includes('/api/drafts/')&&r.request().method()==='PUT');
      await page.locator('[name=tutorName]').fill('Contacto recuperable');await saved;
      const draft=await page.evaluate(()=>localStorage.getItem('enrollment_draft_id'));
      await context.request.post(base+'/api/auth/logout');await page.locator('[name=tutorPhone]').fill('8095550999');
      await expect(page.locator('#login-form')).toBeVisible();await expect(page.getByRole('dialog')).toHaveCount(0);
      assert.equal(await page.evaluate(()=>localStorage.getItem('enrollment_draft_id')),draft);
      await page.locator('[name=email]').fill(tutor.email);await page.locator('[name=password]').fill(password);await page.locator('#login-form button[type=submit]').click();await profile(page,tutor);
      await page.evaluate(()=>location.hash='#/app/inscripciones/nueva?inst=i001');await expect(page.locator('[name=tutorName]')).toHaveValue('Contacto recuperable');assert.equal(await page.evaluate(()=>localStorage.getItem('enrollment_draft_id')),draft);
    });
    await scenario('reinicio real invalida sesión y recupera navegación sin recarga', async page => {
      await login(page);
      await profile(page, tutor);
      const exit = once(server, 'exit'); server.kill(); await exit;
      server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), DB_PATH: dbPath }, stdio: ['ignore','pipe','pipe'] });
      await new Promise((resolve,reject) => {
        server.stdout.on('data', c => { if (String(c).includes('corriendo en')) resolve(); });
        server.once('error',reject); server.stderr.on('data', c => reject(new Error(String(c))));
      });
      await page.evaluate(() => { location.hash = '#/app/inscripciones'; });
      await expect(page.locator('#login-form')).toBeVisible();
      await expect(page).toHaveURL(/#\/login$/);
      await page.evaluate(() => { location.hash = '#/'; });
      await expect(page.locator('#search-form')).toBeVisible();
      await page.goto(base + '/#/login'); await page.locator('[name=email]').fill(tutor.email); await page.locator('[name=password]').fill(password); await page.locator('#login-form button[type=submit]').click(); await profile(page,tutor);
    });
  } finally {
    if (browser) await browser.close();
    const exit = once(server, 'exit');
    server.kill();
    if (server.exitCode === null && server.signalCode === null) await exit;
    for (let i = 0; i < pendingPaths.length; i++) assert.deepEqual(fs.readFileSync(path.join(root, pendingPaths[i])), originals[i]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
