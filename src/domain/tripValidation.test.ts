// A2 (lado do domínio) — .agent/Tasks/fase-6-viagens.md, seção 10. A MESMA
// tabela roda contra o banco em supabase/tests/trips.test.ts.

import { describe, expect, it } from 'vitest'
import { EMPTY_LODGING, TRIP_LIMITS } from './trips'
import type { ItineraryDraft, Lodging } from './trips'
import { TRIP_VALIDATION_CASES } from './tripValidationCases'
import type { TripValidationCase } from './tripValidationCases'
import {
  trimSpaces,
  validateBudget,
  validateCaption,
  validateDayTitle,
  validateDeparture,
  validateItinerary,
  validateLodging,
  validateMemory,
  validatePrep,
} from './tripValidation'

function run(c: TripValidationCase) {
  switch (c.target) {
    case 'itinerary':
      return validateItinerary(c.draft)
    case 'prep':
      return validatePrep(c.draft)
    case 'budget':
      return validateBudget(c.draft)
    case 'memory':
      return validateMemory(c.draft)
    case 'lodging':
      return validateLodging(c.draft)
    case 'departure':
      return validateDeparture(c.draft)
    case 'dayTitle':
      return validateDayTitle(c.draft)
    case 'caption':
      return validateCaption(c.draft)
  }
}

describe('A2 — TRIP_VALIDATION_CASES, do lado do domínio', () => {
  for (const c of TRIP_VALIDATION_CASES) {
    const expected = c.failsOn === null ? 'aceita' : `recusa (${c.failsOn})`
    it(`${c.target}: ${c.name} → ${expected}`, () => {
      const result = run(c)
      if (c.failsOn === null) {
        expect(result).toEqual({ ok: true })
      } else {
        expect(result).toMatchObject({ ok: false, field: c.failsOn })
      }
    })
  }

  it('cobre todos os alvos, com casos válidos e inválidos em cada um', () => {
    const targets = new Set(TRIP_VALIDATION_CASES.map((c) => c.target))
    for (const t of targets) {
      const of = TRIP_VALIDATION_CASES.filter((c) => c.target === t)
      expect(of.some((c) => c.failsOn === null), t).toBe(true)
      expect(of.some((c) => c.failsOn !== null), t).toBe(true)
    }
    expect([...targets].sort()).toEqual(['budget', 'caption', 'dayTitle', 'departure', 'itinerary', 'lodging', 'memory', 'prep'])
  })
})

// O que o banco recusa pelo TIPO da coluna (outro SQLSTATE), não por CHECK —
// por isso fora da tabela compartilhada.
describe('só no domínio — o que é tipo de coluna, não CHECK', () => {
  const item: ItineraryDraft = { day: '2027-01-10', at: null, title: 'Belém', kind: 'cidade', note: null, listItemId: null }

  it('dia e hora do roteiro malformados', () => {
    expect(validateItinerary({ ...item, day: '10/01/2027' })).toMatchObject({ field: 'day' })
    expect(validateItinerary({ ...item, at: '24:00' })).toMatchObject({ field: 'at' })
    expect(validateItinerary({ ...item, at: '9:30' })).toMatchObject({ field: 'at' })
    expect(validateItinerary({ ...item, at: '23:59' })).toEqual({ ok: true })
  })

  it('nota quebrada e centavo quebrado', () => {
    expect(validateMemory({ rating: 2.5, body: 'ok' })).toMatchObject({ field: 'rating' })
    expect(validateBudget({ label: 'x', plannedCents: 10.5, spentCents: 0 })).toMatchObject({ field: 'plannedCents' })
    expect(validateBudget({ label: 'x', plannedCents: Number.NaN, spentCents: 0 })).toMatchObject({ field: 'plannedCents' })
    expect(validateLodging({ ...EMPTY_LODGING, cents: 0.1 })).toMatchObject({ field: 'cents' })
  })

  it('check-in e check-out: `YYYY-MM-DDTHH:MM`, hora local', () => {
    const l: Lodging = { ...EMPTY_LODGING, checkIn: '2027-01-08T15:00', checkOut: '2027-01-14T11:00' }
    expect(validateLodging(l)).toEqual({ ok: true })
    expect(validateLodging({ ...l, checkIn: '2027-01-08 15:00' })).toMatchObject({ field: 'checkIn' })
    expect(validateLodging({ ...l, checkOut: '2027-01-14T11:00:00Z' })).toMatchObject({ field: 'checkOut' })
  })

  it('saída sem pessoa', () => {
    expect(validateDeparture({ profileId: '', originCode: null, note: null })).toMatchObject({ field: 'profileId' })
  })
})

describe('trimSpaces — o `btrim` do Postgres', () => {
  it('tira só espaço, das duas pontas', () => {
    expect(trimSpaces('  a b  ')).toBe('a b')
    // `btrim` sem segundo argumento não tira tab nem quebra de linha: um texto
    // só de `\n` passa no CHECK, e o domínio não pode recusá-lo.
    expect(trimSpaces('\n')).toBe('\n')
    expect(validateDayTitle('\t')).toEqual({ ok: true })
  })

  it('o limite conta pontos de código, não unidades UTF-16', () => {
    expect(validateDayTitle('\u{1F30A}'.repeat(TRIP_LIMITS.dayTitle))).toEqual({ ok: true })
    expect(validateDayTitle('\u{1F30A}'.repeat(TRIP_LIMITS.dayTitle + 1))).toMatchObject({ field: 'title' })
  })
})
