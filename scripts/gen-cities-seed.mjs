#!/usr/bin/env node
// Gera a migration das cidades brasileiras a partir de duas fontes públicas.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, seção 5 (migration 4)
// ADR:  .agent/Decisions/0007-cidades-brasileiras-por-seed-do-ibge.md
//
// Uso:  node scripts/gen-cities-seed.mjs <saida.sql>
//       IBGE_JSON=… COORDS_CSV=… node scripts/gen-cities-seed.mjs <saida.sql>   (arquivos locais)
//
// .mjs e não .ts: o projeto roda Node 20, que não executa TypeScript sem uma
// dependência a mais — e um script que roda uma vez por ano não paga isso.
//
// A migration gerada é commitada. Regerar é opcional; o SHA-256 das fontes no
// cabeçalho diz de onde cada linha veio.

import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const IBGE_URL = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios'
const COORDS_URL = 'https://raw.githubusercontent.com/kelvins/municipios-brasileiros/main/csv/municipios.csv'

/** @param {string | undefined} path @param {string} url */
async function load(path, url) {
  if (path) return readFile(path, 'utf8')
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

const sha256 = (/** @type {string} */ text) => createHash('sha256').update(text).digest('hex')
const quote = (/** @type {string} */ text) => `'${text.replace(/'/g, "''")}'`

/**
 * UF do município. `microrregiao` vem nula para municípios criados depois da
 * última divisão regional (Boa Esperança do Norte, MT, 2023); a região imediata
 * sempre vem.
 */
function ufOf(/** @type {any} */ m) {
  return m['regiao-imediata']?.['regiao-intermediaria']?.UF?.sigla ?? m.microrregiao?.mesorregiao?.UF?.sigla
}

async function main() {
  const out = process.argv[2]
  if (!out) throw new Error('uso: node scripts/gen-cities-seed.mjs <saida.sql>')

  const ibgeText = await load(process.env.IBGE_JSON, IBGE_URL)
  const coordsText = await load(process.env.COORDS_CSV, COORDS_URL)

  /** @type {Map<number, {lat: number, lng: number}>} */
  const coords = new Map()
  for (const line of coordsText.trim().split('\n').slice(1)) {
    // codigo_ibge,nome,latitude,longitude,... — o nome pode ter vírgula? Não
    // neste dataset, mas as colunas de interesse são as três primeiras
    // numéricas, então lemos pelas pontas.
    const cols = line.split(',')
    coords.set(Number(cols[0]), { lat: Number(cols[2]), lng: Number(cols[3]) })
  }

  const municipios = JSON.parse(ibgeText)
  const rows = municipios
    .map((/** @type {any} */ m) => {
      const c = coords.get(m.id)
      const uf = ufOf(m)
      if (!c || !uf || Number.isNaN(c.lat) || Number.isNaN(c.lng)) {
        throw new Error(`município sem coordenada ou UF: ${m.id} ${m.nome}`)
      }
      return { code: m.id, name: m.nome, uf, ...c }
    })
    .sort((/** @type {any} */ a, /** @type {any} */ b) => a.code - b.code)

  const values = rows
    .map((r) => `  (${quote(r.name)}, ${quote(r.uf)}, 'BR', ${r.lat}, ${r.lng}, ${r.code})`)
    .join(',\n')

  const sql = `-- Fase 2 · 4/5 — municípios brasileiros (ADR 0007). GERADO — não edite à mão.
--
-- Gerador: scripts/gen-cities-seed.mjs
-- Spec:    .agent/Tasks/fase-2-onboarding.md, seção 5 (migration 4)
--
-- Fontes:
--   ${IBGE_URL}
--     sha256 ${sha256(ibgeText)}
--   ${COORDS_URL}
--     sha256 ${sha256(coordsText)}
--
-- ${rows.length} municípios.
--
-- As três cidades do seed da Fase 0 mantêm os UUIDs fixos: o upsert casa pela
-- chave natural (name, state_code, country_code) e só atualiza código e
-- coordenadas. Quem já as referencia não percebe nada.

create extension if not exists unaccent with schema extensions;

alter table public.cities add column ibge_code integer;
alter table public.cities add constraint cities_ibge_code_unique unique (ibge_code);

-- I9: com o IBGE inteiro aqui, o cliente não tem mais por que criar cidade — e
-- \`cities\` é compartilhada entre casais: uma grafia errada de um casal
-- apareceria na busca de todos, sem dono para corrigir.
drop policy "cities_insert_authenticated" on public.cities;

insert into public.cities (name, state_code, country_code, lat, lng, ibge_code) values
${values}
on conflict on constraint cities_natural_key do update
  set ibge_code = excluded.ibge_code,
      lat       = excluded.lat,
      lng       = excluded.lng;

-- Depois do seed, e não antes: é ele que preenche as três cidades da Fase 0.
-- Cidade brasileira sem código do IBGE só entraria por migration escrita à mão
-- — e é exatamente o que este CHECK recusa.
alter table public.cities
  add constraint cities_br_has_ibge_code check (country_code <> 'BR' or ibge_code is not null);

-- ---------------------------------------------------------------------------
-- search_cities — security INVOKER: \`cities\` já é legível por qualquer sessão
-- autenticada, então a função não precisa furar RLS, e não entra na lista de
-- security definer do ADR 0008.
--
-- Prefixo antes de "contém"; empate por nome. Sem índice: ${rows.length} linhas em
-- varredura sequencial com unaccent ficam abaixo de 20 ms.
-- ---------------------------------------------------------------------------
create function public.search_cities(p_query text, p_limit integer default 8)
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
  where char_length(q.term) >= 2
    and lower(extensions.unaccent('extensions.unaccent'::regdictionary, c.name)) like '%' || q.term || '%'
  order by
    (lower(extensions.unaccent('extensions.unaccent'::regdictionary, c.name)) like q.term || '%') desc,
    c.name,
    c.state_code
  limit least(greatest(coalesce(p_limit, 8), 1), 20);
$$;

revoke execute on function public.search_cities(text, integer) from public, anon;
grant  execute on function public.search_cities(text, integer) to authenticated;
`

  await writeFile(out, sql)
  console.log(`${rows.length} municípios → ${out}`)
}

await main()
