// Genera/reinicia data/db.json con datos de prueba.
// Uso: npm run reset-data
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const DEFAULT_PASSWORD = 'Inscolar#2026';

function hash(pw) {
  return bcrypt.hashSync(pw, 10);
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

const INACTIVE_INSTITUTIONS = new Set(['Liceo Nocturno Duarte', 'Escuela Fe y Alegría']);

const institutions = institutionNames.map(([nombre, provincia, distrito], i) => ({
  id: 'i' + String(i + 1).padStart(3, '0'),
  nombre,
  provincia,
  distrito,
  tipo: nombre.startsWith('Colegio') ? 'Privado' : 'Público',
  direccion: '',
  telefono: '',
  estado: INACTIVE_INSTITUTIONS.has(nombre) ? 'Inactivo' : 'Activo',
  createdAt: '2025-08-01T09:00:00.000Z',
}));

function institutionId(nombre) {
  const found = institutions.find((i) => i.nombre === nombre);
  return found ? found.id : null;
}

const now = '2026-08-25T09:00:00.000Z';

const users = [
  {
    id: 'u001',
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

const db = {
  institutions,
  users,
  mfaCodes: [],
  resetTokens: [],
  notifications,
  meta: { defaultPassword: DEFAULT_PASSWORD },
};

fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
console.log('Datos de prueba escritos en', DB_PATH);
console.log('Contraseña por defecto para todos los usuarios de prueba:', DEFAULT_PASSWORD);
