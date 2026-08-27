# Inscolar — prototipo funcional (Gestión de Usuario + Analíticas)

Esto convierte el prototipo de diseño en una aplicación que corre de verdad en tu
computadora: backend en Node/Express, datos guardados en un archivo JSON (no hace falta
instalar ninguna base de datos), y el frontend con la misma identidad visual que ya
habíamos definido (logo, colores, sello 3D, tarjetas con tilt, etc.).

Nivel de "funcional": es un prototipo con datos reales que persisten mientras usas la
app (crear un usuario, cambiar una contraseña, activar MFA, etc. de verdad se guarda en
`data/db.json`), pero sin la robustez de un backend de producción: las contraseñas
"enviadas por correo" (MFA, recuperación, contraseñas temporales) se muestran en pantalla
en vez de mandarse por email real, y las sesiones se pierden si reinicias el servidor.
Perfecto para exponer y probar los flujos; no está pensado para desplegarse tal cual a
usuarios reales.

## Cómo correrlo

Necesitas tener [Node.js](https://nodejs.org) instalado (cualquier versión reciente, 18+).

```bash
npm install
npm start
```

Abre **http://localhost:3000** en el navegador. Con eso ya está corriendo.

## Usuarios de prueba

Todos los usuarios de prueba tienen la misma contraseña: **`Inscolar#2026`**

| Correo | Rol |
|---|---|
| maria.rosario@inscolar.do | Administrador |
| c.guzman@inscolar.do | Administrador |
| y.sanchez@inscolar.do | Soporte (cuenta inactiva) |
| jm.cepeda@sanrafael.edu.do | Personal de institución |
| r.urena@liceoduarte.edu.do | Personal de institución |
| p.lluberes@inscolar.do | Auditoría (cuenta inactiva) |
| ana.beltre@correo.do | Tutor |

Los roles **Administrador** y **Soporte** ven Usuarios, Notificaciones y Analíticas en el
menú. Los demás roles solo ven "Mi cuenta" (perfil y seguridad) — así se comporta el
control de acceso real, no solo la maqueta.

## Qué es "modo de prueba" en pantalla

Como no hay un servicio de correo real conectado, cuando el sistema necesita "enviar"
algo (un código MFA, un enlace de recuperación, una contraseña temporal), en vez de
mandarlo a un correo lo muestra directamente en la pantalla dentro de un aviso amarillo
que dice **"Modo de prueba (sin envío real de correo)"**. Así puedes probar el flujo
completo sin necesitar una bandeja de entrada real. Para una versión real habría que
conectar un proveedor de correo (SendGrid, SES, etc.) — el resto de la lógica (expiración
de códigos, límite de intentos, historial de contraseñas) ya está implementada de verdad.

## Reiniciar los datos de prueba

Si quieres devolver todo al estado inicial (deshacer usuarios creados, cambios de estado,
etc.):

```bash
npm run reset-data
```

Esto reescribe `data/db.json` con el set de datos original.

## Qué incluye

**Acceso:** configuración inicial del primer administrador, login, verificación en dos
pasos (MFA) por correo, registro de tutor (autoservicio), recuperar contraseña, cambio
obligatorio de contraseña (tras contraseña temporal).

**Mi cuenta:** ver/editar perfil, cambiar contraseña (con historial de últimas 5),
activar/desactivar MFA.

**Administración de usuarios** (solo Administrador/Soporte): listado con filtros, crear
usuario, modificar usuario, activar/desactivar cuenta, resetear contraseña, notificaciones
cuando se modifica una cuenta administrativa.

**Analíticas** (solo Administrador/Soporte): indicadores (usuarios totales, activos,
instituciones, cuentas con MFA), instituciones por provincia, usuarios por rol, actividad
reciente — todo calculado en vivo a partir de los datos reales, no números fijos.

## Estructura del proyecto

```
server.js          punto de entrada (Express)
routes/             endpoints de la API (auth, users, misc/analíticas)
lib/                acceso a datos (db.json), validaciones, seed de datos de prueba
data/db.json        "base de datos" — un archivo JSON que se lee/escribe en cada acción
public/             frontend (HTML/CSS/JS, sin frameworks ni paso de compilación)
```

## Siguiente nivel (no incluido en esta versión)

Fondo real por institución (foto + overlay), mapa interactivo de provincias en
Analíticas, generación de PDFs con la plantilla de marca, modo de alto contraste, y las
tres features restantes del sistema completo (Instituciones, Inscripciones, Citas).
