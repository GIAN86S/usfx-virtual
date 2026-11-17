# Despliegue

Antes de publicar con el nombre y emblema de la USFX, hace falta la autorización escrita de la universidad.
La plataforma recoge carnets, títulos, contraseñas y pagos: debe operarla o avalarla la institución.

## 1. Supabase

1. Crea un proyecto en <https://supabase.com>, en la región más cercana con Pro (mínimo para producción).
2. En **Authentication → Sign In / Providers → Email**, desactiva **Confirm email**.
   Los usuarios entran con usuario y contraseña; internamente usan un correo sintético que no recibe mensajes.
3. En **Project Settings → General**, aumenta el tamaño máximo de archivo a 2 GB para los videos.
4. Vincula y aplica las migraciones:

   ```bash
   npx supabase login
   npx supabase link --project-ref TU_PROYECTO
   npx supabase db push
   ```

5. Publica las funciones y sus secretos:

   ```bash
   npx web-push generate-vapid-keys   # guarda ambas claves
   npx supabase secrets set AUTH_DOMINIO=usuarios.usfx.invalid ORIGEN_APP=https://TU_DOMINIO \
     VAPID_SUJETO=mailto:sistemas@TU_DOMINIO VAPID_PUBLICA=... VAPID_PRIVADA=... PUSH_SECRETO=$(openssl rand -hex 32)
   npx supabase functions deploy admin-usuarios
   npx supabase functions deploy push-despacho
   ```

6. Crea la primera cuenta de Sistemas (la clave de servicio nunca va en el repositorio ni en la página):

   ```bash
   SUPABASE_URL=https://TU_PROYECTO.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \
     npm run admin:crear -- usuario "Nombres" "Apellidos"
   ```

7. Programa el envío de notificaciones. En el editor SQL, activa `pg_cron` y `pg_net` y ejecuta:

   ```sql
   select cron.schedule('push-despacho', '20 seconds', $$
     select net.http_post(
       url := 'https://TU_PROYECTO.supabase.co/functions/v1/push-despacho',
       headers := jsonb_build_object('x-secreto', 'EL_MISMO_PUSH_SECRETO'), timeout_milliseconds := 25000)
   $$);
   -- Crea las particiones de mensajes de los próximos 24 meses, cada mes.
   select cron.schedule('particiones-mensajes', '0 3 1 * *', $$ select app.crear_particiones_mensajes(24) $$);
   ```

## 2. GitHub

En **Settings → Secrets and variables → Actions** del repositorio:

| Tipo | Nombre | Valor |
|---|---|---|
| Variable | `VITE_SUPABASE_URL` | `https://TU_PROYECTO.supabase.co` |
| Variable | `VITE_SUPABASE_ANON_KEY` | Clave pública (anon) |
| Variable | `VITE_VAPID_PUBLICA` | Clave pública de notificaciones |
| Variable | `VITE_AUTH_DOMINIO` | `usuarios.usfx.invalid` |
| Secreto | `SUPABASE_ACCESS_TOKEN` | Token de tu cuenta, para migraciones |
| Secreto | `SUPABASE_DB_PASSWORD` | Contraseña de la base |
| Variable | `SUPABASE_PROJECT_REF` | Referencia del proyecto |

En **Settings → Pages**, elige **GitHub Actions** como origen. GitHub Pages en un repositorio privado requiere un plan de pago.
Cada `push` a `main` publica la web y aplica migraciones nuevas.

Con dominio propio (por ejemplo `virtual.usfx.bo`), pon la variable `VITE_BASE` en `/`.
Sin él, el flujo usa `/nombre-del-repo/` automáticamente.

## 3. Antes de abrir al público

- [ ] Autorización escrita de la USFX y su emblema en alta resolución (el actual es de 225 x 300 px, sacado de usfx.bo).
- [ ] Revisar con su asesoría legal el texto de la declaración jurada y la política de datos personales.
- [ ] Ajustar en **Configuración**: nota mínima, monto de matrícula e instrucciones de pago.
- [ ] Prueba de carga real contra el proyecto de Supabase, con el plan definitivo.
- [ ] Activar copias de seguridad con recuperación a un punto en el tiempo (PITR).
- [ ] Activar CAPTCHA en Auth para evitar registros automáticos de postulantes.
- [ ] Quitar el tope de gasto de Pro si se superan 500 conexiones de tiempo real simultáneas.
- [ ] Probar la preinscripción de la landing con un celular real: llenar el formulario, activar avisos y enviar un aviso de prueba desde **Administración → Preinscritos**.
- [ ] Definir quién contesta a los preinscritos por WhatsApp y en cuánto tiempo (lo ideal: el mismo día). El panel marca como «Contactada» a quien ya recibió mensaje.
- [ ] Usar enlaces con `?utm_source=facebook` (o `tiktok`, `qr`, etc.) en cada campaña: el panel muestra de dónde llegó cada preinscrito.

## 4. Preinscripciones desde la landing

La migración `20261117000006_preinscripciones.sql` crea la captación de postulantes:

- Cualquier visitante, sin cuenta, se preinscribe en 3 pasos y recibe un código `PRE27-XXXXXX`.
- Nadie sin cuenta puede leer las fichas. Solo las ven Administración, Sistemas y Dirección de carrera, en **Preinscritos**.
- Desde ese panel se contacta por WhatsApp en un clic, se cambia el estado, se exporta a Excel y se envían avisos push a todos o por carrera.
- Los avisos usan la misma función `push-despacho` y las mismas claves VAPID. No hay que configurar nada más.
- En iPhone, el aviso push solo funciona si la persona agrega la página a su pantalla de inicio. Por eso el WhatsApp sigue siendo el canal principal.
- Defensas: trampa para robots, freno de 120 preinscripciones por minuto, y una misma persona y carrera en 24 horas devuelve la misma ficha.

## 5. Aula virtual, contrato y pagos con QR

La migración `20261118000008_aula_contrato_pagos.sql` agrega:

- **Tareas** con entregas de archivos, videos o texto; el docente califica y comenta. Bucket privado `entregas`.
- **Foros** por materia y **cuestionarios** con calificación automática (las respuestas correctas nunca llegan al navegador).
- **Asistencia obligatoria:** aviso al estudiante cuando baja de `asistencia_minima` (desde la tercera clase).
- **Contrato del estudiante:** sin contrato firmado de la gestión, o con cuotas vencidas, se suspende el acceso a clases (temario, materiales, tareas, foros, cuestionarios y enlace de clase en vivo).
- **Plan de pagos:** mensual (`cuotas_por_gestion` × `monto_mensualidad`) o anual (`monto_plan_anual`).

Configura en **Configuración** antes de abrir la gestión:

| Clave | Valor inicial | Revisar |
|---|---|---|
| `gestion_actual` | año en curso | Gestión de los contratos |
| `monto_mensualidad` | 550 | |
| `cuotas_por_gestion` | 10 | |
| `monto_plan_anual` | 5500 | Confirmar si el plan anual tiene descuento |
| `primer_vencimiento` | 10 de marzo | Quien firma después vence su primera cuota 7 días tras firmar |
| `texto_contrato` | texto provisional | **Reemplazar por el contrato oficial de la DAF** |
| `asistencia_minima` | 75 | Porcentaje mínimo |

### Cobro por QR verificable (banco)

Flujo: el estudiante toca **Pagar con QR** → la función `qr-banco` reserva una referencia única y pide el QR al banco → el estudiante paga desde la app de su banco → el banco llama a `qr-banco-webhook` → la cuota queda pagada y el estudiante recibe un aviso. Un aviso repetido del banco no paga dos veces.

Mientras no esté configurado, el botón ofrece **Reportar comprobante** (revisión manual de Finanzas).

Cuando el banco entregue su especificación técnica:

1. Ajusta `crearQrEnBanco()` en `supabase/functions/qr-banco/index.ts` (dirección, autenticación y campos).
2. Ajusta los nombres de campos y la cabecera de firma en `supabase/functions/qr-banco-webhook/index.ts`.
3. Carga los secretos:
   ```bash
   npx supabase secrets set BANCO_API_URL=... BANCO_API_KEY=... BANCO_WEBHOOK_SECRETO=... BANCO_CABECERA_FIRMA=...
   npx supabase functions deploy qr-banco
   npx supabase functions deploy qr-banco-webhook
   ```
4. Entrega al banco la dirección del webhook: `https://TU_PROYECTO.supabase.co/functions/v1/qr-banco-webhook`.
