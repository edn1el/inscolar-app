(function () {
  'use strict';

  const root = document.getElementById('root');
  const state = { user: null, authChecked: false, setupNeeded: false, pendingMfa: null, pendingRedirect: null };
  let cleanupParticles = () => {};
  let routerVersion = 0;

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
    const fecha = d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const hora = d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' }).replace(/\s/g, '\u00A0');
    return fecha + '\u00A0' + hora;
  }
  function qs(sel, el) { return (el || document).querySelector(sel); }
  function qsa(sel, el) { return Array.from((el || document).querySelectorAll(sel)); }

  document.addEventListener('click', (e) => {
    const panel = document.getElementById('notif-panel');
    const bell = document.getElementById('bell-btn');
    if (!panel || panel.hidden) return;
    if (panel.contains(e.target) || e.target === bell || (bell && bell.contains(e.target))) return;
    panel.hidden = true;
    panel.innerHTML = '';
    bell && bell.setAttribute('aria-expanded', 'false');
  });

  async function api(path, opts) {
    opts = opts || {};
    const isFormData = opts.body instanceof FormData;
    const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let res, data = {};
    try {
      res = await fetch('/api' + path, {
        method: opts.method || 'GET', headers, credentials: 'same-origin',
        signal: controller.signal,
        body: opts.body ? (isFormData ? opts.body : JSON.stringify(opts.body)) : undefined,
      });
      const text = await res.text();
      if (text) data = JSON.parse(text);
    } catch (cause) {
      const err = new Error(cause.name === 'AbortError'
        ? 'El servidor tardó demasiado en responder. Puedes reintentar.'
        : 'No se pudo obtener la respuesta del servidor. Puede estar reiniciándose.');
      err.cause = cause;
      throw err;
    } finally { clearTimeout(timeout); }
    if (!res.ok) {
      if (res.status === 401 && state.user && !path.startsWith('/auth/')) {
        if(window._wizardCleanup)window._wizardCleanup();
        window._navInterceptor=null;
        state.user = null;
        state.authChecked = false;
        navigate('#/login');
      }
      const err = new Error(data.error || (data.errors && data.errors[0]) || 'Ocurrió un error.');
      err.errors = data.errors || (data.error ? [data.error] : ['Ocurrió un error.']);
      err.status = res.status;
      throw err;
    }
    if (opts.method && opts.method !== 'GET' && (/^\/enrollments\//.test(path) || (data.document && data.document.enrollmentId))) enrollmentChanged();
    if (opts.method && opts.method !== 'GET' && (/^\/appointments(?:\/|$)/.test(path) || /appointment-slots$/.test(path))) appointmentChanged();
    return data;
  }

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  function customConfirm(msg, btnAction, onConfirm) {
    showConfirmModal({ title: 'Confirmación', bodyHtml: `<p>${msg}</p>`, confirmText: btnAction || 'Confirmar', onConfirm });
  }

  function fieldErrorsBlock(errors) {
    if (!errors || !errors.length) return '';
    return `<div class="field-errors"><ul>${errors.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
  }

  function showConfirmModal({ title, bodyHtml, confirmText, danger, onConfirm, onClose }) {
    const modal = document.createElement('div');
    modal.className = 'sidebar-backdrop visible';
    modal.style.zIndex = '9999';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    const btnStyle = danger ? 'background:#af112b; border-color:#af112b;' : '';
    modal.innerHTML = `
      <div class="card" style="position:relative; z-index:10000; width: 400px; padding: 24px; text-align: left;">
        <h3 style="margin-top:0;">${escapeHtml(title)}</h3>
        <div style="margin-bottom:20px;">${bodyHtml}</div>
        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button class="btn btn-ghost" style="width:auto;" id="mod-cancel">Cancelar</button>
          <button class="btn btn-primary" style="width:auto; ${btnStyle}" id="mod-confirm">${escapeHtml(confirmText)}</button>
        </div>
      </div>
    `;
    const previousFocus = document.activeElement;
    const card = modal.querySelector('.card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', title);
    card.style.maxWidth = 'calc(100vw - 32px)';
    document.body.appendChild(modal);
    qs('button', modal).focus();

    const escHandler = (e) => {
      if (e.key === 'Tab') {
        const nodes = Array.from(modal.querySelectorAll('button, input, textarea, select, [tabindex]')).filter(n => !n.disabled && n.tabIndex >= 0);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    };
    document.addEventListener('keydown', escHandler);

    function cleanup() {
      document.removeEventListener('keydown', escHandler);
      modal.remove();
      if (onClose) onClose();
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    }

    qs('#mod-cancel', modal).addEventListener('click', cleanup);
    qs('#mod-confirm', modal).addEventListener('click', async () => {
      const btn = qs('#mod-confirm', modal);
      btn.disabled = true;
      btn.textContent = 'Procesando...';
      try {
        const keepOpen = await onConfirm(modal);
        if (!keepOpen) cleanup();
        else { btn.disabled = modal.dataset.obsolete === 'true'; btn.textContent = confirmText; }
      } catch (err) {
        btn.disabled = modal.dataset.obsolete === 'true';
        btn.textContent = confirmText;
        toast(err.message || 'Error', 'err');
      }
    });
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
  const MUNICIPIOS = {
    'Azua': ['Azua de Compostela', 'Estebanía', 'Guayabal', 'Las Charcas', 'Las Yayas de Viajama', 'Padre Las Casas', 'Peralta', 'Pueblo Viejo', 'Sabana Yegua', 'Tábara Arriba'],
    'Bahoruco': ['Neiba', 'Galván', 'Los Ríos', 'Tamayo', 'Villa Jaragua'],
    'Barahona': ['Barahona', 'Cabral', 'El Peñón', 'Enriquillo', 'Fundación', 'Jaquimeyes', 'La Ciénaga', 'Las Salinas', 'Paraíso', 'Polo', 'Vicente Noble'],
    'Dajabón': ['Dajabón', 'El Pino', 'Loma de Cabrera', 'Partido', 'Restauración'],
    'Distrito Nacional': ['Santo Domingo de Guzmán'],
    'Duarte': ['San Francisco de Macorís', 'Arenoso', 'Castillo', 'Eugenio María de Hostos', 'Las Guáranas', 'Pimentel', 'Villa Riva'],
    'Elías Piña': ['Comendador', 'Bánica', 'El Llano', 'Hondo Valle', 'Juan Santiago', 'Pedro Santana'],
    'El Seibo': ['El Seibo', 'Miches'],
    'Espaillat': ['Moca', 'Cayetano Germosén', 'Gaspar Hernández', 'Jamao al Norte'],
    'Hato Mayor': ['Hato Mayor del Rey', 'El Valle', 'Sabana de la Mar'],
    'Hermanas Mirabal': ['Salcedo', 'Tenares', 'Villa Tapia'],
    'Independencia': ['Jimaní', 'Cristóbal', 'Duvergé', 'La Descubierta', 'Mella', 'Postrer Río'],
    'La Altagracia': ['Higüey', 'San Rafael del Yuma'],
    'La Romana': ['La Romana', 'Guaymate', 'Villa Hermosa'],
    'La Vega': ['La Vega', 'Constanza', 'Jarabacoa', 'Jima Abajo'],
    'María Trinidad Sánchez': ['Nagua', 'Cabrera', 'El Factor', 'Río San Juan'],
    'Monseñor Nouel': ['Bonao', 'Maimón', 'Piedra Blanca'],
    'Monte Cristi': ['Monte Cristi', 'Castañuelas', 'Guayubín', 'Las Matas de Santa Cruz', 'Pepillo Salcedo', 'Villa Vásquez'],
    'Monte Plata': ['Monte Plata', 'Bayaguana', 'Peralvillo', 'Sabana Grande de Boyá', 'Yamasá'],
    'Pedernales': ['Pedernales', 'Oviedo'],
    'Peravia': ['Baní', 'Nizao'],
    'Puerto Plata': ['Puerto Plata', 'Altamira', 'Guananico', 'Imbert', 'Los Hidalgos', 'Luperón', 'Sosúa', 'Villa Isabela', 'Villa Montellano'],
    'Samaná': ['Samaná', 'Las Terrenas', 'Sánchez'],
    'San Cristóbal': ['San Cristóbal', 'Bajos de Haina', 'Cambita Garabitos', 'Los Cacaos', 'Sabana Grande de Palenque', 'San Gregorio de Nigua', 'Villa Altagracia', 'Yaguate'],
    'San José de Ocoa': ['San José de Ocoa', 'Rancho Arriba', 'Sabana Larga'],
    'San Juan': ['San Juan de la Maguana', 'Bohechío', 'El Cercado', 'Juan de Herrera', 'Las Matas de Farfán', 'Vallejuelo'],
    'San Pedro de Macorís': ['San Pedro de Macorís', 'Consuelo', 'Guayacanes', 'Quisqueya', 'Ramon Santana', 'San José de los Llanos'],
    'Sánchez Ramírez': ['Cotuí', 'Cevicos', 'Fantino', 'La Mata'],
    'Santiago': ['Santiago de los Caballeros', 'Bisonó', 'Jánico', 'Licey al Medio', 'Puñal', 'Sabana Iglesia', 'San José de las Matas', 'Tamboril', 'Villa Bisonó', 'Villa González'],
    'Santiago Rodríguez': ['Sabaneta', 'Los Almácigos', 'Monción'],
    'Santo Domingo': ['Santo Domingo Este', 'Boca Chica', 'Los Alcarrizos', 'Pedro Brand', 'San Antonio de Guerra', 'Santo Domingo Norte', 'Santo Domingo Oeste'],
    'Valverde': ['Mao', 'Esperanza', 'Laguna Salada']
  };
  const GRADOS = [
    'Pre-Primario', '1ro de Primaria', '2do de Primaria', '3ro de Primaria', '4to de Primaria',
    '5to de Primaria', '6to de Primaria', '1ro de Secundaria', '2do de Secundaria',
    '3ro de Secundaria', '4to de Secundaria', '5to de Secundaria', '6to de Secundaria',
  ];
  function cicloOptions() {
    const y = new Date().getFullYear();
    return [0, 1, 2].map((i) => `${y + i}-${y + i + 1}`);
  }
  const MOTIVOS_CITA = ['Entrega de documentos', 'Entrevista de admisión', 'Seguimiento académico', 'Otro'];
  function drIso(datetimeLocalValue) {
    return datetimeLocalValue ? datetimeLocalValue + ':00-04:00' : '';
  }
  function nowLocalPlus(hours) {
    const d = new Date(Date.now() + hours * 3600000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
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
    camera: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    bell: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>',
    back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="M11 18l-6-6 6-6"/></svg>',
    printer: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    contrast: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor" stroke="none"/></svg>',
    close: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    map: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"></polygon><line x1="9" y1="3" x2="9" y2="18"></line><line x1="15" y1="6" x2="15" y2="21"></line></svg>'
  };

  // ---------------- router ----------------
  function navigate(hash) { 
    if (window._navInterceptor && window._navInterceptor(hash) === false) return;
    window.location.hash = hash; 
  }

  function parseHash() {
    const h = window.location.hash.replace(/^#/, '') || '/login';
    const [pathPart, queryPart] = h.split('?');
    const segs = pathPart.split('/').filter(Boolean);
    const query = {};
    if (queryPart) {
      queryPart.split('&').forEach((kv) => {
        const [k, v] = kv.split('=');
        query[decodeURIComponent(k)] = decodeURIComponent((v || '').replace(/\+/g, ' '));
      });
    }
    return { segs, query };
  }

  async function ensureAuth() {
    if (state.authChecked) return;
    try {
      const { user } = await api('/auth/me');
      state.user = user || null;
    } catch (e) { if (e.status !== 401) throw e; state.user = null; }
    try {
      const { needed } = await api('/auth/setup-needed');
      state.setupNeeded = needed;
    } catch (e) { throw e; }
    state.authChecked = true;
  }

  async function router() {
    if (window._wizardNavigation && window._wizardNavigation() === false) return;
    if (window._enrollmentCleanup) { window._enrollmentCleanup(); window._enrollmentCleanup=null; }
    if (window._wizardCleanup) { window._wizardCleanup(); window._wizardCleanup = null; }
    const version = ++routerVersion;
    cleanupParticles();
    root.innerHTML = '<div class="loading">Cargando…</div>';
    try { await renderRoute(version); }
    catch (err) {
      if (version !== routerVersion) return;
      cleanupParticles();
      root.innerHTML = `<div class="auth-stage"><div class="card" role="alert">
        <h1>No se pudo cargar la página</h1>
        <p>${escapeHtml(err.message || 'Ocurrió un error al cargar la página.')}</p>
        <button class="btn btn-primary" id="retry-route">Reintentar</button>
      </div></div>`;
      qs('#retry-route').addEventListener('click', () => {
        state.authChecked = false;
        router();
      });
      qs('#retry-route').focus();
    }
  }

  async function renderRoute(version) {
    await ensureAuth();
    if (version !== routerVersion) return;
    const { segs, query } = parseHash();
    if (!segs.length) segs.push('');

    if (state.setupNeeded && segs[0] !== 'setup') return navigate('#/setup');
    if (!state.setupNeeded && segs[0] === 'setup') return navigate('#/login');

    const publicRoutes = ['', 'buscar', 'login', 'mfa', 'force-change', 'register', 'forgot', 'reset', 'setup'];
    if (!publicRoutes.includes(segs[0])) {
      if (!state.user) return navigate('#/');
    } else if (state.user && segs[0] !== 'setup' && segs[0] !== '' && segs[0] !== 'buscar') {
      return navigate('#/app/perfil');
    }

    switch (segs[0]) {
      case '':
      case 'buscar': return await viewBuscar(segs.slice(1));
      case 'setup': return await viewSetup();
      case 'login': return await viewLogin(query);
      case 'mfa': return await viewMfa();
      case 'force-change': return await viewForceChange();
      case 'register': return await viewRegister();
      case 'forgot': return await viewForgot();
      case 'reset': return await viewReset(query.token || '');
      case 'app': {
        await viewApp(segs.slice(1), query);
        if (version !== routerVersion) return;
        const title = qs('.main h1, .main h2, .main h3, .topbar-title');
        if (title) { title.tabIndex = -1; title.focus(); }
        return;
      }
      default: return navigate('#/');
    }
  }

  window.addEventListener('hashchange', router);
  window.addEventListener('DOMContentLoaded', router);

  // ---------------- shared auth chrome ----------------
  function authShell({ withHero, headline, lede, badge, body }) {
    cleanupParticles();
    root.innerHTML = `
      <div class="auth-stage ${withHero ? 'with-hero' : ''}">
        ${withHero ? `
        <div class="hero">
          <div class="arches">${'<div class="arch"></div>'.repeat(6)}</div>
          <div class="hero-glow"></div>
          <div class="medallion-wrap"><img class="medallion" src="/assets/brand/inscolar-symbol-white.svg" alt=""></div>
          <div class="brand-row"><img class="brand-logo" src="/assets/brand/inscolar-logo-horizontal-white.svg" alt="Inscolar"></div>
          <div class="headline-block">
            <h1>${headline}</h1>
            <p>${lede}</p>
          </div>
          <div class="footer-note" style="position:relative; z-index:2;">
            <a href="#/buscar" class="hero-public-link" style="margin-bottom:12px; display:inline-flex; align-items:center; gap:6px; color:#fff; text-decoration:none;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
              Explorar instituciones públicas
            </a><br>
            <span class="footer-min-edu">Ministerio de Educación &middot; República Dominicana<br>Soporte: (809) 555-0110</span>
          </div>
          <button id="pause-particles" class="pause-particles-btn" aria-label="Pausar animación" aria-pressed="false">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg> Pausar
          </button>
          <canvas class="particles-canvas" id="particles-bg" aria-hidden="true"></canvas>
        </div>
        <div class="panel"><div class="card">${body}</div></div>
        ` : `
        <div class="card wide">
          <div class="plain-brand"><img class="brand-logo" src="/assets/brand/inscolar-logo-horizontal-primary.svg" alt="Inscolar"></div>
          ${badge ? `<span class="badge-chip">${badge}</span>` : ''}
          ${body}
        </div>
        `}
      </div>
    `;
    if (withHero) {
      // La decoración nunca debe impedir que el formulario se vincule.
      try { initParticles(); } catch (err) { cleanupParticles(); }
    }
  }

  function initParticles() {
    const canvas = document.getElementById('particles-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const btn = document.getElementById('pause-particles');
    let animationId;
    let particles = [];
    let isPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let isSuccess = false;
    let successTarget = { x: 0, y: 0 };
    
    cleanupParticles = () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
      window._triggerLoginSuccess = null;
      cleanupParticles = () => {};
    };

    if (isPaused && btn) btn.style.display = 'none';
    
    function resize() {
      const hero = canvas.closest('.hero');
      if (!hero) return;
      canvas.width = hero.clientWidth;
      canvas.height = hero.clientHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    const numParticles = window.innerWidth < 768 ? 20 : 50;
    for (let i = 0; i < numParticles; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        r: Math.random() * 2.5 + 1.2,
        op: Math.random() * 0.6 + 0.4
      });
    }

    function draw() {
      if (!canvas.closest('body')) return;
      if (isPaused && !isSuccess) return;
      if (document.hidden && !isSuccess) {
        animationId = requestAnimationFrame(draw);
        return;
      }
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      
      particles.forEach(p => {
        if (isSuccess) {
          p.vx += (successTarget.x - p.x) * 0.04;
          p.vy += (successTarget.y - p.y) * 0.04;
          p.vx *= 0.82;
          p.vy *= 0.82;
          p.x += p.vx;
          p.y += p.vy;
          p.op = Math.min(p.op + 0.05, 1); // increase opacity during converge
        } else {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
          if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        }
        ctx.beginPath();
        ctx.globalAlpha = p.op;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });

      if (!isSuccess) {
        ctx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
          for (let j = i + 1; j < particles.length; j++) {
            const dx = particles[i].x - particles[j].x;
            const dy = particles[i].y - particles[j].y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 100) {
              ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 * (1 - dist/100)})`;
              ctx.beginPath();
              ctx.moveTo(particles[i].x, particles[i].y);
              ctx.lineTo(particles[j].x, particles[j].y);
              ctx.stroke();
            }
          }
        }
      }

      animationId = requestAnimationFrame(draw);
    }
    
    draw();
    
    if (btn) {
      btn.addEventListener('click', () => {
        isPaused = !isPaused;
        btn.setAttribute('aria-pressed', isPaused.toString());
        cancelAnimationFrame(animationId);
        if (!isPaused) draw();
        btn.innerHTML = isPaused 
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Reproducir'
          : '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg> Pausar';
      });
    }

    window._triggerLoginSuccess = (destId) => {
      if (!canvas.isConnected || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      isSuccess = true;
      isPaused = false;
      if (btn) btn.style.opacity = '0';
      const destEl = document.querySelector(destId || '.medallion');
      if (destEl) {
        const rect = destEl.getBoundingClientRect();
        const hero = canvas.closest('.hero');
        if (hero) {
          const heroRect = hero.getBoundingClientRect();
          successTarget = {
            x: rect.left - heroRect.left + rect.width / 2,
            y: rect.top - heroRect.top + rect.height / 2
          };
        } else {
          successTarget = { x: canvas.width / 2, y: canvas.height / 2 };
        }
      } else {
        successTarget = { x: canvas.width / 2, y: canvas.height / 2 };
      }
      cancelAnimationFrame(animationId);
      draw();
    };
  }

  // ---------------- HU020-026 búsqueda pública ----------------
  async function viewBuscar(subsegs = []) {
    if (subsegs[0]) {
      // Detalle de institución público
      try {
        const [ { institution: i }, { reports }, { ratings } ] = await Promise.all([
          api('/institutions/' + subsegs[0]),
          api('/institutions/' + subsegs[0] + '/reports'),
          api('/institutions/' + subsegs[0] + '/ratings')
        ]);
        
        const ts = INST_TIPO_STYLE[i.tipo] || { bg: '#eee', fg: '#333' };
        const fondoUrl = i.fondo ? '/api/institutions/' + i.id + '/fondo?v=' + encodeURIComponent(i.fondo.uploadedAt) : null;
        const logoUrl = i.logo ? '/api/institutions/' + i.id + '/logo?v=' + encodeURIComponent(i.logo.uploadedAt) : null;
        
        root.innerHTML = `
          <div style="height: 100vh; height: 100dvh; width: 100%; overflow-y: auto; overflow-x: hidden; background: var(--bg-body); animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity:0; padding-bottom: 50px;">
          <div class="top-nav" style="background:var(--c-surface); border-bottom:1px solid var(--c-border); padding:10px 20px; z-index: 10; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <a href="#/buscar" class="btn btn-ghost btn-small">← Volver a resultados</a>
            ${state.user ? '<a href="#/app/perfil" class="btn btn-ghost btn-small">Volver al panel</a>' : '<a href="#/login" class="btn btn-primary btn-small">Iniciar sesión</a>'}
          </div>
          
          <div style="padding:20px; max-width:800px; margin:0 auto; animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity:0;">
            <div class="inst-hero" style="${fondoUrl ? `background-image:url('${fondoUrl}')` : 'background:#e1ecf7;'} border-radius: 12px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
              <div class="inst-hero-overlay" style="border-radius: 12px; padding: 30px; display:flex; flex-direction:column; gap:20px;">
                <div class="inst-hero-body" style="display:flex; align-items:center; gap:20px;">
                  ${logoUrl ? `<img src="${logoUrl}" style="width:80px; height:80px; border-radius:12px; object-fit:cover; border:3px solid #fff;">` : `<div style="width:80px; height:80px; border-radius:12px; background:#fff; display:flex; align-items:center; justify-content:center; border:3px solid #eee; color:var(--text-muted);">${ICONS.building}</div>`}
                  <div>
                    <h2 style="margin: 0 0 5px 0;">${escapeHtml(i.nombre)}</h2>
                    <span class="pill" style="background:${ts.bg};color:${ts.fg}; font-size: 0.8rem; padding: 4px 8px;">${escapeHtml(i.tipo)}</span>
                  </div>
                </div>
                ${i.estado === 'Activo' ? `
                <div class="inst-hero-actions">
                  <a href="${state.user && state.user.role === 'Tutor' ? `#/app/inscripciones/nueva?inst=${i.id}` : `#/login?redirect=${encodeURIComponent('#/app/inscripciones/nueva?inst='+i.id)}`}" class="btn btn-primary" style="text-decoration:none;">Inscribir estudiante</a>
                </div>
                ` : ''}
              </div>
            </div>

            <div class="chart-row" style="align-items:start;">
              <div class="chart-card">
                <h3>Información general</h3>
                <div class="two-col" style="margin-top: 15px;">
                  <div><div class="help">Distrito educativo</div><div>${escapeHtml(i.distrito)}</div></div>
                  <div><div class="help">Provincia</div><div>${escapeHtml(i.provincia)}</div></div>
                  <div><div class="help">Municipio</div><div>${escapeHtml(i.municipio || 'No registrado')}</div></div>
                  <div><div class="help">Dirección</div><div>${escapeHtml(i.direccion || 'No registrada')}</div></div>
                  <div><div class="help">Teléfono</div><div>${escapeHtml(i.telefono || 'No registrado')}</div></div>
                </div>
              </div>
              
              <div class="chart-card">
                <h3>Calificaciones</h3>
                <p style="font-size:1.3rem; margin: 15px 0 5px 0;">${i.calificacionPromedio !== null ? '★ ' + Number(i.calificacionPromedio).toFixed(1) : 'Sin calificaciones'}</p>
                <p class="help">Basado en ${i.totalCalificaciones} calificación${i.totalCalificaciones === 1 ? '' : 'es'}.</p>
                
                <div style="margin-top: 20px; max-height: 250px; overflow-y: auto; padding-right: 5px;">
                  ${ratings && ratings.length ? ratings.map((r) => `
                    <div style="padding:10px 0; border-bottom:1px solid var(--border-color); ${r === ratings[ratings.length-1] ? 'border-bottom:none;' : ''}">
                      <div style="font-size:14px; font-weight:bold;">★ ${r.estrellas} · <span style="font-weight:normal; color:var(--text-muted);">${escapeHtml(r.tutorNombre || 'Anónimo')}</span></div>
                      ${r.comentario ? `<div style="font-size:13px; margin-top:4px;">${escapeHtml(r.comentario)}</div>` : ''}
                      <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">${fmtDate(r.createdAt)}</div>
                    </div>
                  `).join('') : '<div class="empty-state" style="padding:10px; font-size:13px;">Aún no hay opiniones escritas.</div>'}
                </div>
              </div>
            </div>
            
            ${reports && reports.length ? `
              <div class="chart-card" style="margin-top:20px;">
                <h3>Reportes públicos de la comunidad</h3>
                <p class="help" style="margin-bottom: 15px;">Incidentes moderados y hechos públicos por el equipo de supervisión.</p>
                <div class="notif-list">
                  ${reports.map((rp) => `
                    <div class="notif-item" style="padding:15px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:10px;">
                      <div class="t1">${escapeHtml(rp.motivo)} ${rp.tutorNombre ? `· ${escapeHtml(rp.tutorNombre)}` : ''}</div>
                      <div class="t2" style="margin:5px 0;">${escapeHtml(rp.descripcion)}</div>
                      <div class="t3" style="font-size:12px; color:var(--text-muted);">${fmtDate(rp.createdAt)}</div>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        `;
      } catch (e) {
        root.innerHTML = `<div class="notice err">Error: ${escapeHtml(e.message)} <a href="#/buscar">Volver</a></div>`;
      }
      return;
    }

    root.innerHTML = `
      <div class="search-layout">
        <div class="search-sidebar">
          <div class="plain-brand" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
            <img class="brand-logo" src="/assets/brand/inscolar-logo-horizontal-primary.svg" alt="Inscolar">
            ${state.user ? '<a href="#/app/perfil" class="btn btn-ghost btn-small">Volver al panel</a>' : '<a href="#/login" class="btn btn-ghost btn-small">Acceder</a>'}
          </div>
          <form id="search-form">
            <div class="field"><label>Nombre o distrito</label><input type="text" name="q" placeholder="Ej. Politécnico..."></div>
            <div style="display:flex; gap:10px;">
              <div class="field" style="flex:1"><label>Provincia</label><select name="provincia" id="s-prov"><option value="">Todas</option></select></div>
              <div class="field" style="flex:1"><label>Municipio</label><select name="municipio" id="s-mun"><option value="">Todos</option></select></div>
            </div>
            <div class="field"><label>Calificación mínima</label><select name="calificacionMin"><option value="">Cualquiera</option><option value="4">4+ estrellas</option><option value="3">3+ estrellas</option></select></div>
            <button type="button" class="btn btn-secondary btn-small" id="btn-location" style="width:100%; margin-bottom:15px;">📍 Usar mi ubicación</button>
            <button type="button" class="btn btn-ghost btn-small mobile-only-btn" id="btn-toggle-map" style="width:100%; margin-bottom:15px; display:none;">${ICONS.map} Mostrar mapa</button>
            <button type="submit" class="btn btn-primary btn-block">Aplicar filtros</button>
          </form>
          <div id="search-results" style="margin-top:20px;"></div>
        </div>
        <div class="search-map-wrapper hidden-mobile">
          <div class="search-map" id="map-container"></div>
          <button id="close-map-btn" class="btn mobile-close-map">${ICONS.close}</button>
        </div>
      </div>
    `;

    const provSelect = qs('#s-prov');
    const munSelect = qs('#s-mun');
    const provincias = Object.keys(MUNICIPIOS || {}).sort();
    provincias.forEach(p => provSelect.insertAdjacentHTML('beforeend', `<option value="${p}">${p}</option>`));
    
    provSelect.addEventListener('change', () => {
      munSelect.innerHTML = '<option value="">Todos</option>';
      const p = provSelect.value;
      if (p && MUNICIPIOS[p]) {
        MUNICIPIOS[p].forEach(m => munSelect.insertAdjacentHTML('beforeend', `<option value="${m}">${m}</option>`));
      }
    });

    let currentMap = null;
    let currentMarkers = [];
    let userCoords = null;
    let latestBounds = null;
    const mapContainer = qs('#map-container');
    const mapWrapper = qs('.search-map-wrapper');
    const closeMapBtn = qs('#close-map-btn');
    const toggleMapBtn = qs('#btn-toggle-map');
    
    closeMapBtn.addEventListener('click', () => {
      mapWrapper.classList.add('hidden-mobile');
      toggleMapBtn.style.display = 'block';
    });
    toggleMapBtn.addEventListener('click', () => {
      mapWrapper.classList.remove('hidden-mobile');
      toggleMapBtn.style.display = 'none';
      if (currentMap) {
        currentMap.invalidateSize();
        if (latestBounds && latestBounds.length > 0) {
          currentMap.fitBounds(latestBounds, { animate: false, maxZoom: 15 });
        }
      }
    });

    async function initMap() {
      if (typeof L === 'undefined') {
        qs('#search-results').innerHTML = '<div class="loading" style="padding:20px">Cargando mapa...</div>';
        await new Promise((resolve) => {
          const css = document.createElement('link');
          css.rel = 'stylesheet';
          css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(css);
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }
      try {
        currentMap = L.map(mapContainer).setView([18.7357, -70.1627], 8);
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' }).addTo(currentMap);
        
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        if (isDark) {
          tileLayer.on('add', () => {
            const tilePane = mapContainer.querySelector('.leaflet-tile-pane');
            if (tilePane) tilePane.style.filter = 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)';
          });
        }
      } catch (e) {
        console.warn('Leaflet error', e);
        mapContainer.innerHTML = '<div style="padding:20px; color:#666;">Mapa no disponible.</div>';
      }
    }

    initMap().then(() => { if (resultsContainer.isConnected) performSearch(); }).catch(() => toast('No se pudo cargar el mapa. Puedes usar el listado.', 'error'));
    let searchVersion = 0;
    const resultsContainer = qs('#search-results');

    async function performSearch(extraQuery = '') {
      const version = ++searchVersion;
      qs('#search-results').innerHTML = '<div class="loading" style="padding:20px">Cargando...</div>';
      const fd = new FormData(qs('#search-form'));
      const q = new URLSearchParams();
      if (fd.get('q')) q.set('q', fd.get('q'));
      if (fd.get('provincia')) q.set('provincia', fd.get('provincia'));
      if (fd.get('municipio')) q.set('municipio', fd.get('municipio'));
      if (fd.get('calificacionMin')) q.set('calificacionMin', fd.get('calificacionMin'));
      if (userCoords) { q.set('lat', userCoords.lat); q.set('lng', userCoords.lng); q.set('radioKm', 50); }
      
      try {
        const data = await api('/institutions?' + q.toString() + extraQuery);
        if (version !== searchVersion || !resultsContainer.isConnected) return;
        
        currentMarkers.forEach(m => m.remove());
        currentMarkers = [];
        
        const mc = qs('#map-container');
        const emptyOver = mc ? mc.querySelector('.map-empty-overlay') : null;
        if (emptyOver) emptyOver.remove();

        if (!data.institutions || data.institutions.length === 0) {
          qs('#search-results').innerHTML = '<div class="notice">No se encontraron instituciones.</div>';
          if (currentMap && mc) {
            mc.insertAdjacentHTML('beforeend', '<div class="map-empty-overlay" style="position:absolute; top:0; left:0; width:100%; height:100%; background:var(--bg-body); opacity: 0.9; z-index:1000; display:flex; align-items:center; justify-content:center; color:var(--text-muted); text-align:center; padding:20px;">No hay resultados para mostrar en el mapa</div>');
          }
          return;
        }

        qs('#search-results').innerHTML = data.institutions.map(i => `
          <div class="inst-card" tabindex="0" style="padding:15px; border:1px solid var(--border-color); margin-bottom:10px; border-radius:8px; cursor:pointer; background:var(--bg-card); transition: border-color 0.2s;">
            <div onclick="window.location.hash='#/buscar/${i.id}'">
              <h4 style="margin:0 0 5px 0; color:var(--primary-color);">${escapeHtml(i.nombre)}</h4>
              <div style="font-size:13px; color:var(--text-muted); margin-bottom:5px;">
                ${escapeHtml(i.municipio || '')}${i.provincia && i.municipio ? ', ' : ''}${escapeHtml(i.provincia || '')}
              </div>
              ${i.distanciaKm !== undefined && i.distanciaKm !== null ? `<div style="font-size:12px; font-weight:600; color:var(--primary-color);">📍 A ${i.distanciaKm} km</div>` : ''}
            </div>
            <div style="margin-top:10px; display:flex; gap:8px;">
              <a href="#/buscar/${i.id}" class="btn btn-ghost btn-small view-inst" style="padding:4px 8px; text-decoration:none;">Ver detalles</a>
              ${i.estado === 'Activo' ? `<a href="${state.user && state.user.role === 'Tutor' ? `#/app/inscripciones/nueva?inst=${i.id}` : `#/login?redirect=${encodeURIComponent('#/app/inscripciones/nueva?inst='+i.id)}`}" class="btn btn-primary btn-small" style="padding:4px 8px; text-decoration:none;">Inscribir</a>` : ''}
            </div>
          </div>
        `).join('');

        const bounds = [];
        if (currentMap) {
          data.institutions.forEach(i => {
            if (typeof i.lat === 'number' && typeof i.lng === 'number') {
              const markerIcon = L.divIcon({
                className: 'modern-pin',
                html: `<svg viewBox="0 0 24 24" width="32" height="32" fill="var(--primary-color)" stroke="#fff" stroke-width="2" style="filter: drop-shadow(0 3px 5px rgba(0,0,0,0.4)); display: block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3" fill="#fff"></circle></svg>`,
                iconSize: [32, 32],
                iconAnchor: [16, 31],
                tooltipAnchor: [0, -31]
              });
              const marker = L.marker([i.lat, i.lng], { icon: markerIcon }).addTo(currentMap);
              
              const fotoUrl = i.foto ? `/api/institutions/${i.id}/foto?v=${encodeURIComponent(i.foto.uploadedAt)}` : '/assets/brand/inscolar-symbol-primary.svg';
              const detailsHtml = `
                <div style="display:flex; flex-direction:column; gap:8px;">
                  <div style="cursor:pointer; display:flex; flex-direction:row; gap:12px; min-width: 250px; align-items:center;" onclick="window.location.hash='#/buscar/${i.id}'">
                    <div style="width:60px; height:60px; border-radius:12px; overflow:hidden; flex-shrink:0; background:var(--bg-body); border:1px solid rgba(0,0,0,0.1);">
                      <img src="${fotoUrl}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='/assets/brand/inscolar-symbol-primary.svg';">
                    </div>
                    <div style="flex:1; text-align:left;">
                      <strong style="color:var(--primary-color); font-size:14px; display:block; margin-bottom:4px; line-height:1.2;">${escapeHtml(i.nombre)}</strong>
                      <span style="font-size:10px; padding:2px 8px; background:var(--primary-color); color:#fff; border-radius:12px; font-weight:600;">${escapeHtml(i.tipo)}</span>
                      <div style="font-size:12px; margin-top:6px; color:var(--text-color); opacity:0.8;">📍 ${escapeHtml(i.municipio || '')}</div>
                      <div style="font-size:12px; margin-top:4px; font-weight:bold; color:#eab308;">⭐ ${i.calificacionPromedio !== null ? Number(i.calificacionPromedio).toFixed(1) : 'Nuevo'}</div>
                    </div>
                  </div>
                  ${i.estado === 'Activo' ? `
                  <a href="${state.user && state.user.role === 'Tutor' ? `#/app/inscripciones/nueva?inst=${i.id}` : `#/login?redirect=${encodeURIComponent('#/app/inscripciones/nueva?inst='+i.id)}`}" class="btn btn-primary btn-small" style="text-decoration:none; text-align:center; display:block; padding:8px;">Inscribir estudiante</a>
                  ` : ''}
                </div>
              `;
              marker.instId = i.id;
              
              const isMobile = window.matchMedia('(max-width: 768px)').matches || ('ontouchstart' in window);
              if (isMobile) {
                marker.bindPopup(detailsHtml, { className: 'modern-popup', closeButton: false, minWidth: 250, offset: [0, -15] });
              } else {
                marker.bindTooltip(detailsHtml, { direction: 'top', className: 'modern-tooltip', interactive: true });
              }
              
              currentMarkers.push(marker);
              bounds.push([i.lat, i.lng]);
            }
          });
          const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          latestBounds = bounds;
          if (bounds.length > 0) {
            if (mapContainer && mapContainer.offsetWidth > 0) {
              currentMap.flyToBounds(bounds, { duration: 1.5, easeLinearity: 0.25, animate: !prefersReduced });
            } else {
              // Si el contenedor está oculto (mobile), no podemos hacer flyToBounds porque causará Invalid LatLng (NaN).
              // Simplemente centramos el mapa de manera silenciosa, para que al abrirlo ya esté ahí.
              // currentMap.fitBounds también falla si el contenedor es display:none, así que lo guardamos en latestBounds y lo centramos en el evento del toggleMapBtn.
            }
          } else if (currentMap && qs('#map-container')) {
            qs('#map-container').insertAdjacentHTML('beforeend', '<div class="map-empty-overlay" style="position:absolute; top:0; left:0; width:100%; height:100%; background:var(--bg-body); opacity: 0.9; z-index:1000; display:flex; align-items:center; justify-content:center; color:var(--text-muted); text-align:center; padding:20px;">Las instituciones encontradas no tienen coordenadas registradas.</div>');
          }
        }

        qsa('.inst-card').forEach(c => {
          c.addEventListener('mouseenter', () => {
            const m = currentMarkers.find(mx => mx.instId === c.dataset.id);
            if (m && currentMap) {
               m.openPopup();
            }
          });
          c.addEventListener('focus', () => {
            const m = currentMarkers.find(mx => mx.instId === c.dataset.id);
            if (m && currentMap) m.openPopup();
          });
        });
      } catch (err) {
        qs('#search-results').innerHTML = '<div class="notice err">Error al buscar: ' + escapeHtml(err.message) + '</div>';
      }
    }

    const searchResults = qs('#search-results');
    if (searchResults) {
      searchResults.addEventListener('click', (e) => {
        const a = e.target.closest('a[href^="#/buscar/"]');
        if (a) {
          e.preventDefault();
          navigate(a.getAttribute('href'));
        }
      });
    }

    const searchForm = qs('#search-form');
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      performSearch();
    });

    let searchTimeout;
    searchForm.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => performSearch(), 400);
    });
    searchForm.addEventListener('change', () => {
      clearTimeout(searchTimeout);
      performSearch();
    });

    qs('#btn-location').addEventListener('click', () => {
      if ('geolocation' in navigator) {
        const layout = qs('.search-layout');
        layout.insertAdjacentHTML('beforeend', `
          <div id="loc-loader" style="position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(255,255,255,0.7); backdrop-filter:blur(4px); z-index:9999; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity 0.3s ease;">
            <div id="loc-loader-box" style="background:var(--bg-card); padding:20px 30px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.1); border:1px solid var(--border-color); text-align:center; transform:translateY(10px); transition:transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);">
              <div class="spinner" style="margin:0 auto 15px auto; width:30px; height:30px; border:3px solid var(--border-color); border-top-color:var(--primary-color); border-radius:50%; animation:spin 1s linear infinite;"></div>
              <strong style="color:var(--text-color); font-size:15px; display:block;">Detectando tu ubicación...</strong>
              <div style="font-size:13px; color:var(--text-muted); margin-top:5px;">Por favor, acepta el permiso del navegador.</div>
            </div>
          </div>
        `);
        setTimeout(() => {
          const l = qs('#loc-loader');
          if (l) {
            l.style.opacity = '1';
            qs('#loc-loader-box').style.transform = 'translateY(0)';
          }
        }, 10);

        qs('#btn-location').textContent = '📍 Obteniendo...';
        navigator.geolocation.getCurrentPosition(async (pos) => {
          await new Promise(r => setTimeout(r, 600)); // smooth delay
          userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          qs('#btn-location').textContent = '📍 Ubicación activa';
          qs('#btn-location').classList.replace('btn-secondary', 'btn-primary');
          
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userCoords.lat}&lon=${userCoords.lng}`);
            const data = await res.json();
            if (data && data.address) {
              const stateStr = data.address.state;
              const cityStr = data.address.city || data.address.town || data.address.county || data.address.village;
              
              const pKeys = Object.keys(MUNICIPIOS);
              const matchedProv = pKeys.find(p => stateStr && stateStr.toLowerCase().includes(p.toLowerCase()));
              if (matchedProv) {
                const provSelect = qs('#s-prov');
                provSelect.value = matchedProv;
                provSelect.dispatchEvent(new Event('change'));
                
                const matchedMun = MUNICIPIOS[matchedProv].find(m => cityStr && cityStr.toLowerCase().includes(m.toLowerCase()));
                if (matchedMun) {
                  qs('#s-mun').value = matchedMun;
                }
              }
            }
          } catch (e) {
            console.warn('Reverse geocoding falló', e);
          }
          
          const l = qs('#loc-loader');
          if (l) {
            l.style.opacity = '0';
            setTimeout(() => l.remove(), 300);
          }
          performSearch();
        }, (err) => {
          const l = qs('#loc-loader');
          if (l) {
            l.style.opacity = '0';
            setTimeout(() => l.remove(), 300);
          }
          toast('Permiso denegado. Busca manualmente.', 'err');
          qs('#btn-location').textContent = '📍 Usar mi ubicación';
        });
      } else {
        toast('Geolocalización no soportada.', 'err');
      }
    });

    performSearch();
  }

  // ---------------- HU006 login ----------------
  function loginDestination(user, redirect) {
    // parseHash ya decodifica los parámetros. Solo aceptar destinos internos.
    const tutorOnly = /^#\/app\/inscripciones\/(nueva|estudiante-nuevo)(?:[/?]|$)/.test(redirect || '');
    return typeof redirect === 'string' && redirect.startsWith('#/app/')
      && (!tutorOnly || user.role === 'Tutor') ? redirect : '#/app/perfil';
  }

  function viewLogin(query = {}) {
    const rememberedEmail = localStorage.getItem('rememberedEmail') || '';
    authShell({
      withHero: true,
      headline: 'Inscripción escolar, en un solo lugar',
      lede: 'Tutores, personal de institución, soporte y auditoría acceden al sistema con la misma puerta de entrada.',
      body: `
        <p class="eyebrow">Iniciar sesión</p>
        <p class="lede">Ingresa con tu correo y contraseña.</p>
        <div id="err"></div>
        <form id="login-form">
          <div class="field"><label>Correo electrónico</label><input type="email" name="email" value="${escapeHtml(rememberedEmail)}" required></div>
          <div class="field">
            <div class="row-label"><label>Contraseña</label><button type="button" class="link" id="toggle-pw">Mostrar</button></div>
            <input type="password" name="password" required>
          </div>
          <div class="row-between">
            <label class="checkbox"><input type="checkbox" name="remember" ${rememberedEmail ? 'checked' : ''}> Recordar usuario</label>
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
      const form = e.target;
      const loginHash = window.location.hash;
      const fd = new FormData(form);
      qs('#err', form.parentElement).innerHTML = '';
      
      const submitBtn = qs('button[type="submit"]', e.target);
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Procesando...';
      
      if (fd.get('remember')) {
        localStorage.setItem('rememberedEmail', fd.get('email'));
      } else {
        localStorage.removeItem('rememberedEmail');
      }

      try {
        const deviceToken = localStorage.getItem('deviceToken');
        const data = await api('/auth/login', { method: 'POST', body: { email: fd.get('email'), password: fd.get('password'), deviceToken } });

        if (data.status === 'mfa_required') {
          state.pendingMfa = data;
          state.pendingRedirect = query.redirect;
          navigate('#/mfa');
        } else if (data.status === 'must_change_password') {
          state.pendingRedirect = query.redirect;
          navigate('#/force-change');
        } else {
          state.user = data.user;
          state.authChecked = true;
          state.pendingRedirect = null;
          const destination = loginDestination(data.user, query.redirect);
          if (window.location.hash !== loginHash || !form.isConnected) return;
          // La animación es opcional: no esperar su resultado ni propagar sus fallos.
          try {
            if (window._triggerLoginSuccess) {
              Promise.resolve(window._triggerLoginSuccess('.medallion')).catch(() => {});
            }
          } catch (err) { /* continuar con la navegación */ }
          navigate(destination);
        }
      } catch (err) {
        if (!form.isConnected) return;
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        qs('#err', form.parentElement).innerHTML = fieldErrorsBlock(err.errors || [err.message]);
        const firstErrInput = qs('.field.error input, .field.error select', form);
        (firstErrInput || qs('input[name="email"]', form)).focus();
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
          <label class="checkbox" style="margin-bottom:18px"><input type="checkbox" name="rememberDevice" checked> Recordar este dispositivo por 30 días</label>
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
      const rememberDevice = qs('input[name=rememberDevice]').checked;
      qs('#err').innerHTML = '';
      try {
        const data = await api('/auth/mfa/verify', { method: 'POST', body: { code, rememberDevice } });
        if (data.deviceToken) {
          localStorage.setItem('deviceToken', data.deviceToken);
        }
        state.user = data.user;
        state.pendingMfa = null;
        state.authChecked = true;
        const destination = loginDestination(data.user, state.pendingRedirect);
        state.pendingRedirect = null;
        navigate(destination);
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
        state.authChecked = true;
        toast('Contraseña actualizada.', 'ok');
        const destination = loginDestination(data.user, state.pendingRedirect);
        state.pendingRedirect = null;
        navigate(destination);
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
  // --- F2.1 Matriz de permisos (acción × rol) ---
  // Roles privilegiados (tienen acceso a panel de administración)
  const ADMIN_ROLES = ['Administrador', 'Soporte'];

  // Helpers por acción y ámbito (per HU002-HU016)
  function role() { return (state.user || {}).role; }
  function isAdmin()      { return state.user && ADMIN_ROLES.includes(role()); }
  function isOnlyAdmin()  { return role() === 'Administrador'; }
  function isSupport()    { return role() === 'Soporte'; }
  function isStaff()      { return role() === 'Personal de institución'; }
  function isTutor()      { return role() === 'Tutor'; }
  function isAudit()      { return role() === 'Auditoría'; }

  // Usuarios: quién ve el módulo
  function canSeeUsuarios()     { return isAdmin(); }
  // Quién puede crear usuarios (y qué roles puede asignar)
  function canCreateUsuario()   { return isAdmin(); } // Admin y Soporte, pero Soporte solo Personal
  // Quién puede editar: Admin todos; Soporte solo Personal/Tutor
  function canEditUser(targetRole) {
    if (isOnlyAdmin()) return true;
    if (isSupport()) return ['Personal de institución', 'Tutor'].includes(targetRole);
    return false;
  }
  // Solo Admin puede activar/desactivar (HU013/HU014)
  function canToggleEstado()    { return isOnlyAdmin(); }
  // Soporte puede resetear solo Personal/Tutor; Admin todos (HU016)
  function canResetPassword(targetRole) {
    if (isOnlyAdmin()) return true;
    if (isSupport()) return ['Personal de institución', 'Tutor'].includes(targetRole);
    return false;
  }
  // Roles que Soporte puede crear (solo Personal)
  const ROLES_SOPORTE_PUEDE_CREAR = ['Personal de institución'];
  // Roles que Admin puede crear (todos)
  const ROLES_ADMIN_PUEDE_CREAR = ['Administrador', 'Soporte', 'Personal de institución', 'Auditoría'];

  const AUDIT_ROLES = ['Administrador', 'Auditoría'];
  function canSeeAuditoria() { return state.user && AUDIT_ROLES.includes(role()); }


  async function viewApp(segs, query) {
    const section = segs[0] || 'perfil';
    const canSeeInscripciones = isAdmin() || ['Tutor', 'Personal de institución'].includes(role());
    const esCalendarioInstitucion = section === 'instituciones' && segs[2] === 'calendario';
    const esDetalleInstitucion = section === 'instituciones' && segs[2] === 'detalle';
    const esCalificacionesInstitucion = section === 'instituciones' && segs[2] === 'calificaciones';
    const esReportesInstitucion = section === 'instituciones' && segs[2] === 'reportes';
    
    const esPeriodosInstitucion = section === 'instituciones' && segs[2] === 'periodos';
    const esPropiaInstitucion = (state.user || {}).role === 'Personal de institución' && String((state.user || {}).institucionId) === String(segs[1]);

    // Solo Admin y Soporte ven Usuarios e Instituciones; Analíticas solo Admin
    if (section === 'usuarios' && !canSeeUsuarios()) {
      root.innerHTML = appShellWrap('<div class="empty-state">No tienes permiso para ver esta sección.</div>', 'perfil');
      return;
    }
    if (section === 'analiticas' && !isAdmin()) {
      root.innerHTML = appShellWrap('<div class="empty-state">No tienes permiso para ver esta sección.</div>', 'perfil');
      return;
    }
    if (section === 'instituciones' && !isAdmin()) {
      const publicInstSections = esCalendarioInstitucion || esDetalleInstitucion || esCalificacionesInstitucion || esReportesInstitucion;
      const staffInstSections = esPropiaInstitucion && esPeriodosInstitucion;
      if (!publicInstSections && !staffInstSections && !esPropiaInstitucion) {
        root.innerHTML = appShellWrap('<div class="empty-state">No tienes permiso para ver esta sección.</div>', 'perfil');
        return;
      }
    }
    if (section === 'notificaciones' && !(isAdmin() || (state.user || {}).role === 'Tutor')) {
      root.innerHTML = appShellWrap('<div class="empty-state">No tienes permiso para ver esta sección.</div>', 'perfil');
      return;
    }
    if (['calificar', 'reportar'].includes(section) && (state.user || {}).role !== 'Tutor') {
      root.innerHTML = appShellWrap('<div class="empty-state">No tienes permiso para ver esta sección.</div>', 'perfil');
      return;
    }
    if (section === 'inscripciones' && !canSeeInscripciones) {
      root.innerHTML = appShellWrap('<div class="empty-state">No tienes permiso para ver esta sección.</div>', 'perfil');
      return;
    }
    if (section === 'citas' && !canSeeInscripciones) {
      root.innerHTML = appShellWrap('<div class="empty-state">No tienes permiso para ver esta sección.</div>', 'perfil');
      return;
    }
    if (section === 'auditoria' && !canSeeAuditoria()) {
      root.innerHTML = appShellWrap('<div class="empty-state">No tienes permiso para ver esta sección.</div>', 'perfil');
      return;
    }

    let unread = 0;
    if (isAdmin() || isTutor()) {
      try { const n = await api('/notifications'); unread = n.unreadCount; } catch (e) {}
    }

    let contentHtml = '<div class="loading">Cargando…</div>';
    root.innerHTML = appShellWrap(contentHtml, section, unread);
    bindShellEvents();

    try {
      if (section === 'perfil' && segs[1] === 'editar') await renderPerfilEditar();
      else if (section === 'perfil') await renderPerfil();
      else if (section === 'seguridad') await renderSeguridad();
      else if (section === 'configuracion') await renderConfiguracion();
      else if (section === 'manual') await renderManual();
      else if (section === 'usuarios' && segs[1] === 'nuevo') await renderUsuarioForm(null);
      else if (section === 'usuarios' && segs[2] === 'editar') await renderUsuarioForm(segs[1]);
      else if (section === 'usuarios') await renderUsuarios(query);
      else if (section === 'instituciones' && segs[1] === 'nueva') await renderInstitucionForm(null);
      else if (section === 'instituciones' && segs[2] === 'editar') await renderInstitucionForm(segs[1]);
      else if (section === 'instituciones' && segs[2] === 'calificaciones') await renderCalificacionesList(segs[1]);
      else if (section === 'instituciones' && segs[2] === 'reportes') await renderReportesList(segs[1]);
      else if (section === 'instituciones' && segs[2] === 'periodos' && segs[3] === 'nueva') await renderPeriodoNuevoForm(segs[1]);
      else if (section === 'instituciones' && segs[2] === 'periodos' && segs[4] === 'editar') await renderPeriodoForm(segs[1], segs[3]);
      else if (section === 'instituciones' && segs[2] === 'periodos') await renderPeriodosList(segs[1]);
      else if (section === 'instituciones' && segs[2] === 'calendario') await renderCalendarioInstitucion(segs[1], query);
      else if (section === 'instituciones' && segs[2] === 'detalle') await renderInstitucionDetalle(segs[1]);
      else if (section === 'instituciones') await renderInstituciones(query);
      else if (section === 'calificar' && segs[1]) await renderCalificarForm(segs[1]);
      else if (section === 'reportar' && segs[1]) await renderReportarForm(segs[1]);
      else if (section === 'inscripciones' && segs[1] === 'estudiante-nuevo') await renderEstudianteForm();
      else if (section === 'inscripciones' && segs[1] === 'nueva') await renderInscripcionForm();
      else if (section === 'inscripciones' && segs[1] === 'comprobante' && segs[2]) await renderComprobanteInscripcion(segs[2]);
      else if (section === 'inscripciones' && segs[2] === 'detalle') await renderInscripcionDetalle(segs[1]);
      else if (section === 'inscripciones' && segs[2] === 'documentos') await renderDocumentosInscripcion(segs[1]);
      else if (section === 'inscripciones') await renderInscripciones(query);
      else if (section === 'citas' && segs[1] === 'nueva') await renderCitaForm(null,query);
      else if (section === 'citas' && segs[2] === 'detalle') await renderCitaDetalle(segs[1]);
      else if (section === 'citas' && segs[2] === 'reprogramar') await renderCitaForm(segs[1],query);
      else if (section === 'citas' && segs[1] === 'comprobante' && segs[2]) await renderComprobanteCita(segs[2]);
      else if (section === 'citas') await renderCitas(query);
      else if (section === 'notificaciones') await renderNotificaciones();
      else if (section === 'analiticas') await renderAnaliticas();
      else if (section === 'auditoria') await renderAuditoria(query);
      else qs('.main').innerHTML = '<div class="empty-state">Sección no encontrada.</div>';
    } catch (err) {
      qs('.main').innerHTML = `<div class="empty-state">${escapeHtml(err.message)}</div>`;
    }
  }

  function appShellWrap(innerMain, activeSection, unread) {
    const u = state.user || {};
    const [avBg, avFg] = avatarColor(0);
    const topbarAvatarStyle = u.foto ? `background-image:url('/api/users/${u.id}/foto?v=${encodeURIComponent(u.foto.uploadedAt)}');background-size:cover;background-position:center;` : `background:${avBg};color:${avFg}`;
    const admin = isAdmin();
    const instName = u.institucionNombre ? escapeHtml(u.institucionNombre) : '';

    const sectionNames = {
      'usuarios': 'Usuarios', 'instituciones': 'Instituciones',
      'inscripciones': 'Inscripciones', 'citas': 'Citas', 'analiticas': 'Analíticas',
      'auditoria': 'Auditoría', 'perfil': 'Mi perfil', 'seguridad': 'Seguridad',
      'configuracion': 'Configuración', 'manual': 'Instrucciones'
    };
    const currentName = sectionNames[activeSection] || 'Inicio';

    return `
      <div class="app">
        <div class="topbar">
          <button class="sidebar-toggle" id="sidebar-toggle" aria-label="Abrir menú" aria-expanded="false">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </button>
          <div class="brand"><img class="badge-logo" src="/assets/brand/inscolar-symbol-primary.svg" alt="Inscolar"><span class="stack"><div class="b1">Inscolar</div><div class="b2">Portal institucional</div></span></div>
          <div class="topbar-breadcrumb"><span class="sep">/</span> <span class="current">${currentName}</span></div>
          <div class="topbar-right">
            <button class="theme-toggle" id="theme-toggle" title="Cambiar tema">
              ${ICONS.contrast}
            </button>
            ${(admin || u.role === 'Tutor') ? `<div class="notif-wrap"><button class="bell" id="bell-btn" aria-haspopup="true" aria-expanded="false">${ICONS.bell}${unread ? `<span class="dot">${unread}</span>` : ''}</button><div class="notif-panel" id="notif-panel" hidden></div></div>` : ''}
            <a href="#/app/perfil" class="who" style="text-decoration:none; color:inherit;"><span class="avatar" style="${topbarAvatarStyle}">${u.foto ? '' : initials(u.nombre)}</span><span class="stack"><div class="w1">${escapeHtml(u.nombre || '')}</div><div class="w2">${escapeHtml(u.role || '')}</div></span></a>
            <button class="logout" id="logout-btn">Cerrar sesión</button>
          </div>
        </div>
        <div class="body">
          <div class="sidebar-backdrop" id="sidebar-backdrop"></div>
          <div class="sidebar" id="sidebar">
            ${u.role === 'Personal de institución' && instName ? `
            <div class="sidebar-inst-badge" style="cursor:pointer;" onclick="window.location.hash='#/app/instituciones/${u.institucionId}/detalle'">
              ${ICONS.building} <span>${instName}</span>
            </div>
            ` : ''}
            ${isOnlyAdmin() ? `
            <div class="sec-label">Módulos</div>
            <button class="nav-item" data-nav="#/buscar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Buscar Instituciones</button>
            <button class="nav-item ${activeSection === 'usuarios' ? 'active' : ''}" data-nav="#/app/usuarios">${ICONS.users} Usuarios</button>
            <button class="nav-item ${activeSection === 'instituciones' ? 'active' : ''}" data-nav="#/app/instituciones">${ICONS.building} Instituciones</button>
            <button class="nav-item ${activeSection === 'inscripciones' ? 'active' : ''}" data-nav="#/app/inscripciones">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Inscripciones
            </button>
            <button class="nav-item ${activeSection === 'analiticas' ? 'active' : ''}" data-nav="#/app/analiticas">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> Analíticas
            </button>
            <button class="nav-item ${activeSection === 'auditoria' ? 'active' : ''}" data-nav="#/app/auditoria">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/></svg> Auditoría
            </button>
            ` : isSupport() ? `
            <div class="sec-label">Módulos</div>
            <button class="nav-item" data-nav="#/buscar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Buscar Instituciones</button>
            <button class="nav-item ${activeSection === 'usuarios' ? 'active' : ''}" data-nav="#/app/usuarios">${ICONS.users} Usuarios</button>
            <button class="nav-item ${activeSection === 'inscripciones' ? 'active' : ''}" data-nav="#/app/inscripciones">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Inscripciones
            </button>
            ` : isStaff() ? `
            <div class="sec-label">Módulos</div>
            <button class="nav-item" data-nav="#/buscar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Buscar Instituciones</button>
            ${u.institucionId ? `<button class="nav-item ${activeSection === 'instituciones' ? 'active' : ''}" data-nav="#/app/instituciones/${u.institucionId}/detalle">${ICONS.building} Mi Institución</button>` : ''}
            <button class="nav-item ${activeSection === 'inscripciones' ? 'active' : ''}" data-nav="#/app/inscripciones">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Inscripciones
            </button>
            <button class="nav-item ${activeSection === 'citas' ? 'active' : ''}" data-nav="#/app/citas">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Citas
            </button>
            ` : isTutor() ? `
            <div class="sec-label">Módulos</div>
            <button class="nav-item" data-nav="#/buscar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Buscar Instituciones</button>
            <button class="nav-item ${activeSection === 'inscripciones' ? 'active' : ''}" data-nav="#/app/inscripciones">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> Inscripciones
            </button>
            <button class="nav-item ${activeSection === 'citas' ? 'active' : ''}" data-nav="#/app/citas">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Citas
            </button>
            ` : (u.role === 'Auditoría') ? `
            <div class="sec-label">Módulos</div>
            <button class="nav-item" data-nav="#/buscar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg> Buscar Instituciones</button>
            <button class="nav-item ${activeSection === 'auditoria' ? 'active' : ''}" data-nav="#/app/auditoria">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9 15l3-3 3 3"/></svg> Auditoría
            </button>
            ` : ''}
            <div class="sec-label">Mi cuenta</div>
            <button class="nav-item ${activeSection === 'perfil' ? 'active' : ''}" data-nav="#/app/perfil">${ICONS.users} Mi perfil</button>
            <button class="nav-item ${activeSection === 'seguridad' ? 'active' : ''}" data-nav="#/app/seguridad">${ICONS.shield} Seguridad</button>
            <button class="nav-item ${activeSection === 'configuracion' ? 'active' : ''}" data-nav="#/app/configuracion">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> Configuración
            </button>
            <button class="nav-item ${activeSection === 'manual' ? 'active' : ''}" data-nav="#/app/manual">${ICONS.check} Instrucciones</button>
            <div class="sidebar-footer">v0.4 · Ambiente de pruebas</div>
          </div>
          <div class="main">${innerMain}</div>
        </div>
      </div>
    `;
  }

  function bindShellEvents() {
    qsa('[data-nav]').filter(btn => !btn.dataset.navBound).forEach((btn) => {
      btn.dataset.navBound = '1';
      btn.addEventListener('click', () => {
      const sidebar = qs('#sidebar');
      const backdrop = qs('#sidebar-backdrop');
      if (sidebar && backdrop && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        backdrop.classList.remove('visible');
        qs('#sidebar-toggle').setAttribute('aria-expanded', 'false');
      }
      navigate(btn.getAttribute('data-nav'));
      });
    });

    const sidebarToggle = qs('#sidebar-toggle');
    const sidebar = qs('#sidebar');
    const backdrop = qs('#sidebar-backdrop');
    if (sidebarToggle && sidebar && backdrop && !sidebarToggle.dataset.bound) {
      sidebarToggle.dataset.bound = '1';
      sidebarToggle.addEventListener('click', () => {
        const isOpen = sidebar.classList.contains('open');
        if (isOpen) {
          sidebar.classList.remove('open');
          backdrop.classList.remove('visible');
        } else {
          sidebar.classList.add('open');
          backdrop.classList.add('visible');
        }
        sidebarToggle.setAttribute('aria-expanded', !isOpen);
      });
      backdrop.addEventListener('click', () => {
        sidebar.classList.remove('open');
        backdrop.classList.remove('visible');
        sidebarToggle.setAttribute('aria-expanded', 'false');
      });
    }

    const themeToggleBtn = qs('#theme-toggle');
    if (themeToggleBtn && !themeToggleBtn.dataset.bound) {
      themeToggleBtn.dataset.bound = '1';
      themeToggleBtn.addEventListener('click', () => {
        const modes = ['system', 'light', 'dark'];
        const current = localStorage.getItem('ins-theme') || 'system';
        const next = modes[(modes.indexOf(current) + 1) % modes.length];
        localStorage.setItem('ins-theme', next);
        
        document.documentElement.removeAttribute('data-theme');
        if (next === 'dark' || (next === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
        toast('Tema: ' + (next === 'system' ? 'Automático' : (next === 'dark' ? 'Oscuro' : 'Claro')), 'info');
      });
    }

    const logoutBtn = qs('#logout-btn');
    if (logoutBtn && !logoutBtn.dataset.bound) {
    logoutBtn.dataset.bound = '1';
    logoutBtn.addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' });
      if(window._wizardCleanup)window._wizardCleanup();
      window._navInterceptor=null;
      state.user = null;
      navigate('#/login');
    });
    }
    const bellBtn = qs('#bell-btn');
    const notifPanel = qs('#notif-panel');
    // bindShellEvents() se llama dos veces por render (una vez en viewApp al armar
    // el shell, y otra vez dentro de cada render*() de sección) sobre el MISMO botón
    // de campana, porque solo se reemplaza el contenido de .main, no el topbar. Sin
    // este guard, el clic quedaba enganchado dos veces y el segundo listener cerraba
    // el panel apenas el primero lo abría (por eso no "se veía" nada al hacer clic).
    if (bellBtn && notifPanel && !bellBtn.dataset.notifBound) {
      bellBtn.dataset.notifBound = '1';
      const closePanel = () => {
        notifPanel.hidden = true;
        notifPanel.innerHTML = '';
        bellBtn.setAttribute('aria-expanded', 'false');
      };
      const updateBellDot = (count) => {
        const existing = qs('.dot', bellBtn);
        if (count > 0) {
          if (existing) existing.textContent = count;
          else bellBtn.insertAdjacentHTML('beforeend', `<span class="dot">${count}</span>`);
        } else if (existing) {
          existing.remove();
        }
      };
      const renderPanel = (notifications) => {
        const recent = notifications.slice(0, 6);
        notifPanel.innerHTML = `
          <div class="notif-panel-head">Notificaciones</div>
          ${recent.length ? recent.map((n) => `
            <div class="notif-item ${n.read ? '' : 'unread'}">
              <div>
                <div class="t1">${escapeHtml(n.campo)} · ${escapeHtml(n.userNombre)}</div>
                <div class="t2">${n.anterior || n.nuevo ? `Campo ${escapeHtml(n.campo)}: ${escapeHtml(n.anterior || '—')} → ${escapeHtml(n.nuevo || '—')}. ` : ''}Realizado por ${escapeHtml(n.actorNombre)}.</div>
                <div class="t3">${fmtDate(n.createdAt)}</div>
              </div>
              ${!n.read ? `<button class="btn btn-ghost btn-small" data-panel-read="${n.id}">Marcar leída</button>` : ''}
            </div>
          `).join('') : '<div class="notif-panel-empty">No hay notificaciones.</div>'}
          <div class="notif-panel-foot"><button type="button" id="notif-panel-viewall">Ver todas</button></div>
        `;
        qsa('[data-panel-read]', notifPanel).forEach((b) => b.addEventListener('mousedown', async (e) => {
          e.preventDefault();
          await api('/notifications/' + b.dataset.panelRead + '/read', { method: 'POST' });
          const { notifications: fresh } = await api('/notifications');
          renderPanel(fresh);
          updateBellDot(fresh.filter((n) => !n.read).length);
        }));
        const viewAllBtn = qs('#notif-panel-viewall', notifPanel);
        viewAllBtn && viewAllBtn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          closePanel();
          navigate('#/app/notificaciones');
        });
      };

      bellBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!notifPanel.hidden) { closePanel(); return; }
        notifPanel.hidden = false;
        bellBtn.setAttribute('aria-expanded', 'true');
        notifPanel.innerHTML = '<div class="notif-panel-empty">Cargando…</div>';
        try {
          const { notifications } = await api('/notifications');
          renderPanel(notifications);
        } catch (err) {
          notifPanel.innerHTML = '<div class="notif-panel-empty">No se pudieron cargar.</div>';
        }
      });
    }
  }

  // ---------------- HU011/HU012 perfil ----------------
  async function renderPerfil() {
    const { user } = await api('/users/me/profile');
    const fotoUrl = user.foto ? '/api/users/' + user.id + '/foto?v=' + encodeURIComponent(user.foto.uploadedAt) : null;
    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Perfil de usuario</h2><div class="sub">Datos personales asociados a tu cuenta.</div></div>
      <button class="btn btn-primary btn-small" style="width:auto; padding:9px 18px;" data-nav="#/app/perfil/editar">Editar</button></div>
      <div class="chart-row">
        <div class="chart-card">
          <div style="display:flex; align-items:center; gap:14px; margin-bottom:20px;">
            <div class="profile-avatar-wrap" id="foto-wrap" title="Cambiar foto de perfil">
              <span class="avatar" style="width:64px;height:64px;font-size:1.1rem;${fotoUrl ? `background-image:url('${fotoUrl}');background-size:cover;background-position:center;` : `background:${avatarColor(0)[0]};color:${avatarColor(0)[1]}`}">${fotoUrl ? '' : initials(user.nombre)}</span>
              <button type="button" class="avatar-edit-btn" id="foto-btn" aria-label="Cambiar foto de perfil">${ICONS.camera}</button>
            </div>
            <input type="file" id="foto-input" accept=".jpg,.jpeg,.png" style="display:none;">
            <div>
              <div style="font-weight:700; font-size:1.05rem;">${escapeHtml(user.nombre)}</div>
              <div style="color:var(--ink-soft); font-size:.85rem;">${escapeHtml(user.email)} · ${escapeHtml(user.role)}${user.institucionNombre ? ' · ' + escapeHtml(user.institucionNombre) : ''}</div>
              ${fotoUrl ? '<button type="button" class="link-btn" id="foto-remove-btn">Quitar foto</button>' : ''}
            </div>
          </div>
          <div id="foto-err"></div>
          <div class="two-col">
            <div><div class="help">SEXO</div><div>${escapeHtml(user.sexo || '—')}</div></div>
            <div><div class="help">ESTADO</div><div>${escapeHtml(user.estado)}</div></div>
            <div><div class="help">TELÉFONO FIJO</div><div>${escapeHtml(user.telefonoFijo || 'No registrado')}</div></div>
            <div><div class="help">TELÉFONO MÓVIL</div><div>${escapeHtml(user.telefonoMovil || 'No registrado')}</div></div>
          </div>
        </div>
        <div class="chart-card chart-card-accent">
          <span class="card-icon-bg">${ICONS.shield}</span>
          <h3>Seguridad de la cuenta</h3>
          <p class="help">Contraseña <a href="#/app/seguridad">Cambiar</a></p>
          <p class="help">Verificación en dos pasos: ${user.mfaEnabled ? '<strong style="color:var(--green)">Activada</strong>' : 'Desactivada'} <a href="#/app/seguridad">Configurar</a></p>
        </div>
      </div>
    `;
    bindShellEvents();

    const fotoInput = qs('#foto-input');
    const fotoBtn = qs('#foto-btn');
    fotoBtn && fotoBtn.addEventListener('click', () => fotoInput.click());
    fotoInput && fotoInput.addEventListener('change', async () => {
      if (!fotoInput.files || !fotoInput.files[0]) return;
      qs('#foto-err').innerHTML = '';
      const fd = new FormData();
      fd.append('foto', fotoInput.files[0]);
      try {
        const res = await fetch('/api/users/me/foto', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw { errors: data.errors || [data.error || 'No se pudo subir la imagen.'] };
        state.user = data.user;
        toast('Foto de perfil actualizada.', 'ok');
        await viewApp(['perfil'], {});
      } catch (err) {
        qs('#foto-err').innerHTML = fieldErrorsBlock(err.errors || [err.message || 'No se pudo subir la imagen.']);
      }
    });
    const fotoRemoveBtn = qs('#foto-remove-btn');
    fotoRemoveBtn && fotoRemoveBtn.addEventListener('click', async () => {
      try {
        const data = await api('/users/me/foto', { method: 'DELETE' });
        state.user = data.user;
        toast('Foto eliminada.', 'ok');
        await viewApp(['perfil'], {});
      } catch (err) {
        toast(err.message || 'No se pudo eliminar la imagen.', 'err');
      }
    });
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
      <div class="chart-row" style="align-items:start;">
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
        <div class="chart-card chart-card-accent">
          <span class="card-icon-bg">${ICONS.shield}</span>
          <h3>Verificación en dos pasos (MFA)</h3>
          <p class="help" style="margin-bottom:16px;">Al iniciar sesión desde un dispositivo no reconocido, el sistema pedirá un código de verificación adicional.</p>
          ${mfa.enabled
            ? `<div class="notice ok">MFA activado · método: ${escapeHtml(mfa.method === 'app' ? 'App autenticadora' : 'Correo electrónico')}</div>
               <button class="btn btn-secondary" style="width:auto; padding:10px 18px;" id="mfa-off">Desactivar MFA</button>`
            : `<div id="mfa-flow">
                 <div class="field" style="margin-bottom:10px;">
                   <label>Método de verificación</label>
                   <select id="mfa-method">
                     <option value="correo">Correo electrónico</option>
                     <option value="app">Aplicación autenticadora</option>
                   </select>
                 </div>
                 <button class="btn btn-primary" style="width:auto; padding:10px 18px;" id="mfa-start">Configurar y Activar</button>
               </div>`
          }
        </div>
        <div class="chart-card">
          <h3>Preferencias de notificaciones</h3>
          <p class="help" style="margin-bottom:16px;">Recibe un correo electrónico cada vez que haya una actualización importante en tu cuenta, tus solicitudes o tus citas.</p>
          <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
            <input type="checkbox" id="notif-email-toggle" ${state.user && state.user.notifyByEmail !== false ? 'checked' : ''}>
            Recibir notificaciones por correo electrónico
          </label>
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
      const selectedMethod = qs('#mfa-method').value;
      const data = await api('/users/me/mfa/start', { method: 'POST', body: { method: selectedMethod } });
      const methodLabel = selectedMethod === 'app' ? 'Escanea el código QR en tu app (simulado)' : 'Te hemos enviado un código';
      qs('#mfa-flow').innerHTML = `
        <div class="notice"><strong>${methodLabel}</strong><br>Modo de prueba: tu código es <strong>${data.devCode}</strong></div>
        <div id="mfa-confirm-err"></div>
        <div class="field"><label>Ingresa el código de 6 dígitos</label><input type="text" id="mfa-code" maxlength="6"></div>
        <div style="display:flex; gap:10px;">
          <button class="btn btn-primary" style="width:auto; padding:10px 18px;" id="mfa-confirm">Confirmar y activar</button>
          <button class="btn btn-ghost" style="width:auto; padding:10px 18px;" id="mfa-cancel">Cancelar</button>
        </div>
      `;
      qs('#mfa-cancel').addEventListener('click', renderSeguridad);
      qs('#mfa-confirm').addEventListener('click', async () => {
        try {
          await api('/users/me/mfa/confirm', { method: 'POST', body: { code: qs('#mfa-code').value } });
          toast('MFA activado exitosamente.', 'ok');
          renderSeguridad();
        } catch (err) {
          qs('#mfa-confirm-err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
        }
      });
    });

    const notifToggle = qs('#notif-email-toggle');
    notifToggle && notifToggle.addEventListener('change', async () => {
      const checked = notifToggle.checked;
      try {
        const data = await api('/users/me/notification-prefs', { method: 'PUT', body: { notifyByEmail: checked } });
        state.user = data.user;
        toast(checked ? 'Notificaciones por correo activadas.' : 'Notificaciones por correo desactivadas.', 'ok');
      } catch (err) {
        notifToggle.checked = !checked;
        toast(err.message || 'No se pudo actualizar la preferencia.', 'err');
      }
    });
  }

  // ---------------- HU065 menu de configuracion ----------------
  async function renderConfiguracion() {
    const admin = isAdmin();
    const cards = [
      { href: '#/app/perfil', icon: ICONS.users, title: 'Mi perfil', desc: 'Consulta y edita tus datos personales.' },
      { href: '#/app/seguridad', icon: ICONS.shield, title: 'Seguridad y notificaciones', desc: 'Contraseña, verificación en dos pasos (MFA) y preferencias de correo.' },
      { href: '#/app/manual', icon: ICONS.check, title: 'Manual de instrucciones', desc: 'Guía paso a paso de las funciones del sistema según tu rol.' },
    ];
    if (admin) {
      cards.push({ href: '#/app/usuarios', icon: ICONS.users, title: 'Usuarios', desc: 'Crear, activar/desactivar y modificar cuentas del sistema.' });
      cards.push({ href: '#/app/instituciones', icon: ICONS.building, title: 'Instituciones', desc: 'Administrar instituciones y los ciclos/periodos de inscripción de cada una.' });
    }
    if (canSeeAuditoria()) {
      cards.push({ href: '#/app/auditoria', icon: ICONS.bell, title: 'Auditoría', desc: 'Bitácora de eventos del sistema.' });
    }
    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Configuración</h2><div class="sub">Accesos rápidos a los ajustes de tu cuenta${admin ? ' y del sistema' : ''}.</div></div></div>
      <div class="settings-grid">
        ${cards.map((c) => `
          <div class="settings-card" data-nav="${c.href}">
            <div class="kpi-icon">${c.icon}</div>
            <h3>${escapeHtml(c.title)}</h3>
            <p>${escapeHtml(c.desc)}</p>
          </div>
        `).join('')}
      </div>
    `;
    bindShellEvents();
  }

  // ---------------- HU133 manual de instrucciones ----------------
  async function renderManual() {
    const role = (state.user || {}).role;
    const secciones = [];

    secciones.push({
      titulo: 'Primeros pasos',
      abierto: true,
      html: `
        <p>Inicia sesión con tu correo y contraseña. Si tu cuenta tiene la verificación en dos pasos (MFA) activada, se te pedirá además un código de 6 dígitos.</p>
        <ul>
          <li>¿Olvidaste tu contraseña? Usa el enlace "¿Olvidaste tu contraseña?" en la pantalla de inicio de sesión.</li>
          <li>Puedes cambiar tu contraseña y activar/desactivar el MFA desde <a href="#/app/seguridad">Seguridad</a>.</li>
          <li>Desde <a href="#/app/seguridad">Seguridad</a> también puedes activar o desactivar el envío de notificaciones por correo electrónico.</li>
          <li>Tus datos personales se editan desde <a href="#/app/perfil">Mi perfil</a>.</li>
        </ul>
      `,
    });

    if (role === 'Tutor') {
      secciones.push({
        titulo: 'Inscribir a un estudiante',
        html: `
          <ol>
            <li>Ve a <a href="#/app/inscripciones">Inscripciones</a> y, si es la primera vez, agrega primero al estudiante.</li>
            <li>Presiona "Nueva inscripción", elige la institución y el ciclo escolar, y confirma.</li>
            <li>Sube los documentos solicitados desde el botón "Documentos" de la inscripción.</li>
            <li>El estado (Pendiente, Aprobada o Rechazada) se actualiza en la misma lista, y recibirás una notificación (y un correo, si lo tienes activado) cuando la institución decida.</li>
            <li>Solo los borradores expiran después de 20 minutos de inactividad; recibirás un aviso a los 10 minutos.</li>
          </ol>
        `,
      });
      secciones.push({
        titulo: 'Agendar una cita',
        html: `
          <p>Desde <a href="#/app/citas">Citas</a> puedes solicitar una cita con una institución eligiendo fecha y hora disponibles. Antes de elegir la fecha, puedes revisar el enlace "Ver calendario de citas de esta institución" en el formulario para ver qué días ya tienen citas agendadas.</p>
          <p>La institución puede confirmar la cita, rechazarla (si todavía está Pendiente) o cancelarla (si ya estaba Confirmada); en cualquier caso, se te notificará el cambio.</p>
        `,
      });
      secciones.push({
        titulo: 'Calificar y reportar una institución',
        html: `
          <p>Una vez tengas una inscripción aprobada o una cita confirmada con una institución, podrás calificarla (1 a 5 estrellas) o reportar un problema desde los botones que aparecen junto a esa inscripción o cita.</p>
        `,
      });
    }

    if (role === 'Personal de institución') {
      secciones.push({
        titulo: 'Decidir solicitudes de inscripción',
        html: `
          <p>En <a href="#/app/inscripciones">Inscripciones</a> verás las solicitudes dirigidas a tu institución. Revisa los documentos adjuntos y aprueba o rechaza indicando un motivo cuando corresponda. Las solicitudes enviadas no se abandonan por inactividad del borrador.</p>
        `,
      });
      secciones.push({
        titulo: 'Gestionar citas',
        html: `
          <p>En <a href="#/app/citas">Citas</a> puedes aceptar una cita Pendiente, rechazarla (indicando un motivo) o cancelar una cita Pendiente o Aceptada. También puedes consultar el <a href="${(state.user || {}).institucionId ? `#/app/instituciones/${state.user.institucionId}/calendario` : '#/app/citas'}">calendario de tu institución</a> para ver todas las citas agendadas por día.</p>
        `,
      });
      secciones.push({
        titulo: 'Configurar ciclos y periodos de inscripción',
        html: `
          <p>Desde la ficha de tu institución (menú Instituciones) puedes definir los periodos habilitados para cada ciclo escolar, con sus fechas de inicio y cierre. Mientras no definas un periodo, las inscripciones se aceptan sin restricción de fecha.</p>
        `,
      });
    }

    if (['Administrador', 'Soporte'].includes(role)) {
      secciones.push({
        titulo: 'Gestión de usuarios',
        html: `
          <p>Desde <a href="#/app/usuarios">Usuarios</a> puedes crear cuentas de Administrador, Soporte, Personal de institución y Auditoría, activarlas/desactivarlas, editarlas y restablecer su contraseña. Los cambios en cuentas de Administrador generan una notificación al resto del equipo administrativo.</p>
        `,
      });
      secciones.push({
        titulo: 'Gestión de instituciones',
        html: `
          <p>Desde <a href="#/app/instituciones">Instituciones</a> puedes agregar instituciones, editarlas, activarlas/desactivarlas y configurar sus ciclos y periodos de inscripción.</p>
        `,
      });
      secciones.push({
        titulo: 'Analíticas',
        html: `
          <p><a href="#/app/analiticas">Analíticas</a> resume el uso del sistema: usuarios, instituciones, inscripciones, citas, calificaciones, reportes, recuperación de contraseña y correos enviados.</p>
        `,
      });
    }

    if (canSeeAuditoria()) {
      secciones.push({
        titulo: 'Bitácora de auditoría',
        html: `
          <p>En <a href="#/app/auditoria">Auditoría</a> se registran los eventos importantes del sistema (inicios de sesión, cambios de usuarios/instituciones, decisiones sobre inscripciones y citas, etc.). Puedes filtrar por tipo de acción, por texto y por rango de fechas.</p>
        `,
      });
    }

    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Manual de instrucciones</h2><div class="sub">Guía rápida de las funciones disponibles para tu rol (${escapeHtml(role || '')}).</div></div></div>
      <div class="chart-card">
        ${secciones.map((s, i) => `
          <details class="manual-item" ${s.abierto ? 'open' : ''}>
            <summary>${escapeHtml(s.titulo)}</summary>
            ${s.html}
          </details>
        `).join('')}
      </div>
    `;
    bindShellEvents();
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
      <div class="page-head"><div><h2>Usuarios</h2><div class="sub">Administración de cuentas del sistema.</div></div>
        ${canCreateUsuario() ? `<button class="btn btn-primary" style="width:auto; padding:10px 18px;" data-nav="#/app/usuarios/nuevo">Nuevo usuario</button>` : ''}
      </div>
      <div class="filters">
        <input id="f-q" placeholder="Buscar por nombre o correo..." value="${escapeHtml(query.q || '')}">
        <select id="f-role">${roles.map((r) => `<option ${query.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <select id="f-estado">${estados.map((r) => `<option ${query.estado === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
      </div>
      <div class="table-card">
        <table>
          <thead><tr><th>Usuario</th><th>Rol</th><th>Institución</th><th>Estado</th><th>Último acceso</th><th>Acciones</th></tr></thead>
          <tbody>
            ${users.map((u, i) => {
              const rs = ROLE_STYLE[u.role] || { bg: '#eee', fg: '#333' };
              const [avBg, avFg] = avatarColor(i);
              const avStyle = u.foto ? `background-image:url('/api/users/${u.id}/foto?v=${encodeURIComponent(u.foto.uploadedAt)}');background-size:cover;background-position:center;` : `background:${avBg};color:${avFg}`;
              const active = u.estado === 'Activo';
              return `<tr>
                <td><div class="user-cell"><span class="av" style="${avStyle}">${u.foto ? '' : initials(u.nombre)}</span><span><div class="name">${escapeHtml(u.nombre)}</div><div class="mail">${escapeHtml(u.email)}</div></span></div></td>
                <td><span class="pill" style="background:${rs.bg};color:${rs.fg}">${escapeHtml(u.role)}</span></td>
                <td>${escapeHtml(u.institucionNombre || '—')}</td>
                <td><span class="estado-cell"><span class="dot" style="background:${active ? '#2e9e5b' : '#9aa0a6'}"></span>${u.estado}</span></td>
                <td>${fmtDate(u.lastAccess)}</td>
                <td><span class="actions-cell">
                  ${canEditUser(u.role) ? `<button class="neutral" data-edit="${u.id}" data-name="${escapeHtml(u.nombre)}" data-role="${escapeHtml(u.role)}">Modificar</button>` : ''}
                  ${canResetPassword(u.role) ? `<button class="neutral" data-reset="${u.id}" data-name="${escapeHtml(u.nombre)}" data-email="${escapeHtml(u.email)}">Resetear</button>` : ''}
                  ${canToggleEstado() ? `<button class="${active ? 'danger' : 'ok'}" data-toggle="${u.id}" data-name="${escapeHtml(u.nombre)}" data-role="${escapeHtml(u.role)}" data-active="${active}">${active ? 'Desactivar' : 'Activar'}</button>` : ''}
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
      if (b.dataset.active === 'true') {
        const uId = b.dataset.toggle;
        if (uId === state.user.id) {
          toast('No puedes desactivar tu propia cuenta.', 'err');
          return;
        }
        if (b.dataset.role === 'Administrador') {
          const activeAdmins = users.filter(u => u.role === 'Administrador' && u.estado === 'Activo');
          if (activeAdmins.length <= 1) {
            toast('No puedes desactivar al último Administrador activo del sistema.', 'err');
            return;
          }
        }
        showConfirmModal({
          title: 'Desactivar usuario',
          bodyHtml: `<p>¿Desactivar a ${escapeHtml(b.dataset.name)}?</p><p>No podrá iniciar sesión hasta que un administrador reactive su cuenta.</p>`,
          confirmText: 'Desactivar usuario', danger: true,
          onConfirm: async () => {
            await api('/users/' + b.dataset.toggle + '/toggle-estado', { method: 'POST' });
            await renderUsuarios(query);
          }
        });
      } else {
        try {
          await api('/users/' + b.dataset.toggle + '/toggle-estado', { method: 'POST' });
          renderUsuarios(query);
        } catch(e) {
          toast(e.message, 'err');
        }
      }
    }));
    qsa('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
      if (b.disabled) return;
      
      const modal = document.createElement('div');
      modal.className = 'sidebar-backdrop visible';
      modal.style.zIndex = '9999';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';
      modal.innerHTML = `
        <div class="card" style="position:relative; z-index:10000; width: 400px; padding: 24px; text-align: left;">
          <h3 style="margin-top:0;">Restablecer contraseña</h3>
          <p style="margin-bottom:10px;">¿Restablecer el acceso para <strong>${escapeHtml(b.dataset.name)}</strong> (${escapeHtml(b.dataset.email)})?</p>
          <p style="margin-bottom:20px; font-size:0.9em; color:#666;">La contraseña anterior dejará de funcionar inmediatamente.</p>
          <div style="display:flex; gap:10px; justify-content:flex-end;">
            <button class="btn btn-ghost" style="width:auto;" id="cancel-reset">Cancelar</button>
            <button class="btn btn-primary" style="width:auto;" id="confirm-reset">Restablecer contraseña</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      qs('#cancel-reset', modal).addEventListener('click', () => modal.remove());
      qs('#confirm-reset', modal).addEventListener('click', async () => {
        const confirmBtn = qs('#confirm-reset', modal);
        if (confirmBtn.disabled) return;
        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Procesando...';
        b.disabled = true;

        try {
          const data = await api('/users/' + b.dataset.reset + '/reset-password', { method: 'POST' });
          modal.remove();
          
          const successModal = document.createElement('div');
          successModal.className = 'sidebar-backdrop visible';
          successModal.style.zIndex = '9999';
          successModal.style.display = 'flex';
          successModal.style.alignItems = 'center';
          successModal.style.justifyContent = 'center';
          successModal.innerHTML = `
            <div class="card" style="position:relative; z-index:10000; width: 420px; padding: 24px; text-align: left;">
              <h3 style="margin-top:0; color:#1c7c72;">Acceso restablecido</h3>
              <p style="margin-bottom:15px;">Se ha generado una nueva contraseña temporal. En el entorno de producción, esta será enviada por correo electrónico.</p>
              <div style="background:#f5f7f9; padding:12px; border-radius:4px; font-family:monospace; font-size:1.1em; display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <span id="temp-pw-display">${escapeHtml(data.devTempPassword)}</span>
                <button class="btn btn-ghost btn-small" id="copy-pw" style="width:auto; padding:4px 8px;">Copiar</button>
              </div>
              <p style="font-size:0.85em; color:#af112b; margin-bottom:20px;"><strong>Advertencia:</strong> Esta contraseña solo se muestra una vez. Asegúrate de copiarla ahora.</p>
              <p style="font-size:0.85em; color:#666; margin-bottom:20px;">Estado del correo: <em>${escapeHtml(data.emailStatus || 'simulado')}</em></p>
              <button class="btn btn-primary btn-block" id="close-success">Cerrar</button>
            </div>
          `;
          document.body.appendChild(successModal);

          qs('#copy-pw', successModal).addEventListener('click', () => {
            navigator.clipboard.writeText(data.devTempPassword);
            qs('#copy-pw', successModal).textContent = '¡Copiada!';
            setTimeout(() => {
              if (qs('#copy-pw', successModal)) qs('#copy-pw', successModal).textContent = 'Copiar';
            }, 2000);
          });
          
          qs('#close-success', successModal).addEventListener('click', () => {
            successModal.remove();
            renderUsuarios(query);
          });
          
        } catch(e) {
          modal.remove();
          b.disabled = false;
          toast(e.message, 'err');
        }
      });
    }));
  }

  // ---------------- HU002-04/HU015 crear/modificar usuario ----------------
  async function renderUsuarioForm(id) {
    const { institutions } = await api('/institutions');
    let editing = null;
    let allUsers = [];
    if (id) {
      const { users } = await api('/users');
      allUsers = users;
      editing = users.find((u) => u.id === id);
    }
    // F2.1: roles disponibles según quién crea
    const rolesDisponibles = isOnlyAdmin() ? ROLES_ADMIN_PUEDE_CREAR : ROLES_SOPORTE_PUEDE_CREAR;
    // Al editar, si Soporte intenta editar un usuario privilegiado, redirigir
    if (id && editing && !canEditUser(editing.role)) {
      qs('.main').innerHTML = '<div class="empty-state">No tienes permiso para modificar este usuario.</div>';
      return;
    }
    const roles = editing
      ? (isOnlyAdmin() ? ROLES_ADMIN_PUEDE_CREAR : ROLES_SOPORTE_PUEDE_CREAR)
      : rolesDisponibles;
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="#/app/usuarios">${ICONS.back} Volver a usuarios</button>
      <div class="page-head"><h2>${editing ? 'Modificar usuario' : 'Nuevo usuario'}</h2></div>
      <div class="chart-card" style="max-width:560px;">
        <div id="err"></div>
        <form id="user-form">
          <div class="field"><label>Rol</label>
            ${editing ? `<input type="text" value="${escapeHtml(editing.role)}" disabled class="input" style="background:#f1f3f4; color:#5f6368;" /><input type="hidden" name="role" id="role-select" value="${escapeHtml(editing.role)}" />` : `<select name="role" id="role-select">${roles.map((r) => `<option>${r}</option>`).join('')}</select>`}
          </div>
          <div class="field"><label>Nombre completo</label><input type="text" name="nombre" value="${escapeHtml(editing ? editing.nombre : '')}" required class="input"></div>
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
          if (editing.role === 'Administrador' && body.role && body.role !== 'Administrador' && editing.estado === 'Activo') {
            if (editing.id === state.user.id) {
              return qs('#err').innerHTML = fieldErrorsBlock(['No puedes cambiar tu propio rol de Administrador.']);
            }
            const activeAdmins = allUsers.filter(u => u.role === 'Administrador' && u.estado === 'Activo');
            if (activeAdmins.length <= 1) {
              return qs('#err').innerHTML = fieldErrorsBlock(['No puedes cambiar el rol del último Administrador activo del sistema.']);
            }
          }
          await api('/users/' + editing.id, { method: 'PUT', body });
          toast('Usuario actualizado.', 'ok');
        } else {
          const data = await api('/users', { method: 'POST', body });
          const successModal = document.createElement('div');
          successModal.className = 'sidebar-backdrop visible';
          successModal.style.zIndex = '9999';
          successModal.style.display = 'flex';
          successModal.style.alignItems = 'center';
          successModal.style.justifyContent = 'center';
          successModal.innerHTML = `
            <div class="card" style="position:relative; z-index:10000; width: 420px; padding: 24px; text-align: left;">
              <h3 style="margin-top:0; color:#1c7c72;">Usuario creado exitosamente</h3>
              <p style="margin-bottom:15px;">Se ha generado una contraseña temporal inicial. En producción, será enviada al correo del usuario.</p>
              <div style="background:#f5f7f9; padding:12px; border-radius:4px; font-family:monospace; font-size:1.1em; display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <span id="temp-pw-display">${escapeHtml(data.devTempPassword)}</span>
                <button type="button" class="btn btn-ghost btn-small" id="copy-pw" style="width:auto; padding:4px 8px;">Copiar</button>
              </div>
              <p style="font-size:0.85em; color:#af112b; margin-bottom:20px;"><strong>Advertencia:</strong> Esta contraseña solo se muestra una vez. Asegúrate de copiarla ahora.</p>
              <p style="font-size:0.85em; color:#666; margin-bottom:20px;">Estado del correo: <em>${escapeHtml(data.emailStatus || 'simulado')}</em></p>
              <button type="button" class="btn btn-primary btn-block" id="close-success">Continuar</button>
            </div>
          `;
          document.body.appendChild(successModal);

          qs('#copy-pw', successModal).addEventListener('click', (ev) => {
            ev.preventDefault();
            navigator.clipboard.writeText(data.devTempPassword);
            qs('#copy-pw', successModal).textContent = '¡Copiada!';
            setTimeout(() => {
              if (qs('#copy-pw', successModal)) qs('#copy-pw', successModal).textContent = 'Copiar';
            }, 2000);
          });
          
          qs('#close-success', successModal).addEventListener('click', (ev) => {
            ev.preventDefault();
            successModal.remove();
            navigate('#/app/usuarios');
          });
          return;
        }
        navigate('#/app/usuarios');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
  }

  // ---------------- Instituciones ----------------
  function calificacionLabel(promedio, total) {
    if (promedio === null || promedio === undefined || !total) return '<span class="help">Sin calificar</span>';
    return `★ ${promedio.toFixed(1)} <span class="help">(${total})</span>`;
  }

  const RADIOS_KM = ['Cualquier distancia', '10', '25', '50', '100'];

  async function renderInstituciones(query) {
    const params = new URLSearchParams();
    const page = parseInt(query.page) || 1;
    const limit = parseInt(query.limit) || 10;
    if (query.q) params.set('q', query.q);
    if (query.provincia) params.set('provincia', query.provincia);
    if (query.estado) params.set('estado', query.estado);
    if (query.calificacionMin) params.set('calificacionMin', query.calificacionMin);
    if (query.municipio) params.set('municipio', query.municipio);
    params.set('page', page);
    params.set('limit', limit);
    const geoActiva = !!(query.lat && query.lng);
    if (geoActiva) {
      params.set('lat', query.lat);
      params.set('lng', query.lng);
      if (query.radioKm) params.set('radioKm', query.radioKm);
    }
    const { total, totalFiltradas, institutions, municipios } = await api('/institutions?' + params.toString());
    const provinciasFiltro = ['Todas', ...PROVINCIAS];
    const estados = ['Todos', 'Activo', 'Inactivo'];
    const calificaciones = ['Cualquiera', '4', '3'];
    const municipiosFiltro = ['Todos', ...(municipios || [])];

    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Instituciones</h2><div class="sub">Centros educativos registrados en el sistema.</div></div></div>
      <div class="filters">
        <input id="f-q" placeholder="Buscar por nombre o distrito..." value="${escapeHtml(query.q || '')}">
        <select id="f-provincia">${provinciasFiltro.map((p) => `<option ${query.provincia === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}</select>
        <select id="f-municipio">${municipiosFiltro.map((m) => `<option ${(query.municipio || 'Todos') === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('')}</select>
        <select id="f-estado">${estados.map((r) => `<option ${query.estado === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        <select id="f-calificacion">${calificaciones.map((c) => `<option value="${c}" ${(query.calificacionMin || 'Cualquiera') === c ? 'selected' : ''}>${c === 'Cualquiera' ? 'Cualquier calificación' : c + '+ estrellas'}</option>`).join('')}</select>
        <button class="btn btn-secondary" id="f-geo-btn" type="button" style="width:auto; padding:10px 14px;">${ICONS.building} ${geoActiva ? 'Actualizar mi ubicación' : 'Cerca de mí'}</button>
        ${geoActiva ? `
          <select id="f-radio">${RADIOS_KM.map((r) => `<option value="${r === 'Cualquier distancia' ? '' : r}" ${(query.radioKm || '') === (r === 'Cualquier distancia' ? '' : r) ? 'selected' : ''}>${r === 'Cualquier distancia' ? r : 'Hasta ' + r + ' km'}</option>`).join('')}</select>
          <button class="btn btn-ghost" id="f-geo-clear" type="button" style="width:auto; padding:10px 14px;">Quitar ubicación</button>
        ` : ''}
        <button class="btn btn-primary spacer" style="width:auto; padding:10px 18px;" data-nav="#/app/instituciones/nueva">Nueva institución</button>
      </div>
      ${geoActiva ? '<p class="help" style="margin:-6px 0 16px;">Ordenado por cercanía a tu ubicación actual (HU021).</p>' : ''}
      <div class="table-card">
        <table>
          <thead><tr><th>Institución</th><th>Provincia</th><th>Distrito</th><th>Tipo</th><th>Calificación</th>${geoActiva ? '<th>Distancia</th>' : ''}<th>Fecha</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${institutions.map((inst) => {
              const ts = INST_TIPO_STYLE[inst.tipo] || { bg: '#eee', fg: '#333' };
              const active = (inst.estado || 'Activo') === 'Activo';
              return `<tr>
                <td data-label="Institución"><div class="user-cell"><span class="av" style="background:#e1ecf7;color:#2a5c96;${inst.logo ? `background-image:url('/api/institutions/${inst.id}/logo?v=${encodeURIComponent(inst.logo.uploadedAt)}');background-size:cover;background-position:center;` : ''}">${inst.logo ? '' : ICONS.building}</span><span><div class="name">${escapeHtml(inst.nombre)}</div><div class="mail">${escapeHtml(inst.correo || inst.direccion || 'Sin correo registrado')}</div><div class="help" style="font-size:11px;">RNC: ${escapeHtml(inst.rnc || '—')} | Tel: ${escapeHtml(inst.telefono || '—')}</div></span></div></td>
                <td data-label="Provincia">${escapeHtml(inst.provincia)}</td>
                <td data-label="Distrito">${escapeHtml(inst.distrito)}${inst.municipio ? ' · ' + escapeHtml(inst.municipio) : ''}</td>
                <td data-label="Tipo"><span class="pill" style="background:${ts.bg};color:${ts.fg}">${escapeHtml(inst.tipo)}</span></td>
                <td data-label="Calificación">${calificacionLabel(inst.calificacionPromedio, inst.totalCalificaciones)}</td>
                ${geoActiva ? `<td data-label="Fecha">${inst.distanciaKm !== null && inst.distanciaKm !== undefined ? inst.distanciaKm + ' km' : '—'}</td>` : ''}
                <td data-label="Estado">${fmtDate(inst.createdAt)}</td>
                <td data-label="Acciones"><span class="estado-cell"><span class="dot" style="background:${active ? '#2e9e5b' : '#9aa0a6'}"></span>${inst.estado || 'Activo'}</span></td>
                <td><span class="actions-cell">
                  ${isAdmin() || (state.user && state.user.role === 'Personal de institución' && state.user.institucionId === inst.id) ? `<button class="neutral" data-edit="${inst.id}">Modificar</button>` : ''}
                  ${isOnlyAdmin() ? `<button class="${active ? 'danger' : 'ok'}" data-toggle="${inst.id}">${active ? 'Desactivar' : 'Activar'}</button>` : ''}
                  <button class="neutral" data-ver-detalle="${inst.id}">Detalle</button>
                  <button class="neutral" data-ver-calificaciones="${inst.id}">Calificaciones</button>
                  <button class="neutral" data-ver-reportes="${inst.id}">Reportes</button>
                  <button class="neutral" data-ver-periodos="${inst.id}">Periodos</button>
                  <button class="neutral" data-ver-calendario="${inst.id}">Calendario</button>
                </span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div class="table-footer" style="display:flex; justify-content:space-between; align-items:center;">
          <span>Mostrando ${institutions.length} de ${totalFiltradas ?? total} instituciones${geoActiva ? ' (dentro del filtro de ubicación)' : ''}</span>
          <div class="pagination">
            <button class="btn btn-ghost" id="p-prev" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
            <span style="margin: 0 10px;">Página ${page} de ${Math.ceil((totalFiltradas ?? total) / limit) || 1}</span>
            <button class="btn btn-ghost" id="p-next" ${page >= Math.ceil((totalFiltradas ?? total) / limit) ? 'disabled' : ''}>Siguiente</button>
          </div>
        </div>
      </div>
    `;
    bindShellEvents();

    function applyFilters(extra) {
      const p = new URLSearchParams();
      if (qs('#f-q').value) p.set('q', qs('#f-q').value);
      if (qs('#f-provincia').value !== 'Todas') p.set('provincia', qs('#f-provincia').value);
      if (qs('#f-municipio').value !== 'Todos') p.set('municipio', qs('#f-municipio').value);
      if (qs('#f-estado').value !== 'Todos') p.set('estado', qs('#f-estado').value);
      if (qs('#f-calificacion').value !== 'Cualquiera') p.set('calificacionMin', qs('#f-calificacion').value);
      if (geoActiva && !(extra && extra.clearGeo)) {
        p.set('lat', query.lat);
        p.set('lng', query.lng);
        const radioSel = qs('#f-radio');
        const radioVal = extra && extra.radioKm !== undefined ? extra.radioKm : (radioSel ? radioSel.value : '');
        if (radioVal) p.set('radioKm', radioVal);
      }
      if (extra && extra.lat !== undefined) { p.set('lat', extra.lat); p.set('lng', extra.lng); }
      if (extra && extra.page) p.set('page', extra.page);
      navigate('#/app/instituciones?' + p.toString());
    }
    const prevBtn = qs('#p-prev');
    const nextBtn = qs('#p-next');
    if (prevBtn) prevBtn.addEventListener('click', () => applyFilters({ page: page - 1 }));
    if (nextBtn) nextBtn.addEventListener('click', () => applyFilters({ page: page + 1 }));
    qs('#f-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilters(); });
    qs('#f-provincia').addEventListener('change', () => { qs('#f-municipio').value = 'Todos'; applyFilters(); });
    qs('#f-municipio').addEventListener('change', () => applyFilters());
    qs('#f-estado').addEventListener('change', () => applyFilters());
    qs('#f-calificacion').addEventListener('change', () => applyFilters());
    qsa('[data-ver-calificaciones]').forEach((b) => b.addEventListener('click', () => navigate('#/app/instituciones/' + b.dataset.verCalificaciones + '/calificaciones')));
    qsa('[data-ver-reportes]').forEach((b) => b.addEventListener('click', () => navigate('#/app/instituciones/' + b.dataset.verReportes + '/reportes')));
    qsa('[data-ver-periodos]').forEach((b) => b.addEventListener('click', () => navigate('#/app/instituciones/' + b.dataset.verPeriodos + '/periodos')));
    qsa('[data-ver-calendario]').forEach((b) => b.addEventListener('click', () => navigate('#/app/instituciones/' + b.dataset.verCalendario + '/calendario')));
    qsa('[data-ver-detalle]').forEach((b) => b.addEventListener('click', () => navigate('#/app/instituciones/' + b.dataset.verDetalle + '/detalle')));

    qsa('[data-edit]').forEach((b) => b.addEventListener('click', () => navigate('#/app/instituciones/' + b.dataset.edit + '/editar')));
    qsa('[data-toggle]').forEach((b) => b.addEventListener('click', () => {
      const inst = institutions.find(i => i.id === b.dataset.toggle);
      const active = (inst.estado || 'Activo') === 'Activo';
      if (active) {
        showConfirmModal({
          title: 'Desactivar institución',
          bodyHtml: `<p>¿Estás seguro de que deseas desactivar <strong>${escapeHtml(inst.nombre)}</strong>? Dejará de aparecer en la búsqueda pública, pero sus datos se conservarán.</p>`,
          confirmText: 'Desactivar institución',
          danger: true,
          onConfirm: async () => {
            await api('/institutions/' + inst.id + '/toggle-estado', { method: 'POST' });
            toast('Institución desactivada.', 'ok');
            renderInstituciones(query);
          }
        });
      } else {
        showConfirmModal({
          title: 'Activar institución',
          bodyHtml: `<p>¿Deseas volver a activar <strong>${escapeHtml(inst.nombre)}</strong>? Volverá a ser visible en las búsquedas públicas.</p>`,
          confirmText: 'Activar institución',
          danger: false,
          onConfirm: async () => {
            await api('/institutions/' + inst.id + '/toggle-estado', { method: 'POST' });
            toast('Institución reactivada.', 'ok');
            renderInstituciones(query);
          }
        });
      }
    }));

    // HU021: usar la ubicación actual del dispositivo para filtrar/ordenar por cercanía.
    const geoBtn = qs('#f-geo-btn');
    geoBtn && geoBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        toast('Tu navegador no permite obtener la ubicación del dispositivo.', 'err');
        return;
      }
      geoBtn.disabled = true;
      geoBtn.textContent = 'Obteniendo ubicación…';
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          applyFilters({ lat: String(pos.coords.latitude), lng: String(pos.coords.longitude) });
        },
        (err) => {
          geoBtn.disabled = false;
          geoBtn.textContent = geoActiva ? 'Actualizar mi ubicación' : 'Cerca de mí';
          const msg = err && err.code === 1
            ? 'No se pudo usar tu ubicación: el permiso fue denegado.'
            : 'No se pudo obtener tu ubicación actual. Inténtalo de nuevo.';
          toast(msg, 'err');
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
      );
    });
    const radioSelect = qs('#f-radio');
    radioSelect && radioSelect.addEventListener('change', () => applyFilters({ radioKm: radioSelect.value }));
    const geoClearBtn = qs('#f-geo-clear');
    geoClearBtn && geoClearBtn.addEventListener('click', () => applyFilters({ clearGeo: true }));
  }

  // HU026: vista de detalle de una institución.
  async function renderInstitucionDetalle(institucionId) {
    const { institution } = await api('/institutions/' + institucionId);
    const ts = INST_TIPO_STYLE[institution.tipo] || { bg: '#eee', fg: '#333' };
    const active = (institution.estado || 'Activo') === 'Activo';
    const backHref = isAdmin() ? '#/app/instituciones' : (state.user.role === 'Tutor' ? '#/app/citas' : '#/app/citas');
    const fondoUrl = institution.fondo ? '/api/institutions/' + institution.id + '/fondo?v=' + encodeURIComponent(institution.fondo.uploadedAt) : null;
    const logoUrl = institution.logo ? '/api/institutions/' + institution.id + '/logo?v=' + encodeURIComponent(institution.logo.uploadedAt) : null;

    qs('.main').innerHTML = `
      <button class="back-link" data-nav="${backHref}">${ICONS.back} Volver</button>
      <div class="inst-hero" style="${fondoUrl ? `background-image:url('${fondoUrl}')` : 'background:#e1ecf7;'}">
        <div class="inst-hero-overlay">
          <div class="inst-hero-body" style="display:flex; align-items:center; gap:20px;">
            ${logoUrl ? `<img src="${logoUrl}" style="width:80px; height:80px; border-radius:12px; object-fit:cover; border:3px solid #fff;">` : `<div style="width:80px; height:80px; border-radius:12px; background:#fff; display:flex; align-items:center; justify-content:center; border:3px solid #eee;">${ICONS.building}</div>`}
            <div>
              <h2>${escapeHtml(institution.nombre)}</h2>
              <span class="estado-cell"><span class="dot" style="background:${active ? '#2e9e5b' : '#9aa0a6'}"></span>${institution.estado || 'Activo'}</span>
            </div>
          </div>
          ${(isAdmin() || (state.user.role === 'Personal de institución' && String(state.user.institucionId) === String(institution.id))) ? `
          <div class="inst-hero-actions">
            <button class="btn btn-secondary btn-small" data-nav="#/app/instituciones/${institution.id}/editar">Editar detalles</button>
            <button class="btn btn-secondary btn-small" data-nav="#/app/instituciones/${institution.id}/periodos">Ajustar periodos</button>
          </div>
          ` : ''}
        </div>
      </div>
      <div id="foto-err"></div>
      <div class="page-head" style="margin-top:16px;">
        <div class="sub">Detalle de la institución.</div>
      </div>
      <div class="chart-row" style="align-items:start;">
        <div class="chart-card">
          <h3>Información general</h3>
          <div class="two-col">
            <div><div class="help">Tipo</div><div><span class="pill" style="background:${ts.bg};color:${ts.fg}">${escapeHtml(institution.tipo)}</span></div></div>
            <div><div class="help">Distrito educativo</div><div>${escapeHtml(institution.distrito)}</div></div>
            <div><div class="help">Provincia</div><div>${escapeHtml(institution.provincia)}</div></div>
            <div><div class="help">Municipio</div><div>${escapeHtml(institution.municipio || 'No registrado')}</div></div>
            <div><div class="help">Dirección</div><div>${escapeHtml(institution.direccion || 'No registrada')}</div></div>
            <div><div class="help">Teléfono</div><div>${escapeHtml(institution.telefono || 'No registrado')}</div></div>
          </div>
        </div>
        <div class="chart-card">
          <h3>Calificación y actividad</h3>
          <p style="font-size:1.3rem; margin-bottom:6px;">${calificacionLabel(institution.calificacionPromedio, institution.totalCalificaciones)}</p>
          <p class="help" style="margin-bottom:18px;">Basado en ${institution.totalCalificaciones} calificación${institution.totalCalificaciones === 1 ? '' : 'es'}.</p>
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <button class="btn btn-secondary" style="width:auto; padding:9px 16px;" data-nav="#/app/instituciones/${institution.id}/calificaciones">Ver calificaciones</button>
            <button class="btn btn-secondary" style="width:auto; padding:9px 16px;" data-nav="#/app/instituciones/${institution.id}/reportes">Ver reportes</button>
            <button class="btn btn-secondary" style="width:auto; padding:9px 16px;" data-nav="#/app/instituciones/${institution.id}/calendario">Ver calendario</button>
          </div>
        </div>
      </div>
    `;
    bindShellEvents();
  }

  const DIAS_SEMANA_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const MESES_NOMBRE = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  // HU061: calendario mensual de citas de una institución.
  async function renderCalendarioInstitucion(institucionId,query={}) {
    const version=++appointmentRenderVersion,container=qs('.main');container.innerHTML='<p class="loading" role="status">Cargando calendario…</p>';
    try {
      const data=await api('/institutions/'+institucionId+'/calendar'+(query.mes?'?mes='+encodeURIComponent(query.mes):''));
      const periods=data.canConfigure?(await api('/institutions/'+institucionId+'/periods')).periods.filter(p=>p.citas):[];
      if(!container.isConnected||version!==appointmentRenderVersion)return;
      const {institucion,mes,dias,slots,canConfigure}=data;const [year,month]=mes.split('-').map(Number);
      const first=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7,last=new Date(Date.UTC(year,month,0)).getUTCDate();const cells=Array(first).fill(null);for(let d=1;d<=last;d++)cells.push(d);
      const monthAt=delta=>{const d=new Date(Date.UTC(year,month-1+delta,1));return d.toISOString().slice(0,7);};
      const dateFor=d=>`${mes}-${String(d).padStart(2,'0')}`;
      container.innerHTML=`<button class="back-link" data-nav="${isAdmin()?'#/app/instituciones':'#/app/citas'}">${ICONS.back} Volver</button><div class="page-head"><div><h2>Calendario — ${escapeHtml(institucion.nombre)}</h2><p class="sub">America/Santo_Domingo (UTC−4). ${data.detalle?'Citas de tu institución.':'Solo se muestran los datos de tus citas.'}</p></div><div class="appointment-actions"><button class="btn btn-secondary" data-nav="#/app/instituciones/${institucionId}/calendario?mes=${monthAt(-1)}">Mes anterior</button><button class="btn btn-secondary" data-nav="#/app/instituciones/${institucionId}/calendario?mes=${monthAt(1)}">Mes siguiente</button></div></div>
        <div id="appointment-update" role="status"></div><section class="chart-card"><h3>${MESES_NOMBRE[month-1]} ${year}</h3><div class="calendar-grid appointment-calendar">
        ${DIAS_SEMANA_CORTO.map(d=>`<div class="calendar-weekday">${d}</div>`).join('')}
        ${cells.map(d=>{if(!d)return '<div class="calendar-cell other-month"></div>';const key=dateFor(d),offered=slots.filter(s=>s.fecha===key);return `<div class="calendar-cell"><div class="calendar-daynum">${d}</div>${offered.length?`<button class="calendar-available" data-nav="#/app/citas/nueva?inst=${institucionId}&mes=${mes}&fecha=${key}">${offered.length} horarios libres</button>`:''}${(dias[key]||[]).slice(0,3).map(a=>`<button class="calendar-appointment" data-nav="#/app/citas/${a.id}/detalle">${escapeHtml(new Intl.DateTimeFormat('es-DO',{timeZone:data.zonaHoraria,hour:'2-digit',minute:'2-digit'}).format(new Date(a.hora)))} · ${escapeHtml(a.estado)}${data.detalle?' · '+escapeHtml(a.tutorNombre):''}</button>`).join('')}${(dias[key]||[]).length>3?`<p>+${dias[key].length-3} citas</p>`:''}</div>`;}).join('')}</div></section>
        <section class="chart-card"><h3>Horarios disponibles — lista accesible</h3>${slots.length?`<ul class="appointment-available-list">${slots.map(s=>`<li><button class="btn btn-secondary" data-nav="#/app/citas/nueva?inst=${institucionId}&mes=${mes}&fecha=${s.fecha}">${escapeHtml(fmtAppointment(s.inicio))} · ${s.disponibles} lugar${s.disponibles===1?'':'es'}</button></li>`).join('')}</ul>`:'<p class="empty-state">No hay horarios disponibles este mes. Puedes cambiar el mes o consultar la configuración con la institución.</p>'}</section>
        <section class="chart-card"><h3>${data.detalle?'Citas de la institución':'Mis citas en esta institución'}</h3><ul class="appointment-available-list">${Object.values(dias).flat().map(a=>`<li><button class="btn btn-secondary" data-nav="#/app/citas/${a.id}/detalle">${escapeHtml(fmtAppointment(a.hora))} · ${escapeHtml(a.estado)} · ${escapeHtml(a.estudianteNombre||'General')}</button></li>`).join('')||'<li>No hay citas para mostrar este mes.</li>'}</ul></section>
        ${canConfigure?`<details class="chart-card"><summary>Configurar franjas de atención</summary><p>Capacidad por horario, independiente del límite total del periodo y de los cupos de inscripción. Las franjas existentes no se sobrescriben ni se reprograman.</p>${periods.length?`<form id="appointment-slot-form"><div class="appointment-config-grid"><label>Periodo<select name="periodId">${periods.map(p=>`<option value="${p.id}">${escapeHtml(p.cicloEscolar)} · ${escapeHtml(fmtAppointment(p.citas.desde))} — ${escapeHtml(fmtAppointment(p.citas.hasta))}</option>`).join('')}</select></label><label>Fecha<input name="fecha" type="date" required></label><label>Desde<input name="desde" type="time" required></label><label>Hasta<input name="hasta" type="time" required></label><label>Duración (minutos)<input name="duracionMinutos" type="number" min="5" max="240" value="30" required></label><label>Lugares por horario<input name="capacidad" type="number" min="1" max="1000" value="1" required></label></div><div id="appointment-config-error" role="alert"></div><button class="btn btn-primary">Crear horarios</button></form>`:`<p>Configura primero el periodo de citas.</p><button class="btn btn-secondary" data-nav="#/app/instituciones/${institucionId}/periodos">Configurar periodos</button>`}</details>`:''}`;
      bindShellEvents();
      const form=qs('#appointment-slot-form');if(form)form.onsubmit=async e=>{e.preventDefault();const button=qs('button',form);button.disabled=true;const body=Object.fromEntries(new FormData(form));body.duracionMinutos=Number(body.duracionMinutos);body.capacidad=Number(body.capacidad);try{await api('/institutions/'+institucionId+'/appointment-slots',{method:'POST',body});await renderCalendarioInstitucion(institucionId,query);}catch(error){qs('#appointment-config-error').textContent=error.message;button.disabled=false;}};
      let checking=false;watchEnrollments(async()=>{if(checking||!container.isConnected||version!==appointmentRenderVersion)return;checking=true;try{const fresh=await api('/institutions/'+institucionId+'/calendar?mes='+mes);if(!container.isConnected||version!==appointmentRenderVersion)return;if(JSON.stringify(fresh)!==JSON.stringify(data)){qs('#appointment-update',container).innerHTML='<p class="notice">Cambió la disponibilidad o alguna cita. <button class="btn btn-secondary" id="calendar-refresh">Actualizar calendario</button></p>';qs('#calendar-refresh').onclick=()=>renderCalendarioInstitucion(institucionId,query);}}catch(_){/* El reintento conserva la configuración escrita. */}finally{checking=false;}},'appointments');
    }catch(error){if(container.isConnected&&version===appointmentRenderVersion)enrollmentError(container,error,()=>renderCalendarioInstitucion(institucionId,query));}
  }

  async function institucionNombre(id) {
    try {
      const { institutions } = await api('/institutions');
      const inst = institutions.find((i) => i.id === id);
      return inst ? inst.nombre : 'Institución';
    } catch (e) { return 'Institución'; }
  }

  async function renderCalificacionesList(institucionId) {
    const [nombre, { ratings, total, promedio }] = await Promise.all([
      institucionNombre(institucionId),
      api('/institutions/' + institucionId + '/ratings'),
    ]);
    const backHref = isAdmin() ? '#/app/instituciones' : '#/app/instituciones/' + institucionId + '/detalle';
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="${backHref}">${ICONS.back} Volver</button>
      <div class="page-head">
        <div><h2>Calificaciones — ${escapeHtml(nombre)}</h2><div class="sub">${total ? `Promedio: ★ ${promedio.toFixed(1)} de ${total} calificación${total === 1 ? '' : 'es'}.` : 'Todavía no tiene calificaciones.'}</div></div>
        ${state.user && state.user.role === 'Tutor' ? `<button class="btn btn-primary" style="width:auto; padding:10px 18px;" data-nav="#/app/calificar/${institucionId}">Calificar institución</button>` : ''}
      </div>
      <div class="notif-list">
        ${ratings.length ? ratings.map((r) => `
          <div class="notif-item">
            <div>
              <div class="t1">★ ${r.estrellas} · ${escapeHtml(r.tutorNombre)}</div>
              ${r.comentario ? `<div class="t2">${escapeHtml(r.comentario)}</div>` : ''}
              <div class="t3">${fmtDate(r.createdAt)}${r.updatedAt ? ' · editada' : ''}</div>
            </div>
          </div>
        `).join('') : '<div class="empty-state">No hay calificaciones todavía.</div>'}
      </div>
    `;
    bindShellEvents();
  }

  async function renderReportesList(institucionId) {
    const [nombre, { reports, total }] = await Promise.all([
      institucionNombre(institucionId),
      api('/institutions/' + institucionId + '/reports'),
    ]);
    const backHref = isAdmin() ? '#/app/instituciones' : '#/app/instituciones/' + institucionId + '/detalle';
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="${backHref}">${ICONS.back} Volver</button>
      <div class="page-head">
        <div><h2>Reportes — ${escapeHtml(nombre)}</h2><div class="sub">${total} reporte${total === 1 ? '' : 's'} disponible${total === 1 ? '' : 's'}.</div></div>
        ${state.user && state.user.role === 'Tutor' ? `<button class="btn btn-primary" style="width:auto; padding:10px 18px;" data-nav="#/app/reportar/${institucionId}">Reportar institución</button>` : ''}
      </div>
      <div class="notif-list">
        ${reports.length ? reports.map((rp) => `
          <div class="notif-item">
            <div>
              <div class="t1">${escapeHtml(rp.motivo)} ${rp.tutorNombre ? `· ${escapeHtml(rp.tutorNombre)}` : ''}</div>
              <div class="t2">${escapeHtml(rp.descripcion)}</div>
              <div class="t3">
                ${fmtDate(rp.createdAt)} 
                ${rp.estado ? `· <span class="badge-chip" style="font-size:0.75rem; padding:2px 6px;">${rp.estado}</span>` : ''}
                ${(rp.evidenciaOriginal || rp.hasEvidencia) ? `· <a href="/api/reports/${rp.id}/evidence" target="_blank" style="color:var(--primary-color);">Ver evidencia</a>` : ''}
              </div>
              ${state.user && ['Administrador', 'Moderador'].includes(state.user.role) && rp.estado === 'Pendiente' ? `
                <div style="margin-top:10px; display:flex; gap:8px;">
                  <button class="btn btn-secondary btn-small action-mod" data-id="${rp.id}" data-action="Publicado">Aprobar (Publicar)</button>
                  <button class="btn btn-ghost btn-small action-mod" data-id="${rp.id}" data-action="Retirado">Rechazar (Retirar)</button>
                </div>
              ` : ''}
            </div>
          </div>
        `).join('') : '<div class="empty-state">No hay reportes todavía.</div>'}
      </div>
    `;
    bindShellEvents();

    qsa('.action-mod').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.getAttribute('data-id');
        const action = e.target.getAttribute('data-action');
        showConfirmModal({
          title: action === 'Publicado' ? 'Aprobar reporte' : 'Retirar reporte',
          bodyHtml: action === 'Publicado' 
            ? '<p>¿Estás seguro de hacer público este reporte? Asegúrate de haber revisado la información por contenido sensible.</p>'
            : '<p>¿Estás seguro de retirar este reporte? No será visible públicamente.</p>',
          confirmText: 'Confirmar',
          danger: action === 'Retirado',
          onConfirm: async () => {
            try {
              await api('/reports/' + id + '/estado', { method: 'PUT', body: { estado: action } });
              toast('Reporte ' + action.toLowerCase() + '.', 'ok');
              renderReportesList(institucionId);
            } catch (err) { toast(err.message, 'err'); }
          }
        });
      });
    });
  }

  async function renderCalificarForm(institucionId) {
    const [nombre, { ratings }] = await Promise.all([
      institucionNombre(institucionId),
      api('/institutions/' + institucionId + '/ratings'),
    ]);
    const mine = ratings[0] || null;
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="#/app/instituciones/${institucionId}/calificaciones">${ICONS.back} Volver a calificaciones</button>
      <div class="page-head"><h2>Calificar — ${escapeHtml(nombre)}</h2></div>
      <div class="chart-card" style="max-width:520px;">
        <div id="err"></div>
        <form id="rating-form">
          <div class="field">
            <label>Selecciona de 1 a 5 estrellas</label>
            <div class="star-rating" style="font-size:32px; display:inline-flex; flex-direction:row-reverse; cursor:pointer;" aria-label="Calificación">
              ${[5, 4, 3, 2, 1].map(n => `
                <input type="radio" name="estrellas" value="${n}" id="star${n}" style="display:none;" ${mine && mine.estrellas === n ? 'checked' : ''} required>
                <label for="star${n}" style="color:var(--border-color); margin:0 2px;" title="${n} estrellas" tabindex="0">★</label>
              `).join('')}
            </div>
            <div id="rating-text" style="font-size:14px; color:var(--primary-color); font-weight:bold; margin-top:5px; min-height:20px;">
              ${mine ? mine.estrellas + ' estrellas seleccionadas' : ''}
            </div>
          </div>
          <div class="field"><label>Comentario (Opcional)</label><textarea name="comentario" rows="3" maxlength="500" placeholder="¿Cómo describirías tu experiencia con esta institución?">${escapeHtml(mine ? mine.comentario || '' : '')}</textarea></div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" style="width:auto; padding:12px 22px;" type="submit">${mine ? 'Actualizar calificación' : 'Enviar calificación'}</button>
            <button class="btn btn-ghost" style="width:auto; padding:12px 22px;" type="button" data-nav="#/app/instituciones/${institucionId}/calificaciones">Cancelar</button>
          </div>
        </form>
      </div>
    `;
    bindShellEvents();

    // Lógica para las estrellas
    const stars = qsa('.star-rating label');
    const inputs = qsa('input[name="estrellas"]');
    const updateStars = () => {
      let val = 0;
      inputs.forEach(i => { if(i.checked) val = parseInt(i.value); });
      stars.forEach(lbl => {
        const lblVal = parseInt(lbl.htmlFor.replace('star',''));
        lbl.style.color = lblVal <= val ? '#f5b041' : 'var(--border-color)';
      });
      qs('#rating-text').textContent = val > 0 ? val + ' estrellas seleccionadas' : '';
    };
    
    // Configurar color al inicio si hay valoración previa
    if (mine) updateStars();
    
    stars.forEach(lbl => {
      // Hover effects
      lbl.addEventListener('mouseenter', () => {
        const hVal = parseInt(lbl.htmlFor.replace('star',''));
        stars.forEach(s => {
          const sVal = parseInt(s.htmlFor.replace('star',''));
          s.style.color = sVal <= hVal ? '#f1c40f' : 'var(--border-color)';
        });
      });
      lbl.addEventListener('mouseleave', updateStars);
      
      // Accessibility: enter/space to select
      lbl.addEventListener('keydown', (e) => {
        if(e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          qs('#' + lbl.htmlFor).checked = true;
          updateStars();
        }
      });
      
      lbl.addEventListener('click', () => {
        setTimeout(updateStars, 0); // Esperar a que el radio se marque
      });
    });

    qs('#rating-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      try {
        await api('/institutions/' + institucionId + '/ratings', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        toast('Gracias por tu calificación.', 'ok');
        navigate('#/app/instituciones/' + institucionId + '/calificaciones');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
  }

  async function renderReportarForm(institucionId) {
    const [nombre, { motivos }] = await Promise.all([
      institucionNombre(institucionId),
      api('/institutions/' + institucionId + '/reports'),
    ]);
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="#/app/instituciones/${institucionId}/reportes">${ICONS.back} Volver a reportes</button>
      <div class="page-head"><h2>Reportar — ${escapeHtml(nombre)}</h2></div>
      <div class="chart-card" style="max-width:520px;">
        <div id="err"></div>
        <form id="report-form">
          <div class="field"><label>Motivo <span style="color:#e00">*</span></label>
            <select name="motivo" required>${motivos.map((m) => `<option>${escapeHtml(m)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Descripción <span style="color:#e00">*</span></label><textarea name="descripcion" rows="4" minlength="10" maxlength="1000" placeholder="Escribe al menos 10 caracteres detallando la situación..." required></textarea></div>
          <div class="field"><label>Evidencia (opcional)</label>
            <input type="file" name="evidencia" accept="image/jpeg,image/png,application/pdf">
            <p class="help">Puedes adjuntar un documento (PDF, JPG, PNG) de máximo 10MB.</p>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" id="btn-submit-report" style="width:auto; padding:12px 22px;" type="submit">Enviar reporte</button>
            <button class="btn btn-ghost" style="width:auto; padding:12px 22px;" type="button" data-nav="#/app/instituciones/${institucionId}/reportes">Cancelar</button>
          </div>
        </form>
      </div>
    `;
    bindShellEvents();
    qs('#report-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = qs('#btn-submit-report');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      try {
        const res = await fetch('/api/institutions/' + institucionId + '/reports', {
          method: 'POST',
          body: fd,
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('deviceToken') }
        });
        const data = await res.json();
        if (!res.ok) throw data;
        
        showConfirmModal({
          title: 'Reporte enviado exitosamente',
          bodyHtml: '<p>Tu reporte ha sido enviado. Actualmente su estado es <strong>Pendiente</strong> y pasará a revisión por el personal autorizado. Si es aprobado, se publicará en el perfil de la institución (sin datos sensibles).</p>',
          confirmText: 'Entendido',
          onConfirm: () => navigate('#/app/instituciones/' + institucionId + '/reportes')
        });
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.error || 'Error de conexión']);
        btn.disabled = false;
        btn.textContent = 'Enviar reporte';
      }
    });
  }

  async function renderInstitucionForm(id) {
    let editing = null;
    if (id) {
      const { institutions } = await api('/institutions');
      editing = institutions.find((i) => i.id === id);
    }
    const digits = (s) => (s || '').replace(/[^0-9]/g, '');
    
    // Load municipalities correctly
    const renderMunicipios = (prov) => {
      const muns = MUNICIPIOS[prov] || [];
      const sel = qs('select[name="municipio"]');
      if (sel) {
        sel.innerHTML = '<option value="">Selecciona municipio</option>' + muns.map(m => `<option value="${escapeHtml(m)}" ${editing && editing.municipio === m ? 'selected' : ''}>${escapeHtml(m)}</option>`).join('');
      }
    };

    qs('.main').innerHTML = `
      <button class="back-link" data-nav="${isAdmin() ? '#/app/instituciones' : '#/app/instituciones/' + (editing ? editing.id : id) + '/detalle'}">${ICONS.back} Volver a ${isAdmin() ? 'instituciones' : 'detalles'}</button>
      <div class="page-head"><h2>${editing ? 'Modificar institución' : 'Nueva institución'}</h2></div>
      <div class="chart-card" style="max-width:760px;">
        <div id="err"></div>
        <form id="inst-form" enctype="multipart/form-data">
          <div class="two-col">
            <div class="field"><label>Nombre de la institución *</label><input type="text" name="nombre" value="${escapeHtml(editing ? editing.nombre : '')}" required></div>
            <div class="field"><label>RNC (9 dígitos) *</label><input type="text" name="rnc" pattern="\\d{9}" maxlength="9" value="${escapeHtml(editing ? (editing.rnc||'') : '')}" required placeholder="Ej: 123456789"></div>
          </div>
          
          <div class="two-col">
            <div class="field"><label>Correo institucional *</label><input type="email" name="correo" value="${escapeHtml(editing ? (editing.correo||'') : '')}" required placeholder="ejemplo@escuela.edu.do"></div>
            <div class="field"><label>Teléfono (10 dígitos) *</label><input type="text" name="telefono" maxlength="10" value="${escapeHtml(editing ? digits(editing.telefono) : '')}" required placeholder="8095551234"></div>
          </div>

          <div class="field"><label>Dirección física *</label><input type="text" name="direccion" value="${escapeHtml(editing ? editing.direccion || '' : '')}" required placeholder="Calle, número, sector"></div>

          <div class="two-col">
            <div class="field"><label>Provincia *</label>
              <select name="provincia" id="prov-select" required>
                <option value="">Selecciona provincia</option>
                ${PROVINCIAS.map((p) => `<option value="${escapeHtml(p)}" ${editing && editing.provincia === p ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Municipio *</label>
              <select name="municipio" required>
                <option value="">Selecciona municipio</option>
              </select>
            </div>
          </div>

          <div class="two-col">
            <div class="field"><label>Distrito educativo *</label><input type="text" name="distrito" placeholder="00-00" value="${escapeHtml(editing ? editing.distrito : '')}" required></div>
            <div class="field"><label>Tipo</label>
              <select name="tipo">
                <option value="Público" ${editing && editing.tipo === 'Público' ? 'selected' : ''}>Público</option>
                <option value="Privado" ${editing && editing.tipo === 'Privado' ? 'selected' : ''}>Privado</option>
              </select>
            </div>
          </div>
          
          <div class="field"><label>Estado</label>
            <select name="estado">
              <option value="Activo" ${editing && editing.estado === 'Activo' ? 'selected' : ''}>Activa</option>
              <option value="Inactivo" ${editing && editing.estado === 'Inactivo' ? 'selected' : ''}>Inactiva</option>
            </select>
          </div>

          <div class="two-col" style="margin-top:20px;">
            <div class="field">
              <label>Logo de la institución (Máx 5MB)</label>
              <input type="file" name="logo" accept=".jpg,.jpeg,.png,.webp" id="logo-input">
              <div style="margin-top:10px;">
                ${editing && editing.logo ? `<img id="logo-preview" src="/api/institutions/${editing.id}/logo" style="max-height:60px; max-width:100%; border-radius:8px; border:1px solid var(--border-color);">` : `<img id="logo-preview" style="max-height:60px; max-width:100%; border-radius:8px; display:none; border:1px solid var(--border-color);">`}
              </div>
            </div>
            <div class="field">
              <label>Imagen de fondo (Máx 10MB)</label>
              <input type="file" name="fondo" accept=".jpg,.jpeg,.png,.webp" id="fondo-input">
              <div style="margin-top:10px;">
                ${editing && editing.fondo ? `<img id="fondo-preview" src="/api/institutions/${editing.id}/fondo" style="max-height:60px; max-width:100%; border-radius:8px; border:1px solid var(--border-color); object-fit:cover;">` : `<img id="fondo-preview" style="max-height:60px; max-width:100%; border-radius:8px; display:none; border:1px solid var(--border-color); object-fit:cover;">`}
              </div>
            </div>
          </div>

          <div style="display:flex; gap:10px; margin-top:30px;">
            <button class="btn btn-primary" style="width:auto; padding:12px 22px;" type="submit" id="btn-submit">${editing ? 'Guardar cambios' : 'Crear institución'}</button>
            <button class="btn btn-ghost" style="width:auto; padding:12px 22px;" type="button" id="btn-cancel">Cancelar</button>
          </div>
        </form>
      </div>
    `;
    bindShellEvents();

    qs('#prov-select').addEventListener('change', (e) => {
      renderMunicipios(e.target.value);
    });
    if (editing && editing.provincia) {
      renderMunicipios(editing.provincia);
    }

    const previewImage = (inputEl, previewEl, maxMB) => {
      inputEl.addEventListener('change', () => {
        const file = inputEl.files[0];
        if (file) {
          if (file.size > maxMB * 1024 * 1024) {
            toast('El archivo supera los ' + maxMB + 'MB.', 'error');
            inputEl.value = '';
            return;
          }
          previewEl.style.display = 'block';
          previewEl.src = URL.createObjectURL(file);
        }
      });
    };
    previewImage(qs('#logo-input'), qs('#logo-preview'), 5);
    previewImage(qs('#fondo-input'), qs('#fondo-preview'), 10);
    
    // Check for unsaved changes on cancel
    let formChanged = false;
    qs('#inst-form').addEventListener('input', () => formChanged = true);
    qs('#btn-cancel').addEventListener('click', () => {
      if (formChanged) {
        customConfirm('Tienes cambios sin guardar. ¿Seguro que deseas cancelar?', 'Sí, cancelar', () => navigate('#/app/instituciones'));
      } else {
        navigate('#/app/instituciones');
      }
    });

    qs('#inst-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = qs('#btn-submit');
      const originalText = btn.textContent;
      btn.textContent = 'Guardando...';
      btn.disabled = true;
      
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      
      try {
        if (editing) {
          await api('/institutions/' + editing.id, { method: 'PUT', body: fd });
          toast('Institución actualizada.', 'ok');
        } else {
          await api('/institutions', { method: 'POST', body: fd });
          toast('Institución creada.', 'ok');
        }
        formChanged = false;
        navigate('#/app/instituciones');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
        btn.textContent = originalText;
        btn.disabled = false;
      }
    });
  }

  // ---------------- Inscripciones ----------------
  let enrollmentRenderVersion = 0;
  const ENROLLMENT_STATES = ['Enviada', 'En revisión', 'Documentos pendientes', 'Aceptada', 'Rechazada', 'Cancelada', 'Abandonada'];
  const ENROLLMENT_EXPLANATIONS = {
    Enviada: 'La institución ha recibido la solicitud. El siguiente paso es iniciar su revisión.',
    'En revisión': 'La institución está evaluando el expediente. Aprobar los documentos no acepta automáticamente la inscripción.',
    'Documentos pendientes': 'Hay documentos que debes corregir. Abre Documentos para consultar los motivos y cargar las correcciones.',
    Aceptada: 'La inscripción fue aceptada. Esta decisión es definitiva.',
    Rechazada: 'La inscripción fue rechazada. Consulta el motivo. Esta solicitud está cerrada.',
    Cancelada: 'El tutor canceló esta solicitud. Se conserva el expediente y su historial.',
    Abandonada: 'El borrador finalizó por inactividad. Las solicitudes enviadas no expiran por este motivo.'
  };
  function enrollmentStateHtml(e) {
    const icons = {Aceptada:'✓', Rechazada:'✕', Cancelada:'⊘', Abandonada:'⌛', 'Documentos pendientes':'⚠', 'En revisión':'◉', Enviada:'↗'};
    return `<span class="pill enrollment-state" data-state="${escapeHtml(e.estado)}">${icons[e.estado] || '•'} ${escapeHtml(e.estado)}</span>`;
  }
  let enrollmentUpdates;
  try { enrollmentUpdates = new BroadcastChannel('inscolar_enrollments'); } catch (_) {}
  function enrollmentChanged() {
    if (enrollmentUpdates) enrollmentUpdates.postMessage({type:'changed'});
    window.dispatchEvent(new Event('enrollment-updated'));
  }
  let appointmentUpdates;
  try { appointmentUpdates = new BroadcastChannel('inscolar_appointments'); } catch (_) {}
  function appointmentChanged() {
    if(appointmentUpdates)appointmentUpdates.postMessage({type:'changed'});
    window.dispatchEvent(new Event('appointment-updated'));
  }
  function watchEnrollments(handler,scope='enrollments') {
    const channel=scope==='appointments'?appointmentUpdates:enrollmentUpdates;
    const eventName=scope==='appointments'?'appointment-updated':'enrollment-updated';
    const stream = new EventSource('/api/'+scope+'/events');
    stream.addEventListener('changed',handler);
    stream.addEventListener('open',handler);
    stream.addEventListener('error',handler);
    if (window._enrollmentCleanup) window._enrollmentCleanup();
    const visible = () => { if (document.visibilityState === 'visible') handler(); };
    window.addEventListener('focus',handler);
    document.addEventListener('visibilitychange',visible);
    window.addEventListener(eventName,handler);
    if (channel) channel.addEventListener('message',handler);
    window._enrollmentCleanup = () => {
      stream.close();
      window.removeEventListener('focus',handler); document.removeEventListener('visibilitychange',visible);
      window.removeEventListener(eventName,handler);
      if(channel) channel.removeEventListener('message',handler);
    };
  }
  function enrollmentError(container, error, retry) {
    container.innerHTML = `<div class="empty-state" role="alert"><p>${escapeHtml(error.message || 'No se pudo cargar la solicitud.')}</p><button class="btn btn-primary" id="enrollment-retry">Reintentar</button></div>`;
    qs('#enrollment-retry',container).addEventListener('click',retry);
  }
  async function renderInscripciones(query = {}) {
    const renderVersion=++enrollmentRenderVersion;
    if(window._enrollmentCleanup){window._enrollmentCleanup();window._enrollmentCleanup=null;}
    const container = qs('.main');
    container.innerHTML = '<div class="loading" role="status">Cargando solicitudes…</div>';
    const u=state.user, tutor=u.role==='Tutor', admin=isAdmin();
    const params=new URLSearchParams();
    for(const k of ['estado','institucionId','cicloEscolar','grado','q','page']) if(query[k]) params.set(k,query[k]);
    params.set('page',query.page || '1');params.set('limit','10');
    try {
      const [data,studentsData,institutionData]=await Promise.all([api('/enrollments?'+params),tutor?api('/students'):Promise.resolve({students:[]}),admin?api('/institutions'):Promise.resolve({institutions:[]})]);
      if (!container.isConnected || renderVersion!==enrollmentRenderVersion) return;
      const {enrollments,total,page,limit,filtros}=data;
      const option=(value,label,selected)=>`<option value="${escapeHtml(value)}" ${value===selected?'selected':''}>${escapeHtml(label || value)}</option>`;
      const pages=Math.max(1,Math.ceil(total/limit));
      container.innerHTML=`
        <div class="page-head"><div><h2>Inscripciones</h2><div class="sub">${tutor?'Consulta el progreso y las siguientes acciones de tus solicitudes.':'Revisión y seguimiento de solicitudes autorizadas.'}</div></div>${tutor?'<button class="btn btn-primary" data-nav="#/app/inscripciones/nueva">Nueva inscripción</button>':''}</div>
        <div id="enrollment-update" role="status"></div>
        ${tutor?`<section class="students-panel table-card" aria-labelledby="students-title"><div class="students-head"><h3 id="students-title">Mis estudiantes <span class="pill">${studentsData.students.length}</span></h3><button class="btn btn-secondary" data-nav="#/app/inscripciones/estudiante-nuevo">Agregar estudiante</button></div><div class="students-grid">${studentsData.students.map(s=>`<article class="student-card"><span class="student-avatar" aria-hidden="true">${escapeHtml(s.nombre.split(/\s+/).slice(0,2).map(n=>n[0]).join(''))}</span><div><h4>${escapeHtml(s.nombre)}</h4><p>Fecha de nacimiento: ${escapeHtml(s.fechaNacimiento || 'Sin registrar')}</p></div></article>`).join('') || '<p class="empty-state">Aún no tienes estudiantes. Agrega uno para iniciar una inscripción.</p>'}</div></section>`:''}
        <form class="filters" id="enrollment-filters">
          <label>Buscar<input name="q" value="${escapeHtml(query.q || '')}" placeholder="Referencia, estudiante o institución"></label>
          <label>Estado<select name="estado">${option('Todos','Todos',query.estado || 'Todos')}${ENROLLMENT_STATES.map(s=>option(s,s,query.estado)).join('')}</select></label>
          <label>Periodo<select name="cicloEscolar">${option('Todos','Todos',query.cicloEscolar || 'Todos')}${filtros.ciclos.map(s=>option(s,s,query.cicloEscolar)).join('')}</select></label>
          <label>Grado<select name="grado">${option('Todos','Todos',query.grado || 'Todos')}${filtros.grados.map(s=>option(s,s,query.grado)).join('')}</select></label>
          ${admin?`<label>Institución<select name="institucionId">${option('Todas','Todas',query.institucionId || 'Todas')}${institutionData.institutions.map(i=>option(i.id,i.nombre,query.institucionId)).join('')}</select></label>`:''}
          <button class="btn btn-primary" type="submit">Filtrar</button><button class="btn btn-secondary" type="button" id="enrollment-clear">Limpiar filtros</button>
        </form>
        <div class="table-card"><table><thead><tr><th>Referencia</th><th>Estudiante</th>${tutor?'':'<th>Tutor</th>'}<th>Institución</th><th>Periodo / grado</th><th>Fecha de envío</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        ${enrollments.length?enrollments.map(e=>`<tr><td data-label="Referencia">${escapeHtml(e.id)}</td><td data-label="Estudiante">${escapeHtml(e.estudianteNombre)}</td>${tutor?'':`<td data-label="Tutor">${escapeHtml(e.tutorNombre)}</td>`}<td data-label="Institución">${escapeHtml(e.institucionNombre)}</td><td data-label="Periodo / grado">${escapeHtml(e.cicloEscolar)}<br>${escapeHtml(e.gradoSolicitado)}</td><td data-label="Fecha de envío">${fmtDate(e.createdAt)}</td><td data-label="Estado">${enrollmentStateHtml(e)}${e.motivoRechazo?`<p class="help">${escapeHtml(e.motivoRechazo)}</p>`:''}</td><td data-label="Acciones"><span class="actions-cell"><button class="neutral" data-nav="#/app/inscripciones/${encodeURIComponent(e.id)}/detalle">Ver detalle</button><button class="neutral" data-nav="#/app/inscripciones/${encodeURIComponent(e.id)}/documentos">${e.estado==='Documentos pendientes' && tutor?'Corregir documentos':'Documentos'}</button></span></td></tr>`).join(''):`<tr><td colspan="8" class="empty-state">No hay solicitudes con estos filtros. ${tutor?'Puedes limpiar los filtros o iniciar una nueva solicitud.':'Prueba otro estado, periodo o grado.'}</td></tr>`}
        </tbody></table><div class="table-footer"><span>Mostrando ${enrollments.length} de ${total} solicitudes</span><div class="pagination"><button class="btn btn-ghost" id="enrollment-prev" ${page<=1?'disabled':''}>Anterior</button><span>Página ${page} de ${pages}</span><button class="btn btn-ghost" id="enrollment-next" ${page>=pages?'disabled':''}>Siguiente</button></div></div></div>`;
      bindShellEvents();
      const apply=(newPage=1)=>{const p=new URLSearchParams();for(const [k,v] of new FormData(qs('#enrollment-filters')))if(v && !['Todos','Todas'].includes(v))p.set(k,v);p.set('page',newPage);navigate('#/app/inscripciones?'+p);};
      qs('#enrollment-filters').addEventListener('submit',event=>{event.preventDefault();apply();});
      qs('#enrollment-clear').onclick=()=>navigate('#/app/inscripciones');
      qs('#enrollment-prev').onclick=()=>apply(page-1);qs('#enrollment-next').onclick=()=>apply(page+1);
      const signature = value => JSON.stringify(value);
      const baseline = signature(data);
      let checking = false, checkAgain = false;
      const checkUpdates = async()=>{
        if(checking) { checkAgain = true; return; }
        if( !container.isConnected || renderVersion!==enrollmentRenderVersion)return;
        checking = true;
        try {
          const fresh = await api('/enrollments?'+params);
          if(!container.isConnected || renderVersion!==enrollmentRenderVersion)return;
          const notice=qs('#enrollment-update',container);
          if(signature(fresh)===baseline) { notice.innerHTML=''; return; }
          notice.innerHTML='<p class="notice">Hay cambios en tus solicitudes. <button class="btn btn-secondary" id="refresh-enrollments">Actualizar listado</button></p>';
          qs('#refresh-enrollments',notice).onclick=()=>renderInscripciones(query);
        } catch (_) {
          // La desconexión no es evidencia de cambios. La reconexión vuelve a comprobarlos.
        } finally { checking = false; if(checkAgain) { checkAgain=false; checkUpdates(); } }
      };
      watchEnrollments(checkUpdates);
    } catch(error) { if(container.isConnected && renderVersion===enrollmentRenderVersion)enrollmentError(container,error,()=>renderInscripciones(query)); }
  }
  async function renderInscripcionDetalle(id) {
    const renderVersion=++enrollmentRenderVersion;
    if(window._enrollmentCleanup){window._enrollmentCleanup();window._enrollmentCleanup=null;}
    const container=qs('.main');
    container.innerHTML='<div class="loading" role="status">Cargando expediente…</div>';
    try {
      const data=await api('/enrollments/'+encodeURIComponent(id));
      if(!container.isConnected || renderVersion!==enrollmentRenderVersion)return;
      const e=data.enrollment;
      const c=e.disponibilidad;
      const availability=c.configurado?`${c.disponibles} disponibles · ${c.ocupados} ocupados · ${c.reservados} reservados · límite ${c.limite}`:'Sin configuración de cupos. La aceptación permanecerá bloqueada hasta configurarlos.';
      const approved=data.documentos.every(r=>r.document && ['Aceptado','Aprobado'].includes(r.document.estado));
      container.innerHTML=`<button class="back-link" data-nav="#/app/inscripciones">${ICONS.back} Volver a solicitudes</button>
        <div class="page-head"><div><h2>Solicitud ${escapeHtml(e.id)}</h2><div class="sub">${escapeHtml(e.estudianteNombre)} · ${escapeHtml(e.institucionNombre)}</div></div><span class="appointment-actions"><button class="btn btn-secondary" id="detail-refresh">Actualizar</button><button class="btn btn-primary" data-nav="#/app/citas/nueva?inst=${e.institucionId}&solicitud=${e.id}">Solicitar cita</button></span></div>
        <div id="enrollment-update" role="status"></div>
        <div class="chart-card"><h3>Estado y siguiente paso</h3>${enrollmentStateHtml(e)}<p>${escapeHtml(ENROLLMENT_EXPLANATIONS[e.estado] || e.estado)}</p>${e.motivoRechazo?`<p><strong>Motivo del rechazo:</strong> ${escapeHtml(e.motivoRechazo)}</p>`:''}${e.motivoCancelacion?`<p><strong>Motivo de cancelación:</strong> ${escapeHtml(e.motivoCancelacion)}</p>`:''}
          <div class="enrollment-actions">
          ${e.acciones.revisar?'<button class="btn btn-primary" data-enrollment-action="revisar">Iniciar revisión</button>':''}
          ${e.acciones.aceptar?`<button class="btn btn-primary" data-enrollment-action="aceptar" ${!approved || !c.configurado || (c.disponibles===0 && !c.reservaPropia)?'disabled':''}>Aceptar inscripción</button>`:''}
          ${e.acciones.rechazar?'<button class="btn btn-danger" data-enrollment-action="rechazar">Rechazar solicitud</button>':''}
          ${e.acciones.cancelar?'<button class="btn btn-secondary" data-enrollment-action="cancelar">Cancelar solicitud</button>':''}
          <button class="btn btn-secondary" data-nav="#/app/inscripciones/${encodeURIComponent(e.id)}/documentos">${state.user.role==='Tutor' && e.estado==='Documentos pendientes'?'Corregir documentos':'Abrir documentos'}</button>
          <button class="btn btn-secondary" data-nav="#/app/inscripciones/comprobante/${encodeURIComponent(e.id)}">Comprobante</button></div>
          ${e.acciones.aceptar && !approved?'<p class="help">Para aceptar, todos los documentos obligatorios deben estar aprobados.</p>':''}
        </div>
        <div class="two-col" style="margin-top:16px"><div class="chart-card"><h3>Resumen</h3><dl class="enrollment-summary"><dt>Estudiante</dt><dd>${escapeHtml(data.estudiante?.nombre || e.estudianteNombre)}</dd><dt>Nacimiento</dt><dd>${escapeHtml(data.estudiante?.fechaNacimiento || 'Sin dato registrado')}</dd><dt>Tutor</dt><dd>${escapeHtml(data.tutor?.nombre || e.tutorNombre)}${data.tutor?.cedula?`<br>Cédula: ${escapeHtml(data.tutor.cedula)}`:''}</dd><dt>Correo</dt><dd>${escapeHtml(data.tutor?.email || 'Sin dato registrado')}</dd><dt>Teléfono</dt><dd>${escapeHtml(data.tutor?.telefono || 'Sin dato registrado')}</dd><dt>Institución</dt><dd>${escapeHtml(e.institucionNombre)}</dd><dt>Periodo</dt><dd>${escapeHtml(e.cicloEscolar)}</dd><dt>Grado</dt><dd>${escapeHtml(e.gradoSolicitado)}</dd><dt>Envío</dt><dd>${fmtDate(e.createdAt)}</dd></dl></div>
        <div class="chart-card"><h3>Documentos obligatorios</h3><ul class="enrollment-documents">${data.documentos.map(r=>`<li><strong>${escapeHtml(r.tipo)}</strong><br>${r.document?`${escapeHtml(r.document.estado)} · ${escapeHtml(r.document.nombreArchivo)}${r.document.motivoRechazo?`<p>Motivo: ${escapeHtml(r.document.motivoRechazo)}</p>`:''}`:'⚠ Falta documento'}</li>`).join('')}</ul><h3>Disponibilidad para este grado</h3><p id="enrollment-capacity">${escapeHtml(availability)}</p>${e.periodoId && (isAdmin() || (isStaff() && state.user.institucionId===e.institucionId))?'<button class="btn btn-secondary" id="configure-enrollment-capacity">Configurar cupos de este grado</button>':''}</div></div>
        <div class="chart-card" style="margin-top:16px"><h3>Historial</h3>${data.historial.length?`<ol class="enrollment-history">${data.historial.map(h=>`<li><strong>${escapeHtml(h.accion)}</strong><div>${fmtDate(h.fecha)} · ${escapeHtml(h.actorNombre || 'Actor no registrado')}</div>${h.anterior && h.nuevo?`<div>${escapeHtml(h.anterior)} → ${escapeHtml(h.nuevo)}</div>`:''}${h.motivo?`<p>${escapeHtml(h.motivo)}</p>`:''}</li>`).join('')}</ol>`:'<p>No hay eventos registrados para esta solicitud anterior.</p>'}</div>`;
      bindShellEvents();
      const heading=qs('h2',container);if(heading){heading.tabIndex=-1;heading.focus();}
      qs('#detail-refresh').onclick=()=>renderInscripcionDetalle(id);
      const configure=qs('#configure-enrollment-capacity');
      if(configure) configure.onclick=()=>showConfirmModal({title:'Configurar cupos de inscripción',confirmText:'Guardar cupos',bodyHtml:`<p>${escapeHtml(e.institucionNombre)} · ${escapeHtml(e.cicloEscolar)} · ${escapeHtml(e.gradoSolicitado)}</p><label for="enrollment-limit">Cupo máximo de inscripción</label><input id="enrollment-limit" type="number" min="1" max="100000" value="${c.limite || ''}"><p>El límite no puede quedar por debajo de las inscripciones aceptadas y reservas vigentes.</p>`,onConfirm:async modal=>{
        const limite=Number(qs('#enrollment-limit',modal).value);
        await api('/institutions/'+encodeURIComponent(e.institucionId)+'/periods/'+encodeURIComponent(e.periodoId)+'/cupos-inscripcion',{method:'PUT',body:{grado:e.gradoSolicitado,limite}});
        enrollmentChanged();await renderInscripcionDetalle(id);
      }});

      let obsolete=false,checking=false;
      const warn=()=>{
        if(!container.isConnected || renderVersion!==enrollmentRenderVersion)return;
        obsolete=true;
        qsa('[data-enrollment-action]',container).forEach(b=>b.disabled=true);
        const modal=document.querySelector('[data-enrollment-id="'+CSS.escape(id)+'"]');
        if(modal){modal.dataset.obsolete='true';qs('#mod-confirm',modal).disabled=true;qs('.enrollment-modal-error',modal).textContent='La solicitud cambió. Cierra este modal y actualiza el expediente. Tu motivo se conserva mientras esté abierto.';}
        const notice=qs('#enrollment-update',container);notice.innerHTML='<p class="notice">La solicitud o su disponibilidad cambió. Actualiza antes de decidir. <button class="btn btn-secondary" id="refresh-enrollment">Actualizar expediente</button></p>';qs('#refresh-enrollment',notice).onclick=()=>renderInscripcionDetalle(id);
      };
      const check=async()=>{if(checking || !container.isConnected || renderVersion!==enrollmentRenderVersion)return;checking=true;try {const latest=await api('/enrollments/'+encodeURIComponent(id));if(container.isConnected && renderVersion===enrollmentRenderVersion && (latest.enrollment.version!==e.version || JSON.stringify(latest.enrollment.disponibilidad)!==JSON.stringify(c)))warn();}catch(error){if(container.isConnected && renderVersion===enrollmentRenderVersion){obsolete=true;qsa('[data-enrollment-action]',container).forEach(b=>b.disabled=true);qs('#enrollment-update',container).textContent='No se pudo verificar el estado vigente. Usa Actualizar antes de decidir.';}}finally{checking=false;}};
      watchEnrollments(check);
      qsa('[data-enrollment-action]',container).forEach(button=>button.onclick=()=>{
        if(obsolete)return;
        const action=button.dataset.enrollmentAction;
        const title={revisar:'Iniciar revisión',aceptar:'Aceptar inscripción',rechazar:'Rechazar solicitud',cancelar:'Cancelar solicitud'}[action];
        const motive=action==='rechazar' || action==='cancelar';
        showConfirmModal({title,confirmText:title,danger:action==='rechazar' || action==='cancelar',
          bodyHtml:`<p><strong>${escapeHtml(e.estudianteNombre)}</strong><br>${escapeHtml(e.institucionNombre)} · ${escapeHtml(e.gradoSolicitado)}<br>Referencia: ${escapeHtml(e.id)}</p><p>${action==='aceptar'?'La aceptación es definitiva y ocupará o convertirá un único cupo.':action==='cancelar'?'La solicitud quedará cerrada; conservarás su historial y se liberará solo su reserva, si existe.':action==='rechazar'?'El rechazo es definitivo. El tutor verá el motivo.':'El expediente pasará a En revisión.'}</p>${motive?`<label for="enrollment-motive">Motivo ${action==='cancelar'?'(opcional)':'(obligatorio)'}</label><textarea id="enrollment-motive" rows="3" maxlength="2000"></textarea>`:''}<p class="enrollment-modal-error" role="alert"></p>`,
          onConfirm:async modal=>{
            modal.dataset.enrollmentId=id;
            if(obsolete || modal.dataset.obsolete)throw new Error('Actualiza el expediente antes de decidir.');
            const body={version:e.version};if(motive)body.motivo=qs('#enrollment-motive',modal).value;
            if(action==='rechazar' && body.motivo.trim().length<3){qs('.enrollment-modal-error',modal).textContent='Indica un motivo comprensible (mínimo 3 caracteres).';return true;}
            const endpoint=action==='aceptar' || action==='rechazar'?'decidir':action;
            if(endpoint==='decidir')body.estado=action==='aceptar'?'Aceptada':'Rechazada';
            try {
              await api('/enrollments/'+encodeURIComponent(id)+'/'+endpoint,{method:'POST',body});
              toast('Solicitud actualizada.','ok');
              if(window._enrollmentCleanup){window._enrollmentCleanup();window._enrollmentCleanup=null;}
              enrollmentChanged();await renderInscripcionDetalle(id);return false;
            }catch(error){qs('.enrollment-modal-error',modal).textContent=error.message;if(error.status===409){warn();modal.dataset.obsolete='true';}return true;}
          }
        });
        const modal=qs('#mod-confirm')?.closest('.sidebar-backdrop');if(modal)modal.dataset.enrollmentId=id;
      });
    } catch(error){if(container.isConnected && renderVersion===enrollmentRenderVersion)enrollmentError(container,error,()=>renderInscripcionDetalle(id));}
  }

  async function renderEstudianteForm() {
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="#/app/inscripciones">${ICONS.back} Volver a inscripciones</button>
      <div class="page-head"><h2>Agregar estudiante</h2></div>
      <div class="chart-card" style="max-width:520px;">
        <div id="err"></div>
        <form id="student-form">
          <div class="field"><label>Nombre completo</label><input type="text" name="nombre" required></div>
          <div class="field"><label>Fecha de nacimiento</label><input type="date" name="fechaNacimiento" required></div>
          <div class="field"><label>Acta o NUP</label><input type="text" name="documento" placeholder="Opcional"></div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" style="width:auto; padding:12px 22px;" type="submit">Guardar estudiante</button>
            <button class="btn btn-ghost" style="width:auto; padding:12px 22px;" type="button" data-nav="#/app/inscripciones">Cancelar</button>
          </div>
        </form>
      </div>
    `;
    bindShellEvents();
    qs('#student-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      try {
        await api('/students', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        toast('Estudiante agregado.', 'ok');
        navigate('#/app/inscripciones');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
  }


  async function renderInscripcionForm() {
    const [{ students }, { institutions }] = await Promise.all([api('/students'), api('/institutions')]);
    const activas = institutions.filter((i) => (i.estado || 'Activo') === 'Activo');
    const ciclos = cicloOptions();
    
    const query = new URLSearchParams(window.location.hash.split('?')[1] || '');
    const preInstId = query.get('inst');
    const u = state.user || {};
    
    let wState = {
      step: 1,
      studentId: students.length ? students[0].id : 'new',
      newStudent: { nombre: '', fechaNacimiento: '' },
      tutorName: u.nombre || '',
      tutorPhone: u.telefonoMovil || u.telefonoFijo || u.telefonomovil || u.telefono || '',
      tutorCedula: u.cedula || '',
      institucionId: preInstId || '',
      gradoSolicitado: GRADOS[0],
      cicloEscolar: ciclos[0],
      periodosValidos: [],
      documentos: []
    };

    let draftId = localStorage.getItem('enrollment_draft_id');
    let expiresAt = null;
    let timerId = null;
    let warningModal = null;
    let activityTimeout = null;
    let saveQueue = Promise.resolve();
    let broadcast = null;
    try { broadcast = new BroadcastChannel('enrollment_draft'); } catch(e) {}

    let active = true;
    let exitPending = false;
    let interceptor;
    let navigationGuard;
    const wizardHash = window.location.hash;
    const closeChannel = () => { if (broadcast) { broadcast.close(); broadcast = null; } };
    window._wizardCleanup = () => {
      active = false;
      clearTimeout(timerId); clearTimeout(activityTimeout);
      if (warningModal) warningModal.remove();
      closeChannel();
      if (window._navInterceptor === interceptor) window._navInterceptor = null;
      if (window._wizardNavigation === navigationGuard) window._wizardNavigation = null;
    };
    const clearDraft = () => {
      draftId = null;
      localStorage.removeItem('enrollment_draft_id');
      window._wizardCleanup?.();
    };
    const requestExit = pendingHash => {
      if (exitPending || !active) return false;
      exitPending = true;
      showConfirmModal({title:'Confirmación', bodyHtml:'<p>Tienes una inscripción en progreso. ¿Seguro que deseas salir? Se abandonará este borrador.</p>', confirmText:'Sí, salir',
        onClose:()=>{exitPending=false;},
        onConfirm:async()=>{
          await saveQueue.catch(()=>{});
          if (draftId) await api('/drafts/'+draftId,{method:'DELETE'});
          if (broadcast) broadcast.postMessage({type:'abandoned'});
          clearDraft();
          navigate(pendingHash || '#/app/inscripciones');
        }
      });
      return false;
    };

    const handleExpire = () => {
      clearDraft();
      qs('.main').innerHTML = `
        <div class="card" style="max-width:500px; margin:40px auto; text-align:center;">
          <div style="width:64px; height:64px; background:#c23b3b; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 20px;">
            ${ICONS.clock || '⏰'}
          </div>
          <h2 style="margin-bottom:10px;">Borrador expirado</h2>
          <p class="lede" style="margin-bottom:20px;">Tu solicitud de inscripción ha sido cancelada por inactividad. Puedes iniciar un nuevo borrador.</p>
          <button class="btn btn-primary" onclick="window.location.hash='#/app/inscripciones/nueva'">Iniciar nueva solicitud</button>
        </div>
      `;
    };

    const scheduleChecks = () => {
      clearTimeout(timerId);
      if (!active || !expiresAt) return;
      const msLeft = expiresAt - Date.now();
      const WARNING_MS = 10 * 60 * 1000;
      
      if (msLeft <= 0) {
        handleExpire();
        return;
      }
      
      if (msLeft <= WARNING_MS) {
        if (!warningModal) {
          warningModal = document.createElement('div');
          warningModal.className = 'modal-backdrop';
          warningModal.innerHTML = `
            <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
              <h3 id="modal-title" style="margin-top:0;">¿Sigues aquí?</h3>
              <p>Tu inscripción sigue en borrador. Si no continúas, el proceso se cerrará por inactividad y se liberará cualquier cupo reservado.</p>
              <p style="font-size:1.5rem; font-weight:bold; color:#eab308; margin-bottom:20px;" id="inactivity-countdown"></p>
              <div style="display:flex; gap:10px; justify-content:flex-end;">
                <button class="btn btn-secondary" id="btn-abandon-draft">Salir del proceso</button>
                <button class="btn btn-primary" id="btn-continue-draft">Continuar inscripción</button>
              </div>
            </div>
          `;
          document.body.appendChild(warningModal);
          
          const focusable = warningModal.querySelectorAll('button');
          if (focusable.length) focusable[1].focus();
          
          warningModal.querySelector('#btn-continue-draft').addEventListener('click', () => {
            reportActivity(true);
          });
          
          warningModal.querySelector('#btn-abandon-draft').addEventListener('click', () => {
             requestExit('#/app/inscripciones');
          });
          
          warningModal.addEventListener('keydown', (e) => {
             if (e.key === 'Escape') {
                e.stopPropagation(); // "Cerrarlo con Escape no debe confirmar actividad... ni abandonar el borrador"
                warningModal.remove();
                warningModal = null;
             }
          });
        }
        
        // Update countdown
        const cd = warningModal.querySelector('#inactivity-countdown');
        if (cd) {
          const m = Math.floor(msLeft / 60000);
          const s = Math.floor((msLeft % 60000) / 1000);
          cd.textContent = `${m}:${s.toString().padStart(2, '0')}`;
        }
        
        timerId = setTimeout(scheduleChecks, 1000);
      } else {
        if (warningModal) {
          warningModal.remove();
          warningModal = null;
        }
        const msUntilWarning = msLeft - WARNING_MS;
        timerId = setTimeout(scheduleChecks, msUntilWarning);
      }
    };

    const reportActivity = (force = false) => {
      if (!draftId || !active || exitPending) return;

      if (activityTimeout) clearTimeout(activityTimeout);
      activityTimeout = null;
      
      const send = async () => {
        if (!active || !draftId) return;
        try {
          // Send non-file wState data
          const payload = { ...wState, documentos: [] }; 
          const res = await api('/drafts/' + draftId, { method: 'PUT', body: payload });
          if (!active || !draftId) return;
          expiresAt = Date.now() + res.timeRemaining;
          if (broadcast) broadcast.postMessage({ type: 'activity', expiresAt });
          scheduleChecks();
        } catch(e) {
          if (!active) return;
          if (e.message && (e.message.includes('expirado') || e.message.includes('inexistente'))) {
            handleExpire();
          } else {
            toast('No se pudo guardar el borrador. Reintenta antes de salir.', 'error');
            if (force) throw e;
          }
        }
      };
      
      saveQueue = saveQueue.catch(() => {}).then(send);
      return saveQueue;
    };

    if (broadcast) {
      broadcast.onmessage = (e) => {
        if (e.data.type === 'activity') {
          expiresAt = e.data.expiresAt;
          scheduleChecks();
        } else if (e.data.type === 'abandoned') {
          handleExpire();
        } else if (e.data.type === 'submitted') {
          clearDraft();
        }
      };
    }

    // Init Draft Session
    if (draftId) {
      try {
        const res = await api('/drafts/' + draftId);
        expiresAt = Date.now() + res.timeRemaining;
        wState = { ...wState, ...res.draft.data };
        scheduleChecks();
      } catch(e) {
        draftId = null; // invalid draft, we'll create a new one
      }
    }
    
    if (!draftId) {
       try {
         const res = await api('/drafts', { method: 'POST', body: { ...wState, documentos: [] } });
         draftId = res.draft.id;
         expiresAt = res.draft.expiresAt;
         localStorage.setItem('enrollment_draft_id', draftId);
         scheduleChecks();
       } catch (e) {
         console.warn('Draft init failed', e);
       }
    }

    interceptor = requestExit;
    if (active) {
      window._navInterceptor = interceptor;
      navigationGuard = () => {
        if (window.location.hash === wizardHash) return true;
        const target = window.location.hash;
        history.replaceState(null, '', wizardHash);
        requestExit(target);
        return false;
      };
      window._wizardNavigation = navigationGuard;
    }

    async function fetchConfigAndCheck() {
      if (!wState.institucionId) return;
      try {
         const res = await api('/institutions/' + wState.institucionId + '/periods?cicloEscolar=' + encodeURIComponent(wState.cicloEscolar));
         wState.periodosValidos = (res.periods || []).filter(p => p.inscripcion && Date.now() >= new Date(p.inscripcion.desde).getTime() && Date.now() <= new Date(p.inscripcion.hasta).getTime());
      } catch(e) {
         wState.periodosValidos = [];
      }
    }

    async function advanceStep(next) {
      const previous = wState.step;
      wState.step = next;
      try { await reportActivity(true); } catch (_) { wState.step = previous; return; }
      return renderStep();
    }

    async function renderStep() {
       if (!active) return;
       let html = '';
       const steps = ['Estudiante', 'Tutor', 'Institución', 'Documentos', 'Revisión'];
       const stepperHtml = `
         <div class="stepper" style="display:flex; justify-content:space-between; margin-bottom:20px; font-size:12px; font-weight:bold; color:var(--text-muted);">
           ${steps.map((name, i) => `<div style="${wState.step === i+1 ? 'color:var(--primary-color); border-bottom:2px solid var(--primary-color);' : ''} padding-bottom:4px;">${i+1}. ${name}</div>`).join('')}
         </div>
       `;
       
       let backBtn = `<button class="back-link" id="btn-back-step">${ICONS.back} ${wState.step === 1 ? 'Cancelar inscripción' : 'Paso anterior'}</button>`;
       
       if (wState.step === 1) {
         html = `
           ${backBtn}
           <div class="page-head"><h2>Paso 1: Datos del Estudiante</h2></div>
           ${stepperHtml}
           <div class="card" style="max-width:560px;">
             <form id="step-form">
               <div class="field"><label>Selecciona un estudiante</label>
                 <select name="studentId" id="student-sel">
                   ${students.map(s => `<option value="${s.id}" ${wState.studentId === s.id ? 'selected' : ''}>${escapeHtml(s.nombre)}</option>`).join('')}
                   <option value="new" ${wState.studentId === 'new' ? 'selected' : ''}>+ Registrar nuevo estudiante</option>
                 </select>
               </div>
               <div id="new-student-fields" style="display:${wState.studentId === 'new' ? 'block' : 'none'}; border-top:1px solid var(--c-border); padding-top:15px; margin-top:15px;">
                 <div class="field"><label>Nombre completo</label><input type="text" name="new_nombre" value="${escapeHtml(wState.newStudent?.nombre || '')}" ${wState.studentId==='new'?'required':''}></div>
                 <div class="field"><label>Fecha de nacimiento</label><input type="date" name="new_fecha" value="${wState.newStudent?.fechaNacimiento || ''}" ${wState.studentId==='new'?'required':''}></div>
               </div>
               <div style="margin-top:20px;"><button class="btn btn-primary" type="submit">Continuar</button></div>
             </form>
           </div>
         `;
       } else if (wState.step === 2) {
         html = `
           ${backBtn}
           <div class="page-head"><h2>Paso 2: Tutor y Contacto</h2></div>
           ${stepperHtml}
           <div class="card" style="max-width:560px;">
             <div class="help" style="margin-bottom:15px;">Estos datos se usarán para contactarte sobre esta solicitud (no modifican tu perfil permanentemente aquí).</div>
             <form id="step-form">
               <div class="field"><label>Nombre completo del tutor (nombre y apellidos)</label><input type="text" name="tutorName" value="${escapeHtml(wState.tutorName)}" required></div>
               <div class="field"><label for="wizard-tutor-id">Cédula del tutor</label><input id="wizard-tutor-id" name="tutorCedula" inputmode="numeric" pattern="[0-9]{11}" maxlength="11" value="${escapeHtml(wState.tutorCedula)}" required><p class="help">11 dígitos. Se guarda en este expediente sin modificar tu perfil.</p></div>
               <div class="field"><label>Teléfono de contacto</label><input type="tel" name="tutorPhone" value="${escapeHtml(wState.tutorPhone)}" required></div>
               <div style="margin-top:20px;"><button class="btn btn-primary" type="submit">Continuar</button></div>
             </form>
           </div>
         `;
       } else if (wState.step === 3) {
         html = `
           ${backBtn}
           <div class="page-head"><h2>Paso 3: Institución, Periodo y Grado</h2></div>
           ${stepperHtml}
           <div class="card" style="max-width:560px;">
             <form id="step-form">
               <div class="field" style="${preInstId ? 'display:none;' : ''}"><label>Institución</label>
                 <select name="institucionId" id="inst-sel" ${preInstId ? 'disabled' : 'required'}>
                   <option value="">Selecciona una institución...</option>
                   ${activas.map(i => `<option value="${i.id}" ${wState.institucionId === i.id ? 'selected' : ''}>${escapeHtml(i.nombre)}</option>`).join('')}
                 </select>
               </div>
               ${preInstId ? `<input type="hidden" name="institucionId" value="${escapeHtml(wState.institucionId)}">` : ''}
               <div id="inst-card"></div>
               <div class="two-col">
                 <div class="field"><label>Grado solicitado</label>
                   <select name="gradoSolicitado">${GRADOS.map(g => `<option ${wState.gradoSolicitado===g?'selected':''}>${escapeHtml(g)}</option>`).join('')}</select>
                 </div>
                 <div class="field"><label>Ciclo escolar</label>
                   <select name="cicloEscolar">${ciclos.map(c => `<option ${wState.cicloEscolar===c?'selected':''}>${c}</option>`).join('')}</select>
                 </div>
               </div>
               <div id="period-msg" style="margin-bottom:15px;"></div>
               <div style="margin-top:20px;"><button class="btn btn-primary" id="btn-next-3" type="submit">Continuar</button></div>
             </form>
           </div>
         `;
       } else if (wState.step === 4) {
         let reqDocs = [];
         if (wState.periodosValidos && wState.periodosValidos.length > 0 && wState.periodosValidos[0].documentosRequeridos) {
            reqDocs = wState.periodosValidos[0].documentosRequeridos.filter(r => !r.niveles || r.niveles.includes(wState.gradoSolicitado.includes('Secundaria') ? 'Secundaria' : wState.gradoSolicitado.includes('Primaria') ? 'Primaria' : 'Inicial'));
         } else {
            reqDocs = TIPOS_DOCUMENTO.map(t => ({ tipo: t, formatos: ['PDF','JPG','PNG'], maxSizeMB: 5 }));
         }
         
         let uploadedDocs = [];
         if (draftId) {
            try {
              const res = await api('/drafts/' + draftId + '/documents');
              uploadedDocs = res.documents || [];
            } catch(e) {}
         }
         
         html = `
           ${backBtn}
           <div class="page-head"><h2>Paso 4: Documentos</h2></div>
           ${stepperHtml}
           <div class="card" style="max-width:600px;">
             <p class="help" style="margin-bottom:15px;">Adjunta los documentos requeridos por la institución para este grado.</p>
             <div id="docs-list">
               ${reqDocs.map((req, idx) => {
                 const docType = (req.nombre || req.tipo || req).trim();
                 const uploaded = uploadedDocs.find(d => d.tipoDocumento === docType);
                 const allowedExt = (req.formatos || ['PDF','JPG','PNG']).map(f => '.'+f.toLowerCase()).join(',');
                 
                 let inner = '';
                 if (uploaded) {
                   inner = `
                     <div style="display:flex; justify-content:space-between; align-items:center; background:var(--bg-card); padding:10px; border-radius:6px; border:1px solid #16a34a;">
                       <div style="display:flex; align-items:center; gap:10px;">
                         <div style="color:#16a34a;">${ICONS.check}</div>
                         <div>
                           <div style="font-weight:bold; font-size:13px;">${escapeHtml(uploaded.nombreArchivo)}</div>
                           <div style="font-size:11px; color:var(--text-muted);">${(uploaded.size/1024/1024).toFixed(2)} MB · Cargado</div>
                         </div>
                       </div>
                       <button class="btn btn-secondary btn-small remove-doc-btn" data-id="${uploaded.id}">Quitar</button>
                     </div>
                   `;
                 } else {
                   inner = `
                     <div class="doc-upload-area" id="area-${idx}" style="border:2px dashed var(--c-border); padding:20px; text-align:center; border-radius:8px; cursor:pointer; background:var(--bg-body); transition:background 0.2s;">
                       <div style="color:var(--text-muted); margin-bottom:10px;">${ICONS.document}</div>
                       <div style="font-size:13px; font-weight:bold; margin-bottom:4px;">Haz clic o arrastra un archivo</div>
                       <div style="font-size:11px; color:var(--text-muted);">Formatos permitidos: ${(req.formatos||['PDF','JPG','PNG']).join(', ')} · Máx: ${req.maxMb||req.maxSizeMB||5} MB</div>
                       <input type="file" id="file-${idx}" accept="${allowedExt}" style="display:none;" data-type="${escapeHtml(docType)}" data-max="${req.maxMb||req.maxSizeMB||5}">
                     </div>
                     <div id="upload-status-${idx}" style="margin-top:10px; font-size:12px;"></div>
                   `;
                 }
                 
                 return `
                   <div class="field" style="border:1px solid var(--c-border); padding:15px; border-radius:8px; margin-bottom:15px;" data-req="${idx}">
                     <label style="margin-bottom:10px; display:block;">${escapeHtml(docType)} ${req.descripcion ? `<span class="help" style="display:inline; margin-left:5px;">- ${escapeHtml(req.descripcion)}</span>` : ''}</label>
                     ${inner}
                   </div>
                 `;
               }).join('')}
             </div>
             ${reqDocs.length === 0 ? '<div class="empty-state">No se requieren documentos adicionales.</div>' : ''}
             <div style="margin-top:20px;">
               <button class="btn btn-primary" id="btn-next-4">Continuar</button>
               <span class="help" id="docs-error" style="color:#ef4444; margin-left:15px; font-size:12px;"></span>
             </div>
           </div>
         `;
       } else if (wState.step === 5) {
         const selectedInstObj = activas.find(i => i.id === wState.institucionId) || {};
         html = `
           ${backBtn}
           <div class="page-head"><h2>Paso 5: Revisión y Envío</h2></div>
           ${stepperHtml}
           <div class="card" style="max-width:600px;">
             <h3 style="margin-top:0;">Resumen de la solicitud</h3>
             <table class="table" style="margin-top:15px;">
               <tbody>
                 <tr><td style="font-weight:bold; width:150px;">Estudiante</td><td>${wState.studentId === 'new' ? escapeHtml(wState.newStudent.nombre) : escapeHtml(students.find(s=>s.id===wState.studentId)?.nombre)}</td></tr>
                 <tr><td style="font-weight:bold;">Tutor</td><td>${escapeHtml(wState.tutorName)} (${escapeHtml(wState.tutorPhone)})<br>Cédula: ${escapeHtml(wState.tutorCedula)}</td></tr>
                 <tr><td style="font-weight:bold;">Institución</td><td>${escapeHtml(selectedInstObj.nombre)}</td></tr>
                 <tr><td style="font-weight:bold;">Grado / Ciclo</td><td>${escapeHtml(wState.gradoSolicitado)} · ${wState.cicloEscolar}</td></tr>
                 <tr><td style="font-weight:bold;">Documentos</td><td>${wState.uploadedDocsCount || 0} archivo(s) cargados</td></tr>
               </tbody>
             </table>
             <div id="err" style="margin-top:15px;"></div>
             <div style="margin-top:20px; display:flex; gap:10px;">
               <button class="btn btn-primary" id="btn-submit-final" style="padding:12px 24px;">Confirmar y Enviar Solicitud</button>
             </div>
           </div>
         `;
       }
       
       qs('.main').innerHTML = html;
       bindShellEvents();
       
       const form = qs('#step-form');
       if (form) {
         // Report activity on input changes
         const capture = () => {
           const f = new FormData(form);
           for (const k of ['studentId','tutorName','tutorPhone','tutorCedula','institucionId','gradoSolicitado','cicloEscolar']) if (f.has(k)) wState[k] = f.get(k);
           if (f.has('new_nombre')) wState.newStudent.nombre = f.get('new_nombre');
           if (f.has('new_fecha')) wState.newStudent.fechaNacimiento = f.get('new_fecha');
         };
         form.addEventListener('input', () => { capture(); reportActivity(); });
         form.addEventListener('change', () => { capture(); reportActivity(); });
         
         form.addEventListener('submit', async (e) => {
           e.preventDefault();
           const fd = new FormData(form);
           
           if (wState.step === 1) {
             wState.studentId = fd.get('studentId');
             if (wState.studentId === 'new') {
               wState.newStudent.nombre = fd.get('new_nombre');
               wState.newStudent.fechaNacimiento = fd.get('new_fecha');
             }
             await advanceStep(2);
           } else if (wState.step === 2) {
             wState.tutorName = fd.get('tutorName');
             wState.tutorPhone = fd.get('tutorPhone');
             wState.tutorCedula = fd.get('tutorCedula');
             await advanceStep(3);
           } else if (wState.step === 3) {
             wState.institucionId = fd.get('institucionId');
             wState.gradoSolicitado = fd.get('gradoSolicitado');
             wState.cicloEscolar = fd.get('cicloEscolar');
             
             const btn = qs('#btn-next-3');
             btn.disabled = true; btn.textContent = 'Verificando...';
             await fetchConfigAndCheck();
             
             if (wState.periodosValidos.length === 0) {
               qs('#period-msg').innerHTML = '<div class="alert error" style="margin-bottom:15px;">No hay un periodo de inscripción abierto para esta institución y ciclo.</div>';
               btn.disabled = false; btn.textContent = 'Continuar';
               return;
             }
             await advanceStep(4);
           } else if (wState.step === 4) {
             wState.documentos = Array.from(fd.entries()).filter(([k,v]) => v instanceof File && v.size > 0);
             await advanceStep(5);
           }
         });
       }

       const btnBack = qs('#btn-back-step');
       if (btnBack) {
         btnBack.addEventListener('click', async () => {
           reportActivity(true);
           if (wState.step === 1) {
             requestExit('#/app/inscripciones');
           } else {
             await advanceStep(wState.step - 1);
           }
         });
       }

       if (wState.step === 1) {
         const sel = qs('#student-sel');
         sel.addEventListener('change', () => {
           qs('#new-student-fields').style.display = sel.value === 'new' ? 'block' : 'none';
           qs('[name="new_nombre"]').required = sel.value === 'new';
           qs('[name="new_fecha"]').required = sel.value === 'new';
         });
       }

       if (wState.step === 3) {
         const ensureLeaflet = async () => {
            if (typeof L !== 'undefined') return;
            await new Promise((resolve) => {
              const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
              const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload = resolve; document.head.appendChild(script);
            });
         };
         
         const renderInstCard = async () => {
           const id = qs('#inst-sel').value;
           const inst = activas.find(i => i.id === id);
           const c = qs('#inst-card');
           if (!inst) { c.innerHTML = ''; return; }
           c.innerHTML = `
             <div style="background:var(--bg-body); padding:15px; border-radius:8px; margin-bottom:15px; border:1px solid var(--border-color);">
               <div style="display:flex; align-items:center; gap:15px; margin-bottom:${inst.lat ? '15px' : '0'};">
                 <div style="width:40px; height:40px; border-radius:8px; background:var(--primary-color); color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0;">${ICONS.building}</div>
                 <div>
                   <div style="font-weight:bold;">${escapeHtml(inst.nombre)}</div>
                   <div style="font-size:12px; color:var(--text-muted);">${escapeHtml(inst.direccion || '')} · ${escapeHtml(inst.municipio || '')}, ${escapeHtml(inst.provincia || '')}</div>
                 </div>
               </div>
               ${inst.lat && inst.lng ? `<div id="mini-map" style="height:150px; border-radius:8px; background:#e0e0e0; z-index:1;"></div>` : ''}
             </div>
           `;
           if (inst.lat && inst.lng) {
             await ensureLeaflet();
             const mapEl = qs('#mini-map');
             if (mapEl) {
               const m = L.map(mapEl, {zoomControl:false, dragging:false, scrollWheelZoom:false}).setView([inst.lat, inst.lng], 14);
               const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
               const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(m);
               if (isDark) {
                 tileLayer.on('add', () => {
                   const tp = mapEl.querySelector('.leaflet-tile-pane');
                   if (tp) tp.style.filter = 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)';
                 });
               }
               
               const createIcon = (color) => L.divIcon({
                 className: 'custom-pin',
                 html: `<svg viewBox="0 0 24 24" fill="${color}" width="32" height="32" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.3)); transform-origin:bottom; transition:transform 0.2s;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
                 iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
               });
               L.marker([inst.lat, inst.lng], { icon: createIcon('var(--primary-color)') }).addTo(m);
             }
           }
         };
         qs('#inst-sel').addEventListener('change', renderInstCard);
         renderInstCard();
       }


       if (wState.step === 4) {
         let isUploading = false;
         
         const uploadFile = async (file, type, maxMB, statusEl) => {
           if (isUploading) return;
           isUploading = true;
           
           if (file.size > maxMB * 1024 * 1024) {
             statusEl.innerHTML = `<span style="color:#ef4444;">El archivo supera el tamaño máximo permitido (${maxMB} MB).</span>`;
             isUploading = false;
             return;
           }
           
           const fd = new FormData();
           fd.append('archivo', file);
           fd.append('tipoDocumento', type);
           
           statusEl.innerHTML = '<span style="color:#3b82f6;">Cargando documento... (Por favor espera)</span>';
           
           try {
             await api('/drafts/' + draftId + '/documents', { method: 'POST', body: fd, isMultipart: true });
             reportActivity(true);
             renderStep();
           } catch(e) {
             statusEl.innerHTML = `<span style="color:#ef4444;">${e.errors ? e.errors[0] : 'Error al cargar el documento.'} <button class="btn btn-ghost btn-small" style="padding:0; margin-left:5px; text-decoration:underline;">Reintentar</button></span>`;
             const retryBtn = statusEl.querySelector('button');
             if (retryBtn) retryBtn.addEventListener('click', () => uploadFile(file, type, maxMB, statusEl));
           } finally {
             isUploading = false;
           }
         };

         qsa('.doc-upload-area').forEach(area => {
           const input = area.querySelector('input[type="file"]');
           const statusEl = area.nextElementSibling;
           const type = input.getAttribute('data-type');
           const maxMB = parseFloat(input.getAttribute('data-max'));
           
           area.addEventListener('click', () => { if (!isUploading) input.click(); });
           
           area.addEventListener('dragover', e => { e.preventDefault(); area.style.background = 'var(--bg-card)'; });
           area.addEventListener('dragleave', e => { e.preventDefault(); area.style.background = 'var(--bg-body)'; });
           area.addEventListener('drop', e => {
             e.preventDefault();
             area.style.background = 'var(--bg-body)';
             if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
               uploadFile(e.dataTransfer.files[0], type, maxMB, statusEl);
             }
           });
           
           input.addEventListener('change', e => {
             if (e.target.files && e.target.files.length > 0) {
               uploadFile(e.target.files[0], type, maxMB, statusEl);
             }
           });
         });
         
         qsa('.remove-doc-btn').forEach(btn => {
           btn.addEventListener('click', () => {
             customConfirm('¿Seguro que deseas quitar este documento?', 'Sí, quitar', async () => {
                const id = btn.getAttribute('data-id');
                btn.disabled = true;
                btn.textContent = 'Quitando...';
                try {
                  await api('/documents/' + id, { method: 'DELETE' });
                  reportActivity(true);
                  renderStep();
                } catch(e) {
                  toast('Error al quitar el documento', 'error');
                  btn.disabled = false;
                  btn.textContent = 'Quitar';
                }
             });
           });
         });

         const btnNext = qs('#btn-next-4');
         if (btnNext) {
           btnNext.addEventListener('click', async (e) => {
             e.preventDefault();
             const reqs = Array.from(qsa('.doc-upload-area'));
             if (reqs.length > 0) {
               qs('#docs-error').textContent = 'Faltan documentos requeridos por cargar.';
               return;
             }
             if (isUploading) {
               qs('#docs-error').textContent = 'Hay una carga en progreso, por favor espera.';
               return;
             }
             
             let count = 0;
             if (draftId) {
               try {
                 const res = await api('/drafts/' + draftId + '/documents');
                 count = (res.documents || []).length;
               } catch(err) {}
             }
             wState.uploadedDocsCount = count;
             
             await advanceStep(5);
           });
         }
       }
         if (wState.step === 5) {
         qs('#btn-submit-final').addEventListener('click', async (e) => {
           const btn = e.target;
           if (btn.disabled) return;
           btn.disabled = true;
           btn.textContent = 'Enviando...';
           qs('#err').innerHTML = '';
           
           try {
             let finalStudentId = wState.studentId;
             const payload = {
               studentId: finalStudentId,
               newStudent: wState.newStudent,
               tutorName: wState.tutorName,
               tutorPhone: wState.tutorPhone,
               tutorCedula: wState.tutorCedula,
               institucionId: wState.institucionId,
               draftId: draftId,
               gradoSolicitado: wState.gradoSolicitado,
               cicloEscolar: wState.cicloEscolar
             };
             
             await reportActivity(true);
             const eres = await api('/enrollments', { method: 'POST', body: payload });
             
             if (broadcast) broadcast.postMessage({ type: 'submitted' });
             clearDraft();
             
             qs('.main').innerHTML = `
               <div class="card" style="max-width:500px; margin:40px auto; text-align:center;">
                 <div style="width:64px; height:64px; background:#2e9e5b; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 20px;">
                   ${ICONS.check}
                 </div>
                 <h2 style="margin-bottom:10px;">¡Solicitud enviada!</h2>
                 <p class="lede" style="margin-bottom:20px;">Tu solicitud de inscripción ha sido enviada exitosamente a la institución. Su estado actual es <strong>${escapeHtml(eres.enrollment.estado)}</strong>. Referencia: ${escapeHtml(eres.enrollment.id)}.</p>
                 <button class="btn btn-primary" onclick="window.location.hash='#/app/inscripciones'">Ver mis inscripciones</button>
               </div>
             `;
           } catch(err) {
             btn.disabled = false;
             btn.textContent = 'Confirmar y Enviar Solicitud';
             qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
           }
         });
       }
    }
    
    await renderStep();
  }


  // ---------------- Documentos de una inscripcion ----------------
  const TIPOS_DOCUMENTO = ['Acta de nacimiento', 'Cédula o identificación del tutor', 'Certificado de notas', 'Foto 2x2', 'Otro'];

  function fmtBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  async function renderDocumentosInscripcion(enrollmentId) {
    const renderVersion=++enrollmentRenderVersion;
    if(window._enrollmentCleanup){window._enrollmentCleanup();window._enrollmentCleanup=null;}
    const container=qs('.main');
    let enrollment;
    try {
      const res = await api('/enrollments/' + encodeURIComponent(enrollmentId));
      enrollment = res.enrollment;
    } catch (e) {
      if(container.isConnected && renderVersion===enrollmentRenderVersion)enrollmentError(container,e,()=>renderDocumentosInscripcion(enrollmentId));
      return;
    }
    if (!enrollment) {
      qs('.main').innerHTML = '<div class="alert error">Inscripción no encontrada o sin acceso.</div>';
      return;
    }
    const u = state.user;
    const isOwnerTutor = u.role === 'Tutor' && enrollment.tutorId === u.id;
    const canDecide = isAdmin() || (u.role === 'Personal de institución' && u.institucionId === enrollment.institucionId);

    const { documents } = await api('/enrollments/' + enrollmentId + '/documents');
    
    let configurados = enrollment.requisitosSnapshot;
    if (!configurados || !configurados.length) {
      configurados = TIPOS_DOCUMENTO.map(t => ({ tipo: t, formatos: ['PDF','JPG','PNG'], maxSizeMB: 5 }));
    }

    const docsByType = {};
    documents.forEach(d => {
      const t = d.tipoDocumento;
      if (!docsByType[t]) docsByType[t] = [];
      docsByType[t].push(d);
    });

    const isCorrectionsMode = enrollment.estado === 'Documentos pendientes' && isOwnerTutor;

    let html = `
      <button class="back-link" data-nav="#/app/inscripciones">${ICONS.back} Volver a inscripciones</button>
      <button class="btn btn-secondary" data-nav="#/app/inscripciones/${encodeURIComponent(enrollmentId)}/detalle">Abrir detalle y revisión</button>
      <div class="page-head">
        <div>
          <h2>Documentos — ${escapeHtml(enrollment.estudianteNombre)}</h2>
          <div class="sub">${escapeHtml(enrollment.institucionNombre)} · ${escapeHtml(enrollment.gradoSolicitado)} · ${escapeHtml(enrollment.cicloEscolar)}</div>
          <div style="margin-top:5px;">${enrollment.estado === 'Documentos pendientes' ? '<span class="pill" style="background:#ef4444;color:#fff;">Correcciones requeridas</span>' : ''}</div>
        </div>
      </div>
      
      <div style="max-width:800px;">
    `;

    let pendingCorrections = false;

    configurados.forEach((req, idx) => {
      const docType = (req.nombre || req.tipo || req).trim();
      const docsOfThisType = docsByType[docType] || [];
      const latestDoc = docsOfThisType.length > 0 ? docsOfThisType[0] : null;
      
      const isRejected = latestDoc && latestDoc.estado === 'Rechazado';
      if (isRejected || !latestDoc) pendingCorrections = true;
      const isAccepted = latestDoc && latestDoc.estado === 'Aceptado';
      const isPending = latestDoc && latestDoc.estado === 'Pendiente';
      
      let badge = '';
      if (isAccepted) badge = '<span style="color:#16a34a; font-weight:bold; font-size:12px;">✓ Aprobado</span>';
      else if (isRejected) badge = '<span style="color:#ef4444; font-weight:bold; font-size:12px;">✗ Rechazado</span>';
      else if (isPending) badge = '<span style="color:#eab308; font-weight:bold; font-size:12px;">En revisión</span>';
      else badge = '<span style="color:var(--text-muted); font-size:12px;">Falta documento</span>';

      html += `
        <div class="card" style="margin-bottom:15px; padding:20px; border-left:4px solid ${isRejected ? '#ef4444' : isAccepted ? '#16a34a' : isPending ? '#eab308' : 'var(--c-border)'}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div>
              <h3 style="margin:0 0 5px 0;">${escapeHtml(docType)}</h3>
              ${req.descripcion ? `<div style="font-size:13px; color:var(--text-muted); margin-bottom:5px;">${escapeHtml(req.descripcion)}</div>` : ''}
              <div>${badge}</div>
            </div>
            ${latestDoc ? `<a href="/api/documents/${latestDoc.id}/file" target="_blank" rel="noopener" class="btn btn-secondary btn-small" style="text-decoration:none;">Ver archivo (${(latestDoc.size/1024/1024).toFixed(2)}MB)</a>` : ''}
          </div>
      `;

      if (isRejected && latestDoc.motivoRechazo) {
        html += `<div style="background:#fef2f2; border:1px solid #f87171; color:#991b1b; padding:10px; border-radius:6px; margin-bottom:15px; font-size:13px;"><strong>Motivo del rechazo:</strong> ${escapeHtml(latestDoc.motivoRechazo)}</div>`;
      }
      
      if (latestDoc && canDecide && isPending && ['En revisión','Documentos pendientes'].includes(enrollment.estado)) {
        html += `
          <div style="margin-top:15px; border-top:1px solid var(--c-border); padding-top:15px; display:flex; gap:10px;">
            <button class="btn btn-primary btn-small doc-accept-btn" data-id="${latestDoc.id}">Aprobar</button>
            <button class="btn btn-danger btn-small doc-reject-btn" data-id="${latestDoc.id}">Rechazar</button>
          </div>
        `;
      }
      
      const canUpload = isOwnerTutor && enrollment.estado === 'Documentos pendientes' && (!latestDoc || isRejected);
      
      if (canUpload) {
        const allowedExt = (req.formatos || ['PDF','JPG','PNG']).map(f => '.'+f.toLowerCase()).join(',');
        html += `
          <div style="margin-top:15px;">
            <div style="font-size:12px; font-weight:bold; margin-bottom:5px;">Subir corrección:</div>
            <div class="doc-upload-area" id="area-${idx}" style="border:2px dashed var(--c-border); padding:20px; text-align:center; border-radius:8px; cursor:pointer; background:var(--bg-body); transition:background 0.2s;">
              <div style="color:var(--text-muted); margin-bottom:10px;">${ICONS.document}</div>
              <div style="font-size:13px; font-weight:bold; margin-bottom:4px;">Haz clic o arrastra el nuevo archivo</div>
              <div style="font-size:11px; color:var(--text-muted);">Formatos permitidos: ${(req.formatos||['PDF','JPG','PNG']).join(', ')} · Máx: ${req.maxMb||req.maxSizeMB||5} MB</div>
              <input type="file" id="file-${idx}" accept="${allowedExt}" style="display:none;" data-type="${escapeHtml(docType)}" data-max="${req.maxMb||req.maxSizeMB||5}">
            </div>
            <div id="upload-status-${idx}" style="margin-top:10px; font-size:12px;"></div>
          </div>
        `;
      }

      html += `</div>`;
    });
    
    if (isCorrectionsMode) {
       html += `
         <div class="card" style="margin-top:20px; text-align:right;">
           <button class="btn btn-primary" id="btn-submit-corrections" ${pendingCorrections ? 'disabled title="Aún hay documentos rechazados sin corregir"' : ''}>Enviar Correcciones</button>
         </div>
       `;
    }

    html += `</div>`;
    
    if(!container.isConnected || renderVersion!==enrollmentRenderVersion)return;
    container.innerHTML = '<div id="document-update" role="status"></div>' + html;
    bindShellEvents();
    let checking=false;
    watchEnrollments(async()=>{
      if(checking || !container.isConnected || renderVersion!==enrollmentRenderVersion)return;
      checking=true;
      try {
        const latest=await api('/enrollments/'+encodeURIComponent(enrollmentId));
        if(!container.isConnected || renderVersion!==enrollmentRenderVersion)return;
        if(latest.enrollment.version!==enrollment.version){
          qsa('.doc-accept-btn,.doc-reject-btn,#btn-submit-corrections',container).forEach(b=>b.disabled=true);
          const modal=qs('#mod-confirm')?.closest('.sidebar-backdrop');if(modal){modal.dataset.obsolete='true';qs('#mod-confirm',modal).disabled=true;}
          const notice=qs('#document-update',container);notice.innerHTML='<p class="notice">La solicitud cambió. Actualiza los documentos antes de decidir. <button class="btn btn-secondary" id="refresh-documents">Actualizar documentos</button></p>';qs('#refresh-documents',notice).onclick=()=>renderDocumentosInscripcion(enrollmentId);
        }
      }catch(error){if(container.isConnected && renderVersion===enrollmentRenderVersion){qsa('.doc-accept-btn,.doc-reject-btn,#btn-submit-corrections',container).forEach(b=>b.disabled=true);qs('#document-update',container).innerHTML='<p>No se pudo verificar el estado. <button class="btn btn-secondary" id="refresh-documents">Reintentar</button></p>';qs('#refresh-documents',container).onclick=()=>renderDocumentosInscripcion(enrollmentId);}}
      finally{checking=false;}
    });

    qsa('.doc-accept-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        customConfirm('¿Seguro que deseas aprobar este documento?', 'Aprobar', async () => {
          try {
            await api('/documents/' + btn.dataset.id + '/decidir', { method: 'POST', body: { estado: 'Aceptado', version: enrollment.version } });
            toast('Documento aprobado.', 'ok');
            renderDocumentosInscripcion(enrollmentId);
          } catch (err) { toast(err.message, 'error'); }
        });
      });
    });

    qsa('.doc-reject-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        showConfirmModal({
          title: 'Rechazar Documento',
          bodyHtml: `
            <p>Indica el motivo por el que se rechaza este documento. El tutor deberá subir uno nuevo.</p>
            <div class="field"><label>Motivo del rechazo</label>
              <textarea id="rechazo-motivo" rows="3" required></textarea>
            </div>
          `,
          confirmText: 'Rechazar',
          danger: true,
          onConfirm: async () => {
            const motivo = document.getElementById('rechazo-motivo').value;
            if (!motivo || !motivo.trim()) {
              toast('Debes indicar un motivo', 'error');
              return true;
            }
            try {
              await api('/documents/' + btn.dataset.id + '/decidir', { method: 'POST', body: { estado: 'Rechazado', motivo, version: enrollment.version } });
              toast('Documento rechazado.', 'ok');
              renderDocumentosInscripcion(enrollmentId);
              return false;
            } catch (err) {
              toast(err.message, 'error');
              return true;
            }
          }
        });
      });
    });
    
    const btnSubmit = qs('#btn-submit-corrections');
    if (btnSubmit) {
       btnSubmit.addEventListener('click', () => {
          customConfirm('¿Seguro que deseas enviar estas correcciones? La solicitud volverá a estado de revisión.', 'Enviar correcciones', async () => {
             btnSubmit.disabled = true;
             btnSubmit.textContent = 'Enviando...';
             try {
                await api('/enrollments/' + enrollmentId + '/correcciones', { method: 'POST', body: {version:enrollment.version} });
                toast('Correcciones enviadas.', 'ok');
                renderDocumentosInscripcion(enrollmentId);
             } catch(e) {
                toast(e.message, 'error');
                btnSubmit.disabled = false;
                btnSubmit.textContent = 'Enviar Correcciones';
             }
          });
       });
    }

    let isUploading = false;
    qsa('.doc-upload-area').forEach(area => {
      const input = area.querySelector('input[type="file"]');
      const statusEl = area.nextElementSibling;
      const type = input.getAttribute('data-type');
      const maxMB = parseFloat(input.getAttribute('data-max'));
      
      const uploadFile = async (file) => {
        if (isUploading) return;
        isUploading = true;
        
        if (file.size > maxMB * 1024 * 1024) {
          statusEl.innerHTML = `<span style="color:#ef4444;">El archivo supera el tamaño máximo permitido (${maxMB} MB).</span>`;
          isUploading = false;
          return;
        }
        
        const fd = new FormData();
        fd.append('archivo', file);
        fd.append('tipoDocumento', type);
        
        statusEl.innerHTML = '<span style="color:#3b82f6;">Cargando documento... (Por favor espera)</span>';
        
        try {
          await api('/enrollments/' + enrollmentId + '/documents', { method: 'POST', body: fd, isMultipart: true });
          toast('Documento subido correctamente.', 'ok');
          renderDocumentosInscripcion(enrollmentId);
        } catch(e) {
          statusEl.innerHTML = `<span style="color:#ef4444;">${e.errors ? e.errors[0] : 'Error al cargar el documento.'} <button class="btn btn-ghost btn-small" style="padding:0; margin-left:5px; text-decoration:underline;">Reintentar</button></span>`;
          const retryBtn = statusEl.querySelector('button');
          if (retryBtn) retryBtn.addEventListener('click', () => uploadFile(file));
        } finally {
          isUploading = false;
        }
      };

      area.addEventListener('click', () => { if (!isUploading) input.click(); });
      
      area.addEventListener('dragover', e => { e.preventDefault(); area.style.background = 'var(--bg-card)'; });
      area.addEventListener('dragleave', e => { e.preventDefault(); area.style.background = 'var(--bg-body)'; });
      area.addEventListener('drop', e => {
        e.preventDefault();
        area.style.background = 'var(--bg-body)';
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          uploadFile(e.dataTransfer.files[0]);
        }
      });
      
      input.addEventListener('change', e => {
        if (e.target.files && e.target.files.length > 0) {
          uploadFile(e.target.files[0]);
        }
      });
    });
  }

  // ---------------- Periodos de ciclo escolar ----------------
  function fmtDateShort(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function rangeLabel(range) {
    if (!range || !range.desde || !range.hasta) return 'No configurado';
    return fmtDateShort(range.desde) + ' \u2013 ' + fmtDateShort(range.hasta);
  }

  async function renderPeriodosList(institucionId) {
    const [nombre, { periods }] = await Promise.all([
      institucionNombre(institucionId),
      api('/institutions/' + institucionId + '/periods'),
    ]);
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="${isAdmin() ? '#/app/instituciones' : '#/app/instituciones/' + institucionId + '/detalle'}">${ICONS.back} Volver a ${isAdmin() ? 'instituciones' : 'detalles'}</button>
      <div class="page-head"><div><h2>Periodos \u2014 ${escapeHtml(nombre)}</h2><div class="sub">Ventanas de inscripci\u00f3n, env\u00edo de documentos y citas por ciclo escolar.</div></div>
        <button class="btn btn-primary" style="width:auto; padding:10px 18px;" data-nav="#/app/instituciones/${institucionId}/periodos/nueva">Nuevo ciclo</button>
      </div>
      <div class="table-card">
        <table>
          <thead><tr><th>Ciclo</th><th>Inscripci\u00f3n</th><th>Documentos</th><th>Citas</th><th>Documentos requeridos</th><th>Acciones</th></tr></thead>
          <tbody>
            ${periods.length ? periods.map((p) => `<tr>
              <td>${escapeHtml(p.cicloEscolar)}</td>
              <td>${rangeLabel(p.inscripcion)}</td>
              <td>${rangeLabel(p.documentos)}</td>
              <td>${p.citas ? `${rangeLabel(p.citas)}${p.citas.limiteCitas ? ' \u00b7 m\u00e1x. ' + p.citas.limiteCitas : ''}` : 'No configurado'}</td>
              <td>${p.documentosRequeridos && p.documentosRequeridos.length ? p.documentosRequeridos.length + ' tipo(s)' : 'Lista por defecto'}</td>
              <td><span class="actions-cell">
                <button class="neutral" data-editar-periodo="${p.id}">Ver ciclo</button>
                <button class="danger" data-eliminar-periodo="${p.id}">Eliminar</button>
              </span></td>
            </tr>`).join('') : `<tr><td colspan="6"><div class="empty-state">No hay ciclos configurados todav\u00eda. Sin un ciclo configurado no se aplican restricciones de fecha.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
    bindShellEvents();
    qsa('[data-editar-periodo]').forEach((b) => b.addEventListener('click', () => navigate('#/app/instituciones/' + institucionId + '/periodos/' + b.dataset.editarPeriodo + '/editar')));
    qsa('[data-eliminar-periodo]').forEach((b) => b.addEventListener('click', async () => {
      customConfirm('\u00bfEliminar por completo la configuraci\u00f3n de este ciclo? Esta acci\u00f3n no se puede deshacer.', 'Sí, eliminar', async () => {
        try {
          await api('/institutions/' + institucionId + '/periods/' + b.dataset.eliminarPeriodo, { method: 'DELETE' });
          toast('Configuraci\u00f3n eliminada.', 'ok');
          renderPeriodosList(institucionId);
        } catch (err) { toast(err.message, 'err'); }
      });
    }));
  }

  async function renderPeriodoNuevoForm(institucionId) {
    const nombre = await institucionNombre(institucionId);
    const ciclos = cicloOptions();
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="#/app/instituciones/${institucionId}/periodos">${ICONS.back} Volver a periodos</button>
      <div class="page-head"><h2>Nuevo ciclo \u2014 ${escapeHtml(nombre)}</h2></div>
      <div class="chart-card" style="max-width:420px;">
        <div id="err"></div>
        <form id="period-new-form">
          <div class="field"><label>Ciclo escolar</label>
            <select name="cicloEscolar">${ciclos.map((c) => `<option>${c}</option>`).join('')}</select>
          </div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" style="width:auto; padding:12px 22px;" type="submit">Crear</button>
            <button class="btn btn-ghost" style="width:auto; padding:12px 22px;" type="button" data-nav="#/app/instituciones/${institucionId}/periodos">Cancelar</button>
          </div>
        </form>
      </div>
    `;
    bindShellEvents();
    qs('#period-new-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      try {
        const { period } = await api('/institutions/' + institucionId + '/periods', { method: 'POST', body: Object.fromEntries(fd.entries()) });
        toast('Ciclo creado. Ahora configura sus periodos.', 'ok');
        navigate('#/app/instituciones/' + institucionId + '/periodos/' + period.id + '/editar');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
  }

  async function renderPeriodoForm(institucionId, periodId) {
    const [nombre, { periods, tiposDocumentoDisponibles }] = await Promise.all([
      institucionNombre(institucionId),
      api('/institutions/' + institucionId + '/periods'),
    ]);
    const period = periods.find((p) => p.id === periodId);
    if (!period) {
      qs('.main').innerHTML = '<div class="empty-state">No se encontró esa configuración de periodo.</div>';
      return;
    }
    const u = state.user;
    const canManage = isAdmin() || u.role === 'Soporte' || (u.role === 'Personal de institución' && String(u.institucionId) === String(institucionId));

    const now = new Date();
    function getStatus(range) {
      if (!range || !range.desde || !range.hasta) return { label: 'No configurado', class: 'status-gray' };
      const d = new Date(range.desde);
      const h = new Date(range.hasta);
      if (now < d) return { label: 'Próximo', class: 'status-blue' };
      if (now > h) return { label: 'Finalizado', class: 'status-gray' };
      return { label: 'Activo', class: 'status-green' };
    }

    const fmtDt = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
             d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
    };

    const toInput = (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      const pad = (n) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    function renderHito(tipo, title, range, limit, occupied) {
      const st = getStatus(range);
      const dates = range ? `<div style="margin-top:8px; font-size:14px; color:var(--text-color);">Desde: <strong>${fmtDt(range.desde)}</strong><br>Hasta: <strong>${fmtDt(range.hasta)}</strong></div>` : '';
      let extras = '';
      if (tipo === 'citas' && limit) {
        const occ = occupied || 0;
        const disponibles = Math.max(0, limit - occ);
        let dispCol = 'var(--text-color)';
        if (disponibles === 0) dispCol = 'var(--danger-color)';
        else if (disponibles <= limit * 0.2) dispCol = 'var(--warning-color)';
        else dispCol = 'var(--success-color)';
        
        extras = `<div style="margin-top:6px; font-size:13px; color:var(--help-color);">
          Límite total: <strong>${limit}</strong> &bull; 
          Ocupados: <strong>${occ}</strong> &bull; 
          Disponibles: <strong style="color:${dispCol}">${disponibles}</strong>
        </div>`;
      }
      const actions = canManage ? `
        <div style="margin-top:12px; display:flex; gap:8px;">
          <button class="btn btn-ghost" style="padding:6px 12px; font-size:13px;" data-edit-hito="${tipo}">${range ? 'Editar' : 'Agregar'}</button>
          ${range ? `<button class="btn btn-ghost danger" style="padding:6px 12px; font-size:13px;" data-delete-hito="${tipo}">Eliminar</button>` : ''}
        </div>
      ` : '';

      return `
        <div style="display:flex; gap:16px; margin-bottom:24px; position:relative;">
          <div style="width:16px; display:flex; flex-direction:column; align-items:center;">
            <div style="width:12px; height:12px; border-radius:50%; background:var(--${st.class === 'status-green' ? 'success' : st.class === 'status-blue' ? 'primary' : 'border'}-color); margin-top:6px;"></div>
            <div style="flex:1; width:2px; background:var(--border-color); margin-top:8px;"></div>
          </div>
          <div class="chart-card" style="flex:1; margin:0;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
              <h3 style="margin:0; font-size:16px;">${title}</h3>
              <span class="badge ${st.class}">${st.label}</span>
            </div>
            ${dates}
            ${extras}
            ${actions}
          </div>
        </div>
      `;
    }

    qs('.main').innerHTML = `
      <button class="back-link" data-nav="#/app/instituciones/${institucionId}/periodos">${ICONS.back} Volver a periodos</button>
      <div class="page-head"><h2>Ciclo ${escapeHtml(period.cicloEscolar)} &mdash; ${escapeHtml(nombre)}</h2></div>
      
      <div style="max-width:640px; padding-left:8px; margin-top:20px;">
        ${renderHito('inscripcion', 'Periodo de inscripción', period.inscripcion)}
        ${renderHito('documentos', 'Periodo de envío de documentos', period.documentos)}
        ${renderHito('citas', 'Periodo para agendar citas', period.citas, period.citas?.limiteCitas, period.citas?.ocupados)}
      </div>

      <div id="docs-editor-container"></div>
      <div id="period-modal-container"></div>
    `;

    bindShellEvents();
    const nivelesDisponibles = ['Inicial', 'Primaria', 'Secundaria'];
    const formatosDisponibles = ['PDF', 'JPG', 'PNG'];
    let docsState = (period.documentosRequeridos || []).map(d => {
      if (typeof d === 'string') {
        return { id: Math.random().toString(36).substr(2, 9), nombre: d, niveles: nivelesDisponibles ? nivelesDisponibles.slice() : [], descripcion: '', formatos: formatosDisponibles ? formatosDisponibles.slice() : [], maxMb: 5 };
      }
      return { ...d, id: Math.random().toString(36).substr(2, 9) };
    });
    let docsOriginal = JSON.stringify(docsState);

    window._navInterceptor = (pendingHash) => {
      if (JSON.stringify(docsState) !== docsOriginal) {
        customConfirm('Tienes cambios sin guardar en los documentos. ¿Seguro que deseas salir?', 'Sí, salir', () => {
          window._navInterceptor = null;
          if (pendingHash) navigate(pendingHash);
        });
        return false;
      }
      return true;
    };

    function updateDocsActionState() {
      const isDirty = JSON.stringify(docsState) !== docsOriginal;
      const resetBtn = qs('#btn-reset-docs');
      const cancelBtn = qs('#btn-cancel-docs');
      if (resetBtn) resetBtn.disabled = !isDirty;
      if (cancelBtn) cancelBtn.disabled = !isDirty;
    }

    function renderDocsEditor() {
      const container = qs('#docs-editor-container');
      if (!container) return;
      const isDirty = JSON.stringify(docsState) !== docsOriginal;

      container.innerHTML = `
        <div class="chart-card" style="margin-top:20px; max-width:800px;">
          <h3>Documentos requeridos para inscripción</h3>
          <div class="help" style="margin-bottom:12px;">Configura los documentos que los tutores deberán subir.</div>
          <div id="docs-global-err"></div>
          
          <div style="display:flex; flex-direction:column; gap:16px;">
            ${docsState.map((doc, idx) => `
              <div class="card" style="padding:16px; border:1px solid var(--c-border); box-shadow:none;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                  <strong style="font-size:15px;">Documento ${idx + 1}</strong>
                  ${canManage ? `<button type="button" class="btn btn-ghost" style="color:var(--danger-color); padding:4px 8px; font-size:13px; width:auto;" data-doc-idx="${idx}">Quitar documento</button>` : ''}
                </div>
                
                <div class="two-col">
                  <div class="field">
                    <label>Nombre del documento</label>
                    <input type="text" class="doc-input" data-field="nombre" data-idx="${idx}" value="${escapeHtml(doc.nombre)}" placeholder="Ej: Acta de nacimiento" ${!canManage ? 'disabled' : ''}>
                  </div>
                  <div class="field">
                    <label>Tamaño máximo (1-10 MB)</label>
                    <input type="number" class="doc-input" data-field="maxMb" data-idx="${idx}" min="1" max="10" value="${doc.maxMb}" ${!canManage ? 'disabled' : ''}>
                  </div>
                </div>
                
                <div class="field" style="margin-top:8px;">
                  <label>Descripción / Instrucciones</label>
                  <input type="text" class="doc-input" data-field="descripcion" data-idx="${idx}" value="${escapeHtml(doc.descripcion)}" placeholder="Opcional. Ej: Subir de ambos lados" ${!canManage ? 'disabled' : ''}>
                </div>

                <div class="two-col" style="margin-top:8px;">
                  <div class="field">
                    <label>Niveles educativos aplicables</label>
                    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:4px;">
                      ${(nivelesDisponibles || []).map(n => `
                        <label style="display:flex; align-items:center; gap:4px; font-size:13px;">
                          <input type="checkbox" class="doc-checkbox" data-field="niveles" data-val="${escapeHtml(n)}" data-idx="${idx}" ${(doc.niveles || []).includes(n) ? 'checked' : ''} ${!canManage ? 'disabled' : ''}>
                          ${escapeHtml(n)}
                        </label>
                      `).join('')}
                    </div>
                  </div>
                  
                  <div class="field">
                    <label>Formatos permitidos</label>
                    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:4px;">
                      ${(formatosDisponibles || []).map(f => `
                        <label style="display:flex; align-items:center; gap:4px; font-size:13px;">
                          <input type="checkbox" class="doc-checkbox" data-field="formatos" data-val="${escapeHtml(f)}" data-idx="${idx}" ${(doc.formatos || []).includes(f) ? 'checked' : ''} ${!canManage ? 'disabled' : ''}>
                          ${escapeHtml(f)}
                        </label>
                      `).join('')}
                    </div>
                  </div>
                </div>
                <div id="doc-err-${idx}" style="margin-top:8px;"></div>
              </div>
            `).join('')}
            
            ${docsState.length === 0 ? '<div class="empty-state" style="padding:20px;">No hay documentos configurados. Usa el botón de agregar.</div>' : ''}
          </div>

          ${canManage ? `
            <button type="button" class="btn btn-ghost" style="margin-top:16px; width:auto; display:flex; align-items:center; gap:6px;" id="btn-add-doc">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Agregar documento
            </button>
            <hr style="margin:24px 0; border:none; border-top:1px solid var(--c-border);">
            <div style="display:flex; gap:10px; justify-content:flex-end;">
              <button type="button" class="btn btn-ghost" id="btn-reset-docs" style="width:auto;" ${!isDirty ? 'disabled' : ''}>Resetear</button>
              <button type="button" class="btn btn-ghost" id="btn-cancel-docs" style="width:auto;" ${!isDirty ? 'disabled' : ''}>Cancelar</button>
              <button type="button" class="btn btn-primary" id="btn-save-docs" style="width:auto;">Guardar cambios</button>
            </div>
          ` : ''}
        </div>
      `;

      if (canManage) {
        qsa('.doc-input', container).forEach(inp => {
          inp.addEventListener('input', (e) => {
            const idx = parseInt(e.target.dataset.idx, 10);
            const field = e.target.dataset.field;
            let val = e.target.value;
            if (field === 'maxMb') val = parseInt(val, 10) || 0;
            docsState[idx][field] = val;
            updateDocsActionState();
          });
        });
        
        qsa('.doc-checkbox', container).forEach(chk => {
          chk.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.idx, 10);
            const field = e.target.dataset.field;
            const val = e.target.dataset.val;
            docsState[idx][field] = docsState[idx][field] || [];
            if (e.target.checked) {
              if (!docsState[idx][field].includes(val)) docsState[idx][field].push(val);
            } else {
              docsState[idx][field] = docsState[idx][field].filter(v => v !== val);
            }
            updateDocsActionState();
          });
        });

        const addDocBtn = qs('#btn-add-doc', container);
        if (addDocBtn) {
          addDocBtn.addEventListener('click', () => {
            docsState.push({ id: Math.random().toString(36).substr(2, 9), nombre: '', niveles: (nivelesDisponibles||[]).slice(), descripcion: '', formatos: (formatosDisponibles||[]).slice(), maxMb: 5 });
            renderDocsEditor();
          });
        }

        qsa('[data-doc-idx]', container).forEach(btn => {
          btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.docIdx, 10);
            const docName = docsState[idx].nombre || ('Documento ' + (idx + 1));
            customConfirm('¿Seguro que deseas quitar el requisito "' + escapeHtml(docName) + '"?', 'Sí, quitar', () => {
              docsState.splice(idx, 1);
              renderDocsEditor();
            });
          });
        });

        const resetBtn = qs('#btn-reset-docs', container);
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            docsState = JSON.parse(docsOriginal);
            renderDocsEditor();
          });
        }

        const cancelBtn = qs('#btn-cancel-docs', container);
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => {
            customConfirm('¿Seguro que deseas cancelar? Se perderán los cambios no guardados.', 'Sí, cancelar', () => {
              docsState = JSON.parse(docsOriginal);
              window._navInterceptor = null;
              navigate('#/app/instituciones/' + institucionId + '/periodos');
            });
          });
        }

        const saveBtn = qs('#btn-save-docs', container);
        if (saveBtn) {
          saveBtn.addEventListener('click', async () => {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Guardando...';
            const globalErr = qs('#docs-global-err', container);
            if (globalErr) globalErr.innerHTML = '';
            qsa('[id^="doc-err-"]', container).forEach(el => el.innerHTML = '');

            if (docsState.length === 0) {
              if (globalErr) globalErr.innerHTML = fieldErrorsBlock(['La lista de documentos no puede estar vacía si se envía.']);
              saveBtn.disabled = false;
              saveBtn.textContent = 'Guardar cambios';
              return;
            }

            try {
              // Limpiar 'id' temporal antes de guardar
              const payload = docsState.map(d => {
                const copy = {...d}; delete copy.id; return copy;
              });
              await api('/institutions/' + institucionId + '/periods/' + periodId, { method: 'PUT', body: { documentosRequeridos: payload } });
              docsOriginal = JSON.stringify(docsState);
              toast('Documentos actualizados correctamente.', 'ok');
              renderDocsEditor();
            } catch (err) {
              if (err.errors) {
                 const gErr = [];
                 err.errors.forEach(e => {
                   const m = e.match(/Documento(?: en posición)? "?([^"]+)"?: (.+)/);
                   if (m) {
                     const docId = m[1];
                     let foundIdx = -1;
                     if (docId.match(/^\d+$/)) foundIdx = parseInt(docId, 10) - 1;
                     else foundIdx = docsState.findIndex(d => d.nombre === docId);
                     
                     if (foundIdx >= 0 && qs('#doc-err-' + foundIdx, container)) {
                       qs('#doc-err-' + foundIdx, container).innerHTML += '<div style="color:var(--danger-color); font-size:13px; margin-top:4px;">' + escapeHtml(m[2]) + '</div>';
                     } else {
                       gErr.push(e);
                     }
                   } else {
                     gErr.push(e);
                   }
                 });
                 if (gErr.length > 0 && globalErr) globalErr.innerHTML = fieldErrorsBlock(gErr);
              } else {
                 if (globalErr) globalErr.innerHTML = fieldErrorsBlock([err.message]);
              }
            } finally {
              saveBtn.disabled = false;
              saveBtn.textContent = 'Guardar cambios';
            }
          });
        }
      }
    }
    
    renderDocsEditor();

    if (canManage) {
      qsa('[data-edit-hito]').forEach(b => b.addEventListener('click', () => {
        const tipo = b.dataset.editHito;
        const isCitas = tipo === 'citas';
        const range = period[tipo];
        const title = tipo === 'inscripcion' ? 'Periodo de inscripción' : 
                      tipo === 'documentos' ? 'Periodo de envío de documentos' : 
                      'Periodo para agendar citas';

        qs('#period-modal-container').innerHTML = `
          <div class="sidebar-backdrop visible" style="z-index:9999; display:flex; align-items:center; justify-content:center;">
            <div class="card" style="width:100%; max-width:480px; padding:24px; position:relative; z-index:10000; text-align:left; box-sizing:border-box; margin: 0 16px;">
              <h3 style="margin-top:0;">${range ? 'Editar' : 'Agregar'} ${title}</h3>
              <div id="hito-err"></div>
              <form id="hito-form">
                <div class="two-col" style="margin-top:16px;">
                  <div class="field">
                    <label>Desde</label>
                    <input type="datetime-local" name="desde" value="${toInput(range?.desde)}" required>
                  </div>
                  <div class="field">
                    <label>Hasta</label>
                    <input type="datetime-local" name="hasta" value="${toInput(range?.hasta)}" required>
                  </div>
                </div>
                ${isCitas ? `
                <div class="field">
                  <label>Límite de citas (opcional)</label>
                  <input type="number" min="1" name="limiteCitas" value="${range?.limiteCitas || ''}">
                </div>
                ` : ''}
                <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:24px;">
                  <button type="button" class="btn btn-ghost" style="width:auto;" id="hito-cancel">Cancelar</button>
                  <button type="submit" class="btn btn-primary" style="width:auto;">Guardar</button>
                </div>
              </form>
            </div>
          </div>
        `;

        qs('#hito-cancel').addEventListener('click', () => qs('#period-modal-container').innerHTML = '');
        
        const form = qs('#hito-form');
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          qs('#hito-err').innerHTML = '';
          const fd = new FormData(form);
          const d = fd.get('desde');
          const h = fd.get('hasta');
          if (new Date(h) <= new Date(d)) {
            qs('#hito-err').innerHTML = fieldErrorsBlock(['La fecha de cierre debe ser posterior a la fecha de inicio.']);
            return;
          }

          const body = { [tipo]: { desde: new Date(d).toISOString(), hasta: new Date(h).toISOString() } };
          if (isCitas) body[tipo].limiteCitas = fd.get('limiteCitas') || null;

          const submitBtn = form.querySelector('button[type="submit"]');
          submitBtn.disabled = true;
          submitBtn.textContent = 'Guardando...';

          try {
            await api('/institutions/' + institucionId + '/periods/' + periodId, { method: 'PUT', body });
            toast('Periodo guardado.', 'ok');
            qs('#period-modal-container').innerHTML = '';
            renderPeriodoForm(institucionId, periodId);
          } catch (err) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Guardar';
            qs('#hito-err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
          }
        });
      }));

      qsa('[data-delete-hito]').forEach(b => b.addEventListener('click', () => {
        const tipo = b.dataset.deleteHito;
        const range = period[tipo];
        const title = tipo === 'inscripcion' ? 'Periodo de inscripción' : 
                      tipo === 'documentos' ? 'Periodo de envío de documentos' : 
                      'Periodo para agendar citas';
        const typeStr = tipo === 'inscripcion' ? 'solicitudes de inscripción' :
                        tipo === 'documentos' ? 'documentos enviados' : 'citas agendadas';
                        
        showConfirmModal({
          title: `¿Eliminar ${title.toLowerCase()}?`,
          bodyHtml: `
            <p>Esta acción no se puede deshacer.</p>
            <div style="background:var(--bg-color); padding:12px; border-radius:6px; margin:16px 0; font-size:14px;">
              <strong>Desde:</strong> ${fmtDt(range.desde)}<br>
              <strong>Hasta:</strong> ${fmtDt(range.hasta)}
            </div>
            <p class="help">Si el periodo ya tiene <strong>${typeStr}</strong> asociadas, el sistema no permitirá su eliminación para evitar pérdida de datos. Los usuarios que hayan programado algo durante este tiempo podrían verse afectados.</p>
          `,
          confirmText: 'Sí, eliminar',
          danger: true,
          onConfirm: async () => {
            await api('/institutions/' + institucionId + '/periods/' + periodId + '/' + tipo, { method: 'DELETE' });
            toast('Periodo eliminado.', 'ok');
            renderPeriodoForm(institucionId, periodId);
          }
        });
      }));
    }
  }

  // ---------------- Citas ----------------
  function fmtAppointment(iso) {
    return new Intl.DateTimeFormat('es-DO',{timeZone:'America/Santo_Domingo',dateStyle:'medium',timeStyle:'short'}).format(new Date(iso))+' · America/Santo_Domingo (UTC−4)';
  }
  function appointmentState(a) {
    const icons={Pendiente:'◷',Aceptada:'✓',Rechazada:'✕',Cancelada:'⊘'};
    return `<span class="pill appointment-state">${icons[a.estado]||'•'} ${escapeHtml(a.estado)}</span>`;
  }
  function appointmentSummary(a) {
    return `<p><strong>${escapeHtml(a.institucionNombre)}</strong> · ${escapeHtml(a.id||'Nueva cita')}</p><p>${escapeHtml(a.estudianteNombre||'General')} ${a.enrollmentId?'· Solicitud '+escapeHtml(a.enrollmentId):''}</p><p>${escapeHtml(fmtAppointment(a.fechaHoraConfirmada||a.fechaHoraSolicitada))}</p>`;
  }
  let appointmentRenderVersion=0;
  async function renderCitas(query={}) {
    const version=++appointmentRenderVersion,container=qs('.main');
    const params=new URLSearchParams({...query,page:query.page||1,limit:10});
    container.innerHTML='<p class="loading" role="status">Cargando citas…</p>';
    try {
      const data=await api('/appointments?'+params);
      if(!container.isConnected||version!==appointmentRenderVersion)return;
      const {appointments,total,page,limit}=data,pages=Math.max(1,Math.ceil(total/limit));
      container.innerHTML=`<div class="page-head"><div><h2>Citas</h2><p class="sub">Pendiente significa que falta la aceptación del personal. Zona horaria: America/Santo_Domingo (UTC−4).</p></div><button class="btn btn-primary" data-nav="#/app/citas/nueva">Nueva cita</button></div>
        <div id="appointment-update" role="status"></div>
        <form class="filters" id="appointment-filters">
          <label>Estado<select name="estado">${['Todos','Pendiente','Aceptada','Rechazada','Cancelada'].map(v=>`<option ${query.estado===v?'selected':''}>${v}</option>`).join('')}</select></label>
          <label>Fecha<input type="date" name="fecha" value="${escapeHtml(query.fecha||'')}"></label>
          <label>Mostrar<select name="grupo">${[['','Todas'],['proximas','Próximas'],['anteriores','Anteriores o cerradas']].map(([v,label])=>`<option value="${v}" ${query.grupo===v?'selected':''}>${label}</option>`).join('')}</select></label>
          <button class="btn btn-primary">Filtrar</button><button type="button" class="btn btn-secondary" data-nav="#/app/citas">Limpiar filtros</button>
        </form>
        ${state.user.role==='Personal de institución'?`<p><button class="btn btn-secondary" data-nav="#/app/instituciones/${state.user.institucionId}/calendario">Calendario y horarios de mi institución</button></p>`:''}
        <div class="table-card"><table><thead><tr><th>Referencia</th><th>Estudiante / solicitud</th><th>Institución / tutor</th><th>Fecha y hora</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>
        ${appointments.length?appointments.map(a=>`<tr><td data-label="Referencia">${escapeHtml(a.id)}</td><td data-label="Estudiante / solicitud">${escapeHtml(a.estudianteNombre||'General')}<br>${escapeHtml(a.enrollmentId||'Sin solicitud asociada')}</td><td data-label="Institución / tutor">${escapeHtml(a.institucionNombre)}${state.user.role==='Tutor'?'':'<br>'+escapeHtml(a.tutorNombre)}</td><td data-label="Fecha y hora">${escapeHtml(fmtAppointment(a.fechaHoraConfirmada||a.fechaHoraSolicitada))}<p class="help">${['Pendiente','Aceptada'].includes(a.estado)&&new Date(a.fechaHoraSolicitada)>new Date()?'Próxima':'Anterior o cerrada'}</p></td><td data-label="Estado">${appointmentState(a)}${a.motivoRechazo||a.motivoCancelacion?`<p class="help">${escapeHtml(a.motivoRechazo||a.motivoCancelacion)}</p>`:''}</td><td data-label="Acciones"><button class="neutral" data-nav="#/app/citas/${a.id}/detalle">Ver detalle</button></td></tr>`).join(''):'<tr><td colspan="6" class="empty-state">No hay citas con estos filtros. Puedes limpiarlos o solicitar una nueva cita.</td></tr>'}
        </tbody></table><div class="table-footer"><span>Mostrando ${appointments.length} de ${total} citas</span><div class="pagination"><button class="btn btn-ghost" id="appointment-prev" ${page<=1?'disabled':''}>Anterior</button><span>Página ${page} de ${pages}</span><button class="btn btn-ghost" id="appointment-next" ${page>=pages?'disabled':''}>Siguiente</button></div></div></div>`;
      bindShellEvents();
      const filter=(newPage=1)=>{const p=new URLSearchParams(new FormData(qs('#appointment-filters')));p.set('page',newPage);navigate('#/app/citas?'+p);};
      qs('#appointment-filters').onsubmit=e=>{e.preventDefault();filter();};qs('#appointment-prev').onclick=()=>filter(page-1);qs('#appointment-next').onclick=()=>filter(page+1);
      let checking=false,pending=false;
      const check=async()=>{if(checking){pending=true;return;}if(!container.isConnected||version!==appointmentRenderVersion)return;checking=true;try{const fresh=await api('/appointments?'+params);if(!container.isConnected||version!==appointmentRenderVersion)return;const notice=qs('#appointment-update',container);notice.innerHTML=JSON.stringify(fresh)===JSON.stringify(data)?'':'<p class="notice">Hay cambios en las citas. <button class="btn btn-secondary" id="appointment-refresh">Actualizar listado</button></p>';const b=qs('#appointment-refresh',notice);if(b)b.onclick=()=>renderCitas(query);}catch(_){/* Reintenta al recuperar la conexión o el foco. */}finally{checking=false;if(pending){pending=false;check();}}};
      watchEnrollments(check,'appointments');
    }catch(e){if(container.isConnected&&version===appointmentRenderVersion)enrollmentError(container,e,()=>renderCitas(query));}
  }
  async function renderCitaDetalle(id) {
    const version=++appointmentRenderVersion,container=qs('.main');container.innerHTML='<p class="loading" role="status">Cargando cita…</p>';
    try {
      const {appointment:a}=await api('/appointments/'+encodeURIComponent(id));
      if(!container.isConnected||version!==appointmentRenderVersion)return;
      container.innerHTML=`<button class="back-link" data-nav="#/app/citas">${ICONS.back} Volver a citas</button><div class="page-head"><h2>Cita ${escapeHtml(a.id)}</h2><button class="btn btn-secondary" id="appointment-detail-refresh">Actualizar</button></div>
        <div id="appointment-update" role="status"></div><section class="chart-card">${appointmentSummary(a)}${appointmentState(a)}${a.estado==='Pendiente'?'<p>Falta la aceptación del personal de la institución.</p>':''}<p>Tutor: ${escapeHtml(a.tutorNombre)}</p><p>Motivo: ${escapeHtml(a.motivo)}</p>${a.notas?`<p>Notas: ${escapeHtml(a.notas)}</p>`:''}${a.motivoRechazo||a.motivoCancelacion?`<p class="notice">Motivo de ${a.estado==='Rechazada'?'rechazo':'cancelación'}: ${escapeHtml(a.motivoRechazo||a.motivoCancelacion)}</p>`:''}
        <div class="appointment-actions">${Object.entries(a.acciones).filter(([k,v])=>v).map(([k])=>`<button class="btn ${k==='rechazar'||k==='cancelar'?'btn-secondary':'btn-primary'}" data-appointment-action="${k}">${{aceptar:'Aceptar cita',rechazar:'Rechazar cita',cancelar:'Cancelar cita',reprogramar:'Reprogramar'}[k]}</button>`).join('')}
        ${state.user.role==='Tutor'&&a.estado==='Aceptada'?`<button class="btn btn-ghost" data-nav="#/app/calificar/${a.institucionId}">Calificar</button><button class="btn btn-ghost" data-nav="#/app/reportar/${a.institucionId}">Reportar</button>`:''}<button class="btn btn-ghost" data-nav="#/app/citas/comprobante/${a.id}">Comprobante</button>${a.enrollmentId?`<button class="btn btn-ghost" data-nav="#/app/inscripciones/${a.enrollmentId}/detalle">Ver solicitud</button>`:''}${['Rechazada','Cancelada'].includes(a.estado)?`<button class="btn btn-primary" data-nav="#/app/citas/nueva?inst=${a.institucionId}${a.enrollmentId?'&solicitud='+a.enrollmentId:''}">Buscar otro horario</button>`:''}</div></section>
        <section class="chart-card"><h3>Historial</h3><ol class="appointment-history">${(a.historial||[]).map(h=>`<li><strong>${escapeHtml(h.accion)}</strong> · ${escapeHtml(fmtAppointment(h.fecha))}<p>${escapeHtml(h.anterior||'Nueva')} → ${escapeHtml(h.nuevo)}${h.fechaAnterior&&h.fechaAnterior!==h.fechaNueva?'<br>Antes: '+escapeHtml(fmtAppointment(h.fechaAnterior))+'<br>Ahora: '+escapeHtml(fmtAppointment(h.fechaNueva)):''}${h.motivo?'<br>'+escapeHtml(h.motivo):''}</p></li>`).join('')||'<li>No hay cambios registrados para esta cita anterior.</li>'}</ol></section>`;
      bindShellEvents();qs('#appointment-detail-refresh').onclick=()=>renderCitaDetalle(id);
      let obsolete=false,checking=false;
      const warn=message=>{obsolete=true;qsa('[data-appointment-action]',container).forEach(b=>b.disabled=true);qs('#appointment-update',container).textContent=message;const modal=qs('[data-appointment-modal]');if(modal){modal.dataset.obsolete='true';qs('#mod-confirm',modal).disabled=true;}};
      watchEnrollments(async()=>{if(checking||!container.isConnected||version!==appointmentRenderVersion)return;checking=true;try{const fresh=await api('/appointments/'+id);if(container.isConnected&&version===appointmentRenderVersion&&fresh.appointment.version!==a.version)warn('La cita cambió en otra sesión. Usa Actualizar antes de decidir.');}catch(_){if(container.isConnected&&version===appointmentRenderVersion)warn('No se pudo verificar la cita. Usa Actualizar antes de decidir.');}finally{checking=false;}},'appointments');
      qsa('[data-appointment-action]',container).forEach(b=>b.onclick=()=>{
        if(obsolete)return;const action=b.dataset.appointmentAction;
        if(action==='reprogramar'){navigate('#/app/citas/'+id+'/reprogramar');return;}
        const required=action==='rechazar'||(action==='cancelar'&&state.user.role==='Personal de institución');
        showConfirmModal({title:b.textContent,bodyHtml:appointmentSummary(a)+(action==='cancelar'||action==='rechazar'?`<label for="appointment-motive">Motivo ${required?'(obligatorio)':'(opcional)'}</label><textarea id="appointment-motive" maxlength="2000" rows="3"></textarea>`:'<p>Se conserva el lugar reservado; no se ocupa un cupo adicional.</p>')+'<div class="appointment-modal-error" role="alert"></div>',confirmText:b.textContent,danger:action!=='aceptar',onConfirm:async modal=>{
          modal.dataset.appointmentModal=id;if(obsolete){modal.dataset.obsolete='true';return true;}
          const motivo=qs('#appointment-motive',modal)?.value||'';
          try{await api('/appointments/'+id+'/'+action,{method:'POST',body:{version:a.version,motivo}});await renderCitaDetalle(id);return false;}catch(e){qs('.appointment-modal-error',modal).textContent=e.message;if(e.status===409)warn('La cita cambió o esta acción ya no está disponible. Usa Actualizar.');return true;}
        }});
        const modal=qs('#mod-confirm')?.closest('.sidebar-backdrop');if(modal)modal.dataset.appointmentModal=id;
      });
    }catch(e){if(container.isConnected&&version===appointmentRenderVersion)enrollmentError(container,e,()=>renderCitaDetalle(id));}
  }
  async function renderCitaForm(id=null,query={}) {
    const version=++appointmentRenderVersion,container=qs('.main');container.innerHTML='<p class="loading" role="status">Cargando opciones de cita…</p>';
    try {
      const tutor=state.user.role==='Tutor';
      if(!tutor&&state.user.role!=='Personal de institución')throw Error('No tienes permiso para solicitar citas.');
      const [{institutions},{students},{enrollments},old]=await Promise.all([api('/institutions'),tutor?api('/students'):Promise.resolve({students:[]}),api('/enrollments'),id?api('/appointments/'+id):Promise.resolve(null)]);
      if(!container.isConnected||version!==appointmentRenderVersion)return;
      const a=old?.appointment;if(a&&!a.acciones.reprogramar)throw Error('Esta cita no se puede reprogramar.');
      const active=institutions.filter(i=>(i.estado||'Activo')==='Activo'&&(tutor||i.id===state.user.institucionId));
      const inst=a?.institucionId||query.inst||active[0]?.id||'';
      const initialMonth=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santo_Domingo',year:'numeric',month:'2-digit'}).format(new Date(a?.fechaHoraSolicitada||Date.now()));
      container.innerHTML=`<button class="back-link" data-nav="${id?'#/app/citas/'+id+'/detalle':'#/app/citas'}">${ICONS.back} Volver</button><div class="page-head"><h2>${id?'Reprogramar cita':'Nueva cita'}</h2></div>
        <section class="chart-card appointment-form-card">${a?'<h3>Horario actual</h3>'+appointmentSummary(a):''}<p>Selecciona un horario ofrecido por la institución. La solicitud queda Pendiente hasta que el personal la acepte. America/Santo_Domingo (UTC−4).</p>
        <div id="err" role="alert"></div><form id="cita-form">
          <div class="field"><label for="cita-institution">Institución</label><select name="institucionId" id="cita-institution" ${id?'disabled':''}>${active.map(i=>`<option value="${i.id}" ${i.id===inst?'selected':''}>${escapeHtml(i.nombre)}</option>`).join('')}</select></div>
          ${id?'':`<div class="field"><label for="cita-enrollment">Solicitud ${tutor?'(opcional)':'(obligatoria)'}</label><select name="enrollmentId" id="cita-enrollment" ${tutor?'':'required'}></select></div><div class="field"><label for="cita-student">Estudiante (opcional para cita general)</label><select name="studentId" id="cita-student"><option value="">General</option>${students.map(s=>`<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('')}</select></div><div class="field"><label for="cita-reason">Motivo</label><select name="motivo" id="cita-reason">${MOTIVOS_CITA.map(m=>`<option>${escapeHtml(m)}</option>`).join('')}</select></div><div class="field"><label for="cita-notes">Notas (opcional)</label><textarea name="notas" id="cita-notes" maxlength="2000" rows="3"></textarea></div>`}
          <div class="field"><label for="cita-month">Mes</label><input type="month" id="cita-month" value="${escapeHtml(query.mes||initialMonth)}" required></div>
          <button class="btn btn-secondary" type="button" id="cita-check">Actualizar horarios</button>
          <p><button class="btn btn-ghost" type="button" id="cita-calendar">Ver calendario institucional</button></p>
          <div id="cita-availability" role="status"></div>
          <div class="field"><label for="cita-day">Fecha disponible</label><select id="cita-day"></select></div>
          <fieldset id="cita-slots"><legend>Horarios disponibles</legend></fieldset>
          <button class="btn btn-primary" id="cita-submit" type="submit" disabled>${id?'Revisar reprogramación':'Revisar solicitud'}</button>
        </form></section>`;
      bindShellEvents();
      const form=qs('#cita-form'),institution=qs('#cita-institution'),month=qs('#cita-month'),day=qs('#cita-day');
      let slots=[],selectedId='',requestId=crypto.randomUUID(),fingerprint='',loadVersion=0;
      const daySlots=()=>{
        qs('#cita-slots').innerHTML='<legend>Horarios disponibles</legend>'+slots.filter(s=>s.fecha===day.value).map(s=>`<label class="appointment-slot"><input type="radio" name="slotId" value="${s.id}" ${selectedId===s.id?'checked':''}><span>${escapeHtml(fmtAppointment(s.inicio))} · ${s.disponibles} lugar${s.disponibles===1?'':'es'}</span></label>`).join('');
        qs('#cita-submit').disabled=!slots.some(s=>s.id===selectedId&&s.fecha===day.value);
        qsa('[name=slotId]',form).forEach(b=>b.onchange=()=>{selectedId=b.value;qs('#cita-submit').disabled=false;});
      };
      const loadAvailability=async()=>{
        const load=++loadVersion;qs('#cita-availability').textContent='Consultando horarios…';qs('#cita-submit').disabled=true;
        const selectedDate=day.value||query.fecha;
        try{
          const data=await api('/appointments/availability?'+new URLSearchParams({institucionId:institution.value,mes:month.value,...(id?{excludeId:id}:{})}));
          if(!container.isConnected||version!==appointmentRenderVersion||load!==loadVersion)return;
          slots=data.slots.filter(s=>!a||s.inicio!==(a.fechaHoraConfirmada||a.fechaHoraSolicitada));
          if(!slots.some(s=>s.id===selectedId))selectedId='';
          const dates=[...new Set(slots.map(s=>s.fecha))];day.innerHTML=dates.map(d=>`<option value="${d}">${d}</option>`).join('');if(dates.includes(selectedDate))day.value=selectedDate;
          day.disabled=!dates.length;qs('#cita-availability').textContent=slots.length?'Elige fecha y horario. La disponibilidad se comprobará al confirmar.':'No hay horarios disponibles este mes. Cambia el mes o la institución. El personal puede configurar sus franjas en el calendario.';daySlots();
        }catch(e){if(!container.isConnected||version!==appointmentRenderVersion||load!==loadVersion)return;qs('#cita-availability').innerHTML='<p class="notice">'+escapeHtml(e.message)+' Usa Actualizar horarios para reintentar.</p>';}
      };
      const updateLink=()=>{
        if(!id){const sel=qs('#cita-enrollment');const current=sel.value||query.solicitud;const choices=enrollments.filter(e=>e.institucionId===institution.value);sel.innerHTML=`<option value="">${tutor?'General (sin solicitud asociada)':'Selecciona una solicitud'}</option>`+choices.map(e=>`<option value="${e.id}" ${current===e.id?'selected':''}>${escapeHtml(e.estudianteNombre)} · ${escapeHtml(e.id)} · ${escapeHtml(e.estado)}</option>`).join('');sel.onchange=()=>{const e=choices.find(e=>e.id===sel.value);const student=qs('#cita-student');student.disabled=!!e;if(e){if(!qs(`option[value="${e.studentId}"]`,student))student.insertAdjacentHTML('beforeend',`<option value="${escapeHtml(e.studentId)}">${escapeHtml(e.estudianteNombre)}</option>`);student.value=e.studentId;}};sel.onchange();}
        loadAvailability();
      };
      institution.onchange=()=>{selectedId='';updateLink();};month.onchange=()=>{selectedId='';loadAvailability();};day.onchange=()=>{selectedId='';daySlots();};qs('#cita-check').onclick=loadAvailability;
      qs('#cita-calendar').onclick=()=>navigate('#/app/instituciones/'+institution.value+'/calendario?mes='+month.value);
      form.onsubmit=e=>{
        e.preventDefault();const slot=slots.find(s=>s.id===selectedId);if(!slot){qs('#err').textContent='Selecciona un horario disponible.';return;}
        const body=id?{slotId:slot.id,version:a.version}:{...Object.fromEntries(new FormData(form)),institucionId:institution.value,studentId:qs('#cita-student').value,slotId:slot.id};
        const serialized=JSON.stringify(body);if(fingerprint&&fingerprint!==serialized)requestId=crypto.randomUUID();fingerprint=serialized;if(!id)body.requestId=requestId;
        const enrollment=enrollments.find(e=>e.id===body.enrollmentId);
        const summary={id:a?.id,institucionNombre:active.find(i=>i.id===institution.value)?.nombre,enrollmentId:a?.enrollmentId||body.enrollmentId,estudianteNombre:a?.estudianteNombre||enrollment?.estudianteNombre||students.find(s=>s.id===body.studentId)?.nombre,fechaHoraSolicitada:slot.inicio};
        showConfirmModal({title:id?'Confirmar reprogramación':'Confirmar solicitud de cita',bodyHtml:(id?'<h4>Antes</h4>'+appointmentSummary(a)+'<h4>Nuevo horario</h4>':'')+appointmentSummary(summary)+'<p>Estado después de guardar: Pendiente.</p><div class="appointment-modal-error" role="alert"></div>',confirmText:id?'Reprogramar cita':'Solicitar cita',onConfirm:async modal=>{
          try{const result=await api(id?'/appointments/'+id+'/reprogramar':'/appointments',{method:'POST',body});navigate('#/app/citas/'+result.appointment.id+'/detalle');return false;}catch(error){qs('.appointment-modal-error',modal).innerHTML=escapeHtml(error.message)+' <button type="button" class="btn btn-secondary" id="appointment-alternatives">Elegir otro horario</button>';qs('#appointment-alternatives',modal).onclick=()=>{qs('#mod-cancel',modal).click();loadAvailability();};if(error.status===409){qs('#mod-confirm',modal).disabled=true;modal.dataset.obsolete='true';}return true;}
        }});
      };
      await updateLink();
      // Se comprueba de nuevo al regresar a la pestaña; no se reemplazan notas ni motivos.
      watchEnrollments(loadAvailability,'appointments');
    }catch(e){if(container.isConnected&&version===appointmentRenderVersion)enrollmentError(container,e,()=>renderCitaForm(id,query));}
  }

  // ---------------- Comprobantes imprimibles ----------------
  function printableShell({ tipo, folio, estado, estadoColor, fields, motivoLabel, motivo, backHref }) {
    qs('.main').innerHTML = `
      <div class="comprobante-toolbar no-print">
        <button class="back-link" data-nav="${backHref}">${ICONS.back} Volver</button>
        <button class="btn btn-primary" style="width:auto; padding:10px 18px;" id="btn-print">${ICONS.printer} Imprimir / Guardar como PDF</button>
      </div>
      <div class="comprobante">
        <div class="comprobante-head">
          <img class="comprobante-logo" src="/assets/brand/inscolar-logo-horizontal-primary.svg" alt="Inscolar">
          <div class="comprobante-folio"><div class="cf-label">Folio</div><div class="cf-value">${escapeHtml(folio)}</div></div>
        </div>
        <h2 class="comprobante-title">${escapeHtml(tipo)}</h2>
        <div class="comprobante-meta">Emitido el ${fmtDate(new Date().toISOString())} · Documento generado electrónicamente, no requiere firma.</div>
        <div class="comprobante-status" style="background:${estadoColor}1f; color:${estadoColor};"><span class="dot" style="background:${estadoColor}"></span>${escapeHtml(estado)}</div>
        ${motivo ? `<div class="comprobante-motivo"><strong>${escapeHtml(motivoLabel)}:</strong> ${escapeHtml(motivo)}</div>` : ''}
        <div class="comprobante-grid">
          ${fields.map((f) => `<div class="cg-item"><div class="cg-label">${escapeHtml(f.label)}</div><div class="cg-value">${escapeHtml(f.value)}</div></div>`).join('')}
        </div>
        <div class="comprobante-foot">
          <img src="/assets/brand/inscolar-symbol-primary.svg" alt="">
          <div>Inscolar — Sistema de inscripción escolar<br>Ministerio de Educación · República Dominicana</div>
        </div>
      </div>
    `;
    bindShellEvents();
    qs('#btn-print').addEventListener('click', () => window.print());
  }

  async function renderComprobanteInscripcion(id) {
    const { enrollments } = await api('/enrollments');
    const e = enrollments.find((x) => x.id === id);
    if (!e) { qs('.main').innerHTML = '<div class="empty-state">Solicitud no encontrada.</div>'; bindShellEvents(); return; }
    const { institutions } = await api('/institutions');
    const inst = institutions.find((i) => i.id === e.institucionId);
    const estadoColor = e.estado === 'Aprobada' ? '#1f7a4c' : e.estado === 'Rechazada' ? '#c23b3b' : '#8a6414';
    printableShell({
      tipo: 'Comprobante de inscripción',
      folio: e.id,
      estado: e.estado,
      estadoColor,
      motivoLabel: 'Motivo de rechazo',
      motivo: e.estado === 'Rechazada' ? e.motivoRechazo : '',
      backHref: '#/app/inscripciones',
      fields: [
        { label: 'Estudiante', value: e.estudianteNombre },
        { label: 'Tutor', value: e.tutorNombre },
        { label: 'Institución', value: e.institucionNombre },
        { label: 'Provincia', value: inst ? inst.provincia : '—' },
        { label: 'Dirección', value: inst && inst.direccion ? inst.direccion : 'No registrada' },
        { label: 'Grado solicitado', value: e.gradoSolicitado },
        { label: 'Ciclo escolar', value: e.cicloEscolar },
        { label: 'Fecha de solicitud', value: fmtDate(e.createdAt) },
      ],
    });
  }

  async function renderComprobanteCita(id) {
    const { appointments } = await api('/appointments');
    const a = appointments.find((x) => x.id === id);
    if (!a) { qs('.main').innerHTML = '<div class="empty-state">Cita no encontrada.</div>'; bindShellEvents(); return; }
    const { institutions } = await api('/institutions');
    const inst = institutions.find((i) => i.id === a.institucionId);
    const estadoColor = ['Aceptada','Confirmada'].includes(a.estado) ? '#1f7a4c' : a.estado === 'Cancelada' ? '#c23b3b' : '#8a6414';
    const when = a.fechaHoraConfirmada || a.fechaHoraSolicitada;
    printableShell({
      tipo: 'Comprobante de cita',
      folio: a.id,
      estado: a.estado,
      estadoColor,
      motivoLabel: a.estado==='Rechazada'?'Motivo de rechazo':'Motivo de cancelación',
      motivo: a.motivoRechazo || a.motivoCancelacion || '',
      backHref: '#/app/citas',
      fields: [
        { label: 'Tutor', value: a.tutorNombre },
        { label: 'Estudiante', value: a.estudianteNombre || 'No especificado' },
        { label: 'Institución', value: a.institucionNombre },
        { label: 'Provincia', value: inst ? inst.provincia : '—' },
        { label: 'Dirección', value: inst && inst.direccion ? inst.direccion : 'No registrada' },
        { label: 'Motivo de la cita', value: a.motivo },
        { label: 'Fecha y hora', value: fmtAppointment(when) },
      ],
    });
  }

  // ---------------- HU017 notificaciones ----------------
  async function renderNotificaciones() {
    const { notifications } = await api('/notifications');
    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Notificaciones</h2><div class="sub">Actividad y cambios recientes relacionados con tu cuenta.</div></div></div>
      <div class="notif-list">
        ${notifications.length ? notifications.map((n) => `
          <div class="notif-item ${n.read ? '' : 'unread'}">
            <div>
              <div class="t1">${escapeHtml(n.campo)} · ${escapeHtml(n.userNombre)}</div>
              <div class="t2">${n.anterior || n.nuevo ? `Campo ${escapeHtml(n.campo)}: ${escapeHtml(n.anterior || '—')} → ${escapeHtml(n.nuevo || '—')}. ` : ''}Realizado por ${escapeHtml(n.actorNombre)}.</div>
              <div class="t3">${fmtDate(n.createdAt)}</div>
            </div>
            ${n.entityId ? `<button class="btn btn-secondary btn-small" data-nav="${escapeHtml(n.url || '#/app/inscripciones/'+encodeURIComponent(n.entityId)+'/detalle')}">${n.url?.startsWith('#/app/citas/')?'Ver cita':'Ver solicitud'}</button>` : ''}
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

  // ---------------- Mapa interactivo de provincias ----------------
  function provinceColorScale(count, max) {
    if (!count) return { fill: '#f4ede0', text: '#6b5560' };
    const t = Math.min(1, 0.22 + 0.78 * (count / Math.max(1, max)));
    const from = [246, 226, 230];
    const to = [175, 18, 44];
    const rgb = from.map((c, i) => Math.round(c + (to[i] - c) * t));
    return { fill: `rgb(${rgb.join(',')})`, text: t > 0.5 ? '#fff' : '#4a2530' };
  }

  function renderProvinceMap(porProvincia) {
    const counts = {};
    porProvincia.forEach((r) => { counts[r.provincia] = r.count; });
    const max = Math.max(1, ...porProvincia.map((r) => r.count));
    const mapData = window.DR_PROVINCE_MAP;
    if (!mapData) return '<div class="help">No se pudo cargar el mapa.</div>';

    let shapes = '';
    let labels = '';
    Object.entries(mapData.provinces).forEach(([name, p]) => {
      const count = counts[name] || 0;
      const { fill } = provinceColorScale(count, max);
      shapes += `<g class="prov-tile" tabindex="0" data-provincia="${escapeHtml(name)}" data-count="${count}">
        <path d="${p.path}" fill="${fill}" stroke="rgba(28,16,19,.3)" stroke-width="1"></path>
        <title>${escapeHtml(name)} (${escapeHtml(p.region)}) — ${count} ${count === 1 ? 'institución' : 'instituciones'}</title>
      </g>`;
      labels += `<text x="${p.labelX}" y="${p.labelY}" text-anchor="middle" font-size="13" font-weight="700" fill="#2a1620" paint-order="stroke" stroke="#fff" stroke-width="3" stroke-linejoin="round">${escapeHtml(p.abbr)}</text>`;
    });

    return `
      <svg class="province-map" viewBox="-70 -65 910 685" role="img" aria-label="Mapa interactivo de instituciones por provincia">
        <defs>
          <linearGradient id="oceanGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#e2f3f4"></stop>
            <stop offset="100%" stop-color="#bfe0e6"></stop>
          </linearGradient>
          <filter id="landShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="6" stdDeviation="9" flood-color="#1c1013" flood-opacity="0.22"></feDropShadow>
          </filter>
        </defs>
        <rect x="-70" y="-65" width="910" height="685" rx="22" fill="url(#oceanGrad)"></rect>
        <g class="map-decor" aria-hidden="true">
          <path d="M -40 -35 Q 10 -50 60 -35 T 160 -35" stroke="#ffffff" stroke-width="3" fill="none" opacity=".35"></path>
          <path d="M 620 600 Q 670 585 720 600 T 820 600" stroke="#ffffff" stroke-width="3" fill="none" opacity=".3"></path>
          <text x="396" y="-38" text-anchor="middle" font-size="13" font-weight="700" letter-spacing="3" fill="#4f818c" opacity=".75">OCÉANO ATLÁNTICO</text>
          <text x="396" y="608" text-anchor="middle" font-size="13" font-weight="700" letter-spacing="3" fill="#4f818c" opacity=".75">MAR CARIBE</text>
          <g class="compass" transform="translate(778 -18)">
            <circle r="34" fill="#ffffff" opacity=".6" stroke="rgba(28,16,19,.15)" stroke-width="1"></circle>
            <path d="M 0 -16 L 4.24 -4.24 L 16 0 L 4.24 4.24 L 0 16 L -4.24 4.24 L -16 0 L -4.24 -4.24 Z" fill="#8a97a0" opacity=".85"></path>
            <path d="M 0 0 L -4.24 -4.24 L 0 -16 L 4.24 -4.24 Z" fill="#af122c"></path>
            <circle r="3" fill="#ffffff"></circle>
            <text x="0" y="-28" text-anchor="middle" font-size="10" font-weight="800" fill="#3a4448">N</text>
            <text x="0" y="33" text-anchor="middle" font-size="9" font-weight="700" fill="#7a848a">S</text>
            <text x="31" y="4" text-anchor="middle" font-size="9" font-weight="700" fill="#7a848a">E</text>
            <text x="-31" y="4" text-anchor="middle" font-size="9" font-weight="700" fill="#7a848a">O</text>
          </g>
        </g>
        <g filter="url(#landShadow)">${shapes}</g>
        <g class="map-labels" aria-hidden="true">${labels}</g>
      </svg>
    `;
  }

  function bindProvinceMapEvents() {
    const tooltip = qs('#map-tooltip');
    const wrap = qs('.map-wrap');
    if (!tooltip || !wrap) return;
    qsa('.prov-tile').forEach((tile) => {
      const name = tile.dataset.provincia;
      const count = tile.dataset.count;
      const show = (x, y) => {
        const rect = wrap.getBoundingClientRect();
        tooltip.textContent = `${name} — ${count} ${count === '1' ? 'institución' : 'instituciones'}`;
        tooltip.style.left = (x - rect.left) + 'px';
        tooltip.style.top = (y - rect.top) + 'px';
        tooltip.classList.add('show');
      };
      tile.addEventListener('mousemove', (e) => show(e.clientX, e.clientY));
      tile.addEventListener('mouseleave', () => tooltip.classList.remove('show'));
      tile.addEventListener('focus', () => { const r = tile.getBoundingClientRect(); show(r.left + r.width / 2, r.top); });
      tile.addEventListener('blur', () => tooltip.classList.remove('show'));
      tile.addEventListener('click', () => navigate('#/app/instituciones?provincia=' + encodeURIComponent(name)));
      tile.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate('#/app/instituciones?provincia=' + encodeURIComponent(name)); } });
    });
  }

  // ---------------- Analíticas ----------------
  function barRows(list, labelFn, valueFn, emptyMsg) {
    if (!list || !list.length) return `<div class="help">${emptyMsg || 'Sin datos todavía.'}</div>`;
    const max = Math.max(1, ...list.map(valueFn));
    return list.map((item) => `<div class="bar-row"><span class="bar-label">${escapeHtml(labelFn(item))}</span><span class="bar-track"><span class="bar-fill" data-w="${(valueFn(item) / max) * 100}"></span></span><span class="bar-value">${valueFn(item)}</span></div>`).join('');
  }

  async function renderAnaliticas() {
    const s = await api('/analytics/summary');
    const emailsData = isAdmin() ? await api('/emails') : { emails: [] };
    const maxRol = Math.max(1, ...s.porRol.map((r) => r.count));

    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Analíticas</h2><div class="sub">Indicadores y tendencias del sistema.</div></div></div>
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-icon">${ICONS.users}</div><div class="kpi-num">${s.totalUsuarios}</div><div class="kpi-label">Usuarios totales</div><div class="kpi-delta">${s.nuevosEstaSemana} esta semana</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.check}</div><div class="kpi-num">${s.activos}</div><div class="kpi-label">Cuentas activas</div><div class="kpi-delta">${Math.round((s.activos / Math.max(1, s.totalUsuarios)) * 100)}% del total</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.building}</div><div class="kpi-num">${s.totalInstituciones}</div><div class="kpi-label">Instituciones vinculadas</div><div class="kpi-delta">${s.porProvincia.length} provincias</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.shield}</div><div class="kpi-num">${s.mfaActivo}</div><div class="kpi-label">Cuentas con MFA activo</div><div class="kpi-delta">${s.tutores} tutores registrados</div></div>
      </div>
      <div class="chart-card map-card">
        <h3>Instituciones por provincia</h3>
        <div class="map-wrap">
          ${renderProvinceMap(s.porProvincia)}
          <div class="map-tooltip" id="map-tooltip"></div>
        </div>
        <div class="map-legend"><span>Menos</span><span class="map-legend-scale"></span><span>Más</span></div>
        <div class="help">Selecciona una provincia para ver sus instituciones.</div>
      </div>
      <div class="chart-row">
        <div class="chart-card">
          <h3>Usuarios por rol</h3>
          ${s.porRol.map((r) => `<div class="bar-row"><span class="bar-label">${escapeHtml(r.role)}</span><span class="bar-track"><span class="bar-fill" data-w="${(r.count / maxRol) * 100}"></span></span><span class="bar-value">${r.count}</span></div>`).join('')}
        </div>
        <div class="chart-card">
          <h3>Actividad reciente</h3>
          ${s.actividadReciente.length ? s.actividadReciente.map((n) => `<div class="bar-row" style="align-items:flex-start;"><span style="width:150px;flex:none;color:var(--ink-soft);font-size:.76rem;">${fmtDate(n.createdAt)}</span><span style="flex:1;">${escapeHtml(n.campo)} · ${escapeHtml(n.userNombre)} — por ${escapeHtml(n.actorNombre)}</span></div>`).join('') : '<div class="help">Sin actividad reciente.</div>'}
        </div>
        <div class="chart-card">
          <h3>Correos enviados recientemente</h3>
          <p class="help" style="margin-bottom:12px;">HU062: incluye envíos reales por SMTP (si está configurado) y simulados.</p>
          ${emailsData.emails.length ? emailsData.emails.slice(0, 8).map((e) => `<div class="bar-row" style="align-items:flex-start;"><span style="width:150px;flex:none;color:var(--ink-soft);font-size:.76rem;">${fmtDate(e.sentAt)}</span><span style="flex:1;">${escapeHtml(e.subject)} → ${escapeHtml(e.to)} <span style="color:var(--ink-soft);font-size:.76rem;">(${escapeHtml(e.via)})</span></span></div>`).join('') : '<div class="help">Sin correos registrados todavía.</div>'}
        </div>
      </div>

      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-icon">${ICONS.building}</div><div class="kpi-num">${s.inscripciones.total}</div><div class="kpi-label">Solicitudes de inscripción</div><div class="kpi-delta">${s.inscripciones.pendientes} pendientes</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.check}</div><div class="kpi-num">${s.documentos.total}</div><div class="kpi-label">Documentos recibidos</div><div class="kpi-delta">${s.documentos.pendientes} pendientes</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.users}</div><div class="kpi-num">${s.citas.total}</div><div class="kpi-label">Citas agendadas</div><div class="kpi-delta">${s.citas.pendientes} pendientes</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.shield}</div><div class="kpi-num">${s.promedioCalificaciones !== null ? '★ ' + s.promedioCalificaciones : '—'}</div><div class="kpi-label">Calificación promedio</div><div class="kpi-delta">${s.totalCalificaciones} calificaciones · ${s.totalReportes} reportes</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.bell}</div><div class="kpi-num">${s.notificacionesLeidas}/${s.totalNotificaciones}</div><div class="kpi-label">Notificaciones leídas</div><div class="kpi-delta">${s.totalCorreosEnviados} correos enviados</div></div>
        <div class="kpi-card"><div class="kpi-icon">${ICONS.building}</div><div class="kpi-num">${s.tasaRecuperacion}%</div><div class="kpi-label">Tasa de recuperación de contraseña</div><div class="kpi-delta">${s.totalResetsUsados} de ${s.totalResetsGenerados} solicitudes</div></div>
      </div>

      <div class="chart-row">
        <div class="chart-card">
          <h3>Inscripciones por estado</h3>
          ${barRows([
            { label: 'Aprobadas', count: s.inscripciones.aprobadas },
            { label: 'Rechazadas', count: s.inscripciones.rechazadas },
            { label: 'Pendientes', count: s.inscripciones.pendientes },
          ], (i) => i.label, (i) => i.count, 'Sin solicitudes de inscripción todavía.')}
        </div>
        <div class="chart-card">
          <h3>Documentos por estado</h3>
          ${barRows([
            { label: 'Aceptados', count: s.documentos.aceptados },
            { label: 'Rechazados', count: s.documentos.rechazados },
            { label: 'Pendientes', count: s.documentos.pendientes },
          ], (i) => i.label, (i) => i.count, 'Sin documentos subidos todavía.')}
        </div>
      </div>

      <div class="chart-row">
        <div class="chart-card">
          <h3>Citas por estado</h3>
          ${barRows([
            { label: 'Aceptadas', count: s.citas.confirmadas },
            { label: 'Canceladas', count: s.citas.canceladas },
            { label: 'Pendientes', count: s.citas.pendientes },
          ], (i) => i.label, (i) => i.count, 'Sin citas agendadas todavía.')}
        </div>
        <div class="chart-card">
          <h3>Citas por institución (top 5)</h3>
          ${barRows(s.citasPorInstitucion, (i) => i.nombre, (i) => i.count, 'Sin citas agendadas todavía.')}
        </div>
      </div>

      <div class="chart-row">
        <div class="chart-card">
          <h3>Usuarios registrados por año</h3>
          ${barRows(s.porAnio, (i) => String(i.anio), (i) => i.count, 'Sin datos todavía.')}
        </div>
        <div class="chart-card">
          <h3>Distribución geográfica de usuarios</h3>
          <div class="help">Solo el personal de institución tiene una provincia asociada (vía su institución).</div>
          ${barRows(s.usuariosPorProvincia, (i) => i.provincia, (i) => i.count, 'Sin personal de institución vinculado a una provincia todavía.')}
        </div>
      </div>

      <div class="chart-row">
        <div class="chart-card">
          <h3>Instituciones mejor calificadas</h3>
          ${barRows(s.institucionesMejorCalificadas, (i) => `${i.nombre} (★${i.promedio})`, (i) => i.total, 'Sin calificaciones todavía.')}
        </div>
        <div class="chart-card">
          <h3>Reportes por motivo</h3>
          ${barRows(s.reportesPorMotivo, (i) => i.motivo, (i) => i.count, 'Sin reportes todavía.')}
        </div>
      </div>
    `;
    bindShellEvents();
    requestAnimationFrame(() => { setTimeout(() => qsa('.bar-fill').forEach((el) => { el.style.width = el.dataset.w + '%'; }), 60); });
    bindProvinceMapEvents();
  }

  // ---------------- Auditoria ----------------
  async function renderAuditoria(query) {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.accion) params.set('accion', query.accion);
    if (query.actorId) params.set('actorId', query.actorId);
    if (query.desde) params.set('desde', query.desde);
    if (query.hasta) params.set('hasta', query.hasta);
    const { total, logs, truncated, acciones, actores } = await api('/logs?' + params.toString());
    const accionesFiltro = ['Todas', ...acciones];
    const actoresFiltro = [{ id: 'Todos', nombre: 'Todos los usuarios' }, ...actores];

    qs('.main').innerHTML = `
      <div class="page-head"><div><h2>Auditoría</h2><div class="sub">Bitácora de acciones registradas en el sistema.</div></div></div>
      <div class="filters">
        <input id="f-q" placeholder="Buscar por usuario o detalle..." value="${escapeHtml(query.q || '')}">
        <select id="f-accion">${accionesFiltro.map((a) => `<option ${(query.accion || 'Todas') === a ? 'selected' : ''}>${escapeHtml(a)}</option>`).join('')}</select>
        <select id="f-actor">${actoresFiltro.map((a) => `<option value="${a.id}" ${(query.actorId || 'Todos') === a.id ? 'selected' : ''}>${escapeHtml(a.nombre)}</option>`).join('')}</select>
        <input type="date" id="f-desde" value="${escapeHtml(query.desde || '')}" title="Desde">
        <input type="date" id="f-hasta" value="${escapeHtml(query.hasta || '')}" title="Hasta">
      </div>
      <div class="table-card">
        <table>
          <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Detalle</th></tr></thead>
          <tbody>
            ${logs.length ? logs.map((l) => `<tr>
                <td>${fmtDate(l.fecha)}</td>
                <td>${escapeHtml(l.actorNombre || 'Sistema')}</td>
                <td>${escapeHtml(l.actorRole || '—')}</td>
                <td>${escapeHtml(l.accion)}</td>
                <td>${escapeHtml(l.detalle || '')}</td>
              </tr>`).join('') : `<tr><td colspan="5"><div class="empty-state">No hay registros que coincidan con los filtros.</div></td></tr>`}
          </tbody>
        </table>
        <div class="table-footer"><span>Mostrando ${logs.length} de ${total} registros${truncated ? ' (limitado a los más recientes)' : ''}</span></div>
      </div>
    `;
    bindShellEvents();

    function applyFilters() {
      const p = new URLSearchParams();
      if (qs('#f-q').value) p.set('q', qs('#f-q').value);
      if (qs('#f-accion').value !== 'Todas') p.set('accion', qs('#f-accion').value);
      if (qs('#f-actor').value !== 'Todos') p.set('actorId', qs('#f-actor').value);
      if (qs('#f-desde').value) p.set('desde', qs('#f-desde').value);
      if (qs('#f-hasta').value) p.set('hasta', qs('#f-hasta').value);
      navigate('#/app/auditoria?' + p.toString());
    }
    qs('#f-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyFilters(); });
    qs('#f-accion').addEventListener('change', applyFilters);
    qs('#f-actor').addEventListener('change', applyFilters);
    qs('#f-desde').addEventListener('change', applyFilters);
    qs('#f-hasta').addEventListener('change', applyFilters);
  }
})();
