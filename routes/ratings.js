const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { save, nextId } = require('../lib/db');
const { requireAuth, optionalAuth } = require('../lib/middleware');
const { logEvent } = require('../lib/audit');

const router = express.Router();

const MODERATOR_ROLES = ['Administrador', 'Moderador'];
const MOTIVOS_REPORTE = [
  'Información incorrecta',
  'Información desactualizada',
  'Institución inexistente',
  'Ubicación incorrecta',
  'Contenido inapropiado',
  'Incumplimiento de información publicada',
  'Otro'
];

// ---- Configuración de evidencias ----
const EVIDENCE_DIR = path.join(__dirname, '..', 'data', 'uploads', 'evidencia');
if (!fs.existsSync(EVIDENCE_DIR)) fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

const EVIDENCE_MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const EVIDENCE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'application/pdf'];

const evidenceStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, EVIDENCE_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 6).replace(/[^a-zA-Z0-9.]/g, '') || '.jpg';
    cb(null, `ev-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  }
});

const uploadEvidence = multer({
  storage: evidenceStorage,
  limits: { fileSize: EVIDENCE_MAX_SIZE },
  fileFilter: (req, file, cb) => cb(null, EVIDENCE_ALLOWED_MIME.includes(file.mimetype)),
}).single('evidencia');

function handleUploadEvidence(req, res, next) {
  uploadEvidence(req, res, (err) => {
    if (err instanceof multer.MulterError || err) {
      return res.status(400).json({ errors: ['Error al subir evidencia. Asegúrate de que sea JPG/PNG/PDF y no supere 10 MB.'] });
    }
    next();
  });
}

// ---- Helpers ----
function tutorTuvoRelacion(db, tutorId, institucionId) {
  const enrollOk = db.enrollments.some((e) => e.tutorId === tutorId && e.institucionId === institucionId && ['Aprobada','Aceptada'].includes(e.estado));
  if (enrollOk) return true;
  return db.appointments.some((a) => a.tutorId === tutorId && a.institucionId === institucionId && a.estado === 'Confirmada');
}

function publicRating(r) {
  return { id: r.id, institucionId: r.institucionId, tutorId: r.tutorId, tutorNombre: r.tutorNombre, estrellas: r.estrellas, comentario: r.comentario, createdAt: r.createdAt, updatedAt: r.updatedAt || null };
}

// Devuelve el reporte dependiendo de si se requiere la versión depurada o la completa.
function formatReport(rp, isPublic) {
  if (isPublic) {
    // Versión depurada: se podría censurar descripción y evitar enviar datos personales de tutor.
    return {
      id: rp.id,
      institucionId: rp.institucionId,
      tutorNombre: rp.tutorNombre, // (o censurado)
      motivo: rp.motivo,
      descripcion: rp.descripcion,
      estado: rp.estado,
      createdAt: rp.createdAt,
      hasEvidencia: !!rp.evidencia
    };
  }
  // Versión privada original para autor o moderador
  return {
    id: rp.id,
    institucionId: rp.institucionId,
    tutorId: rp.tutorId,
    tutorNombre: rp.tutorNombre,
    motivo: rp.motivo,
    descripcion: rp.descripcion,
    estado: rp.estado,
    createdAt: rp.createdAt,
    evidenciaOriginal: rp.evidencia || null
  };
}


// ---- Calificaciones ----
router.get('/institutions/:id/ratings', optionalAuth, (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });

  let list = db.ratings.filter((r) => r.institucionId === institucion.id);
  // Si no está autenticado, solo puede ver las calificaciones; si lo está, puede que las de él se resalten (opcional). 
  // No hay moderación de calificaciones según requerimiento anterior, se muestran todas.
  list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const promedio = list.length ? list.reduce((s, r) => s + r.estrellas, 0) / list.length : null;
  res.json({ ratings: list.map(publicRating), total: list.length, promedio });
});

router.post('/institutions/:id/ratings', requireAuth, (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo un tutor puede calificar una institución.' });
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });
  if (!tutorTuvoRelacion(db, u.id, institucion.id)) {
    return res.status(403).json({ error: 'Solo puedes calificar instituciones con las que hayas tenido una inscripción aprobada o una cita confirmada.' });
  }

  const { estrellas, comentario } = req.body || {};
  const n = Number(estrellas);
  const errors = [];
  if (!Number.isInteger(n) || n < 1 || n > 5) errors.push('Selecciona una calificación de 1 a 5 estrellas.');
  if (comentario && String(comentario).length > 500) errors.push('El comentario no puede tener más de 500 caracteres.');
  if (errors.length) return res.status(400).json({ errors });

  let rating = db.ratings.find((r) => r.institucionId === institucion.id && r.tutorId === u.id);
  if (rating) {
    rating.estrellas = n;
    rating.comentario = (comentario || '').trim();
    rating.updatedAt = new Date().toISOString();
  } else {
    rating = {
      id: nextId(db.ratings, 'r'),
      institucionId: institucion.id,
      tutorId: u.id,
      tutorNombre: u.nombre,
      estrellas: n,
      comentario: (comentario || '').trim(),
      createdAt: new Date().toISOString(),
      updatedAt: null,
    };
    db.ratings.push(rating);
  }
  save(db);
  res.json({ rating: publicRating(rating) });
});


// ---- Reportes ----
router.get('/institutions/:id/reports', optionalAuth, (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });

  let allReports = db.reports.filter((rp) => rp.institucionId === institucion.id);
  allReports = allReports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  let result = [];
  
  allReports.forEach(rp => {
    if (!u) {
      // Usuario público
      if (rp.estado === 'Publicado') result.push(formatReport(rp, true));
    } else {
      // Usuario logueado
      if (MODERATOR_ROLES.includes(u.role)) {
        // Moderador ve todos, versión original
        result.push(formatReport(rp, false));
      } else if (u.role === 'Tutor') {
        if (rp.tutorId === u.id) {
          // Autor ve su reporte completo
          result.push(formatReport(rp, false));
        } else if (rp.estado === 'Publicado') {
          // Tutor ve otros reportes pero solo los publicados y depurados
          result.push(formatReport(rp, true));
        }
      } else {
        // Otro rol (Soporte sin moderador, Personal, etc)
        if (rp.estado === 'Publicado') result.push(formatReport(rp, true));
      }
    }
  });

  res.json({ reports: result, total: result.length, motivos: MOTIVOS_REPORTE });
});

router.post('/institutions/:id/reports', requireAuth, handleUploadEvidence, (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo un tutor puede reportar una institución.' });
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });
  if (!tutorTuvoRelacion(db, u.id, institucion.id)) {
    return res.status(403).json({ error: 'Solo puedes reportar instituciones con las que hayas tenido una inscripción aprobada o una cita confirmada.' });
  }

  // Prevenir envío duplicado por el mismo tutor y mismo motivo reciente
  const recentDuplicate = db.reports.find(r => r.institucionId === institucion.id && r.tutorId === u.id && r.motivo === req.body.motivo && (Date.now() - new Date(r.createdAt).getTime() < 60000));
  if (recentDuplicate) return res.status(400).json({ errors: ['Ya has enviado un reporte similar hace unos momentos.'] });

  const { motivo, descripcion } = req.body || {};
  const errors = [];
  if (!MOTIVOS_REPORTE.includes(motivo)) errors.push('Selecciona un motivo válido.');
  if (!descripcion || !descripcion.trim()) errors.push('Describe brevemente el problema (mínimo 10 caracteres).');
  else if (descripcion.length < 10 || descripcion.length > 1000) errors.push('La descripción debe tener entre 10 y 1000 caracteres.');
  
  if (errors.length) return res.status(400).json({ errors });

  const report = {
    id: nextId(db.reports, 'rp'),
    institucionId: institucion.id,
    tutorId: u.id,
    tutorNombre: u.nombre,
    motivo,
    descripcion: descripcion.trim(),
    estado: 'Pendiente',
    createdAt: new Date().toISOString(),
    evidencia: req.file ? req.file.filename : null,
  };
  
  db.reports.push(report);
  save(db);
  
  logEvent(db, {
    actor: u,
    accion: 'Reporte enviado',
    entidad: 'Reporte',
    entidadId: report.id,
    detalle: `Reporte a institución ${institucion.id}`
  });

  res.json({ report: formatReport(report, false) });
});

// ---- Endpoint para ver evidencia del reporte ----
router.get('/reports/:id/evidence', optionalAuth, (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const rp = db.reports.find(r => r.id === req.params.id);
  
  if (!rp || !rp.evidencia) return res.status(404).send('Evidencia no encontrada.');

  // Control de acceso: SOLO autor o moderador pueden ver evidencia
  let canView = false;
  if (u) {
    if (rp.tutorId === u.id || MODERATOR_ROLES.includes(u.role)) {
      canView = true;
    }
  }

  if (!canView) return res.status(403).send('No tienes permiso para ver este archivo original.');

  const file = path.join(EVIDENCE_DIR, rp.evidencia);
  if (!fs.existsSync(file)) return res.status(404).send('Archivo no encontrado.');
  res.sendFile(file);
});

// Moderación: Publicar o Retirar
router.put('/reports/:id/estado', requireAuth, (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  
  if (!MODERATOR_ROLES.includes(u.role)) return res.status(403).json({ error: 'Solo un Moderador puede realizar esta acción.' });
  
  const rp = db.reports.find(r => r.id === req.params.id);
  if (!rp) return res.status(404).json({ error: 'Reporte no encontrado.' });
  
  const { estado } = req.body;
  if (!['Publicado', 'Retirado', 'Pendiente'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido.' });
  }

  rp.estado = estado;
  save(db);
  
  logEvent(db, {
    actor: u,
    accion: 'Reporte moderado',
    entidad: 'Reporte',
    entidadId: rp.id,
    detalle: `Estado cambiado a ${estado}`
  });

  res.json({ report: formatReport(rp, false) });
});

module.exports = router;
