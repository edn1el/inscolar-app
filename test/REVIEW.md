# Regresiones hasta F5.3

Ejecutar `npm run test:review` con Chromium instalado para Playwright. En esta máquina:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/inscolar-playwright npm run test:review
```

La prueba copia el servidor y los recursos a una carpeta temporal y usa una base y archivos de carga aislados. Comprueba propiedad del borrador, expiración fija, documentos por nivel, formato/tamaño, reintentos sin duplicados, correcciones e historial, permisos de instituciones, dependencias de periodos, horas de cierre, ocupación de citas, paginación, recuperación del wizard, aviso 10/20 minutos con reloj simulado y ancho móvil de 320 px. Verifica además que los archivos locales pendientes permanezcan intactos.

La suite del login se ejecuta con `npm run test:login`. La matriz F2 y smoke deben usar `DB_PATH` temporal; nunca ejecutar pruebas de escritura sobre `data/db.json` local.

## Límites del prototipo

- La expiración del borrador es definitiva al llegar `expiresAt`; su estado y auditoría se materializan al consultar/actualizar borradores. No hay trabajador permanente de expiración.
- No existe una colección de reservas de cupos de inscripción. No se afirma que haya una liberación de reservas reales; se elimina ese mensaje engañoso del cierre del wizard. El límite de citas existente sigue siendo por periodo, no por franja.
- Los archivos se validan por firma inicial, extensión, MIME declarado, requisito y tamaño. Esto no sustituye análisis antivirus ni validación completa del contenido.
- El editor de fechas muestra y convierte la zona local del navegador. La política de una zona institucional fija requiere definición explícita.
- No se implementan F5.4 ni F5.5. Se conserva la compatibilidad de las acciones anteriores con Enviada/En revisión.
- Pendiente una auditoría completa de contraste y lectores de pantalla; el control de foco se aplica al componente compartido de confirmación.
