const { AsyncLocalStorage } = require('async_hooks');
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
  'Contraseña cambiada',
  'Foto de perfil actualizada',
  'Foto de perfil eliminada',
  'Institución creada',
  'Institución modificada',
  'Institución activada',
  'Institución desactivada',
  'Foto de institución actualizada',
  'Foto de institución eliminada',
  'Calificación registrada',
  'Calificación modificada',
  'Reporte enviado',
  'Inscripción creada',
  'Inscripción aprobada',
  'Inscripción rechazada',
  'Inscripción cancelada',
  'Inscripción abandonada por inactividad',
  'Cita creada',
  'Cita confirmada',
  'Cita modificada',
  'Cita rechazada',
  'Cita cancelada',
  'Documento subido',
  'Documento aceptado',
  'Documento rechazado',
  'Notificación importante leída',
  'Correo enviado',
  'Error al enviar correo',
  'Periodo de ciclo creado',
  'Periodo de ciclo modificado',
  'Periodo de inscripción modificado',
  'Periodo de envío de documentos modificado',
  'Periodo para agendar citas modificado',
  'Límite de citas modificado',
  'Documentos requeridos modificados',
  'Configuración de periodo eliminada',
  'Periodo de inscripción eliminado',
  'Periodo de envío de documentos eliminado',
  'Periodo para agendar citas eliminado',
];

// ---- Contexto de la petición (HU096-HU104: IP y User-Agent en cada evento) ----
// Un middleware guarda la IP y el navegador de cada petición; logEvent los toma de
// aquí sin que cada ruta tenga que pasarlos (equivalente al Custom Data Provider de Audit.NET).
const contexto = new AsyncLocalStorage();
function auditContext(req, res, next) {
  const ip = (req.ip || (req.socket && req.socket.remoteAddress) || '').replace(/^::ffff:/, '');
  contexto.run({ ip, userAgent: String(req.get('user-agent') || '').slice(0, 300) }, next);
}

// ---- Datos sensibles (equivalente a [AuditIgnore]) ----
const CAMPOS_SENSIBLES = /pass|hash|token|secret|code|codigo|history|session|cookie/i;
function depurar(valor, nivel = 0) {
  if (valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) return nivel > 3 ? '[…]' : valor.slice(0, 50).map((v) => depurar(v, nivel + 1));
  if (typeof valor === 'object') {
    if (nivel > 3) return '[…]';
    const out = {};
    for (const [k, v] of Object.entries(valor)) {
      if (CAMPOS_SENSIBLES.test(k)) continue;
      out[k] = depurar(v, nivel + 1);
    }
    return out;
  }
  if (typeof valor === 'string' && valor.length > 500) return valor.slice(0, 500) + '…';
  return valor;
}

// Diferencias campo por campo entre el estado anterior y el nuevo (Target.Old / Target.New).
function diferencias(antes, despues) {
  if (!antes || !despues) return null;
  const a = depurar(antes), d = depurar(despues);
  const cambios = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(d)])) {
    const va = JSON.stringify(a[k] === undefined ? null : a[k]);
    const vd = JSON.stringify(d[k] === undefined ? null : d[k]);
    if (va !== vd) cambios.push({ campo: k, antes: a[k] === undefined ? null : a[k], despues: d[k] === undefined ? null : d[k] });
  }
  return cambios;
}

// Registra un evento en la bitacora. No lanza errores: un fallo al auditar
// nunca debe interrumpir la accion original; el error queda en el log del servidor.
//   antes/despues: estado de la entidad antes y después del cambio
//   datos: información adicional del evento (se guarda como JSON, sin campos sensibles)
//   motivo: razón de un fallo (p. ej. en un inicio de sesión fallido)
function logEvent(db, { actor, accion, entidad, entidadId, detalle, antes, despues, datos, motivo }) {
  try {
    if (!Array.isArray(db.logs)) db.logs = [];
    const ctx = contexto.getStore() || {};
    const evento = {
      id: nextId(db.logs, 'log'),
      fecha: new Date().toISOString(),
      actorId: actor ? actor.id : null,
      // Sin actor: un proceso del sistema, o alguien sin sesión (p. ej. un inicio de sesión fallido).
      actorNombre: actor ? actor.nombre : (accion === 'Inicio de sesión fallido' ? 'Sin sesión' : 'Sistema'),
      actorRole: actor ? actor.role : null,
      accion,
      entidad: entidad || null,
      entidadId: entidadId || null,
      detalle: detalle || '',
      ip: ctx.ip || null,
      userAgent: ctx.userAgent || null,
    };
    if (motivo) evento.motivo = motivo;
    const cambios = diferencias(antes, despues);
    if (cambios && cambios.length) evento.cambios = cambios;
    if (datos) evento.datos = depurar(datos);
    db.logs.push(evento);
  } catch (e) {
    console.error('[auditoría] No se pudo registrar el evento:', accion, e && e.message);
  }
}

// Copia superficial de los campos que interesan para el antes/después.
function instantanea(obj, campos) {
  if (!obj) return null;
  const out = {};
  for (const c of campos) out[c] = obj[c] === undefined ? null : JSON.parse(JSON.stringify(obj[c]));
  return out;
}

module.exports = { logEvent, ACCIONES, auditContext, instantanea, depurar };
