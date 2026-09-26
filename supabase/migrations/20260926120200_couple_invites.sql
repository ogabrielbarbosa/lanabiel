-- Fase 2 · 3/5 — convite como entidade, e as funções que criam casal e entram nele.
--
-- Spec: .agent/Tasks/fase-2-onboarding.md, seções 4, 5, 7, 8 e 9
-- ADR:  .agent/Decisions/0008-convite-portador-e-um-casal-por-pessoa.md
--       .agent/Decisions/0006-email-transacional-por-resend-em-edge-function.md
--
-- Toda falha ESPERADA volta como {status: ...}, nunca como exceção. Exceção
-- fica para o que não devia acontecer, e o cliente distingue as duas.
--
-- Todas as funções públicas são security definer: cada uma é uma porta que
-- não passa por RLS. A lista é fechada (sete), está no ADR 0008, e
-- supabase/tests/onboarding.test.ts (A20) falha se aparecer uma oitava.

-- ---------------------------------------------------------------------------
-- couples.invite_code sai. Um código por casal, sem prazo nem estado, não
-- expressa nenhum dos cinco estados que o design desenhou.
-- ---------------------------------------------------------------------------
alter table public.couples drop column invite_code;

-- ---------------------------------------------------------------------------
-- couple_invites. O ESTADO não é coluna — é derivado, pelo mesmo motivo do
-- ADR 0002:
--   accepted  accepted_at is not null
--   revoked   revoked_at  is not null
--   expired   nenhum dos dois, e expires_at <= now()
--   pending   nenhum dos dois, e expires_at >  now()
-- ---------------------------------------------------------------------------
create table public.couple_invites (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples  (id) on delete cascade,
  code          text not null,
  -- Só para ENVIAR. Nenhum caminho casa convite por e-mail (I4): o e-mail da
  -- sessão é afirmado, não verificado (ADR 0004).
  email         text not null,
  invitee_name  text,
  created_by    uuid not null references public.profiles (id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null,
  accepted_at   timestamptz,
  -- set null: apagar quem aceitou não pode fazer o convite voltar a valer.
  -- accepted_at continua preenchido e continua dizendo "usado".
  accepted_by   uuid references public.profiles (id) on delete set null,
  revoked_at    timestamptz,
  send_count    integer not null default 0,
  last_sent_at  timestamptz,           -- último envio ACEITO pelo provedor (ADR 0006)

  constraint couple_invites_code_format   check (code ~ '^[0-9A-HJKMNP-TV-Z]{6}$'),
  constraint couple_invites_code_unique   unique (code),                  -- I6: nunca reutilizado
  constraint couple_invites_email_format  check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint couple_invites_invitee_len   check (invitee_name is null or char_length(btrim(invitee_name)) between 1 and 30),
  constraint couple_invites_accepted_pair check (accepted_by is null or accepted_at is not null),
  constraint couple_invites_one_outcome   check (accepted_at is null or revoked_at is null)
);

-- I5: um convite ABERTO por casal. Expirado conta como aberto, porque renovar
-- o reabre com o mesmo código.
create unique index couple_invites_one_open_per_couple
  on public.couple_invites (couple_id) where accepted_at is null and revoked_at is null;
create index couple_invites_created_by_idx  on public.couple_invites (created_by);
create index couple_invites_accepted_by_idx on public.couple_invites (accepted_by);

alter table public.couple_invites enable row level security;

-- Membro lê os convites do próprio casal (tela Aguardando). Nenhuma escrita
-- direta: tudo passa pelas funções abaixo. Porta que não existe não precisa
-- de tranca.
create policy "couple_invites_select_member" on public.couple_invites
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- ---------------------------------------------------------------------------
-- Contadores de abuso, em `private` — fora da API.
-- ---------------------------------------------------------------------------
create table private.invite_code_failures (
  user_id  uuid not null,
  at       timestamptz not null default now()
);
create index invite_code_failures_user_at_idx on private.invite_code_failures (user_id, at);

create table private.invite_send_log (
  couple_id  uuid not null,
  invite_id  uuid not null,
  at         timestamptz not null default now()
);
create index invite_send_log_couple_at_idx on private.invite_send_log (couple_id, at);
create index invite_send_log_invite_at_idx on private.invite_send_log (invite_id, at);

revoke all on private.invite_code_failures, private.invite_send_log from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auxiliares privadas. Rodam dentro das funções security definer (como dono),
-- então não precisam de grant para ninguém.
-- ---------------------------------------------------------------------------

-- '7k4-qo2' → '7K4Q02'. Nulo se não sobrar um código válido. É a mesma regra de
-- normalizeInviteCode em src/domain/onboarding.ts.
create function private.normalize_invite_code(p_raw text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when c ~ '^[0-9A-HJKMNP-TV-Z]{6}$' then c end
  from (
    select translate(regexp_replace(upper(coalesce(p_raw, '')), '[[:space:]-]', '', 'g'), 'OIL', '011') as c
  ) s;
$$;

-- 6 bytes aleatórios → 6 caracteres de Crockford. 256 é múltiplo de 32, então
-- `% 32` não enviesa o alfabeto.
create function private.new_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', (get_byte(b, i) % 32) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(6) as b) r, generate_series(0, 5) as i;
$$;

-- Hoje no fuso do casal. `started_on` não pode ser futuro, e "futuro" não pode
-- depender do relógio do cliente.
create function private.today_br()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

-- Se a pessoa passou do limite de falhas de código, os segundos até poder
-- tentar de novo; senão, nulo. 10 por hora (spec, seção 8).
create function private.invite_code_retry_after(p_user uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select case
    when count(*) >= 10 then greatest(1, ceil(extract(epoch from (min(at) + interval '1 hour' - now())))::integer)
  end
  from (
    select at from private.invite_code_failures
    where user_id = p_user and at > now() - interval '1 hour'
    order by at desc
    limit 10
  ) recent;
$$;

revoke execute on function private.normalize_invite_code(text)   from public, anon, authenticated;
revoke execute on function private.new_invite_code()             from public, anon, authenticated;
revoke execute on function private.today_br()                    from public, anon, authenticated;
revoke execute on function private.invite_code_retry_after(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_couple — casal + membro slot 1, na mesma transação.
-- ---------------------------------------------------------------------------
create function public.create_couple(p_started_on date, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_name   text := nullif(btrim(coalesce(p_name, '')), '');
  v_couple uuid;
begin
  if v_uid is null then
    raise exception 'create_couple sem sessão' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = v_uid) then
    return jsonb_build_object('status', 'no_profile');
  end if;

  if exists (select 1 from public.couple_members where profile_id = v_uid) then
    return jsonb_build_object('status', 'already_member');
  end if;

  if p_started_on is null or p_started_on > private.today_br() or p_started_on < date '1900-01-01' then
    return jsonb_build_object('status', 'invalid', 'field', 'started_on');
  end if;

  if v_name is not null and char_length(v_name) > 40 then
    return jsonb_build_object('status', 'invalid', 'field', 'name');
  end if;

  insert into public.couples (name, started_on) values (v_name, p_started_on)
  returning id into v_couple;

  -- A corrida de duas abas passa pelas duas checagens acima. Quem chega em
  -- segundo espera o commit do primeiro e bate no unique (profile_id) — e aí
  -- desfaz o casal que acabou de criar, em vez de deixá-lo órfão.
  begin
    insert into public.couple_members (couple_id, profile_id, slot) values (v_couple, v_uid, 1);
  exception when unique_violation then
    delete from public.couples where id = v_couple;
    return jsonb_build_object('status', 'already_member');
  end;

  return jsonb_build_object('status', 'created', 'couple_id', v_couple);
end;
$$;

-- ---------------------------------------------------------------------------
-- create_invite — o convite aberto do casal. Havendo um aberto, REVOGA e cria
-- outro: é o "trocar e-mail", e o código antigo, que foi para o endereço
-- errado, deixa de valer.
-- ---------------------------------------------------------------------------
create function public.create_invite(p_email text, p_invitee_name text default null)
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

  if (select count(*) from public.couple_members where couple_id = v_couple) >= 2 then
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

  -- Colisão de código com 32^6 possibilidades não acontece na prática; se a
  -- quinta tentativa colidir, algo está errado com o gerador, e exceção é o
  -- certo.
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
-- renew_invite — "Reenviar" e "Renovar": mesmo código, mais 7 dias. Vale para
-- pendente e para expirado.
-- ---------------------------------------------------------------------------
create function public.renew_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_couple uuid;
  v_invite public.couple_invites;
begin
  if v_uid is null then
    raise exception 'renew_invite sem sessão' using errcode = '42501';
  end if;

  select couple_id into v_couple from public.couple_members where profile_id = v_uid;
  if v_couple is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  -- last_sent_at volta a nulo: o e-mail que saiu antes diz o prazo antigo. Até
  -- o novo envio ser ACEITO, a tela não pode dizer "enviado" (R5).
  update public.couple_invites
     set expires_at = now() + interval '7 days',
         last_sent_at = null
   where couple_id = v_couple and accepted_at is null and revoked_at is null
  returning * into v_invite;

  if v_invite.id is null then
    return jsonb_build_object('status', 'no_open_invite');
  end if;

  return jsonb_build_object(
    'status', 'renewed',
    'invite_id', v_invite.id,
    'code', v_invite.code,
    'expires_at', v_invite.expires_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- begin_invite_send — chamada pela edge function com o JWT de quem pediu.
-- A autorização de "quem manda convite de quem" mora AQUI, sob a identidade de
-- quem chama, e não no código da função (ADR 0006).
-- ---------------------------------------------------------------------------
create function public.begin_invite_send(p_invite_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_couple    uuid;
  v_invite    public.couple_invites;
  v_last      timestamptz;
  v_day_count integer;
  v_oldest    timestamptz;
  v_sender    public.profiles;
  v_sender_email text;
  v_couple_row public.couples;
begin
  if v_uid is null then
    raise exception 'begin_invite_send sem sessão' using errcode = '42501';
  end if;

  select couple_id into v_couple from public.couple_members where profile_id = v_uid;

  -- Convite de outro casal responde igual a "não é membro": não confirma que
  -- o id existe.
  select * into v_invite from public.couple_invites
   where id = p_invite_id and couple_id = v_couple
   for update;
  if v_couple is null or v_invite.id is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  if v_invite.accepted_at is not null or v_invite.revoked_at is not null or v_invite.expires_at <= now() then
    return jsonb_build_object('status', 'not_pending');
  end if;

  -- 60 s entre envios do mesmo convite.
  select max(at) into v_last from private.invite_send_log where invite_id = v_invite.id;
  if v_last is not null and v_last > now() - interval '60 seconds' then
    return jsonb_build_object(
      'status', 'rate_limited',
      'retry_after_s', greatest(1, ceil(extract(epoch from (v_last + interval '60 seconds' - now())))::integer)
    );
  end if;

  -- 10 envios por casal em 24 h: o teto contra usar o app de relay de spam.
  select count(*), min(at) into v_day_count, v_oldest
    from private.invite_send_log
   where couple_id = v_couple and at > now() - interval '24 hours';
  if v_day_count >= 10 then
    return jsonb_build_object(
      'status', 'rate_limited',
      'retry_after_s', greatest(1, ceil(extract(epoch from (v_oldest + interval '24 hours' - now())))::integer)
    );
  end if;

  insert into private.invite_send_log (couple_id, invite_id) values (v_couple, v_invite.id);
  update public.couple_invites set send_count = send_count + 1 where id = v_invite.id
  returning * into v_invite;

  select * into v_sender from public.profiles where id = v_uid;
  select email into v_sender_email from auth.users where id = v_uid;
  select * into v_couple_row from public.couples where id = v_couple;

  return jsonb_build_object(
    'status', 'ok',
    'code', v_invite.code,
    'email', v_invite.email,
    'invitee_name', v_invite.invitee_name,
    'inviter_display_name', v_sender.display_name,
    'inviter_full_name', v_sender.full_name,
    'inviter_email', v_sender_email,
    'couple_name', v_couple_row.name,
    'started_on', v_couple_row.started_on,
    'expires_at', v_invite.expires_at,
    'send_count', v_invite.send_count
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- mark_invite_sent — só depois que o provedor ACEITOU. É `last_sent_at`, e não
-- `send_count`, que a tela usa para dizer "enviado" (R5).
-- ---------------------------------------------------------------------------
create function public.mark_invite_sent(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'mark_invite_sent sem sessão' using errcode = '42501';
  end if;

  update public.couple_invites
     set last_sent_at = now()
   where id = p_invite_id
     and couple_id in (select couple_id from public.couple_members where profile_id = (select auth.uid()));
end;
$$;

-- ---------------------------------------------------------------------------
-- A parte comum de lookup_invite e accept_invite: normaliza, conta falha,
-- acha o convite e diz em que estado ele está PARA ESTA PESSOA. Devolve nulo
-- quando o convite é válido e a pessoa pode entrar.
--
-- Não é security definer por conta própria: só roda de dentro das duas.
-- ---------------------------------------------------------------------------
create function private.invite_refusal(p_uid uuid, p_invite public.couple_invites)
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
     or (select count(*) from public.couple_members where couple_id = p_invite.couple_id) >= 2 then
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

revoke execute on function private.invite_refusal(uuid, public.couple_invites) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- lookup_invite — o preview. Não exige perfil (o preview vem antes do passo
-- "Seu perfil"), exige sessão (I7), e conta falha (I8).
-- ---------------------------------------------------------------------------
create function public.lookup_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_retry    integer;
  v_code     text;
  v_invite   public.couple_invites;
  v_refusal  jsonb;
  v_inviter  public.profiles;
  v_couple   public.couples;
begin
  if v_uid is null then
    raise exception 'lookup_invite sem sessão' using errcode = '42501';
  end if;

  -- Antes de olhar o código: passado o limite, a resposta não pode depender
  -- de o código existir, senão o limite vira oráculo.
  v_retry := private.invite_code_retry_after(v_uid);
  if v_retry is not null then
    return jsonb_build_object('status', 'rate_limited', 'retry_after_s', v_retry);
  end if;

  v_code := private.normalize_invite_code(p_code);
  if v_code is not null then
    select * into v_invite from public.couple_invites where code = v_code;
  end if;

  -- Revogado responde como inexistente: quem recebeu o código por engano não
  -- deve saber que ele existiu (seção 9).
  if v_invite.id is null or v_invite.revoked_at is not null then
    insert into private.invite_code_failures (user_id) values (v_uid);
    return jsonb_build_object('status', 'not_found');
  end if;

  v_refusal := private.invite_refusal(v_uid, v_invite);
  if v_refusal is not null then
    return v_refusal;
  end if;

  select * into v_inviter from public.profiles where id = v_invite.created_by;
  select * into v_couple  from public.couples  where id = v_invite.couple_id;

  return jsonb_build_object(
    'status', 'valid',
    'code', v_invite.code,
    'couple_name', v_couple.name,
    'started_on', v_couple.started_on,
    'inviter_display_name', v_inviter.display_name,
    'inviter_full_name', v_inviter.full_name,
    'inviter_city', (select name from public.cities where id = v_inviter.home_city_id),
    -- Sem avatar_path: o caminho começa pelo auth.uid() de quem convidou, e
    -- quem só tem o código ainda não é do casal (nem conseguiria ler a foto).
    'expires_at', v_invite.expires_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- accept_invite — a ÚNICA porta de entrada num casal (I3). Trava o convite,
-- repete toda checagem do preview (o preview não é autorização), insere o
-- slot 2, acerta a cor e marca o aceite. Tudo numa transação.
-- ---------------------------------------------------------------------------
create function public.accept_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_retry     integer;
  v_code      text;
  v_invite    public.couple_invites;
  v_refusal   jsonb;
  v_my_color  text;
  v_partner   text;
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
    -- commit do primeiro e relê a linha já com accepted_at (I2).
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

  begin
    insert into public.couple_members (couple_id, profile_id, slot)
    values (v_invite.couple_id, v_uid, 2);
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

  -- I10: as duas faixas do calendário precisam se distinguir.
  select color into v_my_color from public.profiles where id = v_uid;
  select p.color into v_partner
    from public.couple_members cm join public.profiles p on p.id = cm.profile_id
   where cm.couple_id = v_invite.couple_id and cm.profile_id <> v_uid;
  if v_partner is not null and v_my_color = v_partner then
    update public.profiles
       set color = case when v_partner = '#ec4899' then '#3b82f6' else '#ec4899' end
     where id = v_uid;
  end if;

  update public.couple_invites
     set accepted_at = now(), accepted_by = v_uid
   where id = v_invite.id;

  return jsonb_build_object('status', 'joined', 'couple_id', v_invite.couple_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. O Postgres concede EXECUTE a PUBLIC por padrão; sem o revoke, anon
-- chama (I7). Foi o que a migration 00003 do schema anterior corrigiu.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_couple(date, text)     from public, anon;
revoke execute on function public.create_invite(text, text)     from public, anon;
revoke execute on function public.renew_invite()                from public, anon;
revoke execute on function public.begin_invite_send(uuid)       from public, anon;
revoke execute on function public.mark_invite_sent(uuid)        from public, anon;
revoke execute on function public.lookup_invite(text)           from public, anon;
revoke execute on function public.accept_invite(text)           from public, anon;

grant execute on function public.create_couple(date, text)      to authenticated;
grant execute on function public.create_invite(text, text)      to authenticated;
grant execute on function public.renew_invite()                 to authenticated;
grant execute on function public.begin_invite_send(uuid)        to authenticated;
grant execute on function public.mark_invite_sent(uuid)         to authenticated;
grant execute on function public.lookup_invite(text)            to authenticated;
grant execute on function public.accept_invite(text)            to authenticated;
