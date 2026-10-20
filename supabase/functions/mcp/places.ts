// `find_place`: o mesmo resolvedor de lugar da Lista (`src/data/places.ts`),
// enxuto para a função. Photon (OSM) no mundo todo, Overture perto do ponto de
// viés (ADR 0027, reaproveitando o handler da `places-nearby`) e, se o Photon
// cair, as cidades do Brasil pelo IBGE (`search_cities`). O resultado já é o
// `GeoPlace` que `add_list_item` grava (I3).
//
// `featureToCandidate` e `rankByProximity` seguem os do app;
// `supabase/tests/mcp-places.test.ts` compara os dois com as mesmas entradas.

import { handleNearby } from '../places-nearby/handler.ts'
import type { NearbyPlace } from '../places-nearby/handler.ts'
import type { Ctx } from './context.ts'
import { distanceKm } from './list.ts'
import type { GeoPlace } from './list.ts'

export const PHOTON_URL = 'https://photon.komoot.io/api/'
export const PLACE_MIN_QUERY = 3
export const FIND_PLACE_LIMIT = 8

export type PlaceMode = 'place' | 'city' | 'country'

export interface PlaceCandidate extends GeoPlace {
  /** O nome do resultado (no modo país, o nome em português). */
  label: string
  source: 'photon' | 'overture' | 'ibge'
  kind?: 'city' | 'address' | 'park'
  distance_km?: number
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
  osm_key?: string
  osm_value?: string
}

export interface PhotonFeature {
  geometry?: { type?: string; coordinates?: unknown }
  properties?: PhotonProperties
}

const PARK_VALUES = new Set(['park', 'garden', 'nature_reserve', 'national_park', 'protected_area', 'botanical_garden'])

function photonKind(p: PhotonProperties): PlaceCandidate['kind'] {
  if (p.type === 'city') return 'city'
  if (p.osm_value && PARK_VALUES.has(p.osm_value)) return 'park'
  if (p.osm_key === 'highway' || (p.osm_key === 'place' && p.osm_value === 'house')) return 'address'
  return undefined
}

/** Igual ao `featureToCandidate` do app (mesmas regras de `city` por modo). */
export function featureToCandidate(feature: PhotonFeature, mode: PlaceMode): PlaceCandidate | null {
  const p = feature.properties ?? {}
  const coords = feature.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lng, lat] = coords as [unknown, unknown]
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const countryCode = p.countrycode?.toUpperCase()
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return null
  const country = countryNamePt(countryCode, p.country ?? null)

  const name = mode === 'country' ? country : p.name
  if (!name) return null

  const address = mode === 'place' ? (p.street ? (p.housenumber ? `${p.street}, ${p.housenumber}` : p.street) : null) : null
  const city =
    mode === 'country' ? null : mode === 'city' ? (p.name ?? null) : p.type === 'city' ? (p.name ?? null) : (p.city ?? p.county ?? null)
  const state = mode === 'country' ? null : (p.state ?? null)

  const candidate: PlaceCandidate = { address, city, state, country, countryCode, lat, lng, label: name, source: 'photon' }
  const kind = mode === 'place' ? photonKind(p) : undefined
  if (kind) candidate.kind = kind
  return candidate
}

export function nearbyToCandidate(p: NearbyPlace): PlaceCandidate {
  return {
    address: p.address,
    city: p.city,
    state: p.state,
    country: countryNamePt(p.countryCode),
    countryCode: p.countryCode,
    lat: p.lat,
    lng: p.lng,
    label: p.name,
    source: 'overture',
  }
}

// ---------------------------------------------------------------------------
// Ordem por proximidade — a mesma de `rankByProximity` do app.
// ---------------------------------------------------------------------------

const RINGS_KM = { neighborhood: 2, city: 15, state: 250, country: 1500, continent: 5000 } as const
const ORIGIN_COUNTRY_KM = 50

type Point = { lat: number; lng: number; countryCode?: string }

function ring(origin: Point, place: Point, originCountry: string | null): number {
  const km = distanceKm(origin, place)
  if (km <= RINGS_KM.neighborhood) return 0
  if (km <= RINGS_KM.city) return 1
  if (km <= RINGS_KM.state) return 2
  if (originCountry ? place.countryCode === originCountry : km <= RINGS_KM.country) return 3
  if (km <= RINGS_KM.continent) return 4
  return 5
}

export function rankByProximity<T extends Point>(rows: readonly T[], origin: Point): T[] {
  let best: { km: number; code: string } | null = null
  for (const row of rows) {
    if (!row.countryCode) continue
    const km = distanceKm(origin, row)
    if (km <= ORIGIN_COUNTRY_KM && (!best || km < best.km)) best = { km, code: row.countryCode }
  }
  const country = best?.code ?? null
  return rows
    .map((row) => ({ row, ring: ring(origin, row, country) }))
    .sort((a, b) => a.ring - b.ring)
    .map((entry) => entry.row)
}

/** Mesmo nome a menos de 300 m = o mesmo lugar vindo de dois provedores. O primeiro fica. */
function dedupe(rows: PlaceCandidate[]): PlaceCandidate[] {
  const out: PlaceCandidate[] = []
  for (const row of rows) {
    const label = row.label.toLocaleLowerCase('pt-BR')
    if (!out.some((o) => o.label.toLocaleLowerCase('pt-BR') === label && distanceKm(o, row) < 0.3)) out.push(row)
  }
  return out
}

// ---------------------------------------------------------------------------
// A busca
// ---------------------------------------------------------------------------

export interface FindPlaceInput {
  query: string
  mode: PlaceMode
  /** Viés: um ponto, ou o nome de uma cidade ("Gramado"). Sem nenhum, a cidade-casa de quem chama. */
  near?: { lat: number; lng: number } | null
  nearCity?: string | null
  limit?: number
}

export type FindPlaceResult =
  | { status: 'ok'; candidates: PlaceCandidate[]; fallback: boolean; near: { lat: number; lng: number; name: string | null } | null }
  | { status: 'error'; message: string }

export function photonUrl(query: string, mode: PlaceMode, bias: { lat: number; lng: number } | null, limit: number): string {
  const params = new URLSearchParams({ q: query, limit: String(limit), lang: 'default' })
  if (mode !== 'place') params.set('layer', mode)
  if (bias) {
    params.set('lat', String(bias.lat))
    params.set('lon', String(bias.lng))
  }
  return `${PHOTON_URL}?${params.toString()}`
}

async function photon(ctx: Ctx, query: string, mode: PlaceMode, bias: { lat: number; lng: number } | null, limit: number) {
  try {
    const response = await ctx.fetch(photonUrl(query, mode, bias, limit), { headers: { 'User-Agent': 'lanabiel-mcp/1.0' } })
    if (response.status !== 200) return { ok: false as const, cause: `Photon respondeu ${response.status}` }
    const body = (await response.json()) as { features?: unknown }
    if (!Array.isArray(body.features)) return { ok: false as const, cause: 'Photon sem features' }
    const rows = (body.features as PhotonFeature[]).map((f) => featureToCandidate(f, mode)).filter((c): c is PlaceCandidate => c !== null)
    return { ok: true as const, rows }
  } catch (error) {
    return { ok: false as const, cause: error instanceof Error ? error.message : String(error) }
  }
}

export async function findPlace(
  ctx: Ctx,
  input: FindPlaceInput,
  homeBias: { lat: number; lng: number; name: string } | null,
): Promise<FindPlaceResult> {
  const query = input.query.trim()
  if (query.length < PLACE_MIN_QUERY) return { status: 'error', message: `Busque com pelo menos ${PLACE_MIN_QUERY} letras.` }
  const limit = Math.min(Math.max(input.limit ?? FIND_PLACE_LIMIT, 1), FIND_PLACE_LIMIT)

  // O viés: o ponto dado, a cidade dada (resolvida no Photon) ou a casa.
  let bias: { lat: number; lng: number; name: string | null } | null = input.near ? { ...input.near, name: null } : null
  if (!bias && input.nearCity && input.nearCity.trim().length >= PLACE_MIN_QUERY) {
    const city = await photon(ctx, input.nearCity.trim(), 'city', null, 1)
    if (city.ok && city.rows[0]) bias = { lat: city.rows[0].lat, lng: city.rows[0].lng, name: city.rows[0].label }
  }
  if (!bias && homeBias) bias = homeBias
  const origin = input.mode === 'country' ? null : bias

  const [fromPhoton, fromOverture] = await Promise.all([
    photon(ctx, query, input.mode, origin, Math.max(limit, 10)),
    input.mode === 'place' && origin
      ? handleNearby({ query, lat: origin.lat, lng: origin.lng }, { apiKey: ctx.keys.openPlacesKey, fetch: ctx.fetch }).catch(() => null)
      : Promise.resolve(null),
  ])
  const nearby = fromOverture?.status === 'ok' ? fromOverture.places.map(nearbyToCandidate) : []

  if (fromPhoton.ok || nearby.length > 0) {
    const merged = dedupe([...nearby, ...(fromPhoton.ok ? fromPhoton.rows : [])])
    const ranked = origin ? rankByProximity(merged, origin) : merged
    const withDistance = ranked.slice(0, limit).map((c) => (origin ? { ...c, distance_km: Math.round(distanceKm(origin, c) * 10) / 10 } : c))
    return { status: 'ok', candidates: withDistance, fallback: false, near: origin }
  }

  // Photon fora e nada do Overture: cidades do Brasil pelo IBGE (ADR 0016).
  if (input.mode === 'country') return { status: 'error', message: `Busca de lugares indisponível: ${fromPhoton.cause}` }
  const { data, error } = await ctx.db.rpc('search_cities', { p_query: query })
  if (error) return { status: 'error', message: `Busca de lugares indisponível: ${fromPhoton.cause}; IBGE: ${error.message}` }
  const cities = ((data ?? []) as { name: string; state_code: string | null; country_code?: string; lat: number; lng: number }[])
    .slice(0, limit)
    .map(
      (c): PlaceCandidate => ({
        address: null,
        city: c.name,
        state: c.state_code,
        country: countryNamePt(c.country_code ?? 'BR', 'Brasil'),
        countryCode: c.country_code ?? 'BR',
        lat: c.lat,
        lng: c.lng,
        label: c.name,
        source: 'ibge',
        kind: 'city',
      }),
    )
  return { status: 'ok', candidates: cities, fallback: true, near: origin }
}
