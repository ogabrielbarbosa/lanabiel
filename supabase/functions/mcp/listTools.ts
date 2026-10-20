// As ferramentas da Lista sobre o banco. Mesmas regras de `src/data/list.ts`:
// nenhuma query filtra por casal para autorizar (a policy corta, ADR 0001);
// `.eq('id', …)` é identidade. O `couple_id` só entra como DADO no insert.
//
// Spec: .agent/Tasks/mcp-server.md, R5–R7, seção 7

import { ToolFailure, loadCouple } from './context.ts'
import type { Couple, Ctx } from './context.ts'
import {
  CATEGORY_GUIDE,
  LIST_CATEGORIES,
  LIST_LIMITS,
  distanceKm,
  draftColumns,
  findDuplicates,
  normalizeSearch,
  rowToDraft,
  summarizeItem,
  validateItem,
} from './list.ts'
import type { GeoPlace, ItemDraft, ListCategory, ListItemRow } from './list.ts'
import { BROWSER_HEADERS, FetchRefused, safeFetch } from './links/safeFetch.ts'

export const MEDIA_BUCKET = 'couple-media'
const PHOTO_MAX_BYTES = 5 * 1_048_576
const PAGE = 1000

interface PgError {
  code?: string
  message: string
  hint?: string | null
}

const CONSTRAINT_IN_MESSAGE = /constraint "([a-z0-9_]+)"/i

/** Erro do PostgREST → falha nomeada, como o `translateError` da Lista. */
export function dbFailure(error: PgError): ToolFailure {
  const constraint = error.hint || CONSTRAINT_IN_MESSAGE.exec(error.message)?.[1] || null
  if (error.code === '42501') return new ToolFailure('forbidden', 'A sessão não tem acesso a isso (saiu do casal?).')
  if (error.code === 'PGRST301' || error.code === '401') return new ToolFailure('unauthenticated', 'Sessão expirada.')
  if (error.code === '23503') return new ToolFailure('not_found', 'O item não existe mais.')
  if (error.code?.startsWith('23') || error.code === '22023') {
    return new ToolFailure('invalid', `O banco recusou: ${constraint ?? error.code}.`, { constraint, cause: error.message })
  }
  return new ToolFailure('error', error.message)
}

async function allItems(ctx: Ctx): Promise<ListItemRow[]> {
  const rows: ListItemRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await ctx.db
      .from('list_items')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw dbFailure(error)
    rows.push(...((data ?? []) as ListItemRow[]))
    if (!data || data.length < PAGE) return rows
  }
}

async function oneItem(ctx: Ctx, id: string): Promise<ListItemRow> {
  const { data, error } = await ctx.db.from('list_items').select('*').eq('id', id).maybeSingle()
  if (error) throw dbFailure(error)
  if (!data) throw new ToolFailure('not_found', 'Item não encontrado (apagado, ou o id está errado).')
  return data as ListItemRow
}

// ---------------------------------------------------------------------------
// get_context
// ---------------------------------------------------------------------------

export async function getContext(ctx: Ctx) {
  const couple = await loadCouple(ctx)
  const today = ctx.today()
  const [stays, settings, items] = await Promise.all([
    ctx.db
      .from('stays')
      .select('profile_id, starts_on, ends_on, cities:city_id (name, state_code, country_code)')
      .lte('starts_on', today)
      .or(`ends_on.is.null,ends_on.gte.${today}`),
    ctx.db.from('couple_settings').select('hidden_categories').maybeSingle(),
    allItems(ctx),
  ])
  if (stays.error) throw dbFailure(stays.error)
  if (settings.error) throw dbFailure(settings.error)

  const hidden = ((settings.data?.hidden_categories ?? []) as string[]).filter((c) =>
    (LIST_CATEGORIES as readonly string[]).includes(c),
  )
  const whereToday = (profileId: string) => {
    // deno-lint-ignore no-explicit-any
    const stay = (stays.data ?? []).find((s: any) => s.profile_id === profileId) as any
    if (!stay) return null
    const city = stay.cities
    return {
      city: city ? [city.name, city.state_code ?? city.country_code].filter(Boolean).join(', ') : null,
      since: stay.starts_on,
      until: stay.ends_on,
    }
  }
  const person = (m: Couple['me']) => ({
    name: m.name,
    home_city: m.homeCity ? [m.homeCity.name, m.homeCity.stateCode ?? m.homeCity.countryCode].filter(Boolean).join(', ') : null,
    today: whereToday(m.profileId),
  })

  const counts = Object.fromEntries(
    LIST_CATEGORIES.map((c) => {
      const of = items.filter((i) => i.category === c)
      return [c, { want: of.filter((i) => i.status === 'want').length, done: of.filter((i) => i.status === 'done').length }]
    }),
  )
  return {
    today,
    couple: { name: couple.name, together_since: couple.startedOn },
    me: person(couple.me),
    partner: couple.partner ? person(couple.partner) : null,
    list: {
      categories: LIST_CATEGORIES.map((c) => ({ key: c, ...CATEGORY_GUIDE[c], hidden_in_app: hidden.includes(c), ...counts[c] })),
      limits: LIST_LIMITS,
      total: items.length,
    },
    notes: [
      'A pessoa sem estadia no dia aparece com today = null (lacuna, não "separados").',
      'Categorias ocultas existem e aceitam itens; só não aparecem na tela da Lista.',
    ],
  }
}

// ---------------------------------------------------------------------------
// search_list / get_list_item
// ---------------------------------------------------------------------------

export interface SearchInput {
  category?: ListCategory
  status?: 'want' | 'done'
  query?: string
  near?: { lat: number; lng: number; radius_km?: number }
  featured?: boolean
  limit?: number
  offset?: number
}

function searchable(row: ListItemRow): string {
  return normalizeSearch(
    [row.name, row.note, row.city, row.state, row.country, row.region, row.venue, row.platform, ...(row.highlights ?? [])]
      .filter(Boolean)
      .join(' \u0001 '),
  )
}

export async function searchList(ctx: Ctx, input: SearchInput) {
  const couple = await loadCouple(ctx)
  const rows = await allItems(ctx)
  const terms = normalizeSearch(input.query ?? '')
    .split(/\s+/)
    .filter(Boolean)
  let matches = rows.filter((row) => {
    if (input.category && row.category !== input.category) return false
    if (input.status && row.status !== input.status) return false
    if (input.featured !== undefined && row.featured !== input.featured) return false
    if (terms.length > 0) {
      const text = searchable(row)
      if (!terms.every((t) => text.includes(t))) return false
    }
    return true
  })
  let distances: Map<string, number> | null = null
  if (input.near) {
    const radius = input.near.radius_km ?? 30
    distances = new Map()
    for (const row of matches) {
      if (row.lat !== null && row.lng !== null) distances.set(row.id, distanceKm(input.near, { lat: row.lat, lng: row.lng }))
    }
    matches = matches.filter((r) => (distances!.get(r.id) ?? Infinity) <= radius).sort((a, b) => distances!.get(a.id)! - distances!.get(b.id)!)
  }
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100)
  const offset = Math.max(input.offset ?? 0, 0)
  const page = matches.slice(offset, offset + limit)
  return {
    total: matches.length,
    offset,
    returned: page.length,
    items: page.map((row) => ({
      ...summarizeItem(row, couple.names),
      ...(distances ? { distance_km: Math.round((distances.get(row.id) ?? 0) * 10) / 10 } : {}),
    })),
  }
}

export async function getListItem(ctx: Ctx, id: string) {
  const couple = await loadCouple(ctx)
  const row = await oneItem(ctx, id)
  const [memories, photos] = await Promise.all([
    ctx.db.from('list_memories').select('profile_id, body, updated_at').eq('item_id', id).order('created_at'),
    ctx.db.from('list_photos').select('id', { count: 'exact', head: true }).eq('item_id', id),
  ])
  if (memories.error) throw dbFailure(memories.error)
  if (photos.error) throw dbFailure(photos.error)
  return {
    ...summarizeItem(row, couple.names),
    memories: (memories.data ?? []).map((m) => ({
      by: couple.names.get(m.profile_id as string) ?? m.profile_id,
      mine: m.profile_id === ctx.userId,
      body: m.body,
      updated_at: m.updated_at,
    })),
    done_photos: photos.count ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Foto do item por URL
// ---------------------------------------------------------------------------

type PhotoOutcome = { path: string } | { skipped: string }

/** Baixa a imagem e sobe para `<casal>/item/<uuid>`. O bucket só aceita jpeg e webp até 5 MB. */
async function uploadPhotoFromUrl(ctx: Ctx, coupleId: string, url: string): Promise<PhotoOutcome> {
  let bytes: Uint8Array
  let mimeType: string
  try {
    const response = await safeFetch(ctx.fetch, url, { maxBytes: PHOTO_MAX_BYTES, timeoutMs: 20_000, headers: BROWSER_HEADERS })
    if (response.status >= 400) return { skipped: `a imagem respondeu ${response.status}` }
    bytes = response.body
    mimeType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  } catch (error) {
    return { skipped: error instanceof FetchRefused ? error.message : `não baixou: ${error instanceof Error ? error.message : String(error)}` }
  }
  // O CDN às vezes responde `application/octet-stream`; os bytes dizem o formato.
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8
  const isWebp = new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP'
  if (!isJpeg && !isWebp) return { skipped: `formato não aceito (${mimeType || 'desconhecido'}); o bucket só guarda jpeg e webp` }
  const extension = isWebp ? 'webp' : 'jpg'
  const path = `${coupleId}/item/${crypto.randomUUID()}.${extension}`
  const { error } = await ctx.db.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType: isWebp ? 'image/webp' : 'image/jpeg', upsert: false })
  if (error) return { skipped: `upload recusado: ${error.message}` }
  return { path }
}

async function removeQuietly(ctx: Ctx, paths: string[]) {
  if (paths.length === 0) return
  try {
    await ctx.db.storage.from(MEDIA_BUCKET).remove(paths)
  } catch {
    // órfão aceito, como no app
  }
}

// ---------------------------------------------------------------------------
// add_list_item / update_list_item
// ---------------------------------------------------------------------------

export interface DraftInput {
  name?: string
  note?: string | null
  link?: string | null
  featured?: boolean
  place?: GeoPlace | null
  region?: string | null
  venue?: string | null
  highlights?: string[]
  platform?: string | null
  seasons?: number | null
}

export interface AddInput extends DraftInput {
  category: ListCategory
  name: string
  photo_url?: string | null
  allow_duplicate?: boolean
}

const blankToNull = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim())

function cleanPlace(place: GeoPlace | null | undefined): GeoPlace | null | undefined {
  if (place === undefined || place === null) return place
  return {
    address: blankToNull(place.address) ?? null,
    city: blankToNull(place.city) ?? null,
    state: blankToNull(place.state) ?? null,
    country: place.country.trim(),
    countryCode: place.countryCode.trim().toUpperCase(),
    lat: place.lat,
    lng: place.lng,
  }
}

/** O que veio no patch substitui; o que não veio (`undefined`) fica como estava. */
function applyPatch(base: ItemDraft, patch: DraftInput): ItemDraft {
  return {
    category: base.category,
    name: patch.name !== undefined ? patch.name.trim() : base.name,
    note: patch.note !== undefined ? (blankToNull(patch.note) ?? null) : base.note,
    link: patch.link !== undefined ? (blankToNull(patch.link) ?? null) : base.link,
    featured: patch.featured ?? base.featured,
    place: patch.place !== undefined ? (cleanPlace(patch.place) ?? null) : base.place,
    region: patch.region !== undefined ? (blankToNull(patch.region) ?? null) : base.region,
    venue: patch.venue !== undefined ? (blankToNull(patch.venue) ?? null) : base.venue,
    highlights: patch.highlights !== undefined ? patch.highlights.map((h) => h.trim()).filter(Boolean) : base.highlights,
    platform: patch.platform !== undefined ? (blankToNull(patch.platform) ?? null) : base.platform,
    seasons: patch.seasons !== undefined ? patch.seasons : base.seasons,
  }
}

function assertValid(draft: ItemDraft) {
  const result = validateItem(draft)
  if (!result.ok) {
    throw new ToolFailure('invalid', `${result.field}: ${result.reason}`, {
      field: result.field,
      reason: result.reason,
      category_needs: CATEGORY_GUIDE[draft.category]?.needs,
    })
  }
}

export async function addListItem(ctx: Ctx, input: AddInput) {
  const couple = await loadCouple(ctx)
  const empty: ItemDraft = {
    category: input.category,
    name: '',
    note: null,
    link: null,
    featured: false,
    place: null,
    region: null,
    venue: null,
    highlights: [],
    platform: null,
    seasons: null,
  }
  const draft = applyPatch(empty, input)
  assertValid(draft)

  if (!input.allow_duplicate) {
    const duplicates = findDuplicates(draft, await allItems(ctx))
    if (duplicates.length > 0) {
      throw new ToolFailure('possible_duplicate', 'Já existe item parecido na Lista. Confirme com a pessoa e mande allow_duplicate: true para gravar mesmo assim.', {
        matches: duplicates.slice(0, 5).map((r) => summarizeItem(r, couple.names)),
      })
    }
  }

  let photo: PhotoOutcome | null = null
  if (input.photo_url) photo = await uploadPhotoFromUrl(ctx, couple.coupleId, input.photo_url)
  const photoPath = photo && 'path' in photo ? photo.path : null

  const { data, error } = await ctx.db
    .from('list_items')
    .insert({ couple_id: couple.coupleId, category: draft.category, ...draftColumns(draft), photo_path: photoPath })
    .select('*')
    .single()
  if (error) {
    if (photoPath) await removeQuietly(ctx, [photoPath])
    throw dbFailure(error)
  }
  return {
    status: 'ok',
    item: summarizeItem(data as ListItemRow, couple.names),
    photo: photo === null ? 'none' : 'path' in photo ? 'saved' : 'skipped',
    ...(photo && 'skipped' in photo ? { photo_skipped_because: photo.skipped } : {}),
  }
}

export interface UpdateInput extends DraftInput {
  id: string
  rating?: number | null
  photo_url?: string | null
  remove_photo?: boolean
}

export async function updateListItem(ctx: Ctx, input: UpdateInput) {
  const couple = await loadCouple(ctx)
  const row = await oneItem(ctx, input.id)
  const draft = applyPatch(rowToDraft(row), input)
  assertValid(draft)

  const columns: Record<string, unknown> = { ...draftColumns(draft) }
  if (input.rating !== undefined) columns.rating = input.rating

  let photo: PhotoOutcome | null = null
  if (input.photo_url) {
    photo = await uploadPhotoFromUrl(ctx, couple.coupleId, input.photo_url)
    if ('path' in photo) columns.photo_path = photo.path
  } else if (input.remove_photo) {
    columns.photo_path = null
  }

  const { data, error } = await ctx.db.from('list_items').update(columns).eq('id', input.id).select('*')
  if (error) {
    if (photo && 'path' in photo) await removeQuietly(ctx, [photo.path])
    throw dbFailure(error)
  }
  if (!data || data.length !== 1) throw new ToolFailure('not_found', 'O item não existe mais.')
  // A foto antiga sai depois que a nova está gravada.
  if (row.photo_path && columns.photo_path !== undefined && columns.photo_path !== row.photo_path) {
    await removeQuietly(ctx, [row.photo_path])
  }
  return {
    status: 'ok',
    item: summarizeItem(data[0] as ListItemRow, couple.names),
    ...(photo && 'skipped' in photo ? { photo: 'skipped', photo_skipped_because: photo.skipped } : {}),
  }
}

// ---------------------------------------------------------------------------
// mark_list_item_done / save_list_memory / delete_list_item
// ---------------------------------------------------------------------------

export interface MarkDoneInput {
  id: string
  done_on?: string
  with: 'both' | 'solo'
  solo_by?: 'me' | 'partner'
  rating?: number | null
  memory?: string | null
}

export async function markListItemDone(ctx: Ctx, input: MarkDoneInput) {
  const couple = await loadCouple(ctx)
  const doneOn = input.done_on ?? ctx.today()
  let soloBy: string | null = null
  if (input.with === 'solo') {
    const who = input.solo_by ?? 'me'
    if (who === 'partner' && !couple.partner) throw new ToolFailure('invalid', 'A outra pessoa ainda não entrou no espaço.')
    soloBy = who === 'me' ? couple.me.profileId : couple.partner!.profileId
  }
  if (input.memory && input.memory.trim().length > LIST_LIMITS.memory) {
    throw new ToolFailure('invalid', `memory: até ${LIST_LIMITS.memory} caracteres.`, { field: 'memory' })
  }
  const { data, error } = await ctx.db.rpc('mark_item_done', {
    p_item: input.id,
    p_done_on: doneOn,
    p_done_with: input.with,
    p_solo_by: soloBy,
    p_rating: input.rating ?? null,
    p_memory: input.memory ?? null,
    p_photo_paths: [],
  })
  if (error) throw dbFailure(error)
  const status = (data as { status?: string } | null)?.status
  if (status === 'not_found') throw new ToolFailure('not_found', 'Item não encontrado.')
  if (status === 'already_done') throw new ToolFailure('already_done', 'O item já estava marcado como feito.')
  return { status: 'ok', item: summarizeItem(await oneItem(ctx, input.id), couple.names) }
}

export async function saveListMemory(ctx: Ctx, id: string, body: string) {
  const couple = await loadCouple(ctx)
  const text = body.trim()
  if (text.length === 0 || text.length > LIST_LIMITS.memory) {
    throw new ToolFailure('invalid', `memory: de 1 a ${LIST_LIMITS.memory} caracteres.`, { field: 'memory' })
  }
  await oneItem(ctx, id)
  const { error } = await ctx.db
    .from('list_memories')
    .upsert({ item_id: id, couple_id: couple.coupleId, profile_id: ctx.userId, body: text }, { onConflict: 'item_id,profile_id' })
  if (error) throw dbFailure(error)
  return { status: 'ok', item_id: id, by: couple.me.name, body: text }
}

/** Arquivos primeiro, linha depois, como o `deleteItem` do app (spec seção 7). */
export async function deleteListItem(ctx: Ctx, id: string) {
  const row = await oneItem(ctx, id)
  const { data: photos, error: photosError } = await ctx.db.from('list_photos').select('path').eq('item_id', id)
  if (photosError) throw dbFailure(photosError)
  const paths = [...new Set([row.photo_path, ...(photos ?? []).map((p) => p.path as string)].filter((p): p is string => !!p))]
  if (paths.length > 0) {
    const { error } = await ctx.db.storage.from(MEDIA_BUCKET).remove(paths)
    if (error) throw new ToolFailure('error', `As fotos não saíram, nada foi apagado: ${error.message}`)
  }
  const { error } = await ctx.db.from('list_items').delete().eq('id', id)
  if (error) {
    throw new ToolFailure('files_deleted_row_failed', `As fotos de ${row.name} foram apagadas, mas o item não: ${error.message}`)
  }
  return { status: 'ok', deleted: { id, name: row.name, category: row.category, files_removed: paths.length } }
}
