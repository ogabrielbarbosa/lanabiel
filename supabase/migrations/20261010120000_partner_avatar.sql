-- Trocar a foto da outra pessoa do casal, nas Configurações.
--
-- ADR: .agent/Decisions/0028-foto-da-outra-pessoa.md (estende o 0009)
--
-- A foto continua na pasta do DONO do perfil (`profiles_avatar_in_own_folder`
-- não muda): quem troca a foto da outra pessoa sobe em `<id dela>/<uuid>`.
-- Para isso o bucket passa a aceitar escrita na pasta de quem divide casal —
-- só `insert`: nome aleatório e `upsert: false`, então ninguém sobrescreve nem
-- apaga o arquivo do outro. O `avatar_path` dela é gravado por RPC, porque
-- `profiles_update_self` (que fica como está) só deixa cada um mexer no próprio.

create policy "avatars_insert_partner_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] in (
      select cm.profile_id::text from public.couple_members cm
      where cm.couple_id in (select private.my_couple_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- set_partner_avatar — grava a foto da outra pessoa do casal de quem chama.
-- Vale para quem tem conta e para o perfil provisório (ADR 0024).
-- ---------------------------------------------------------------------------
create function public.set_partner_avatar(p_profile_id uuid, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_couple uuid;
begin
  if v_uid is null then
    raise exception 'set_partner_avatar sem sessão' using errcode = '42501';
  end if;

  select couple_id into v_couple from public.couple_members where profile_id = v_uid;
  if v_couple is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  -- A própria foto vai por `profiles_update_self`; aqui é só a da outra pessoa.
  if p_profile_id = v_uid
     or not exists (select 1 from public.couple_members where couple_id = v_couple and profile_id = p_profile_id) then
    return jsonb_build_object('status', 'not_partner');
  end if;

  -- O arquivo tem de existir, na pasta dela. Sem isso a coluna apontaria para
  -- um caminho qualquer e a tela mostraria iniciais sem dizer por quê.
  if p_path is null
     or p_path not like p_profile_id::text || '/%'
     or not exists (select 1 from storage.objects where bucket_id = 'avatars' and name = p_path) then
    return jsonb_build_object('status', 'invalid');
  end if;

  update public.profiles set avatar_path = p_path where id = p_profile_id;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.set_partner_avatar(uuid, text) from public, anon;
grant execute on function public.set_partner_avatar(uuid, text) to authenticated;
