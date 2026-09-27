// As derivações das Viagens: estado, números, recordes, roteiro, rótulos e a
// projeção do mapa. Tudo o que as telas mostram com dado sai daqui.
//
// Spec: .agent/Tasks/fase-6-viagens.md, seções 3 (R3–R24) e 4 (I4–I10)
// ADR:  .agent/Decisions/0019-viagem-e-o-evento-estendido-por-trips.md
//       .agent/Decisions/0021-mapas-das-viagens-sem-engine.md
//
// Puro: sem Supabase, sem `Date` fora de `lib/date.ts`. Datas são ISO
// `YYYY-MM-DD` comparadas como string; intervalos são inclusivos nas duas pontas.
// Nada aqui é gravado: o estado de uma viagem é sempre derivado de hoje (I4).

import {
  addYears,
  daysInclusive,
  diffDays,
  addDays,
  shortDayMonth,
  shortMonth,
  weekdayShortDayMonth,
  weekdayShortLower,
} from '../lib/date'
import { shortCityName } from './calendar'
import type { CalCity, CityMap, MembersBySlot, NamesBySlot, Slot } from './calendar'
import { NEARBY_RADIUS_KM, nearby, normalizeSearch } from './list'
import type { ListItem } from './list'
import { distanceKm } from './onboarding'
import type { LatLng } from './onboarding'
import type { ItineraryItem, PrepItem, PrepKind, Trip, TripDeparture, TripMemory, TripPhoto, TripStatus } from './trips'

const SLOTS: readonly Slot[] = [1, 2]

// ---------------------------------------------------------------------------
// Estado e duração (I4)
// ---------------------------------------------------------------------------

/** I4: `planned` antes de começar, `ongoing` de `startsOn` a `endsOn` (inclusivo), `done` depois. */
export function tripStatus(trip: Pick<Trip, 'startsOn' | 'endsOn'>, today: string): TripStatus {
  if (trip.startsOn > today) return 'planned'
  if (trip.endsOn < today) return 'done'
  return 'ongoing'
}

/** Dias da viagem, contando a ida e a volta. */
export function tripDays(trip: Pick<Trip, 'startsOn' | 'endsOn'>): number {
  return daysInclusive(trip.startsOn, trip.endsOn)
}

/** "em {n} dias": quantos dias faltam para a ida (0 no dia, negativo depois). */
export function daysUntil(trip: Pick<Trip, 'startsOn'>, today: string): number {
  return diffDays(today, trip.startsOn)
}

/** "dia {k} de {N}" de uma viagem em andamento; `null` fora dela. */
export function ongoingDay(trip: Pick<Trip, 'startsOn' | 'endsOn'>, today: string): { k: number; n: number } | null {
  if (tripStatus(trip, today) !== 'ongoing') return null
  return { k: diffDays(trip.startsOn, today) + 1, n: tripDays(trip) }
}

/** O k (1-based) de um dia dentro da viagem; `null` fora das datas. */
export function dayOfTrip(trip: Pick<Trip, 'startsOn' | 'endsOn'>, day: string): number | null {
  if (day < trip.startsOn || day > trip.endsOn) return null
  return diffDays(trip.startsOn, day) + 1
}

// ---------------------------------------------------------------------------
// Ordem, herói, planejadas e feitas (R5–R7)
// ---------------------------------------------------------------------------

const byDateAsc = (a: Trip, b: Trip): number =>
  a.startsOn.localeCompare(b.startsOn) || a.endsOn.localeCompare(b.endsOn) || a.id.localeCompare(b.id)

/** Por data de ida, da mais antiga para a mais futura (desempate: volta, depois id — ordem estável). */
export function sortTrips(trips: readonly Trip[]): Trip[] {
  return [...trips].sort(byDateAsc)
}

/**
 * R5: a viagem em andamento, senão a próxima planejada. Duas em andamento ao
 * mesmo tempo (datas sobrepostas) → a que começou primeiro.
 */
export function heroTrip(trips: readonly Trip[], today: string): Trip | null {
  const sorted = sortTrips(trips)
  return (
    sorted.find((t) => tripStatus(t, today) === 'ongoing') ??
    sorted.find((t) => tripStatus(t, today) === 'planned') ??
    null
  )
}

/** R6: as planejadas sem a do herói, em ordem de data. */
export function plannedAfterHero(trips: readonly Trip[], today: string): Trip[] {
  const hero = heroTrip(trips, today)
  return sortTrips(trips).filter((t) => tripStatus(t, today) === 'planned' && t.id !== hero?.id)
}

/** R7: as feitas, da mais recente para a mais antiga. */
export function doneTrips(trips: readonly Trip[], today: string): Trip[] {
  return sortTrips(trips)
    .filter((t) => tripStatus(t, today) === 'done')
    .reverse()
}

// ---------------------------------------------------------------------------
// Números do casal (I5, R3, R4)
// ---------------------------------------------------------------------------

/** I8: ida e volta em linha reta, da casa de quem vê. */
export function tripKm(home: LatLng, dest: LatLng): number {
  return 2 * distanceKm(home, dest)
}

export interface TripTotals {
  trips: number
  countries: number
  cities: number
  km: number
  days: number
}

/**
 * I5, só as feitas. Destino que não veio na leitura de cidades conta em
 * `cities` (é um `city_id` distinto) mas não em `countries` nem em `km` — sem a
 * cidade não há país nem coordenada, e inventar seria pior que omitir.
 */
export function tripTotals(trips: readonly Trip[], cities: CityMap, home: LatLng, today: string): TripTotals {
  const done = trips.filter((t) => tripStatus(t, today) === 'done')
  const countries = new Set<string>()
  let km = 0
  for (const t of done) {
    const dest = cities.get(t.cityId)
    if (!dest) continue
    countries.add(dest.countryCode)
    km += tripKm(home, dest)
  }
  return {
    trips: done.length,
    countries: countries.size,
    cities: new Set(done.map((t) => t.cityId)).size,
    km,
    days: done.reduce((sum, t) => sum + tripDays(t), 0),
  }
}

/** O ano da primeira viagem (feita ou planejada); `null` sem viagens. */
export function firstTripYear(trips: readonly Trip[]): number | null {
  if (trips.length === 0) return null
  return Number(sortTrips(trips)[0].startsOn.slice(0, 4))
}

/** R3: "14 viagens juntos desde 2024" (todas as viagens) · "Nenhuma viagem ainda". */
export function tripsKicker(trips: readonly Trip[]): string {
  const year = firstTripYear(trips)
  if (year === null) return 'Nenhuma viagem ainda'
  return `${plural(trips.length, 'viagem', 'viagens')} juntos desde ${year}`
}

// ---------------------------------------------------------------------------
// Origem, rota e saídas (I8, R5, R16)
// ---------------------------------------------------------------------------

/** I8: o `originCode` da saída quando preenchido, senão a casa abreviada ("SJC", "Marau"). */
export function originLabel(departure: TripDeparture | undefined, homeCityName: string): string {
  const code = departure?.originCode?.trim()
  return code ? code : shortCityName(homeCityName)
}

/** A origem de uma pessoa nesta viagem: a saída dela, senão a casa. */
export function originOf(trip: Pick<Trip, 'departures'>, profileId: string, homeCityName: string): string {
  return originLabel(
    trip.departures.find((d) => d.profileId === profileId),
    homeCityName,
  )
}

/** R5/R16: "SJC → Ilhabela" e, ida e volta, "SJC → Ilhabela → SJC". */
export function routeLabel(origin: string, destination: string, roundTrip = false): string {
  return roundTrip ? `${origin} → ${destination} → ${origin}` : `${origin} → ${destination}`
}

/**
 * R5, sem o ♥ (é ícone na tela). Compara as ORIGENS já resolvidas, não as
 * casas: duas casas diferentes com o mesmo `originCode` ("GRU") dizem
 * "Gabriel e Lana · saindo de GRU", e a mesma casa com códigos diferentes diz
 * cada um. Ordem dos slots.
 */
export function departuresLine(
  trip: Pick<Trip, 'departures'>,
  members: MembersBySlot,
  names: NamesBySlot,
  cities: CityMap,
): string {
  const origin = (slot: Slot): string =>
    originOf(trip, members[slot].profileId, cities.get(members[slot].homeCityId)?.name ?? '?')
  const [o1, o2] = [origin(1), origin(2)]
  if (o1 === o2) return `${names[1]} e ${names[2]} · saindo de ${o1}`
  return `${names[1]} sai de ${o1} · ${names[2]} sai de ${o2}`
}

// ---------------------------------------------------------------------------
// Nota da viagem (I6)
// ---------------------------------------------------------------------------

export interface TripRating {
  /** 1–5, `ceil` da média. */
  hearts: number
  /** "os dois deram 5" · "Gabriel deu 4 · Lana deu 5" · "Lana deu 5". */
  label: string
}

/**
 * I6. Só contam memórias de quem é integrante (o banco já garante; aqui é para
 * o rótulo ter um nome para cada nota). Sem memória → `null` (corações
 * apagados e "sem nota ainda", R15).
 */
export function tripRating(memories: readonly TripMemory[], members: MembersBySlot, names: NamesBySlot): TripRating | null {
  const rated = SLOTS.flatMap((slot) => {
    const m = memories.find((x) => x.profileId === members[slot].profileId)
    return m ? [{ slot, rating: m.rating }] : []
  })
  if (rated.length === 0) return null
  const hearts = Math.ceil(rated.reduce((s, r) => s + r.rating, 0) / rated.length)
  if (rated.length === 2 && rated[0].rating === rated[1].rating) return { hearts, label: `os dois deram ${rated[0].rating}` }
  return { hearts, label: rated.map((r) => `${names[r.slot]} deu ${r.rating}`).join(' · ') }
}

/** A memória escrita por último (R13); empate em `writtenOn` → a que vem primeiro na lista. */
export function latestMemory(memories: readonly TripMemory[]): TripMemory | null {
  let best: TripMemory | null = null
  for (const m of memories) if (best === null || m.writtenOn > best.writtenOn) best = m
  return best
}

// ---------------------------------------------------------------------------
// Preparação e prontidão (I7, R5, R15)
// ---------------------------------------------------------------------------

/** "{p} de {n}": marcados / todos. */
export function prepSummary(trip: Pick<Trip, 'prep'>): { done: number; total: number } {
  return { done: trip.prep.filter((p) => p.done).length, total: trip.prep.length }
}

/** Os dias da viagem, em ordem. */
export function tripDates(trip: Pick<Trip, 'startsOn' | 'endsOn'>): string[] {
  const out: string[] = []
  for (let d = trip.startsOn; d <= trip.endsOn; d = addDays(d, 1)) out.push(d)
  return out
}

/**
 * I7: `floor(100 × dias com ≥ 1 item / dias da viagem)`. Item fora das datas
 * (a viagem mudou no Calendário) não conta: ele não monta nenhum dia da viagem.
 */
export function itineraryReadiness(trip: Pick<Trip, 'startsOn' | 'endsOn' | 'itinerary'>): number {
  const filled = new Set(trip.itinerary.filter((i) => i.day >= trip.startsOn && i.day <= trip.endsOn).map((i) => i.day))
  return Math.floor((100 * filled.size) / tripDays(trip))
}

export type ReadinessKey = 'passagens' | 'hospedagem' | 'roteiro'

export interface ReadinessLine {
  key: ReadinessKey
  label: string
  ready: boolean
  /** Segunda linha: o `detail` do item (pode ser nulo), "a definir" sem item, "{r}% montado" no Roteiro. */
  detail: string | null
}

const READINESS_LABEL: Record<ReadinessKey, string> = {
  passagens: 'Passagens',
  hospedagem: 'Hospedagem',
  roteiro: 'Roteiro',
}

/** O primeiro item de preparação daquele tipo, pela `position`. */
function firstPrep(prep: readonly PrepItem[], kind: PrepKind): PrepItem | undefined {
  return [...prep].sort((a, b) => a.position - b.position).find((p) => p.kind === kind)
}

/** I7, o "{p} de 3 prontos" da Grade: Passagens, Hospedagem (itens) e Roteiro (100%). */
export function readiness(trip: Pick<Trip, 'startsOn' | 'endsOn' | 'itinerary' | 'prep'>): {
  lines: ReadinessLine[]
  readyCount: number
} {
  const prepLine = (key: 'passagens' | 'hospedagem'): ReadinessLine => {
    const item = firstPrep(trip.prep, key)
    if (!item) return { key, label: READINESS_LABEL[key], ready: false, detail: 'a definir' }
    return { key, label: READINESS_LABEL[key], ready: item.done, detail: item.detail }
  }
  const pct = itineraryReadiness(trip)
  const lines = [
    prepLine('passagens'),
    prepLine('hospedagem'),
    { key: 'roteiro' as const, label: READINESS_LABEL.roteiro, ready: pct === 100, detail: `${pct}% montado` },
  ]
  return { lines, readyCount: lines.filter((l) => l.ready).length }
}

// ---------------------------------------------------------------------------
// Roteiro dia a dia (R17)
// ---------------------------------------------------------------------------

/** Por hora (sem hora no fim), depois `position`, depois id. */
function byTime(a: ItineraryItem, b: ItineraryItem): number {
  if (a.at !== b.at) {
    if (a.at === null) return 1
    if (b.at === null) return -1
    return a.at.localeCompare(b.at)
  }
  return a.position - b.position || a.id.localeCompare(b.id)
}

/** Itens na ordem do roteiro: por dia, e dentro do dia por `byTime`. */
export function sortItinerary(items: readonly ItineraryItem[]): ItineraryItem[] {
  return [...items].sort((a, b) => a.day.localeCompare(b.day) || byTime(a, b))
}

export interface PlanDay {
  kind: 'day'
  day: string
  /** "Dia {k}". */
  k: number
  /** "Sáb, 12 jul". */
  dateLabel: string
  /** "· {título do dia}"; `null` sem título. */
  title: string | null
  items: ItineraryItem[]
}

export interface PlanOpen {
  kind: 'open'
  from: string
  to: string
  /** "Dia {dayFrom} a {dayTo}". */
  dayFrom: number
  dayTo: number
  /** "Sáb, 3 → Sex, 9 out". */
  rangeLabel: string
  freeDays: number
  /** Até 3 sugestões — só no PRIMEIRO bloco em aberto; os seguintes vêm vazios. */
  suggestions: ListItem[]
}

export type PlanBlock = PlanDay | PlanOpen

export interface ItineraryPlan {
  /** Todos os blocos, na ordem dos dias. */
  blocks: PlanBlock[]
  /** O que aparece: tudo quando `expanded` ou com até `maxVisibleDays` dias com itens. */
  visible: PlanBlock[]
  /** "Ver dias {5} a {N}"; `null` quando nada está escondido. */
  moreLabel: string | null
  /** "Fora das datas da viagem", em ordem de dia e hora; vazio = o grupo some. */
  outside: ItineraryItem[]
  /** Onde _Montar/Editar roteiro_ abre o modal: o primeiro dia sem item, senão o dia 1. */
  firstEmptyDay: string
}

export interface ItineraryPlanOptions {
  /** Depois do _Ver dias…_. */
  expanded?: boolean
  /** R17: 4. */
  maxVisibleDays?: number
  /** R17: 3. */
  maxSuggestions?: number
}

/**
 * R17. `suggestions` são os itens da Lista perto do destino e fora do roteiro
 * (`suggestionsFor`), já na ordem de exibição. Dia vazio sozinho é um dia
 * normal sem itens; dois ou mais vazios seguidos viram um bloco em aberto.
 *
 * O colapso conta DIAS COM ITENS: com mais de 4, aparecem os blocos até o 4º
 * dia com itens (inclusive os vazios ANTES dele), e o resto some atrás de "Ver
 * dias {k} a {N}", com k = o primeiro dia escondido e N = o último da viagem.
 */
export function itineraryPlan(
  trip: Pick<Trip, 'startsOn' | 'endsOn' | 'itinerary' | 'days'>,
  suggestions: readonly ListItem[],
  opts: ItineraryPlanOptions = {},
): ItineraryPlan {
  const { expanded = false, maxVisibleDays = 4, maxSuggestions = 3 } = opts
  const dates = tripDates(trip)
  const inside = new Map<string, ItineraryItem[]>()
  const outside: ItineraryItem[] = []
  for (const item of trip.itinerary) {
    if (item.day < trip.startsOn || item.day > trip.endsOn) outside.push(item)
    else inside.set(item.day, [...(inside.get(item.day) ?? []), item])
  }
  const titles = new Map(trip.days.map((d) => [d.day, d.title]))

  const blocks: PlanBlock[] = []
  let suggestionsGiven = false
  let i = 0
  while (i < dates.length) {
    const day = dates[i]
    const items = inside.get(day)
    let j = i
    while (j + 1 < dates.length && !inside.has(dates[j + 1]) && !items) j++
    if (!items && j > i) {
      blocks.push({
        kind: 'open',
        from: day,
        to: dates[j],
        dayFrom: i + 1,
        dayTo: j + 1,
        rangeLabel: openRangeLabel(day, dates[j]),
        freeDays: j - i + 1,
        suggestions: suggestionsGiven ? [] : suggestions.slice(0, maxSuggestions),
      })
      suggestionsGiven = true
      i = j + 1
      continue
    }
    blocks.push({
      kind: 'day',
      day,
      k: i + 1,
      dateLabel: weekdayShortDayMonth(day),
      title: titles.get(day) ?? null,
      items: [...(items ?? [])].sort(byTime),
    })
    i++
  }

  // Com mais de `maxVisibleDays` dias com itens, o corte fica logo depois do
  // último dia com itens visível; o que vem depois (vazio ou não) se esconde.
  const itemDays = blocks.flatMap((b, idx) => (b.kind === 'day' && b.items.length > 0 ? [idx] : []))
  const cut = itemDays.length > maxVisibleDays ? itemDays[maxVisibleDays - 1] + 1 : blocks.length
  const hidden = expanded ? [] : blocks.slice(cut)
  const firstHidden = hidden[0]
  const moreLabel =
    firstHidden === undefined
      ? null
      : `Ver dias ${firstHidden.kind === 'day' ? firstHidden.k : firstHidden.dayFrom} a ${dates.length}`

  return {
    blocks,
    visible: expanded ? blocks : blocks.slice(0, cut),
    moreLabel,
    outside: sortItinerary(outside),
    firstEmptyDay: dates.find((d) => !inside.has(d)) ?? trip.startsOn,
  }
}

/** "Sáb, 3 → Sex, 9 out"; atravessando o mês, "Sáb, 31 out → Seg, 2 nov". */
function openRangeLabel(from: string, to: string): string {
  const [wFrom, wTo] = [weekdayShortDayMonth(from).split(',')[0], weekdayShortDayMonth(to).split(',')[0]]
  if (from.slice(0, 7) === to.slice(0, 7)) return `${wFrom}, ${Number(from.slice(8))} → ${wTo}, ${shortDayMonth(to)}`
  return `${wFrom}, ${shortDayMonth(from)} → ${wTo}, ${shortDayMonth(to)}`
}

/** R16 feita: "{i} lugares · visitados · {l} da nossa lista". */
export function itineraryCounts(trip: Pick<Trip, 'itinerary'>): { items: number; fromList: number } {
  return { items: trip.itinerary.length, fromList: trip.itinerary.filter((i) => i.listItemId !== null).length }
}

// ---------------------------------------------------------------------------
// A Lista e a viagem (R16, R18, I9)
// ---------------------------------------------------------------------------

/**
 * R16/R18/R24: itens da Lista a ≤ 30 km do destino, do mais perto ao mais
 * longe. É o `nearby` da Lista — geográficos e a fazer —, sem regra nova.
 * Destino que não veio na leitura → nenhum.
 */
export function nearbyListItems(dest: LatLng | undefined, listItems: readonly ListItem[]): ListItem[] {
  if (!dest) return []
  return nearby(listItems, dest, NEARBY_RADIUS_KM).map((e) => e.item)
}

function linkedIds(trip: Pick<Trip, 'itinerary'>): Set<string> {
  return new Set(trip.itinerary.map((i) => i.listItemId).filter((id): id is string => id !== null))
}

/** R17: perto do destino e fora do roteiro, até `max` (3). */
export function suggestionsFor(
  trip: Pick<Trip, 'itinerary'>,
  dest: LatLng | undefined,
  listItems: readonly ListItem[],
  max = 3,
): ListItem[] {
  const linked = linkedIds(trip)
  return nearbyListItems(dest, listItems)
    .filter((item) => !linked.has(item.id))
    .slice(0, max)
}

/** Os itens da Lista vinculados ao roteiro, sem repetição, na ordem do roteiro. */
function linkedItems(trip: Pick<Trip, 'itinerary'>, listItems: readonly ListItem[]): ListItem[] {
  const byId = new Map(listItems.map((i) => [i.id, i]))
  const seen = new Set<string>()
  const out: ListItem[] = []
  for (const it of sortItinerary(trip.itinerary)) {
    const item = it.listItemId === null ? undefined : byId.get(it.listItemId)
    if (item && !seen.has(item.id)) {
      seen.add(item.id)
      out.push(item)
    }
  }
  return out
}

/** R18 "Da nossa lista · feitos aqui": vinculados ao roteiro com status feito, na ordem do roteiro. */
export function doneHere(trip: Pick<Trip, 'itinerary'>, listItems: readonly ListItem[]): ListItem[] {
  return linkedItems(trip, listItems).filter((i) => i.status === 'done')
}

/** R18 "No roteiro · dia {k}": o dia do primeiro item do roteiro vinculado; `null` = "Fora do roteiro". */
export function inItineraryDay(trip: Pick<Trip, 'startsOn' | 'endsOn' | 'itinerary'>, listItemId: string): number | null {
  const first = sortItinerary(trip.itinerary).find(
    (i) => i.listItemId === listItemId && dayOfTrip(trip, i.day) !== null,
  )
  return first ? dayOfTrip(trip, first.day) : null
}

/**
 * I9: o destino, depois as cidades dos itens da Lista vinculados ao roteiro,
 * sem repetição (sem acento e sem caixa), na ordem do roteiro. Fica a grafia
 * da primeira ocorrência.
 */
export function tripCities(
  trip: Pick<Trip, 'itinerary'>,
  dest: Pick<CalCity, 'name'> | undefined,
  listItems: readonly ListItem[],
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const push = (name: string | null | undefined) => {
    const key = name ? normalizeSearch(name) : ''
    if (!name || key === '' || seen.has(key)) return
    seen.add(key)
    out.push(name.trim())
  }
  push(dest?.name)
  for (const item of linkedItems(trip, listItems)) push(item.place?.city)
  return out
}

// ---------------------------------------------------------------------------
// Recordes e "Há um ano" (R12, R13)
// ---------------------------------------------------------------------------

export interface TripRecords {
  longest: { trip: Trip; days: number } | null
  /** Só ida, "{km} km de {casa}". */
  farthest: { trip: Trip; km: number } | null
  mostRepeated: { cityId: string; city: CalCity | undefined; count: number } | null
}

/**
 * R12, só as feitas. Empate em qualquer recorde → a mais recente (a de ida
 * mais tardia): `doneTrips` já vem nessa ordem e o `>` estrito mantém a
 * primeira. No destino repetido, "a mais recente" é a cidade da viagem mais
 * recente entre as empatadas.
 */
export function tripRecords(trips: readonly Trip[], cities: CityMap, home: LatLng, today: string): TripRecords {
  const done = doneTrips(trips, today)
  let longest: TripRecords['longest'] = null
  let farthest: TripRecords['farthest'] = null
  const counts = new Map<string, number>()
  for (const t of done) {
    const days = tripDays(t)
    if (longest === null || days > longest.days) longest = { trip: t, days }
    const dest = cities.get(t.cityId)
    if (dest) {
      const km = distanceKm(home, dest)
      if (farthest === null || km > farthest.km) farthest = { trip: t, km }
    }
    counts.set(t.cityId, (counts.get(t.cityId) ?? 0) + 1)
  }
  let mostRepeated: TripRecords['mostRepeated'] = null
  // `counts` guarda a ordem de inserção = da viagem mais recente.
  for (const [cityId, count] of counts) {
    if (count >= 2 && (mostRepeated === null || count > mostRepeated.count)) {
      mostRepeated = { cityId, city: cities.get(cityId), count }
    }
  }
  return { longest, farthest, mostRepeated }
}

/**
 * R13: a feita que contém hoje − 1 ano; senão a feita com ida mais perto dessa
 * data, até 30 dias para qualquer lado; senão `null`. Empates → a mais recente.
 */
export function oneYearAgo(trips: readonly Trip[], today: string): Trip | null {
  const target = addYears(today, -1)
  const done = doneTrips(trips, today)
  const containing = done.find((t) => t.startsOn <= target && target <= t.endsOn)
  if (containing) return containing
  let best: { trip: Trip; gap: number } | null = null
  for (const t of done) {
    const gap = Math.abs(diffDays(target, t.startsOn))
    if (gap <= 30 && (best === null || gap < best.gap)) best = { trip: t, gap }
  }
  return best?.trip ?? null
}

/** As primeiras `max` letras (por ponto de código: emoji não parte ao meio), com reticências. */
export function excerpt(text: string, max = 140): string {
  const clean = text.trim()
  const chars = Array.from(clean)
  if (chars.length <= max) return clean
  return `${chars.slice(0, max).join('').trimEnd()}…`
}

// ---------------------------------------------------------------------------
// Linha do tempo (R8)
// ---------------------------------------------------------------------------

export interface TimelineEntry {
  trip: Trip
  status: TripStatus
  /** A do R5. */
  isHero: boolean
  /** O marcador "{MMM}\n{aaaa}": o mês curto em minúsculas ("out") — a caixa é do CSS. */
  month: string
  year: string
}

export interface Timeline {
  entries: TimelineEntry[]
  /**
   * Onde entra o "Hoje": antes de `entries[todayIndex]` (= quantas futuras há).
   * Em andamento conta como futura — está acima do marcador, com as planejadas.
   */
  todayIndex: number
  /** "Hoje · 25 set". */
  todayLabel: string
}

/** R8: da mais distante no futuro para a mais antiga. */
export function timeline(trips: readonly Trip[], today: string): Timeline {
  const hero = heroTrip(trips, today)
  const entries = sortTrips(trips)
    .reverse()
    .map((trip) => ({
      trip,
      status: tripStatus(trip, today),
      isHero: trip.id === hero?.id,
      month: shortMonth(trip.startsOn),
      year: trip.startsOn.slice(0, 4),
    }))
  return {
    entries,
    todayIndex: entries.filter((e) => e.status !== 'done').length,
    todayLabel: `Hoje · ${shortDayMonth(today)}`,
  }
}

// ---------------------------------------------------------------------------
// Filtros de "Já fizemos" (R7)
// ---------------------------------------------------------------------------

export type GridFilter = { kind: 'all' } | { kind: 'year'; year: number } | { kind: 'br' } | { kind: 'abroad' }

export interface GridFilterOption {
  /** Chave estável para o chip: `all`, `y2025`, `br`, `abroad`. */
  id: string
  label: string
  filter: GridFilter
}

const filterId = (f: GridFilter): string => (f.kind === 'year' ? `y${f.year}` : f.kind)

/**
 * R7: _Todas_, os anos (de `startsOn`, do mais recente), _Brasil_ e
 * _Exterior_ — só os que têm viagem. Destino fora da leitura de cidades não
 * entra em Brasil nem em Exterior.
 */
export function gridFilterOptions(done: readonly Trip[], cities: CityMap): GridFilterOption[] {
  const years = [...new Set(done.map((t) => Number(t.startsOn.slice(0, 4))))].sort((a, b) => b - a)
  const countries = done.map((t) => cities.get(t.cityId)?.countryCode)
  const filters: GridFilter[] = [{ kind: 'all' }, ...years.map((year) => ({ kind: 'year' as const, year }))]
  if (countries.some((c) => c === 'BR')) filters.push({ kind: 'br' })
  if (countries.some((c) => c !== undefined && c !== 'BR')) filters.push({ kind: 'abroad' })
  const label = (f: GridFilter): string =>
    f.kind === 'all' ? 'Todas' : f.kind === 'year' ? String(f.year) : f.kind === 'br' ? 'Brasil' : 'Exterior'
  return filters.map((f) => ({ id: filterId(f), label: label(f), filter: f }))
}

export function applyGridFilter(done: readonly Trip[], filter: GridFilter, cities: CityMap): Trip[] {
  return done.filter((t) => {
    const country = cities.get(t.cityId)?.countryCode
    switch (filter.kind) {
      case 'all':
        return true
      case 'year':
        return Number(t.startsOn.slice(0, 4)) === filter.year
      case 'br':
        return country === 'BR'
      case 'abroad':
        return country !== undefined && country !== 'BR'
    }
  })
}

// ---------------------------------------------------------------------------
// Mapa (ADR 0021): projeção equiretangular e recorte
// ---------------------------------------------------------------------------

/** Posição no mapa-múndi inteiro, em fração 0..1 (0,0 = canto superior esquerdo). */
export function project(lat: number, lng: number): { x: number; y: number } {
  return { x: (lng + 180) / 360, y: (90 - lat) / 180 }
}

export interface MapCrop {
  /** Bordas do recorte, em graus. */
  west: number
  east: number
  north: number
  south: number
  /** O recorte em fração da imagem inteira — para posicionar/escalar o fundo. */
  frame: { x: number; y: number; w: number; h: number }
  /** Posição dentro do recorte, em fração 0..1 da caixa. */
  project: (p: LatLng) => { x: number; y: number }
}

export interface CropOptions {
  /** Largura da caixa ÷ altura (344×172 → 2). */
  aspect: number
  /** R10b: 24°. */
  minWidthDeg?: number
  /** Folga em volta dos pontos, em graus. */
  padDeg?: number
}

/**
 * R10b: o retângulo que contém os pontos, com folga, pelo menos
 * `minWidthDeg` de largura e com a razão de aspecto da caixa (na
 * equiretangular um grau vale o mesmo em x e y, então a proporção em graus é a
 * da caixa). Centrado nos pontos e empurrado para dentro do mundo quando passa
 * da borda. Não atravessa o antimeridiano: uma viagem Japão → Havaí sai
 * larga, o que é aceitável até o MapLibre (Fase 7). Sem pontos → o mundo.
 */
export function cropFor(points: readonly LatLng[], opts: CropOptions): MapCrop {
  const { aspect, minWidthDeg = 24, padDeg = 4 } = opts
  if (points.length === 0) return cropOf(-180, 90, 360, 180)
  const lngs = points.map((p) => p.lng)
  const lats = points.map((p) => p.lat)
  const [w0, e0, s0, n0] = [Math.min(...lngs), Math.max(...lngs), Math.min(...lats), Math.max(...lats)]
  let width = Math.max(e0 - w0 + 2 * padDeg, minWidthDeg, (n0 - s0 + 2 * padDeg) * aspect)
  let height = width / aspect
  if (width > 360) [width, height] = [360, 360 / aspect]
  if (height > 180) [width, height] = [180 * aspect, 180]
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)
  const west = clamp((w0 + e0) / 2 - width / 2, -180, 180 - width)
  const north = clamp((n0 + s0) / 2 + height / 2, -90 + height, 90)
  return cropOf(west, north, width, height)
}

function cropOf(west: number, north: number, width: number, height: number): MapCrop {
  return {
    west,
    east: west + width,
    north,
    south: north - height,
    frame: { x: (west + 180) / 360, y: (90 - north) / 180, w: width / 360, h: height / 180 },
    project: (p) => ({ x: (p.lng - west) / width, y: (north - p.lat) / height }),
  }
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

function plural(n: number, one: string, many: string): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`
}

export const daysLabel = (n: number): string => plural(n, 'dia', 'dias')
export const photosLabel = (n: number): string => plural(n, 'foto', 'fotos')
export const memoriesLabel = (n: number): string => plural(n, 'memória', 'memórias')
export const tripsLabel = (n: number): string => plural(n, 'viagem', 'viagens')
export const itemsLabel = (n: number): string => plural(n, 'item', 'itens')
/** "em {n} dias" (e "em 1 dia"). */
export const inDaysLabel = (n: number): string => `em ${daysLabel(n)}`

/** Milhar com ponto: 18420 → "18.420". */
export function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

/**
 * "1–9 out 2026" · "27 set – 3 out 2026" · "28 dez – 3 jan 2027" (o ano vai
 * só no fim, mesmo atravessando o ano) · "5 out 2026" (um dia). Sem ano:
 * as mesmas formas sem o " aaaa".
 */
export function dateRangeLabel(from: string, to: string, opts: { year: boolean }): string {
  const tail = opts.year ? ` ${to.slice(0, 4)}` : ''
  if (from === to) return `${shortDayMonth(from)}${tail}`
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))}–${shortDayMonth(to)}${tail}`
  return `${shortDayMonth(from)} – ${shortDayMonth(to)}${tail}`
}

export function tripDateRange(trip: Pick<Trip, 'startsOn' | 'endsOn'>, opts: { year: boolean }): string {
  return dateRangeLabel(trip.startsOn, trip.endsOn, opts)
}

/** R16 "juntos · 12 a 19 jul" · "28 dez a 3 jan". */
export function daysSpanLabel(from: string, to: string): string {
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))} a ${shortDayMonth(to)}`
  return `${shortDayMonth(from)} a ${shortDayMonth(to)}`
}

/** R24 "8 → 14 jan" · "28 dez → 3 jan". */
export function arrowRangeLabel(from: string, to: string): string {
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))} → ${shortDayMonth(to)}`
  return `${shortDayMonth(from)} → ${shortDayMonth(to)}`
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames('pt-BR', { type: 'region' })
  } catch {
    return null
  }
})()

/** "Brasil", ou o nome do país em português; código desconhecido fica como veio. */
export function countryLabel(countryCode: string): string {
  const code = countryCode.toUpperCase()
  if (code === 'BR') return 'Brasil'
  try {
    return regionNames?.of(code) ?? code
  } catch {
    return code
  }
}

/** I10: "Ilhabela, SP" no Brasil, "Lisboa, Portugal" fora. */
export function destinationLabel(city: Pick<CalCity, 'name' | 'stateCode' | 'countryCode'>): string {
  if (city.countryCode === 'BR' && city.stateCode) return `${city.name}, ${city.stateCode}`
  return `${city.name}, ${countryLabel(city.countryCode)}`
}

/** "R$ 18.400" com reais inteiros; "R$ 18.400,50" com centavos. Espaço comum (não o NBSP do `Intl`). */
export function formatBRL(cents: number): string {
  const whole = cents % 100 === 0
  const value = (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return `R$ ${value}`
}

/** R20d "sex 1 out, 15h" · "sáb 2 out, 11h30", de `YYYY-MM-DDTHH:MM` (hora local do lugar). */
export function checkTimeLabel(stamp: string): string {
  const day = stamp.slice(0, 10)
  const [h, m] = [Number(stamp.slice(11, 13)), stamp.slice(14, 16)]
  const hour = stamp.length < 16 ? '' : `, ${h}h${m === '00' ? '' : m}`
  return `${weekdayShortLower(day)} ${shortDayMonth(day)}${hour}`
}

/** R20d "{link encurtado}": o host sem `www.`; texto que não é URL volta como veio. */
export function shortUrl(url: string): string {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url.trim())
  return match ? match[1].replace(/^www\./i, '') : url
}

/** R6 "Planejada · {nota}" / "Planejada". */
export function plannedKicker(trip: Pick<Trip, 'note'>): string {
  const note = trip.note?.trim()
  return note ? `Planejada · ${note}` : 'Planejada'
}

/**
 * R15 (e R5): "Viajando agora · dia {k} de {N}", "Próxima viagem · em {n}
 * dias" (a do herói), "Planejada · em {n} dias", "Já fomos · {país}".
 */
export function statusLabel(
  trip: Pick<Trip, 'startsOn' | 'endsOn'>,
  today: string,
  ctx: { isHero: boolean; countryCode: string | undefined },
): string {
  const on = ongoingDay(trip, today)
  if (on) return `Viajando agora · dia ${on.k} de ${on.n}`
  if (tripStatus(trip, today) === 'done') {
    return ctx.countryCode ? `Já fomos · ${countryLabel(ctx.countryCode)}` : 'Já fomos'
  }
  return `${ctx.isHero ? 'Próxima viagem' : 'Planejada'} · ${inDaysLabel(daysUntil(trip, today))}`
}

// ---------------------------------------------------------------------------
// Fotos (R22) e orçamento (R20c)
// ---------------------------------------------------------------------------

/** R22: por `takenOn` (sem data no fim), depois `createdAt`, depois id. */
export function sortPhotos(photos: readonly TripPhoto[]): TripPhoto[] {
  return [...photos].sort((a, b) => {
    if (a.takenOn !== b.takenOn) {
      if (a.takenOn === null) return 1
      if (b.takenOn === null) return -1
      return a.takenOn.localeCompare(b.takenOn)
    }
    return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  })
}

export interface BudgetSummary {
  totalCents: number
  /** Arredondado ao centavo. */
  perPersonCents: number
  spentCents: number
  /** Pela `position`; `fraction` = planejado da linha ÷ total (0 com total 0), para a barra. */
  lines: { id: string; label: string; plannedCents: number; spentCents: number; fraction: number }[]
}

/** R20c. `travelers` = 2: a viagem em Viagens é sempre dos dois (R2). */
export function budgetSummary(trip: Pick<Trip, 'budget'>, travelers = 2): BudgetSummary {
  const sorted = [...trip.budget].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  const totalCents = sorted.reduce((s, l) => s + l.plannedCents, 0)
  return {
    totalCents,
    perPersonCents: Math.round(totalCents / travelers),
    spentCents: sorted.reduce((s, l) => s + l.spentCents, 0),
    lines: sorted.map((l) => ({
      id: l.id,
      label: l.label,
      plannedCents: l.plannedCents,
      spentCents: l.spentCents,
      fraction: totalCents === 0 ? 0 : l.plannedCents / totalCents,
    })),
  }
}
