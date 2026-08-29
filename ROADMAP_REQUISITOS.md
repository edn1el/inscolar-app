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
| HU065 | Mostrar menú de configuración | ❌ |
| HU133 | Mostrar manual de instrucciones | ❌ |

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
| HU021 (filtro ubicación) | Filtrar instituciones por ubicación actual del dispositivo | ❌ |
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
| HU034 | Agregar periodo de inscripción de una institución | ❌ |
| HU035 | Agregar periodo de envío de documentos en un ciclo de inscripción | ❌ |
| HU036 | Agregar periodo para agendar citas en un ciclo de inscripción | ❌ |
| HU037 | Modificar periodo de inscripción de una institución | ❌ |
| HU038 | Modificar periodo de envío de documentos | ❌ |
| HU039 | Modificar periodo para agendar citas | ❌ |
| HU040 | Eliminar periodo de inscripción | ❌ |
| HU041 | Eliminar periodo de envío de documentos | ❌ |
| HU042 | Eliminar periodo para agendar citas | ❌ |
| HU043 | Agregar límite de citas para un periodo | ❌ |
| HU044 | Agregar lista de documentos requeridos para inscripción | ❌ |
| HU045 | Modificar lista de documentos requeridos | ❌ |

**Módulo completo sin empezar.** Hoy el "ciclo escolar" es solo un dropdown de texto libre, no hay periodos configurables ni límites.

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
| HU062 | Recibir notificaciones por correo electrónico | ❌ |
| HU063 | Presentar notificaciones de cambio de estatus del proceso de inscripción por la interfaz web | ✅ (2026-08-29, Fase 1) |
| HU064 | Presentar notificaciones de cambios en el estado de una cita por la interfaz web | ✅ (2026-08-29, Fase 1) |
| HU066 | Configurar preferencias para notificaciones por correo | ❌ |

Actualizado 2026-08-29: el panel de notificaciones ahora tambien notifica al tutor cuando su inscripcion es aprobada/rechazada o su cita es confirmada/cancelada por la institucion (Fase 1 completada). Sigue faltando el correo real (HU062) y las preferencias (HU066).

## 8. Analíticas

| HU | Título | Estado |
|----|--------|--------|
| HU067 | Mostrar dashboard de analíticas | ✅ |
| HU068 | Mostrar analíticas de usuarios | ✅ |
| HU069 | Gráfico de usuarios registrados por rol | ✅ |
| HU070 | Gráfico de usuarios registrados por año | ❌ |
| HU071 | Indicador de tasa de recuperación de contraseña | ❌ |
| HU072 | Gráfico de distribución geográfica de usuarios | ❌ |
| HU073 | Analíticas de instituciones | ✅ |
| HU074 | Indicador de cantidad de instituciones | ✅ |
| HU075 | Gráfico de instituciones por provincia | ✅ (el mapa interactivo) |
| HU076-HU079 | Indicadores/gráficos de calificaciones y reportes de instituciones | ❌ (depende de la Sección 3) |
| HU080-HU084 | Analíticas de solicitudes de inscripción (total, aceptadas, rechazadas, pendientes) | ❌ |
| HU085-HU088 | Analíticas de documentos (total, aprobados, rechazados, pendientes) | ❌ (depende de la Sección 5) |
| HU089-HU093 | Analíticas de citas (total, por institución, aceptadas, rechazadas, pendientes) | ❌ |
| HU094 | Indicador de total de correos enviados | ❌ |
| HU095 | Indicador de total de notificaciones leídas | ❌ |

## 9. Auditoría / Logs del sistema

| HU | Título | Estado |
|----|--------|--------|
| HU096-HU132 (37 historias) | Registrar creación/modificación/activación/desactivación de usuarios e instituciones, inicios/cierres de sesión, intentos fallidos, cambios en inscripciones/documentos/citas/periodos, envío de correos, lectura de notificaciones importantes; listar logs; filtrar logs por fecha, tipo de acción y usuario | ❌ **Módulo completo sin empezar** |

Este es el bloque más grande (37 historias) y el más "todo o nada": es esencialmente un sistema de bitácora aparte, con su propia tabla de eventos y una pantalla para el rol **Auditoría** (que hoy no tiene absolutamente nada que hacer en el sistema — su cuenta de prueba ni siquiera puede iniciar sesión porque está marcada inactiva).

---

## Plan de fases (acordado con Ed el 2026-08-29)

Ed pidió: "todo, pero que salga bien", en sesiones separadas está bien. Orden sugerido por impacto/esfuerzo:

1. **Fase 1 — Notificaciones de inscripciones y citas** (HU055, HU060, HU063, HU064): reutiliza el sistema de notificaciones ya construido. **✅ Completada 2026-08-29** — verificada con Playwright real (crear inscripcion/cita, aprobar/confirmar desde el rol Personal de institucion, y comprobar que el tutor recibe la notificacion correcta con aislamiento correcto entre usuarios).
2. **Fase 2 — Calificar y reportar instituciones** (HU027-030, habilita HU024). **✅ Completada 2026-08-29** — verificada con Playwright real (calificar y reportar una institución con relación real, rechazo 403 sin relación, promedio y filtro visibles para Admin/Soporte, detalle de calificaciones/reportes). Nota: HU076-079 (indicadores/gráficos de calificaciones y reportes en Analíticas) quedan para la Fase 7, ya que dependen de tener datos acumulados.
3. **Fase 3 — Documentos de inscripción**: subir/aceptar/rechazar (HU047-049, habilita HU085-088). **✅ Completada 2026-08-29** — verificada con Playwright real (subida de PDF, rechazo de tipo de archivo no permitido, aceptar/rechazar desde el rol de personal de institución con notificación al tutor, y control de acceso por sesión). HU085-088 (indicadores de documentos en Analíticas) quedan para la Fase 7.
4. **Fase 4 — Filtros adicionales de instituciones**: por municipio (HU025) — el filtro por calificación (HU024) ya se completó en la Fase 2. **✅ Completada 2026-08-29** — se agregó el campo municipio (opcional) al formulario de instituciones, un filtro dinámico en el listado (construido a partir de los municipios ya registrados, sin lista fija) y se muestra junto al distrito en la tabla. Verificado con Playwright (8/8 pruebas: creación, filtro dinámico, precarga en edición, sin regresiones).
5. **Fase 5 — Módulo de Auditoría/Logs** (HU096-132): el bloque más grande — bitácora de eventos + pantalla para el rol Auditoría. Se recomienda hacerlo en más de una sesión.
6. **Fase 6 — Periodos y configuración** (HU034-045).
7. **Fase 7 — Analíticas restantes** (HU070-072, HU080-095): se van completando a medida que las fases anteriores generan los datos que necesitan.
8. **Fase 8 — Notificaciones por correo real + preferencias** (HU062, HU066).
9. **Fase 9 — Manual de instrucciones y menú de configuración** (HU133, HU065).
10. **Fase 10 — Filtro de instituciones por ubicación del dispositivo** (geolocalización).

Cada fase se implementa, se prueba con Playwright de verdad (no solo revisión de código), y se hace commit por separado en la rama `fix/busqueda-y-alto-contraste` (o una rama nueva si Ed lo prefiere).
