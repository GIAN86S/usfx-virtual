-- USFX Virtual · aula virtual completa, contrato del estudiante, plan de pagos con QR y asistencia obligatoria.
--  1. Acceso a clases: se suspende sin contrato firmado o con cuotas vencidas (comunicado DAF, 20-oct-2026).
--  2. Contrato y plan de pagos: mensual (10 cuotas) o anual (pago único).
--  3. Cobros por QR verificable: el banco confirma el pago y la cuota queda pagada sola.
--  4. Tareas con entregas de archivos, videos o texto; el docente califica y comenta.
--  5. Foros de discusión por materia.
--  6. Cuestionarios con calificación automática; las respuestas correctas nunca salen al navegador.
--  7. Asistencia obligatoria: alerta al estudiante cuando baja del mínimo.
-- Las calificaciones de tareas y cuestionarios quedan en su propia tabla: la planilla de notas se diseñará aparte.

-- ─── Configuración ─────────────────────────────────────────────────
insert into public.configuracion values
  ('gestion_actual', to_jsonb(extract(year from current_date)::int), 'Gestión académica vigente para contratos y cuotas'),
  ('exigir_contrato', 'true', 'Suspender el acceso a clases a quien no firmó su contrato de la gestión'),
  ('suspender_acceso_por_deuda', 'true', 'Suspender el acceso a clases a quien tenga cuotas vencidas'),
  ('monto_mensualidad', '550', 'Monto de cada cuota mensual en bolivianos'),
  ('cuotas_por_gestion', '10', 'Número de cuotas del plan mensual'),
  ('monto_plan_anual', '5500', 'Monto del plan anual en un solo pago (revisar si tiene descuento)'),
  ('primer_vencimiento', to_jsonb(to_char(make_date(extract(year from current_date)::int, 3, 10), 'YYYY-MM-DD')), 'Vencimiento de la primera cuota; las siguientes vencen el mismo día de cada mes'),
  ('texto_contrato', to_jsonb('Contrato de prestación de servicios educativos de la USFX Virtual. El texto oficial lo define la Dirección Administrativa Financiera de la Universidad San Francisco Xavier de Chuquisaca. Al firmar, el estudiante acepta el plan de pagos elegido, la normativa académica vigente y que el acceso a clases y a la plataforma se suspende mientras tenga cuotas vencidas.'::text), 'Texto del contrato que firma el estudiante (reemplazar por el oficial)')
on conflict (clave) do nothing;

create function app.cfg_num(c text, defecto numeric) returns numeric language sql stable security definer set search_path = public, pg_temp as
  $$ select coalesce((select (valor #>> '{}')::numeric from configuracion where clave = c), defecto) $$;
create function app.cfg_bool(c text, defecto boolean) returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select coalesce((select (valor #>> '{}')::boolean from configuracion where clave = c), defecto) $$;
create function app.cfg_txt(c text, defecto text) returns text language sql stable security definer set search_path = public, pg_temp as
  $$ select coalesce((select valor #>> '{}' from configuracion where clave = c), defecto) $$;
create function app.gestion() returns int language sql stable security definer set search_path = public, pg_temp as
  $$ select app.cfg_num('gestion_actual', extract(year from current_date))::int $$;
create function app.parte_uuid(ruta text, n int) returns uuid language plpgsql immutable as $$
begin
  return split_part(ruta, '/', n)::uuid;
exception when others then return null;
end $$;

-- ─── 1. Contrato y acceso a clases ─────────────────────────────────
create table public.contratos (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  gestion int not null,
  plan text not null check (plan in ('mensual','anual')),
  nombre_firma text not null check (length(trim(nombre_firma)) between 5 and 120),
  ci_firma text not null check (length(trim(ci_firma)) between 4 and 20),
  texto text not null,
  agente text,
  firmado_en timestamptz not null default now(),
  unique (estudiante_id, gestion)
);
alter table public.contratos enable row level security;
create policy contratos_leer on public.contratos for select to authenticated
  using (estudiante_id = (select auth.uid()) or (select app.es_finanzas()));

create function app.sin_deuda_vencida(u uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select not exists (select 1 from cargos where estudiante_id = u and estado in ('pendiente','en_revision') and vence < current_date) $$;

-- ¿Puede este estudiante entrar a sus clases? (activo, contrato firmado y sin cuotas vencidas)
create function app.acceso_clases(u uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from estudiantes e where e.id = u and e.estado = 'activo')
     and (not app.cfg_bool('exigir_contrato', true) or exists (select 1 from contratos c where c.estudiante_id = u and c.gestion = app.gestion()))
     and (not app.cfg_bool('suspender_acceso_por_deuda', true) or app.sin_deuda_vencida(u))
$$;
-- Aula: quien gestiona la materia, o el estudiante inscrito con acceso habilitado.
create function app.en_aula(o uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select app.gestiona_oferta(o) or (app.inscrito(o) and app.acceso_clases()) $$;

create function public.mi_acceso() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'es_estudiante', exists (select 1 from estudiantes where id = auth.uid()),
    'habilitado', app.acceso_clases(),
    'gestion', app.gestion(),
    'contrato', (select jsonb_build_object('plan', plan, 'firmado_en', firmado_en) from contratos where estudiante_id = auth.uid() and gestion = app.gestion()),
    'exigir_contrato', app.cfg_bool('exigir_contrato', true),
    'deuda_vencida', coalesce((select sum(monto) from cargos where estudiante_id = auth.uid() and estado in ('pendiente','en_revision') and vence < current_date), 0),
    'texto_contrato', app.cfg_txt('texto_contrato', ''),
    'monto_mensualidad', app.cfg_num('monto_mensualidad', 550),
    'cuotas', app.cfg_num('cuotas_por_gestion', 10),
    'monto_anual', app.cfg_num('monto_plan_anual', 5500),
    'primer_vencimiento', app.cfg_txt('primer_vencimiento', null))
$$;

-- Genera las cuotas del plan elegido. Idempotente gracias a la clave de cada cargo.
create function app.generar_plan(u uuid, p_plan text) returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare
  g int := app.gestion();
  n int := app.cfg_num('cuotas_por_gestion', 10)::int;
  -- Quien firma tarde no nace con deuda: su primera cuota vence 7 días después de firmar.
  base date := greatest(coalesce(app.cfg_txt('primer_vencimiento', null)::date, make_date(g, 3, 10)), current_date + 7);
  k int;
begin
  if p_plan = 'anual' then
    insert into cargos (estudiante_id, clave, concepto, descripcion, monto, vence)
    values (u, 'ANUAL-' || g, 'mensualidad', 'Plan anual · pago único gestión ' || g, app.cfg_num('monto_plan_anual', 5500), base)
    on conflict (estudiante_id, clave) do update set estado = 'pendiente' where cargos.estado = 'anulado';
    return 1;
  end if;
  for i in 1..n loop
    insert into cargos (estudiante_id, clave, concepto, descripcion, monto, vence)
    values (u, 'CUOTA-' || g || '-' || lpad(i::text, 2, '0'), 'mensualidad', 'Cuota ' || i || ' de ' || n || ' · gestión ' || g,
            app.cfg_num('monto_mensualidad', 550), (base + make_interval(months => i - 1))::date)
    on conflict (estudiante_id, clave) do update set estado = 'pendiente' where cargos.estado = 'anulado';
  end loop;
  get diagnostics k = row_count;
  return n;
end $$;

create function public.firmar_contrato(p_plan text, p_nombre text, p_ci text, p_agente text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g int := app.gestion();
begin
  if not exists (select 1 from estudiantes where id = auth.uid()) then raise exception 'Solo un estudiante puede firmar su contrato' using errcode = '42501'; end if;
  if p_plan not in ('mensual','anual') then raise exception 'Elige el plan mensual o el anual'; end if;
  if exists (select 1 from contratos where estudiante_id = auth.uid() and gestion = g) then raise exception 'Ya firmaste tu contrato de esta gestión'; end if;
  if (select regexp_replace(ci, '\D', '', 'g') from perfiles where id = auth.uid()) is distinct from regexp_replace(coalesce(p_ci,''), '\D', '', 'g')
     and (select ci from perfiles where id = auth.uid()) is not null then
    raise exception 'El carnet no coincide con el registrado en tu cuenta';
  end if;
  insert into contratos (estudiante_id, gestion, plan, nombre_firma, ci_firma, texto, agente)
  values (auth.uid(), g, p_plan, trim(p_nombre), trim(p_ci), app.cfg_txt('texto_contrato', ''), left(p_agente, 180));
  perform app.generar_plan(auth.uid(), p_plan);
  perform app.notificar(auth.uid(), 'Contrato firmado', 'Tu plan ' || p_plan || ' de la gestión ' || g || ' quedó registrado.', '/pagos');
  return public.mi_acceso();
exception when check_violation then raise exception 'Escribe tu nombre completo y tu carnet tal como figuran en tu documento.';
end $$;

-- Cambiar de plan solo mientras no se haya pagado ni enviado a revisión ninguna cuota de la gestión.
create function public.cambiar_plan(p_plan text) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g int := app.gestion(); c contratos;
begin
  select * into c from contratos where estudiante_id = auth.uid() and gestion = g for update;
  if not found then raise exception 'Primero firma tu contrato'; end if;
  if c.plan = p_plan then return public.mi_acceso(); end if;
  if p_plan not in ('mensual','anual') then raise exception 'Elige el plan mensual o el anual'; end if;
  if exists (select 1 from cargos where estudiante_id = auth.uid() and (clave like 'CUOTA-' || g || '-%' or clave = 'ANUAL-' || g) and estado in ('pagado','en_revision')) then
    raise exception 'Ya tienes un pago registrado en esta gestión. Para cambiar de plan, comunícate con Finanzas.';
  end if;
  update cargos set estado = 'anulado' where estudiante_id = auth.uid() and estado = 'pendiente'
    and (clave like 'CUOTA-' || g || '-%' or clave = 'ANUAL-' || g);
  update contratos set plan = p_plan where id = c.id;
  perform app.generar_plan(auth.uid(), p_plan);
  return public.mi_acceso();
end $$;

-- Las clases quedan detrás del acceso: temario, materiales, archivos y enlace de clase en vivo.
drop policy temas_leer on public.temas;
create policy temas_leer on public.temas for select to authenticated using (app.en_aula(oferta_id));
drop policy mat_leer on public.materiales;
create policy mat_leer on public.materiales for select to authenticated
  using (app.gestiona_oferta(oferta_id) or (publicado and app.inscrito(oferta_id) and app.acceso_clases()));
drop policy mat_ver on storage.objects;
create policy mat_ver on storage.objects for select to authenticated
  using (bucket_id = 'materiales' and app.en_aula(app.primer_uuid(name)));
create or replace view public.v_ofertas with (security_barrier = true) as
  select f.id, f.materia_id, f.periodo_id, f.paralelo, f.docente_id, f.cupo, f.inscritos,
         case when app.gestiona_oferta(f.id) or (app.inscrito(f.id) and app.acceso_clases()) then f.enlace_clase end as enlace_clase, f.acta_cerrada,
         m.sigla, m.nombre as materia, m.creditos, m.nivel, m.carrera_id, c.nombre as carrera, c.codigo as carrera_codigo,
         p.nombre as periodo, p.modalidad, p.inicio, p.fin, p.inscripcion_desde, p.inscripcion_hasta,
         nullif(trim(d.nombres || ' ' || d.apellidos), '') as docente,
         d.foto_path as docente_foto
  from public.ofertas f
  join public.materias m on m.id = f.materia_id
  join public.carreras c on c.id = m.carrera_id
  join public.periodos p on p.id = f.periodo_id
  left join public.perfiles d on d.id = f.docente_id;

-- ─── 2. Cobros por QR verificable ──────────────────────────────────
-- El banco genera el QR con una referencia única; cuando lo pagan, avisa al webhook y la cuota se marca pagada sola.
create table public.cobros_qr (
  id uuid primary key default gen_random_uuid(),
  cargo_id uuid not null references public.cargos(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  referencia text not null unique,
  monto numeric(10,2) not null check (monto > 0),
  estado text not null default 'pendiente' check (estado in ('pendiente','pagado','vencido','anulado')),
  qr_imagen text,
  banco_id text,
  banco_tx text unique,
  expira_en timestamptz not null default now() + interval '24 hours',
  pagado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index cobros_qr_cargo_idx on public.cobros_qr(cargo_id) where estado = 'pendiente';
alter table public.cobros_qr enable row level security;
create policy cobros_leer on public.cobros_qr for select to authenticated
  using (estudiante_id = (select auth.uid()) or (select app.es_finanzas()));

-- Reserva (o reutiliza) un cobro para la cuota. La imagen del QR la pone el servicio del banco.
create function public.solicitar_cobro_qr(p_cargo uuid) returns public.cobros_qr
language plpgsql security definer set search_path = public, pg_temp as $$
declare c cargos; r cobros_qr;
begin
  select * into c from cargos where id = p_cargo and estudiante_id = auth.uid();
  if not found then raise exception 'Esta cuota no es tuya' using errcode = '42501'; end if;
  if c.estado not in ('pendiente','en_revision') then raise exception 'Esta cuota ya no tiene saldo pendiente'; end if;
  update cobros_qr set estado = 'vencido' where cargo_id = p_cargo and estado = 'pendiente' and expira_en < now();
  select * into r from cobros_qr where cargo_id = p_cargo and estado = 'pendiente' order by creado_en desc limit 1;
  if found then return r; end if;
  insert into cobros_qr (cargo_id, estudiante_id, referencia, monto)
  values (p_cargo, auth.uid(), 'USFX' || to_char(now(), 'YYMMDD') || upper(substr(md5(gen_random_uuid()::text), 1, 8)), c.monto)
  returning * into r;
  return r;
end $$;

-- Solo para el servicio (clave de servicio): guarda la imagen del QR que entregó el banco.
create function public.guardar_qr_banco(p_cobro uuid, p_imagen text, p_banco_id text) returns void
language sql security definer set search_path = public, pg_temp as
  $$ update cobros_qr set qr_imagen = p_imagen, banco_id = p_banco_id where id = p_cobro $$;

-- Solo para el webhook del banco: confirma el pago, aprueba la cuota y avisa al estudiante.
create function public.confirmar_cobro_qr(p_referencia text, p_banco_tx text, p_monto numeric) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare r cobros_qr;
begin
  select * into r from cobros_qr where referencia = p_referencia for update;
  if not found then return 'referencia_desconocida'; end if;
  if r.estado = 'pagado' then return 'ya_pagado'; end if;
  if p_monto < r.monto then return 'monto_insuficiente'; end if;
  update cobros_qr set estado = 'pagado', pagado_en = now(), banco_tx = p_banco_tx where id = r.id;
  insert into pagos (cargo_id, estudiante_id, monto, metodo, referencia, estado, motivo, revisado_en)
  values (r.cargo_id, r.estudiante_id, p_monto, 'qr', p_referencia || ' / ' || p_banco_tx, 'aprobado', 'Verificado por el banco', now());
  update cargos set estado = 'pagado' where id = r.cargo_id;
  perform app.notificar(r.estudiante_id, 'Pago confirmado', 'Tu pago de Bs ' || p_monto || ' por QR fue verificado por el banco.', '/pagos');
  return 'ok';
end $$;

-- ─── 3. Tareas y entregas ──────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('entregas', 'entregas', false, 1073741824, null) on conflict (id) do nothing;

create table public.tareas (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  titulo text not null check (length(trim(titulo)) between 3 and 160),
  instrucciones text,
  adjuntos jsonb not null default '[]',
  abre_en timestamptz not null default now(),
  vence_en timestamptz not null,
  acepta_tardias boolean not null default false,
  tipo_entrega text not null default 'archivo' check (tipo_entrega in ('archivo','texto','ambos')),
  puntaje numeric(6,2) not null default 100 check (puntaje > 0),
  publicada boolean not null default true,
  creado_por uuid default auth.uid() references public.perfiles(id),
  creado_en timestamptz not null default now(),
  check (vence_en > abre_en)
);
create index tareas_oferta_idx on public.tareas(oferta_id, vence_en);
alter table public.tareas enable row level security;
create policy tareas_leer on public.tareas for select to authenticated
  using (app.gestiona_oferta(oferta_id) or (publicada and abre_en <= now() and app.inscrito(oferta_id) and app.acceso_clases()));
create policy tareas_editar on public.tareas for all to authenticated
  using (app.gestiona_oferta(oferta_id)) with check (app.gestiona_oferta(oferta_id));

create table public.entregas (
  id uuid primary key default gen_random_uuid(),
  tarea_id uuid not null references public.tareas(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  texto text check (length(texto) <= 20000),
  archivos jsonb not null default '[]',
  estado text not null default 'entregada' check (estado in ('entregada','tardia','calificada')),
  version int not null default 1,
  enviada_en timestamptz not null default now(),
  calificacion numeric(6,2),
  comentario text,
  calificada_por uuid references public.perfiles(id),
  calificada_en timestamptz,
  unique (tarea_id, estudiante_id)
);
create index entregas_estudiante_idx on public.entregas(estudiante_id);
alter table public.entregas enable row level security;
create policy entregas_leer on public.entregas for select to authenticated
  using (estudiante_id = (select auth.uid()) or exists (select 1 from tareas t where t.id = tarea_id and app.gestiona_oferta(t.oferta_id)));

-- Archivos de la entrega: <oferta>/<tarea>/<estudiante>/<archivo>
create policy ent_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'entregas' and app.parte_uuid(name, 3) = (select auth.uid())
    and app.inscrito(app.primer_uuid(name)) and app.acceso_clases()
    and exists (select 1 from tareas t where t.id = app.parte_uuid(name, 2) and t.oferta_id = app.primer_uuid(name)));
create policy ent_ver on storage.objects for select to authenticated
  using (bucket_id = 'entregas' and (app.parte_uuid(name, 3) = (select auth.uid()) or app.gestiona_oferta(app.primer_uuid(name))));
create policy ent_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'entregas' and app.parte_uuid(name, 3) = (select auth.uid()));

create function public.entregar_tarea(p_tarea uuid, p_texto text, p_archivos jsonb) returns public.entregas
language plpgsql security definer set search_path = public, pg_temp as $$
declare t tareas; e entregas; prefijo text; a jsonb;
begin
  select * into t from tareas where id = p_tarea;
  if not found or not t.publicada or t.abre_en > now() then raise exception 'Esta tarea no está disponible'; end if;
  if not app.inscrito(t.oferta_id) then raise exception 'No estás inscrito en esta materia' using errcode = '42501'; end if;
  if not app.acceso_clases() then raise exception 'Tu acceso a clases está suspendido. Firma tu contrato o regulariza tus cuotas.' using errcode = '42501'; end if;
  if now() > t.vence_en and not t.acepta_tardias then raise exception 'La fecha límite ya pasó'; end if;
  prefijo := t.oferta_id || '/' || t.id || '/' || auth.uid() || '/';
  for a in select * from jsonb_array_elements(coalesce(p_archivos, '[]')) loop
    if left(a->>'ruta', length(prefijo)) <> prefijo then raise exception 'Archivo no válido para esta tarea'; end if;
  end loop;
  if t.tipo_entrega = 'archivo' and jsonb_array_length(coalesce(p_archivos, '[]')) = 0 then raise exception 'Adjunta al menos un archivo'; end if;
  if t.tipo_entrega = 'texto' and coalesce(trim(p_texto), '') = '' then raise exception 'Escribe tu respuesta'; end if;
  if t.tipo_entrega = 'ambos' and coalesce(trim(p_texto), '') = '' and jsonb_array_length(coalesce(p_archivos, '[]')) = 0 then raise exception 'Escribe tu respuesta o adjunta un archivo'; end if;
  select * into e from entregas where tarea_id = p_tarea and estudiante_id = auth.uid() for update;
  if found and e.estado = 'calificada' then raise exception 'Tu entrega ya fue calificada y no se puede cambiar'; end if;
  insert into entregas (tarea_id, estudiante_id, texto, archivos, estado)
  values (p_tarea, auth.uid(), nullif(trim(p_texto), ''), coalesce(p_archivos, '[]'), case when now() > t.vence_en then 'tardia' else 'entregada' end)
  on conflict (tarea_id, estudiante_id) do update
    set texto = excluded.texto, archivos = excluded.archivos, estado = excluded.estado, version = entregas.version + 1, enviada_en = now()
  returning * into e;
  return e;
end $$;

create function public.calificar_entrega(p_entrega uuid, p_nota numeric, p_comentario text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare e entregas; t tareas;
begin
  select * into e from entregas where id = p_entrega for update;
  if not found then raise exception 'Entrega no encontrada'; end if;
  select * into t from tareas where id = e.tarea_id;
  if not app.gestiona_oferta(t.oferta_id) then raise exception 'Sin permiso sobre esta materia' using errcode = '42501'; end if;
  if p_nota is null or p_nota < 0 or p_nota > t.puntaje then raise exception 'La calificación debe estar entre 0 y %', t.puntaje; end if;
  update entregas set calificacion = p_nota, comentario = nullif(trim(p_comentario), ''), estado = 'calificada',
    calificada_por = auth.uid(), calificada_en = now() where id = p_entrega;
  perform app.notificar(e.estudiante_id, 'Tarea calificada', t.titulo || ': ' || p_nota || ' de ' || t.puntaje, '/materias/' || t.oferta_id);
end $$;

-- Panel del docente: todos los inscritos, hayan entregado o no.
create function public.entregas_tarea(p_tarea uuid)
returns table (estudiante_id uuid, apellidos text, nombres text, codigo text, entrega_id uuid, estado text, enviada_en timestamptz,
               texto text, archivos jsonb, calificacion numeric, comentario text, version int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare t tareas;
begin
  select * into t from tareas where id = p_tarea;
  if not found or not app.gestiona_oferta(t.oferta_id) then raise exception 'Sin permiso sobre esta materia' using errcode = '42501'; end if;
  return query
    select s.id, p.apellidos, p.nombres, s.codigo, e.id, coalesce(e.estado, case when now() > t.vence_en then 'sin_entrega' else 'pendiente' end),
           e.enviada_en, e.texto, e.archivos, e.calificacion, e.comentario, e.version
    from inscripciones i join estudiantes s on s.id = i.estudiante_id join perfiles p on p.id = s.id
    left join entregas e on e.tarea_id = t.id and e.estudiante_id = s.id
    where i.oferta_id = t.oferta_id and i.estado = 'inscrito'
    order by p.apellidos, p.nombres;
end $$;

-- Aviso a los inscritos cuando se publica una tarea.
create function app.avisar_tarea() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare m text;
begin
  if not new.publicada then return new; end if;
  select materia into m from v_ofertas where id = new.oferta_id;
  perform app.notificar(i.estudiante_id, 'Nueva tarea · ' || coalesce(m, 'tu materia'),
    new.titulo || ' · vence el ' || to_char(new.vence_en at time zone 'America/La_Paz', 'DD/MM HH24:MI'), '/materias/' || new.oferta_id)
  from inscripciones i where i.oferta_id = new.oferta_id and i.estado = 'inscrito';
  return new;
end $$;
create trigger al_publicar_tarea after insert on public.tareas for each row execute function app.avisar_tarea();

-- ─── 4. Foros por materia ──────────────────────────────────────────
create table public.foro_temas (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.perfiles(id),
  autor_nombre text,
  autor_docente boolean not null default false,
  titulo text not null check (length(trim(titulo)) between 3 and 160),
  cuerpo text not null check (length(trim(cuerpo)) between 1 and 8000),
  fijado boolean not null default false,
  cerrado boolean not null default false,
  respuestas int not null default 0,
  actividad_en timestamptz not null default now(),
  creado_en timestamptz not null default now()
);
create index foro_temas_oferta_idx on public.foro_temas(oferta_id, fijado desc, actividad_en desc);
create table public.foro_respuestas (
  id uuid primary key default gen_random_uuid(),
  tema_id uuid not null references public.foro_temas(id) on delete cascade,
  autor_id uuid not null default auth.uid() references public.perfiles(id),
  autor_nombre text,
  autor_docente boolean not null default false,
  cuerpo text not null check (length(trim(cuerpo)) between 1 and 8000),
  creado_en timestamptz not null default now()
);
create index foro_respuestas_tema_idx on public.foro_respuestas(tema_id, creado_en);
alter table public.foro_temas enable row level security;
alter table public.foro_respuestas enable row level security;

-- El nombre del autor lo pone la base de datos: nadie puede publicar a nombre de otro.
create function app.foro_autor() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare o uuid;
begin
  new.autor_id := auth.uid();
  new.autor_nombre := (select nullif(trim(nombres || ' ' || apellidos), '') from perfiles where id = auth.uid());
  if tg_table_name = 'foro_temas' then
    o := (to_jsonb(new) ->> 'oferta_id')::uuid;
  else
    select oferta_id into o from foro_temas where id = (to_jsonb(new) ->> 'tema_id')::uuid;
  end if;
  new.autor_docente := app.gestiona_oferta(o);
  return new;
end $$;
create trigger autor_tema before insert on public.foro_temas for each row execute function app.foro_autor();
create trigger autor_respuesta before insert on public.foro_respuestas for each row execute function app.foro_autor();

create policy foro_leer on public.foro_temas for select to authenticated using (app.en_aula(oferta_id));
create policy foro_crear on public.foro_temas for insert to authenticated
  with check (app.en_aula(oferta_id) and (app.gestiona_oferta(oferta_id) or (not fijado and not cerrado)));
create policy foro_editar on public.foro_temas for update to authenticated
  using (app.gestiona_oferta(oferta_id)) with check (app.gestiona_oferta(oferta_id));
create policy foro_borrar on public.foro_temas for delete to authenticated
  using (app.gestiona_oferta(oferta_id) or autor_id = (select auth.uid()));
create policy resp_leer on public.foro_respuestas for select to authenticated
  using (exists (select 1 from foro_temas t where t.id = tema_id and app.en_aula(t.oferta_id)));
create policy resp_crear on public.foro_respuestas for insert to authenticated
  with check (exists (select 1 from foro_temas t where t.id = tema_id and app.en_aula(t.oferta_id) and (not t.cerrado or app.gestiona_oferta(t.oferta_id))));
create policy resp_borrar on public.foro_respuestas for delete to authenticated
  using (autor_id = (select auth.uid()) or exists (select 1 from foro_temas t where t.id = tema_id and app.gestiona_oferta(t.oferta_id)));

create function app.foro_respondido() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare t foro_temas;
begin
  update foro_temas set respuestas = respuestas + 1, actividad_en = now() where id = new.tema_id returning * into t;
  if t.autor_id <> new.autor_id then
    perform app.notificar(t.autor_id, 'Nueva respuesta en el foro', coalesce(new.autor_nombre, 'Alguien') || ' respondió: ' || t.titulo, '/materias/' || t.oferta_id);
  end if;
  return new;
end $$;
create trigger al_responder after insert on public.foro_respuestas for each row execute function app.foro_respondido();

-- Un tema abierto por el docente se avisa a toda la clase.
create function app.foro_anuncio() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.autor_docente then
    perform app.notificar(i.estudiante_id, 'Nuevo tema en el foro', new.titulo, '/materias/' || new.oferta_id)
    from inscripciones i where i.oferta_id = new.oferta_id and i.estado = 'inscrito';
  end if;
  return new;
end $$;
create trigger al_abrir_tema after insert on public.foro_temas for each row execute function app.foro_anuncio();

-- ─── 5. Cuestionarios ──────────────────────────────────────────────
create table public.cuestionarios (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  titulo text not null check (length(trim(titulo)) between 3 and 160),
  instrucciones text,
  abre_en timestamptz not null default now(),
  cierra_en timestamptz not null,
  duracion_min int check (duracion_min between 1 and 600),
  intentos int not null default 1 check (intentos between 1 and 10),
  mostrar_resultado boolean not null default true,
  publicado boolean not null default false,
  creado_en timestamptz not null default now(),
  check (cierra_en > abre_en)
);
create index cuestionarios_oferta_idx on public.cuestionarios(oferta_id, cierra_en);
create table public.preguntas (
  id uuid primary key default gen_random_uuid(),
  cuestionario_id uuid not null references public.cuestionarios(id) on delete cascade,
  orden int not null default 1,
  tipo text not null check (tipo in ('unica','multiple','vf','abierta')),
  enunciado text not null check (length(trim(enunciado)) between 2 and 4000),
  opciones jsonb not null default '[]',   -- [{"id":"a","texto":"..."}]
  correcta jsonb,                         -- unica: "a" · multiple: ["a","c"] · vf: true/false · abierta: null
  puntaje numeric(6,2) not null default 1 check (puntaje > 0)
);
create index preguntas_cuest_idx on public.preguntas(cuestionario_id, orden);
create table public.intentos (
  id uuid primary key default gen_random_uuid(),
  cuestionario_id uuid not null references public.cuestionarios(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  numero int not null,
  iniciado_en timestamptz not null default now(),
  limite_en timestamptz,
  enviado_en timestamptz,
  respuestas jsonb not null default '{}',
  puntaje numeric(7,2),
  puntaje_max numeric(7,2),
  pendiente_revision boolean not null default false,
  comentario text,
  unique (cuestionario_id, estudiante_id, numero)
);
create index intentos_estudiante_idx on public.intentos(estudiante_id);
alter table public.cuestionarios enable row level security;
alter table public.preguntas enable row level security;
alter table public.intentos enable row level security;
create policy cuest_leer on public.cuestionarios for select to authenticated
  using (app.gestiona_oferta(oferta_id) or (publicado and app.inscrito(oferta_id) and app.acceso_clases()));
create policy cuest_editar on public.cuestionarios for all to authenticated
  using (app.gestiona_oferta(oferta_id)) with check (app.gestiona_oferta(oferta_id));
-- Las preguntas (con sus respuestas correctas) solo las ve el docente; el estudiante las recibe por iniciar_intento.
create policy preg_docente on public.preguntas for all to authenticated
  using (exists (select 1 from cuestionarios c where c.id = cuestionario_id and app.gestiona_oferta(c.oferta_id)))
  with check (exists (select 1 from cuestionarios c where c.id = cuestionario_id and app.gestiona_oferta(c.oferta_id)));
create policy intentos_leer on public.intentos for select to authenticated
  using (estudiante_id = (select auth.uid()) or exists (select 1 from cuestionarios c where c.id = cuestionario_id and app.gestiona_oferta(c.oferta_id)));

create function public.iniciar_intento(p_cuest uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare c cuestionarios; i intentos; n int;
begin
  select * into c from cuestionarios where id = p_cuest;
  if not found or not c.publicado then raise exception 'Este cuestionario no está disponible'; end if;
  if not app.inscrito(c.oferta_id) then raise exception 'No estás inscrito en esta materia' using errcode = '42501'; end if;
  if not app.acceso_clases() then raise exception 'Tu acceso a clases está suspendido. Firma tu contrato o regulariza tus cuotas.' using errcode = '42501'; end if;
  if now() < c.abre_en then raise exception 'Este cuestionario todavía no abre'; end if;
  if now() > c.cierra_en then raise exception 'Este cuestionario ya cerró'; end if;
  -- Retoma un intento abierto que aún tenga tiempo.
  select * into i from intentos where cuestionario_id = p_cuest and estudiante_id = auth.uid() and enviado_en is null
    and (limite_en is null or limite_en > now()) order by numero desc limit 1;
  if not found then
    select count(*) into n from intentos where cuestionario_id = p_cuest and estudiante_id = auth.uid();
    if n >= c.intentos then raise exception 'Ya usaste todos tus intentos'; end if;
    insert into intentos (cuestionario_id, estudiante_id, numero, limite_en)
    values (p_cuest, auth.uid(), n + 1, case when c.duracion_min is null then c.cierra_en else least(c.cierra_en, now() + make_interval(mins => c.duracion_min)) end)
    returning * into i;
  end if;
  return jsonb_build_object('intento_id', i.id, 'numero', i.numero, 'limite_en', i.limite_en, 'respuestas', i.respuestas,
    'preguntas', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'tipo', p.tipo, 'enunciado', p.enunciado, 'opciones', p.opciones, 'puntaje', p.puntaje) order by p.orden)
                           from preguntas p where p.cuestionario_id = p_cuest), '[]'));
end $$;

-- Califica en el servidor. Abiertas: quedan para revisión del docente.
create function public.enviar_intento(p_intento uuid, p_respuestas jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare i intentos; c cuestionarios; p preguntas; r jsonb; total numeric := 0; maximo numeric := 0; pendiente boolean := false;
begin
  select * into i from intentos where id = p_intento and estudiante_id = auth.uid() for update;
  if not found then raise exception 'Intento no encontrado' using errcode = '42501'; end if;
  if i.enviado_en is not null then raise exception 'Este intento ya fue enviado'; end if;
  select * into c from cuestionarios where id = i.cuestionario_id;
  -- Dos minutos de gracia por la conexión; pasado eso, se califica lo que haya.
  for p in select * from preguntas where cuestionario_id = c.id loop
    maximo := maximo + p.puntaje;
    r := coalesce(p_respuestas, '{}') -> p.id::text;
    if p.tipo = 'abierta' then
      if r is not null and coalesce(r #>> '{}', '') <> '' then pendiente := true; end if;
    elsif p.tipo = 'multiple' then
      if r is not null and jsonb_typeof(r) = 'array'
         and (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(r) x) = (select coalesce(array_agg(x order by x), '{}') from jsonb_array_elements_text(p.correcta) x)
      then total := total + p.puntaje; end if;
    elsif r is not null and r = p.correcta then
      total := total + p.puntaje;
    end if;
  end loop;
  update intentos set respuestas = coalesce(p_respuestas, '{}'), enviado_en = now(), puntaje = total, puntaje_max = maximo, pendiente_revision = pendiente
    where id = i.id;
  return jsonb_build_object('puntaje', case when c.mostrar_resultado then total end, 'puntaje_max', maximo, 'pendiente_revision', pendiente,
    'tarde', i.limite_en is not null and now() > i.limite_en + interval '2 minutes');
end $$;

create function public.revisar_intento(p_intento uuid, p_puntaje numeric, p_comentario text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare i intentos; c cuestionarios;
begin
  select * into i from intentos where id = p_intento for update;
  if not found then raise exception 'Intento no encontrado'; end if;
  select * into c from cuestionarios where id = i.cuestionario_id;
  if not app.gestiona_oferta(c.oferta_id) then raise exception 'Sin permiso sobre esta materia' using errcode = '42501'; end if;
  if p_puntaje < 0 or p_puntaje > i.puntaje_max then raise exception 'El puntaje debe estar entre 0 y %', i.puntaje_max; end if;
  update intentos set puntaje = p_puntaje, pendiente_revision = false, comentario = nullif(trim(p_comentario), '') where id = p_intento;
  perform app.notificar(i.estudiante_id, 'Cuestionario revisado', c.titulo || ': ' || p_puntaje || ' de ' || i.puntaje_max, '/materias/' || c.oferta_id);
end $$;

create function public.resultados_cuestionario(p_cuest uuid)
returns table (estudiante_id uuid, apellidos text, nombres text, intentos bigint, mejor numeric, puntaje_max numeric, pendiente boolean, ultimo_intento uuid)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c cuestionarios;
begin
  select * into c from cuestionarios where id = p_cuest;
  if not found or not app.gestiona_oferta(c.oferta_id) then raise exception 'Sin permiso sobre esta materia' using errcode = '42501'; end if;
  return query
    select s.id, p.apellidos, p.nombres, count(x.id), max(x.puntaje), max(x.puntaje_max), coalesce(bool_or(x.pendiente_revision), false),
           (array_agg(x.id order by x.numero desc) filter (where x.id is not null))[1]
    from inscripciones i join estudiantes s on s.id = i.estudiante_id join perfiles p on p.id = s.id
    left join intentos x on x.cuestionario_id = c.id and x.estudiante_id = s.id and x.enviado_en is not null
    where i.oferta_id = c.oferta_id and i.estado = 'inscrito'
    group by s.id, p.apellidos, p.nombres order by p.apellidos, p.nombres;
end $$;

-- ─── 6. Asistencia obligatoria ─────────────────────────────────────
-- Porcentaje = sesiones sin falta / sesiones registradas (atraso y licencia cuentan como asistencia).
create function public.resumen_asistencia(p_oferta uuid)
returns table (estudiante_id uuid, apellidos text, nombres text, sesiones bigint, faltas bigint, porcentaje numeric, en_riesgo boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare minimo numeric := app.cfg_num('asistencia_minima', 75); total bigint;
begin
  if not app.gestiona_oferta(p_oferta) then raise exception 'Sin permiso sobre esta materia' using errcode = '42501'; end if;
  select count(*) into total from sesiones where oferta_id = p_oferta;
  return query
    select s.id, p.apellidos, p.nombres, total,
           count(*) filter (where a.estado = 'falta' or a.estado is null and ss.id is not null),
           case when total = 0 then 100::numeric else round(100.0 * (total - count(*) filter (where a.estado = 'falta' or a.estado is null and ss.id is not null)) / total, 1) end,
           total > 0 and round(100.0 * (total - count(*) filter (where a.estado = 'falta' or a.estado is null and ss.id is not null)) / total, 1) < minimo
    from inscripciones i join estudiantes s on s.id = i.estudiante_id join perfiles p on p.id = s.id
    left join sesiones ss on ss.oferta_id = p_oferta
    left join asistencias a on a.sesion_id = ss.id and a.estudiante_id = s.id
    where i.oferta_id = p_oferta and i.estado = 'inscrito'
    group by s.id, p.apellidos, p.nombres order by p.apellidos, p.nombres;
end $$;

create function public.mi_asistencia_materias()
returns table (oferta_id uuid, materia text, sesiones bigint, faltas bigint, porcentaje numeric, minimo numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select i.oferta_id, v.materia, count(ss.id),
         count(ss.id) filter (where a.estado = 'falta' or a.estado is null),
         case when count(ss.id) = 0 then 100::numeric else round(100.0 * (count(ss.id) - count(ss.id) filter (where a.estado = 'falta' or a.estado is null)) / count(ss.id), 1) end,
         app.cfg_num('asistencia_minima', 75)
  from inscripciones i join v_ofertas v on v.id = i.oferta_id
  left join sesiones ss on ss.oferta_id = i.oferta_id
  left join asistencias a on a.sesion_id = ss.id and a.estudiante_id = i.estudiante_id
  where i.estudiante_id = auth.uid() and i.estado = 'inscrito'
  group by i.oferta_id, v.materia order by v.materia
$$;

-- Alerta una sola vez cuando el estudiante baja del mínimo (desde la tercera sesión); se rearma si se recupera.
create table public.alertas_asistencia (
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  enviada_en timestamptz not null default now(),
  primary key (oferta_id, estudiante_id)
);
alter table public.alertas_asistencia enable row level security;

create function app.revisar_asistencia(p_oferta uuid) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare minimo numeric := app.cfg_num('asistencia_minima', 75); total bigint; r record; m text;
begin
  select count(*) into total from sesiones where oferta_id = p_oferta;
  if total < 3 then return; end if;
  select materia into m from v_ofertas where id = p_oferta;
  for r in
    select i.estudiante_id, round(100.0 * (total - count(ss.id) filter (where a.estado = 'falta' or a.estado is null)) / total, 1) as pct
    from inscripciones i left join sesiones ss on ss.oferta_id = p_oferta
    left join asistencias a on a.sesion_id = ss.id and a.estudiante_id = i.estudiante_id
    where i.oferta_id = p_oferta and i.estado = 'inscrito' group by i.estudiante_id
  loop
    if r.pct < minimo then
      insert into alertas_asistencia (oferta_id, estudiante_id) values (p_oferta, r.estudiante_id) on conflict do nothing;
      if found then
        perform app.notificar(r.estudiante_id, 'Asistencia en riesgo · ' || coalesce(m, 'tu materia'),
          'Tu asistencia es de ' || r.pct || '%. La asistencia es obligatoria: el mínimo es ' || minimo || '%.', '/asistencia');
      end if;
    else
      delete from alertas_asistencia where oferta_id = p_oferta and estudiante_id = r.estudiante_id;
    end if;
  end loop;
end $$;

create or replace function public.pasar_asistencia(p_oferta uuid, p_fecha date, p_tema text, p_marcas jsonb)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare s uuid;
begin
  if not app.gestiona_oferta(p_oferta) then raise exception 'Sin permiso sobre esta materia' using errcode = '42501'; end if;
  if exists (select 1 from ofertas where id = p_oferta and acta_cerrada) then raise exception 'El acta ya está cerrada'; end if;
  insert into sesiones (oferta_id, fecha, tema, creado_por) values (p_oferta, p_fecha, p_tema, auth.uid())
    on conflict (oferta_id, fecha) do update set tema = coalesce(excluded.tema, sesiones.tema) returning id into s;
  insert into asistencias (sesion_id, estudiante_id, estado)
    select s, (x->>'estudiante_id')::uuid, x->>'estado' from jsonb_array_elements(p_marcas) x
    where exists (select 1 from inscripciones i where i.oferta_id = p_oferta and i.estudiante_id = (x->>'estudiante_id')::uuid and i.estado = 'inscrito')
    on conflict (sesion_id, estudiante_id) do update set estado = excluded.estado, actualizado_en = now();
  perform app.revisar_asistencia(p_oferta);
  return s;
end $$;

-- ─── Permisos ──────────────────────────────────────────────────────
grant select on public.contratos, public.cobros_qr, public.tareas, public.entregas, public.foro_temas, public.foro_respuestas,
  public.cuestionarios, public.preguntas, public.intentos to authenticated;
grant insert, update, delete on public.tareas, public.cuestionarios, public.preguntas to authenticated;
grant insert, delete on public.foro_temas, public.foro_respuestas to authenticated;
grant update (fijado, cerrado, titulo, cuerpo) on public.foro_temas to authenticated;
revoke all on public.alertas_asistencia from anon, authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
-- Las funciones de servicio no las llama nadie desde la página.
revoke execute on function public.guardar_qr_banco(uuid, text, text), public.confirmar_cobro_qr(text, text, numeric),
  public.tomar_cola_push(int), public.limpiar_cola_push(), public.nuevo_codigo_estudiante(),
  public.suscripciones_conversacion(uuid, uuid, int, int), public.suscripciones_preinscritos(uuid, text, int, int),
  public.suscripciones_visitantes(uuid, text, int, int) from authenticated;
grant execute on function public.guardar_qr_banco(uuid, text, text), public.confirmar_cobro_qr(text, text, numeric) to service_role;
-- La landing (sin sesión) sigue pudiendo preinscribirse y suscribirse a avisos.
grant execute on function public.preinscribir(jsonb), public.suscribir_preinscripcion(text, text, text, text),
  public.conteo_preinscripciones(), public.suscribir_visitante(text, text, text, text) to anon;
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
