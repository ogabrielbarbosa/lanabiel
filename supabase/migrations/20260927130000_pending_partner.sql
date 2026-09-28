-- Perfil provisório da outra pessoa, herdado no aceite do convite.
--
-- Spec: .agent/Tasks/perfil-provisorio.md · ADR 0024
--
-- Um perfil pode existir sem conta: `user_id` nulo é o provisório. Ele entra
-- no slot livre do casal, e com ele Home, Calendário e Viagens abrem para quem
-- está sozinho. No aceite, as referências passam do provisório para quem entra
-- e o provisório é apagado.

-- ---------------------------------------------------------------------------
-- profiles.user_id — a ligação com o Auth sai do id (I1, I7).
-- ---------------------------------------------------------------------------
alter table public.profiles drop constraint profiles_id_fkey;

alter table public.profiles
  add column user_id uuid unique references auth.users(id) on delete cascade,
  add constraint profiles_user_is_id check (user_id is null or user_id = id);

-- Todo perfil que existe até aqui tem conta.
update public.profiles set user_id = id;

-- O insert do onboarding (e o do harness, com service_role) não manda
-- user_id: quem tem conta com este id é dono do perfil. `security definer`
-- porque `authenticated` não lê auth.users.
create function private.profiles_link_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null and exists (select 1 from auth.users where id = new.id) then
    new.user_id := new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_link_user
  before insert on public.profiles
  for each row execute function private.profiles_link_user();

-- user_id nunca muda: senão um cliente viraria o próprio perfil em provisório.
create function private.profiles_user_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'profiles.user_id não muda'
    using errcode = '23514', constraint = 'profiles_user_immutable', hint = 'profiles_user_immutable';
end;
$$;

create trigger profiles_user_immutable
  before update of user_id on public.profiles
  for each row when (new.user_id is distinct from old.user_id)
  execute function private.profiles_user_immutable();

-- Quantos integrantes COM CONTA o casal tem. É o que "casal cheio" conta.
create function private.real_member_count(p_couple uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
    from public.couple_members cm
    join public.profiles p on p.id = cm.profile_id
   where cm.couple_id = p_couple and p.user_id is not null;
$$;

revoke execute on function private.real_member_count(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_pending_partner — cria ou edita o provisório do casal de quem chama.
-- ---------------------------------------------------------------------------
create function public.save_pending_partner(p_display_name text, p_home_city_id uuid, p_color text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_couple   uuid;
  v_name     text := btrim(coalesce(p_display_name, ''));
  v_my_color text;
  v_pending  uuid;
  v_slot     smallint;
begin
  if v_uid is null then
    raise exception 'save_pending_partner sem sessão' using errcode = '42501';
  end if;

  select couple_id into v_couple from public.couple_members where profile_id = v_uid;
  if v_couple is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  -- A mesma trava de leave_couple e accept_invite: editar o provisório no
  -- instante em que ele é herdado não pode se cruzar com o aceite.
  perform 1 from public.couples where id = v_couple for update;

  if private.real_member_count(v_couple) >= 2 then
    return jsonb_build_object('status', 'couple_full');
  end if;

  -- LIMITS.displayName (src/domain/onboarding.ts).
  if char_length(v_name) not between 1 and 30 then
    return jsonb_build_object('status', 'invalid', 'field', 'display_name');
  end if;

  -- Só cidade global (IBGE), a mesma regra da cidade-casa de quem tem conta.
  if not exists (select 1 from public.cities where id = p_home_city_id and couple_id is null) then
    return jsonb_build_object('status', 'invalid', 'field', 'home_city');
  end if;

  select color into v_my_color from public.profiles where id = v_uid;
  if p_color is null
     or p_color not in ('#7FD8C4', '#9CCBF2', '#C3B3F2', '#F4A3B4', '#EDA88A', '#F6E3A1', '#CBE68E')
     or p_color = v_my_color then
    return jsonb_build_object('status', 'invalid', 'field', 'color');
  end if;

  select cm.profile_id into v_pending
    from public.couple_members cm
    join public.profiles p on p.id = cm.profile_id
   where cm.couple_id = v_couple and p.user_id is null;

  if v_pending is not null then
    update public.profiles
       set display_name = v_name, full_name = v_name, home_city_id = p_home_city_id, color = p_color
     where id = v_pending;
    return jsonb_build_object('status', 'updated', 'profile_id', v_pending);
  end if;

  select slot into v_slot from public.couple_members where couple_id = v_couple;

  insert into public.profiles (id, display_name, full_name, home_city_id, color)
  values (gen_random_uuid(), v_name, v_name, p_home_city_id, p_color)
  returning id into v_pending;

  insert into public.couple_members (couple_id, profile_id, slot)
  values (v_couple, v_pending, (3 - v_slot)::smallint);

  return jsonb_build_object('status', 'created', 'profile_id', v_pending);
end;
$$;

revoke execute on function public.save_pending_partner(text, uuid, text) from public, anon;
grant  execute on function public.save_pending_partner(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- invite_refusal — "usado" conta só quem tem conta: o provisório guarda a vaga
-- para quem aceitar.
-- ---------------------------------------------------------------------------
create or replace function private.invite_refusal(p_uid uuid, p_invite public.couple_invites)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_my_couple uuid;
begin
  select couple_id into v_my_couple from public.couple_members where profile_id = p_uid;

  if v_my_couple is not null and v_my_couple = p_invite.couple_id then
    return jsonb_build_object('status', 'own_couple');
  end if;

  if v_my_couple is not null then
    return jsonb_build_object(
      'status', 'already_member',
      'couple_name', (select name from public.couples where id = v_my_couple)
    );
  end if;

  if p_invite.accepted_at is not null
     or private.real_member_count(p_invite.couple_id) >= 2 then
    return jsonb_build_object(
      'status', 'used',
      'couple_name', (select name from public.couples where id = p_invite.couple_id)
    );
  end if;

  if p_invite.expires_at <= now() then
    return jsonb_build_object(
      'status', 'expired',
      'inviter_display_name', (select display_name from public.profiles where id = p_invite.created_by),
      'created_at', p_invite.created_at,
      'expires_at', p_invite.expires_at
    );
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_invite — igual à de 20260926120200, exceto "cheio" contar só conta.
-- ---------------------------------------------------------------------------
create or replace function public.create_invite(p_email text, p_invitee_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_couple   uuid;
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_invitee  text := nullif(btrim(coalesce(p_invitee_name, '')), '');
  v_own      text;
  v_code     text;
  v_invite   public.couple_invites;
  v_attempt  integer := 0;
  v_constraint text;
begin
  if v_uid is null then
    raise exception 'create_invite sem sessão' using errcode = '42501';
  end if;

  select couple_id into v_couple from public.couple_members where profile_id = v_uid;
  if v_couple is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  if private.real_member_count(v_couple) >= 2 then
    return jsonb_build_object('status', 'couple_full');
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('status', 'invalid', 'field', 'email');
  end if;

  if v_invitee is not null and char_length(v_invitee) > 30 then
    return jsonb_build_object('status', 'invalid', 'field', 'invitee_name');
  end if;

  select lower(email) into v_own from auth.users where id = v_uid;
  if v_own = v_email then
    return jsonb_build_object('status', 'own_email');
  end if;

  update public.couple_invites
     set revoked_at = now()
   where couple_id = v_couple and accepted_at is null and revoked_at is null;

  loop
    v_attempt := v_attempt + 1;
    v_code := private.new_invite_code();
    begin
      insert into public.couple_invites (couple_id, code, email, invitee_name, created_by, expires_at)
      values (v_couple, v_code, v_email, v_invitee, v_uid, now() + interval '7 days')
      returning * into v_invite;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint <> 'couple_invites_code_unique' or v_attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'status', 'created',
    'invite_id', v_invite.id,
    'code', v_invite.code,
    'expires_at', v_invite.expires_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invite — igual à de 20260926130500, exceto: com provisório no casal,
-- quem entra herda o slot e toda referência a ele (R5, I3, I4).
-- ---------------------------------------------------------------------------
create or replace function public.accept_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_retry      integer;
  v_code       text;
  v_invite     public.couple_invites;
  v_refusal    jsonb;
  v_my_color   text;
  v_partner    text;
  v_taken_slot smallint;
  v_constraint text;
  v_pending    uuid;
  v_fk         record;
begin
  if v_uid is null then
    raise exception 'accept_invite sem sessão' using errcode = '42501';
  end if;

  v_retry := private.invite_code_retry_after(v_uid);
  if v_retry is not null then
    return jsonb_build_object('status', 'rate_limited', 'retry_after_s', v_retry);
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    return jsonb_build_object('status', 'no_profile');
  end if;

  v_code := private.normalize_invite_code(p_code);
  if v_code is not null then
    select * into v_invite from public.couple_invites where code = v_code for update;
  end if;

  if v_invite.id is null or v_invite.revoked_at is not null then
    insert into private.invite_code_failures (user_id) values (v_uid);
    return jsonb_build_object('status', 'not_found');
  end if;

  v_refusal := private.invite_refusal(v_uid, v_invite);
  if v_refusal is not null then
    return v_refusal;
  end if;

  -- FOR UPDATE (era FOR SHARE): além de leave_couple, agora também
  -- save_pending_partner não pode editar o provisório enquanto ele é herdado.
  perform 1 from public.couples where id = v_invite.couple_id for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_refusal := private.invite_refusal(v_uid, v_invite);
  if v_refusal is not null then
    return v_refusal;
  end if;

  select cm.profile_id into v_pending
    from public.couple_members cm
    join public.profiles p on p.id = cm.profile_id
   where cm.couple_id = v_invite.couple_id and p.user_id is null;

  if v_pending is not null then
    -- 1) O slot primeiro: os gatilhos de integrante das outras tabelas
    --    conferem couple_members, e precisam já ver quem entra.
    begin
      update public.couple_members set profile_id = v_uid where profile_id = v_pending;
    exception when unique_violation then
      return jsonb_build_object('status', 'already_member', 'couple_name', null);
    end;

    -- 2) Toda outra FK de coluna única para profiles, lida do catálogo, para
    --    uma tabela nova não ser esquecida (I4). profile_settings fica de fora:
    --    é 1:1 por perfil, e quem entra já tem a sua.
    for v_fk in
      select c.conrelid::regclass as tbl, a.attname as col
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f'
         and c.confrelid = 'public.profiles'::regclass
         and array_length(c.conkey, 1) = 1
         and c.conrelid not in ('public.couple_members'::regclass, 'public.profile_settings'::regclass)
    loop
      execute format('update %s set %I = $1 where %I = $2', v_fk.tbl, v_fk.col, v_fk.col)
        using v_uid, v_pending;
    end loop;

    -- 3) Sem referência sobrando, o provisório some (leva o profile_settings).
    delete from public.profiles where id = v_pending;
  else
    select slot into v_taken_slot from public.couple_members where couple_id = v_invite.couple_id;

    begin
      insert into public.couple_members (couple_id, profile_id, slot)
      values (v_invite.couple_id, v_uid, (3 - coalesce(v_taken_slot, 1))::smallint);
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'couple_members_one_couple_per_profile' then
        return jsonb_build_object('status', 'already_member', 'couple_name', null);
      end if;
      return jsonb_build_object(
        'status', 'used',
        'couple_name', (select name from public.couples where id = v_invite.couple_id)
      );
    end;
  end if;

  -- As duas faixas do calendário precisam se distinguir: quem entra com a cor
  -- de quem já está recebe a outra cor padrão (R6).
  select color into v_my_color from public.profiles where id = v_uid;
  select p.color into v_partner
    from public.couple_members cm join public.profiles p on p.id = cm.profile_id
   where cm.couple_id = v_invite.couple_id and cm.profile_id <> v_uid;
  if v_partner is not null and v_my_color = v_partner then
    update public.profiles
       set color = case when v_partner = '#F4A3B4' then '#7FD8C4' else '#F4A3B4' end
     where id = v_uid;
  end if;

  update public.couple_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_invite.id;

  return jsonb_build_object('status', 'joined', 'couple_id', v_invite.couple_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- leave_couple — sem mais ninguém COM CONTA, sair é apagar, provisório junto
-- (R7).
-- ---------------------------------------------------------------------------
create or replace function public.leave_couple()
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
    raise exception 'leave_couple sem sessão' using errcode = '42501';
  end if;

  select couple_id into v_couple from public.couple_members where profile_id = v_uid;
  if v_couple is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  perform 1 from public.couples where id = v_couple for update;

  delete from public.couple_members where couple_id = v_couple and profile_id = v_uid;

  if private.real_member_count(v_couple) = 0 then
    perform private.delete_pending_profiles(v_couple);
    delete from public.couples where id = v_couple;
    return jsonb_build_object('status', 'left', 'couple_deleted', true);
  end if;

  update public.couple_invites
     set revoked_at = now()
   where couple_id = v_couple and accepted_at is null and revoked_at is null;

  return jsonb_build_object('status', 'left', 'couple_deleted', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_couple — o provisório não tem conta nem outro casal: vai junto (R8).
-- ---------------------------------------------------------------------------
create or replace function public.delete_couple()
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
    raise exception 'delete_couple sem sessão' using errcode = '42501';
  end if;

  select couple_id into v_couple from public.couple_members where profile_id = v_uid;
  if v_couple is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  perform private.delete_pending_profiles(v_couple);
  delete from public.couples where id = v_couple;
  return jsonb_build_object('status', 'deleted');
end;
$$;

-- Declarada depois das que a chamam: plpgsql só resolve o nome ao executar.
create function private.delete_pending_profiles(p_couple uuid)
returns void
language sql
set search_path = ''
as $$
  delete from public.profiles p
   using public.couple_members cm
   where cm.profile_id = p.id and cm.couple_id = p_couple and p.user_id is null;
$$;

revoke execute on function private.delete_pending_profiles(uuid) from public, anon, authenticated;
