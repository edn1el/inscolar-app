const { load } = require('./db');

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'No has iniciado sesión.' });
  const db = load();
  const user = db.users.find((u) => u.id === req.session.userId);
  if (!user || user.estado === 'Inactivo') return res.status(401).json({ error: 'Sesión inválida.' });
  req.currentUser = user;
  req.db = db;
  next();
}

function requireAdmin(req, res, next) {
  const allowed = ['Administrador', 'Soporte'];
  if (!allowed.includes(req.currentUser.role)) {
    return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
