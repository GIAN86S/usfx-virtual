// Postgres embebido (PGlite) con los esquemas que Supabase da hechos: auth, storage y realtime.
// Solo para pruebas y modo demo. Ejecuta las MISMAS migraciones que producción, con RLS real.
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));

const STUB = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;
alter default privileges in schema public grant execute on functions to service_role;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, encrypted_password text,
  raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt()->>'sub','')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid default auth.uid(), mime text, unique (bucket_id, name));
alter table storage.objects enable row level security;
grant usage on schema storage to authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
grant all on storage.objects, storage.buckets to service_role;

create schema realtime;
create table realtime.messages (id bigserial primary key, topic text, evento text, payload jsonb, privado boolean, en timestamptz default now());
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic', true) $$;
create function realtime.send(payload jsonb, event text, topic text, private boolean default true) returns void
  language sql security definer as $$ insert into realtime.messages (topic, evento, payload, privado) values (topic, event, payload, private) $$;
grant usage on schema realtime to authenticated, service_role;
grant select on realtime.messages to authenticated;
grant execute on all functions in schema realtime to authenticated;
`;

export async function crearDB(dataDir) {
  const db = new PGlite(dataDir, { extensions: { pg_trgm } });
  await db.waitReady;
  const ya = await db.query(`select to_regclass('public.perfiles') as t`);
  if (ya.rows[0].t) return db;
  await db.exec(STUB);
  const dir = join(AQUI, '..', 'supabase', 'migrations');
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), 'utf8'));
  return db;
}

// Ejecuta como un usuario real: rol "authenticated" con su JWT, como hace PostgREST.
export async function como(db, uid, fn, rol = uid ? 'authenticated' : 'anon') {
  return db.transaction(async (tx) => {
    const claims = JSON.stringify(uid ? { sub: uid, role: rol } : { role: rol });
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
    await tx.exec(`set local role ${rol}`);
    return fn(tx);
  });
}

// Crea una cuenta tal como lo haría Supabase Auth.
export async function crearUsuario(db, usuario, { rol, nombres = '', apellidos = '', clave = '', ci, celular, debe_cambiar_clave = false } = {}) {
  const r = await db.query(
    `insert into auth.users (email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values ($1,$2,$3,$4) returning id`,
    [`${usuario}@usuarios.usfx.invalid`, clave, JSON.stringify(rol ? { rol, debe_cambiar_clave } : {}), JSON.stringify({ nombres, apellidos, ci, celular })]);
  return r.rows[0].id;
}
