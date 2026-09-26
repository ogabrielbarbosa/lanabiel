// Critérios A7, A7a, A8 e A9 — .agent/Tasks/fase-3-configuracoes.md, seção 10.
// Sair do casal, cancelar convite, entrar na vaga livre, apagar o espaço.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, CITY, coupleOfTwo, rpc, userFactory } from './harness'

const users = userFactory('cyc')

beforeAll(() => users.sweep(), 120_000)
afterAll(() => users.cleanup(), 120_000)

async function stay(db: typeof admin, coupleId: string, profileId: string, cityId: string) {
  const { error } = await db
    .from('stays')
    .insert({ couple_id: coupleId, profile_id: profileId, city_id: cityId, starts_on: '2026-01-01', ends_on: '2026-01-05' })
  if (error) throw new Error(`stay: ${error.message}`)
}

describe('A7 — sair do casal', () => {
  it('quem sai fica sem casal; quem fica, sozinho com o acervo; convite aberto revogado', async () => {
    const { a, b, coupleId } = await coupleOfTwo(users, 'sai')
    await stay(a.db, coupleId, a.id, CITY.sjc)
    await stay(b.db, coupleId, b.id, CITY.marau)
    // Um convite aberto de antes: o casal está cheio, então é inserido pelo admin.
    await admin.from('couple_members').delete().eq('profile_id', b.id)
    const invite = await rpc(a.db, 'create_invite', { p_email: 'terceira@exemplo.com' })
    await admin.from('couple_members').insert({ couple_id: coupleId, profile_id: b.id, slot: 2 })

    expect(await rpc(a.db, 'leave_couple')).toEqual({ status: 'left', couple_deleted: false })

    const { data: mine } = await a.db.from('couple_members').select('couple_id')
    expect(mine).toEqual([])
    const { data: left } = await b.db.from('couple_members').select('profile_id, slot')
    expect(left).toEqual([{ profile_id: b.id, slot: 2 }])
    const { data: stays } = await b.db.from('stays').select('profile_id')
    expect(stays).toHaveLength(2)
    const { data: settings } = await b.db.from('couple_settings').select('couple_id')
    expect(settings).toHaveLength(1)

    const lookup = await rpc(b.db, 'lookup_invite', { p_code: invite.code })
    expect(lookup.status).toBe('not_found')
  })

  it('o último a sair apaga o casal', async () => {
    const solo = await users.newUser('ultimo')
    const couple = await rpc(solo.db, 'create_couple', { p_started_on: '2024-01-01' })
    expect(await rpc(solo.db, 'leave_couple')).toEqual({ status: 'left', couple_deleted: true })
    const { data } = await admin.from('couples').select('id').eq('id', couple.couple_id as string)
    expect(data).toEqual([])
  })

  it('quem não é membro recebe not_member', async () => {
    const lone = await users.newUser('semcasal')
    expect(await rpc(lone.db, 'leave_couple')).toEqual({ status: 'not_member' })
  })
})

describe('A7a — cancelar convite', () => {
  it('revoga o aberto; sem aberto, none_open; e um novo gera outro código', async () => {
    const owner = await users.newUser('cancela')
    await rpc(owner.db, 'create_couple', { p_started_on: '2024-01-01' })
    const first = await rpc(owner.db, 'create_invite', { p_email: 'bia@exemplo.com' })
    expect(await rpc(owner.db, 'cancel_invite')).toEqual({ status: 'cancelled' })
    const other = await users.newUser('cancela-outra')
    expect((await rpc(other.db, 'lookup_invite', { p_code: first.code })).status).toBe('not_found')
    expect(await rpc(owner.db, 'cancel_invite')).toEqual({ status: 'none_open' })
    const second = await rpc(owner.db, 'create_invite', { p_email: 'carla@exemplo.com' })
    expect(second.code).not.toBe(first.code)
  })

  it('quem não é do casal: not_member', async () => {
    const lone = await users.newUser('cancela-fora')
    expect(await rpc(lone.db, 'cancel_invite')).toEqual({ status: 'not_member' })
  })
})

describe('A8 — depois que o slot 1 sai, o próximo aceite ocupa o slot 1', () => {
  it('slot livre e cor ajustada', async () => {
    const { a, b, coupleId } = await coupleOfTwo(users, 'vaga')
    await rpc(a.db, 'leave_couple')
    const { data: bColor } = await b.db.from('profiles').select('color').eq('id', b.id).single()

    const invite = await rpc(b.db, 'create_invite', { p_email: 'nova@exemplo.com' })
    const c = await users.newUser('vaga-c')
    // C nasce com a cor padrão; se coincidir com a de B, o aceite troca.
    await c.db.from('profiles').update({ color: bColor!.color }).eq('id', c.id)
    expect((await rpc(c.db, 'accept_invite', { p_code: invite.code })).status).toBe('joined')

    const { data: members } = await c.db.from('couple_members').select('profile_id, slot').order('slot')
    expect(members).toEqual([
      { profile_id: c.id, slot: 1 },
      { profile_id: b.id, slot: 2 },
    ])
    const { data: colors } = await c.db.from('profiles').select('id, color').in('id', [b.id, c.id])
    expect(new Set(colors!.map((p) => p.color)).size).toBe(2)
    expect(coupleId).toBeTruthy()
  })
})

describe('A9 — apagar o espaço', () => {
  it('apaga casal, membros, estadias, convites, preferências e cidades salvas; perfis ficam', async () => {
    const { a, b, coupleId } = await coupleOfTwo(users, 'apaga')
    await stay(a.db, coupleId, a.id, CITY.sjc)
    await a.db.from('couple_saved_cities').insert({ couple_id: coupleId, city_id: CITY.londrina, added_by: a.id })

    expect(await rpc(a.db, 'delete_couple')).toEqual({ status: 'deleted' })

    const left = await Promise.all([
      admin.from('couples').select('id').eq('id', coupleId),
      admin.from('couple_settings').select('couple_id').eq('couple_id', coupleId),
      admin.from('couple_saved_cities').select('couple_id').eq('couple_id', coupleId),
      admin.from('couple_invites').select('couple_id').eq('couple_id', coupleId),
    ])
    for (const { data } of left) expect(data).toEqual([])
    const { data: stays } = await admin.from('stays').select('id').eq('couple_id', coupleId)
    expect(stays).toEqual([])
    const { data: members } = await admin.from('couple_members').select('profile_id').eq('couple_id', coupleId)
    expect(members).toEqual([])
    const { data: profiles } = await admin.from('profiles').select('id').in('id', [a.id, b.id])
    expect(profiles).toHaveLength(2)
  })
})
