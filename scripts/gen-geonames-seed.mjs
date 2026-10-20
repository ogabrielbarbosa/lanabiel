#!/usr/bin/env node
// Gera a migration das cidades do mundo (fora do Brasil) a partir do GeoNames.
//
// ADR:      .agent/Decisions/0029-cidades-do-mundo-por-seed-do-geonames.md
// Research: .agent/Research/lista-adicionar-simples.md
//
// Uso:  node scripts/gen-geonames-seed.mjs <dir> <saida.sql>
//   <dir> tem, descompactados de https://download.geonames.org/export/dump/:
//     cities15000.txt, alternateNamesV2.txt, admin1CodesASCII.txt
//
// O Brasil fica de fora: cidade brasileira é sempre a do IBGE (ADR 0007).
// O nome em português vem do `alternateNamesV2` (isolanguage `pt`, o
// preferido primeiro, sem histórico nem coloquial); sem ele, o nome do GeoNames.
// Licença: CC BY 4.0 (GeoNames) — a atribuição fica no cabeçalho e nos créditos.
//
// .mjs, como o gen-cities-seed: roda uma vez, não paga dependência.

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

const [dir, out] = process.argv.slice(2)
if (!dir || !out) {
  console.error('uso: node scripts/gen-geonames-seed.mjs <dir> <saida.sql>')
  process.exit(1)
}

const SKIP_FEATURES = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW'])

const quote = (/** @type {string} */ text) => `'${text.replace(/'/g, "''")}'`
const sha256 = (/** @type {Buffer} */ buf) => createHash('sha256').update(buf).digest('hex')

const citiesRaw = await readFile(join(dir, 'cities15000.txt'))
const admin1Raw = await readFile(join(dir, 'admin1CodesASCII.txt'))

/** `ZA.11` → `Western Cape`. */
const admin1 = new Map()
for (const line of admin1Raw.toString('utf8').split('\n')) {
  const [code, name] = line.split('\t')
  if (code && name) admin1.set(code, name)
}

/** @type {Map<number, {name: string, country: string, region: string | null, lat: number, lng: number, population: number}>} */
const cities = new Map()
for (const line of citiesRaw.toString('utf8').split('\n')) {
  const f = line.split('\t')
  if (f.length < 15) continue
  const country = f[8]
  if (country === 'BR' || !/^[A-Z]{2}$/.test(country)) continue
  // Seção de cidade (os 20 arrondissements de Paris), histórica, abandonada ou destruída.
  if (SKIP_FEATURES.has(f[7])) continue
  const id = Number(f[0])
  const lat = Number(f[4])
  const lng = Number(f[5])
  if (!Number.isSafeInteger(id) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
  cities.set(id, {
    name: f[1],
    country,
    region: admin1.get(`${country}.${f[10]}`) ?? null,
    lat,
    lng,
    population: Number(f[14]) || 0,
  })
}

// alternateNameId, geonameid, isolanguage, alternate name, isPreferredName, isShortName, isColloquial, isHistoric
/** @type {Map<number, {name: string, score: number}>} */
const pt = new Map()
const altHash = createHash('sha256')
const stream = createReadStream(join(dir, 'alternateNamesV2.txt'))
stream.on('data', (chunk) => altHash.update(chunk))
for await (const line of createInterface({ input: stream, crlfDelay: Infinity })) {
  const f = line.split('\t')
  if (f[2] !== 'pt') continue
  const id = Number(f[1])
  if (!cities.has(id) || f[6] === '1' || f[7] === '1') continue
  const score = (f[4] === '1' ? 2 : 0) + (f[5] === '1' ? 0 : 1)
  const prev = pt.get(id)
  if (!prev || score > prev.score) pt.set(id, { name: f[3].trim(), score })
}

const rows = [...cities.entries()]
  .map(([id, c]) => ({ id, ...c, name: pt.get(id)?.name || c.name }))
  .filter((c) => c.name.length > 0 && c.name.length <= 120)
  .sort((a, b) => a.country.localeCompare(b.country) || b.population - a.population)

const values = rows.map(
  (c) =>
    `(${c.id},${quote(c.name)},'${c.country}',${c.region ? quote(c.region) : 'null'},${c.lat},${c.lng},${c.population})`,
)

const CHUNK = 1000
const inserts = []
for (let i = 0; i < values.length; i += CHUNK) {
  inserts.push(
    `insert into public.geo_cities (geoname_id, name, country_code, region, lat, lng, population) values\n${values
      .slice(i, i + CHUNK)
      .join(',\n')};`,
  )
}

const header = `-- Cidades do mundo, fora do Brasil, pelo GeoNames (ADR 0029). GERADO — não edite à mão.
--
-- Gerador: scripts/gen-geonames-seed.mjs
-- Fontes (https://download.geonames.org/export/dump/, CC BY 4.0, "GeoNames"):
--   cities15000.txt        sha256 ${sha256(citiesRaw)}
--   alternateNamesV2.txt   sha256 ${altHash.digest('hex')}
--   admin1CodesASCII.txt   sha256 ${sha256(admin1Raw)}
--
-- ${rows.length} cidades com 15 mil habitantes ou mais, ${pt.size} com nome em português.
--
-- Tabela de REFERÊNCIA, só leitura: o seletor de cidades da Home num país de
-- fora e o "Países e cidades" da Lista leem daqui. Não é \`cities\` (ADR 0017):
-- nada referencia esta tabela por FK, e a Lista grava nome e coordenada nas
-- colunas do próprio item, como sempre.

create table public.geo_cities (
  geoname_id    integer primary key,
  name          text not null,
  country_code  text not null,
  region        text,
  lat           double precision not null,
  lng           double precision not null,
  population    integer not null default 0,
  constraint geo_cities_country check (country_code ~ '^[A-Z]{2}$' and country_code <> 'BR'),
  constraint geo_cities_lat_range check (lat between -90 and 90),
  constraint geo_cities_lng_range check (lng between -180 and 180)
);

create index geo_cities_country_pop_idx on public.geo_cities (country_code, population desc);

alter table public.geo_cities enable row level security;

-- Dado público de referência: qualquer sessão lê, ninguém escreve pelo cliente.
create policy "geo_cities_select_authenticated" on public.geo_cities
  for select to authenticated using (true);

revoke insert, update, delete, truncate on public.geo_cities from anon, authenticated;
`

await writeFile(out, `${header}\n${inserts.join('\n\n')}\n`)
console.log(`${rows.length} cidades, ${pt.size} com nome pt → ${out}`)
