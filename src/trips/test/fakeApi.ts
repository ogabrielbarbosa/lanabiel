// `TripsApi` falsa para os testes de interface (T4, T5), no estilo de
// `fakeCalendarApi`/`fakeListApi`: cada função é um `vi.fn` que o teste pode
// inspecionar (`expect(api.createTrip).toHaveBeenCalledWith(…)`) ou trocar
// (`seededTripsApi({}, { createTrip: vi.fn(async () => okWrite({ id })) })`).
//
// Dois pontos de partida:
//   · `fakeTripsApi()` — leituras `ok` e VAZIAS (nenhuma viagem, Lista vazia,
//     o casal de `settingsData()` sem estadias); toda escrita responde
//     `{ status: 'error', cause: 'não ligado no teste' }`.
//   · `seededTripsApi()` — o acervo de `fixtures.ts` já lido (as cinco
//     viagens, a Lista, as estadias, as cidades). Escritas idem.
//
// Os mapas montam numa `fakeMapEngine()` nova por api; para inspecionar o que
// a tela pediu (`mounts`, `arcs`), passe a sua: `seededTripsApi({}, { mapEngine:
// fake.engine })`.
//
// Relógio fixo em `TODAY` (2026-09-25). `signedUrls` devolve
// `https://signed/<path>` para qualquer caminho (`signedUrlOf`); `avatarUrl`,
// `null` (inicial sobre a cor). `loadCities` devolve as de `TRIP_CITIES` que
// foram pedidas.
//
// Para simular falha de leitura: `seededTripsApi({}, { loadTrips: vi.fn(async
// () => ({ status: 'error', cause: 'pausado' })) })`. Para uma resposta que o
// teste solta quando quiser: `deferred()` (reexportado do Calendário).

import { vi } from 'vitest'
import type { SettingsData } from '../../data/settings'
import type { ListItem } from '../../domain/list'
import type { Trip } from '../../domain/trips'
import { fakeMapEngine } from '../../map/fakeEngine'
import { settingsData } from '../../settings/test/fixtures'
import type { TripsApi, TripWrite, TripsData } from '../api'
import { ALL_TRIPS, TODAY, TRIP_CITIES, TRIP_LIST_ITEMS, signedUrlOf, tripsContextData, tripsData } from './fixtures'

export { deferred } from '../../calendar/test/fixtures'

const notWired = { status: 'error', cause: 'não ligado no teste' } as const

/** Um `ok` de escrita, para trocar a resposta padrão: `vi.fn(async () => okWrite(item))`. */
export function okWrite<T = null>(value: T = null as T): TripWrite<T> {
  return { status: 'ok', value }
}

export function fakeTripsApi(overrides: Partial<TripsApi> = {}): TripsApi {
  const empty: TripsData = { trips: [], events: new Map() }
  return {
    today: () => TODAY,
    mapEngine: fakeMapEngine().engine,
    loadContext: vi.fn<TripsApi['loadContext']>(async () => ({ status: 'ok', rows: settingsData({ stays: [] }) })),
    loadTrips: vi.fn<TripsApi['loadTrips']>(async () => ({ status: 'ok', rows: empty })),
    loadListItems: vi.fn<TripsApi['loadListItems']>(async () => ({ status: 'ok', rows: [] })),
    loadCities: vi.fn<TripsApi['loadCities']>(async (ids) => ({
      status: 'ok',
      rows: new Map(TRIP_CITIES.filter((c) => ids.includes(c.id)).map((c) => [c.id, c])),
    })),
    signedUrls: vi.fn<TripsApi['signedUrls']>(async (paths) => ({
      status: 'ok',
      rows: new Map(paths.filter((p): p is string => !!p).map((p) => [p, signedUrlOf(p)])),
    })),
    avatarUrl: vi.fn<TripsApi['avatarUrl']>(async () => null),
    searchCities: vi.fn<TripsApi['searchCities']>(async () => ({ status: 'ok', rows: [] })),
    searchWorldCities: vi.fn<TripsApi['searchWorldCities']>(async () => ({ status: 'ok', rows: [] })),
    ensureWorldCity: vi.fn<TripsApi['ensureWorldCity']>(async () => notWired),
    createTrip: vi.fn<TripsApi['createTrip']>(async () => notWired),
    updateTripEvent: vi.fn<TripsApi['updateTripEvent']>(async () => notWired),
    updateTrip: vi.fn<TripsApi['updateTrip']>(async () => notWired),
    deleteTrip: vi.fn<TripsApi['deleteTrip']>(async () => notWired),
    saveDepartures: vi.fn<TripsApi['saveDepartures']>(async () => notWired),
    setDayTitle: vi.fn<TripsApi['setDayTitle']>(async () => notWired),
    createItinerary: vi.fn<TripsApi['createItinerary']>(async () => notWired),
    updateItinerary: vi.fn<TripsApi['updateItinerary']>(async () => notWired),
    deleteItinerary: vi.fn<TripsApi['deleteItinerary']>(async () => notWired),
    createPrep: vi.fn<TripsApi['createPrep']>(async () => notWired),
    updatePrep: vi.fn<TripsApi['updatePrep']>(async () => notWired),
    setPrepDone: vi.fn<TripsApi['setPrepDone']>(async () => notWired),
    deletePrep: vi.fn<TripsApi['deletePrep']>(async () => notWired),
    createBudget: vi.fn<TripsApi['createBudget']>(async () => notWired),
    updateBudget: vi.fn<TripsApi['updateBudget']>(async () => notWired),
    deleteBudget: vi.fn<TripsApi['deleteBudget']>(async () => notWired),
    saveMemory: vi.fn<TripsApi['saveMemory']>(async () => notWired),
    deleteMemory: vi.fn<TripsApi['deleteMemory']>(async () => notWired),
    uploadPhotos: vi.fn<TripsApi['uploadPhotos']>(async () => ({ status: 'unauthenticated' })),
    uploadCover: vi.fn<TripsApi['uploadCover']>(async () => notWired),
    setCaption: vi.fn<TripsApi['setCaption']>(async () => notWired),
    setFavorite: vi.fn<TripsApi['setFavorite']>(async () => notWired),
    deletePhoto: vi.fn<TripsApi['deletePhoto']>(async () => notWired),
    ...overrides,
  }
}

export interface SeedOptions {
  trips?: readonly Trip[]
  listItems?: readonly ListItem[]
  /** A leitura de contexto (padrão: `tripsContextData()`, com `TRIP_STAYS`). */
  context?: SettingsData
}

/** `TripsApi` com o acervo de `fixtures.ts` já lido — o ponto de partida dos testes de tela. */
export function seededTripsApi(options: SeedOptions = {}, overrides: Partial<TripsApi> = {}): TripsApi {
  const context = options.context ?? tripsContextData()
  const data = tripsData(options.trips ?? ALL_TRIPS)
  const list = [...(options.listItems ?? TRIP_LIST_ITEMS)]
  return fakeTripsApi({
    loadContext: vi.fn<TripsApi['loadContext']>(async () => ({ status: 'ok', rows: context })),
    loadTrips: vi.fn<TripsApi['loadTrips']>(async () => ({ status: 'ok', rows: data })),
    loadListItems: vi.fn<TripsApi['loadListItems']>(async () => ({ status: 'ok', rows: list })),
    ...overrides,
  })
}
