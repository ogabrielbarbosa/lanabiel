// A regra da `places-nearby`, sem Deno: valida o pedido, chama a Open Places
// API (Overture Places) pelo `fetch` injetado e devolve só o que a Lista grava.
//
// ADR: .agent/Decisions/0027-estabelecimentos-pelo-overture-perto-de-casa.md
//
// A API só busca PERTO de um ponto (raio máximo de 50 milhas) e não é
// autocompletar: por isso o ponto é a cidade-casa de quem busca, e o resto do
// mundo continua no Photon (ADR 0016). O Overture é dado aberto: a coordenada
// pode ser guardada no item e desenhada no Mapbox, ao contrário da Google.

const API = 'https://api.openplacesapi.com/v1/places'
const QUERY_MIN = 3
const QUERY_MAX = 128
const LIMIT = 8
const RADIUS_MI = 50
/** Abaixo disso o Overture traz muito lixo (página de Facebook sem endereço, matadouro como "restaurante"). */
const MIN_CONFIDENCE = 0.3

/** Um estabelecimento resolvido: o `GeoPlace` sem o nome do país (o cliente o põe em português). */
export interface NearbyPlace {
  name: string
  address: string | null
  city: string | null
  state: string | null
  countryCode: string
  lat: number
  lng: number
}

export type NearbyResult =
  | { status: 'ok'; places: NearbyPlace[] }
  /** Sem `OPEN_PLACES_API_KEY`: o cliente fica só com o Photon. */
  | { status: 'unconfigured' }
  | { status: 'invalid_request' }
  | { status: 'error'; cause: string }

export interface NearbyDeps {
  apiKey: string | null
  fetch: typeof fetch
}

interface ApiPlace {
  name?: unknown
  lat?: unknown
  lon?: unknown
  address?: {
    freeform?: unknown
    street?: unknown
    locality?: unknown
    region?: unknown
    country_code?: unknown
    country?: unknown
  }
  operating_status?: unknown
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Fechado de vez ou temporariamente não entra; sem status, entra. */
const CLOSED = new Set(['closed', 'permanently_closed', 'temporarily_closed'])

/** A API devolve a sigla em minúsculas (`'rs'`); nome por extenso fica como veio. */
const region = (v: string | null): string | null => (v && /^[a-z]{2}$/i.test(v) ? v.toUpperCase() : v)

/** Lugar sem nome, coordenada ou país fica de fora (o CHECK de `list_items` recusaria). */
export function toNearbyPlace(p: ApiPlace): NearbyPlace | null {
  const name = str(p.name)
  if (!name || !finite(p.lat) || !finite(p.lon)) return null
  if (p.lat < -90 || p.lat > 90 || p.lon < -180 || p.lon > 180) return null
  if (typeof p.operating_status === 'string' && CLOSED.has(p.operating_status)) return null
  const a = p.address ?? {}
  const countryCode = (str(a.country_code) ?? str(a.country))?.toUpperCase() ?? null
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return null
  return {
    name: [...name].slice(0, 200).join(''),
    address: str(a.freeform) ?? str(a.street),
    city: str(a.locality),
    state: region(str(a.region)),
    countryCode,
    lat: p.lat,
    lng: p.lon,
  }
}

export async function handleNearby(body: unknown, deps: NearbyDeps): Promise<NearbyResult> {
  if (typeof body !== 'object' || body === null) return { status: 'invalid_request' }
  const { query, lat, lng } = body as Record<string, unknown>
  const q = typeof query === 'string' ? query.trim() : ''
  if (q.length < QUERY_MIN || q.length > QUERY_MAX) return { status: 'invalid_request' }
  if (!finite(lat) || !finite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return { status: 'invalid_request' }
  if (!deps.apiKey) return { status: 'unconfigured' }

  const params = new URLSearchParams({
    q,
    lat: String(lat),
    lon: String(lng),
    radius_mi: String(RADIUS_MI),
    limit: String(LIMIT),
    min_confidence: String(MIN_CONFIDENCE),
  })
  const response = await deps.fetch(`${API}?${params}`, { headers: { Authorization: `Bearer ${deps.apiKey}` } })
  if (!response.ok) return { status: 'error', cause: `Open Places ${response.status}` }
  const json = (await response.json()) as { results?: unknown }
  const results = Array.isArray(json.results) ? (json.results as ApiPlace[]) : []
  return { status: 'ok', places: results.map(toNearbyPlace).filter((p): p is NearbyPlace => p !== null) }
}
