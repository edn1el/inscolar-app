const { nextId } = require('./db');

// Catalogo de acciones registrables (para el filtro de la pantalla de Auditoria).
const ACCIONES = [
  'Inicio de sesión exitoso',
  'Inicio de sesión fallido',
  'Cierre de sesión',
  'Usuario creado',
  'Usuario modificado',
  'Usuario activado',
  'Usuario desactivado',
  'Contraseña de usuario restablecida',
  'Institución creada',
  'Institución modificada',
  'Institución activada',
  'Institución desactivada',
  'Inscripción creada',
  'Inscripción aprobada',
  'Inscripción rechazada',
  'Inscripción cancelada',
  'Cita creada',
  'Cita confirmada',
  'Cita cancelada',
  'Documento subido',
  'Documento aceptado',
  'Documento rechazado',
  'Notificación importante leída',
];

// Registra un evento en la bitacora. No lanza errores: un fallo al auditar
// nunca debe interrumpir la accion original que se esta registrando.
function logEvent(db, { actor, accion, entidad, entidadId, detalle }) {
  try {
    if (!Array.isArray(db.logs)) db.logs = [];
    db.logs.push({
      id: nextId(db.logs, 'log'),
      fecha: new Date().toISOString(),
      actorId: actor ? actor.id : null,
      actorNombre: actor ? actor.nombre : 'Sistema',
      actorRole: actor ? actor.role : null,
      accion,
      entidad: entidad || null,
      entidadId: entidadId || null,
      detalle: detalle || '',
    });
  } catch (e) {
    // no-op: la auditoria nunca debe tumbar la operacion principal.
  }
}

module.exports = { logEvent, ACCIONES };
