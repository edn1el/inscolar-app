const express = require('express');
const { save } = require('../lib/db');
const { requireAuth, requireAdmin } = require('../lib/middleware');

const router = express.Router();
router.use(requireAuth);

// ---- instituciones ----
router.get('/institutions', (req, res) => {
  res.json({ institutions: req.db.institutions });
});

// ---- notificaciones (admin) ----
router.get('/notifications', requireAdmin, (req, res) => {
  const db = req.db;
  const list = db.notifications.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ notifications: list, unreadCount: list.filter((n) => !n.read).length });
});

router.post('/notifications/:id/read', requireAdmin, (req, res) => {
  const db = req.db;
  const n = db.notifications.find((n) => n.id === req.params.id);
  if (n) {
    n.read = true;
    save(db);
  }
  res.json({ status: 'ok' });
});

// ---- analíticas ----
router.get('/analytics/summary', requireAdmin, (req, res) => {
  const db = req.db;
  const users = db.users;
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const porRol = {};
  for (const u of users) porRol[u.role] = (porRol[u.role] || 0) + 1;

  const porProvincia = {};
  for (const inst of db.institutions) porProvincia[inst.provincia] = (porProvincia[inst.provincia] || 0) + 1;

  const activos = users.filter((u) => u.estado === 'Activo').length;
  const nuevosEstaSemana = users.filter((u) => new Date(u.createdAt).getTime() >= weekAgo).length;
  const tutores = users.filter((u) => u.role === 'Tutor').length;
  const mfaActivo = users.filter((u) => u.mfaEnabled).length;

  res.json({
    totalUsuarios: users.length,
    activos,
    inactivos: users.length - activos,
    nuevosEstaSemana,
    tutores,
    mfaActivo,
    totalInstituciones: db.institutions.length,
    porRol: Object.entries(porRol).map(([role, count]) => ({ role, count })),
    porProvincia: Object.entries(porProvincia)
      .map(([provincia, count]) => ({ provincia, count }))
      .sort((a, b) => b.count - a.count),
    actividadReciente: db.notifications
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5),
  });
});

module.exports = router;
