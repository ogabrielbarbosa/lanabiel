-- Viagem solo e capa do Unsplash (ADR 0025, supersede parte do 0019).
--
-- (1) Toda `viagem` vira viagem nas Viagens, dos dois OU de um só: o trigger
--     deixa de exigir `travelers = 'both'`, e o backfill cobre as solo que já
--     existam (no dia desta migration: nenhuma `viagem` no banco).
-- (2) `create_trip` aceita `travelers` e `traveler_id` do payload. Quem valida o
--     par é `create_event` (CHECK `calendar_events_format` e o trigger de
--     integrante), como no Novo evento do Calendário.
-- (3) `trips` ganha a capa de banco de imagens: URL do Unsplash, autor e link
--     do autor, os três juntos ou nenhum. A imagem NÃO é copiada para o bucket:
--     as regras da API do Unsplash exigem a URL deles e o crédito na tela.
--
-- Reversível: a coluna nova é nula em toda linha antiga, e voltar o trigger e a
-- RPC à versão de 20260927120000 restaura o comportamento (as `trips` de
-- viagem solo ficariam paradas, como as de um evento que deixa de ser dos dois).

alter table public.trips
  add column cover_stock_url        text,
  add column cover_stock_author     text,
  add column cover_stock_author_url text,
  -- Vira `src` e `href` na tela: só os domínios do Unsplash, nunca `javascript:`.
  add constraint trip_cover_stock_url check (
    cover_stock_url ~ '^https://images\.unsplash\.com/' and char_length(cover_stock_url) <= 1000
  ),
  add constraint trip_cover_stock_author_url check (
    cover_stock_author_url ~ '^https://unsplash\.com/' and char_length(cover_stock_author_url) <= 300
  ),
  add constraint trip_cover_stock_author_len check (char_length(btrim(cover_stock_author)) between 1 and 120),
  -- Foto sem crédito descumpre a licença; crédito sem foto é lixo.
  add constraint trip_cover_stock_whole check (
    (cover_stock_url is null) = (cover_stock_author is null)
    and (cover_stock_url is null) = (cover_stock_author_url is null)
  );

-- (1) O trigger: toda `viagem` ganha `trips`.
create or replace function private.calendar_events_trip()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'viagem' then
    perform private.trip_ensure(new.id, new.couple_id);
  end if;
  return null;
end;
$$;

do $$
declare
  v_e record;
begin
  for v_e in
    select id, couple_id from public.calendar_events
     where kind = 'viagem'
     order by created_at
  loop
    perform private.trip_ensure(v_e.id, v_e.couple_id);
  end loop;
end;
$$;

-- (2) create_trip — como em 20260927120000, mais:
--   p_trip.travelers: 'both' | 'solo' (ausente = 'both', o cliente antigo)
--   p_trip.traveler_id: uuid de quem viaja, só com 'solo'
--   p_trip.cover_stock: {url, author, author_url} | null
--   `lodging_name` e `departures` continuam opcionais; a Nova viagem não os
--   manda mais, o Detalhe edita a hospedagem.
create or replace function public.create_trip(p_trip jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_couple    uuid;
  v_deps      jsonb;
  v_d         jsonb;
  v_profile   uuid[] := '{}';
  v_origin    text[] := '{}';
  v_note      text[] := '{}';
  v_travelers jsonb;
  v_stock     jsonb;
  v_result    jsonb;
  v_id        uuid;
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

  v_travelers := coalesce(p_trip -> 'travelers', '"both"'::jsonb);
  if jsonb_typeof(v_travelers) is distinct from 'string' then
    raise exception 'travelers precisa ser texto' using errcode = '22023';
  end if;

  v_stock := p_trip -> 'cover_stock';
  if v_stock = 'null'::jsonb then
    v_stock := null;
  end if;
  if v_stock is not null and (
       jsonb_typeof(v_stock) is distinct from 'object'
       or jsonb_typeof(v_stock -> 'url') is distinct from 'string'
       or jsonb_typeof(v_stock -> 'author') is distinct from 'string'
       or jsonb_typeof(v_stock -> 'author_url') is distinct from 'string') then
    raise exception 'cover_stock malformado: %', v_stock using errcode = '22023';
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

  -- O evento é sempre `viagem`, dia inteiro, e pinta (I1) — a de quem viaja.
  v_result := public.create_event(
    jsonb_build_object(
      'kind',        'viagem',
      'title',       p_trip -> 'title',
      'city_id',     p_trip -> 'city_id',
      'starts_on',   p_trip -> 'starts_on',
      'ends_on',     p_trip -> 'ends_on',
      'note',        p_trip -> 'note',
      'travelers',   v_travelers,
      'traveler_id', coalesce(p_trip -> 'traveler_id', 'null'::jsonb),
      'all_day',     true
    ),
    true
  );
  if v_result ->> 'status' is distinct from 'ok' then
    return v_result;
  end if;
  v_id := (v_result ->> 'id')::uuid;

  -- O trigger `calendar_events_trip` já criou a linha. Sem ela a hospedagem e
  -- a capa sumiriam em silêncio — melhor falhar e desfazer o evento junto.
  update public.trips
     set lodging_name           = p_trip ->> 'lodging_name',
         cover_stock_url        = v_stock ->> 'url',
         cover_stock_author     = v_stock ->> 'author',
         cover_stock_author_url = v_stock ->> 'author_url'
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

-- `create or replace` mantém os grants, mas repetir não custa e documenta.
revoke all     on function public.create_trip(jsonb) from public, anon;
grant  execute on function public.create_trip(jsonb) to authenticated;
