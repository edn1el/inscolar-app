const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function load() {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const data = JSON.parse(raw);
  // Compatibilidad con datos existentes que no tienen estas colecciones todavia.
  if (!Array.isArray(data.ratings)) data.ratings = [];
  if (!Array.isArray(data.reports)) data.reports = [];
  return data;
}

function save(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
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
