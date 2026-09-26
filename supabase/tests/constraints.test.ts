import { beforeAll, describe, expect, it } from 'vitest'
import { insertStay } from '../../src/data/stays'
import { admin, buildScenario, CITY, signIn } from './harness'
import type { Db, Scenario } from './harness'

let scene: Scenario
let asGabriel: Db

beforeAll(async () => {
  scene = await buildScenario('cst')
  asGabriel = await signIn(scene.gabriel.email)
}, 60_000)

describe('A4 — uma pessoa não está em dois lugares no mesmo dia', () => {
  it('a primeira estadia em aberto entra', async () => {
    const result = await insertStay(asGabriel, {
      coupleId: scene.coupleA,
      profileId: scene.lana.id,
      cityId: CITY.marau,
      startsOn: '2026-09-12',
      endsOn: null,
    })
    expect(result.status).toBe('ok')
  })

  // O caso que a spec proibiu supor: `daterange(starts_on, null, '[]')` tem de
  // ser superiormente ilimitado, senão duas estadias em aberto conviveriam.
  it('uma SEGUNDA estadia em aberto da mesma pessoa é rejeitada', async () => {
    const result = await insertStay(asGabriel, {
      coupleId: scene.coupleA,
      profileId: scene.lana.id,
      cityId: CITY.sjc,
      startsOn: '2026-11-01',
      endsOn: null,
    })
    expect(result.status).toBe('overlapping_stay')
  })

  it('uma estadia fechada DENTRO da em aberto é rejeitada', async () => {
    const result = await insertStay(asGabriel, {
      coupleId: scene.coupleA,
      profileId: scene.lana.id,
      cityId: CITY.sjc,
      startsOn: '2026-09-18',
      endsOn: '2026-09-22',
    })
    expect(result.status).toBe('overlapping_stay')
  })

  it('dias adjacentes passam: fim em 21, a próxima começa em 22', async () => {
    const first = await insertStay(asGabriel, {
      coupleId: scene.coupleA,
      profileId: scene.gabriel.id,
      cityId: CITY.marau,
      startsOn: '2026-09-12',
      endsOn: '2026-09-21',
    })
    expect(first.status).toBe('ok')

    const second = await insertStay(asGabriel, {
      coupleId: scene.coupleA,
      profileId: scene.gabriel.id,
      cityId: CITY.sjc,
      startsOn: '2026-09-22',
      endsOn: null,
    })
    expect(second.status).toBe('ok')
  })

  it('fim antes do início é rejeitado', async () => {
    const result = await insertStay(asGabriel, {
      coupleId: scene.coupleA,
      profileId: scene.gabriel.id,
      cityId: CITY.sjc,
      startsOn: '2028-05-10',
      endsOn: '2028-05-01',
    })
    expect(result.status).toBe('error')
  })
})

describe('I8 — um casal tem no máximo dois integrantes', () => {
  it('um terceiro membro é rejeitado, com slot ocupado ou fora da faixa', async () => {
    const takenSlot = await admin
      .from('couple_members')
      .insert({ couple_id: scene.coupleA, profile_id: scene.outsider.id, slot: 1 })
    expect(takenSlot.error?.message).toContain('couple_members_slot_unique')

    const outOfRange = await admin
      .from('couple_members')
      .insert({ couple_id: scene.coupleA, profile_id: scene.outsider.id, slot: 3 })
    expect(outOfRange.error?.message).toContain('couple_members_slot_values')
  })
})

describe('A11 — o seed de cidades é idempotente', () => {
  it('as três cidades existem, uma vez cada', async () => {
    // Desde a Fase 2 a tabela tem os municípios do IBGE (ADR 0007). O que
    // continua valendo é: cada uma das três do seed original aparece uma vez,
    // com o UUID fixo que o resto do código referencia.
    const { data, error } = await admin
      .from('cities')
      .select('id, name')
      .in('name', ['Londrina', 'Marau', 'São José dos Campos'])
      .eq('country_code', 'BR')
      .order('name')
    expect(error).toBeNull()
    expect(data).toEqual([
      { id: CITY.londrina, name: 'Londrina' },
      { id: CITY.marau, name: 'Marau' },
      { id: CITY.sjc, name: 'São José dos Campos' },
    ])
  })
})
