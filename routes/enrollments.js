const express = require('express');
const { load, save, nextId } = require('../lib/db');
const { requireAuth } = require('../lib/middleware');
const { logEvent } = require('../lib/audit');
const { findPeriod, withinRange } = require('../lib/periods');

const router = express.Router();
router.use(requireAuth);

const service = require('../lib/enrollment-service');
const { GRADOS } = service;
const updates = require('../lib/enrollment-updates');
const CICLO_RE = /^\d{4}-\d{4}$/;
const STAFF_ROLES = ['Administrador', 'Soporte'];
function publicEnrollment(e, db, u) { return service.dto(e, db, u); }


// ---- borradores de inscripcion (F5.2) ----

// La expiración la determina el servidor, sin parámetros públicos de prueba.
const DRAFT_EXPIRE_MINS = 20;

function sweepExpiredDrafts(db) {
  if (!db.drafts) db.drafts = [];
  const now = Date.now();
  let changed = false;
  for (const d of db.drafts) {
    if (!d.estado && d.expiresAt <= now) {
      d.estado = 'Abandonada';
      service.releaseDraftReservations(db,d);
      logEvent(db, { actor: null, accion: 'Borrador abandonado por inactividad', entidad: 'Borrador', entidadId: d.id });
      changed = true;
    }
  }
  if (changed) save(db);
}

router.post('/drafts', (req, res) => {
  const db = req.db;
  sweepExpiredDrafts(db);
  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo tutores pueden crear borradores.' });
  
  const testMinutes = DRAFT_EXPIRE_MINS;
  const draft = {
    id: nextId(db.drafts || [], 'd'),
    tutorId: u.id,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    expiresAt: Date.now() + (testMinutes * 60 * 1000),
    data: req.body || {}
  };
  
  if (!db.drafts) db.drafts = [];
  db.drafts.push(draft);
  save(db);
  res.json({ draft });
});

router.get('/drafts/:id', (req, res) => {
  const db = req.db;
  sweepExpiredDrafts(db);
  const u = req.currentUser;
  const draft = (db.drafts || []).find(d => d.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'Borrador expirado o inexistente.' });
  if (draft.tutorId !== u.id) return res.status(403).json({ error: 'No autorizado.' });
  if (draft.estado) return res.status(410).json({ error: 'Borrador expirado o finalizado.' });
  
  res.json({ draft, timeRemaining: draft.expiresAt - Date.now() });
});

router.put('/drafts/:id', (req, res) => {
  const db = req.db;
  sweepExpiredDrafts(db);
  const u = req.currentUser;
  const draft = (db.drafts || []).find(d => d.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'Borrador expirado o inexistente.' });
  if (draft.tutorId !== u.id) return res.status(403).json({ error: 'No autorizado.' });
  if (draft.estado) return res.status(410).json({ error: 'Borrador expirado o finalizado.' });
  
  const testMinutes = DRAFT_EXPIRE_MINS;
  
  // Registrar actividad
  draft.lastActivity = Date.now();
  draft.expiresAt = Date.now() + (testMinutes * 60 * 1000);
  
  // Guardar datos si vienen en el body
  if (req.body && Object.keys(req.body).length > 0) {
    draft.data = { ...draft.data, ...req.body };
  }
  
  save(db);
  res.json({ draft, timeRemaining: draft.expiresAt - Date.now() });
});

router.delete('/drafts/:id', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  const draft = (db.drafts || []).find(d => d.id === req.params.id);
  if (!draft) return res.status(404).json({ error: 'Borrador expirado o inexistente.' });
  if (draft.tutorId !== u.id) return res.status(403).json({ error: 'No autorizado.' });
  if (draft.estado) return res.status(410).json({ error: 'Borrador expirado o finalizado.' });
  
  // Borrar
  draft.estado = 'Abandonada';
  service.releaseDraftReservations(db,draft);
  save(db);
  res.json({ status: 'ok' });
});


// ---- estudiantes (hijos/as del tutor) ----
router.get('/students', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  let list = db.students;
  if (u.role === 'Tutor') list = list.filter((s) => s.tutorId === u.id);
  else if (!STAFF_ROLES.includes(u.role)) list = [];
  res.json({ students: list });
});

router.post('/students', (req, res) => {
  const db = req.db;
  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo un tutor puede registrar estudiantes.' });
  const { nombre, fechaNacimiento, documento } = req.body || {};
  const errors = [];
  if (!nombre || nombre.trim().length < 3) errors.push('El nombre del estudiante es obligatorio.');
  if (!fechaNacimiento || isNaN(new Date(fechaNacimiento).getTime())) errors.push('La fecha de nacimiento no es válida.');
  if (errors.length) return res.status(400).json({ errors });

  const student = {
    id: nextId(db.students, 's'),
    tutorId: u.id,
    nombre: nombre.trim(),
    fechaNacimiento,
    documento: (documento || '').trim(),
    createdAt: new Date().toISOString(),
  };
  db.students.push(student);
  save(db);
  res.json({ student });
});

// ---- inscripciones ----
router.get('/enrollments', (req,res) => {
  const db=req.db, u=req.currentUser;
  let scoped=db.enrollments.filter(e=>service.canRead(u,e));
  const filtros={ ciclos:[...new Set(scoped.map(e=>e.cicloEscolar))].sort().reverse(), grados:GRADOS };
  let list=scoped.map(e=>publicEnrollment(e,db,u));
  const {estado,institucionId,cicloEscolar,grado,q}=req.query;
  if(estado && estado!=='Todos') list=list.filter(e=>e.estado===estado);
  if(institucionId && institucionId!=='Todas') list=list.filter(e=>e.institucionId===institucionId);
  if(cicloEscolar && cicloEscolar!=='Todos') list=list.filter(e=>e.cicloEscolar===cicloEscolar);
  if(grado && grado!=='Todos') list=list.filter(e=>e.gradoSolicitado===grado);
  if(q) {const term=String(q).trim().toLocaleLowerCase('es'); list=list.filter(e=>[e.id,e.estudianteNombre,e.tutorNombre,e.institucionNombre].some(v=>String(v).toLocaleLowerCase('es').includes(term)));}
  list.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt) || b.id.localeCompare(a.id,'en',{numeric:true}));
  const total=list.length;
  const paginated=req.query.page!==undefined || req.query.limit!==undefined;
  const page=Number(req.query.page || 1), limit=Number(req.query.limit || 10);
  if(paginated && (!Number.isInteger(page) || page<1 || !Number.isInteger(limit) || limit<1 || limit>100)) return res.status(400).json({error:'Paginación inválida.'});
  if(paginated) list=list.slice((page-1)*limit,page*limit);
  res.json({total, enrollments:list, filtros, page:paginated?page:null, limit:paginated?limit:null});
});

// SSE lleva únicamente avisos de cambio autorizados; el detalle se vuelve a consultar.
router.get('/enrollments/events', (req,res) => {
  res.setHeader('Content-Type','text/event-stream');
  res.setHeader('Cache-Control','no-cache');
  res.setHeader('Connection','keep-alive');
  res.flushHeaders();
  const handler = changed => {
    const db=load(),u=db.users.find(u=>u.id===req.currentUser.id && u.estado!=='Inactivo');
    if(!u){res.end();return;}
    const visible=db.enrollments.some(e=>service.canRead(u,e) && (changed.id ? e.id===changed.id : e.institucionId===changed.institucionId && e.cicloEscolar===changed.cicloEscolar));
    if(visible)res.write('event: changed\ndata: {}\n\n');
  };
  updates.on('changed',handler);
  const heartbeat=setInterval(()=>res.write(': keep-alive\n\n'),30000);
  req.on('close',()=>{clearInterval(heartbeat);updates.off('changed',handler);});
});

router.get('/enrollments/:id', (req,res) => {
  const db=req.db,u=req.currentUser,e=db.enrollments.find(e=>e.id===req.params.id);
  if(!e) return res.status(404).json({error:'Solicitud no encontrada.'});
  if(!service.canRead(u,e)) return res.status(403).json({error:'No tienes permiso para ver esta solicitud.'});
  const s=db.students.find(s=>s.id===e.studentId),t=db.users.find(t=>t.id===e.tutorId);
  const existingEvents=(db.logs || []).filter(l=>l.entidad==='Inscripción' && l.entidadId===e.id && !(e.historial || []).some(h=>h.id===l.eventId || (h.fecha===l.fecha && h.accion===l.accion))).map(l=>({id:l.id,fecha:l.fecha,actorId:l.actorId,actorNombre:l.actorNombre,accion:l.accion,motivo:l.detalle}));
  res.json({enrollment:publicEnrollment(e,db,u), estudiante:s?{id:s.id,nombre:s.nombre,fechaNacimiento:s.fechaNacimiento}:null,
    tutor:t?{id:t.id,nombre:t.nombre,email:t.email,telefono:e.contactoTutor?.telefono || t.telefonomovil || ''}:null,
    documentos:service.documentSummary(db,e).map(r=>({...r,document:r.document?{id:r.document.id,tipoDocumento:r.document.tipoDocumento,nombreArchivo:r.document.nombreArchivo,estado:r.document.estado,motivoRechazo:r.document.motivoRechazo,uploadedAt:r.document.uploadedAt}:null})),
    historial:[...existingEvents,...(e.historial || [])].sort((a,b)=>new Date(a.fecha)-new Date(b.fecha))});
});

router.post('/enrollments', (req, res) => {
  const db = req.db;

  const u = req.currentUser;
  if (u.role !== 'Tutor') return res.status(403).json({ error: 'Solo un tutor puede crear una solicitud de inscripción.' });

  const { studentId, institucionId, gradoSolicitado, cicloEscolar, draftId } = req.body || {};
  const errors = [];
  let student = db.students.find((s) => s.id === studentId && s.tutorId === u.id);
  sweepExpiredDrafts(db);
  const draft = draftId && (db.drafts || []).find(d => d.id === draftId);
  if (draftId && (!draft || draft.tutorId !== u.id)) return res.status(403).json({ error: 'Borrador no autorizado.' });
  if (draft && draft.enrollmentId) return res.json({ enrollment: publicEnrollment(db.enrollments.find(e => e.id === draft.enrollmentId), db, u) });
  if (draft && draft.estado) return res.status(410).json({ error: 'Borrador expirado o finalizado.' });
  if (studentId === 'new' && draft) {
    const n = req.body.newStudent || {};
    if (typeof n.nombre === 'string' && n.nombre.trim().length >= 3 && n.fechaNacimiento && !isNaN(new Date(n.fechaNacimiento).getTime())) {
      student = { id: nextId(db.students, 's'), tutorId: u.id, nombre: n.nombre.trim(), fechaNacimiento: n.fechaNacimiento, documento: '', createdAt: new Date().toISOString() };
    }
  }
  if (draft && ['institucionId', 'gradoSolicitado', 'cicloEscolar'].some(k => draft.data[k] !== req.body[k])) errors.push('La solicitud no coincide con el borrador guardado.');
  if (!student) errors.push('Selecciona un estudiante válido.');
  const institucion = db.institutions.find((i) => i.id === institucionId);
  if (!institucion) errors.push('Selecciona una institución válida.');
  else if ((institucion.estado || 'Activo') !== 'Activo') errors.push('Esa institución no está activa actualmente.');
  if (!GRADOS.includes(gradoSolicitado)) errors.push('Selecciona un grado válido.');
  if (!cicloEscolar || !CICLO_RE.test(cicloEscolar)) errors.push('Selecciona un ciclo escolar válido.');
  if (student && institucion && db.enrollments.some((e) =>
    e.studentId === student.id && e.institucionId === institucion.id && e.cicloEscolar === cicloEscolar &&
    !['Rechazada', 'Abandonada', 'Cancelada'].includes(service.status(e))
  )) {
    errors.push('Ya existe una solicitud activa para este estudiante en esa institución y ciclo.');
  }
  if (institucion && cicloEscolar) {
    const period = findPeriod(db, institucion.id, cicloEscolar);
    if (period && !withinRange(period.inscripcion)) {
      errors.push(`El periodo de inscripción del ciclo ${cicloEscolar} para esta institución no está abierto actualmente.`);
    }
  }
  if (draft && institucion) {
    const p = findPeriod(db, institucionId, cicloEscolar);
    const required = require('../lib/requirements').requirements(p && p.documentosRequeridos, gradoSolicitado);
    if (required.some(r => !db.documents.some(d => d.draftId === draft.id && d.tutorId === u.id && d.tipoDocumento === r.tipo && d.estado !== 'Rechazado' && d.size <= r.maxSizeMB * 1024 * 1024 && r.formatos.some(f => ({PDF:'application/pdf', JPG:'image/jpeg', JPEG:'image/jpeg', PNG:'image/png'})[f] === d.mimeType)))) errors.push('Carga todos los documentos requeridos antes de enviar.');
  }
  const reservations = draft ? (db.enrollmentReservations || []).filter(r=>r.draftId===draft.id && r.estado==='Reservada') : [];
  if(reservations.some(r=>r.tutorId!==u.id || !(db.enrollmentCapacities || []).some(c=>c.id===r.capacityId && c.institucionId===institucionId && c.cicloEscolar===cicloEscolar && c.grado===gradoSolicitado))) errors.push('La reserva no corresponde a este borrador, institución y grado.');
  if(reservations.length>1) errors.push('Hay reservas duplicadas para el borrador.');
  if (errors.length) return res.status(400).json({ errors });

  const period = findPeriod(db, institucionId, cicloEscolar);
  const enrollment = {
    id: nextId(db.enrollments, 'e'),
    studentId: student.id,
    tutorId: u.id,
    institucionId: institucion.id,
    gradoSolicitado,
    cicloEscolar,
    estado: 'Borrador',
    contactoTutor: { nombre: String(req.body.tutorName || u.nombre || '').trim(), telefono: String(req.body.tutorPhone || u.telefonomovil || '').trim() },
    motivoRechazo: '',
    requisitosNormalizados: true,
    requisitosSnapshot: require('../lib/requirements').requirements(period && period.documentosRequeridos, gradoSolicitado),
    createdAt: new Date().toISOString(),
    decidedAt: null,
    decidedBy: null,
  };
  if (studentId === 'new') db.students.push(student);
  db.enrollments.push(enrollment);
  if (draft) { draft.estado = 'Enviada'; draft.enrollmentId = enrollment.id; }
  for(const r of reservations){if(r.expiresAt && r.expiresAt<=Date.now()){r.estado='Liberada';r.releasedAt=new Date().toISOString();}else{r.enrollmentId=enrollment.id;delete r.draftId;delete r.expiresAt;}}
  
  if (draftId && db.documents) {
    db.documents.forEach(d => {
      if (d.draftId === draftId && d.tutorId === u.id) {
        d.enrollmentId = enrollment.id;
        d.institucionId = enrollment.institucionId;
        delete d.draftId;
      }
    });
  }
  service.recordEvent(db, enrollment, u, 'Solicitud enviada', 'Enviada');
  save(db);
  updates.publish({id:enrollment.id});
  res.json({ enrollment: publicEnrollment(enrollment, db, u) });
});

for (const action of ['revisar','decidir','correcciones','cancelar']) {
  router.post('/enrollments/:id/' + action, (req,res) => {
    try {
      const db=load(),u=db.users.find(u=>u.id===req.currentUser.id && u.estado!=='Inactivo');
      if(!u) return res.status(401).json({error:'Sesión inválida.'});
      const e=db.enrollments.find(e=>e.id===req.params.id);
      if(!e) return res.status(404).json({error:'Solicitud no encontrada.'});
      service.transition(db,e,u,action,req.body || {});
      save(db);
      updates.publish({id:e.id});
      res.json({enrollment:publicEnrollment(e,db,u)});
    } catch(err) { res.status(err.status || 500).json({error:err.status ? err.message : 'No se pudo guardar la solicitud. Conserva tus datos y reintenta.'}); }
  });
}

module.exports = router;
