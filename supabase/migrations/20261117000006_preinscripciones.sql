-- USFX Virtual · preinscripciones desde la landing (captación de postulantes).
-- Una persona sin cuenta deja sus datos en 30 segundos; administración los ve, los exporta,
-- les cambia el estado y les envía avisos push al dispositivo donde se preinscribieron.
-- Nadie sin cuenta puede LEER estos datos: solo se escribe a través de funciones validadas.

create type public.estado_preinscripcion as enum ('nueva', 'contactada', 'postulo', 'descartada');

create table public.preinscripciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  carrera text not null check (carrera in ('derecho','psicologia','gerencia','sistemas','contaduria','filosofia')),
  nombres text not null check (length(nombres) between 2 and 80),
  apellidos text not null check (length(apellidos) between 2 and 80),
  celular text not null check (celular ~ '^\+?[0-9]{7,15}$'),
  correo text check (correo is null or correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  pais text not null default 'Bolivia' check (length(pais) <= 60),
  ciudad text check (length(ciudad) <= 60),
  es_profesional boolean not null default false,
  acepta_contacto boolean not null default true,
  origen jsonb not null default '{}',
  estado public.estado_preinscripcion not null default 'nueva',
  nota text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index preinscripciones_fecha_idx on public.preinscripciones(creado_en desc);
create index preinscripciones_carrera_idx on public.preinscripciones(carrera, estado);
create index preinscripciones_celular_idx on public.preinscripciones(celular, creado_en desc);
alter table public.preinscripciones enable row level security;
create policy preins_leer on public.preinscripciones for select to authenticated
  using ((select app.es_admin()) or app.rol() = 'director');
create policy preins_editar on public.preinscripciones for update to authenticated
  using ((select app.es_admin())) with check ((select app.es_admin()));

-- Suscripciones push de preinscritos (no tienen cuenta todavía).
create table public.preinscripcion_push (
  id uuid primary key default gen_random_uuid(),
  preinscripcion_id uuid not null references public.preinscripciones(id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  creado_en timestamptz not null default now()
);
create index preinscripcion_push_idx on public.preinscripcion_push(preinscripcion_id);
alter table public.preinscripcion_push enable row level security;

-- La cola de push existente aprende dos destinos nuevos.
alter table public.cola_push add column preinscripcion_id uuid references public.preinscripciones(id) on delete cascade;
alter table public.cola_push add column a_preinscritos boolean not null default false;
alter table public.cola_push add column filtro_carrera text;

-- ─── Funciones públicas (las llama la landing sin sesión) ──────────

create function public.preinscribir(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_cel text := regexp_replace(coalesce(p->>'celular', ''), '[\s\-().]', '', 'g');
  v_correo text := nullif(lower(trim(coalesce(p->>'correo', ''))), '');
  v_previa public.preinscripciones;
  v_codigo text;
  v_fila public.preinscripciones;
begin
  -- Freno global contra robots: más de 120 por minuto no es tráfico humano.
  if (select count(*) from preinscripciones where creado_en > now() - interval '1 minute') >= 120 then
    raise exception 'Hay mucha demanda en este momento. Intenta de nuevo en un minuto.';
  end if;
  -- Trampa para robots: el campo oculto "web" debe llegar vacío.
  if coalesce(p->>'web', '') <> '' then
    return jsonb_build_object('codigo', 'PRE-' || upper(substr(md5(random()::text), 1, 6)), 'nombres', trim(p->>'nombres'));
  end if;

  -- Si el mismo celular se preinscribe otra vez a la misma carrera en 24 h, devolvemos la misma ficha.
  select * into v_previa from preinscripciones
   where celular = v_cel and carrera = p->>'carrera' and creado_en > now() - interval '24 hours'
   order by creado_en desc limit 1;
  if found then
    return jsonb_build_object('codigo', v_previa.codigo, 'nombres', v_previa.nombres, 'repetida', true);
  end if;

  loop
    v_codigo := 'PRE27-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from preinscripciones where codigo = v_codigo);
  end loop;

  insert into preinscripciones (codigo, carrera, nombres, apellidos, celular, correo, pais, ciudad, es_profesional, acepta_contacto, origen)
  values (
    v_codigo,
    p->>'carrera',
    initcap(trim(p->>'nombres')),
    initcap(trim(p->>'apellidos')),
    v_cel,
    v_correo,
    coalesce(nullif(trim(p->>'pais'), ''), 'Bolivia'),
    nullif(trim(coalesce(p->>'ciudad', '')), ''),
    coalesce((p->>'es_profesional')::boolean, false),
    coalesce((p->>'acepta_contacto')::boolean, true),
    -- Solo guardamos campos de campaña conocidos y cortos.
    (select coalesce(jsonb_object_agg(k, left(v, 120)), '{}') from jsonb_each_text(coalesce(p->'origen', '{}')) as e(k, v)
      where k in ('utm_source','utm_medium','utm_campaign','utm_content','referrer','como'))
  ) returning * into v_fila;

  return jsonb_build_object('codigo', v_fila.codigo, 'nombres', v_fila.nombres);
exception
  when check_violation then raise exception 'Revisa tus datos: hay un campo con formato no válido.';
  when not_null_violation then raise exception 'Faltan datos obligatorios.';
end $$;

-- Activa avisos en el dispositivo. Requiere el código, que solo conoce quien se preinscribió.
create function public.suscribir_preinscripcion(p_codigo text, p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_id uuid; v_nombre text; v_nueva boolean;
begin
  select id, nombres into v_id, v_nombre from preinscripciones where codigo = upper(trim(p_codigo));
  if v_id is null then raise exception 'Código de preinscripción no válido.'; end if;
  if (select count(*) from preinscripcion_push where preinscripcion_id = v_id) >= 5 then
    raise exception 'Ya activaste los avisos en varios dispositivos.';
  end if;
  v_nueva := not exists (select 1 from preinscripcion_push where endpoint = p_endpoint);
  insert into preinscripcion_push (preinscripcion_id, endpoint, p256dh, auth)
  values (v_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set preinscripcion_id = excluded.preinscripcion_id, p256dh = excluded.p256dh, auth = excluded.auth;
  if v_nueva then
    insert into cola_push (preinscripcion_id, titulo, cuerpo, url)
    values (v_id, '¡Listo, ' || v_nombre || '!', 'Te avisaremos aquí de fechas, requisitos y resultados de la USFX Virtual.', '#admision');
  end if;
end $$;

-- Prueba social honesta: el número real de preinscritos de la gestión.
create function public.conteo_preinscripciones() returns int
language sql stable security definer set search_path = public, pg_temp as $$
  select count(*)::int from preinscripciones where estado <> 'descartada'
$$;

-- ─── Funciones de administración ───────────────────────────────────

-- Envía un aviso push a todos los preinscritos (o a los de una carrera). Devuelve cuántos dispositivos lo recibirán.
create function public.avisar_preinscritos(p_titulo text, p_cuerpo text, p_carrera text default null, p_url text default '#admision') returns int
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare v_n int;
begin
  if not app.es_admin() then raise exception 'No tienes permiso para hacer esto.'; end if;
  if length(coalesce(trim(p_titulo), '')) < 3 then raise exception 'Escribe un título.'; end if;
  select count(*) into v_n from preinscripcion_push s join preinscripciones r on r.id = s.preinscripcion_id
   where r.acepta_contacto and r.estado <> 'descartada' and (p_carrera is null or r.carrera = p_carrera);
  insert into cola_push (a_preinscritos, filtro_carrera, titulo, cuerpo, url)
  values (true, p_carrera, left(trim(p_titulo), 80), left(trim(coalesce(p_cuerpo, '')), 240), coalesce(p_url, '#admision'));
  return v_n;
end $$;

create function app.preins_actualizado() returns trigger language plpgsql as $$
begin new.actualizado_en := now(); return new; end $$;
create trigger al_actualizar_preins before update on public.preinscripciones for each row execute function app.preins_actualizado();

-- Para el trabajador de push (clave de servicio).
create function public.suscripciones_preinscritos(p_lead uuid, p_carrera text, p_desde int, p_n int)
returns table (id uuid, endpoint text, p256dh text, auth text, tabla text)
language sql stable security definer set search_path = public, pg_temp as $$
  select s.id, s.endpoint, s.p256dh, s.auth, 'preinscripcion_push'::text
    from preinscripcion_push s join preinscripciones r on r.id = s.preinscripcion_id
   where (p_lead is not null and r.id = p_lead)
      or (p_lead is null and r.acepta_contacto and r.estado <> 'descartada' and (p_carrera is null or r.carrera = p_carrera))
   order by s.id offset p_desde limit p_n
$$;

-- ─── Permisos ──────────────────────────────────────────────────────
revoke all on public.preinscripciones, public.preinscripcion_push from anon, authenticated;
grant select on public.preinscripciones to authenticated;
grant update (estado, nota) on public.preinscripciones to authenticated;

revoke execute on function public.preinscribir(jsonb), public.suscribir_preinscripcion(text, text, text, text),
  public.conteo_preinscripciones(), public.avisar_preinscritos(text, text, text, text),
  public.suscripciones_preinscritos(uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.preinscribir(jsonb), public.suscribir_preinscripcion(text, text, text, text),
  public.conteo_preinscripciones() to anon, authenticated;
grant execute on function public.avisar_preinscritos(text, text, text, text) to authenticated;
grant execute on function public.suscripciones_preinscritos(uuid, text, int, int) to service_role;
revoke execute on function app.preins_actualizado() from public, anon;
