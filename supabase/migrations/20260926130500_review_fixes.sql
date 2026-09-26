-- Fase 3 · ajuste — achados da revisão (ledger, "Revisão").
--
-- Spec: .agent/Tasks/fase-3-configuracoes.md, I4, I10, seção 7
--
-- 1) `profiles_color_distinct` passa o nome da regra no HINT. O
--    `constraint = …` do RAISE não chega ao cliente pelo PostgREST (só code,
--    message, details e hint), e a tela precisa distinguir "a outra pessoa
--    acabou de escolher essa cor" de um CHECK qualquer.
-- 2) A mesma função pega uma trava transacional por casal: sem ela, os dois
--    escolhendo a mesma cor no mesmo instante passam os dois pela checagem —
--    cada um não enxerga o UPDATE ainda não commitado do outro (I4).
-- 3) `accept_invite` trava o casal (FOR SHARE) contra `leave_couple`.

create or replace function private.profiles_color_distinct()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_couple uuid;
begin
  select couple_id into v_couple from public.couple_members where profile_id = new.id;
  if v_couple is null then
    return new;
  end if;

  -- Serializa as trocas de cor dentro do casal até o fim da transação. Depois
  -- de esperar, a consulta abaixo (nova, em READ COMMITTED) já vê a cor que o
  -- outro gravou.
  perform pg_advisory_xact_lock(hashtext('profiles_color:' || v_couple::text));

  if exists (
    select 1
      from public.couple_members other
      join public.profiles p on p.id = other.profile_id
     where other.couple_id = v_couple
       and other.profile_id <> new.id
       and p.color = new.color
  ) then
    raise exception 'a outra pessoa do casal já usa a cor %', new.color
      using errcode = '23514', constraint = 'profiles_color_taken', hint = 'profiles_color_taken';
  end if;
  return new;
end;
$$;

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
    -- FOR UPDATE serializa dois aceites do mesmo convite: o segundo espera o
    -- commit do primeiro e relê a linha já com accepted_at (I2 da Fase 2).
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

  -- Trava o casal contra `leave_couple`, que o trava FOR UPDATE: sem isto,
  -- o último integrante sai (e o casal é apagado) entre a checagem acima e o
  -- INSERT abaixo, e quem aceita recebe um 23503 cru em vez de uma recusa.
  perform 1 from public.couples where id = v_invite.couple_id for share;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  -- Refeita depois da trava: alguém pode ter saído enquanto esperávamos.
  v_refusal := private.invite_refusal(v_uid, v_invite);
  if v_refusal is not null then
    return v_refusal;
  end if;

  -- A vaga: quem ficou pode ser o slot 2, depois que o 1 saiu (leave_couple).
  -- `invite_refusal` já garantiu que há exatamente um integrante.
  select slot into v_taken_slot from public.couple_members where couple_id = v_invite.couple_id;

  begin
    insert into public.couple_members (couple_id, profile_id, slot)
    values (v_invite.couple_id, v_uid, (3 - coalesce(v_taken_slot, 1))::smallint);
  exception when unique_violation then
    -- Rede de segurança: com o FOR UPDATE nenhum dos dois devia acontecer.
    -- slot ocupado = alguém entrou por outro caminho; profile ocupado = esta
    -- pessoa entrou noutro casal numa transação paralela.
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'couple_members_one_couple_per_profile' then
      return jsonb_build_object('status', 'already_member', 'couple_name', null);
    end if;
    return jsonb_build_object(
      'status', 'used',
      'couple_name', (select name from public.couples where id = v_invite.couple_id)
    );
  end;

  -- As duas faixas do calendário precisam se distinguir. O trigger
  -- profiles_color_distinct recusaria a cor igual numa edição; aqui quem entra
  -- recebe a outra cor padrão.
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
