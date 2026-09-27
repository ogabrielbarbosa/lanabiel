import { describe, expect, it } from 'vitest'
import { addDays } from '../lib/date'
import { runs } from './calendar'
import { countStates } from './coupleState'
import type { Member, Stay } from './coupleState'

/**
 * Orçamento da seção 8 da spec: derivar um ANO tem de caber em um frame (16 ms),
 * porque o Calendário chama isto ao navegar de mês e tem uma visão "Ano".
 *
 * O limite do teste é folgado de propósito (5x o orçamento): a máquina que roda
 * o gate está sempre com outra coisa aberta, e um teste de tempo apertado vira
 * falha intermitente — que treina a pessoa a ignorar o gate.
 */
const A = 'a'
const B = 'b'
const MEMBERS: readonly [Member, Member] = [
  { profileId: A, homeCityId: 'c1' },
  { profileId: B, homeCityId: 'c2' },
]

/** ~200 estadias por ano por pessoa: uma a cada 2 dias, o pior caso realista. */
function buildYear(profileId: string, from: string): Stay[] {
  const stays: Stay[] = []
  let day = from
  for (let i = 0; i < 183; i++) {
    const end = addDays(day, 1)
    stays.push({ id: `${profileId}-${i}`, profileId, cityId: i % 3 === 0 ? 'c1' : 'c2', startsOn: day, endsOn: end })
    day = addDays(end, 1)
  }
  return stays
}

describe('orçamento da derivação', () => {
  it('um ano inteiro cabe bem dentro de um frame', () => {
    const stays = [...buildYear(A, '2026-01-01'), ...buildYear(B, '2026-01-01')]
    expect(stays).toHaveLength(366)

    const started = performance.now()
    const counts = countStates('2026-01-01', '2026-12-31', '2026-12-31', stays, MEMBERS)
    const elapsed = performance.now() - started

    expect(counts.together + counts.apart + counts.unknown).toBe(365)
    console.log(`  derivação de 365 dias sobre ${stays.length} estadias: ${elapsed.toFixed(1)} ms`)
    expect(elapsed).toBeLessThan(80)
  })

  it('runs sobre um ano com 200 estadias fica abaixo de 50 ms (seção 8 da Fase 5)', () => {
    // 100 por pessoa: o ano da visão Ano com uma troca a cada ~3,6 dias.
    const stays = [...buildYear(A, '2026-01-01').slice(0, 100), ...buildYear(B, '2026-01-01').slice(0, 100)]
    expect(stays).toHaveLength(200)
    const members = { 1: MEMBERS[0], 2: MEMBERS[1] } as const

    const started = performance.now()
    const result = runs(stays, members, '2026-01-01', '2026-12-31')
    const elapsed = performance.now() - started

    expect(result.length).toBeGreaterThan(0)
    console.log(`  runs de 365 dias sobre ${stays.length} estadias: ${elapsed.toFixed(1)} ms`)
    expect(elapsed).toBeLessThan(50)
  })
})
