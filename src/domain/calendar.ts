// O Calendário: pintura de estadias, trechos, faixas, as duas contagens, o
// "Agora", as ocorrências de evento e a validação do formato do evento.
//
// Spec: .agent/Tasks/fase-5-calendario.md, seções 4 e 5
// ADR:  .agent/Decisions/0018-periodo-se-grava-pintando-estadias.md
//       .agent/Decisions/0002-estadia-por-pessoa-estado-derivado.md
//
// Puro: sem Supabase, sem `Date` fora de `lib/date.ts`. As duas regras que
// moram também no banco (a pintura e o formato do evento) têm tabela de casos
// compartilhada: `paintCases.ts` e `eventValidationCases.ts`.

import { addDays, daysInclusive, diffDays, isLeapYear, isoOf, shortDayMonth, weekdayOf } from '../lib/date'
import { coupleStateOn, stayOn } from './coupleState'
import type { CoupleState, Member, Stay } from './coupleState'

export type { Member, Stay }

// ---------------------------------------------------------------------------
// Constantes — paridade com os CHECK de `calendar_events` e o trigger do 💋 (A1)
// ---------------------------------------------------------------------------

export const EVENT_KINDS = ['viagem', 'visita', 'date', 'data_especial', 'compromisso', 'lembrete'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

/** Os tipos que criam período (pintam estadias) ao serem criados. */
export const TRAVEL_KINDS = ['viagem', 'visita'] as const satisfies readonly EventKind[]
export type TravelKind = (typeof TRAVEL_KINDS)[number]

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  viagem: 'Viagem',
  visita: 'Visita',
  date: 'Date',
  data_especial: 'Data especial',
  compromisso: 'Compromisso',
  lembrete: 'Lembrete',
}

export const CALENDAR_LIMITS = {
  title: 80,
  note: 280,
  place: 80,
  /** `ends_on - starts_on < spanDays`: no máximo 366 dias corridos, inclusivos. */
  spanDays: 366,
  kissesPerDay: 20,
  paintEntries: 8,
  upcoming: 6,
} as const

// ---------------------------------------------------------------------------
// Pessoas e cidades
// ---------------------------------------------------------------------------

export type Slot = 1 | 2

/** Os dois integrantes, pelo slot: a faixa fixa e a cor de cada um. */
export interface MembersBySlot {
  1: Member
  2: Member
}

export interface NamesBySlot {
  1: string
  2: string
}

/** Cidade como o Calendário precisa: IBGE (`stateCode`) ou do mundo (`region`). */
export interface CalCity {
  id: string
  name: string
  /** UF, só no Brasil. */
  stateCode: string | null
  countryCode: string
  /** Província/estado fora do Brasil, só para exibir. */
  region: string | null
  lat: number
  lng: number
}

export type CityMap = ReadonlyMap<string, CalCity>

// ---------------------------------------------------------------------------
// Pintura (I3, ADR 0018)
// ---------------------------------------------------------------------------

/** "A pessoa esteve na cidade de `from` até `to`" (inclusivo; `to` nulo = em aberto). */
export interface PaintEntry {
  profileId: string
  cityId: string
  from: string
  to: string | null
}

/** Os quatro cartões do Novo período / Primeiro período. */
export type PeriodChoice = 'home1' | 'home2' | 'away' | 'apart'

export interface PeriodDraft {
  choice: PeriodChoice
  /** Obrigatória em `away`; ignorada nas outras. */
  cityId: string | null
  from: string
  to: string | null
}

// ---------------------------------------------------------------------------
// Trechos e faixas (I4, I5)
// ---------------------------------------------------------------------------

/**
 * `home1`/`home2` = juntos na casa de quem é slot 1/2 (na casa dos dois → `home1`);
 * `away` = juntos fora das duas casas; `apart`; `unknown` = ao menos um sem estadia.
 * A cor de cada uma é a coluna `color_together_home_1`, `_home_2`, `_away`,
 * `color_apart` de `couple_settings`. `unknown` não tem cor.
 */
export type Band = 'home1' | 'home2' | 'away' | 'apart' | 'unknown'

export interface Run {
  from: string
  /** `null` = o trecho está em aberto (as duas estadias em aberto). */
  to: string | null
  band: Band
  /** `together:{cityId}` · `apart:{cityId slot 1}:{cityId slot 2}` · `unknown`. */
  key: string
  /** A cidade quando juntos; `null` separados ou `unknown`. */
  cityId: string | null
  /** Onde cada um está, na ordem dos slots; vazio em `unknown`. */
  positions: { profileId: string; cityId: string }[]
}

export type BandCounts = Record<Band, number>

// ---------------------------------------------------------------------------
// Eventos (I7, I8, I11)
// ---------------------------------------------------------------------------

export type Travelers = 'both' | 'solo'

/** O que o modal produz e o que `validateEvent` e `calendar_events_format` julgam. */
export interface EventDraft {
  kind: EventKind
  title: string
  startsOn: string
  endsOn: string | null
  allDay: boolean
  /** `HH:MM`. */
  startsAt: string | null
  /** `HH:MM`, só em viagem/visita (a hora da volta). */
  endsAt: string | null
  travelers: Travelers | null
  travelerId: string | null
  cityId: string | null
  place: string | null
  repeatsYearly: boolean
  note: string | null
  listItemId: string | null
}

export type EventField = keyof EventDraft

export interface CalendarEvent extends EventDraft {
  id: string
  createdBy: string | null
}

export type EventValidation = { ok: true } | { ok: false; field: EventField; reason: string }

/** Uma aparição de evento num dia (a data especial anual aparece todo ano). */
export interface Occurrence {
  /** `null` = o aniversário de namoro, derivado de `couples.started_on` (R21). */
  event: CalendarEvent | null
  day: string
  /** Último dia (igual a `day` no evento de um dia). */
  endDay: string
  title: string
  /** `{n} anos` na data especial anual e no aniversário; `null` nos outros. */
  years: number | null
}

// ---------------------------------------------------------------------------
// Painel (I10)
// ---------------------------------------------------------------------------

export type PersonStatus = 'home' | 'visiting' | 'traveling' | 'unknown'

export interface PersonDay {
  cityId: string | null
  status: PersonStatus
  /** Dia k da estadia dela (1 = o primeiro); `null` em casa ou `unknown`. */
  dayN: number | null
}

export interface Countdown {
  label: string
  days: number
}

export interface NowSummary {
  band: Band
  /** "Juntos em São José dos Campos há 4 dias", "Separados há 3 dias", "Sem registro…". */
  title: string
  /** "Lana está visitando desde 21 set", "Gabriel em SJC · Lana em Marau"; `null` em `unknown`. */
  subtitle: string | null
  /** O trecho de hoje; `null` em `unknown`. */
  run: Run | null
  /** Barra 1b: só com trecho fechado. */
  progress: { from: string; to: string; dayK: number; total: number } | null
  /** 1c: até dois, na ordem do frame. */
  countdowns: Countdown[]
}

// ===========================================================================
// Implementação
// ===========================================================================

const pairOf = (members: MembersBySlot): readonly [Member, Member] => [members[1], members[2]]

const minDay = (a: string, b: string): string => (a < b ? a : b)
const maxDay = (a: string, b: string): string => (a > b ? a : b)

function slotOf(profileId: string, members: MembersBySlot): Slot | null {
  if (members[1].profileId === profileId) return 1
  if (members[2].profileId === profileId) return 2
  return null
}

// ---------------------------------------------------------------------------
// Pintura (I3, ADR 0018)
// ---------------------------------------------------------------------------

function overlaps(stay: Stay, from: string, to: string | null): boolean {
  return (to === null || stay.startsOn <= to) && (stay.endsOn === null || stay.endsOn >= from)
}

/** Uma entrada: corta/parte/apaga a pessoa no intervalo, insere, funde vizinhas. */
function paintOne(stays: readonly Stay[], entry: PaintEntry, newId: () => string): Stay[] {
  const { profileId, cityId, from, to } = entry
  if (to !== null && to < from) {
    // O banco recusa com 22023. Aqui é bug de quem chamou — engolir faria a
    // prévia mostrar "nada muda" para um intervalo que nunca vai gravar.
    throw new RangeError(`paintStays: entrada com fim (${to}) antes do início (${from})`)
  }

  const out: Stay[] = []
  for (const stay of stays) {
    if (stay.profileId !== profileId || !overlaps(stay, from, to)) {
      out.push(stay)
      continue
    }
    const keepsBefore = stay.startsOn < from
    if (keepsBefore) out.push({ ...stay, endsOn: addDays(from, -1) })
    // O pedaço de depois mantém o fim original — inclusive `null` (em aberto).
    if (to !== null && (stay.endsOn === null || stay.endsOn > to)) {
      out.push({ ...stay, id: keepsBefore ? newId() : stay.id, startsOn: addDays(to, 1) })
    }
    // Inteira dentro do intervalo: simplesmente não volta para `out`.
  }

  // Fusão só com a vizinha IMEDIATA, da mesma pessoa e na mesma cidade.
  const dayBefore = addDays(from, -1)
  const left = out.find((s) => s.profileId === profileId && s.cityId === cityId && s.endsOn === dayBefore)
  const dayAfter = to === null ? null : addDays(to, 1)
  const right =
    dayAfter === null
      ? undefined
      : out.find((s) => s.profileId === profileId && s.cityId === cityId && s.startsOn === dayAfter)

  const painted: Stay = {
    id: left?.id ?? newId(),
    profileId,
    cityId,
    startsOn: left?.startsOn ?? from,
    endsOn: right ? right.endsOn : to,
  }
  return [...out.filter((s) => s !== left && s !== right), painted]
}

/**
 * I3: aplica as entradas EM ORDEM (a segunda pode sobrescrever a primeira).
 * Espelho de `paint_stays` no banco — a paridade se prova com `PAINT_CASES`.
 * Não muta a entrada. Devolve ordenado por pessoa e depois por início.
 */
export function paintStays(
  stays: readonly Stay[],
  entries: readonly PaintEntry[],
  newId: () => string,
): Stay[] {
  let current: Stay[] = [...stays]
  for (const entry of entries) current = paintOne(current, entry, newId)
  return current.sort((a, b) =>
    a.profileId === b.profileId
      ? a.startsOn.localeCompare(b.startsOn)
      : a.profileId.localeCompare(b.profileId),
  )
}

/** Cada um na própria casa, de `from` a `to` — o "volta pra casa" do ADR 0018. */
function homes(members: MembersBySlot, from: string, to: string | null): PaintEntry[] {
  return [members[1], members[2]].map((m) => ({ profileId: m.profileId, cityId: m.homeCityId, from, to }))
}

/** As entradas de um Novo período / Primeiro período, na ordem slot 1, slot 2. */
export function entriesForPeriod(draft: PeriodDraft, members: MembersBySlot): PaintEntry[] {
  const { choice, from, to } = draft
  const both = (cityId: string): PaintEntry[] =>
    [members[1], members[2]].map((m) => ({ profileId: m.profileId, cityId, from, to }))

  switch (choice) {
    case 'home1':
      return both(members[1].homeCityId)
    case 'home2':
      return both(members[2].homeCityId)
    case 'away':
      if (draft.cityId === null) throw new Error('entriesForPeriod: "away" sem cidade')
      return both(draft.cityId)
    case 'apart':
      return homes(members, from, to)
  }
}

/**
 * Editar período: primeiro as casas nos dias de `old` que ficaram fora de
 * `next`, depois o intervalo novo (ADR 0018, decisão 4). `to` nulo nos dois
 * lados é "em aberto": um antigo aberto encurtado manda a cauda
 * `[next.to + 1, ∞)` para as casas, também em aberto.
 */
export function entriesForEdit(old: Run, next: PeriodDraft, members: MembersBySlot): PaintEntry[] {
  const out: PaintEntry[] = []
  if (old.from < next.from) {
    const end = addDays(next.from, -1)
    out.push(...homes(members, old.from, old.to === null ? end : minDay(old.to, end)))
  }
  if (next.to !== null && (old.to === null || old.to > next.to)) {
    out.push(...homes(members, maxDay(old.from, addDays(next.to, 1)), old.to))
  }
  return [...out, ...entriesForPeriod(next, members)]
}

/** Apagar período: as casas sobre o trecho inteiro. */
export function entriesForDelete(old: Run, members: MembersBySlot): PaintEntry[] {
  return homes(members, old.from, old.to)
}

/**
 * O que `create_event` pinta: só viagem e visita, os viajantes no destino, de
 * `startsOn` a `endsOn`. Rascunho incompleto (sem destino, sem volta, `solo`
 * sem viajante) não pinta nada — `validateEvent` já o recusa, e pintar em
 * aberto por falta de `endsOn` apagaria o futuro da pessoa.
 */
export function entriesForEvent(draft: EventDraft, members: MembersBySlot): PaintEntry[] {
  if (!(TRAVEL_KINDS as readonly EventKind[]).includes(draft.kind)) return []
  const { cityId, startsOn: from, endsOn: to } = draft
  if (cityId === null || to === null) return []
  if (draft.travelers === 'both') {
    return [members[1], members[2]].map((m) => ({ profileId: m.profileId, cityId, from, to }))
  }
  if (draft.travelers === 'solo' && draft.travelerId !== null) {
    return [{ profileId: draft.travelerId, cityId, from, to }]
  }
  return []
}

// ---------------------------------------------------------------------------
// Trechos, faixas e contagem desenhada (I4, I5)
// ---------------------------------------------------------------------------

/** `home1` na casa do slot 1 (e na casa dos dois), `home2` na do slot 2, `away` fora das duas. */
export function bandOf(state: CoupleState, members: MembersBySlot): Band {
  switch (state.kind) {
    case 'unknown':
      return 'unknown'
    case 'apart':
      return 'apart'
    case 'together':
      if (state.cityId === members[1].homeCityId) return 'home1'
      if (state.cityId === members[2].homeCityId) return 'home2'
      return 'away'
  }
}

type Shape = Omit<Run, 'from' | 'to'>

function shapeOf(state: CoupleState, members: MembersBySlot): Shape {
  const band = bandOf(state, members)
  if (state.kind === 'unknown') return { band, key: 'unknown', cityId: null, positions: [] }
  if (state.kind === 'apart') {
    const positions = state.positions.map((p) => ({ profileId: p.profileId, cityId: p.cityId }))
    return { band, key: `apart:${positions[0].cityId}:${positions[1].cityId}`, cityId: null, positions }
  }
  return {
    band,
    key: `together:${state.cityId}`,
    cityId: state.cityId,
    positions: [members[1], members[2]].map((m) => ({ profileId: m.profileId, cityId: state.cityId })),
  }
}

/**
 * I4: os trechos cortados na janela `[from, to]`. Aqui `to` é sempre o último
 * dia DENTRO da janela (nunca `null`); as bordas reais são de `runAround`.
 *
 * O estado só muda numa borda de estadia (início ou dia seguinte ao fim), então
 * a derivação roda por borda, não por dia.
 */
export function runs(stays: readonly Stay[], members: MembersBySlot, from: string, to: string): Run[] {
  if (to < from) return []
  const ids = new Set([members[1].profileId, members[2].profileId])
  const relevant = stays.filter((s) => ids.has(s.profileId) && overlaps(s, from, to))

  const edges = new Set<string>([from])
  for (const s of relevant) {
    if (s.startsOn > from) edges.add(s.startsOn)
    if (s.endsOn !== null && s.endsOn < to) edges.add(addDays(s.endsOn, 1))
  }
  const sorted = [...edges].sort()
  const pair = pairOf(members)

  const out: Run[] = []
  sorted.forEach((start, i) => {
    const end = i + 1 < sorted.length ? addDays(sorted[i + 1], -1) : to
    const shape = shapeOf(coupleStateOn(start, relevant, pair), members)
    const last = out[out.length - 1]
    if (last && last.key === shape.key) last.to = end
    else out.push({ from: start, to: end, ...shape })
  })
  return out
}

/** Quantos dias `runAround` olha para cada lado. */
export const RUN_AROUND_HORIZON = 800

/**
 * O trecho que contém `day`, com as bordas REAIS. `to: null` quando o trecho
 * segue igual até o horizonte — na prática, as duas estadias em aberto.
 */
export function runAround(day: string, stays: readonly Stay[], members: MembersBySlot): Run {
  const hi = addDays(day, RUN_AROUND_HORIZON)
  const found = runs(stays, members, addDays(day, -RUN_AROUND_HORIZON), hi).find(
    (r) => r.from <= day && day <= (r.to as string),
  ) as Run
  return found.to === hi ? { ...found, to: null } : found
}

/**
 * I5: conta o DESENHADO em `[from, to]` — estadia em aberto vai até `to`, e dia
 * futuro conta como planejado. Não é `countStates` (vivido, nunca passa de hoje).
 */
export function countDrawn(from: string, to: string, stays: readonly Stay[], members: MembersBySlot): BandCounts {
  const counts: BandCounts = { home1: 0, home2: 0, away: 0, apart: 0, unknown: 0 }
  for (const r of runs(stays, members, from, to)) counts[r.band] += daysInclusive(r.from, r.to as string)
  return counts
}

const togetherOf = (c: BandCounts): number => c.home1 + c.home2 + c.away

// ---------------------------------------------------------------------------
// Rótulos (I9)
// ---------------------------------------------------------------------------

const MINOR_WORDS = new Set(['de', 'da', 'do', 'dos', 'das', 'e'])

/** "São José dos Campos" → "SJC"; "Rio de Janeiro", "Marau", "Lisboa" ficam inteiros. */
export function shortCityName(name: string): string {
  const words = name.trim().split(/\s+/).filter((w) => w !== '' && !MINOR_WORDS.has(w.toLowerCase()))
  if (words.length < 3) return name.trim()
  return words.map((w) => w.charAt(0).toUpperCase()).join('')
}

/** Nome da cidade; uma cidade que não veio na leitura aparece como "?" em vez de sumir. */
function cityName(cities: CityMap, id: string | null): string {
  return (id !== null && cities.get(id)?.name) || '?'
}

const cityShort = (cities: CityMap, id: string | null): string => shortCityName(cityName(cities, id))

/** Quem está fora de casa num trecho juntos; `null` quando a casa é dos dois. */
function visitorSlot(cityId: string, members: MembersBySlot): Slot | null {
  const home1 = members[1].homeCityId === cityId
  const home2 = members[2].homeCityId === cityId
  if (home1 && !home2) return 2
  if (home2 && !home1) return 1
  return null
}

/**
 * I9. `members` é um parâmetro a mais do que a spec lista: sem as casas não
 * dá para distinguir "{visitante} em X" de "Juntos em X" (casa dos dois).
 */
export function bandLabel(run: Run, names: NamesBySlot, cities: CityMap, members: MembersBySlot): string {
  switch (run.band) {
    case 'unknown':
      return ''
    case 'apart':
      return `Separados · ${cityShort(cities, run.positions[0]?.cityId ?? null)} e ${cityShort(cities, run.positions[1]?.cityId ?? null)}`
    case 'away':
      return cityShort(cities, run.cityId)
    case 'home1':
    case 'home2': {
      const visitor = run.cityId === null ? null : visitorSlot(run.cityId, members)
      const city = cityShort(cities, run.cityId)
      return visitor === null ? `Juntos em ${city}` : `${names[visitor]} em ${city}`
    }
  }
}

// ---------------------------------------------------------------------------
// Painel (I10)
// ---------------------------------------------------------------------------

/** Status de uma pessoa num dia, e o dia k da estadia vigente dela. */
export function personStatus(
  profileId: string,
  day: string,
  stays: readonly Stay[],
  members: MembersBySlot,
): PersonDay {
  const stay = stayOn(stays, profileId, day)
  const slot = slotOf(profileId, members)
  if (!stay || slot === null) return { cityId: null, status: 'unknown', dayN: null }
  const own = members[slot].homeCityId
  const other = members[slot === 1 ? 2 : 1].homeCityId
  if (stay.cityId === own) return { cityId: stay.cityId, status: 'home', dayN: null }
  return {
    cityId: stay.cityId,
    status: stay.cityId === other ? 'visiting' : 'traveling',
    dayN: diffDays(stay.startsOn, day) + 1,
  }
}

const daysWord = (n: number): string => (n === 1 ? '1 dia' : `${n} dias`)

/** O primeiro dia depois de `today` em que a pessoa está na própria casa. */
function nextHomeDay(profileId: string, homeCityId: string, today: string, stays: readonly Stay[]): string | null {
  const starts = stays
    .filter((s) => s.profileId === profileId && s.cityId === homeCityId && s.startsOn > today)
    .map((s) => s.startsOn)
  return starts.length === 0 ? null : starts.reduce(minDay)
}

/** R12.1: o bloco _Agora_, sempre sobre hoje. */
export function nowSummary(
  today: string,
  stays: readonly Stay[],
  members: MembersBySlot,
  names: NamesBySlot,
  events: readonly CalendarEvent[],
  cities: CityMap,
): NowSummary {
  const run = runAround(today, stays, members)
  if (run.band === 'unknown') {
    return { band: 'unknown', title: 'Sem registro de onde vocês estão hoje', subtitle: null, run: null, progress: null, countdowns: [] }
  }

  const n = diffDays(run.from, today)
  const since = n === 0 ? 'desde hoje' : `há ${daysWord(n)}`
  const sinceDay = shortDayMonth(run.from)

  let title: string
  let subtitle: string
  let second: Countdown | null = null

  if (run.band === 'apart') {
    title = `Separados ${since}`
    subtitle = `${names[1]} em ${cityShort(cities, run.positions[0].cityId)} · ${names[2]} em ${cityShort(cities, run.positions[1].cityId)}`
    const together = runs(stays, members, addDays(today, 1), addDays(today, RUN_AROUND_HORIZON)).find(
      (r) => r.band === 'home1' || r.band === 'home2' || r.band === 'away',
    )
    if (together) second = { label: 'Juntos de novo em', days: diffDays(today, together.from) }
  } else if (run.band === 'away') {
    title = `Viajando juntos ${since}`
    subtitle = `Em ${cityName(cities, run.cityId)} desde ${sinceDay}`
    const back = [members[1], members[2]]
      .map((m) => nextHomeDay(m.profileId, m.homeCityId, today, stays))
      .filter((d): d is string => d !== null)
    if (back.length > 0) second = { label: 'Voltam pra casa em', days: diffDays(today, back.reduce(minDay)) }
  } else {
    title = `Juntos em ${cityName(cities, run.cityId)} ${since}`
    const visitor = visitorSlot(run.cityId as string, members)
    if (visitor === null) {
      subtitle = `Em casa desde ${sinceDay}`
    } else {
      subtitle = `${names[visitor]} está visitando desde ${sinceDay}`
      const back = nextHomeDay(members[visitor].profileId, members[visitor].homeCityId, today, stays)
      if (back !== null) second = { label: `${names[visitor]} volta pra casa em`, days: diffDays(today, back) }
    }
  }

  const countdowns: Countdown[] = []
  const nextTrip = events
    .filter((e) => (TRAVEL_KINDS as readonly EventKind[]).includes(e.kind) && e.startsOn > today && e.cityId !== null)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0]
  if (nextTrip) countdowns.push({ label: `${cityShort(cities, nextTrip.cityId)} começa em`, days: diffDays(today, nextTrip.startsOn) })
  if (second) countdowns.push(second)

  return {
    band: run.band,
    title,
    subtitle,
    run,
    progress:
      run.to === null
        ? null
        : { from: run.from, to: run.to, dayK: n + 1, total: daysInclusive(run.from, run.to) },
    countdowns,
  }
}

// ---------------------------------------------------------------------------
// Eventos: ocorrências, próximos, subtítulo (I7, I11, R21)
// ---------------------------------------------------------------------------

/** O mesmo dia e mês em `year`; 29/2 cai em 28/2 nos anos não bissextos. */
function sameDayIn(year: number, iso: string): string {
  const month = Number(iso.slice(5, 7))
  let day = Number(iso.slice(8, 10))
  if (month === 2 && day === 29 && !isLeapYear(year)) day = 28
  return isoOf(year, month, day)
}

const yearsWord = (n: number): string => (n === 1 ? '1 ano' : `${n} anos`)

function compareOccurrences(a: Occurrence, b: Occurrence): number {
  if (a.day !== b.day) return a.day.localeCompare(b.day)
  // Dia inteiro (e sem hora) primeiro, depois por hora.
  const ta = a.event === null || a.event.allDay ? '' : (a.event.startsAt ?? '')
  const tb = b.event === null || b.event.allDay ? '' : (b.event.startsAt ?? '')
  if (ta !== tb) return ta.localeCompare(tb)
  return a.title.localeCompare(b.title)
}

/**
 * I7: as aparições de evento que cruzam `[from, to]`. A data especial anual
 * aparece em todo ano a partir do de início; o aniversário de namoro sai de
 * `startedOn` (R21), só para `n ≥ 1`. Nada disso é linha no banco.
 */
export function occurrences(
  events: readonly CalendarEvent[],
  couple: { startedOn: string },
  from: string,
  to: string,
): Occurrence[] {
  if (to < from) return []
  const firstYear = Number(from.slice(0, 4))
  const lastYear = Number(to.slice(0, 4))
  const out: Occurrence[] = []

  for (const event of events) {
    if (event.kind === 'data_especial' && event.repeatsYearly) {
      const startYear = Number(event.startsOn.slice(0, 4))
      for (let y = Math.max(firstYear, startYear); y <= lastYear; y++) {
        const day = sameDayIn(y, event.startsOn)
        if (day < from || day > to) continue
        const n = y - startYear
        out.push({ event, day, endDay: day, title: event.title, years: n >= 1 ? n : null })
      }
      continue
    }
    const endDay = event.endsOn ?? event.startsOn
    if (event.startsOn <= to && endDay >= from) {
      out.push({ event, day: event.startsOn, endDay, title: event.title, years: null })
    }
  }

  const startYear = Number(couple.startedOn.slice(0, 4))
  for (let y = Math.max(firstYear, startYear + 1); y <= lastYear; y++) {
    const day = sameDayIn(y, couple.startedOn)
    if (day < from || day > to) continue
    const n = y - startYear
    out.push({ event: null, day, endDay: day, title: `${yearsWord(n)} juntos`, years: n })
  }

  return out.sort(compareOccurrences)
}

/** Os próximos `n` que começam hoje ou depois (o que já começou não entra). */
export function upcoming(
  occs: readonly Occurrence[],
  today: string,
  n: number = CALENDAR_LIMITS.upcoming,
): Occurrence[] {
  return occs.filter((o) => o.day >= today).sort(compareOccurrences).slice(0, n)
}

function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(code) ?? code
  } catch {
    return code
  }
}

/** "Marau, RS" · "Lisboa, Portugal". */
function cityWithRegion(city: CalCity): string {
  return `${city.name}, ${city.countryCode === 'BR' && city.stateCode ? city.stateCode : countryName(city.countryCode)}`
}

/** I11: a segunda linha de um evento no painel. */
export function eventSubtitle(o: Occurrence, ctx: { cities: CityMap }): string {
  const e = o.event
  if (e === null) return EVENT_KIND_LABEL.data_especial
  const kind = EVENT_KIND_LABEL[e.kind]
  if (e.listItemId !== null) return `${kind} · da nossa lista`
  if ((TRAVEL_KINDS as readonly EventKind[]).includes(e.kind)) {
    const days = daysWord(daysInclusive(o.day, o.endDay))
    const city = e.cityId === null ? undefined : ctx.cities.get(e.cityId)
    return city ? `${cityWithRegion(city)} · ${days}` : `${kind} · ${days}`
  }
  if (e.kind === 'data_especial') return o.years !== null ? `${kind} · ${yearsWord(o.years)}` : kind
  if (e.kind === 'lembrete' && e.startsAt !== null) return `${kind} · até ${e.startsAt}`
  if (e.place !== null && e.place.trim() !== '') return `${kind} · ${e.place}`
  return kind
}

// ---------------------------------------------------------------------------
// Prévia do Período automático (R18)
// ---------------------------------------------------------------------------

export interface PreviewImpact {
  /** Dias juntos (home1 + home2 + away, desenhados) no ano de `from`: depois − antes. */
  togetherDeltaYear: number
  /** `'YYYY-MM'` com mais dias do evento (empate: o primeiro); `null` num intervalo vazio. */
  month: string | null
  apartBefore: number
  apartAfter: number
}

export function previewImpact(
  stays: readonly Stay[],
  entries: readonly PaintEntry[],
  members: MembersBySlot,
  event: { from: string; to: string },
): PreviewImpact {
  const after = paintStays(stays, entries, () => 'preview')
  const year = event.from.slice(0, 4)
  const yFrom = `${year}-01-01`
  const yTo = `${year}-12-31`
  const togetherDeltaYear =
    togetherOf(countDrawn(yFrom, yTo, after, members)) - togetherOf(countDrawn(yFrom, yTo, stays, members))

  const perMonth = new Map<string, number>()
  for (let d = event.from; d <= event.to; d = addDays(d, 1)) {
    const m = d.slice(0, 7)
    perMonth.set(m, (perMonth.get(m) ?? 0) + 1)
  }
  let month: string | null = null
  for (const [m, count] of perMonth) if (month === null || count > (perMonth.get(month) as number)) month = m
  if (month === null) return { togetherDeltaYear, month: null, apartBefore: 0, apartAfter: 0 }

  const [y, mm] = month.split('-').map(Number)
  const mFrom = isoOf(y, mm, 1)
  const mTo = addDays(mm === 12 ? isoOf(y + 1, 1, 1) : isoOf(y, mm + 1, 1), -1)
  return {
    togetherDeltaYear,
    month,
    apartBefore: countDrawn(mFrom, mTo, stays, members).apart,
    apartAfter: countDrawn(mFrom, mTo, after, members).apart,
  }
}

// ---------------------------------------------------------------------------
// Validação do evento (I8) — espelho de `calendar_events_format`
// ---------------------------------------------------------------------------

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/

/** `char_length` do Postgres conta code points, não unidades UTF-16. */
const charLength = (s: string): number => [...s].length

const fail = (field: EventField, reason: string): EventValidation => ({ ok: false, field, reason })

export function validateEvent(draft: EventDraft): EventValidation {
  const d = draft
  if (!(EVENT_KINDS as readonly string[]).includes(d.kind)) return fail('kind', 'Tipo de evento desconhecido.')

  const title = charLength(d.title.trim())
  if (title === 0) return fail('title', 'Dê um título ao evento.')
  if (title > CALENDAR_LIMITS.title) return fail('title', `O título tem no máximo ${CALENDAR_LIMITS.title} caracteres.`)
  if (d.note !== null && charLength(d.note) > CALENDAR_LIMITS.note) {
    return fail('note', `A nota tem no máximo ${CALENDAR_LIMITS.note} caracteres.`)
  }
  if (d.place !== null && charLength(d.place) > CALENDAR_LIMITS.place) {
    return fail('place', `O local tem no máximo ${CALENDAR_LIMITS.place} caracteres.`)
  }
  if (!ISO_DAY.test(d.startsOn)) return fail('startsOn', 'Escolha o dia.')

  const travel = (TRAVEL_KINDS as readonly EventKind[]).includes(d.kind)
  if (travel) {
    if (d.travelers === null) return fail('travelers', 'Diga quem viaja.')
    if (d.cityId === null) return fail('cityId', 'Escolha o destino.')
    if (d.endsOn === null) return fail('endsOn', 'Escolha o dia da volta.')
    if (d.place !== null) return fail('place', 'Viagem e visita não têm local, só destino.')
  } else {
    if (d.travelers !== null) return fail('travelers', 'Só viagem e visita têm quem viaja.')
    if (d.travelerId !== null) return fail('travelerId', 'Só viagem e visita têm quem viaja.')
    if (d.cityId !== null) return fail('cityId', 'Só viagem e visita têm destino.')
  }
  if (d.travelers === 'solo' && d.travelerId === null) return fail('travelerId', 'Escolha quem viaja.')
  if (d.travelers !== 'solo' && d.travelerId !== null) return fail('travelerId', 'Com os dois viajando, não há um viajante só.')

  if (d.endsOn !== null) {
    if (!(travel || d.kind === 'compromisso')) return fail('endsOn', 'Esse tipo de evento é de um dia só.')
    if (!ISO_DAY.test(d.endsOn) || d.endsOn < d.startsOn) return fail('endsOn', 'O fim precisa ser no dia do início ou depois.')
    if (diffDays(d.startsOn, d.endsOn) >= CALENDAR_LIMITS.spanDays) {
      return fail('endsOn', `No máximo ${CALENDAR_LIMITS.spanDays} dias.`)
    }
  }
  if (d.repeatsYearly && d.kind !== 'data_especial') return fail('repeatsYearly', 'Só data especial se repete todo ano.')
  if (d.place !== null && !(d.kind === 'date' || d.kind === 'compromisso')) {
    return fail('place', 'Esse tipo de evento não tem local.')
  }

  if (d.allDay && d.startsAt !== null) return fail('startsAt', 'Dia inteiro não tem hora.')
  if (d.allDay && d.endsAt !== null) return fail('endsAt', 'Dia inteiro não tem hora de volta.')
  if (d.startsAt !== null && !HH_MM.test(d.startsAt)) return fail('startsAt', 'Hora inválida.')
  if (d.endsAt !== null) {
    if (!travel) return fail('endsAt', 'Só viagem e visita têm hora de volta.')
    if (!HH_MM.test(d.endsAt)) return fail('endsAt', 'Hora inválida.')
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Grade do mês
// ---------------------------------------------------------------------------

/**
 * As semanas (7 dias cada, com os dias dos meses vizinhos) que cobrem o mês.
 * `month` é 1-based, como na string ISO — `monthWeeks(2026, 9, …)` é setembro.
 */
export function monthWeeks(year: number, month: number, weekStartsOn: 'sun' | 'mon'): string[][] {
  const first = isoOf(year, month, 1)
  const nextFirst = month === 12 ? isoOf(year + 1, 1, 1) : isoOf(year, month + 1, 1)
  const offset = (weekdayOf(first) - (weekStartsOn === 'mon' ? 1 : 0) + 7) % 7
  const weeks: string[][] = []
  for (let start = addDays(first, -offset); start < nextFirst; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)))
  }
  return weeks
}
