# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Inscolar sirve a los dos lados del proceso de inscripción escolar en la República Dominicana, más quienes operan la plataforma. Ningún rol se sacrifica por otro: la meta declarada es que cada uno tenga una experiencia excelente.

- **Tutor (padre, madre o encargado):** busca y compara escuelas, registra a sus estudiantes, solicita cupo, sube documentos, agenda citas, califica o reporta instituciones y sigue el estado de cada solicitud. Llega con frecuencia desde el móvil.
- **Personal de institución:** revisa las solicitudes y documentos de *su* institución, acepta o rechaza con motivo, confirma o reprograma citas y configura los periodos del ciclo escolar (inscripción, documentos, citas y documentos requeridos).
- **Administrador / Soporte:** gestionan usuarios, instituciones, periodos y analíticas en todo el sistema. Soporte no puede crear Administradores (hallazgo FUN-02).
- **Auditoría:** acceso de consulta a registros; ve "Mi cuenta" en el prototipo.

## Product Purpose

Centralizar la inscripción escolar dominicana en una sola plataforma: descubrir instituciones, solicitar cupo, entregar la documentación y reservar citas sin filas ni papeles, con estados claros para todas las partes.

Éxito tiene dos horizontes, ambos vigentes:
1. **Ahora:** proyecto del curso IDS323L (INTEC, Equipo 02). Cumplir, con pruebas, las 134 historias de usuario activas del backlog de Azure DevOps y sostener una demo en vivo convincente.
2. **Después:** llevarlo a tutores e instituciones reales, lo que exige el backend definitivo (base de datos real, sesiones persistentes, correo real, Audit.NET).

## Positioning

Tres pilares, confirmados por el equipo como igual de importantes:

- **Un hub nacional:** un tutor, una cuenta, todas las escuelas. Búsqueda y filtros por provincia, municipio, calificación, nombre y ubicación del dispositivo, en lugar de un portal distinto por colegio.
- **Trámite digital:** documentos subidos y validados en línea, citas reservadas por franjas con cupo y periodos definidos por cada institución, en lugar de papeleo presencial.
- **Transparencia:** calificaciones públicas, reportes/quejas, estados explícitos de cada solicitud y notificaciones en cada cambio, con auditoría de las acciones.

## Operating Context

- Flujo de solicitud: Borrador → Enviada → En revisión → Aceptada / Rechazada; un rechazo documental pasa a Documentos pendientes y la recarga vuelve a En revisión. Aceptada, Rechazada y Abandonada son terminales. Enviar no equivale a aprobar.
- Borrador inactivo: aviso accesible «¿Sigues aquí?» a los 10 minutos; a los 20 el servidor abandona el borrador y libera cupos retenidos.
- Citas: se reservan como Pendientes y ocupan cupo; solo personal autorizado acepta o rechaza; reprogramar cambia de franja de forma atómica y vuelve a Pendiente.
- Comprobantes imprimibles con membrete de Inscolar para inscripciones y citas.
- Trabajo por fases con trazabilidad por ID de Azure (`inscolar-contexto/`, `docs/`, `ROADMAP_REQUISITOS.md`); cada historia se cierra solo con prueba.
- Demo desplegable en Render (plan gratis: los datos vuelven al seed al dormir el servicio).

## Capabilities and Constraints

- Stack existente: Node.js 18 + Express, `express-session`, `bcryptjs`, `multer`, `nodemailer`; SPA en HTML/CSS/JS plano sin build (`public/js/app.js`, `public/css/app.css`); datos en `data/db.json`.
- Idioma de la interfaz: español (República Dominicana). Datos geográficos dominicanos reales (provincias y municipios, mapa Leaflet en Analíticas).
- Control de acceso por rol aplicado en el servidor, no solo en el menú.
- Archivos de inscripción: PDF, JPG, JPEG o PNG; cada requisito define formatos y un máximo de 1 a 10 MB, validados en servidor.
- Una calificación por tutor e institución, editable con evento de auditoría; quejas visibles en versión pública solo tras revisión y depuración de datos personales.
- Sin SMTP configurado, el correo funciona en "Modo de prueba" mostrando códigos en pantalla.
- **Abierto:** backend definitivo (BD, store de sesiones, Audit.NET), política de retención de auditoría (propuesta: 24 meses), despliegue con persistencia.

## Brand Commitments

- Nombre: **Inscolar**. Kit de logo oficial en SVG/PNG en `public/assets/brand/` (horizontal y símbolo, versiones primaria y blanca, favicons, manifest).
- El equipo considera parte de la identidad existente el sello 3D, las tarjetas con tilt y el membrete de Inscolar en comprobantes (README).
- Voz: español cercano y claro, dirigido a familias y personal escolar dominicano.

## Evidence on Hand

- Backlog real: `inscolar-contexto/data.csv` y las historias pendientes; plan integral y hallazgos VIS-01, FUN-01 a FUN-06.
- Fotos de ejemplo de tres instituciones en `data/seed-assets/instituciones/`.
- Datos de demo en `data/db.json` (24 instituciones, usuarios de prueba por rol). Son datos ficticios.
- **No hay** testimonios, cifras de uso, escuelas aliadas ni prensa reales. No inventarlos.

## Product Principles

1. **Cada rol sale bien parado.** Una mejora para tutores no puede empeorar el trabajo diario del personal ni la operación de Admin/Soporte, y al revés.
2. **El estado siempre es visible.** Toda solicitud, documento y cita dice dónde está, qué falta y quién decide.
3. **Menos trámite, no trámite digitalizado.** Pedir solo lo necesario, validar temprano y explicar los rechazos con un motivo.
4. **Confianza ganada con hechos.** Transparencia con calificaciones, reportes y auditoría, protegiendo los datos personales.
5. **Demostrable con pruebas.** Una pantalla no prueba que una historia se cumple; cada cambio se rastrea hasta su ID de Azure.

## Accessibility & Inclusion

- Modo de alto contraste persistente y tema claro/oscuro/sistema ya existen y deben mantenerse.
- Respetar `prefers-reduced-motion` (ya implementado).
- Avisos accesibles, como el de inactividad del borrador.
- Uso frecuente en móvil por parte de tutores; el mapa y los tooltips deben funcionar con toque.
