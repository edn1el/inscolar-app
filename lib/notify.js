const { nextId } = require('./db');

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
}

// Notificacion dirigida a un usuario especifico (ej. el tutor duenio de una inscripcion/cita).
function notifyUser(db, { recipient, campo, anterior, nuevo, actor, userNombre }) {
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
    read: false,
  });
}

module.exports = { notifyAdmins, notifyUser };
