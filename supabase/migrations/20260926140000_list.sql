-- Fase 4 · 1/1 — a Lista: itens, memórias por pessoa, fotos do feito.
--
-- Spec: .agent/Tasks/fase-4-lista.md, seções 4 (I1–I8) e 5 (migration)
-- ADR:  .agent/Decisions/0003-lista-tabela-unica-com-check-por-categoria.md
--       (seção "Revisão — 2026-09-26")
--       .agent/Decisions/0012-midia-do-casal-em-bucket-por-casal.md (`item`, `memory`)
--
-- Uma tabela só para as oito categorias, com DOIS formatos cobrados por CHECK
-- (geográfico e mídia). Os limites são os de LIST_LIMITS em src/domain/list.ts
-- e as categorias as de LIST_CATEGORIES em src/domain/settings.ts;
-- supabase/tests/list.test.ts prova a paridade (A1) e roda a mesma tabela de
-- casos que o domínio (A2). Mudou lá, muda aqui.
--
-- Os nomes das constraints são contrato: a fronteira de dados os lê para dizer
-- qual campo falhou (spec, seção 6). Por isso nenhuma fica com nome gerado.

-- ---------------------------------------------------------------------------
-- Auxiliar do CHECK de `highlights`. CHECK não aceita subquery; uma função
-- imutável aceita. Em `private`, fora da API.
-- ---------------------------------------------------------------------------
create function private.all_text_len_le(p_values text[], p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(v is not null and char_length(v) <= p_max), true)
    from unnest(p_values) as v;
$$;

revoke execute on function private.all_text_len_le(text[], integer) from public, anon;
-- CHECK executa com a identidade de quem escreve: o app e o service_role.
grant  execute on function private.all_text_len_le(text[], integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- list_items
-- ---------------------------------------------------------------------------
create table public.list_items (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  category     text not null,
  name         text not null,
  note         text,
  link         text,
  photo_path   text,
  featured     boolean not null default false,
  status       text not null default 'want',
  rating       smallint,
  added_by     uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  done_on      date,
  done_with    text,
  done_solo_by uuid references public.profiles (id) on delete set null,

  -- geográfico: o lugar RESOLVIDO (Photon/IBGE, ADR 0016), não uma referência
  -- a `cities` — a lista não escreve lá (ADR 0007, I12).
  address      text,
  city         text,
  state        text,
  country      text,
  country_code text,
  lat          double precision,
  lng          double precision,
  region       text,
  venue        text,
  highlights   text[] not null default '{}',

  -- mídia
  platform     text,
  seasons      smallint,

  -- Alvo das FKs compostas das filhas: garante que o couple_id repetido nelas
  -- é o do item.
  constraint list_items_id_couple unique (id, couple_id),

  constraint list_items_category check (
    category in ('pais','cidade','restaurante','parque','comida','experiencia','filme','serie')
  ),
  constraint list_items_name       check (char_length(btrim(name)) between 1 and 80),
  constraint list_items_note       check (char_length(note) <= 280),
  -- Vira `href` na tela: só http(s), nunca `javascript:`.
  constraint list_items_link       check (link ~* '^https?://' and char_length(link) <= 300),
  constraint list_items_status     check (status in ('want','done')),
  constraint list_items_rating     check (rating between 1 and 5),
  constraint list_items_done_with  check (done_with in ('both','solo')),
  constraint list_items_address    check (char_length(address) <= 160),
  constraint list_items_country_code check (country_code ~ '^[A-Z]{2}$'),
  constraint list_items_lat        check (lat between -90 and 90),
  constraint list_items_lng        check (lng between -180 and 180),
  constraint list_items_region     check (char_length(region) <= 60),
  constraint list_items_venue      check (char_length(venue) <= 80),
  constraint list_items_highlights check (
    cardinality(highlights) <= 12 and private.all_text_len_le(highlights, 40)
  ),
  constraint list_items_platform   check (char_length(platform) <= 30),
  constraint list_items_seasons    check (seasons between 1 and 99),

  -- I2 — dois formatos. As EXIGÊNCIAS são curtas (coordenada + país; cidade
  -- fora de `pais`; plataforma na mídia). O resto é exclusividade mecânica:
  -- uma linha por coluna que só existe numa categoria.
  constraint list_items_format check (
    ((
      category in ('filme','serie')
      and platform is not null and btrim(platform) <> ''
      and lat is null and lng is null and country_code is null and country is null
      and state is null and city is null and address is null
    )
    or (
      category not in ('filme','serie')
      and lat is not null and lng is not null and country_code is not null
      and platform is null
      and (case when category = 'pais' then city is null else city is not null end)
    ))
    and (seasons is null or category = 'serie')
    and (cardinality(highlights) = 0 or category = 'pais')
    and (region is null or category = 'cidade')
    and (venue  is null or category = 'comida')
  ),

  -- I3 — feito é um estado coerente. `done_on` não futuro é trigger (abaixo):
  -- current_date não é imutável, e CHECK precisa ser.
  constraint list_items_done check (
    (status = 'want'
      and done_on is null and done_with is null and done_solo_by is null and rating is null)
    or (status = 'done'
      and done_on is not null and done_with is not null
      and (done_with = 'solo') = (done_solo_by is not null))
  ),

  -- I6 — a foto do item mora na pasta do próprio casal, na de itens. Fora dela
  -- apontaria para arquivo de outro casal (mesma regra do `cover_path`).
  constraint list_items_photo check (photo_path is null or photo_path like couple_id::text || '/item/%')
);

create index list_items_couple_created_idx on public.list_items (couple_id, created_at desc);
create index list_items_added_by_idx       on public.list_items (added_by);
create index list_items_done_solo_by_idx   on public.list_items (done_solo_by);

-- ---------------------------------------------------------------------------
-- list_memories — uma por pessoa por item (I5). O couple_id repetido deixa a
-- RLS ser a mesma expressão das outras tabelas, sem subquery por item; a FK
-- composta garante que é o do item.
-- ---------------------------------------------------------------------------
create table public.list_memories (
  item_id    uuid not null,
  couple_id  uuid not null,
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (item_id, profile_id),
  constraint list_memories_item foreign key (item_id, couple_id)
    references public.list_items (id, couple_id) on delete cascade,
  constraint list_memories_body check (char_length(btrim(body)) between 1 and 500)
);

create index list_memories_item_couple_idx on public.list_memories (item_id, couple_id);
create index list_memories_couple_idx      on public.list_memories (couple_id);
create index list_memories_profile_idx     on public.list_memories (profile_id);

-- ---------------------------------------------------------------------------
-- list_photos — as fotos do feito, ≤ 10 por item (trigger). Sem updated_at e
-- sem policy de UPDATE: uma foto não muda, sai e entra outra.
-- ---------------------------------------------------------------------------
create table public.list_photos (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null,
  couple_id  uuid not null,
  path       text not null,
  added_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint list_photos_path_unique unique (path),
  constraint list_photos_item foreign key (item_id, couple_id)
    references public.list_items (id, couple_id) on delete cascade,
  constraint list_photos_path check (path like couple_id::text || '/memory/%')
);

create index list_photos_item_couple_idx on public.list_photos (item_id, couple_id);
create index list_photos_couple_idx      on public.list_photos (couple_id);
create index list_photos_added_by_idx    on public.list_photos (added_by);

-- ---------------------------------------------------------------------------
-- Triggers.
-- ---------------------------------------------------------------------------

-- I1 — o item não troca de casal. A RLS já recusaria mover para um casal que
-- não é o de quem escreve; isto cobre também o service_role (painel, scripts).
create function private.list_items_couple_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.couple_id is distinct from old.couple_id then
    raise exception 'o casal de um item não muda'
      using errcode = '23514', constraint = 'list_items_couple_immutable', hint = 'list_items_couple_immutable';
  end if;
  return new;
end;
$$;

-- I4 — quem adicionou e quem fez sozinho são do casal do item, NO MOMENTO da
-- escrita: só se confere o valor novo. Quem saiu do casal continua autor das
-- linhas antigas, e editar outra coluna delas não pode falhar por isso.
--
-- E I3, a parte que CHECK não cobre: `done_on` não futuro, com um dia de folga
-- para o fuso de quem marca. "Hoje" é o do servidor, no fuso do casal.
--
-- security INVOKER, como o `profiles_color_distinct`: a policy de
-- `couple_members` já deixa cada um ler os integrantes do próprio casal, e o
-- service_role não passa por RLS. Definer seria pior: trigger BEFORE roda antes
-- do `with check` da RLS, então um definer responderia "P é do casal X?" para
-- qualquer X — com invoker, casal alheio é invisível e a resposta é sempre não.
create function private.list_items_members()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.added_by is not null
     and (tg_op = 'INSERT' or new.added_by is distinct from old.added_by)
     and not exists (
       select 1 from public.couple_members
        where couple_id = new.couple_id and profile_id = new.added_by
     ) then
    raise exception 'added_by não é integrante do casal do item'
      using errcode = '23514', constraint = 'list_items_member', hint = 'list_items_member';
  end if;

  if new.done_solo_by is not null
     and (tg_op = 'INSERT' or new.done_solo_by is distinct from old.done_solo_by)
     and not exists (
       select 1 from public.couple_members
        where couple_id = new.couple_id and profile_id = new.done_solo_by
     ) then
    raise exception 'done_solo_by não é integrante do casal do item'
      using errcode = '23514', constraint = 'list_items_member', hint = 'list_items_member';
  end if;

  if new.done_on is not null
     and (tg_op = 'INSERT' or new.done_on is distinct from old.done_on)
     and new.done_on > private.today_br() + 1 then
    raise exception 'done_on no futuro: %', new.done_on
      using errcode = '23514', constraint = 'list_items_done_on_future', hint = 'list_items_done_on_future';
  end if;

  return new;
end;
$$;

-- I6 — no máximo 10 fotos por item. A trava na linha do item serializa duas
-- inserções concorrentes (as duas pessoas adicionando fotos ao mesmo tempo):
-- sem ela, cada uma conta 9 e as duas passam. FOR NO KEY UPDATE basta — conflita
-- consigo mesma e não com o KEY SHARE das FKs. Depois de esperar, a contagem
-- (consulta nova, READ COMMITTED) já vê o que a outra gravou; numa inserção de
-- várias linhas, vê as anteriores do mesmo comando.
--
-- security invoker: quem insere já enxerga o item e as fotos do próprio casal.
-- Item de outro casal não é achado, a contagem dá zero e a RLS recusa o insert.
create function private.list_photos_max()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.list_items where id = new.item_id for no key update;

  if (select count(*) from public.list_photos where item_id = new.item_id) >= 10 then
    raise exception 'o item já tem 10 fotos'
      using errcode = '23514', constraint = 'list_photos_limit', hint = 'list_photos_limit';
  end if;
  return new;
end;
$$;

revoke execute on function private.list_items_couple_immutable() from public, anon;
revoke execute on function private.list_items_members()          from public, anon;
revoke execute on function private.list_photos_max()             from public, anon;
-- Quem escreve nas tabelas executa o trigger: o app e o service_role (painel,
-- harness) — ver o comentário de `couples_started_on_not_future`.
grant  execute on function private.list_items_couple_immutable() to authenticated, service_role;
grant  execute on function private.list_items_members()          to authenticated, service_role;
grant  execute on function private.list_photos_max()             to authenticated, service_role;

create trigger list_items_touch
  before update on public.list_items
  for each row execute function private.touch_updated_at();

create trigger list_memories_touch
  before update on public.list_memories
  for each row execute function private.touch_updated_at();

create trigger list_items_couple_immutable
  before update of couple_id on public.list_items
  for each row execute function private.list_items_couple_immutable();

create trigger list_items_members
  before insert or update on public.list_items
  for each row execute function private.list_items_members();

create trigger list_photos_max
  before insert on public.list_photos
  for each row execute function private.list_photos_max();

-- ---------------------------------------------------------------------------
-- RLS. Sempre `couple_id in (select private.my_couple_ids())` — a mesma
-- expressão das outras tabelas e do Storage. O cliente não filtra (ADR 0001).
-- Os dois editam e apagam qualquer item: o acervo é dos dois. Memória, cada um
-- a sua (I5). Foto é do casal (ADR 0012): qualquer um dos dois apaga; a tela é
-- que só oferece remover a quem subiu.
-- ---------------------------------------------------------------------------
alter table public.list_items    enable row level security;
alter table public.list_memories enable row level security;
alter table public.list_photos   enable row level security;

create policy "list_items_select_member" on public.list_items
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- `added_by` é de quem insere, não de quem a pessoa quiser dizer.
create policy "list_items_insert_member" on public.list_items
  for insert to authenticated
  with check (
    couple_id in (select private.my_couple_ids())
    and added_by = (select auth.uid())
  );

create policy "list_items_update_member" on public.list_items
  for update to authenticated
  using      (couple_id in (select private.my_couple_ids()))
  with check (couple_id in (select private.my_couple_ids()));

create policy "list_items_delete_member" on public.list_items
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "list_memories_select_member" on public.list_memories
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "list_memories_insert_own" on public.list_memories
  for insert to authenticated
  with check (
    couple_id in (select private.my_couple_ids())
    and profile_id = (select auth.uid())
  );

create policy "list_memories_update_own" on public.list_memories
  for update to authenticated
  using (
    couple_id in (select private.my_couple_ids())
    and profile_id = (select auth.uid())
  )
  with check (
    couple_id in (select private.my_couple_ids())
    and profile_id = (select auth.uid())
  );

create policy "list_memories_delete_own" on public.list_memories
  for delete to authenticated
  using (
    couple_id in (select private.my_couple_ids())
    and profile_id = (select auth.uid())
  );

create policy "list_photos_select_member" on public.list_photos
  for select to authenticated
  using (couple_id in (select private.my_couple_ids()));

create policy "list_photos_insert_member" on public.list_photos
  for insert to authenticated
  with check (
    couple_id in (select private.my_couple_ids())
    and added_by = (select auth.uid())
  );

create policy "list_photos_delete_member" on public.list_photos
  for delete to authenticated
  using (couple_id in (select private.my_couple_ids()));

-- ---------------------------------------------------------------------------
-- mark_item_done — marcar como feito numa transação só (I7): status, data,
-- quem estava, nota, a memória de quem chama e as fotos, ou nada.
--
-- security INVOKER: a RLS vale aqui dentro, então ela não abre nada que as
-- escritas diretas não abririam, e `public` continua com as doze `security
-- definer` da Fase 3 (A10). Existe só pela atomicidade. CHECK e triggers
-- (formato, coerência do feito, integrante, data futura, 10 fotos, caminho)
-- propagam o erro e desfazem tudo.
-- ---------------------------------------------------------------------------
create function public.mark_item_done(
  p_item        uuid,
  p_done_on     date,
  p_done_with   text,
  p_solo_by     uuid,
  p_rating      smallint,
  p_memory      text,
  p_photo_paths text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_item   public.list_items;
  v_memory text := nullif(btrim(p_memory), '');
begin
  if v_uid is null then
    raise exception 'mark_item_done sem sessão' using errcode = '42501';
  end if;

  -- FOR UPDATE: as duas pessoas marcando ao mesmo tempo — a segunda espera o
  -- commit da primeira e relê a linha já `done`.
  select * into v_item from public.list_items where id = p_item for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_item.status = 'done' then
    return jsonb_build_object('status', 'already_done');
  end if;

  update public.list_items
     set status       = 'done',
         done_on      = p_done_on,
         done_with    = p_done_with,
         done_solo_by = p_solo_by,
         rating       = p_rating
   where id = p_item;

  if v_memory is not null then
    insert into public.list_memories (item_id, couple_id, profile_id, body)
    values (p_item, v_item.couple_id, v_uid, v_memory)
    on conflict (item_id, profile_id) do update set body = excluded.body;
  end if;

  insert into public.list_photos (item_id, couple_id, path, added_by)
  select p_item, v_item.couple_id, p.path, v_uid
    from unnest(coalesce(p_photo_paths, '{}'::text[])) with ordinality as p (path, n)
   order by p.n;

  return jsonb_build_object('status', 'done');
end;
$$;

-- O Postgres concede EXECUTE a PUBLIC por padrão; sem o revoke, anon chama.
revoke all     on function public.mark_item_done(uuid, date, text, uuid, smallint, text, text[]) from public, anon;
grant  execute on function public.mark_item_done(uuid, date, text, uuid, smallint, text, text[]) to authenticated;
