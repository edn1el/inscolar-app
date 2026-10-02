const { randomUUID } = require('crypto');
const { logEvent } = require('./audit');
const { notifyUser } = require('./notify');
const { findPeriod } = require('./periods');
const { requirements } = require('./requirements');

const GRADOS = ['Pre-Primario', '1ro de Primaria', '2do de Primaria', '3ro de Primaria', '4to de Primaria', '5to de Primaria', '6to de Primaria', '1ro de Secundaria', '2do de Secundaria', '3ro de Secundaria', '4to de Secundaria', '5to de Secundaria', '6to de Secundaria'];
const STAFF = ['Administrador', 'Soporte'];
const FINAL = ['Aceptada', 'Rechazada', 'Cancelada', 'Abandonada'];
const TRANSITIONS = {
  Borrador: ['Enviada', 'Abandonada'], Enviada: ['En revisión', 'Documentos pendientes', 'Rechazada', 'Cancelada'],
  'En revisión': ['Aceptada', 'Rechazada', 'Documentos pendientes', 'Cancelada'],
  'Documentos pendientes': ['En revisión', 'Rechazada'],
};
const status = e => ({ Pendiente: 'Enviada', Aprobada: 'Aceptada' }[e.estado] || e.estado);
const version = e => Number(e.version || 0);
function fail(code, message) { const e = new Error(message); e.status = code; throw e; }
function canRead(u, e) { return STAFF.includes(u.role) || (u.role === 'Tutor' && e.tutorId === u.id) || (u.role === 'Personal de institución' && e.institucionId === u.institucionId); }
function canManage(u, e) { return STAFF.includes(u.role) || (u.role === 'Personal de institución' && e.institucionId === u.institucionId); }
function requireVersion(e, expected) {
  if (!Number.isInteger(expected) || expected < 0) fail(400, 'Envía la versión vigente de la solicitud.');
  if (version(e) !== expected) fail(409, 'La solicitud cambió en otra sesión. Actualiza el expediente antes de decidir.');
}
function latestDocuments(db, e) {
  return db.documents.filter(d => d.enrollmentId === e.id).sort((a,b) => new Date(b.uploadedAt)-new Date(a.uploadedAt) || b.id.localeCompare(a.id, 'en', { numeric: true }));
}
function documentSummary(db, e) {
  const docs = latestDocuments(db, e);
  const required = e.requisitosNormalizados && Array.isArray(e.requisitosSnapshot) ? e.requisitosSnapshot : requirements(e.requisitosSnapshot, e.gradoSolicitado);
  return required.map(r => ({ ...r, document: docs.find(d => d.tipoDocumento === r.tipo) || null }));
}
function recordEvent(db, e, actor, action, next = status(e), motive = '', details = {}) {
  const previous = status(e);
  if (previous !== next && !(TRANSITIONS[previous] || []).includes(next)) fail(409, 'Transición de solicitud inválida.');
  const event = { id: randomUUID(), fecha: new Date().toISOString(), actorId: actor ? actor.id : null, actorNombre: actor ? actor.nombre : 'Sistema', accion: action, anterior: previous, nuevo: next, motivo: motive, ...details };
  e.estado = next;
  e.version = version(e) + 1;
  e.updatedAt = event.fecha;
  if (!Array.isArray(e.historial)) e.historial = [];
  e.historial.push(event);
  logEvent(db, { actor, accion: action, entidad: 'Inscripción', entidadId: e.id, detalle: `${previous} → ${next}${motive ? ': ' + motive : ''}`, eventId:event.id });
  if (previous !== next || action === 'Solicitud enviada' || action === 'Correcciones solicitadas' || details.documentId) {
    const tutor = db.users.find(u => u.id === e.tutorId);
    if (tutor) notifyUser(db, { recipient: tutor, campo: `Solicitud ${e.id}`, anterior: previous, nuevo: next, actor: actor || {id:null,nombre:'Sistema'}, userNombre: db.students.find(s => s.id === e.studentId)?.nombre, type: details.documentId ? 'documents' : 'enrollment', institucionId:e.institucionId, action, eventId: event.id, entityId: e.id, url: `#/app/inscripciones/${e.id}/detalle`, motivo: motive });
  }
  return event;
}
function capacity(db, e) {
  // No se supone capacidad ilimitada cuando no hay contrato configurado.
  const config = (db.enrollmentCapacities || []).find(c => c.institucionId === e.institucionId && c.cicloEscolar === e.cicloEscolar && c.grado === e.gradoSolicitado);
  const accepted = db.enrollments.filter(x => x.institucionId === e.institucionId && x.cicloEscolar === e.cicloEscolar && x.gradoSolicitado === e.gradoSolicitado && status(x) === 'Aceptada').length;
  const held = (db.enrollmentReservations || []).filter(r => r.capacityId === config?.id && r.estado === 'Reservada' && (!r.expiresAt || r.expiresAt > Date.now()));
  return { configurado: !!config && Number.isInteger(config.limite) && config.limite > 0, limite: config?.limite ?? null, ocupados: accepted, reservados: held.length, disponibles: config ? Math.max(0, config.limite - accepted - held.length) : null, config, held };
}
function releaseReservation(db, e) {
  for (const r of db.enrollmentReservations || []) {
    if (r.enrollmentId === e.id && r.estado === 'Reservada') { r.estado = 'Liberada'; r.releasedAt = new Date().toISOString(); }
  }
}
function releaseDraftReservations(db,draft) {
  for(const r of db.enrollmentReservations || []) {
    if(r.draftId===draft.id && r.tutorId===draft.tutorId && r.estado==='Reservada') {r.estado='Liberada';r.releasedAt=new Date().toISOString();}
  }
}
function accept(db, e) {
  const institution = db.institutions.find(i => i.id === e.institucionId);
  if (!institution || (institution.estado || 'Activo') !== 'Activo') fail(422, 'La institución no está activa.');
  if (!GRADOS.includes(e.gradoSolicitado)) fail(422, 'El grado no es válido.');
  const period = findPeriod(db, e.institucionId, e.cicloEscolar);
  if (!period || !period.inscripcion || !Number.isFinite(new Date(e.createdAt).getTime()) || new Date(e.createdAt) < new Date(period.inscripcion.desde) || new Date(e.createdAt) > new Date(period.inscripcion.hasta)) fail(422, 'La solicitud no corresponde a un periodo de inscripción válido.');
  if (documentSummary(db, e).some(r => !r.document || !['Aceptado','Aprobado'].includes(r.document.estado))) fail(422, 'Todos los documentos obligatorios deben estar aprobados antes de aceptar.');
  const c = capacity(db, e);
  if (!c.configurado) fail(422, 'No hay cupos de inscripción configurados para este ciclo y grado.');
  const own = c.held.filter(r => r.enrollmentId === e.id);
  if (own.length > 1) fail(409, 'Hay reservas duplicadas para esta solicitud; revisa la disponibilidad.');
  if (c.ocupados + c.reservados > c.limite || (!own.length && c.disponibles < 1)) fail(409, 'No hay cupo disponible para este grado y ciclo.');
  if (own.length) { own[0].estado = 'Consumida'; own[0].consumedAt = new Date().toISOString(); }
}
function transition(db, e, u, action, body) {
  const from = status(e);
  if (action === 'correcciones' || action === 'cancelar') {
    if (u.role !== 'Tutor' || e.tutorId !== u.id) fail(403, 'Solo el tutor titular puede realizar esta acción.');
  } else if (!canManage(u,e)) fail(403, 'No tienes permiso para gestionar esta solicitud.');
  requireVersion(e,body.version);
  const to = action === 'revisar' ? 'En revisión' : action === 'cancelar' ? 'Cancelada' : action === 'correcciones' ? 'En revisión' : body.estado;
  if (action === 'decidir' && !['Aceptada','Rechazada'].includes(to)) fail(400, 'Decisión inválida.');
  if (action === 'revisar' && from !== 'Enviada') fail(409, 'Solo se inicia revisión de una solicitud Enviada.');
  if (action === 'correcciones' && from !== 'Documentos pendientes') fail(409, 'La solicitud no está en corrección.');
  if (!(TRANSITIONS[from] || []).includes(to)) fail(409, 'La acción no es válida para el estado vigente de la solicitud.');
  const motive = typeof body.motivo === 'string' ? body.motivo.trim() : '';
  if (motive.length > 2000) fail(400, 'El motivo debe tener como máximo 2000 caracteres.');
  if (to === 'Rechazada' && motive.length < 3) fail(400, 'Indica un motivo comprensible de rechazo (mínimo 3 caracteres).');
  if (action === 'correcciones' && documentSummary(db,e).some(r => !r.document || r.document.estado === 'Rechazado')) fail(422, 'Carga las correcciones de todos los documentos requeridos.');
  if (to === 'Aceptada') accept(db,e);
  if (['Rechazada','Cancelada'].includes(to)) releaseReservation(db,e);
  const label = { revisar:'Revisión iniciada',correcciones:'Correcciones enviadas',cancelar:'Inscripción cancelada' }[action] || (to === 'Aceptada' ? 'Inscripción aceptada' : 'Inscripción rechazada');
  recordEvent(db,e,u,label,to,motive);
  if (['Aceptada','Rechazada','Cancelada'].includes(to)) { e.decidedAt = e.updatedAt; e.decidedBy = u.id; }
  if (to === 'Rechazada') e.motivoRechazo = motive;
  if (to === 'Cancelada') e.motivoCancelacion = motive;
}
function dto(e,db,u) {
  const student=db.students.find(s=>s.id===e.studentId), inst=db.institutions.find(i=>i.id===e.institucionId), tutor=db.users.find(t=>t.id===e.tutorId);
  const c=capacity(db,e), st=status(e);
  return { ...e, estado:st, version:version(e), estudianteNombre:student?.nombre || '—', institucionNombre:inst?.nombre || '—', tutorNombre:tutor?.nombre || '—',
    periodoId:findPeriod(db,e.institucionId,e.cicloEscolar)?.id || null,
    disponibilidad:{configurado:c.configurado,limite:c.limite,ocupados:c.ocupados,reservados:c.reservados,disponibles:c.disponibles,reservaPropia:c.held.some(r=>r.enrollmentId===e.id)},
    acciones: { revisar:canManage(u,e) && st==='Enviada', aceptar:canManage(u,e) && st==='En revisión', rechazar:canManage(u,e) && ['Enviada','En revisión','Documentos pendientes'].includes(st), cancelar:u.role==='Tutor' && u.id===e.tutorId && ['Enviada','En revisión'].includes(st) } };
}
module.exports={ GRADOS, FINAL, status,version,canRead,canManage,requireVersion,recordEvent,transition,documentSummary,latestDocuments,capacity,dto,fail,releaseReservation,releaseDraftReservations };
