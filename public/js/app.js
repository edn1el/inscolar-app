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
    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers,
      credentials: 'same-origin',
      body: opts.body ? (isFormData ? opts.body : JSON.stringify(opts.body)) : undefined,
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

  function showConfirmModal({ title, bodyHtml, confirmText, danger, onConfirm }) {
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
    document.body.appendChild(modal);

    const escHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cleanup();
      }
    };
    document.addEventListener('keydown', escHandler);

    function cleanup() {
      document.removeEventListener('keydown', escHandler);
      modal.remove();
    }

    qs('#mod-cancel', modal).addEventListener('click', cleanup);
    qs('#mod-confirm', modal).addEventListener('click', async () => {
      const btn = qs('#mod-confirm', modal);
      btn.disabled = true;
      btn.textContent = 'Procesando...';
      try {
        const keepOpen = await onConfirm(modal);
        if (!keepOpen) cleanup();
      } catch (err) {
        btn.disabled = false;
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
    if (window._navInterceptor && window._navInterceptor() === false) return;
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
    } catch (e) { state.user = null; }
    try {
      const { needed } = await api('/auth/setup-needed');
      state.setupNeeded = needed;
    } catch (e) { state.setupNeeded = false; }
    state.authChecked = true;
  }

  async function router() {
    const activeContent = document.querySelector('.main, .search-layout, .auth-layout, [style*="max-width:800px"]');
    if (activeContent) {
      activeContent.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      activeContent.style.opacity = '0';
      activeContent.style.transform = 'scale(0.98)';
      await new Promise(r => setTimeout(r, 150));
    }

    root.innerHTML = '<div class="loading" style="animation: fadeUp 0.3s ease forwards;">Cargando…</div>';
    await ensureAuth();
    const { segs, query } = parseHash();

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
      case 'buscar': return viewBuscar(segs.slice(1));
      case 'setup': return viewSetup();
      case 'login': return viewLogin();
      case 'mfa': return viewMfa();
      case 'force-change': return viewForceChange();
      case 'register': return viewRegister();
      case 'forgot': return viewForgot();
      case 'reset': return viewReset(query.token || '');
      case 'app': return viewApp(segs.slice(1), query);
      default: return navigate('#/');
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
      setTimeout(initParticles, 0);
    }
  }

  function initParticles() {
    const canvas = document.getElementById('particles-bg');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const btn = document.getElementById('pause-particles');
    let animationId;
    let particles = [];
    let isPaused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let isSuccess = false;
    let successTarget = { x: 0, y: 0 };
    
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
    
    if (!isPaused) draw();
    else draw();
    
    if (btn) {
      btn.addEventListener('click', () => {
        isPaused = !isPaused;
        btn.setAttribute('aria-pressed', isPaused.toString());
        if (!isPaused) draw();
        btn.innerHTML = isPaused 
          ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> Reproducir'
          : '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg> Pausar';
      });
    }

    window._triggerLoginSuccess = (destId) => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
      return new Promise(resolve => {
        isSuccess = true;
        isPaused = false;
        if (btn) btn.style.opacity = '0';
        const destEl = document.querySelector(destId || '.medallion');
        if (destEl) {
          const rect = destEl.getBoundingClientRect();
          const heroRect = canvas.closest('.hero').getBoundingClientRect();
          successTarget = {
            x: rect.left - heroRect.left + rect.width / 2,
            y: rect.top - heroRect.top + rect.height / 2
          };
        } else {
          successTarget = { x: canvas.width / 2, y: canvas.height / 2 };
        }
        draw();
        setTimeout(resolve, 600);
      });
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
          <div class="search-layout" style="animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity:0; padding-bottom: 50px;">
          <div class="top-nav" style="background:var(--c-surface); border-bottom:1px solid var(--c-border); padding:10px 20px; z-index: 10;">
            <a href="#/buscar" class="btn btn-ghost btn-small">← Volver a resultados</a>
            ${state.user ? '<a href="#/app/perfil" class="btn btn-ghost btn-small" style="float:right">Volver al panel</a>' : '<a href="#/login" class="btn btn-primary btn-small" style="float:right">Iniciar sesión</a>'}
          </div>
          
          <div style="padding:20px; max-width:800px; margin:0 auto; animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity:0;">
            <div class="inst-hero" style="${fondoUrl ? `background-image:url('${fondoUrl}')` : 'background:#e1ecf7;'} border-radius: 12px; margin-bottom: 24px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
              <div class="inst-hero-overlay" style="border-radius: 12px; padding: 30px;">
                <div class="inst-hero-body" style="display:flex; align-items:center; gap:20px;">
                  ${logoUrl ? `<img src="${logoUrl}" style="width:80px; height:80px; border-radius:12px; object-fit:cover; border:3px solid #fff;">` : `<div style="width:80px; height:80px; border-radius:12px; background:#fff; display:flex; align-items:center; justify-content:center; border:3px solid #eee; color:var(--text-muted);">${ICONS.building}</div>`}
                  <div>
                    <h2 style="margin: 0 0 5px 0;">${escapeHtml(i.nombre)}</h2>
                    <span class="pill" style="background:${ts.bg};color:${ts.fg}; font-size: 0.8rem; padding: 4px 8px;">${escapeHtml(i.tipo)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="chart-row" style="grid-template-columns: 1fr 1fr; align-items:start;">
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
      if (currentMap) currentMap.invalidateSize();
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

    await initMap();

    async function performSearch(extraQuery = '') {
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
          <div class="inst-card" data-id="${i.id}" tabindex="0" style="padding:15px; border:1px solid var(--border-color); margin-bottom:10px; border-radius:8px; cursor:pointer; background:var(--bg-card); transition: border-color 0.2s;">
            <h4 style="margin:0 0 5px 0; color:var(--primary-color);">${escapeHtml(i.nombre)}</h4>
            <div style="font-size:13px; color:var(--text-muted); margin-bottom:5px;">
              ${escapeHtml(i.municipio || '')}${i.provincia && i.municipio ? ', ' : ''}${escapeHtml(i.provincia || '')}
            </div>
            ${i.distanciaKm !== undefined && i.distanciaKm !== null ? `<div style="font-size:12px; font-weight:600; color:var(--primary-color);">📍 A ${i.distanciaKm} km</div>` : ''}
            <div style="margin-top:10px;">
              <a href="#/buscar/${i.id}" class="btn btn-ghost btn-small view-inst" style="padding:4px 8px; text-decoration:none;">Ver detalles</a>
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
                <div style="display:flex; flex-direction:row; gap:12px; min-width: 250px; align-items:center;">
                  <div style="width:60px; height:60px; border-radius:12px; overflow:hidden; flex-shrink:0; background:var(--bg-body); border:1px solid rgba(0,0,0,0.1);">
                    <img src="${fotoUrl}" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='/assets/brand/inscolar-symbol-primary.svg';">
                  </div>
                  <div style="flex:1;">
                    <strong style="color:var(--primary-color); font-size:14px; display:block; margin-bottom:4px; line-height:1.2;">${escapeHtml(i.nombre)}</strong>
                    <span style="font-size:10px; padding:2px 8px; background:var(--primary-color); color:#fff; border-radius:12px; font-weight:600;">${escapeHtml(i.tipo)}</span>
                    <div style="font-size:12px; margin-top:6px; color:var(--text-color); opacity:0.8;">📍 ${escapeHtml(i.municipio || '')}</div>
                    <div style="font-size:12px; margin-top:4px; font-weight:bold; color:#eab308;">⭐ ${i.calificacionPromedio !== null ? Number(i.calificacionPromedio).toFixed(1) : 'Nuevo'}</div>
                  </div>
                </div>
              `;
              marker.bindTooltip(detailsHtml, { direction: 'top', className: 'modern-tooltip' });
              marker.instId = i.id;
              
              marker.on('click', () => {
                navigate('#/buscar/' + i.id);
              });
              
              currentMarkers.push(marker);
              bounds.push([i.lat, i.lng]);
            }
          });
          const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (bounds.length > 0) {
            currentMap.flyToBounds(bounds, { duration: 1.5, easeLinearity: 0.25, animate: !prefersReduced });
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
  function viewLogin() {
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
      const fd = new FormData(e.target);
      qs('#err').innerHTML = '';
      
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
        
        if (window._triggerLoginSuccess) {
          await window._triggerLoginSuccess('.medallion');
        }

        if (data.status === 'mfa_required') {
          state.pendingMfa = data;
          navigate('#/mfa');
        } else if (data.status === 'must_change_password') {
          navigate('#/force-change');
        } else {
          state.user = data.user;
          navigate('#/app/perfil');
        }
        
        setTimeout(() => {
          const title = document.querySelector('h1, h2, h3, .topbar-title');
          if (title) {
            title.tabIndex = -1;
            title.focus();
          }
        }, 100);
      } catch (err) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        qs('#err').innerHTML = fieldErrorsBlock(err.errors);
        
        // Colocar el foco en el primer input con error, o en el input de email
        setTimeout(() => {
          const firstErrInput = qs('.field.error input, .field.error select');
          if (firstErrInput) {
            firstErrInput.focus();
          } else {
            qs('input[name="email"]').focus();
          }
        }, 50);
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
      else if (section === 'inscripciones' && segs[2] === 'documentos') await renderDocumentosInscripcion(segs[1]);
      else if (section === 'inscripciones') await renderInscripciones(query);
      else if (section === 'citas' && segs[1] === 'nueva') await renderCitaForm();
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
            <span class="who"><span class="avatar" style="${topbarAvatarStyle}">${u.foto ? '' : initials(u.nombre)}</span><span class="stack"><div class="w1">${escapeHtml(u.nombre || '')}</div><div class="w2">${escapeHtml(u.role || '')}</div></span></span>
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
            <button class="nav-item ${activeSection === 'citas' ? 'active' : ''}" data-nav="#/app/citas">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Citas
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
            <button class="nav-item ${activeSection === 'citas' ? 'active' : ''}" data-nav="#/app/citas">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Citas
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
    qsa('[data-nav]').forEach((btn) => btn.addEventListener('click', () => {
      const sidebar = qs('#sidebar');
      const backdrop = qs('#sidebar-backdrop');
      if (sidebar && backdrop && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        backdrop.classList.remove('visible');
        qs('#sidebar-toggle').setAttribute('aria-expanded', 'false');
      }
      navigate(btn.getAttribute('data-nav'));
    }));

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
    logoutBtn && logoutBtn.addEventListener('click', async () => {
      await api('/auth/logout', { method: 'POST' });
      state.user = null;
      navigate('#/login');
    });
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
      <div class="chart-row" style="grid-template-columns: 2fr 1fr;">
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
            <li>Si una institución no responde una solicitud Pendiente durante 30 días, el sistema la marca automáticamente como "Abandonada" para que puedas intentar en otra institución.</li>
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
          <p>En <a href="#/app/inscripciones">Inscripciones</a> verás las solicitudes dirigidas a tu institución. Revisa los documentos adjuntos y aprueba o rechaza indicando un motivo cuando corresponda. Una solicitud Pendiente que nadie decide durante 30 días se marca automáticamente como "Abandonada".</p>
        `,
      });
      secciones.push({
        titulo: 'Gestionar citas',
        html: `
          <p>En <a href="#/app/citas">Citas</a> puedes confirmar una cita Pendiente, rechazarla (indicando un motivo) o cancelar una cita ya Confirmada. También puedes consultar el <a href="${(state.user || {}).institucionId ? `#/app/instituciones/${state.user.institucionId}/calendario` : '#/app/citas'}">calendario de tu institución</a> para ver todas las citas agendadas por día.</p>
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
        const modal = document.createElement('div');
        modal.className = 'sidebar-backdrop visible';
        modal.style.zIndex = '9999';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.innerHTML = `
          <div class="card" style="position:relative; z-index:10000; width: 400px; padding: 24px; text-align: left;">
            <h3 style="margin-top:0;">¿Desactivar a ${escapeHtml(b.dataset.name)}?</h3>
            <p style="margin-bottom:20px;">No podrá iniciar sesión hasta que otro Administrador reactive su cuenta.</p>
            <div style="display:flex; gap:10px; justify-content:flex-end;">
              <button class="btn btn-ghost" style="width:auto;" id="cancel-deact">Cancelar</button>
              <button class="btn btn-primary" style="width:auto; background:#af112b; border-color:#af112b;" id="confirm-deact">Desactivar usuario</button>
            </div>
          </div>
        `;
        document.body.appendChild(modal);
        
        qs('#cancel-deact', modal).addEventListener('click', () => modal.remove());
        qs('#confirm-deact', modal).addEventListener('click', async () => {
          modal.remove();
          try {
            await api('/users/' + b.dataset.toggle + '/toggle-estado', { method: 'POST' });
            renderUsuarios(query);
          } catch(e) {
            toast(e.message, 'err');
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
                <td><div class="user-cell"><span class="av" style="background:#e1ecf7;color:#2a5c96;${inst.logo ? `background-image:url('/api/institutions/${inst.id}/logo?v=${encodeURIComponent(inst.logo.uploadedAt)}');background-size:cover;background-position:center;` : ''}">${inst.logo ? '' : ICONS.building}</span><span><div class="name">${escapeHtml(inst.nombre)}</div><div class="mail">${escapeHtml(inst.correo || inst.direccion || 'Sin correo registrado')}</div><div class="help" style="font-size:11px;">RNC: ${escapeHtml(inst.rnc || '—')} | Tel: ${escapeHtml(inst.telefono || '—')}</div></span></div></td>
                <td>${escapeHtml(inst.provincia)}</td>
                <td>${escapeHtml(inst.distrito)}${inst.municipio ? ' · ' + escapeHtml(inst.municipio) : ''}</td>
                <td><span class="pill" style="background:${ts.bg};color:${ts.fg}">${escapeHtml(inst.tipo)}</span></td>
                <td>${calificacionLabel(inst.calificacionPromedio, inst.totalCalificaciones)}</td>
                ${geoActiva ? `<td>${inst.distanciaKm !== null && inst.distanciaKm !== undefined ? inst.distanciaKm + ' km' : '—'}</td>` : ''}
                <td>${fmtDate(inst.createdAt)}</td>
                <td><span class="estado-cell"><span class="dot" style="background:${active ? '#2e9e5b' : '#9aa0a6'}"></span>${inst.estado || 'Activo'}</span></td>
                <td><span class="actions-cell">
                  ${isAdmin() || (state.user && state.user.role === 'Personal de institución' && state.user.institucionId === inst.id) ? `<button class="neutral" data-edit="${inst.id}">Modificar</button>` : ''}
                  ${isAdmin() ? `<button class="${active ? 'danger' : 'ok'}" data-toggle="${inst.id}">${active ? 'Desactivar' : 'Activar'}</button>` : ''}
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
          <span>Mostrando ${institutions.length} de ${totalFiltradas || total} instituciones${geoActiva ? ' (dentro del filtro de ubicación)' : ''}</span>
          <div class="pagination">
            <button class="btn btn-ghost" id="p-prev" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
            <span style="margin: 0 10px;">Página ${page} de ${Math.ceil((totalFiltradas || total) / limit) || 1}</span>
            <button class="btn btn-ghost" id="p-next" ${page >= Math.ceil((totalFiltradas || total) / limit) ? 'disabled' : ''}>Siguiente</button>
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
    qs('#f-provincia').addEventListener('change', () => applyFilters());
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
        </div>
      </div>
      <div id="foto-err"></div>
      <div class="page-head" style="margin-top:16px;">
        <div class="sub">Detalle de la institución.</div>
      </div>
      <div class="chart-row" style="grid-template-columns: 1fr 1fr; align-items:start;">
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
  async function renderCalendarioInstitucion(institucionId, query) {
    const params = query.mes ? '?mes=' + encodeURIComponent(query.mes) : '';
    const { institucion, mes, detalle, dias } = await api('/institutions/' + institucionId + '/calendar' + params);
    const [year, month] = mes.split('-').map(Number); // month: 1-12
    const backHref = isAdmin() ? '#/app/instituciones' : '#/app/citas';

    // Calcular la cuadricula del mes (semanas de lunes a domingo).
    const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstWeekday = (firstOfMonth.getUTCDay() + 6) % 7; // 0=lunes .. 6=domingo
    const cells = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const estadoColorCal = (estado) => estado === 'Confirmada' ? '#2e9e5b' : estado === 'Cancelada' ? '#c23b3b' : estado === 'Rechazada' ? '#8a2f2f' : '#c98a1b';

    function keyFor(d) {
      return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }

    function prevMes() {
      const m = month === 1 ? 12 : month - 1;
      const y = month === 1 ? year - 1 : year;
      return `${y}-${String(m).padStart(2, '0')}`;
    }
    function nextMes() {
      const m = month === 12 ? 1 : month + 1;
      const y = month === 12 ? year + 1 : year;
      return `${y}-${String(m).padStart(2, '0')}`;
    }

    qs('.main').innerHTML = `
      <button class="back-link" data-nav="${backHref}">${ICONS.back} Volver</button>
      <div class="page-head">
        <div><h2>Calendario — ${escapeHtml(institucion.nombre)}</h2><div class="sub">${detalle ? 'Citas agendadas en esta institución.' : 'Cantidad de citas agendadas por día.'}</div></div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost" style="width:auto; padding:9px 16px;" id="cal-prev">${ICONS.back} ${MESES_NOMBRE[(month - 2 + 12) % 12]}</button>
          <button class="btn btn-ghost" style="width:auto; padding:9px 16px;" id="cal-next">${MESES_NOMBRE[month % 12]} →</button>
        </div>
      </div>
      <div class="chart-card">
        <h3 style="text-transform:capitalize;">${MESES_NOMBRE[month - 1]} ${year}</h3>
        <div class="calendar-grid">
          ${DIAS_SEMANA_CORTO.map((d) => `<div class="calendar-weekday">${d}</div>`).join('')}
          ${cells.map((d) => {
            if (!d) return '<div class="calendar-cell other-month"></div>';
            const items = dias[keyFor(d)] || [];
            const shown = items.slice(0, 3);
            return `<div class="calendar-cell">
              <div class="calendar-daynum">${d}</div>
              ${shown.map((it) => `<div class="calendar-item"><span class="calendar-dot" style="background:${estadoColorCal(it.estado)}"></span>${new Date(it.hora).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}${detalle ? ' · ' + escapeHtml(it.tutorNombre) : ''}</div>`).join('')}
              ${items.length > 3 ? `<div class="help">+${items.length - 3} más</div>` : ''}
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
    bindShellEvents();
    qs('#cal-prev').addEventListener('click', () => navigate(`#/app/instituciones/${institucionId}/calendario?mes=${prevMes()}`));
    qs('#cal-next').addEventListener('click', () => navigate(`#/app/instituciones/${institucionId}/calendario?mes=${nextMes()}`));
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
      <button class="back-link" data-nav="#/app/instituciones">${ICONS.back} Volver a instituciones</button>
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
            alert('El archivo supera los ' + maxMB + 'MB.');
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
      if (formChanged && !confirm('Tienes cambios sin guardar. ¿Seguro que deseas cancelar?')) return;
      navigate('#/app/instituciones');
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
  async function renderInscripciones(query) {
    const u = state.user;
    const tutor = u.role === 'Tutor';
    const staff = u.role === 'Personal de institución';
    const admin = isAdmin();

    const params = new URLSearchParams();
    if (query.estado) params.set('estado', query.estado);
    if (query.institucionId && admin) params.set('institucionId', query.institucionId);
    const { total, enrollments } = await api('/enrollments?' + params.toString());

    let students = [];
    let studentsBlock = '';
    if (tutor) {
      const sres = await api('/students');
      students = sres.students;
      studentsBlock = `
        <div class="chart-card" style="margin-bottom:20px;">
          <div class="page-head" style="margin:0 0 12px;"><h3 style="margin:0;">Mis estudiantes</h3>
            <button class="btn btn-primary btn-small" style="width:auto; padding:8px 16px;" data-nav="#/app/inscripciones/estudiante-nuevo">Agregar estudiante</button>
          </div>
          ${students.length ? `<div class="two-col">${students.map((s) => `<div><div class="help">${escapeHtml(s.nombre)}</div><div>Nacimiento: ${escapeHtml(s.fechaNacimiento)}</div></div>`).join('')}</div>` : '<div class="help">Todavía no has registrado ningún estudiante.</div>'}
        </div>
      `;
    }

    let institucionesOptions = [];
    if (admin) {
      const ires = await api('/institutions');
      institucionesOptions = ires.institutions;
    }

    const estados = ['Todos', 'Pendiente', 'Aprobada', 'Rechazada', 'Abandonada'];
    const showInstCol = admin || tutor;
    const colCount = 6 + (tutor ? 0 : 1) + (showInstCol ? 1 : 0);

    qs('.main').innerHTML = `
      <div class="page-head">
        <div><h2>Inscripciones</h2><div class="sub">${tutor ? 'Solicita el cupo de tus estudiantes en una institución.' : staff ? 'Solicitudes de inscripción para tu institución.' : 'Todas las solicitudes de inscripción del sistema.'}</div></div>
        ${tutor ? `<button class="btn btn-primary" style="width:auto; padding:10px 18px;" data-nav="#/app/inscripciones/nueva" ${!students.length ? 'disabled title="Agrega un estudiante primero"' : ''}>Nueva inscripción</button>` : ''}
      </div>
      ${studentsBlock}
      <div class="filters">
        <select id="f-estado">${estados.map((r) => `<option ${query.estado === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        ${admin ? `<select id="f-institucion"><option ${!query.institucionId ? 'selected' : ''}>Todas</option>${institucionesOptions.map((i) => `<option value="${i.id}" ${query.institucionId === i.id ? 'selected' : ''}>${escapeHtml(i.nombre)}</option>`).join('')}</select>` : ''}
      </div>
      <div class="table-card">
        <table>
          <thead><tr><th>Estudiante</th>${tutor ? '' : '<th>Tutor</th>'}${showInstCol ? '<th>Institución</th>' : ''}<th>Grado</th><th>Ciclo</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
          <tbody>
            ${enrollments.length ? enrollments.map((e) => {
              const estadoColor = e.estado === 'Aprobada' ? '#2e9e5b' : e.estado === 'Rechazada' ? '#c23b3b' : e.estado === 'Abandonada' ? '#9aa0a6' : '#c98a1b';
              return `<tr>
                <td>${escapeHtml(e.estudianteNombre)}</td>
                ${tutor ? '' : `<td>${escapeHtml(e.tutorNombre)}</td>`}
                ${showInstCol ? `<td>${escapeHtml(e.institucionNombre)}</td>` : ''}
                <td>${escapeHtml(e.gradoSolicitado)}</td>
                <td>${escapeHtml(e.cicloEscolar)}</td>
                <td><span class="estado-cell"><span class="dot" style="background:${estadoColor}"></span>${e.estado}</span>${e.estado === 'Rechazada' && e.motivoRechazo ? `<div class="help">${escapeHtml(e.motivoRechazo)}</div>` : ''}${e.estado === 'Abandonada' ? '<div class="help">Sin respuesta durante 30 días.</div>' : ''}</td>
                <td>${fmtDate(e.createdAt)}</td>
                <td><span class="actions-cell">
                  ${tutor && e.estado === 'Pendiente' ? `<button class="danger" data-cancel="${e.id}">Cancelar</button>` : ''}
                  ${!tutor && e.estado === 'Pendiente' ? `<button class="ok" data-approve="${e.id}">Aprobar</button><button class="danger" data-reject="${e.id}">Rechazar</button>` : ''}
                  ${tutor && e.estado === 'Aprobada' ? `<button class="neutral" data-nav="#/app/calificar/${e.institucionId}">Calificar</button><button class="neutral" data-nav="#/app/reportar/${e.institucionId}">Reportar</button>` : ''}
                  <button class="neutral" data-nav="#/app/inscripciones/${e.id}/documentos">Documentos</button>
                  <button class="neutral" data-comprobante="${e.id}">Comprobante</button>
                </span></td>
              </tr>`;
            }).join('') : `<tr><td colspan="${colCount}" class="empty-state">No hay solicitudes${query.estado && query.estado !== 'Todos' ? ' con ese estado' : ''}.</td></tr>`}
          </tbody>
        </table>
        <div class="table-footer"><span>Mostrando ${enrollments.length} de ${total} solicitudes</span></div>
      </div>
    `;
    bindShellEvents();

    function applyFilters() {
      const p = new URLSearchParams();
      if (qs('#f-estado').value !== 'Todos') p.set('estado', qs('#f-estado').value);
      if (admin && qs('#f-institucion') && qs('#f-institucion').value !== 'Todas') p.set('institucionId', qs('#f-institucion').value);
      navigate('#/app/inscripciones?' + p.toString());
    }
    qs('#f-estado').addEventListener('change', applyFilters);
    if (admin && qs('#f-institucion')) qs('#f-institucion').addEventListener('change', applyFilters);

    qsa('[data-comprobante]').forEach((b) => b.addEventListener('click', () => navigate('#/app/inscripciones/comprobante/' + b.dataset.comprobante)));
    qsa('[data-cancel]').forEach((b) => b.addEventListener('click', () => {
      const e = enrollments.find(x => x.id === b.dataset.cancel);
      showConfirmModal({
        title: 'Cancelar solicitud de inscripción',
        bodyHtml: `<p>¿Cancelar la solicitud de <strong>${escapeHtml(e.estudianteNombre)}</strong> en <strong>${escapeHtml(e.institucionNombre)}</strong>?</p><p>Esta acción eliminará permanentemente la solicitud y no podrá ser recuperada.</p>`,
        confirmText: 'Cancelar solicitud',
        danger: true,
        onConfirm: async () => {
          await api('/enrollments/' + b.dataset.cancel + '/cancelar', { method: 'POST' });
          toast('Solicitud cancelada.', 'ok');
          renderInscripciones(query);
          return false;
        }
      });
    }));
    qsa('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('/enrollments/' + b.dataset.approve + '/decidir', { method: 'POST', body: { estado: 'Aprobada' } });
        toast('Inscripción aprobada.', 'ok');
        renderInscripciones(query);
      } catch (err) { toast(err.message, 'err'); }
    }));
    qsa('[data-reject]').forEach((b) => b.addEventListener('click', () => {
      const e = enrollments.find(x => x.id === b.dataset.reject);
      showConfirmModal({
        title: 'Rechazar solicitud',
        bodyHtml: `<p>¿Rechazar la solicitud de <strong>${escapeHtml(e.estudianteNombre)}</strong>?</p><p>Indica el motivo del rechazo:</p><input id="mod-motivo" class="input" style="margin-top:8px;" placeholder="Motivo del rechazo..." />`,
        confirmText: 'Rechazar',
        danger: true,
        onConfirm: async (modal) => {
          const motivo = qs('#mod-motivo', modal).value;
          if (!motivo || !motivo.trim()) throw new Error('Debes indicar un motivo.');
          await api('/enrollments/' + b.dataset.reject + '/decidir', { method: 'POST', body: { estado: 'Rechazada', motivo } });
          toast('Inscripción rechazada.', 'ok');
          renderInscripciones(query);
          return false;
        }
      });
    }));
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
    let selectedInst = null;
    let step = 1;

    async function renderStep() {
      if (step === 1) {
        qs('.main').innerHTML = `
          <button class="back-link" data-nav="#/app/inscripciones">${ICONS.back} Volver a inscripciones</button>
          <div class="page-head" style="margin-bottom:10px;"><h2>Paso 1: Seleccionar institución</h2></div>
          <p class="lede" style="margin-bottom:20px;">Explora el mapa y selecciona la escuela donde deseas inscribir al estudiante.</p>
          
          <div class="search-layout" style="height: 60vh; min-height: 400px; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); border: 1px solid var(--border-color); display:flex; flex-direction:row;">
            <div class="search-sidebar" style="width: 350px; padding: 15px; border-right: 1px solid var(--border-color); background: var(--bg-card); display:flex; flex-direction:column; gap:10px;">
              <input type="text" id="map-filter" placeholder="Buscar por nombre..." class="search-input" style="padding:10px; border:1px solid var(--border-color); border-radius:8px; width:100%;">
              <div id="inst-list" style="overflow-y:auto; flex:1; display:flex; flex-direction:column; gap:8px;"></div>
            </div>
            <div class="search-map" id="enroll-map-container" style="flex:1; background:var(--bg-body); position:relative;"></div>
          </div>
        `;
        bindShellEvents();

        const listContainer = qs('#inst-list');
        const filterInput = qs('#map-filter');
        let markers = [];
        let mapObj = null;

        if (typeof L === 'undefined') {
          qs('#enroll-map-container').innerHTML = '<div class="loading" style="padding:20px">Cargando mapa...</div>';
          await new Promise((resolve) => {
            const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(css);
            const script = document.createElement('script'); script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload = resolve; document.head.appendChild(script);
          });
        }

          const mapEl = qs('#enroll-map-container');
        if (mapEl) {
          mapEl.innerHTML = '';
          mapObj = L.map(mapEl).setView([18.7357, -70.1627], 8);
          const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
          
          const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapObj);
          
          if (isDark) {
            // Apply CSS filter to OSM tiles for a dark mode effect
            tileLayer.on('add', () => {
              const tilePane = mapEl.querySelector('.leaflet-tile-pane');
              if (tilePane) {
                tilePane.style.filter = 'invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%)';
              }
            });
          }

          // Custom Marker Icon (Premium visual)
          const createIcon = (color) => L.divIcon({
            className: 'custom-pin',
            html: `<svg viewBox="0 0 24 24" fill="${color}" width="32" height="32" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.3)); transform-origin:bottom; transition:transform 0.2s;"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
            iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
          });

          const defaultIcon = createIcon('var(--primary-color)');
          const hoverIcon = createIcon('var(--c-amber)');

          const renderList = (query = '') => {
            const filtered = activas.filter(i => i.nombre.toLowerCase().includes(query.toLowerCase()));
            listContainer.innerHTML = filtered.map(i => `
              <div class="inst-item" data-id="${i.id}" style="padding:12px; border:1px solid var(--border-color); border-radius:8px; cursor:pointer; transition:all 0.2s; background:var(--bg-card);">
                <div style="font-weight:600; color:var(--primary-color);">${escapeHtml(i.nombre)}</div>
                <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">${escapeHtml(i.municipio||'')}</div>
              </div>
            `).join('');

            markers.forEach(m => m.remove());
            markers = [];
            const bounds = [];
            
            filtered.forEach(i => {
              if (i.lat && i.lng) {
                const m = L.marker([i.lat, i.lng], { icon: defaultIcon }).addTo(mapObj);
                const popupContent = document.createElement('div');
                popupContent.innerHTML = `<strong>${escapeHtml(i.nombre)}</strong><br><button class="btn btn-primary btn-small" style="margin-top:8px; width:100%;">Seleccionar</button>`;
                popupContent.querySelector('button').addEventListener('click', () => { selectedInst = i; step = 2; renderStep(); });
                m.bindPopup(popupContent);
                m.instId = i.id;
                
                m.on('mouseover', () => m.setIcon(hoverIcon));
                m.on('mouseout', () => m.setIcon(defaultIcon));
                m.on('click', () => {
                  qsa('.inst-item').forEach(el => el.style.borderColor = 'var(--border-color)');
                  const card = qs(`.inst-item[data-id="${i.id}"]`);
                  if (card) { card.style.borderColor = 'var(--c-amber)'; card.scrollIntoView({behavior:'smooth', block:'nearest'}); }
                });

                markers.push(m);
                bounds.push([i.lat, i.lng]);
              }
            });
            if (bounds.length > 0) mapObj.fitBounds(bounds, { padding: [20, 20], maxZoom: 14 });

            qsa('.inst-item').forEach(card => {
              card.addEventListener('mouseenter', () => {
                const mk = markers.find(x => x.instId === card.dataset.id);
                if (mk) { mk.setIcon(hoverIcon); mk.setZIndexOffset(1000); }
              });
              card.addEventListener('mouseleave', () => {
                const mk = markers.find(x => x.instId === card.dataset.id);
                if (mk) { mk.setIcon(defaultIcon); mk.setZIndexOffset(0); }
              });
              card.addEventListener('click', () => {
                selectedInst = activas.find(x => x.id === card.dataset.id);
                step = 2;
                renderStep();
              });
            });
          };

          renderList();
          filterInput.addEventListener('input', (e) => renderList(e.target.value));
        }

      } else if (step === 2) {
        qs('.main').innerHTML = `
          <button class="back-link" id="btn-back-step">${ICONS.back} Volver al mapa</button>
          <div class="page-head"><h2>Paso 2: Datos de inscripción</h2></div>
          <div class="chart-card" style="max-width:560px;">
            <div style="background:var(--bg-body); padding:15px; border-radius:8px; margin-bottom:20px; display:flex; align-items:center; gap:15px; border:1px solid var(--border-color);">
              <div style="width:48px; height:48px; border-radius:8px; background:var(--primary-color); color:#fff; display:flex; align-items:center; justify-content:center;">${ICONS.building}</div>
              <div>
                <div style="font-weight:600; font-size:16px;">${escapeHtml(selectedInst.nombre)}</div>
                <div style="font-size:13px; color:var(--text-muted);">${escapeHtml(selectedInst.provincia)}</div>
              </div>
            </div>
            <div id="err"></div>
            <form id="enroll-form">
              <input type="hidden" name="institucionId" value="${selectedInst.id}">
              <div class="field"><label>Estudiante</label>
                <select name="studentId">${students.map((s) => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('')}</select>
              </div>
              <div class="two-col">
                <div class="field"><label>Grado solicitado</label>
                  <select name="gradoSolicitado">${GRADOS.map((g) => `<option>${escapeHtml(g)}</option>`).join('')}</select>
                </div>
                <div class="field"><label>Ciclo escolar</label>
                  <select name="cicloEscolar">${ciclos.map((c) => `<option>${c}</option>`).join('')}</select>
                </div>
              </div>
              <div style="display:flex; gap:10px; margin-top:20px;">
                <button class="btn btn-primary" style="width:auto; padding:12px 22px;" type="submit">Enviar solicitud</button>
              </div>
            </form>
          </div>
        `;
        qs('#btn-back-step').addEventListener('click', () => { step = 1; renderStep(); });
        
        qs('#enroll-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          qs('#err').innerHTML = '';
          try {
            await api('/enrollments', { method: 'POST', body: Object.fromEntries(fd.entries()) });
            toast('Solicitud enviada.', 'ok');
            navigate('#/app/inscripciones');
          } catch (err) {
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
    const { enrollments } = await api('/enrollments');
    const enrollment = enrollments.find((e) => e.id === enrollmentId);
    if (!enrollment) {
      qs('.main').innerHTML = '<div class="empty-state">No se encontró esa solicitud de inscripción.</div>';
      return;
    }
    const u = state.user;
    const isOwnerTutor = u.role === 'Tutor' && enrollment.tutorId === u.id;
    const canDecide = isAdmin() || (u.role === 'Personal de institución' && u.institucionId === enrollment.institucionId);

    const [{ documents }, periodsRes] = await Promise.all([
      api('/enrollments/' + enrollmentId + '/documents'),
      api('/institutions/' + enrollment.institucionId + '/periods?cicloEscolar=' + encodeURIComponent(enrollment.cicloEscolar)),
    ]);
    const configurados = periodsRes.periods[0] && periodsRes.periods[0].documentosRequeridos;
    const tiposParaSubir = configurados && configurados.length ? configurados : TIPOS_DOCUMENTO;

    qs('.main').innerHTML = `
      <button class="back-link" data-nav="#/app/inscripciones">${ICONS.back} Volver a inscripciones</button>
      <div class="page-head"><div><h2>Documentos — ${escapeHtml(enrollment.estudianteNombre)}</h2><div class="sub">${escapeHtml(enrollment.institucionNombre)} · ${escapeHtml(enrollment.gradoSolicitado)} · ${escapeHtml(enrollment.cicloEscolar)}</div></div></div>
      ${isOwnerTutor ? `
        <div class="chart-card" style="max-width:560px; margin-bottom:20px;">
          <div id="doc-err"></div>
          <form id="doc-form">
            <div class="field"><label>Tipo de documento</label>
              <select name="tipoDocumento">${tiposParaSubir.map((t) => `<option>${escapeHtml(t)}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Archivo (PDF, JPG o PNG, máx. 5 MB)</label><input type="file" name="archivo" accept=".pdf,.jpg,.jpeg,.png" required></div>
            <button class="btn btn-primary" style="width:auto; padding:12px 22px;" type="submit">Subir documento</button>
          </form>
        </div>
      ` : ''}
      <div class="notif-list">
        ${documents.length ? documents.map((d) => `
          <div class="notif-item">
            <div>
              <div class="t1">${escapeHtml(d.tipoDocumento || d.nombreArchivo)} · <a href="/api/documents/${d.id}/file" target="_blank" rel="noopener">${escapeHtml(d.nombreArchivo)}</a> <span class="help">(${fmtBytes(d.size)})</span></div>
              ${d.estado === 'Rechazado' && d.motivoRechazo ? `<div class="t2">${escapeHtml(d.motivoRechazo)}</div>` : ''}
              <div class="t3">${fmtDate(d.uploadedAt)} · ${escapeHtml(d.estado)}</div>
            </div>
            ${canDecide && d.estado === 'Pendiente' ? `<span class="actions-cell"><button class="ok" data-doc-accept="${d.id}">Aceptar</button><button class="danger" data-doc-reject="${d.id}">Rechazar</button></span>` : ''}
          </div>
        `).join('') : '<div class="empty-state">No se han subido documentos todavía.</div>'}
      </div>
    `;
    bindShellEvents();

    const docForm = qs('#doc-form');
    if (docForm) {
      docForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        qs('#doc-err').innerHTML = '';
        const fd = new FormData(docForm);
        try {
          const res = await fetch('/api/enrollments/' + enrollmentId + '/documents', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok) throw { errors: data.errors || [data.error || 'No se pudo subir el documento.'] };
          toast('Documento subido.', 'ok');
          renderDocumentosInscripcion(enrollmentId);
        } catch (err) {
          qs('#doc-err').innerHTML = fieldErrorsBlock(err.errors || [err.message || 'No se pudo subir el documento.']);
        }
      });
    }

    qsa('[data-doc-accept]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('/documents/' + b.dataset.docAccept + '/decidir', { method: 'POST', body: { estado: 'Aceptado' } });
        toast('Documento aceptado.', 'ok');
        renderDocumentosInscripcion(enrollmentId);
      } catch (err) { toast(err.message, 'err'); }
    }));
    qsa('[data-doc-reject]').forEach((b) => b.addEventListener('click', async () => {
      const motivo = prompt('Motivo del rechazo:');
      if (!motivo || !motivo.trim()) return;
      try {
        await api('/documents/' + b.dataset.docReject + '/decidir', { method: 'POST', body: { estado: 'Rechazado', motivo } });
        toast('Documento rechazado.', 'ok');
        renderDocumentosInscripcion(enrollmentId);
      } catch (err) { toast(err.message, 'err'); }
    }));
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
      <button class="back-link" data-nav="#/app/instituciones">${ICONS.back} Volver a instituciones</button>
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
      if (!confirm('\u00bfEliminar por completo la configuraci\u00f3n de este ciclo? Esta acci\u00f3n no se puede deshacer.')) return;
      try {
        await api('/institutions/' + institucionId + '/periods/' + b.dataset.eliminarPeriodo, { method: 'DELETE' });
        toast('Configuraci\u00f3n eliminada.', 'ok');
        renderPeriodosList(institucionId);
      } catch (err) { toast(err.message, 'err'); }
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
    const canManage = isAdmin() || u.role === 'Soporte' || (u.role === 'Personal de institución' && u.institucionId === institucionId);

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

    let docsState = (period.documentosRequeridos || []).map(d => {
      if (typeof d === 'string') {
        return { id: Math.random().toString(36).substr(2, 9), nombre: d, niveles: nivelesDisponibles ? nivelesDisponibles.slice() : [], descripcion: '', formatos: formatosDisponibles ? formatosDisponibles.slice() : [], maxMb: 5 };
      }
      return { ...d, id: Math.random().toString(36).substr(2, 9) };
    });
    let docsOriginal = JSON.stringify(docsState);

    window._navInterceptor = () => {
      if (JSON.stringify(docsState) !== docsOriginal) {
        return confirm('Tienes cambios sin guardar en los documentos. ¿Seguro que deseas salir?');
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
            if (confirm('¿Seguro que deseas quitar el requisito "' + docName + '"?')) {
              docsState.splice(idx, 1);
              renderDocsEditor();
            }
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
            if (confirm('¿Seguro que deseas cancelar? Se perderán los cambios no guardados.')) {
              docsState = JSON.parse(docsOriginal);
              renderDocsEditor();
            }
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
            <div class="card" style="width:480px; padding:24px; position:relative; z-index:10000; text-align:left;">
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
  async function renderCitas(query) {
    const u = state.user;
    const tutor = u.role === 'Tutor';
    const staff = u.role === 'Personal de institución';
    const admin = isAdmin();

    const params = new URLSearchParams();
    if (query.estado) params.set('estado', query.estado);
    if (query.institucionId && admin) params.set('institucionId', query.institucionId);
    const { total, appointments } = await api('/appointments?' + params.toString());

    let institucionesOptions = [];
    if (admin) {
      const ires = await api('/institutions');
      institucionesOptions = ires.institutions;
    }

    const estados = ['Todos', 'Pendiente', 'Confirmada', 'Rechazada', 'Cancelada'];
    const showInstColCitas = admin || tutor;
    const colCount = 5 + (tutor ? 0 : 1) + (showInstColCitas ? 1 : 0);

    qs('.main').innerHTML = `
      <div class="page-head">
        <div><h2>Citas</h2><div class="sub">${tutor ? 'Agenda una cita con una institución.' : staff ? 'Citas solicitadas a tu institución.' : 'Todas las citas del sistema.'}</div></div>
        ${tutor ? `<button class="btn btn-primary" style="width:auto; padding:10px 18px;" data-nav="#/app/citas/nueva">Nueva cita</button>` : ''}
      </div>
      <div class="filters">
        <select id="f-estado">${estados.map((r) => `<option ${query.estado === r ? 'selected' : ''}>${r}</option>`).join('')}</select>
        ${admin ? `<select id="f-institucion"><option ${!query.institucionId ? 'selected' : ''}>Todas</option>${institucionesOptions.map((i) => `<option value="${i.id}" ${query.institucionId === i.id ? 'selected' : ''}>${escapeHtml(i.nombre)}</option>`).join('')}</select>` : ''}
      </div>
      <div class="table-card">
        <table>
          <thead><tr><th>Estudiante</th>${tutor ? '' : '<th>Tutor</th>'}${showInstColCitas ? '<th>Institución</th>' : ''}<th>Motivo</th><th>Fecha y hora</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
            ${appointments.length ? appointments.map((a) => {
              const estadoColor = a.estado === 'Confirmada' ? '#2e9e5b' : a.estado === 'Cancelada' ? '#c23b3b' : a.estado === 'Rechazada' ? '#8a2f2f' : '#c98a1b';
              const when = a.fechaHoraConfirmada || a.fechaHoraSolicitada;
              const adjusted = a.fechaHoraConfirmada && a.fechaHoraConfirmada !== a.fechaHoraSolicitada;
              return `<tr>
                <td>${escapeHtml(a.estudianteNombre || 'General')}</td>
                ${tutor ? '' : `<td>${escapeHtml(a.tutorNombre)}</td>`}
                ${showInstColCitas ? `<td>${escapeHtml(a.institucionNombre)}</td>` : ''}
                <td>${escapeHtml(a.motivo)}</td>
                <td>${fmtDate(when)}${adjusted ? `<div class="help">Solicitada: ${fmtDate(a.fechaHoraSolicitada)}</div>` : ''}</td>
                <td><span class="estado-cell"><span class="dot" style="background:${estadoColor}"></span>${a.estado}</span>${a.estado === 'Cancelada' && a.motivoCancelacion ? `<div class="help">${escapeHtml(a.motivoCancelacion)}</div>` : ''}${a.estado === 'Rechazada' && a.motivoRechazo ? `<div class="help">${escapeHtml(a.motivoRechazo)}</div>` : ''}</td>
                <td><span class="actions-cell">
                  ${!tutor && a.estado === 'Pendiente' ? `<button class="ok" data-confirm="${a.id}">Confirmar</button><button class="danger" data-reject="${a.id}">Rechazar</button>` : ''}
                  ${tutor && a.estado === 'Confirmada' ? `<button class="neutral" data-nav="#/app/calificar/${a.institucionId}">Calificar</button><button class="neutral" data-nav="#/app/reportar/${a.institucionId}">Reportar</button>` : ''}
                  ${(tutor && (a.estado === 'Pendiente' || a.estado === 'Confirmada')) || (!tutor && a.estado === 'Confirmada') ? `<button class="danger" data-cancel="${a.id}">Cancelar</button>` : ''}
                  <button class="neutral" data-comprobante="${a.id}">Comprobante</button>
                </span></td>
              </tr>`;
            }).join('') : `<tr><td colspan="${colCount}" class="empty-state">No hay citas${query.estado && query.estado !== 'Todos' ? ' con ese estado' : ''}.</td></tr>`}
          </tbody>
        </table>
        <div class="table-footer"><span>Mostrando ${appointments.length} de ${total} citas</span></div>
      </div>
    `;
    bindShellEvents();

    function applyFilters() {
      const p = new URLSearchParams();
      if (qs('#f-estado').value !== 'Todos') p.set('estado', qs('#f-estado').value);
      if (admin && qs('#f-institucion') && qs('#f-institucion').value !== 'Todas') p.set('institucionId', qs('#f-institucion').value);
      navigate('#/app/citas?' + p.toString());
    }
    qs('#f-estado').addEventListener('change', applyFilters);
    if (admin && qs('#f-institucion')) qs('#f-institucion').addEventListener('change', applyFilters);

    qsa('[data-comprobante]').forEach((b) => b.addEventListener('click', () => navigate('#/app/citas/comprobante/' + b.dataset.comprobante)));
    qsa('[data-confirm]').forEach((b) => b.addEventListener('click', async () => {
      try {
        await api('/appointments/' + b.dataset.confirm + '/confirmar', { method: 'POST' });
        toast('Cita confirmada.', 'ok');
        renderCitas(query);
      } catch (err) { toast(err.message, 'err'); }
    }));
    qsa('[data-cancel]').forEach((b) => b.addEventListener('click', () => {
      const a = appointments.find(x => x.id === b.dataset.cancel);
      if (!tutor) {
        showConfirmModal({
          title: 'Cancelar cita',
          bodyHtml: `<p>¿Cancelar la cita con <strong>${escapeHtml(a.tutorNombre)}</strong>?</p><p>Indica el motivo de la cancelación:</p><input id="mod-motivo" class="input" style="margin-top:8px;" placeholder="Motivo..." />`,
          confirmText: 'Cancelar cita',
          danger: true,
          onConfirm: async (modal) => {
            const motivo = qs('#mod-motivo', modal).value;
            if (!motivo || !motivo.trim()) throw new Error('Debes indicar un motivo.');
            await api('/appointments/' + b.dataset.cancel + '/cancelar', { method: 'POST', body: { motivo } });
            toast('Cita cancelada.', 'ok');
            renderCitas(query);
            return false;
          }
        });
      } else {
        showConfirmModal({
          title: 'Cancelar cita',
          bodyHtml: `<p>¿Cancelar tu cita en <strong>${escapeHtml(a.institucionNombre)}</strong>?</p><p>Esta acción cancelará la cita de forma definitiva.</p>`,
          confirmText: 'Cancelar cita',
          danger: true,
          onConfirm: async () => {
            await api('/appointments/' + b.dataset.cancel + '/cancelar', { method: 'POST', body: { motivo: '' } });
            toast('Cita cancelada.', 'ok');
            renderCitas(query);
            return false;
          }
        });
      }
    }));
    qsa('[data-reject]').forEach((b) => b.addEventListener('click', () => {
      const a = appointments.find(x => x.id === b.dataset.reject);
      showConfirmModal({
        title: 'Rechazar cita',
        bodyHtml: `<p>¿Rechazar la cita de <strong>${escapeHtml(a.tutorNombre)}</strong>?</p><p>Indica el motivo del rechazo:</p><input id="mod-motivo" class="input" style="margin-top:8px;" placeholder="Motivo del rechazo..." />`,
        confirmText: 'Rechazar cita',
        danger: true,
        onConfirm: async (modal) => {
          const motivo = qs('#mod-motivo', modal).value;
          if (!motivo || !motivo.trim()) throw new Error('Debes indicar un motivo.');
          await api('/appointments/' + b.dataset.reject + '/rechazar', { method: 'POST', body: { motivo } });
          toast('Cita rechazada.', 'ok');
          renderCitas(query);
          return false;
        }
      });
    }));
  }

  async function renderCitaForm() {
    const [{ students }, { institutions }] = await Promise.all([api('/students'), api('/institutions')]);
    const activas = institutions.filter((i) => (i.estado || 'Activo') === 'Activo');
    const minVal = nowLocalPlus(1);
    qs('.main').innerHTML = `
      <button class="back-link" data-nav="#/app/citas">${ICONS.back} Volver a citas</button>
      <div class="page-head"><h2>Nueva cita</h2></div>
      <div class="chart-card" style="max-width:560px;">
        <div id="err"></div>
        <form id="cita-form">
          <div class="field"><label>Institución</label>
            <select name="institucionId">${activas.map((i) => `<option value="${i.id}">${escapeHtml(i.nombre)} — ${escapeHtml(i.provincia)}</option>`).join('')}</select>
            <a href="#" id="cita-ver-calendario" class="help" style="display:inline-block; margin-top:6px;">Ver calendario de citas de esta institución</a>
          </div>
          <div class="field"><label>Estudiante (opcional)</label>
            <select name="studentId">
              <option value="">General (sin estudiante específico)</option>
              ${students.map((s) => `<option value="${s.id}">${escapeHtml(s.nombre)}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Motivo</label>
            <select name="motivo">${MOTIVOS_CITA.map((m) => `<option>${escapeHtml(m)}</option>`).join('')}</select>
          </div>
          <div class="field"><label>Fecha y hora</label><input type="datetime-local" name="fechaHoraSolicitada" min="${minVal}" required></div>
          <div class="field"><label>Notas</label><input type="text" name="notas" placeholder="Opcional"></div>
          <div style="display:flex; gap:10px;">
            <button class="btn btn-primary" style="width:auto; padding:12px 22px;" type="submit">Solicitar cita</button>
            <button class="btn btn-ghost" style="width:auto; padding:12px 22px;" type="button" data-nav="#/app/citas">Cancelar</button>
          </div>
        </form>
      </div>
    `;
    bindShellEvents();
    const calLink = qs('#cita-ver-calendario');
    const institSelect = qs('select[name="institucionId"]');
    function updateCalLink() {
      if (calLink && institSelect && institSelect.value) calLink.setAttribute('href', '#/app/instituciones/' + institSelect.value + '/calendario');
    }
    updateCalLink();
    institSelect && institSelect.addEventListener('change', updateCalLink);
    qs('#cita-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = Object.fromEntries(fd.entries());
      body.fechaHoraSolicitada = drIso(body.fechaHoraSolicitada);
      qs('#err').innerHTML = '';
      try {
        await api('/appointments', { method: 'POST', body });
        toast('Cita solicitada.', 'ok');
        navigate('#/app/citas');
      } catch (err) {
        qs('#err').innerHTML = fieldErrorsBlock(err.errors || [err.message]);
      }
    });
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
    const estadoColor = a.estado === 'Confirmada' ? '#1f7a4c' : a.estado === 'Cancelada' ? '#c23b3b' : '#8a6414';
    const when = a.fechaHoraConfirmada || a.fechaHoraSolicitada;
    printableShell({
      tipo: 'Comprobante de cita',
      folio: a.id,
      estado: a.estado,
      estadoColor,
      motivoLabel: 'Motivo de cancelación',
      motivo: a.estado === 'Cancelada' ? a.motivoCancelacion : '',
      backHref: '#/app/citas',
      fields: [
        { label: 'Tutor', value: a.tutorNombre },
        { label: 'Estudiante', value: a.estudianteNombre || 'No especificado' },
        { label: 'Institución', value: a.institucionNombre },
        { label: 'Provincia', value: inst ? inst.provincia : '—' },
        { label: 'Dirección', value: inst && inst.direccion ? inst.direccion : 'No registrada' },
        { label: 'Motivo de la cita', value: a.motivo },
        { label: 'Fecha y hora', value: fmtDate(when) },
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
            { label: 'Confirmadas', count: s.citas.confirmadas },
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
