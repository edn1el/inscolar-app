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

// Solo Administrador. Usado para acciones exclusivas: crear Admin/Soporte, activar/desactivar,
// resetear contraseñas, ver el listado completo con todos los roles.
function requireAdminOnly(req, res, next) {
  if (req.currentUser.role !== 'Administrador') {
    return res.status(403).json({ error: 'Solo un Administrador puede realizar esta acción.' });
  }
  next();
}

// Administrador o Soporte. Soporte solo puede operar sobre Personal de institución y Tutor.
// El router debe llamar a esta y luego validar el rol del objetivo si aplica.
function requireAdminOrSupport(req, res, next) {
  if (!['Administrador', 'Soporte'].includes(req.currentUser.role)) {
    return res.status(403).json({ error: 'No tienes permiso para esta acción.' });
  }
  next();
}

// Alias legacy que equivale a requireAdminOrSupport (para rutas de instituciones, periodos, etc.)
const requireAdmin = requireAdminOrSupport;

// Verifica que Soporte no intente crear/editar un rol privilegiado (Admin, Soporte, Auditoría).
// Llama a next() si el usuario actual es Administrador, o si el rol objetivo es Personal/Tutor.
const ROLES_QUE_SOPORTE_PUEDE_GESTIONAR = ['Personal de institución', 'Tutor'];
function requireCanManageRole(targetRole) {
  return (req, res, next) => {
    if (req.currentUser.role === 'Administrador') return next();
    if (!ROLES_QUE_SOPORTE_PUEDE_GESTIONAR.includes(targetRole)) {
      return res.status(403).json({ error: 'Soporte solo puede gestionar usuarios de tipo Personal de institución o Tutor.' });
    }
    next();
  };
}

module.exports = { requireAuth, requireAdmin, requireAdminOnly, requireAdminOrSupport, requireCanManageRole, ROLES_QUE_SOPORTE_PUEDE_GESTIONAR };
