const http = require('http');
const path = require('path');
const express = require('express');
const { load, save } = require('./lib/db');
const usersRouter = require('./routes/users');

const adminA = load().users.find(u => u.email === 'maria.rosario@inscolar.do');
const adminB = load().users.find(u => u.role === 'Administrador' && u.id !== adminA.id) || adminA; // just need any other admin

let mockResStatus = 0;
let mockResJson = {};
const mockRes = {
  status: (s) => { mockResStatus = s; return mockRes; },
  json: (j) => { mockResJson = j; return mockRes; }
};

const dbRace = load();
dbRace.users.find(u => u.id === adminB.id).estado = 'Inactivo';
dbRace.users.find(u => u.id === adminA.id).estado = 'Activo';

const toggleEstadoHandler = usersRouter.stack.find(r => r.route && r.route.path === '/:id/toggle-estado').route.stack.find(l => l.name === '<anonymous>' || !l.name || l.name === '').handle;

try {
  toggleEstadoHandler({
    params: { id: adminA.id },
    currentUser: dbRace.users.find(u => u.id === adminB.id),
    db: dbRace
  }, mockRes);
  console.log("Status:", mockResStatus);
  console.log("JSON:", mockResJson);
} catch(e) {
  console.error(e);
}
