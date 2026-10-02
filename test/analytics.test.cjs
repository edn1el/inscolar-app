const {test}=require('node:test'),assert=require('node:assert/strict');
const {summary}=require('../lib/analytics-service');
const admin={id:'a',role:'Administrador'};
const at='2026-10-02T14:00:00Z';
function data(){return {users:[{id:'a',role:'Administrador',estado:'Activo',createdAt:at},{id:'t',role:'Tutor',createdAt:at},{id:'p',role:'Personal de institución',institucionId:'i1',createdAt:at}],institutions:[{id:'i1',nombre:'Uno',provincia:'P1',createdAt:at},{id:'i2',nombre:'Dos',provincia:'P2',createdAt:at}],enrollments:[{id:'e1',institucionId:'i1',estado:'Aprobada',createdAt:at},{id:'e2',institucionId:'i1',estado:'En revisión',createdAt:at},{id:'e3',institucionId:'i2',estado:'Rechazada',createdAt:at}],appointments:[{id:'a1',institucionId:'i1',estado:'Confirmada',createdAt:at},{id:'a2',institucionId:'i2',estado:'Rechazada',createdAt:at}],documents:[{enrollmentId:'e1',estado:'Aceptado',uploadedAt:at},{enrollmentId:'e2',estado:'Rechazado',uploadedAt:at},{enrollmentId:'e2',estado:'Pendiente',uploadedAt:at}],ratings:[{institucionId:'i1',estrellas:5,createdAt:at},{institucionId:'i1',estrellas:5,createdAt:at},{institucionId:'i2',estrellas:1,createdAt:at}],reports:[{institucionId:'i1',createdAt:at},{institucionId:'i1',createdAt:at},{institucionId:'i2',createdAt:at}],notifications:[{recipientId:'t',read:true,institucionId:'i1',createdAt:at},{recipientId:'t',read:false,institucionId:'i2',createdAt:at}],emailLog:[{id:'m1',outboxId:'o1',status:'Accepted',institucionId:'i1',acceptedAt:at},{id:'m2',outboxId:'o1',status:'Accepted',institucionId:'i1',acceptedAt:at},{id:'m3',via:'simulado (sin SMTP)',sentAt:at},{id:'m4',status:'Failed',createdAt:at}],emailOutbox:[],recoveryRequests:[{userId:'t',createdAt:at,completedAt:at},{userId:'p',createdAt:at,completedAt:null}]};}
test('fixture verificable: estados legacy, promedio ponderado, reportes y correos reales',()=>{
 const s=summary(data(),admin);assert.equal(s.totalUsuarios,3);assert.equal(s.totalInstituciones,2);assert.equal(s.promedioCalificaciones,3.67);assert.equal(s.promedioReportes,1.5);assert.deepEqual(s.inscripciones,{total:3,aprobadas:1,rechazadas:1,pendientes:1,abandonadas:0,canceladas:0,borradores:0});assert.equal(s.documentos.total,3);assert.equal(s.documentos.aceptados,1);assert.equal(s.citas.confirmadas,1);assert.equal(s.citas.rechazadas,1);assert.equal(s.totalCorreosEnviados,1);assert.equal(s.correosSimulados,1);assert.equal(s.notificacionesLeidas,1);assert.equal(s.tasaRecuperacion,50);
});
test('institución aplica el mismo ámbito a todos los grupos y no depende de páginas',()=>{
 const db=data();db.notifications[0].entityId='e1';delete db.notifications[0].institucionId;const s=summary(db,admin,{institucionId:'i1'});assert.equal(s.totalUsuarios,1);assert.equal(s.totalInstituciones,1);assert.equal(s.inscripciones.total,2);assert.equal(s.documentos.total,3);assert.equal(s.citas.total,1);assert.equal(s.promedioCalificaciones,5);assert.equal(s.totalReportes,2);assert.equal(s.totalNotificaciones,1);assert.equal(s.citasPorInstitucion.length,1);assert.deepEqual(s.reportesPorProvincia,[{provincia:'P1',count:2}]);
});
test('filtro sin resultados: cero en conteos, Sin datos en tasas/promedios',()=>{
 const s=summary(data(),admin,{desde:'2030-01-01',hasta:'2030-01-01'});assert.equal(s.totalUsuarios,0);assert.equal(s.inscripciones.total,0);assert.equal(s.citas.total,0);assert.equal(s.promedioCalificaciones,null);assert.equal(s.tasaRecuperacion,null);assert.equal(s.totalCorreosEnviados,0);assert.equal(s.notificacionesLeidas,0);
});
test('fecha es inclusiva en America/Santo_Domingo, no en zona del proceso',()=>{
 const db=data();db.appointments=[{institucionId:'i1',createdAt:'2026-10-02T03:59:59Z'},{institucionId:'i1',createdAt:'2026-10-02T04:00:00Z'},{institucionId:'i1',createdAt:'2026-10-03T03:59:59Z'},{institucionId:'i1',createdAt:'2026-10-03T04:00:00Z'}];assert.equal(summary(db,admin,{desde:'2026-10-02',hasta:'2026-10-02'}).citas.total,2);
});
test('Tutor y Personal no consultan métricas; Auditoría y Soporte sí',()=>{
 for(const role of ['Tutor','Personal de institución'])assert.throws(()=>summary(data(),{role}),e=>e.status===403);
 for(const role of ['Auditoría','Soporte'])assert.equal(summary(data(),{role}).totalUsuarios,3);
});
test('filtros inválidos se rechazan, sin convertir error en métricas cero',()=>{
 for(const query of [{desde:'2026-02-30'},{desde:'bad'},{desde:'2026-10-03',hasta:'2026-10-02'}])assert.throws(()=>summary(data(),admin,query),e=>e.status===400);
 assert.throws(()=>summary(data(),admin,{institucionId:'missing'}),e=>e.status===404);
});
