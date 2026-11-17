-- Asistencia, notas, kardex, contenidos, finanzas, admisión, notificaciones y auditoría.

-- ─── Notificaciones ────────────────────────────────────────────────
create table public.notificaciones (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  titulo text not null,
  cuerpo text,
  url text,
  leida boolean not null default false,
  creado_en timestamptz not null default now()
);
create index notificaciones_usuario_idx on public.notificaciones(usuario_id, id desc);
create index notificaciones_sin_leer_idx on public.notificaciones(usuario_id) where not leida;
alter table public.notificaciones enable row level security;
create policy notif_leer on public.notificaciones for select to authenticated using (usuario_id = (select auth.uid()));
create policy notif_marcar on public.notificaciones for update to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

create table public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  agente text,
  creado_en timestamptz not null default now()
);
create index push_usuario_idx on public.push_suscripciones(usuario_id);
alter table public.push_suscripciones enable row level security;
create policy push_propio on public.push_suscripciones for all to authenticated
  using (usuario_id = (select auth.uid())) with check (usuario_id = (select auth.uid()));

-- Cola de push: enviar no bloquea a nadie; un trabajador la vacía por lotes.
create table public.cola_push (
  id bigint generated always as identity primary key,
  usuario_id uuid,
  conversacion_id uuid,
  excluir uuid,
  titulo text not null,
  cuerpo text,
  url text,
  tomado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index cola_push_pendientes on public.cola_push(id) where tomado_en is null;
alter table public.cola_push enable row level security;

create function app.notificar(u uuid, t text, c text, l text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into notificaciones (usuario_id, titulo, cuerpo, url) values (u, t, c, l);
  insert into cola_push (usuario_id, titulo, cuerpo, url) values (u, t, c, l);
end $$;

-- ─── Asistencia ────────────────────────────────────────────────────
create table public.sesiones (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  fecha date not null default current_date,
  tema text,
  creado_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(),
  unique (oferta_id, fecha)
);
create table public.asistencias (
  sesion_id uuid not null references public.sesiones(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  estado text not null check (estado in ('presente','atraso','licencia','falta')),
  actualizado_en timestamptz not null default now(),
  primary key (sesion_id, estudiante_id)
);
create index asistencias_estudiante_idx on public.asistencias(estudiante_id);
alter table public.sesiones enable row level security;
alter table public.asistencias enable row level security;
create policy sesiones_leer on public.sesiones for select to authenticated
  using (app.gestiona_oferta(oferta_id) or app.inscrito(oferta_id));
create policy sesiones_editar on public.sesiones for update to authenticated
  using (app.gestiona_oferta(oferta_id)) with check (app.gestiona_oferta(oferta_id));
create policy asistencias_leer on public.asistencias for select to authenticated
  using (estudiante_id = (select auth.uid()) or exists (select 1 from public.sesiones s where s.id = sesion_id and app.gestiona_oferta(s.oferta_id)));

-- Lista de la materia: solo quien la dicta o administra. Sirve para asistencia, notas y exportes.
create function public.lista_oferta(p_oferta uuid)
returns table (estudiante_id uuid, codigo text, apellidos text, nombres text, celular text, foto_path text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.gestiona_oferta(p_oferta) then raise exception 'Sin permiso sobre esta materia' using errcode = '42501'; end if;
  return query select e.id, e.codigo, p.apellidos, p.nombres, p.celular, p.foto_path
    from inscripciones i join estudiantes e on e.id = i.estudiante_id join perfiles p on p.id = e.id
    where i.oferta_id = p_oferta and i.estado = 'inscrito' order by p.apellidos, p.nombres;
end $$;

-- El docente llama lista: abre (o reabre) la sesión del día y guarda todo de una vez.
create function public.pasar_asistencia(p_oferta uuid, p_fecha date, p_tema text, p_marcas jsonb)
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
  return s;
end $$;

-- ─── Notas ─────────────────────────────────────────────────────────
create table public.evaluaciones (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  nombre text not null,
  ponderacion numeric(5,2) not null check (ponderacion > 0 and ponderacion <= 100),
  fecha date,
  publicada boolean not null default false,
  orden int not null default 0
);
create index evaluaciones_oferta_idx on public.evaluaciones(oferta_id);
create table public.notas (
  evaluacion_id uuid not null references public.evaluaciones(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  nota numeric(5,2) check (nota between 0 and 100),
  observacion text,
  actualizado_en timestamptz not null default now(),
  primary key (evaluacion_id, estudiante_id)
);
create index notas_estudiante_idx on public.notas(estudiante_id);
create table public.notas_finales (
  inscripcion_id uuid primary key references public.inscripciones(id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  oferta_id uuid not null references public.ofertas(id),
  nota numeric(5,2) not null,
  aprobado boolean not null,
  cerrado_en timestamptz not null default now()
);
create index notas_finales_estudiante_idx on public.notas_finales(estudiante_id);
create index notas_finales_oferta_idx on public.notas_finales(oferta_id);

-- ─── Finanzas ──────────────────────────────────────────────────────
create table public.cargos (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  clave text not null, -- evita cobrar dos veces lo mismo (MENS-2026-11, MATR-2026)
  concepto text not null check (concepto in ('matricula','mensualidad','otro')),
  descripcion text not null,
  monto numeric(10,2) not null check (monto >= 0),
  vence date not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','en_revision','pagado','anulado')),
  creado_en timestamptz not null default now(),
  unique (estudiante_id, clave)
);
create index cargos_deuda_idx on public.cargos(estudiante_id, vence) where estado in ('pendiente','en_revision');
create index cargos_estado_idx on public.cargos(estado, vence);
create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  cargo_id uuid not null references public.cargos(id),
  estudiante_id uuid not null references public.estudiantes(id),
  monto numeric(10,2) not null check (monto > 0),
  metodo text not null default 'qr' check (metodo in ('qr','transferencia','caja','pasarela')),
  referencia text,
  comprobante_path text,
  estado text not null default 'revision' check (estado in ('revision','aprobado','rechazado')),
  motivo text,
  revisado_por uuid references public.perfiles(id),
  revisado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index pagos_revision_idx on public.pagos(creado_en) where estado = 'revision';
create index pagos_estudiante_idx on public.pagos(estudiante_id);
alter table public.cargos enable row level security;
alter table public.pagos enable row level security;
create policy cargos_leer on public.cargos for select to authenticated
  using (estudiante_id = (select auth.uid()) or (select app.es_finanzas()));
create policy cargos_editar on public.cargos for all to authenticated
  using ((select app.es_finanzas())) with check ((select app.es_finanzas()));
create policy pagos_leer on public.pagos for select to authenticated
  using (estudiante_id = (select auth.uid()) or (select app.es_finanzas()));
-- El estudiante solo reporta su pago en revisión; aprobar es exclusivo de finanzas.
create policy pagos_reportar on public.pagos for insert to authenticated
  with check (estudiante_id = (select auth.uid()) and estado = 'revision' and revisado_por is null
    and exists (select 1 from public.cargos c where c.id = cargo_id and c.estudiante_id = (select auth.uid()) and c.estado in ('pendiente','en_revision')));

create function app.pago_reportado() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update cargos set estado = 'en_revision' where id = new.cargo_id and estado = 'pendiente';
  return new;
end $$;
create trigger al_reportar_pago after insert on public.pagos for each row execute function app.pago_reportado();

-- Al día = sin cargos vencidos sin pagar. Un comprobante en revisión todavía no libera.
create function app.al_dia(u uuid default auth.uid()) returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select not coalesce((select (valor)::text::boolean from configuracion where clave = 'bloquear_notas_por_deuda'), true)
      or not exists (select 1 from cargos where estudiante_id = u and estado in ('pendiente','en_revision') and vence < current_date)
$$;
create function public.mi_estado_financiero() returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'al_dia', app.al_dia(auth.uid()),
    'deuda_vencida', coalesce((select sum(monto) from cargos where estudiante_id = auth.uid() and estado in ('pendiente','en_revision') and vence < current_date), 0),
    'por_vencer', coalesce((select sum(monto) from cargos where estudiante_id = auth.uid() and estado in ('pendiente','en_revision') and vence >= current_date), 0))
$$;

create function public.revisar_pago(p_pago uuid, p_aprobar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p pagos;
begin
  if not app.es_finanzas() then raise exception 'Solo Finanzas puede revisar pagos' using errcode = '42501'; end if;
  select * into p from pagos where id = p_pago for update;
  if not found or p.estado <> 'revision' then raise exception 'Este pago ya no está en revisión'; end if;
  if not p_aprobar and coalesce(trim(p_motivo),'') = '' then raise exception 'Indica el motivo del rechazo'; end if;
  update pagos set estado = case when p_aprobar then 'aprobado' else 'rechazado' end, motivo = p_motivo, revisado_por = auth.uid(), revisado_en = now() where id = p_pago;
  update cargos set estado = case when p_aprobar then 'pagado'
      when exists (select 1 from pagos x where x.cargo_id = p.cargo_id and x.estado = 'revision' and x.id <> p_pago) then 'en_revision' else 'pendiente' end
    where id = p.cargo_id;
  perform app.notificar(p.estudiante_id, case when p_aprobar then 'Pago aprobado' else 'Pago rechazado' end,
    case when p_aprobar then 'Tu pago fue confirmado.' else 'Motivo: ' || p_motivo end, '/pagos');
end $$;

-- Genera cargos por lote. Es idempotente: repetir la misma clave no duplica.
create function public.generar_cargos(p_clave text, p_concepto text, p_descripcion text, p_monto numeric, p_vence date, p_carrera uuid default null)
returns int language plpgsql security definer set search_path = public, pg_temp as $$
declare n int;
begin
  if not app.es_finanzas() then raise exception 'Solo Finanzas puede generar cargos' using errcode = '42501'; end if;
  insert into cargos (estudiante_id, clave, concepto, descripcion, monto, vence)
    select e.id, p_clave, p_concepto, p_descripcion, p_monto, p_vence from estudiantes e
    where e.estado = 'activo' and (p_carrera is null or e.carrera_id = p_carrera)
    on conflict (estudiante_id, clave) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Las notas se bloquean en la base de datos: sin estar al día, la consulta devuelve vacío.
alter table public.evaluaciones enable row level security;
alter table public.notas enable row level security;
alter table public.notas_finales enable row level security;
create policy eval_leer on public.evaluaciones for select to authenticated
  using (app.gestiona_oferta(oferta_id) or (publicada and app.inscrito(oferta_id)));
create policy eval_editar on public.evaluaciones for all to authenticated
  using (app.gestiona_oferta(oferta_id) and not exists (select 1 from public.ofertas o where o.id = oferta_id and o.acta_cerrada))
  with check (app.gestiona_oferta(oferta_id) and not exists (select 1 from public.ofertas o where o.id = oferta_id and o.acta_cerrada));
create policy notas_leer on public.notas for select to authenticated
  using ((estudiante_id = (select auth.uid()) and (select app.al_dia())
          and exists (select 1 from public.evaluaciones e where e.id = evaluacion_id and e.publicada))
      or exists (select 1 from public.evaluaciones e where e.id = evaluacion_id and app.gestiona_oferta(e.oferta_id)));
create policy finales_leer on public.notas_finales for select to authenticated
  using ((estudiante_id = (select auth.uid()) and (select app.al_dia())) or app.gestiona_oferta(oferta_id));

create function public.guardar_notas(p_evaluacion uuid, p_notas jsonb) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare o uuid; n int;
begin
  select oferta_id into o from evaluaciones where id = p_evaluacion;
  if o is null or not app.gestiona_oferta(o) then raise exception 'Sin permiso sobre esta evaluación' using errcode = '42501'; end if;
  if exists (select 1 from ofertas where id = o and acta_cerrada) then raise exception 'El acta ya está cerrada'; end if;
  insert into notas (evaluacion_id, estudiante_id, nota, observacion)
    select p_evaluacion, (x->>'estudiante_id')::uuid, nullif(x->>'nota','')::numeric, x->>'observacion' from jsonb_array_elements(p_notas) x
    where exists (select 1 from inscripciones i where i.oferta_id = o and i.estudiante_id = (x->>'estudiante_id')::uuid and i.estado = 'inscrito')
    on conflict (evaluacion_id, estudiante_id) do update set nota = excluded.nota, observacion = excluded.observacion, actualizado_en = now();
  get diagnostics n = row_count;
  return n;
end $$;

create function public.cerrar_acta(p_oferta uuid) returns int
language plpgsql security definer set search_path = public, pg_temp as $$
declare total numeric; minima numeric := coalesce((app.config('nota_minima'))::text::numeric, 51); n int;
begin
  if not app.gestiona_oferta(p_oferta) then raise exception 'Sin permiso sobre esta materia' using errcode = '42501'; end if;
  if exists (select 1 from ofertas where id = p_oferta and acta_cerrada) then raise exception 'El acta ya está cerrada'; end if;
  select coalesce(sum(ponderacion),0) into total from evaluaciones where oferta_id = p_oferta;
  if total <> 100 then raise exception 'Las ponderaciones deben sumar 100 (ahora suman %)', total; end if;
  update evaluaciones set publicada = true where oferta_id = p_oferta;
  insert into notas_finales (inscripcion_id, estudiante_id, oferta_id, nota, aprobado)
    select i.id, i.estudiante_id, p_oferta, round(coalesce(sum(coalesce(t.nota,0) * e.ponderacion / 100),0), 2),
           round(coalesce(sum(coalesce(t.nota,0) * e.ponderacion / 100),0), 2) >= minima
    from inscripciones i
    join evaluaciones e on e.oferta_id = i.oferta_id
    left join notas t on t.evaluacion_id = e.id and t.estudiante_id = i.estudiante_id
    where i.oferta_id = p_oferta and i.estado = 'inscrito'
    group by i.id, i.estudiante_id
    on conflict (inscripcion_id) do update set nota = excluded.nota, aprobado = excluded.aprobado, cerrado_en = now();
  get diagnostics n = row_count;
  update ofertas set acta_cerrada = true, acta_cerrada_en = now() where id = p_oferta;
  insert into notificaciones (usuario_id, titulo, cuerpo, url)
    select i.estudiante_id, 'Notas finales publicadas', v.sigla || ' ' || v.materia, '/notas'
    from inscripciones i join v_ofertas v on v.id = i.oferta_id where i.oferta_id = p_oferta and i.estado = 'inscrito';
  return n;
end $$;

create function public.reabrir_acta(p_oferta uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.es_admin() then raise exception 'Solo administración puede reabrir un acta' using errcode = '42501'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Indica el motivo'; end if;
  update ofertas set acta_cerrada = false, acta_cerrada_en = null where id = p_oferta;
  insert into auditoria (actor, accion, tabla, fila, datos) values (auth.uid(), 'reabrir_acta', 'ofertas', p_oferta::text, jsonb_build_object('motivo', p_motivo));
end $$;

-- Mis notas por materia; el kardex hereda el bloqueo de notas_finales (security_invoker).
create view public.v_mis_notas with (security_invoker = true) as
  select n.estudiante_id, e.oferta_id, e.id as evaluacion_id, e.nombre as evaluacion, e.ponderacion, e.orden, n.nota, n.observacion
  from public.notas n join public.evaluaciones e on e.id = n.evaluacion_id;
create view public.v_kardex with (security_invoker = true) as
  select f.estudiante_id, f.oferta_id, f.nota, f.aprobado, f.cerrado_en,
         m.sigla, m.nombre as materia, m.creditos, m.nivel, p.nombre as periodo, p.modalidad, p.inicio
  from public.notas_finales f
  join public.ofertas o on o.id = f.oferta_id
  join public.materias m on m.id = o.materia_id
  join public.periodos p on p.id = o.periodo_id;
create view public.v_asistencia_estudiante with (security_invoker = true) as
  select a.estudiante_id, s.oferta_id, s.fecha, s.tema, a.estado
  from public.asistencias a join public.sesiones s on s.id = a.sesion_id;

-- ¿Puede ver sus notas? Separado para que la interfaz explique el bloqueo.
create function public.planilla_notas(p_oferta uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.gestiona_oferta(p_oferta) then raise exception 'Sin permiso sobre esta materia' using errcode = '42501'; end if;
  return jsonb_build_object(
    'evaluaciones', coalesce((select jsonb_agg(to_jsonb(e) order by e.orden, e.nombre) from evaluaciones e where e.oferta_id = p_oferta), '[]'),
    'notas', coalesce((select jsonb_agg(jsonb_build_object('evaluacion_id', n.evaluacion_id, 'estudiante_id', n.estudiante_id, 'nota', n.nota))
       from notas n join evaluaciones e on e.id = n.evaluacion_id where e.oferta_id = p_oferta), '[]'),
    'finales', coalesce((select jsonb_agg(jsonb_build_object('estudiante_id', f.estudiante_id, 'nota', f.nota, 'aprobado', f.aprobado)) from notas_finales f where f.oferta_id = p_oferta), '[]'));
end $$;
create function public.registro_asistencia(p_oferta uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not app.gestiona_oferta(p_oferta) then raise exception 'Sin permiso sobre esta materia' using errcode = '42501'; end if;
  return jsonb_build_object(
    'sesiones', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'fecha', s.fecha, 'tema', s.tema) order by s.fecha) from sesiones s where s.oferta_id = p_oferta), '[]'),
    'marcas', coalesce((select jsonb_agg(jsonb_build_object('sesion_id', a.sesion_id, 'estudiante_id', a.estudiante_id, 'estado', a.estado))
       from asistencias a join sesiones s on s.id = a.sesion_id where s.oferta_id = p_oferta), '[]'));
end $$;

-- ─── Inscripción a materias ────────────────────────────────────────
create function public.inscribir_materia(p_oferta uuid) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare me uuid := auth.uid(); v v_ofertas; est estudiantes; res uuid;
begin
  select * into est from estudiantes where id = me;
  if not found or est.estado <> 'activo' then raise exception 'Solo estudiantes activos pueden inscribirse'; end if;
  select * into v from v_ofertas where id = p_oferta;
  if not found then raise exception 'La materia no existe'; end if;
  if v.carrera_id <> est.carrera_id then raise exception 'Esta materia no pertenece a tu carrera'; end if;
  if current_date not between v.inscripcion_desde and v.inscripcion_hasta then raise exception 'La inscripción de este periodo no está abierta'; end if;
  if coalesce((app.config('exigir_matricula_para_inscribir'))::text::boolean, true)
     and exists (select 1 from cargos where estudiante_id = me and concepto = 'matricula' and estado in ('pendiente','en_revision')) then
    raise exception 'Primero debes tener la matrícula pagada';
  end if;
  if exists (select 1 from prerrequisitos r where r.materia_id = v.materia_id and not exists (
      select 1 from notas_finales f join ofertas o on o.id = f.oferta_id where f.estudiante_id = me and f.aprobado and o.materia_id = r.requisito_id)) then
    raise exception 'Te falta aprobar un prerrequisito de esta materia';
  end if;
  if exists (select 1 from inscripciones i join ofertas o on o.id = i.oferta_id
             where i.estudiante_id = me and i.estado = 'inscrito' and o.materia_id = v.materia_id and o.periodo_id = v.periodo_id) then
    raise exception 'Ya estás inscrito en esta materia';
  end if;
  if exists (select 1 from inscripciones i join horarios a on a.oferta_id = i.oferta_id join ofertas ao on ao.id = i.oferta_id
             join horarios b on b.oferta_id = p_oferta and b.dia = a.dia and b.inicio < a.fin and a.inicio < b.fin
             where i.estudiante_id = me and i.estado = 'inscrito' and ao.periodo_id = v.periodo_id) then
    raise exception 'Choca con el horario de otra materia inscrita';
  end if;
  -- Reserva atómica: no hay sobrecupo aunque miles se inscriban a la vez.
  update ofertas set inscritos = inscritos + 1 where id = p_oferta and inscritos < cupo;
  if not found then raise exception 'Ya no hay cupos en este paralelo'; end if;
  insert into inscripciones (estudiante_id, oferta_id) values (me, p_oferta)
    on conflict (estudiante_id, oferta_id) do update set estado = 'inscrito' returning id into res;
  return res;
end $$;
create function public.retirar_materia(p_oferta uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from ofertas where id = p_oferta and acta_cerrada) then raise exception 'El acta ya está cerrada'; end if;
  update inscripciones set estado = 'retirado' where oferta_id = p_oferta and estudiante_id = auth.uid() and estado = 'inscrito';
  if found then update ofertas set inscritos = greatest(inscritos - 1, 0) where id = p_oferta; end if;
end $$;

-- ─── Contenidos del docente ────────────────────────────────────────
create table public.temas (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  orden int not null default 0,
  titulo text not null,
  descripcion text
);
create index temas_oferta_idx on public.temas(oferta_id, orden);
create table public.materiales (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  tema_id uuid references public.temas(id) on delete set null,
  tipo text not null check (tipo in ('pdf','presentacion','video','audio','imagen','documento','enlace')),
  titulo text not null,
  descripcion text,
  storage_path text,
  url text,
  mime text,
  tamano bigint,
  publicado boolean not null default true,
  creado_en timestamptz not null default now(),
  check (storage_path is not null or url is not null)
);
create index materiales_oferta_idx on public.materiales(oferta_id, creado_en desc);
alter table public.temas enable row level security;
alter table public.materiales enable row level security;
create policy temas_leer on public.temas for select to authenticated using (app.gestiona_oferta(oferta_id) or app.inscrito(oferta_id));
create policy temas_editar on public.temas for all to authenticated using (app.gestiona_oferta(oferta_id)) with check (app.gestiona_oferta(oferta_id));
create policy mat_leer on public.materiales for select to authenticated using (app.gestiona_oferta(oferta_id) or (publicado and app.inscrito(oferta_id)));
create policy mat_editar on public.materiales for all to authenticated using (app.gestiona_oferta(oferta_id)) with check (app.gestiona_oferta(oferta_id));

-- ─── Admisión ──────────────────────────────────────────────────────
create table public.postulaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null unique references public.perfiles(id) on delete cascade,
  carrera_id uuid references public.carreras(id),
  fecha_nacimiento date,
  direccion text,
  ciudad text,
  colegio text,
  ci_anverso_path text,
  ci_reverso_path text,
  titulo_path text,
  foto_path text,
  declaracion jsonb,
  declaracion_aceptada_en timestamptz,
  estado text not null default 'borrador' check (estado in ('borrador','enviada','observada','aprobada','rechazada')),
  observacion text,
  revisado_por uuid references public.perfiles(id),
  revisado_en timestamptz,
  creado_en timestamptz not null default now()
);
create index postulaciones_estado_idx on public.postulaciones(estado, creado_en);
alter table public.postulaciones enable row level security;
create policy post_leer on public.postulaciones for select to authenticated
  using (usuario_id = (select auth.uid()) or (select app.es_admin()) or (select app.rol()) = 'director');
create policy post_crear on public.postulaciones for insert to authenticated
  with check (usuario_id = (select auth.uid()) and estado = 'borrador');
create policy post_editar on public.postulaciones for update to authenticated
  using (usuario_id = (select auth.uid()) and estado in ('borrador','observada'))
  with check (usuario_id = (select auth.uid()) and estado in ('borrador','observada'));

create function public.enviar_postulacion() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p postulaciones;
begin
  select * into p from postulaciones where usuario_id = auth.uid();
  if not found then raise exception 'Primero completa tu postulación'; end if;
  if p.estado not in ('borrador','observada') then raise exception 'Tu postulación ya fue enviada'; end if;
  if p.carrera_id is null then raise exception 'Elige una carrera'; end if;
  if p.ci_anverso_path is null or p.ci_reverso_path is null then raise exception 'Falta la foto de tu carnet por ambos lados'; end if;
  if p.titulo_path is null then raise exception 'Falta la foto de tu título de bachiller'; end if;
  if p.foto_path is null then raise exception 'Falta tu foto 4x4 con fondo rojo'; end if;
  if p.declaracion_aceptada_en is null then raise exception 'Falta firmar la declaración jurada'; end if;
  update postulaciones set estado = 'enviada', observacion = null where id = p.id;
end $$;

create function public.resolver_postulacion(p_id uuid, p_accion text, p_observacion text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare p postulaciones; venc date := current_date + 15; monto numeric := coalesce((app.config('monto_matricula'))::text::numeric, 0);
begin
  if not app.es_admin() then raise exception 'Solo administración puede resolver postulaciones' using errcode = '42501'; end if;
  select * into p from postulaciones where id = p_id for update;
  if not found or p.estado <> 'enviada' then raise exception 'Esta postulación no está pendiente'; end if;
  if p_accion in ('observada','rechazada') and coalesce(trim(p_observacion),'') = '' then raise exception 'Indica el motivo'; end if;
  if p_accion not in ('aprobada','observada','rechazada') then raise exception 'Acción no válida'; end if;
  update postulaciones set estado = p_accion, observacion = p_observacion, revisado_por = auth.uid(), revisado_en = now() where id = p_id;
  if p_accion = 'aprobada' then
    update perfiles set rol = 'estudiante' where id = p.usuario_id;
    insert into estudiantes (id, codigo, carrera_id) values (p.usuario_id, app.nuevo_codigo(), p.carrera_id);
    insert into cargos (estudiante_id, clave, concepto, descripcion, monto, vence)
      values (p.usuario_id, 'MATR-' || extract(year from now()), 'matricula', 'Matrícula ' || extract(year from now()), monto, venc);
  end if;
  perform app.notificar(p.usuario_id,
    case p_accion when 'aprobada' then 'Postulación aprobada' when 'observada' then 'Tu postulación tiene observaciones' else 'Postulación rechazada' end,
    coalesce(p_observacion, 'Ya eres estudiante. Paga tu matrícula para inscribir materias.'), '/matricula');
end $$;

-- ─── Administración de perfiles ────────────────────────────────────
create function public.admin_actualizar_perfil(p_id uuid, p_datos jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare nuevo public.rol_usuario := (p_datos->>'rol')::public.rol_usuario;
begin
  if not app.es_admin() then raise exception 'Solo administración' using errcode = '42501'; end if;
  -- Nadie sin rol Sistemas puede crear ni tocar cuentas de Sistemas.
  if not app.es_sistemas() and (nuevo = 'sistemas' or exists (select 1 from perfiles where id = p_id and rol = 'sistemas')) then
    raise exception 'Solo Sistemas puede gestionar cuentas de Sistemas' using errcode = '42501';
  end if;
  update perfiles set nombres = coalesce(p_datos->>'nombres', nombres), apellidos = coalesce(p_datos->>'apellidos', apellidos),
    ci = coalesce(p_datos->>'ci', ci), celular = coalesce(p_datos->>'celular', celular), email = coalesce(p_datos->>'email', email),
    rol = coalesce(nuevo, rol), activo = coalesce((p_datos->>'activo')::boolean, activo) where id = p_id;
end $$;

-- A quién puede buscar cada persona para escribirle.
create function public.resumen_admin() returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if app.rol() not in ('sistemas','admin','finanzas','director') then raise exception 'Sin permiso' using errcode = '42501'; end if;
  return jsonb_build_object(
    'estudiantes', (select count(*) from estudiantes where estado = 'activo'),
    'docentes', (select count(*) from perfiles where rol = 'docente' and activo),
    'carreras', (select count(*) from carreras where activa),
    'postulaciones', (select count(*) from postulaciones where estado = 'enviada'),
    'pagos_revision', (select count(*) from pagos where estado = 'revision'),
    'deuda_vencida', coalesce((select sum(monto) from cargos where estado in ('pendiente','en_revision') and vence < current_date), 0),
    'recaudado_mes', coalesce((select sum(monto) from pagos where estado = 'aprobado' and revisado_en >= date_trunc('month', now())), 0));
end $$;

-- ─── Auditoría ─────────────────────────────────────────────────────
create table public.auditoria (
  id bigint generated always as identity primary key,
  actor uuid,
  accion text not null,
  tabla text not null,
  fila text,
  datos jsonb,
  en timestamptz not null default now()
);
create index auditoria_en_idx on public.auditoria(en desc);
alter table public.auditoria enable row level security;
create policy auditoria_leer on public.auditoria for select to authenticated using ((select app.es_admin()));

create function app.auditar() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into auditoria (actor, accion, tabla, fila, datos)
  values (auth.uid(), tg_op, tg_table_name,
    case when tg_op = 'DELETE' then to_jsonb(old)->>tg_argv[0] else to_jsonb(new)->>tg_argv[0] end,
    case tg_op when 'INSERT' then jsonb_build_object('nuevo', to_jsonb(new))
               when 'DELETE' then jsonb_build_object('anterior', to_jsonb(old))
               else jsonb_build_object('anterior', to_jsonb(old), 'nuevo', to_jsonb(new)) end);
  return coalesce(new, old);
end $$;
create trigger aud_notas after update or delete on public.notas for each row execute function app.auditar('estudiante_id');
create trigger aud_finales after insert or update or delete on public.notas_finales for each row execute function app.auditar('inscripcion_id');
create trigger aud_pagos after update on public.pagos for each row execute function app.auditar('id');
create trigger aud_cargos after update or delete on public.cargos for each row execute function app.auditar('id');
create trigger aud_postulaciones after update of estado on public.postulaciones for each row execute function app.auditar('id');
create trigger aud_rol after update of rol, activo on public.perfiles for each row execute function app.auditar('id');
