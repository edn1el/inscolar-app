# Regresión del login

Preparación: `npm ci` y `npx playwright install chromium`.
Ejecutar: `npm run test:login`.

La prueba inicia el servidor real en un puerto libre y usa Chromium sin interfaz.
Copia la base a un directorio temporal, prepara los roles y credenciales allí,
y verifica que `data/db.json` y el diagnóstico pendiente `test_puppeteer.js`
conserven exactamente su contenido. No usa pausas fijas: espera respuestas,
formularios y condiciones de la interfaz. Las recargas solo prueban la
recuperación de sesión; la aplicación navega sin recargas.

Cubre los cinco roles, cookie de sesión, permisos, cierre y cambio de usuario,
credenciales incorrectas, cuenta inactiva, MFA, contraseña obligatoria, destinos
internos, destinos de Tutor y una respuesta que llega tras abandonar el login.
Comprueba también animación pausada, movimiento reducido, canvas sin contexto,
excepción, rechazo y promesa que nunca termina, sin recarga de documento.

El fallo original en `af2318f` se reprodujo con Chromium: login devuelve `ok`,
`/auth/me` devuelve el usuario, pero la URL permanece en `#/login` y no aparece
error. `parseHash` entrega un objeto y el login llamaba a `query.get()`. El
catch ocultaba esa excepción por no tener `err.errors`. La animación además
introducía una espera de 600 ms antes de actualizar el estado y navegar.

Los smoke tests existentes y la matriz de permisos deben ejecutarse con
`DB_PATH` apuntando a copias temporales. La matriz requiere que Soporte no tenga
cambio obligatorio de contraseña pendiente; ese ajuste es solo de la copia.
El diagnóstico antiguo `test_puppeteer.js` no es una regresión con aserciones:
usa credenciales fijas, espera dos segundos y requiere Puppeteer, que no está
instalado. Se conserva sin cambios y fuera del commit.

La suite también reproduce la ruta `#/` sin sesión, un 503 durante el arranque,
una petición sin respuesta (límite de 15 segundos probado con reloj simulado)
y un reinicio real del servidor temporal que invalida la cookie. La navegación
recupera el login o permite Reintentar sin forzar una recarga del documento.
