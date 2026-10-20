// O contrato do item da Lista, espelhado para a função (Deno não resolve os
// imports sem extensão de `src/`). A autoridade é o banco (CHECK e triggers de
// `list_items`); o domínio do app é `src/domain/list.ts`.
//
// `supabase/tests/mcp-list.test.ts` roda os casos de `listValidationCases.ts`
// contra `validateItem` daqui e confere os limites e as categorias com os do
// app. Mudou lá, muda aqui.
//
// ADR: .agent/Decisions/0031-mcp-remoto-em-edge-function-com-oauth-do-supabase.md

export const LIST_CATEGORIES = [
  'pais',
  'cidade',
  'restaurante',
  'parque',
  'comida',
  'experiencia',
  'filme',
  'serie',
] as const

export type ListCategory = (typeof LIST_CATEGORIES)[number]

export const MEDIA_CATEGORIES: readonly ListCategory[] = ['filme', 'serie']

export function isMediaCategory(category: ListCategory): boolean {
  return MEDIA_CATEGORIES.includes(category)
}

export const LIST_LIMITS = {
  name: 80,
  note: 280,
  link: 300,
  region: 60,
  venue: 80,
  address: 160,
  platform: 30,
  highlights: 12,
  highlight: 40,
  seasonsMin: 1,
  seasonsMax: 99,
  memory: 500,
  photosPerItem: 10,
} as const

export const RATING_LABELS = {
  1: 'Não foi pra nós',
  2: 'Ok',
  3: 'Gostamos',
  4: 'Amamos',
  5: 'Inesquecível',
} as const

/** O que cada categoria exige, para o agente montar o item sem tentativa e erro. */
export const CATEGORY_GUIDE: Record<ListCategory, { label: string; format: 'geo' | 'media'; needs: string }> = {
  pais: { label: 'País', format: 'geo', needs: 'place from find_place(mode: country), city must be null; highlights = cities of interest' },
  cidade: { label: 'Cidade', format: 'geo', needs: 'place from find_place(mode: city); region optional (e.g. "Serra Gaúcha")' },
  restaurante: { label: 'Restaurante', format: 'geo', needs: 'place from find_place(mode: place) with a city' },
  parque: { label: 'Parque', format: 'geo', needs: 'place from find_place(mode: place) with a city' },
  comida: { label: 'Comida', format: 'geo', needs: 'a dish to try; place = the city (find_place mode: city); venue = where to eat it, optional' },
  experiencia: { label: 'Experiência', format: 'geo', needs: 'an activity (show, tour, balloon ride); place with a city' },
  filme: { label: 'Filme', format: 'media', needs: 'platform required (Netflix, Prime Video, Max, Disney+, Apple TV+, MUBI, Cinema…); no place' },
  serie: { label: 'Série', format: 'media', needs: 'platform required; seasons optional (1..99); no place' },
}

/** Lugar resolvido (Photon/Overture/IBGE), guardado no item — ADR 0016. */
export interface GeoPlace {
  address: string | null
  /** Nulo só em `pais`. */
  city: string | null
  state: string | null
  country: string
  /** ISO 3166-1 alfa-2, maiúsculas. */
  countryCode: string
  lat: number
  lng: number
}

export interface ItemDraft {
  category: ListCategory
  name: string
  note: string | null
  link: string | null
  featured: boolean
  place: GeoPlace | null
  region: string | null
  venue: string | null
  highlights: string[]
  platform: string | null
  seasons: number | null
}

export type DraftField =
  | 'category'
  | 'name'
  | 'note'
  | 'link'
  | 'place'
  | 'place.city'
  | 'place.countryCode'
  | 'place.lat'
  | 'place.lng'
  | 'place.address'
  | 'region'
  | 'venue'
  | 'highlights'
  | 'platform'
  | 'seasons'

export type ValidationResult = { ok: true } | { ok: false; field: DraftField; reason: string }

const LINK_SCHEME = /^https?:\/\//i
const COUNTRY_CODE = /^[A-Z]{2}$/

function fail(field: DraftField, reason: string): ValidationResult {
  return { ok: false, field, reason }
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === ''
}

/** Espelho de `validateItem` (`src/domain/list.ts`), na mesma ordem de checagem. */
export function validateItem(draft: ItemDraft): ValidationResult {
  if (!(LIST_CATEGORIES as readonly string[]).includes(draft.category)) {
    return fail('category', 'Categoria desconhecida.')
  }

  const name = draft.name.trim()
  if (name.length === 0) return fail('name', 'Dê um nome.')
  if (name.length > LIST_LIMITS.name) return fail('name', `Até ${LIST_LIMITS.name} caracteres.`)

  if (draft.note !== null && draft.note.length > LIST_LIMITS.note) {
    return fail('note', `Até ${LIST_LIMITS.note} caracteres.`)
  }

  if (draft.link !== null) {
    if (!LINK_SCHEME.test(draft.link)) return fail('link', 'O link precisa começar com http:// ou https://.')
    if (draft.link.length > LIST_LIMITS.link) return fail('link', `Até ${LIST_LIMITS.link} caracteres.`)
  }

  if (isMediaCategory(draft.category)) {
    if (draft.place !== null) return fail('place', 'Filme e série não têm local.')
    if (draft.platform === null || draft.platform.trim() === '') return fail('platform', 'Diga onde assistir.')
    if (draft.platform.length > LIST_LIMITS.platform) return fail('platform', `Até ${LIST_LIMITS.platform} caracteres.`)
  } else {
    const place = draft.place
    if (place === null) return fail('place', 'Escolha o local.')
    if (draft.platform !== null) return fail('platform', 'Só filme e série têm plataforma.')

    if (draft.category === 'pais') {
      if (place.city !== null) return fail('place.city', 'O país não leva cidade.')
    } else if (isBlank(place.city)) {
      return fail('place.city', 'Escolha um local com cidade.')
    }
    if (!COUNTRY_CODE.test(place.countryCode)) return fail('place.countryCode', 'Código de país inválido.')
    if (!Number.isFinite(place.lat) || place.lat < -90 || place.lat > 90) return fail('place.lat', 'Latitude fora do intervalo.')
    if (!Number.isFinite(place.lng) || place.lng < -180 || place.lng > 180) return fail('place.lng', 'Longitude fora do intervalo.')
    if (place.address !== null && place.address.length > LIST_LIMITS.address) {
      return fail('place.address', `Até ${LIST_LIMITS.address} caracteres.`)
    }
  }

  if (draft.seasons !== null) {
    if (draft.category !== 'serie') return fail('seasons', 'Temporadas só em série.')
    if (!Number.isInteger(draft.seasons) || draft.seasons < LIST_LIMITS.seasonsMin || draft.seasons > LIST_LIMITS.seasonsMax) {
      return fail('seasons', `De ${LIST_LIMITS.seasonsMin} a ${LIST_LIMITS.seasonsMax}.`)
    }
  }

  if (draft.region !== null) {
    if (draft.category !== 'cidade') return fail('region', 'Região só em cidade.')
    if (draft.region.length > LIST_LIMITS.region) return fail('region', `Até ${LIST_LIMITS.region} caracteres.`)
  }

  if (draft.venue !== null) {
    if (draft.category !== 'comida') return fail('venue', '"Onde comer" só em comida.')
    if (draft.venue.length > LIST_LIMITS.venue) return fail('venue', `Até ${LIST_LIMITS.venue} caracteres.`)
  }

  if (draft.highlights.length > 0) {
    if (draft.category !== 'pais') return fail('highlights', 'Cidades de interesse só em país.')
    if (draft.highlights.length > LIST_LIMITS.highlights) return fail('highlights', `Até ${LIST_LIMITS.highlights} cidades.`)
    if (draft.highlights.some((h) => h.length > LIST_LIMITS.highlight)) {
      return fail('highlights', `Cada cidade com até ${LIST_LIMITS.highlight} caracteres.`)
    }
  }

  return { ok: true }
}

/** Sem acento e sem maiúscula: "sao paulo" acha "São Paulo". Igual ao `normalizeSearch` do app. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

/** As colunas de `list_items` que o MCP lê e escreve. */
export interface ListItemRow {
  id: string
  couple_id: string
  category: string
  name: string
  note: string | null
  link: string | null
  photo_path: string | null
  featured: boolean
  status: string
  rating: number | null
  added_by: string | null
  created_at: string
  done_on: string | null
  done_with: string | null
  done_solo_by: string | null
  address: string | null
  city: string | null
  state: string | null
  country: string | null
  country_code: string | null
  lat: number | null
  lng: number | null
  region: string | null
  venue: string | null
  highlights: string[] | null
  platform: string | null
  seasons: number | null
}

export function draftColumns(draft: ItemDraft) {
  const place = draft.place
  return {
    name: draft.name.trim(),
    note: draft.note,
    link: draft.link,
    featured: draft.featured,
    address: place?.address ?? null,
    city: place?.city ?? null,
    state: place?.state ?? null,
    country: place?.country ?? null,
    country_code: place?.countryCode ?? null,
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
    region: draft.region,
    venue: draft.venue,
    highlights: [...draft.highlights],
    platform: draft.platform,
    seasons: draft.seasons,
  }
}

export function rowToPlace(row: ListItemRow): GeoPlace | null {
  if (row.lat === null || row.lng === null || row.country_code === null) return null
  return {
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country ?? row.country_code,
    countryCode: row.country_code,
    lat: row.lat,
    lng: row.lng,
  }
}

export function rowToDraft(row: ListItemRow): ItemDraft {
  return {
    category: row.category as ListCategory,
    name: row.name,
    note: row.note,
    link: row.link,
    featured: row.featured,
    place: rowToPlace(row),
    region: row.region,
    venue: row.venue,
    highlights: row.highlights ?? [],
    platform: row.platform,
    seasons: row.seasons,
  }
}

/** Distância em km (haversine), para "perto de" e para a duplicata. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180
  const dLat = (b.lat - a.lat) * rad
  const dLng = (b.lng - a.lng) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** Raio em que dois lugares da mesma categoria são o mesmo (R6). */
export const DUPLICATE_RADIUS_KM = 0.15

/**
 * Itens da mesma categoria que parecem o mesmo do rascunho: nome normalizado
 * igual ou um contendo o outro (com ≥ 4 letras, para "Bar" não casar com tudo),
 * ou lugar a menos de `DUPLICATE_RADIUS_KM`.
 */
export function findDuplicates(draft: ItemDraft, rows: readonly ListItemRow[]): ListItemRow[] {
  const name = normalizeSearch(draft.name)
  return rows.filter((row) => {
    if (row.category !== draft.category) return false
    const other = normalizeSearch(row.name)
    if (other === name) return true
    const [short, long] = other.length < name.length ? [other, name] : [name, other]
    if (short.length >= 4 && long.includes(short)) return true
    const place = rowToPlace(row)
    // País e cidade: dois itens no mesmo ponto são o mesmo só pelo nome.
    if (draft.place && place && draft.category !== 'pais' && draft.category !== 'cidade' && draft.category !== 'comida') {
      return distanceKm(draft.place, place) <= DUPLICATE_RADIUS_KM
    }
    return false
  })
}

/** A versão compacta do item que as ferramentas devolvem. */
export function summarizeItem(row: ListItemRow, names: ReadonlyMap<string, string>) {
  const place = rowToPlace(row)
  return {
    id: row.id,
    category: row.category,
    name: row.name,
    status: row.status,
    note: row.note,
    link: row.link,
    featured: row.featured,
    place: place
      ? { city: place.city, state: place.state, country: place.country, address: place.address, lat: place.lat, lng: place.lng }
      : null,
    region: row.region,
    venue: row.venue,
    highlights: row.highlights ?? [],
    platform: row.platform,
    seasons: row.seasons,
    rating: row.rating,
    rating_label: row.rating ? RATING_LABELS[row.rating as keyof typeof RATING_LABELS] : null,
    done_on: row.done_on,
    done_with: row.done_with,
    done_solo_by: row.done_solo_by ? (names.get(row.done_solo_by) ?? row.done_solo_by) : null,
    added_by: row.added_by ? (names.get(row.added_by) ?? row.added_by) : null,
    created_at: row.created_at,
    has_photo: row.photo_path !== null,
  }
}
