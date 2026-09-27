// A `HomeApi` do harness visual (só DEV — ver `Preview.tsx`): em memória, sem
// rede, sobre o MESMO `PreviewStore` das Viagens, com o mapa DE VERDADE
// (`mapboxEngine`: precisa de `VITE_MAPBOX_TOKEN` no `.env.local`).
//
// O cenário é o da spec (.agent/Tasks/fase-7-mapa.md, seção 2), hoje =
// 25 set 2026, quem vê = Gabriel:
//
//   · _"Juntos agora · São José dos Campos"_ / _"Juntos há 12 dias"_ — o
//     trecho de hoje vai de 14 set a 3 out (_"dia 12 de 20"_, _"8 dias
//     restantes"_);
//   · setembro _"22 juntos · 8 separados"_; _"38% do ano juntos"_, _"104 dias
//     juntos em 2026"_;
//   · _Próxima viagem_ Lisboa, 1–9 out (_"embarque em 6 dias"_).
//
// O `.pen` se contradiz (o trecho vai até 3 out e a viagem a Lisboa começa em
// 1º): aqui a viagem existe e as estadias NÃO a pintam — é um estado real do
// app (editar a viagem não repinta, ADR 0018). Por isso as estadias da Home
// são próprias deste arquivo em 2026 (as de `previewSeed.ts` pintam todas as
// viagens e dariam _"Juntos há 6 dias"_); antes de 2026 são as do seed.
//
// Os itens da Home são os do seed MAIS os de São José dos Campos e arredores
// que o cenário cita (Parque Vicentina Aranha, o fondue em Campos do Jordão) —
// só aqui, para não mexer nas contagens _"perto do destino"_ das Viagens. O
// que o frame não mostra está marcado `// inventado`.

import type { DataResult } from '../data/result'
import type { Stay } from '../domain/calendar'
import type { GeoPlace, ListCategory, ListItem, ListMemory } from '../domain/list'
import type { HomeApi } from '../home/api'
import { mapboxEngine } from '../map/engine'
import { GABRIEL, LANA, PATH_URLS, PREVIEW_TODAY, STAYS, settingsSeed } from './previewSeed'
import type { PreviewStore } from './previewTripsApi'
import type { TripsApi } from '../trips/api'

const LATENCY_MS = 120
const ok = <T>(rows: T): Promise<DataResult<T>> =>
  new Promise((resolve) => setTimeout(() => resolve({ status: 'ok', rows }), LATENCY_MS))

// ---------------------------------------------------------------------------
// Estadias da Home
// ---------------------------------------------------------------------------

const SJC = 'c-sjc'
const MARAU = 'c-marau'
const ILHABELA = 'c-ilhabela'
const PARATY = 'c-paraty'
const YEAR_START = '2026-01-01'

type Span = [cityId: string, from: string, to: string | null]

/** 2026, dia a dia sem buraco. Juntos: 20 + 20 + 19 + 20 + 8 + 5 + 12 = 104 até hoje. */
const HOME_2026: Record<string, Span[]> = {
  [GABRIEL]: [
    [SJC, '2026-01-01', '2026-02-28'],
    [MARAU, '2026-03-01', '2026-03-20'], // os dois em Marau: 20
    [SJC, '2026-03-21', '2026-05-31'],
    [MARAU, '2026-06-01', '2026-06-20'], // os dois em Marau: 20
    [SJC, '2026-06-21', '2026-07-11'],
    [ILHABELA, '2026-07-12', '2026-07-19'], // a viagem: 8
    [SJC, '2026-07-20', '2026-09-08'],
    [PARATY, '2026-09-09', '2026-09-13'], // viajando juntos: 5 (setembro: 22 juntos)
    [SJC, '2026-09-14', null],
  ],
  [LANA]: [
    [SJC, '2026-01-01', '2026-01-20'], // os dois em SJC: 20
    [MARAU, '2026-01-21', '2026-04-14'],
    [SJC, '2026-04-15', '2026-05-03'], // os dois em SJC: 19
    [MARAU, '2026-05-04', '2026-07-11'],
    [ILHABELA, '2026-07-12', '2026-07-19'],
    [MARAU, '2026-07-20', '2026-09-08'], // 1–8 set separados: 8
    [PARATY, '2026-09-09', '2026-09-13'],
    [SJC, '2026-09-14', '2026-10-03'], // o trecho de hoje: 14 set – 3 out
    [MARAU, '2026-10-04', null],
  ],
}

/** As do seed antes de 2026 (cortadas em 31/12/2025), mais as de 2026 acima. */
export const HOME_STAYS: Stay[] = [
  ...STAYS.filter((s) => s.startsOn < YEAR_START).map((s) => ({
    ...s,
    endsOn: s.endsOn === null || s.endsOn >= YEAR_START ? '2025-12-31' : s.endsOn,
  })),
  ...Object.entries(HOME_2026).flatMap(([profileId, spans]) =>
    spans.map(([cityId, startsOn, endsOn], i) => ({ id: `home-stay-${profileId}-${i}`, profileId, cityId, startsOn, endsOn })),
  ),
]

// ---------------------------------------------------------------------------
// Itens de SJC e arredores
// ---------------------------------------------------------------------------

const brPlace = (city: string, state: string, lat: number, lng: number): GeoPlace => ({
  address: null,
  city,
  state,
  country: 'Brasil',
  countryCode: 'BR',
  lat,
  lng,
})

/** Reaproveita as fotos que o seed já tem (é harness, não acervo). */
const seedPhotos = () => [...PATH_URLS.keys()].filter((p) => p.includes('/list/'))

interface HomeItemSpec {
  id: string
  category: ListCategory
  name: string
  place: GeoPlace
  addedBy: string
  createdAt: string
  done?: string
  featured?: boolean
  photo?: number
}

function homeItem(s: HomeItemSpec): ListItem {
  const photos = seedPhotos()
  return {
    id: s.id,
    category: s.category,
    name: s.name,
    note: null,
    link: null,
    featured: s.featured ?? false,
    place: s.place,
    region: null,
    venue: null,
    highlights: [],
    platform: null,
    seasons: null,
    photoPath: s.photo === undefined || photos.length === 0 ? null : photos[s.photo % photos.length],
    status: s.done ? 'done' : 'want',
    rating: s.done ? 5 : null,
    addedBy: s.addedBy,
    createdAt: s.createdAt,
    doneOn: s.done ?? null,
    doneWith: s.done ? 'both' : null,
    doneSoloBy: null,
  }
}

const sjc = (lat: number, lng: number) => brPlace('São José dos Campos', 'SP', lat, lng)

const HOME_ITEM_SPECS: HomeItemSpec[] = [
  // O cenário (seção 2) e os frames.
  { id: 'h-vicentina', category: 'parque', name: 'Parque Vicentina Aranha', place: sjc(-23.1946, -45.8889), addedBy: LANA, createdAt: '2026-09-22T20:00:00Z', featured: true, photo: 0 },
  { id: 'h-fondue', category: 'restaurante', name: 'Fondue em Campos do Jordão', place: brPlace('Campos do Jordão', 'SP', -22.7394, -45.5914), addedBy: LANA, createdAt: '2026-06-10T20:00:00Z', done: '2026-07-04', photo: 1 },
  // inventado — o resto de SJC, para o nível cidade ter o que mostrar.
  { id: 'h-cidade', category: 'parque', name: 'Parque da Cidade', place: sjc(-23.1637, -45.8752), addedBy: GABRIEL, createdAt: '2026-02-01T20:00:00Z', done: '2026-04-19', photo: 2 },
  { id: 'h-banhado', category: 'parque', name: 'Pôr do sol no Banhado', place: sjc(-23.1805, -45.8905), addedBy: LANA, createdAt: '2026-01-05T20:00:00Z', done: '2026-01-10', photo: 3 },
  { id: 'h-santos-dumont', category: 'parque', name: 'Parque Santos Dumont', place: sjc(-23.1968, -45.8834), addedBy: GABRIEL, createdAt: '2026-04-16T20:00:00Z', done: '2026-04-26' },
  { id: 'h-mercado', category: 'comida', name: 'Pastel do Mercado Municipal', place: sjc(-23.1823, -45.8866), addedBy: GABRIEL, createdAt: '2026-01-02T20:00:00Z', done: '2026-01-03', photo: 4 },
  { id: 'h-museu', category: 'experiencia', name: 'Museu Aeroespacial', place: sjc(-23.2106, -45.8746), addedBy: GABRIEL, createdAt: '2026-09-15T20:00:00Z', featured: true, photo: 5 },
  { id: 'h-feira', category: 'experiencia', name: 'Feira de artesanato no Vicentina', place: sjc(-23.1941, -45.8895), addedBy: LANA, createdAt: '2026-09-19T20:00:00Z' },
  { id: 'h-cafe', category: 'restaurante', name: 'Café no Jardim Esplanada', place: sjc(-23.2021, -45.9001), addedBy: LANA, createdAt: '2026-09-10T20:00:00Z', featured: true, photo: 6 },
  { id: 'h-sushi', category: 'restaurante', name: 'Rodízio de sushi no Aquarius', place: sjc(-23.2185, -45.9052), addedBy: GABRIEL, createdAt: '2026-05-01T20:00:00Z', done: '2026-05-02' },
  { id: 'h-pedra', category: 'experiencia', name: 'Trilha da Pedra Vermelha', place: sjc(-23.0452, -45.9624), addedBy: GABRIEL, createdAt: '2026-08-20T20:00:00Z' },
  { id: 'h-pizza', category: 'comida', name: 'Pizza de sexta no Urbanova', place: sjc(-23.2002, -45.9398), addedBy: LANA, createdAt: '2026-09-18T20:00:00Z', done: '2026-09-19' },
  // inventado — arredores e outros estados, para os seletores.
  { id: 'h-ubatuba-1', category: 'parque', name: 'Praia do Félix', place: brPlace('Ubatuba', 'SP', -23.3886, -44.9713), addedBy: LANA, createdAt: '2026-03-01T20:00:00Z' },
  { id: 'h-ubatuba-2', category: 'experiencia', name: 'Ilha Anchieta de barco', place: brPlace('Ubatuba', 'SP', -23.5421, -45.0617), addedBy: GABRIEL, createdAt: '2026-03-02T20:00:00Z' },
  { id: 'h-ubatuba-3', category: 'comida', name: 'Peixe na Praia do Itaguá', place: brPlace('Ubatuba', 'SP', -23.4541, -45.0663), addedBy: LANA, createdAt: '2026-03-03T20:00:00Z' },
  { id: 'h-sp-1', category: 'experiencia', name: 'Pinacoteca', place: brPlace('São Paulo', 'SP', -23.5342, -46.6339), addedBy: LANA, createdAt: '2026-02-10T20:00:00Z', done: '2026-02-14' },
  { id: 'h-sp-2', category: 'comida', name: 'Sanduíche de mortadela no Mercadão', place: brPlace('São Paulo', 'SP', -23.5417, -46.6297), addedBy: GABRIEL, createdAt: '2026-02-11T20:00:00Z' },
  { id: 'h-sp-3', category: 'parque', name: 'Parque Ibirapuera', place: brPlace('São Paulo', 'SP', -23.5874, -46.6576), addedBy: LANA, createdAt: '2026-02-12T20:00:00Z', done: '2026-02-15' },
  { id: 'h-rio-1', category: 'experiencia', name: 'Pão de Açúcar ao entardecer', place: brPlace('Rio de Janeiro', 'RJ', -22.9486, -43.1566), addedBy: LANA, createdAt: '2026-05-20T20:00:00Z' },
  { id: 'h-rio-2', category: 'parque', name: 'Trilha do Morro Dois Irmãos', place: brPlace('Rio de Janeiro', 'RJ', -22.9868, -43.2436), addedBy: GABRIEL, createdAt: '2026-05-21T20:00:00Z' },
  { id: 'h-gramado', category: 'comida', name: 'Café colonial', place: brPlace('Gramado', 'RS', -29.3789, -50.8741), addedBy: LANA, createdAt: '2026-08-01T20:00:00Z' },
  { id: 'h-marau', category: 'restaurante', name: 'Galeto de domingo', place: brPlace('Marau', 'RS', -28.4497, -52.1998), addedBy: LANA, createdAt: '2025-12-20T20:00:00Z', done: '2026-03-08' },
]

/** Uma memória da Lista, anterior às das viagens (a _Última memória_ continua sendo de viagem). */
const HOME_MEMORIES: ListMemory[] = [
  {
    itemId: 'h-fondue',
    profileId: LANA,
    body: 'Frio de verdade, fondue de queijo e você queimando a língua na primeira garfada.', // inventado
    createdAt: '2026-07-05T01:00:00Z',
    updatedAt: '2026-07-05T01:00:00Z',
  },
]

// ---------------------------------------------------------------------------
// A API
// ---------------------------------------------------------------------------

export function previewHomeApi(store: PreviewStore, trips: TripsApi): HomeApi {
  const homeItems = HOME_ITEM_SPECS.map(homeItem)
  return {
    today: () => PREVIEW_TODAY,
    loadContext: () => ok(settingsSeed(HOME_STAYS)),
    loadList: () =>
      ok({
        // Mais recentes primeiro, como `loadList`.
        items: [...homeItems, ...structuredClone(store.listItems)].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
        memories: structuredClone(HOME_MEMORIES),
        photos: [],
      }),
    // As viagens vivas do harness (o que a Nova viagem criou aparece aqui).
    loadTrips: trips.loadTrips,
    loadCities: (ids) =>
      ok(new Map(ids.flatMap((id) => (store.cities.has(id) ? [[id, store.cities.get(id)!] as const] : [])))),
    signedUrls: (paths) =>
      ok(new Map(paths.flatMap((p) => (p && PATH_URLS.has(p) ? [[p, PATH_URLS.get(p)!] as const] : [])))),
    avatarUrl: () => Promise.resolve(null),
    coverUrl: () => Promise.resolve(null),
    searchCities: trips.searchCities,
    mapEngine: mapboxEngine,
  }
}
