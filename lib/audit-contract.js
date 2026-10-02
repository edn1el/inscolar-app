const {createHash,randomUUID}=require('crypto');
const ACTION_HU={
 'Usuario creado':['HU096'],'Usuario modificado':['HU097'],'Usuario activado':['HU098'],'Usuario desactivado':['HU099'],
 'Contraseña de usuario restablecida':['HU100'],'Contraseña recuperada':['HU100'],'Contraseña cambiada':['HU101'],
 'Inicio de sesión exitoso':['HU102'],'Cierre de sesión':['HU103'],'Inicio de sesión fallido':['HU104'],
 'Institución creada':['HU105'],'Institución modificada':['HU106'],'Institución activada':['HU107'],'Institución desactivada':['HU108'],
 'Calificación registrada':['HU109'],'Calificación modificada':['HU109'],'Reporte enviado':['HU110'],
 'Borrador iniciado':['HU111'],'Documento subido':['HU112'],'Corrección documental cargada':['HU112'],
 'Documento aceptado':['HU113'],'Documento aprobado':['HU113'],'Documento rechazado':['HU114'],
 'Solicitud enviada':['HU115'],'Revisión iniciada':['HU115'],'Correcciones solicitadas':['HU115'],
 'Correcciones enviadas':['HU115'],'Inscripción aceptada':['HU115','HU116'],'Inscripción rechazada':['HU115','HU117'],
 'Inscripción cancelada':['HU115'],'Borrador abandonado por inactividad':['HU115'],'Borrador abandonado':['HU115'],
 'Cita creada':['HU118'],'Cita reprogramada':['HU119'],'Cita aceptada':['HU120'],'Cita rechazada':['HU121'],'Cita cancelada':['HU122'],
 'Límite de citas modificado':['HU123'],'Requisitos documentales modificados':['HU124'],
 'Periodo de ciclo creado':['HU125'],'Periodo de ciclo modificado':['HU125'],'Configuración de periodo eliminada':['HU125'],
 'Periodo de inscripción eliminado':['HU125'],'Periodo de envío de documentos eliminado':['HU125'],'Periodo para agendar citas eliminado':['HU125'],
 'Intento de envío de correo':['HU126'],'Correo aceptado por proveedor':['HU126'],'Entrega de correo confirmada':['HU126'],
 'Error de envío de notificación':['HU127'],'Notificación importante leída':['HU128']
};
const PRIVATE=/password|contrase|token|secret|credential|cedula|cédula|base64|archivo|storageFile|email|correo|telefono|teléfono|attachment|cookie|session/i;
function text(value){return String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[correo omitido]').replace(/\b\d{3}[- ]?\d{7}[- ]?\d\b/g,'[cédula omitida]').replace(/\b(password|contraseña|token|secret|clave)\s*[:=]\s*[^\s,;]+/gi,'$1=[omitido]').replace(/[A-Za-z0-9+/=_-]{80,}/g,'[contenido omitido]').slice(0,2000);}
function safe(value,depth=0){if(depth>6)return null;if(value===null||typeof value==='boolean'||typeof value==='number')return value;if(typeof value==='string')return text(value);if(Array.isArray(value))return value.slice(0,100).map(v=>safe(v,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!PRIVATE.test(k)&&!['__proto__','constructor','prototype'].includes(k)).map(([k,v])=>[k,safe(v,depth+1)]));return null;}
const FIELDS={
 Usuario:['id','role','estado','institucionId','mfaEnabled','mustChangePassword'],
 Institución:['id','nombre','estado','provincia','municipio','distrito','tipo'],
 Calificación:['id','institucionId','estrellas'],Reporte:['id','institucionId','estado','motivo'],
 Inscripción:['id','institucionId','studentId','cicloEscolar','gradoSolicitado','estado','version'],
 Documento:['id','enrollmentId','draftId','version','tipoDocumento','estado','motivoRechazo'],
 Cita:['id','institucionId','enrollmentId','slotId','estado','version','fechaHoraSolicitada','fechaHoraConfirmada','motivoRechazo','motivoCancelacion'],
 Periodo:['id','institucionId','cicloEscolar','inscripcion','documentos','citas','documentosRequeridos'],
 Borrador:['id','estado','expiresAt'],Cupo:['id','institucionId','cicloEscolar','grado','limite']
};
function snapshot(type,value){if(!value)return null;return safe(Object.fromEntries((FIELDS[type]||[]).filter(k=>value[k]!==undefined).map(k=>[k,value[k]])));}
function normalize(input,{legacy=false}={}){
 const eventId=input.eventId|| (legacy?'legacy:'+createHash('sha256').update(JSON.stringify([input.id,input.fecha,input.accion,input.actorId])).digest('hex'):randomUUID());
 return {schemaVersion:1,id:input.id||eventId,eventId,correlationId:input.correlationId||eventId,fecha:Number.isFinite(Date.parse(input.fecha))?new Date(input.fecha).toISOString():null,
 actorId:input.actorId||null,actorNombre:text(input.actorNombre||'Sistema'),actorRole:text(input.actorRole||'Sistema'),accion:text(input.accion),entidad:text(input.entidad),entidadId:input.entidadId||null,
 institucionId:input.institucionId||null,resultado:legacy?'Heredado':input.resultado||(['Inicio de sesión fallido','Error de envío de notificación'].includes(input.accion)?'Fallido':input.accion==='Intento de envío de correo'?'Intentado':input.accion==='Correo aceptado por proveedor'?'Aceptado por proveedor':'Confirmado'),origen:input.origen||'Inscolar',hu:ACTION_HU[input.accion]||[],
 anterior:legacy?null:safe(input.anterior??null),nuevo:legacy?null:safe(input.nuevo??null),datos:legacy?{}:safe(input.datos||{}),detalle:legacy?'Evento heredado; detalle original no publicado por privacidad.':text(input.detalle),legacy};
}
function enabled(user){return user?.role==='Auditoría'||(user?.role==='Administrador'&&(user.auditEnabled===true||(process.env.AUDIT_ADMIN_IDS||'').split(',').includes(user.id)));}
module.exports={ACTION_HU,PRIVATE,text,safe,snapshot,normalize,enabled};
