// Vacía la cola de notificaciones push por lotes. Lo llama pg_cron cada 20 segundos (ver docs/DESPLIEGUE.md).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const LOTE_COLA = 50, LOTE_SUBS = 500, PARALELO = 40;

Deno.serve(async (req) => {
  if (req.headers.get('x-secreto') !== Deno.env.get('PUSH_SECRETO')) return new Response('no', { status: 401 });
  const srv = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  webpush.setVapidDetails(Deno.env.get('VAPID_SUJETO')!, Deno.env.get('VAPID_PUBLICA')!, Deno.env.get('VAPID_PRIVADA')!);
  const { data: cola, error } = await srv.rpc('tomar_cola_push', { p_n: LOTE_COLA });
  if (error) return new Response(error.message, { status: 500 });

  let enviados = 0, vencidas = 0;
  for (const item of cola ?? []) {
    const carga = JSON.stringify({ titulo: item.titulo, cuerpo: item.cuerpo, url: item.url, tag: item.conversacion_id ?? undefined });
    let desde = 0;
    for (;;) {
      // Destinos: un usuario, preinscritos de la landing (uno o todos) o los miembros de una conversación.
      const { data: subs } = item.usuario_id
        ? await srv.from('push_suscripciones').select('id, endpoint, p256dh, auth').eq('usuario_id', item.usuario_id).range(desde, desde + LOTE_SUBS - 1)
        : item.preinscripcion_id || item.a_preinscritos
          ? await srv.rpc('suscripciones_preinscritos', { p_lead: item.preinscripcion_id, p_carrera: item.filtro_carrera, p_desde: desde, p_n: LOTE_SUBS })
          : await srv.rpc('suscripciones_conversacion', { p_conv: item.conversacion_id, p_excluir: item.excluir, p_desde: desde, p_n: LOTE_SUBS });
      if (!subs?.length) break;
      for (let i = 0; i < subs.length; i += PARALELO) {
        await Promise.all(subs.slice(i, i + PARALELO).map(async (s: any) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 86400, urgency: 'normal' });
            enviados++;
          } catch (e: any) {
            if (e.statusCode === 404 || e.statusCode === 410) { vencidas++; await srv.from(s.tabla ?? 'push_suscripciones').delete().eq('id', s.id); }
          }
        }));
      }
      if (subs.length < LOTE_SUBS) break;
      desde += LOTE_SUBS;
    }
  }
  await srv.rpc('limpiar_cola_push');
  return Response.json({ procesados: cola?.length ?? 0, enviados, vencidas });
});
