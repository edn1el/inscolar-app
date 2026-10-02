// Avisos del proceso local: se publican solo después del guardado confirmado.
const { EventEmitter } = require('events');
const updates = new EventEmitter();
updates.setMaxListeners(0);
updates.publish = change => {
  for (const listener of updates.listeners('changed')) {
    try { listener(change); } catch (_) { /* Un aviso fallido no revierte el guardado. */ }
  }
};
module.exports = updates;
