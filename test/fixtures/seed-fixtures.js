#!/usr/bin/env node
/**
 * seed-fixtures.js  –  Genera un db.json de prueba aislado para Fase 0
 *
 * Uso:
 *   node test/fixtures/seed-fixtures.js [--target ./test/fixtures/test-db.json]
 *
 * El archivo de destino se pasa a node server.js usando la variable de entorno:
 *   DB_PATH=./test/fixtures/test-db.json node server.js
 *
 * Esto permite probar sin modificar data/db.json (los datos de demo compartidos).
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DEFAULT_PASSWORD = 'Inscolar#2026';
const TARGET_ARG = process.argv.indexOf('--target');
const TARGET = TARGET_ARG !== -1
  ? process.argv[TARGET_ARG + 1]
  : path.join(__dirname, 'test-db.json');

const hash = (pw) => bcrypt.hashSync(pw, 10);

const now = new Date().toISOString();

const db = {
  institutions: [
    {
      id: 'fi001',
      nombre: 'Institución Alpha (Activa)',
      provincia: 'Santo Domingo',
      distrito: '10-02',
      municipio: 'Santo Domingo Norte',
      tipo: 'Público',
      direccion: 'Av. Principal #1',
      telefono: '(809) 000-0001',
      estado: 'Activo',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'fi002',
      nombre: 'Institución Beta (Inactiva)',
      provincia: 'Duarte',
      distrito: '07-01',
      municipio: 'San Francisco de Macorís',
      tipo: 'Privado',
      direccion: 'Calle Duarte #45',
      telefono: '(829) 000-0002',
      estado: 'Inactivo',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ],

  users: [
    {
      id: 'fu001',
      nombre: 'Admin Fixture',
      email: 'fixture.admin@test.inscolar.do',
      passwordHash: hash(DEFAULT_PASSWORD),
      passwordHistory: [],
      role: 'Administrador',
      institucionId: null,
      estado: 'Activo',
      sexo: null,
      telefonoFijo: '',
      telefonoMovil: '',
      cedula: null,
      mfaEnabled: false,
      mfaMethod: 'correo',
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastAccess: null,
    },
    {
      id: 'fu002',
      nombre: 'Soporte Fixture',
      email: 'fixture.soporte@test.inscolar.do',
      passwordHash: hash(DEFAULT_PASSWORD),
      passwordHistory: [],
      role: 'Soporte',
      institucionId: null,
      estado: 'Activo',
      sexo: null,
      telefonoFijo: '',
      telefonoMovil: '',
      cedula: null,
      mfaEnabled: false,
      mfaMethod: 'correo',
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastAccess: null,
    },
    {
      id: 'fu003',
      nombre: 'Personal Alpha Fixture',
      email: 'fixture.personal.alpha@test.inscolar.do',
      passwordHash: hash(DEFAULT_PASSWORD),
      passwordHistory: [],
      role: 'Personal de institución',
      institucionId: 'fi001',
      estado: 'Activo',
      sexo: null,
      telefonoFijo: '',
      telefonoMovil: '',
      cedula: null,
      mfaEnabled: false,
      mfaMethod: 'correo',
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastAccess: null,
    },
    {
      id: 'fu004',
      nombre: 'Personal Beta Fixture',
      email: 'fixture.personal.beta@test.inscolar.do',
      passwordHash: hash(DEFAULT_PASSWORD),
      passwordHistory: [],
      role: 'Personal de institución',
      institucionId: 'fi002',
      estado: 'Activo',
      sexo: null,
      telefonoFijo: '',
      telefonoMovil: '',
      cedula: null,
      mfaEnabled: false,
      mfaMethod: 'correo',
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastAccess: null,
    },
    {
      id: 'fu005',
      nombre: 'Tutor Fixture',
      email: 'fixture.tutor@test.inscolar.do',
      passwordHash: hash(DEFAULT_PASSWORD),
      passwordHistory: [],
      role: 'Tutor',
      institucionId: null,
      estado: 'Activo',
      sexo: null,
      telefonoFijo: '',
      telefonoMovil: '(809) 000-0005',
      cedula: '00100000005',
      mfaEnabled: false,
      mfaMethod: 'correo',
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastAccess: null,
    },
    {
      id: 'fu006',
      nombre: 'Auditoría Fixture',
      email: 'fixture.auditoria@test.inscolar.do',
      passwordHash: hash(DEFAULT_PASSWORD),
      passwordHistory: [],
      role: 'Auditoría',
      institucionId: null,
      estado: 'Activo',
      sexo: null,
      telefonoFijo: '',
      telefonoMovil: '',
      cedula: null,
      mfaEnabled: false,
      mfaMethod: 'correo',
      mustChangePassword: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      lastAccess: null,
    },
  ],

  students: [
    {
      id: 'fs001',
      tutorId: 'fu005',
      nombre: 'Estudiante Fixture Uno',
      fechaNacimiento: '2015-03-10',
      documento: '001',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],

  enrollments: [
    {
      id: 'fe001',
      studentId: 'fs001',
      tutorId: 'fu005',
      institucionId: 'fi001',
      gradoSolicitado: '1ro de Primaria',
      cicloEscolar: '2026-2027',
      estado: 'Pendiente',
      motivoRechazo: '',
      createdAt: '2026-09-01T00:00:00.000Z',
      decidedAt: null,
      decidedBy: null,
    },
    {
      id: 'fe002',
      studentId: 'fs001',
      tutorId: 'fu005',
      institucionId: 'fi001',
      gradoSolicitado: '2do de Primaria',
      cicloEscolar: '2025-2026',
      estado: 'Aprobada',
      motivoRechazo: '',
      createdAt: '2025-09-01T00:00:00.000Z',
      decidedAt: '2025-09-05T00:00:00.000Z',
      decidedBy: 'fu003',
    },
  ],

  appointments: [],
  ratings: [],
  reports: [],
  documents: [],

  periods: [
    {
      id: 'fp001',
      institucionId: 'fi001',
      cicloEscolar: '2026-2027',
      inscripcion: { desde: '2026-08-01T00:00:00.000Z', hasta: '2026-12-31T23:59:59.000Z' },
      documentos: { desde: '2026-08-01T00:00:00.000Z', hasta: '2026-12-31T23:59:59.000Z' },
      citas: { desde: '2026-08-01T00:00:00.000Z', hasta: '2026-12-31T23:59:59.000Z', limiteCitas: 50 },
      documentosRequeridos: ['Acta de nacimiento', 'Cédula o identificación del tutor'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],

  logs: [],
  emailLog: [],
  mfaCodes: [],
  resetTokens: [],
  notifications: [],

  meta: {
    version: 1,
    purpose: 'phase-00-fixtures',
    generatedAt: now,
    note: 'Datos aislados de prueba – generados por seed-fixtures.js. NO usar en producción.',
  },
};

fs.writeFileSync(TARGET, JSON.stringify(db, null, 2));
console.log(`✓ Fixtures escritos en: ${TARGET}`);
console.log(`  Contraseña de todos los usuarios: ${DEFAULT_PASSWORD}`);
console.log('');
console.log('Para arrancar con estos datos:');
console.log(`  DB_PATH=${TARGET} node server.js`);
