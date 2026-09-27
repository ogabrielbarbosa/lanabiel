import { describe, expect, it } from 'vitest'
import type { CalCity, CityMap, MembersBySlot, NamesBySlot } from './calendar'
import type { GeoPlace, ListItem } from './list'
import { distanceKm } from './onboarding'
import {
  applyGridFilter,
  arrowRangeLabel,
  budgetSummary,
  checkTimeLabel,
  countryLabel,
  dateRangeLabel,
  dayOfTrip,
  daysSpanLabel,
  daysUntil,
  departuresLine,
  destinationLabel,
  doneHere,
  doneTrips,
  excerpt,
  firstTripYear,
  formatBRL,
  formatNumber,
  gridFilterOptions,
  heroTrip,
  inDaysLabel,
  inItineraryDay,
  itineraryCounts,
  itineraryPlan,
  itineraryReadiness,
  latestMemory,
  memoriesLabel,
  nearbyListItems,
  ongoingDay,
  oneYearAgo,
  originLabel,
  originOf,
  photosLabel,
  plannedAfterHero,
  plannedKicker,
  prepSummary,
  readiness,
  routeLabel,
  shortUrl,
  sortPhotos,
  sortTrips,
  statusLabel,
  suggestionsFor,
  timeline,
  tripCities,
  tripDateRange,
  tripDays,
  tripKm,
  tripRating,
  tripRecords,
  tripStatus,
  tripTotals,
  tripsKicker,
} from './tripDerive'
import type { PlanDay, PlanOpen } from './tripDerive'
import { EMPTY_LODGING } from './trips'
import type { ItineraryItem, PrepItem, Trip, TripMemory, TripPhoto } from './trips'

// Gabriel = slot 1, casa em SJC; Lana = slot 2, casa em Marau (como as
// fixtures do Calendário). Hoje = 2026-09-27.
const TODAY = '2026-09-27'
const G = 'u-gabriel'
const L = 'u-lana'

const city = (id: string, name: string, lat: number, lng: number, countryCode = 'BR', stateCode: string | null = null): CalCity => ({
  id,
  name,
  stateCode: countryCode === 'BR' ? stateCode : null,
  countryCode,
  region: null,
  lat,
  lng,
})
const SJC = city('c-sjc', 'São José dos Campos', -23.1896, -45.8841, 'BR', 'SP')
const MARAU = city('c-marau', 'Marau', -28.4498, -52.1999, 'BR', 'RS')
const ILHABELA = city('c-ilhabela', 'Ilhabela', -23.7781, -45.3581, 'BR', 'SP')
const FLORIPA = city('c-floripa', 'Florianópolis', -27.5954, -48.548, 'BR', 'SC')
const LISBOA = city('c-lisboa', 'Lisboa', 38.7223, -9.1393, 'PT')
const TOQUIO = city('c-toquio', 'Tóquio', 35.6762, 139.6503, 'JP')
const CITIES: CityMap = new Map([SJC, MARAU, ILHABELA, FLORIPA, LISBOA, TOQUIO].map((c) => [c.id, c]))

const MEMBERS: MembersBySlot = { 1: { profileId: G, homeCityId: SJC.id }, 2: { profileId: L, homeCityId: MARAU.id } }
const NAMES: NamesBySlot = { 1: 'Gabriel', 2: 'Lana' }

let seq = 0
function trip(partial: Partial<Trip> = {}): Trip {
  seq += 1
  return {
    id: `t-${String(seq).padStart(3, '0')}`,
    title: 'Viagem',
    cityId: ILHABELA.id,
    startsOn: '2026-07-12',
    endsOn: '2026-07-19',
    note: null,
    coverPhotoId: null,
    lodging: EMPTY_LODGING,
    departures: [],
    days: [],
    itinerary: [],
    prep: [],
    budget: [],
    memories: [],
    photos: [],
    ...partial,
  }
}

function it9(partial: Partial<ItineraryItem> & Pick<ItineraryItem, 'day'>): ItineraryItem {
  seq += 1
  return { id: `i-${seq}`, at: null, title: `Item ${seq}`, kind: 'outro', note: null, listItemId: null, position: 0, ...partial }
}

function prep(partial: Partial<PrepItem> & Pick<PrepItem, 'kind'>): PrepItem {
  seq += 1
  return { id: `p-${seq}`, label: partial.kind, detail: null, done: false, position: seq, ...partial }
}

const place = (c: CalCity, cityName = c.name): GeoPlace => ({
  address: null,
  city: cityName,
  state: null,
  country: 'Brasil',
  countryCode: c.countryCode,
  lat: c.lat,
  lng: c.lng,
})

function listItem(partial: Partial<ListItem> = {}): ListItem {
  seq += 1
  return {
    id: `li-${seq}`,
    category: 'restaurante',
    name: `Lugar ${seq}`,
    note: null,
    link: null,
    featured: false,
    place: place(ILHABELA),
    region: null,
    venue: null,
    highlights: [],
    platform: null,
    seasons: null,
    photoPath: null,
    status: 'want',
    rating: null,
    addedBy: G,
    createdAt: '2026-01-01T12:00:00Z',
    doneOn: null,
    doneWith: null,
    doneSoloBy: null,
    ...partial,
  }
}

const memory = (profileId: string, rating: number, writtenOn = '2026-07-20', body = 'Foi lindo.'): TripMemory => ({
  profileId,
  rating,
  body,
  writtenOn,
})

// ---------------------------------------------------------------------------

describe('tripStatus / tripDays (I4)', () => {
  const t = trip({ startsOn: '2026-09-27', endsOn: '2026-09-30' })

  it('começa hoje → em andamento, não planejada', () => {
    expect(tripStatus(t, '2026-09-26')).toBe('planned')
    expect(tripStatus(t, '2026-09-27')).toBe('ongoing')
  })

  it('termina hoje → ainda em andamento; no dia seguinte, feita', () => {
    expect(tripStatus(t, '2026-09-30')).toBe('ongoing')
    expect(tripStatus(t, '2026-10-01')).toBe('done')
  })

  it('dias contam a ida e a volta, inclusive atravessando o ano', () => {
    expect(tripDays(t)).toBe(4)
    expect(tripDays(trip({ startsOn: '2026-12-28', endsOn: '2027-01-03' }))).toBe(7)
    expect(tripDays(trip({ startsOn: '2026-10-05', endsOn: '2026-10-05' }))).toBe(1)
  })
})

describe('daysUntil / ongoingDay / dayOfTrip', () => {
  const t = trip({ startsOn: '2026-10-01', endsOn: '2026-10-09' })

  it('dias até a ida, atravessando o mês', () => {
    expect(daysUntil(t, TODAY)).toBe(4)
    expect(daysUntil(trip({ startsOn: '2027-01-08', endsOn: '2027-01-14' }), TODAY)).toBe(103)
  })

  it('dia k de N só em andamento', () => {
    expect(ongoingDay(t, TODAY)).toBeNull()
    expect(ongoingDay(t, '2026-10-01')).toEqual({ k: 1, n: 9 })
    expect(ongoingDay(t, '2026-10-09')).toEqual({ k: 9, n: 9 })
    expect(ongoingDay(t, '2026-10-10')).toBeNull()
  })

  it('dia da viagem, nulo fora', () => {
    expect(dayOfTrip(t, '2026-10-03')).toBe(3)
    expect(dayOfTrip(t, '2026-09-30')).toBeNull()
    expect(dayOfTrip(t, '2026-10-10')).toBeNull()
  })
})

describe('herói, planejadas e feitas (R5–R7)', () => {
  const past1 = trip({ id: 'past1', startsOn: '2025-07-12', endsOn: '2025-07-19' })
  const past2 = trip({ id: 'past2', startsOn: '2026-07-12', endsOn: '2026-07-19' })
  const next = trip({ id: 'next', startsOn: '2026-10-01', endsOn: '2026-10-09' })
  const later = trip({ id: 'later', startsOn: '2027-01-08', endsOn: '2027-01-14' })
  const all = [later, past1, next, past2]

  it('sortTrips: por ida', () => {
    expect(sortTrips(all).map((t) => t.id)).toEqual(['past1', 'past2', 'next', 'later'])
  })

  it('sem nada em andamento, o herói é a próxima planejada', () => {
    expect(heroTrip(all, TODAY)?.id).toBe('next')
    expect(plannedAfterHero(all, TODAY).map((t) => t.id)).toEqual(['later'])
  })

  it('em andamento ganha da planejada', () => {
    const now = trip({ id: 'now', startsOn: '2026-09-25', endsOn: '2026-09-28' })
    expect(heroTrip([...all, now], TODAY)?.id).toBe('now')
    expect(plannedAfterHero([...all, now], TODAY).map((t) => t.id)).toEqual(['next', 'later'])
  })

  it('sem futura nem em andamento → nulo', () => {
    expect(heroTrip([past1, past2], TODAY)).toBeNull()
    expect(heroTrip([], TODAY)).toBeNull()
  })

  it('feitas, da mais recente', () => {
    expect(doneTrips(all, TODAY).map((t) => t.id)).toEqual(['past2', 'past1'])
  })
})

describe('tripTotals / tripKm / kicker (I5, I8, R3)', () => {
  it('tripKm = 2 × distanceKm', () => {
    expect(tripKm(SJC, LISBOA)).toBe(2 * distanceKm(SJC, LISBOA))
    expect(tripKm(SJC, SJC)).toBe(0)
  })

  it('conta só as feitas; países e cidades distintos; km e dias somados', () => {
    const trips = [
      trip({ cityId: ILHABELA.id, startsOn: '2025-07-12', endsOn: '2025-07-19' }),
      trip({ cityId: ILHABELA.id, startsOn: '2026-07-12', endsOn: '2026-07-19' }),
      trip({ cityId: LISBOA.id, startsOn: '2026-04-01', endsOn: '2026-04-10' }),
      trip({ cityId: TOQUIO.id, startsOn: '2027-04-01', endsOn: '2027-04-10' }), // planejada
    ]
    expect(tripTotals(trips, CITIES, SJC, TODAY)).toEqual({
      trips: 3,
      countries: 2,
      cities: 2,
      km: 2 * tripKm(SJC, ILHABELA) + tripKm(SJC, LISBOA),
      days: 8 + 8 + 10,
    })
  })

  it('destino fora da leitura conta como cidade, não como país nem km', () => {
    const totals = tripTotals([trip({ cityId: 'c-sumiu', startsOn: '2025-01-01', endsOn: '2025-01-02' })], CITIES, SJC, TODAY)
    expect(totals).toEqual({ trips: 1, countries: 0, cities: 1, km: 0, days: 2 })
  })

  it('sem viagens: tudo zero, kicker "Nenhuma viagem ainda"', () => {
    expect(tripTotals([], CITIES, SJC, TODAY)).toEqual({ trips: 0, countries: 0, cities: 0, km: 0, days: 0 })
    expect(firstTripYear([])).toBeNull()
    expect(tripsKicker([])).toBe('Nenhuma viagem ainda')
  })

  it('kicker conta todas (feitas e planejadas) e o ano da primeira', () => {
    const trips = [trip({ startsOn: '2027-01-08', endsOn: '2027-01-10' }), trip({ startsOn: '2024-03-01', endsOn: '2024-03-05' })]
    expect(firstTripYear(trips)).toBe(2024)
    expect(tripsKicker(trips)).toBe('2 viagens juntos desde 2024')
    expect(tripsKicker([trips[0]])).toBe('1 viagem juntos desde 2027')
  })
})

describe('origem, rota e saídas (I8, R5)', () => {
  it('originLabel: o código quando preenchido, senão a casa abreviada', () => {
    expect(originLabel(undefined, 'São José dos Campos')).toBe('SJC')
    expect(originLabel({ profileId: L, originCode: null, note: null }, 'Marau')).toBe('Marau')
    expect(originLabel({ profileId: L, originCode: '  ', note: null }, 'Marau')).toBe('Marau')
    expect(originLabel({ profileId: L, originCode: 'POA', note: null }, 'Marau')).toBe('POA')
  })

  it('originOf e routeLabel, só ida e ida e volta', () => {
    const t = trip({ departures: [{ profileId: G, originCode: 'GRU', note: null }] })
    expect(originOf(t, G, SJC.name)).toBe('GRU')
    expect(originOf(t, L, MARAU.name)).toBe('Marau')
    expect(routeLabel('SJC', 'Ilhabela')).toBe('SJC → Ilhabela')
    expect(routeLabel('SJC', 'Ilhabela', true)).toBe('SJC → Ilhabela → SJC')
  })

  it('origens diferentes: "{A} sai de {X} · {B} sai de {Y}", na ordem dos slots', () => {
    expect(departuresLine(trip(), MEMBERS, NAMES, CITIES)).toBe('Gabriel sai de SJC · Lana sai de Marau')
  })

  it('mesma casa: "Gabriel e Lana · saindo de SJC"', () => {
    const together: MembersBySlot = { 1: MEMBERS[1], 2: { profileId: L, homeCityId: SJC.id } }
    expect(departuresLine(trip(), together, NAMES, CITIES)).toBe('Gabriel e Lana · saindo de SJC')
  })

  it('casas diferentes com o mesmo código de saída também juntam', () => {
    const t = trip({
      departures: [
        { profileId: G, originCode: 'GRU', note: null },
        { profileId: L, originCode: 'GRU', note: 'voo POA → GRU' },
      ],
    })
    expect(departuresLine(t, MEMBERS, NAMES, CITIES)).toBe('Gabriel e Lana · saindo de GRU')
  })
})

describe('tripRating (I6)', () => {
  it('sem memória → nulo', () => {
    expect(tripRating([], MEMBERS, NAMES)).toBeNull()
  })

  it('notas iguais → "os dois deram 5"', () => {
    expect(tripRating([memory(L, 5), memory(G, 5)], MEMBERS, NAMES)).toEqual({ hearts: 5, label: 'os dois deram 5' })
  })

  it('notas diferentes → ceil da média e os dois nomes na ordem dos slots', () => {
    expect(tripRating([memory(L, 5), memory(G, 4)], MEMBERS, NAMES)).toEqual({
      hearts: 5,
      label: 'Gabriel deu 4 · Lana deu 5',
    })
    expect(tripRating([memory(G, 1), memory(L, 2)], MEMBERS, NAMES)?.hearts).toBe(2)
  })

  it('uma só → "Lana deu 5"', () => {
    expect(tripRating([memory(L, 5)], MEMBERS, NAMES)).toEqual({ hearts: 5, label: 'Lana deu 5' })
  })

  it('latestMemory: a de writtenOn mais tardio', () => {
    expect(latestMemory([])).toBeNull()
    expect(latestMemory([memory(G, 4, '2026-07-20'), memory(L, 5, '2026-07-22')])?.profileId).toBe(L)
  })
})

describe('preparação e prontidão (I7)', () => {
  const base = { startsOn: '2026-10-01', endsOn: '2026-10-04' }

  it('prepSummary: marcados de todos', () => {
    expect(prepSummary(trip({ prep: [prep({ kind: 'passagens', done: true }), prep({ kind: 'malas' })] }))).toEqual({
      done: 1,
      total: 2,
    })
    expect(prepSummary(trip())).toEqual({ done: 0, total: 0 })
  })

  it('roteiro montado: floor dos dias com item; item fora das datas não conta', () => {
    const t = trip({
      ...base,
      itinerary: [it9({ day: '2026-10-01' }), it9({ day: '2026-10-01' }), it9({ day: '2026-10-03' }), it9({ day: '2026-10-09' })],
    })
    expect(itineraryReadiness(t)).toBe(50)
    const third = trip({ startsOn: '2026-10-01', endsOn: '2026-10-03', itinerary: [it9({ day: '2026-10-02' })] })
    expect(itineraryReadiness(third)).toBe(33)
  })

  it('readiness: primeiro item do tipo pela position, o detail como segunda linha, "a definir" sem item', () => {
    const t = trip({
      ...base,
      prep: [
        prep({ kind: 'passagens', done: false, detail: 'segunda passagem', position: 5 }),
        prep({ kind: 'passagens', done: true, detail: 'LATAM · GRU → LIS', position: 0 }),
      ],
      itinerary: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((day) => it9({ day })),
    })
    const r = readiness(t)
    expect(r.lines).toEqual([
      { key: 'passagens', label: 'Passagens', ready: true, detail: 'LATAM · GRU → LIS' },
      { key: 'hospedagem', label: 'Hospedagem', ready: false, detail: 'a definir' },
      { key: 'roteiro', label: 'Roteiro', ready: true, detail: '100% montado' },
    ])
    expect(r.readyCount).toBe(2)
  })

  it('roteiro abaixo de 100% não está pronto', () => {
    const r = readiness(trip({ ...base, itinerary: [it9({ day: '2026-10-01' })] }))
    expect(r.lines[2]).toMatchObject({ ready: false, detail: '25% montado' })
    expect(r.readyCount).toBe(0)
  })
})

describe('itineraryPlan (R17)', () => {
  const kinds = (blocks: (PlanDay | PlanOpen)[]) =>
    blocks.map((b) => (b.kind === 'day' ? `d${b.k}:${b.items.length}` : `open${b.dayFrom}-${b.dayTo}`))

  it('viagem sem itens: um bloco em aberto só, com as sugestões e os dias livres', () => {
    const s = [listItem(), listItem(), listItem(), listItem()]
    const plan = itineraryPlan(trip({ startsOn: '2027-01-08', endsOn: '2027-01-14' }), s)
    expect(plan.blocks).toHaveLength(1)
    expect(plan.blocks[0]).toMatchObject({
      kind: 'open',
      from: '2027-01-08',
      to: '2027-01-14',
      dayFrom: 1,
      dayTo: 7,
      freeDays: 7,
      rangeLabel: 'Sex, 8 → Qui, 14 jan',
    })
    expect((plan.blocks[0] as PlanOpen).suggestions).toEqual(s.slice(0, 3))
    expect(plan.firstEmptyDay).toBe('2027-01-08')
    expect(plan.moreLabel).toBeNull()
  })

  it('dias vazios no começo, meio (sozinho) e fim', () => {
    const t = trip({
      startsOn: '2026-10-01',
      endsOn: '2026-10-09',
      itinerary: [it9({ day: '2026-10-03' }), it9({ day: '2026-10-05' }), it9({ day: '2026-10-06' })],
    })
    const plan = itineraryPlan(t, [listItem()])
    expect(kinds(plan.blocks)).toEqual(['open1-2', 'd3:1', 'd4:0', 'd5:1', 'd6:1', 'open7-9'])
    const [first, , , , , last] = plan.blocks as PlanOpen[]
    expect(first.suggestions).toHaveLength(1)
    expect(last.suggestions).toEqual([]) // sugestões só no primeiro bloco em aberto
    expect(last.rangeLabel).toBe('Qua, 7 → Sex, 9 out')
    expect(plan.firstEmptyDay).toBe('2026-10-01')
  })

  it('um dia vazio sozinho no começo é dia normal', () => {
    const t = trip({ startsOn: '2026-10-01', endsOn: '2026-10-03', itinerary: [it9({ day: '2026-10-02' }), it9({ day: '2026-10-03' })] })
    const plan = itineraryPlan(t, [])
    expect(kinds(plan.blocks)).toEqual(['d1:0', 'd2:1', 'd3:1'])
    expect(plan.blocks[0]).toMatchObject({ dateLabel: 'Qui, 1 out', title: null })
  })

  it('bloco em aberto atravessando o mês', () => {
    const t = trip({ startsOn: '2026-10-30', endsOn: '2026-11-02' })
    expect((itineraryPlan(t, []).blocks[0] as PlanOpen).rangeLabel).toBe('Sex, 30 out → Seg, 2 nov')
  })

  it('itens do dia por hora, sem hora no fim, depois position; título do dia', () => {
    const t = trip({
      startsOn: '2026-07-12',
      endsOn: '2026-07-12',
      days: [{ day: '2026-07-12', title: 'Chegada' }],
      itinerary: [
        it9({ id: 'semhora-b', day: '2026-07-12', position: 2 }),
        it9({ id: 'noite', day: '2026-07-12', at: '20:00' }),
        it9({ id: 'semhora-a', day: '2026-07-12', position: 1 }),
        it9({ id: 'manha', day: '2026-07-12', at: '09:30' }),
      ],
    })
    const day = itineraryPlan(t, []).blocks[0] as PlanDay
    expect(day.title).toBe('Chegada')
    expect(day.items.map((i) => i.id)).toEqual(['manha', 'noite', 'semhora-a', 'semhora-b'])
  })

  it('item fora das datas vai para o grupo final, não para um dia', () => {
    const t = trip({
      startsOn: '2026-10-01',
      endsOn: '2026-10-02',
      itinerary: [it9({ id: 'depois', day: '2026-10-05' }), it9({ id: 'antes', day: '2026-09-28' }), it9({ id: 'ok', day: '2026-10-01' })],
    })
    const plan = itineraryPlan(t, [])
    expect(plan.outside.map((i) => i.id)).toEqual(['antes', 'depois'])
    expect(kinds(plan.blocks)).toEqual(['d1:1', 'd2:0'])
    expect(plan.firstEmptyDay).toBe('2026-10-02')
  })

  it('com mais de 4 dias com itens, mostra até o 4º e "Ver dias {5} a {N}"; expandido mostra tudo', () => {
    const days = ['2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17']
    const t = trip({ startsOn: '2026-07-12', endsOn: '2026-07-19', itinerary: days.map((day) => it9({ day })) })
    const plan = itineraryPlan(t, [])
    expect(kinds(plan.visible)).toEqual(['d1:1', 'd2:1', 'd3:1', 'd4:1'])
    expect(plan.moreLabel).toBe('Ver dias 5 a 8')
    const open = itineraryPlan(t, [], { expanded: true })
    expect(kinds(open.visible)).toEqual(['d1:1', 'd2:1', 'd3:1', 'd4:1', 'd5:1', 'd6:1', 'open7-8'])
    expect(open.moreLabel).toBeNull()
  })

  it('o colapso conta dias COM ITENS: vazios entre eles aparecem', () => {
    const t = trip({
      startsOn: '2026-07-01',
      endsOn: '2026-07-10',
      itinerary: ['2026-07-01', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-09'].map((day) => it9({ day })),
    })
    const plan = itineraryPlan(t, [])
    expect(kinds(plan.visible)).toEqual(['d1:1', 'open2-3', 'd4:1', 'd5:1', 'd6:1'])
    // O que vem depois do 4º dia com itens — o bloco 7–8 e o dia 9 — se esconde.
    expect(plan.moreLabel).toBe('Ver dias 7 a 10')
    expect(kinds(plan.blocks.slice(plan.visible.length))).toEqual(['open7-8', 'd9:1', 'd10:0'])
  })

  it('exatamente 4 dias com itens: nada escondido', () => {
    const t = trip({
      startsOn: '2026-07-12',
      endsOn: '2026-07-15',
      itinerary: ['2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15'].map((day) => it9({ day })),
    })
    expect(itineraryPlan(t, []).moreLabel).toBeNull()
  })

  it('itineraryCounts: itens e vinculados à Lista', () => {
    const t = trip({ itinerary: [it9({ day: '2026-07-12', listItemId: 'x' }), it9({ day: '2026-07-13' })] })
    expect(itineraryCounts(t)).toEqual({ items: 2, fromList: 1 })
  })
})

describe('a Lista e a viagem (R16, R18, I9)', () => {
  const perto = listItem({ id: 'perto', place: place(ILHABELA, 'Ilhabela') })
  const vizinho = listItem({ id: 'vizinho', place: { ...place(ILHABELA, 'São Sebastião'), lat: -23.76, lng: -45.41 } })
  const longe = listItem({ id: 'longe', place: place(LISBOA) })
  const feito = listItem({ id: 'feito', status: 'done', doneOn: '2026-07-14', place: place(ILHABELA, 'ilhabela') })
  const midia = listItem({ id: 'midia', category: 'filme', place: null, platform: 'Netflix' })
  const all = [longe, perto, vizinho, feito, midia]

  it('nearbyListItems: a fazer, a ≤ 30 km, do mais perto; sem destino, nenhum', () => {
    expect(nearbyListItems(ILHABELA, all).map((i) => i.id)).toEqual(['perto', 'vizinho'])
    expect(nearbyListItems(undefined, all)).toEqual([])
  })

  it('suggestionsFor: perto e fora do roteiro, até 3', () => {
    const t = trip({ itinerary: [it9({ day: '2026-07-12', listItemId: 'perto' })] })
    expect(suggestionsFor(t, ILHABELA, all).map((i) => i.id)).toEqual(['vizinho'])
    const many = Array.from({ length: 5 }, () => listItem())
    expect(suggestionsFor(trip(), ILHABELA, many)).toHaveLength(3)
  })

  it('doneHere: vinculados com status feito, sem repetição, na ordem do roteiro', () => {
    const outroFeito = listItem({ id: 'outro-feito', status: 'done' })
    const t = trip({
      itinerary: [
        it9({ day: '2026-07-14', listItemId: 'feito' }),
        it9({ day: '2026-07-13', listItemId: 'outro-feito' }),
        it9({ day: '2026-07-15', listItemId: 'feito' }),
        it9({ day: '2026-07-12', listItemId: 'perto' }),
      ],
    })
    expect(doneHere(t, [...all, outroFeito]).map((i) => i.id)).toEqual(['outro-feito', 'feito'])
  })

  it('inItineraryDay: k do primeiro dia vinculado; fora das datas ou fora do roteiro → nulo', () => {
    const t = trip({
      startsOn: '2026-07-12',
      endsOn: '2026-07-19',
      itinerary: [
        it9({ day: '2026-07-15', listItemId: 'perto' }),
        it9({ day: '2026-07-13', listItemId: 'perto' }),
        it9({ day: '2026-07-25', listItemId: 'vizinho' }),
      ],
    })
    expect(inItineraryDay(t, 'perto')).toBe(2)
    expect(inItineraryDay(t, 'vizinho')).toBeNull()
    expect(inItineraryDay(t, 'longe')).toBeNull()
  })

  it('tripCities: o destino, depois as cidades dos vinculados, sem repetir sem acento e sem caixa', () => {
    const t = trip({
      itinerary: [
        it9({ day: '2026-07-12', listItemId: 'feito' }), // "ilhabela" = destino
        it9({ day: '2026-07-13', listItemId: 'vizinho' }),
        it9({ day: '2026-07-14', listItemId: 'midia' }), // sem lugar
        it9({ day: '2026-07-15', listItemId: 'sumiu' }), // fora da leitura
      ],
    })
    const saoSebastiao2 = listItem({ id: 'ss2', place: place(ILHABELA, 'Sao Sebastiao') })
    const t2 = { ...t, itinerary: [...t.itinerary, it9({ day: '2026-07-16', listItemId: 'ss2' })] }
    expect(tripCities(t2, ILHABELA, [...all, saoSebastiao2])).toEqual(['Ilhabela', 'São Sebastião'])
    expect(tripCities(trip(), undefined, all)).toEqual([])
  })
})

describe('tripRecords (R12)', () => {
  it('só feitas: mais longa, mais distante (só ida, da casa), destino mais repetido', () => {
    const a = trip({ id: 'a', cityId: ILHABELA.id, startsOn: '2025-07-12', endsOn: '2025-07-19' })
    const b = trip({ id: 'b', cityId: LISBOA.id, startsOn: '2026-04-01', endsOn: '2026-04-15' })
    const c = trip({ id: 'c', cityId: ILHABELA.id, startsOn: '2026-07-12', endsOn: '2026-07-19' })
    const futura = trip({ id: 'f', cityId: TOQUIO.id, startsOn: '2027-04-01', endsOn: '2027-05-30' })
    const r = tripRecords([a, b, c, futura], CITIES, SJC, TODAY)
    expect(r.longest).toEqual({ trip: b, days: 15 })
    expect(r.farthest).toEqual({ trip: b, km: distanceKm(SJC, LISBOA) })
    expect(r.mostRepeated).toEqual({ cityId: ILHABELA.id, city: ILHABELA, count: 2 })
  })

  it('nenhum destino repetido → mostRepeated nulo; sem feitas → tudo nulo', () => {
    const a = trip({ cityId: ILHABELA.id, startsOn: '2025-07-12', endsOn: '2025-07-19' })
    const b = trip({ cityId: LISBOA.id, startsOn: '2026-04-01', endsOn: '2026-04-05' })
    expect(tripRecords([a, b], CITIES, SJC, TODAY).mostRepeated).toBeNull()
    expect(tripRecords([], CITIES, SJC, TODAY)).toEqual({ longest: null, farthest: null, mostRepeated: null })
  })

  it('empates → a mais recente', () => {
    const old = trip({ id: 'old', cityId: ILHABELA.id, startsOn: '2024-01-01', endsOn: '2024-01-05' })
    const recent = trip({ id: 'recent', cityId: ILHABELA.id, startsOn: '2025-01-01', endsOn: '2025-01-05' })
    const oldF = trip({ id: 'oldF', cityId: FLORIPA.id, startsOn: '2023-01-01', endsOn: '2023-01-02' })
    const newF = trip({ id: 'newF', cityId: FLORIPA.id, startsOn: '2026-01-01', endsOn: '2026-01-02' })
    const r = tripRecords([old, recent], CITIES, SJC, TODAY)
    expect(r.longest?.trip.id).toBe('recent')
    expect(r.farthest?.trip.id).toBe('recent')
    // Ilhabela e Floripa, 2 vezes cada: a de viagem mais recente (Floripa, 2026).
    expect(tripRecords([old, recent, oldF, newF], CITIES, SJC, TODAY).mostRepeated?.cityId).toBe(FLORIPA.id)
  })
})

describe('oneYearAgo / excerpt (R13)', () => {
  it('a feita que contém hoje − 1 ano', () => {
    const t = trip({ id: 'x', startsOn: '2025-09-20', endsOn: '2025-09-30' })
    expect(oneYearAgo([t, trip({ startsOn: '2025-10-01', endsOn: '2025-10-02' })], TODAY)?.id).toBe('x')
  })

  it('senão a de ida mais perto, até 30 dias para qualquer lado', () => {
    const before = trip({ id: 'before', startsOn: '2025-09-07', endsOn: '2025-09-10' }) // 20 dias antes
    const after = trip({ id: 'after', startsOn: '2025-10-12', endsOn: '2025-10-14' }) // 15 dias depois
    expect(oneYearAgo([before, after], TODAY)?.id).toBe('after')
    expect(oneYearAgo([trip({ startsOn: '2025-10-27', endsOn: '2025-10-30' })], TODAY)?.startsOn).toBe('2025-10-27') // 30 dias
  })

  it('mais de 30 dias → nulo; em andamento não conta', () => {
    expect(oneYearAgo([trip({ startsOn: '2025-10-28', endsOn: '2025-10-30' })], TODAY)).toBeNull() // 31 dias
    // 366 dias, ainda em andamento hoje, contém hoje − 1 ano: não é feita.
    expect(oneYearAgo([trip({ startsOn: '2025-09-27', endsOn: '2026-09-27' })], TODAY)).toBeNull()
  })

  it('excerpt: 140 letras e reticências; curto fica inteiro', () => {
    expect(excerpt('  curto  ')).toBe('curto')
    const long = 'a'.repeat(139) + ' bcdef'
    expect(excerpt(long)).toBe(`${'a'.repeat(139)}…`)
    expect(excerpt('😀'.repeat(141))).toBe(`${'😀'.repeat(140)}…`)
  })
})

describe('timeline (R8)', () => {
  it('da mais futura para a mais antiga, com o "Hoje" entre futuras e passadas', () => {
    const past = trip({ id: 'past', startsOn: '2026-07-12', endsOn: '2026-07-19' })
    const now = trip({ id: 'now', startsOn: '2026-09-25', endsOn: '2026-09-28' })
    const next = trip({ id: 'next', startsOn: '2026-10-01', endsOn: '2026-10-09' })
    const far = trip({ id: 'far', startsOn: '2027-01-08', endsOn: '2027-01-14' })
    const tl = timeline([past, next, far, now], TODAY)
    expect(tl.entries.map((e) => e.trip.id)).toEqual(['far', 'next', 'now', 'past'])
    expect(tl.todayIndex).toBe(3)
    expect(tl.todayLabel).toBe('Hoje · 27 set')
    expect(tl.entries.find((e) => e.isHero)?.trip.id).toBe('now')
    expect(tl.entries[0]).toMatchObject({ month: 'jan', year: '2027', status: 'planned' })
  })

  it('só passadas: Hoje no topo; só futuras: no fim', () => {
    expect(timeline([trip({ startsOn: '2025-01-01', endsOn: '2025-01-02' })], TODAY).todayIndex).toBe(0)
    expect(timeline([trip({ startsOn: '2027-01-01', endsOn: '2027-01-02' })], TODAY).todayIndex).toBe(1)
  })
})

describe('filtros de "Já fizemos" (R7)', () => {
  const a = trip({ id: 'a', cityId: ILHABELA.id, startsOn: '2025-07-12', endsOn: '2025-07-19' })
  const b = trip({ id: 'b', cityId: LISBOA.id, startsOn: '2026-04-01', endsOn: '2026-04-15' })
  const c = trip({ id: 'c', cityId: FLORIPA.id, startsOn: '2026-01-02', endsOn: '2026-01-05' })
  const done = [b, c, a]

  it('Todas, anos do mais recente, Brasil, Exterior', () => {
    expect(gridFilterOptions(done, CITIES).map((o) => [o.id, o.label])).toEqual([
      ['all', 'Todas'],
      ['y2026', '2026'],
      ['y2025', '2025'],
      ['br', 'Brasil'],
      ['abroad', 'Exterior'],
    ])
  })

  it('só os que têm viagem: sem exterior, o chip some', () => {
    expect(gridFilterOptions([a, c], CITIES).map((o) => o.id)).toEqual(['all', 'y2026', 'y2025', 'br'])
    expect(gridFilterOptions([], CITIES).map((o) => o.id)).toEqual(['all'])
  })

  it('applyGridFilter', () => {
    const ids = (f: Parameters<typeof applyGridFilter>[1]) => applyGridFilter(done, f, CITIES).map((t) => t.id)
    expect(ids({ kind: 'all' })).toEqual(['b', 'c', 'a'])
    expect(ids({ kind: 'year', year: 2026 })).toEqual(['b', 'c'])
    expect(ids({ kind: 'br' })).toEqual(['c', 'a'])
    expect(ids({ kind: 'abroad' })).toEqual(['b'])
    expect(ids({ kind: 'year', year: 2019 })).toEqual([])
  })
})

describe('rótulos', () => {
  it('dateRangeLabel: mesmo mês, meses diferentes, atravessando o ano, um dia', () => {
    expect(dateRangeLabel('2026-10-01', '2026-10-09', { year: true })).toBe('1–9 out 2026')
    expect(dateRangeLabel('2026-12-27', '2026-12-31', { year: true })).toBe('27–31 dez 2026')
    expect(dateRangeLabel('2026-12-28', '2027-01-03', { year: true })).toBe('28 dez – 3 jan 2027')
    expect(dateRangeLabel('2026-09-27', '2026-10-03', { year: false })).toBe('27 set – 3 out')
    expect(dateRangeLabel('2026-10-05', '2026-10-05', { year: true })).toBe('5 out 2026')
    expect(tripDateRange(trip({ startsOn: '2026-07-12', endsOn: '2026-07-19' }), { year: false })).toBe('12–19 jul')
  })

  it('daysSpanLabel e arrowRangeLabel', () => {
    expect(daysSpanLabel('2026-07-12', '2026-07-19')).toBe('12 a 19 jul')
    expect(daysSpanLabel('2026-12-28', '2027-01-03')).toBe('28 dez a 3 jan')
    expect(arrowRangeLabel('2027-01-08', '2027-01-14')).toBe('8 → 14 jan')
    expect(arrowRangeLabel('2026-12-28', '2027-01-03')).toBe('28 dez → 3 jan')
  })

  it('countryLabel e destinationLabel (I10)', () => {
    expect(countryLabel('BR')).toBe('Brasil')
    expect(countryLabel('PT')).toBe('Portugal')
    expect(countryLabel('jp')).toBe('Japão')
    expect(destinationLabel(ILHABELA)).toBe('Ilhabela, SP')
    expect(destinationLabel(LISBOA)).toBe('Lisboa, Portugal')
  })

  it('formatBRL: sem centavos quando inteiro', () => {
    expect(formatBRL(1_840_000)).toBe('R$ 18.400')
    expect(formatBRL(920_000)).toBe('R$ 9.200')
    expect(formatBRL(1_840_050)).toBe('R$ 18.400,50')
    expect(formatBRL(0)).toBe('R$ 0')
    expect(formatBRL(5)).toBe('R$ 0,05')
  })

  it('plurais e números', () => {
    expect(photosLabel(1)).toBe('1 foto')
    expect(photosLabel(40)).toBe('40 fotos')
    expect(memoriesLabel(1)).toBe('1 memória')
    expect(memoriesLabel(2)).toBe('2 memórias')
    expect(memoriesLabel(0)).toBe('0 memórias')
    expect(inDaysLabel(103)).toBe('em 103 dias')
    expect(inDaysLabel(1)).toBe('em 1 dia')
    expect(formatNumber(18420)).toBe('18.420')
  })

  it('checkTimeLabel e shortUrl (R20d)', () => {
    expect(checkTimeLabel('2026-10-02T15:00')).toBe('sex 2 out, 15h')
    expect(checkTimeLabel('2026-10-03T11:30')).toBe('sáb 3 out, 11h30')
    expect(checkTimeLabel('2026-10-03')).toBe('sáb 3 out')
    expect(shortUrl('https://www.airbnb.com.br/rooms/123?x=1')).toBe('airbnb.com.br')
    expect(shortUrl('booking')).toBe('booking')
  })

  it('plannedKicker e statusLabel (R6, R15)', () => {
    expect(plannedKicker(trip({ note: 'Férias de verão' }))).toBe('Planejada · Férias de verão')
    expect(plannedKicker(trip({ note: '  ' }))).toBe('Planejada')
    const next = trip({ startsOn: '2026-10-01', endsOn: '2026-10-09' })
    expect(statusLabel(next, TODAY, { isHero: true, countryCode: 'PT' })).toBe('Próxima viagem · em 4 dias')
    expect(statusLabel(next, TODAY, { isHero: false, countryCode: 'PT' })).toBe('Planejada · em 4 dias')
    expect(statusLabel(next, '2026-10-03', { isHero: true, countryCode: 'PT' })).toBe('Viajando agora · dia 3 de 9')
    expect(statusLabel(next, '2026-11-01', { isHero: false, countryCode: 'PT' })).toBe('Já fomos · Portugal')
    expect(statusLabel(next, '2026-11-01', { isHero: false, countryCode: 'BR' })).toBe('Já fomos · Brasil')
  })
})

describe('fotos e orçamento', () => {
  const photo = (id: string, takenOn: string | null, createdAt: string): TripPhoto => ({
    id,
    path: `c/trip/${id}.webp`,
    takenOn,
    caption: null,
    favorite: false,
    addedBy: G,
    createdAt,
  })

  it('sortPhotos: por takenOn (nulos no fim), depois createdAt', () => {
    const sorted = sortPhotos([
      photo('sem-data', null, '2026-07-01T00:00:00Z'),
      photo('dia14-b', '2026-07-14', '2026-07-20T10:00:00Z'),
      photo('dia12', '2026-07-12', '2026-07-20T12:00:00Z'),
      photo('dia14-a', '2026-07-14', '2026-07-20T09:00:00Z'),
    ])
    expect(sorted.map((p) => p.id)).toEqual(['dia12', 'dia14-a', 'dia14-b', 'sem-data'])
  })

  it('budgetSummary: total, por pessoa, gasto e fração de cada linha', () => {
    const t = trip({
      budget: [
        { id: 'b2', label: 'Hospedagem', plannedCents: 600_000, spentCents: 0, position: 1 },
        { id: 'b1', label: 'Passagens', plannedCents: 980_000, spentCents: 980_000, position: 0 },
        { id: 'b3', label: 'Comida', plannedCents: 260_001, spentCents: 12_000, position: 2 },
      ],
    })
    const b = budgetSummary(t)
    expect(b.totalCents).toBe(1_840_001)
    expect(b.perPersonCents).toBe(920_001) // 920.000,5 arredonda
    expect(b.spentCents).toBe(992_000)
    expect(b.lines.map((l) => l.label)).toEqual(['Passagens', 'Hospedagem', 'Comida'])
    expect(b.lines[0].fraction).toBeCloseTo(980_000 / 1_840_001)
  })

  it('sem linhas: total zero e fração zero', () => {
    expect(budgetSummary(trip())).toEqual({ totalCents: 0, perPersonCents: 0, spentCents: 0, lines: [] })
  })
})
