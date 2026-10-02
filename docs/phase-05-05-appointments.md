# F5.5 — Citas y cierre funcional de fase 5

Fuentes: HU050–HU055 y HU061 de las historias actualizadas en inscolar-contexto, y F5.5 y decisiones vigentes del plan integral. Se mantiene el worktree existente y la base de F5.4. No se implementa fase 6 ni entrega de correo.

## Contrato y permisos

- El catálogo appointmentSlots contiene franjas explícitas por institución y periodo: id, inicio y fin ISO, capacidad positiva y periodId. No se generan horarios predeterminados ni se aceptan fechas arbitrarias. El personal configura intervalos, duración y lugares desde el calendario; Admin/Soporte conservan solo el permiso existente de configuración de periodos. No reciben gestión global de citas ni identidades de tutores ajenos.
- Tutor: sus citas, su estudiante y solicitud cuando se indica. Personal: citas y solicitudes de su institución; puede agendar para una solicitud de su ámbito. Las historias no exigen que la inscripción esté Aceptada antes de citar: no se añade esa condición. Las citas generales existentes se conservan; cuando se asocia una solicitud, el servicio exige institución, tutor y estudiante coherentes.
- Pendiente ocupa un lugar. Aceptada mantiene el mismo lugar. Rechazada/Cancelada son terminales y dejan de ocuparlo; repetir la acción no vuelve a liberar capacidad. Confirmada se lee como Aceptada para los registros anteriores.
- Reprogramar se permite al titular o personal propio sobre una cita futura Pendiente/Aceptada. Comprueba la nueva franja excluyendo únicamente la propia reserva del límite del periodo; cambia horario y vuelve a Pendiente en un guardado. Un conflicto o fallo no cambia la cita anterior. Aceptar/rechazar: solo personal propio, según la decisión vigente del plan. No se interpreta «administrador autorizado» como acceso global implícito.
- Se respetan capacidad por franja y limiteCitas total del periodo de F4. Cupos y reservas de inscripción permanecen separados y no se modifican. Las fechas pasadas o fuera del rango del periodo no se ofrecen. America/Santo_Domingo (UTC−4) se usa en calendario, selección, resumen y detalle.
- Crear requiere requestId persistido para reintentos. El mismo identificador y contenido devuelve la misma cita sin nuevo evento; cambiar el contenido con la misma clave da conflicto. Las transiciones requieren version y rechazan versiones antiguas. Los botones se deshabilitan durante envío.
- Los cambios confirmados guardan historial, auditoría y aviso web dirigido con institución, fecha, estado, motivo y enlace. SSE publica después de persistir y filtra por ámbito. No se afirma entrega de correo.

## API del prototipo

GET /api/appointments/availability?institucionId=…&mes=YYYY-MM devuelve solo franjas ofrecidas, futuras y libres, sin datos personales. excludeId solo admite una cita autorizada de esa institución al reprogramar. POST /api/institutions/:id/appointment-slots configura fecha (YYYY-MM-DD), desde/hasta (HH:mm en República Dominicana), duracionMinutos, capacidad y periodId; rechaza solapamientos.

GET /api/appointments admite estado, fecha, grupo=proximas|anteriores, page y limit; filtra permisos antes de contar/paginar. GET /api/appointments/:id devuelve detalle, acciones e historial. POST /api/appointments crea Pendiente con slotId. POST /api/appointments/:id/aceptar|rechazar|cancelar|reprogramar usa version; reprogramar usa slotId, rechazo y cancelación del personal requieren motivo. La ruta legacy confirmar no permite cambiar fecha; se usa Reprogramar para ello.

## Pruebas reales

npm run test:f55 ejecuta Chromium y peticiones al servidor Express con DB JSON y cargas aisladas, no respuestas mock de éxito. Los errores HTTP de algunas pruebas de UI se inyectan intencionalmente; el fallo de guardado se inyecta en renameSync y comprueba la base sin cambios. Los escenarios incluyen concurrencia, idempotencia, permiso, capacidad, fallos recuperables, móvil oscuro, teclado, modal obsoleto y recarga.

Recorrido completo ejecutado: crear estudiante en wizard → subir acta → enviar inscripción → iniciar revisión → rechazar acta con motivo → cargar reemplazo y enviar correcciones → aprobar acta → aceptar inscripción con cupo → solicitar cita desde expediente → personal acepta → tutor reprograma (Pendiente) → cancela. La inscripción permanece Aceptada y los cupos de inscripción intactos.

Las capturas de la verificación se guardan fuera del repositorio en /tmp/inscolar-f55-verified. Los pendientes data/db.json y test_puppeteer.js no se sobrescriben ni se incluyen en commits.

## Prueba manual

1. Personal de la institución: Calendario y horarios → Configurar franjas de atención. Seleccionar periodo de citas, una fecha futura dentro de su rango, intervalo, duración y capacidad; Crear horarios. Si falta periodo, configurarlo desde F4.
2. Tutor: expediente → Solicitar cita, o Citas → Nueva cita. Elegir institución, solicitud/estudiante cuando corresponda, mes, fecha y horario. Revisar resumen y confirmar; comprobar Pendiente.
3. Personal: Citas → Ver detalle → Aceptar o Rechazar con motivo. El tutor consulta el motivo o el nuevo estado y el historial.
4. Tutor o personal propio: Reprogramar → otro horario → comparar anterior/nuevo → confirmar. Queda Pendiente. Cancelar con confirmación libera el lugar y conserva el expediente.
5. Dos sesiones sobre el último lugar: solo una obtiene cita; la otra conserva notas y puede Elegir otro horario. Recuperar foco/Actualizar consulta datos reales, sin recarga forzada.

## Garantías pendientes de backend definitivo

El prototipo usa un único proceso Node con operaciones síncronas y rename atómico del archivo JSON. Las pruebas validan esa implementación local, no transacciones distribuidas, múltiples instancias ni durabilidad de bandeja de salida. Producción requiere transacción/constraint sobre franjas y claves de idempotencia, almacenamiento duradero y auditoría/notificaciones con cola o outbox. La conexión SSE y las sesiones se reinician con el servidor; el expediente y las citas persisten, y la autenticación se recupera mediante login. Correo y su entrega quedan fuera de esta fase. No se ha certificado WCAG completo ni realizado validación en Safari/iOS.
