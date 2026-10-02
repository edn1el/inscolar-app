const { nextId } = require('./db');
const { sendMail } = require('./mailer');

// HU062: arma el asunto/cuerpo simple de un correo de notificacion a partir
// de los mismos campos que ya se guardan en la notificacion interna.
function buildEmail({ campo, anterior, nuevo }) {
  const subject = `Inscolar: actualización — ${campo}`;
  let text = `Se registró un cambio en "${campo}".`;
  if (anterior || nuevo) text += ` De "${anterior || '—'}" a "${nuevo || '—'}".`;
  return { subject, text };
}

// Notificacion "broadcast": la ven todos los administradores/soporte (recipientId vacio).
function notifyAdmins(db, { affectedUser, campo, anterior, nuevo, actor }) {
  db.notifications.unshift({
    id: nextId(db.notifications, 'n'),
    recipientId: null,
    userId: affectedUser.id,
    userNombre: affectedUser.nombre,
    campo,
    anterior: anterior || '',
    nuevo: nuevo || '',
    actorId: actor.id,
    actorNombre: actor.nombre,
    createdAt: new Date().toISOString(),
    read: false,
  });

  // HU062: ademas de la notificacion interna, se envia (o se simula) un correo
  // a cada Administrador/Soporte activo que tenga las notificaciones por correo
  // habilitadas (HU066). No se espera el resultado (fire-and-forget): un correo
  // lento o simulado nunca debe retrasar la respuesta de la accion original.
  const { subject, text } = buildEmail({ campo, anterior, nuevo });
  const destinatarios = db.users.filter(
    (u) => ['Administrador', 'Soporte'].includes(u.role) && u.estado === 'Activo' && u.notifyByEmail !== false
  );
  for (const dest of destinatarios) {
    sendMail(db, {
      to: dest.email,
      subject,
      text: `${text}\nUsuario afectado: ${affectedUser.nombre}.\nRegistrado por: ${actor.nombre}.`,
    }).catch(() => {});
  }
}

// Notificacion dirigida a un usuario especifico (ej. el tutor duenio de una inscripcion/cita).
function notifyUser(db, { recipient, campo, anterior, nuevo, actor, userNombre, webOnly, eventId, entityId, url, motivo }) {
  db.notifications.unshift({
    id: nextId(db.notifications, 'n'),
    recipientId: recipient.id,
    userId: recipient.id,
    userNombre: userNombre || recipient.nombre,
    campo,
    anterior: anterior || '',
    nuevo: nuevo || '',
    actorId: actor.id,
    actorNombre: actor.nombre,
    createdAt: new Date().toISOString(),
    read: false, eventId, entityId, url, motivo,
  });

  // HU062/HU066: correo dirigido al destinatario, solo si tiene la preferencia activada.
  if (!webOnly && recipient.email && recipient.notifyByEmail !== false) {
    const { subject, text } = buildEmail({ campo, anterior, nuevo });
    sendMail(db, { to: recipient.email, subject, text }).catch(() => {});
  }
}

module.exports = { notifyAdmins, notifyUser };
