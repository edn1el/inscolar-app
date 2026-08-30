const express = require('express');
const { requireAuth } = require('../lib/middleware');
const { ACCIONES } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

const AUDIT_ROLES = ['Administrador', 'Auditoría'];

function requireAuditor(req, res, next) {
  if (!AUDIT_ROLES.includes(req.currentUser.role)) {
    return res.status(403).json({ error: 'No tienes permiso para consultar la bitácora de auditoría.' });
  }
  next();
}

router.get('/logs', requireAuditor, (req, res) => {
  const db = req.db;
  const { desde, hasta, accion, actorId, q } = req.query;
  let list = Array.isArray(db.logs) ? db.logs.slice() : [];

  if (desde) {
    const from = new Date(desde);
    if (!isNaN(from.getTime())) list = list.filter((l) => new Date(l.fecha) >= from);
  }
  if (hasta) {
    const to = new Date(hasta);
    if (!isNaN(to.getTime())) {
      to.setHours(23, 59, 59, 999);
      list = list.filter((l) => new Date(l.fecha) <= to);
    }
  }
  if (accion && accion !== 'Todas') list = list.filter((l) => l.accion === accion);
  if (actorId && actorId !== 'Todos') list = list.filter((l) => l.actorId === actorId);
  if (q) {
    const qq = q.toLowerCase();
    list = list.filter((l) =>
      (l.actorNombre || '').toLowerCase().includes(qq) ||
      (l.detalle || '').toLowerCase().includes(qq) ||
      (l.accion || '').toLowerCase().includes(qq)
    );
  }

  list.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const total = list.length;
  const LIMIT = 500;
  const limited = list.slice(0, LIMIT);

  const actorMap = new Map();
  for (const l of db.logs || []) {
    if (l.actorId && !actorMap.has(l.actorId)) actorMap.set(l.actorId, l.actorNombre);
  }
  const actores = Array.from(actorMap, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  res.json({ total, logs: limited, truncated: total > LIMIT, acciones: ACCIONES, actores });
});

module.exports = router;
