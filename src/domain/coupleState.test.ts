import { describe, expect, it } from 'vitest'
import { daysInclusive } from '../lib/date'
import {
  coupleStateOn,
  countStates,
  effectiveEndForCounting,
  effectiveEndForDisplay,
  stayOn,
} from './coupleState'
import type { Member, Stay } from './coupleState'

const SJC = 'city-sjc'
const MARAU = 'city-marau'
const LONDRINA = 'city-londrina'
const LISBOA = 'city-lisboa'

const G = 'profile-gabriel'
const L = 'profile-lana'

/** Gabriel mora em SJC, Lana em Marau. */
const MEMBERS: readonly [Member, Member] = [
  { profileId: G, homeCityId: SJC },
  { profileId: L, homeCityId: MARAU },
]

function stay(profileId: string, startsOn: string, endsOn: string | null, cityId: string): Stay {
  return { id: `${profileId}-${startsOn}`, profileId, cityId, startsOn, endsOn }
}

/** O histórico real do casal, o mesmo que hoje vive em `seedStays.ts`. */
const HISTORY: readonly Stay[] = [
  stay(G, '2026-07-15', '2026-07-31', LONDRINA),
  stay(L, '2026-07-15', '2026-07-31', LONDRINA),
  stay(G, '2026-08-01', '2026-08-17', SJC),
  stay(L, '2026-08-01', '2026-08-10', SJC),
  stay(L, '2026-08-11', '2026-08-29', MARAU),
  stay(G, '2026-08-18', '2026-08-29', MARAU),
  stay(G, '2026-08-30', '2026-09-11', SJC),
  stay(L, '2026-08-30', '2026-09-11', SJC),
  stay(G, '2026-09-12', '2026-09-21', MARAU),
  stay(L, '2026-09-12', null, MARAU),
  stay(G, '2026-09-22', null, SJC),
]

describe('stayOn — bordas do intervalo inclusivo', () => {
  const stays = [stay(G, '2026-09-10', '2026-09-12', SJC)]

  it('inclui o primeiro dia', () => {
    expect(stayOn(stays, G, '2026-09-10')?.cityId).toBe(SJC)
  })

  it('inclui o último dia', () => {
    expect(stayOn(stays, G, '2026-09-12')?.cityId).toBe(SJC)
  })

  it('exclui o dia anterior ao início', () => {
    expect(stayOn(stays, G, '2026-09-09')).toBeUndefined()
  })

  it('exclui o dia seguinte ao fim', () => {
    expect(stayOn(stays, G, '2026-09-13')).toBeUndefined()
  })

  // Este é o comportamento que o código antigo errava: ele capava o fim em
  // "hoje", então a estadia em aberto desaparecia em todo dia futuro.
  it('estadia em aberto vale num dia futuro, não para em hoje', () => {
    const open = [stay(G, '2026-09-22', null, SJC)]
    expect(stayOn(open, G, '2027-03-01')?.cityId).toBe(SJC)
  })
})

describe('coupleStateOn — os quatro estados do design, mais a lacuna', () => {
  it('mesma cidade, casa do Gabriel → together com ele como host', () => {
    const stays = [stay(G, '2026-09-01', '2026-09-05', SJC), stay(L, '2026-09-01', '2026-09-05', SJC)]
    const state = coupleStateOn('2026-09-03', stays, MEMBERS)
    expect(state).toEqual({ kind: 'together', cityId: SJC, hostProfileIds: [G] })
  })

  it('mesma cidade, casa da Lana → together com ela como host', () => {
    const stays = [
      stay(G, '2026-09-01', '2026-09-05', MARAU),
      stay(L, '2026-09-01', '2026-09-05', MARAU),
    ]
    const state = coupleStateOn('2026-09-03', stays, MEMBERS)
    expect(state).toEqual({ kind: 'together', cityId: MARAU, hostProfileIds: [L] })
  })

  it('mesma cidade que não é casa de ninguém → together sem host (viajando juntos)', () => {
    const stays = [
      stay(G, '2026-10-01', '2026-10-09', LISBOA),
      stay(L, '2026-10-01', '2026-10-09', LISBOA),
    ]
    const state = coupleStateOn('2026-10-05', stays, MEMBERS)
    expect(state).toEqual({ kind: 'together', cityId: LISBOA, hostProfileIds: [] })
  })

  it('cidades diferentes → apart, com a posição de cada um', () => {
    const stays = [
      stay(G, '2026-09-22', null, SJC),
      stay(L, '2026-09-12', null, MARAU),
    ]
    expect(coupleStateOn('2026-09-25', stays, MEMBERS)).toEqual({
      kind: 'apart',
      positions: [
        { profileId: G, cityId: SJC },
        { profileId: L, cityId: MARAU },
      ],
    })
  })

  it('só um dos dois com estadia → unknown, nunca apart', () => {
    const stays = [stay(G, '2026-09-22', null, SJC)]
    expect(coupleStateOn('2026-09-25', stays, MEMBERS)).toEqual({ kind: 'unknown' })
  })

  it('nenhum dos dois com estadia → unknown', () => {
    expect(coupleStateOn('2026-01-01', HISTORY, MEMBERS)).toEqual({ kind: 'unknown' })
  })

  it('os dois morando na mesma cidade → together com os dois como host', () => {
    const livingTogether: readonly [Member, Member] = [
      { profileId: G, homeCityId: SJC },
      { profileId: L, homeCityId: SJC },
    ]
    const stays = [stay(G, '2027-01-01', null, SJC), stay(L, '2027-01-01', null, SJC)]
    const state = coupleStateOn('2027-02-01', stays, livingTogether)
    expect(state).toEqual({ kind: 'together', cityId: SJC, hostProfileIds: [G, L] })
  })
})

describe('fim efetivo — duas funções, porque são duas perguntas', () => {
  const today = '2026-09-25'

  it('contagem: estadia em aberto para em hoje', () => {
    expect(effectiveEndForCounting(stay(L, '2026-09-12', null, MARAU), today)).toBe(today)
  })

  it('contagem: fim no futuro é capado em hoje', () => {
    expect(effectiveEndForCounting(stay(G, '2026-09-20', '2026-12-31', SJC), today)).toBe(today)
  })

  it('contagem: fim no passado é respeitado', () => {
    expect(effectiveEndForCounting(stay(G, '2026-09-12', '2026-09-21', MARAU), today)).toBe(
      '2026-09-21',
    )
  })

  it('exibição: estadia em aberto vai até a borda da janela, não até hoje', () => {
    expect(effectiveEndForDisplay(stay(L, '2026-09-12', null, MARAU), '2026-10-31')).toBe(
      '2026-10-31',
    )
  })

  it('exibição: fim explícito é respeitado mesmo com janela maior', () => {
    expect(effectiveEndForDisplay(stay(G, '2026-09-12', '2026-09-21', MARAU), '2026-10-31')).toBe(
      '2026-09-21',
    )
  })
})

describe('countStates — agregação sobre a derivação', () => {
  it('estadia de um dia só dura um dia', () => {
    expect(daysInclusive('2026-09-12', '2026-09-12')).toBe(1)
    const stays = [
      stay(G, '2026-09-12', '2026-09-12', MARAU),
      stay(L, '2026-09-12', '2026-09-12', MARAU),
    ]
    expect(countStates('2026-09-12', '2026-09-12', '2026-09-30', stays, MEMBERS)).toEqual({
      together: 1,
      apart: 0,
      unknown: 0,
    })
  })

  // Números de ouro: conferidos por cálculo independente antes de existir código.
  it('setembro/2026 sobre o histórico real, com hoje = 25/09', () => {
    expect(countStates('2026-09-01', '2026-09-30', '2026-09-25', HISTORY, MEMBERS)).toEqual({
      together: 21,
      apart: 4,
      unknown: 0,
    })
  })

  it('os 21 dias juntos se repartem em 11 em SJC e 10 em Marau', () => {
    const hosts: Record<string, number> = {}
    for (let d = 1; d <= 25; d++) {
      const day = `2026-09-${String(d).padStart(2, '0')}`
      const state = coupleStateOn(day, HISTORY, MEMBERS)
      if (state.kind === 'together') {
        const key = state.hostProfileIds.join('+') || 'nenhum'
        hosts[key] = (hosts[key] ?? 0) + 1
      }
    }
    expect(hosts).toEqual({ [G]: 11, [L]: 10 })
  })

  it('dia futuro não é contado: o intervalo é capado em hoje', () => {
    const full = countStates('2026-09-01', '2026-09-30', '2026-09-25', HISTORY, MEMBERS)
    expect(full.together + full.apart + full.unknown).toBe(25)

    const asIfLater = countStates('2026-09-01', '2026-09-30', '2026-12-31', HISTORY, MEMBERS)
    expect(asIfLater.together + asIfLater.apart + asIfLater.unknown).toBe(30)
    expect(asIfLater.apart).toBe(9)
  })
})
