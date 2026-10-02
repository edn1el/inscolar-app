const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'inscolar-communications-'));
process.env.DB_PATH=path.join(dir,'db.json');
const notify=require('../lib/notify'),prefs=require('../lib/communication-prefs'),mailer=require('../lib/mailer');
const {load,save}=require('../lib/db');
const recipient={id:'t1',nombre:'Tutor',email:'tutor@example.test',role:'Tutor'};
function fixture(){return {users:[recipient],institutions:[],notifications:[],emailLog:[],emailOutbox:[],logs:[]};}
function event(overrides={}){return {recipient,campo:'Solicitud e1',anterior:'En revisión',nuevo:'Rechazada',actor:{id:'staff',nombre:'Personal'},eventId:'event1',entityId:'e1',url:'#/app/inscripciones/e1/detalle',type:'enrollment',...overrides};}
test('deduplicación por evento, destinatario y tipo; preferencias no ocultan aviso web',()=>{
 const db=fixture();notify.notifyUser(db,event());notify.notifyUser(db,event());assert.equal(db.notifications.length,1);assert.equal(db.emailOutbox.length,1);
 notify.notifyUser(db,event({recipient:{...recipient,id:'t2',communicationPreferences:{enrollment:false}}}));assert.equal(db.notifications.length,2);assert.equal(db.emailOutbox.length,1);
 assert.equal(notify.list(db,recipient).notifications.length,1);
});
test('paginación conserva contador global del destinatario',()=>{
 const db=fixture();for(let i=0;i<23;i++)notify.notifyUser(db,event({eventId:String(i)}));
 const page=notify.list(db,recipient,{page:2,limit:20});assert.equal(page.notifications.length,3);assert.equal(page.unreadCount,23);assert.equal(page.total,23);
 assert.equal(notify.markRead(db,recipient,db.notifications[0].id),true);const at=db.notifications[0].readAt;assert.equal(notify.markRead(db,recipient,db.notifications[0].id),false);assert.equal(db.notifications[0].readAt,at);
 assert.throws(()=>notify.markRead(db,{id:'other',role:'Tutor'},db.notifications[0].id),e=>e.status===403);
});
test('lecturas heredadas broadcast son individuales y no filtran lectores',()=>{
 const db=fixture();db.notifications.push({id:'legacy',recipientId:null,read:true,campo:'Cuenta',createdAt:new Date().toISOString()});
 const a={id:'a',role:'Administrador'},b={id:'b',role:'Soporte'};
 assert.equal(notify.list(db,a).unreadCount,1);notify.markRead(db,a,'legacy');assert.equal(notify.list(db,a).unreadCount,0);assert.equal(notify.list(db,b).unreadCount,1);assert.equal(notify.list(db,b).notifications[0].readBy,undefined);assert.equal(notify.list(db,recipient).total,0);
});
test('rutas de detalle son canónicas; URL externa nunca se acepta',()=>{
 assert.equal(notify.link({entityId:'x',type:'appointments',url:'https://evil.test'}),'#/app/citas/x/detalle');
 assert.equal(notify.link({entityId:'x',type:'accounts',url:'https://evil.test'}),null);
});
test('preferencias independientes, migración legacy y validación estricta',()=>{
 const u={notifyByEmail:false,communicationPreferences:{appointments:true}};assert.equal(prefs.preferences(u).appointments,true);assert.equal(prefs.preferences(u).enrollment,false);
 for(const invalid of [{x:true},{constructor:true},{appointments:'true'},[],null])assert.throws(()=>prefs.validate(invalid),e=>e.status===400);
 assert.deepEqual(prefs.validate({documents:false}),{documents:false});
});
test('sin SMTP se conserva la cola y nunca se registra enviado',async()=>{
 const db=fixture();notify.notifyUser(db,event());save(db);await mailer.processOutbox({transport:null});const after=load();assert.equal(after.emailOutbox[0].status,'PendingConfiguration');assert.equal(after.emailLog.length,0);
});
test('aceptación del proveedor usa snapshot fresco y distingue entrega',async()=>{
 const db=fixture();notify.notifyUser(db,event());save(db);
 await mailer.processOutbox({transport:{sendMail:async()=>{const concurrent=load();concurrent.users[0].communicationPreferences={documents:false};save(concurrent);return {accepted:['tutor@example.test'],messageId:'m1'};}}});
 const after=load();assert.equal(after.users[0].communicationPreferences.documents,false);assert.equal(after.emailOutbox[0].status,'Accepted');assert.equal(after.emailLog[0].status,'Accepted');assert.equal(after.emailLog[0].text,undefined);
 await mailer.processOutbox({transport:{sendMail:async()=>{throw Error('Should not resend')}}});assert.equal(load().emailLog.length,1);
});
test('fallo de proveedor conserva negocio y admite reintento acotado sin datos sensibles',async()=>{
 const db=fixture();notify.notifyUser(db,event());db.enrollments=[{id:'e1',estado:'Rechazada'}];save(db);const now=Date.now();
 await mailer.processOutbox({now,transport:{sendMail:async()=>{throw Object.assign(Error('password-secret'),{code:'ECONNECTION'});}}});
 let after=load();assert.equal(after.enrollments[0].estado,'Rechazada');assert.equal(after.emailOutbox[0].status,'Queued');assert.equal(after.emailLog[0].errorCode,'ECONNECTION');assert.ok(!JSON.stringify(after).includes('password-secret'));
 await mailer.processOutbox({now:now+120000,transport:{sendMail:async()=>({accepted:['tutor@example.test'],messageId:'m2'})}});after=load();assert.equal(after.emailOutbox[0].attempts,2);assert.equal(after.emailOutbox[0].status,'Accepted');
});
