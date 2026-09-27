-- Fase 5 · 2/2 — o Calendário: eventos, 💋, guardas de estadia e a pintura.
--
-- Spec: .agent/Tasks/fase-5-calendario.md, seções 4 (I1, I3, I6, I8, I12, I13),
--       5 (migration 2) e 6 (nomes)
-- ADR:  .agent/Decisions/0018-periodo-se-grava-pintando-estadias.md
--       .agent/Decisions/0017-cidades-do-mundo-por-casal.md (cidade do casal)
--       .agent/Decisions/0002-estadia-por-pessoa-estado-derivado.md
--
-- Os tipos e os limites são os de EVENT_KINDS e CALENDAR_LIMITS em
-- src/domain/calendar.ts; o formato do evento é o de `validateEvent`, e a
-- pintura é a de `paintStays`. supabase/tests/calendar.test.ts prova a
-- paridade (A1) e roda as MESMAS tabelas de casos que o domínio
-- (`paintCases.ts` → A2, `eventValidationCases.ts` → A3). Mudou lá, muda aqui.
--
-- Os nomes das constraints são contrato: a fronteira de dados os lê para dizer
-- o que falhou (spec, seção 6). Nenhuma fica com nome gerado.

-- ---------------------------------------------------------------------------
-- calendar_events
-- ---------------------------------------------------------------------------
create table public.calendar_events (
  id             uuid primary key default gen_random_uuid(),
  couple_id      uuid not null references public.couples (id) on delete cascade,
  kind           text not null,
  title          text not null,
  starts_on      date not null,
  ends_on        date,
  all_day        boolean not null default true,
  starts_at      time,
  ends_at        time,
  travelers      text,
  traveler_id    uuid references public.profiles (id) on delete set null,
  city_id        uuid references public.cities (id),
  place          text,
  repeats_yearly boolean not null default false,
  note           text,
  list_item_id   uuid,
  created_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- O item vinculado é do mesmo casal (FK composta no alvo que a Fase 4 criou
  -- para isso). Apagar o item desfaz o vínculo, não o evento: `set null` só na
  -- coluna do item — anular `couple_id` junto violaria o NOT NULL.
  constraint calendar_events_list_item foreign key (list_item_id, couple_id)
    references public.list_items (id, couple_id) on delete set null (list_item_id),

  constraint calendar_events_kind check (
    kind in ('viagem','visita','date','data_especial','compromisso','lembrete')
  ),
  constraint calendar_events_title     check (char_length(btrim(title)) between 1 and 80),
  constraint calendar_events_note      check (char_length(note) <= 280),
  constraint calendar_events_place     check (char_length(place) <= 80),
  constraint calendar_events_travelers check (travelers in ('both','solo')),

  -- I8, um bloco por regra. Cada linha é um `ou` com a exceção: CHECK aceita
  -- NULL como verdadeiro, então toda comparação que pode dar NULL vai por
  -- `is not distinct from` ou `is null`, nunca por `=` solto — um `travelers =
  -- 'solo'` nulo deixaria passar `solo` sem viajante.
  constraint calendar_events_format check (
    -- viagem e visita: quem viaja, destino e volta; `place` é do date.
    (
      (kind in ('viagem','visita')
        and travelers is not null and city_id is not null and ends_on is not null
        and place is null)
      or
      (kind not in ('viagem','visita')
        and travelers is null and traveler_id is null and city_id is null)
    )
    -- `solo` ⇔ viajante preenchido.
    and ((travelers is not distinct from 'solo') = (traveler_id is not null))
    -- fim: só em viagem, visita e compromisso; não antes do começo; no máximo
    -- 366 dias corridos (`ends_on - starts_on < 366`, CALENDAR_LIMITS.spanDays).
    and (ends_on is null
      or (kind in ('viagem','visita','compromisso')
        and ends_on >= starts_on
        and ends_on - starts_on < 366))
    and (not repeats_yearly or kind = 'data_especial')
    and (place is null or kind in ('date','compromisso'))
    -- dia inteiro não tem hora; a hora da volta é só da viagem e da visita.
    and (not all_day or (starts_at is null and ends_at is null))
    and (ends_at is null or kind in ('viagem','visita'))
  )
);

create index calendar_events_couple_starts_idx on public.calendar_events (couple_id, starts_on);
create index calendar_events_traveler_idx      on public.calendar_events (traveler_id);
create index calendar_events_city_idx          on public.calendar_events (city_id);
create index calendar_events_list_item_idx     on public.calendar_events (list_item_id, couple_id);
create index calendar_events_created_by_idx    on public.calendar_events (created_by);

-- ---------------------------------------------------------------------------
-- day_kisses — uma linha por marca; o número do dia é `count(*)` e é do casal.
-- Sem updated_at e sem policy de update: uma marca não muda, entra ou sai.
-- ---------------------------------------------------------------------------
create table public.day_kisses (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  day        date not null,
  added_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index day_kisses_couple_day_idx on public.day_kisses (couple_id, day);
create index day_kisses_added_by_idx   on public.day_kisses (added_by);

-- ---------------------------------------------------------------------------
-- Triggers. Todos security INVOKER, pelo mesmo motivo de `list_items_members`
-- (Fase 4): trigger BEFORE roda antes do `with check` da RLS, e um definer
-- responderia "P é do casal X?" / "a cidade C é do casal X?" para qualquer X.
-- Com invoker, casal alheio é invisível e a resposta é sempre não. A policy de
-- `couple_members` já deixa cada um ler os integrantes do próprio casal, a de
-- `cities` as cidades dele, e o service_role não passa por RLS — por isso as
-- consultas abaixo também comparam o `couple_id` explicitamente.
--
-- As recusas saem com o nome da regra também no HINT: o PostgREST devolve o
-- HINT, e não o `constraint` do RAISE (lição da `review_fixes`, Fase 3).
-- ---------------------------------------------------------------------------

-- I13 — o evento não troca de casal. A RLS já recusaria mover para um casal
-- que não é o de quem escreve; isto cobre também o service_role.
create function private.calendar_events_couple_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.couple_id is distinct from old.couple_id then
    raise exception 'o casal de um evento não muda'
      using errcode = '23514', constraint = 'calendar_events_couple_immutable',
            hint = 'calendar_events_couple_immutable';
  end if;
  return new;
end;
$$;

-- I13 e I2 — quem viaja e quem criou são integrantes do casal do evento, e a
-- cidade é global (IBGE) ou do próprio casal. Só o valor NOVO se confere: quem
-- saiu do casal continua autor e viajante dos eventos antigos, e editar o
-- título deles não pode falhar por isso.
create function private.calendar_events_members()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.traveler_id is not null
     and (tg_op = 'INSERT' or new.traveler_id is distinct from old.traveler_id)
     and not exists (
       select 1 from public.couple_members
        where couple_id = new.couple_id and profile_id = new.traveler_id
     ) then
    raise exception 'traveler_id não é integrante do casal do evento'
      using errcode = '23514', constraint = 'calendar_events_member', hint = 'calendar_events_member';
  end if;

  if new.created_by is not null
     and (tg_op = 'INSERT' or new.created_by is distinct from old.created_by)
     and not exists (
       select 1 from public.couple_members
        where couple_id = new.couple_id and profile_id = new.created_by
     ) then
    raise exception 'created_by não é integrante do casal do evento'
      using errcode = '23514', constraint = 'calendar_events_member', hint = 'calendar_events_member';
  end if;

  -- Sem isto, quem soubesse o uuid da Lisboa de outro casal poderia apontar
  -- para ela: a FK não passa por RLS.
  if new.city_id is not null
     and (tg_op = 'INSERT' or new.city_id is distinct from old.city_id)
     and not exists (
       select 1 from public.cities
        where id = new.city_id and (couple_id is null or couple_id = new.couple_id)
     ) then
    raise exception 'city_id não é cidade global nem do casal do evento'
      using errcode = '23514', constraint = 'calendar_events_city', hint = 'calendar_events_city';
  end if;

  return new;
end;
$$;

-- I13 e I2 para `stays`, que até aqui não conferia nada disso: a pessoa, quem
-- gravou e a cidade. É o que faz `paint_stays` recusar perfil de fora — a
-- pintura insere, o trigger recusa, e a transação inteira volta. Só o valor
-- novo, pelo mesmo motivo do evento: cortar a estadia antiga de quem saiu do
-- casal (um `update` de `ends_on`) não pode falhar.
create function private.stays_members()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.profile_id is distinct from old.profile_id)
     and not exists (
       select 1 from public.couple_members
        where couple_id = new.couple_id and profile_id = new.profile_id
     ) then
    raise exception 'profile_id não é integrante do casal da estadia'
      using errcode = '23514', constraint = 'stays_member', hint = 'stays_member';
  end if;

  if new.created_by is not null
     and (tg_op = 'INSERT' or new.created_by is distinct from old.created_by)
     and not exists (
       select 1 from public.couple_members
        where couple_id = new.couple_id and profile_id = new.created_by
     ) then
    raise exception 'created_by não é integrante do casal da estadia'
      using errcode = '23514', constraint = 'stays_member', hint = 'stays_member';
  end if;

  if (tg_op = 'INSERT' or new.city_id is distinct from old.city_id)
     and not exists (
       select 1 from public.cities
        where id = new.city_id and (couple_id is null or couple_id = new.couple_id)
     ) then
    raise exception 'city_id não é cidade global nem do casal da estadia'
      using errcode = '23514', constraint = 'stays_city', hint = 'stays_city';
  end if;

  return new;
end;
$$;

-- I12 — no máximo 20 por casal por dia, e nunca em dia futuro.
--
-- O limite precisa de fila: sem ela, as duas pessoas tocando `+` ao mesmo
-- tempo contam 19 cada uma e as duas passam. A trava é consultiva e por
-- (casal, dia), na transação — não trava a linha do casal (que tem policy de
-- update e serializaria o resto) nem os outros dias. Depois de esperar, a
-- contagem (consulta nova, READ COMMITTED) já vê o que a outra gravou.
--
-- "Futuro" é o do servidor, no fuso do casal (`today_br`), com um dia de folga
-- para quem marca de um fuso adiantado (Lisboa está 4 h à frente) — como o
-- `done_on` da Lista. O relógio do cliente não decide.
create function private.day_kisses_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.day > private.today_br() + 1 then
    raise exception 'marca em dia futuro: %', new.day
      using errcode = '23514', constraint = 'day_kisses_future', hint = 'day_kisses_future';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('day_kisses:' || new.couple_id::text || ':' || new.day::text, 0));

  if (select count(*) from public.day_kisses where couple_id = new.couple_id and day = new.day) >= 20 then
    raise exception 'o dia já tem 20 marcas'
      using errcode = '23514', constraint = 'day_kisses_limit', hint = 'day_kisses_limit';
  end if;

  return new;
end;
$$;

revoke execute on function private.calendar_events_couple_immutable() from public, anon;
revoke execute on function private.calendar_events_members()          from public, anon;
revoke execute on function private.stays_members()                    from public, anon;
revoke execute on function private.day_kisses_guard()                 from public, anon;
-- Quem escreve nas tabelas executa o trigger: o app e o service_role (painel,
-- harness) — ver o comentário de `couples_started_on_not_future`.
grant  execute on function private.calendar_events_couple_immutable() to authenticated, service_role;
grant  execute on function private.calendar_events_members()          to authenticated, service_role;
grant  execute on function private.stays_members()                    to authenticated, service_role;
grant  execute on function private.day_kisses_guard()                 to authenticated, service_role;

create trigger calendar_events_touch
  before update on public.calendar_events
  for each row execute function private.touch_updated_at();

create trigger calendar_events_couple_immutable
  before update of couple_id on public.calendar_events
  for each row execute function private.calendar_events_couple_immutable();

create trigger calendar_events_members
  before insert or update on public.calendar_events
  for each row execute function private.calendar_events_members();

create trigger stays_members
  before insert or update on public.stays
  for each row execute function private.stays_members();

create trigger day_kisses_guard
  before insert on public.day_kisses
  for each row execute function private.day_kisses_guard();

-- ---------------------------------------------------------------------------
-- RLS. Sempre `couple_id in (select private.my_couple_ids())` — a mesma
-- expressão das outras tabelas. O cliente não filtra (ADR 0001). Os dois
-- editam e apagam qualquer evento, e qualquer um tira o 💋 de qualquer um: o
-- número é do casal. `stays` não muda (a policy `for all` da Fase 0).
-- ---------------------------------------------------------------------------
alter table public.calendar_events enable row level security;
alter table public.day_kisses      enable row level security;

create policy "calendar_events_select_member" on public.calendar_events
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- `created_by` é de quem insere, não de quem a pessoa quiser dizer.
create policy "calendar_events_insert_member" on public.calendar_events
  for insert to authenticated
  with check (
    couple_id in (select private.my_couple_ids())
    and created_by = (select auth.uid())
  );

create policy "calendar_events_update_member" on public.calendar_events
  for update to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

create policy "calendar_events_delete_member" on public.calendar_events
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "day_kisses_select_member" on public.day_kisses
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "day_kisses_insert_member" on public.day_kisses
  for insert to authenticated
  with check (
    couple_id in (select private.my_couple_ids())
    and added_by = (select auth.uid())
  );

create policy "day_kisses_delete_member" on public.day_kisses
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- ---------------------------------------------------------------------------
-- paint_one — a regra da pintura (I3, ADR 0018), UMA vez no banco. Espelho de
-- `paintStays` (src/domain/calendar.ts); `paintCases.ts` prova que concordam.
--
-- "A pessoa esteve na cidade de `p_from` até `p_to`" (inclusivo; `p_to` nulo =
-- em aberto). No intervalo, ela passa a estar só na cidade nova:
--   · estadia inteira dentro → apagada;
--   · estadia que cobre o intervalo inteiro → partida em duas, e o pedaço de
--     depois MANTÉM o fim original, inclusive em aberto;
--   · estadia que atravessa uma borda → cortada naquela borda;
--   · depois de inserir, as vizinhas da mesma pessoa NA MESMA CIDADE que
--     encostam no intervalo (fim = véspera, começo = dia seguinte) são fundidas.
-- A ordem importa por causa de `stays_no_overlap`: primeiro abre espaço, depois
-- insere, e na fusão apaga a vizinha antes de esticar a nova.
--
-- security INVOKER, e só chamada de dentro das RPCs: a RLS de `stays` vale
-- aqui dentro, e os triggers conferem pessoa e cidade em cada insert. Não
-- recebe o casal do cliente — quem chama o descobriu por `my_couple_ids()`.
-- ---------------------------------------------------------------------------
create function private.paint_one(
  p_couple  uuid,
  p_profile uuid,
  p_city    uuid,
  p_from    date,
  p_to      date,
  p_by      uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_end  date := coalesce(p_to, 'infinity'::date);
  v_s    public.stays;
  v_id   uuid;
  v_nb   public.stays;
begin
  -- 1. Abrir espaço. Só as estadias da pessoa NESTE casal: as de um casal
  -- antigo são invisíveis pela RLS, e se colidirem a exclusão recusa — melhor
  -- que apagar história de outro casal.
  for v_s in
    select * from public.stays
     where couple_id = p_couple and profile_id = p_profile
       and starts_on <= v_end
       and coalesce(ends_on, 'infinity'::date) >= p_from
     order by starts_on
     for update
  loop
    if v_s.starts_on >= p_from and coalesce(v_s.ends_on, 'infinity'::date) <= v_end then
      -- inteira dentro
      delete from public.stays where id = v_s.id;

    elsif v_s.starts_on < p_from and coalesce(v_s.ends_on, 'infinity'::date) > v_end then
      -- cobre o intervalo: parte em duas (só com `p_to` preenchido — em aberto
      -- nada passa de `v_end`). O pedaço de depois leva o fim original.
      update public.stays set ends_on = p_from - 1 where id = v_s.id;
      insert into public.stays (couple_id, profile_id, city_id, starts_on, ends_on, created_by)
      values (p_couple, p_profile, v_s.city_id, p_to + 1, v_s.ends_on, p_by);

    elsif v_s.starts_on < p_from then
      -- atravessa a borda de começo
      update public.stays set ends_on = p_from - 1 where id = v_s.id;

    else
      -- atravessa a borda de fim (começa dentro, termina depois de `p_to`)
      update public.stays set starts_on = p_to + 1 where id = v_s.id;
    end if;
  end loop;

  -- 2. A estadia nova. `created_by` é quem pinta — também no pedaço partido
  -- acima: o autor original pode ter saído do casal, e o trigger recusaria.
  insert into public.stays (couple_id, profile_id, city_id, starts_on, ends_on, created_by)
  values (p_couple, p_profile, p_city, p_from, p_to, p_by)
  returning id into v_id;

  -- 3. Fundir com a vizinha de antes (termina na véspera, mesma cidade).
  delete from public.stays
   where couple_id = p_couple and profile_id = p_profile and city_id = p_city
     and ends_on = p_from - 1
  returning * into v_nb;
  if found then
    update public.stays set starts_on = v_nb.starts_on where id = v_id;
  end if;

  -- 4. E com a de depois (começa no dia seguinte, mesma cidade). O fim dela,
  -- inclusive em aberto, vira o fim da nova.
  if p_to is not null then
    delete from public.stays
     where couple_id = p_couple and profile_id = p_profile and city_id = p_city
       and starts_on = p_to + 1
    returning * into v_nb;
    if found then
      update public.stays set ends_on = v_nb.ends_on where id = v_id;
    end if;
  end if;
end;
$$;

revoke execute on function private.paint_one(uuid, uuid, uuid, date, date, uuid) from public, anon;
grant  execute on function private.paint_one(uuid, uuid, uuid, date, date, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- paint_stays — várias pinturas, EM ORDEM, numa transação só (ADR 0018).
--
-- security INVOKER: a RLS vale aqui dentro, então ela não abre nada que as
-- escritas diretas não abririam, e `public` continua com as doze `security
-- definer` (A11). Existe só pela atomicidade: pintar duas pessoas seriam
-- quatro a seis escritas soltas, e uma falha no meio deixaria alguém em dois
-- lugares (a exclusão recusa) ou em lugar nenhum (a exclusão não vê).
--
--   p_entries: [{profile_id, city_id, from, to}], 1..8. `to` é obrigatório
--   como CHAVE e pode ser null (em aberto): pintar em aberto apaga o futuro da
--   pessoa, então não pode acontecer por um campo esquecido.
--   sem sessão → 42501 · sem casal → {status:'not_member'}
--   entrada malformada → 22023 · perfil ou cidade fora do casal → 23514 (trigger)
--   → {status:'ok'}
-- ---------------------------------------------------------------------------
create function public.paint_stays(p_entries jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_couple  uuid;
  v_e       jsonb;
  v_profile uuid[] := '{}';
  v_city    uuid[] := '{}';
  v_from    date[] := '{}';
  v_to      date[] := '{}';
  v_n       integer;
begin
  if v_uid is null then
    raise exception 'paint_stays sem sessão' using errcode = '42501';
  end if;

  -- Um casal por pessoa (`couple_members_one_per_profile`, Fase 2).
  select c into v_couple from private.my_couple_ids() as c limit 1;
  if v_couple is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  if jsonb_typeof(p_entries) is distinct from 'array' then
    raise exception 'p_entries precisa ser uma lista' using errcode = '22023';
  end if;
  v_n := jsonb_array_length(p_entries);
  if v_n < 1 or v_n > 8 then
    raise exception 'p_entries: de 1 a 8 entradas, veio %', v_n using errcode = '22023';
  end if;

  -- Valida TUDO antes de pintar qualquer coisa. O cast inválido ('abc'::uuid,
  -- '2026-02-30'::date) sai como 22P02/22008; aqui vira 22023, o código de
  -- "entrada malformada" do contrato.
  for v_e in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(v_e) is distinct from 'object'
       or jsonb_typeof(v_e -> 'profile_id') is distinct from 'string'
       or jsonb_typeof(v_e -> 'city_id') is distinct from 'string'
       or jsonb_typeof(v_e -> 'from') is distinct from 'string'
       or not (v_e ? 'to')
       or jsonb_typeof(v_e -> 'to') not in ('string', 'null') then
      raise exception 'entrada malformada: %', v_e using errcode = '22023';
    end if;
    begin
      v_profile := v_profile || (v_e ->> 'profile_id')::uuid;
      v_city    := v_city    || (v_e ->> 'city_id')::uuid;
      v_from    := v_from    || (v_e ->> 'from')::date;
      v_to      := v_to      || (v_e ->> 'to')::date;
    exception when others then
      raise exception 'entrada malformada: %', v_e using errcode = '22023';
    end;
    if v_to[array_length(v_to, 1)] < v_from[array_length(v_from, 1)] then
      raise exception 'entrada com fim antes do começo: %', v_e using errcode = '22023';
    end if;
  end loop;

  -- Duas pinturas do mesmo casal em fila: sem isto, as duas leem as mesmas
  -- estadias, cortam cada uma do seu jeito e intercalam. Vence a última.
  perform pg_advisory_xact_lock(hashtextextended(v_couple::text, 0));

  for i in 1 .. v_n loop
    perform private.paint_one(v_couple, v_profile[i], v_city[i], v_from[i], v_to[i], v_uid);
  end loop;

  return jsonb_build_object('status', 'ok');
end;
$$;

-- O Postgres concede EXECUTE a PUBLIC por padrão; sem o revoke, anon chama.
revoke all     on function public.paint_stays(jsonb) from public, anon;
grant  execute on function public.paint_stays(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- create_event — o evento e, para viagem e visita, a pintura dos viajantes no
-- destino, na MESMA transação (I6). Depois disso as estadias são a verdade:
-- nenhuma referencia o evento, e editar ou apagar o evento (update/delete
-- diretos) não mexe nelas.
--
--   p_event: a linha de `calendar_events` em snake_case (o que
--   `eventDraftToInsert` produz). `couple_id` e `created_by` vêm da sessão, não
--   do payload; `id`, `created_at` e `updated_at` são do banco.
--   p_paint: pinta só se o tipo é viagem ou visita; nos outros é ignorado.
--   sem sessão → 42501 · sem casal → {status:'not_member'}
--   payload que não é objeto, ou com valor que não converte → 22023
--   formato inválido → 23514 (`calendar_events_format` e os CHECK de tamanho)
--   cidade de outro casal → 23514 (trigger), e nada é gravado
--   → {status:'ok', id}
-- ---------------------------------------------------------------------------
create function public.create_event(p_event jsonb, p_paint boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_couple  uuid;
  v_r       public.calendar_events;
  v_id      uuid;
  v_profile uuid;
begin
  if v_uid is null then
    raise exception 'create_event sem sessão' using errcode = '42501';
  end if;

  select c into v_couple from private.my_couple_ids() as c limit 1;
  if v_couple is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  if jsonb_typeof(p_event) is distinct from 'object' then
    raise exception 'p_event precisa ser um objeto' using errcode = '22023';
  end if;
  begin
    v_r := jsonb_populate_record(null::public.calendar_events, p_event);
  exception when others then
    raise exception 'p_event malformado: %', sqlerrm using errcode = '22023';
  end;

  insert into public.calendar_events (
    couple_id, kind, title, starts_on, ends_on, all_day, starts_at, ends_at,
    travelers, traveler_id, city_id, place, repeats_yearly, note, list_item_id, created_by
  ) values (
    v_couple, v_r.kind, v_r.title, v_r.starts_on, v_r.ends_on,
    coalesce(v_r.all_day, true), v_r.starts_at, v_r.ends_at,
    v_r.travelers, v_r.traveler_id, v_r.city_id, v_r.place,
    coalesce(v_r.repeats_yearly, false), v_r.note, v_r.list_item_id, v_uid
  )
  returning id into v_id;

  if coalesce(p_paint, false) and v_r.kind in ('viagem', 'visita') then
    perform pg_advisory_xact_lock(hashtextextended(v_couple::text, 0));
    -- `both` → os integrantes, na ordem dos slots; `solo` → o viajante. O
    -- CHECK já garantiu cidade, volta e viajante coerentes.
    for v_profile in
      select profile_id from public.couple_members
       where couple_id = v_couple
         and (v_r.travelers = 'both' or profile_id = v_r.traveler_id)
       order by slot
    loop
      perform private.paint_one(v_couple, v_profile, v_r.city_id, v_r.starts_on, v_r.ends_on, v_uid);
    end loop;
  end if;

  return jsonb_build_object('status', 'ok', 'id', v_id);
end;
$$;

revoke all     on function public.create_event(jsonb, boolean) from public, anon;
grant  execute on function public.create_event(jsonb, boolean) to authenticated;
