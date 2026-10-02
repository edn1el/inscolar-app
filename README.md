# Inscolar (prototipo)

Este es el prototipo de Inscolar ya funcionando de verdad, no solo la maqueta. Backend en Node/Express, los datos se guardan en un JSON así que no hay que instalar nada de base de datos, y el frontend mantiene el mismo diseño que ya teníamos (logo, colores, el sello 3D, las tarjetas con tilt).

Cuando digo "funcional" me refiero a que los datos persisten de verdad mientras usas la app — si creas un usuario, cambias una contraseña o activas el MFA, eso se guarda en `data/db.json` y sigue ahí. Lo que no tiene es la robustez de un backend en producción: como no conecté ningún servicio de correo real, las cosas que normalmente se mandarían por email (códigos MFA, links de recuperación, contraseñas temporales) simplemente se muestran en pantalla. Y las sesiones se pierden si reinicias el servidor. Sirve para mostrar y probar los flujos completos, pero todavía no está listo para usuarios reales.

## Para correrlo

Hace falta tener [Node.js](https://nodejs.org) (18 o más reciente).

```bash
npm install
npm start
```

Y ya, entras a **http://localhost:3000**.

## Usuarios de prueba

La contraseña es la misma para todos: `Inscolar#2026`

| Correo | Rol |
|---|---|
| maria.rosario@inscolar.do | Administrador |
| c.guzman@inscolar.do | Administrador |
| y.sanchez@inscolar.do | Soporte (cuenta inactiva) |
| jm.cepeda@sanrafael.edu.do | Personal de institución |
| r.urena@liceoduarte.edu.do | Personal de institución |
| p.lluberes@inscolar.do | Auditoría (cuenta inactiva) |
| ana.beltre@correo.do | Tutor |

Administrador y Soporte ven Usuarios, Instituciones, Inscripciones, Citas, Notificaciones y Analíticas en el menú. Personal de institución ve Inscripciones y Citas (solo las de su propia institución). Tutor ve Inscripciones y Citas (solo las suyas, con sus estudiantes). El resto solo ve "Mi cuenta". Esto no es solo visual, el control de acceso funciona de verdad por debajo.

## El "modo de prueba" que aparece en pantalla

Como no hay correo real conectado, cuando el sistema necesita "enviar" algo (código MFA, link de recuperación, contraseña temporal) lo pone directamente en pantalla en un aviso amarillo que dice "Modo de prueba (sin envío real de correo)". Así se puede probar el flujo completo sin necesitar una bandeja de entrada de verdad. Para producción tocaría conectar algo como SendGrid o SES — el resto de la lógica (expiración de códigos, límite de intentos, historial de contraseñas) ya está hecha.

## Correo real (en vez del modo de prueba)

El código ya soporta mandar correos de verdad por SMTP (con `nodemailer`), simplemente no tenía credenciales configuradas. Para activarlo:

1. Copia `.env.example` a `.env`.
2. Si usas Gmail: activa la verificación en 2 pasos en tu cuenta y genera una "contraseña de aplicación" en https://myaccount.google.com/apppasswords (no es tu contraseña normal). Pon tu correo en `SMTP_USER` y esa contraseña de 16 caracteres en `SMTP_PASS`.
3. Corre `npm start` de nuevo.

Si `SMTP_USER`/`SMTP_PASS` están vacíos, sigue funcionando en modo de prueba como antes (nada se rompe). En `data/db.json` → `emailLog` queda registrado cada correo con `via: "smtp"` (se mandó de verdad) o `via: "simulado..."`.

## Ponerlo en línea (deploy)

Para que la app tenga una URL real y no dependa de que alguien tenga su laptop prendida, incluí `render.yaml` para desplegar en [Render](https://render.com) (tiene capa gratis, sin tarjeta):

1. Sube el repo a GitHub (ya está).
2. En Render: New → Blueprint → conecta el repo → Render detecta `render.yaml` solo.
3. Rellena las variables de SMTP si quieres correo real (si las dejas vacías, queda en modo de prueba).
4. Dale deploy. Te da una URL tipo `https://inscolar-app.onrender.com`.

**Importante, para no llevarse una sorpresa en la presentación:** el plan gratis de Render no permite disco persistente — el servicio se "duerme" tras 15 minutos sin tráfico, y al despertar pierde lo que se guardó en `data/db.json` durante esa sesión (vuelve a los datos de prueba originales). Para una demo en vivo esto en realidad no es un problema (siempre arranca con datos limpios), pero si necesitan que los cambios persisten de verdad entre sesiones, tocaría subir al plan pagado de Render (~$7/mes) o usar una base de datos real aparte (Render también ofrece un Postgres gratis) en vez del archivo JSON — eso sí es un cambio más grande que no hicimos todavía.

Que la URL aparezca en resultados de Google no es algo que se pueda forzar ni garantizar en poco tiempo — eso depende de que Google la rastree e indexe, que normalmente tarda días o semanas sin importar qué tan bien esté hecha la página. Lo que sí tienes garantizado con esto es una URL pública real, funcionando como cualquier otra página.

## Resetear los datos

Para volver todo al estado inicial y deshacer lo que se haya creado o cambiado:

```bash
npm run reset-data
```

Esto reescribe `data/db.json` desde cero.

## Qué tiene hecho

Acceso: configuración inicial del primer admin, login, MFA por correo, registro de tutor, recuperar contraseña, cambio obligatorio de contraseña después de una temporal.

Mi cuenta: ver y editar perfil, cambiar contraseña (guarda historial de las últimas 5), prender/apagar MFA.

Administración de usuarios (solo Admin/Soporte): listado con filtros, crear, modificar, activar/desactivar cuentas, resetear contraseñas, notificaciones cuando se toca una cuenta administrativa.

Instituciones (solo Admin/Soporte): listado con filtros por provincia y estado, crear, modificar, activar/desactivar.

Inscripciones: un tutor registra a sus estudiantes y solicita cupo en una institución (grado y ciclo escolar). El personal de esa institución ve solo sus propias solicitudes y las aprueba o rechaza (con motivo si rechaza). Admin/Soporte ven todas, con filtro por institución, y también pueden decidir. El tutor puede cancelar una solicitud mientras esté pendiente.

Citas: un tutor agenda una cita con una institución (motivo, fecha y hora, opcionalmente ligada a uno de sus estudiantes). El personal de esa institución la confirma (puede ajustar la hora si hace falta) o la cancela con motivo. El tutor puede cancelar la suya en cualquier momento antes de que pase. Admin/Soporte ven todas, con el mismo filtro por institución que en Inscripciones.

Analíticas (solo Admin/Soporte): usuarios totales, activos, instituciones, cuentas con MFA, instituciones por provincia, usuarios por rol, actividad reciente — todo se calcula en vivo, no son números fijos.

## Estructura

```
server.js          entrada de la app (Express)
routes/             endpoints de la API (auth, users, misc/analíticas)
lib/                acceso a datos, validaciones, seed de datos de prueba
data/db.json        la "base de datos", un JSON que se lee y escribe en cada acción
public/             frontend (HTML/CSS/JS plano, sin build)
```

## Lo que falta

Ya están las cuatro áreas principales del sistema (Usuarios, Instituciones, Inscripciones, Citas), el logo oficial (kit de marca en SVG) puesto en todas partes, en Analíticas hay un mapa interactivo con el contorno real de las provincias, en Inscripciones y Citas se puede generar un comprobante imprimible con el membrete de Inscolar, y ahora también hay un botón de alto contraste arriba a la derecha (queda guardado aunque cierres el navegador). Lo que queda es más de pulido visual que de funcionalidad nueva: fondo real por institución (foto + overlay).
