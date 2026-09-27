// A mesma tabela de casos roda contra `validateEvent` (src/domain/calendar.test.ts)
// e contra `calendar_events_format` e os CHECK de tamanho no banco
// (supabase/tests/calendar.test.ts) — A3.
//
// `travelerId` e `cityId` são SIMBÓLICOS: `TRAVELER` e `CITY` são trocados por
// um perfil do casal e uma cidade do IBGE pelo lado do banco. O domínio só
// confere presença, então qualquer string serve para ele.

import type { EventDraft, EventField } from './calendar'

export const TRAVELER = '$traveler'
export const CITY = '$city'

export interface EventValidationCase {
  name: string
  draft: EventDraft
  /** `null` = válido. O banco só confere aceita/recusa; o domínio confere o campo. */
  failsOn: EventField | null
}

const visit: EventDraft = {
  kind: 'visita',
  title: 'Feriado de Finados em Marau',
  startsOn: '2026-10-30',
  endsOn: '2026-11-03',
  allDay: false,
  startsAt: '19:20',
  endsAt: '21:05',
  travelers: 'solo',
  travelerId: TRAVELER,
  cityId: CITY,
  place: null,
  repeatsYearly: false,
  note: 'Levar o vinho do Porto',
  listItemId: null,
}

const date: EventDraft = {
  kind: 'date',
  title: 'Jantar na Casa Amarela',
  startsOn: '2026-09-25',
  endsOn: null,
  allDay: false,
  startsAt: '20:00',
  endsAt: null,
  travelers: null,
  travelerId: null,
  cityId: null,
  place: 'Casa Amarela Bistrô',
  repeatsYearly: false,
  note: null,
  listItemId: null,
}

const allDay = { allDay: true, startsAt: null, endsAt: null } as const

export const EVENT_VALIDATION_CASES: EventValidationCase[] = [
  // Válidos — um por tipo, e as bordas de tamanho.
  { name: 'visita solo com horas', draft: visit, failsOn: null },
  {
    name: 'viagem dos dois, dia inteiro',
    draft: { ...visit, kind: 'viagem', title: 'Lisboa', travelers: 'both', travelerId: null, ...allDay },
    failsOn: null,
  },
  { name: 'date com hora e local', draft: date, failsOn: null },
  {
    name: 'data especial anual',
    draft: { ...date, kind: 'data_especial', title: 'Aniversário da Lana', startsOn: '1999-10-18', place: null, repeatsYearly: true, ...allDay },
    failsOn: null,
  },
  {
    name: 'compromisso de vários dias com local',
    draft: { ...date, kind: 'compromisso', title: 'Congresso do Gabriel', startsOn: '2026-10-24', endsOn: '2026-10-26', place: 'São Paulo', startsAt: '09:00' },
    failsOn: null,
  },
  {
    name: 'lembrete com hora-limite',
    draft: { ...date, kind: 'lembrete', title: 'Fazer check-in TAP', place: null, startsAt: '23:59' },
    failsOn: null,
  },
  { name: 'date sem hora e sem dia inteiro (hora é opcional)', draft: { ...date, startsAt: null }, failsOn: null },
  { name: 'título com 80', draft: { ...date, title: 'a'.repeat(80) }, failsOn: null },
  { name: 'nota com 280', draft: { ...date, note: 'a'.repeat(280) }, failsOn: null },
  { name: 'local com 80', draft: { ...date, place: 'a'.repeat(80) }, failsOn: null },
  { name: 'viagem de 366 dias corridos', draft: { ...visit, startsOn: '2026-01-01', endsOn: '2026-12-31' }, failsOn: null },
  { name: 'visita de um dia só', draft: { ...visit, endsOn: visit.startsOn }, failsOn: null },

  // Tamanhos
  { name: 'título vazio', draft: { ...date, title: '   ' }, failsOn: 'title' },
  { name: 'título com 81', draft: { ...date, title: 'a'.repeat(81) }, failsOn: 'title' },
  { name: 'nota com 281', draft: { ...date, note: 'a'.repeat(281) }, failsOn: 'note' },
  { name: 'local com 81', draft: { ...date, place: 'a'.repeat(81) }, failsOn: 'place' },

  // Viagem e visita
  { name: 'visita sem destino', draft: { ...visit, cityId: null }, failsOn: 'cityId' },
  { name: 'viagem sem quem viaja', draft: { ...visit, kind: 'viagem', travelers: null, travelerId: null }, failsOn: 'travelers' },
  { name: 'visita sem volta', draft: { ...visit, endsOn: null, endsAt: null }, failsOn: 'endsOn' },
  { name: 'visita com local', draft: { ...visit, place: 'Casa da Lana' }, failsOn: 'place' },
  { name: 'solo sem viajante', draft: { ...visit, travelerId: null }, failsOn: 'travelerId' },
  { name: 'os dois com viajante', draft: { ...visit, travelers: 'both' }, failsOn: 'travelerId' },
  { name: 'volta antes da ida', draft: { ...visit, endsOn: '2026-10-29' }, failsOn: 'endsOn' },
  { name: 'viagem de 367 dias corridos', draft: { ...visit, startsOn: '2026-01-01', endsOn: '2027-01-01' }, failsOn: 'endsOn' },

  // Os outros tipos
  { name: 'date com destino', draft: { ...date, cityId: CITY }, failsOn: 'cityId' },
  { name: 'date com quem viaja', draft: { ...date, travelers: 'both' }, failsOn: 'travelers' },
  { name: 'date com viajante', draft: { ...date, travelerId: TRAVELER }, failsOn: 'travelerId' },
  { name: 'lembrete com fim', draft: { ...date, kind: 'lembrete', place: null, endsOn: '2026-09-26' }, failsOn: 'endsOn' },
  { name: 'date com fim', draft: { ...date, endsOn: '2026-09-26' }, failsOn: 'endsOn' },
  { name: 'lembrete com local', draft: { ...date, kind: 'lembrete' }, failsOn: 'place' },
  { name: 'data especial com local', draft: { ...date, kind: 'data_especial' }, failsOn: 'place' },
  { name: 'compromisso que repete todo ano', draft: { ...date, kind: 'compromisso', repeatsYearly: true }, failsOn: 'repeatsYearly' },
  { name: 'date que repete todo ano', draft: { ...date, repeatsYearly: true }, failsOn: 'repeatsYearly' },

  // Horas
  { name: 'dia inteiro com hora', draft: { ...date, allDay: true }, failsOn: 'startsAt' },
  { name: 'dia inteiro com hora de volta', draft: { ...visit, allDay: true, startsAt: null }, failsOn: 'endsAt' },
  { name: 'hora de volta num date', draft: { ...date, endsAt: '22:00' }, failsOn: 'endsAt' },
]
