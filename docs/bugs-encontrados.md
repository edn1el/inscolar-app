# Bugs encontrados y corregidos (para registrar en Azure DevOps)

Solo fallos reales: cada uno se reprodujo, se corrigió y tiene su commit en `edn1el/inscolar-app` (rama `main`). No incluye mejoras de diseño ni funciones nuevas.

Para cada uno, en Azure: **New Work Item → Bug**, vincularlo a su historia (Related / Parent) y pasarlo a **Done** con el commit en "Development" o en la descripción. Campos sugeridos: Título, Pasos para reproducir (Repro Steps), Resultado esperado vs. obtenido, Corrección, Commit, Severidad.

## Resumen por responsable (división de Pedro)

| # | Bug | HU | Responsable | Severidad | Commit |
|---|---|---|---|---|---|
| 1 | Editar un usuario guardaba el cambio aunque el correo fuera inválido o repetido | HU015 | Ed | 2 - Alta | 0da783b |
| 2 | Modificar el nombre o correo de un administrador no notificaba a los administradores | HU017 | Ed | 2 - Alta | (este commit) |
| 3 | Cambiar contraseña rechazaba contraseñas de 16 a 20 caracteres | HU010 | Ed | 3 - Media | (este commit) |
| 4 | El filtro de Provincia del buscador público solo mostraba "Todas" y Municipio nunca se llenaba | HU023, HU025 | Ed | 2 - Alta | 02fd701 |
| 5 | Las fotos de las instituciones no cargaban (404) en el detalle público | HU026 | Ed | 3 - Media | a3d0bbb |
| 6 | "Ver reportes" y "Ver calificaciones" mostraban "No tienes permiso" al personal y al tutor | HU028, HU030 | Ed | 2 - Alta | aec4c60 |
| 7 | El personal de institución tenía el filtro por calificación (el criterio 12 lo prohíbe) | HU024 | Ed | 3 - Media | ed92370 |
| 8 | Colegio Cristo Rey: su imagen registrada no existía en el disco (404) | HU026 | Ed | 4 - Baja | d6a80ff |
| 9 | Texto del login se perdía sobre el símbolo y en modo oscuro el fondo salía rosado (VIS-01) | HU006 | Ed | 3 - Media | a3d0bbb |
| 10 | Una cita rechazada no liberaba su cupo (solo las canceladas) | HU043, HU054 | Pedro | 2 - Alta | 452c05e |
| 11 | Se podía bajar el límite de citas por debajo de las ya ocupadas | HU043 | Pedro | 3 - Media | 452c05e |
| 12 | Se podían borrar periodos o ciclos que ya tenían solicitudes, documentos o citas | HU040–HU042 | Pedro | 2 - Alta | 452c05e |
| 13 | El personal de institución no podía entrar a los periodos de su institución (FUN-06) | HU034–HU036 | Pedro | 2 - Alta | b48338a |
| 14 | La inscripción se enviaba sin pedir los documentos requeridos | HU046 | Pedro | 1 - Crítica | 236b509 |
| 15 | La API de documentos no devolvía el tipo; todos se mostraban como "Documento" | HU047 | Pedro | 3 - Media | 236b509 |
| 16 | Analíticas no era visible para Soporte ni Auditoría | HU067 | Angel | 3 - Media | ed92370 |
| 17 | Un inicio de sesión fallido quedaba registrado como acción del propio usuario y sin motivo | HU102, HU104 | Angel / Antoine | 3 - Media | 0da783b |
| 18 | La auditoría guardaba la IP de Cloudflare en lugar de la del visitante | HU096–HU104 | Angel | 3 - Media | f792d58 |
| 19 | No se registraban: cambio de contraseña, calificaciones, reportes, cita modificada, cambios de periodo, correos | HU101, HU109, HU110, HU119, HU123–HU127 | Angel / Antoine | 2 - Alta | 0da783b |
| 20 | Las sesiones se cerraban para todos con cada despliegue en Render | Transversal | Equipo | 2 - Alta | c717a33 |
| 21 | Tras un despliegue, el navegador seguía mostrando la versión vieja de la app | Transversal | Equipo | 3 - Media | 873e42e |
| 22 | En móvil la barra superior se salía de la pantalla y las tablas perdían las etiquetas | Transversal | Equipo | 3 - Media | a3d0bbb |

## Detalle

### 1. Editar un usuario guardaba un correo inválido o repetido (HU015)
- **Pasos:** Admin → Usuarios → Modificar un usuario → escribir un correo ya usado por otra cuenta (o sin @) → Guardar.
- **Esperado:** error y no se guarda.
- **Obtenido:** el servidor calculaba el error pero no lo devolvía; el cambio se guardaba.
- **Corrección:** se devuelve el error antes de aplicar cambios.

### 2. HU017 no notificaba al modificar datos de un administrador
- **Pasos:** Admin A → Usuarios → Modificar al administrador B → cambiar su nombre. Entrar como otro administrador y abrir la campana.
- **Esperado (HU017):** "ante cualquier modificación" de un administrador se notifica a los administradores, en la app y por correo, con el campo y quién lo cambió.
- **Obtenido:** solo se notificaba al activar, desactivar o resetear la contraseña.
- **Corrección:** al editar nombre, correo o institución de un administrador se notifica cada campo con su valor anterior y nuevo.

### 3. HU010 limitaba la contraseña nueva a 15 caracteres
- **Pasos:** Seguridad → Cambiar contraseña → nueva de 18 caracteres válida.
- **Esperado (HU010):** mínimo 8, máximo 20.
- **Obtenido:** "Debe tener entre 8 y 15 caracteres".
- **Corrección:** límite de 20 en el servidor y en el texto de ayuda.

### 4. Filtros de Provincia y Municipio vacíos en el buscador público (HU023, HU025)
- **Pasos:** abrir el buscador sin iniciar sesión → desplegar Provincia.
- **Esperado:** las 32 provincias; al elegir una, sus municipios.
- **Obtenido:** solo "Todas"; Municipio siempre vacío. El código leía `window.DR_PROVINCES`, que no existe.
- **Corrección:** usa las listas `PROVINCIAS` y `MUNICIPIOS` de la app.

### 5. Fotos de instituciones daban 404 (HU026)
- **Pasos:** buscador → abrir el detalle de Colegio San Rafael.
- **Obtenido:** la imagen no cargaba: no existía la ruta `GET /api/institutions/:id/foto`.
- **Corrección:** se agregó la ruta.

### 6. "Ver reportes" / "Ver calificaciones" sin permiso (HU028, HU030)
- **Pasos:** entrar como `jm.cepeda@sanrafael.edu.do` → Mi institución → Ver reportes.
- **Esperado:** el personal ve los reportes y calificaciones de su institución; el tutor ve los suyos.
- **Obtenido:** "No tienes permiso para ver esta sección" y el menú saltaba a Mi perfil.
- **Corrección:** se abrió la vista y el servidor filtra por rol (personal: su institución; tutor: lo suyo).

### 7. Personal con filtro por calificación (HU024, criterio 12)
- **Obtenido:** el personal de institución veía y usaba el filtro.
- **Corrección:** se oculta y el servidor lo ignora para ese rol.

### 8. Imagen perdida de Colegio Cristo Rey (HU026)
- **Obtenido:** la institución apuntaba a un logo y un fondo cuyo archivo ya no existía (404).
- **Corrección:** si el archivo falta, se muestra el sello de Inscolar y se reasigna una imagen.

### 9. Login: texto ilegible y modo oscuro rosado (HU006, VIS-01)
- **Obtenido:** el símbolo grande tapaba el texto inferior; en modo oscuro el panel usaba colores claros y se veía rosado.
- **Corrección:** colores fijos de marca en el panel y tamaño/posición del símbolo ajustados.

### 10–12. Reglas de citas y periodos (HU040–HU043, HU054)
- **10:** rechazar una cita no liberaba su cupo; ahora solo Pendiente y Confirmada ocupan cupo.
- **11:** se podía guardar un límite menor que las citas ocupadas; ahora se rechaza con mensaje.
- **12:** se podía borrar un periodo/ciclo con solicitudes, documentos o citas; ahora se rechaza con mensaje.

### 13. Personal sin acceso a sus periodos (HU034–HU036, hallazgo FUN-06)
- **Obtenido:** el servidor lo permitía, pero la pantalla decía "No tienes permiso" y no había menú.
- **Corrección:** menú "Mi institución" y "Periodos y fechas" para su institución.

### 14. Inscripción sin documentos requeridos (HU046)
- **Pasos:** tutor → Nueva inscripción → Colegio San Rafael (pide 3 documentos) → Enviar.
- **Esperado (HU046):** el flujo pide los documentos exigidos y no se envía si falta alguno.
- **Obtenido:** se enviaba sin ningún documento.
- **Corrección:** paso de documentos en el formulario y validación en el servidor (solicitud y archivos juntos).

### 15. Tipo de documento ausente en la API (HU047)
- **Obtenido:** `GET /api/enrollments/:id/documents` no devolvía `tipoDocumento`; la pantalla mostraba "Documento".
- **Corrección:** se incluye el tipo.

### 16. Analíticas solo para Administrador (HU067)
- **Esperado:** "Solo debe ser accesible para administrador, soporte, auditoría".
- **Corrección:** servidor y menú abiertos para esos tres roles.

### 17–19. Auditoría (HU096–HU127)
- **17:** el intento fallido se atribuía al usuario y sin motivo; ahora queda como "Sin sesión" con el correo intentado y el motivo.
- **18:** detrás de Cloudflare se guardaba la IP del proxy; ahora se usa `CF-Connecting-IP`.
- **19:** varios eventos no se registraban; ahora sí, con IP, navegador, antes/después y datos en JSON.

### 20–22. Transversales
- **20:** las sesiones vivían en memoria y se perdían en cada despliegue; ahora se guardan en el disco.
- **21:** el navegador guardaba la versión vieja; ahora HTML/JS/CSS se revalidan en cada carga.
- **22:** en móvil, barra superior desbordada y tablas sin etiquetas; corregido.
