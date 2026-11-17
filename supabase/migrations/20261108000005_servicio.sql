-- Funciones solo para la clave de servicio (Edge Functions).
create function public.nuevo_codigo_estudiante() returns text language sql volatile security definer set search_path = public, pg_temp as
  $$ select app.nuevo_codigo() $$;
create function public.suscripciones_conversacion(p_conv uuid, p_excluir uuid, p_desde int, p_n int)
returns table (id uuid, endpoint text, p256dh text, auth text) language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.endpoint, s.p256dh, s.auth from conversacion_miembros m join push_suscripciones s on s.usuario_id = m.usuario_id
  where m.conversacion_id = p_conv and not m.silenciada and m.usuario_id is distinct from p_excluir
  order by s.id offset p_desde limit p_n
$$;
revoke execute on function public.nuevo_codigo_estudiante(), public.suscripciones_conversacion(uuid, uuid, int, int) from public, anon, authenticated;
grant execute on function public.nuevo_codigo_estudiante(), public.suscripciones_conversacion(uuid, uuid, int, int) to service_role;
