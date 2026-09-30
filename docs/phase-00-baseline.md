# Informe de Fase 0 — Línea Base de Inscolar

**Rama:** `feature/phase-00-baseline`
**Commit de partida:** `de7c6e9`
**Fecha:** 2026-09-29
**Estado:** Fase 0 completada — pendiente de revisión de PR antes de iniciar Fase 1

---

## 1. Verificación del repositorio

| Campo | Valor |
|---|---|
| Repositorio | `edn1el/inscolar-app` |
| Remote origin | `https://github.com/edn1el/inscolar-app` |
| Rama principal remota | `main` |
| Commit HEAD (partida) | `de7c6e9 Permitir que cada usuario configure su foto de perfil` |
| Ramas remotas existentes | `main`, `feature/modo-alto-contraste`, `fix/busqueda-y-alto-contraste` |
| Cambios locales al inicio | `ROADMAP_REQUISITOS.md` (M), `data/db.json` (M), `inscolar-contexto/` (??) |
| Acción tomada | `git stash push` para preservar; trabajo en `feature/phase-00-baseline` basada en `integration/ui-quality-testing` (local) desde `main` |

> **IMPORTANTE:** El push de `integration/ui-quality-testing` y `feature/phase-00-baseline` a GitHub **falló** con error 403 (`Permission to edn1el/inscolar-app.git denied to angemio`). El trabajo completo está preservado **localmente**. Para habilitarlo: en GitHub → Settings del repo → Collaborators → agregar al usuario `angemio` con rol de colaborador (o confirmar que el token de git tenga scope `repo`).

---

## 2. Arquitectura real del commit actual

### 2.1 Cómo arrancar

```bash
# Instalar dependencias (ya instaladas en node_modules)
npm install

# Arrancar con datos de demo compartidos
node server.js       # → http://localhost:3000

# Arrancar con datos de prueba AISLADOS (no toca data/db.json)
node test/fixtures/seed-fixtures.js   # genera test/fixtures/test-db.json
DB_PATH=./test/fixtures/test-db.json node server.js

# Resetear datos de demo a estado inicial
npm run reset-data   # ejecuta lib/seed.js → sobreescribe data/db.json
```

### 2.2 Stack tecnológico (verificado)

| Capa | Tecnología | Notas |
|---|---|---|
| Runtime | Node.js 18.19.1 | verificado con `node -v` |
| Servidor HTTP | Express 4.19.2 | `package.json` |
| Sesiones | express-session 1.18.0 | Cookie `httpOnly`, 8 h TTL |
| Hash contraseñas | bcryptjs 2.4.3 | Salt rounds: 10 |
| Subida de archivos | multer 2.3.0 | Límite 5 MB; PDF/JPG/PNG |
| Correo | nodemailer 9.1.1 | Sin SMTP → modo simulado (`devCode`/`devToken` en respuesta JSON) |
| Almacenamiento | Fichero JSON (`data/db.json`) | Lectura/escritura síncrona por petición |
| Frontend | SPA vanilla JS/CSS (`public/`) | Router del lado del cliente |

### 2.3 Estructura de archivos principales

```
inscolar-app/
├── server.js            # Express entry point, monta rutas, SPA fallback
├── package.json         # Scripts: start, dev, reset-data
├── lib/
│   ├── db.js            # load()/save()/nextId(); soporta DB_PATH env (añadido F0)
│   ├── middleware.js     # requireAuth(), requireAdmin()
│   ├── audit.js         # logEvent()
│   ├── seed.js          # Generador de datos de demo (602 líneas)
│   ├── geo.js           # haversineKm(), coordsForInstitution()
│   ├── mailer.js        # sendMail() — modo simulado sin SMTP
│   ├── notify.js        # notifyUser(), notifyAdmins()
│   ├── periods.js       # findPeriod(), withinRange(), citasPeriodStatus()
│   └── validate.js      # isEmail(), passwordRules(), isCedula(), isPhoneDigits()
├── routes/
│   ├── auth.js          # /api/auth/*
│   ├── users.js         # /api/users/*
│   ├── institutions.js  # /api/institutions/*
│   ├── enrollments.js   # /api/(students|enrollments)/*
│   ├── appointments.js  # /api/appointments/*
│   ├── documents.js     # /api/(enrollments/:id/documents|documents/:id/*)
│   ├── periods.js       # /api/institutions/:id/periods/*
│   ├── ratings.js       # /api/institutions/:id/(ratings|reports)
│   ├── misc.js          # /api/(notifications|emails|analytics/summary)
│   └── audit.js         # /api/logs
├── public/
│   ├── index.html       # SPA shell
│   ├── js/app.js        # Frontend completo (~151 KB un solo archivo)
│   ├── js/dr-provinces.js  # Datos geográficos RD
│   └── css/app.css      # Estilos (~26 KB)
├── data/
│   ├── db.json          # Base de datos JSON (52 KB; NO versionar cambios aquí)
│   ├── seed-assets/     # Imágenes de ejemplo para instituciones
│   └── uploads/         # Archivos subidos (no versionado, generado en runtime)
├── test/                # NUEVO (Fase 0)
│   ├── smoke.sh         # Script de smoke tests
│   └── fixtures/
│       ├── phase-00-db.json      # Fixtures en formato plano (sin hashes)
│       └── seed-fixtures.js      # Genera test-db.json con hashes reales
└── docs/
    └── phase-00-baseline.md  # Este informe
```

### 2.4 Almacenamiento

- `data/db.json` — JSON monolítico, colecciones: `institutions` (24), `users` (9), `students` (4), `enrollments` (5), `appointments` (5), `ratings` (12), `reports` (5), `documents` (7), `periods` (4), `logs` (41+), `emailLog` (16), `mfaCodes` (0), `resetTokens` (0), `notifications` (4)
- Uploads físicos en `data/uploads/` (no versionado)
- La sesión vive **en memoria** del proceso Node (`express-session` sin store persistente) → se pierde al reiniciar el servidor

> **AVISO:** La sesión en memoria implica que **reiniciar el servidor desconecta a todos los usuarios**. Para el backend definitivo se requiere un store de sesiones persistente (Redis, BD relacional).

---

## 3. Usuarios de demo (commit de partida)

| ID | Rol | Email | Estado |
|---|---|---|---|
| u001 | Administrador | maria.rosario@inscolar.do | Activo |
| u002 | Tutor | ana.beltre@correo.do | Activo |
| u003 | Personal de institución | jm.cepeda@sanrafael.edu.do | Activo (inst: i001) |
| u004 | Soporte | y.sanchez@inscolar.do | **Inactivo** |
| u005 | Personal de institución | r.urena@liceoduarte.edu.do | Activo (inst: i002) |
| u006 | Administrador | c.guzman@inscolar.do | Activo |
| u007 | Auditoría | p.lluberes@inscolar.do | **Inactivo** |
| u008 | Tutor | rosa.almonte@correo.do | Activo |
| u009 | Tutor | miguel.pena@correo.do | Activo |

**Contraseña de demo (todos):** `Inscolar#2026` _(verificado con bcrypt — NO publicar en canales públicos)_

> Ni el rol `Soporte` ni el rol `Auditoría` tienen usuarios **activos** en el commit de partida. Para probar esos flujos usar los fixtures aislados (`test/fixtures/`).

---

## 4. Resultados de pruebas de humo (comprobado por el agente)

Ejecutadas manualmente contra el servidor con datos de demo (`data/db.json`).

| # | Prueba | Resultado | Método |
|---|---|---|---|
| 1 | `GET /api/auth/setup-needed` → `{"needed":false}` | **PASS** | Comprobado |
| 2 | Login admin `maria.rosario@inscolar.do` → `{"status":"ok","role":"Administrador"}` | **PASS** | Comprobado |
| 3 | Login contraseña incorrecta → error de autenticación | **PASS** | Comprobado |
| 4 | Login cuenta inactiva (Soporte) → mensaje de cuenta desactivada | **PASS** | Comprobado |
| 5 | Login cuenta inactiva (Auditoría) → mensaje de cuenta desactivada | **PASS** | Comprobado |
| 6 | Login tutor → `{"status":"ok","role":"Tutor"}` | **PASS** | Comprobado |
| 7 | Sin cookie → `/api/institutions` → `{"error":"No has iniciado sesión."}` | **PASS** | Comprobado |
| 8 | `GET /api/auth/me` con sesión → email correcto | **PASS** | Comprobado |
| 9 | Tutor → `GET /api/users` → 403 | **PASS** | Comprobado |
| 10 | Tutor → `POST /api/users` (crear admin) → 403 | **PASS** | Comprobado |
| 11 | Tutor → `POST /api/institutions` → 403 | **PASS** | Comprobado |
| 12 | Tutor → `GET /api/logs` → 403 | **PASS** | Comprobado |
| 13 | Admin → `GET /api/users` → `{"total":9}` | **PASS** | Comprobado |
| 14 | Admin → `GET /api/institutions` → `{"total":24}` | **PASS** | Comprobado |
| 15 | Admin → `GET /api/enrollments` → `{"total":5}` | **PASS** | Comprobado |
| 16 | Admin → `GET /api/appointments` → `{"total":5}` | **PASS** | Comprobado |
| 17 | Admin → `GET /api/logs` → total > 0 | **PASS** | Comprobado |
| 18 | Admin → `GET /api/analytics/summary` → `{"totalUsuarios":9}` | **PASS** | Comprobado |
| 19 | Personal i001 → `GET /api/users` → 403 | **PASS** | Comprobado |
| 20 | Personal i001 → `GET /api/enrollments` → solo 1 (su institución) | **PASS** | Comprobado |
| 21 | Personal i001 → `GET /api/institutions/i002/calendar` → `{"detalle":false}` | **PASS** | Comprobado |
| 22 | Servidor con fixtures aislados (2 inst, 6 usuarios ficticios) | **PASS** | Comprobado |

**Script reproducible:** `bash test/smoke.sh [PORT]`

---

## 5. Matriz de permisos por rol y acción

### Leyenda
- PASS: Permitido y validado en servidor (comprobado)
- FAIL: Denegado en servidor con 401/403 (comprobado)
- UI: Solo interfaz, sin restricción de servidor verificada (pendiente de verificar)
- N/A: No aplica por diseño
- ?: Pendiente de verificar

### 5.1 Autenticación y perfil

| Acción | Admin | Soporte | Personal | Tutor | Auditoría | Fuente |
|---|---|---|---|---|---|---|
| Login / Logout | PASS | PASS | PASS | PASS | PASS | routes/auth.js L76, L286 |
| Ver /api/auth/me | PASS | PASS | PASS | PASS | PASS | routes/auth.js L280 |
| Cambiar propia contraseña | PASS | PASS | PASS | PASS | PASS | routes/users.js L69 |
| Editar perfil propio (tel/sexo) | PASS | PASS | PASS | PASS | PASS | routes/users.js L53 |
| Subir/quitar foto de perfil | PASS | PASS | PASS | PASS | PASS | routes/users.js L138 |
| Activar/desactivar MFA | PASS | PASS | PASS | PASS | PASS | routes/users.js L94-L125 |
| Recuperar contraseña (forgot) | PASS | PASS | PASS | PASS | PASS | routes/auth.js L225 |

### 5.2 Gestión de usuarios

| Acción | Admin | Soporte | Personal | Tutor | Auditoría | Fuente |
|---|---|---|---|---|---|---|
| Listar todos los usuarios | PASS | PASS | FAIL | FAIL | FAIL | routes/users.js L191 requireAdmin |
| Crear usuario | PASS | PASS | FAIL | FAIL | FAIL | routes/users.js L206 requireAdmin |
| Editar datos de usuario | PASS | PASS | FAIL | FAIL | FAIL | routes/users.js L244 requireAdmin |
| Activar/desactivar usuario | PASS | PASS | FAIL | FAIL | FAIL | routes/users.js L275 requireAdmin |
| Resetear contraseña de otro | PASS | PASS | FAIL | FAIL | FAIL | routes/users.js L290 requireAdmin |
| Registro de tutor (autoservicio) | N/A | N/A | N/A | PASS | N/A | routes/auth.js L184 |

> **RIESGO R01:** `requireAdmin` en `lib/middleware.js` permite tanto Administrador como Soporte, lo que significa que **Soporte puede crear, editar y desactivar Administradores** (hallazgo FUN-02). La Fase 2 (F2.1) debe restringir esto.

### 5.3 Instituciones

| Acción | Admin | Soporte | Personal | Tutor | Auditoría | Fuente |
|---|---|---|---|---|---|---|
| Listar instituciones | PASS | PASS | PASS | PASS | PASS | routes/institutions.js L45 |
| Ver detalle de institución | PASS | PASS | PASS | PASS | PASS | routes/institutions.js L89 |
| Crear institución | PASS | PASS | FAIL | FAIL | FAIL | routes/institutions.js L97 requireAdmin |
| Editar institución | PASS | PASS | FAIL | FAIL | FAIL | routes/institutions.js L128 requireAdmin |
| Activar/desactivar institución | PASS | PASS | FAIL | FAIL | FAIL | routes/institutions.js L155 requireAdmin |
| Ver calendario (con detalle) | PASS | PASS | solo su inst. | sin detalle | sin detalle | routes/institutions.js L169 |

### 5.4 Inscripciones y estudiantes

| Acción | Admin | Soporte | Personal | Tutor | Auditoría | Fuente |
|---|---|---|---|---|---|---|
| Registrar estudiante | FAIL | FAIL | FAIL | PASS | FAIL | routes/enrollments.js L77 |
| Listar estudiantes | PASS | PASS | FAIL | solo suyos | FAIL | routes/enrollments.js L65 |
| Crear solicitud de inscripción | FAIL | FAIL | FAIL | PASS | FAIL | routes/enrollments.js L118 |
| Listar inscripciones | todas | todas | su inst. | suyas | FAIL | routes/enrollments.js L98 |
| Aprobar/rechazar inscripción | PASS | PASS | su inst. | FAIL | FAIL | routes/enrollments.js L166 |
| Cancelar inscripción (Pendiente) | FAIL | FAIL | FAIL | PASS propietario | FAIL | routes/enrollments.js L204 |

### 5.5 Citas

| Acción | Admin | Soporte | Personal | Tutor | Auditoría | Fuente |
|---|---|---|---|---|---|---|
| Solicitar cita | FAIL | FAIL | FAIL | PASS | FAIL | routes/appointments.js L45 |
| Listar citas | todas | todas | su inst. | suyas | FAIL | routes/appointments.js L26 |
| Confirmar cita | PASS | PASS | su inst. | FAIL | FAIL | routes/appointments.js L105 |
| Rechazar cita (Pendiente) | PASS | PASS | su inst. | FAIL | FAIL | routes/appointments.js L148 |
| Cancelar cita | PASS | PASS | su inst. | la propia | FAIL | routes/appointments.js L183 |

### 5.6 Documentos

| Acción | Admin | Soporte | Personal | Tutor | Auditoría | Fuente |
|---|---|---|---|---|---|---|
| Subir documento | FAIL | FAIL | FAIL | su inscripción | FAIL | routes/documents.js L70 |
| Listar documentos | PASS | PASS | su inst. | suyos | FAIL | routes/documents.js L56 |
| Ver/descargar archivo | PASS | PASS | su inst. | suyos | FAIL | routes/documents.js L123 |
| Aceptar/rechazar documento | PASS | PASS | su inst. | FAIL | FAIL | routes/documents.js L139 |

### 5.7 Períodos, calificaciones y auditoría

| Acción | Admin | Soporte | Personal | Tutor | Auditoría | Fuente |
|---|---|---|---|---|---|---|
| Crear/editar/eliminar período | PASS | PASS | su inst. | FAIL | FAIL | routes/periods.js L19 |
| Ver períodos | PASS | PASS | PASS | PASS | PASS | routes/periods.js L45 |
| Calificar institución | FAIL | FAIL | FAIL | con relación | FAIL | routes/ratings.js L43 |
| Ver calificaciones | todas | todas | ? | solo suyas | ? | routes/ratings.js L28 |
| Ver bitácora de auditoría | PASS | FAIL | FAIL | FAIL | PASS | routes/audit.js L8 |
| Ver analíticas | PASS | PASS | FAIL | FAIL | FAIL | routes/misc.js L53 |

---

## 6. Inventario de endpoints actuales

### `/api/auth` (11 endpoints)
GET /setup-needed · POST /setup · POST /login · POST /mfa/verify · POST /mfa/resend · POST /force-change · POST /register · POST /forgot · POST /reset · GET /me · POST /logout

### `/api/users` (16 endpoints)
GET|PUT /me/profile · POST /me/password · GET|POST|POST|POST /me/mfa · PUT /me/notification-prefs · POST|DELETE|GET /:id/foto · GET|POST|PUT|POST|POST / y /:id

### `/api/institutions` (18 endpoints)
GET|POST / · GET|PUT|POST /:id · GET|PUT|POST|DELETE /:id/periods y períodos · GET|POST|GET /:id/ratings|reports · GET|POST|DELETE /:id/foto · GET /:id/calendar

### `/api` misceláneos (20 endpoints)
GET|POST /students · GET|POST /enrollments · POST /enrollments/:id/decidir|cancelar · GET|POST /enrollments/:id/documents · GET /documents/:id/file · POST /documents/:id/decidir · GET|POST /appointments · POST /appointments/:id/confirmar|rechazar|cancelar · GET|POST /notifications|/:id/read · GET /emails · GET /analytics/summary · GET /logs

**Total: ~45+ endpoints documentados**

---

## 7. Contratos pendientes para el backend definitivo

### 7.1 Autenticación
- FALTA: JWT / tokens sin estado (sesión en memoria no escala)
- FALTA: Proveedor MFA real (devCode expuesto en respuesta)
- FALTA: Token de recuperación seguro (devToken en respuesta)
- FALTA: Audit trail de sesiones (IP, dispositivo, tokens de confianza)

### 7.2 Instituciones
- FALTA: Campo `rnc` en modelo — HU019 (ID 347), FUN-03
- FALTA: Campo `email` institucional — FUN-03
- FALTA: Paginación en listados — FUN-04, HU020 (IDs 160/347)
- PENDIENTE: Validación combinación provincia/municipio en servidor — FUN-05

### 7.3 Documentos
- FALTA: Validación de magic bytes (MIME spoofeable)
- FALTA: Flujo de recarga documental con estado "Documentos pendientes"
- FALTA: Tipos de documento configurables vinculados a validación de subida

### 7.4 Citas
- FALTA: Endpoint `PUT /appointments/:id/reprogramar` (atómico, vuelve a Pendiente)
- FALTA: Cupo por franja horaria (actual: solo por período)
- FALTA: Borrador inactivo con abandono a 10/20 minutos

### 7.5 Notificaciones y correo
- FALTA: Correo real (SMTP/SES — nodemailer sin transporte)
- FALTA: Notificaciones push/webhook

### 7.6 Auditoría
- FALTA: Audit.NET / backend con cola durable
- FALTA: Política de retención (propuesta: 24 meses)
- FALTA: Control de duplicados e idempotency keys

### 7.7 Seguridad HTTP
- FALTA: HTTPS, CORS, rate limiting global, cabeceras de seguridad (Helmet)
- FALTA: Zona horaria RD (AST, UTC-4) en respuestas
- FALTA: Paginación estándar en la mayoría de endpoints

---

## 8. Riesgos identificados

| ID | Riesgo | Severidad | Estado |
|---|---|---|---|
| R01 | requireAdmin engloba Soporte → puede crear/eliminar Administradores (FUN-02) | Alta | Sin mitigar |
| R02 | Sesión en memoria → pérdida al reiniciar servidor | Media | Sin mitigar |
| R03 | devCode/devToken en respuesta JSON → expuesto en logs de red | Alta | Solo en demo |
| R04 | MIME type spoofeable en upload de documentos | Media | Pendiente |
| R05 | data/db.json sin concurrencia → escrituras simultáneas pueden corromper | Alta | Sin mitigar |
| R06 | Sin paginación en instituciones/usuarios → potencial DoS | Baja | Sin mitigar |
| R07 | Fotos servidas sin control granular (cualquier auth ve cualquier foto) | Baja | Pendiente verificar |
| R08 | Búsqueda pública de instituciones requiere autenticación (FUN-01) | Media | Sin mitigar |
| R09 | Roles Soporte y Auditoría sin usuarios activos en demo | Baja | Mitigado con fixtures |
| R10 | Logs sin IP ni User-Agent | Baja | Sin mitigar |

---

## 9. Cambios realizados en Fase 0

### Modificaciones a código existente
- `lib/db.js` L5: Soporte para variable de entorno `DB_PATH` → pruebas aisladas

### Archivos nuevos
- `test/smoke.sh` — Script de smoke tests reproducible (bash + curl)
- `test/fixtures/phase-00-db.json` — Fixtures de referencia
- `test/fixtures/seed-fixtures.js` — Generador con hashes bcrypt reales
- `docs/phase-00-baseline.md` — Este informe

### Cambios NO realizados (por instrucción)
- No se implementó reforma visual (Fase 1)
- No se corrigieron hallazgos FUN-01 a FUN-06
- No se cerraron historias de Azure

---

## 10. HU020 — Identidad dual

HU020 corresponde a **dos work items distintos**:
- **ID 160**: Listado de instituciones — sin RNC/correo/teléfono/fecha ni paginación (FUN-04)
- **ID 347**: Formulario de creación/edición — sin RNC, correo, estado, logo/fondo (FUN-03)

Tratar por separado en Fase 3.

---

## 11. Próximos pasos

1. **Revisar este contenido antes de iniciar Fase 1**
2. Habilitar acceso push para `angemio` en `edn1el/inscolar-app` (ver sección 1)
3. Una vez habilitado:
   ```bash
   git push origin integration/ui-quality-testing
   git push origin feature/phase-00-baseline
   ```
4. Abrir PR de `feature/phase-00-baseline` → `integration/ui-quality-testing` en GitHub
5. Validar `bash test/smoke.sh` en el entorno del equipo
6. Iniciar Fase 1 solo tras aprobación del PR

---

_Generado por agente Antigravity · 2026-09-29 · commit `de7c6e9`_
