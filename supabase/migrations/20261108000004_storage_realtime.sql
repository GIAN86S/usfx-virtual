-- Archivos privados: todos los buckets exigen sesión y se sirven con enlaces firmados.
-- La ruta define el permiso: <usuario>/..., <oferta>/..., <conversacion>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('postulaciones', 'postulaciones', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('comprobantes',  'comprobantes',  false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('perfiles',      'perfiles',      false, 20971520, null),
  ('materiales',    'materiales',    false, 2147483648, null),
  ('chat',          'chat',          false, 104857600, null)
on conflict (id) do nothing;

create function app.primer_uuid(ruta text) returns uuid language plpgsql immutable as $$
begin
  return split_part(ruta, '/', 1)::uuid;
exception when others then return null;
end $$;

create policy post_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'postulaciones' and app.primer_uuid(name) = (select auth.uid()));
create policy post_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'postulaciones' and app.primer_uuid(name) = (select auth.uid()));
create policy post_ver on storage.objects for select to authenticated
  using (bucket_id = 'postulaciones' and (app.primer_uuid(name) = (select auth.uid()) or (select app.es_admin())));

create policy comp_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'comprobantes' and app.primer_uuid(name) = (select auth.uid()));
create policy comp_ver on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and (app.primer_uuid(name) = (select auth.uid()) or (select app.es_finanzas())));

create policy perf_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'perfiles' and app.primer_uuid(name) = (select auth.uid()));
create policy perf_cambiar on storage.objects for update to authenticated
  using (bucket_id = 'perfiles' and app.primer_uuid(name) = (select auth.uid()));
create policy perf_ver on storage.objects for select to authenticated using (bucket_id = 'perfiles');

create policy mat_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'materiales' and app.gestiona_oferta(app.primer_uuid(name)));
create policy mat_borrar on storage.objects for delete to authenticated
  using (bucket_id = 'materiales' and app.gestiona_oferta(app.primer_uuid(name)));
create policy mat_ver on storage.objects for select to authenticated
  using (bucket_id = 'materiales' and (app.gestiona_oferta(app.primer_uuid(name)) or app.inscrito(app.primer_uuid(name))));

create policy chat_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and app.puede_publicar(app.primer_uuid(name)));
create policy chat_ver on storage.objects for select to authenticated
  using (bucket_id = 'chat' and app.miembro(app.primer_uuid(name)));

-- Canal privado por conversación: solo sus miembros reciben los mensajes en vivo.
create policy conv_tiempo_real on realtime.messages for select to authenticated
  using (realtime.topic() like 'conv:%' and app.miembro(app.primer_uuid(substr(realtime.topic(), 6))));
