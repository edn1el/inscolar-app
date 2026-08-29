const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { save, nextId } = require('../lib/db');
const { requireAuth } = require('../lib/middleware');
const { notifyUser } = require('../lib/notify');

const router = express.Router();
router.use(requireAuth);

const STAFF_ROLES = ['Administrador', 'Soporte'];
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
const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => cb(null, ALLOWED_MIME.includes(file.mimetype)),
});

function canSeeEnrollment(db, u, enrollment) {
  if (STAFF_ROLES.includes(u.role)) return true;
  if (u.role === 'Tutor') return enrollment.tutorId === u.id;
  if (u.role === 'Personal de institución') return u.institucionId === enrollment.institucionId;
  return false;
}

function publicDocument(d) {
  return {
    id: d.id,
    enrollmentId: d.enrollmentId,
    nombreArchivo: d.nombreArchivo,
    mimeType: d.mimeType,
    size: d.size,
    estado: d.estado,
    motivoRechazo: d.motivoRechazo || '',
    uploadedAt: d.uploadedAt,
    decidedAt: d.decidedAt,
  };
}

// ---- listar documentos de una inscripcion ----
router.get('/enrollments/:id/documents', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const enrollment = db.enrollments.find((e) => e.id === req.params.id);
  if (!enrollment) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (!canSeeEnrollment(db, u, enrollment)) return res.status(403).json({ error: 'No tienes permiso para ver estos documentos.' });

  const list = db.documents
    .filter((d) => d.enrollmentId === enrollment.id)
    .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  res.json({ documents: list.map(publicDocument) });
});

// ---- subir un documento (solo el tutor duenio de la inscripcion) ----
router.post('/enrollments/:id/documents', (req, res, next) => {
  upload.single('archivo')(req, res, (err) => {
    if (err instanceof multer.MulterError || err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo no puede pesar más de 5 MB.' : 'No se pudo subir el archivo.';
      return res.status(400).json({ errors: [msg] });
    }
    next();
  });
}, (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const enrollment = db.enrollments.find((e) => e.id === req.params.id);
  if (!enrollment) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Solicitud no encontrada.' });
  }
  if (enrollment.tutorId !== u.id) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(403).json({ error: 'Solo el tutor de esta solicitud puede subir documentos.' });
  }
  if (!req.file) {
    return res.status(400).json({ errors: ['Selecciona un archivo PDF, JPG o PNG de hasta 5 MB.'] });
  }

  const { tipoDocumento } = req.body || {};
  const document = {
    id: nextId(db.documents, 'd'),
    enrollmentId: enrollment.id,
    institucionId: enrollment.institucionId,
    tutorId: enrollment.tutorId,
    tipoDocumento: (tipoDocumento || 'Documento').trim(),
    nombreArchivo: req.file.originalname,
    storageFile: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    estado: 'Pendiente',
    motivoRechazo: '',
    uploadedAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  db.documents.push(document);
  save(db);
  res.json({ document: publicDocument(document) });
});

// ---- descargar/ver el archivo de un documento ----
router.get('/documents/:id/file', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const document = db.documents.find((d) => d.id === req.params.id);
  if (!document) return res.status(404).json({ error: 'Documento no encontrado.' });
  const enrollment = db.enrollments.find((e) => e.id === document.enrollmentId);
  if (!enrollment || !canSeeEnrollment(db, u, enrollment)) return res.status(403).json({ error: 'No tienes permiso para ver este documento.' });

  const filePath = path.join(UPLOADS_DIR, document.storageFile);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'El archivo ya no está disponible.' });
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Disposition', `inline; filename="${document.nombreArchivo.replace(/"/g, '')}"`);
  fs.createReadStream(filePath).pipe(res);
});

// ---- aceptar / rechazar un documento (personal de la institucion o admin/soporte) ----
router.post('/documents/:id/decidir', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const document = db.documents.find((d) => d.id === req.params.id);
  if (!document) return res.status(404).json({ error: 'Documento no encontrado.' });
  const enrollment = db.enrollments.find((e) => e.id === document.enrollmentId);
  if (!enrollment) return res.status(404).json({ error: 'Solicitud no encontrada.' });

  const canDecide = STAFF_ROLES.includes(u.role) || (u.role === 'Personal de institución' && u.institucionId === enrollment.institucionId);
  if (!canDecide) return res.status(403).json({ error: 'No tienes permiso para decidir sobre este documento.' });
  if (document.estado !== 'Pendiente') return res.status(400).json({ error: 'Este documento ya fue decidido.' });

  const { estado, motivo } = req.body || {};
  if (!['Aceptado', 'Rechazado'].includes(estado)) return res.status(400).json({ error: 'Decisión inválida.' });
  if (estado === 'Rechazado' && (!motivo || !motivo.trim())) return res.status(400).json({ error: 'Indica el motivo del rechazo.' });

  document.estado = estado;
  document.motivoRechazo = estado === 'Rechazado' ? motivo.trim() : '';
  document.decidedAt = new Date().toISOString();
  document.decidedBy = u.id;

  const tutor = db.users.find((t) => t.id === document.tutorId);
  if (tutor) {
    notifyUser(db, {
      recipient: tutor,
      campo: 'Estado de documento',
      anterior: 'Pendiente',
      nuevo: estado,
      actor: u,
      userNombre: document.tipoDocumento || document.nombreArchivo,
    });
  }

  save(db);
  res.json({ document: publicDocument(document) });
});

module.exports = router;
