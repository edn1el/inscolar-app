const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const FileSessionStore = require('./lib/session-store');

const DB_PATH = path.join(__dirname, 'data', 'db.json');
if (!fs.existsSync(DB_PATH)) {
  console.log('No se encontró data/db.json — generando datos de prueba...');
  require('./lib/seed');
}

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const institutionRoutes = require('./routes/institutions');
const enrollmentRoutes = require('./routes/enrollments');
const appointmentRoutes = require('./routes/appointments');
const miscRoutes = require('./routes/misc');
const ratingRoutes = require('./routes/ratings');
const documentRoutes = require('./routes/documents');
const auditRoutes = require('./routes/audit');
const periodRoutes = require('./routes/periods');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// En producción (detrás de un proxy como Render/Railway) hace falta esto
// para que Express confíe en el HTTPS que termina el proxy y las cookies
// "secure" funcionen bien.
if (isProd) app.set('trust proxy', 1);

app.use(express.json());
app.use(
  session({
    // Si no se define SESSION_SECRET en el entorno, se genera uno al azar
    // (sirve para correrlo en local) pero eso invalida las sesiones activas
    // cada vez que el proceso reinicia. En producción hay que fijar
    // SESSION_SECRET para que los usuarios no se desloguen en cada deploy.
    secret: process.env.SESSION_SECRET || crypto.randomBytes(24).toString('hex'),
    store: new FileSessionStore(path.join(__dirname, 'data', 'sessions.json')),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000,
      secure: isProd,
      sameSite: 'lax',
    },
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/institutions', institutionRoutes);
app.use('/api', enrollmentRoutes);
app.use('/api', appointmentRoutes);
app.use('/api', miscRoutes);
app.use('/api', ratingRoutes);
app.use('/api', documentRoutes);
app.use('/api', auditRoutes);
app.use('/api', periodRoutes);

app.use(express.static(path.join(__dirname, 'public')));

// SPA fallback: cualquier ruta no-API devuelve index.html (el router del frontend decide la vista)
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nInscolar (prototipo) corriendo en http://localhost:${PORT}\n`);
});
