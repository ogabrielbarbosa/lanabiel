// Lista (Fase 4): o contrato puro. O banco cobra as mesmas regras por CHECK e
// trigger — `listValidationCases.ts` roda contra os dois lados (A2).
// Spec: .agent/Tasks/fase-4-lista.md · ADR: .agent/Decisions/0003-lista-tabela-unica-com-check-por-categoria.md

import { diffDays } from '../lib/date'
import { coupleStateOn, type Member, type Stay } from './coupleState'
import { distanceKmExact, type LatLng } from './onboarding'
import { LIST_CATEGORIES, type ListCategory } from './settings'

export { LIST_CATEGORIES, type ListCategory }

export const MEDIA_CATEGORIES = ['filme', 'serie'] as const satisfies readonly ListCategory[]

export function isMediaCategory(category: ListCategory): category is 'filme' | 'serie' {
  return (MEDIA_CATEGORIES as readonly ListCategory[]).includes(category)
}

/** Sugestões do modal; o banco guarda texto livre (≤ `LIST_LIMITS.platform`). */
export const PLATFORMS = ['Netflix', 'Prime Video', 'Max', 'Disney+', 'Apple TV+', 'MUBI'] as const

export const RATING_LABELS = {
  1: 'Não foi pra nós',
  2: 'Ok',
  3: 'Gostamos',
  4: 'Amamos',
  5: 'Inesquecível',
} as const

export type Rating = keyof typeof RATING_LABELS

/** Paridade com os CHECK de `list_items`, `list_memories` e o trigger de fotos. */
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

export const NEARBY_RADIUS_KM = 30

/** Lugar resolvido (Photon/OSM ou IBGE), guardado no item — ADR 0016. */
export interface GeoPlace {
  address: string | null
  /** Nulo só em `pais`. */
  city: string | null
  state: string | null
  /** Nome em português, de `Intl.DisplayNames`. */
  country: string
  /** ISO 3166-1 alfa-2, maiúsculas. */
  countryCode: string
  lat: number
  lng: number
}

/** O que o modal de adicionar/editar produz. Sem id, autor nem estado de feito. */
export interface ItemDraft {
  category: ListCategory
  name: string
  note: string | null
  link: string | null
  featured: boolean
  /** Geográficos: obrigatório. Mídia: nulo. */
  place: GeoPlace | null
  /** Só `cidade`. */
  region: string | null
  /** Só `comida` ("Onde comer · opcional"). */
  venue: string | null
  /** Só `pais` ("Cidades que interessam"). Vazio nas outras. */
  highlights: string[]
  /** Mídia: obrigatório. Geográficos: nulo. */
  platform: string | null
  /** Só `serie`, opcional. */
  seasons: number | null
}

export type DoneWith = 'both' | 'solo'

export interface ListItem extends ItemDraft {
  id: string
  photoPath: string | null
  status: 'want' | 'done'
  rating: Rating | null
  addedBy: string | null
  /** ISO timestamp. */
  createdAt: string
  /** ISO `YYYY-MM-DD`. */
  doneOn: string | null
  doneWith: DoneWith | null
  /** Preenchido quando `doneWith === 'solo'`. */
  doneSoloBy: string | null
}

export interface ListMemory {
  itemId: string
  profileId: string
  body: string
  createdAt: string
  updatedAt: string
}

export interface ListPhoto {
  id: string
  itemId: string
  path: string
  addedBy: string | null
  createdAt: string
}

/**
 * Campo apontado por uma falha de validação. Os nomes são os de `ItemDraft`;
 * `place.*` aponta para dentro do lugar.
 */
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

// ---------------------------------------------------------------------------
// Funções puras (T2). Nada aqui toca rede, relógio ou `Date` — `today` entra
// como parâmetro e a aritmética de datas mora em `lib/date.ts`.
// ---------------------------------------------------------------------------


// --- Rótulos ---------------------------------------------------------------

/** Singular, plural e gênero gramatical — "Nenhuma série", "Nenhum filme". */
export const CATEGORY_LABELS: Record<ListCategory, { one: string; many: string; gender: 'm' | 'f' }> = {
  pais: { one: 'País', many: 'Países', gender: 'm' },
  cidade: { one: 'Cidade', many: 'Cidades', gender: 'f' },
  restaurante: { one: 'Restaurante', many: 'Restaurantes', gender: 'm' },
  parque: { one: 'Parque', many: 'Parques', gender: 'm' },
  comida: { one: 'Comida', many: 'Comidas', gender: 'f' },
  experiencia: { one: 'Experiência', many: 'Experiências', gender: 'f' },
  filme: { one: 'Filme', many: 'Filmes', gender: 'm' },
  serie: { one: 'Série', many: 'Séries', gender: 'f' },
}

/** `4` → `"4 de 5 · Amamos"`. */
export function ratingLabel(rating: Rating): string {
  return `${rating} de 5 · ${RATING_LABELS[rating]}`
}

// --- Validação (A2) -------------------------------------------------------

const LINK_SCHEME = /^https?:\/\//i
const COUNTRY_CODE = /^[A-Z]{2}$/

function fail(field: DraftField, reason: string): ValidationResult {
  return { ok: false, field, reason }
}

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === ''
}

/**
 * Espelha os CHECK de `list_items` (I2 + `LIST_LIMITS`). A ordem das checagens
 * é a que faz o `field` apontar o que a pessoa precisa consertar primeiro:
 * texto comum → formato (lugar, plataforma) → detalhes do lugar → exclusivos.
 */
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

  const media = isMediaCategory(draft.category)

  if (media) {
    if (draft.place !== null) return fail('place', 'Filme e série não têm local.')
    if (draft.platform === null || draft.platform.trim() === '') {
      return fail('platform', 'Diga onde assistir.')
    }
    if (draft.platform.length > LIST_LIMITS.platform) {
      return fail('platform', `Até ${LIST_LIMITS.platform} caracteres.`)
    }
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
    if (!Number.isFinite(place.lat) || place.lat < -90 || place.lat > 90) {
      return fail('place.lat', 'Latitude fora do intervalo.')
    }
    if (!Number.isFinite(place.lng) || place.lng < -180 || place.lng > 180) {
      return fail('place.lng', 'Longitude fora do intervalo.')
    }
    if (place.address !== null && place.address.length > LIST_LIMITS.address) {
      return fail('place.address', `Até ${LIST_LIMITS.address} caracteres.`)
    }
  }

  if (draft.seasons !== null) {
    if (draft.category !== 'serie') return fail('seasons', 'Temporadas só em série.')
    if (
      !Number.isInteger(draft.seasons) ||
      draft.seasons < LIST_LIMITS.seasonsMin ||
      draft.seasons > LIST_LIMITS.seasonsMax
    ) {
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
    if (draft.highlights.length > LIST_LIMITS.highlights) {
      return fail('highlights', `Até ${LIST_LIMITS.highlights} cidades.`)
    }
    if (draft.highlights.some((h) => h.length > LIST_LIMITS.highlight)) {
      return fail('highlights', `Cada cidade com até ${LIST_LIMITS.highlight} caracteres.`)
    }
  }

  return { ok: true }
}

// --- Linha secundária (I10) -----------------------------------------------

/** `['A']` → `'A'`; `['A','B']` → `'A e B'`; `['A','B','C']` → `'A, B e C'`. */
function joinPt(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`
}

function present(value: string | null | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== ''
}

export function secondaryLine(item: ItemDraft): string {
  if (isMediaCategory(item.category)) return item.platform ?? ''

  const place = item.place
  switch (item.category) {
    case 'pais':
      return item.highlights.length > 0 ? joinPt(item.highlights) : (place?.country ?? '')
    case 'cidade':
      if (present(item.region)) return item.region
      return [place?.state, place?.country].filter(present).join(', ')
    case 'comida':
      if (present(item.venue)) return [item.venue, place?.city].filter(present).join(', ')
      return place?.city ?? ''
    default:
      return place?.city ?? ''
  }
}

// --- Filtros, ordem e contagens -------------------------------------------

export interface ListFilters {
  category: ListCategory | 'all'
  status: 'all' | 'want' | 'done'
  /** `'both'`, ou o profileId de `done_solo_by`. Só vale com `status === 'done'`. */
  who: 'all' | 'both' | string
  query: string
}

export const EMPTY_FILTERS: ListFilters = { category: 'all', status: 'all', who: 'all', query: '' }

export type ListSort = 'recent' | 'az' | 'category'

/** Sem acento e sem maiúscula — "sao paulo" acha "São Paulo". */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
}

function searchable(item: ListItem): string[] {
  return [
    item.name,
    item.note,
    item.place?.city ?? null,
    item.region,
    item.venue,
    item.platform,
    ...item.highlights,
  ].filter(present)
}

export function applyFilters(
  items: readonly ListItem[],
  filters: ListFilters,
  hidden: readonly ListCategory[],
): ListItem[] {
  const query = normalizeSearch(filters.query)
  return items.filter((item) => {
    if (hidden.includes(item.category)) return false
    if (filters.category !== 'all' && item.category !== filters.category) return false
    if (filters.status !== 'all' && item.status !== filters.status) return false
    if (filters.status === 'done' && filters.who !== 'all') {
      if (filters.who === 'both') {
        if (item.doneWith !== 'both') return false
      } else if (item.doneWith !== 'solo' || item.doneSoloBy !== filters.who) {
        return false
      }
    }
    if (query !== '' && !searchable(item).some((field) => normalizeSearch(field).includes(query))) {
      return false
    }
    return true
  })
}

function byRecent(a: ListItem, b: ListItem): number {
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** R8. Não muta a entrada. */
export function sortItems(items: readonly ListItem[], sort: ListSort): ListItem[] {
  const copy = [...items]
  if (sort === 'recent') return copy.sort(byRecent)
  if (sort === 'az') {
    return copy.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }) || byRecent(a, b))
  }
  return copy.sort(
    (a, b) => LIST_CATEGORIES.indexOf(a.category) - LIST_CATEGORIES.indexOf(b.category) || byRecent(a, b),
  )
}

/** Total por categoria visível, na ordem de `LIST_CATEGORIES`, ignorando os outros filtros (R3). */
export function countByCategory(
  items: readonly ListItem[],
  hidden: readonly ListCategory[],
): { category: ListCategory; count: number }[] {
  return LIST_CATEGORIES.filter((c) => !hidden.includes(c)).map((category) => ({
    category,
    count: items.filter((i) => i.category === category).length,
  }))
}

export interface ListProgress {
  done: number
  total: number
  /** Inteiro, arredondado para baixo. `0` quando não há itens. */
  percent: number
  byCategory: { category: ListCategory; done: number; total: number }[]
}

/** R22. As ocultas não entram em lugar nenhum. */
export function progress(items: readonly ListItem[], hidden: readonly ListCategory[]): ListProgress {
  const visible = items.filter((i) => !hidden.includes(i.category))
  const done = visible.filter((i) => i.status === 'done').length
  const total = visible.length
  return {
    done,
    total,
    percent: total === 0 ? 0 : Math.floor((done * 100) / total),
    byCategory: LIST_CATEGORIES.filter((c) => !hidden.includes(c)).map((category) => {
      const inCategory = visible.filter((i) => i.category === category)
      return {
        category,
        done: inCategory.filter((i) => i.status === 'done').length,
        total: inCategory.length,
      }
    }),
  }
}

// --- Onde o casal está hoje (I9, I11) -------------------------------------

export interface ListCity extends LatLng {
  id: string
  name: string
}

export type WhereWeAre =
  | { kind: 'together'; city: ListCity; until: string | null }
  | { kind: 'apart' }
  | { kind: 'unknown' }

/**
 * Derivado por `coupleStateOn` — juntos em casa e viajando juntos dão o mesmo
 * `together`. `until` é o menor `endsOn` das duas estadias vigentes (`null`
 * com as duas em aberto). Cidade fora do mapa é `unknown`: sem coordenada não
 * há distância a mostrar, e a cidade-casa nunca serve de palpite.
 */
export function whereWeAre(
  stays: readonly Stay[],
  members: readonly Member[],
  cities: ReadonlyMap<string, ListCity>,
  today: string,
): WhereWeAre {
  if (members.length !== 2) return { kind: 'unknown' }
  const pair: readonly [Member, Member] = [members[0], members[1]]
  const state = coupleStateOn(today, stays, pair)
  if (state.kind === 'unknown') return { kind: 'unknown' }
  if (state.kind === 'apart') return { kind: 'apart' }

  const city = cities.get(state.cityId)
  if (!city) return { kind: 'unknown' }

  const ends = pair
    .map((m) =>
      stays.find(
        (s) => s.profileId === m.profileId && s.startsOn <= today && (s.endsOn === null || today <= s.endsOn),
      ),
    )
    .map((s) => s?.endsOn ?? null)
    .filter((e): e is string => e !== null)
  const until = ends.length === 0 ? null : ends.reduce((min, e) => (e < min ? e : min))

  return { kind: 'together', city, until }
}

/** Geográficos não feitos a até `radiusKm` (linha reta), do mais perto ao mais longe. */
export function nearby(
  items: readonly ListItem[],
  city: LatLng,
  radiusKm: number = NEARBY_RADIUS_KM,
): { item: ListItem; km: number }[] {
  return items
    .filter((item) => item.status !== 'done' && item.place !== null)
    .map((item) => ({ item, km: distanceKmExact(city, item.place as GeoPlace) }))
    .filter((entry) => entry.km <= radiusKm)
    .sort((a, b) => a.km - b.km)
}

/**
 * "1,2 km" perto (uma casa abaixo de 10 km, como o frame), "24 km" longe,
 * "menos de 100 m" colado. Recebe km sem arredondar (`distanceKmExact`).
 */
export function formatDistance(km: number): string {
  if (km < 0.1) return 'menos de 100 m'
  if (km < 10) return `${(Math.round(km * 10) / 10).toLocaleString('pt-BR')} km`
  return `${Math.round(km).toLocaleString('pt-BR')} km`
}

// --- Sugestão do momento (R23) --------------------------------------------

export function suggestionPool(
  items: readonly ListItem[],
  where: WhereWeAre,
  hidden: readonly ListCategory[],
): ListItem[] {
  const open = items.filter((i) => i.status !== 'done' && !hidden.includes(i.category))
  if (where.kind === 'together') return nearby(open, where.city).map((entry) => entry.item)
  if (where.kind === 'apart') return open.filter((i) => isMediaCategory(i.category))
  return open
}

/** Não repete a atual enquanto houver alternativa. `random` ∈ [0, 1). */
export function pickSuggestion(
  pool: readonly ListItem[],
  currentId: string | null,
  random: () => number,
): ListItem | null {
  if (pool.length === 0) return null
  const others = pool.filter((i) => i.id !== currentId)
  const candidates = others.length > 0 ? others : pool
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)))
  return candidates[index]
}

// --- Filtro sem resultados (R9) -------------------------------------------

export const EMPTY_STATE_FALLBACK = 'Tente outro filtro ou adicione algo novo à lista.'

function nenhum(category: ListCategory): string {
  const label = CATEGORY_LABELS[category]
  return `${label.gender === 'f' ? 'Nenhuma' : 'Nenhum'} ${label.one.toLowerCase()}`
}

/** Concordância: `('vist', 'serie')` → `'vista'`. */
function agree(stem: string, category: ListCategory): string {
  return stem + (CATEGORY_LABELS[category].gender === 'f' ? 'a' : 'o')
}

/** "a próxima" / "o próximo". */
function nextOne(category: ListCategory): string {
  return CATEGORY_LABELS[category].gender === 'f' ? 'a próxima' : 'o próximo'
}

function article(category: ListCategory): string {
  return CATEGORY_LABELS[category].gender === 'f' ? 'uma' : 'um'
}

/**
 * Corpo do estado vazio por (mídia | geográfico) × status × quem. Qualquer
 * combinação fora da tabela — sem categoria, com busca, `status = 'all'` —
 * cai no fallback genérico.
 */
function emptyBody(category: ListCategory, filters: ListFilters, names: { byId: Record<string, string> }): string {
  const one = CATEGORY_LABELS[category].one.toLowerCase()
  const media = isMediaCategory(category)

  if (filters.status === 'want') {
    return media
      ? `${nenhum(category)} na fila. Adicione ${article(category)} pra próxima noite juntos.`
      : `${nenhum(category)} na fila. Adicione ${article(category)} ${one} que vocês querem conhecer.`
  }

  if (filters.status === 'done') {
    if (filters.who === 'all') {
      return media
        ? `Vocês ainda não marcaram ${nenhum(category).toLowerCase()} como ${agree('vist', category)}. Quando assistirem, marquem aqui.`
        : `Vocês ainda não marcaram ${nenhum(category).toLowerCase()} como ${agree('feit', category)}. Quando acontecer, marquem aqui.`
    }
    if (filters.who === 'both') {
      return media
        ? `${nenhum(category)} ${agree('vist', category)} pelos dois ainda. Que tal escolher ${nextOne(category)} pra verem juntos?`
        : `${nenhum(category)} ${agree('feit', category)} pelos dois ainda. Que tal escolher ${nextOne(category)}?`
    }
    const name = names.byId[filters.who]
    if (name === undefined) return EMPTY_STATE_FALLBACK
    if (category === 'serie') {
      return `${name} ainda não marcou nenhuma série como vista. Que tal escolher a próxima pra maratonar juntos?`
    }
    if (category === 'filme') {
      return `${name} ainda não marcou nenhum filme como visto. Que tal escolher o próximo pra assistirem juntos?`
    }
    return `${nenhum(category)} ${agree('feit', category)} só por ${name} ainda. Os melhores ficam pra fazer juntos.`
  }

  return EMPTY_STATE_FALLBACK
}

export function emptyStateCopy(
  filters: ListFilters,
  names: { byId: Record<string, string> },
): { title: string; body: string } {
  if (filters.category === 'all') return { title: 'Nada por aqui ainda', body: EMPTY_STATE_FALLBACK }
  const title = `${nenhum(filters.category)} por aqui ainda`
  if (normalizeSearch(filters.query) !== '') return { title, body: EMPTY_STATE_FALLBACK }
  return { title, body: emptyBody(filters.category, filters, names) }
}

// --- Tempo relativo --------------------------------------------------------

/**
 * `"hoje"`, `"3 dias"`, `"2 sem"`, `"1 mês"`, `"5 meses"`, `"1 ano"`.
 * Timestamp vale pela parte de data (10 primeiros caracteres). Data futura
 * (fuso, relógio torto) é "hoje", nunca um número negativo.
 */
export function relativeAge(fromIso: string, today: string): string {
  const days = Math.max(0, diffDays(fromIso.slice(0, 10), today))
  if (days === 0) return 'hoje'
  if (days < 7) return days === 1 ? '1 dia' : `${days} dias`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return `${weeks} sem`
  }
  if (days < 365) {
    const months = Math.floor(days / 30)
    return months === 1 ? '1 mês' : `${months} meses`
  }
  const years = Math.floor(days / 365)
  return years === 1 ? '1 ano' : `${years} anos`
}
