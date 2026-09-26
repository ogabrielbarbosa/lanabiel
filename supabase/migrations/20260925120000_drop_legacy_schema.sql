-- Derruba o schema anterior por inteiro. As seis tabelas tinham ZERO linhas
-- (verificado em 2026-09-25) e o drop foi autorizado explicitamente.
--
-- O SQL do schema antigo NÃO se perde: ele continua em
-- supabase_migrations.schema_migrations, que vive em outro schema e não é
-- afetada por isto. Ver supabase/baseline/README.md — inclusive o que foi
-- aproveitado dele e o que foi descartado.
--
-- Num banco novo (supabase db reset) nada disto existe e o arquivo é no-op.

drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.join_couple(text) cascade;
drop function if exists public.create_couple(text) cascade;
drop function if exists public.my_couple_ids() cascade;

drop policy if exists "mementos_storage_select_couple_member" on storage.objects;
drop policy if exists "mementos_storage_insert_couple_member" on storage.objects;
drop policy if exists "mementos_storage_delete_couple_member" on storage.objects;
-- O bucket `mementos` NÃO é removido aqui: o Supabase bloqueia DML direto em
-- storage.objects/buckets ("Direct deletion from storage tables is not
-- allowed"), e removê-lo exigiria a Storage API. Ele fica: está vazio, é
-- privado, e sem as policies acima ninguém alcança nada dentro dele. A Fase 4
-- define os buckets que vai usar de fato.

drop table if exists public.mementos        cascade;
drop table if exists public.calendar_events cascade;
drop table if exists public.places          cascade;
drop table if exists public.couple_members  cascade;
drop table if exists public.couples         cascade;
drop table if exists public.profiles        cascade;
