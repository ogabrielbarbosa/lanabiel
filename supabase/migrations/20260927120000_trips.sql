-- Fase 6 · 1/1 — as Viagens: `trips` estende o evento `viagem` dos dois, e as
-- listas da viagem (saídas, dias, roteiro, preparação, orçamento, memórias,
-- fotos) penduram nela.
--
-- Spec: .agent/Tasks/fase-6-viagens.md, seções 4 (I1, I2, I11–I13), 5
--       (migration), 6 (nomes) e 9
-- ADR:  .agent/Decisions/0019-viagem-e-o-evento-estendido-por-trips.md
--       .agent/Decisions/0012-midia-do-casal-em-bucket-por-casal.md (`trip`)
--       .agent/Decisions/0018-periodo-se-grava-pintando-estadias.md (create_event)
--
-- A viagem É o evento (I1): datas, destino, título, nota e quem viaja moram em
-- `calendar_events` e só lá. Aqui fica só o que o evento não tem.
--
-- Os tipos e os limites são os de ITINERARY_KINDS, PREP_KINDS, DEFAULT_PREP e
-- TRIP_LIMITS em src/domain/trips.ts; os CHECK são espelhados por
-- src/domain/tripValidation.ts. supabase/tests/trips.test.ts prova a paridade
-- (A1) e roda a MESMA tabela de casos que o domínio (`tripValidationCases.ts`,
-- A2). Mudou lá, muda aqui.
--
-- Os nomes das constraints são contrato: a fronteira de dados os lê para dizer
-- o que falhou (spec, seção 6). Nenhuma fica com nome gerado.
--
-- Texto opcional: nulo, ou com algo além de espaço (`btrim` não vazio). Uma
-- string só de espaços que passasse viraria um quadro em branco na tela, e o
-- domínio (`trimSpaces`) apara exatamente o que o `btrim` apara: espaço.
--
-- Só aditiva: nenhuma coluna existente muda. O backfill só INSERE em tabelas
-- que nascem aqui.

-- ---------------------------------------------------------------------------
-- calendar_events — alvo da FK composta de `trips`: garante que o couple_id
-- repetido em `trips` é o do evento.
-- ---------------------------------------------------------------------------
alter table public.calendar_events
  add constraint calendar_events_id_couple unique (id, couple_id);

-- ---------------------------------------------------------------------------
-- trips — 1:1 com o evento, pela mesma chave. `cover_photo_id` ganha a FK
-- depois de `trip_photos` existir.
-- ---------------------------------------------------------------------------
create table public.trips (
  event_id          uuid primary key,
  couple_id         uuid not null,
  cover_photo_id    uuid,
  lodging_name      text,
  lodging_address   text,
  -- Hora LOCAL do lugar (sem fuso): o check-in em Lisboa é às 15h de Lisboa,
  -- qualquer que seja o fuso de quem lê.
  lodging_check_in  timestamp,
  lodging_check_out timestamp,
  lodging_url       text,
  lodging_code      text,
  lodging_cents     integer,
  lodging_paid      boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Alvo das FKs compostas das filhas.
  constraint trips_id_couple unique (event_id, couple_id),

  -- Apagar o evento leva a viagem inteira (I1). O casal do evento não muda
  -- (`calendar_events_couple_immutable`), então o de `trips` também não.
  constraint trips_event foreign key (event_id, couple_id)
    references public.calendar_events (id, couple_id) on delete cascade,

  constraint trip_lodging_name_len    check (char_length(btrim(lodging_name)) between 1 and 80),
  constraint trip_lodging_address_len check (char_length(btrim(lodging_address)) between 1 and 160),
  -- Vira `href` na tela: só http(s), nunca `javascript:`.
  constraint trip_lodging_url_format  check (lodging_url ~* '^https?://' and char_length(lodging_url) <= 500),
  constraint trip_lodging_code_len    check (char_length(btrim(lodging_code)) between 1 and 40),
  constraint trip_lodging_cents       check (lodging_cents between 0 and 1000000000)
);

create index trips_couple_idx on public.trips (couple_id);
create index trips_cover_idx  on public.trips (cover_photo_id, event_id);

-- ---------------------------------------------------------------------------
-- As filhas. Cada uma repete `couple_id` com FK composta `(trip_id,
-- couple_id)` → `trips (event_id, couple_id)`, para a RLS ser a expressão de
-- sempre, sem subquery por viagem (I12).
-- ---------------------------------------------------------------------------

-- De onde cada um sai. Uma por pessoa por viagem.
create table public.trip_departures (
  trip_id     uuid not null,
  couple_id   uuid not null,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  origin_code text,
  note        text,
  primary key (trip_id, profile_id),
  constraint trip_departures_trip foreign key (trip_id, couple_id)
    references public.trips (event_id, couple_id) on delete cascade,
  constraint trip_departure_origin_len check (char_length(btrim(origin_code)) between 1 and 8),
  constraint trip_departure_note_len   check (char_length(btrim(note)) between 1 and 80)
);

create index trip_departures_trip_couple_idx on public.trip_departures (trip_id, couple_id);
create index trip_departures_couple_idx      on public.trip_departures (couple_id);
create index trip_departures_profile_idx     on public.trip_departures (profile_id);

-- O título de um dia do roteiro ("Chegada e Alfama").
create table public.trip_days (
  trip_id   uuid not null,
  couple_id uuid not null,
  day       date not null,
  title     text not null,
  primary key (trip_id, day),
  constraint trip_days_trip foreign key (trip_id, couple_id)
    references public.trips (event_id, couple_id) on delete cascade,
  constraint trip_day_title_len check (char_length(btrim(title)) between 1 and 60)
);

create index trip_days_trip_couple_idx on public.trip_days (trip_id, couple_id);
create index trip_days_couple_idx      on public.trip_days (couple_id);

-- Itens do roteiro. `day` dentro da viagem é trigger (I11), não CHECK: depende
-- de outra tabela, e só vale no momento em que o item é gravado.
create table public.trip_itinerary_items (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null,
  couple_id    uuid not null,
  day          date not null,
  at           time,
  title        text not null,
  kind         text not null,
  note         text,
  list_item_id uuid,
  position     integer not null default 0,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint trip_itinerary_trip foreign key (trip_id, couple_id)
    references public.trips (event_id, couple_id) on delete cascade,
  -- O item da Lista é do mesmo casal. Apagar o item desfaz o vínculo, não o
  -- item do roteiro: `set null` só na coluna do item (anular `couple_id` junto
  -- violaria o NOT NULL) — como `calendar_events_list_item`.
  constraint trip_itinerary_list_item foreign key (list_item_id, couple_id)
    references public.list_items (id, couple_id) on delete set null (list_item_id),
  constraint trip_itinerary_kind check (
    kind in ('voo','hospedagem','transporte','restaurante','comida','parque','cidade','experiencia','outro')
  ),
  constraint trip_itinerary_title_len check (char_length(btrim(title)) between 1 and 80),
  constraint trip_itinerary_note_len  check (char_length(btrim(note)) between 1 and 120)
);

create index trip_itinerary_trip_couple_idx on public.trip_itinerary_items (trip_id, couple_id, day);
create index trip_itinerary_couple_idx      on public.trip_itinerary_items (couple_id);
create index trip_itinerary_list_item_idx   on public.trip_itinerary_items (list_item_id, couple_id);
create index trip_itinerary_created_by_idx  on public.trip_itinerary_items (created_by);

-- Preparação. Os cinco padrão entram com a viagem (`private.trip_ensure`).
create table public.trip_prep_items (
  id        uuid primary key default gen_random_uuid(),
  trip_id   uuid not null,
  couple_id uuid not null,
  kind      text not null,
  label     text not null,
  detail    text,
  done      boolean not null default false,
  position  integer not null default 0,
  constraint trip_prep_trip foreign key (trip_id, couple_id)
    references public.trips (event_id, couple_id) on delete cascade,
  constraint trip_prep_kind check (
    kind in ('passagens','hospedagem','documentos','seguro','malas','outro')
  ),
  constraint trip_prep_label_len  check (char_length(btrim(label)) between 1 and 40),
  constraint trip_prep_detail_len check (char_length(btrim(detail)) between 1 and 80)
);

create index trip_prep_trip_couple_idx on public.trip_prep_items (trip_id, couple_id);
create index trip_prep_couple_idx      on public.trip_prep_items (couple_id);

-- Orçamento, em centavos de real.
create table public.trip_budget_lines (
  id            uuid primary key default gen_random_uuid(),
  trip_id       uuid not null,
  couple_id     uuid not null,
  label         text not null,
  planned_cents integer not null,
  spent_cents   integer not null default 0,
  position      integer not null default 0,
  constraint trip_budget_trip foreign key (trip_id, couple_id)
    references public.trips (event_id, couple_id) on delete cascade,
  constraint trip_budget_label_len check (char_length(btrim(label)) between 1 and 30),
  constraint trip_budget_cents     check (
    planned_cents between 0 and 1000000000 and spent_cents between 0 and 1000000000
  )
);

create index trip_budget_trip_couple_idx on public.trip_budget_lines (trip_id, couple_id);
create index trip_budget_couple_idx      on public.trip_budget_lines (couple_id);

-- Uma memória por pessoa por viagem, com a nota dela (I6, I11). A nota da
-- viagem é derivada destas, nunca gravada.
create table public.trip_memories (
  trip_id    uuid not null,
  couple_id  uuid not null,
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating     smallint not null,
  body       text not null,
  written_on date not null default private.today_br(),
  updated_at timestamptz not null default now(),
  primary key (trip_id, profile_id),
  constraint trip_memories_trip foreign key (trip_id, couple_id)
    references public.trips (event_id, couple_id) on delete cascade,
  constraint trip_memory_rating   check (rating between 1 and 5),
  constraint trip_memory_body_len check (char_length(btrim(body)) between 1 and 2000)
);

create index trip_memories_trip_couple_idx on public.trip_memories (trip_id, couple_id);
create index trip_memories_couple_idx      on public.trip_memories (couple_id);
create index trip_memories_profile_idx     on public.trip_memories (profile_id);

-- Fotos da viagem, ≤ 500 por viagem (trigger). O arquivo mora na pasta do
-- próprio casal, na de viagens (ADR 0012): fora dela apontaria para arquivo de
-- outro casal.
create table public.trip_photos (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null,
  couple_id  uuid not null,
  path       text not null,
  taken_on   date,
  caption    text,
  favorite   boolean not null default false,
  added_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Alvo de `trips_cover_same_trip`: a capa é uma foto DESTA viagem.
  constraint trip_photos_id_trip unique (id, trip_id),
  constraint trip_photos_path_unique unique (path),
  constraint trip_photos_trip foreign key (trip_id, couple_id)
    references public.trips (event_id, couple_id) on delete cascade,
  constraint trip_photos_path        check (path like couple_id::text || '/trip/%'),
  constraint trip_photo_caption_len  check (char_length(btrim(caption)) between 1 and 80)
);

create index trip_photos_trip_couple_idx on public.trip_photos (trip_id, couple_id);
create index trip_photos_couple_idx      on public.trip_photos (couple_id);
create index trip_photos_added_by_idx    on public.trip_photos (added_by);

-- I11 — a capa é uma foto da MESMA viagem. Apagar a foto tira a capa, não a
-- viagem: `set null` só na coluna da capa (anular `event_id`, a chave, seria
-- impossível). Com `cover_photo_id` nulo a FK não confere nada (MATCH SIMPLE).
alter table public.trips
  add constraint trips_cover_same_trip foreign key (cover_photo_id, event_id)
    references public.trip_photos (id, trip_id) on delete set null (cover_photo_id);

-- ---------------------------------------------------------------------------
-- Triggers. Todos security INVOKER, pelo mesmo motivo de `list_items_members`
-- e `calendar_events_members`: trigger BEFORE roda antes do `with check` da
-- RLS, e um definer responderia "P é do casal X?" para qualquer X. Com
-- invoker, casal alheio é invisível e a resposta é sempre não.
--
-- As recusas saem com o nome da regra também no HINT: o PostgREST devolve o
-- HINT, e não o `constraint` do RAISE (lição da `review_fixes`, Fase 3).
-- ---------------------------------------------------------------------------

-- I11 e I12 — a pessoa de uma saída ou memória, e o autor de um item do
-- roteiro ou de uma foto, são integrantes do casal da linha. A coluna vem no
-- argumento do trigger. Só o valor NOVO se confere: quem saiu do casal
-- continua autor das linhas antigas, e editar outra coluna delas não pode
-- falhar por isso.
create function private.trip_member()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_new uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if v_new is not null
     and (tg_op = 'INSERT' or v_new is distinct from (to_jsonb(old) ->> tg_argv[0])::uuid)
     and not exists (
       select 1 from public.couple_members
        where couple_id = new.couple_id and profile_id = v_new
     ) then
    raise exception '% não é integrante do casal da viagem', tg_argv[0]
      using errcode = '23514', constraint = 'trip_member', hint = 'trip_member';
  end if;
  return new;
end;
$$;

-- I11 — o dia do item está dentro da viagem NO MOMENTO em que o item é
-- gravado. Se a viagem mudar de data no Calendário depois, o item fica fora e
-- nada falha (a tela agrupa, R17): por isso só se confere quando o dia (ou a
-- viagem) do item muda. Viagem que não se enxerga não é achada, e a FK ou a
-- RLS recusam o resto.
create function private.trip_itinerary_day_in_trip()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_from date;
  v_to   date;
begin
  if tg_op = 'UPDATE' and new.day = old.day and new.trip_id = old.trip_id then
    return new;
  end if;

  select e.starts_on, e.ends_on into v_from, v_to
    from public.calendar_events e
   where e.id = new.trip_id;

  if found and (new.day < v_from or new.day > coalesce(v_to, v_from)) then
    raise exception 'o dia % está fora da viagem (% a %)', new.day, v_from, v_to
      using errcode = '23514', constraint = 'trip_itinerary_day_in_trip', hint = 'trip_itinerary_day_in_trip';
  end if;
  return new;
end;
$$;

-- I13 — os tetos por viagem: 200 itens de roteiro, 20 de preparação, 12
-- linhas de orçamento, 500 fotos. A trava na linha de `trips` serializa duas
-- inserções concorrentes (as duas pessoas adicionando ao mesmo tempo): sem
-- ela, cada uma conta 199 e as duas passam. FOR NO KEY UPDATE basta — conflita
-- consigo mesma e não com o KEY SHARE das FKs (como `list_photos_max`). Depois
-- de esperar, a contagem (consulta nova, READ COMMITTED) já vê o que a outra
-- gravou; numa inserção de várias linhas, vê as anteriores do mesmo comando.
--
-- Uma função por tabela, e não uma genérica com a tabela no argumento: o
-- número do teto fica legível no `prosrc`, que o A1 lê.
create function private.trip_itinerary_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.trips where event_id = new.trip_id for no key update;
  if (select count(*) from public.trip_itinerary_items where trip_id = new.trip_id) >= 200 then
    raise exception 'a viagem já tem 200 itens de roteiro'
      using errcode = '23514', constraint = 'trip_itinerary_limit', hint = 'trip_itinerary_limit';
  end if;
  return new;
end;
$$;

create function private.trip_prep_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.trips where event_id = new.trip_id for no key update;
  if (select count(*) from public.trip_prep_items where trip_id = new.trip_id) >= 20 then
    raise exception 'a viagem já tem 20 itens de preparação'
      using errcode = '23514', constraint = 'trip_prep_limit', hint = 'trip_prep_limit';
  end if;
  return new;
end;
$$;

create function private.trip_budget_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.trips where event_id = new.trip_id for no key update;
  if (select count(*) from public.trip_budget_lines where trip_id = new.trip_id) >= 12 then
    raise exception 'a viagem já tem 12 linhas de orçamento'
      using errcode = '23514', constraint = 'trip_budget_limit', hint = 'trip_budget_limit';
  end if;
  return new;
end;
$$;

create function private.trip_photos_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.trips where event_id = new.trip_id for no key update;
  if (select count(*) from public.trip_photos where trip_id = new.trip_id) >= 500 then
    raise exception 'a viagem já tem 500 fotos'
      using errcode = '23514', constraint = 'trip_photos_limit', hint = 'trip_photos_limit';
  end if;
  return new;
end;
$$;

-- I2 — a linha de `trips` de um evento, e os cinco itens de preparação padrão
-- (DEFAULT_PREP, na ordem, `position` 0..4) SÓ quando a linha nasce aqui: um
-- evento que deixou de ser dos dois e voltou já tem a dele, com a preparação
-- que o casal editou. Um lugar só para o trigger e o backfill.
--
-- security INVOKER: roda com quem escreve o evento, então a RLS de `trips` e
-- `trip_prep_items` vale aqui dentro (as policies de insert existem para
-- isto). O service_role não passa por RLS; a migration roda como dona.
create function private.trip_ensure(p_event uuid, p_couple uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.trips (event_id, couple_id)
  values (p_event, p_couple)
  on conflict (event_id) do nothing;

  if found then
    insert into public.trip_prep_items (trip_id, couple_id, kind, label, position)
    values (p_event, p_couple, 'passagens',  'Passagens',     0),
           (p_event, p_couple, 'hospedagem', 'Hospedagem',    1),
           (p_event, p_couple, 'documentos', 'Documentos',    2),
           (p_event, p_couple, 'seguro',     'Seguro viagem', 3),
           (p_event, p_couple, 'malas',      'Malas',         4);
  end if;
end;
$$;

-- O efeito colateral do ADR 0019: um evento que PASSA a ser viagem dos dois
-- (criado assim, ou editado para isso) ganha `trips`. Um que deixa de ser fica
-- com a linha parada — não aparece nas Viagens (R2) e volta a valer se ele
-- voltar a ser.
create function private.calendar_events_trip()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'viagem' and new.travelers = 'both' then
    perform private.trip_ensure(new.id, new.couple_id);
  end if;
  return null;
end;
$$;

revoke execute on function private.trip_member()                from public, anon;
revoke execute on function private.trip_itinerary_day_in_trip() from public, anon;
revoke execute on function private.trip_itinerary_limit()       from public, anon;
revoke execute on function private.trip_prep_limit()            from public, anon;
revoke execute on function private.trip_budget_limit()          from public, anon;
revoke execute on function private.trip_photos_limit()          from public, anon;
revoke execute on function private.trip_ensure(uuid, uuid)      from public, anon;
revoke execute on function private.calendar_events_trip()       from public, anon;
-- Quem escreve nas tabelas executa o trigger: o app e o service_role (painel,
-- harness) — ver o comentário de `couples_started_on_not_future`.
grant  execute on function private.trip_member()                to authenticated, service_role;
grant  execute on function private.trip_itinerary_day_in_trip() to authenticated, service_role;
grant  execute on function private.trip_itinerary_limit()       to authenticated, service_role;
grant  execute on function private.trip_prep_limit()            to authenticated, service_role;
grant  execute on function private.trip_budget_limit()          to authenticated, service_role;
grant  execute on function private.trip_photos_limit()          to authenticated, service_role;
grant  execute on function private.trip_ensure(uuid, uuid)      to authenticated, service_role;
grant  execute on function private.calendar_events_trip()       to authenticated, service_role;

create trigger trips_touch
  before update on public.trips
  for each row execute function private.touch_updated_at();

create trigger trip_memories_touch
  before update on public.trip_memories
  for each row execute function private.touch_updated_at();

create trigger trip_departures_member
  before insert or update on public.trip_departures
  for each row execute function private.trip_member('profile_id');

create trigger trip_memories_member
  before insert or update on public.trip_memories
  for each row execute function private.trip_member('profile_id');

create trigger trip_itinerary_member
  before insert or update on public.trip_itinerary_items
  for each row execute function private.trip_member('created_by');

create trigger trip_photos_member
  before insert or update on public.trip_photos
  for each row execute function private.trip_member('added_by');

create trigger trip_itinerary_day_in_trip
  before insert or update on public.trip_itinerary_items
  for each row execute function private.trip_itinerary_day_in_trip();

create trigger trip_itinerary_limit
  before insert on public.trip_itinerary_items
  for each row execute function private.trip_itinerary_limit();

create trigger trip_prep_limit
  before insert on public.trip_prep_items
  for each row execute function private.trip_prep_limit();

create trigger trip_budget_limit
  before insert on public.trip_budget_lines
  for each row execute function private.trip_budget_limit();

create trigger trip_photos_limit
  before insert on public.trip_photos
  for each row execute function private.trip_photos_limit();

-- AFTER: a linha do evento já existe quando `trips` a referencia.
create trigger calendar_events_trip
  after insert or update of kind, travelers on public.calendar_events
  for each row execute function private.calendar_events_trip();

-- ---------------------------------------------------------------------------
-- RLS. Sempre `couple_id in (select private.my_couple_ids())` — a mesma
-- expressão das outras tabelas e do Storage (I12). O cliente não filtra (ADR
-- 0001). Os dois editam e apagam tudo da viagem; memória, cada um a sua (I11).
--
-- `trips` não tem policy de DELETE: "apagar a viagem é apagar o evento" (I1).
-- Uma linha de `trips` apagada sozinha deixaria um evento `viagem` dos dois sem
-- detalhes (quebra o I2), e o trigger só a recriaria numa edição de tipo ou de
-- quem viaja. A cascata do evento não passa por RLS.
-- ---------------------------------------------------------------------------
alter table public.trips                enable row level security;
alter table public.trip_departures      enable row level security;
alter table public.trip_days            enable row level security;
alter table public.trip_itinerary_items enable row level security;
alter table public.trip_prep_items      enable row level security;
alter table public.trip_budget_lines    enable row level security;
alter table public.trip_memories        enable row level security;
alter table public.trip_photos          enable row level security;

-- trips — o insert existe para o trigger invoker (`trip_ensure`).
create policy "trips_select_member" on public.trips
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "trips_insert_member" on public.trips
  for insert to authenticated
  with check (couple_id in (select private.my_couple_ids()));

create policy "trips_update_member" on public.trips
  for update to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

-- trip_departures
create policy "trip_departures_select_member" on public.trip_departures
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "trip_departures_insert_member" on public.trip_departures
  for insert to authenticated
  with check (couple_id in (select private.my_couple_ids()));

create policy "trip_departures_update_member" on public.trip_departures
  for update to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

create policy "trip_departures_delete_member" on public.trip_departures
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- trip_days
create policy "trip_days_select_member" on public.trip_days
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "trip_days_insert_member" on public.trip_days
  for insert to authenticated
  with check (couple_id in (select private.my_couple_ids()));

create policy "trip_days_update_member" on public.trip_days
  for update to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

create policy "trip_days_delete_member" on public.trip_days
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- trip_itinerary_items — `created_by` é de quem insere, não de quem a pessoa
-- quiser dizer.
create policy "trip_itinerary_select_member" on public.trip_itinerary_items
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "trip_itinerary_insert_member" on public.trip_itinerary_items
  for insert to authenticated
  with check (
    couple_id in (select private.my_couple_ids())
    and created_by = (select auth.uid())
  );

create policy "trip_itinerary_update_member" on public.trip_itinerary_items
  for update to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

create policy "trip_itinerary_delete_member" on public.trip_itinerary_items
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- trip_prep_items — o insert serve também ao trigger invoker.
create policy "trip_prep_select_member" on public.trip_prep_items
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "trip_prep_insert_member" on public.trip_prep_items
  for insert to authenticated
  with check (couple_id in (select private.my_couple_ids()));

create policy "trip_prep_update_member" on public.trip_prep_items
  for update to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

create policy "trip_prep_delete_member" on public.trip_prep_items
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- trip_budget_lines
create policy "trip_budget_select_member" on public.trip_budget_lines
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "trip_budget_insert_member" on public.trip_budget_lines
  for insert to authenticated
  with check (couple_id in (select private.my_couple_ids()));

create policy "trip_budget_update_member" on public.trip_budget_lines
  for update to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

create policy "trip_budget_delete_member" on public.trip_budget_lines
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- trip_memories — os dois leem as duas; cada um grava, edita e apaga só a sua.
create policy "trip_memories_select_member" on public.trip_memories
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "trip_memories_insert_own" on public.trip_memories
  for insert to authenticated
  with check (
    couple_id in (select private.my_couple_ids())
    and profile_id = (select auth.uid())
  );

create policy "trip_memories_update_own" on public.trip_memories
  for update to authenticated
  using (
    couple_id in (select private.my_couple_ids())
    and profile_id = (select auth.uid())
  )
  with check (
    couple_id in (select private.my_couple_ids())
    and profile_id = (select auth.uid())
  );

create policy "trip_memories_delete_own" on public.trip_memories
  for delete to authenticated
  using (
    couple_id in (select private.my_couple_ids())
    and profile_id = (select auth.uid())
  );

-- trip_photos — foto é do casal (ADR 0012): qualquer um dos dois edita a
-- legenda, favorita e apaga. `added_by` é de quem insere.
create policy "trip_photos_select_member" on public.trip_photos
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "trip_photos_insert_member" on public.trip_photos
  for insert to authenticated
  with check (
    couple_id in (select private.my_couple_ids())
    and added_by = (select auth.uid())
  );

create policy "trip_photos_update_member" on public.trip_photos
  for update to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

create policy "trip_photos_delete_member" on public.trip_photos
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- ---------------------------------------------------------------------------
-- Backfill (I2) — os eventos `viagem` dos dois que já existem ganham `trips` e
-- a preparação padrão, pela MESMA função do trigger. A migration roda como
-- dona das tabelas: a RLS não corta aqui.
-- ---------------------------------------------------------------------------
do $$
declare
  v_e record;
begin
  for v_e in
    select id, couple_id from public.calendar_events
     where kind = 'viagem' and travelers = 'both'
     order by created_at
  loop
    perform private.trip_ensure(v_e.id, v_e.couple_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_trip — o _Nova viagem_ numa transação só: o evento `viagem` dos dois
-- com a pintura (por `create_event`, que é quem sabe pintar), a linha de
-- `trips` com os cinco itens de preparação (pelo trigger), a hospedagem e as
-- saídas. Ou tudo, ou nada.
--
-- security INVOKER: a RLS vale aqui dentro, então ela não abre nada que as
-- escritas diretas não abririam, e `public` continua com as doze `security
-- definer` (A20 do onboarding). Existe só pela atomicidade.
--
--   p_trip: {title, city_id, starts_on, ends_on, note, lodging_name,
--            departures: [{profile_id, origin_code, note}]}
--   `couple_id` e `created_by` vêm da sessão, não do payload.
--   sem sessão → 42501 · sem casal → {status:'not_member'}
--   payload que não é objeto, `departures` que não é lista de objetos, uuid
--   inválido, a mesma pessoa duas vezes → 22023
--   formato do evento ou CHECK novo → 23514 · cidade de outro casal → 23514
--   saída de quem não é do casal → 23514 (`trip_member`)
--   → {status:'ok', id}  (id = o do evento = o da viagem)
-- ---------------------------------------------------------------------------
create function public.create_trip(p_trip jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_couple  uuid;
  v_deps    jsonb;
  v_d       jsonb;
  v_profile uuid[] := '{}';
  v_origin  text[] := '{}';
  v_note    text[] := '{}';
  v_result  jsonb;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'create_trip sem sessão' using errcode = '42501';
  end if;

  -- Um casal por pessoa (`couple_members_one_per_profile`, Fase 2).
  select c into v_couple from private.my_couple_ids() as c limit 1;
  if v_couple is null then
    return jsonb_build_object('status', 'not_member');
  end if;

  if jsonb_typeof(p_trip) is distinct from 'object' then
    raise exception 'p_trip precisa ser um objeto' using errcode = '22023';
  end if;
  if jsonb_typeof(p_trip -> 'lodging_name') not in ('string', 'null') then
    raise exception 'lodging_name precisa ser texto ou nulo' using errcode = '22023';
  end if;

  -- Valida as saídas TODAS antes de gravar qualquer coisa (como paint_stays).
  v_deps := coalesce(p_trip -> 'departures', '[]'::jsonb);
  if jsonb_typeof(v_deps) is distinct from 'array' then
    raise exception 'departures precisa ser uma lista' using errcode = '22023';
  end if;
  for v_d in select value from jsonb_array_elements(v_deps) loop
    if jsonb_typeof(v_d) is distinct from 'object'
       or jsonb_typeof(v_d -> 'profile_id') is distinct from 'string'
       or jsonb_typeof(v_d -> 'origin_code') not in ('string', 'null')
       or jsonb_typeof(v_d -> 'note') not in ('string', 'null') then
      raise exception 'saída malformada: %', v_d using errcode = '22023';
    end if;
    begin
      v_profile := v_profile || (v_d ->> 'profile_id')::uuid;
    exception when others then
      raise exception 'saída malformada: %', v_d using errcode = '22023';
    end;
    if (v_d ->> 'profile_id')::uuid = any (v_profile[1 : array_length(v_profile, 1) - 1]) then
      raise exception 'a mesma pessoa em duas saídas: %', v_d ->> 'profile_id' using errcode = '22023';
    end if;
    v_origin := v_origin || (v_d ->> 'origin_code');
    v_note   := v_note   || (v_d ->> 'note');
  end loop;

  -- O evento é sempre `viagem`, dos dois, dia inteiro, e pinta (I1). O resto
  -- do payload não chega ao evento: ninguém cria viagem solo por aqui.
  v_result := public.create_event(
    jsonb_build_object(
      'kind',      'viagem',
      'title',     p_trip -> 'title',
      'city_id',   p_trip -> 'city_id',
      'starts_on', p_trip -> 'starts_on',
      'ends_on',   p_trip -> 'ends_on',
      'note',      p_trip -> 'note',
      'travelers', 'both',
      'all_day',   true
    ),
    true
  );
  if v_result ->> 'status' is distinct from 'ok' then
    return v_result;
  end if;
  v_id := (v_result ->> 'id')::uuid;

  -- O trigger `calendar_events_trip` já criou a linha. Sem ela a hospedagem
  -- sumiria em silêncio — melhor falhar e desfazer o evento junto.
  update public.trips
     set lodging_name = p_trip ->> 'lodging_name'
   where event_id = v_id;
  if not found then
    raise exception 'o evento % não ganhou a linha de trips', v_id using errcode = 'P0001';
  end if;

  insert into public.trip_departures (trip_id, couple_id, profile_id, origin_code, note)
  select v_id, v_couple, v_profile[i], v_origin[i], v_note[i]
    from generate_subscripts(v_profile, 1) as i;

  return jsonb_build_object('status', 'ok', 'id', v_id);
end;
$$;

-- O Postgres concede EXECUTE a PUBLIC por padrão; sem o revoke, anon chama.
revoke all     on function public.create_trip(jsonb) from public, anon;
grant  execute on function public.create_trip(jsonb) to authenticated;
