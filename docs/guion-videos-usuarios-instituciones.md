# Guion de videos — Usuarios (HU001–HU018) e Instituciones (HU019–HU033)

Responsable: Ed. Dos videos, uno por feature. En cada paso di en voz alta el número de la historia ("HU005 — Registrar tutor") para que la profesora lo relacione con Azure.

## Antes de grabar

- **Sitio:** https://inscolar-app.onrender.com (salvo HU001, que se graba en local).
- **Grabar pantalla en Windows:** `Win + Alt + R` (Xbox Game Bar) graba la ventana del navegador; para editar y unir clips, Clipchamp viene con Windows 11. OBS Studio también sirve.
- **Navegador:** ventana a pantalla completa, zoom al 100 %, sin otras pestañas. Usa una ventana de incógnito para las cuentas nuevas, así no se mezclan sesiones.
- **Contraseña de las cuentas de demo:** `Inscolar#2026`.
- **Correo para las pruebas con código:** usa tu Gmail con un alias, por ejemplo `tucorreo+tutorvideo@gmail.com`. El código y el enlace llegan a tu bandeja normal.
- **Datos ficticios para el tutor nuevo:** nombre "Tutor Video", cédula de 11 dígitos que no exista (p. ej. `40212345678`), teléfono `8095550123`.
- **Reglas de contraseña:** con letras y números; de 8 a 15 caracteres al registrarse, y de 8 a 20 al cambiarla desde Seguridad (HU010). No puede repetir ninguna de las últimas 5.
- La duración razonable es 6–9 minutos por video. Si algo sale mal, corta y vuelve a grabar solo ese clip.

---

## Video 1 — Usuarios

### Clip 1 (en local) — HU001 Crear usuario administrativo inicial

Esta pantalla solo aparece cuando no existe ningún administrador, por eso se graba con una copia local que no toca los datos reales.

1. En la carpeta del proyecto: `npm run demo:primer-admin` y abre http://localhost:3001.
2. Muestra que la app pide la **configuración inicial**. Llena nombre, correo y contraseña del primer administrador → Crear.
3. Inicia sesión con ese administrador. Di: "solo se puede hacer cuando no hay ningún administrador; después esta pantalla ya no aparece".
4. Cierra el servidor (`Ctrl + C`).

### Clip 2 — HU005 Registrar tutor

1. En incógnito, abre el sitio → **Iniciar sesión** → **Registrarme como padre o tutor**.
2. Muestra una validación: deja la cédula con 10 dígitos → aparece el error. Corrígela.
3. Completa todo con tu correo alias → **Registrar**. Muestra que entra al panel del tutor.

### Clip 3 — HU006 Iniciar sesión y HU018 Cerrar sesión

1. **Cerrar sesión** (arriba a la derecha) → HU018.
2. Intenta entrar con una contraseña incorrecta → mensaje de error (también queda en Auditoría como intento fallido).
3. Entra bien → llega a **Inscripciones**, que es su pantalla de trabajo.

### Clip 4 — HU011 Visualizar perfil y HU012 Editar perfil

1. Menú **Mi perfil** → muestra los datos (HU011).
2. **Editar** → el nombre está bloqueado (criterio de HU012); cambia el teléfono móvil → Guardar → mensaje de confirmación y el dato actualizado.
3. Opcional: pon una foto de perfil (pasa el cursor sobre el avatar).

### Clip 5 — HU010 Cambiar contraseña

1. **Seguridad** → **Cambiar contraseña**.
2. Prueba una contraseña sin números (por ejemplo `soloLetras`) → error.
3. Pon una válida → confirmación.

### Clip 6 — HU008 Configurar MFA y HU009 Requerir MFA

1. **Seguridad** → **Configurar y Activar** la verificación en dos pasos.
2. Abre tu Gmail y escribe el código que llegó → queda activada (HU008).
3. Cierra sesión y vuelve a entrar → ahora pide el código del correo (HU009). Escríbelo y entra.
4. Desactiva el MFA para no complicar el resto del video.

### Clip 7 — HU007 Recuperar contraseña

1. Cierra sesión → **Recuperar contraseña** → tu correo alias.
2. Abre el enlace que llega a Gmail → define una contraseña nueva → entra con ella.

### Clip 8 — HU002, HU003, HU004 Crear usuarios (Administrador)

Entra como `maria.rosario@inscolar.do`.

1. **Usuarios** → **Nuevo usuario** → rol **Administrador** → crear (HU002). La contraseña temporal aparece en pantalla (modo de prueba sin correo).
2. Igual con rol **Soporte** (HU003).
3. Igual con rol **Personal de institución**: muestra que exige elegir la institución (HU004).

### Clip 9 — HU015 Modificar, HU014 Desactivar, HU013 Activar

1. En la lista, **Modificar** al usuario de personal recién creado → cambia el nombre → guardar (HU015). Muestra que el rol no se puede cambiar.
2. **Desactivar** la cuenta de Soporte `y.sanchez@inscolar.do` → confirmación → queda Inactiva (HU014). Di que esa cuenta de la demo está inactiva a propósito para mostrar esto.
3. **Activar** esa misma cuenta (HU013).
4. Opcional: intenta desactivar tu propia cuenta → el sistema no lo permite.

### Clip 10 — HU016 Reset de la contraseña de un usuario

1. **Resetear** la contraseña del usuario de personal → aparece la contraseña temporal.
2. En incógnito, entra con esa temporal → el sistema obliga a cambiarla antes de seguir.

### Clip 11 — HU017 Notificar a administradores

1. Como María, **Modificar** al administrador creado en el clip 8 (cámbiale el nombre).
2. Cierra sesión y entra como el otro administrador, `c.guzman@inscolar.do` → la **campana** muestra la notificación del cambio.

### Cierre (opcional, 20 s)

**Auditoría** → muestra que todo lo anterior quedó registrado (inicio de sesión fallido, usuario creado, desactivado…). Abre **Ver detalle** de uno: IP, navegador y el antes/después.

---

## Video 2 — Instituciones

### Clip 1 — HU019 Agregar una institución

Como `maria.rosario@inscolar.do` → **Instituciones** → **Nueva institución**.

1. Intenta guardar vacío → validaciones (RNC de 9 dígitos, correo, teléfono de 10 dígitos).
2. Completa: nombre, RNC, correo, teléfono, dirección, provincia, municipio (solo muestra los de esa provincia), distrito educativo, tipo.
3. **Ubicación en el mapa:** toca el punto exacto de la escuela; el marcador se pone sólido.
4. Sube un logo y una imagen de fondo → **Crear institución**.

### Clip 2 — HU020 Listar instituciones

1. Muestra el listado del administrador (RNC, correo, teléfono, fecha, estado, paginación).
2. Cierra sesión o usa incógnito: el **buscador público** también lista las instituciones activas, sin necesidad de cuenta.

### Clip 3 — Filtros: HU022 nombre, HU023 provincia, HU025 municipio, HU024 calificación, HU021 ubicación

En el buscador público:

1. Escribe parte de un nombre → la lista y el mapa se actualizan solos (HU022).
2. **Provincia: Santiago** → el mapa vuela a Santiago (HU023; también cubre "Filtrar búsqueda de liceo por provincia").
3. **Municipio** → solo ofrece los de Santiago (HU025).
4. **Calificación: 4+ estrellas** (HU024).
5. **Limpiar filtros** → **Cerca de mí** → acepta el permiso de ubicación del navegador → ordena por distancia y muestra los km (HU021).

### Clip 4 — HU026 Visualizar detalles

Toca una escuela de la lista → la tarjeta se convierte en la portada; muestra datos, mapa con su ubicación y calificación.

### Clip 5 — HU027 Calificar y HU028 Listar calificaciones

Entra como tutora `ana.beltre@correo.do` (tiene relación real con **Liceo Matutino Duarte**: una inscripción aprobada).

1. Abre el detalle de Liceo Matutino Duarte → **Ver calificaciones** (HU028).
2. **Calificar** → elige estrellas y comentario → guardar (HU027). Si ya tenía calificación, se edita (una sola por tutor e institución).
3. Muestra que el promedio cambió.

### Clip 6 — HU029 Reportar y HU030 Listar reportes

1. Como Ana, en **Inscripciones** → en la solicitud aprobada → **Reportar** → motivo y descripción → enviar (HU029).
2. Entra como personal `jm.cepeda@sanrafael.edu.do` → **Mi institución** → **Ver reportes** (HU030). Para San Rafael hay un reporte de la demo; también puedes mostrarlo como administrador desde **Instituciones → Reportes** del Liceo.

### Clip 7 — HU033 Modificar una institución

1. Como administrador → **Instituciones** → **Modificar** la institución del clip 1 → cambia el teléfono → guardar.
2. Opcional (muestra permisos): como personal `jm.cepeda@sanrafael.edu.do` → **Mi institución** → **Modificar datos**: puede cambiar contacto, ubicación e imágenes, pero el nombre, RNC, provincia, tipo y estado están bloqueados.

### Clip 8 — HU032 Desactivar y HU031 Activar

1. Como administrador → **Desactivar** la institución del clip 1 → confirma.
2. En incógnito, busca su nombre en el buscador público → ya no aparece.
3. **Activar** de nuevo → vuelve a aparecer.

### Cierre (opcional)

**Auditoría** filtrando por acción "Institución modificada" → **Ver detalle** muestra el teléfono anterior y el nuevo.

---

## Después de grabar

- Si creaste usuarios o una institución de prueba, puedes dejarlos o desactivarlos; no afectan la demo.
- Si cambiaste la contraseña de alguna cuenta de demo (no deberías: usa tu cuenta de tutor nueva para los clips de contraseña), avísame y la restablezco.
