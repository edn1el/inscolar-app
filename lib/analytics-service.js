const ROLES=['Administrador','Soporte','Auditoría'];
const notifications=require('./notify');
const round=n=>Math.round(n*100)/100;
function group(items,key,label='label'){
 const map=new Map();for(const item of items){const name=String(key(item)||'Sin información');map.set(name,(map.get(name)||0)+1);}
 return Array.from(map,([name,count])=>({[label]:name,count})).sort((a,b)=>String(a[label]).localeCompare(String(b[label]),'es'));
}
function filters(query){
 const {desde,hasta,institucionId}=query;
 for(const v of [desde,hasta])if(v&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v))throw Object.assign(Error('Fecha de filtro inválida.'),{status:400});
 if(desde&&hasta&&desde>hasta)throw Object.assign(Error('La fecha inicial debe ser anterior o igual a la final.'),{status:400});
 return {desde:desde||null,hasta:hasta||null,institucionId:institucionId||null,zonaHoraria:'America/Santo_Domingo'};
}
function summary(db,user,query={}){
 if(!ROLES.includes(user.role))throw Object.assign(Error('No tienes permiso para consultar analíticas.'),{status:403});
 const f=filters(query);if(f.institucionId&&!db.institutions.some(i=>i.id===f.institucionId))throw Object.assign(Error('Institución no disponible.'),{status:404});
 const within=value=>{if(!f.desde&&!f.hasta)return true;if(!value||!Number.isFinite(Date.parse(value)))return false;const time=Date.parse(value);return (!f.desde||time>=Date.parse(f.desde+'T00:00:00-04:00'))&&(!f.hasta||time<Date.parse(f.hasta+'T00:00:00-04:00')+86400000);};
 const scope=db.institutions.filter(i=>!f.institucionId||i.id===f.institucionId),ids=new Set(scope.map(i=>i.id));
 const institutions=scope.filter(i=>within(i.createdAt));
 const users=db.users.filter(u=>(!f.institucionId||u.institucionId===f.institucionId)&&within(u.createdAt));
 const allowedInstitution=id=>ids.has(id)||(!f.institucionId&&!id);
 const enrollments=db.enrollments.filter(e=>allowedInstitution(e.institucionId)&&within(e.createdAt));
 const appointmentRows=db.appointments.filter(a=>allowedInstitution(a.institucionId)&&within(a.createdAt));
 const documents=db.documents.filter(d=>{const e=db.enrollments.find(e=>e.id===d.enrollmentId)||db.drafts?.find(e=>e.id===d.draftId);return e&&allowedInstitution(e.institucionId)&&within(d.uploadedAt);});
 const ratings=db.ratings.filter(r=>ids.has(r.institucionId)&&within(r.createdAt));
 const reports=db.reports.filter(r=>ids.has(r.institucionId)&&within(r.createdAt));
 const institution=id=>scope.find(i=>i.id===id);
 const avg=rows=>rows.length?round(rows.reduce((n,r)=>n+Number(r.estrellas),0)/rows.length):null;
 const provincias=group(scope,i=>i.provincia,'provincia').map(p=>{const set=new Set(scope.filter(i=>(i.provincia||'Sin información')===p.provincia).map(i=>i.id));const r=ratings.filter(r=>set.has(r.institucionId));return {provincia:p.provincia,promedio:avg(r),count:reports.filter(r=>set.has(r.institucionId)).length};});
 const status=e=>({Pendiente:'Enviada',Aprobada:'Aceptada'}[e.estado]||e.estado);
 const count=(rows,states,key=r=>r.estado)=>rows.filter(r=>states.includes(key(r))).length;
 // Durable recovery history for new requests; legacy tokens are an explicitly partial baseline.
 const recoveries=(db.recoveryRequests||[]).filter(r=>(!f.institucionId||db.users.find(u=>u.id===r.userId)?.institucionId===f.institucionId)&&within(r.createdAt));
 const used=recoveries.filter(r=>r.completedAt).length;
 const notices=db.notifications.filter(n=>{const id=n.institucionId||db.enrollments.find(e=>e.id===n.entityId)?.institucionId||db.appointments.find(a=>a.id===n.entityId)?.institucionId;return allowedInstitution(id)&&within(n.createdAt);});
 const reads=notices.reduce((sum,n)=>sum+(n.recipientId?(n.read?1:0):Object.keys(n.readBy||{}).length),0);
 const recipients=notices.reduce((sum,n)=>sum+(n.recipientId?1:db.users.filter(u=>['Administrador','Soporte'].includes(u.role)&&u.estado==='Activo').length),0);
 const emails=db.emailLog.filter(e=>allowedInstitution(e.institucionId)&&within(e.acceptedAt||e.createdAt||e.sentAt));
 const accepted=new Set(emails.filter(e=>e.status==='Accepted').map(e=>e.outboxId||e.id)).size;
 const outbox=(db.emailOutbox||[]).filter(e=>allowedInstitution(e.institucionId)&&within(e.createdAt));
 return {filters:f,actualizadoAt:new Date().toISOString(),ambito:'Global para roles autorizados',
  institucionesDisponibles:db.institutions.map(i=>({id:i.id,nombre:i.nombre})),
  totalUsuarios:users.length,activos:count(users,['Activo']),inactivos:users.length-count(users,['Activo']),mfaActivo:users.filter(u=>u.mfaEnabled).length,tutores:users.filter(u=>u.role==='Tutor').length,
  nuevosEstaSemana:users.filter(u=>Date.parse(u.createdAt)>=Date.now()-7*86400000).length,
  porRol:group(users,u=>u.role,'role'),porAnio:group(users,u=>Number.isFinite(Date.parse(u.createdAt))?new Date(u.createdAt).getUTCFullYear():'Sin fecha','anio'),
  usuariosPorProvincia:group(users,u=>u.provincia||institution(u.institucionId)?.provincia,'provincia'),
  totalResetsGenerados:recoveries.length,totalResetsUsados:used,tasaRecuperacion:recoveries.length?round(100*used/recoveries.length):null,
  totalInstituciones:institutions.length,porProvincia:group(institutions,i=>i.provincia,'provincia'),
  totalCalificaciones:ratings.length,promedioCalificaciones:avg(ratings),calificacionesPorProvincia:provincias.map(p=>({provincia:p.provincia,promedio:p.promedio})),
  totalReportes:reports.length,promedioReportes:scope.length?round(reports.length/scope.length):null,denominadorReportes:scope.length,reportesPorProvincia:provincias.map(p=>({provincia:p.provincia,count:p.count})),
  reportesPorMotivo:group(reports,r=>r.motivo,'motivo'),institucionesMejorCalificadas:scope.map(i=>({nombre:i.nombre,promedio:avg(ratings.filter(r=>r.institucionId===i.id)),total:ratings.filter(r=>r.institucionId===i.id).length})).filter(r=>r.total).sort((a,b)=>b.promedio-a.promedio).slice(0,5),
  inscripciones:{total:enrollments.length,aprobadas:count(enrollments,['Aceptada'],status),rechazadas:count(enrollments,['Rechazada'],status),pendientes:count(enrollments,['Enviada','En revisión','Documentos pendientes'],status),abandonadas:count(enrollments,['Abandonada'],status),canceladas:count(enrollments,['Cancelada'],status),borradores:count(enrollments,['Borrador'],status)},
  documentos:{total:documents.length,aceptados:count(documents,['Aceptado','Aprobado']),rechazados:count(documents,['Rechazado']),pendientes:count(documents,['Pendiente'])},
  citas:{total:appointmentRows.length,confirmadas:count(appointmentRows,['Aceptada','Confirmada']),canceladas:count(appointmentRows,['Cancelada']),pendientes:count(appointmentRows,['Pendiente']),rechazadas:count(appointmentRows,['Rechazada'])},
  citasPorInstitucion:group(appointmentRows,a=>institution(a.institucionId)?.nombre||'Institución no disponible','nombre'),
  totalCorreosEnviados:accepted,correosFallidos:emails.filter(e=>e.status==='Failed').length,correosSimulados:emails.filter(e=>e.via?.startsWith('simulado')).length,
  correosPendientes:outbox.filter(e=>['Queued','PendingConfiguration','Sending'].includes(e.status)).length,correosInciertos:outbox.filter(e=>e.status==='Uncertain').length,
  totalNotificaciones:recipients,notificacionesLeidas:reads,
 };
}
module.exports={ROLES,filters,summary};
