(function () {
  'use strict';

  const root = document.getElementById('root');
  const state = { user: null, authChecked: false, setupNeeded: false, pendingMfa: null };

  // ---------------- helpers ----------------
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function initials(name) {
    return (name || '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
  }
  function qs(sel, el) { return (el || document).querySelector(sel); }
  function qsa(sel, el) { return Array.from((el || document).querySelectorAll(sel)); }

  async function api(path, opts) {
    opts = opts || {};
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const err = new Error(data.error || (data.errors && data.errors[0]) || 'Ocurrió un error.');
      err.errors = data.errors || (data.error ? [data.error] : ['Ocurrió un error.']);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  function fieldErrorsBlock(errors) {
    if (!errors || !errors.length) return '';
    return `<div class="field-errors"><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
  }

  const ROLE_STYLE = {
    'Tutor': { bg: '#eef1f4', fg: '#46505c' },
    'Personal de institución': { bg: '#e1f2f0', fg: '#1c7c72' },
    'Administrador': { bg: '#af112b', fg: '#ffffff' },
    'Soporte': { bg: '#fbf0da', fg: '#8a6414' },
    'Auditoría': { bg: '#efe7fb', fg: '#5b3fa0' },
  };
  const INST_TIPO_STYLE = {
    'Público': { bg: '#e1f2f0', fg: '#1c7c72' },
    'Privado': { bg: '#eef1f4', fg: '#46505c' },
  };
  const PROVINCIAS = [
    'Azua', 'Bahoruco', 'Barahona', 'Dajabón', 'Distrito Nacional', 'Duarte', 'Elías Piña', 'El Seibo',
    'Espaillat', 'Hato Mayor', 'Hermanas Mirabal', 'Independencia', 'La Altagracia', 'La Romana', 'La Vega',
    'María Trinidad Sánchez', 'Monseñor Nouel', 'Monte Cristi', 'Monte Plata', 'Pedernales', 'Peravia',
    'Puerto Plata', 'Samaná', 'San Cristóbal', 'San José de Ocoa', 'San Juan', 'San Pedro de Macorís',
    'Sánchez Ramírez', 'Santiago', 'Santiago Rodríguez', 'Santo Domingo', 'Valverde',
  ];
  const AVATAR_PALETTE = [
    ['#f6dde2', '#8a1330'], ['#e1ecf7', '#2a5c96'], ['#e6f2e0', '#2f6d24'],
    ['#fbeadb', '#93591a'], ['#eee1f7', '#6a3a97'], ['#deeef2', '#1f6d7c'],
  ];
  function avatarColor(i) { return AVATAR_PALETTE[i % AVATAR_PALETTE.length]; }

  const ICONS = {
    users: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="10" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4 12 14.01l-3-3"/></svg>',
    building: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 21v-4h6v4"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1"/></svg>',
    shield: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"/></svg>',
    search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    bell: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
    back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>',
  };

  // ---------------- router ----------------
  function navigate(hash) { window.location.hash = hash; }

  function parseHash() {
    const h = window.location.hash.replace(/^#/, '') || '/login';
    const [pathPart, queryPart] = h.split('?');
    const segs = pathPart.split('/').filter(Boolean);
    const query = {};
    if (queryPart) {
      queryPart.split('&').forEach((kv) => {
        const [k, v] = kv.split('=');
        query[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }
    return { segs, query };
  }

  async function ensureAuth() {
    if (state.authChecked) return;
    try {
      const { user } = await api('/auth/me');
      state.user = user || null;
    } catch (e) { state.user = null; }
    try {
      const { needed } = await api('/auth/setup-needed');
      state.setupNeeded = needed;
    } catch (e) { state.setupNeeded = false; }
    state.authChecked = true;
  }

  async function router() {
    root.innerHTML = '<div class="loading">Cargando…</div>';
    await ensureAuth();
    const { segs, query } = parseHash();

    if (state.setupNeeded && segs[0] !== 'setup') return navigate('#/setup');
    if (!state.setupNeeded && segs[0] === 'setup') return navigate('#/login');

    const publicRoutes = ['login', 'mfa', 'force-change', 'register', 'forgot', 'reset', 'setup'];
    if (!publicRoutes.includes(segs[0])) {
      if (!state.user) return navigate('#/login');
    } else if (state.user && segs[0] !== 'setup') {
      return navigate('#/app/perfil');
    }

    switch (segs[0]) {
      case 'setup': return viewSetup();
      case 'login': return viewLogin();
      case 'mfa': return viewMfa();
      case 'force-change': return viewForceChange();
      case 'register': return viewRegister();
      case 'forgot': return viewForgot();
      case 'reset': return viewReset(query.token || '');
      case 'app': return viewApp(segs.slice(1), query);
      default: return navigate('#/login');
    }
  }

  window.addEventListener('hashchange', router);
  window.addEventListener('DOMContentLoaded', router);

  // ---------------- shared auth chrome ----------------
  function authShell({ withHero, headline, lede, badge, body }) {
    root.innerHTML = `
      <div class="auth-stage ${withHero ? 'with-hero' : ''}">
        ${withHero ? `
        <div class="hero">
          <div class="arches">${'<div class="arch"></div>'.repeat(6)}</div>
          <div class="hero-glow"></div>
          <div class="medallion-wrap"><img class="medallion" src="/assets/icon-mark.png" alt=""></div>
          <div class="brand-row"><img src="/assets/icon-mark.png" alt="Inscolar"><span class="wordmark">Inscolar</span></div>
          <div class="headline-block">
            <h1>${headline}</h1>
            <p>${lede}</p>
          </div>
          <div class="footer-note">Ministerio de Educación &middot; República Dominicana<br>Soporte: (809) 555-0110</div>
        </div>
        <div class="panel"><div class="card">${body}</div></div>
        ` : `
        <div class="card wide">
          <div class="plain-brand"><img src="/assets/icon-mark.png" alt="Inscolar"><span>Inscolar</span></div>
          ${badge ? `<span class="badge-chip">${badge}</span>` : ''}
          ${body}
        </div>
        `}
      </div>
    `;
  }

  // ---------------- HU006 login ----------------
  function viewLogin() {
    authShell({
      withHero: true,
      headline: 'Inscripción escolar, en un solo lugar',
      lede: 'Tutores, personal de institución, soporte y auditoría acceden al sistema con la misma puerta de entrada.',
      body: `
        <p class="eyebrow">Iniciar sesión</p>
        <p class="lede">Ingresa con tu correo y contraseña.</p>
        <div id="err"></div>
        <form id="login-form">
          <div class="field"><label>Correo electrónico</label><input type="email" name="email" required></div>
          <div class="field">
            <div class="row-label"><label>Contraseña</label><button type="button" class="link" id="toggle-pw">Mostrar</button></div>
            <input type="password" name="password" required>
          </div>
          <div class="row-between">
            <label class="checkbox"><input type="checkbox" checked> Recordar usuario</label>
            <a href="#/forgot">Recuperar contraseña</a>
          </div>
          <button class="btn btn-primary btn-block" type="submit">Iniciar sesión</button>
        </form>
        <div class="divider">O BIEN</div>
        <a href="#/register"><button class="btn btn-secondary btn-block" type="button">Registrarme como padre o tutor</button></a>
      `,
    });

    qs('#toggle-pw').addEventListener('click', () => {
      const inp = qs('input[name=password]');
      const showing = inp.type === 'text';
      inp.type = showing ? 'password' : 'text';
      qs('#toggle-pw').textContent = showing ? 'Mostrar' : 'Ocultar';
    });

    qs('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      try {
        const data = await api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password') } });
        if (data.status === 'mfa_required') {
          state.pendingMfa = data;
          navigate('#/mfa');
        } else if (data.status === 'must_change_password') {
          navigate('#/force-change');
        } else {
          state.user = data.user;
          navigate('#/app/perfil');
        }
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors);
      }
    });
  }

  // ---------------- HU009 MFA ----------------
  function viewMfa() {
    const pending = state.pendingMfa || {};
    authShell({
      withHero: false,
      body: `
        <p class="eyebrow">Verificación en dos pasos</p>
        <p class="lede">Ingresa el código de 6 dígitos enviado a <strong>${escapeHtml(pending.maskedEmail || 'tu correo')}</strong>.</p>
        ${pending.devCode ? `<div class="notice">Modo de prueba (sin envío real de correo): tu código es <strong>${escapeHtml(pending.devCode)}</strong></div>` : ''}
        <div id="err"></div>
        <form id="mfa-form">
          <div class="otp-row">
            ${[0, 1, 2, 3, 4, 5].map((i) => `<input type="text" maxlength="1" class="otp" data-i="${i}" inputmode="numeric">`).join('')}
          </div>
          <label class="checkbox" style="margin-bottom:18px"><input type="checkbox" checked> Recordar este dispositivo por 30 días</label>
          <button class="btn btn-primary btn-block" type="submit">Verificar código</button>
        </form>
        <button class="btn btn-ghost btn-small" id="resend" style="width:100%; margin-top:10px;">Reenviar código</button>
      `,
    });

    const otps = qsa('.otp');
    otps[0] && otps[0].focus();
    otps.forEach((inp, i) => {
      inp.addEventListener('input', () => {
        inp.value = inp.value.replace(/[^0-9]/g, '');
        if (inp.value && otps[i + 1]) otps[i + 1].focus();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !inp.value && otps[i - 1]) otps[i - 1].focus();
      });
    });

    qs('#resend').addEventListener('click', async () => {
      try {
        const data = await api('/auth/mfa/resend', { method: 'POST' });
        toast('Código reenviado (modo de prueba: ' + data.devCode + ')', 'ok');
      } catch (err) { toast(err.message, 'err'); }
    });

    qs('#mfa-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = otps.map((o) => o.value).join('');
      qs('#err').innerHTML = '';
      try {
        const data = await api('/auth/mfa/verify', { method: 'POST', body: { code } });
        state.user = data.user;
        state.pendingMfa = null;
        navigate('#/app/perfil');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors);
      }
    });
  }

  // ---------------- HU002/HU016 cambio obligatorio ----------------
  function viewForceChange() {
    authShell({
      withHero: false,
      body: `
        <div class="notice">Debes crear una nueva contraseña para continuar.</div>
        <p class="eyebrow">Crear nueva contraseña</p>
        <div id="err"></div>
        <form id="fc-form">
          <div class="field"><label>Contraseña temporal</label><input type="password" name="currentPassword" required></div>
          <div class="field"><label>Nueva contraseña</label><input type="password" name="newPassword" required></div>
          <p class="help" style="margin-top:-10px; margin-bottom:16px;">8 a 15 caracteres. No puede coincidir con las últimas 5 contraseñas.</p>
          <div class="field"><label>Confirmar nueva contraseña</label><input type="password" name="confirmNewPassword" required></div>
          <button class="btn btn-primary btn-block" type="submit">Cambiar contraseña</button>
        </form>
      `,
    });
    qs('#fc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      try {
        const data = await api('/auth/force-change', {
          method: 'POST',
          body: { currentPassword: fd.get('currentPassword'), newPassword: fd.get('newPassword'), confirmNewPassword: fd.get('confirmNewPassword') },
        });
        state.user = data.user;
        toast('Contraseña actualizada.', 'ok');
        navigate('#/app/perfil');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors);
      }
    });
  }

  // ---------------- HU005 registro tutor ----------------
  function viewRegister() {
    authShell({
      withHero: false,
      body: `
        <p class="eyebrow">Crear cuenta de tutor</p>
        <p class="lede">Los datos deben coincidir con tu documento de identidad para poder inscribir estudiantes.</p>
        <div id="err"></div>
        <form id="reg-form">
          <div class="two-col">
            <div class="field"><label>Nombre</label><input type="text" name="nombre" required></div>
            <div class="field"><label>Apellido</label><input type="text" name="apellido" required></div>
          </div>
          <div class="two-col">
            <div class="field"><label>Cédula</label><input type="text" name="cedula" maxlength="11" placeholder="00112345678" required></div>
            <div class="field"><label>Teléfono</label><input type="text" name="telefono" maxlength="10" placeholder="8092148890" required></div>
          </div>
          <div class="field"><label>Correo electrónico</label><input type="email" name="email" required></div>
          <div class="two-col">
            <div class="field"><label>Contraseña</label><input type="password" name="password" required></div>
            <div class="field"><label>Confirmar contraseña</label><input type="password" name="confirmPassword" required></div>
          </div>
          <button class="btn btn-primary btn-block" type="submit">Registrar</button>
        </form>
        <p style="text-align:center; margin-top:16px; font-size:.85rem;">¿Ya tienes cuenta? <a href="#/login">Iniciar sesión</a></p>
      `,
    });
    qs('#reg-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      try {
        const data = await api('/auth/register', {
          method: 'POST',
          body: Object.fromEntries(fd.entries()),
        });
        state.user = data.user;
        toast('Cuenta creada. ¡Bienvenido!', 'ok');
        navigate('#/app/perfil');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors);
      }
    });
  }

  // ---------------- HU007 recuperar contraseña ----------------
  function viewForgot() {
    authShell({
      withHero: false,
      body: `
        <p class="eyebrow">Recuperar contraseña</p>
        <p class="lede">Te enviaremos un enlace de restablecimiento válido por 15 minutos.</p>
        <div id="err"></div>
        <div id="result"></div>
        <form id="forgot-form">
          <div class="field"><label>Correo electrónico</label><input type="email" name="email" required></div>
          <button class="btn btn-primary btn-block" type="submit">Enviar correo de recuperación</button>
        </form>
        <p style="text-align:center; margin-top:16px;"><a href="#/login">Regresar al login</a></p>
      `,
    });
    qs('#forgot-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#err').innerHTML = ''; qs('#result').innerHTML = '';
      try {
        const data = await api('/auth/forgot', { method: 'POST', body: { email: fd.get('email') } });
        qs('#result').innerHTML = `<div class="notice ok">Enviamos un enlace a tu correo. Intentos usados: ${data.attemptsUsed} de ${data.attemptsMax}.</div>` +
          (data.devToken ? `<div class="notice">Modo de prueba (sin envío real de correo): <a href="#/reset?token=${encodeURIComponent(data.devToken)}">abrir enlace de recuperación</a></div>` : '');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
  }

  function viewReset(token) {
    authShell({
      withHero: false,
      body: `
        <p class="eyebrow">Crear nueva contraseña</p>
        <p class="lede">Define una nueva contraseña para tu cuenta.</p>
        <div id="err"></div>
        <form id="reset-form">
          <div class="field"><label>Nueva contraseña</label><input type="password" name="newPassword" required></div>
          <p class="help" style="margin-top:-10px; margin-bottom:16px;">8 a 15 caracteres. No puede coincidir con las últimas 5 contraseñas.</p>
          <div class="field"><label>Confirmar nueva contraseña</label><input type="password" name="confirmNewPassword" required></div>
          <button class="btn btn-primary btn-block" type="submit">Cambiar contraseña</button>
        </form>
      `,
    });
    qs('#reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      try {
        await api('/auth/reset', { method: 'POST', body: { token, newPassword: fd.get('newPassword'), confirmNewPassword: fd.get('confirmNewPassword') } });
        toast('Contraseña actualizada. Ya puedes iniciar sesión.', 'ok');
        navigate('#/login');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
  }

  // ---------------- HU001 configuración inicial ----------------
  function viewSetup() {
    authShell({
      withHero: false,
      badge: 'Primera ejecución',
      body: `
        <p class="eyebrow">Configuración inicial del sistema</p>
        <p class="lede">No existe ningún administrador registrado. Crea la cuenta administrativa principal para habilitar el acceso al sistema.</p>
        <div id="err"></div>
        <form id="setup-form">
          <div class="field"><label>Nombre completo</label><input type="text" name="nombre" required></div>
          <div class="field"><label>Correo electrónico</label><input type="email" name="email" required></div>
          <div class="field"><label>Contraseña</label><input type="password" name="password" required></div>
          <p class="help" style="margin-top:-10px; margin-bottom:16px;">8 a 25 caracteres · alfanumérica · al menos un número</p>
          <div class="field"><label>Confirmar contraseña</label><input type="password" name="confirmPassword" required></div>
          <button class="btn btn-primary btn-block" type="submit">Crear administrador inicial</button>
        </form>
        <p class="help" style="margin-top:16px;">Al completar este paso el formulario queda deshabilitado de forma permanente. Los administradores posteriores se crean desde el panel de administración.</p>
      `,
    });
    qs('#setup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      try {
        const data = await api('/auth/setup', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        state.user = data.user;
        state.setupNeeded = false;
        navigate('#/app/perfil');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
  }

  // ================= APP SHELL (autenticado) =================
  const ADMIN_ROLES = ['Administrador', 'Soporte'];

  function isAdmin() { return state.user && ADMIN_ROLES.includes(state.user.role); }

  async function viewApp(segs, query) {
    const section = segs[0] || 'perfil';
    if (['usuarios', 'instituciones', 'notificaciones', 'analiticas'].includes(section) && !isAdmin()) {
      root.innerHTML = appShellWrap('<div class="empty-state">No tienes permiso para ver esta sección.</div>', 'perfil');
      return;
    }

    let unread = 0;
    if (isAdmin()) {
      try { const n = await api('/notifications'); unread = n.unreadCount; } catch (e) {}
    }

    let contentHtml = '<div class="loading">Cargando…</div>';
    root.innerHTML = appShellWrap(contentHtml, section, unread);
    bindShellEvents();

    try {
      if (section === 'perfil' && segs[1] === 'editar') await renderPerfilEditar();
      else if (section === 'perfil') await renderPerfil();
      else if (section === 'seguridad') await renderSeguridad();
      else if (section === 'usuarios' && segs[1] === 'nuevo') await renderUsuarioForm(null);
      else if (section === 'usuarios' && segs[2] === 'editar') await renderUsuarioForm(segs[1]);
      else if (section === 'usuarios') await renderUsuarios(query);
      else if (section === 'instituciones' && segs[1] === 'nueva') await renderInstitucionForm(null);
      else if (section === 'instituciones' && segs[2] === 'editar') await renderInstitucionForm(segs[1]);
      else if (section === 'instituciones') await renderInstituciones(query);
      else if (section === 'notificaciones') await renderNotificaciones();
      else if (section === 'analiticas') await renderAnaliticas();
      else qs('.main').innerHTML = '<div class="empty-state">Sección no encontrada.</div>';
    } catch (err) {
      qs('.main').innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  function appShellWrap(innerMain, activeSection, unread) {
    const u = state.user || {};
    const [avBg, avFg] = avatarColor(0);
    const admin = isAdmin();
    return `
      <div class="app">
        <div class="topbar">
          <div class="brand"><img class="badge-logo" src="/assets/icon-mark.png" alt="Inscolar"><span class="stack"><div class="b1">Inscolar</div><div class="b2">Portal institucional</div></span></div>
          <div class="search">${ICONS.search}<input placeholder="Buscar en el sistema..." disabled></div>
          <div class="topbar-right">
            ${admin ? `<button class="bell" id="bell-btn">${ICONS.bell}${unread ? `<span class="dot">${unread}</span>` : ''}</button>` : ''}
            <span class="who"><span class="avatar" style="background:${avBg};color:${avFg}">${initials(u.nombre)}</span><span class="stack"><div class="w1">${escapeHtml(u.nombre || '')}</div><div class="w2">${escapeHtml(u.role || '')}</div></span></span>
            <button class="logout" id="logout-btn">Cerrar sesión</button>
          </div>
        </div>
        <div class="body">
          <div class="sidebar">
            ${admin ? `
            <div class="sec-label">Módulos</div>
            <button class="nav-item ${activeSection === 'usuarios' ? 'active' : ''}" data-nav="#/app/usuarios">Usuarios</button>
            <button class="nav-item ${activeSection === 'instituciones' ? 'active' : ''}" data-nav="#/app/instituciones">Instituciones</button>
            <button class="nav-item ${activeSection === 'notificaciones' ? 'active' : ''}" data-nav="#/app/notificaciones">Notificaciones</button>
            <button class="nav-item ${activeSection === 'analiticas' ? 'active' : ''}" data-nav="#/app/analiticas">Analíticas</button>
            ` : ''}
            <div class="sec-label">Mi cuenta</div>
            <button class="nav-item ${activeSection === 'perfil' ? 'active' : ''}" data-nav="#/app/perfil">Mi perfil</button>
            <button class="nav-item ${activeSection === 'seguridad' ? 'active' : ''}" data-nav="#/app/seguridad">Seguridad</button>
            <div class="sidebar-footer">v0.4 · Ambiente de pruebas</div>
          </div>
          <div class="main">${innerMain}</div>
        </div>
      </div>
    `;
  }

  function bindShellEvents() {
    qsa('[data-nav]').forEach((btn) => btn.addEventListener('click', () => navigate(btn.getAttribute('data-nav'))));
    const logoutBtn = qs('#logout-btn');
    logoutBtn && logoutBtn.addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' });
      state.user = null;
      navigate('#/login');
    });
    const bellBtn = qs('#bell-btn');
    bellBtn && bellBtn.addEventListener('click', () => navigate('#/app/notificaciones'));
  }

  // ---------------- HU011/HU012 perfil ----------------
  async function renderPerfil() {
    const { user } = await api('/users/me/profile');
    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Perfil de usuario</h2><div class="sub">Datos personales asociados a tu cuenta.</div></div>
      <button class="btn btn-primary btn-small" style="width:auto; padding:9px 18px;" data-nav="#/app/perfil/editar">Editar</button></div>
      <div class="chart-row" style="grid-template-columns: 2fr 1fr;">
        <div class="chart-card">
          <div style="display:flex; align-items:center; gap:14px; margin-bottom:20px;">
            <span class="avatar" style="width:52px;height:52px;font-size:1rem;background:${avatarColor(0)[0]};color:${avatarColor(0)[1]}">${initials(user.nombre)}</span>
            <div><div style="font-weight:700; font-size:1.05rem;">${escapeHtml(user.nombre)}</div><div style="color:var(--ink-soft); font-size:.85rem;">${escapeHtml(user.email)} · ${escapeHtml(user.role)}${user.institucionNombre ? ' · ' + escapeHtml(user.institucionNombre) : ''}</div></div>
          </div>
          <div class="two-col">
            <div><div class="help">SEXO</div><div>${escapeHtml(user.sexo || '—')}</div></div>
            <div><div class="help">ESTADO</div><div>${escapeHtml(user.estado)}</div></div>
            <div><div class="help">TELÉFONO FIJO</div><div>${escapeHtml(user.telefonoFijo || 'No registrado')}</div></div>
            <div><div class="help">TELÉFONO MÓVIL</div><div>${escapeHtml(user.telefonoMovil || 'No registrado')}</div></div>
          </div>
        </div>
        <div class="chart-card">
          <h3>Seguridad de la cuenta</h3>
          <p class="help">Contraseña <a href="#/app/seguridad">Cambiar</a></p>
          <p class="help">Verificación en dos pasos: ${user.mfaEnabled ? '<strong style="color:var(--green)">Activada</strong>' : 'Desactivada'} <a href="#/app/seguridad">Configurar</a></p>
        </div>
      </div>
    `;
    bindShellEvents();
  }

  async function renderPerfilEditar() {
    const { user } = await api('/users/me/profile');
    const digits = (s) => (s || '').replace(/[^0-9]/g, '');
    qs('.main').innerHTML = `
      <div class="page-head"><h2>Editar perfil</h2></div>
      <div class="chart-card" style="max-width:560px;">
        <div id="err"></div>
        <form id="perfil-form">
          <div class="field"><label>Nombre completo</label><input type="text" value="${escapeHtml(user.nombre)}" disabled></div>
          <div class="two-col">
            <div class="field"><label>Teléfono fijo</label><input type="text" name="telefonoFijo" maxlength="10" value="${escapeHtml(digits(user.telefonoFijo))}" placeholder="8095551234"></div>
            <div class="field"><label>Teléfono móvil</label><input type="text" name="telefonoMovil" maxlength="10" value="${escapeHtml(digits(user.telefonoMovil))}" placeholder="8095551234"></div>
          </div>
          <div class="field">
            <label>Sexo</label>
            <select name="sexo">
              <option value="" ${!user.sexo ? 'selected' : ''}>Sin especificar</option>
              <option value="Femenino" ${user.sexo === 'Femenino' ? 'selected' : ''}>Femenino</option>
              <option value="Masculino" ${user.sexo === 'Masculino' ? 'selected' : ''}>Masculino</option>
            </select>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" style="width:auto; padding:12px 22px;" type="submit">Guardar información</button>
            <button class="btn btn-ghost" style="width:auto; padding:12px 22px;" type="button" data-nav="#/app/perfil">Cancelar</button>
          </div>
        </form>
      </div>
    `;
    bindShellEvents();
    qs('#perfil-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      try {
        await api('/users/me/profile', { method: 'PUT', body: { telefonoFijo: fd.get('telefonoFijo'), telefonoMovil: fd.get('telefonoMovil'), sexo: fd.get('sexo') } });
        toast('Perfil actualizado.', 'ok');
        navigate('#/app/perfil');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
  }

  // ---------------- HU010/HU008 seguridad ----------------
  async function renderSeguridad() {
    const mfa = await api('/users/me/mfa');
    qs('.main').innerHTML = `
      <div class="page-head"><h2>Seguridad</h2></div>
      <div class="chart-row" style="grid-template-columns: 1fr 1fr; align-items:start;">
        <div class="chart-card">
          <h3>Cambiar contraseña</h3>
          <div id="pw-err"></div>
          <form id="pw-form">
            <div class="field"><label>Contraseña actual</label><input type="password" name="currentPassword" required></div>
            <div class="field"><label>Contraseña nueva</label><input type="password" name="newPassword" required></div>
            <p class="help" style="margin-top:-10px; margin-bottom:16px;">8 a 15 caracteres. No puede repetir ninguna de las últimas 5.</p>
            <div class="field"><label>Confirmar contraseña nueva</label><input type="password" name="confirmNewPassword" required></div>
            <button class="btn btn-primary" style="width:auto; padding:11px 20px;" type="submit">Cambiar</button>
          </form>
        </div>
        <div class="chart-card">
          <h3>Verificación en dos pasos (MFA)</h3>
          <p class="help" style="margin-bottom:16px;">Al iniciar sesión desde un dispositivo no reconocido, el sistema pedirá un código de verificación adicional.</p>
          ${mfa.enabled
            ? `<div class="notice ok">MFA activado · método: ${escapeHtml(mfa.method === 'app' ? 'App autenticadora' : 'Correo electrónico')}</div>
               <button class="btn btn-secondary" style="width:auto; padding:10px 18px;" id="mfa-off">Desactivar MFA</button>`
            : `<div id="mfa-flow"><button class="btn btn-primary" style="width:auto; padding:10px 18px;" id="mfa-start">Activar MFA</button></div>`
          }
        </div>
      </div>
    `;
    bindShellEvents();

    qs('#pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#pw-err').innerHTML = '';
      try {
        await api('/users/me/password', { method: 'POST', body: { currentPassword: fd.get('currentPassword'), newPassword: fd.get('newPassword'), confirmNewPassword: fd.get('confirmNewPassword') } });
        toast('Contraseña cambiada.', 'ok');
        e.target.reset();
      } catch (err) {
        qs('#pw-err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });

    const offBtn = qs('#mfa-off');
    offBtn && offBtn.addEventListener('click', async () => {
      await api('/users/me/mfa/disable', { method: 'POST' });
      toast('MFA desactivado.', 'ok');
      renderSeguridad();
    });

    const startBtn = qs('#mfa-start');
    startBtn && startBtn.addEventListener('click', async () => {
      const data = await api('/users/me/mfa/start', { method: 'POST', body: { method: 'correo' } });
      qs('#mfa-flow').innerHTML = `
        <div class="notice">Modo de prueba (sin envío real de correo): tu código es <strong>${data.devCode}</strong></div>
        <div id="mfa-confirm-err"></div>
        <div class="field"><label>Código de verificación</label><input type="text" id="mfa-code" maxlength="6"></div>
        <button class="btn btn-primary" style="width:auto; padding:10px 18px;" id="mfa-confirm">Confirmar y activar</button>
      `;
      qs('#mfa-confirm').addEventListener('click', async () => {
        try {
          await api('/users/me/mfa/confirm', { method: 'POST', body: { code: qs('#mfa-code').value } });
          toast('MFA activado.', 'ok');
          renderSeguridad();
        } catch (err) {
          qs('#mfa-confirm-err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
        }
      });
    });
  }

  // ---------------- HU013/14 listado de usuarios ----------------
  async function renderUsuarios(query) {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.role) params.set('role', query.role);
    if (query.estado) params.set('estado', query.estado);
    const { total, users } = await api('/users?' + params.toString());
    const roles = ['Todos', 'Administrador', 'Soporte', 'Personal de institución', 'Auditoría', 'Tutor'];
    const estados = ['Todos', 'Activo', 'Inactivo'];

    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Usuarios</h2><div class="sub">Administración de cuentas del sistema.</div></div></div>
      <div class="filters">
        <input id="f-q" placeholder="Buscar por nombre o correo..." value="${escapeHtml(query.q || '')}">
        <select id="f-role">${roles.map((r) => `<option ${query.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <select id="f-estado">${estados.map((r) => `<option ${query.estado === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <button class="btn btn-primary spacer" style="width:auto; padding:10px 18px;" data-nav="#/app/usuarios/nuevo">Nuevo usuario</button>
      </div>
      <div class="table-card">
        <table>
          <thead><tr><th>Usuario</th><th>Rol</th><th>Institución</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead>
          <tbody>
            ${users.map((u, i) => {
              const rs = ROLE_STYLE[u.role] || { bg: '#eee', fg: '#333' };
              const [avBg, avFg] = avatarColor(i);
              const active = u.estado === 'Activo';
              return `<tr>
                <td><div class="user-cell"><span class="av" style="background:${avBg};color:${avFg}">${initials(u.nombre)}</span><span><div class="name">${escapeHtml(u.nombre)}</div><div class="mail">${escapeHtml(u.email)}</div></span></div></td>
                <td><span class="pill" style="background:${rs.bg};color:${rs.fg}">${escapeHtml(u.role)}</span></td>
                <td>${escapeHtml(u.institucionNombre || '—')}</td>
                <td><span class="estado-cell"><span class="dot" style="background:${active ? '#2e9e5b' : '#9aa0a6'}"></span>${u.estado}</span></td>
                <td>${fmtDate(u.lastAccess)}</td>
                <td><span class="actions-cell">
                  <button class="neutral" data-edit="${u.id}">Modificar</button>
                  <button class="neutral" data-reset="${u.id}">Resetear</button>
                  <button class="${active ? 'danger' : 'ok'}" data-toggle="${u.id}">${active ? 'Desactivar' : 'Activar'}</button>
                </span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div class="table-footer"><span>Mostrando ${users.length} de ${total} usuarios</span></div>
      </div>
    `;
    bindShellEvents();

    function applyFilters() {
      const p = new URLSearchParams();
      if (qs('#f-q').value) p.set('q', qs('#f-q').value);
      if (qs('#f-role').value !== 'Todos') p.set('role', qs('#f-role').value);
      if (qs('#f-estado').value !== 'Todos') p.set('estado', qs('#f-estado').value);
      navigate('#/app/usuarios?' + p.toString());
    }
    qs('#f-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilters(); });
    qs('#f-role').addEventListener('change', applyFilters);
    qs('#f-estado').addEventListener('change', applyFilters);

    qsa('[data-edit]').forEach((b) => b.addEventListener('click', () => navigate('#/app/usuarios/' + b.dataset.edit + '/editar')));
    qsa('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      await api('/users/' + b.dataset.toggle + '/toggle-estado', { method: 'POST' });
      renderUsuarios(query);
    }));
    qsa('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
      const data = await api('/users/' + b.dataset.reset + '/reset-password', { method: 'POST' });
      alert('Contraseña temporal generada (modo de prueba, sin envío real de correo):\n\n' + data.devTempPassword);
    }));
  }

  // ---------------- HU002-04/HU015 crear/modificar usuario ----------------
  async function renderUsuarioForm(id) {
    const { institutions } = await api('/institutions');
    let editing = null;
    if (id) {
      const { users } = await api('/users');
      editing = users.find((u) => u.id === id);
    }
    const roles = ['Administrador', 'Soporte', 'Personal de institución', 'Auditoría'];
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="#/app/usuarios">${ICONS.back} Volver a usuarios</button>
      <div class="page-head"><h2>${editing ? 'Modificar usuario' : 'Nuevo usuario'}</h2></div>
      <div class="chart-card" style="max-width:560px;">
        <div id="err"></div>
        <form id="user-form">
          <div class="field"><label>Rol</label>
            <select name="role" id="role-select">${roles.map((r) => `<option ${editing && editing.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Nombre completo</label><input type="text" name="nombre" value="${escapeHtml(editing ? editing.nombre : '')}" required></div>
          <div class="field"><label>Correo electrónico</label><input type="email" name="email" value="${escapeHtml(editing ? editing.email : '')}" required></div>
          <div class="field" id="inst-field"><label>Institución vinculada</label>
            <select name="institucionId">${institutions.map((i) => `<option value="${i.id}" ${editing && editing.institucionId === i.id ? 'selected' : ''}>${escapeHtml(i.nombre)} — ${escapeHtml(i.provincia)}</option>`).join('')}</select>
          </div>
          ${!editing ? '<p class="help" style="margin-bottom:16px;">El usuario recibirá una contraseña temporal y deberá cambiarla en su primer inicio de sesión.</p>' : ''}
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" style="width:auto; padding:12px 22px;" type="submit">${editing ? 'Guardar cambios' : 'Crear usuario'}</button>
            <button class="btn btn-ghost" style="width:auto; padding:12px 22px;" type="button" data-nav="#/app/usuarios">Cancelar</button>
          </div>
        </form>
      </div>
    `;
    bindShellEvents();

    function syncInstField() {
      qs('#inst-field').style.display = qs('#role-select').value === 'Personal de institución' ? '' : 'none';
    }
    syncInstField();
    qs('#role-select').addEventListener('change', syncInstField);

    qs('#user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      qs('#err').innerHTML = '';
      try {
        if (editing) {
          await api('/users/' + editing.id, { method: 'PUT', body });
          toast('Usuario actualizado.', 'ok');
        } else {
          const data = await api('/users', { method: 'POST', body });
          alert('Usuario creado. Contraseña temporal (modo de prueba, sin envío real de correo):\n\n' + data.devTempPassword);
        }
        navigate('#/app/usuarios');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
  }

  // ---------------- Instituciones ----------------
  async function renderInstituciones(query) {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.provincia) params.set('provincia', query.provincia);
    if (query.estado) params.set('estado', query.estado);
    const { total, institutions } = await api('/institutions?' + params.toString());
    const provinciasFiltro = ['Todas', ...PROVINCIAS];
    const estados = ['Todos', 'Activo', 'Inactivo'];

    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Instituciones</h2><div class="sub">Centros educativos registrados en el sistema.</div></div></div>
      <div class="filters">
        <input id="f-q" placeholder="Buscar por nombre o distrito..." value="${escapeHtml(query.q || '')}">
        <select id="f-provincia">${provinciasFiltro.map((p) => `<option ${query.provincia === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}</select>
        <select id="f-estado">${estados.map((r) => `<option ${query.estado === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <button class="btn btn-primary spacer" style="width:auto; padding:10px 18px;" data-nav="#/app/instituciones/nueva">Nueva institución</button>
      </div>
      <div class="table-card">
        <table>
          <thead><tr><th>Institución</th><th>Provincia</th><th>Distrito</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${institutions.map((inst) => {
              const ts = INST_TIPO_STYLE[inst.tipo] || { bg: '#eee', fg: '#333' };
              const active = (inst.estado || 'Activo') === 'Activo';
              return `<tr>
                <td><div class="user-cell"><span class="av" style="background:#e1ecf7;color:#2a5c96">${ICONS.building}</span><span><div class="name">${escapeHtml(inst.nombre)}</div><div class="mail">${escapeHtml(inst.direccion || 'Sin dirección registrada')}</div></span></div></td>
                <td>${escapeHtml(inst.provincia)}</td>
                <td>${escapeHtml(inst.distrito)}</td>
                <td><span class="pill" style="background:${ts.bg};color:${ts.fg}">${escapeHtml(inst.tipo)}</span></td>
                <td><span class="estado-cell"><span class="dot" style="background:${active ? '#2e9e5b' : '#9aa0a6'}"></span>${inst.estado || 'Activo'}</span></td>
                <td><span class="actions-cell">
                  <button class="neutral" data-edit="${inst.id}">Modificar</button>
                  <button class="${active ? 'danger' : 'ok'}" data-toggle="${inst.id}">${active ? 'Desactivar' : 'Activar'}</button>
                </span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div class="table-footer"><span>Mostrando ${institutions.length} de ${total} instituciones</span></div>
      </div>
    `;
    bindShellEvents();

    function applyFilters() {
      const p = new URLSearchParams();
      if (qs('#f-q').value) p.set('q', qs('#f-q').value);
      if (qs('#f-provincia').value !== 'Todas') p.set('provincia', qs('#f-provincia').value);
      if (qs('#f-estado').value !== 'Todos') p.set('estado', qs('#f-estado').value);
      navigate('#/app/instituciones?' + p.toString());
    }
    qs('#f-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilters(); });
    qs('#f-provincia').addEventListener('change', applyFilters);
    qs('#f-estado').addEventListener('change', applyFilters);

    qsa('[data-edit]').forEach((b) => b.addEventListener('click', () => navigate('#/app/instituciones/' + b.dataset.edit + '/editar')));
    qsa('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
      await api('/institutions/' + b.dataset.toggle + '/toggle-estado', { method: 'POST' });
      renderInstituciones(query);
    }));
  }

  async function renderInstitucionForm(id) {
    let editing = null;
    if (id) {
      const { institutions } = await api('/institutions');
      editing = institutions.find((i) => i.id === id);
    }
    const digits = (s) => (s || '').replace(/[^0-9]/g, '');
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="#/app/instituciones">${ICONS.back} Volver a instituciones</button>
      <div class="page-head"><h2>${editing ? 'Modificar institución' : 'Nueva institución'}</h2></div>
      <div class="chart-card" style="max-width:560px;">
        <div id="err"></div>
        <form id="inst-form">
          <div class="field"><label>Nombre de la institución</label><input type="text" name="nombre" value="${escapeHtml(editing ? editing.nombre : '')}" required></div>
          <div class="two-col">
            <div class="field"><label>Provincia</label>
              <select name="provincia">${PROVINCIAS.map((p) => `<option ${editing && editing.provincia === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Distrito educativo</label><input type="text" name="distrito" placeholder="00-00" value="${escapeHtml(editing ? editing.distrito : '')}" required></div>
          </div>
          <div class="field"><label>Tipo</label>
            <select name="tipo">
              <option value="Público" ${editing && editing.tipo === 'Público' ? 'selected' : ''}>Público</option>
              <option value="Privado" ${editing && editing.tipo === 'Privado' ? 'selected' : ''}>Privado</option>
            </select>
          </div>
          <div class="field"><label>Dirección</label><input type="text" name="direccion" value="${escapeHtml(editing ? editing.direccion || '' : '')}" placeholder="Opcional"></div>
          <div class="field"><label>Teléfono</label><input type="text" name="telefono" maxlength="10" value="${escapeHtml(editing ? digits(editing.telefono) : '')}" placeholder="8095551234 (opcional)"></div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" style="width:auto; padding:12px 22px;" type="submit">${editing ? 'Guardar cambios' : 'Crear institución'}</button>
            <button class="btn btn-ghost" style="width:auto; padding:12px 22px;" type="button" data-nav="#/app/instituciones">Cancelar</button>
          </div>
        </form>
      </div>
    `;
    bindShellEvents();

    qs('#inst-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      qs('#err').innerHTML = '';
      try {
        if (editing) {
          await api('/institutions/' + editing.id, { method: 'PUT', body });
          toast('Institución actualizada.', 'ok');
        } else {
          await api('/institutions', { method: 'POST', body });
          toast('Institución creada.', 'ok');
        }
        navigate('#/app/instituciones');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
  }

  // ---------------- HU017 notificaciones ----------------
  async function renderNotificaciones() {
    const { notifications } = await api('/notifications');
    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Notificaciones</h2><div class="sub">Cambios en cuentas administrativas.</div></div></div>
      <div class="notif-list">
        ${notifications.length ? notifications.map((n) => `
          <div class="notif-item ${n.read ? '' : 'unread'}">
            <div>
              <div class="t1">${escapeHtml(n.campo)} · ${escapeHtml(n.userNombre)}</div>
              <div class="t2">${n.anterior || n.nuevo ? `Campo ${escapeHtml(n.campo)}: ${escapeHtml(n.anterior || '—')} → ${escapeHtml(n.nuevo || '—')}. ` : ''}Realizado por ${escapeHtml(n.actorNombre)}.</div>
              <div class="t3">${fmtDate(n.createdAt)}</div>
            </div>
            ${!n.read ? `<button class="btn btn-ghost btn-small" data-read="${n.id}">Marcar leída</button>` : ''}
          </div>
        `).join('') : '<div class="empty-state">No hay notificaciones.</div>'}
      </div>
    `;
    bindShellEvents();
    qsa('[data-read]').forEach((b) => b.addEventListener('click', async () => {
      await api('/notifications/' + b.dataset.read + '/read', { method: 'POST' });
      renderNotificaciones();
    }));
  }

  // ---------------- Analíticas ----------------
  async function renderAnaliticas() {
    const s = await api('/analytics/summary');
    const maxRol = Math.max(1, ...s.porRol.map((r) => r.count));
    const maxProv = Math.max(1, ...s.porProvincia.map((r) => r.count));

    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Analíticas</h2><div class="sub">Indicadores y tendencias del sistema.</div></div></div>
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-icon">${ICONS.users}</div><div class="kpi-num">${s.totalUsuarios}</div><div class="kpi-label">Usuarios totales</div><div class="kpi-delta">${s.nuevosEstaSemana} esta semana</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.check}</div><div class="kpi-num">${s.activos}</div><div class="kpi-label">Cuentas activas</div><div class="kpi-delta">${Math.round((s.activos / Math.max(1, s.totalUsuarios)) * 100)}% del total</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.building}</div><div class="kpi-num">${s.totalInstituciones}</div><div class="kpi-label">Instituciones vinculadas</div><div class="kpi-delta">${s.porProvincia.length} provincias</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.shield}</div><div class="kpi-num">${s.mfaActivo}</div><div class="kpi-label">Cuentas con MFA activo</div><div class="kpi-delta">${s.tutores} tutores registrados</div></div>
      </div>
      <div class="chart-row">
        <div class="chart-card">
          <h3>Instituciones por provincia</h3>
          ${s.porProvincia.map((r) => `<div class="bar-row"><span class="bar-label">${escapeHtml(r.provincia)}</span><span class="bar-track"><span class="bar-fill" data-w="${(r.count / maxProv) * 100}"></span></span><span class="bar-value">${r.count}</span></div>`).join('')}
        </div>
        <div class="chart-card">
          <h3>Usuarios por rol</h3>
          ${s.porRol.map((r) => `<div class="bar-row"><span class="bar-label">${escapeHtml(r.role)}</span><span class="bar-track"><span class="bar-fill" data-w="${(r.count / maxRol) * 100}"></span></span><span class="bar-value">${r.count}</span></div>`).join('')}
        </div>
      </div>
      <div class="chart-card">
        <h3>Actividad reciente</h3>
        ${s.actividadReciente.length ? s.actividadReciente.map((n) => `<div class="bar-row" style="align-items:flex-start;"><span style="width:150px;flex:none;color:var(--ink-soft);font-size:.76rem;">${fmtDate(n.createdAt)}</span><span style="flex:1;">${escapeHtml(n.campo)} · ${escapeHtml(n.userNombre)} — por ${escapeHtml(n.actorNombre)}</span></div>`).join('') : '<div class="help">Sin actividad reciente.</div>'}
      </div>
    `;
    bindShellEvents();
    requestAnimationFrame(() => { setTimeout(() => qsa('.bar-fill').forEach((el) => { el.style.width = el.dataset.w + '%'; }), 60); });
  }
})();
