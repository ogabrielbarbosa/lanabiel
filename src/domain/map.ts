// O mapa da Home (Fase 7): pins, regiões, câmera e os números do painel.
//
// Spec: .agent/Tasks/fase-7-mapa.md, seções 3–5 (I2–I11)
// ADR:  .agent/Decisions/0022-engine-do-mapa-mapbox.md
//
// Puro: sem Supabase e sem Mapbox. A engine recebe o que sai daqui (`Pin`,
// `Camera`) e o agrupamento em tela (o "+8") é dela, porque depende da
// projeção. Tudo o que o painel mostra é derivado pelas funções que já existem
// (`runs`, `countDrawn`, `countStates`, `tripTotals`) — nada de caminho
// paralelo (I2).

import { addDays, daysInclusive, diffDays, isoOf, localDateOf } from '../lib/date'
import { countDrawn, runAround, runs } from './calendar'
import type { CityMap, MembersBySlot, Run } from './calendar'
import { countStates, stayOn } from './coupleState'
import type { Stay } from './coupleState'
import { MEDIA_CATEGORIES } from './list'
import type { ListCategory, ListItem, ListMemory } from './list'
import type { LatLng } from './onboarding'
import { tripDays, tripStatus } from './tripDerive'
import type { Trip, TripMemory } from './trips'

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** _Aqui por perto_ (R13): o raio a partir do centro da cidade em foco. */
export const NEARBY_MAP_KM = 150
/** Pins a menos disso na tela viram um grupo (R11). Usado pela engine. */
export const CLUSTER_PX = 44
/** Circunferência da Terra no equador, em km (I11). */
export const EARTH_KM = 40_075

export const GEO_CATEGORIES = [
  'pais',
  'cidade',
  'restaurante',
  'parque',
  'comida',
  'experiencia',
] as const satisfies readonly ListCategory[]
export type GeoCategory = (typeof GEO_CATEGORIES)[number]

export function isGeoCategory(category: ListCategory): category is GeoCategory {
  return !(MEDIA_CATEGORIES as readonly ListCategory[]).includes(category)
}

/** As 27 UFs: nome e um centro para a câmera de estado sem pins (I6). */
export const BR_STATES = {
  AC: { name: 'Acre', lat: -9.0, lng: -70.5 },
  AL: { name: 'Alagoas', lat: -9.6, lng: -36.6 },
  AP: { name: 'Amapá', lat: 1.4, lng: -51.8 },
  AM: { name: 'Amazonas', lat: -4.2, lng: -64.6 },
  BA: { name: 'Bahia', lat: -12.5, lng: -41.7 },
  CE: { name: 'Ceará', lat: -5.2, lng: -39.5 },
  DF: { name: 'Distrito Federal', lat: -15.8, lng: -47.9 },
  ES: { name: 'Espírito Santo', lat: -19.6, lng: -40.7 },
  GO: { name: 'Goiás', lat: -15.9, lng: -49.8 },
  MA: { name: 'Maranhão', lat: -5.0, lng: -45.3 },
  MT: { name: 'Mato Grosso', lat: -12.9, lng: -55.9 },
  MS: { name: 'Mato Grosso do Sul', lat: -20.5, lng: -54.8 },
  MG: { name: 'Minas Gerais', lat: -18.5, lng: -44.6 },
  PA: { name: 'Pará', lat: -3.8, lng: -52.5 },
  PB: { name: 'Paraíba', lat: -7.2, lng: -36.8 },
  PR: { name: 'Paraná', lat: -24.6, lng: -51.6 },
  PE: { name: 'Pernambuco', lat: -8.4, lng: -37.9 },
  PI: { name: 'Piauí', lat: -7.4, lng: -42.7 },
  RJ: { name: 'Rio de Janeiro', lat: -22.3, lng: -42.7 },
  RN: { name: 'Rio Grande do Norte', lat: -5.8, lng: -36.6 },
  RS: { name: 'Rio Grande do Sul', lat: -29.7, lng: -53.2 },
  RO: { name: 'Rondônia', lat: -10.9, lng: -62.8 },
  RR: { name: 'Roraima', lat: 2.1, lng: -61.4 },
  SC: { name: 'Santa Catarina', lat: -27.3, lng: -50.4 },
  SP: { name: 'São Paulo', lat: -22.3, lng: -48.7 },
  SE: { name: 'Sergipe', lat: -10.6, lng: -37.4 },
  TO: { name: 'Tocantins', lat: -10.2, lng: -48.3 },
} as const satisfies Record<string, { name: string; lat: number; lng: number }>
export type Uf = keyof typeof BR_STATES

// ---------------------------------------------------------------------------
// Nomes (I4, I9)
// ---------------------------------------------------------------------------

/** Sem acento, minúsculas, espaços colapsados — a comparação de cidade (I4). */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const UF_BY_NAME = new Map<string, Uf>(
  (Object.entries(BR_STATES) as [Uf, { name: string }][]).map(([uf, s]) => [normalizeName(s.name), uf]),
)

/** `'SP'`, `'sp'` ou `'São Paulo'` → `'SP'`; o resto → `null`. */
export function ufOf(state: string | null): Uf | null {
  if (!state) return null
  const upper = state.trim().toUpperCase()
  if (upper in BR_STATES) return upper as Uf
  return UF_BY_NAME.get(normalizeName(state)) ?? null
}

const MINOR_WORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])

/**
 * I9: 3+ palavras significativas → iniciais (_SJC_); 2 → as duas iniciais e a
 * última letra da segunda (_SPO_); 1 → as três primeiras letras (_UBA_).
 *
 * Nome de 3+ palavras em que a partícula conta para chegar a três (_Campos do
 * Jordão_ → _CDJ_, não _CJO_): as iniciais de todas as palavras. É o que o A6
 * pede; _São José dos Campos_ continua _SJC_ porque já tem três significativas.
 */
export function cityCode(name: string): string {
  const plain = name.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const all = plain.split(/[\s-]+/).filter((w) => w !== '')
  const words = all.filter((w) => !MINOR_WORDS.has(w.toLowerCase()))
  let code: string
  if (words.length >= 3) code = words.map((w) => w[0]).join('')
  else if (all.length >= 3) code = all.map((w) => w[0]).join('')
  else if (words.length === 2) code = words[0][0] + words[1][0] + words[1][words[1].length - 1]
  else code = (words[0] ?? plain).slice(0, 3)
  return code.toUpperCase()
}

/** O nome do país em português (`'PT'` → `'Portugal'`). */
export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

// ---------------------------------------------------------------------------
// Pins e filtros (I3, I4)
// ---------------------------------------------------------------------------

export interface Pin {
  item: ListItem
  category: GeoCategory
  lat: number
  lng: number
  countryCode: string
  /** Só no Brasil (I4). */
  uf: Uf | null
  /** `null` em `pais` e em item sem cidade. */
  cityKey: string | null
  cityName: string | null
}

export type StatusFilter = 'all' | 'want' | 'done'
export interface MapFilters {
  status: StatusFilter
  category: 'all' | GeoCategory
}
export const DEFAULT_FILTERS: MapFilters = { status: 'all', category: 'all' }

/** A chave de cidade do I4: país, UF (só BR) e o nome normalizado. */
export function cityKeyOf(countryCode: string, uf: string | null, name: string): string {
  return `${countryCode}:${countryCode === 'BR' ? (uf ?? '') : ''}:${normalizeName(name)}`
}

/** Um item vira pin? (sem os filtros — I3). */
export function pinOf(item: ListItem): Pin | null {
  if (!isGeoCategory(item.category) || item.place === null) return null
  const p = item.place
  const countryCode = p.countryCode.toUpperCase()
  const uf = countryCode === 'BR' ? ufOf(p.state) : null
  const hasCity = item.category !== 'pais' && p.city !== null && p.city.trim() !== ''
  return {
    item,
    category: item.category,
    lat: p.lat,
    lng: p.lng,
    countryCode,
    uf,
    cityKey: hasCity ? cityKeyOf(countryCode, uf, p.city as string) : null,
    cityName: hasCity ? (p.city as string).trim() : null,
  }
}

/** Os geográficos com coordenada, sem as categorias ocultas (antes dos filtros). */
export function allPins(items: readonly ListItem[], hidden: readonly ListCategory[]): Pin[] {
  const out: Pin[] = []
  for (const item of items) {
    if (hidden.includes(item.category)) continue
    const pin = pinOf(item)
    if (pin) out.push(pin)
  }
  return out
}

export function applyFilters(pins: readonly Pin[], filters: MapFilters): Pin[] {
  return pins.filter(
    (p) =>
      (filters.category === 'all' || p.category === filters.category) &&
      (filters.status === 'all' || p.item.status === filters.status),
  )
}

/** I3: o que a engine desenha. */
export function pinsOf(items: readonly ListItem[], hidden: readonly ListCategory[], filters: MapFilters): Pin[] {
  return applyFilters(allPins(items, hidden), filters)
}

/** R12: as contagens de status contam os pins sob o filtro de categoria. */
export function statusCounts(
  items: readonly ListItem[],
  hidden: readonly ListCategory[],
  category: MapFilters['category'],
): { all: number; want: number; done: number } {
  const pins = applyFilters(allPins(items, hidden), { status: 'all', category })
  const done = pins.filter((p) => p.item.status === 'done').length
  return { all: pins.length, want: pins.length - done, done }
}

/** R12: os chips de categoria — as geográficas visíveis, na ordem de `LIST_CATEGORIES`. */
export function categoryChips(hidden: readonly ListCategory[]): GeoCategory[] {
  return GEO_CATEGORIES.filter((c) => !hidden.includes(c))
}

// ---------------------------------------------------------------------------
// Níveis, caminho e regiões (R6–R9)
// ---------------------------------------------------------------------------

export type MapLevel = 'world' | 'country' | 'state' | 'city'

export interface FocusPath {
  countryCode: string | null
  /** Só Brasil. */
  uf: Uf | null
  cityKey: string | null
  cityName: string | null
  /** O de `cities`, quando a cidade existe lá. */
  cityId: string | null
  /** Centro conhecido da cidade (de `cities`), quando há. */
  cityCenter: LatLng | null
}

export interface MapView {
  level: MapLevel
  path: FocusPath
}

export const EMPTY_PATH: FocusPath = {
  countryCode: null,
  uf: null,
  cityKey: null,
  cityName: null,
  cityId: null,
  cityCenter: null,
}

/** O caminho de uma cidade de `cities` (R7: a de quem vê; R2: `mapFocus`). */
export function pathOfCity(city: { id: string; name: string; stateCode: string | null; countryCode: string; lat: number; lng: number }): FocusPath {
  const countryCode = city.countryCode.toUpperCase()
  const uf = countryCode === 'BR' ? ufOf(city.stateCode) : null
  return {
    countryCode,
    uf,
    cityKey: cityKeyOf(countryCode, uf, city.name),
    cityName: city.name,
    cityId: city.id,
    cityCenter: { lat: city.lat, lng: city.lng },
  }
}

/** O caminho da cidade de um pin (R2 `item`). `pais` → só o país. */
export function pathOfPin(pin: Pin): FocusPath {
  return {
    countryCode: pin.countryCode,
    uf: pin.uf,
    cityKey: pin.cityKey,
    cityName: pin.cityName,
    cityId: null,
    cityCenter: null,
  }
}

/** Os níveis que o caminho tem, na ordem do breadcrumb (R6: fora do Brasil não há estado). */
export function levelsOf(path: FocusPath): MapLevel[] {
  const out: MapLevel[] = ['world']
  if (path.countryCode) out.push('country')
  if (path.countryCode === 'BR' && path.uf) out.push('state')
  if (path.cityKey) out.push('city')
  return out
}

/** Corta o caminho num nível (subir no breadcrumb não apaga o resto — R7). */
export function isInRegion(pin: Pin, level: MapLevel, path: FocusPath): boolean {
  if (level === 'world') return true
  if (pin.countryCode !== path.countryCode) return false
  if (level === 'country') return true
  if (level === 'state') return pin.uf === path.uf
  return pin.cityKey === path.cityKey
}

export interface RegionRow {
  /** ISO do país, UF, ou `cityKey`. */
  key: string
  /** O selo: ISO, UF, `cityCode`. */
  code: string
  name: string
  count: number
}

const byCountThenName = (a: RegionRow, b: RegionRow) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR')

/**
 * R8/R9: as linhas do seletor de um nível. `world` → países; `country` → UFs
 * (Brasil) ou cidades (fora); `state` → cidades da UF. Só regiões com pins;
 * `allStates` acrescenta as UFs sem lugar (o _Ver os 27 estados_).
 */
export function regionRows(
  pins: readonly Pin[],
  level: 'world' | 'country' | 'state',
  path: FocusPath,
  opts: { allStates?: boolean } = {},
): RegionRow[] {
  const rows = new Map<string, RegionRow>()
  const bump = (key: string, code: string, name: string) => {
    const row = rows.get(key)
    if (row) row.count += 1
    else rows.set(key, { key, code, name, count: 1 })
  }

  if (level === 'world') {
    for (const p of pins) bump(p.countryCode, p.countryCode, countryName(p.countryCode))
  } else if (level === 'country' && path.countryCode === 'BR') {
    for (const p of pins) {
      if (p.countryCode === 'BR' && p.uf) bump(p.uf, p.uf, BR_STATES[p.uf].name)
    }
    if (opts.allStates) {
      for (const [uf, s] of Object.entries(BR_STATES)) {
        if (!rows.has(uf)) rows.set(uf, { key: uf, code: uf, name: s.name, count: 0 })
      }
    }
  } else {
    const inRegion = pins.filter((p) => isInRegion(p, level, path) && p.cityKey && p.cityName)
    for (const p of inRegion) bump(p.cityKey as string, cityCode(p.cityName as string), p.cityName as string)
  }
  return [...rows.values()].sort(byCountThenName)
}

/** Quantas regiões com lugar (o _"12 com lugares"_). */
export function regionsWithPlaces(rows: readonly RegionRow[]): number {
  return rows.filter((r) => r.count > 0).length
}

/** O centro de uma cidade: o de `cities` se houver, senão a média dos pins dela. */
export function cityCenter(path: FocusPath, pins: readonly Pin[]): LatLng | null {
  if (path.cityCenter) return path.cityCenter
  const own = pins.filter((p) => p.cityKey !== null && p.cityKey === path.cityKey)
  return centroid(own)
}

function centroid(points: readonly LatLng[]): LatLng | null {
  if (points.length === 0) return null
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lng: points.reduce((s, p) => s + p.lng, 0) / points.length,
  }
}

// ---------------------------------------------------------------------------
// Câmera (I6)
// ---------------------------------------------------------------------------

export type Camera =
  | { kind: 'center'; center: LatLng; zoom: number; pitch: number; bearing: number; terrain: boolean }
  | { kind: 'bounds'; sw: LatLng; ne: LatLng; minZoom: number; maxZoom: number; padding: number }

export const WORLD_ZOOM = 1.6
export const CITY_ZOOM = 11
export const CITY_PITCH = 60
const COUNTRY_MIN_ZOOM = 3
const STATE_MIN_ZOOM = 5
const REGION_MAX_ZOOM = { country: 5, state: 8 } as const

/** I6. `viewer` é a cidade de quem vê: o centro do globo. */
export function cameraFor(view: MapView, pins: readonly Pin[], viewer: LatLng): Camera {
  const { level, path } = view
  if (level === 'world') {
    return { kind: 'center', center: viewer, zoom: WORLD_ZOOM, pitch: 0, bearing: 0, terrain: false }
  }
  if (level === 'city') {
    const center = cityCenter(path, pins) ?? viewer
    return { kind: 'center', center, zoom: CITY_ZOOM, pitch: CITY_PITCH, bearing: -12, terrain: true }
  }
  const own = pins.filter((p) => isInRegion(p, level, path))
  const minZoom = level === 'country' ? COUNTRY_MIN_ZOOM : STATE_MIN_ZOOM
  if (own.length === 0) {
    const fallback =
      level === 'state' && path.uf ? BR_STATES[path.uf] : (centroid(pins.filter((p) => p.countryCode === path.countryCode)) ?? viewer)
    return { kind: 'center', center: { lat: fallback.lat, lng: fallback.lng }, zoom: minZoom, pitch: 0, bearing: 0, terrain: false }
  }
  const lats = own.map((p) => p.lat)
  const lngs = own.map((p) => p.lng)
  return {
    kind: 'bounds',
    sw: { lat: Math.min(...lats), lng: Math.min(...lngs) },
    ne: { lat: Math.max(...lats), lng: Math.max(...lngs) },
    minZoom,
    maxZoom: REGION_MAX_ZOOM[level],
    padding: 96,
  }
}

// ---------------------------------------------------------------------------
// Aqui por perto e Nessa região (R13, R18, I8)
// ---------------------------------------------------------------------------

export interface NearbyRow {
  pin: Pin
  km: number
}

export type NearbySort = 'near' | 'recent'

export function nearby(pins: readonly Pin[], center: LatLng, km: number, sort: NearbySort): NearbyRow[] {
  const rows = pins.map((pin) => ({ pin, km: distanceKmPrecise(center, pin) })).filter((r) => r.km <= km)
  return rows.sort((a, b) =>
    sort === 'near' ? a.km - b.km : b.pin.item.createdAt.localeCompare(a.pin.item.createdAt) || a.km - b.km,
  )
}

/** Haversine sem arredondar (o `distanceKm` da Fase 2 arredonda para inteiro). */
function distanceKmPrecise(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

/** I8: _"1,2 km"_ abaixo de 10, _"86 km"_ acima. */
export function formatKm(km: number): string {
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`
  return `${Math.round(km).toLocaleString('pt-BR')} km`
}

// ---------------------------------------------------------------------------
// Quem vê: onde está hoje (R4, R7)
// ---------------------------------------------------------------------------

/** A cidade de quem vê hoje: a estadia, senão a casa (R7). */
export function viewerCityId(profileId: string, homeCityId: string, stays: readonly Stay[], today: string): string {
  return stayOn(stays, profileId, today)?.cityId ?? homeCityId
}

// ---------------------------------------------------------------------------
// Cabeçalho e Nosso ritmo (R4, R17)
// ---------------------------------------------------------------------------

export interface CurrentPeriod {
  kind: 'together' | 'traveling' | 'apart' | 'unknown'
  run: Run | null
  /** Dia k do trecho (1 = o primeiro). */
  dayK: number
  /** Dias do trecho; `null` em aberto. */
  total: number | null
}

/** O trecho de hoje com as bordas reais (`runAround`). */
export function currentPeriod(today: string, stays: readonly Stay[], members: MembersBySlot): CurrentPeriod {
  const run = runAround(today, stays, members)
  if (run.band === 'unknown') return { kind: 'unknown', run: null, dayK: 0, total: null }
  const kind = run.band === 'apart' ? 'apart' : run.band === 'away' ? 'traveling' : 'together'
  return {
    kind,
    run,
    dayK: diffDays(run.from, today) + 1,
    total: run.to === null ? null : daysInclusive(run.from, run.to),
  }
}

const daysWord = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`

/**
 * R4: as duas linhas do `Couple Status`. `cityName` resolve id → nome;
 * `viewer` é o slot de quem vê (a cidade dele vem primeiro nos separados).
 */
export function coupleStatusLines(
  period: CurrentPeriod,
  cityName: (id: string) => string,
  viewerProfileId: string,
): { status: string; counter: string | null } {
  if (period.kind === 'unknown' || period.run === null) return { status: 'Sem registro de hoje', counter: null }
  const run = period.run
  if (period.kind === 'apart') {
    const mine = run.positions.find((p) => p.profileId === viewerProfileId) ?? run.positions[0]
    const other = run.positions.find((p) => p !== mine) ?? run.positions[1]
    return {
      status: `Separados agora · ${cityName(mine.cityId)} e ${cityName(other.cityId)}`,
      counter: `Separados há ${daysWord(period.dayK)}`,
    }
  }
  const where = cityName(run.cityId as string)
  return {
    status: period.kind === 'traveling' ? `Viajando juntos · ${where}` : `Juntos agora · ${where}`,
    counter: `Juntos há ${daysWord(period.dayK)}`,
  }
}

export type DayMark = 'together' | 'apart' | 'unknown'
export interface StripDay {
  day: string
  mark: DayMark
  today: boolean
  planned: boolean
}

/** R17: o mês de hoje, dia a dia, e a contagem desenhada (`countDrawn`, planejado incluso). */
export function monthStrip(
  today: string,
  stays: readonly Stay[],
  members: MembersBySlot,
): { days: StripDay[]; together: number; apart: number } {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const first = isoOf(year, month, 1)
  const last = addDays(month === 12 ? isoOf(year + 1, 1, 1) : isoOf(year, month + 1, 1), -1)
  const days: StripDay[] = []
  for (const r of runs(stays, members, first, last)) {
    const mark: DayMark = r.band === 'unknown' ? 'unknown' : r.band === 'apart' ? 'apart' : 'together'
    for (let d = r.from; d <= (r.to as string); d = addDays(d, 1)) {
      days.push({ day: d, mark, today: d === today, planned: d > today })
    }
  }
  const c = countDrawn(first, last, stays, members)
  return { days, together: c.home1 + c.home2 + c.away, apart: c.apart }
}

/** I7: dias juntos VIVIDOS de 1º de janeiro até hoje, e a fração. */
export function yearTogether(today: string, stays: readonly Stay[], members: MembersBySlot): { pct: number; days: number } {
  const first = isoOf(Number(today.slice(0, 4)), 1, 1)
  const c = countStates(first, today, today, stays, [members[1], members[2]])
  const elapsed = daysInclusive(first, today)
  return { pct: Math.floor((100 * c.together) / elapsed), days: c.together }
}

// ---------------------------------------------------------------------------
// Última memória (R20, I10)
// ---------------------------------------------------------------------------

export type LatestMemory =
  | { kind: 'trip'; trip: Trip; memory: TripMemory }
  | { kind: 'item'; item: ListItem; memory: ListMemory }

export function latestMemory(trips: readonly Trip[], items: readonly ListItem[], listMemories: readonly ListMemory[]): LatestMemory | null {
  // Comparadas pelo DIA em que foram escritas: a memória de viagem só guarda a
  // data (`written_on`); a da Lista, o instante — reduzido ao dia local.
  let best: { at: string; value: LatestMemory } | null = null
  for (const trip of trips) {
    for (const memory of trip.memories) {
      if (!best || memory.writtenOn > best.at) best = { at: memory.writtenOn, value: { kind: 'trip', trip, memory } }
    }
  }
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const memory of listMemories) {
    const item = byId.get(memory.itemId)
    const at = localDateOf(memory.updatedAt)
    // Empate: a de viagem fica (I10) — só troca com `>`.
    if (item && (!best || at > best.at)) best = { at, value: { kind: 'item', item, memory } }
  }
  return best?.value ?? null
}

/** _"escreveu hoje | ontem | há n dias | em d mmm"_ (R20). */
export function wroteLabel(writtenOn: string, today: string, shortDate: (iso: string) => string): string {
  const n = diffDays(writtenOn, today)
  if (n <= 0) return 'escreveu hoje'
  if (n === 1) return 'escreveu ontem'
  if (n < 30) return `escreveu há ${n} dias`
  return `escreveu em ${shortDate(writtenOn)}`
}

// ---------------------------------------------------------------------------
// Juntos pelo mundo (R21, I11)
// ---------------------------------------------------------------------------

/** I11: a frase da volta ao mundo e o percentual (`round`, o `.pen`: 18.420 → 46%). */
export function circumferenceLine(km: number): { text: string; pct: number } {
  const pct = Math.round((100 * km) / EARTH_KM)
  if (pct >= 100) {
    const turns = km / EARTH_KM
    const text = turns < 1.05 ? 'Uma volta ao mundo' : `${turns.toFixed(1).replace('.', ',')} voltas ao mundo`
    return { text, pct }
  }
  const tail = `${pct}% da circunferência da Terra`
  if (pct >= 50) return { text: `Mais de meia volta ao mundo — ${tail}`, pct }
  if (pct >= 40) return { text: `Quase meia volta ao mundo — ${tail}`, pct }
  return { text: tail.charAt(0).toUpperCase() + tail.slice(1), pct }
}

/** Os países das viagens feitas, dos com mais viagens (R21). */
export function countriesOfDone(trips: readonly Trip[], cities: CityMap, today: string): string[] {
  const count = new Map<string, number>()
  for (const t of trips) {
    if (tripStatus(t, today) !== 'done') continue
    const c = cities.get(t.cityId)
    if (c) count.set(c.countryCode, (count.get(c.countryCode) ?? 0) + 1)
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || countryName(a[0]).localeCompare(countryName(b[0]), 'pt-BR'))
    .map(([code]) => code)
}

/** _"Brasil, Turquia e mais 5"_ · _"Brasil e Turquia"_ · _"Brasil"_. */
export function countriesLine(codes: readonly string[]): string {
  const names = codes.map(countryName)
  if (names.length <= 1) return names[0] ?? ''
  if (names.length === 2) return `${names[0]} e ${names[1]}`
  return `${names[0]}, ${names[1]} e mais ${names.length - 2}`
}

/** _"12 no Brasil, 11 lá fora"_: as cidades distintas das feitas. */
export function citiesSplit(trips: readonly Trip[], cities: CityMap, today: string): { br: number; abroad: number } {
  const br = new Set<string>()
  const abroad = new Set<string>()
  for (const t of trips) {
    if (tripStatus(t, today) !== 'done') continue
    const c = cities.get(t.cityId)
    if (!c) continue
    ;(c.countryCode === 'BR' ? br : abroad).add(t.cityId)
  }
  return { br: br.size, abroad: abroad.size }
}

/** _"12 a 19 de julho de 2026"_ (R20) e o chip _"7 dias juntos"_. */
export function tripSpanDays(trip: Pick<Trip, 'startsOn' | 'endsOn'>): number {
  return tripDays(trip)
}


// ---------------------------------------------------------------------------
// Agrupamento em tela (R11)
// ---------------------------------------------------------------------------

export interface ScreenPoint {
  id: string
  x: number
  y: number
}

export interface ScreenCluster {
  /** O primeiro da ordem de entrada (quem chama ordena pelo mais recente): o ícone do grupo. */
  head: string
  ids: string[]
  x: number
  y: number
}

/**
 * Guloso, na ordem de entrada: cada ponto entra no primeiro grupo cujo líder
 * está a menos de `px`; senão abre um grupo. O grupo fica na posição do líder.
 * Determinístico — a mesma câmera dá os mesmos grupos.
 */
export function clusterPoints(points: readonly ScreenPoint[], px: number): ScreenCluster[] {
  const out: ScreenCluster[] = []
  for (const p of points) {
    const near = out.find((c) => Math.hypot(c.x - p.x, c.y - p.y) < px)
    if (near) near.ids.push(p.id)
    else out.push({ head: p.id, ids: [p.id], x: p.x, y: p.y })
  }
  return out
}
