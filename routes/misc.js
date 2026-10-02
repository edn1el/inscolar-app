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

// Analytics never returns personal message bodies or recipient identities.
router.get('/emails',requireAdmin,(req,res)=>{
 const emails=req.db.emailLog.map(({id,status,type,createdAt,acceptedAt,errorCode,via})=>({id,status,type,createdAt,acceptedAt,errorCode,via}));
 res.json({total:emails.length,emails:emails.slice(-50).reverse()});
});
router.get('/analytics/summary',(req,res)=>{
 try{res.json(require('../lib/analytics-service').summary(req.db,req.currentUser,req.query));}
 catch(e){res.status(e.status||500).json({error:e.status?e.message:'No se pudieron consultar las analíticas.'});}
});
module.exports=router;
