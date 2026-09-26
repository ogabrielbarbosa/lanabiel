-- Endurecimento apontado pelos advisors do Supabase depois da Fase 0 subir.
-- Migração à parte, e não edição das anteriores: as de cima já estão aplicadas
-- no remoto, e histórico aplicado não se reescreve.
--
-- 1) `btree_gist` estava em `public` (lint extension_in_public). Extensão em
--    schema exposto entra na API e pode colidir com objeto nosso.
-- 2) `my_couple_ids` em `public` fica publicada como endpoint REST
--    (/rest/v1/rpc/my_couple_ids) — lint
--    authenticated_security_definer_function_executable. A função PRECISA do
--    grant para `authenticated`, porque expressão de policy é avaliada com as
--    permissões de quem consulta; o que não precisa é estar num schema exposto.
--    Mover para `private` mantém as policies funcionando e tira o endpoint.

create schema if not exists private;
grant usage on schema private to authenticated;

alter extension btree_gist set schema extensions;

create function private.my_couple_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select couple_id from public.couple_members where profile_id = (select auth.uid());
$$;

revoke execute on function private.my_couple_ids() from public, anon;
grant  execute on function private.my_couple_ids() to authenticated;

-- Policies não se substituem, só se recriam.
drop policy "couples_select_member"           on public.couples;
drop policy "couples_update_member"           on public.couples;
drop policy "profiles_select_self_or_partner" on public.profiles;
drop policy "couple_members_select_member"    on public.couple_members;
drop policy "stays_all_couple_member"         on public.stays;

create policy "couples_select_member" on public.couples
  for select to authenticated
  using (id in (select private.my_couple_ids()));

create policy "couples_update_member" on public.couples
  for update to authenticated
  using      (id in (select private.my_couple_ids()))
  with check (id in (select private.my_couple_ids()));

create policy "profiles_select_self_or_partner" on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or id in (
      select cm.profile_id from public.couple_members cm
      where cm.couple_id in (select private.my_couple_ids())
    )
  );

create policy "couple_members_select_member" on public.couple_members
  for select to authenticated
  using (
    profile_id = (select auth.uid())
    or couple_id in (select private.my_couple_ids())
  );

create policy "stays_all_couple_member" on public.stays
  for all to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

drop function public.my_couple_ids();
