// Endereço com número — Mapbox Geocoding v6, PERMANENTE (ADR 0030).
//
// Research: .agent/Research/lista-adicionar-simples.md
//
// O Photon (OSM) quase não tem número de casa no Brasil: "Rua Vilaça, 500"
// voltava a rua inteira ou outra cidade. O Geocoding v6 acerta o número, e
// com `permanent=true` os termos deixam guardar a coordenada no item e
// desenhá-la no globo — o Search Box (que acha restaurante) não deixa.
//
// Só entra quando o texto tem um número (`looksLikeAddress`): cada chamada
// permanente é cobrada. Primeiro dentro de ~60 km de onde a pessoa está, com
// o nome da cidade dela no texto quando ela não escreveu cidade nenhuma (sem
// vírgula). A proximidade sozinha pesa pouco: sem a cidade, "Rua Bento
// Gonçalves 500" a partir de Marau devolvia Soledade e Anta Gorda. Sem nada
// ali, no mundo, com o texto como veio ("Rua X 100, Porto Alegre").

import type { GeoPlace } from '../domain/list'
import type { LatLng } from '../domain/onboarding'

export const MAPBOX_GEOCODE_URL = 'https://api.mapbox.com/search/geocode/v6/forward'

/** Meia largura da caixa em volta de onde a pessoa está, em graus (~60 km). */
const NEAR_BOX_DEG = 0.55
const LIMIT = 4

/** Um número no texto: "Rua Vilaça 500", "Av. Brasil, 12". */
export function looksLikeAddress(query: string): boolean {
  return /\d/.test(query)
}

export interface AddressCandidate extends GeoPlace {
  label: string
}

export type AddressSearchResult =
  | { status: 'ok'; rows: AddressCandidate[] }
  | { status: 'aborted' }
  | { status: 'error'; cause: string }

interface V6Context {
  address?: { address_number?: string; street_name?: string; name?: string }
  street?: { name?: string }
  place?: { name?: string }
  locality?: { name?: string }
  district?: { name?: string }
  region?: { name?: string }
  country?: { country_code?: string; name?: string }
}

interface V6Feature {
  properties?: {
    name?: string
    feature_type?: string
    coordinates?: { latitude?: unknown; longitude?: unknown }
    context?: V6Context
  }
}

/** Uma feature do v6 → lugar. Sem coordenada, país ou cidade fica de fora (o CHECK recusaria). */
export function v6ToCandidate(feature: V6Feature): AddressCandidate | null {
  const p = feature.properties ?? {}
  const lat = p.coordinates?.latitude
  const lng = p.coordinates?.longitude
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const c = p.context ?? {}
  const countryCode = c.country?.country_code?.toUpperCase()
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return null
  const city = c.place?.name ?? c.locality?.name ?? c.district?.name ?? null
  if (!city || !p.name) return null
  const street = c.address?.street_name ?? c.street?.name ?? null
  const number = c.address?.address_number ?? null
  const address = street ? (number ? `${street}, ${number}` : street) : p.name
  return {
    label: p.name,
    address,
    city,
    state: c.region?.name ?? null,
    country: c.country?.name ?? countryCode,
    countryCode,
    lat,
    lng,
  }
}

export function geocodeUrl(query: string, token: string, near: LatLng | null): string {
  const params = new URLSearchParams({
    q: query,
    access_token: token,
    permanent: 'true',
    types: 'address',
    language: 'pt',
    limit: String(LIMIT),
    autocomplete: 'true',
  })
  if (near) {
    params.set('proximity', `${near.lng},${near.lat}`)
    params.set(
      'bbox',
      [near.lng - NEAR_BOX_DEG, near.lat - NEAR_BOX_DEG, near.lng + NEAR_BOX_DEG, near.lat + NEAR_BOX_DEG]
        .map((n) => n.toFixed(4))
        .join(','),
    )
  }
  return `${MAPBOX_GEOCODE_URL}?${params.toString()}`
}

export async function searchAddresses(
  query: string,
  near: LatLng & { name?: string },
  options: { token: string; signal?: AbortSignal; fetchFn?: typeof fetch },
): Promise<AddressSearchResult> {
  const fetchFn = options.fetchFn ?? fetch
  const { signal } = options
  try {
    const local = near.name && !query.includes(',') ? `${query}, ${near.name}` : query
    const attempts: [string, LatLng | null][] = [
      [local, near],
      [query, null],
    ]
    for (const [text, box] of attempts) {
      const response = await fetchFn(geocodeUrl(text, options.token, box), {
        method: 'GET',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal,
      })
      if (!response.ok) return { status: 'error', cause: `Mapbox respondeu ${response.status}` }
      const body = (await response.json()) as { features?: unknown }
      if (signal?.aborted) return { status: 'aborted' }
      const rows = (Array.isArray(body.features) ? (body.features as V6Feature[]) : [])
        .map(v6ToCandidate)
        .filter((c): c is AddressCandidate => c !== null)
      if (rows.length > 0 || box === null) return { status: 'ok', rows }
    }
    return { status: 'ok', rows: [] }
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) return { status: 'aborted' }
    return { status: 'error', cause: error instanceof Error ? error.message : String(error) }
  }
}
