-- Chat oficial. Diseño para 20.000 personas:
-- · un mensaje NO se copia por destinatario: se guarda una vez y cada miembro lleva su "último leído";
-- · los mensajes van en particiones por mes y se paginan por id (sin OFFSET);
-- · los comunicados y la cola de push se resuelven aparte y no frenan a quien escribe.

create table public.conversaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('directa','grupo','materia','carrera','oficial')),
  titulo text,
  oferta_id uuid unique references public.ofertas(id) on delete cascade,
  carrera_id uuid references public.carreras(id) on delete cascade,
  directa_clave text unique,
  solo_gestores boolean not null default false,
  creado_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(),
  ultimo_en timestamptz not null default now(),
  ultimo_resumen text
);
create table public.conversacion_miembros (
  conversacion_id uuid not null references public.conversaciones(id) on delete cascade,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  gestor boolean not null default false,
  ultimo_leido_id bigint not null default 0,
  silenciada boolean not null default false,
  primary key (conversacion_id, usuario_id)
);
create index miembros_usuario_idx on public.conversacion_miembros(usuario_id, conversacion_id);

create table public.mensajes (
  id bigint generated always as identity,
  conversacion_id uuid not null,
  autor_id uuid not null,
  autor_nombre text not null default '',
  tipo text not null default 'texto' check (tipo in ('texto','imagen','video','audio','pdf','archivo','sistema')),
  cuerpo text,
  adjunto jsonb,
  respuesta_a bigint,
  eliminado boolean not null default false,
  creado_en timestamptz not null default now(),
  primary key (id, creado_en)
) partition by range (creado_en);
create index mensajes_conv_idx on public.mensajes (conversacion_id, id desc);

create table public.mensajes_otros partition of public.mensajes default;
create function app.crear_particiones_mensajes(meses int default 24) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare ini date := date_trunc('month', now())::date; d date; nombre text;
begin
  for i in 0..meses - 1 loop
    d := (ini + make_interval(months => i))::date;
    nombre := 'mensajes_' || to_char(d, 'YYYY_MM');
    if to_regclass('public.' || nombre) is null then
      execute format('create table public.%I partition of public.mensajes for values from (%L) to (%L)', nombre, d, (d + interval '1 month')::date);
    end if;
  end loop;
end $$;
select app.crear_particiones_mensajes(24);

create function app.miembro(c uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select exists (select 1 from conversacion_miembros where conversacion_id = c and usuario_id = auth.uid()) $$;
create function app.puede_publicar(c uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from conversacion_miembros m join conversaciones k on k.id = m.conversacion_id
    where m.conversacion_id = c and m.usuario_id = auth.uid() and (m.gestor or not k.solo_gestores))
$$;

alter table public.conversaciones enable row level security;
alter table public.conversacion_miembros enable row level security;
alter table public.mensajes enable row level security;
create policy conv_leer on public.conversaciones for select to authenticated using (app.miembro(id));
create policy miembros_leer on public.conversacion_miembros for select to authenticated using (usuario_id = (select auth.uid()));
create policy miembros_propio on public.conversacion_miembros for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));
create policy mensajes_leer on public.mensajes for select to authenticated using (app.miembro(conversacion_id));
create policy mensajes_enviar on public.mensajes for insert to authenticated
  with check (autor_id = (select auth.uid()) and app.puede_publicar(conversacion_id));

-- Antes de guardar: fija el nombre real del autor (no se puede falsificar).
create function app.mensaje_antes() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  select trim(nombres || ' ' || apellidos) into new.autor_nombre from perfiles where id = new.autor_id;
  new.eliminado := false;
  new.creado_en := now();
  return new;
end $$;
create trigger mensaje_antes before insert on public.mensajes for each row execute function app.mensaje_antes();

create function app.mensaje_despues() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare res text := case new.tipo when 'imagen' then 'Foto' when 'video' then 'Video' when 'audio' then 'Audio' when 'pdf' then 'PDF' when 'archivo' then 'Archivo' else left(coalesce(new.cuerpo,''), 120) end;
begin
  update conversaciones set ultimo_en = new.creado_en, ultimo_resumen = res where id = new.conversacion_id;
  update conversacion_miembros set ultimo_leido_id = new.id where conversacion_id = new.conversacion_id and usuario_id = new.autor_id;
  insert into cola_push (conversacion_id, excluir, titulo, cuerpo, url)
    values (new.conversacion_id, new.autor_id, new.autor_nombre, res, '/chat/' || new.conversacion_id);
  -- Tiempo real por canal privado. Si falla, el mensaje igual queda guardado.
  begin
    perform realtime.send(jsonb_build_object('id', new.id, 'conversacion_id', new.conversacion_id, 'autor_id', new.autor_id,
      'autor_nombre', new.autor_nombre, 'tipo', new.tipo, 'cuerpo', new.cuerpo, 'adjunto', new.adjunto, 'respuesta_a', new.respuesta_a, 'creado_en', new.creado_en),
      'nuevo', 'conv:' || new.conversacion_id, true);
  exception when others then null;
  end;
  return null;
end $$;
create trigger mensaje_despues after insert on public.mensajes for each row execute function app.mensaje_despues();

-- Conversación de cada materia: se crea sola y sus miembros se mantienen solos.
create function app.oferta_conversacion() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare c uuid; t text;
begin
  select m.sigla || ' ' || m.nombre || ' · ' || new.paralelo into t from materias m where m.id = new.materia_id;
  insert into conversaciones (tipo, titulo, oferta_id) values ('materia', t, new.id)
    on conflict (oferta_id) do update set titulo = excluded.titulo returning id into c;
  if new.docente_id is not null then
    insert into conversacion_miembros (conversacion_id, usuario_id, gestor) values (c, new.docente_id, true)
      on conflict (conversacion_id, usuario_id) do update set gestor = true;
  end if;
  return new;
end $$;
create trigger oferta_conversacion after insert or update of docente_id on public.ofertas for each row execute function app.oferta_conversacion();

create function app.inscripcion_chat() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare c uuid;
begin
  select id into c from conversaciones where oferta_id = new.oferta_id;
  if c is null then return new; end if;
  if new.estado = 'inscrito' then
    insert into conversacion_miembros (conversacion_id, usuario_id) values (c, new.estudiante_id) on conflict do nothing;
  else
    delete from conversacion_miembros where conversacion_id = c and usuario_id = new.estudiante_id;
  end if;
  return new;
end $$;
create trigger inscripcion_chat after insert or update of estado on public.inscripciones for each row execute function app.inscripcion_chat();

-- ¿A quién puedo escribirle? Estudiante: sus docentes y compañeros de materia, y administración.
-- Docente: sus estudiantes, otros docentes y administración. Administración: cualquiera.
create function app.puede_contactar(otro uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when otro = auth.uid() then false
    when app.rol() in ('sistemas','admin','finanzas','director') then true
    when (select rol from perfiles where id = otro) in ('sistemas','admin','finanzas','director') then true
    when app.rol() = 'docente' then (select rol from perfiles where id = otro) = 'docente'
      or exists (select 1 from ofertas f join inscripciones i on i.oferta_id = f.id where f.docente_id = auth.uid() and i.estudiante_id = otro and i.estado = 'inscrito')
    when app.rol() = 'estudiante' then
      exists (select 1 from inscripciones i join ofertas f on f.id = i.oferta_id where i.estudiante_id = auth.uid() and i.estado = 'inscrito' and f.docente_id = otro)
      or exists (select 1 from inscripciones a join inscripciones b on a.oferta_id = b.oferta_id
                 where a.estudiante_id = auth.uid() and a.estado = 'inscrito' and b.estudiante_id = otro and b.estado = 'inscrito')
    else false end
$$;

create function public.buscar_personas(q text) returns table (id uuid, nombre text, rol public.rol_usuario, foto_path text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id, trim(p.nombres || ' ' || p.apellidos), p.rol, p.foto_path from perfiles p
  where p.activo and length(trim(q)) >= 2 and p.busqueda like '%' || lower(trim(q)) || '%' and app.puede_contactar(p.id)
  order by p.apellidos, p.nombres limit 20
$$;

create function public.abrir_directa(otro uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); clave text; c uuid;
begin
  if not app.puede_contactar(otro) then raise exception 'No puedes escribir a esta persona' using errcode = '42501'; end if;
  clave := least(me::text, otro::text) || ':' || greatest(me::text, otro::text);
  insert into conversaciones (tipo, directa_clave, creado_por) values ('directa', clave, me)
    on conflict (directa_clave) do update set directa_clave = excluded.directa_clave returning id into c;
  insert into conversacion_miembros (conversacion_id, usuario_id) values (c, me), (c, otro) on conflict do nothing;
  return c;
end $$;

-- Bandeja: filas pequeñas y conteo acotado a 99 para que nunca sea una consulta cara.
create function public.mis_conversaciones(p_limite int default 40, p_antes timestamptz default null)
returns table (id uuid, tipo text, titulo text, ultimo_en timestamptz, ultimo_resumen text, no_leidos int, silenciada boolean, solo_gestores boolean, puede_publicar boolean, otro_id uuid, foto_path text)
language sql stable security definer set search_path = public, pg_temp as $$
  select k.id, k.tipo,
    case when k.tipo = 'directa' then coalesce(trim(o.nombres || ' ' || o.apellidos), 'Conversación') else k.titulo end,
    k.ultimo_en, k.ultimo_resumen,
    (select count(*)::int from (select 1 from mensajes x where x.conversacion_id = k.id and x.id > m.ultimo_leido_id and x.autor_id <> auth.uid() and not x.eliminado limit 99) n),
    m.silenciada, k.solo_gestores, (m.gestor or not k.solo_gestores), o.id, o.foto_path
  from conversacion_miembros m
  join conversaciones k on k.id = m.conversacion_id
  left join lateral (select p.id, p.nombres, p.apellidos, p.foto_path from conversacion_miembros m2 join perfiles p on p.id = m2.usuario_id
                     where k.tipo = 'directa' and m2.conversacion_id = k.id and m2.usuario_id <> auth.uid() limit 1) o on true
  where m.usuario_id = auth.uid() and (p_antes is null or k.ultimo_en < p_antes)
  order by k.ultimo_en desc limit least(p_limite, 100)
$$;

create function public.marcar_leido(p_conv uuid, p_ultimo bigint) returns void
language sql security definer set search_path = public, pg_temp as $$
  update conversacion_miembros set ultimo_leido_id = greatest(ultimo_leido_id, p_ultimo) where conversacion_id = p_conv and usuario_id = auth.uid()
$$;
create function public.eliminar_mensaje(p_id bigint) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update mensajes set eliminado = true, cuerpo = null, adjunto = null
  where id = p_id and (app.es_admin() or (autor_id = auth.uid() and creado_en > now() - interval '1 hour'));
  if not found then raise exception 'No puedes eliminar este mensaje'; end if;
end $$;

-- ─── Comunicados oficiales con filtro de destinatarios ─────────────
-- filtros: { "roles": ["docente","estudiante"], "carreras": [uuid], "ofertas": [uuid] }
-- Dentro de cada grupo se suma; entre carreras y ofertas se suma también.
create function app.audiencia(f jsonb) returns table (usuario_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  with f_roles as (select jsonb_array_elements_text(coalesce(f->'roles','[]')) r),
       f_carreras as (select (jsonb_array_elements_text(coalesce(f->'carreras','[]')))::uuid c),
       f_ofertas as (select (jsonb_array_elements_text(coalesce(f->'ofertas','[]')))::uuid o),
       hay as (select (select count(*) from f_roles) nr, (select count(*) from f_carreras) nc, (select count(*) from f_ofertas) no)
  -- Por rol, sin filtro de carrera ni materia: toda la institución con ese rol.
  select p.id from perfiles p, hay where p.activo and hay.nc = 0 and hay.no = 0 and hay.nr > 0 and p.rol::text in (select r from f_roles)
  union
  -- Estudiantes de carreras elegidas.
  select e.id from estudiantes e join perfiles p on p.id = e.id, hay where hay.nc > 0 and p.activo and e.estado = 'activo'
    and e.carrera_id in (select c from f_carreras) and (hay.nr = 0 or 'estudiante' in (select r from f_roles))
  union
  -- Docentes que dictan en esas carreras.
  select f2.docente_id from ofertas f2 join materias m on m.id = f2.materia_id, hay where hay.nc > 0 and f2.docente_id is not null
    and m.carrera_id in (select c from f_carreras) and (hay.nr = 0 or 'docente' in (select r from f_roles))
  union
  -- Estudiantes y docente de materias elegidas.
  select i.estudiante_id from inscripciones i, hay where hay.no > 0 and i.estado = 'inscrito' and i.oferta_id in (select o from f_ofertas)
    and (hay.nr = 0 or 'estudiante' in (select r from f_roles))
  union
  select f3.docente_id from ofertas f3, hay where hay.no > 0 and f3.docente_id is not null and f3.id in (select o from f_ofertas)
    and (hay.nr = 0 or 'docente' in (select r from f_roles))
$$;

-- Administración: a todos. Director: su carrera. Docente: solo sus materias.
create function app.validar_filtros(f jsonb) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare r public.rol_usuario := app.rol();
begin
  if r in ('sistemas','admin') then return; end if;
  if r = 'finanzas' then
    if jsonb_array_length(coalesce(f->'carreras','[]')) + jsonb_array_length(coalesce(f->'ofertas','[]')) = 0 and exists (select 1 from jsonb_array_elements_text(coalesce(f->'roles','[]')) x where x <> 'estudiante') then
      raise exception 'Finanzas solo puede escribir a estudiantes' using errcode = '42501';
    end if;
    return;
  end if;
  if r = 'director' then
    if jsonb_array_length(coalesce(f->'carreras','[]')) + jsonb_array_length(coalesce(f->'ofertas','[]')) = 0 then raise exception 'Elige tu carrera o una materia' using errcode = '42501'; end if;
    if exists (select 1 from jsonb_array_elements_text(coalesce(f->'carreras','[]')) x where not exists (select 1 from carreras c where c.id = x::uuid and c.director_id = auth.uid()))
       or exists (select 1 from jsonb_array_elements_text(coalesce(f->'ofertas','[]')) x where not app.dirige_oferta(x::uuid)) then
      raise exception 'Solo puedes escribir a tu carrera' using errcode = '42501';
    end if;
    return;
  end if;
  if r = 'docente' then
    if jsonb_array_length(coalesce(f->'ofertas','[]')) = 0 or jsonb_array_length(coalesce(f->'carreras','[]')) > 0 then raise exception 'Elige una de tus materias' using errcode = '42501'; end if;
    if exists (select 1 from jsonb_array_elements_text(f->'ofertas') x where not app.dicta(x::uuid)) then raise exception 'Solo puedes escribir a tus materias' using errcode = '42501'; end if;
    return;
  end if;
  raise exception 'Sin permiso para enviar comunicados' using errcode = '42501';
end $$;

create function public.contar_audiencia(p_filtros jsonb) returns int
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform app.validar_filtros(p_filtros);
  return (select count(*) from app.audiencia(p_filtros));
end $$;

create function public.enviar_comunicado(p_titulo text, p_cuerpo text, p_filtros jsonb, p_adjunto jsonb default null, p_tipo text default 'texto')
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare c uuid;
begin
  perform app.validar_filtros(p_filtros);
  if coalesce(trim(p_titulo),'') = '' then raise exception 'Escribe un título'; end if;
  insert into conversaciones (tipo, titulo, solo_gestores, creado_por) values ('oficial', p_titulo, true, auth.uid()) returning id into c;
  insert into conversacion_miembros (conversacion_id, usuario_id) select c, usuario_id from app.audiencia(p_filtros) on conflict do nothing;
  insert into conversacion_miembros (conversacion_id, usuario_id, gestor) values (c, auth.uid(), true)
    on conflict (conversacion_id, usuario_id) do update set gestor = true;
  insert into mensajes (conversacion_id, autor_id, tipo, cuerpo, adjunto) values (c, auth.uid(), p_tipo, p_cuerpo, p_adjunto);
  insert into auditoria (actor, accion, tabla, fila, datos) values (auth.uid(), 'comunicado', 'conversaciones', c::text, jsonb_build_object('titulo', p_titulo, 'filtros', p_filtros));
  return c;
end $$;

-- Trabajador de push (solo clave de servicio). SKIP LOCKED: varios a la vez sin pisarse.
create function public.tomar_cola_push(p_n int default 50) returns setof public.cola_push
language sql security definer set search_path = public, pg_temp as $$
  update cola_push set tomado_en = now() where id in (
    select id from cola_push where tomado_en is null order by id limit p_n for update skip locked) returning *
$$;
create function public.limpiar_cola_push() returns void language sql security definer set search_path = public, pg_temp as $$
  delete from cola_push where tomado_en < now() - interval '2 days'
$$;

-- ─── Permisos de tablas y funciones ────────────────────────────────
revoke all on all tables in schema public from anon;
grant select on all tables in schema public to authenticated;
revoke select on public.cola_push from authenticated;
-- El enlace de clase solo se entrega por v_ofertas, a quien está inscrito o dicta la materia.
revoke select on public.ofertas from authenticated;
grant select (id, materia_id, periodo_id, paralelo, docente_id, cupo, inscritos, acta_cerrada, acta_cerrada_en) on public.ofertas to authenticated;
grant insert, update, delete on public.facultades, public.carreras, public.materias, public.prerrequisitos, public.periodos,
  public.ofertas, public.horarios, public.estudiantes, public.docentes, public.cv_items, public.evaluaciones, public.temas,
  public.materiales, public.push_suscripciones, public.cargos to authenticated;
grant update on public.sesiones to authenticated;
grant insert on public.pagos, public.mensajes to authenticated;
grant insert, update on public.postulaciones to authenticated;
grant update (leida) on public.notificaciones to authenticated;
grant update (silenciada) on public.conversacion_miembros to authenticated;
grant update (celular, email, foto_path, debe_cambiar_clave) on public.perfiles to authenticated;
grant insert, update, delete on public.configuracion to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.tomar_cola_push(int), public.limpiar_cola_push() from authenticated;
grant execute on function public.tomar_cola_push(int), public.limpiar_cola_push() to service_role;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
