// ListApi falsa para os testes de interface: toda leitura responde `ok` vazio,
// toda escrita responde `error`, a não ser que o teste troque a função.
// Relógio e sorteio fixos. `seededListApi` (abaixo) é o ponto de partida com
// um acervo realista; as telas da T7 em diante estendem daqui.

import { vi } from 'vitest'
import type { ListData } from '../../data/list'
import type { SettingsData } from '../../data/settings'
import type { Stay } from '../../domain/coupleState'
import type { ListItem } from '../../domain/list'
import { MARAU, SJC, settingsData } from '../../settings/test/fixtures'
import type { ListApi } from '../api'
import { fakeCalendarApi } from '../../calendar/test/fixtures'

const notWired = { status: 'error', cause: 'não ligado no teste' } as const

export function fakeListApi(overrides: Partial<ListApi> = {}): ListApi {
  return {
    today: () => '2026-09-26',
    random: () => 0,
    loadList: vi.fn<ListApi['loadList']>(async () => ({ status: 'ok', rows: { items: [], memories: [], photos: [] } })),
    loadContext: vi.fn<ListApi['loadContext']>(async () => ({ status: 'ok', rows: settingsData() })),
    loadCitiesByIds: vi.fn<ListApi['loadCitiesByIds']>(async () => ({ status: 'ok', rows: new Map() })),
    signedUrls: vi.fn<ListApi['signedUrls']>(async () => ({ status: 'ok', rows: new Map() })),
    avatarUrl: vi.fn<ListApi['avatarUrl']>(async () => null),
    createItem: vi.fn<ListApi['createItem']>(async () => notWired),
    updateItem: vi.fn<ListApi['updateItem']>(async () => notWired),
    setRating: vi.fn<ListApi['setRating']>(async () => notWired),
    setFeatured: vi.fn<ListApi['setFeatured']>(async () => notWired),
    deleteItem: vi.fn<ListApi['deleteItem']>(async () => notWired),
    markDone: vi.fn<ListApi['markDone']>(async () => notWired),
    saveMemory: vi.fn<ListApi['saveMemory']>(async () => notWired),
    deleteMemory: vi.fn<ListApi['deleteMemory']>(async () => notWired),
    addPhoto: vi.fn<ListApi['addPhoto']>(async () => notWired),
    removePhoto: vi.fn<ListApi['removePhoto']>(async () => notWired),
    replaceItemPhoto: vi.fn<ListApi['replaceItemPhoto']>(async () => notWired),
    searchPlaces: vi.fn<ListApi['searchPlaces']>(async () => ({ status: 'ok', rows: [], fallback: false })),
    searchCities: vi.fn<ListApi['searchCities']>(async () => ({ status: 'ok', rows: [] })),
    calendar: fakeCalendarApi(),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Acervo realista (T6+). Hoje = 2026-09-26. Gabriel (`u-gabriel`, SJC) e Lana
// (`u-lana`, Marau), os mesmos de `settingsData()`. As coordenadas de SJC são
// reais o bastante para `nearby` (≤ 30 km) separar o que está na cidade.
// ---------------------------------------------------------------------------

export const GABRIEL = 'u-gabriel'
export const LANA = 'u-lana'

const SJC_PLACE = { address: null, city: 'São José dos Campos', state: 'SP', country: 'Brasil', countryCode: 'BR' } as const
const SP_PLACE = { address: null, city: 'São Paulo', state: 'SP', country: 'Brasil', countryCode: 'BR' } as const

/** Um item com tudo preenchido de forma coerente; `overrides` troca o que o teste precisa. */
export function listItem(overrides: Partial<ListItem> & Pick<ListItem, 'id' | 'name' | 'category'>): ListItem {
  return {
    note: null,
    link: null,
    featured: false,
    place: null,
    region: null,
    venue: null,
    highlights: [],
    platform: null,
    seasons: null,
    photoPath: null,
    status: 'want',
    rating: null,
    addedBy: GABRIEL,
    createdAt: '2026-09-01T12:00:00Z',
    doneOn: null,
    doneWith: null,
    doneSoloBy: null,
    ...overrides,
  }
}

/**
 * 13 itens, das 8 categorias: 5 feitos (2 pelos dois, 1 só Gabriel, 1 só
 * Lana, e nenhuma série feita — o vazio do frame `DXg1A`), 4 em destaque, 4
 * geográficos não feitos em SJC (1, 2, 3 e 4 km do centro, mais ou menos).
 */
export function listItems(): ListItem[] {
  return [
    listItem({
      id: 'i-vicentina', name: 'Parque Vicentina Aranha', category: 'parque', addedBy: LANA,
      createdAt: '2026-09-12T15:00:00Z', place: { ...SJC_PLACE, lat: -23.1896, lng: -45.8841 },
    }),
    listItem({
      id: 'i-casa-amarela', name: 'Casa Amarela Bistrô', category: 'restaurante', createdAt: '2026-07-01T15:00:00Z',
      place: { ...SJC_PLACE, lat: -23.2, lng: -45.9 }, status: 'done', doneOn: '2026-08-26', doneWith: 'solo', doneSoloBy: GABRIEL,
    }),
    listItem({
      id: 'i-severance', name: 'Severance', category: 'serie', platform: 'Apple TV+', seasons: 2,
      createdAt: '2026-09-23T15:00:00Z',
    }),
    listItem({
      id: 'i-acaraje', name: 'Acarajé da Dinha', category: 'comida', addedBy: LANA, createdAt: '2026-09-21T15:00:00Z',
      place: { address: null, city: 'Salvador', state: 'BA', country: 'Brasil', countryCode: 'BR', lat: -12.97, lng: -38.5 },
    }),
    listItem({
      id: 'i-past-lives', name: 'Past Lives', category: 'filme', platform: 'MUBI', addedBy: LANA,
      createdAt: '2026-05-01T15:00:00Z', status: 'done', doneOn: '2026-07-26', doneWith: 'solo', doneSoloBy: LANA,
    }),
    listItem({
      id: 'i-mocoto', name: 'Mocotó', category: 'restaurante', featured: true, createdAt: '2026-09-19T15:00:00Z',
      photoPath: 'couple-1/item/mocoto.webp', note: 'Ir num sábado no almoço — pedir o torresmo',
      place: { ...SP_PLACE, address: 'Av. Nossa Senhora do Loreto, 1100', lat: -23.4896, lng: -46.5794 },
    }),
    listItem({
      id: 'i-noronha', name: 'Mergulho em Noronha', category: 'experiencia', addedBy: LANA, createdAt: '2026-08-01T15:00:00Z',
      place: { address: null, city: 'Fernando de Noronha', state: 'PE', country: 'Brasil', countryCode: 'BR', lat: -3.85, lng: -32.42 },
      status: 'done', doneOn: '2026-09-05', doneWith: 'both', rating: 5,
    }),
    listItem({
      id: 'i-ibirapuera', name: 'Parque Ibirapuera', category: 'parque', createdAt: '2026-03-01T15:00:00Z',
      place: { ...SP_PLACE, lat: -23.5874, lng: -46.6576 }, status: 'done', doneOn: '2026-04-14', doneWith: 'both',
    }),
    listItem({
      id: 'i-japao', name: 'Japão', category: 'pais', featured: true, highlights: ['Tóquio', 'Kyoto', 'Osaka'],
      createdAt: '2026-06-01T15:00:00Z',
      place: { address: null, city: null, state: null, country: 'Japão', countryCode: 'JP', lat: 36.2, lng: 138.25 },
    }),
    listItem({
      id: 'i-sorveteria', name: 'Sorveteria da Praça', category: 'comida', addedBy: LANA, createdAt: '2026-09-15T15:00:00Z',
      place: { ...SJC_PLACE, lat: -23.1791, lng: -45.8872 },
    }),
    listItem({
      id: 'i-ceramica', name: 'Aula de cerâmica a dois', category: 'experiencia', featured: true, addedBy: LANA,
      createdAt: '2026-09-18T15:00:00Z', place: { ...SJC_PLACE, lat: -23.2, lng: -45.87 },
    }),
    listItem({
      id: 'i-gramado', name: 'Gramado no Natal', category: 'cidade', featured: true, region: 'Serra Gaúcha',
      createdAt: '2026-08-20T15:00:00Z',
      place: { address: null, city: 'Gramado', state: 'RS', country: 'Brasil', countryCode: 'BR', lat: -29.38, lng: -50.87 },
    }),
    listItem({
      id: 'i-aftersun', name: 'Aftersun', category: 'filme', platform: 'MUBI', createdAt: '2026-09-10T15:00:00Z',
    }),
  ]
}

export function listData(items: ListItem[] = listItems()): ListData {
  return { items, memories: [], photos: [] }
}

/** Onde o casal está hoje (2026-09-26), pelas estadias. */
export const STAYS = {
  /** Os dois em SJC; a Lana volta dia 30. */
  togetherInSJC: [
    { id: 's1', profileId: GABRIEL, cityId: SJC.id, startsOn: '2026-09-20', endsOn: null },
    { id: 's2', profileId: LANA, cityId: SJC.id, startsOn: '2026-09-24', endsOn: '2026-09-30' },
  ],
  /** Cada um na sua casa. */
  apart: [
    { id: 's1', profileId: GABRIEL, cityId: SJC.id, startsOn: '2026-09-20', endsOn: null },
    { id: 's3', profileId: LANA, cityId: MARAU.id, startsOn: '2026-09-23', endsOn: null },
  ],
  /** Nenhum registro — o caso real até a Fase 5. */
  unknown: [],
} satisfies Record<string, Stay[]>

/** O contexto das Configurações com estadias e preferências do casal trocadas. */
export function listContext(
  stays: Stay[] = STAYS.unknown,
  coupleSettings: Partial<SettingsData['coupleSettings']> = {},
): SettingsData {
  const data = settingsData({ stays })
  return { ...data, coupleSettings: { ...data.coupleSettings, ...coupleSettings } }
}

/**
 * `ListApi` com o acervo acima já lido — o ponto de partida dos testes de tela.
 * `loadCitiesByIds` resolve SJC e Marau; `signedUrls` assina só a foto do Mocotó.
 */
export function seededListApi(
  options: { items?: ListItem[]; stays?: Stay[]; settings?: Partial<SettingsData['coupleSettings']> } = {},
  overrides: Partial<ListApi> = {},
): ListApi {
  const data = listData(options.items)
  const ctx = listContext(options.stays, options.settings)
  return fakeListApi({
    loadList: vi.fn<ListApi['loadList']>(async () => ({ status: 'ok', rows: data })),
    loadContext: vi.fn<ListApi['loadContext']>(async () => ({ status: 'ok', rows: ctx })),
    loadCitiesByIds: vi.fn<ListApi['loadCitiesByIds']>(async () => ({
      status: 'ok',
      rows: new Map([
        [SJC.id, SJC],
        [MARAU.id, MARAU],
      ]),
    })),
    signedUrls: vi.fn<ListApi['signedUrls']>(async () => ({
      status: 'ok',
      rows: new Map([['couple-1/item/mocoto.webp', 'https://example.test/mocoto.webp']]),
    })),
    ...overrides,
  })
}
