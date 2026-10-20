// Busca de lugares — Photon (Komoot, sobre o OpenStreetMap), direto do
// navegador, e, no modo `place`, os estabelecimentos do Overture perto da
// cidade-casa (`places-nearby`, ADR 0027) e, se o texto tem número, o endereço
// pelo Mapbox Geocoding permanente (`addresses.ts`, ADR 0030). O resultado é RESOLVIDO aqui e
// guardado no item: nada fora deste arquivo sabe dos provedores, e trocar de
// provedor mexe só aqui.
//
// Spec: .agent/Tasks/fase-4-lista.md, R13, seção 5 ("Cliente"), 7, 8 e 9
// ADR:  .agent/Decisions/0016-busca-de-lugares-pelo-photon-osm.md, 0027
//
// Sai do navegador SÓ o texto da busca e a coordenada de viés (cidade-casa,
// pública): `credentials: 'omit'` e `referrerPolicy: 'no-referrer'` (seção 9).

import type { GeoPlace } from '../domain/list'
import { looksLikeAddress } from './addresses'
import type { AddressCandidate, AddressSearchResult } from './addresses'
import { distanceKmExact } from '../domain/onboarding'
import type { LatLng } from '../domain/onboarding'
import type { City } from './cities'
import type { NearbyPlace, NearbySearchResult } from './nearbyPlaces'
import type { DataResult } from './result'

export const PHOTON_URL = 'https://photon.komoot.io/api/'

/** Abaixo disso a busca nem sai (uso justo, ADR 0016). */
export const PLACE_MIN_QUERY = 3
export const PLACE_LIMIT = 5

/**
 * `place` = estabelecimento ou endereço, sem filtro de camada (Restaurante,
 * Parque, Experiência); `city` = `layer=city` (Cidade, Comida, e o "Não achei —
 * usar só a cidade"); `country` = `layer=country` (País).
 */
export type PlaceMode = 'place' | 'city' | 'country'

export interface PlaceCandidate extends GeoPlace {
  /** Primeira linha do resultado: o nome (no modo país, o nome em português). */
  label: string
  /** Segunda linha: "{rua, nº} · {cidade}, {UF}" ou "{estado}, {país} · {lat}, {lng}". */
  detail: string
  /**
   * `N`/`W`/`R` + `osm_id` (`'R5400890'`): a identidade do resultado no OSM, que
   * o Calendário usa para deduplicar a cidade estrangeira dentro do casal (ADR
   * 0017). Ausente quando o Photon não a trouxe e no fallback do IBGE. A Lista
   * não a grava (`placeColumns` escolhe as colunas uma a uma).
   */
  osmRef?: string
  /**
   * O que o resultado é, quando a fonte diz: a cidade inteira, um endereço
   * (rua, número) ou um parque. O modal usa para escolher entre Restaurante e
   * Parque e para não pôr "Rua Vilaça 500" como nome. Não é gravado.
   */
  kind?: PlaceKind
}

export type PlaceKind = 'city' | 'address' | 'park'

const PARK_VALUES = new Set(['park', 'garden', 'nature_reserve', 'national_park', 'protected_area', 'botanical_garden'])
/**
 * Endereço é a rua (`highway`) ou o número solto (`place=house`). `type:
 * 'house'` sozinho não basta: o Photon também dá `house` ao restaurante que
 * ocupa um prédio com número (o Mocotó), e aí o nome dele sumiria.
 */
function photonKind(p: PhotonProperties): PlaceKind | undefined {
  if (p.type === 'city') return 'city'
  if (p.osm_value && PARK_VALUES.has(p.osm_value)) return 'park'
  if (p.osm_key === 'highway' || (p.osm_key === 'place' && p.osm_value === 'house')) return 'address'
  return undefined
}

/**
 * `fallback: true` = o Photon falhou e estas são cidades do Brasil pelo IBGE
 * — a tela avisa "Busca mundial indisponível — mostrando cidades do Brasil".
 * `aborted` = a busca foi cancelada por uma mais nova: não é falha, a tela
 * ignora (seção 7, "resposta atrasada de consulta velha é descartada").
 */
export type PlaceSearchResult =
  | { status: 'ok'; rows: PlaceCandidate[]; fallback: boolean }
  | { status: 'aborted' }
  | { status: 'unauthenticated' }
  | { status: 'error'; cause: string }

export interface PlaceSearchOptions {
  mode: PlaceMode
  /** Viés de proximidade: de onde a pessoa busca (com o nome da cidade, quando se sabe). */
  bias?: { lat: number; lng: number; name?: string }
  signal?: AbortSignal
  /** Injetável para o teste; o padrão é o `fetch` global. */
  fetchFn?: typeof fetch
  /** Quantos resultados pedir ao Photon. Padrão: `PLACE_LIMIT`. */
  limit?: number
  /** O fallback do IBGE (`searchCities` de `cities.ts`, já com o `db`). Sem ele, falha é `error`. */
  searchCities?: (query: string) => Promise<DataResult<City[]>>
  /**
   * Os estabelecimentos do Overture perto do `bias` (`searchNearbyPlaces`, já
   * com o `db`). Só no modo `place` e com `bias`; sem ele, só o Photon.
   */
  searchNearby?: (query: string, near: { lat: number; lng: number }, signal?: AbortSignal) => Promise<NearbySearchResult>
  /**
   * Endereço com número pelo Mapbox (`searchAddresses`, já com o token). Só no
   * modo `place`, com `bias` e com número no texto; sem ele, Photon e Overture.
   */
  searchAddresses?: (query: string, near: { lat: number; lng: number; name?: string }, signal?: AbortSignal) => Promise<AddressSearchResult>
}

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

/** Nome do estado (como o OSM escreve) → sigla. Só o Brasil tem UF no design. */
const BR_STATE_CODES: Record<string, string> = {
  Acre: 'AC',
  Alagoas: 'AL',
  Amapá: 'AP',
  Amazonas: 'AM',
  Bahia: 'BA',
  Ceará: 'CE',
  'Distrito Federal': 'DF',
  'Espírito Santo': 'ES',
  Goiás: 'GO',
  Maranhão: 'MA',
  'Mato Grosso': 'MT',
  'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG',
  Pará: 'PA',
  Paraíba: 'PB',
  Paraná: 'PR',
  Pernambuco: 'PE',
  Piauí: 'PI',
  'Rio de Janeiro': 'RJ',
  'Rio Grande do Norte': 'RN',
  'Rio Grande do Sul': 'RS',
  Rondônia: 'RO',
  Roraima: 'RR',
  'Santa Catarina': 'SC',
  'São Paulo': 'SP',
  Sergipe: 'SE',
  Tocantins: 'TO',
}

let regionNames: Intl.DisplayNames | null = null

/** O nome do país em português pelo código ISO; o texto do Photon é o local (日本). */
export function countryNamePt(code: string, fallback: string | null = null): string {
  try {
    regionNames ??= new Intl.DisplayNames(['pt-BR'], { type: 'region' })
    const name = regionNames.of(code)
    if (name && name !== code) return name
  } catch {
    // Código inválido ou Intl sem dados de região: cai no texto do provedor.
  }
  return fallback ?? code
}

/** `-29.3792858` → `"−29,38"`: vírgula decimal, 2 casas, menos tipográfico (frame de Gramado). */
export function formatCoordinate(value: number): string {
  const fixed = Math.abs(value).toFixed(2).replace('.', ',')
  return value < 0 && fixed !== '0,00' ? `−${fixed}` : fixed
}

function coordinates(place: Pick<GeoPlace, 'lat' | 'lng'>): string {
  return `${formatCoordinate(place.lat)}, ${formatCoordinate(place.lng)}`
}

/** "Rio Grande do Sul" → "RS" no Brasil; fora dele, o estado como veio. */
function stateShort(place: GeoPlace): string | null {
  if (!place.state) return null
  if (place.countryCode === 'BR') return BR_STATE_CODES[place.state] ?? place.state
  return place.state
}

/**
 * A segunda linha do resultado (R13).
 * - `place`: "{rua, nº} · {cidade}, {UF}". Fora do Brasil a região da cidade é
 *   o país ("Göreme, Turquia", como no ADR 0016), porque o estado estrangeiro
 *   (Nevşehir) não diz nada a quem lê.
 * - `city`: "{estado}, {país} · {lat}, {lng}" (frame de Gramado).
 * - `country`: "País · {lat}, {lng}" — o frame não mostra; é o ponto do pin.
 */
export function placeDetail(place: GeoPlace, mode: PlaceMode): string {
  if (mode === 'country') return `País · ${coordinates(place)}`
  if (mode === 'city') {
    const region = [place.state, place.country].filter(Boolean).join(', ')
    return `${region} · ${coordinates(place)}`
  }
  const where = place.countryCode === 'BR' ? stateShort(place) : place.country
  const locality = [place.city, where].filter(Boolean).join(', ')
  return [place.address, locality].filter(Boolean).join(' · ')
}

// ---------------------------------------------------------------------------
// Photon → GeoPlace
// ---------------------------------------------------------------------------

interface PhotonProperties {
  name?: string
  type?: string
  housenumber?: string
  street?: string
  city?: string
  county?: string
  state?: string
  country?: string
  countrycode?: string
  osm_type?: string
  osm_id?: number
  osm_key?: string
  osm_value?: string
}

interface PhotonFeature {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: PhotonProperties
}

/**
 * Uma `Feature` → candidato, ou `null` quando falta o essencial (coordenada,
 * código do país ou nome) — o CHECK recusaria de qualquer jeito.
 *
 * `city`, decidido aqui (a spec deixava em aberto):
 * - modo `city`: o próprio `name` (a feature É a cidade);
 * - modo `country`: nulo (o CHECK exige `city` nula em `pais`);
 * - modo `place`: se a feature é uma cidade (`type: 'city'`, ex. Göreme), o
 *   `name`; senão `city`, e na falta dela `county` (município em áreas rurais).
 *   Sem nenhum dos três, nulo — e a tela não deixa gravar item geográfico sem
 *   cidade (I2), oferecendo "Não achei — usar só a cidade".
 */
export function featureToCandidate(feature: PhotonFeature, mode: PlaceMode): PlaceCandidate | null {
  const p = feature.properties ?? {}
  const coords = feature.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  // GeoJSON: [lng, lat] — nessa ordem.
  const [lng, lat] = coords as [unknown, unknown]
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const countryCode = p.countrycode?.toUpperCase()
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return null
  const country = countryNamePt(countryCode, p.country ?? null)

  const name = mode === 'country' ? country : p.name
  if (!name) return null

  const address = mode === 'place' ? (p.street ? (p.housenumber ? `${p.street}, ${p.housenumber}` : p.street) : null) : null
  const city =
    mode === 'country' ? null : mode === 'city' ? p.name ?? null : p.type === 'city' ? p.name ?? null : p.city ?? p.county ?? null
  const state = mode === 'country' ? null : p.state ?? null

  const place: GeoPlace = { address, city, state, country, countryCode, lat, lng }
  const candidate: PlaceCandidate = { ...place, label: name, detail: placeDetail(place, mode) }
  const ref = osmRef(p)
  if (ref) candidate.osmRef = ref
  const kind = mode === 'place' ? photonKind(p) : undefined
  if (kind) candidate.kind = kind
  return candidate
}

/**
 * `osm_type` (`N`ode, `W`ay, `R`elation) + `osm_id` → `'R5400890'`, no formato
 * do CHECK `cities_osm_ref` (`^[NWR][0-9]+$`). Qualquer outra coisa → `null`:
 * sem chave, a cidade não pode ser gravada, e inventar uma duplicaria Lisboa.
 */
export function osmRef(p: { osm_type?: unknown; osm_id?: unknown }): string | null {
  const type = typeof p.osm_type === 'string' ? p.osm_type.toUpperCase() : null
  if (type !== 'N' && type !== 'W' && type !== 'R') return null
  if (typeof p.osm_id !== 'number' || !Number.isSafeInteger(p.osm_id) || p.osm_id <= 0) return null
  return `${type}${p.osm_id}`
}

/** Mesmo nome e mesma coordenada (3 casas ≈ 100 m) = o mesmo resultado. */
function dedupe(candidates: PlaceCandidate[]): PlaceCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((c) => {
    const key = `${c.label.toLocaleLowerCase('pt-BR')}|${c.lat.toFixed(3)}|${c.lng.toFixed(3)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Cidade do IBGE → candidato. Só Brasil, sem o nome do estado (só a sigla). */
export function cityToCandidate(city: City): PlaceCandidate {
  const place: GeoPlace = {
    address: null,
    city: city.name,
    state: city.stateCode,
    country: countryNamePt('BR', 'Brasil'),
    countryCode: 'BR',
    lat: city.lat,
    lng: city.lng,
  }
  return { ...place, label: city.name, detail: placeDetail(place, 'city') }
}

export function photonUrl(query: string, options: Pick<PlaceSearchOptions, 'mode' | 'bias' | 'limit'>): string {
  const params = new URLSearchParams({ q: query, limit: String(options.limit ?? PLACE_LIMIT), lang: 'default' })
  if (options.mode !== 'place') params.set('layer', options.mode)
  if (options.bias) {
    params.set('lat', String(options.bias.lat))
    params.set('lon', String(options.bias.lng))
  }
  return `${PHOTON_URL}?${params.toString()}`
}

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error instanceof Error && error.name === 'AbortError')
}

// ---------------------------------------------------------------------------
// A busca
// ---------------------------------------------------------------------------

/** Overture → candidato, no mesmo formato do Photon. Sem `osmRef`: a Lista não grava. */
export function nearbyToCandidate(p: NearbyPlace): PlaceCandidate {
  const place: GeoPlace = {
    address: p.address,
    city: p.city,
    state: p.state,
    country: countryNamePt(p.countryCode),
    countryCode: p.countryCode,
    lat: p.lat,
    lng: p.lng,
  }
  return { ...place, label: p.name, detail: placeDetail(place, 'place') }
}

/** Endereço do Mapbox → candidato. O país em português pelo código, como os outros. */
export function addressToCandidate(a: AddressCandidate): PlaceCandidate {
  const place: GeoPlace = {
    address: a.address,
    city: a.city,
    state: a.state,
    country: countryNamePt(a.countryCode, a.country),
    countryCode: a.countryCode,
    lat: a.lat,
    lng: a.lng,
  }
  return { ...place, label: a.label, detail: placeDetail(place, 'place'), kind: 'address' }
}

const comparable = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim()

/** O mesmo lugar nas duas fontes: mesmo nome e a menos de ~150 m. */
function sameSpot(a: PlaceCandidate, b: PlaceCandidate): boolean {
  return comparable(a.label) === comparable(b.label) && Math.abs(a.lat - b.lat) < 0.0015 && Math.abs(a.lng - b.lng) < 0.0015
}

/**
 * Os anéis de proximidade, do meio para fora: bairro, cidade, estado, país,
 * continente e mundo. Bairro, cidade, estado e continente são distância em
 * linha reta (km) a partir de onde a pessoa está, e por isso aproximações
 * (SJC–São Paulo, ~80 km, cai no estado).
 *
 * O país não cabe em distância: o Brasil tem mais de 4.000 km de ponta a
 * ponta, e Buenos Aires fica mais perto de SJC que o norte da Bahia. O anel do
 * país é "mesmo país de onde a pessoa está"; sem saber o país, até 1.500 km.
 */
export const PROXIMITY_RINGS_KM = { neighborhood: 2, city: 15, state: 250, country: 1500, continent: 5000 } as const

/** Um resultado a menos disto da origem diz em que país a pessoa está. */
const ORIGIN_COUNTRY_KM = 50

/** O índice do anel: 0 bairro, 1 cidade, 2 estado, 3 país, 4 continente, 5 mundo. */
export function proximityRing(
  origin: LatLng,
  place: LatLng & { countryCode?: string },
  originCountry: string | null = null,
): number {
  const km = distanceKmExact(origin, place)
  if (km <= PROXIMITY_RINGS_KM.neighborhood) return 0
  if (km <= PROXIMITY_RINGS_KM.city) return 1
  if (km <= PROXIMITY_RINGS_KM.state) return 2
  if (originCountry ? place.countryCode === originCountry : km <= PROXIMITY_RINGS_KM.country) return 3
  if (km <= PROXIMITY_RINGS_KM.continent) return 4
  return 5
}

/**
 * O país de onde a pessoa está, tirado do próprio resultado: o do lugar mais
 * perto, se estiver a menos de `ORIGIN_COUNTRY_KM`. A cidade de origem chega
 * aqui só como coordenada (`City` não tem país), e a busca perto de casa quase
 * sempre traz algo da própria cidade.
 */
function originCountryOf(rows: readonly (LatLng & { countryCode?: string })[], origin: LatLng): string | null {
  let best: { km: number; code: string } | null = null
  for (const row of rows) {
    if (!row.countryCode) continue
    const km = distanceKmExact(origin, row)
    if (km <= ORIGIN_COUNTRY_KM && (!best || km < best.km)) best = { km, code: row.countryCode }
  }
  return best?.code ?? null
}

/**
 * Do anel de dentro para o de fora. Dentro do mesmo anel a ordem que veio
 * (relevância do provedor) fica: no meio da cidade, o nome que bate melhor
 * ganha do que está 2 km mais perto. O `sort` é estável.
 */
export function rankByProximity<T extends LatLng & { countryCode?: string }>(rows: readonly T[], origin: LatLng): T[] {
  const country = originCountryOf(rows, origin)
  return rows
    .map((row) => ({ row, ring: proximityRing(origin, row, country) }))
    .sort((a, b) => a.ring - b.ring)
    .map((entry) => entry.row)
}

/**
 * Quantas vagas o Photon guarda quando o Overture enche a lista: endereço,
 * rua, bairro e cidade vêm dele, e um nome de restaurante não pode esconder a
 * rua de mesmo nome.
 */
const PHOTON_RESERVED = 2

/**
 * Overture e Photon numa lista só, sem repetir o mesmo lugar. Com `origin`, a
 * ordem é por anel de proximidade; sem ele, o Overture primeiro. Nos dois
 * casos o Photon fica com até `PHOTON_RESERVED` vagas (as melhores dele,
 * tirando as piores do Overture) e a ordem final é a da lista ordenada.
 */
export function mergeNearby(
  nearby: PlaceCandidate[],
  photon: PlaceCandidate[],
  limit: number,
  origin?: LatLng,
): PlaceCandidate[] {
  const first = dedupe(nearby)
  const extras = photon.filter((p) => !first.some((n) => sameSpot(n, p)))
  const fromPhoton = new Set(extras)
  const all = origin ? rankByProximity([...first, ...extras], origin) : [...first, ...extras]

  const top = all.slice(0, limit)
  const missing = Math.min(PHOTON_RESERVED, extras.length) - top.filter((r) => fromPhoton.has(r)).length
  if (missing <= 0) return top
  const pulled = all.slice(limit).filter((r) => fromPhoton.has(r)).slice(0, missing)
  const dropped = new Set(top.filter((r) => !fromPhoton.has(r)).slice(-pulled.length))
  const kept = new Set([...top.filter((r) => !dropped.has(r)), ...pulled])
  return all.filter((r) => kept.has(r))
}

/** Quantos endereços do Mapbox entram no topo: o resto da lista é dos lugares. */
const ADDRESS_TOP = 3

/** Com ordem por proximidade, o Photon traz mais para haver o que ordenar. */
const PHOTON_RANKED_LIMIT = 10

type PhotonOutcome = { status: 'ok'; rows: PlaceCandidate[] } | { status: 'aborted' } | { status: 'failed'; cause: string }

/**
 * No modo `place`, com `bias` e `searchNearby`, o Photon e o Overture saem
 * juntos e o resultado é um só (`mergeNearby`). O Overture fora do ar, sem
 * chave ou sem cota não aparece para quem busca: fica o Photon, como antes do
 * ADR 0027. O fallback do IBGE só entra quando nenhum dos dois trouxe nada.
 *
 * Com `bias`, fora do modo `country`, o resultado sai do anel mais perto para
 * o mais longe (`rankByProximity`): o lugar de mesmo nome na Bahia não passa
 * na frente do que está na cidade de quem busca.
 */
export async function searchPlaces(query: string, options: PlaceSearchOptions): Promise<PlaceSearchResult> {
  const q = query.trim()
  if (q.length < PLACE_MIN_QUERY) return { status: 'ok', rows: [], fallback: false }
  const { signal } = options
  if (signal?.aborted) return { status: 'aborted' }

  const limit = options.limit ?? PLACE_LIMIT
  const origin = options.mode === 'country' ? undefined : options.bias
  const near = options.mode === 'place' ? options.bias : undefined
  const photonLimit = origin ? Math.max(limit, PHOTON_RANKED_LIMIT) : limit
  const [photon, nearby, addresses] = await Promise.all([
    searchPhoton(q, { ...options, limit: photonLimit }),
    near && options.searchNearby
      ? options.searchNearby(q, near, signal).catch(
          (error: unknown): NearbySearchResult => ({ status: 'error', cause: error instanceof Error ? error.message : String(error) }),
        )
      : null,
    near && options.searchAddresses && looksLikeAddress(q)
      ? options.searchAddresses(q, near, signal).catch(
          (error: unknown): AddressSearchResult => ({ status: 'error', cause: error instanceof Error ? error.message : String(error) }),
        )
      : null,
  ])
  if (signal?.aborted || photon.status === 'aborted' || nearby?.status === 'aborted' || addresses?.status === 'aborted') {
    return { status: 'aborted' }
  }

  // O endereço com número vai no topo, FORA dos anéis: a rua sem número do
  // Photon a 1 km ganharia do número certo a 3 km. Mapbox fora do ar não
  // aparece para quem busca.
  const addressRows = addresses?.status === 'ok' ? addresses.rows.slice(0, ADDRESS_TOP).map(addressToCandidate) : []
  const nearbyRows = nearby?.status === 'ok' ? nearby.places.map(nearbyToCandidate) : []
  const withAddresses = (rows: PlaceCandidate[]) =>
    [...addressRows, ...rows.filter((r) => !addressRows.some((a) => sameSpot(a, r)))].slice(0, limit)
  if (photon.status === 'ok') return { status: 'ok', rows: withAddresses(mergeNearby(nearbyRows, photon.rows, limit, origin)), fallback: false }
  if (nearbyRows.length + addressRows.length > 0) return { status: 'ok', rows: withAddresses(mergeNearby(nearbyRows, [], limit, origin)), fallback: false }
  return fallbackToIbge(q, options, photon.cause)
}

async function searchPhoton(q: string, options: PlaceSearchOptions): Promise<PhotonOutcome> {
  const { signal } = options
  const fetchFn = options.fetchFn ?? fetch
  let failure: string
  try {
    const response = await fetchFn(photonUrl(q, options), {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal,
    })
    if (response.status === 200) {
      const body = (await response.json()) as { features?: unknown }
      if (signal?.aborted) return { status: 'aborted' }
      if (!Array.isArray(body.features)) throw new Error('resposta sem features')
      const rows = dedupe(
        (body.features as PhotonFeature[])
          .map((f) => featureToCandidate(f, options.mode))
          .filter((c): c is PlaceCandidate => c !== null),
      ).slice(0, options.limit ?? PLACE_LIMIT)
      return { status: 'ok', rows }
    }
    failure = `Photon respondeu ${response.status}`
  } catch (error) {
    if (isAbort(error, signal)) return { status: 'aborted' }
    failure = error instanceof Error ? error.message : String(error)
  }
  return { status: 'failed', cause: failure }
}

/**
 * Photon fora (rede, HTTP ≠ 200, JSON inválido) → cidades do Brasil pelo IBGE
 * (ADR 0016). No modo `country` não há fallback: o IBGE não tem países, e
 * devolver cidades num modal de País daria um item que o CHECK recusa.
 */
async function fallbackToIbge(q: string, options: PlaceSearchOptions, failure: string): Promise<PlaceSearchResult> {
  if (options.mode === 'country' || !options.searchCities) return { status: 'error', cause: failure }
  const cities = await options.searchCities(q)
  if (options.signal?.aborted) return { status: 'aborted' }
  if (cities.status === 'unauthenticated') return cities
  if (cities.status === 'error') return { status: 'error', cause: `${failure}; IBGE: ${cities.cause}` }
  return { status: 'ok', rows: cities.rows.slice(0, PLACE_LIMIT).map(cityToCandidate), fallback: true }
}
