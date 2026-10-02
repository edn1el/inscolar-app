const { load, save } = require('./db');
const { logEvent } = require('./audit');
let cachedTransporter,cachedKey;
function getTransporter(){
 const {SMTP_HOST,SMTP_PORT,SMTP_USER,SMTP_PASS}=process.env;
 if(!SMTP_HOST||!SMTP_PORT||!SMTP_USER||!SMTP_PASS)return null;
 const key=`${SMTP_HOST}:${SMTP_PORT}:${SMTP_USER}`;
 if(cachedTransporter&&cachedKey===key)return cachedTransporter;
 cachedKey=key;cachedTransporter=require('nodemailer').createTransport({host:SMTP_HOST,port:Number(SMTP_PORT),secure:Number(SMTP_PORT)===465,auth:{user:SMTP_USER,pass:SMTP_PASS}});
 return cachedTransporter;
}
let running=false;
// Single-process prototype outbox. Stable Message-ID; provider acceptance is not delivery.
async function processOutbox({transport=getTransporter(),now=Date.now()}={}){
 if(running)return;running=true;
 try{
  const pending=(load().emailOutbox||[]).filter(e=>e.status==='Queued'&&(!e.nextAttemptAt||Date.parse(e.nextAttemptAt)<=now));
  for(const queued of pending){
   let db=load(),entry=db.emailOutbox.find(e=>e.id===queued.id);
   if(!entry||entry.status!=='Queued')continue;
   if(!transport){entry.status='PendingConfiguration';save(db);continue;}
   entry.status='Sending';entry.attempts++;entry.lastAttemptAt=new Date().toISOString();
   logEvent(db,{accion:'Intento de envío de correo',entidad:'Notificación',entidadId:entry.notificationId,eventId:entry.id+':attempt:'+entry.attempts,correlationId:entry.id,datos:{attempt:entry.attempts,type:entry.type,recipientId:entry.recipientId}});save(db);
   let result,error;
   try{result=await transport.sendMail({from:process.env.SMTP_FROM||process.env.SMTP_USER,to:entry.to,subject:entry.subject,text:entry.text,messageId:`<${entry.id}@inscolar.local>`});if(!result?.accepted?.length)throw Error('El proveedor no aceptó destinatarios.');}
   catch(e){error=e;}
   // Load fresh after await: never overwrite intervening preferences/business mutations.
   db=load();entry=db.emailOutbox.find(e=>e.id===queued.id);if(!entry)continue;
   entry.status=error?(entry.attempts<3?'Queued':'Failed'):'Accepted';
   if(error){entry.errorCode=String(error.code||'SMTP_ERROR').replace(/[^A-Z0-9_]/gi,'').slice(0,60);entry.nextAttemptAt=new Date(now+entry.attempts*60000).toISOString();}
   else{entry.acceptedAt=new Date().toISOString();entry.providerId=result.messageId;}
   db.emailLog.push({id:require('crypto').randomUUID(),outboxId:entry.id,recipientId:entry.recipientId,institucionId:entry.institucionId,type:entry.type,status:error?'Failed':'Accepted',attempt:entry.attempts,createdAt:entry.lastAttemptAt,acceptedAt:entry.acceptedAt,errorCode:entry.errorCode});
   logEvent(db,{accion:error?'Error de envío de notificación':'Correo aceptado por proveedor',entidad:'Notificación',entidadId:entry.notificationId,detalle:`${entry.type} · intento ${entry.attempts} · ${error?entry.errorCode:'Aceptado por proveedor'}`,correlationId:entry.id,eventId:entry.id+':'+entry.attempts});
   save(db);
  }
 }finally{running=false;}
}
function startWorker(){
 // Configuration changes/restarts recover queued jobs; interrupted sends require reconciliation.
 const db=load();let changed=false;
 for(const e of db.emailOutbox||[]){if(e.status==='Sending'){e.status='Uncertain';changed=true;}else if(e.status==='PendingConfiguration'&&getTransporter()){e.status='Queued';changed=true;}}
 if(changed)save(db);
 const tick=()=>processOutbox().catch(()=>console.error('No se pudo procesar la bandeja de correo.'));
 tick();const timer=setInterval(tick,5000);timer.unref();return ()=>clearInterval(timer);
}
module.exports={getTransporter,processOutbox,startWorker};
