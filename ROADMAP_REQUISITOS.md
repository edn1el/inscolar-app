# Hoja de ruta — Requisitos de Azure DevOps vs. Prototipo Inscolar

Última actualización: 2026-08-29 (comparación hecha contra el backlog completo de Azure DevOps, proyecto **Inscolar**, org **INTEC-IDS323L-01-2024-03-Equipo-02** — 134 Historias de Usuario activas, sin contar las marcadas como *Removed*).

Este documento es la referencia persistente entre sesiones para saber qué falta y en qué orden se va a construir. Se actualiza cada vez que se completa una fase.

**Nota sobre los estados en Azure DevOps:** todas las 134 HU activas aparecen como `New` en el tablero — el equipo no ha estado moviendo las tarjetas para reflejar avance real. Por eso esta comparación se hizo directamente contra el código del prototipo, HU por HU, no contra el estado del tablero.

## Leyenda

- ✅ Implementado en el prototipo
- 🟡 Implementado parcialmente
- ❌ No implementado

## 1. Acceso, cuenta y perfil

| HU | Título | Estado |
|----|--------|--------|
| HU001 | Crear usuario administrativo inicial | ✅ |
| HU005 | Registrar tutor | ✅ |
| HU006 | Iniciar sesión | ✅ |
| HU007 | Recuperar contraseña | ✅ |
| HU008 | Configurar autenticación multifactor | ✅ |
| HU009 | Requerir autenticación multifactor | ✅ |
| HU010 | Cambiar contraseña | ✅ |
| HU011 | Visualizar perfil de usuario | ✅ |
| HU012 | Editar perfil de usuario | ✅ |
| HU018 | Cerrar sesión | ✅ |
| HU065 | Mostrar menú de configuración | ✅ (2026-09-01, Fase 9) |
| HU133 | Mostrar manual de instrucciones | ✅ (2026-09-01, Fase 9) |

## 2. Gestión de usuarios (Admin/Soporte)

| HU | Título | Estado |
|----|--------|--------|
| HU002 | Crear un usuario administrativo | ✅ |
| HU003 | Crear un usuario de soporte | ✅ |
| HU004 | Crear un usuario personal de institución | ✅ |
| HU013 | Activar un usuario | ✅ |
| HU014 | Desactivar un usuario | ✅ |
| HU015 | Modificar un usuario | ✅ |
| HU016 | Reset de la contraseña de un usuario | ✅ |
| HU017 | Notificar a administradores cuando se modifique un usuario administrador | ✅ |

**Módulo completo.**

## 3. Instituciones

| HU | Título | Estado |
|----|--------|--------|
| HU019 | Agregar una institución | ✅ |
| HU020 | Listar instituciones | ✅ |
| HU021 (filtro ubicación) | Filtrar instituciones por ubicación actual del dispositivo | ✅ (2026-09-01, Fase 10) |
| HU020/HU022 | Filtrar instituciones por nombre | ✅ |
| HU023 | Filtrar instituciones por provincia | ✅ (arreglado 2026-08-29 — bug de espacios en la URL) |
| HU024 | Filtrar instituciones por calificación | ✅ (2026-08-29, Fase 2) |
| HU025 | Filtrar instituciones por municipio | ✅ (2026-08-29, Fase 4) |
| HU026 | Visualizar detalles sobre una institución | 🟡 (se ve en la lista/edición, no hay una pantalla de "detalle" dedicada) |
| HU027 | Calificar una institución | ✅ (2026-08-29, Fase 2) |
| HU028 | Listar calificaciones dadas a una institución | ✅ (2026-08-29, Fase 2) |
| HU029 | Reportar una institución | ✅ (2026-08-29, Fase 2) |
| HU030 | Listar reportes hechos contra una institución | ✅ (2026-08-29, Fase 2 — solo lectura; no incluye marcar un reporte como "Revisado") |
| HU031 | Activar una institución | ✅ |
| HU032 | Desactivar una institución | ✅ |
| HU033 | Modificar una institución | ✅ |

## 4. Periodos y configuración de ciclo escolar

| HU | Título | Estado |
|----|--------|--------|
| HU034 | Agregar periodo de inscripción de una institución | ✅ (2026-08-30, Fase 6) |
| HU035 | Agregar periodo de envío de documentos en un ciclo de inscripción | ✅ (2026-08-30, Fase 6) |
| HU036 | Agregar periodo para agendar citas en un ciclo de inscripción | ✅ (2026-08-30, Fase 6) |
| HU037 | Modificar periodo de inscripción de una institución | ✅ (2026-08-30, Fase 6) |
| HU038 | Modificar periodo de envío de documentos | ✅ (2026-08-30, Fase 6) |
| HU039 | Modificar periodo para agendar citas | ✅ (2026-08-30, Fase 6) |
| HU040 | Eliminar periodo de inscripción | ✅ (2026-08-30, Fase 6) |
| HU041 | Eliminar periodo de envío de documentos | ✅ (2026-08-30, Fase 6) |
| HU042 | Eliminar periodo para agendar citas | ✅ (2026-08-30, Fase 6) |
| HU043 | Agregar límite de citas para un periodo | ✅ (2026-08-30, Fase 6) |
| HU044 | Agregar lista de documentos requeridos para inscripción | ✅ (2026-08-30, Fase 6) |
| HU045 | Modificar lista de documentos requeridos | ✅ (2026-08-30, Fase 6) |

**Módulo completo (2026-08-30).** Cada institución puede configurar, por ciclo escolar, un periodo de inscripción, un periodo de envío de documentos, un periodo para agendar citas (con límite opcional de citas) y una lista de documentos requeridos — todo desde el botón "Periodos" en el listado de Instituciones. Sin ninguna configuración para una institución/ciclo, el sistema sigue funcionando exactamente igual que antes (sin restricciones), así que no rompe nada existente. Las ventanas se validan contra el momento en que se hace la acción (enviar la solicitud, subir el documento, agendar la cita), no contra la fecha del evento en sí. Verificado con Playwright (20/20 pruebas).

## 5. Inscripciones y documentos

| HU | Título | Estado |
|----|--------|--------|
| HU046 | Iniciar proceso de inscripción | ✅ |
| HU047 | Subir documentos requeridos para inscripción | ✅ (2026-08-29, Fase 3) |
| HU048 | Rechazar un documento entregado | ✅ (2026-08-29, Fase 3) |
| HU049 | Aceptar un documento entregado | ✅ (2026-08-29, Fase 3) |
| HU056 | Listar solicitudes de inscripción | ✅ |
| HU057 | Rechazar una solicitud de inscripción | ✅ |
| HU058 | Abandonar solicitud de inscripción por inactividad | ❌ |
| HU059 | Aceptar una solicitud de inscripción | ✅ |
| HU060 | Notificar de cambios de estatus de una solicitud de inscripción | ✅ (2026-08-29, Fase 1) |

## 6. Citas

| HU | Título | Estado |
|----|--------|--------|
| HU050 | Agendar cita | ✅ |
| HU051 | Cancelar cita | ✅ |
| HU052 | Listar citas agendadas | ✅ |
| HU053 | Aceptar una cita | ✅ |
| HU054 | Rechazar una cita | 🟡 (existe cancelar con motivo, no un "rechazar" separado de "cancelar") |
| HU055 | Notificar sobre cambios en el estado de una cita | ✅ (2026-08-29, Fase 1) |
| HU061 | Mostrar calendario de una institución | ❌ |

## 7. Notificaciones

| HU | Título | Estado |
|----|--------|--------|
| HU062 | Recibir notificaciones por correo electrónico | ✅ (2026-09-01, Fase 8) |
| HU063 | Presentar notificaciones de cambio de estatus del proceso de inscripción por la interfaz web | ✅ (2026-08-29, Fase 1) |
| HU064 | Presentar notificaciones de cambios en el estado de una cita por la interfaz web | ✅ (2026-08-29, Fase 1) |
| HU066 | Configurar preferencias para notificaciones por correo | ✅ (2026-09-01, Fase 8) |

Actualizado 2026-08-29: el panel de notificaciones ahora tambien notifica al tutor cuando su inscripcion es aprobada/rechazada o su cita es confirmada/cancelada por la institucion (Fase 1 completada).

Actualizado 2026-09-01 (Fase 8): cada notificacion (interna) ahora tambien intenta enviar un correo real (via SMTP si esta configurado, o simulado con constancia en el sistema si no) al destinatario o a cada Administrador/Soporte activo, respetando la preferencia de cada usuario (HU066, activada por defecto). Verificado que desactivar la preferencia suprime el correo sin afectar la notificacion interna.

## 8. Analíticas

| HU | Título | Estado |
|----|--------|--------|
| HU067 | Mostrar dashboard de analíticas | ✅ |
| HU068 | Mostrar analíticas de usuarios | ✅ |
| HU069 | Gráfico de usuarios registrados por rol | ✅ |
| HU070 | Gráfico de usuarios registrados por año | ✅ (2026-09-01, Fase 7) |
| HU071 | Indicador de tasa de recuperación de contraseña | ✅ (2026-09-01, Fase 7) |
| HU072 | Gráfico de distribución geográfica de usuarios | ✅ (2026-09-01, Fase 7 — solo cubre Personal de institución, el único rol con ubicación propia) |
| HU073 | Analíticas de instituciones | ✅ |
| HU074 | Indicador de cantidad de instituciones | ✅ |
| HU075 | Gráfico de instituciones por provincia | ✅ (el mapa interactivo) |
| HU076-HU079 | Indicadores/gráficos de calificaciones y reportes de instituciones | ✅ (2026-09-01, Fase 7) |
| HU080-HU084 | Analíticas de solicitudes de inscripción (total, aceptadas, rechazadas, pendientes) | ✅ (2026-09-01, Fase 7) |
| HU085-HU088 | Analíticas de documentos (total, aprobados, rechazados, pendientes) | ✅ (2026-09-01, Fase 7) |
| HU089-HU093 | Analíticas de citas (total, por institución, aceptadas, rechazadas, pendientes) | ✅ (2026-09-01, Fase 7) |
| HU094 | Indicador de total de correos enviados | ✅ (2026-09-01, Fase 8 — el indicador ahora refleja el conteo real de db.emailLog, con una lista de correos recientes visible para administradores en Analíticas) |
| HU095 | Indicador de total de notificaciones leídas | ✅ (2026-09-01, Fase 7) |

## 9. Auditoría / Logs del sistema

| HU | Título | Estado |
|----|--------|--------|
| HU096-HU132 (37 historias) | Registrar creación/modificación/activación/desactivación de usuarios e instituciones, inicios/cierres de sesión, intentos fallidos, cambios en inscripciones/documentos/citas/periodos, envío de correos, lectura de notificaciones importantes; listar logs; filtrar logs por fecha, tipo de acción y usuario | 🟡 (2026-08-30, Fase 5) — ver nota abajo |

Este es el bloque más grande (37 historias) y el más "todo o nada": es esencialmente un sistema de bitácora aparte, con su propia tabla de eventos y una pantalla para el rol **Auditoría**.

**Estado tras la Fase 5 (2026-08-30):** se implementó el núcleo funcional del módulo — no las 37 historias literalmente una por una, pero sí lo que las agrupa: `lib/audit.js` registra eventos (`logEvent`) en una nueva colección `db.logs`; se instrumentaron los flujos reales de creación/edición/activación/desactivación de usuarios e instituciones, inicio/cierre de sesión e intentos fallidos, creación/aprobación/rechazo/cancelación de inscripciones, creación/confirmación/cancelación de citas, subida/aceptación/rechazo de documentos, y lectura de notificaciones importantes de cuentas de Administrador; y se agregó `GET /api/logs` + la pantalla "Auditoría" (menú, tabla, filtros por fecha/acción/usuario/texto) visible para los roles Administrador y Auditoría. Verificado con Playwright (18/18 pruebas), incluyendo que otros roles no pueden ver la pantalla ni la API.

Actualizado 2026-09-01 (Fase 8): el envío de correos (HU062/HU094) ya está implementado — ver `lib/mailer.js`. La cuenta de prueba de Auditoría (`p.lluberes@inscolar.do`) sigue marcada **Inactiva** en los datos reales — Ed decide si la activa para probar la pantalla él mismo.

---

## Plan de fases (acordado con Ed el 2026-08-29)

Ed pidió: "todo, pero que salga bien", en sesiones separadas está bien. Orden sugerido por impacto/esfuerzo:

1. **Fase 1 — Notificaciones de inscripciones y citas** (HU055, HU060, HU063, HU064): reutiliza el sistema de notificaciones ya construido. **✅ Completada 2026-08-29** — verificada con Playwright real (crear inscripcion/cita, aprobar/confirmar desde el rol Personal de institucion, y comprobar que el tutor recibe la notificacion correcta con aislamiento correcto entre usuarios).
2. **Fase 2 — Calificar y reportar instituciones** (HU027-030, habilita HU024). **✅ Completada 2026-08-29** — verificada con Playwright real (calificar y reportar una institución con relación real, rechazo 403 sin relación, promedio y filtro visibles para Admin/Soporte, detalle de calificaciones/reportes). Nota: HU076-079 (indicadores/gráficos de calificaciones y reportes en Analíticas) quedan para la Fase 7, ya que dependen de tener datos acumulados.
3. **Fase 3 — Documentos de inscripción**: subir/aceptar/rechazar (HU047-049, habilita HU085-088). **✅ Completada 2026-08-29** — verificada con Playwright real (subida de PDF, rechazo de tipo de archivo no permitido, aceptar/rechazar desde el rol de personal de institución con notificación al tutor, y control de acceso por sesión). HU085-088 (indicadores de documentos en Analíticas) quedan para la Fase 7.
4. **Fase 4 — Filtros adicionales de instituciones**: por municipio (HU025) — el filtro por calificación (HU024) ya se completó en la Fase 2. **✅ Completada 2026-08-29** — se agregó el campo municipio (opcional) al formulario de instituciones, un filtro dinámico en el listado (construido a partir de los municipios ya registrados, sin lista fija) y se muestra junto al distrito en la tabla. Verificado con Playwright (8/8 pruebas: creación, filtro dinámico, precarga en edición, sin regresiones).
5. **Fase 5 — Módulo de Auditoría/Logs** (HU096-132): el bloque más grande — bitácora de eventos + pantalla para el rol Auditoría. **✅ Completada 2026-08-30** (núcleo funcional; ver nota en la sección 9 sobre lo que queda pendiente para periodos/correos de las Fases 6 y 8). Verificado con Playwright (18/18 pruebas).
6. **Fase 6 — Periodos y configuración** (HU034-045). **✅ Completada 2026-08-30** — verificado con Playwright (20/20 pruebas).
7. **Fase 7 — Analíticas restantes** (HU070-072, HU080-095): se van completando a medida que las fases anteriores generan los datos que necesitan. **✅ Completada 2026-09-01** — verificado con Playwright (24/24 pruebas de esta fase; 44/44 contando la re-verificación de las Fases 4-6). HU094 quedó completado del todo en la Fase 8.
8. **Fase 8 — Notificaciones por correo real + preferencias** (HU062, HU066). **✅ Completada 2026-09-01** — nuevo `lib/mailer.js` (SMTP real si está configurado, o simulado con constancia en `db.emailLog` si no), preferencia por usuario `notifyByEmail` (por defecto activada) con endpoint `PUT /users/me/notification-prefs` y tarjeta en Seguridad, envío disparado desde `notifyUser`/`notifyAdmins`, y visibilidad para administradores vía `GET /emails` y la sección "Correos enviados recientemente" en Analíticas. Verificado con Playwright: 22/22 pruebas, incluyendo que desactivar la preferencia efectivamente suprime el correo sin afectar la notificación interna.
9. **Fase 9 — Manual de instrucciones y menú de configuración** (HU133, HU065). **✅ Completada 2026-09-01** — nueva sección "Configuración" en el menú lateral (accesos directos a perfil, seguridad, manual y, para Admin/Soporte, a los módulos del sistema) y nueva sección "Manual de instrucciones" con guía en acordeón, general más específica por rol. Verificado con Playwright: 27/27 pruebas, incluyendo que cada rol ve solo lo que le corresponde.
10. **Fase 10 — Filtro de instituciones por ubicación del dispositivo** (geolocalización, HU021). **✅ Completada 2026-09-01** — nuevo `lib/geo.js` con coordenadas aproximadas por provincia (el prototipo no tiene direcciones geocodificadas por institución) y distancia por fórmula de Haversine; `GET /institutions` acepta `lat`/`lng`/`radioKm` y devuelve `distanciaKm` ordenado por cercanía; en la pantalla de Instituciones, botón "Cerca de mí" que usa `navigator.geolocation`, selector de radio y columna de distancia, con manejo de permiso denegado. Verificado con Playwright: 22/22 pruebas.
11. **Fase 11 — Vencimiento/abandono de inscripciones, rechazo explícito de citas, vista de detalle y calendario de institución** (HU058, HU054, HU061, HU026). Cierra los últimos huecos detectados en la comparación con Azure DevOps.

Cada fase se implementa, se prueba con Playwright de verdad (no solo revisión de código), y se hace commit por separado en la rama `fix/busqueda-y-alto-contraste` (o una rama nueva si Ed lo prefiere).
