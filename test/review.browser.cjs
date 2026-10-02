const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn} = require('node:child_process');
const {chromium, request, expect} = require('playwright/test');
const bcrypt = require('bcryptjs');

test('regresiones hasta F5.3 con datos aislados', {timeout:120000}, async t => {
 const root=path.resolve(__dirname,'..'), dir=fs.mkdtempSync(path.join(os.tmpdir(),'inscolar-review-'));
 for(const name of ['server.js','routes','lib','public']) fs.cpSync(path.join(root,name),path.join(dir,name),{recursive:true});
 fs.symlinkSync(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');
 fs.mkdirSync(path.join(dir,'data'));
 const dbp=path.join(dir,'data/db.json'), db=JSON.parse(fs.readFileSync(path.join(root,'data/db.json')));
 const protectedFiles=['data/db.json','test_puppeteer.js'].filter(f=>fs.existsSync(path.join(root,f))).map(f=>[f,fs.readFileSync(path.join(root,f))]);
 const password='Review#2026';
 db.users.forEach(u=>Object.assign(u,{estado:'Activo',passwordHash:bcrypt.hashSync(password,4),mfaEnabled:false,mustChangePassword:false}));
 db.periods=db.periods.filter(p=>p.institucionId!=='i001');
 db.periods.push({id:'reviewper',institucionId:'i001',cicloEscolar:'2026-2027',inscripcion:{desde:'2026-01-01T00:00:00Z',hasta:'2027-12-31T00:00:00Z'},documentos:{desde:'2026-01-01T00:00:00Z',hasta:'2027-12-31T00:00:00Z'},documentosRequeridos:[{nombre:'Acta de prueba',niveles:['Primaria'],formatos:['PDF'],maxMb:1},{nombre:'Solo secundaria',niveles:['Secundaria'],formatos:['PNG'],maxMb:1}]});
 db.students.push({id:'reviewstudent',tutorId:'u002',nombre:'Estudiante de prueba',fechaNacimiento:'2015-01-01'});
 db.enrollments.push({id:'reviewold',studentId:'reviewstudent',tutorId:'u002',institucionId:'i002',cicloEscolar:'2025-2026',estado:'Pendiente',createdAt:'2025-01-01T00:00:00Z'});
 fs.writeFileSync(dbp,JSON.stringify(db));
 const net=require('node:net'), sock=net.createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));const port=sock.address().port;await new Promise(r=>sock.close(r));
 const server=spawn(process.execPath,['server.js'],{cwd:dir,env:{...process.env,PORT:String(port),DB_PATH:dbp},stdio:['ignore','pipe','pipe']});
 let browser;const contexts=[];
 try {
  await new Promise((resolve,reject)=>{server.stdout.on('data',c=>{if(String(c).includes('corriendo en'))resolve()});server.once('error',reject);server.stderr.on('data',c=>reject(Error(String(c))));});
  const base=`http://127.0.0.1:${port}`;
  async function login(id){const c=await request.newContext({baseURL:base});contexts.push(c);const u=db.users.find(u=>u.id===id);assert.equal((await c.post('/api/auth/login',{data:{email:u.email,password}})).status(),200);return c;}
  const tutor=await login('u002'),victim=await login('u008'),admin=await login('u001'),support=await login('u004');
  const data={studentId:'new',newStudent:{nombre:'Nuevo sin duplicados',fechaNacimiento:'2015-01-01'},institucionId:'i001',gradoSolicitado:'1ro de Primaria',cicloEscolar:'2026-2027'};
  const draft=await(await tutor.post('/api/drafts?expire_mins=-1',{data})).json();
  const upload=(c,id,buffer=Buffer.from('%PDF-1.4\nprueba\n%%EOF'),mimeType='application/pdf',name='prueba.pdf')=>c.post(`/api/drafts/${id}/documents`,{multipart:{tipoDocumento:'Acta de prueba',archivo:{name,mimeType,buffer}}});
  await t.test('duración fija de 20 minutos',()=>assert.ok(draft.draft.expiresAt-Date.now()>19*60000));
  await t.test('no se pueden asociar borradores ajenos',async()=>assert.equal((await victim.post('/api/enrollments',{data:{...data,draftId:draft.draft.id}})).status(),403));
  await t.test('formato y límite del requisito en servidor',async()=>{
   assert.equal((await upload(tutor,draft.draft.id,Buffer.alloc(2*1024*1024))).status(),400);
   assert.equal((await upload(tutor,draft.draft.id,Buffer.from('falso'),'image/png','falso.png')).status(),400);
  });
  await t.test('documento devuelve tipo y duplicados pendientes se rechazan',async()=>{const r=await upload(tutor,draft.draft.id);assert.equal(r.status(),200);assert.equal((await r.json()).document.tipoDocumento,'Acta de prueba');assert.equal((await upload(tutor,draft.draft.id)).status(),400);});
  let enrollment;
  await t.test('envío atómico e idempotente del estudiante y borrador',async()=>{const before=JSON.parse(fs.readFileSync(dbp)).students.length;for(let i=0;i<2;i++){const r=await tutor.post('/api/enrollments',{data:{...data,draftId:draft.draft.id}});assert.equal(r.status(),200);const e=(await r.json()).enrollment;if(enrollment)assert.equal(e.id,enrollment.id);enrollment=e;}assert.equal(JSON.parse(fs.readFileSync(dbp)).students.length,before+1);assert.deepEqual(enrollment.requisitosSnapshot.map(r=>r.tipo),['Acta de prueba']);});
  await t.test('borrador enviado no admite cargas',async()=>assert.equal((await upload(tutor,draft.draft.id)).status(),404));
  await t.test('fallo de envío no crea estudiantes',async()=>{const before=JSON.parse(fs.readFileSync(dbp)).students.length;const bad={...data,institucionId:'inexistente'};const d=(await(await tutor.post('/api/drafts',{data:bad})).json()).draft;assert.equal((await tutor.post('/api/enrollments',{data:{...bad,draftId:d.id}})).status(),400);assert.equal(JSON.parse(fs.readFileSync(dbp)).students.length,before);});
  await t.test('solicitud enviada no abandona por antigüedad',async()=>{const r=await(await tutor.get('/api/enrollments')).json();assert.equal(r.enrollments.find(e=>e.id==='reviewold').estado,'Pendiente');});
  await t.test('Soporte no desactiva instituciones',async()=>assert.equal((await support.post('/api/institutions/i001/toggle-estado')).status(),403));
  await t.test('ciclo asociado no se elimina',async()=>assert.equal((await admin.delete('/api/institutions/i001/periods/reviewper')).status(),400));
  await t.test('rangos iguales inválidos y hora de cierre exacta',async()=>{assert.equal((await admin.put('/api/institutions/i001/periods/reviewper',{data:{inscripcion:{desde:'2026-10-02T12:00:00Z',hasta:'2026-10-02T12:00:00Z'}}})).status(),400);assert.equal(require('../lib/periods').withinRange({desde:'2026-10-02T08:00:00Z',hasta:'2026-10-02T10:00:00Z'},new Date('2026-10-02T18:00:00Z')),false);});
  await t.test('borrador vencido no revive y se audita una sola vez',async()=>{
   const d=(await(await tutor.post('/api/drafts',{data})).json()).draft;
   const state=JSON.parse(fs.readFileSync(dbp));state.drafts.find(x=>x.id===d.id).expiresAt=Date.now()-1;fs.writeFileSync(dbp,JSON.stringify(state));
   assert.equal((await upload(tutor,d.id)).status(),404);
   for(let i=0;i<2;i++)assert.equal((await tutor.get('/api/drafts/'+d.id)).status(),410);
   const after=JSON.parse(fs.readFileSync(dbp));assert.equal(after.logs.filter(l=>l.entidadId===d.id && l.accion==='Borrador abandonado por inactividad').length,1);
  });
  await t.test('correcciones exigen reemplazo y conservan motivos e historial',async()=>{
   let docs=await(await tutor.get('/api/enrollments/'+enrollment.id+'/documents')).json();const doc=docs.documents[0];
   assert.equal((await admin.post('/api/documents/'+doc.id+'/decidir',{data:{estado:'Rechazado',motivo:'Ilegible'}})).status(),200);
   assert.equal((await tutor.post('/api/enrollments/'+enrollment.id+'/correcciones')).status(),400);
   const r=await tutor.post('/api/enrollments/'+enrollment.id+'/documents',{multipart:{tipoDocumento:'Acta de prueba',archivo:{name:'corregido.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\ncorregido\n%%EOF')}}});assert.equal(r.status(),200);
   const sent=await tutor.post('/api/enrollments/'+enrollment.id+'/correcciones');assert.equal(sent.status(),200);assert.equal((await sent.json()).enrollment.estado,'En revisión');
   docs=await(await tutor.get('/api/enrollments/'+enrollment.id+'/documents')).json();assert.equal(docs.documents.length,2);assert.equal(docs.documents.find(d=>d.id===doc.id).motivoRechazo,'Ilegible');
  });
  await t.test('ocupación cuenta la fecha agendada y bloquea reducir cupos',async()=>{
   const state=JSON.parse(fs.readFileSync(dbp));state.periods.find(p=>p.id==='reviewper').citas={desde:'2026-01-01T00:00:00Z',hasta:'2027-12-31T00:00:00Z',limiteCitas:3};
   for(let i=0;i<2;i++)state.appointments.push({id:'reviewappointment'+i,institucionId:'i001',tutorId:'u002',estado:'Confirmada',createdAt:'2025-01-01T00:00:00Z',fechaHoraSolicitada:'2026-12-01T10:00:00Z'});fs.writeFileSync(dbp,JSON.stringify(state));
   const r=await(await admin.get('/api/institutions/i001/periods')).json();assert.ok(r.periods.find(p=>p.id==='reviewper').citas.ocupados>=2);
   assert.equal((await admin.put('/api/institutions/i001/periods/reviewper',{data:{citas:{desde:'2026-01-01T00:00:00Z',hasta:'2027-12-31T00:00:00Z',limiteCitas:1}}})).status(),400);
  });
  await t.test('municipios provinciales y paginación vacía',async()=>{
   const r=await(await admin.get('/api/institutions?provincia=El%C3%ADas%20Pi%C3%B1a')).json();assert.ok(r.municipios.every(m=>db.institutions.some(i=>i.provincia==='Elías Piña' && i.municipio===m)));
   const empty=await(await admin.get('/api/institutions?q=NO_EXISTE_REVIEW&page=1&limit=10')).json();assert.equal(empty.totalFiltradas,0);assert.equal(empty.institutions.length,0);assert.equal((await admin.get('/api/institutions?page=-1&limit=10')).status(),400);
  });
  browser=await chromium.launch();
  await t.test('wizard conserva contacto al volver y recargar; requisito F4 renderiza',async()=>{
   const context=await browser.newContext();contexts.push(context);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const u=db.users.find(u=>u.id==='u002');await page.goto(base+'/#/login');await page.locator('[name=email]').fill(u.email);await page.locator('[name=password]').fill(password);await page.locator('#login-form button[type=submit]').click();await expect(page.locator('.main')).toContainText(u.email);
   await page.evaluate(()=>location.hash='#/app/inscripciones/nueva?inst=i001');await page.locator('#student-sel').selectOption('reviewstudent');await page.locator('#step-form button[type=submit]').click();await page.locator('[name=tutorPhone]').fill('8095550123');await page.locator('[name=tutorName]').fill('Contacto guardado');await page.locator('#btn-back-step').click();await page.locator('#step-form button[type=submit]').click();await expect(page.locator('[name=tutorName]')).toHaveValue('Contacto guardado');await page.reload();await expect(page.locator('[name=tutorPhone]')).toHaveValue('8095550123');await page.locator('#step-form button[type=submit]').click();await page.locator('[name=gradoSolicitado]').selectOption('1ro de Primaria');await page.locator('[name=cicloEscolar]').selectOption('2026-2027');await page.locator('#btn-next-3').click();await expect(page.locator('#docs-list')).toContainText('Acta de prueba');await expect(page.locator('#docs-list')).not.toContainText('Solo secundaria');assert.deepEqual(errors,[]);
  });
  await t.test('aviso a los 10 minutos y cierre a los 20 con reloj simulado',async()=>{
   const context=await browser.newContext();contexts.push(context);const page=await context.newPage();const u=db.users.find(u=>u.id==='u002');await page.goto(base+'/#/login');await page.locator('[name=email]').fill(u.email);await page.locator('[name=password]').fill(password);await page.locator('#login-form button[type=submit]').click();await expect(page.locator('.main')).toContainText(u.email);
   await page.clock.install();await page.evaluate(()=>location.hash='#/app/inscripciones/nueva');await page.locator('#student-sel').waitFor();await page.clock.fastForward(10*60000+1000);await expect(page.locator('#btn-continue-draft')).toBeVisible();await page.clock.fastForward(10*60000);await expect(page.locator('.main')).toContainText('Borrador expirado');
  });
  await t.test('contador vacío y móvil oscuro sin desbordamiento',async()=>{
   const context=await browser.newContext({viewport:{width:320,height:812},colorScheme:'dark'});contexts.push(context);const page=await context.newPage();const u=db.users.find(u=>u.id==='u001');await page.goto(base+'/#/login');await page.locator('[name=email]').fill(u.email);await page.locator('[name=password]').fill(password);await page.locator('#login-form button[type=submit]').click();await expect(page.locator('.main')).toContainText(u.email);
   await page.evaluate(()=>location.hash='#/app/instituciones?q=NO_EXISTE_REVIEW');await expect(page.locator('.table-footer')).toContainText('de 0 instituciones');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
  });
 } finally {
  if(browser)await browser.close();for(const c of contexts) { if (c.dispose) await c.dispose(); else if (c.close) await c.close(); }server.kill();await new Promise(r=>server.once('exit',r));
  for(const [f,original] of protectedFiles)assert.deepEqual(fs.readFileSync(path.join(root,f)),original);
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
