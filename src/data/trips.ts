// Fronteira de banco das Viagens (Fase 6). snake_case não passa daqui — o
// mapeamento mora em `tripRow.ts`.
//
// Spec: .agent/Tasks/fase-6-viagens.md, seções 5 ("Cliente — fronteira de
//       dados"), 6 (os nomes das constraints), 7 (comportamento em falha) e 8
// ADR:  .agent/Decisions/0019-viagem-e-o-evento-estendido-por-trips.md
//       .agent/Decisions/0012-midia-do-casal-em-bucket-por-casal.md (`trip/`)
//       .agent/Decisions/0018-periodo-se-grava-pintando-estadias.md
//
// Nenhuma query filtra por `couple_id` (ADR 0001). Onde há `.eq('id' |
// 'trip_id' | 'event_id' | 'kind' | …)`, é IDENTIDADE — qual linha das que a
// pessoa pode ver —, não autorização. No INSERT o `couple_id` vai como DADO
// da linha nova (a FK composta confere que é o da viagem, e a policy `with
// check` recusa outro casal). `create_trip` nem o recebe: descobre pela sessão.
//
// Toda escrita valida o rascunho com `tripValidation.ts` (o espelho dos CHECK)
// ANTES de chamar o banco: o que o domínio recusa volta `rejected` com o
// campo, sem viagem de rede. Chegar `invalid` do banco depois disso é
// divergência entre os dois, e a causa aparece (a tela mostra a regra).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarEvent, EventDraft } from '../domain/calendar'
import { validateEvent } from '../domain/calendar'
import type { ListItem } from '../domain/list'
import type {
  BudgetDraft,
  BudgetLine,
  ItineraryDraft,
  ItineraryItem,
  Lodging,
  MemoryDraft,
  NewTripDraft,
  PrepDraft,
  PrepItem,
  Trip,
  TripDeparture,
  TripMemory,
  TripPhoto,
} from '../domain/trips'
import { EMPTY_LODGING, TRIP_LIMITS } from '../domain/trips'
import {
  trimSpaces,
  validateBudget,
  validateCaption,
  validateDayTitle,
  validateDeparture,
  validateItinerary,
  validateLodging,
  validateMemory,
  validatePrep,
} from '../domain/tripValidation'
import type { TripValidation } from '../domain/tripValidation'
import type { Database, Json } from '../lib/database.types'
import { localDateOfEpoch } from '../lib/date'
import { prepareMemoryPhoto } from './avatar'
import type { PrepareResult } from './avatar'
import { constraintName, deleteEvent, updateEvent } from './calendar'
import { rowToEvent } from './calendarRow'
import { rowToItem } from './listRow'
import { MEDIA_BUCKET, UPLOAD_CONCURRENCY, mediaPath, removeMediaQuietly, signedMediaUrls, uploadMedia } from './media'
import { selectAll } from './paginate'
import type { DataResult } from './result'
import {
  assembleTrips,
  budgetToInsert,
  budgetToUpdate,
  dayTitleToRow,
  departureToRow,
  itineraryToInsert,
  itineraryToUpdate,
  lodgingToColumns,
  memoryToRow,
  newTripToPayload,
  photoToInsert,
  prepToInsert,
  prepToUpdate,
  rowToBudget,
  rowToItinerary,
  rowToMemory,
  rowToPhoto,
  rowToPrep,
} from './tripRow'
import type { TripKey } from './tripRow'

type Db = SupabaseClient<Database>

// ---------------------------------------------------------------------------
// Resultados e erros
// ---------------------------------------------------------------------------

/**
 * O que qualquer escrita das Viagens pode devolver além do `ok`.
 * - `rejected`: o DOMÍNIO recusou o rascunho (nada foi ao banco); `field` é o
 *   campo do rascunho e `reason` a frase para mostrar junto dele.
 * - `invalid`: o BANCO recusou (CHECK, trigger ou unicidade); `constraint` é o
 *   nome da regra (`trip_itinerary_day_in_trip`, `trip_photos_limit`, …).
 * - `not_found`: a linha (ou a viagem) não existe mais — a outra pessoa apagou.
 * - `not_member`: o espaço mudou (a pessoa saiu do casal) → "recarregue".
 */
export type TripFailure =
  | { status: 'rejected'; field: string; reason: string }
  | { status: 'invalid'; constraint: string; cause: string }
  | { status: 'not_found' }
  | { status: 'not_member' }
  | { status: 'unauthenticated' }
  | { status: 'error'; cause: string }

export type TripWrite<T = null> = { status: 'ok'; value: T } | TripFailure

interface PgError {
  code?: string
  message: string
  hint?: string | null
  details?: string | null
}

/**
 * Erro do PostgREST → caso nomeado. `42501` numa escrita DIRETA, com a sessão
 * já conferida, é a policy recusando (saiu do casal em outro aparelho) →
 * `not_member`; de uma RPC, é "sem sessão". `23503` é a FK composta: a viagem
 * (ou o item da Lista) sumiu entre a leitura e a escrita → `not_found`.
 */
export function translateTripError(error: PgError, origin: 'rpc' | 'write' = 'write'): TripFailure {
  if (error.code === 'PGRST301' || error.code === '401') return { status: 'unauthenticated' }
  if (error.code === '42501') return origin === 'write' ? { status: 'not_member' } : { status: 'unauthenticated' }
  if (error.code === '23503') return { status: 'not_found' }
  if (error.code?.startsWith('23')) {
    return { status: 'invalid', constraint: constraintName(error) ?? error.code, cause: error.message }
  }
  return { status: 'error', cause: error.message }
}

async function sessionUid(db: Db): Promise<string | null> {
  const { data } = await db.auth.getSession()
  return data.session?.user.id ?? null
}

function rejected<F extends string>(v: Exclude<TripValidation<F>, { ok: true }>): TripFailure {
  return { status: 'rejected', field: v.field, reason: v.reason }
}

// ---------------------------------------------------------------------------
// Normalização dos rascunhos (antes de validar)
//
// Obrigatório: apara os espaços das pontas (o que o `btrim` do CHECK mede).
// Opcional: aparado; vazio vira `null` — o campo apagado na tela é "sem nota",
// não "nota em branco". Só-espaço também vira `null` (a validação recusaria
// um texto que a pessoa só não preencheu).
// ---------------------------------------------------------------------------

const required = (s: string): string => trimSpaces(s)
const optional = (s: string | null): string | null => {
  if (s === null) return null
  const t = trimSpaces(s)
  return t === '' ? null : t
}

export function normalizeItinerary(d: ItineraryDraft): ItineraryDraft {
  return { ...d, title: required(d.title), note: optional(d.note), at: d.at === '' ? null : d.at }
}
export function normalizePrep(d: PrepDraft): PrepDraft {
  return { ...d, label: required(d.label), detail: optional(d.detail) }
}
export function normalizeBudget(d: BudgetDraft): BudgetDraft {
  return { ...d, label: required(d.label) }
}
export function normalizeMemory(d: MemoryDraft): MemoryDraft {
  return { ...d, body: required(d.body) }
}
export function normalizeLodging(l: Lodging): Lodging {
  return {
    ...l,
    name: optional(l.name),
    address: optional(l.address),
    url: optional(l.url),
    code: optional(l.code),
    checkIn: l.checkIn === '' ? null : l.checkIn,
    checkOut: l.checkOut === '' ? null : l.checkOut,
  }
}
export function normalizeDeparture(d: TripDeparture): TripDeparture {
  return { ...d, originCode: optional(d.originCode), note: optional(d.note) }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface TripsData {
  /** As viagens (I1, R2), na ordem de `starts_on`. */
  trips: Trip[]
  /**
   * Os eventos crus das viagens, por id. Editar o evento (título, destino,
   * datas, nota) passa pelo `updateEvent` do Calendário, que grava a linha
   * INTEIRA — daí a tela precisar do evento como está, não só do `Trip`.
   */
  events: Map<string, CalendarEvent>
}

/**
 * Os eventos `viagem` dos dois, `trips` e as sete filhas, em paralelo, cada um
 * paginado até o fim (`selectAll`: 50 viagens × 200 fotos passam do corte de
 * 1000 do PostgREST, seção 8), com `order` terminando numa coluna única.
 * Qualquer uma que falhe derruba o todo: a tela não mostra viagem sem fotos
 * como se ninguém tivesse subido nenhuma (seção 7).
 */
export async function loadTrips(db: Db): Promise<DataResult<TripsData>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const [events, trips, departures, days, itinerary, prep, budget, memories, photos] = await Promise.all([
    selectAll((from, to) =>
      db
        .from('calendar_events')
        .select('*')
        .eq('kind', 'viagem')
        .eq('travelers', 'both')
        .order('starts_on')
        .order('id')
        .range(from, to),
    ),
    selectAll((from, to) => db.from('trips').select('*').order('event_id').range(from, to)),
    selectAll((from, to) =>
      db.from('trip_departures').select('*').order('trip_id').order('profile_id').range(from, to),
    ),
    selectAll((from, to) => db.from('trip_days').select('*').order('trip_id').order('day').range(from, to)),
    selectAll((from, to) =>
      db.from('trip_itinerary_items').select('*').order('trip_id').order('day').order('id').range(from, to),
    ),
    selectAll((from, to) =>
      db.from('trip_prep_items').select('*').order('trip_id').order('position').order('id').range(from, to),
    ),
    selectAll((from, to) =>
      db.from('trip_budget_lines').select('*').order('trip_id').order('position').order('id').range(from, to),
    ),
    selectAll((from, to) =>
      db.from('trip_memories').select('*').order('trip_id').order('profile_id').range(from, to),
    ),
    selectAll((from, to) =>
      db.from('trip_photos').select('*').order('trip_id').order('created_at').order('id').range(from, to),
    ),
  ])
  for (const r of [events, trips, departures, days, itinerary, prep, budget, memories, photos]) {
    if (r.status !== 'ok') return r
  }
  // Os `status` acima já foram conferidos; o TS não estreita através do laço.
  const ok = <T>(r: DataResult<T>): T => (r as { rows: T }).rows
  const eventList = ok(events).map(rowToEvent)
  const assembled = assembleTrips(eventList, ok(trips), {
    departures: ok(departures),
    days: ok(days),
    itinerary: ok(itinerary),
    prep: ok(prep),
    budget: ok(budget),
    memories: ok(memories),
    photos: ok(photos),
  })
  const ids = new Set(assembled.map((t) => t.id))
  return {
    status: 'ok',
    rows: { trips: assembled, events: new Map(eventList.filter((e) => ids.has(e.id)).map((e) => [e.id, e])) },
  }
}

/**
 * Os itens da Lista INTEIROS (com lugar e status) — "perto do destino",
 * "feitos aqui", "destinos dos sonhos" e o vínculo do roteiro. Sem memórias
 * nem fotos da Lista: as Viagens não as mostram.
 */
export async function loadTripListItems(db: Db): Promise<DataResult<ListItem[]>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const read = await selectAll((from, to) =>
    db.from('list_items').select('*').order('created_at', { ascending: false }).order('id').range(from, to),
  )
  if (read.status !== 'ok') return read
  return { status: 'ok', rows: read.rows.map(rowToItem) }
}

/** URLs assinadas das fotos visíveis, num lote (1 hora, seção 8). */
export function tripSignedUrls(db: Db, paths: readonly (string | null)[]): Promise<DataResult<Map<string, string>>> {
  return signedMediaUrls(db, paths)
}

// ---------------------------------------------------------------------------
// A viagem: criar, editar o evento, editar `trips`, apagar
// ---------------------------------------------------------------------------

/** O evento que `create_trip` grava (a RPC força `viagem`, os dois, dia inteiro). */
export function tripEventDraft(draft: Pick<NewTripDraft, 'title' | 'cityId' | 'startsOn' | 'endsOn' | 'note'>): EventDraft {
  return {
    kind: 'viagem',
    title: draft.title,
    startsOn: draft.startsOn,
    endsOn: draft.endsOn,
    allDay: true,
    startsAt: null,
    endsAt: null,
    travelers: 'both',
    travelerId: null,
    cityId: draft.cityId,
    place: null,
    repeatsYearly: false,
    note: draft.note,
    listItemId: null,
  }
}

export function normalizeNewTrip(draft: NewTripDraft): NewTripDraft {
  return {
    ...draft,
    title: draft.title.trim(),
    note: optional(draft.note),
    lodgingName: optional(draft.lodgingName),
    departures: draft.departures.map(normalizeDeparture),
  }
}

/**
 * `create_trip` (R25): o evento com a pintura, `trips` com os cinco itens de
 * preparação, a hospedagem e as saídas, numa transação (seção 7: falhou →
 * nada foi gravado). A capa é um passo à parte (`uploadTripCover`), depois.
 */
export async function createTrip(db: Db, input: NewTripDraft): Promise<TripWrite<{ id: string }>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const draft = normalizeNewTrip(input)
  const event = validateEvent(tripEventDraft(draft))
  if (!event.ok) return { status: 'rejected', field: event.field, reason: event.reason }
  const lodging = validateLodging({ ...EMPTY_LODGING, name: draft.lodgingName })
  if (!lodging.ok) return { status: 'rejected', field: 'lodgingName', reason: lodging.reason }
  for (const d of draft.departures) {
    const v = validateDeparture(d)
    if (!v.ok) return { status: 'rejected', field: `departures.${v.field}`, reason: v.reason }
  }

  const { data, error } = await (
    db.rpc as (f: string, a: unknown) => PromiseLike<{ data: unknown; error: PgError | null }>
  )('create_trip', { p_trip: newTripToPayload(draft) as unknown as Json })
  if (error) return translateTripError(error, 'rpc')
  const body = (data ?? null) as { status?: unknown; id?: unknown } | null
  if (body?.status === 'not_member') return { status: 'not_member' }
  if (body?.status !== 'ok') return { status: 'error', cause: `create_trip: status inesperado ${String(body?.status)}` }
  if (typeof body.id !== 'string') return { status: 'error', cause: 'create_trip: resposta sem id' }
  return { status: 'ok', value: { id: body.id } }
}

/** O que _Editar viagem_ muda no EVENTO (R26). Nunca repinta (ADR 0018). */
export interface TripEventPatch {
  title: string
  cityId: string
  startsOn: string
  endsOn: string
  note: string | null
}

/**
 * Editar o evento da viagem pelo `updateEvent` do Calendário: o resto da linha
 * (hora de ida e volta, vínculo, …) vem do evento como está. Update direto —
 * as estadias não mudam (I1, ADR 0018).
 */
export async function updateTripEvent(db: Db, event: CalendarEvent, patch: TripEventPatch): Promise<TripWrite> {
  const { id: _id, createdBy: _createdBy, ...rest } = event
  const draft: EventDraft = {
    ...rest,
    title: patch.title.trim(),
    cityId: patch.cityId,
    startsOn: patch.startsOn,
    endsOn: patch.endsOn,
    note: optional(patch.note),
  }
  const v = validateEvent(draft)
  if (!v.ok) return { status: 'rejected', field: v.field, reason: v.reason }
  const result = await updateEvent(db, event.id, draft)
  switch (result.status) {
    case 'ok':
      return { status: 'ok', value: null }
    case 'invalid':
      return { status: 'invalid', constraint: result.constraint, cause: result.constraint }
    default:
      return result
  }
}

/** Colunas de `trips` que a tela muda: a hospedagem (R20d) e a capa (R22). */
export interface TripPatch {
  lodging?: Lodging
  coverPhotoId?: string | null
}

/** Zero linhas = a viagem sumiu (a outra pessoa apagou) → `not_found`, e a tela relê. */
export async function updateTrip(db: Db, tripId: string, patch: TripPatch): Promise<TripWrite> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  let columns: Database['public']['Tables']['trips']['Update'] = {}
  if (patch.lodging) {
    const lodging = normalizeLodging(patch.lodging)
    const v = validateLodging(lodging)
    if (!v.ok) return rejected(v)
    columns = { ...columns, ...lodgingToColumns(lodging) }
  }
  if (patch.coverPhotoId !== undefined) columns = { ...columns, cover_photo_id: patch.coverPhotoId }
  if (Object.keys(columns).length === 0) return { status: 'ok', value: null }
  const { data, error } = await db.from('trips').update(columns).eq('event_id', tripId).select('event_id')
  if (error) return translateTripError(error)
  if ((data ?? []).length !== 1) return { status: 'not_found' }
  return { status: 'ok', value: null }
}

export type DeleteTripResult =
  | { status: 'ok' }
  /** Os arquivos saíram e o evento não: a tela diz a verdade e relê. */
  | { status: 'files_deleted_row_failed'; cause: string }
  | TripFailure

/**
 * Seção 7 / R26, "Apagar viagem": (1) os ARQUIVOS das fotos — os que a tela
 * tinha somados aos que o banco diz agora (a outra pessoa pode ter subido uma
 * depois da última leitura; o cascade levaria a linha e o arquivo ficaria
 * órfão sem registro). Releitura ou remoção falhou → para, nada no banco é
 * apagado. (2) o EVENTO, e o cascade leva `trips` e as filhas. O período no
 * calendário continua (I1). Zero linhas em (2) = já apagado → `ok`.
 */
export async function deleteTrip(db: Db, trip: Pick<Trip, 'id' | 'photos'>): Promise<DeleteTripResult> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const stored = await selectAll((from, to) =>
    db.from('trip_photos').select('path').eq('trip_id', trip.id).order('id').range(from, to),
  )
  if (stored.status !== 'ok') return stored
  const paths = [...new Set([...trip.photos.map((p) => p.path), ...stored.rows.map((r) => r.path)])]
  if (paths.length > 0) {
    const { error } = await db.storage.from(MEDIA_BUCKET).remove(paths)
    if (error) return { status: 'error', cause: error.message }
  }
  const result = await deleteEvent(db, trip.id)
  if (result.status === 'ok') return { status: 'ok' }
  if (paths.length > 0) {
    const cause = result.status === 'error' ? result.cause : result.status
    return { status: 'files_deleted_row_failed', cause }
  }
  return result.status === 'invalid' ? { status: 'invalid', constraint: result.constraint, cause: result.constraint } : result
}

// ---------------------------------------------------------------------------
// Título do dia (R20)
// ---------------------------------------------------------------------------

/** Vazio (ou só espaço) apaga o título; senão, upsert por `(trip_id, day)`. */
export async function setDayTitle(db: Db, k: TripKey, day: string, title: string | null): Promise<TripWrite> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const clean = optional(title)
  if (clean === null) {
    const { error } = await db.from('trip_days').delete().eq('trip_id', k.tripId).eq('day', day)
    if (error) return translateTripError(error)
    return { status: 'ok', value: null }
  }
  const v = validateDayTitle(clean)
  if (!v.ok) return rejected(v)
  const { error } = await db.from('trip_days').upsert(dayTitleToRow(k, day, clean), { onConflict: 'trip_id,day' })
  if (error) return translateTripError(error)
  return { status: 'ok', value: null }
}

// ---------------------------------------------------------------------------
// Linhas com id: roteiro, preparação, orçamento
// ---------------------------------------------------------------------------

type RowTable = 'trip_itinerary_items' | 'trip_prep_items' | 'trip_budget_lines'

/** Update por id devolvendo a linha; zero linhas = `not_found`. */
async function updateById<R, T>(
  db: Db,
  table: RowTable,
  id: string,
  columns: Record<string, unknown>,
  map: (row: R) => T,
): Promise<TripWrite<T>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const { data, error } = await (
    db.from(table) as unknown as {
      update: (c: unknown) => { eq: (c: string, v: string) => { select: (s: string) => PromiseLike<{ data: R[] | null; error: PgError | null }> } }
    }
  )
    .update(columns)
    .eq('id', id)
    .select('*')
  if (error) return translateTripError(error)
  const rows = data ?? []
  if (rows.length !== 1) return { status: 'not_found' }
  return { status: 'ok', value: map(rows[0]) }
}

/** Delete por id. Zero linhas = a outra pessoa já apagou → `ok` (idempotente). */
async function deleteById(db: Db, table: RowTable | 'trip_photos', id: string): Promise<TripWrite> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const { error } = await db.from(table).delete().eq('id', id)
  if (error) return translateTripError(error)
  return { status: 'ok', value: null }
}

export async function createItinerary(db: Db, k: TripKey, input: ItineraryDraft, position = 0): Promise<TripWrite<ItineraryItem>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const draft = normalizeItinerary(input)
  const v = validateItinerary(draft)
  if (!v.ok) return rejected(v)
  const { data, error } = await db.from('trip_itinerary_items').insert(itineraryToInsert(k, draft, position)).select('*').single()
  if (error) return translateTripError(error)
  return { status: 'ok', value: rowToItinerary(data) }
}

export function updateItinerary(db: Db, id: string, input: ItineraryDraft): Promise<TripWrite<ItineraryItem>> {
  const draft = normalizeItinerary(input)
  const v = validateItinerary(draft)
  if (!v.ok) return Promise.resolve(rejected(v))
  return updateById(db, 'trip_itinerary_items', id, itineraryToUpdate(draft), rowToItinerary)
}

export function deleteItinerary(db: Db, id: string): Promise<TripWrite> {
  return deleteById(db, 'trip_itinerary_items', id)
}

export async function createPrep(db: Db, k: TripKey, input: PrepDraft, position = 0): Promise<TripWrite<PrepItem>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const draft = normalizePrep(input)
  const v = validatePrep(draft)
  if (!v.ok) return rejected(v)
  const { data, error } = await db.from('trip_prep_items').insert(prepToInsert(k, draft, position)).select('*').single()
  if (error) return translateTripError(error)
  return { status: 'ok', value: rowToPrep(data) }
}

export function updatePrep(db: Db, id: string, input: PrepDraft): Promise<TripWrite<PrepItem>> {
  const draft = normalizePrep(input)
  const v = validatePrep(draft)
  if (!v.ok) return Promise.resolve(rejected(v))
  return updateById(db, 'trip_prep_items', id, prepToUpdate(draft), rowToPrep)
}

/** R20b: tocar na caixa. Só `done` — o resto da linha fica como o outro deixou. */
export function setPrepDone(db: Db, id: string, done: boolean): Promise<TripWrite<PrepItem>> {
  return updateById(db, 'trip_prep_items', id, { done }, rowToPrep)
}

export function deletePrep(db: Db, id: string): Promise<TripWrite> {
  return deleteById(db, 'trip_prep_items', id)
}

export async function createBudget(db: Db, k: TripKey, input: BudgetDraft, position = 0): Promise<TripWrite<BudgetLine>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const draft = normalizeBudget(input)
  const v = validateBudget(draft)
  if (!v.ok) return rejected(v)
  const { data, error } = await db.from('trip_budget_lines').insert(budgetToInsert(k, draft, position)).select('*').single()
  if (error) return translateTripError(error)
  return { status: 'ok', value: rowToBudget(data) }
}

export function updateBudget(db: Db, id: string, input: BudgetDraft): Promise<TripWrite<BudgetLine>> {
  const draft = normalizeBudget(input)
  const v = validateBudget(draft)
  if (!v.ok) return Promise.resolve(rejected(v))
  return updateById(db, 'trip_budget_lines', id, budgetToUpdate(draft), rowToBudget)
}

export function deleteBudget(db: Db, id: string): Promise<TripWrite> {
  return deleteById(db, 'trip_budget_lines', id)
}

// ---------------------------------------------------------------------------
// Memória (uma por pessoa, R23 / I11) e saídas
// ---------------------------------------------------------------------------

/**
 * Upsert da PRÓPRIA memória: `profile_id` = a sessão (a policy recusa outro).
 * `written_on` fica o da primeira escrita (default do banco no insert).
 */
export async function saveTripMemory(db: Db, k: TripKey, input: MemoryDraft): Promise<TripWrite<TripMemory>> {
  const uid = await sessionUid(db)
  if (!uid) return { status: 'unauthenticated' }
  const draft = normalizeMemory(input)
  const v = validateMemory(draft)
  if (!v.ok) return rejected(v)
  const { data, error } = await db
    .from('trip_memories')
    .upsert(memoryToRow(k, uid, draft), { onConflict: 'trip_id,profile_id' })
    .select('*')
    .single()
  if (error) return translateTripError(error)
  return { status: 'ok', value: rowToMemory(data) }
}

export async function deleteTripMemory(db: Db, tripId: string): Promise<TripWrite> {
  const uid = await sessionUid(db)
  if (!uid) return { status: 'unauthenticated' }
  const { error } = await db.from('trip_memories').delete().eq('trip_id', tripId).eq('profile_id', uid)
  if (error) return translateTripError(error)
  return { status: 'ok', value: null }
}

/** As saídas (R24/R26), upsert por `(trip_id, profile_id)`. Todas validadas antes de gravar qualquer uma. */
export async function saveDepartures(db: Db, k: TripKey, input: readonly TripDeparture[]): Promise<TripWrite> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const departures = input.map(normalizeDeparture)
  for (const d of departures) {
    const v = validateDeparture(d)
    if (!v.ok) return rejected(v)
  }
  if (departures.length === 0) return { status: 'ok', value: null }
  const { error } = await db
    .from('trip_departures')
    .upsert(departures.map((d) => departureToRow(k, d)), { onConflict: 'trip_id,profile_id' })
  if (error) return translateTripError(error)
  return { status: 'ok', value: null }
}

// ---------------------------------------------------------------------------
// Fotos (R21, R22, R25)
// ---------------------------------------------------------------------------

export type Prepare = (file: File) => Promise<PrepareResult>

/** A viagem como o upload a precisa: onde grava e em que datas o `taken_on` vale. */
export interface PhotoTarget extends TripKey {
  startsOn: string
  endsOn: string
}

/** Por que um arquivo não entrou. `index` é a posição dele no que a pessoa escolheu. */
export interface PhotoFailure {
  index: number
  reason: 'not_image' | 'too_large' | 'upload_failed' | 'row_failed'
  cause: string | null
}

export type UploadPhotosResult =
  | { status: 'ok'; added: TripPhoto[]; failed: PhotoFailure[] }
  | { status: 'rejected'; field: 'files'; reason: string }
  | { status: 'unauthenticated' }

/** R21: a data do arquivo, se cair dentro da viagem; senão nula (sem EXIF, seção 14). */
export function takenOnFor(target: Pick<PhotoTarget, 'startsOn' | 'endsOn'>, file: Pick<File, 'lastModified'>): string | null {
  if (!Number.isFinite(file.lastModified) || file.lastModified <= 0) return null
  const day = localDateOfEpoch(file.lastModified)
  return target.startsOn <= day && day <= target.endsOn ? day : null
}

/**
 * Um arquivo: reduz → sobe para `<casal>/trip/<uuid>.<ext>` → insere a linha.
 * A linha falhou (teto de 500, viagem apagada) → o arquivo recém-subido sai
 * (seção 7: arquivo órfão nunca aponta de uma linha viva, e linha nunca
 * aponta para arquivo que não subiu).
 */
async function addOnePhoto(
  db: Db,
  target: PhotoTarget,
  file: File,
  index: number,
  prepare: Prepare,
): Promise<{ ok: true; photo: TripPhoto } | { ok: false; failure: PhotoFailure }> {
  const prepared = await prepare(file)
  if (prepared.status !== 'ok') return { ok: false, failure: { index, reason: prepared.status, cause: null } }
  const path = mediaPath(target.coupleId, 'trip', prepared.extension)
  const uploaded = await uploadMedia(db, path, prepared)
  if (uploaded.error) return { ok: false, failure: { index, reason: 'upload_failed', cause: uploaded.error } }
  const { data, error } = await db
    .from('trip_photos')
    .insert(photoToInsert(target, { path, takenOn: takenOnFor(target, file) }))
    .select('*')
    .single()
  if (error) {
    await removeMediaQuietly(db, [path])
    const failure = translateTripError(error)
    const cause = failure.status === 'invalid' ? failure.constraint : failure.status === 'error' ? failure.cause : failure.status
    return { ok: false, failure: { index, reason: 'row_failed', cause } }
  }
  return { ok: true, photo: rowToPhoto(data) }
}

/**
 * R21: até 50 por vez, 3 em paralelo. Cada arquivo é independente: a falha de
 * um não para os outros (ao contrário do _Marcar como feito_ da Lista, que é
 * tudo ou nada). `onProgress(k, n)` a cada arquivo concluído, com ou sem
 * sucesso — o _"Enviando {k} de {n}"_. `added` sai na ordem escolhida.
 */
export async function uploadTripPhotos(
  db: Db,
  target: PhotoTarget,
  files: readonly File[],
  options: { prepare?: Prepare; onProgress?: (done: number, total: number) => void } = {},
): Promise<UploadPhotosResult> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  if (files.length > TRIP_LIMITS.photosPerUpload) {
    return { status: 'rejected', field: 'files', reason: `No máximo ${TRIP_LIMITS.photosPerUpload} fotos por vez.` }
  }
  const prepare = options.prepare ?? prepareMemoryPhoto
  const added: (TripPhoto | undefined)[] = new Array(files.length)
  const failed: PhotoFailure[] = []
  const state = { next: 0, done: 0 }

  async function worker() {
    while (state.next < files.length) {
      const index = state.next++
      const result = await addOnePhoto(db, target, files[index], index, prepare)
      if (result.ok) added[index] = result.photo
      else failed.push(result.failure)
      state.done++
      options.onProgress?.(state.done, files.length)
    }
  }

  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, worker))
  return {
    status: 'ok',
    added: added.filter((p): p is TripPhoto => p !== undefined),
    failed: failed.sort((a, b) => a.index - b.index),
  }
}

/**
 * R25 / R22: uma foto nova vira a capa. Sobe como qualquer foto da viagem e
 * aponta `cover_photo_id` para ela. Se apontar falhar, a foto recém-criada sai
 * (linha e arquivo): uma capa que não pegou não deve aparecer como foto solta
 * na galeria. Quem chama (Nova viagem) diz _"A viagem foi salva, mas a capa
 * não subiu."_.
 */
export async function uploadTripCover(
  db: Db,
  target: PhotoTarget,
  file: File,
  prepare: Prepare = prepareMemoryPhoto,
): Promise<TripWrite<TripPhoto> | { status: 'photo_failed'; failure: PhotoFailure }> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const result = await addOnePhoto(db, target, file, 0, prepare)
  if (!result.ok) return { status: 'photo_failed', failure: result.failure }
  const cover = await updateTrip(db, target.tripId, { coverPhotoId: result.photo.id })
  if (cover.status !== 'ok') {
    await db.from('trip_photos').delete().eq('id', result.photo.id)
    await removeMediaQuietly(db, [result.photo.path])
    return cover
  }
  return { status: 'ok', value: result.photo }
}

async function updatePhoto(
  db: Db,
  id: string,
  columns: Database['public']['Tables']['trip_photos']['Update'],
): Promise<TripWrite<TripPhoto>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const { data, error } = await db.from('trip_photos').update(columns).eq('id', id).select('*')
  if (error) return translateTripError(error)
  const rows = data ?? []
  if (rows.length !== 1) return { status: 'not_found' }
  return { status: 'ok', value: rowToPhoto(rows[0]) }
}

/** R22: vazio apaga a legenda. */
export function setPhotoCaption(db: Db, id: string, caption: string | null): Promise<TripWrite<TripPhoto>> {
  const clean = optional(caption)
  const v = validateCaption(clean)
  if (!v.ok) return Promise.resolve(rejected(v))
  return updatePhoto(db, id, { caption: clean })
}

export function setPhotoFavorite(db: Db, id: string, favorite: boolean): Promise<TripWrite<TripPhoto>> {
  return updatePhoto(db, id, { favorite })
}

/**
 * Seção 7, "Apagar foto": ARQUIVO, depois LINHA (a ordem da spec, oposta à
 * Lista). O arquivo não saiu → nada muda. A linha falhou depois → a galeria
 * mostra o quadro vazio com _Apagar_, e apagar de novo funciona (remover um
 * arquivo que já não existe não é erro no Storage). Se era a capa, a FK
 * `trips_cover_same_trip` com `on delete set null` esvazia a capa sozinha.
 */
export async function deleteTripPhoto(db: Db, photo: Pick<TripPhoto, 'id' | 'path'>): Promise<TripWrite> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const { error: removeError } = await db.storage.from(MEDIA_BUCKET).remove([photo.path])
  if (removeError) return { status: 'error', cause: removeError.message }
  return deleteById(db, 'trip_photos', photo.id)
}
