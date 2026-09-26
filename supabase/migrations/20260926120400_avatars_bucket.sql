-- Fase 2 · 5/5 — fotos de perfil.
--
-- Spec: .agent/Tasks/fase-2-onboarding.md, seção 5 (migration 5) e A16
-- ADR:  .agent/Decisions/0009-fotos-em-bucket-privado-por-casal.md
--
-- Bucket privado. A pasta é o auth.uid() do dono — e não o couple_id, porque a
-- foto nasce no passo 1 do onboarding, quando ainda não há casal.
-- Caminho: <auth.uid()>/<uuid aleatório>.webp. O nome aleatório impede o cache
-- de servir a foto antiga depois de uma troca.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Escrita: só na própria pasta. Funciona antes de haver perfil ou casal.
create policy "avatars_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "avatars_update_own_folder" on storage.objects
  for update to authenticated
  using      (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_delete_own_folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Leitura: a própria pasta, ou a de quem divide casal. A mesma
-- private.my_couple_ids() que corta as tabelas corta o arquivo — não nasce uma
-- segunda definição de "quem é do casal".
create policy "avatars_select_self_or_partner" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (storage.foldername(name))[1] in (
        select cm.profile_id::text from public.couple_members cm
        where cm.couple_id in (select private.my_couple_ids())
      )
    )
  );
