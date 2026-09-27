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

import type { Member, Stay } from './coupleState'

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
