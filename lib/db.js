const fs = require('fs');
const path = require('path');
const { coordsForInstitution } = require('./geo');

// DB_PATH puede sobrescribirse mediante variable de entorno para pruebas aisladas.
// Ejemplo: DB_PATH=./test/fixtures/test-db.json node server.js
const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, '..', 'data', 'db.json');

function load() {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const data = JSON.parse(raw);
  require('./institution-catalog').applyCatalog(data);
  // Compatibilidad con datos existentes que no tienen estas colecciones todavia.
  if (!Array.isArray(data.ratings)) data.ratings = [];
  if (!Array.isArray(data.reports)) data.reports = [];
  if (!Array.isArray(data.documents)) data.documents = [];
  if (!Array.isArray(data.logs)) data.logs = [];
  if (!Array.isArray(data.auditOutbox)) data.auditOutbox = [];
  if (!Array.isArray(data.periods)) data.periods = [];
  if (!Array.isArray(data.emailLog)) data.emailLog = [];
  if (!Array.isArray(data.emailOutbox)) data.emailOutbox = [];
  if (!Array.isArray(data.notifications)) data.notifications = [];
  if (!Array.isArray(data.recoveryRequests)) data.recoveryRequests = [];
  // HU066: preferencia de notificaciones por correo (por defecto activada,
  // para no cambiar el comportamiento de los usuarios ya existentes).
  if (Array.isArray(data.users)) {
    for (const u of data.users) {
      if (u.notifyByEmail === undefined) u.notifyByEmail = true;
    }
  }
  // HU021: coordenadas aproximadas (por provincia) para instituciones que
  // todavia no las tienen, para poder filtrar/ordenar por cercanía.
  if (Array.isArray(data.institutions)) {
    for (const inst of data.institutions) {
      if (typeof inst.lat !== 'number' || typeof inst.lng !== 'number') {
        const seedIndex = (parseInt(String(inst.id).replace('i', ''), 10) || 1) - 1;
        const { lat, lng } = coordsForInstitution(inst, seedIndex);
        inst.lat = lat;
        inst.lng = lng;
      }
    }
  }
  return data;
}

function save(data) {
  // Queue and business changes share the atomic commit; external audit writes happen later.
  const before=fs.existsSync(DB_PATH)?JSON.parse(fs.readFileSync(DB_PATH,'utf8')):{};
  require('./institution-catalog').applyCatalog(before);
  for (const inst of before.institutions || []) {
    if (typeof inst.lat !== 'number' || typeof inst.lng !== 'number') Object.assign(inst, coordsForInstitution(inst, (parseInt(String(inst.id).replace('i',''),10)||1)-1));
  }
  require('./audit').captureChanges(before,data);
  const temporary = DB_PATH + '.' + require('crypto').randomUUID() + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temporary, DB_PATH);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function nextId(list, prefix) {
  let max = 0;
  for (const item of list) {
    const n = parseInt(String(item.id).replace(prefix, ''), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(3, '0');
}

module.exports = { load, save, nextId, DB_PATH };
