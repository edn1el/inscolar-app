// Logos y portadas ilustradas de las instituciones de la demo (diseños originales,
// no son los logos reales de ninguna escuela). Al arrancar el servidor se asignan a las
// instituciones que todavía no tienen logo o portada (o cuyo archivo ya no existe).
// Nunca reemplaza una imagen subida por un usuario.
//
// Para quitarlos: definir DEMO_ASSETS=off en el entorno, o borrar la carpeta demo-assets/.
const fs = require('fs');
const path = require('path');
const { load, save } = require('./db');

const SRC_DIR = path.join(__dirname, '..', 'demo-assets', 'instituciones');
const DEST_DIR = path.join(__dirname, '..', 'data', 'uploads', 'instituciones');

function archivoExiste(meta) {
  return meta && meta.storageFile && fs.existsSync(path.join(DEST_DIR, meta.storageFile));
}

function asignarImagenesDemo() {
  if (process.env.DEMO_ASSETS === 'off' || !fs.existsSync(SRC_DIR)) return 0;
  if (!fs.existsSync(DEST_DIR)) fs.mkdirSync(DEST_DIR, { recursive: true });
  const db = load();
  let cambios = 0;
  for (const inst of db.institutions || []) {
    for (const [campo, archivo, mime] of [['logo', `${inst.id}-logo.png`, 'image/png'], ['fondo', `${inst.id}-portada.jpg`, 'image/jpeg']]) {
      if (archivoExiste(inst[campo])) continue;
      const src = path.join(SRC_DIR, archivo);
      if (!fs.existsSync(src)) continue;
      const storageFile = `demo-${archivo}`;
      fs.copyFileSync(src, path.join(DEST_DIR, storageFile));
      inst[campo] = { storageFile, mimeType: mime, uploadedAt: new Date().toISOString(), demo: true };
      cambios++;
    }
  }
  if (cambios) save(db);
  return cambios;
}

module.exports = { asignarImagenesDemo };
