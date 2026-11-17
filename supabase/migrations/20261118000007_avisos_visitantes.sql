-- USFX Virtual · avisos push para visitantes de la landing.
-- Quien entra a la página puede activar notificaciones sin preinscribirse ni crear cuenta.
-- Administración les envía avisos (fechas de inscripción, resultados, comunicados).
-- Nadie sin cuenta puede leer las suscripciones: solo se registran por una función validada.

create table public.visitante_push (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) <= 200),
  auth text not null check (length(auth) <= 100),
  carrera text check (carrera is null or carrera in ('derecho','psicologia','gerencia','sistemas','contaduria','filosofia')),
  creado_en timestamptz not null default now()
);
create index visitante_push_fecha_idx on public.visitante_push(creado_en desc);
alter table public.visitante_push enable row level security;

alter table public.cola_push add column a_visitantes boolean not null default false;
alter table public.cola_push add column visitante_id uuid references public.visitante_push(id) on delete cascade;

-- Registra (o renueva) la suscripción del dispositivo. Devuelve true si es nueva.
create function public.suscribir_visitante(p_endpoint text, p_p256dh text, p_auth text, p_carrera text default null) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_nueva boolean; v_id uuid;
begin
  if (select count(*) from visitante_push where creado_en > now() - interval '1 minute') >= 300 then
    raise exception 'Hay mucha demanda en este momento. Intenta de nuevo en un minuto.';
  end if;
  v_nueva := not exists (select 1 from visitante_push where endpoint = p_endpoint);
  insert into visitante_push (endpoint, p256dh, auth, carrera)
  values (p_endpoint, p_p256dh, p_auth, nullif(p_carrera, ''))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth,
    carrera = coalesce(excluded.carrera, visitante_push.carrera)
  returning id into v_id;
  if v_nueva then  -- bienvenida solo a este dispositivo
    insert into cola_push (visitante_id, titulo, cuerpo, url)
    values (v_id, 'Avisos de la USFX Virtual activados', 'Te contaremos aquí las fechas de inscripción, resultados y novedades.', '#admision');
  end if;
  return v_nueva;
exception
  when check_violation then raise exception 'La suscripción no es válida.';
end $$;

-- Aviso a todos los visitantes que activaron notificaciones (o a los interesados en una carrera).
create function public.avisar_visitantes(p_titulo text, p_cuerpo text, p_carrera text default null, p_url text default '#admision') returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if not app.es_admin() then raise exception 'No tienes permiso para hacer esto.'; end if;
  if length(coalesce(trim(p_titulo), '')) < 3 then raise exception 'Escribe un título.'; end if;
  select count(*) into v_n from visitante_push where p_carrera is null or carrera = p_carrera;
  insert into cola_push (a_visitantes, filtro_carrera, titulo, cuerpo, url)
  values (true, p_carrera, left(trim(p_titulo), 80), left(trim(coalesce(p_cuerpo, '')), 240), coalesce(p_url, '#admision'));
  return v_n;
end $$;

-- Cuántos dispositivos tienen avisos activos (para el panel).
create function public.conteo_avisos() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when app.es_admin() or app.rol() = 'director' then jsonb_build_object(
    'visitantes', (select count(*) from visitante_push),
    'preinscritos', (select count(*) from preinscripcion_push)) end
$$;

-- Para el trabajador de push (clave de servicio).
create function public.suscripciones_visitantes(p_visitante uuid, p_carrera text, p_desde int, p_n int)
returns table (id uuid, endpoint text, p256dh text, auth text, tabla text)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.endpoint, s.p256dh, s.auth, 'visitante_push'::text from visitante_push s
   where (p_visitante is not null and s.id = p_visitante)
      or (p_visitante is null and (p_carrera is null or s.carrera = p_carrera))
   order by s.id offset p_desde limit p_n
$$;

revoke all on public.visitante_push from anon, authenticated;
revoke execute on function public.suscribir_visitante(text, text, text, text), public.avisar_visitantes(text, text, text, text),
  public.conteo_avisos(), public.suscripciones_visitantes(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.suscribir_visitante(text, text, text, text) to anon, authenticated;
grant execute on function public.avisar_visitantes(text, text, text, text), public.conteo_avisos() to authenticated;
grant execute on function public.suscripciones_visitantes(uuid, text, int, int) to service_role;
