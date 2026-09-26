-- Fase 3 · 4/5 — sair do casal, apagar o espaço, cancelar convite.
--
-- Spec: .agent/Tasks/fase-3-configuracoes.md, R22, R22a, R23, I9–I11 e seção 5
--       (migration 4)
--
-- Três portas novas `security definer` em `public`, cada uma com o mínimo:
-- `couple_members` e `couple_invites` não têm policy de escrita, e não ganham
-- uma — uma policy não restringe QUAIS colunas mudam, e a de UPDATE em
-- `couple_invites` deixaria o cliente reescrever `code` ou `accepted_at`.
--
-- E `accept_invite` é recriada: o slot passa a ser o LIVRE (depois que alguém
-- sai, a vaga pode ser a 1), e o ajuste de cor usa a paleta do design.

-- ---------------------------------------------------------------------------
-- leave_couple — a pessoa sai; o acervo fica (I9). Convite aberto é revogado
-- na mesma transação: convite é da pessoa convidada, não da vaga (I11). Quem
-- fica convida de novo, explicitamente.
--
-- As estadias de quem saiu continuam no casal com o profile_id dele. A
-- derivação só considera os membros atuais, então esses dias viram `unknown`
-- para quem fica — honesto, e reversível: nada foi apagado.
-- ---------------------------------------------------------------------------
create function public.leave_couple()
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

  -- Trava o casal: sair e aceitar convite ao mesmo tempo não podem se cruzar.
  perform 1 from public.couples where id = v_couple for update;

  delete from public.couple_members where couple_id = v_couple and profile_id = v_uid;

  if not exists (select 1 from public.couple_members where couple_id = v_couple) then
    -- Ninguém para ficar com o acervo: sair é apagar.
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
-- delete_couple — apaga o casal e tudo que é dele, por cascade: membros,
-- estadias, convites, preferências, cidades salvas. Perfis, fotos de perfil e
-- contas ficam (I9).
--
-- Os ARQUIVOS de couple-media/<couple_id>/ não saem daqui: o Storage recusa
-- delete direto em storage.objects. O cliente apaga a pasta ANTES de chamar
-- (spec, seção 7): se a RPC falhar depois, o casal perdeu só a capa.
-- ---------------------------------------------------------------------------
create function public.delete_couple()
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

  delete from public.couples where id = v_couple;
  return jsonb_build_object('status', 'deleted');
end;
$$;

-- ---------------------------------------------------------------------------
-- cancel_invite — revoga o convite aberto do casal de quem chama. O código
-- deixa de resolver na hora (lookup e accept tratam revogado como inexistente).
-- ---------------------------------------------------------------------------
create function public.cancel_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_couple uuid;
  v_count  integer;
begin
  if v_uid is null then
    raise exception 'cancel_invite sem sessão' using errcode = '42501';
  end if;

  select couple_id into v_couple from public.couple_members where profile_id = v_uid;
  if v_couple is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  update public.couple_invites
     set revoked_at = now()
   where couple_id = v_couple and accepted_at is null and revoked_at is null;
  get diagnostics v_count = row_count;

  if v_count = 0 then
    return jsonb_build_object('status', 'none_open');
  end if;
  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invite — igual à da Fase 2 (20260926120200), exceto: o slot é o livre,
-- e o ajuste de cor (I10 da Fase 2, I4 da 3) usa DEFAULT_COLOR_BY_SLOT.
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

-- O Postgres concede EXECUTE a PUBLIC por padrão; sem o revoke, anon chama.
revoke execute on function public.leave_couple()  from public, anon;
revoke execute on function public.delete_couple() from public, anon;
revoke execute on function public.cancel_invite() from public, anon;
grant  execute on function public.leave_couple()  to authenticated;
grant  execute on function public.delete_couple() to authenticated;
grant  execute on function public.cancel_invite() to authenticated;
