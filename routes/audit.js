const express=require('express');
const {requireAuth}=require('../lib/middleware');
const {ACCIONES}=require('../lib/audit');
const {enabled,normalize}=require('../lib/audit-contract');
const store=require('../lib/audit-store');
const router=express.Router();
router.use(requireAuth);
function requireAuditor(req,res,next){if(!enabled(req.currentUser))return res.status(403).json({error:'Auditoría requiere el rol Auditoría o habilitación explícita del administrador.'});next();}
function date(value,end){if(!value)return null;if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw Error('Fecha inválida.');return Date.parse(value+(end?'T23:59:59.999-04:00':'T00:00:00-04:00'));}
router.get('/logs',requireAuditor,(req,res)=>{
 let filters,page,limit,from,to;
 try{filters=req.query;page=Number(filters.page||1);limit=Number(filters.limit||20);from=date(filters.desde,false);to=date(filters.hasta,true);
  if(!Number.isSafeInteger(page)||page<1||!Number.isInteger(limit)||limit<1||limit>100)throw Error('Paginación inválida.');
  if(from!==null&&to!==null&&from>to)throw Error('Desde debe ser anterior a Hasta.');
  if(String(filters.q||'').length>200)throw Error('La búsqueda admite hasta 200 caracteres.');
 }catch(e){return res.status(400).json({error:e.message});}
 try{
  const events=store.read().events.map(e=>normalize(e,{legacy:e.legacy}));
  const acciones=[...new Set([...ACCIONES,...events.map(e=>e.accion)])].sort((a,b)=>a.localeCompare(b,'es'));
  if(filters.accion&&filters.accion!=='Todas'&&!acciones.includes(filters.accion))return res.status(400).json({error:'Acción desconocida.'});
  const actors=new Map([['Sistema','Sistema']]);for(const e of events)actors.set(e.actorId||'Sistema',e.actorNombre);
  const q=String(filters.q||'').toLowerCase();
  const list=events.filter(e=>(from===null||Date.parse(e.fecha)>=from)&&(to===null||Date.parse(e.fecha)<=to)&&(!filters.accion||filters.accion==='Todas'||e.accion===filters.accion)&&(!filters.actorId||filters.actorId==='Todos'||(e.actorId||'Sistema')===filters.actorId)&&(!q||[e.actorNombre,e.accion,e.detalle,e.entidad,e.entidadId].some(v=>String(v||'').toLowerCase().includes(q)))).sort((a,b)=>Date.parse(b.fecha)-Date.parse(a.fecha)||b.eventId.localeCompare(a.eventId));
  // Query content is not duplicated in the protected access record.
  store.recordAccess(req.currentUser,'list',{page,limit,desde:filters.desde,hasta:filters.hasta,accion:filters.accion,actorId:filters.actorId,searchApplied:!!q});
  res.json({logs:list.slice((page-1)*limit,page*limit),total:list.length,page,limit,pages:Math.ceil(list.length/limit),acciones,actores:[...actors].map(([id,nombre])=>({id,nombre})),zonaHoraria:'America/Santo_Domingo (UTC−04:00)',auditStatus:store.status(req.db)});
 }catch{return res.status(503).json({error:'No se pudo consultar la auditoría. Reintenta; los eventos pendientes se conservan.'});}
});
router.get('/logs/:eventId',requireAuditor,(req,res)=>{try{const event=store.read().events.find(e=>e.eventId===req.params.eventId);if(!event)return res.status(404).json({error:'Evento no encontrado.'});store.recordAccess(req.currentUser,'detail',{eventId:event.eventId});res.json({event:normalize(event,{legacy:event.legacy})});}catch{res.status(503).json({error:'No se pudo consultar el evento. Reintenta.'});}});
module.exports=router;
