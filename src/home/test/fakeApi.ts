// `HomeApi` falsa para os testes de interface da Home (mapa e painel), no
// estilo de `seededTripsApi`: cada leitura é um `vi.fn` que o teste pode
// inspecionar ou trocar, e a engine do mapa é a falsa (`fakeMapEngine`).
//
// `seededHomeApi()` parte do acervo das Viagens (`src/trips/test/fixtures.ts`):
// as cinco viagens, a Lista delas (Lisboa, Ilhabela, Paraty…), as estadias em
// que hoje (25/9) o casal está junto em SJC, e as cidades. Relógio fixo em
// `TODAY`. `signedUrls` devolve `https://signed/<path>` (`signedUrlOf`);
// `avatarUrl` e `coverUrl`, `null`.
//
// Para ver o que a engine recebeu, crie a falsa no teste e passe-a:
//
//     const map = fakeMapEngine()
//     render(<HomeScreen api={seededHomeApi({ map })} />)
//     expect(map.mounts).toHaveLength(1)
//
// Para falha de leitura: `seededHomeApi({}, { loadList: vi.fn(async () =>
// ({ status: 'error', cause: 'pausado' })) })`.

import { vi } from 'vitest'
import type { SettingsData } from '../../data/settings'
import type { ListItem, ListMemory, ListPhoto } from '../../domain/list'
import type { Trip } from '../../domain/trips'
import { fakeMapEngine } from '../../map/fakeEngine'
import type { FakeMap } from '../../map/fakeEngine'
import { ALL_TRIPS, TODAY, TRIP_CITIES, TRIP_LIST_ITEMS, signedUrlOf, tripsContextData, tripsData } from '../../trips/test/fixtures'
import type { HomeApi } from '../api'

export { deferred } from '../../calendar/test/fixtures'
export { TODAY, signedUrlOf }

export interface HomeSeed {
  /** A engine falsa (padrão: uma nova, que o teste não vê). */
  map?: FakeMap
  /** A leitura de contexto (padrão: `tripsContextData()`, juntos em SJC hoje). */
  context?: SettingsData
  trips?: readonly Trip[]
  items?: readonly ListItem[]
  memories?: readonly ListMemory[]
  photos?: readonly ListPhoto[]
  today?: string
}

export function seededHomeApi(seed: HomeSeed = {}, overrides: Partial<HomeApi> = {}): HomeApi {
  const context = seed.context ?? tripsContextData()
  const trips = tripsData(seed.trips ?? ALL_TRIPS)
  const list = {
    items: [...(seed.items ?? TRIP_LIST_ITEMS)],
    memories: [...(seed.memories ?? [])],
    photos: [...(seed.photos ?? [])],
  }
  const today = seed.today ?? TODAY
  return {
    today: () => today,
    loadContext: vi.fn<HomeApi['loadContext']>(async () => ({ status: 'ok', rows: context })),
    loadList: vi.fn<HomeApi['loadList']>(async () => ({ status: 'ok', rows: list })),
    loadTrips: vi.fn<HomeApi['loadTrips']>(async () => ({ status: 'ok', rows: trips })),
    loadCities: vi.fn<HomeApi['loadCities']>(async (ids) => ({
      status: 'ok',
      rows: new Map(TRIP_CITIES.filter((c) => ids.includes(c.id)).map((c) => [c.id, c])),
    })),
    signedUrls: vi.fn<HomeApi['signedUrls']>(async (paths) => ({
      status: 'ok',
      rows: new Map(paths.filter((p): p is string => !!p).map((p) => [p, signedUrlOf(p)])),
    })),
    avatarUrl: vi.fn<HomeApi['avatarUrl']>(async () => null),
    coverUrl: vi.fn<HomeApi['coverUrl']>(async () => null),
    searchCities: vi.fn<HomeApi['searchCities']>(async () => ({ status: 'ok', rows: [] })),
    mapEngine: (seed.map ?? fakeMapEngine()).engine,
    ...overrides,
  }
}
