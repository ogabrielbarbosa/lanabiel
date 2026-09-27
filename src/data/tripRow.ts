// Viagens (Fase 6): a fronteira entre o domínio (camelCase, `Trip`, os
// rascunhos de `src/domain/trips.ts`) e as colunas de `trips` e das
// tabelas-filhas. O snake_case não passa daqui. Puro, sem rede: o mesmo
// mapeador serve à fronteira de dados (`src/data/trips.ts`) e ao teste de
// banco que roda `TRIP_VALIDATION_CASES` (A2) — um bug de mapeamento aparece
// nos dois lados, em vez de ser mascarado.
//
// Spec: .agent/Tasks/fase-6-viagens.md, seção 5 · migration 20260927120000_trips.sql
// ADR:  .agent/Decisions/0019-viagem-e-o-evento-estendido-por-trips.md
//
// Os mapeadores não aparam nem validam: isso é da fronteira de dados (que
// valida com `tripValidation.ts` antes de gravar). Aqui é só forma.

import type { CalendarEvent } from '../domain/calendar'
import type {
  BudgetDraft,
  BudgetLine,
  ItineraryDraft,
  ItineraryItem,
  ItineraryKind,
  Lodging,
  MemoryDraft,
  NewTripDraft,
  PrepDraft,
  PrepItem,
  PrepKind,
  Trip,
  TripDayTitle,
  TripDeparture,
  TripMemory,
  TripPhoto,
} from '../domain/trips'
import { EMPTY_LODGING } from '../domain/trips'
import type { Database } from '../lib/database.types'

type Tables = Database['public']['Tables']

// Tipos gerados (`npm run types:gen`): renomear coluna quebra o typecheck aqui.
export type TripRow = Tables['trips']['Row']
export type TripDepartureRow = Tables['trip_departures']['Row']
export type TripDayRow = Tables['trip_days']['Row']
export type TripItineraryRow = Tables['trip_itinerary_items']['Row']
export type TripPrepRow = Tables['trip_prep_items']['Row']
export type TripBudgetRow = Tables['trip_budget_lines']['Row']
export type TripMemoryRow = Tables['trip_memories']['Row']
export type TripPhotoRow = Tables['trip_photos']['Row']

/** A chave que toda filha repete (I12): a viagem e o casal da FK composta. */
export interface TripKey {
  tripId: string
  coupleId: string
}

const key = (k: TripKey) => ({ trip_id: k.tripId, couple_id: k.coupleId })

// ---------------------------------------------------------------------------
// Horas
// ---------------------------------------------------------------------------

/** `time` do Postgres volta `HH:MM:SS`; o domínio fala `HH:MM`. */
function hhmm(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5)
}

/**
 * `timestamp` sem fuso volta `YYYY-MM-DDTHH:MM:SS` (às vezes com espaço no
 * lugar do `T`); o domínio fala `YYYY-MM-DDTHH:MM`, hora local do lugar.
 */
function localStamp(value: string | null): string | null {
  return value === null ? null : value.replace(' ', 'T').slice(0, 16)
}

// ---------------------------------------------------------------------------
// trips (hospedagem e capa) e create_trip
// ---------------------------------------------------------------------------

/** As colunas `lodging_*` de `trips`. */
export type LodgingColumns = Required<
  Pick<
    Tables['trips']['Update'],
    | 'lodging_name' | 'lodging_address' | 'lodging_check_in' | 'lodging_check_out'
    | 'lodging_url' | 'lodging_code' | 'lodging_cents' | 'lodging_paid'
  >
>

export function lodgingToColumns(l: Lodging): LodgingColumns {
  return {
    lodging_name: l.name,
    lodging_address: l.address,
    lodging_check_in: l.checkIn,
    lodging_check_out: l.checkOut,
    lodging_url: l.url,
    lodging_code: l.code,
    lodging_cents: l.cents,
    lodging_paid: l.paid,
  }
}

export function rowToLodging(row: TripRow): Lodging {
  return {
    name: row.lodging_name,
    address: row.lodging_address,
    checkIn: localStamp(row.lodging_check_in),
    checkOut: localStamp(row.lodging_check_out),
    url: row.lodging_url,
    code: row.lodging_code,
    cents: row.lodging_cents,
    paid: row.lodging_paid,
  }
}

/** O `p_trip` de `create_trip` (a RPC tira o casal e o autor da sessão). */
export interface CreateTripPayload {
  title: string
  city_id: string
  starts_on: string
  ends_on: string
  note: string | null
  lodging_name: string | null
  departures: { profile_id: string; origin_code: string | null; note: string | null }[]
}

export function newTripToPayload(draft: NewTripDraft): CreateTripPayload {
  return {
    title: draft.title,
    city_id: draft.cityId,
    starts_on: draft.startsOn,
    ends_on: draft.endsOn,
    note: draft.note,
    lodging_name: draft.lodgingName,
    departures: draft.departures.map((d) => ({ profile_id: d.profileId, origin_code: d.originCode, note: d.note })),
  }
}

// ---------------------------------------------------------------------------
// Filhas
// ---------------------------------------------------------------------------

export function departureToRow(k: TripKey, d: TripDeparture): Tables['trip_departures']['Insert'] {
  return { ...key(k), profile_id: d.profileId, origin_code: d.originCode, note: d.note }
}

export function rowToDeparture(row: TripDepartureRow): TripDeparture {
  return { profileId: row.profile_id, originCode: row.origin_code, note: row.note }
}

export function dayTitleToRow(k: TripKey, day: string, title: string): Tables['trip_days']['Insert'] {
  return { ...key(k), day, title }
}

export function rowToDayTitle(row: TripDayRow): TripDayTitle {
  return { day: row.day, title: row.title }
}

/** Editar: sem viagem nem casal (a linha não muda de viagem). */
export type ItineraryColumns = Required<
  Pick<Tables['trip_itinerary_items']['Update'], 'day' | 'at' | 'title' | 'kind' | 'note' | 'list_item_id'>
>

export function itineraryToUpdate(d: ItineraryDraft): ItineraryColumns {
  return { day: d.day, at: d.at, title: d.title, kind: d.kind, note: d.note, list_item_id: d.listItemId }
}

/** `position` vai explícita: o roteiro ordena por hora e, no empate, por ela. */
export function itineraryToInsert(k: TripKey, d: ItineraryDraft, position = 0): Tables['trip_itinerary_items']['Insert'] {
  return { ...key(k), ...itineraryToUpdate(d), position }
}

export function rowToItinerary(row: TripItineraryRow): ItineraryItem {
  return {
    id: row.id,
    day: row.day,
    at: hhmm(row.at),
    title: row.title,
    // Garantido pelo CHECK `trip_itinerary_kind`.
    kind: row.kind as ItineraryKind,
    note: row.note,
    listItemId: row.list_item_id,
    position: row.position,
  }
}

export type PrepColumns = Required<Pick<Tables['trip_prep_items']['Update'], 'kind' | 'label' | 'detail' | 'done'>>

export function prepToUpdate(d: PrepDraft): PrepColumns {
  return { kind: d.kind, label: d.label, detail: d.detail, done: d.done }
}

export function prepToInsert(k: TripKey, d: PrepDraft, position = 0): Tables['trip_prep_items']['Insert'] {
  return { ...key(k), ...prepToUpdate(d), position }
}

export function rowToPrep(row: TripPrepRow): PrepItem {
  return {
    id: row.id,
    // Garantido pelo CHECK `trip_prep_kind`.
    kind: row.kind as PrepKind,
    label: row.label,
    detail: row.detail,
    done: row.done,
    position: row.position,
  }
}

export type BudgetColumns = Required<Pick<Tables['trip_budget_lines']['Update'], 'label' | 'planned_cents' | 'spent_cents'>>

export function budgetToUpdate(d: BudgetDraft): BudgetColumns {
  return { label: d.label, planned_cents: d.plannedCents, spent_cents: d.spentCents }
}

export function budgetToInsert(k: TripKey, d: BudgetDraft, position = 0): Tables['trip_budget_lines']['Insert'] {
  return { ...key(k), ...budgetToUpdate(d), position }
}

export function rowToBudget(row: TripBudgetRow): BudgetLine {
  return {
    id: row.id,
    label: row.label,
    plannedCents: row.planned_cents,
    spentCents: row.spent_cents,
    position: row.position,
  }
}

/**
 * A memória de `profileId` (a policy só aceita `auth.uid()`: cada um grava a
 * sua, I11). `written_on` fica com o default (hoje no Brasil) no insert; no
 * upsert de uma edição ele também não vai — a data é a da primeira escrita.
 */
export function memoryToRow(k: TripKey, profileId: string, d: MemoryDraft): Tables['trip_memories']['Insert'] {
  return { ...key(k), profile_id: profileId, rating: d.rating, body: d.body }
}

export function rowToMemory(row: TripMemoryRow): TripMemory {
  return { profileId: row.profile_id, rating: row.rating, body: row.body, writtenOn: row.written_on }
}

export function photoToInsert(
  k: TripKey,
  photo: { path: string; takenOn: string | null; caption?: string | null },
): Tables['trip_photos']['Insert'] {
  return { ...key(k), path: photo.path, taken_on: photo.takenOn, caption: photo.caption ?? null }
}

export function rowToPhoto(row: TripPhotoRow): TripPhoto {
  return {
    id: row.id,
    path: row.path,
    takenOn: row.taken_on,
    caption: row.caption,
    favorite: row.favorite,
    addedBy: row.added_by,
    createdAt: row.created_at,
  }
}

// ---------------------------------------------------------------------------
// Montar a viagem
// ---------------------------------------------------------------------------

/** As filhas de TODAS as viagens, como vieram das leituras (uma por tabela). */
export interface TripChildRows {
  departures: readonly TripDepartureRow[]
  days: readonly TripDayRow[]
  itinerary: readonly TripItineraryRow[]
  prep: readonly TripPrepRow[]
  budget: readonly TripBudgetRow[]
  memories: readonly TripMemoryRow[]
  photos: readonly TripPhotoRow[]
}

function groupBy<R extends { trip_id: string }>(rows: readonly R[]): Map<string, R[]> {
  const out = new Map<string, R[]>()
  for (const row of rows) {
    const list = out.get(row.trip_id)
    if (list) list.push(row)
    else out.set(row.trip_id, [row])
  }
  return out
}

const byPosition = (a: { position: number; id: string }, b: { position: number; id: string }) =>
  a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Evento `viagem` dos dois + a linha de `trips` + as filhas → `Trip`. Só as
 * viagens (I1, R2): evento que não é `viagem` dos dois, ou sem destino, não
 * entra. Evento sem linha de `trips` (o trigger ainda não rodou, spec seção
 * 12) entra com os detalhes vazios em vez de sumir. Filha de viagem que não
 * está em `events` (a viagem virou solo) é ignorada.
 *
 * Preparação e orçamento saem por `position`; roteiro, dias, memórias e fotos
 * na ordem da leitura (as derivações de `tripDerive.ts` ordenam o que exibem).
 */
export function assembleTrips(
  events: readonly CalendarEvent[],
  tripRows: readonly TripRow[],
  children: TripChildRows,
): Trip[] {
  const rows = new Map(tripRows.map((r) => [r.event_id, r]))
  const departures = groupBy(children.departures)
  const days = groupBy(children.days)
  const itinerary = groupBy(children.itinerary)
  const prep = groupBy(children.prep)
  const budget = groupBy(children.budget)
  const memories = groupBy(children.memories)
  const photos = groupBy(children.photos)

  const trips: Trip[] = []
  for (const e of events) {
    if (!isTripEvent(e)) continue
    const row = rows.get(e.id)
    trips.push({
      id: e.id,
      title: e.title,
      cityId: e.cityId,
      startsOn: e.startsOn,
      endsOn: e.endsOn,
      note: e.note,
      coverPhotoId: row?.cover_photo_id ?? null,
      lodging: row ? rowToLodging(row) : { ...EMPTY_LODGING },
      departures: (departures.get(e.id) ?? []).map(rowToDeparture),
      days: (days.get(e.id) ?? []).map(rowToDayTitle),
      itinerary: (itinerary.get(e.id) ?? []).map(rowToItinerary),
      prep: (prep.get(e.id) ?? []).map(rowToPrep).sort(byPosition),
      budget: (budget.get(e.id) ?? []).map(rowToBudget).sort(byPosition),
      memories: (memories.get(e.id) ?? []).map(rowToMemory),
      photos: (photos.get(e.id) ?? []).map(rowToPhoto),
    })
  }
  return trips
}

/**
 * R2: viagem é `viagem` dos dois, com destino e volta. `create_event` já
 * exige cidade e volta em viagem (`calendar_events_format`); o guarda aqui é
 * para o tipo estreitar `cityId`/`endsOn` sem `!`.
 */
export function isTripEvent(e: CalendarEvent): e is CalendarEvent & { cityId: string; endsOn: string } {
  return e.kind === 'viagem' && e.travelers === 'both' && e.cityId !== null && e.endsOn !== null
}
