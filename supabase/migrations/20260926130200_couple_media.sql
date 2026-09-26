-- Fase 3 · 3/5 — mídia do casal, em bucket próprio com pasta por casal.
--
-- Spec: .agent/Tasks/fase-3-configuracoes.md, R6 e seção 5 (migration 3)
-- ADR:  .agent/Decisions/0012-midia-do-casal-em-bucket-por-casal.md
--
-- `avatars` (ADR 0009) é por PESSOA: a pasta é o auth.uid() do dono, porque a
-- foto nasce antes do casal. A foto do casal — e, nas Fases 4 e 6, as das
-- memórias e das viagens — é do CASAL: se ficasse na pasta de quem subiu, a
-- outra pessoa a perderia no dia em que essa saísse do casal.
--
-- Caminho: <couple_id>/<tipo>/<uuid>.webp. Nesta fase só `cover`. O uuid novo
-- por upload impede o cache de servir a capa antiga.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('couple-media', 'couple-media', false, 5242880, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A mesma private.my_couple_ids() que corta as tabelas corta o arquivo. Os dois
-- integrantes leem, sobem, trocam e apagam — inclusive o `delete` que a Zona
-- sensível faz ANTES de `delete_couple` (o Storage recusa apagar por SQL).
create policy "couple_media_select_member" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'couple-media'
    and (storage.foldername(name))[1] in (select c::text from private.my_couple_ids() c)
  );

create policy "couple_media_insert_member" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'couple-media'
    and (storage.foldername(name))[1] in (select c::text from private.my_couple_ids() c)
  );

create policy "couple_media_update_member" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'couple-media'
    and (storage.foldername(name))[1] in (select c::text from private.my_couple_ids() c)
  )
  with check (
    bucket_id = 'couple-media'
    and (storage.foldername(name))[1] in (select c::text from private.my_couple_ids() c)
  );

create policy "couple_media_delete_member" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'couple-media'
    and (storage.foldername(name))[1] in (select c::text from private.my_couple_ids() c)
  );

-- A capa aponta para a pasta do próprio casal, e só para a de capas. Um caminho
-- fora dela apontaria para arquivo de outro casal — que a policy nem deixaria ler.
alter table public.couples
  add column cover_path text,
  add constraint couples_cover_in_own_folder
    check (cover_path is null or cover_path like id::text || '/cover/%');
