// O acervo de exemplo das Viagens para os testes de interface (T4, T5).
// Puro: dados, sem `vi`. A API falsa que os serve mora em `fakeApi.ts`; o
// valor de contexto pronto para montar um pedaço da tela, em
// `renderInTrips.tsx`.
//
// Quem é quem (os mesmos de `settingsData()` e do Calendário):
//   · Gabriel — `GABRIEL` = 'u-gabriel', slot 1, casa em São José dos Campos
//     (`CITY_SJC`). É QUEM VÊ (`settingsData().me`): km, rota e "casa" do mapa
//     são dele (I8).
//   · Lana — `LANA` = 'u-lana', slot 2, casa em Marau (`CITY_MARAU`).
//   · Casal `COUPLE` = 'couple-1'. Hoje = `TODAY` = 2026-09-25 (sexta).
//
// As cinco viagens (`ALL_TRIPS`, em ordem de `starts_on`):
//
//   | const           | título            | datas                 | estado hoje | o que tem |
//   | --------------- | ----------------- | --------------------- | ----------- | --------- |
//   | TRIP_PARATY     | Paraty, RJ        | 20–27 set 2025 (8d)   | done        | 3 fotos (uma sem data), 1 memória (Lana 4); CONTÉM hoje−1 ano → "Há um ano" (R13) |
//   | TRIP_ILHABELA   | Ilhabela, SP      | 12–19 jul 2026 (8d)   | done        | nota "Férias de inverno", capa, 12 fotos (legenda, favorita, 1 sem data), roteiro nos dias 1–6 (dias 7–8 vazios → bloco em aberto; > 4 dias com itens → "Ver dias 5 a 8"), títulos dos dias 1 e 2, 1 item vinculado à Lista feito (Praia do Bonete), 2 memórias 5/5 ("os dois deram 5"), preparação toda marcada, hospedagem paga, saídas (Gabriel carro; Lana POA) |
//   | TRIP_LISBOA     | Lisboa, Portugal  | 1–9 out 2026 (9d)     | planned     | a do HERÓI (`heroTrip`, em 6 dias); preparação 3 de 5 (passagens e hospedagem marcadas → "2 de 3 prontos"), orçamento R$ 18.400 em 4 linhas (R$ 9.800 já gasto), hospedagem completa a pagar, roteiro nos dias 1–2 (3–9 em aberto, 7 dias livres, sugestões: Pastéis de Belém e LX Factory), 1 item vinculado (Castelo de São Jorge), saídas (Gabriel GRU; Lana POA), sem fotos |
//   | TRIP_GRAMADO    | Gramado, RS       | 18–22 dez 2026 (5d)   | planned     | nota "Natal na serra", os 5 itens padrão desmarcados, nada mais |
//   | TRIP_JAPAO      | Japão             | 3–17 abr 2027 (15d)   | planned     | destino Tóquio (JP), sem nota, sem preparação (lista vazia), nada mais |
//
//   Feitas: Paraty e Ilhabela → `tripTotals`: 2 viagens, 1 país, 2 cidades, 16 dias.
//   Planejadas depois do herói (`plannedAfterHero`): Gramado, Japão.
//
// Itens da Lista (`TRIP_LIST_ITEMS`, inteiros): perto de Lisboa — Castelo de
// São Jorge (no roteiro, dia 2), Pastéis de Belém e LX Factory (fora do
// roteiro); em Ilhabela — Praia do Bonete (feito, no roteiro); "destinos dos
// sonhos" (a fazer, países e cidades) — Japão (o mais recente), Buenos Aires,
// Islândia; e um filme (não geográfico, nunca aparece nas Viagens).
//
// As estadias (`TRIP_STAYS`) são a pintura coerente disso tudo: cada um em
// casa, os dois no destino nos dias de cada viagem, e a Lana em SJC de 20 a 30
// de setembro de 2026 (hoje: "Juntos em SJC"). O último trecho de cada um é em
// aberto.
//
// Ids: as viagens têm id com cara de uuid (a rota `/viagens/<uuid>` é
// realista); o resto tem id legível (`p-ilh-01`, `it-lis-1`, `i-castelo`).
// Fotos em `couple-1/trip/<nome>.webp`.

import type { SettingsData } from '../../data/settings'
import type { CalCity, CalendarEvent, Stay } from '../../domain/calendar'
import type { ListItem } from '../../domain/list'
import type {
  ItineraryItem,
  Lodging,
  PrepItem,
  Trip,
  TripMemory,
  TripPhoto,
} from '../../domain/trips'
import { DEFAULT_PREP, EMPTY_LODGING } from '../../domain/trips'
import { CITY_LISBOA, CITY_MARAU, CITY_PARATY, CITY_SJC, GABRIEL, LANA, calEvent } from '../../calendar/test/fixtures'
import { addDays } from '../../lib/date'
import { listItem } from '../../list/test/fixtures'
import { settingsData } from '../../settings/test/fixtures'
import type { TripsData } from '../api'

export { CITY_LISBOA, CITY_MARAU, CITY_PARATY, CITY_SJC, GABRIEL, LANA }

export const TODAY = '2026-09-25'
export const COUPLE = 'couple-1'

// ---------------------------------------------------------------------------
// Cidades
// ---------------------------------------------------------------------------

export const CITY_ILHABELA: CalCity = {
  id: 'c-ilhabela',
  name: 'Ilhabela',
  stateCode: 'SP',
  countryCode: 'BR',
  region: null,
  lat: -23.7781,
  lng: -45.3581,
}
export const CITY_GRAMADO: CalCity = {
  id: 'c-gramado',
  name: 'Gramado',
  stateCode: 'RS',
  countryCode: 'BR',
  region: null,
  lat: -29.3788,
  lng: -50.8739,
}
export const CITY_TOQUIO: CalCity = {
  id: 'c-toquio',
  name: 'Tóquio',
  stateCode: null,
  countryCode: 'JP',
  region: 'Tóquio',
  lat: 35.6762,
  lng: 139.6503,
}

/** Todas as cidades que as leituras do fake devolvem (casas, destinos, estadias). */
export const TRIP_CITIES: CalCity[] = [CITY_SJC, CITY_MARAU, CITY_PARATY, CITY_ILHABELA, CITY_LISBOA, CITY_GRAMADO, CITY_TOQUIO]

// ---------------------------------------------------------------------------
// Ids das viagens
// ---------------------------------------------------------------------------

export const TRIP_PARATY_ID = 'a0000000-0000-4000-8000-000000000001'
export const TRIP_ILHABELA_ID = 'a0000000-0000-4000-8000-000000000002'
export const TRIP_LISBOA_ID = 'a0000000-0000-4000-8000-000000000003'
export const TRIP_GRAMADO_ID = 'a0000000-0000-4000-8000-000000000004'
export const TRIP_JAPAO_ID = 'a0000000-0000-4000-8000-000000000005'
/** Um uuid bem formado que não é viagem de ninguém (R1). */
export const UNKNOWN_TRIP_ID = 'a0000000-0000-4000-8000-0000000000ff'

// ---------------------------------------------------------------------------
// Construtores (para o teste montar variações)
// ---------------------------------------------------------------------------

/** Uma viagem vazia e coerente; `overrides` troca o que o teste precisa. */
export function trip(overrides: Partial<Trip> & Pick<Trip, 'id' | 'title' | 'cityId' | 'startsOn' | 'endsOn'>): Trip {
  return {
    note: null,
    coverPhotoId: null,
    lodging: { ...EMPTY_LODGING },
    departures: [],
    days: [],
    itinerary: [],
    prep: [],
    budget: [],
    memories: [],
    photos: [],
    ...overrides,
  }
}

/** Os cinco itens que o trigger cria, com ids `${prefix}-0..4`; `done` marca os primeiros N. */
export function defaultPrep(prefix: string, done = 0, details: Partial<Record<number, string>> = {}): PrepItem[] {
  return DEFAULT_PREP.map((p, i) => ({
    id: `${prefix}-${i}`,
    kind: p.kind,
    label: p.label,
    detail: details[i] ?? null,
    done: i < done,
    position: i,
  }))
}

export function itinerary(
  id: string,
  day: string,
  title: string,
  overrides: Partial<Omit<ItineraryItem, 'id' | 'day' | 'title'>> = {},
): ItineraryItem {
  return { id, day, title, at: null, kind: 'outro', note: null, listItemId: null, position: 0, ...overrides }
}

export function photo(id: string, overrides: Partial<Omit<TripPhoto, 'id'>> = {}): TripPhoto {
  return {
    id,
    path: `${COUPLE}/trip/${id}.webp`,
    takenOn: null,
    caption: null,
    favorite: false,
    addedBy: GABRIEL,
    createdAt: '2026-07-20T12:00:00Z',
    ...overrides,
  }
}

const memory = (profileId: string, rating: number, writtenOn: string, body: string): TripMemory => ({
  profileId,
  rating,
  body,
  writtenOn,
})

// ---------------------------------------------------------------------------
// As viagens
// ---------------------------------------------------------------------------

export const TRIP_PARATY: Trip = trip({
  id: TRIP_PARATY_ID,
  title: 'Paraty, RJ',
  cityId: CITY_PARATY.id,
  startsOn: '2025-09-20',
  endsOn: '2025-09-27',
  prep: defaultPrep('pp-par', 5),
  memories: [
    memory(
      LANA,
      4,
      '2025-09-29',
      'Choveu metade dos dias e a gente nem ligou: o centro histórico molhado, a cachaçaria da Rua do Comércio, o barco até a Praia Vermelha no último dia de sol. Quero voltar no inverno.',
    ),
  ],
  photos: [
    photo('p-par-01', { takenOn: '2025-09-20', addedBy: LANA, createdAt: '2025-09-28T10:00:00Z' }),
    photo('p-par-02', { takenOn: '2025-09-23', addedBy: LANA, createdAt: '2025-09-28T10:01:00Z' }),
    photo('p-par-03', { takenOn: null, addedBy: GABRIEL, createdAt: '2025-09-28T10:02:00Z' }),
  ],
})

const ilhabelaPhotos: TripPhoto[] = Array.from({ length: 12 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0')
  return photo(`p-ilh-${n}`, {
    // Uma por dia de viagem, circulando; a última sem data (vai para o fim, R22).
    takenOn: i === 11 ? null : `2026-07-${String(12 + (i % 8)).padStart(2, '0')}`,
    caption: i === 2 ? 'Pôr do sol no Bonete' : null,
    favorite: i === 1,
    addedBy: i % 2 === 0 ? GABRIEL : LANA,
    createdAt: `2026-07-20T12:${n}:00Z`,
  })
})

export const TRIP_ILHABELA: Trip = trip({
  id: TRIP_ILHABELA_ID,
  title: 'Ilhabela, SP',
  cityId: CITY_ILHABELA.id,
  startsOn: '2026-07-12',
  endsOn: '2026-07-19',
  note: 'Férias de inverno',
  coverPhotoId: 'p-ilh-01',
  lodging: {
    name: 'Pousada Mar de Dentro',
    address: 'Av. Princesa Isabel, 1200 · Perequê',
    checkIn: '2026-07-12T14:00',
    checkOut: '2026-07-19T11:00',
    url: 'https://www.pousadamardedentro.com.br/reserva/8842',
    code: '8842',
    cents: 420_000,
    paid: true,
  },
  departures: [
    { profileId: GABRIEL, originCode: null, note: 'carro · 2h10 com a balsa' },
    { profileId: LANA, originCode: 'POA', note: 'voo POA → GRU · 1h35' },
  ],
  days: [
    { day: '2026-07-12', title: 'Chegada' },
    { day: '2026-07-13', title: 'Bonete' },
  ],
  itinerary: [
    itinerary('it-ilh-1', '2026-07-12', 'Balsa São Sebastião → Ilhabela', { at: '15:30', kind: 'transporte' }),
    itinerary('it-ilh-2', '2026-07-12', 'Check-in na pousada', { at: '17:00', kind: 'hospedagem', position: 1 }),
    itinerary('it-ilh-3', '2026-07-13', 'Trilha até a Praia do Bonete', {
      at: '08:00',
      kind: 'parque',
      note: '4h de trilha, levar água',
      listItemId: 'i-bonete',
    }),
    itinerary('it-ilh-4', '2026-07-14', 'Cachoeira da Toca', { kind: 'parque' }),
    itinerary('it-ilh-5', '2026-07-15', 'Almoço no Viana', { at: '13:00', kind: 'restaurante' }),
    itinerary('it-ilh-6', '2026-07-16', 'Passeio de barco', { at: '10:00', kind: 'experiencia' }),
    itinerary('it-ilh-7', '2026-07-17', 'Vila e sorvete', { kind: 'cidade' }),
  ],
  prep: defaultPrep('pp-ilh', 5, { 0: 'LATAM · POA → GRU', 1: 'Pousada Mar de Dentro' }),
  budget: [
    { id: 'b-ilh-1', label: 'Hospedagem', plannedCents: 420_000, spentCents: 420_000, position: 0 },
    { id: 'b-ilh-2', label: 'Passagens', plannedCents: 110_000, spentCents: 98_000, position: 1 },
  ],
  memories: [
    memory(GABRIEL, 5, '2026-07-21', 'A trilha do Bonete foi a coisa mais bonita que a gente já fez junto. Chegar na praia depois de quatro horas e ter ela quase só pra nós.'),
    memory(LANA, 5, '2026-07-22', 'O barco no dia 5, o golfinho do lado, e o Gabriel gritando. Melhor férias de inverno.'),
  ],
  photos: ilhabelaPhotos,
})

const lisboaLodging: Lodging = {
  name: 'Casa do Largo',
  address: 'Largo do Chafariz de Dentro, 1 · Alfama',
  checkIn: '2026-10-01T15:00',
  checkOut: '2026-10-09T11:00',
  url: 'https://www.booking.com/hotel/pt/casa-do-largo.html?aid=1234',
  code: 'HX4K2',
  cents: 320_000,
  paid: false,
}

export const TRIP_LISBOA: Trip = trip({
  id: TRIP_LISBOA_ID,
  title: 'Lisboa, Portugal',
  cityId: CITY_LISBOA.id,
  startsOn: '2026-10-01',
  endsOn: '2026-10-09',
  note: 'Primeira vez na Europa',
  lodging: lisboaLodging,
  departures: [
    { profileId: GABRIEL, originCode: 'GRU', note: 'voo GRU → LIS · 10h' },
    { profileId: LANA, originCode: 'POA', note: 'voo POA → GRU → LIS' },
  ],
  itinerary: [
    itinerary('it-lis-1', '2026-10-01', 'Chegada em Lisboa', { at: '10:40', kind: 'voo', note: 'TP 88' }),
    itinerary('it-lis-2', '2026-10-02', 'Castelo de São Jorge', { at: '09:30', kind: 'cidade', listItemId: 'i-castelo' }),
  ],
  prep: defaultPrep('pp-lis', 3, { 0: 'TAP · GRU → LIS', 1: 'Casa do Largo · Alfama', 2: 'Passaportes ok' }),
  budget: [
    { id: 'b-lis-1', label: 'Passagens', plannedCents: 980_000, spentCents: 980_000, position: 0 },
    { id: 'b-lis-2', label: 'Hospedagem', plannedCents: 320_000, spentCents: 0, position: 1 },
    { id: 'b-lis-3', label: 'Comida', plannedCents: 300_000, spentCents: 0, position: 2 },
    { id: 'b-lis-4', label: 'Passeios', plannedCents: 240_000, spentCents: 0, position: 3 },
  ],
})

export const TRIP_GRAMADO: Trip = trip({
  id: TRIP_GRAMADO_ID,
  title: 'Gramado, RS',
  cityId: CITY_GRAMADO.id,
  startsOn: '2026-12-18',
  endsOn: '2026-12-22',
  note: 'Natal na serra',
  prep: defaultPrep('pp-gra'),
})

export const TRIP_JAPAO: Trip = trip({
  id: TRIP_JAPAO_ID,
  title: 'Japão',
  cityId: CITY_TOQUIO.id,
  startsOn: '2027-04-03',
  endsOn: '2027-04-17',
})

export const ALL_TRIPS: Trip[] = [TRIP_PARATY, TRIP_ILHABELA, TRIP_LISBOA, TRIP_GRAMADO, TRIP_JAPAO]

/** O evento `viagem` dos dois de cada viagem, como o Calendário o guarda (R26 edita por ele). */
export function tripEvent(t: Trip, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return calEvent({
    id: t.id,
    kind: 'viagem',
    title: t.title,
    startsOn: t.startsOn,
    endsOn: t.endsOn,
    cityId: t.cityId,
    travelers: 'both',
    note: t.note,
    ...overrides,
  })
}

/** O `TripsData` que `loadTrips` devolve para `trips`. */
export function tripsData(trips: readonly Trip[] = ALL_TRIPS): TripsData {
  return { trips: [...trips], events: new Map(trips.map((t) => [t.id, tripEvent(t)])) }
}

// ---------------------------------------------------------------------------
// A Lista
// ---------------------------------------------------------------------------

const lisboaPlace = (lat: number, lng: number) =>
  ({ address: null, city: 'Lisboa', state: 'Lisboa', country: 'Portugal', countryCode: 'PT', lat, lng }) as const

export const ITEM_CASTELO: ListItem = listItem({
  id: 'i-castelo',
  name: 'Castelo de São Jorge',
  category: 'experiencia',
  place: lisboaPlace(38.7139, -9.1334),
  createdAt: '2026-08-10T12:00:00Z',
})
export const ITEM_PASTEIS: ListItem = listItem({
  id: 'i-pasteis',
  name: 'Pastéis de Belém',
  category: 'comida',
  place: lisboaPlace(38.6975, -9.2032),
  venue: 'Antiga Confeitaria de Belém',
  addedBy: LANA,
  createdAt: '2026-08-11T12:00:00Z',
})
export const ITEM_LX_FACTORY: ListItem = listItem({
  id: 'i-lxfactory',
  name: 'LX Factory',
  category: 'experiencia',
  place: lisboaPlace(38.7033, -9.1789),
  createdAt: '2026-08-12T12:00:00Z',
})
export const ITEM_BONETE: ListItem = listItem({
  id: 'i-bonete',
  name: 'Praia do Bonete',
  category: 'parque',
  place: { address: null, city: 'Ilhabela', state: 'SP', country: 'Brasil', countryCode: 'BR', lat: -23.8667, lng: -45.4167 },
  status: 'done',
  rating: 5,
  doneOn: '2026-07-13',
  doneWith: 'both',
  createdAt: '2026-05-02T12:00:00Z',
})
export const ITEM_JAPAO: ListItem = listItem({
  id: 'i-japao',
  name: 'Japão',
  category: 'pais',
  place: { address: null, city: null, state: null, country: 'Japão', countryCode: 'JP', lat: 36.2048, lng: 138.2529 },
  highlights: ['Tóquio', 'Kyoto'],
  photoPath: `${COUPLE}/item/japao.webp`,
  createdAt: '2026-09-20T12:00:00Z',
})
export const ITEM_BUENOS_AIRES: ListItem = listItem({
  id: 'i-buenos',
  name: 'Buenos Aires',
  category: 'cidade',
  place: { address: null, city: 'Buenos Aires', state: null, country: 'Argentina', countryCode: 'AR', lat: -34.6037, lng: -58.3816 },
  region: 'Palermo',
  addedBy: LANA,
  createdAt: '2026-09-10T12:00:00Z',
})
export const ITEM_ISLANDIA: ListItem = listItem({
  id: 'i-islandia',
  name: 'Islândia',
  category: 'pais',
  place: { address: null, city: null, state: null, country: 'Islândia', countryCode: 'IS', lat: 64.9631, lng: -19.0208 },
  createdAt: '2026-06-01T12:00:00Z',
})
export const ITEM_FILME: ListItem = listItem({
  id: 'i-filme',
  name: 'Past Lives',
  category: 'filme',
  platform: 'MUBI',
  createdAt: '2026-09-22T12:00:00Z',
})

/** Da mais recente para a mais antiga, como `loadListItems` devolve. */
export const TRIP_LIST_ITEMS: ListItem[] = [
  ITEM_FILME,
  ITEM_JAPAO,
  ITEM_BUENOS_AIRES,
  ITEM_LX_FACTORY,
  ITEM_PASTEIS,
  ITEM_CASTELO,
  ITEM_ISLANDIA,
  ITEM_BONETE,
]

// ---------------------------------------------------------------------------
// Estadias e contexto
// ---------------------------------------------------------------------------

type Segment = { cityId: string; from: string; to: string }

/** Casa entre os trechos, os trechos nos dias deles, e a casa em aberto no fim. */
function paintPerson(profileId: string, homeId: string, start: string, segments: Segment[]): Stay[] {
  const stays: Stay[] = []
  let cursor = start
  let n = 0
  const push = (cityId: string, from: string, to: string | null) =>
    stays.push({ id: `${profileId}-${++n}`, profileId, cityId, startsOn: from, endsOn: to })
  for (const s of [...segments].sort((a, b) => a.from.localeCompare(b.from))) {
    if (cursor < s.from) push(homeId, cursor, dayBefore(s.from))
    push(s.cityId, s.from, s.to)
    cursor = dayAfter(s.to)
  }
  push(homeId, cursor, null)
  return stays
}

// Aritmética de dia sem `Date` (a regra do projeto: `Date` só em `lib/date.ts`).
const dayBefore = (iso: string) => addDays(iso, -1)
const dayAfter = (iso: string) => addDays(iso, 1)

const bothTrips: Segment[] = ALL_TRIPS.map((t) => ({ cityId: t.cityId, from: t.startsOn, to: t.endsOn }))

export const TRIP_STAYS: Stay[] = [
  ...paintPerson(GABRIEL, CITY_SJC.id, '2025-01-01', bothTrips),
  ...paintPerson(LANA, CITY_MARAU.id, '2025-01-01', [
    ...bothTrips,
    // Hoje (25/9) a Lana está em SJC: "Juntos em SJC".
    { cityId: CITY_SJC.id, from: '2026-09-20', to: '2026-09-30' },
  ]),
]

/** A leitura de contexto (`loadContext`) com as estadias acima. */
export function tripsContextData(overrides: Partial<SettingsData> = {}): SettingsData {
  return settingsData({ stays: TRIP_STAYS, ...overrides })
}

/** `https://signed/<path>` — a URL que o `signedUrls` falso devolve. */
export const signedUrlOf = (path: string) => `https://signed/${path}`
