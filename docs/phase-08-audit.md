# Fase 8: auditoría de Inscolar

## Implementado

Historias de referencia: `inscolar-contexto/Inscolar_Azure_134_Historias_Legibles.txt` (HU096–HU113) y `inscolar-contexto/Inscolar_Historias_Azure_Pendientes.txt` (HU114–HU132). No se utilizó ROADMAP_REQUISITOS.md.

El catálogo `lib/audit-contract.js::ACTION_HU` relaciona los eventos con HU096–HU128. Las operaciones efectivas de usuarios, instituciones, calificaciones, reportes, borradores, documentos, solicitudes, citas y periodos generan eventos con identificador, correlación, UTC, actor, entidad, resultado y valores anteriores/nuevos cuando corresponden. Los eventos automáticos distinguen Sistema. HU129–HU132: listado paginado, filtros combinados por fecha inclusiva UTC−04, acción, actor estable/Sistema y texto, detalle, estados vacío/error/reintento.

Correcciones: reportes/moderación registraban después del guardado; faltaban calificaciones, carga documental de borradores y cambios/recuperación de contraseña. Una edición de usuario con correo inválido acumulaba errores pero guardaba igualmente: ahora devuelve 400 sin modificar ni registrar éxito. Cambios de límite de citas y requisitos generan eventos específicos.

### Persistencia y privacidad

`lib/db.js::save` confirma negocio + `auditOutbox` en un único reemplazo atómico del JSON. `db.logs` conserva la historia lógica compatible con pruebas existentes, pero el visor consulta exclusivamente el almacén separado. El worker de `lib/audit-store.js` consume solo eventos comprometidos y escribe `${DB_PATH}.audit.json` o `AUDIT_PATH`, con permisos 0600. Reintenta tres veces, retiene fallos y emite `AUDIT_STORE_UNAVAILABLE`. Un reinicio recupera la cola; persistir antes de confirmar la cola no duplica el evento. Un ID repetido con contenido contradictorio se rechaza. Esta implementación es para un único proceso.

Operador: tras corregir el almacenamiento, ejecutar con las mismas variables `DB_PATH`/`AUDIT_PATH`: `node -e "require('./lib/audit-store').retryFailed();require('./lib/audit-store').flush()"`. La UI no modifica ni elimina eventos. No hay eliminación automática. Retención consultable de 24 meses es una propuesta pendiente de aprobación institucional, no una garantía legal.

Proyecciones permitidas excluyen hashes, contraseñas, tokens, cédulas completas, contactos y archivos/Base64. Los textos redactan patrones sensibles; los detalles heredados se sustituyen por un aviso y no publican el original. Los nombres de actores son necesarios para identificar acciones. Los motivos son texto seguro y requieren la política institucional de minimización. El JSON Schema describe la envoltura; `snapshot`/`safe` son la política de campos, que el backend debe reproducir (el esquema solo no impide datos sensibles).

Solo Auditoría o Administrador expresamente habilitado (`auditEnabled: true` o whitelist operacional `AUDIT_ADMIN_IDS`) consultan. No existe endpoint para autohabilitarse. La cuenta administradora de los datos semilla está habilitada explícitamente; otros administradores no heredan acceso. Toda lectura exitosa de lista/detalle registra acceso separado; si esto falla responde 503, no datos sin trazabilidad. El historial de accesos no se entrega al navegador. No se guardan búsquedas libres ni errores originales en dicho historial. El archivo separado no proporciona inmutabilidad frente a un operador con acceso al sistema: producción necesita permisos de base de datos y trazabilidad de almacenamiento.

Correo distingue intento, aceptación SMTP y fallo. Aceptación no significa entrega. No se inventan confirmaciones de entrega sin callback verificable del proveedor. Lectura web importante es independiente de SMTP.

## Verificación

`npm run test:f8`: pruebas unitarias de atomicidad, snapshots, privacidad, deduplicación, reintentos/fallo/recuperación, permisos y vínculo documental; pruebas HTTP + Chromium móvil/oscuro/teclado de listado, filtros, detalle, permisos, escrituras reales, validación, error y reintento. Resultado: 8 pruebas unitarias y 7 escenarios HTTP/Chromium aprobados (16 entradas del runner incluyendo el grupo). Regresiones: 99 entradas aprobadas de login, F5.4/F5.5 y F6/F7; después de completar los vínculos documentales se repitieron F8 + F5.4/F5.5, 59 entradas aprobadas. La última comprobación del permiso efectivo pasó los 7 escenarios browser. Ningún fallo ni prueba omitida. Todos usan copias temporales y comprueban que los pendientes originales siguen intactos.

Para repetir: `PLAYWRIGHT_BROWSERS_PATH=/tmp/inscolar-playwright npm run test:f8` (ajustar al Chromium instalado). Regresiones relevantes: `node --test test/login.browser.cjs test/enrollments.browser.cjs test/appointments.browser.cjs test/communications.test.cjs test/analytics.test.cjs test/phases67.browser.cjs`.

## Integración real pendiente

Este repositorio es Express/JSON. No contiene un backend .NET: no se instaló ni se ejecutó Audit.NET. El contrato está en `docs/contracts/audit-event.schema.json`; la guía en `docs/backend-integration.md`. Implementar el adaptador Audit.NET, transacción real negocio/outbox, consumidores con exclusión multiinstancia, almacenamiento protegido, alertas operacionales y política de retención aprobada. La aceptación final necesita ejecutar estas mismas condiciones sobre el backend real.
