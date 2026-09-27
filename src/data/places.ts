// Busca de lugares — Photon (Komoot, sobre o OpenStreetMap), direto do
// navegador. O resultado é RESOLVIDO aqui e guardado no item: nada fora deste
// arquivo sabe que o Photon existe, e trocar de provedor mexe só aqui.
//
// Spec: .agent/Tasks/fase-4-lista.md, R13, seção 5 ("Cliente"), 7, 8 e 9
// ADR:  .agent/Decisions/0016-busca-de-lugares-pelo-photon-osm.md
//
// Sai do navegador SÓ o texto da busca e a coordenada de viés (cidade-casa,
// pública): `credentials: 'omit'` e `referrerPolicy: 'no-referrer'` (seção 9).

import type { GeoPlace } from '../domain/list'
import type { City } from './cities'
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
  /** Viés de proximidade: a cidade-casa de quem busca. */
  bias?: { lat: number; lng: number }
  signal?: AbortSignal
  /** Injetável para o teste; o padrão é o `fetch` global. */
  fetchFn?: typeof fetch
  /** O fallback do IBGE (`searchCities` de `cities.ts`, já com o `db`). Sem ele, falha é `error`. */
  searchCities?: (query: string) => Promise<DataResult<City[]>>
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
  return { ...place, label: name, detail: placeDetail(place, mode) }
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

export function photonUrl(query: string, options: Pick<PlaceSearchOptions, 'mode' | 'bias'>): string {
  const params = new URLSearchParams({ q: query, limit: String(PLACE_LIMIT), lang: 'default' })
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

export async function searchPlaces(query: string, options: PlaceSearchOptions): Promise<PlaceSearchResult> {
  const q = query.trim()
  if (q.length < PLACE_MIN_QUERY) return { status: 'ok', rows: [], fallback: false }
  const { signal } = options
  if (signal?.aborted) return { status: 'aborted' }

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
      ).slice(0, PLACE_LIMIT)
      return { status: 'ok', rows, fallback: false }
    }
    failure = `Photon respondeu ${response.status}`
  } catch (error) {
    if (isAbort(error, signal)) return { status: 'aborted' }
    failure = error instanceof Error ? error.message : String(error)
  }

  return fallbackToIbge(q, options, failure)
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
