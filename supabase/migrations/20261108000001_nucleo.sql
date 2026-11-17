-- USFX Virtual · núcleo: identidad, roles, estructura académica.
-- Regla general: la seguridad vive aquí (RLS y funciones), nunca solo en la interfaz.

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create type public.rol_usuario as enum ('sistemas','admin','finanzas','director','docente','estudiante','postulante');
create type public.modalidad as enum ('modular','semestral','anual');

create table public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  usuario text not null unique,
  nombres text not null default '',
  apellidos text not null default '',
  ci text,
  celular text,
  email text,
  foto_path text,
  rol public.rol_usuario not null default 'postulante',
  activo boolean not null default true,
  debe_cambiar_clave boolean not null default false,
  creado_en timestamptz not null default now(),
  busqueda text generated always as (lower(usuario || ' ' || nombres || ' ' || apellidos || ' ' || coalesce(ci,''))) stored
);
create index perfiles_rol_idx on public.perfiles(rol) where activo;
create index perfiles_apellidos_idx on public.perfiles(apellidos, nombres);

-- Búsqueda rápida por nombre si la extensión existe (en Supabase sí).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_trgm') then
    create extension if not exists pg_trgm;
    execute 'create index perfiles_busqueda_trgm on public.perfiles using gin (busqueda gin_trgm_ops)';
  end if;
end $$;

-- Ayudantes de permisos. STABLE + (select ...) en las políticas: se evalúan una vez por consulta.
create function app.rol() returns public.rol_usuario language sql stable security definer set search_path = public, pg_temp as
  $$ select rol from perfiles where id = auth.uid() and activo $$;
create function app.es_admin() returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select coalesce(app.rol() in ('sistemas','admin'), false) $$;
create function app.es_sistemas() returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select coalesce(app.rol() = 'sistemas', false) $$;
create function app.es_finanzas() returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select coalesce(app.rol() in ('sistemas','admin','finanzas'), false) $$;

-- Una cuenta nueva siempre nace como postulante. El rol solo se puede fijar con
-- app_metadata, que únicamente la clave de servicio puede escribir.
create function app.nuevo_usuario() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.rol_usuario := coalesce((new.raw_app_meta_data->>'rol')::public.rol_usuario, 'postulante');
begin
  insert into perfiles (id, usuario, nombres, apellidos, ci, celular, email, rol, debe_cambiar_clave)
  values (new.id,
    lower(split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'nombres',''),
    coalesce(new.raw_user_meta_data->>'apellidos',''),
    new.raw_user_meta_data->>'ci',
    new.raw_user_meta_data->>'celular',
    new.raw_user_meta_data->>'correo',
    r,
    coalesce((new.raw_app_meta_data->>'debe_cambiar_clave')::boolean, false));
  return new;
end $$;
create trigger al_crear_usuario after insert on auth.users for each row execute function app.nuevo_usuario();

alter table public.perfiles enable row level security;
create policy perfil_propio on public.perfiles for select to authenticated
  using (id = (select auth.uid()) or (select app.rol()) in ('sistemas','admin','finanzas','director'));
create policy perfil_editar_propio on public.perfiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Configuración institucional editable sin tocar código.
create table public.configuracion (
  clave text primary key,
  valor jsonb not null,
  descripcion text
);
insert into public.configuracion values
  ('nota_minima', '51', 'Nota mínima de aprobación sobre 100'),
  ('bloquear_notas_por_deuda', 'true', 'Ocultar notas y kardex a quien tenga cargos vencidos'),
  ('exigir_matricula_para_inscribir', 'true', 'Exigir matrícula pagada para inscribir materias'),
  ('monto_matricula', '350', 'Monto de matrícula en bolivianos (revisar)'),
  ('asistencia_minima', '75', 'Porcentaje mínimo de asistencia'),
  ('instrucciones_pago', '"Paga por QR o transferencia a la cuenta institucional y adjunta tu comprobante."', 'Texto que ve el estudiante en Matrícula y pagos');
alter table public.configuracion enable row level security;
create policy config_leer on public.configuracion for select to authenticated using (true);
create policy config_editar on public.configuracion for all to authenticated
  using ((select app.es_sistemas())) with check ((select app.es_sistemas()));
create function app.config(k text) returns jsonb language sql stable security definer set search_path = public, pg_temp as
  $$ select valor from configuracion where clave = k $$;

-- Estructura académica
create table public.facultades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique
);
create table public.carreras (
  id uuid primary key default gen_random_uuid(),
  facultad_id uuid references public.facultades(id),
  codigo text not null unique,
  nombre text not null,
  modalidad public.modalidad not null default 'semestral',
  duracion_periodos int not null default 10,
  director_id uuid references public.perfiles(id),
  activa boolean not null default true
);
create index carreras_director_idx on public.carreras(director_id);
create table public.materias (
  id uuid primary key default gen_random_uuid(),
  carrera_id uuid not null references public.carreras(id) on delete cascade,
  sigla text not null,
  nombre text not null,
  creditos int not null default 4,
  nivel int not null default 1,
  unique (carrera_id, sigla)
);
create table public.prerrequisitos (
  materia_id uuid references public.materias(id) on delete cascade,
  requisito_id uuid references public.materias(id) on delete cascade,
  primary key (materia_id, requisito_id)
);
-- Un periodo define la modalidad: un mes por materia (modular), semestre o año.
create table public.periodos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  modalidad public.modalidad not null,
  inicio date not null,
  fin date not null,
  inscripcion_desde date not null,
  inscripcion_hasta date not null,
  activo boolean not null default true,
  check (fin >= inicio), check (inscripcion_hasta >= inscripcion_desde)
);
create table public.ofertas (
  id uuid primary key default gen_random_uuid(),
  materia_id uuid not null references public.materias(id),
  periodo_id uuid not null references public.periodos(id),
  paralelo text not null default 'A',
  docente_id uuid references public.perfiles(id),
  cupo int not null default 60 check (cupo > 0),
  inscritos int not null default 0 check (inscritos >= 0),
  enlace_clase text,
  acta_cerrada boolean not null default false,
  acta_cerrada_en timestamptz,
  unique (materia_id, periodo_id, paralelo)
);
create index ofertas_docente_idx on public.ofertas(docente_id);
create index ofertas_periodo_idx on public.ofertas(periodo_id);
create table public.horarios (
  id uuid primary key default gen_random_uuid(),
  oferta_id uuid not null references public.ofertas(id) on delete cascade,
  dia int not null check (dia between 1 and 7),
  inicio time not null,
  fin time not null,
  check (fin > inicio)
);
create index horarios_oferta_idx on public.horarios(oferta_id);

create sequence public.codigo_estudiante_seq start 1;
create table public.estudiantes (
  id uuid primary key references public.perfiles(id) on delete cascade,
  codigo text not null unique,
  carrera_id uuid not null references public.carreras(id),
  gestion_ingreso int not null default extract(year from now()),
  estado text not null default 'activo' check (estado in ('activo','suspendido','egresado'))
);
create index estudiantes_carrera_idx on public.estudiantes(carrera_id) where estado = 'activo';
create function app.nuevo_codigo() returns text language sql volatile set search_path = public, pg_temp as
  $$ select extract(year from now())::text || lpad(nextval('public.codigo_estudiante_seq')::text, 6, '0') $$;

create table public.docentes (
  id uuid primary key references public.perfiles(id) on delete cascade,
  titulo text,
  especialidad text,
  biografia text,
  cv_path text,
  enlace_profesional text
);
create table public.cv_items (
  id uuid primary key default gen_random_uuid(),
  docente_id uuid not null references public.docentes(id) on delete cascade,
  tipo text not null check (tipo in ('formacion','experiencia','publicacion','certificacion')),
  titulo text not null,
  institucion text,
  desde date,
  hasta date,
  archivo_path text
);
create index cv_items_docente_idx on public.cv_items(docente_id);

create table public.inscripciones (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes(id) on delete cascade,
  oferta_id uuid not null references public.ofertas(id),
  estado text not null default 'inscrito' check (estado in ('inscrito','retirado')),
  creado_en timestamptz not null default now(),
  unique (estudiante_id, oferta_id)
);
create index inscripciones_oferta_idx on public.inscripciones(oferta_id) where estado = 'inscrito';

create function app.dicta(o uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select exists (select 1 from ofertas where id = o and docente_id = auth.uid()) $$;
create function app.inscrito(o uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select exists (select 1 from inscripciones where oferta_id = o and estudiante_id = auth.uid() and estado = 'inscrito') $$;
create function app.dirige_oferta(o uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select exists (select 1 from ofertas f join materias m on m.id = f.materia_id join carreras c on c.id = m.carrera_id
                    where f.id = o and c.director_id = auth.uid()) $$;
create function app.gestiona_oferta(o uuid) returns boolean language sql stable security definer set search_path = public, pg_temp as
  $$ select app.es_admin() or app.dicta(o) or app.dirige_oferta(o) $$;

alter table public.facultades enable row level security;
alter table public.carreras enable row level security;
alter table public.materias enable row level security;
alter table public.prerrequisitos enable row level security;
alter table public.periodos enable row level security;
alter table public.ofertas enable row level security;
alter table public.horarios enable row level security;
alter table public.estudiantes enable row level security;
alter table public.docentes enable row level security;
alter table public.cv_items enable row level security;
alter table public.inscripciones enable row level security;

-- El catálogo académico lo puede leer cualquier usuario autenticado; solo administración lo edita.
do $$ declare t text; begin
  foreach t in array array['facultades','carreras','materias','prerrequisitos','periodos','ofertas','horarios'] loop
    execute format('create policy %1$s_leer on public.%1$s for select to authenticated using (true)', t);
    execute format('create policy %1$s_editar on public.%1$s for all to authenticated using ((select app.es_admin())) with check ((select app.es_admin()))', t);
  end loop;
end $$;
-- El docente edita solo el enlace de clase de sus materias, y el director los horarios de su carrera.
create policy ofertas_docente on public.ofertas for update to authenticated
  using (docente_id = (select auth.uid())) with check (docente_id = (select auth.uid()));
create policy horarios_director on public.horarios for all to authenticated
  using (app.dirige_oferta(oferta_id)) with check (app.dirige_oferta(oferta_id));

create policy estudiantes_leer on public.estudiantes for select to authenticated
  using (id = (select auth.uid()) or (select app.rol()) in ('sistemas','admin','finanzas','director'));
create policy estudiantes_editar on public.estudiantes for all to authenticated
  using ((select app.es_admin())) with check ((select app.es_admin()));

-- Hoja de vida del docente: pública dentro de la plataforma, editable por su dueño.
create policy docentes_leer on public.docentes for select to authenticated using (true);
create policy docentes_editar on public.docentes for all to authenticated
  using (id = (select auth.uid()) or (select app.es_admin())) with check (id = (select auth.uid()) or (select app.es_admin()));
create policy cv_leer on public.cv_items for select to authenticated using (true);
create policy cv_editar on public.cv_items for all to authenticated
  using (docente_id = (select auth.uid()) or (select app.es_admin())) with check (docente_id = (select auth.uid()) or (select app.es_admin()));

create policy inscripciones_leer on public.inscripciones for select to authenticated
  using (estudiante_id = (select auth.uid()) or app.gestiona_oferta(oferta_id) or (select app.rol()) = 'finanzas');

-- Catálogo con nombres. Vista del propietario a propósito: muestra el nombre del
-- docente sin abrir la tabla de perfiles (CI, celular, etc.).
create view public.v_ofertas with (security_barrier = true) as
  select f.id, f.materia_id, f.periodo_id, f.paralelo, f.docente_id, f.cupo, f.inscritos,
         case when app.inscrito(f.id) or app.gestiona_oferta(f.id) then f.enlace_clase end as enlace_clase, f.acta_cerrada,
         m.sigla, m.nombre as materia, m.creditos, m.nivel, m.carrera_id, c.nombre as carrera, c.codigo as carrera_codigo,
         p.nombre as periodo, p.modalidad, p.inicio, p.fin, p.inscripcion_desde, p.inscripcion_hasta,
         nullif(trim(d.nombres || ' ' || d.apellidos), '') as docente,
         d.foto_path as docente_foto
  from public.ofertas f
  join public.materias m on m.id = f.materia_id
  join public.carreras c on c.id = m.carrera_id
  join public.periodos p on p.id = f.periodo_id
  left join public.perfiles d on d.id = f.docente_id;

-- Directorio mínimo de docentes para el catálogo (sin datos personales sensibles).
create view public.v_docentes with (security_barrier = true) as
  select d.id, p.nombres, p.apellidos, p.foto_path, d.titulo, d.especialidad, d.biografia, d.cv_path, d.enlace_profesional
  from public.docentes d join public.perfiles p on p.id = d.id where p.activo;
