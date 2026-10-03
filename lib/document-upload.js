// Subida de documentos de inscripción: mismas reglas al iniciar la solicitud (HU046)
// y al subir documentos después (HU047).
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

// Los archivos con formato no permitido se descartan (no llegan a req.file/req.files);
// cada ruta decide qué error mostrar cuando falta un archivo esperado.
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE, files: 10 },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_MIME.includes(file.mimetype)),
});

function borrarArchivos(files) {
  for (const f of [].concat(files || [])) if (f && f.path) fs.unlink(f.path, () => {});
}

function mensajeError(err) {
  if (err && err.code === 'LIMIT_FILE_SIZE') return 'Cada archivo puede pesar como máximo 5 MB.';
  if (err && err.code === 'LIMIT_FILE_COUNT') return 'Puedes adjuntar como máximo 10 archivos.';
  return 'No se pudo subir el archivo.';
}

module.exports = { upload, UPLOADS_DIR, MAX_SIZE, ALLOWED_MIME, borrarArchivos, mensajeError };
