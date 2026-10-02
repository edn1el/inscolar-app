const express = require('express');
const { save, nextId } = require('../lib/db');
const { requireAuth } = require('../lib/middleware');

const router = express.Router();
router.use(requireAuth);

const ADMIN_ROLES = ['Administrador', 'Soporte'];
// Admin/Soporte ven todo; el personal de institución ve las calificaciones y los reportes
// de SU institución (el expediente es visible para el autor y el personal autorizado).
// El tutor solo ve lo que él mismo escribió.
function puedeVerTodoDeLaInstitucion(u, institucionId) {
  return ADMIN_ROLES.includes(u.role) || (u.role === 'Personal de institución' && u.institucionId === institucionId);
}

const MOTIVOS_REPORTE = ['Trato inadecuado', 'Información incorrecta', 'Cobros indebidos', 'Otro'];

// Un tutor solo puede calificar/reportar una institucion con la que haya tenido
// una relacion real: una inscripcion aprobada o una cita confirmada.
function tutorTuvoRelacion(db, tutorId, institucionId) {
  const enrollOk = db.enrollments.some((e) => e.tutorId === tutorId && e.institucionId === institucionId && e.estado === 'Aprobada');
  if (enrollOk) return true;
  return db.appointments.some((a) => a.tutorId === tutorId && a.institucionId === institucionId && a.estado === 'Confirmada');
}

function publicRating(r) {
  return { id: r.id, institucionId: r.institucionId, tutorId: r.tutorId, tutorNombre: r.tutorNombre, estrellas: r.estrellas, comentario: r.comentario, createdAt: r.createdAt, updatedAt: r.updatedAt || null };
}

function publicReport(rp) {
  return { id: rp.id, institucionId: rp.institucionId, tutorId: rp.tutorId, tutorNombre: rp.tutorNombre, motivo: rp.motivo, descripcion: rp.descripcion, estado: rp.estado, createdAt: rp.createdAt };
}

// ---- calificaciones ----
router.get('/institutions/:id/ratings', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });

  let list = db.ratings.filter((r) => r.institucionId === institucion.id);
  if (!puedeVerTodoDeLaInstitucion(u, institucion.id)) {
    list = list.filter((r) => r.tutorId === u.id);
  }
  list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const promedio = list.length ? list.reduce((s, r) => s + r.estrellas, 0) / list.length : null;
  res.json({ ratings: list.map(publicRating), total: list.length, promedio });
});

router.post('/institutions/:id/ratings', (req, res) => {
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
    // PENDIENTE (Auditoría): Registrar evento 'EdicionCalificacionInstitucion' (Audit.NET no integrado)
    // Datos sugeridos: { usuarioId: u.id, institucionId: institucion.id, calificacionPrevia: oldEstrellas, nuevaCalificacion: n }
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
    // PENDIENTE (Auditoría): Registrar evento 'CreacionCalificacionInstitucion' (Audit.NET no integrado)
    // Datos sugeridos: { usuarioId: u.id, institucionId: institucion.id, calificacion: n }
  }
  save(db);
  res.json({ rating: publicRating(rating) });
});

// ---- reportes ----
router.get('/institutions/:id/reports', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });

  let list = db.reports.filter((rp) => rp.institucionId === institucion.id);
  if (!puedeVerTodoDeLaInstitucion(u, institucion.id)) {
    list = list.filter((rp) => rp.tutorId === u.id);
  }
  list = list.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ reports: list.map(publicReport), total: list.length, motivos: MOTIVOS_REPORTE });
});

router.post('/institutions/:id/reports', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo un tutor puede reportar una institución.' });
  const institucion = db.institutions.find((i) => i.id === req.params.id);
  if (!institucion) return res.status(404).json({ error: 'Institución no encontrada.' });
  if (!tutorTuvoRelacion(db, u.id, institucion.id)) {
    return res.status(403).json({ error: 'Solo puedes reportar instituciones con las que hayas tenido una inscripción aprobada o una cita confirmada.' });
  }

  const { motivo, descripcion } = req.body || {};
  const errors = [];
  if (!MOTIVOS_REPORTE.includes(motivo)) errors.push('Selecciona un motivo válido.');
  if (!descripcion || !descripcion.trim()) errors.push('Describe brevemente el problema.');
  else if (descripcion.length > 800) errors.push('La descripción no puede tener más de 800 caracteres.');
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
  };
  db.reports.push(report);
  save(db);
  res.json({ report: publicReport(report) });
});

module.exports = router;
