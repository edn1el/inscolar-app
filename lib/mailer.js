const { nextId, save } = require('./db');
const { logEvent } = require('./audit');

// HU062: envio de notificaciones por correo electronico.
// Si el entorno tiene configuradas variables SMTP_*, se intenta un envio real
// via nodemailer. Si no (el caso por defecto en este prototipo, ya que no se
// cuenta con credenciales SMTP reales), se "simula" el envio: no se lanza un
// error ni se bloquea al usuario, y el correo queda registrado igualmente en
// db.emailLog para poder verificar el flujo (mismo patron que ya se usa para
// los codigos MFA y los tokens de recuperacion de contraseña: "sin servicio
// real, se deja constancia para poder probar el flujo").
let cachedTransporter;
let cachedKey;

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;
  const key = `${SMTP_HOST}:${SMTP_PORT}:${SMTP_USER}`;
  if (cachedTransporter && cachedKey === key) return cachedTransporter;
  const nodemailer = require('nodemailer');
  cachedTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  cachedKey = key;
  return cachedTransporter;
}

// No lanza errores: un fallo al enviar/registrar un correo nunca debe
// interrumpir la accion original (creacion de inscripcion, cambio de estado, etc.)
// que disparo la notificacion. Se llama sin esperar (fire-and-forget) desde lib/notify.js.
async function sendMail(db, { to, subject, text, html }) {
  const entry = {
    id: nextId(db.emailLog, 'em'),
    to,
    subject,
    text: text || '',
    sentAt: new Date().toISOString(),
    via: 'simulado (sin SMTP configurado)',
  };
  try {
    const transporter = getTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        html: html || undefined,
      });
      entry.via = 'smtp';
    }
  } catch (e) {
    entry.via = 'error: ' + (e && e.message ? e.message : String(e));
  }
  // HU126/HU127: el intento queda en la auditoría con el destinatario protegido y el
  // resultado; nunca el cuerpo del mensaje (puede llevar códigos o enlaces).
  const fallo = entry.via.startsWith('error');
  logEvent(db, {
    actor: null,
    accion: fallo ? 'Error al enviar correo' : 'Correo enviado',
    entidad: 'Correo',
    entidadId: entry.id,
    detalle: subject,
    motivo: fallo ? entry.via.replace(/^error:\s*/, '').slice(0, 200) : undefined,
    datos: {
      destinatario: String(to || '').replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '•'.repeat(Math.min(b.length, 4)) + c),
      asunto: subject,
      proveedor: entry.via === 'smtp' ? 'SMTP' : fallo ? 'SMTP' : 'Simulado (sin SMTP)',
      resultado: entry.via === 'smtp' ? 'Aceptado por proveedor' : fallo ? 'Fallido' : 'Simulado',
    },
  });
  try {
    db.emailLog.unshift(entry);
    save(db);
  } catch (e) {
    // no-op: el registro del correo nunca debe tumbar la operacion principal.
  }
  return entry;
}

module.exports = { sendMail };
