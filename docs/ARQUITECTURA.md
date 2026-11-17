# Arquitectura

## Decisiones principales

| Decisión | Por qué |
|---|---|
| PWA, no apps nativas | Un solo código para Android, iPhone y compu; sin tiendas; actualizaciones inmediatas. |
| Cuatro apps instalables desde un origen | Cada una tiene manifiesto y alcance propios (`/chat/`, `/notas/`…) y comparte el código. |
| La seguridad vive en Postgres (RLS y funciones) | Ocultar un botón no protege. El bloqueo de notas por deuda se aplica aunque alguien llame a la API directo. |
| Vistas y funciones en vez de joins desde el cliente | Consultas predecibles, y separación de datos públicos y personales (CI, celular). |
| Exportes PDF y Excel en el dispositivo | No consumen servidor. Las librerías solo se descargan al usarlas. |
| Archivos en buckets privados con enlaces firmados | Un carnet nunca tiene URL pública. La ruta define el permiso. |

## Por qué no se bloquea con 20.000 usuarios

- **Sin oleadas.** Los refrescos automáticos llevan variación al azar; los datos se guardan 30 s en el cliente y los reintentos esperan cada vez más.
- **Bandeja sin conexión permanente.** Solo la conversación abierta usa tiempo real. Con 20.000 conexiones por chat se agotaría el plan; así, las conexiones equivalen a personas con un chat abierto en ese momento.
- **Si el tiempo real se satura, el chat sigue.** Pasa a sondeo cada 5 a 7 s, sin que el usuario haga nada.
- **Un mensaje no se copia por destinatario.** Cada miembro guarda su último leído. Un comunicado a 20.000 crea membresías una vez, no filas por mensaje.
- **Mensajes en particiones mensuales con paginación por id.** Abrir un chat cuesta lo mismo con mil o con millones de mensajes, y lo antiguo se puede archivar por mes.
- **Push por cola.** Enviar nunca espera a las notificaciones; un trabajador las reparte por lotes con `SKIP LOCKED`.
- **Cupos atómicos.** `update … where inscritos < cupo` evita sobrecupos sin bloqueos largos, aunque todos se inscriban al mismo minuto.
- **Tareas masivas por partes.** La carga de usuarios va en lotes de 25 con pausas y los reportes se traen de a 1.000.
- **Videos largos fuera de la base.** Se suben con carga reanudable (TUS) o se enlazan a un servicio de video.

## Medición (`npm run test:carga`)

20.000 estudiantes, 100.000 inscripciones, 200.000 notas y 300.000 mensajes, con RLS activo.
Motor PGlite: un solo hilo en WebAssembly. No predice tiempos de producción, pero detecta consultas que crecen con el total.

| Operación | Mediana |
|---|---|
| Materias del estudiante | 5 ms |
| Estado financiero | 5 ms |
| Abrir conversación (40 últimos) | 11 ms |
| Enviar mensaje | 6 ms |
| Bandeja del chat | 23 ms |
| Notas del estudiante | 34 ms |
| Inscribirse (con reglas y cupo) | 31 ms |
| Lista de una materia de 80 estudiantes | 16 ms |
| Comunicado a 20.000 estudiantes | 2,4 s |
| Generar 20.000 cargos | 2,4 s |

**Lo que falta medir:** concurrencia real. Esta prueba es de una conexión. Antes de abrir, hay que correr una prueba con k6 contra Supabase y elegir el tamaño de cómputo con esos datos.

## Capacidad y costos

Límites publicados de Supabase Realtime (consultados en noviembre de 2026):

| Plan | Conexiones simultáneas | Mensajes por segundo |
|---|---|---|
| Pro | 500 | 500 |
| Pro sin tope de gasto | 10.000 | 2.500 |
| Team | 10.000 | 2.500 |

Con 20.000 inscritos, el dato clave es cuántos tienen un chat abierto a la vez, no el total. Para empezar: Pro con un cómputo mediano y tope de gasto quitado; ajustar con la prueba de carga. Los costos de cómputo, almacenamiento y salida de datos cambian: consúltalos en la página de precios de Supabase antes de presupuestar.

Almacenamiento: los videos dominan el costo. Recomendado para clases largas: enlace a YouTube no listado, Cloudflare Stream o Bunny Stream, en vez de subirlos a Supabase. La plataforma admite ambos.

## Roles

| Rol | Alcance |
|---|---|
| Sistemas | Todo, incluida configuración y otras cuentas de Sistemas |
| Administración | Usuarios (menos Sistemas), académico, admisión, comunicados a todos |
| Finanzas | Cargos y pagos; comunicados a estudiantes |
| Dirección | Horarios y actas de su carrera; comunicados a su carrera |
| Docente | Solo sus materias: asistencia, notas, contenido, comunicados a sus estudiantes |
| Estudiante | Sus datos; chat con sus docentes, compañeros de materia y administración |
| Postulante | Solo su postulación. Toda cuenta nueva nace con este rol |

## Pagos

Hoy el flujo es manual y real: el estudiante paga por QR o transferencia, sube el comprobante y Finanzas lo aprueba. El pago aprobado desbloquea las notas.
Para cobro automático se necesita un contrato con una pasarela o banco. La tabla `pagos` ya admite el método `pasarela`; faltaría una Edge Function que reciba su aviso y llame a la misma lógica que `revisar_pago`.

## Para ir creciendo

Cada pieza se puede cambiar por separado: la interfaz solo conoce `src/lib/sb.ts`, la base evoluciona con migraciones, y las Edge Functions son independientes.
Siguientes pasos razonables: lectura de solo réplica para reportes, clases en vivo integradas, archivado de mensajes antiguos, firma digital de actas y aplicaciones en tiendas envolviendo esta misma PWA.
