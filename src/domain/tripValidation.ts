// As validações das Viagens: o espelho, campo a campo, dos CHECK da migration
// `20260927120000_trips.sql` (spec I13). Puras, sem Supabase.
//
// A MESMA tabela de casos (`tripValidationCases.ts`) roda aqui
// (`tripValidation.test.ts`) e contra o banco (`supabase/tests/trips.test.ts`),
// A2 — é assim que "a regra mora num lugar só" se prova. Mudou um CHECK, muda
// aqui e acrescenta o caso.
//
// Duas coisas que precisam casar com o Postgres ao pé da letra:
//  · tamanho é `char_length`, que conta pontos de código — não `.length`, que
//    conta unidades UTF-16 e daria 2 para um emoji;
//  · "em branco" é o que sobra do `btrim`, que por padrão tira só ESPAÇO. Um
//    `.trim()` do JS tiraria também tab e quebra de linha, e o domínio recusaria
//    o que o banco aceita.
//
// O que é trigger e não CHECK (o dia dentro da viagem, os tetos por viagem, o
// integrante do casal) não mora aqui: depende de outras linhas.

import type {
  BudgetDraft,
  ItineraryDraft,
  Lodging,
  MemoryDraft,
  PrepDraft,
  TripDeparture,
} from './trips'
import { ITINERARY_KINDS, PREP_KINDS, TRIP_LIMITS } from './trips'

export type TripValidation<F extends string> = { ok: true } | { ok: false; field: F; reason: string }

export type ItineraryField = keyof ItineraryDraft
export type PrepField = keyof PrepDraft
export type BudgetField = keyof BudgetDraft
export type MemoryField = keyof MemoryDraft
export type LodgingField = keyof Lodging
export type DepartureField = keyof TripDeparture
export type DayTitleField = 'title'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/
/** A coluna é `timestamp` sem fuso; o cliente manda `YYYY-MM-DDTHH:MM`. */
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/
/** `trip_lodging_url_format`: `~* '^https?://'`. */
const LINK_SCHEME = /^https?:\/\//i

const charLength = (s: string): number => [...s].length

/** O `btrim(x)` do Postgres com o padrão: só espaço, nas duas pontas. */
export const trimSpaces = (s: string): string => s.replace(/^ +| +$/g, '')

const ok = { ok: true } as const

function fail<F extends string>(field: F, reason: string): TripValidation<F> {
  return { ok: false, field, reason }
}

/** `char_length(btrim(x)) between 1 and max` — o formato de todo texto daqui. */
function textIssue(value: string, max: number, blank: string): string | null {
  const n = charLength(trimSpaces(value))
  if (n === 0) return blank
  if (n > max) return `No máximo ${max} caracteres.`
  return null
}

/** Texto opcional: nulo passa; presente, segue a mesma regra. */
function optionalTextIssue(value: string | null, max: number): string | null {
  return value === null ? null : textIssue(value, max, 'Em branco não vale: apague ou escreva algo.')
}

const centsOk = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= TRIP_LIMITS.centsMax

// ---------------------------------------------------------------------------

/** `trip_itinerary_items`: `trip_itinerary_kind`, `_title_len`, `_note_len`. */
export function validateItinerary(d: ItineraryDraft): TripValidation<ItineraryField> {
  if (!(ITINERARY_KINDS as readonly string[]).includes(d.kind)) return fail('kind', 'Tipo de item desconhecido.')
  const title = textIssue(d.title, TRIP_LIMITS.itineraryTitle, 'Dê um título ao item.')
  if (title) return fail('title', title)
  const note = optionalTextIssue(d.note, TRIP_LIMITS.itineraryNote)
  if (note) return fail('note', note)
  if (!ISO_DAY.test(d.day)) return fail('day', 'Escolha o dia.')
  if (d.at !== null && !HH_MM.test(d.at)) return fail('at', 'Hora inválida.')
  return ok
}

/** `trip_prep_items`: `trip_prep_kind`, `_label_len`, `_detail_len`. */
export function validatePrep(d: PrepDraft): TripValidation<PrepField> {
  if (!(PREP_KINDS as readonly string[]).includes(d.kind)) return fail('kind', 'Tipo de preparação desconhecido.')
  const label = textIssue(d.label, TRIP_LIMITS.prepLabel, 'Dê um nome ao item.')
  if (label) return fail('label', label)
  const detail = optionalTextIssue(d.detail, TRIP_LIMITS.prepDetail)
  if (detail) return fail('detail', detail)
  return ok
}

/** `trip_budget_lines`: `trip_budget_label_len`, `trip_budget_cents`. */
export function validateBudget(d: BudgetDraft): TripValidation<BudgetField> {
  const label = textIssue(d.label, TRIP_LIMITS.budgetLabel, 'Dê um nome à linha.')
  if (label) return fail('label', label)
  if (!centsOk(d.plannedCents)) return fail('plannedCents', 'Valor planejado inválido.')
  if (!centsOk(d.spentCents)) return fail('spentCents', 'Valor gasto inválido.')
  return ok
}

/** `trip_memories`: `trip_memory_rating`, `trip_memory_body_len`. */
export function validateMemory(d: MemoryDraft): TripValidation<MemoryField> {
  if (!Number.isInteger(d.rating) || d.rating < TRIP_LIMITS.ratingMin || d.rating > TRIP_LIMITS.ratingMax) {
    return fail('rating', `Dê uma nota de ${TRIP_LIMITS.ratingMin} a ${TRIP_LIMITS.ratingMax}.`)
  }
  const body = textIssue(d.body, TRIP_LIMITS.memoryBody, 'Escreva a memória.')
  if (body) return fail('body', body)
  return ok
}

/** As colunas `lodging_*` de `trips`: `trip_lodging_*`. */
export function validateLodging(l: Lodging): TripValidation<LodgingField> {
  const name = optionalTextIssue(l.name, TRIP_LIMITS.lodgingName)
  if (name) return fail('name', name)
  const address = optionalTextIssue(l.address, TRIP_LIMITS.lodgingAddress)
  if (address) return fail('address', address)
  if (l.url !== null) {
    if (!LINK_SCHEME.test(l.url)) return fail('url', 'O link precisa começar com http:// ou https://.')
    if (charLength(l.url) > TRIP_LIMITS.lodgingUrl) return fail('url', `No máximo ${TRIP_LIMITS.lodgingUrl} caracteres.`)
  }
  const code = optionalTextIssue(l.code, TRIP_LIMITS.lodgingCode)
  if (code) return fail('code', code)
  if (l.cents !== null && !centsOk(l.cents)) return fail('cents', 'Valor inválido.')
  // Não é CHECK: é o tipo da coluna (`timestamp`), que recusaria com 22007.
  if (l.checkIn !== null && !LOCAL_DATE_TIME.test(l.checkIn)) return fail('checkIn', 'Data e hora inválidas.')
  if (l.checkOut !== null && !LOCAL_DATE_TIME.test(l.checkOut)) return fail('checkOut', 'Data e hora inválidas.')
  return ok
}

/** `trip_departures`: `trip_departure_origin_len`, `trip_departure_note_len`. */
export function validateDeparture(d: TripDeparture): TripValidation<DepartureField> {
  // Ser do casal é o trigger `trip_member`; aqui só a presença.
  if (d.profileId === '') return fail('profileId', 'Diga de quem é a saída.')
  const origin = optionalTextIssue(d.originCode, TRIP_LIMITS.originCode)
  if (origin) return fail('originCode', origin)
  const note = optionalTextIssue(d.note, TRIP_LIMITS.departureNote)
  if (note) return fail('note', note)
  return ok
}

/** `trip_days`: `trip_day_title_len`. */
export function validateDayTitle(title: string): TripValidation<DayTitleField> {
  const issue = textIssue(title, TRIP_LIMITS.dayTitle, 'Dê um título ao dia.')
  return issue ? fail('title', issue) : ok
}

/** `trip_photo_caption_len` — a legenda de uma foto (nula = sem legenda). */
export function validateCaption(caption: string | null): TripValidation<'caption'> {
  const issue = optionalTextIssue(caption, TRIP_LIMITS.caption)
  return issue ? fail('caption', issue) : ok
}
