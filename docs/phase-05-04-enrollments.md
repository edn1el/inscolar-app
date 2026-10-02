# F5.4 — gestión, revisión y seguimiento de inscripciones

Fuentes: `inscolar-contexto/Inscolar_Historias_Azure_Pendientes.txt` (versión 2, 29/09/2026), `Inscolar_Azure_134_Historias_Legibles.txt` y `Inscolar_Plan_Integral_Implementacion (1).txt`. ROADMAP_REQUISITOS.md queda excluido.

## Transiciones y permisos

`lib/enrollment-service.js` contiene estados, versiones, permisos, documentos obligatorios, disponibilidad y eventos. Cada mutación exige la versión leída; una versión obsoleta devuelve 409 sin sobrescribir decisiones. Reenviar una decisión final no agrega eventos ni consume o libera otro cupo.

| Transición | Actor / condición |
|---|---|
| Borrador → Enviada | Tutor titular al enviar el wizard; conserva idempotencia por borrador |
| Enviada → En revisión | Personal de la institución, Administrador o Soporte |
| En revisión → Aceptada | Mismos revisores; documentos aprobados, institución activa, grado válido, envío dentro del periodo y cupo configurado disponible o reserva propia |
| Enviada / En revisión / Documentos pendientes → Rechazada | Revisor autorizado; motivo obligatorio de 3–2000 caracteres (HU057) |
| En revisión → Documentos pendientes | Rechazo documental; conserva motivo e historial; no acepta inscripción |
| Documentos pendientes → En revisión | Tutor envía todas las correcciones con la acción existente de F5.3 |
| Enviada / En revisión → Cancelada | Solo tutor titular; motivo opcional; conserva expediente y eventos |
| Borrador → Abandonada | Solo inactividad o abandono del borrador; nunca una solicitud enviada |

Los permisos globales de Administrador/Soporte reutilizan la matriz ya implementada; Personal solo su institución y Tutor solo sus solicitudes. Las decisiones documentales exigen iniciar revisión y versión vigente. `Aceptada`, `Rechazada`, `Cancelada` y `Abandonada` son terminales. Se leen los estados antiguos `Pendiente` como Enviada y `Aprobada` como Aceptada sin reescribir los datos pendientes ni inventar eventos anteriores.

La cancelación de inscripción y los cupos de inscripción carecen de una definición específica en las historias: se conserva el alcance de cancelación anterior y se implementa el contrato explícito de cupos de este prototipo. No se usa el límite de citas para inscripciones. F5.5 no se modifica.

## Cupos y persistencia del prototipo

`enrollmentCapacities`: `{id, institucionId, cicloEscolar, grado, limite}`. El límite es entero positivo; no configurado bloquea aceptación. Personal de la institución, Administrador y Soporte pueden configurarlo desde el detalle, reutilizando permisos del editor de periodos:

`PUT /api/institutions/:id/periods/:periodId/cupos-inscripcion` con `{grado, limite}`. Reducir bajo aceptadas + reservas vigentes devuelve 409.

`enrollmentReservations`, cuando realmente exista una reserva: `{id, capacityId, enrollmentId, estado:'Reservada'}`. Una reserva de borrador debe contener `draftId`, `tutorId` y opcionalmente `expiresAt`; se transfiere al enviar sin crear otra. Aceptar convierte únicamente su reserva a Consumida; rechazar/cancelar cambia únicamente las suyas a Liberada. El abandono del borrador libera solo reservas que coincidan en borrador y tutor. No se crean reservas ficticias al iniciar el wizard.

La ocupación se obtiene de solicitudes Aceptadas (incluidas las Aprobadas antiguas) y reservas Reservadas no vencidas. Convertir una reserva evita descontar dos cupos. La disponibilidad se vuelve a validar al confirmar. Mutaciones síncronas en un solo proceso Node evitan intercalación durante validación/guardado; la escritura JSON usa archivo temporal y renombrado. No hay garantía de transacción multiproceso: producción requiere base transaccional, bloqueo/compare-and-swap, restricciones únicas e idempotencia duradera. Escritores asíncronos de otros módulos legacy, especialmente correo SMTP, también requieren migración a ese backend; F5.4 no invoca envío de correo.

## Servicio y UI

- `GET /api/enrollments`: filtra por propiedad/rol antes de búsqueda, estado, institución, ciclo y grado; `page` y `limit` opcionales para compatibilidad. Total sobre filas filtradas, páginas con resultados diferentes y orden estable.
- `GET /api/enrollments/:id`: resumen autorizado, versión, acciones, requisitos con último archivo y eventos persistidos. Los eventos antiguos solo se muestran si existen en la bitácora, con sus fechas y actores originales.
- `POST /api/enrollments/:id/revisar|decidir|correcciones|cancelar`: `{version, estado?, motivo?}`. Decidir acepta exclusivamente Aceptada/Rechazada; no soporta reabrir estados finales.
- `GET /api/enrollments/events`: SSE con avisos vacíos filtrados por permisos; después del guardado, la pantalla vuelve a consultar el expediente. Se verifica autorización vigente en cada aviso. BroadcastChannel, foco y reconexión complementan los avisos del proceso. Las acciones obsoletas se bloquean y se ofrece Actualizar; los motivos permanecen en el modal ante errores.
- Los estados tienen texto e icono, listados adaptados a móvil, claro/oscuro, diálogos compartidos con foco, Escape y botones deshabilitados durante la operación. Los errores de consulta ofrecen Reintentar.
- Notificaciones web dirigidas al tutor y enlazadas al detalle, con `eventId`, entidad y motivo. Se preparan eventos persistidos para integraciones posteriores; no se anuncian correos enviados. SSE es local al proceso: despliegue distribuido requiere bus persistente y recuperación de eventos.

## Trazabilidad

| Historia / Azure ID | Implementación y comprobación |
|---|---|
| HU046 / 192 | Wizard envía una solicitud Enviada; recorrido completo y duplicados |
| HU048 / 374 | Rechazo documental, motivo, corrección y versión obsoleta |
| HU049 / 375 | Aprobación de documentos no acepta inscripción; validación API |
| HU056 / 381 | Listado autorizado, búsqueda/filtros/paginación y detalle |
| HU057 / 382 | Rechazo con motivo, terminal, conflicto y notificación web |
| HU058 / 383 | No abandona solicitudes enviadas; regresión de inactividad 10/20 minutos |
| HU059 / 384 | Aceptación En revisión, documentos, cupo y reserva única |
| HU060 / 385 | Eventos/notificación web persistidos y detalle autorizado; correo pendiente |
| HU115–HU117 / 440–442 | Historial de transiciones/aceptación/rechazo con actor y fecha reales; Audit.NET y backend de auditoría productivo pendientes |

## Verificación y recorrido manual

`npm run test:f54`, `npm run test:review` y `npm run test:login` con Chromium de Playwright. Los scripts copian el servidor a un directorio temporal o usan DB_PATH aislado; nunca resetear `data/db.json` del usuario. F5.4 prueba peticiones paralelas, versiones obsoletas, cupos y reservas, fallo de guardado inyectado, errores de UI, móvil/oscuro, foco y recorrido real de dos sesiones.

1. Tutor: Inscripciones → Nueva inscripción; registrar estudiante, elegir institución/ciclo/grado y cargar requisitos → Enviar.
2. Personal de esa institución: filtrar la referencia → Ver detalle → Iniciar revisión.
3. Documentos: rechazar con motivo. Tutor abre Corregir documentos, carga reemplazo y Enviar Correcciones.
4. Personal: aprobar requisitos. En el detalle, configurar cupos del grado si faltan; confirmar Aceptar inscripción. El tutor ve Aceptada e historial.
5. En solicitudes distintas, probar rechazo y cancelación (confirmación y motivo); dos sesiones sobre el mismo expediente deben recibir aviso y bloquear decisiones antiguas.

Ambigüedades documentadas: HU048 describe retorno automático tras carga, mientras F5.3 existente y esta tarea contemplan Correcciones enviadas; se conserva la acción explícita para que una carga parcial no reinicie revisión. La revisión puede terminar después del cierre de inscripción: se exige que el envío original pertenezca al rango configurado, no que la decisión ocurra dentro de la ventana de captación.

Se reprodujo en una copia de `0306921` la aceptación legacy sin revisión ni documentos: devolvía 200. La misma aserción bloquea esa ruta en F5.4. Las capturas de verificación se guardan fuera del repositorio, en `/tmp/inscolar-f54-verified`, con animaciones desactivadas para capturar el estado final.

## Resultados ejecutados

- F5.4: 18 escenarios aprobados (19 entradas contando la suite), incluidos navegador, peticiones concurrentes, doble clic y fallo de guardado inyectado.
- F5.1–F5.3: 20 escenarios aprobados; autenticación: 25 escenarios aprobados, incluido reinicio real.
- Matriz F2: 22 comprobaciones aprobadas; smoke: 18/18.
- Capturas revisadas de detalle en escritorio claro y móvil oscuro. No equivale a una auditoría WCAG completa.
- Los hashes de `data/db.json` y `test_puppeteer.js` siguen siendo idénticos a los anteriores a la implementación.

## Ajustes de navegación y presentación

Los botones del shell registran su navegación una sola vez, incluso al cambiar de etapa. El wizard mantiene una única confirmación, restaura la ruta al cancelar un cambio de URL y espera los guardados pendientes antes de abandonar. Un error al abandonar conserva el formulario para reintentar; al desmontarse, elimina sus interceptores y cierra y descarta el canal para que las respuestas pendientes no lo reutilicen.

El listado compara los datos recibidos con los mostrados antes de anunciar actualizaciones. Abrir la conexión, recuperar el foco o una desconexión no generan por sí solos avisos de cambios. Los estudiantes se presentan en tarjetas con nombre, iniciales y fecha de nacimiento, adaptadas al tema y al ancho móvil.

Verificación adicional: las cinco etapas permiten cancelar sin abandonar, muestran una sola confirmación y liberan sus manejadores tras salir. Se prueban también cambio directo de ruta, fallo y reintento del abandono, recuperación de foco sin cambios y aviso tras una modificación real. Las tres suites de navegador pasaron con bases aisladas. Se revisaron capturas de estudiantes del servidor real 3107 en escritorio y móvil oscuro.

Para pruebas manuales se abrió únicamente en la base temporal del servidor 3107 el Colegio San Rafael, ciclo 2026–2027, inscripción y documentos del 1 de octubre al 31 de diciembre de 2026, con límite de 20 cupos de 1ro de Primaria. Esa configuración de demostración no está incluida en el repositorio ni modifica el archivo pendiente data/db.json.

La integración final de fase 5 añade validación y snapshot de cédula/contacto del tutor, bloquea envíos por API que omitan documentos exigidos o usen un periodo cerrado y permite solicitar cita desde el expediente. F5.5 y el recorrido integrado están documentados en phase-05-05-appointments.md.
