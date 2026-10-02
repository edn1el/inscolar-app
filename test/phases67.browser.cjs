const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),{spawn}=require('child_process'),{once}=require('events');
const {chromium,request,expect}=require('playwright/test'),bcrypt=require('bcryptjs');
test('F6/F7: notificaciones, preferencias y panel integrado',{timeout:150000},async t=>{
 const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'inscolar-f67-')),protectedFiles=['data/db.json','test_puppeteer.js'].filter(f=>fs.existsSync(path.join(root,f))).map(f=>[f,fs.readFileSync(path.join(root,f))]);
 for(const f of ['server.js','routes','lib','public'])fs.cpSync(path.join(root,f),path.join(dir,f),{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');fs.mkdirSync(path.join(dir,'data'));
 const dbp=path.join(dir,'data/db.json'),db=JSON.parse(fs.readFileSync(path.join(root,'data/db.json'))),password='Phase67#2026';
 db.users.forEach(u=>Object.assign(u,{passwordHash:bcrypt.hashSync(password,4),estado:'Activo',mfaEnabled:false,mustChangePassword:false}));
 db.enrollments=[{id:'e67',tutorId:'u002',studentId:'s001',institucionId:'i001',estado:'En revisión',version:0,requisitosNormalizados:true,requisitosSnapshot:[],createdAt:'2026-10-02T14:00:00Z'}];db.drafts=[];db.documents=[{id:'d67',enrollmentId:'e67',estado:'Pendiente',tipoDocumento:'Acta',uploadedAt:'2026-10-02T14:00:00Z'}];db.appointments=[];db.appointmentSlots=[];db.notifications=[];db.emailOutbox=[];db.emailLog=[];db.recoveryRequests=[];
 db.periods=[{id:'p67',institucionId:'i001',cicloEscolar:'2026-2027',citas:{desde:'2026-01-01T00:00:00Z',hasta:'2030-01-01T00:00:00Z',limiteCitas:10}}];
 fs.writeFileSync(dbp,JSON.stringify(db));
 const sock=require('net').createServer();sock.listen(0,'127.0.0.1');await once(sock,'listening');const port=sock.address().port;await new Promise(r=>sock.close(r));const base=`http://127.0.0.1:${port}`;
 const server=spawn(process.execPath,['server.js'],{cwd:dir,env:{...process.env,PORT:String(port),DB_PATH:dbp,SMTP_HOST:'',SMTP_PORT:'',SMTP_USER:'',SMTP_PASS:''},stdio:['ignore','pipe','pipe']});let browser;const contexts=[];
 try{
  await new Promise((resolve,reject)=>{server.stdout.on('data',x=>{if(String(x).includes('corriendo en'))resolve()});server.once('error',reject);server.stderr.on('data',x=>reject(Error(String(x))));});
  async function login(id){const c=await request.newContext({baseURL:base});contexts.push(c);assert.equal((await c.post('/api/auth/login',{data:{email:db.users.find(u=>u.id===id).email,password}})).status(),200);return c;}
  const tutor=await login('u002'),otherTutor=await login('u008'),staff=await login('u003'),otherStaff=await login('u005'),admin=await login('u001'),support=await login('u004'),auditor=await login('u007');
  const notices=async(c=tutor)=>(await(await c.get('/api/notifications')).json());let docNotice,appointment;
  await t.test('aprobar documento genera un único aviso de documentos, no se duplica al reintentar',async()=>{
   const body={estado:'Aceptado',version:0};assert.equal((await staff.post('/api/documents/d67/decidir',{data:body})).status(),200);assert.equal((await staff.post('/api/documents/d67/decidir',{data:body})).status(),400);
   const list=await notices();assert.equal(list.total,1);docNotice=list.notifications[0];assert.equal(docNotice.type,'documents');assert.equal(docNotice.recipientId,'u002');assert.equal((await notices(otherTutor)).total,0);assert.equal((await notices(otherStaff)).total,0);assert.equal(JSON.parse(fs.readFileSync(dbp)).emailOutbox.length,1);
  });
  await t.test('lectura persiste, contador concuerda y otro usuario no puede leer ni abrir aviso',async()=>{
   assert.equal((await otherTutor.post('/api/notifications/'+docNotice.id+'/read')).status(),403);assert.equal((await otherTutor.get('/api/notifications/'+docNotice.id+'/target')).status(),403);
   for(let n=0;n<2;n++)assert.equal((await tutor.post('/api/notifications/'+docNotice.id+'/read')).status(),200);
   const list=await notices();assert.equal(list.unreadCount,0);assert.equal(list.notifications[0].read,true);assert.ok(list.notifications[0].readAt);assert.equal((await tutor.get('/api/notifications/'+docNotice.id+'/target')).status(),200);
   assert.equal((await tutor.post('/api/notifications/missing/read')).status(),404);
  });
  await t.test('enlace maneja pérdida de permisos y recurso eliminado',async()=>{
   let state=JSON.parse(fs.readFileSync(dbp));state.enrollments[0].tutorId='u008';fs.writeFileSync(dbp,JSON.stringify(state));assert.equal((await tutor.get('/api/notifications/'+docNotice.id+'/target')).status(),403);
   state.enrollments=[];fs.writeFileSync(dbp,JSON.stringify(state));assert.equal((await tutor.get('/api/notifications/'+docNotice.id+'/target')).status(),404);state.enrollments=db.enrollments;fs.writeFileSync(dbp,JSON.stringify(state));
  });
  await t.test('preferencias parciales e independientes persisten sin cambiar lectura ni otro usuario',async()=>{
   const pref=await(await tutor.get('/api/users/me/notification-prefs')).json();assert.equal(pref.preferences.appointments,true);
   const save=await tutor.put('/api/users/me/notification-prefs',{data:{preferences:{appointments:false,documents:false}}});assert.equal(save.status(),200);
   const current=await(await tutor.get('/api/users/me/notification-prefs')).json();assert.equal(current.preferences.documents,false);assert.equal(current.preferences.appointments,false);assert.equal(current.preferences.enrollment,true);
   assert.equal((await(await otherTutor.get('/api/users/me/notification-prefs')).json()).preferences.appointments,true);assert.equal((await notices()).unreadCount,0);
   assert.equal((await tutor.put('/api/users/me/notification-prefs',{data:{preferences:{appointments:'false'}}})).status(),400);
  });
  await t.test('cita creada/aceptada avisa al tutor; preferencia evita correo, reintento no duplica',async()=>{
   const slots=await staff.post('/api/institutions/i001/appointment-slots',{data:{periodId:'p67',fecha:'2027-01-04',desde:'09:00',hasta:'10:00',duracionMinutos:30,capacidad:2}});assert.equal(slots.status(),200);const slot=(await slots.json()).slots[0];
   const body={institucionId:'i001',slotId:slot.id,motivo:'Entrevista de admisión',requestId:require('crypto').randomUUID()};
   const result=await tutor.post('/api/appointments',{data:body});assert.equal(result.status(),200);appointment=(await result.json()).appointment;assert.equal((await tutor.post('/api/appointments',{data:body})).status(),200);
   assert.equal((await staff.post('/api/appointments/'+appointment.id+'/aceptar',{data:{version:0}})).status(),200);
   const n=await notices();assert.equal(n.notifications.filter(n=>n.type==='appointments').length,2);assert.equal(n.unreadCount,2);assert.equal((await notices(otherTutor)).total,0);assert.equal(JSON.parse(fs.readFileSync(dbp)).emailOutbox.length,1);
   assert.equal((await tutor.get('/api/notifications/'+n.notifications.find(n=>n.type==='appointments').id+'/target')).status(),200);
  });
  await t.test('API de analíticas aplica permisos, filtros y distingue error de cero',async()=>{
   for(const c of [tutor,staff,otherStaff])assert.equal((await c.get('/api/analytics/summary?institucionId=i001')).status(),403);
   for(const c of [admin,support,auditor]){const r=await c.get('/api/analytics/summary');assert.equal(r.status(),200);const s=await r.json();assert.equal(s.citas.total,1);assert.equal(s.citas.confirmadas,1);assert.equal(s.documentos.aceptados,1);assert.equal(s.totalCorreosEnviados,0);assert.equal(s.notificacionesLeidas,1);assert.equal(s.citasPorInstitucion.length,1);assert.ok(!JSON.stringify(s).includes(db.users[1].email));}
   assert.equal((await admin.get('/api/analytics/summary?desde=bad')).status(),400);const zero=await(await admin.get('/api/analytics/summary?institucionId=i002')).json();assert.equal(zero.citas.total,0);assert.equal(zero.documentos.total,0);
  });
  await t.test('historial de recuperación no se pierde al sustituir tokens y registra completadas',async()=>{
   const email=db.users.find(u=>u.id==='u009').email;
   const first=await(await tutor.post('/api/auth/forgot',{data:{email}})).json();const second=await(await tutor.post('/api/auth/forgot',{data:{email}})).json();assert.ok(first.devToken);assert.ok(second.devToken);
   const reset=await tutor.post('/api/auth/reset',{data:{token:second.devToken,newPassword:'Changed#2027',confirmNewPassword:'Changed#2027'}});assert.equal(reset.status(),200);
   const s=await(await admin.get('/api/analytics/summary')).json();assert.equal(s.totalResetsGenerados,2);assert.equal(s.totalResetsUsados,1);assert.equal(s.tasaRecuperacion,50);
  });
  browser=await chromium.launch();
  async function pageFor(id,options={}){const context=await browser.newContext(options);contexts.push(context);const page=await context.newPage();await page.goto(base+'/#/login');await page.locator('[name=email]').fill(db.users.find(u=>u.id===id).email);await page.locator('[name=password]').fill(password);await page.locator('#login-form button[type=submit]').click();await expect(page.locator('.main')).toBeVisible();return page;}
  await t.test('bandeja móvil oscura: teclado, lectura y contador al recargar, enlace real y error recuperable',async()=>{
   const page=await pageFor('u002',{viewport:{width:375,height:812},colorScheme:'dark'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.evaluate(()=>location.hash='#/app/notificaciones');await expect(page.locator('.main h2')).toHaveText('Notificaciones');
   const read=page.locator('[data-notification-read]').first();await read.focus();await page.keyboard.press('Enter');await expect(page.locator('.main .sub')).toContainText('1 no leídas');await page.reload();await expect(page.locator('.main .sub')).toContainText('1 no leídas');await expect(page.locator('#bell-btn')).toHaveAttribute('aria-label','Notificaciones: 1 no leídas');
   await page.locator('[data-notification-target]').filter({hasText:'Ver cita'}).first().click();await expect(page.locator('.main h2')).toHaveText('Cita '+appointment.id);
   await page.route('**/api/notifications?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"fallo"}'}));await page.evaluate(()=>location.hash='#/app/notificaciones');await expect(page.locator('#notifications-retry')).toBeVisible();await page.unroute('**/api/notifications?*');await page.locator('#notifications-retry').click();await expect(page.locator('.main h2')).toHaveText('Notificaciones');assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(dir,'notifications-mobile-dark.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  });
  await t.test('campana responde con teclado, marca leído y cierra con Escape',async()=>{
   const page=await pageFor('u002');await page.locator('#bell-btn').focus();await page.keyboard.press('Enter');await expect(page.locator('#notif-panel')).toBeVisible();const button=page.locator('#notif-panel [data-notification-read]').first();await button.focus();await page.keyboard.press('Enter');await expect(page.locator('#bell-btn')).toHaveAttribute('aria-label','Notificaciones: 0 no leídas');await page.locator('#notif-panel-viewall').focus();await page.keyboard.press('Escape');await expect(page.locator('#notif-panel')).toBeHidden();await expect(page.locator('#bell-btn')).toBeFocused();
  });
  await t.test('preferencias precargan; fallo conserva selección; Guardar reintenta y persiste',async()=>{
   const page=await pageFor('u002',{viewport:{width:375,height:812},colorScheme:'dark'});await page.evaluate(()=>location.hash='#/app/seguridad');const input=page.locator('#email-prefs-form [name=appointments]');await expect(input).not.toBeChecked();await input.check();await page.locator('#email-prefs-form [name=enrollment]').uncheck();
   await page.route('**/api/users/me/notification-prefs',route=>route.request().method()==='PUT'?route.fulfill({status:500,contentType:'application/json',body:'{"error":"fallo"}'}):route.continue());await page.locator('#email-prefs-form button').click();await expect(page.locator('#email-prefs-result')).toContainText('Tus cambios se conservan');await expect(input).toBeChecked();await expect(page.locator('#email-prefs-form [name=enrollment]')).not.toBeChecked();await page.unroute('**/api/users/me/notification-prefs');await page.locator('#email-prefs-form button').click();await expect(page.locator('#email-prefs-result')).toHaveText('Preferencias guardadas.');await page.reload();await expect(input).toBeChecked();await expect(page.locator('#email-prefs-form [name=enrollment]')).not.toBeChecked();await page.locator('#email-preferences').screenshot({path:path.join(dir,'preferences-mobile-dark.png')});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  });
  await t.test('panel Auditoría con filtros sincronizados, tabla accesible, cero, error y reintento',async()=>{
   const page=await pageFor('u007',{viewport:{width:375,height:812},colorScheme:'dark'});await page.locator('#sidebar-toggle').click();await page.locator('[data-nav="#/app/analiticas"]').first().click();await expect(page.locator('[data-metric="Citas agendadas"] .kpi-num')).toHaveText('1');
   await page.locator('#analytics-filters [name=institucionId]').selectOption('i002');await page.locator('#analytics-filters button').click();await expect(page.locator('[data-metric="Citas agendadas"] .kpi-num')).toHaveText('0');await expect(page.locator('[data-metric="Documentos subidos"] .kpi-num')).toHaveText('0');
   await page.locator('#analytics-filters [name=desde]').fill('2030-01-01');await page.locator('#analytics-filters [name=hasta]').fill('2030-01-01');await page.locator('#analytics-filters button').click();await expect(page.locator('[data-metric="Calificación promedio"] .kpi-num')).toHaveText('Sin datos');await expect(page.locator('[data-metric="Instituciones registradas"] .kpi-num')).toHaveText('0');
   await page.route('**/api/analytics/summary?*',route=>route.fulfill({status:503,contentType:'application/json',body:'{"error":"fallo"}'}));await page.locator('#analytics-filters button').click();await expect(page.locator('#analytics-retry')).toBeVisible();await expect(page.locator('[data-metric]')).toHaveCount(0);await page.unroute('**/api/analytics/summary?*');await page.locator('#analytics-retry').click();await expect(page.locator('[data-metric="Citas agendadas"] .kpi-num')).toHaveText('0');
   await page.locator('#analytics-filters [name=desde]').fill('');await page.locator('#analytics-filters [name=hasta]').fill('');await page.locator('#analytics-filters [name=institucionId]').selectOption('');await page.locator('#analytics-filters button').click();await expect(page.locator('[data-metric="Citas agendadas"] .kpi-num')).toHaveText('1');const summary=page.getByText('Ver tabla: Citas por institución',{exact:true});await summary.focus();await page.keyboard.press('Enter');await expect(page.locator('table').filter({has:page.locator('caption', {hasText:'Citas por institución'})})).toBeVisible();
   await page.screenshot({path:path.join(dir,'analytics-mobile-dark.png'),fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  });
  await t.test('menú de configuración abre sin consulta y cierra con teclado/foco exterior; manual vigente',async()=>{
   const page=await pageFor('u003');await page.locator('#settings-menu-btn').focus();await page.keyboard.press('Enter');await expect(page.locator('#settings-menu')).toBeVisible();await page.locator('#settings-menu a').first().focus();await page.keyboard.press('Escape');await expect(page.locator('#settings-menu')).toBeHidden();await page.locator('#settings-menu-btn').click();await page.locator('#bell-btn').focus();await expect(page.locator('#settings-menu')).toBeHidden();await page.evaluate(()=>location.hash='#/app/manual');await expect(page.locator('.main')).toContainText('Sin un periodo de inscripción abierto no se admiten envíos');
  });
  await t.test('abandono del borrador notifica una vez y ofrece resumen privado sin reactivar el proceso',async()=>{
    const d=(await(await tutor.post('/api/drafts',{data:{institucionId:'i001'}})).json()).draft;
    const state=JSON.parse(fs.readFileSync(dbp));state.drafts.find(x=>x.id===d.id).expiresAt=Date.now()-1;fs.writeFileSync(dbp,JSON.stringify(state));
    for(let i=0;i<2;i++)assert.equal((await tutor.get('/api/drafts/'+d.id)).status(),410);
    const list=await notices(),n=list.notifications.find(n=>n.resourceKind==='draft');assert.ok(n);assert.equal(list.notifications.filter(n=>n.eventId==='draft-abandoned:'+d.id).length,1);assert.equal((await otherTutor.get('/api/drafts/'+d.id+'/summary')).status(),403);
    const target=await(await tutor.get('/api/notifications/'+n.id+'/target')).json();const page=await pageFor('u002');await page.goto(base+'/'+target.url);await expect(page.locator('.main')).toContainText('Abandonada');await expect(page.locator('#student-sel')).toHaveCount(0);
  });
  await t.test('paginación web mantiene contador global y panel en escritorio claro muestra datos reales',async()=>{
    const state=JSON.parse(fs.readFileSync(dbp)),recipient=state.users.find(u=>u.id==='u002');
    const notify=require(path.join(dir,'lib/notify'));
    for(let i=0;i<25;i++)notify.notifyUser(state,{recipient,campo:'Aviso de prueba '+i,nuevo:'En revisión',type:'enrollment',eventId:'page-event-'+i,entityId:'e67',url:'#/app/inscripciones/e67/detalle',institucionId:'i001'});
    fs.writeFileSync(dbp,JSON.stringify(state));
    const total=(await notices()).total,count=(await notices()).unreadCount;
    const page=await pageFor('u002');await page.evaluate(()=>location.hash='#/app/notificaciones');await expect(page.locator('.main .sub')).toContainText(count+' no leídas');await expect(page.locator('.main .notif-item')).toHaveCount(20);await page.locator('#notifications-next').click();await expect(page.locator('.main .notif-item')).toHaveCount(total-20);await expect(page.locator('#bell-btn')).toHaveAttribute('aria-label','Notificaciones: '+count+' no leídas');await page.locator('#notifications-prev').click();await expect(page.locator('.main .notif-item')).toHaveCount(20);
    const dashboard=await pageFor('u001',{viewport:{width:1280,height:900},colorScheme:'light'});await dashboard.evaluate(()=>location.hash='#/app/analiticas');await expect(dashboard.locator('[data-metric="Citas agendadas"] .kpi-num')).toHaveText('1');await expect(dashboard.locator('[data-metric="Correos enviados"] .kpi-num')).toHaveText('0');await expect(dashboard.locator('#analytics-content section')).toHaveCount(6);await expect(dashboard.locator('#analytics-content')).not.toContainText('undefined');await dashboard.screenshot({path:path.join(dir,'analytics-desktop-light.png')});
  });
  await t.test('lectura administrativa conserva auditoría existente una vez y no lee avisos de otro destinatario',async()=>{
    const state=JSON.parse(fs.readFileSync(dbp));require(path.join(dir,'lib/notify')).notifyAdmins(state,{affectedUser:state.users.find(u=>u.id==='u006'),campo:'Rol',anterior:'Administrador',nuevo:'Administrador',actor:state.users.find(u=>u.id==='u001')});fs.writeFileSync(dbp,JSON.stringify(state));
    const a=(await notices(admin)).notifications.find(n=>n.type==='accounts'),b=(await notices(support)).notifications.find(n=>n.type==='accounts');assert.ok(a);assert.ok(b);assert.notEqual(a.id,b.id);
    for(let i=0;i<2;i++)assert.equal((await admin.post('/api/notifications/'+a.id+'/read')).status(),200);
    assert.equal((await admin.post('/api/notifications/'+b.id+'/read')).status(),403);assert.equal((await notices(support)).notifications.find(n=>n.id===b.id).read,false);
    assert.equal(JSON.parse(fs.readFileSync(dbp)).logs.filter(l=>l.accion==='Notificación importante leída'&&l.entidadId===a.id).length,1);
  });
  console.log('Capturas F6/F7:',dir);
 }finally{await browser?.close();for(const c of contexts)await c.dispose?.();server.kill('SIGTERM');for(const [f,bytes]of protectedFiles)assert.deepEqual(fs.readFileSync(path.join(root,f)),bytes,'archivo protegido '+f);}
});
