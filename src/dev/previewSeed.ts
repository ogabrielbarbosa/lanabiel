// O acervo do harness visual (`/viagens?preview`, só DEV — ver `Preview.tsx`).
//
// O SEED É O DESIGN: textos, datas, números e imagens saem dos frames do
// Pencil (`pencil-new.pen`) — Grade `OmXwr`, Linha do tempo `NAPHW`, Painel
// `lB4rw`, Detalhe feita `Peoa7` (Ilhabela), Detalhe futura `f3yqz` (Lisboa),
// Galeria `pUXaX` e Nova viagem `MQHBd`. O que o frame não mostra e a tela
// precisa para existir está marcado com `// inventado`.
//
// Não importa nada de `src/**/test/**`: os fixtures de teste puxam `vitest`,
// que não roda no navegador. As imagens são as do Unsplash usadas no design;
// as contagens grandes de foto (124 em Paraty, 86 em Ilhabela…) repetem essas
// poucas URLs — é harness, não acervo.
//
// "Hoje" = 2026-09-25 (sexta), o dia dos frames.

import type { SettingsData } from '../data/settings'
import { tripEventDraft } from '../data/trips'
import type { CalCity, CalendarEvent, Stay } from '../domain/calendar'
import type { GeoPlace, ListCategory, ListItem } from '../domain/list'
import { NOTIFY_CHANNELS, NOTIFY_EVENTS, notifyColumn } from '../domain/settings'
import type { NotifyColumn } from '../domain/settings'
import type {
  BudgetLine,
  ItineraryItem,
  ItineraryKind,
  Lodging,
  PrepItem,
  Trip,
  TripDeparture,
  TripMemory,
  TripPhoto,
} from '../domain/trips'
import { DEFAULT_PREP, EMPTY_LODGING } from '../domain/trips'
import { addDays, daysInclusive } from '../lib/date'

export const PREVIEW_TODAY = '2026-09-25'
export const COUPLE_ID = 'couple-preview'
export const GABRIEL = 'u-gabriel'
export const LANA = 'u-lana'

// ---------------------------------------------------------------------------
// Imagens (Unsplash, as do design)
// ---------------------------------------------------------------------------

const img = (id: string) => `https://images.unsplash.com/photo-${id}?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=1080`

/** Capas da Grade (`OmXwr`), do herói e do "Há um ano". */
const COVER = {
  lisboa: img('1536663060084-a0d9eeeaf44b'),
  lisboaHero: img('1598902886324-039b3345eeb9'),
  gramado: img('1676841576250-d812ba31b7b7'),
  japao: img('1699615171421-8fd416dcb613'),
  paraty: img('1688136406061-302e36df5b0b'),
  ilhabela: img('1582819086261-74e69d767e48'),
  ilhabelaHero: img('1660076309636-87d6fa0226e7'),
  buenosAires: img('1676036633197-d37b327e25ca'),
  atacama: img('1656844817790-435d65e2e037'),
  chapada: img('1723033482028-9576384d6c1e'),
}

/** As miniaturas do Detalhe de Ilhabela (`Peoa7`) e da Galeria (`pUXaX`). */
const ILHABELA_POOL = [
  '1783249204726-813230b93b27',
  '1761095596656-7142a0600ecc',
  '1508313157893-34fe6176c189',
  '1502943693086-33b5b1cfdf2f',
  '1768431480618-bd7b93952607',
  '1687648431656-da99da578d50',
  '1768407684043-a596611517ab',
  '1700760933440-5c6a4b4224a4',
  '1776347469323-4f81eae6f70a',
  '1778489927149-fa5b013e2725',
  '1598122401685-728b1ab601e2',
  '1633716898262-0e1469d55bb3',
  '1784779040724-bc9c37961bd9',
  '1651546998029-28a30cd9ef97',
  '1629604307001-c316ae14c69b',
  '1779119379964-c252d2748477',
  '1487335414417-ac48b43a8cc7',
  '1583668928305-c5a212ff02e8',
  '1754557177802-94d6625ecbde',
  '1662181584427-eeb023247ab7',
].map(img)
/** A foto aberta na Galeria: "Baía de Castelhanos", 34 / 86. */
const CASTELHANOS_PHOTO = img('1781626172985-389edacb6c1f')

/** As fotos dos itens da Lista "feitos aqui" em Ilhabela (`Peoa7`). */
const ILHABELA_LIST_POOL = [
  '1461566978495-8c8f681e1235',
  '1626922222463-ef13c43eb477',
  '1785961259193-16a768c00566',
  '1643101570532-88c8ecc07c1f',
  '1639954362048-f5517587ad73',
  '1669203469435-c9f68d86af78',
  '1649162830103-541d2af124ae',
  '1703306469298-61a832f9b824',
  '1581670752622-ac864429c0e9',
].map(img)

/** Lisboa (`f3yqz`): os cartões "Na lista em Lisboa" e as sugestões. */
const LISBOA_LIST_POOL = [
  '1651484396889-5de94b4d2a8b',
  '1652551985622-cb5573b9d191',
  '1765939819107-05d36965f2f0',
  '1711842789209-6fd526de7a98',
  '1532770116784-60d03b16b591',
  '1762144062285-7d08888d4d97',
  '1634914204671-794b4b010259',
  '1637273483570-10e72651892e',
  '1678630508977-e9c28c00283d',
  '1650462745021-5a07ba76d69f',
].map(img)

/** Destinos dos sonhos (`lB4rw`) e "Da lista em Floripa" (`MQHBd`). */
const DREAM = {
  italia: img('1690228684997-78f5766f1d48'),
  chalten: img('1667759045783-0d7c91c813b5'),
  mexico: img('1722643650603-1d687e083ebb'),
}
const FLORIPA_POOL = ['1763964377164-595396461dff', '1729543239723-1feccd5c00b6', '1605152569494-ea98baab1397'].map(img)

/** As da Linha do tempo (`NAPHW`) — reforçam os acervos grandes. */
const TIMELINE_POOL = [
  '1573416264247-7e0212941973',
  '1652209473459-714f5c7e5b9c',
  '1566111204630-0cb833b764b1',
  '1668980743152-446f5e475945',
  '1592187165599-919ef05d7afd',
].map(img)

// ---------------------------------------------------------------------------
// Cidades (lat/lng reais)
// ---------------------------------------------------------------------------

const br = (id: string, name: string, stateCode: string, lat: number, lng: number): CalCity => ({
  id,
  name,
  stateCode,
  countryCode: 'BR',
  region: null,
  lat,
  lng,
})
const world = (id: string, name: string, countryCode: string, region: string | null, lat: number, lng: number): CalCity => ({
  id,
  name,
  stateCode: null,
  countryCode,
  region,
  lat,
  lng,
})

export const CITY = {
  sjc: br('c-sjc', 'São José dos Campos', 'SP', -23.1896, -45.8841),
  marau: br('c-marau', 'Marau', 'RS', -28.4498, -52.1986),
  paraty: br('c-paraty', 'Paraty', 'RJ', -23.2178, -44.7131),
  ilhabela: br('c-ilhabela', 'Ilhabela', 'SP', -23.7781, -45.3581),
  saoSebastiao: br('c-sao-sebastiao', 'São Sebastião', 'SP', -23.7952, -45.4143),
  lencois: br('c-lencois', 'Lençóis', 'BA', -12.5631, -41.3895),
  gramado: br('c-gramado', 'Gramado', 'RS', -29.3788, -50.8739),
  floripa: br('c-floripa', 'Florianópolis', 'SC', -27.5954, -48.548),
  saoPaulo: br('c-sao-paulo', 'São Paulo', 'SP', -23.5505, -46.6333),
  portoAlegre: br('c-porto-alegre', 'Porto Alegre', 'RS', -30.0346, -51.2177),
  buenosAires: world('c-buenos-aires', 'Buenos Aires', 'AR', 'Buenos Aires', -34.6037, -58.3816),
  atacama: world('c-atacama', 'San Pedro de Atacama', 'CL', 'Antofagasta', -22.9087, -68.1997),
  cartagena: world('c-cartagena', 'Cartagena', 'CO', 'Bolívar', 10.391, -75.4794),
  lisboa: world('c-lisboa', 'Lisboa', 'PT', 'Lisboa', 38.7223, -9.1393),
  toquio: world('c-toquio', 'Tóquio', 'JP', 'Tóquio', 35.6762, 139.6503),
  sintra: world('c-sintra', 'Sintra', 'PT', 'Lisboa', 38.8029, -9.3817),
  cascais: world('c-cascais', 'Cascais', 'PT', 'Lisboa', 38.6979, -9.4215),
  kyoto: world('c-kyoto', 'Kyoto', 'JP', 'Kyoto', 35.0116, 135.7681),
} satisfies Record<string, CalCity>

export const ALL_CITIES: CalCity[] = Object.values(CITY)

// ---------------------------------------------------------------------------
// Os caminhos de "Storage" → URL (o `signedUrls` do harness)
// ---------------------------------------------------------------------------

/** caminho → URL. As fotos novas (upload no harness) entram aqui como `blob:`. */
export const PATH_URLS = new Map<string, string>()

function mediaPath(kind: 'trip' | 'list', name: string, url: string): string {
  const path = `${COUPLE_ID}/${kind}/${name}.webp`
  PATH_URLS.set(path, url)
  return path
}

// ---------------------------------------------------------------------------
// Construtores
// ---------------------------------------------------------------------------

let seq = 0
const nextId = (prefix: string) => `${prefix}-${++seq}`

function photos(
  key: string,
  trip: { startsOn: string; endsOn: string },
  count: number,
  pool: readonly string[],
): TripPhoto[] {
  const days = daysInclusive(trip.startsOn, trip.endsOn)
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${key}-${i + 1}`,
    path: mediaPath('trip', `${key}-${i + 1}`, pool[i % pool.length]),
    takenOn: addDays(trip.startsOn, Math.floor((i * days) / count)),
    caption: null,
    favorite: false,
    addedBy: i % 2 === 0 ? GABRIEL : LANA,
    createdAt: `${addDays(trip.endsOn, 1)}T12:${String(i % 60).padStart(2, '0')}:00Z`,
  }))
}

function prep(done: boolean[] = [], details: (string | null)[] = []): PrepItem[] {
  return DEFAULT_PREP.map((p, i) => ({
    id: nextId('prep'),
    kind: p.kind,
    label: p.label,
    detail: details[i] ?? null,
    done: done[i] ?? false,
    position: i,
  }))
}

type ItinSpec = [at: string | null, title: string, kind: ItineraryKind, note: string | null, listItemId?: string]

function itinerary(startsOn: string, byDay: Record<number, ItinSpec[]>): ItineraryItem[] {
  const out: ItineraryItem[] = []
  let position = 0
  for (const [n, items] of Object.entries(byDay)) {
    for (const [at, title, kind, note, listItemId] of items) {
      out.push({
        id: nextId('it'),
        day: addDays(startsOn, Number(n) - 1),
        at,
        title,
        kind,
        note,
        listItemId: listItemId ?? null,
        position: position++,
      })
    }
  }
  return out
}

function budget(lines: [label: string, planned: number, spent: number][]): BudgetLine[] {
  return lines.map(([label, planned, spent], i) => ({
    id: nextId('bud'),
    label,
    plannedCents: planned * 100,
    spentCents: spent * 100,
    position: i,
  }))
}

function memory(profileId: string, writtenOn: string, body: string, rating = 5): TripMemory {
  return { profileId, rating, body, writtenOn }
}

function departures(gabriel: [string | null, string | null], lana: [string | null, string | null]): TripDeparture[] {
  return [
    { profileId: GABRIEL, originCode: gabriel[0], note: gabriel[1] },
    { profileId: LANA, originCode: lana[0], note: lana[1] },
  ]
}

function trip(t: Partial<Trip> & Pick<Trip, 'id' | 'title' | 'cityId' | 'startsOn' | 'endsOn'>): Trip {
  return {
    note: null,
    coverPhotoId: null,
    lodging: { ...EMPTY_LODGING },
    departures: departures([null, null], [null, null]),
    days: [],
    itinerary: [],
    prep: prep(),
    budget: [],
    memories: [],
    photos: [],
    ...t,
  }
}

/** A capa é uma das fotos da viagem (`cover_photo_id`): acrescenta uma e aponta para ela. */
function withCover(t: Trip, key: string, url: string): Trip {
  const cover: TripPhoto = {
    id: `p-${key}-cover`,
    path: mediaPath('trip', `${key}-cover`, url),
    takenOn: t.startsOn,
    caption: null,
    favorite: true,
    addedBy: GABRIEL,
    createdAt: `${addDays(t.endsOn, 1)}T11:00:00Z`,
  }
  return { ...t, photos: [cover, ...t.photos], coverPhotoId: cover.id }
}

// ---------------------------------------------------------------------------
// Itens da Lista
// ---------------------------------------------------------------------------

function place(city: CalCity | null, lat: number, lng: number, address: string | null = null): GeoPlace {
  const country = city?.countryCode ?? 'BR'
  return {
    address,
    city: city?.name ?? null,
    state: city?.stateCode ?? city?.region ?? null,
    country: COUNTRY_NAMES[country] ?? country,
    countryCode: country,
    lat,
    lng,
  }
}

const COUNTRY_NAMES: Record<string, string> = {
  BR: 'Brasil',
  PT: 'Portugal',
  IT: 'Itália',
  AR: 'Argentina',
  MX: 'México',
  JP: 'Japão',
  CL: 'Chile',
  CO: 'Colômbia',
}

interface ItemSpec {
  id: string
  category: ListCategory
  name: string
  place: GeoPlace
  addedBy: string
  note?: string | null
  region?: string | null
  venue?: string | null
  highlights?: string[]
  featured?: boolean
  photo?: string
  done?: { on: string; rating: 1 | 2 | 3 | 4 | 5 }
  createdAt: string
}

function item(s: ItemSpec): ListItem {
  return {
    id: s.id,
    category: s.category,
    name: s.name,
    note: s.note ?? null,
    link: null,
    featured: s.featured ?? false,
    place: s.place,
    region: s.region ?? null,
    venue: s.venue ?? null,
    highlights: s.highlights ?? [],
    platform: null,
    seasons: null,
    photoPath: s.photo ? mediaPath('list', s.id, s.photo) : null,
    status: s.done ? 'done' : 'want',
    rating: s.done?.rating ?? null,
    addedBy: s.addedBy,
    createdAt: s.createdAt,
    doneOn: s.done?.on ?? null,
    doneWith: s.done ? 'both' : null,
    doneSoloBy: null,
  }
}

// Ilhabela · "Da nossa lista · feitos aqui · 9 itens" (`Peoa7`). Os quatro dos
// cartões e os cinco do roteiro que dizem "da lista".
const ILH = CITY.ilhabela
const ilhabelaItems: ListItem[] = [
  ['i-toca', 'parque', 'Cachoeira da Toca', -23.7669, -45.3905, '2026-07-13', null],
  ['i-castelhanos', 'experiencia', 'Baía de Castelhanos', -23.8489, -45.2889, '2026-07-14', null],
  ['i-camarao', 'comida', 'Camarão na moranga', -23.8203, -45.3667, '2026-07-12', 'Viana'],
  ['i-nomaa', 'restaurante', 'Casa Nomaa', -23.7811, -45.3572, '2026-07-13', null],
  ['i-pinto', 'parque', 'Pôr do sol na Praia do Pinto', -23.7547, -45.3525, '2026-07-12', null],
  ['i-vila', 'cidade', 'Vila de Ilhabela', -23.7781, -45.3581, '2026-07-13', null],
  ['i-peixe', 'comida', 'Peixe na brasa em Castelhanos', -23.8512, -45.2861, '2026-07-14', null],
  ['i-buzios', 'experiencia', 'Ilha de Búzios de barco', -23.7967, -45.1344, '2026-07-15', null],
  ['i-pastel', 'comida', 'Pastel do Mercado Municipal', -23.7792, -45.3569, '2026-07-15', 'Mercado Municipal'],
].map(([id, category, name, lat, lng, on, venue], i) =>
  item({
    id: id as string,
    category: category as ListCategory,
    name: name as string,
    place: place(ILH, lat as number, lng as number),
    addedBy: i % 2 === 0 ? LANA : GABRIEL,
    venue: venue as string | null,
    photo: ILHABELA_LIST_POOL[i % ILHABELA_LIST_POOL.length],
    done: { on: on as string, rating: 5 },
    createdAt: `2026-0${3 + (i % 3)}-1${i}T20:00:00Z`,
  }),
)

// Lisboa · "Na lista em Lisboa · 12 itens" (`f3yqz`). Os quatro dos cartões,
// os três do roteiro dos dias 1–2 e as sugestões do bloco em aberto; o resto
// (Castelo, LX Factory, Time Out, Elétrico 28, Santa Luzia) é inventado para
// fechar os 12.
const lisboaItems: ListItem[] = [
  ['i-belem', 'comida', 'Pastéis de Belém', CITY.lisboa, 38.6975, -9.2033, LANA, 'Belém'],
  ['i-taberna', 'restaurante', 'Taberna da Rua das Flores', CITY.lisboa, 38.7107, -9.1446, GABRIEL, null],
  ['i-pena', 'cidade', 'Palácio da Pena', CITY.sintra, 38.7876, -9.3906, LANA, null],
  ['i-fado', 'experiencia', 'Fado em Alfama', CITY.lisboa, 38.7117, -9.1302, GABRIEL, null],
  ['i-jeronimos', 'cidade', 'Mosteiro dos Jerónimos', CITY.lisboa, 38.6979, -9.2068, LANA, null],
  ['i-senhora-monte', 'parque', 'Miradouro da Senhora do Monte', CITY.lisboa, 38.7191, -9.1327, GABRIEL, null],
  ['i-cascais', 'experiencia', 'Cascais de trem', CITY.cascais, 38.7009, -9.4183, LANA, null],
  ['i-castelo', 'cidade', 'Castelo de São Jorge', CITY.lisboa, 38.7139, -9.1335, GABRIEL, null],
  ['i-lxfactory', 'experiencia', 'LX Factory', CITY.lisboa, 38.7036, -9.1784, LANA, null],
  ['i-timeout', 'comida', 'Time Out Market', CITY.lisboa, 38.7069, -9.1459, GABRIEL, null],
  ['i-eletrico', 'experiencia', 'Elétrico 28', CITY.lisboa, 38.7155, -9.1363, LANA, null],
  ['i-santa-luzia', 'parque', 'Miradouro de Santa Luzia', CITY.lisboa, 38.7118, -9.1301, GABRIEL, null],
].map(([id, category, name, city, lat, lng, by, venue], i) =>
  item({
    id: id as string,
    category: category as ListCategory,
    name: name as string,
    place: place(city as CalCity, lat as number, lng as number),
    addedBy: by as string,
    venue: venue as string | null,
    photo: LISBOA_LIST_POOL[i % LISBOA_LIST_POOL.length],
    createdAt: `2026-08-${String(10 + i).padStart(2, '0')}T21:00:00Z`,
  }),
)

// Destinos dos sonhos (`lB4rw`): a fazer, países e cidades.
const dreamItems: ListItem[] = [
  item({
    id: 'i-italia',
    category: 'pais',
    name: 'Itália',
    place: { address: null, city: null, state: null, country: 'Itália', countryCode: 'IT', lat: 41.8719, lng: 12.5674 },
    highlights: ['Toscana', 'Amalfi'],
    note: 'Toscana e Amalfi',
    addedBy: LANA,
    photo: DREAM.italia,
    createdAt: '2026-09-20T22:00:00Z',
  }),
  item({
    id: 'i-chalten',
    category: 'cidade',
    name: 'El Chaltén',
    place: { address: null, city: 'El Chaltén', state: 'Santa Cruz', country: 'Argentina', countryCode: 'AR', lat: -49.3315, lng: -72.8863 },
    region: 'Patagônia',
    addedBy: GABRIEL,
    photo: DREAM.chalten,
    createdAt: '2026-09-18T22:00:00Z',
  }),
  item({
    id: 'i-cdmx',
    category: 'cidade',
    name: 'Cidade do México',
    place: { address: null, city: 'Cidade do México', state: 'CDMX', country: 'México', countryCode: 'MX', lat: 19.4326, lng: -99.1332 },
    region: 'Día de Muertos',
    note: 'Día de Muertos',
    addedBy: LANA,
    photo: DREAM.mexico,
    createdAt: '2026-09-15T22:00:00Z',
  }),
]

// "Da lista em Floripa · 5 itens" (`MQHBd`): três do modal, dois inventados.
const floripaItems: ListItem[] = [
  ['i-lagoa', 'parque', 'Pôr do sol na Lagoa', -27.6026, -48.4719],
  ['i-ostras', 'comida', 'Ostras no Ribeirão da Ilha', -27.7163, -48.5616],
  ['i-lagoinha', 'experiencia', 'Trilha da Lagoinha do Leste', -27.7766, -48.4855],
  ['i-campeche', 'parque', 'Praia do Campeche', -27.6829, -48.4786], // inventado
  ['i-mercado', 'comida', 'Mercado Público', -27.5967, -48.5528], // inventado
].map(([id, category, name, lat, lng], i) =>
  item({
    id: id as string,
    category: category as ListCategory,
    name: name as string,
    place: place(CITY.floripa, lat as number, lng as number),
    addedBy: i % 2 === 0 ? GABRIEL : LANA,
    photo: FLORIPA_POOL[i % FLORIPA_POOL.length],
    createdAt: `2026-06-0${i + 1}T21:00:00Z`,
  }),
)

export const LIST_ITEMS: ListItem[] = [...dreamItems, ...lisboaItems, ...ilhabelaItems, ...floripaItems]

// ---------------------------------------------------------------------------
// As viagens
// ---------------------------------------------------------------------------

const tripId = (n: number) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const TRIP_IDS = {
  cartagena: tripId(1),
  paraty2024: tripId(2),
  atacama: tripId(3),
  paraty2025: tripId(4),
  chapada: tripId(5),
  buenosAires: tripId(6),
  ilhabela: tripId(7),
  paraty: tripId(8),
  lisboa: tripId(9),
  gramado: tripId(10),
  japao: tripId(11),
}

// Cartagena: a "Mais distante" dos recordes (datas inventadas).
const cartagena = withCover(
  trip({
    id: TRIP_IDS.cartagena,
    title: 'Cartagena',
    cityId: CITY.cartagena.id,
    startsOn: '2024-11-14',
    endsOn: '2024-11-20',
    prep: prep([true, true, true, true, true]),
    memories: [memory(LANA, '2024-11-24', 'O calor, as cores e a gente se perdendo de mãos dadas pela cidade murada.')], // inventado
    photos: photos('cartagena', { startsOn: '2024-11-14', endsOn: '2024-11-20' }, 48, TIMELINE_POOL),
  }),
  'cartagena',
  TIMELINE_POOL[0],
)

// Paraty "3 vezes" (Recordes): duas idas antes da de setembro (inventadas).
const paraty2024 = withCover(
  trip({
    id: TRIP_IDS.paraty2024,
    title: 'Paraty, RJ',
    cityId: CITY.paraty.id,
    startsOn: '2024-10-11',
    endsOn: '2024-10-13',
    prep: prep([true, true, true, true, true]),
    photos: photos('paraty-2024', { startsOn: '2024-10-11', endsOn: '2024-10-13' }, 22, TIMELINE_POOL),
  }),
  'paraty-2024',
  COVER.paraty,
)

const atacama = withCover(
  trip({
    id: TRIP_IDS.atacama,
    title: 'Atacama',
    cityId: CITY.atacama.id,
    startsOn: '2025-03-03',
    endsOn: '2025-03-11',
    prep: prep([true, true, true, true, true]),
    memories: [memory(GABRIEL, '2025-03-14', 'O céu do deserto à noite. Nunca vi tanta estrela junto — e nunca senti tanto frio abraçado em alguém.')], // inventado
    photos: photos('atacama', { startsOn: '2025-03-03', endsOn: '2025-03-11' }, 202, TIMELINE_POOL),
  }),
  'atacama',
  COVER.atacama,
)

const paraty2025 = withCover(
  trip({
    id: TRIP_IDS.paraty2025,
    title: 'Paraty, RJ',
    cityId: CITY.paraty.id,
    startsOn: '2025-06-19',
    endsOn: '2025-06-22',
    prep: prep([true, true, true, true, true]),
    photos: photos('paraty-2025', { startsOn: '2025-06-19', endsOn: '2025-06-22' }, 31, TIMELINE_POOL),
  }),
  'paraty-2025',
  COVER.paraty,
)

// "Há um ano" (`lB4rw`): 20–27 set 2025, com a memória citada.
const chapada = withCover(
  trip({
    id: TRIP_IDS.chapada,
    title: 'Chapada Diamantina, BA',
    cityId: CITY.lencois.id,
    startsOn: '2025-09-20',
    endsOn: '2025-09-27',
    prep: prep([true, true, true, true, true]),
    memories: [memory(LANA, '2025-09-30', 'Nadar no Poço Azul com você foi a coisa mais bonita que eu já vi.')],
    photos: photos('chapada', { startsOn: '2025-09-20', endsOn: '2025-09-27' }, 64, TIMELINE_POOL),
  }),
  'chapada',
  COVER.chapada,
)

const buenosAires = withCover(
  trip({
    id: TRIP_IDS.buenosAires,
    title: 'Buenos Aires',
    cityId: CITY.buenosAires.id,
    startsOn: '2025-10-20',
    endsOn: '2025-10-26',
    prep: prep([true, true, true, true, true]),
    memories: [
      memory(GABRIEL, '2025-10-28', 'Tango em San Telmo e a gente rindo sem saber dançar. Melhor noite.'), // inventado
      memory(LANA, '2025-10-29', 'Doce de leite no café da manhã todos os dias, e você me esperando acordar.'), // inventado
    ],
    photos: photos('buenos-aires', { startsOn: '2025-10-20', endsOn: '2025-10-26' }, 151, TIMELINE_POOL),
  }),
  'buenos-aires',
  COVER.buenosAires,
)

// Ilhabela · Detalhe feita (`Peoa7`) e Galeria (`pUXaX`).
const ILHABELA_DATES = { startsOn: '2026-07-12', endsOn: '2026-07-19' }
const ilhabelaPhotos = (() => {
  const ps = photos('ilhabela', ILHABELA_DATES, 85, ILHABELA_POOL)
  // 34 / 86 na Galeria: "Baía de Castelhanos · Seg, 14 jul · foto da Lana · Dia 3".
  // A capa entra na frente (`withCover`), então a 34ª é o índice 32 daqui.
  ps[32] = {
    ...ps[32],
    path: mediaPath('trip', 'ilhabela-castelhanos', CASTELHANOS_PHOTO),
    takenOn: '2026-07-14',
    caption: 'Baía de Castelhanos',
    favorite: true,
    addedBy: LANA,
  }
  return ps
})()

const ilhabela = withCover(
  trip({
    id: TRIP_IDS.ilhabela,
    title: 'Ilhabela, SP',
    cityId: CITY.ilhabela.id,
    ...ILHABELA_DATES,
    note: 'Férias de inverno',
    lodging: {
      // inventado: o frame não mostra a hospedagem de Ilhabela.
      name: 'Pousada na Praia do Curral',
      address: 'Av. Riachuelo, 1200 · Curral, Ilhabela',
      checkIn: '2026-07-12T14:00',
      checkOut: '2026-07-19T11:00',
      url: null,
      code: null,
      cents: 380000,
      paid: true,
    },
    departures: departures([null, 'carro · SJC → São Sebastião · 2h'], ['POA', 'voo POA → GRU · 1h40']), // inventado
    days: [
      { day: '2026-07-12', title: 'Chegada e pôr do sol' },
      { day: '2026-07-13', title: 'Cachoeiras' },
      { day: '2026-07-14', title: 'Castelhanos' },
      { day: '2026-07-15', title: 'Barco e mergulho' },
    ],
    itinerary: itinerary(ILHABELA_DATES.startsOn, {
      1: [
        ['11:00', 'Balsa São Sebastião → Ilhabela', 'experiencia', '15 min de travessia'],
        ['13:30', 'Camarão na moranga no Viana', 'comida', 'almoço na praia', 'i-camarao'],
        ['17:40', 'Pôr do sol na Praia do Pinto', 'parque', 'vinho e queijo', 'i-pinto'],
      ],
      2: [
        ['09:30', 'Cachoeira da Toca', 'parque', 'piscinas naturais', 'i-toca'],
        ['14:00', 'Vila de Ilhabela a pé', 'cidade', 'centrinho histórico', 'i-vila'],
        ['20:00', 'Jantar no Casa Nomaa', 'restaurante', 'menu do chef', 'i-nomaa'],
      ],
      3: [
        ['08:00', 'Jipe até a Baía de Castelhanos', 'experiencia', '22 km de estrada de terra', 'i-castelhanos'],
        ['12:30', 'Peixe na brasa na Praia de Castelhanos', 'comida', 'pé na areia', 'i-peixe'],
      ],
      4: [
        ['10:00', 'Passeio de barco até a Ilha de Búzios', 'experiencia', 'snorkel', 'i-buzios'],
        ['19:30', 'Pastel no Mercado Municipal', 'comida', 'o melhor de camarão', 'i-pastel'],
      ],
      // inventado: o frame esconde os dias 5 a 8 atrás de "Ver dias 5 a 8".
      5: [['10:00', 'Praia do Jabaquara', 'parque', null]],
      6: [['09:00', 'Trilha da Água Branca', 'parque', null]],
      7: [['20:00', 'Jantar de despedida na Vila', 'restaurante', null]],
      8: [['10:30', 'Balsa de volta', 'transporte', null]],
    }),
    prep: prep([true, true, true, true, true]),
    memories: [
      memory(
        LANA,
        '2026-07-20',
        'A melhor semana do ano. Acordar com você e com o barulho do mar, sem despertador e sem tela de celular separando a gente. O jipe até Castelhanos quase me matou de medo, mas aquela praia vazia valeu tudo.',
      ),
      memory(
        GABRIEL,
        '2026-07-21',
        'Eu vou lembrar pra sempre de você cantando na balsa e do camarão na moranga que a gente dividiu porque tava caro demais pra pedir dois. Próxima: ver as baleias em setembro.',
      ),
    ],
    photos: ilhabelaPhotos,
  }),
  'ilhabela',
  COVER.ilhabela,
)

const paraty = withCover(
  trip({
    id: TRIP_IDS.paraty,
    title: 'Paraty, RJ',
    cityId: CITY.paraty.id,
    startsOn: '2026-09-11',
    endsOn: '2026-09-14',
    prep: prep([true, true, true, true, true]),
    memories: [
      memory(GABRIEL, '2026-09-16', 'Chuva no centro histórico e a gente correndo de pousada em pousada atrás de café.'), // inventado
      memory(LANA, '2026-09-17', 'O passeio de escuna com você dormindo no meu ombro. Volto mil vezes.'), // inventado
    ],
    photos: photos('paraty', { startsOn: '2026-09-11', endsOn: '2026-09-14' }, 123, [...TIMELINE_POOL, ...ILHABELA_POOL.slice(0, 5)]),
  }),
  'paraty',
  COVER.paraty,
)

// Lisboa · Detalhe futura (`f3yqz`) e herói da Grade.
const LISBOA_DATES = { startsOn: '2026-10-01', endsOn: '2026-10-09' }
const lisboa = withCover(
  trip({
    id: TRIP_IDS.lisboa,
    title: 'Lisboa, Portugal',
    cityId: CITY.lisboa.id,
    ...LISBOA_DATES,
    note: 'Outono europeu',
    lodging: {
      name: 'Apartamento com varanda em Alfama',
      address: 'Rua de São Miguel, 34 · Alfama, Lisboa',
      checkIn: '2026-10-01T15:00',
      checkOut: '2026-10-09T11:00',
      url: 'https://www.airbnb.com.br/rooms/48213377',
      code: 'HM4Q2',
      cents: 420000,
      paid: true,
    } satisfies Lodging,
    departures: departures(['GRU', null], ['POA', null]),
    days: [
      { day: '2026-10-01', title: 'Chegada em Alfama' },
      { day: '2026-10-02', title: 'Belém e miradouros' },
    ],
    itinerary: itinerary(LISBOA_DATES.startsOn, {
      1: [
        ['07:40', 'Pouso em Lisboa · TAP 082', 'voo', 'GRU → LIS'],
        ['15:00', 'Check-in no apê em Alfama', 'hospedagem', 'Rua de São Miguel'],
        ['20:00', 'Taberna da Rua das Flores', 'restaurante', 'reservar', 'i-taberna'],
      ],
      2: [
        ['10:00', 'Pastéis de Belém', 'comida', 'chegar cedo', 'i-belem'],
        ['11:30', 'Mosteiro dos Jerónimos', 'cidade', 'ingresso online', 'i-jeronimos'],
        ['18:30', 'Miradouro da Senhora do Monte', 'parque', 'pôr do sol', 'i-senhora-monte'],
      ],
    }),
    prep: prep(
      [true, true, true, false, false],
      ['TAP · GRU ⇄ LIS · comprado', 'Apê em Alfama · 8 noites', 'Passaportes válidos até 2031', 'Obrigatório na Europa', 'Lista compartilhada · 14 itens'],
    ),
    budget: budget([
      ['Passagens', 9800, 9800],
      ['Hospedagem', 4200, 4200],
      ['Comida', 2600, 0],
      ['Passeios', 1800, 0],
    ]),
  }),
  'lisboa',
  COVER.lisboaHero,
)

const gramado = withCover(
  trip({
    id: TRIP_IDS.gramado,
    title: 'Gramado, RS',
    cityId: CITY.gramado.id,
    startsOn: '2026-12-27',
    endsOn: '2026-12-31',
    note: 'Natal na Serra',
  }),
  'gramado',
  COVER.gramado,
)

const japao = withCover(
  trip({
    id: TRIP_IDS.japao,
    title: 'Japão',
    cityId: CITY.toquio.id,
    startsOn: '2027-04-10',
    endsOn: '2027-04-24',
    note: 'Tóquio, Kyoto, Osaka',
  }),
  'japao',
  COVER.japao,
)

/** Em ordem de `starts_on`, como `loadTrips` devolve. */
export const TRIPS: Trip[] = [cartagena, paraty2024, atacama, paraty2025, chapada, buenosAires, ilhabela, paraty, lisboa, gramado, japao]

export function eventOf(t: Pick<Trip, 'id' | 'title' | 'cityId' | 'startsOn' | 'endsOn' | 'note'>): CalendarEvent {
  return { ...tripEventDraft(t), id: t.id, createdBy: GABRIEL }
}

// ---------------------------------------------------------------------------
// Estadias: cada um em casa, os dois no destino nos dias de cada viagem, e a
// Lana em SJC de 20 a 30 set 2026 (hoje: "Juntos em SJC", como nos frames).
// ---------------------------------------------------------------------------

const COUPLE_STARTED = '2024-02-14'

function staysOf(profileId: string, home: string, away: { from: string; to: string; cityId: string }[]): Stay[] {
  const out: Stay[] = []
  let cursor = COUPLE_STARTED
  for (const a of [...away].sort((x, y) => (x.from < y.from ? -1 : 1))) {
    if (cursor < a.from) out.push({ id: nextId('stay'), profileId, cityId: home, startsOn: cursor, endsOn: addDays(a.from, -1) })
    out.push({ id: nextId('stay'), profileId, cityId: a.cityId, startsOn: a.from, endsOn: a.to })
    cursor = addDays(a.to, 1)
  }
  out.push({ id: nextId('stay'), profileId, cityId: home, startsOn: cursor, endsOn: null })
  return out
}

const tripAway = TRIPS.map((t) => ({ from: t.startsOn, to: t.endsOn, cityId: t.cityId }))

export const STAYS: Stay[] = [
  ...staysOf(GABRIEL, CITY.sjc.id, tripAway),
  ...staysOf(LANA, CITY.marau.id, [...tripAway, { from: '2026-09-20', to: '2026-09-30', cityId: CITY.sjc.id }]),
]

// ---------------------------------------------------------------------------
// O contexto (`loadSettings`): Gabriel vê.
// ---------------------------------------------------------------------------

const notify = Object.fromEntries(
  NOTIFY_EVENTS.flatMap((e) => NOTIFY_CHANNELS.map((c) => [notifyColumn(e, c), true])),
) as Record<NotifyColumn, boolean>

const asCity = (c: CalCity) => ({ id: c.id, name: c.name, stateCode: c.stateCode, lat: c.lat, lng: c.lng })

export function settingsSeed(stays: Stay[]): SettingsData {
  return {
    me: { profileId: GABRIEL, email: 'gabriel@preview.test' },
    couple: {
      id: COUPLE_ID,
      name: 'Gabriel & Lana',
      startedOn: COUPLE_STARTED,
      coverPath: null,
      createdAt: `${COUPLE_STARTED}T12:00:00Z`,
      members: [
        {
          profileId: GABRIEL,
          slot: 1,
          displayName: 'Gabriel',
          fullName: 'Gabriel Barbosa',
          avatarPath: null,
          color: '#7FD8C4',
          joinedAt: `${COUPLE_STARTED}T12:00:00Z`,
          homeCity: asCity(CITY.sjc),
          pending: false,
        },
        {
          profileId: LANA,
          slot: 2,
          displayName: 'Lana',
          fullName: 'Lana',
          avatarPath: null,
          color: '#F4A3B4',
          joinedAt: `${COUPLE_STARTED}T13:00:00Z`,
          homeCity: asCity(CITY.marau),
          pending: false,
        },
      ],
    },
    coupleSettings: {
      remindAnniversary: true,
      showHomeCounter: true,
      useCoupleCover: false,
      calendarDefaultView: 'month',
      weekStartsOn: 'sun',
      showAdjacentDays: true,
      showDayMarkers: true,
      colorTogetherHome1: '#7FD8C4',
      colorTogetherHome2: '#9CCBF2',
      colorTogetherAway: '#F6E3A1',
      colorApart: '#8E97BD',
      listDefaultSort: 'recent',
      showCategoryProgress: true,
      hiddenCategories: [],
      showDailySuggestion: true,
    },
    profileSettings: { notifyPartnerByDefault: true, notify },
    savedCities: [],
    stays,
  }
}
