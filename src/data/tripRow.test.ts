// Mapeadores das Viagens (Fase 6): snake ↔ camel, a montagem de `Trip` a
// partir das leituras por tabela, e os formatos de hora que o Postgres
// devolve. O mesmo mapeador roda contra o banco em supabase/tests/trips.test.ts.
// Spec: .agent/Tasks/fase-6-viagens.md, seção 5 · ADR 0019

import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../domain/calendar'
import { EMPTY_LODGING } from '../domain/trips'
import type { Lodging } from '../domain/trips'
import {
  assembleTrips,
  budgetToInsert,
  isTripEvent,
  itineraryToInsert,
  lodgingToColumns,
  memoryToRow,
  newTripToPayload,
  photoToInsert,
  prepToInsert,
  rowToItinerary,
  rowToLodging,
  rowToPhoto,
} from './tripRow'
import type { TripChildRows, TripItineraryRow, TripRow } from './tripRow'

const KEY = { tripId: 'ev-1', coupleId: 'couple-1' }

const event = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'ev-1',
  kind: 'viagem',
  title: 'Lisboa, Portugal',
  startsOn: '2026-10-01',
  endsOn: '2026-10-09',
  allDay: true,
  startsAt: null,
  endsAt: null,
  travelers: 'both',
  travelerId: null,
  cityId: 'c-lisboa',
  place: null,
  repeatsYearly: false,
  note: 'Primeira vez',
  listItemId: null,
  createdBy: 'u-gabriel',
  ...overrides,
})

const tripRow = (overrides: Partial<TripRow> = {}): TripRow => ({
  event_id: 'ev-1',
  couple_id: 'couple-1',
  cover_photo_id: null,
  lodging_name: null,
  lodging_address: null,
  lodging_check_in: null,
  lodging_check_out: null,
  lodging_url: null,
  lodging_code: null,
  lodging_cents: null,
  lodging_paid: false,
  created_at: '2026-09-27T12:00:00Z',
  updated_at: '2026-09-27T12:00:00Z',
  ...overrides,
})

const noChildren: TripChildRows = { departures: [], days: [], itinerary: [], prep: [], budget: [], memories: [], photos: [] }

const LODGING: Lodging = {
  name: 'Casa do Largo',
  address: 'Largo do Chafariz, 1',
  checkIn: '2026-10-01T15:00',
  checkOut: '2026-10-09T11:00',
  url: 'https://casadolargo.pt',
  code: 'HX4K2',
  cents: 320_000,
  paid: true,
}

describe('hospedagem', () => {
  it('ida e volta: domínio → colunas → linha → domínio', () => {
    const columns = lodgingToColumns(LODGING)
    expect(columns).toEqual({
      lodging_name: 'Casa do Largo',
      lodging_address: 'Largo do Chafariz, 1',
      lodging_check_in: '2026-10-01T15:00',
      lodging_check_out: '2026-10-09T11:00',
      lodging_url: 'https://casadolargo.pt',
      lodging_code: 'HX4K2',
      lodging_cents: 320_000,
      lodging_paid: true,
    })
    // O Postgres devolve o `timestamp` com segundos (e às vezes com espaço).
    const back = rowToLodging(tripRow({ ...columns, lodging_check_in: '2026-10-01T15:00:00', lodging_check_out: '2026-10-09 11:00:00' }))
    expect(back).toEqual(LODGING)
  })

  it('vazia', () => expect(rowToLodging(tripRow())).toEqual(EMPTY_LODGING))
})

describe('create_trip', () => {
  it('o payload tem só as chaves que a RPC lê, em snake_case, e as saídas por pessoa', () => {
    expect(
      newTripToPayload({
        title: 'Florianópolis, SC',
        cityId: 'c-floripa',
        startsOn: '2027-01-08',
        endsOn: '2027-01-14',
        note: 'Férias de verão',
        lodgingName: 'Pousada na Lagoa',
        departures: [{ profileId: 'u-lana', originCode: null, note: 'voo POA → FLN · 55min' }],
      }),
    ).toEqual({
      title: 'Florianópolis, SC',
      city_id: 'c-floripa',
      starts_on: '2027-01-08',
      ends_on: '2027-01-14',
      note: 'Férias de verão',
      lodging_name: 'Pousada na Lagoa',
      departures: [{ profile_id: 'u-lana', origin_code: null, note: 'voo POA → FLN · 55min' }],
    })
  })
})

describe('filhas', () => {
  it('toda filha leva trip_id e couple_id (a FK composta, I12)', () => {
    const item = itineraryToInsert(KEY, { day: '2026-10-02', at: '09:30', title: 'Castelo', kind: 'cidade', note: null, listItemId: 'i-1' }, 3)
    expect(item).toEqual({
      trip_id: 'ev-1',
      couple_id: 'couple-1',
      day: '2026-10-02',
      at: '09:30',
      title: 'Castelo',
      kind: 'cidade',
      note: null,
      list_item_id: 'i-1',
      position: 3,
    })
    expect(prepToInsert(KEY, { kind: 'malas', label: 'Malas', detail: null, done: false })).toMatchObject({ trip_id: 'ev-1', couple_id: 'couple-1', position: 0 })
    expect(budgetToInsert(KEY, { label: 'Passagens', plannedCents: 980_000, spentCents: 0 }, 1)).toEqual({
      trip_id: 'ev-1',
      couple_id: 'couple-1',
      label: 'Passagens',
      planned_cents: 980_000,
      spent_cents: 0,
      position: 1,
    })
    // `written_on` fica com o default do banco: a data é a da primeira escrita.
    expect(memoryToRow(KEY, 'u-gabriel', { rating: 5, body: 'Lindo' })).toEqual({
      trip_id: 'ev-1',
      couple_id: 'couple-1',
      profile_id: 'u-gabriel',
      rating: 5,
      body: 'Lindo',
    })
    expect(photoToInsert(KEY, { path: 'couple-1/trip/x.webp', takenOn: null })).toEqual({
      trip_id: 'ev-1',
      couple_id: 'couple-1',
      path: 'couple-1/trip/x.webp',
      taken_on: null,
      caption: null,
    })
  })

  it('a hora do roteiro volta HH:MM:SS e sai HH:MM', () => {
    const row: TripItineraryRow = {
      id: 'it-1',
      trip_id: 'ev-1',
      couple_id: 'couple-1',
      day: '2026-10-02',
      at: '09:30:00',
      title: 'Castelo',
      kind: 'cidade',
      note: null,
      list_item_id: null,
      position: 0,
      created_by: 'u-gabriel',
      created_at: 'x',
    }
    expect(rowToItinerary(row).at).toBe('09:30')
    expect(rowToItinerary({ ...row, at: null }).at).toBeNull()
  })

  it('foto', () => {
    expect(
      rowToPhoto({
        id: 'p1',
        trip_id: 'ev-1',
        couple_id: 'couple-1',
        path: 'couple-1/trip/p1.webp',
        taken_on: '2026-07-14',
        caption: null,
        favorite: true,
        added_by: 'u-lana',
        created_at: '2026-07-20T12:00:00Z',
      }),
    ).toEqual({ id: 'p1', path: 'couple-1/trip/p1.webp', takenOn: '2026-07-14', caption: null, favorite: true, addedBy: 'u-lana', createdAt: '2026-07-20T12:00:00Z' })
  })
})

describe('assembleTrips', () => {
  it('só viagem dos dois é viagem (R2)', () => {
    expect(isTripEvent(event())).toBe(true)
    expect(isTripEvent(event({ travelers: 'solo', travelerId: 'u-lana' }))).toBe(false)
    expect(isTripEvent(event({ kind: 'visita' }))).toBe(false)
    const trips = assembleTrips(
      [event(), event({ id: 'ev-solo', travelers: 'solo' }), event({ id: 'ev-visita', kind: 'visita' })],
      [tripRow()],
      noChildren,
    )
    expect(trips.map((t) => t.id)).toEqual(['ev-1'])
  })

  it('o evento dá datas, destino, título e nota; `trips` dá capa e hospedagem (I1)', () => {
    const [t] = assembleTrips([event()], [tripRow({ cover_photo_id: 'p1', ...lodgingToColumns(LODGING) })], noChildren)
    expect(t).toMatchObject({
      id: 'ev-1',
      title: 'Lisboa, Portugal',
      cityId: 'c-lisboa',
      startsOn: '2026-10-01',
      endsOn: '2026-10-09',
      note: 'Primeira vez',
      coverPhotoId: 'p1',
      lodging: LODGING,
    })
  })

  it('sem linha em `trips` (o trigger não rodou): a viagem aparece com os detalhes vazios', () => {
    const [t] = assembleTrips([event()], [], noChildren)
    expect(t.lodging).toEqual(EMPTY_LODGING)
    expect(t.coverPhotoId).toBeNull()
    expect(t.prep).toEqual([])
  })

  it('as filhas vão para a viagem certa; preparação e orçamento por position', () => {
    const base = { couple_id: 'couple-1' }
    const trips = assembleTrips([event(), event({ id: 'ev-2', title: 'Gramado' })], [tripRow(), tripRow({ event_id: 'ev-2' })], {
      ...noChildren,
      prep: [
        { ...base, id: 'b', trip_id: 'ev-1', kind: 'malas', label: 'Malas', detail: null, done: false, position: 4 },
        { ...base, id: 'a', trip_id: 'ev-1', kind: 'passagens', label: 'Passagens', detail: null, done: true, position: 0 },
        { ...base, id: 'c', trip_id: 'ev-2', kind: 'seguro', label: 'Seguro', detail: null, done: false, position: 0 },
      ],
      budget: [
        { ...base, id: 'y', trip_id: 'ev-1', label: 'Comida', planned_cents: 1, spent_cents: 0, position: 1 },
        { ...base, id: 'x', trip_id: 'ev-1', label: 'Voo', planned_cents: 2, spent_cents: 0, position: 1 },
      ],
      memories: [{ ...base, trip_id: 'ev-2', profile_id: 'u-lana', rating: 4, body: 'Frio', written_on: '2026-12-23', updated_at: 'x' }],
      // Filha de uma viagem que não está entre os eventos: ignorada.
      days: [{ ...base, trip_id: 'ev-sumiu', day: '2026-01-01', title: 'x' }],
    })
    const [one, two] = trips
    expect(one.prep.map((p) => p.id)).toEqual(['a', 'b'])
    expect(one.budget.map((b) => b.id)).toEqual(['x', 'y'])
    expect(two.prep.map((p) => p.id)).toEqual(['c'])
    expect(two.memories).toEqual([{ profileId: 'u-lana', rating: 4, body: 'Frio', writtenOn: '2026-12-23' }])
    expect(one.days).toEqual([])
  })
})
