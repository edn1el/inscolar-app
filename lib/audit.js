const { nextId } = require('./db');

// Catalogo de acciones registrables (para el filtro de la pantalla de Auditoria).
const ACCIONES = [
  'Inicio de sesión exitoso',
  'Inicio de sesión fallido',
  'Cierre de sesión',
  'Usuario creado',
  'Usuario modificado',
  'Usuario activado',
  'Usuario desactivado',
  'Contraseña de usuario restablecida',
  'Foto de perfil actualizada',
  'Foto de perfil eliminada',
  'Institución creada',
  'Institución modificada',
  'Institución activada',
  'Institución desactivada',
  'Foto de institución actualizada',
  'Foto de institución eliminada',
  'Cupos de inscripción configurados',
  'Solicitud enviada',
  'Revisión iniciada',
  'Inscripción aceptada',
  'Correcciones solicitadas',
  'Correcciones enviadas',
  'Corrección documental cargada',
  'Documento aprobado',
  'Inscripción creada',
  'Inscripción aprobada',
  'Inscripción rechazada',
  'Inscripción cancelada',
  'Cita creada',
  'Cita aceptada',
  'Cita reprogramada',
  'Horarios de citas configurados',
  'Reporte enviado',
  'Reporte moderado',
  'Cita confirmada',
  'Cita cancelada',
  'Documento subido',
  'Documento aceptado',
  'Documento rechazado',
  'Notificación importante leída',
  'Periodo de ciclo creado',
  'Periodo de ciclo modificado',
  'Configuración de periodo eliminada',
  'Periodo de inscripción eliminado',
  'Periodo de envío de documentos eliminado',
  'Periodo para agendar citas eliminado',
  'Cita rechazada',
  'Inscripción abandonada por inactividad',
];

const {randomUUID}=require('crypto');
const contract=require('./audit-contract');
for(const action of Object.keys(contract.ACTION_HU))if(!ACCIONES.includes(action))ACCIONES.push(action);
function logEvent(db,{actor,accion,entidad,entidadId,detalle,eventId,correlationId,anterior,nuevo,datos,resultado,institucionId}){
 try{
  db.logs ||= [];db.auditOutbox ||= [];
  actor = actor === undefined ? db._auditContext?.actor : actor;
  if(eventId&&db.logs.some(e=>e.eventId===eventId&&e.accion===accion&&e.entidad===entidad))return;
  const id=eventId||randomUUID(),event=contract.normalize({id:nextId(db.logs,'log'),eventId:id,correlationId:correlationId||db._auditContext?.correlationId||id,fecha:new Date().toISOString(),actorId:actor?.id||null,actorNombre:actor?.nombre||'Sistema',actorRole:actor?.role||'Sistema',accion,entidad,entidadId,detalle,anterior,nuevo,datos,resultado,institucionId,origen:db._auditContext?.origen||'Inscolar'});
  db.logs.push(event);db.auditOutbox.push({event,status:'Queued',attempts:0});
 }catch{console.error('AUDIT_CAPTURE_FAILED: evento no preparado; revisar operación.');}
}
const COLLECTIONS={users:'Usuario',institutions:'Institución',ratings:'Calificación',reports:'Reporte',enrollments:'Inscripción',documents:'Documento',appointments:'Cita',periods:'Periodo',drafts:'Borrador',enrollmentCapacities:'Cupo'};
const NOOP=new Set(['Usuario modificado','Institución modificada','Periodo de ciclo modificado','Cupos de inscripción configurados','Reporte moderado']);
function captureChanges(before,after){
 const staged=(after.logs||[]).filter(e=>e.schemaVersion===1&&!(before.logs||[]).some(old=>old.eventId===e.eventId));
 for(const [collection,type] of Object.entries(COLLECTIONS)){
  const oldMap=new Map((before[collection]||[]).map(e=>[e.id,e])),newMap=new Map((after[collection]||[]).map(e=>[e.id,e]));
  for(const id of new Set([...oldMap.keys(),...newMap.keys()])){
   const old=oldMap.get(id),current=newMap.get(id);
   const keys=new Set([...Object.keys(old||{}),...Object.keys(current||{})]);
   const changed=[...keys].filter(k=>!['updatedAt','version','historial','lastAccess','lastActivity','recoveryAttempts'].includes(k)&&JSON.stringify(old?.[k])!==JSON.stringify(current?.[k]));
   const matched=staged.filter(e=>e.entidad===type&&e.entidadId===id);
   if(!changed.length){for(const e of matched.filter(e=>NOOP.has(e.accion))){after.logs=after.logs.filter(x=>x!==e);after.auditOutbox=after.auditOutbox.filter(x=>x.event.eventId!==e.eventId);}continue;}
   if(!matched.length){
    let action= type==='Usuario'?(!old?'Usuario creado':old.estado!==current?.estado?(current?.estado==='Activo'?'Usuario activado':'Usuario desactivado'):'Usuario modificado'):
     type==='Institución'?(!old?'Institución creada':old.estado!==current?.estado?(current?.estado==='Activo'?'Institución activada':'Institución desactivada'):'Institución modificada'):
     type==='Calificación'?(!old?'Calificación registrada':'Calificación modificada'):
     type==='Reporte'?(!old?'Reporte enviado':'Reporte moderado'):
     type==='Borrador'?(!old?'Borrador iniciado':current?.estado==='Abandonada'?'Borrador abandonado':null):
     type==='Cupo'?'Cupos de inscripción configurados':
     type==='Documento'?(!old?'Documento subido':old.estado!==current?.estado?(current?.estado==='Rechazado'?'Documento rechazado':current?.estado==='Aceptado'?'Documento aceptado':null):null):null;
    if(action){const actor=after._auditContext?.actor|| (type==='Usuario'&&!old?current:null);logEvent(after,{actor,accion:action,entidad:type,entidadId:id});if(after.logs.at(-1))matched.push(after.logs.at(-1));}
   }
   for(const e of matched){
    e.anterior=contract.snapshot(type,old);e.nuevo=contract.snapshot(type,current);
    e.institucionId=current?.institucionId||current?.data?.institucionId||old?.institucionId||old?.data?.institucionId||null;
    e.datos=contract.safe({...e.datos,campos:changed.filter(k=>!contract.PRIVATE.test(k)),credencialesCambiadas:type==='Usuario'&&old?.passwordHash!==current?.passwordHash});
    if(type==='Documento'){const enrollmentId=current?.enrollmentId||old?.enrollmentId,enrollment=(after.enrollments||[]).find(x=>x.id===enrollmentId),draft=(after.drafts||[]).find(x=>x.id===(current?.draftId||old?.draftId));e.institucionId=enrollment?.institucionId||draft?.data?.institucionId||null;e.datos={...e.datos,documentId:id,enrollmentId:enrollmentId||null,enrollmentVersion:enrollment?.version??null,draftId:current?.draftId||old?.draftId||null};}
    if(type==='Cita')e.datos={...e.datos,zonaHoraria:'America/Santo_Domingo'};
    const queued=after.auditOutbox.find(x=>x.event.eventId===e.eventId&&x.event.accion===e.accion);if(queued)queued.event=e;
   }
   if(type==='Periodo'&&old&&current){
    if(old.citas?.limiteCitas!==current.citas?.limiteCitas)logEvent(after,{accion:'Límite de citas modificado',entidad:type,entidadId:id,institucionId:current.institucionId,anterior:{limite:old.citas?.limiteCitas??null},nuevo:{limite:current.citas?.limiteCitas??null},datos:{unidad:'citas por periodo'}});
    if(JSON.stringify(old.documentosRequeridos)!==JSON.stringify(current.documentosRequeridos))logEvent(after,{accion:'Requisitos documentales modificados',entidad:type,entidadId:id,institucionId:current.institucionId,anterior:old.documentosRequeridos||[],nuevo:current.documentosRequeridos||[]});
   }
  }
 }
}
module.exports={logEvent,ACCIONES,captureChanges};
