// Arranca una copia LOCAL de Inscolar sin ningún Administrador, para mostrar la
// configuración inicial del primer administrador (HU001). No toca data/db.json:
// trabaja sobre data/demo-primer-admin.json, que se recrea cada vez.
//
//   npm run demo:primer-admin      →  http://localhost:3001
const fs = require('fs');
const path = require('path');

const origen = path.join(__dirname, '..', 'data', 'db.json');
const destino = path.join(__dirname, '..', 'data', 'demo-primer-admin.json');

const db = JSON.parse(fs.readFileSync(origen, 'utf8'));
db.users = db.users.filter((u) => u.role !== 'Administrador');
fs.writeFileSync(destino, JSON.stringify(db, null, 2));

process.env.DB_PATH = destino;
process.env.PORT = process.env.PORT || '3001';
process.env.DEMO_ASSETS = process.env.DEMO_ASSETS || 'off';
console.log('Copia sin administradores lista. Abre http://localhost:' + process.env.PORT + ' para ver la configuración inicial (HU001).');
require('../server.js');
