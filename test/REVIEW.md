# Regresiones hasta F5.3

Ejecutar `npm run test:review` con Chromium instalado para Playwright. En esta máquina:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/inscolar-playwright npm run test:review
```

La prueba copia el servidor y los recursos a una carpeta temporal y usa una base y archivos de carga aislados. Comprueba propiedad del borrador, expiración fija, documentos por nivel, formato/tamaño, reintentos sin duplicados, correcciones e historial, permisos de instituciones, dependencias de periodos, horas de cierre, ocupación de citas, paginación, recuperación del wizard, aviso 10/20 minutos con reloj simulado y ancho móvil de 320 px. Verifica además que los archivos locales pendientes permanezcan intactos.

La suite del login se ejecuta con `npm run test:login`. La matriz F2 y smoke deben usar `DB_PATH` temporal; nunca ejecutar pruebas de escritura sobre `data/db.json` local.

## Límites del prototipo

- La expiración del borrador es definitiva al llegar `expiresAt`; su estado y auditoría se materializan al consultar/actualizar borradores. No hay trabajador permanente de expiración.
- F5.4 incorpora contratos separados de cupos y reservas de inscripción; no crea reservas ficticias. F5.5 incorpora franjas explícitas de citas y respeta además el límite total del periodo. Consultar docs/phase-05-04-enrollments.md y docs/phase-05-05-appointments.md.
- Los archivos se validan por firma inicial, extensión, MIME declarado, requisito y tamaño. Esto no sustituye análisis antivirus ni validación completa del contenido.
- Las citas de F5.5 usan America/Santo_Domingo (UTC−4) en servicio, calendario y resumen. El editor general de periodos anterior conserva su conversión local.
- Las suites test:f54 y test:f55 verifican esas fases con backend JSON aislado. La suite de review sigue verificando regresiones de F5.1–F5.3, incluidos contactos obligatorios, documentos y bloqueo de periodos cerrados.
- Pendiente una auditoría completa de contraste y lectores de pantalla; el control de foco se aplica al componente compartido de confirmación.

## Fases 6 y 7

`npm run test:f67` comprueba comunicaciones, outbox, métricas y pantallas con fixtures aislados. Requiere Chromium como las suites existentes. Correo: el proveedor de prueba es controlado; no implica envío SMTP real. Contratos y límites en `docs/phase-06-07-communications-analytics.md`.
