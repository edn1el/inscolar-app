const express = require('express');
const { save } = require('../lib/db');
const { requireAuth, requireAdmin } = require('../lib/middleware');
const { logEvent } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

// Notifications are scoped to the authenticated recipient; broadcast reads are per-user.
const notifications=require('../lib/notify');
router.get('/notifications', (req,res)=>{
 const page=req.query.page===undefined?null:Number(req.query.page),limit=Number(req.query.limit||20);
 if((page!==null&&(!Number.isInteger(page)||page<1))||!Number.isInteger(limit)||limit<1||limit>100)return res.status(400).json({error:'Paginación inválida.'});
 res.json(notifications.list(req.db,req.currentUser,{page,limit}));
});
router.post('/notifications/:id/read',(req,res)=>{
 try{if(notifications.markRead(req.db,req.currentUser,req.params.id)){const n=req.db.notifications.find(n=>n.id===req.params.id);if(!n.recipientId||n.type==='accounts')logEvent(req.db,{actor:req.currentUser,accion:'Notificación importante leída',entidad:'Notificación',entidadId:n.id,detalle:n.campo});save(req.db);}res.json({status:'ok',unreadCount:notifications.list(req.db,req.currentUser).unreadCount});}
 catch(e){res.status(e.status||500).json({error:e.status?e.message:'No se pudo guardar la lectura. Intenta de nuevo.'});}
});
router.get('/notifications/:id/target',(req,res)=>{
 const n=req.db.notifications.find(n=>n.id===req.params.id);
 if(!n)return res.status(404).json({error:'Notificación no disponible.'});
 if(!notifications.canRead(req.currentUser,n))return res.status(403).json({error:'Aviso fuera de tu ámbito.'});
 const url=notifications.link(n),appointment=url?.startsWith('#/app/citas/');
 if(n.resourceKind==='draft'){const d=req.db.drafts?.find(d=>d.id===n.entityId);if(!d)return res.status(404).json({error:'Borrador no disponible.'});if(d.tutorId!==req.currentUser.id)return res.status(403).json({error:'Ya no tienes acceso a este recurso.'});return res.json({url});}
 const resource=(appointment?req.db.appointments:req.db.enrollments).find(e=>e.id===n.entityId);
 const service=require(appointment?'../lib/appointment-service':'../lib/enrollment-service');
 if(!url||!resource)return res.status(404).json({error:'El recurso de esta notificación ya no está disponible.'});
 if(!(appointment?service.read:service.canRead)(req.currentUser,resource))return res.status(403).json({error:'Ya no tienes acceso a este recurso.'});
 res.json({url});
});

// ---- correos (HU062/HU094): visibilidad de los envios (reales o simulados) ----
router.get('/emails', requireAdmin, (req, res) => {
  const db = req.db;
  const list = db.emailLog.slice().sort((a, b) => new Date(b.sentAt) - new Date(a.sentAt));
  res.json({ total: list.length, emails: list.slice(0, 50) });
});

// ---- analíticas ----
router.get('/analytics/summary', requireAdmin, (req, res) => {
  const db = req.db;
  const users = db.users;
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const porRol = {};
  for (const u of users) porRol[u.role] = (porRol[u.role] || 0) + 1;

  const porProvincia = {};
  for (const inst of db.institutions) porProvincia[inst.provincia] = (porProvincia[inst.provincia] || 0) + 1;

  const activos = users.filter((u) => u.estado === 'Activo').length;
  const nuevosEstaSemana = users.filter((u) => new Date(u.createdAt).getTime() >= weekAgo).length;
  const tutores = users.filter((u) => u.role === 'Tutor').length;
  const mfaActivo = users.filter((u) => u.mfaEnabled).length;

  // HU070: usuarios registrados por año
  const porAnio = {};
  for (const u of users) {
    const y = new Date(u.createdAt).getFullYear();
    porAnio[y] = (porAnio[y] || 0) + 1;
  }

  // HU071: tasa de recuperación de contraseña (sobre los tokens de reseteo vigentes en este momento;
  // se sobrescriben por usuario en cada nueva solicitud, asi que es una foto del estado actual, no un historico acumulado)
  const totalResets = db.resetTokens.length;
  const resetsUsados = db.resetTokens.filter((t) => t.used).length;
  const tasaRecuperacion = totalResets ? Math.round((resetsUsados / totalResets) * 100) : 0;

  // HU072: distribución geográfica de usuarios. El único rol con una ubicación propia es
  // "Personal de institución" (vía la institución a la que está vinculado); los demás roles
  // no tienen una provincia asociada en el modelo de datos actual.
  const usuariosPorProvincia = {};
  for (const u of users) {
    if (u.role !== 'Personal de institución' || !u.institucionId) continue;
    const inst = db.institutions.find((i) => i.id === u.institucionId);
    if (!inst) continue;
    usuariosPorProvincia[inst.provincia] = (usuariosPorProvincia[inst.provincia] || 0) + 1;
  }

  // HU076-HU079: calificaciones y reportes de instituciones
  const totalCalificaciones = db.ratings.length;
  const promedioCalificaciones = totalCalificaciones
    ? Math.round((db.ratings.reduce((sum, r) => sum + r.estrellas, 0) / totalCalificaciones) * 10) / 10
    : null;
  const totalReportes = db.reports.length;
  const reportesPorMotivo = {};
  for (const r of db.reports) reportesPorMotivo[r.motivo] = (reportesPorMotivo[r.motivo] || 0) + 1;
  const institucionesMejorCalificadas = db.institutions
    .map((inst) => {
      const ratings = db.ratings.filter((r) => r.institucionId === inst.id);
      if (!ratings.length) return null;
      const promedio = ratings.reduce((sum, r) => sum + r.estrellas, 0) / ratings.length;
      return { nombre: inst.nombre, promedio: Math.round(promedio * 10) / 10, total: ratings.length };
    })
    .filter(Boolean)
    .sort((a, b) => b.promedio - a.promedio)
    .slice(0, 5);

  // HU080-HU084: solicitudes de inscripción
  const inscripciones = {
    total: db.enrollments.length,
    aprobadas: db.enrollments.filter((e) => ['Aprobada','Aceptada'].includes(e.estado)).length,
    rechazadas: db.enrollments.filter((e) => e.estado === 'Rechazada').length,
    pendientes: db.enrollments.filter((e) => ['Pendiente', 'Enviada', 'En revisión', 'Documentos pendientes'].includes(e.estado)).length,
    abandonadas: db.enrollments.filter((e) => e.estado === 'Abandonada').length,
  };

  // HU085-HU088: documentos
  const documentos = {
    total: db.documents.length,
    aceptados: db.documents.filter((d) => d.estado === 'Aceptado').length,
    rechazados: db.documents.filter((d) => d.estado === 'Rechazado').length,
    pendientes: db.documents.filter((d) => d.estado === 'Pendiente').length,
  };

  // HU089-HU093: citas
  const citas = {
    total: db.appointments.length,
    confirmadas: db.appointments.filter((a) => ['Confirmada','Aceptada'].includes(a.estado)).length,
    canceladas: db.appointments.filter((a) => a.estado === 'Cancelada').length,
    pendientes: db.appointments.filter((a) => a.estado === 'Pendiente').length,
    rechazadas: db.appointments.filter((a) => a.estado === 'Rechazada').length,
  };
  const citasPorInstitucionMap = {};
  for (const a of db.appointments) {
    const inst = db.institutions.find((i) => i.id === a.institucionId);
    const nombre = inst ? inst.nombre : a.institucionId;
    citasPorInstitucionMap[nombre] = (citasPorInstitucionMap[nombre] || 0) + 1;
  }
  const citasPorInstitucion = Object.entries(citasPorInstitucionMap)
    .map(([nombre, count]) => ({ nombre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // HU094: total de correos enviados (reales via SMTP si esta configurado, o simulados si no) — ver lib/mailer.js.
  const totalCorreosEnviados = db.emailLog.length;

  // HU095: notificaciones leídas
  const totalNotificaciones = db.notifications.length;
  const notificacionesLeidas = db.notifications.filter((n) => n.read).length;

  res.json({
    totalUsuarios: users.length,
    activos,
    inactivos: users.length - activos,
    nuevosEstaSemana,
    tutores,
    mfaActivo,
    totalInstituciones: db.institutions.length,
    porRol: Object.entries(porRol).map(([role, count]) => ({ role, count })),
    porProvincia: Object.entries(porProvincia)
      .map(([provincia, count]) => ({ provincia, count }))
      .sort((a, b) => b.count - a.count),
    porAnio: Object.entries(porAnio)
      .map(([anio, count]) => ({ anio: Number(anio), count }))
      .sort((a, b) => a.anio - b.anio),
    tasaRecuperacion,
    totalResetsGenerados: totalResets,
    totalResetsUsados: resetsUsados,
    usuariosPorProvincia: Object.entries(usuariosPorProvincia)
      .map(([provincia, count]) => ({ provincia, count }))
      .sort((a, b) => b.count - a.count),
    totalCalificaciones,
    promedioCalificaciones,
    totalReportes,
    reportesPorMotivo: Object.entries(reportesPorMotivo)
      .map(([motivo, count]) => ({ motivo, count }))
      .sort((a, b) => b.count - a.count),
    institucionesMejorCalificadas,
    inscripciones,
    documentos,
    citas,
    citasPorInstitucion,
    totalCorreosEnviados,
    totalNotificaciones,
    notificacionesLeidas,
    actividadReciente: db.notifications
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5),
  });
});

module.exports = router;
