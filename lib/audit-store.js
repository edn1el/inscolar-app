// Prototype adapter: committed business outbox -> separate append-only audit store.
// No route exposes update/delete. Production requires database permissions and transactions.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {DB_PATH,load,save}=require('./db');
const {normalize,safe}=require('./audit-contract');
const AUDIT_PATH=path.resolve(process.env.AUDIT_PATH||DB_PATH+'.audit.json');
function read(){return fs.existsSync(AUDIT_PATH)?JSON.parse(fs.readFileSync(AUDIT_PATH,'utf8')):{schemaVersion:1,events:[],accesses:[]};}
function write(store){const temp=AUDIT_PATH+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(store,null,2),{mode:0o600});fs.renameSync(temp,AUDIT_PATH);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function append(event){const store=read();const normalized=normalize(event,{legacy:event.legacy}),existing=store.events.find(e=>e.eventId===event.eventId);if(existing){if(JSON.stringify(existing)!==JSON.stringify(normalized))throw Error('AUDIT_EVENT_CONFLICT');return;}store.events.push(normalized);write(store);}
function recordAccess(user,operation,filters={}){const store=read();store.accesses.push({id:crypto.randomUUID(),fecha:new Date().toISOString(),actorId:user.id,actorRole:user.role,operation,filters:safe(filters)});write(store);}
function flush({now=Date.now(),writer=append}={}){
 let db=load();db.auditOutbox ||= [];
 const known=new Set([...readLegacyIds(db)]);
 // Legacy entries are projected safely; the original business history stays intact.
 for(const old of db.logs||[]){if(!old.schemaVersion){const event=normalize(old,{legacy:true});if(!known.has(event.eventId)){db.auditOutbox.push({event,status:'Queued',attempts:0});known.add(event.eventId);}}}
 if(db.auditOutbox.length!==(load().auditOutbox||[]).length)save(db);
 for(const queued of db.auditOutbox.filter(e=>e.status==='Queued'&&(!e.nextAttemptAt||Date.parse(e.nextAttemptAt)<=now))){
  let error;try{writer(queued.event);}catch{error=true;console.error('AUDIT_STORE_UNAVAILABLE: evento retenido en bandeja.');}
  const fresh=load(),entry=fresh.auditOutbox.find(e=>e.event.eventId===queued.event.eventId);if(!entry)continue;
  entry.attempts++;entry.status=error?(entry.attempts>=3?'Failed':'Queued'):'Persisted';
  if(error){entry.errorCode='AUDIT_STORE_UNAVAILABLE';entry.nextAttemptAt=new Date(now+entry.attempts*1000).toISOString();}else{entry.persistedAt=new Date(now).toISOString();delete entry.errorCode;delete entry.nextAttemptAt;}
  save(fresh);
 }
}
function readLegacyIds(db){return (db.auditOutbox||[]).map(e=>e.event.eventId);}
function retryFailed(){const db=load();for(const e of db.auditOutbox||[]){if(e.status==='Failed'){e.status='Queued';e.attempts=0;delete e.nextAttemptAt;}}save(db);}
function status(db=load()){return {pending:(db.auditOutbox||[]).filter(e=>e.status==='Queued').length,failed:(db.auditOutbox||[]).filter(e=>e.status==='Failed').length};}
function startWorker(){const tick=()=>{try{flush();}catch{console.error('AUDIT_WORKER_FAILED: revisar almacenamiento y bandeja.');}};tick();const timer=setInterval(tick,1000);timer.unref();return ()=>clearInterval(timer);}
module.exports={AUDIT_PATH,read,append,recordAccess,flush,retryFailed,status,startWorker};
