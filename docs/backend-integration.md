# Contrato de integración backend (fases 5–8)

El frontend consume `/api` con cookies de sesión y JSON, y reutiliza el cliente `api()` de `public/js/app.js`. Mantener nombres/estados y respuestas actuales para cambiar el transporte sin rehacer pantallas. Las rutas Express son el contrato ejecutable; las pruebas browser usan solicitudes reales. No se sustituye un backend .NET ausente por una promesa de integración completada.

## Auditoría

- `GET /api/logs?q=&accion=&actorId=&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&page=1&limit=20`: `{logs,total,page,limit,pages,acciones,actores,zonaHoraria,auditStatus:{pending,failed}}`. Máximo 100 por página. Aplicar todos los filtros antes del contador/paginación; ordenar UTC descendente y eventId como desempate. Fechas inclusivas America/Santo_Domingo, UTC−04. `actorId=Sistema` busca actor nulo; acciones desconocidas, fechas/rango/paginación inválidos: 400.
- `GET /api/logs/:eventId`: `{event}`; 404 inexistente. Ambos requieren Auditoría o Administrador explícitamente habilitado. Sin sesión 401, sin autorización 403, fallo de almacén/registro de acceso 503. No implementar PATCH/PUT/DELETE públicos.
- `docs/contracts/audit-event.schema.json`: envoltura v1. EventId único/idempotente, correlationId agrupa una operación confirmada. Anterior/nuevo son proyecciones permitidas, no snapshots de objetos completos. Replicar `lib/audit-contract.js` (mapeo HU096–HU128, redacción y whitelist), no serializar automáticamente entidades .NET ni datos del request.
- Con Audit.NET usar factory/scope y proveedor propios para convertir únicamente esa proyección. Referencia primaria: [Audit.NET README](https://github.com/thepirat000/Audit.NET). La bandeja se inserta dentro de la transacción de negocio; el consumidor posterior utiliza el proveedor asíncrono. Un fallo externo no revierte negocio; tres reintentos, alerta, retención y recuperación del fallido. Garantizar eventId único en base de datos y rechazar IDs de contenido contradictorio.
- Guardar consultas exitosas en una colección protegida aparte: UTC, actor, operación, filtros estructurados y eventId consultado. No copiar texto libre ni tokens. Asegurar que no se entregan resultados cuando esa trazabilidad no puede guardarse. Decidir también auditoría de accesos denegados fuera del visor.

## Solicitudes, documentación y citas

Conservar las rutas y payloads de `routes/enrollments.js`, `routes/documents.js`, `routes/appointments.js` y `routes/periods.js`; controles de recurso de `lib/enrollment-service.js`/`lib/appointment-service.js` deben ejecutarse en servidor, no depender del rol visible en UI. Tutor: sus estudiantes/solicitudes/documentos/citas; personal: su institución. Decisiones/versiones y reserva/liberación de cupos deben formar una transacción. Reintentos llevan identidad de operación; conflicto/versión antigua/capacidad agotada 409, requisitos faltantes 422, entrada inválida 400. No liberar reservas dos veces ni abandonar solicitudes enviadas mediante temporizador de borradores.

Archivo: usar almacenamiento privado con descarga autorizada, validación real de firma/tamaño/tipo y configuración institucional por nivel. Nunca incluir binarios o Base64 en auditoría. Idempotencia de uploads/reemplazos, versión de expediente y evento/aviso deben confirmarse juntos. El backend real debe proporcionar expiración durable de borradores aunque nadie consulte la aplicación.

## Comunicaciones y métricas

Contratos de fases 6/7: `docs/phase-06-07-communications-analytics.md` si existe; consultar también `routes/misc.js`, `lib/notify.js`, `lib/communication-prefs.js`, `lib/analytics.js`. Preferencias por tipo no eliminan avisos web; destinatario estable y deduplicación evento+destinatario+tipo. SMTP: cola durable, claves del servidor, aceptación distinta de entrega; callbacks verificados para HU126 entrega. Métricas filtran por institución/ciclo/fecha antes de calcular contadores; no ocultar error como cero.

## Antes de producción

1. Reemplazar JSON por repositorios transaccionales y `express-session` por sesión compartida segura/configurada (secreto estable, cookie segura, expiración/invalidez, CSRF donde corresponda). Deshabilitar claves/códigos/tokens de demostración que endpoints devuelven en el prototipo; conectar recuperación/MFA reales.
2. Mapear roles y habilitación de auditoría desde autorización confiable; índices/constraints eventId, claves de idempotencia y reservas, control de versiones y consumidores multiinstancia con lease/claim.
3. Migrar historias heredadas con proyección segura, proteger almacén y accesos, monitorizar colas/fallos; aprobar retención de 24 meses antes de programar archivo/eliminación. La escritura append-only por UI del prototipo no equivale a almacenamiento WORM.
4. Ejecutar login/recuperación, recorrido inscripción→documentos→decisión→cita, comunicaciones/métricas y auditoría contra el backend real. Validar caída/reinicio del worker, concurrencia, permisos, proveedor SMTP y recuperación sin perder operaciones. No se verificó ese backend externo en esta fase.
