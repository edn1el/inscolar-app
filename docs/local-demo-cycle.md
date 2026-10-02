# Ciclo de prueba local — 2 de octubre de 2026

Configurado mediante la API del servidor de este worktree en http://localhost:3107, con DB_PATH=/tmp/inscolar-login-preview.cOIyzO/db.json. No se modificó ni se reinició data/db.json. Estos datos operativos no son admisiones reales de la institución y no se incluyen en el commit.

- Institución: Colegio Calasanz (i001).
- Ciclo: 2026-2027, periodo per001.
- Inscripción y documentos: 1 de octubre al 30 de noviembre de 2026, 23:59, UTC-04:00.
- Cupos configurados: 30 por grado en los 13 grados del prototipo. Las reservas y solicitudes existentes siguen contando.
- Documentos: Acta de nacimiento y Cédula o identificación del tutor, para todos los niveles; PDF/JPG/JPEG/PNG, hasta 5 MB cada uno.
- Franjas añadidas para citas: 3 de octubre de 2026, 09:00–12:00 UTC-04:00, cada 30 minutos y capacidad de tres personas. Límite del periodo: 100 citas. Las franjas anteriores se conservan.

## Recorrido manual

1. Iniciar sesión como tutor Ana Beltré Peña y abrir http://localhost:3107/#/app/inscripciones/nueva?inst=i001.
2. Seleccionar o registrar un estudiante. Introducir la cédula: los guiones aparecen automáticamente y se guardan únicamente los 11 dígitos.
3. Elegir ciclo 2026-2027 y un grado, por ejemplo 1ro de Primaria.
4. Cargar los dos documentos y enviar. Durante la carga, Continuar queda deshabilitado.
5. Como personal José Manuel Cepeda (u003, vinculado a i001), revisar los documentos y la solicitud; probar corrección documental y aceptación.
6. Como tutor, consultar estado y solicitar una cita disponible; como personal, aceptar/rechazar/reprogramar según corresponda.

La configuración permanece al reiniciar el servidor si se utiliza el mismo DB_PATH. No se traslada automáticamente a otra base ni al backend. Para replicarla en otra base de prueba, configurar el ciclo, documentos, cupos y franjas desde las pantallas de institución. Los horarios del 3 de octubre dejan de estar disponibles cuando hayan pasado; añadir nuevas franjas desde el calendario.
