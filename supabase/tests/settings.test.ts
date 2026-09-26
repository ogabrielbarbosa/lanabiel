// Critérios A1, A3, A4 e A5 — .agent/Tasks/fase-3-configuracoes.md, seção 10.
// ADR: .agent/Decisions/0011-preferencias-em-tres-escopos.md
//
// Contra o projeto online (ADR 0014). Dois casais reais e as duas direções.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BAND_COLORS, LIST_CATEGORIES, PERSON_COLORS, DEFAULT_COLOR_BY_SLOT } from '../../src/domain/settings'
import { CITY, coupleOfTwo, sql, userFactory } from './harness'
import type { SignedUser } from './harness'

const users = userFactory('set')
let one: { a: SignedUser; b: SignedUser; coupleId: string }
let two: { a: SignedUser; b: SignedUser; coupleId: string }

beforeAll(async () => {
  await users.sweep()
  one = await coupleOfTwo(users, 'um')
  two = await coupleOfTwo(users, 'dois')
}, 120_000)

afterAll(() => users.cleanup(), 120_000)

/** As listas de um CHECK, na ordem em que aparecem. */
function checkLists(constraint: string): string[][] {
  const def = sql(`select pg_get_constraintdef(oid) from pg_constraint where conname = '${constraint}'`)
  return [...def.matchAll(/ARRAY\[([^\]]+)\]/g)].map((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!))
}

describe('A1 — paridade entre src/domain/settings.ts e os CHECK', () => {
  it('paleta pessoal', () => {
    expect(checkLists('profiles_color_palette')).toEqual([[...PERSON_COLORS]])
  })
  it('paleta de faixas, nas quatro colunas', () => {
    const lists = checkLists('couple_settings_band_colors')
    expect(lists).toHaveLength(4)
    for (const list of lists) expect(list).toEqual([...BAND_COLORS])
  })
  it('categorias', () => {
    expect(checkLists('couple_settings_hidden_categories')).toEqual([[...LIST_CATEGORIES]])
  })
  it('cor padrão do perfil é a do slot 1', () => {
    expect(sql(`select column_default from information_schema.columns where table_name = 'profiles' and column_name = 'color'`))
      .toContain(DEFAULT_COLOR_BY_SLOT[1])
  })
})

describe('A3 — as linhas de preferência nascem com o casal e com o perfil', () => {
  it('couple_settings com os padrões', async () => {
    const { data, error } = await one.a.db.from('couple_settings').select('*').single()
    expect(error).toBeNull()
    expect(data).toMatchObject({
      couple_id: one.coupleId,
      remind_anniversary: true,
      calendar_default_view: 'month',
      color_apart: '#8E97BD',
      hidden_categories: [],
    })
  })
  it('profile_settings com os padrões', async () => {
    const { data } = await one.a.db.from('profile_settings').select('*').single()
    expect(data).toMatchObject({ profile_id: one.a.id, notify_trip_eve_email: true, notify_partner_done_email: false })
  })
  it('perfil sem casal também tem profile_settings', async () => {
    const solo = await users.newUser('solo')
    const { data } = await solo.db.from('profile_settings').select('profile_id').single()
    expect(data?.profile_id).toBe(solo.id)
  })
})

describe('A4 — RLS: cada casal o seu; profile_settings só o próprio', () => {
  it('lê só o couple_settings do próprio casal', async () => {
    const { data } = await one.a.db.from('couple_settings').select('couple_id')
    expect(data?.map((r) => r.couple_id)).toEqual([one.coupleId])
  })
  it('os dois do casal editam; o de fora não', async () => {
    const byB = await one.b.db.from('couple_settings').update({ week_starts_on: 'mon' }).eq('couple_id', one.coupleId).select()
    expect(byB.data).toHaveLength(1)
    const byOutsider = await two.a.db.from('couple_settings').update({ week_starts_on: 'sun' }).eq('couple_id', one.coupleId).select()
    expect(byOutsider.data).toEqual([])
  })
  it('profile_settings do parceiro: nem lê nem edita', async () => {
    const read = await one.a.db.from('profile_settings').select('profile_id').eq('profile_id', one.b.id)
    expect(read.data).toEqual([])
    const write = await one.a.db.from('profile_settings').update({ notify_trip_eve_push: false }).eq('profile_id', one.b.id).select()
    expect(write.data).toEqual([])
  })
  it('cidades salvas: o casal insere e lê; o de fora não lê, não insere em nome do outro', async () => {
    const ins = await one.a.db.from('couple_saved_cities').insert({ couple_id: one.coupleId, city_id: CITY.londrina, added_by: one.a.id })
    expect(ins.error).toBeNull()
    const byPartner = await one.b.db.from('couple_saved_cities').select('city_id')
    expect(byPartner.data?.map((r) => r.city_id)).toEqual([CITY.londrina])
    const byOutsider = await two.a.db.from('couple_saved_cities').select('city_id')
    expect(byOutsider.data).toEqual([])
    const intrude = await two.a.db.from('couple_saved_cities').insert({ couple_id: one.coupleId, city_id: CITY.sjc, added_by: two.a.id })
    expect(intrude.error).not.toBeNull()
    const lie = await one.a.db.from('couple_saved_cities').insert({ couple_id: one.coupleId, city_id: CITY.sjc, added_by: one.b.id })
    expect(lie.error).not.toBeNull()
  })
  it('não há INSERT nem DELETE direto em couple_settings', async () => {
    const del = await one.a.db.from('couple_settings').delete().eq('couple_id', one.coupleId).select()
    expect(del.data ?? []).toEqual([])
    const { data } = await one.a.db.from('couple_settings').select('couple_id')
    expect(data).toHaveLength(1)
  })
})

describe('A5 — cores: paleta e distintas no casal (I4, I5)', () => {
  it('a cor da outra pessoa é recusada com profiles_color_taken', async () => {
    const { data: partner } = await one.a.db.from('profiles').select('color').eq('id', one.b.id).single()
    const { error } = await one.a.db.from('profiles').update({ color: partner!.color }).eq('id', one.a.id)
    expect(error?.code).toBe('23514')
    // O `hint` é o que `updateProfile` usa para dizer "a outra pessoa escolheu".
    expect(error?.hint).toBe('profiles_color_taken')
  })
  it('cor fora da paleta: check_violation', async () => {
    const { error } = await one.a.db.from('profiles').update({ color: '#000000' }).eq('id', one.a.id)
    expect(error?.code).toBe('23514')
  })
  it('cor livre da paleta passa', async () => {
    const { error } = await one.a.db.from('profiles').update({ color: '#C3B3F2' }).eq('id', one.a.id)
    expect(error).toBeNull()
  })
  it('faixa fora da paleta e as oito categorias escondidas: recusados', async () => {
    const color = await one.a.db.from('couple_settings').update({ color_apart: '#000000' }).eq('couple_id', one.coupleId)
    expect(color.error?.code).toBe('23514')
    const all = await one.a.db.from('couple_settings').update({ hidden_categories: [...LIST_CATEGORIES] }).eq('couple_id', one.coupleId)
    expect(all.error?.code).toBe('23514')
    const unknown = await one.a.db.from('couple_settings').update({ hidden_categories: ['praia'] }).eq('couple_id', one.coupleId)
    expect(unknown.error?.code).toBe('23514')
  })
})
