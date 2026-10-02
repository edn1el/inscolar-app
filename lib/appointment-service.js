// Servicio del prototipo: operaciones síncronas y un guardado atómico por petición.
const {randomUUID}=require('crypto');
const {nextId}=require('./db');
const {logEvent}=require('./audit');
const {notifyUser}=require('./notify');
const TIME_ZONE='America/Santo_Domingo';
const MOTIVOS=['Entrega de documentos','Entrevista de admisión','Seguimiento académico','Otro'];
const ACTIVE=['Pendiente','Aceptada','Confirmada'];
function fail(status,message){throw Object.assign(Error(message),{status});}
function status(a){return a.estado==='Confirmada'?'Aceptada':a.estado;}
function when(a){return a.fechaHoraConfirmada || a.fechaHoraSolicitada;}
function staff(u,id){return u.role==='Personal de institución' && u.institucionId===id;}
function read(u,a){return staff(u,a.institucionId) || (u.role==='Tutor' && u.id===a.tutorId);}
function actions(u,a){const mutable=['Pendiente','Aceptada'].includes(status(a));return {aceptar:staff(u,a.institucionId)&&mutable&&status(a)==='Pendiente',rechazar:staff(u,a.institucionId)&&mutable&&status(a)==='Pendiente',cancelar:read(u,a)&&mutable,reprogramar:read(u,a)&&mutable};}
function dto(db,u,a){const t=db.users.find(t=>t.id===a.tutorId),s=db.students.find(s=>s.id===a.studentId),i=db.institutions.find(i=>i.id===a.institucionId);const {requestId,requestFingerprint,...rest}=a;return {...rest,estado:status(a),version:a.version||0,institucionNombre:i?.nombre||'—',tutorNombre:t?.nombre||'—',estudianteNombre:s?.nombre||null,zonaHoraria:TIME_ZONE,acciones:actions(u,a)};}
function dateKey(iso){return new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(iso));}
function periodFor(db,slot){return db.periods.find(p=>p.id===slot.periodId && p.institucionId===slot.institucionId);}
function occupancy(db,slot,exclude){return db.appointments.filter(a=>a.id!==exclude && a.institucionId===slot.institucionId && ACTIVE.includes(a.estado) && new Date(when(a)).getTime()===new Date(slot.inicio).getTime()).length;}
function remaining(db,slot,exclude){const p=periodFor(db,slot);if(!p?.citas || new Date(slot.inicio)<new Date(p.citas.desde) || new Date(slot.fin)>new Date(p.citas.hasta) || new Date(slot.inicio)<=new Date() || !Number.isInteger(slot.capacidad)||slot.capacidad<1)return 0;
 const count=db.appointments.filter(a=>a.id!==exclude && a.institucionId===slot.institucionId && ACTIVE.includes(a.estado) && new Date(when(a))>=new Date(p.citas.desde) && new Date(when(a))<=new Date(p.citas.hasta)).length;
 return Math.max(0,Math.min(slot.capacidad-occupancy(db,slot,exclude),p.citas.limiteCitas ? p.citas.limiteCitas-count : Infinity));}
function available(db,institucionId,month,exclude){return (db.appointmentSlots||[]).filter(s=>s.institucionId===institucionId && dateKey(s.inicio).startsWith(month) && remaining(db,s,exclude)>0).sort((a,b)=>new Date(a.inicio)-new Date(b.inicio)).map(s=>({id:s.id,inicio:s.inicio,fin:s.fin,fecha:dateKey(s.inicio),disponibles:remaining(db,s,exclude),periodId:s.periodId}));}
function select(db,id,institucionId,exclude){const slot=(db.appointmentSlots||[]).find(s=>s.id===id&&s.institucionId===institucionId);if(!slot)fail(400,'Selecciona un horario ofrecido por la institución.');const inst=db.institutions.find(i=>i.id===institucionId);if(!inst || (inst.estado||'Activo')!=='Activo')fail(422,'La institución no está activa.');if(remaining(db,slot,exclude)<1)fail(409,'El horario ya no está disponible. Elige una alternativa.');return slot;}
function configure(db,u,institucionId,body){const p=db.periods.find(p=>p.id===body.periodId && p.institucionId===institucionId);if(!p?.citas)fail(422,'Configura primero el periodo de citas.');if(!staff(u,institucionId) && !['Administrador','Soporte'].includes(u.role))fail(403,'No puedes configurar horarios de esta institución.');
 const {fecha,desde,hasta,duracionMinutos,capacidad}=body;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha||'') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(desde||'') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hasta||'') || !Number.isInteger(duracionMinutos)||duracionMinutos<5||duracionMinutos>240||!Number.isInteger(capacidad)||capacidad<1||capacidad>1000)fail(400,'Indica fecha, horas, duración de 5 a 240 minutos y capacidad de 1 a 1000.');
 const from=new Date(`${fecha}T${desde}:00-04:00`),to=new Date(`${fecha}T${hasta}:00-04:00`);
 if(!Number.isFinite(+from)||dateKey(from)!==fecha||from<=new Date()||to<=from||from<new Date(p.citas.desde)||to>new Date(p.citas.hasta))fail(400,'Los horarios deben ser futuros y estar dentro del periodo de citas.');
 const slots=[];for(let n=+from;n+duracionMinutos*60000<=+to;n+=duracionMinutos*60000)slots.push({id:randomUUID(),institucionId,periodId:p.id,inicio:new Date(n).toISOString(),fin:new Date(n+duracionMinutos*60000).toISOString(),capacidad});
 if(!slots.length)fail(400,'La duración no cabe en el intervalo seleccionado.');
 if(slots.some(s=>(db.appointmentSlots||[]).some(old=>old.institucionId===institucionId && new Date(s.inicio)<new Date(old.fin) && new Date(s.fin)>new Date(old.inicio))))fail(409,'Ya hay franjas configuradas que se solapan. Conserva las existentes o elige otro intervalo.');
 db.appointmentSlots ||= [];db.appointmentSlots.push(...slots);logEvent(db,{actor:u,accion:'Horarios de citas configurados',entidad:'Periodo',entidadId:p.id,detalle:`${fecha} ${desde}–${hasta} ${TIME_ZONE}, capacidad ${capacidad}`});return slots;
}
function event(db,u,a,action,previous,previousWhen){const eventId=randomUUID();const change={eventId,accion:action,fecha:new Date().toISOString(),actorId:u.id,anterior:previous,nuevo:status(a),fechaAnterior:previousWhen||null,fechaNueva:when(a),zonaHoraria:TIME_ZONE,motivo:a.motivoRechazo||a.motivoCancelacion||''};a.historial ||= [];a.historial.push(change);
 logEvent(db,{actor:u,accion:action,entidad:'Cita',entidadId:a.id,eventId,detalle:JSON.stringify({...change,enrollmentId:a.enrollmentId,institucionId:a.institucionId})});
 const recipient=db.users.find(t=>t.id===a.tutorId);if(recipient)notifyUser(db,{recipient,campo:`Cita · ${db.institutions.find(i=>i.id===a.institucionId)?.nombre||a.institucionId} · ${when(a)} · ${TIME_ZONE}`,anterior:previous,nuevo:status(a),actor:u,type:'appointments',institucionId:a.institucionId,action:change.accion,eventId,entityId:a.id,url:`#/app/citas/${encodeURIComponent(a.id)}/detalle`,motivo:change.motivo});
}
function create(db,u,body){if(!['Tutor','Personal de institución'].includes(u.role))fail(403,'Solo el tutor o personal de su institución puede solicitar citas.');
 const {institucionId,enrollmentId,slotId,motivo}=body;let tutorId=u.id,studentId=body.studentId||null;
 if(enrollmentId){const e=db.enrollments.find(e=>e.id===enrollmentId);if(!e || e.institucionId!==institucionId || (u.role==='Tutor'?e.tutorId!==u.id:!staff(u,e.institucionId)))fail(403,'La solicitud no corresponde a tu ámbito y a esta institución.');tutorId=e.tutorId;if(studentId && studentId!==e.studentId)fail(400,'El estudiante no coincide con la solicitud.');studentId=e.studentId;}
 else if(u.role==='Personal de institución')fail(400,'Selecciona la solicitud del tutor para quien agendas la cita.');
 if(studentId && !db.students.some(s=>s.id===studentId&&s.tutorId===tutorId))fail(403,'El estudiante no corresponde al tutor.');
 if(!MOTIVOS.includes(motivo))fail(400,'Selecciona un motivo válido.');const notas=typeof body.notas==='string'?body.notas.trim():'';if(notas.length>2000)fail(400,'Las notas no pueden superar 2000 caracteres.');
 if(typeof body.requestId!=='string'||! /^[\w-]{16,128}$/.test(body.requestId))fail(400,'Falta el identificador de la operación. Vuelve a confirmar.');
 const fingerprint=JSON.stringify({institucionId,enrollmentId:enrollmentId||null,studentId,tutorId,slotId,motivo,notas});const existing=db.appointments.find(a=>a.createdBy===u.id&&a.requestId===body.requestId);
 if(existing){if(existing.requestFingerprint!==fingerprint)fail(409,'Este identificador ya corresponde a otra operación.');return {appointment:existing,replayed:true};}
 const slot=select(db,slotId,institucionId);
 if(db.appointments.some(a=>a.tutorId===tutorId&&a.studentId===studentId&&a.institucionId===institucionId&&ACTIVE.includes(a.estado)&&when(a)===slot.inicio))fail(409,'Ya tienes una cita activa para este estudiante en ese horario.');
 const a={id:nextId(db.appointments,'c'),tutorId,studentId,enrollmentId:enrollmentId||null,institucionId,motivo,notas,slotId,fechaHoraSolicitada:slot.inicio,fechaHoraConfirmada:null,estado:'Pendiente',version:0,motivoCancelacion:'',motivoRechazo:'',createdAt:new Date().toISOString(),createdBy:u.id,requestId:body.requestId,requestFingerprint:fingerprint};db.appointments.push(a);event(db,u,a,'Cita creada',null);return {appointment:a,replayed:false};
}
function transition(db,u,a,action,body){if(['aceptar','rechazar'].includes(action)&&!staff(u,a.institucionId))fail(403,'Solo el personal de esta institución puede decidir la cita.');if(!read(u,a))fail(403,'No puedes gestionar esta cita.');if(!Number.isInteger(body.version)||body.version!==(a.version||0))fail(409,'La cita cambió. Actualiza el detalle antes de decidir.');const allowed=actions(u,a);if(!allowed[action])fail(409,'La acción no está disponible para este estado, fecha o rol.');const previous=status(a),oldWhen=when(a);
 let motivo=typeof body.motivo==='string'?body.motivo.trim():'';if(motivo.length>2000)fail(400,'El motivo no puede superar 2000 caracteres.');if((action==='rechazar'||(action==='cancelar'&&staff(u,a.institucionId)))&&motivo.length<3)fail(400,'Indica un motivo de al menos 3 caracteres.');
 if(action==='reprogramar'){const slot=select(db,body.slotId,a.institucionId,a.id);if(slot.inicio===oldWhen)fail(400,'Selecciona un horario distinto del actual.');a.slotId=slot.id;a.fechaHoraSolicitada=slot.inicio;a.fechaHoraConfirmada=null;a.estado='Pendiente';}
 if(action==='aceptar'){a.estado='Aceptada';a.fechaHoraConfirmada=a.fechaHoraSolicitada;}
 if(action==='rechazar'){a.estado='Rechazada';a.motivoRechazo=motivo;}
 if(action==='cancelar'){a.estado='Cancelada';a.motivoCancelacion=motivo;}
 a.version=(a.version||0)+1;a.decidedAt=new Date().toISOString();a.decidedBy=u.id;
 event(db,u,a,{aceptar:'Cita aceptada',rechazar:'Cita rechazada',cancelar:'Cita cancelada',reprogramar:'Cita reprogramada'}[action],previous,oldWhen);return a;
}
module.exports={TIME_ZONE,MOTIVOS,ACTIVE,status,when,staff,read,actions,dto,dateKey,available,configure,create,transition};
