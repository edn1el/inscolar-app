const { nextId } = require('./db');
const { randomUUID } = require('crypto');
const { preferences, TYPES } = require('./communication-prefs');
const ADMIN_ROLES = ['Administrador', 'Soporte'];
function canRead(user, n) { return n.recipientId ? n.recipientId === user.id : ADMIN_ROLES.includes(user.role); }
function isRead(user, n) { return n.recipientId ? !!n.read : !!n.readBy?.[user.id]; }
function link(n) {
  if (!n.entityId) return null;
  if(n.resourceKind==='draft')return `#/app/inscripciones/borradores/${encodeURIComponent(n.entityId)}/detalle`;
  // Never navigate to a persisted arbitrary URL; details still enforce resource permission.
  if (n.type === 'appointments' || n.url?.startsWith('#/app/citas/')) return `#/app/citas/${encodeURIComponent(n.entityId)}/detalle`;
  if (['enrollment','documents'].includes(n.type) || n.url?.startsWith('#/app/inscripciones/')) return `#/app/inscripciones/${encodeURIComponent(n.entityId)}/detalle`;
  return null;
}
function dto(user,n) {
  const {readBy,...rest}=n;
  return {...rest,read:isRead(user,n),readAt:n.recipientId?n.readAt:readBy?.[user.id],url:link(n)};
}
function list(db,user,{page,limit}={}) {
  const items=db.notifications.filter(n=>canRead(user,n)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)||b.id.localeCompare(a.id,'en',{numeric:true}));
  const result={unreadCount:items.filter(n=>!isRead(user,n)).length,total:items.length};
  return {...result,notifications:(page?items.slice((page-1)*limit,page*limit):items).map(n=>dto(user,n)),page:page||1,limit:limit||items.length};
}
function markRead(db,user,id) {
  const n=db.notifications.find(n=>n.id===id);
  if(!n)throw Object.assign(Error('Notificación no disponible.'),{status:404});
  if(!canRead(user,n))throw Object.assign(Error('No tienes permiso para modificar esta notificación.'),{status:403});
  if(isRead(user,n))return false;
  const at=new Date().toISOString();
  if(n.recipientId){n.read=true;n.readAt=at;}else{n.readBy={...n.readBy,[user.id]:at};}
  return true;
}
function notifyUser(db, {recipient,campo,anterior,nuevo,actor,userNombre,eventId,entityId,url,motivo,type,institucionId,action,resourceKind}) {
  if(!recipient)return null;
  type=type|| (url?.startsWith('#/app/citas/')?'appointments':url?.startsWith('#/app/inscripciones/')?'enrollment':'accounts');
  if(!Object.hasOwn(TYPES,type))throw Error('Tipo de comunicación no definido.');
  if(eventId){const found=db.notifications.find(n=>n.eventId===eventId&&n.recipientId===recipient.id&&n.type===type);if(found)return found;}
  const n={id:nextId(db.notifications,'n'),recipientId:recipient.id,userId:recipient.id,userNombre:userNombre||recipient.nombre,campo,anterior:anterior||'',nuevo:nuevo||'',actorId:actor?.id||null,actorNombre:actor?.nombre||'Sistema',createdAt:new Date().toISOString(),read:false,eventId:eventId||randomUUID(),entityId,url,motivo,type,institucionId,action,resourceKind};
  db.notifications.unshift(n);
  // Queue with the business mutation; no SMTP or additional save before commit.
  if(recipient.email&&preferences(recipient)[type]){
    if(!Array.isArray(db.emailOutbox))db.emailOutbox=[];
    db.emailOutbox.push({id:randomUUID(),notificationId:n.id,eventId:n.eventId,recipientId:recipient.id,institucionId,type,to:recipient.email,subject:`Inscolar: ${TYPES[type]}`,text:`${campo}\n${action||''}\nEstado: ${nuevo||'Actualizado'}${motivo?'\nMotivo: '+motivo:''}${link(n)?'\nConsulta el detalle en Inscolar: '+link(n):''}\nSoporte: soporte@inscolar.edu.do`,createdAt:n.createdAt,status:'Queued',attempts:0});
  }
  return n;
}
function notifyAdmins(db, {affectedUser,campo,anterior,nuevo,actor}) {
  const eventId=randomUUID();
  for(const recipient of db.users.filter(u=>ADMIN_ROLES.includes(u.role)&&u.estado==='Activo'))notifyUser(db,{recipient,campo,anterior,nuevo,actor,userNombre:affectedUser.nombre,eventId,type:'accounts'});
}
module.exports={notifyAdmins,notifyUser,canRead,isRead,dto,list,markRead,link};
