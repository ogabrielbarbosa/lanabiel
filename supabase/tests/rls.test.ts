import { beforeAll, describe, expect, it } from 'vitest'
import { insertStay, listMembers, listStays } from '../../src/data/stays'
import { admin, anonClient, buildScenario, CITY, signIn } from './harness'
import type { Db, Scenario } from './harness'

let scene: Scenario
let asGabriel: Db
let asOutsider: Db

beforeAll(async () => {
  scene = await buildScenario('rls')

  await admin.from('stays').insert([
    { couple_id: scene.coupleA, profile_id: scene.gabriel.id, city_id: CITY.sjc, starts_on: '2026-09-22', ends_on: null },
    { couple_id: scene.coupleA, profile_id: scene.lana.id, city_id: CITY.marau, starts_on: '2026-09-12', ends_on: null },
    { couple_id: scene.coupleB, profile_id: scene.outsider.id, city_id: CITY.londrina, starts_on: '2026-09-01', ends_on: null },
  ])

  asGabriel = await signIn(scene.gabriel.email)
  asOutsider = await signIn(scene.outsider.email)
}, 60_000)

describe('A5 — isolamento por casal, nas duas direções', () => {
  it('o Gabriel lê as duas estadias do casal dele, e nenhuma de fora', async () => {
    const result = await listStays(asGabriel)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.rows).toHaveLength(2)
    expect(result.rows.map((s) => s.profileId).sort()).toEqual(
      [scene.gabriel.id, scene.lana.id].sort(),
    )
  })

  // A direção que um teste ingênuo esquece. Sem ela, uma policy `using (true)`
  // passa: o dono vê o que é dele, e ninguém verifica que o estranho não vê.
  it('o estranho NÃO lê nenhuma estadia do casal A', async () => {
    const result = await listStays(asOutsider)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]!.profileId).toBe(scene.outsider.id)
  })

  it('o estranho não consegue ESCREVER no casal A', async () => {
    const result = await insertStay(asOutsider, {
      coupleId: scene.coupleA,
      profileId: scene.outsider.id,
      cityId: CITY.londrina,
      startsOn: '2026-02-01',
      endsOn: '2026-02-05',
    })
    expect(result.status).toBe('error')
  })

  it('o Gabriel lê os dois perfis do casal, com a cidade-casa de cada um', async () => {
    const result = await listMembers(asGabriel)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.rows).toEqual([
      { profileId: scene.gabriel.id, homeCityId: CITY.sjc },
      { profileId: scene.lana.id, homeCityId: CITY.marau },
    ])
  })
})

describe('A6 — sessão ausente é distinguível de lista vazia', () => {
  it('sem login, o resultado é `unauthenticated`, nunca `{ ok, rows: [] }`', async () => {
    const result = await listStays(anonClient())
    expect(result.status).toBe('unauthenticated')
    expect(result).not.toHaveProperty('rows')
  })

  // O outro lado do mesmo par: casal recém-criado, sem estadia nenhuma. Tem de
  // ser `ok` com lista vazia — se este caso e o de cima colapsassem no mesmo
  // retorno, a tela não teria como distinguir "ainda não registramos nada" de
  // "você não está logada".
  it('casal autenticado e sem estadia nenhuma dá `ok` com lista vazia', async () => {
    const asOutsiderClean = await signIn(scene.outsider.email)
    await admin.from('stays').delete().eq('couple_id', scene.coupleB)

    const result = await listStays(asOutsiderClean)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rows).toEqual([])
  })
})

describe('A5 — escrever e reler devolve o que foi escrito', () => {
  // A falha em cascata: policy de insert mais permissiva que a de select. O
  // INSERT passa, o SELECT seguinte não traz a linha, e o usuário vê o registro
  // "desaparecer" sem erro em lugar nenhum.
  it('uma estadia inserida aparece na leitura seguinte', async () => {
    const written = await insertStay(asGabriel, {
      coupleId: scene.coupleA,
      profileId: scene.gabriel.id,
      cityId: CITY.londrina,
      startsOn: '2026-05-01',
      endsOn: '2026-05-10',
    })
    expect(written.status).toBe('ok')
    if (written.status !== 'ok') return

    const reread = await listStays(asGabriel)
    expect(reread.status).toBe('ok')
    if (reread.status !== 'ok') return

    expect(reread.rows.map((s) => s.id)).toContain(written.row.id)
  })
})
