-- Fase 5 · 1/2 — cidades do mundo em `cities`, como linhas do casal.
--
-- Spec: .agent/Tasks/fase-5-calendario.md, I2 e seção 5 (migration 1)
-- ADR:  .agent/Decisions/0017-cidades-do-mundo-por-casal.md
--       (revisa em parte o 0007: a escrita em `cities` volta a existir para o
--       cliente, mas só num recorte que ninguém de fora do casal lê)
--
-- A faixa "Lisboa, Portugal" do Calendário precisa de uma linha em `cities`:
-- `stays.city_id` é FK, e a derivação do ADR 0002 compara identidade de
-- cidade. O motivo do 0007 para fechar a escrita continua certo — `cities` é
-- compartilhada, e uma grafia errada de um casal apareceria na busca de todos.
-- Por isso a cidade estrangeira pertence a UM casal (`couple_id`) e só ele a lê.
--
-- Antes do push: `select count(*) from cities where country_code <> 'BR'`
-- (esperado 0). Tudo aqui é aditivo, exceto a policy de select, que é trocada
-- por uma mais estreita.

alter table public.cities
  add column couple_id uuid references public.couples (id) on delete cascade,
  -- `N`/`W`/`R` + o `osm_id` do Photon: a chave de dedupe dentro do casal.
  add column osm_ref   text,
  -- Província ou estado fora do Brasil. Só para exibir; a UF continua em
  -- `state_code`, que é do IBGE.
  add column region    text,

  add constraint cities_osm_ref check (osm_ref ~ '^[NWR][0-9]+$'),
  add constraint cities_region  check (char_length(region) <= 80),

  -- I2. Junto com `cities_br_has_ibge_code` (Fase 2), garante que cidade
  -- brasileira é SEMPRE a linha do IBGE: o cliente não consegue criar uma
  -- segunda Marau, e a derivação nunca diz "Separados" para dois registros da
  -- mesma cidade.
  --
  -- `state_code` e `ibge_code` nulos na linha do casal: os dois são do IBGE.
  -- Sem isso, `cities_natural_key (name, state_code, country_code)` — que só é
  -- inofensiva entre casais porque o NULL de `state_code` é distinto — viraria
  -- uma colisão ENTRE casais: o insert de um falharia por causa da linha
  -- invisível do outro, e a falha em si diria que ela existe.
  add constraint cities_scope check (
    couple_id is null
    or (
      osm_ref is not null
      and country_code <> 'BR'
      and country_code ~ '^[A-Z]{2}$'
      and state_code is null
      and ibge_code is null
    )
  ),

  -- Os dois integrantes escolhendo Lisboa, até ao mesmo tempo, terminam no
  -- mesmo `id`: o cliente faz `insert … on conflict do nothing` e lê o `id`
  -- pela `osm_ref`. As linhas do IBGE (`couple_id` e `osm_ref` nulos) não
  -- colidem entre si: NULL é distinto num unique.
  add constraint cities_osm_unique unique (couple_id, osm_ref);

-- Sem `cities_couple_idx` à parte: o índice de `cities_osm_unique` começa por
-- `couple_id` e já serve à FK (o `on delete cascade` de `couples`) e à RLS.

-- ---------------------------------------------------------------------------
-- RLS. Leitura: as globais (IBGE) e as do próprio casal. Escrita: só `insert`,
-- só cidade de fora (o `cities_scope` cobra o país), só no próprio casal.
-- Sem update e sem delete: uma cidade referenciada não muda de nome embaixo de
-- uma estadia; a linha morre com o casal (cascade).
-- ---------------------------------------------------------------------------
drop policy "cities_select_authenticated" on public.cities;

create policy "cities_select_global_or_couple" on public.cities
  for select to authenticated
  using (couple_id is null or couple_id in (select private.my_couple_ids()));

create policy "cities_insert_world_couple" on public.cities
  for insert to authenticated
  with check (
    couple_id in (select private.my_couple_ids())
    and osm_ref is not null
  );

-- ---------------------------------------------------------------------------
-- search_cities — a busca por nome continua SÓ no IBGE (`couple_id is null`).
-- A RLS já esconderia as cidades de outro casal; o filtro tira também as do
-- próprio: a cidade estrangeira se acha pelo Photon, e duas fontes para ela na
-- mesma lista mostrariam Lisboa duas vezes.
-- ---------------------------------------------------------------------------
create or replace function public.search_cities(p_query text, p_limit integer default 8)
returns setof public.cities
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select lower(extensions.unaccent('extensions.unaccent'::regdictionary, btrim(coalesce(p_query, '')))) as term
  )
  select c.*
  from public.cities c, q
  where c.couple_id is null
    and char_length(q.term) >= 2
    and lower(extensions.unaccent('extensions.unaccent'::regdictionary, c.name)) like '%' || q.term || '%'
  order by
    (lower(extensions.unaccent('extensions.unaccent'::regdictionary, c.name)) like q.term || '%') desc,
    c.name,
    c.state_code
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

revoke execute on function public.search_cities(text, integer) from public, anon;
grant  execute on function public.search_cities(text, integer) to authenticated;
