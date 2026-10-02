# Fases 6 y 7: comunicaciones y analíticas del prototipo

## Fuentes y alcance

Historias HU062–HU066/HU133 y HU067–HU095 de `inscolar-contexto/Inscolar_Azure_134_Historias_Legibles.txt`, actualización de HU073 en `Inscolar_Historias_Azure_Pendientes.txt`, bloques F6.1–F7.5 del plan integral. Se conserva el backend Express/JSON y el worktree actual. ROADMAP_REQUISITOS.md no se consulta. No incluye Audit.NET ni integración con un backend externo.

## Fase 6

- `lib/notify.js` genera y consulta avisos; deduplicación por evento + destinatario + tipo. Eventos persistidos de inscripción, revisión documental (incluida aprobación sin cambio de estado de la solicitud), citas y abandono de borrador. Un reintento no repite la transición ni su aviso. Los eventos de cuentas administrativas existentes se dirigen individualmente a los administradores/soportes activos.
- Lectura interna independiente de preferencias de correo. Las lecturas antiguas de avisos broadcast se mantienen por lector; la lectura global heredada no permite atribuir quién la hizo y no se considera prueba de lectura individual.
- Listado paginado con contador sobre toda la colección del destinatario; panel reciente, fecha, estado, motivo, etiquetas Leída/No leída, carga/error/reintento. Contador actualiza al guardar lectura, al consultar, al volver a la ventana y cada 30 segundos. No promete entrega web en tiempo real.
- GET `/notifications/:id/target` comprueba pertenencia y permiso vigente sobre el recurso; construye únicamente rutas internas canónicas. Los borradores abandonados ofrecen un resumen privado de solo lectura. Ningún render genera avisos.
- HU066: GET/PUT `/users/me/notification-prefs`, booleanos estrictos y actualización parcial por tipo. Valores anteriores `notifyByEmail` se usan como valores iniciales sin reescribir datos. Guardar explícito; un fallo conserva la edición para reintentar.
- Tipos: inscripción, revisión documental, citas, recordatorios, mantenimiento, cambios de cuentas administrativas (evento preexistente, visible para equipo administrativo). Recordatorios y mantenimiento tienen contrato/preferencia pero no disparadores ni programación inventados.
- Configuración accesible por rol, menú inmediato y cierre con Escape/foco exterior; manual corregido para formatos por requisito, aviso 10/20 minutos solo para borrador, correcciones, cupos independientes y citas en America/Santo_Domingo. El menú explica que un administrador autorizado cambia el correo desde Usuarios: el repositorio no contiene contrato de cambio autónomo/verificación del nuevo correo. No se añade una modificación de identidad sin definir esa regla.

### Correo y persistencia

La notificación y `emailOutbox` se guardan atómicamente con la operación de negocio. No se envía antes de confirmar el guardado. El trabajador se inicia con el servidor y revisa cada cinco segundos. SMTP usa nodemailer existente y `SMTP_HOST/PORT/USER/PASS` y `SMTP_FROM` opcional. Cada correo incluye estado/acción, motivo pertinente y acceso a Inscolar/soporte; no incluye archivos ni credenciales.

Estados: Queued → Sending → Accepted o Queued/Failed; tres intentos, espera creciente de un minuto por intento. Sin SMTP: PendingConfiguration, nunca «enviado». Cuando se configura SMTP y se reinicia, la cola pendiente vuelve a Queued. Sending encontrado al reiniciar pasa a Uncertain y requiere conciliación; no se reenvía automáticamente un correo cuya aceptación se desconoce. Message-ID estable por trabajo. No se puede garantizar exactamente una entrega entre un proveedor SMTP externo y JSON local.

El resultado se guarda sobre una carga fresca después del await para conservar cambios concurrentes. Fallos y aceptación se registran sin cuerpo ni errores técnicos sin depurar; un fallo de correo no revierte el expediente. Accepted significa aceptación por proveedor, no recepción ni lectura del correo. Los avisos web siguen disponibles aunque el correo esté desactivado. No se reenvían notificaciones históricas durante la migración.

**Decisiones pendientes:** la documentación exige definir correos indispensables pero no los enumera. No se fuerza una categoría de correo; todos los estados de trámite siguen siendo visibles dentro de la aplicación. Deben acordarse obligatoriedad, horario de recordatorios y eventos de mantenimiento antes de activarlos. No se declara entrega real sin proveedor configurado y confirmación.

## Fase 7: contrato de métricas

GET `/analytics/summary` usa un solo snapshot y `lib/analytics-service.js`. Roles HU067: Administrador, Soporte y Auditoría con ámbito global; Tutor/Personal reciben 403, incluso manipulando institución. No amplía acceso a expedientes ni devuelve cuerpos de correo, datos de destinatarios o archivos al auditor. Se conservan roles específicos de las APIs de negocio.

Filtros compartidos desde/hasta (fecha inclusiva en America/Santo_Domingo, UTC−4) e institución. Sin fechas: todo el historial disponible. Con fechas: creación de cada entidad, carga de documentos, creación de solicitudes de recuperación/avisos, aceptación del proveedor para correos enviados. Registros sin fecha se incluyen solo sin filtro temporal. Todos los widgets usan la misma respuesta, filtros y fecha de actualización; error elimina datos anteriores y ofrece reintentar. Actualización manual y cada 30 segundos/retorno a ventana, sin peticiones simultáneas automáticas. La opción institucional usa el mismo identificador para todas las colecciones; usuarios/recuperaciones solo cuentan cuentas directamente vinculadas cuando se elige institución.

| Historias | Fórmula / estados / unidad |
| --- | --- |
| HU068–HU070 | Cuentas registradas de cualquier estado, por rol y año UTC de registro; falta de fecha: Sin fecha |
| HU071 | 100 × recuperaciones completadas / solicitudes registradas. Historial sin tokens desde esta versión; no se sobrescribe cuando se reemplaza token. Sin solicitudes: Sin datos. El historial previo no puede reconstruirse de los tokens actuales |
| HU072 | Usuarios por provincia propia o de institución vinculada; otros en Sin información, sin inventar ubicación de tutores |
| HU074–HU075 | Instituciones registradas, incluidas inactivas, por fecha de registro y provincia |
| HU076–HU077 | Suma de estrellas / número de calificaciones del periodo; promedio ponderado por calificación, global y provincial. Sin calificaciones: Sin datos; unidades 1–5 estrellas |
| HU078 | Reportes en el periodo / todas las instituciones del ámbito, incluidas las que tienen cero reportes. Denominador explícito; no es un promedio por institución calificada |
| HU079 | Reportes de cualquier estado de moderación, por provincia de su institución |
| HU081–HU084 | Solicitudes persistidas (no borradores independientes); Aprobada legacy equivale a Aceptada, Pendiente legacy a Enviada. Pendientes = Enviada + En revisión + Documentos pendientes; rechazadas = Rechazada. Cancelada/Abandonada se distinguen y no cuentan pendientes |
| HU085–HU088 | Todas las cargas identificables asociadas a solicitud o borrador, incluidas versiones anteriores; Aceptado/Aprobado, Rechazado, Pendiente |
| HU089–HU093 | Todas las citas creadas, independientemente de fecha de cita; Aceptada/Confirmada legacy, Rechazada, Pendiente, Cancelada; por institución completa, sin truncar a top 5 |
| HU094 | Trabajos únicos de correo aceptados por proveedor. Fallos, simulados heredados, pendientes e inciertos separados, nunca incluidos como enviados |
| HU095 | Lecturas internas confirmadas por destinatario; para broadcast heredado, una lectura por usuario registrado en readBy. No equivale a lectura de correo |

Los conteos sin resultados muestran 0; promedios/tasas con denominador vacío muestran Sin datos. El promedio de reportes es cero cuando existen instituciones y no hay reportes. Las estadísticas reflejan los datos existentes del JSON, no cifras prefijadas. Una tabla accesible acompaña cada gráfico, sin exigir hover ni color. No se añadió exportación (no requerida). Las fórmulas quedan documentadas como contrato local; debe ratificarlas el equipo al integrar backend.

## Pruebas y pendientes externos

`npm run test:f67`: reglas de destinatarios, deduplicación, lecturas, preferencias, outbox con proveedor controlado (aceptación/fallo), fixtures calculables, permisos, fechas inclusivas, interfaces en Chromium y fallo/reintento. Browser usa copia temporal y SMTP desactivado, preserva los archivos locales pendientes. Pruebas de login/review/F5.4/F5.5 y smoke/matriz F2 complementan las regresiones; resultados finales se entregan con la tarea.

Dependencias: proveedor SMTP/confirmaciones reales; cola/transacciones y bloqueo de trabajador para varios procesos; conciliación de envíos inciertos; acuerdo de obligatoriedad/recordatorios; historial de métricas previo no reconstruible; expiración de borradores aún se materializa en consultas, sin un scheduler permanente. Datos de semilla son demostrativos, identificados como prototipo; fixtures de pruebas solo viven en temporales. No se ha probado un servidor SMTP real ni entrega al buzón.

## Resultados ejecutados en esta entrega

- 29 escenarios F6/F7: 8 de comunicaciones/outbox, 6 de métricas y 15 de API/Chromium (30 entradas de test incluyendo el padre).
- Regresiones: login 25, revisión F5.1–F5.3 20, F5.4 18 y F5.5 23 escenarios; incluye recorrido completo inscripción → revisión documental → corrección → decisión → cita → reprogramación/cancelación.
- Total: 115 escenarios (120 entradas de test contando los padres), sin fallos en la versión final. Smoke 18/18 y matriz F2 22 comprobaciones.
- Chromium: bandeja y preferencias móvil oscuro, dashboard móvil oscuro y escritorio claro, teclado, paginación real, errores/reintento. La regresión de ancho 320 px detectó el botón de configuración demasiado ancho; corregido con icono etiquetado y prueba repetida aprobada.
- Comprobaciones JS/CJS y git diff --check correctas. Los archivos data/db.json y test_puppeteer.js mantienen sus hashes iniciales. No hubo prueba de SMTP real ni entrega al buzón; aceptación/fallo del proveedor se verificaron con transporte controlado.
