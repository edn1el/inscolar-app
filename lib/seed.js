// Genera/reinicia data/db.json con datos de prueba.
// Uso: npm run reset-data
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { coordsForInstitution } = require('./geo');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const UPLOADS_DIR = path.join(__dirname, '..', 'data', 'uploads');
const DEFAULT_PASSWORD = 'Inscolar#2026';

function hash(pw) {
  return bcrypt.hashSync(pw, 10);
}

// ---- archivo de ejemplo para los documentos de prueba (HU085-HU088) ----
// PNG 1x1 transparente valido, para que "Ver documento" siempre tenga un
// archivo real que mostrar en el navegador.
const PLACEHOLDER_DOC_FILE = 'seed-documento-ejemplo.png';
const PLACEHOLDER_DOC_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function ensurePlaceholderDocFile() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const dest = path.join(UPLOADS_DIR, PLACEHOLDER_DOC_FILE);
  if (!fs.existsSync(dest)) {
    fs.writeFileSync(dest, Buffer.from(PLACEHOLDER_DOC_BASE64, 'base64'));
  }
}

// ---- fotos/portada de ejemplo para algunas instituciones (HU: fondo real + overlay) ----
// Las imagenes fuente viven en data/seed-assets/instituciones/ (versionadas en git) y se
// copian a data/uploads/instituciones/ (no versionado) cada vez que se corre el seed.
const INSTITUTION_PHOTOS_SRC_DIR = path.join(__dirname, '..', 'data', 'seed-assets', 'instituciones');
const INSTITUTION_PHOTOS_DIR = path.join(__dirname, '..', 'data', 'uploads', 'instituciones');
const INSTITUTION_PHOTO_MAP = {
  'Colegio San Rafael': 'foto-san-rafael.jpg',
  'Liceo Matutino Duarte': 'foto-liceo-duarte.jpg',
  'Colegio Loyola': 'foto-loyola.jpg',
};

function ensureInstitutionPhotos() {
  if (!fs.existsSync(INSTITUTION_PHOTOS_DIR)) fs.mkdirSync(INSTITUTION_PHOTOS_DIR, { recursive: true });
  for (const [nombre, filename] of Object.entries(INSTITUTION_PHOTO_MAP)) {
    const src = path.join(INSTITUTION_PHOTOS_SRC_DIR, filename);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(INSTITUTION_PHOTOS_DIR, filename));
    const inst = institutions.find((i) => i.nombre === nombre);
    if (inst) {
      inst.foto = { storageFile: filename, mimeType: 'image/jpeg', uploadedAt: '2026-08-01T09:00:00.000Z' };
    }
  }
}

const institutionNames = [
  ['Colegio San Rafael', 'Santo Domingo', '10-02'],
  ['Liceo Matutino Duarte', 'Duarte', '07-01'],
  ['Escuela Básica Juan Pablo Duarte', 'Santo Domingo', '10-05'],
  ['Colegio Loyola', 'Santiago', '08-01'],
  ['Liceo Vespertino Independencia', 'Distrito Nacional', '15-01'],
  ['Escuela Primaria Las Flores', 'Santo Domingo', '10-03'],
  ['Colegio Santa Teresa de Jesús', 'Santiago', '08-02'],
  ['Liceo Eugenio María de Hostos', 'Distrito Nacional', '15-02'],
  ['Escuela José Martí', 'La Vega', '09-01'],
  ['Colegio Nuevo Amanecer', 'San Cristóbal', '18-01'],
  ['Liceo Gastón Fernando Deligne', 'Puerto Plata', '06-01'],
  ['Escuela Padre Fantino Falco', 'Santo Domingo', '10-06'],
  ['Colegio Sagrado Corazón', 'Santiago', '08-03'],
  ['Liceo Profesor Juan Bosch', 'La Vega', '09-02'],
  ['Escuela Ercilia Pepín', 'Distrito Nacional', '15-03'],
  ['Colegio Metodista', 'Santo Domingo', '10-07'],
  ['Liceo Matutino Salomé Ureña', 'La Altagracia', '11-01'],
  ['Escuela Básica María Trinidad Sánchez', 'Santiago', '08-04'],
  ['Colegio Santo Tomás de Aquino', 'Santo Domingo', '10-08'],
  ['Liceo Nocturno Duarte', 'San Cristóbal', '18-02'],
  ['Escuela Fe y Alegría', 'Puerto Plata', '06-02'],
  ['Colegio Cristo Rey', 'Distrito Nacional', '15-04'],
  ['Liceo Pedro Henríquez Ureña', 'Santo Domingo', '10-09'],
  ['Escuela Básica Altagracia', 'Santiago', '08-05'],
];

// municipio / direccion / telefono, alineado por posicion con institutionNames.
const institutionDetails = [
  ['Santo Domingo Este', 'Av. San Vicente de Paúl #45', '(809) 555-2101'],
  ['San Francisco de Macorís', 'Calle Duarte #12', '(809) 555-2102'],
  ['Santo Domingo Norte', 'Calle Central #8', '(809) 555-2103'],
  ['Santiago de los Caballeros', 'Av. Estrella Sadhalá #120', '(809) 555-2104'],
  ['Distrito Nacional', 'Calle José Reyes #33', '(809) 555-2105'],
  ['Santo Domingo Oeste', 'Calle Las Flores #5', '(809) 555-2106'],
  ['Santiago de los Caballeros', 'Calle del Sol #77', '(809) 555-2107'],
  ['Distrito Nacional', 'Av. Independencia #210', '(809) 555-2108'],
  ['La Vega', 'Calle Restauración #19', '(809) 555-2109'],
  ['San Cristóbal', 'Calle Palo Hincado #4', '(809) 555-2110'],
  ['Puerto Plata', 'Calle Beller #56', '(809) 555-2111'],
  ['Santo Domingo Este', 'Calle Padre Fantino #2', '(809) 555-2112'],
  ['Santiago de los Caballeros', 'Av. Juan Pablo Duarte #300', '(809) 555-2113'],
  ['La Vega', 'Calle Pedro A. Rivera #14', '(809) 555-2114'],
  ['Distrito Nacional', 'Calle Hostos #88', '(809) 555-2115'],
  ['Santo Domingo Oeste', 'Calle Metodista #9', '(809) 555-2116'],
  ['Higüey', 'Av. Libertad #23', '(809) 555-2117'],
  ['Santiago de los Caballeros', 'Calle Sánchez #61', '(809) 555-2118'],
  ['Santo Domingo Este', 'Calle Santo Tomás #17', '(809) 555-2119'],
  ['Villa Altagracia', 'Calle Duarte #99', '(809) 555-2120'],
  ['Sosúa', 'Calle Pedro Clisante #40', '(809) 555-2121'],
  ['Distrito Nacional', 'Av. Cristo Rey #150', '(809) 555-2122'],
  ['Santo Domingo Norte', 'Calle Pedro Henríquez Ureña #6', '(809) 555-2123'],
  ['Santiago de los Caballeros', 'Calle Altagracia #33', '(809) 555-2124'],
];

const INACTIVE_INSTITUTIONS = new Set(['Liceo Nocturno Duarte', 'Escuela Fe y Alegría']);

const institutions = institutionNames.map(([nombre, provincia, distrito], i) => {
  const [municipio, direccion, telefono] = institutionDetails[i];
  const base = {
    id: 'i' + String(i + 1).padStart(3, '0'),
    nombre,
    provincia,
    distrito,
    municipio,
    tipo: nombre.startsWith('Colegio') ? 'Privado' : 'Público',
    direccion,
    telefono,
    estado: INACTIVE_INSTITUTIONS.has(nombre) ? 'Inactivo' : 'Activo',
    createdAt: '2025-08-01T09:00:00.000Z',
  };
  // HU021: coordenadas aproximadas para poder filtrar/ordenar por cercanía.
  const { lat, lng } = coordsForInstitution(base, i);
  return { ...base, lat, lng };
});

function institutionId(nombre) {
  const found = institutions.find((i) => i.nombre === nombre);
  return found ? found.id : null;
}

const now = '2026-08-25T09:00:00.000Z';

const users = [
  {
    id: 'u001', auditEnabled: true,
    nombre: 'María Altagracia Rosario',
    email: 'maria.rosario@inscolar.do',
    passwordHash: hash(DEFAULT_PASSWORD),
    passwordHistory: [],
    role: 'Administrador',
    institucionId: null,
    estado: 'Activo',
    sexo: 'Femenino',
    telefonoFijo: '',
    telefonoMovil: '(829) 214-8890',
    cedula: null,
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: '2025-11-05T13:58:00.000Z',
    lastAccess: now,
  },
  {
    id: 'u002',
    nombre: 'Ana Beltré Peña',
    email: 'ana.beltre@correo.do',
    passwordHash: hash(DEFAULT_PASSWORD),
    passwordHistory: [],
    role: 'Tutor',
    institucionId: null,
    estado: 'Activo',
    sexo: 'Femenino',
    telefonoFijo: '',
    telefonoMovil: '(809) 214-8890',
    cedula: '00112345678',
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: '2026-01-10T10:00:00.000Z',
    lastAccess: '2026-08-24T09:12:00.000Z',
  },
  {
    id: 'u003',
    nombre: 'José Manuel Cepeda',
    email: 'jm.cepeda@sanrafael.edu.do',
    passwordHash: hash(DEFAULT_PASSWORD),
    passwordHistory: [],
    role: 'Personal de institución',
    institucionId: institutionId('Colegio San Rafael'),
    estado: 'Activo',
    sexo: 'Masculino',
    telefonoFijo: '',
    telefonoMovil: '(809) 555-0199',
    cedula: null,
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: '2026-02-14T11:00:00.000Z',
    lastAccess: '2026-08-24T08:40:00.000Z',
  },
  {
    id: 'u004',
    nombre: 'Yorlenny Sánchez',
    email: 'y.sanchez@inscolar.do',
    passwordHash: hash(DEFAULT_PASSWORD),
    passwordHistory: [],
    role: 'Soporte',
    institucionId: null,
    estado: 'Inactivo',
    sexo: 'Femenino',
    telefonoFijo: '',
    telefonoMovil: '(809) 555-0142',
    cedula: null,
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: '2025-09-01T09:00:00.000Z',
    lastAccess: '2026-08-12T15:03:00.000Z',
  },
  {
    id: 'u005',
    nombre: 'Rafael Ureña Mota',
    email: 'r.urena@liceoduarte.edu.do',
    passwordHash: hash(DEFAULT_PASSWORD),
    passwordHistory: [],
    role: 'Personal de institución',
    institucionId: institutionId('Liceo Matutino Duarte'),
    estado: 'Activo',
    sexo: 'Masculino',
    telefonoFijo: '',
    telefonoMovil: '(809) 555-0166',
    cedula: null,
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: '2026-03-20T09:00:00.000Z',
    lastAccess: '2026-08-23T17:55:00.000Z',
  },
  {
    id: 'u006',
    nombre: 'Claribel Guzmán Ferreras',
    email: 'c.guzman@inscolar.do',
    passwordHash: hash(DEFAULT_PASSWORD),
    passwordHistory: [],
    role: 'Administrador',
    institucionId: null,
    estado: 'Activo',
    sexo: 'Femenino',
    telefonoFijo: '',
    telefonoMovil: '(809) 555-0177',
    cedula: null,
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: '2025-02-14T09:00:00.000Z',
    lastAccess: '2026-08-25T08:41:00.000Z',
  },
  {
    id: 'u007',
    nombre: 'Pedro Antonio Lluberes',
    email: 'p.lluberes@inscolar.do',
    passwordHash: hash(DEFAULT_PASSWORD),
    passwordHistory: [],
    role: 'Auditoría',
    institucionId: null,
    estado: 'Inactivo',
    sexo: 'Masculino',
    telefonoFijo: '',
    telefonoMovil: '(809) 555-0188',
    cedula: null,
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: '2025-06-01T09:00:00.000Z',
    lastAccess: '2026-08-01T11:20:00.000Z',
  },
  {
    id: 'u008',
    nombre: 'Rosa Elena Almonte Vargas',
    email: 'rosa.almonte@correo.do',
    passwordHash: hash(DEFAULT_PASSWORD),
    passwordHistory: [],
    role: 'Tutor',
    institucionId: null,
    estado: 'Activo',
    sexo: 'Femenino',
    telefonoFijo: '',
    telefonoMovil: '(809) 555-0311',
    cedula: '00198765432',
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: '2026-04-08T10:00:00.000Z',
    lastAccess: '2026-08-20T09:30:00.000Z',
  },
  {
    id: 'u009',
    nombre: 'Miguel Ángel Peña Reyes',
    email: 'miguel.pena@correo.do',
    passwordHash: hash(DEFAULT_PASSWORD),
    passwordHistory: [],
    role: 'Tutor',
    institucionId: null,
    estado: 'Activo',
    sexo: 'Masculino',
    telefonoFijo: '',
    telefonoMovil: '(809) 555-0322',
    cedula: null,
    mfaEnabled: false,
    mfaMethod: 'correo',
    mustChangePassword: false,
    createdAt: '2026-05-15T10:00:00.000Z',
    lastAccess: '2026-08-22T14:10:00.000Z',
  },
];

const notifications = [
  {
    id: 'n001',
    userId: 'u006',
    userNombre: 'Claribel Guzmán',
    campo: 'Rol',
    anterior: 'Soporte',
    nuevo: 'Administrador',
    actorId: 'u001',
    actorNombre: 'María Rosario',
    createdAt: '2026-08-25T08:41:00.000Z',
    read: false,
  },
  {
    id: 'n002',
    userId: 'u007',
    userNombre: 'Pedro A. Lluberes',
    campo: 'Contraseña restablecida',
    anterior: '',
    nuevo: '',
    actorId: 'u001',
    actorNombre: 'Carlos Peña',
    createdAt: '2026-08-24T17:12:00.000Z',
    read: false,
  },
  {
    id: 'n003',
    userId: 'u004',
    userNombre: 'Yorlenny Sánchez',
    campo: 'Estado',
    anterior: 'Activo',
    nuevo: 'Inactivo',
    actorId: 'u001',
    actorNombre: 'Carlos Peña',
    createdAt: '2026-08-12T15:03:00.000Z',
    read: false,
  },
];

const students = [
  { id: 's001', tutorId: 'u002', nombre: 'Kelvin Beltré Peña', fechaNacimiento: '2016-03-14', documento: '', createdAt: '2026-07-01T10:00:00.000Z' },
  { id: 's002', tutorId: 'u002', nombre: 'Génesis Beltré Peña', fechaNacimiento: '2019-11-02', documento: '', createdAt: '2026-07-01T10:05:00.000Z' },
  { id: 's003', tutorId: 'u008', nombre: 'Fernando Almonte Reyes', fechaNacimiento: '2017-05-20', documento: '', createdAt: '2026-07-15T09:00:00.000Z' },
  { id: 's004', tutorId: 'u009', nombre: 'Valentina Peña Cruz', fechaNacimiento: '2020-02-10', documento: '', createdAt: '2026-07-20T09:00:00.000Z' },
];

const enrollments = [
  {
    id: 'e001', studentId: 's001', tutorId: 'u002', institucionId: institutionId('Colegio San Rafael'),
    gradoSolicitado: '4to de Primaria', cicloEscolar: '2026-2027', estado: 'Pendiente',
    motivoRechazo: '', createdAt: '2026-08-20T09:00:00.000Z', decidedAt: null, decidedBy: null,
  },
  {
    id: 'e002', studentId: 's002', tutorId: 'u002', institucionId: institutionId('Liceo Matutino Duarte'),
    gradoSolicitado: 'Pre-Primario', cicloEscolar: '2026-2027', estado: 'Aprobada',
    motivoRechazo: '', createdAt: '2026-08-10T09:00:00.000Z', decidedAt: '2026-08-12T14:30:00.000Z', decidedBy: 'u005',
  },
  {
    id: 'e003', studentId: 's001', tutorId: 'u002', institucionId: institutionId('Colegio Loyola'),
    gradoSolicitado: '4to de Primaria', cicloEscolar: '2026-2027', estado: 'Rechazada',
    motivoRechazo: 'No hay cupo disponible para ese grado en este ciclo.', createdAt: '2026-08-05T09:00:00.000Z',
    decidedAt: '2026-08-07T11:00:00.000Z', decidedBy: 'u001',
  },
  {
    id: 'e004', studentId: 's003', tutorId: 'u008', institucionId: institutionId('Colegio Loyola'),
    gradoSolicitado: '5to de Primaria', cicloEscolar: '2026-2027', estado: 'Aprobada',
    motivoRechazo: '', createdAt: '2026-07-28T09:00:00.000Z', decidedAt: '2026-07-30T13:00:00.000Z', decidedBy: 'u001',
  },
  {
    id: 'e005', studentId: 's004', tutorId: 'u009', institucionId: institutionId('Escuela José Martí'),
    gradoSolicitado: 'Pre-Primario', cicloEscolar: '2026-2027', estado: 'Pendiente',
    motivoRechazo: '', createdAt: '2026-09-18T09:00:00.000Z', decidedAt: null, decidedBy: null,
  },
];

const appointments = [
  {
    id: 'c001', tutorId: 'u002', studentId: 's001', institucionId: institutionId('Colegio San Rafael'),
    motivo: 'Entrega de documentos', notas: 'Llevo el acta de nacimiento y las notas del año pasado.',
    fechaHoraSolicitada: '2026-09-02T14:00:00.000Z', fechaHoraConfirmada: null,
    estado: 'Pendiente', motivoCancelacion: '',
    createdAt: '2026-08-24T09:00:00.000Z', decidedAt: null, decidedBy: null,
  },
  {
    id: 'c002', tutorId: 'u002', studentId: 's002', institucionId: institutionId('Liceo Matutino Duarte'),
    motivo: 'Entrevista de admisión', notas: '',
    fechaHoraSolicitada: '2026-08-29T13:00:00.000Z', fechaHoraConfirmada: '2026-08-29T15:30:00.000Z',
    estado: 'Confirmada', motivoCancelacion: '',
    createdAt: '2026-08-18T09:00:00.000Z', decidedAt: '2026-08-19T11:00:00.000Z', decidedBy: 'u005',
  },
  {
    id: 'c003', tutorId: 'u002', studentId: null, institucionId: institutionId('Colegio Loyola'),
    motivo: 'Seguimiento académico', notas: '',
    fechaHoraSolicitada: '2026-08-15T16:00:00.000Z', fechaHoraConfirmada: null,
    estado: 'Cancelada', motivoCancelacion: 'El horario solicitado ya no está disponible, favor solicitar una nueva cita.',
    createdAt: '2026-08-09T09:00:00.000Z', decidedAt: '2026-08-10T10:00:00.000Z', decidedBy: 'u001',
  },
  {
    id: 'c004', tutorId: 'u008', studentId: 's003', institucionId: institutionId('Colegio Loyola'),
    motivo: 'Entrevista de admisión', notas: '',
    fechaHoraSolicitada: '2026-07-29T13:00:00.000Z', fechaHoraConfirmada: '2026-07-29T14:00:00.000Z',
    estado: 'Confirmada', motivoCancelacion: '',
    createdAt: '2026-07-25T09:00:00.000Z', decidedAt: '2026-07-26T10:00:00.000Z', decidedBy: 'u001',
  },
  {
    id: 'c005', tutorId: 'u009', studentId: 's004', institucionId: institutionId('Escuela José Martí'),
    motivo: 'Entrega de documentos', notas: 'Puedo asistir en horario de tarde.',
    fechaHoraSolicitada: '2026-09-20T15:00:00.000Z', fechaHoraConfirmada: '2026-09-20T15:30:00.000Z',
    estado: 'Confirmada', motivoCancelacion: '',
    createdAt: '2026-09-16T09:00:00.000Z', decidedAt: '2026-09-17T11:00:00.000Z', decidedBy: 'u006',
  },
];

// ---- calificaciones y reportes de instituciones (HU076-HU079) ----
const ratings = [
  { id: 'r001', institucionId: institutionId('Colegio San Rafael'), tutorId: 'u002', tutorNombre: 'Ana Beltré Peña', estrellas: 5, comentario: 'Excelente atención, el proceso de inscripción fue muy rápido.', createdAt: '2026-08-05T12:00:00.000Z', updatedAt: null },
  { id: 'r002', institucionId: institutionId('Colegio San Rafael'), tutorId: 'u008', tutorNombre: 'Rosa Elena Almonte Vargas', estrellas: 4, comentario: 'Buen colegio, aunque la comunicación por correo tardó un poco.', createdAt: '2026-08-10T09:30:00.000Z', updatedAt: null },
  { id: 'r003', institucionId: institutionId('Liceo Matutino Duarte'), tutorId: 'u002', tutorNombre: 'Ana Beltré Peña', estrellas: 5, comentario: 'Muy contenta con el seguimiento que le dan a mi hija.', createdAt: '2026-07-20T10:00:00.000Z', updatedAt: null },
  { id: 'r004', institucionId: institutionId('Colegio Loyola'), tutorId: 'u008', tutorNombre: 'Rosa Elena Almonte Vargas', estrellas: 5, comentario: 'Instalaciones excelentes y el personal fue muy amable en la cita.', createdAt: '2026-08-02T11:00:00.000Z', updatedAt: null },
  { id: 'r005', institucionId: institutionId('Colegio Loyola'), tutorId: 'u009', tutorNombre: 'Miguel Ángel Peña Reyes', estrellas: 3, comentario: 'El proceso de admisión fue algo lento, pero al final todo salió bien.', createdAt: '2026-08-15T16:00:00.000Z', updatedAt: null },
  { id: 'r006', institucionId: institutionId('Escuela José Martí'), tutorId: 'u009', tutorNombre: 'Miguel Ángel Peña Reyes', estrellas: 4, comentario: 'Buena atención, aunque el horario de citas es limitado.', createdAt: '2026-09-18T08:00:00.000Z', updatedAt: null },
  { id: 'r007', institucionId: institutionId('Liceo Vespertino Independencia'), tutorId: 'u002', tutorNombre: 'Ana Beltré Peña', estrellas: 2, comentario: 'Tardaron mucho en responder sobre el estado de la solicitud.', createdAt: '2026-07-28T14:00:00.000Z', updatedAt: null },
  { id: 'r008', institucionId: institutionId('Colegio Santa Teresa de Jesús'), tutorId: 'u008', tutorNombre: 'Rosa Elena Almonte Vargas', estrellas: 5, comentario: 'Todo el equipo docente muy comprometido.', createdAt: '2026-08-12T09:00:00.000Z', updatedAt: null },
  { id: 'r009', institucionId: institutionId('Escuela Primaria Las Flores'), tutorId: 'u009', tutorNombre: 'Miguel Ángel Peña Reyes', estrellas: 4, comentario: 'Buena experiencia en general.', createdAt: '2026-08-06T13:00:00.000Z', updatedAt: null },
  { id: 'r010', institucionId: institutionId('Colegio Sagrado Corazón'), tutorId: 'u002', tutorNombre: 'Ana Beltré Peña', estrellas: 5, comentario: 'Excelente comunicación durante todo el proceso.', createdAt: '2026-08-20T10:00:00.000Z', updatedAt: null },
  { id: 'r011', institucionId: institutionId('Liceo Eugenio María de Hostos'), tutorId: 'u008', tutorNombre: 'Rosa Elena Almonte Vargas', estrellas: 3, comentario: 'El proceso estuvo bien pero faltó más información sobre documentos requeridos.', createdAt: '2026-07-15T09:00:00.000Z', updatedAt: null },
  { id: 'r012', institucionId: institutionId('Colegio Metodista'), tutorId: 'u009', tutorNombre: 'Miguel Ángel Peña Reyes', estrellas: 5, comentario: 'Muy satisfecho con el trato recibido.', createdAt: '2026-08-22T15:00:00.000Z', updatedAt: null },
];

const reports = [
  { id: 'rp001', institucionId: institutionId('Liceo Vespertino Independencia'), tutorId: 'u002', tutorNombre: 'Ana Beltré Peña', motivo: 'Trato inadecuado', descripcion: 'El personal administrativo fue cortante al solicitar información sobre el estado de mi solicitud.', estado: 'Pendiente', createdAt: '2026-07-29T09:00:00.000Z' },
  { id: 'rp002', institucionId: institutionId('Escuela José Martí'), tutorId: 'u009', tutorNombre: 'Miguel Ángel Peña Reyes', motivo: 'Información incorrecta', descripcion: 'Me indicaron un horario de cita que luego cambiaron sin avisar.', estado: 'Pendiente', createdAt: '2026-09-19T09:00:00.000Z' },
  { id: 'rp003', institucionId: institutionId('Colegio Loyola'), tutorId: 'u008', tutorNombre: 'Rosa Elena Almonte Vargas', motivo: 'Cobros indebidos', descripcion: 'Se me solicitó un pago adicional no especificado en el proceso de admisión.', estado: 'Pendiente', createdAt: '2026-08-16T09:00:00.000Z' },
  { id: 'rp004', institucionId: institutionId('Colegio San Rafael'), tutorId: 'u002', tutorNombre: 'Ana Beltré Peña', motivo: 'Otro', descripcion: 'El sistema de turnos para citas presenciales no estaba organizado.', estado: 'Pendiente', createdAt: '2026-08-11T09:00:00.000Z' },
  { id: 'rp005', institucionId: institutionId('Liceo Eugenio María de Hostos'), tutorId: 'u008', tutorNombre: 'Rosa Elena Almonte Vargas', motivo: 'Información incorrecta', descripcion: 'La lista de documentos requeridos publicada no coincidía con la solicitada en persona.', estado: 'Pendiente', createdAt: '2026-07-16T09:00:00.000Z' },
];

// ---- documentos adjuntos a solicitudes de inscripcion (HU085-HU088) ----
function doc(id, enrollmentId, tutorId, tipoDocumento, nombreArchivo, estado, uploadedAt, decidedAt, decidedBy, motivoRechazo) {
  const enrollment = enrollments.find((e) => e.id === enrollmentId);
  return {
    id,
    enrollmentId,
    institucionId: enrollment.institucionId,
    tutorId,
    tipoDocumento,
    nombreArchivo,
    storageFile: PLACEHOLDER_DOC_FILE,
    mimeType: 'image/png',
    size: 68,
    estado,
    motivoRechazo: motivoRechazo || '',
    uploadedAt,
    decidedAt: decidedAt || null,
    decidedBy: decidedBy || null,
  };
}

const documents = [
  doc('d001', 'e002', 'u002', 'Acta de nacimiento', 'acta_nacimiento_genesis.png', 'Aceptado', '2026-08-10T10:00:00.000Z', '2026-08-11T09:00:00.000Z', 'u005'),
  doc('d002', 'e002', 'u002', 'Cédula o identificación del tutor', 'cedula_ana_beltre.png', 'Aceptado', '2026-08-10T10:05:00.000Z', '2026-08-11T09:05:00.000Z', 'u005'),
  doc('d003', 'e001', 'u002', 'Acta de nacimiento', 'acta_nacimiento_kelvin.png', 'Pendiente', '2026-08-20T09:30:00.000Z'),
  doc('d004', 'e003', 'u002', 'Certificado de notas', 'certificado_notas_kelvin.png', 'Rechazado', '2026-08-05T09:30:00.000Z', '2026-08-07T11:00:00.000Z', 'u001', 'Documento ilegible, favor reenviar en mejor calidad.'),
  doc('d005', 'e004', 'u008', 'Acta de nacimiento', 'acta_nacimiento_fernando.png', 'Aceptado', '2026-07-28T09:30:00.000Z', '2026-07-30T13:00:00.000Z', 'u001'),
  doc('d006', 'e004', 'u008', 'Foto 2x2', 'foto_fernando.png', 'Aceptado', '2026-07-28T09:35:00.000Z', '2026-07-30T13:05:00.000Z', 'u001'),
  doc('d007', 'e005', 'u009', 'Acta de nacimiento', 'acta_nacimiento_valentina.png', 'Pendiente', '2026-09-18T09:30:00.000Z'),
];

// ---- periodos configurables de ciclo por institucion (HU040-HU042) ----
const periods = [
  {
    id: 'per001', institucionId: institutionId('Colegio San Rafael'), cicloEscolar: '2026-2027',
    inscripcion: { desde: '2026-06-01T00:00:00.000Z', hasta: '2026-10-15T00:00:00.000Z' },
    documentos: { desde: '2026-06-01T00:00:00.000Z', hasta: '2026-10-31T00:00:00.000Z' },
    citas: { desde: '2026-08-01T00:00:00.000Z', hasta: '2026-11-30T00:00:00.000Z', limiteCitas: 20 },
    documentosRequeridos: ['Acta de nacimiento', 'Cédula o identificación del tutor', 'Certificado de notas'],
    createdAt: '2026-05-20T09:00:00.000Z', updatedAt: '2026-05-20T09:00:00.000Z',
  },
  {
    id: 'per002', institucionId: institutionId('Liceo Matutino Duarte'), cicloEscolar: '2026-2027',
    inscripcion: { desde: '2026-06-01T00:00:00.000Z', hasta: '2026-11-01T00:00:00.000Z' },
    documentos: { desde: '2026-06-01T00:00:00.000Z', hasta: '2026-11-15T00:00:00.000Z' },
    citas: { desde: '2026-08-01T00:00:00.000Z', hasta: '2026-12-01T00:00:00.000Z', limiteCitas: 15 },
    documentosRequeridos: ['Acta de nacimiento', 'Cédula o identificación del tutor', 'Certificado de notas', 'Foto 2x2'],
    createdAt: '2026-05-22T09:00:00.000Z', updatedAt: '2026-05-22T09:00:00.000Z',
  },
  {
    id: 'per003', institucionId: institutionId('Colegio Loyola'), cicloEscolar: '2026-2027',
    inscripcion: { desde: '2026-05-01T00:00:00.000Z', hasta: '2026-08-31T00:00:00.000Z' },
    documentos: { desde: '2026-05-01T00:00:00.000Z', hasta: '2026-09-15T00:00:00.000Z' },
    citas: null,
    documentosRequeridos: ['Acta de nacimiento', 'Foto 2x2'],
    createdAt: '2026-04-15T09:00:00.000Z', updatedAt: '2026-04-15T09:00:00.000Z',
  },
  {
    id: 'per004', institucionId: institutionId('Escuela José Martí'), cicloEscolar: '2026-2027',
    inscripcion: null,
    documentos: null,
    citas: { desde: '2026-09-01T00:00:00.000Z', hasta: '2026-10-31T00:00:00.000Z', limiteCitas: 10 },
    documentosRequeridos: [],
    createdAt: '2026-08-20T09:00:00.000Z', updatedAt: '2026-08-20T09:00:00.000Z',
  },
];

// ---- bitacora de auditoria ----
function log(id, fecha, actorId, actorNombre, actorRole, accion, entidad, entidadId, detalle) {
  return { id, fecha, actorId, actorNombre, actorRole, accion, entidad: entidad || null, entidadId: entidadId || null, detalle: detalle || '' };
}

const logs = [
  log('log001', '2026-09-01T08:05:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Inicio de sesión exitoso', 'Usuario', 'u001'),
  log('log002', '2026-09-01T08:10:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Institución modificada', 'Institución', institutionId('Colegio San Rafael'), 'Colegio San Rafael'),
  log('log003', '2026-09-02T09:00:00.000Z', 'u003', 'José Manuel Cepeda', 'Personal de institución', 'Inicio de sesión exitoso', 'Usuario', 'u003'),
  log('log004', '2026-09-02T09:20:00.000Z', null, 'Sistema', null, 'Inicio de sesión fallido', 'Usuario', null, 'Intento con: desconocido@correo.do'),
  log('log005', '2026-09-03T10:00:00.000Z', 'u002', 'Ana Beltré Peña', 'Tutor', 'Cita creada', 'Cita', 'c001', 'Colegio San Rafael · Entrega de documentos'),
  log('log006', '2026-09-04T11:00:00.000Z', 'u006', 'Claribel Guzmán Ferreras', 'Administrador', 'Usuario creado', 'Usuario', 'u009', 'Miguel Ángel Peña Reyes (Tutor)'),
  log('log007', '2026-09-05T08:15:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Inicio de sesión exitoso', 'Usuario', 'u001', 'Con verificación en dos pasos'),
  log('log008', '2026-09-05T14:00:00.000Z', 'u005', 'Rafael Ureña Mota', 'Personal de institución', 'Inscripción aprobada', 'Inscripción', 'e002', ''),
  log('log009', '2026-09-06T09:30:00.000Z', 'u005', 'Rafael Ureña Mota', 'Personal de institución', 'Cita confirmada', 'Cita', 'c002', ''),
  log('log010', '2026-09-07T16:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Inscripción rechazada', 'Inscripción', 'e003', 'No hay cupo disponible para ese grado en este ciclo.'),
  log('log011', '2026-09-08T10:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Cita cancelada', 'Cita', 'c003', 'El horario solicitado ya no está disponible, favor solicitar una nueva cita.'),
  log('log012', '2026-09-09T09:00:00.000Z', 'u003', 'José Manuel Cepeda', 'Personal de institución', 'Documento subido', 'Documento', 'd003', 'Acta de nacimiento — acta_nacimiento_kelvin.png'),
  log('log013', '2026-09-10T11:00:00.000Z', 'u005', 'Rafael Ureña Mota', 'Personal de institución', 'Documento aceptado', 'Documento', 'd001', 'Acta de nacimiento'),
  log('log014', '2026-09-10T11:05:00.000Z', 'u005', 'Rafael Ureña Mota', 'Personal de institución', 'Documento aceptado', 'Documento', 'd002', 'Cédula o identificación del tutor'),
  log('log015', '2026-09-11T13:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Documento rechazado', 'Documento', 'd004', 'Documento ilegible, favor reenviar en mejor calidad.'),
  log('log016', '2026-09-12T08:30:00.000Z', 'u006', 'Claribel Guzmán Ferreras', 'Administrador', 'Institución creada', 'Institución', institutionId('Colegio Nuevo Amanecer'), 'Colegio Nuevo Amanecer'),
  log('log017', '2026-09-13T09:00:00.000Z', 'u006', 'Claribel Guzmán Ferreras', 'Administrador', 'Institución desactivada', 'Institución', institutionId('Liceo Nocturno Duarte'), 'Liceo Nocturno Duarte'),
  log('log018', '2026-09-14T10:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Usuario modificado', 'Usuario', 'u004', 'Campos: telefonoMovil'),
  log('log019', '2026-09-15T09:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Usuario desactivado', 'Usuario', 'u004', 'Yorlenny Sánchez'),
  log('log020', '2026-09-15T15:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Contraseña de usuario restablecida', 'Usuario', 'u007', 'Pedro Antonio Lluberes'),
  log('log021', '2026-09-16T09:00:00.000Z', 'u009', 'Miguel Ángel Peña Reyes', 'Tutor', 'Inscripción creada', 'Inscripción', 'e005', 'Escuela José Martí · Pre-Primario'),
  log('log022', '2026-09-16T09:30:00.000Z', 'u009', 'Miguel Ángel Peña Reyes', 'Tutor', 'Documento subido', 'Documento', 'd007', 'Acta de nacimiento — acta_nacimiento_valentina.png'),
  log('log023', '2026-09-16T14:00:00.000Z', 'u009', 'Miguel Ángel Peña Reyes', 'Tutor', 'Cita creada', 'Cita', 'c005', 'Escuela José Martí · Entrega de documentos'),
  log('log024', '2026-09-17T11:00:00.000Z', 'u006', 'Claribel Guzmán Ferreras', 'Administrador', 'Cita confirmada', 'Cita', 'c005', ''),
  log('log025', '2026-09-18T08:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Inicio de sesión exitoso', 'Usuario', 'u001'),
  log('log026', '2026-09-19T09:00:00.000Z', 'u007', 'Pedro Antonio Lluberes', 'Auditoría', 'Inicio de sesión fallido', 'Usuario', 'u007', 'Cuenta desactivada'),
  log('log027', '2026-09-20T10:00:00.000Z', 'u006', 'Claribel Guzmán Ferreras', 'Administrador', 'Periodo de ciclo creado', 'Periodo', 'per004', 'Escuela José Martí · ciclo 2026-2027'),
  log('log028', '2026-09-21T09:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Periodo de ciclo modificado', 'Periodo', 'per003', 'Colegio Loyola · ciclo 2026-2027'),
  log('log029', '2026-09-22T15:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Notificación importante leída', 'Notificación', 'n001', 'Rol · Claribel Guzmán'),
  log('log030', '2026-09-24T08:00:00.000Z', 'u006', 'Claribel Guzmán Ferreras', 'Administrador', 'Inicio de sesión exitoso', 'Usuario', 'u006'),
  log('log031', '2026-09-25T09:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Institución modificada', 'Institución', institutionId('Colegio Metodista'), 'Colegio Metodista'),
  log('log032', '2026-09-27T10:00:00.000Z', 'u001', 'María Altagracia Rosario', 'Administrador', 'Cierre de sesión', 'Usuario', 'u001'),
];

// ---- registro de correos enviados o simulados (HU062/HU066/HU094) ----
function email(id, to, subject, text, sentAt) {
  return { id, to, subject, text, sentAt, via: 'simulado (sin SMTP configurado)' };
}

const emailLog = [
  email('em001', 'maria.rosario@inscolar.do', 'Inscolar: actualización — Rol', 'Se registró un cambio en "Rol". De "Soporte" a "Administrador".\nUsuario afectado: Claribel Guzmán Ferreras.\nRegistrado por: María Altagracia Rosario.', '2026-08-25T08:41:00.000Z'),
  email('em002', 'c.guzman@inscolar.do', 'Inscolar: actualización — Rol', 'Se registró un cambio en "Rol". De "Soporte" a "Administrador".\nUsuario afectado: Claribel Guzmán Ferreras.\nRegistrado por: María Altagracia Rosario.', '2026-08-25T08:41:00.000Z'),
  email('em003', 'maria.rosario@inscolar.do', 'Inscolar: actualización — Contraseña restablecida', 'Se registró un cambio en "Contraseña restablecida".\nUsuario afectado: Pedro Antonio Lluberes.\nRegistrado por: María Altagracia Rosario.', '2026-09-15T15:00:00.000Z'),
  email('em004', 'c.guzman@inscolar.do', 'Inscolar: actualización — Contraseña restablecida', 'Se registró un cambio en "Contraseña restablecida".\nUsuario afectado: Pedro Antonio Lluberes.\nRegistrado por: María Altagracia Rosario.', '2026-09-15T15:00:00.000Z'),
  email('em005', 'maria.rosario@inscolar.do', 'Inscolar: actualización — Estado', 'Se registró un cambio en "Estado". De "Activo" a "Inactivo".\nUsuario afectado: Yorlenny Sánchez.\nRegistrado por: María Altagracia Rosario.', '2026-09-15T09:00:00.000Z'),
  email('em006', 'c.guzman@inscolar.do', 'Inscolar: actualización — Estado', 'Se registró un cambio en "Estado". De "Activo" a "Inactivo".\nUsuario afectado: Yorlenny Sánchez.\nRegistrado por: María Altagracia Rosario.', '2026-09-15T09:00:00.000Z'),
  email('em007', 'ana.beltre@correo.do', 'Inscolar: actualización — Estado de inscripción', 'Se registró un cambio en "Estado de inscripción". De "Pendiente" a "Aprobada".', '2026-09-05T14:00:00.000Z'),
  email('em008', 'ana.beltre@correo.do', 'Inscolar: actualización — Estado de inscripción', 'Se registró un cambio en "Estado de inscripción". De "Pendiente" a "Rechazada".', '2026-09-07T16:00:00.000Z'),
  email('em009', 'ana.beltre@correo.do', 'Inscolar: actualización — Estado de cita', 'Se registró un cambio en "Estado de cita". De "Pendiente" a "Confirmada".', '2026-09-06T09:30:00.000Z'),
  email('em010', 'ana.beltre@correo.do', 'Inscolar: actualización — Estado de cita', 'Se registró un cambio en "Estado de cita". De "Pendiente" a "Cancelada".', '2026-09-08T10:00:00.000Z'),
  email('em011', 'ana.beltre@correo.do', 'Inscolar: actualización — Estado de documento', 'Se registró un cambio en "Estado de documento". De "Pendiente" a "Aceptado".', '2026-09-10T11:00:00.000Z'),
  email('em012', 'ana.beltre@correo.do', 'Inscolar: actualización — Estado de documento', 'Se registró un cambio en "Estado de documento". De "Pendiente" a "Rechazado".', '2026-09-11T13:00:00.000Z'),
  email('em013', 'rosa.almonte@correo.do', 'Inscolar: actualización — Estado de documento', 'Se registró un cambio en "Estado de documento". De "Pendiente" a "Aceptado".', '2026-07-30T13:00:00.000Z'),
  email('em014', 'miguel.pena@correo.do', 'Inscolar: actualización — Estado de cita', 'Se registró un cambio en "Estado de cita". De "Pendiente" a "Confirmada".', '2026-09-17T11:00:00.000Z'),
  email('em015', 'maria.rosario@inscolar.do', 'Inscolar: actualización — Estado', 'Se registró un cambio en "Estado". De "Activo" a "Inactivo".\nUsuario afectado: Liceo Nocturno Duarte.\nRegistrado por: Claribel Guzmán Ferreras.', '2026-09-13T09:00:00.000Z'),
];

const db = {
  institutions,
  users,
  students,
  enrollments,
  appointments,
  ratings,
  reports,
  documents,
  periods,
  logs,
  emailLog,
  mfaCodes: [],
  resetTokens: [],
  notifications,
  meta: { defaultPassword: DEFAULT_PASSWORD },
};

ensurePlaceholderDocFile();
ensureInstitutionPhotos();
require('./institution-catalog').applyCatalog(db);
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
console.log('Datos de prueba escritos en', DB_PATH);
console.log('Contraseña por defecto para todos los usuarios de prueba:', DEFAULT_PASSWORD);
