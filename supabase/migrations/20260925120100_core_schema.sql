-- Fundação (Fase 0). Só o que a derivação do estado do casal precisa:
-- cidades, casal, perfis, membros e estadias. Lista, memórias, eventos e
-- viagens nascem com as fases que têm as telas.
--
-- Spec: .agent/Tasks/fase-0-fundacao.md
-- ADR:  .agent/Decisions/0002-estadia-por-pessoa-estado-derivado.md

-- Necessária para o EXCLUDE de stays: equality (=) sobre uuid num índice gist.
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- cities — cidade é REFERÊNCIA, nunca texto digitado.
-- Duas grafias da mesma cidade ("SJC" e "São José dos Campos") fariam a
-- derivação dizer "Separados" com os dois no mesmo lugar, sem erro nenhum.
-- ---------------------------------------------------------------------------
create table public.cities (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  state_code    text,                     -- 'SP', 'RS'; nulo fora do Brasil
  country_code  text not null,            -- ISO 3166-1 alfa-2
  lat           double precision not null,
  lng           double precision not null,
  created_at    timestamptz not null default now(),
  constraint cities_natural_key unique (name, state_code, country_code),
  constraint cities_lat_range check (lat between -90  and  90),
  constraint cities_lng_range check (lng between -180 and 180)
);

-- ---------------------------------------------------------------------------
-- couples
-- ---------------------------------------------------------------------------
create table public.couples (
  id           uuid primary key default gen_random_uuid(),
  name         text,                      -- 'Gabi & Lana', opcional
  started_on   date not null,             -- início do namoro
  invite_code  text not null unique,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- profiles — home_city_id é NOT NULL de propósito: sem ela a derivação não
-- distingue "juntos em casa" de "viajando juntos", e um fallback silencioso
-- mentiria em vez de falhar.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null,
  color         text not null,
  home_city_id  uuid not null references public.cities (id),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- couple_members — `slot` cobra I8 (um casal tem no máximo dois integrantes)
-- de forma declarativa: dois valores possíveis, únicos por casal. Sem trigger
-- e sem uma segunda função security definer. De quebra é a faixa fixa de cada
-- pessoa no calendário, que hoje está chumbada no componente.
-- ---------------------------------------------------------------------------
create table public.couple_members (
  couple_id   uuid not null references public.couples  (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  slot        smallint not null,
  joined_at   timestamptz not null default now(),
  primary key (couple_id, profile_id),
  constraint couple_members_slot_values check (slot in (1, 2)),
  constraint couple_members_slot_unique unique (couple_id, slot)
);

-- ---------------------------------------------------------------------------
-- stays — o domínio central. Uma pessoa, uma cidade, um intervalo INCLUSIVO
-- nas duas pontas. ends_on nulo = em aberto, nunca "terminou hoje".
-- Nenhuma coluna de estado de casal: ele é derivado (ADR 0002).
-- ---------------------------------------------------------------------------
create table public.stays (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples  (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  city_id     uuid not null references public.cities   (id),
  starts_on   date not null,
  ends_on     date,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),

  constraint stays_ends_after_starts
    check (ends_on is null or ends_on >= starts_on),

  -- Uma pessoa não está em dois lugares no mesmo dia. Com ends_on nulo o
  -- daterange fica superiormente ilimitado, então duas estadias em aberto da
  -- mesma pessoa colidem — que é o desejado.
  constraint stays_no_overlap exclude using gist (
    profile_id with =,
    daterange(starts_on, ends_on, '[]') with &&
  )
);

-- Índice em toda coluna de FK: é o lint que o advisor do Supabase aponta e que
-- a migration 00004 do schema anterior existiu para corrigir.
create index stays_couple_starts_idx      on public.stays (couple_id, starts_on);
create index stays_profile_idx            on public.stays (profile_id);
create index stays_city_idx               on public.stays (city_id);
create index stays_created_by_idx         on public.stays (created_by);
create index couple_members_profile_idx   on public.couple_members (profile_id);
create index profiles_home_city_idx       on public.profiles (home_city_id);
