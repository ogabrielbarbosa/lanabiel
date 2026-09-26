// Critérios A1–A12 e A20 da spec — .agent/Tasks/fase-2-onboarding.md, seção 10.
//
// Contra a stack local. As duas corridas (A3, A10) usam chamadas REALMENTE
// paralelas, de dois clientes: em série elas passam sempre e não provam nada.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LIMITS } from '../../src/domain/onboarding'
import { admin, anonClient, CITY, deleteUserAndCouple, PASSWORD, sql } from './harness'
import type { Db } from './harness'

const PREFIX = 'onb'
const created: string[] = []

interface User {
  id: string
  email: string
  db: Db
}

/** Usuário novo, autenticado, com ou sem perfil. */
async function newUser(tag: string, homeCityId: string | null = CITY.sjc): Promise<User> {
  const email = `${PREFIX}-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw new Error(`criar ${email}: ${error?.message}`)
  created.push(data.user.id)

  const db = anonClient()
  const { error: signInError } = await db.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInError) throw new Error(`login ${email}: ${signInError.message}`)

  if (homeCityId) {
    const { error: profileError } = await db
      .from('profiles')
      .insert({ id: data.user.id, full_name: `${tag} Silva`, display_name: tag, home_city_id: homeCityId })
    if (profileError) throw new Error(`perfil ${email}: ${profileError.message}`)
  }
  return { id: data.user.id, email, db }
}

async function rpc(db: Db, fn: string, args: Record<string, unknown> = {}) {
  // O nome da função varia por teste; o tipo gerado exige literal.
  const { data, error } = await (db.rpc as (f: string, a: object) => ReturnType<Db['rpc']>)(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as Record<string, unknown>
}

/** Casal com um membro e um convite aberto. */
async function coupleWithInvite(tag: string) {
  const owner = await newUser(`${tag}-dono`)
  const couple = await rpc(owner.db, 'create_couple', { p_started_on: '2023-03-03', p_name: `Casal ${tag}` })
  const invite = await rpc(owner.db, 'create_invite', { p_email: `${tag}-convidado@exemplo.com`, p_invitee_name: 'Duda' })
  return { owner, coupleId: couple.couple_id as string, invite }
}

beforeAll(async () => {
  // Resto de rodadas anteriores: todo usuário deste arquivo tem o prefixo.
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const user of data.users) {
    if (user.email?.startsWith(`${PREFIX}-`)) await deleteUserAndCouple(user.id)
  }
}, 60_000)

afterAll(async () => {
  for (const id of created) await deleteUserAndCouple(id)
}, 60_000)

describe('A1 — cada um cria o próprio perfil, e só o próprio', () => {
  it('insere o próprio com cidade do seed', async () => {
    const user = await newUser('a1')
    const { data } = await user.db.from('profiles').select('id, full_name, color').eq('id', user.id).single()
    expect(data?.full_name).toBe('a1 Silva')
    expect(data?.color).toBe('#3b82f6') // o default da migration
  })

  it('NÃO insere perfil com o id de outra pessoa', async () => {
    const user = await newUser('a1-sem', null)
    const other = await newUser('a1-alvo', null)
    const { error } = await user.db
      .from('profiles')
      .insert({ id: other.id, full_name: 'Intruso', display_name: 'Intruso', home_city_id: CITY.sjc })
    expect(error).not.toBeNull()
  })
})

describe('A2 — paridade dos limites entre src/domain e o CHECK (I11)', () => {
  const cases = [
    ['full_name', LIMITS.fullName],
    ['display_name', LIMITS.displayName],
  ] as const

  it.each(cases)('%s aceita o limite e recusa limite + 1', async (column, max) => {
    const user = await newUser(`a2-${column}`, null)
    const base = { id: user.id, full_name: 'Nome', display_name: 'Nome', home_city_id: CITY.sjc }

    const over = await user.db.from('profiles').insert({ ...base, [column]: 'x'.repeat(max + 1) })
    expect(over.error?.message).toMatch(/check constraint/)

    const exact = await user.db.from('profiles').insert({ ...base, [column]: 'x'.repeat(max) })
    expect(exact.error).toBeNull()
  })

  it('nome do casal: o CHECK de couples tem o mesmo limite', async () => {
    const over = await admin.from('couples').insert({ name: 'x'.repeat(LIMITS.coupleName + 1), started_on: '2024-01-01' })
    expect(over.error?.message).toMatch(/check constraint/)
    const exact = await admin.from('couples').insert({ name: 'x'.repeat(LIMITS.coupleName), started_on: '2024-01-01' }).select('id').single()
    expect(exact.error).toBeNull()
    await admin.from('couples').delete().eq('id', exact.data!.id)
  })

  it('nome de quem é convidado: create_invite recusa limite + 1', async () => {
    const owner = await newUser('a2-conv')
    await rpc(owner.db, 'create_couple', { p_started_on: '2024-01-01' })
    const over = await rpc(owner.db, 'create_invite', { p_email: 'a2@exemplo.com', p_invitee_name: 'x'.repeat(LIMITS.inviteeName + 1) })
    expect(over).toEqual({ status: 'invalid', field: 'invitee_name' })
    const exact = await rpc(owner.db, 'create_invite', { p_email: 'a2@exemplo.com', p_invitee_name: 'x'.repeat(LIMITS.inviteeName) })
    expect(exact.status).toBe('created')
  })
})

describe('A3 — duas abas criando o espaço ao mesmo tempo (I1)', () => {
  it('um casal só, um `created` e um `already_member`', async () => {
    const user = await newUser('a3')
    const results = await Promise.all([
      rpc(user.db, 'create_couple', { p_started_on: '2024-01-01', p_name: 'Aba 1' }),
      rpc(user.db, 'create_couple', { p_started_on: '2024-01-01', p_name: 'Aba 2' }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(['already_member', 'created'])

    const { data: memberships } = await admin.from('couple_members').select('couple_id').eq('profile_id', user.id)
    expect(memberships).toHaveLength(1)

    // E o casal da aba perdedora não ficou órfão.
    const { data: orphans } = await admin.from('couples').select('id').in('name', ['Aba 1', 'Aba 2'])
    expect(orphans).toHaveLength(1)
  })

  it('sem perfil → `no_profile`', async () => {
    const user = await newUser('a3-sem', null)
    expect(await rpc(user.db, 'create_couple', { p_started_on: '2024-01-01' })).toEqual({ status: 'no_profile' })
  })
})

describe('A4 — começo do namoro no futuro', () => {
  it('amanhã é recusado e nenhum casal nasce', async () => {
    const user = await newUser('a4')
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    expect(await rpc(user.db, 'create_couple', { p_started_on: tomorrow })).toEqual({
      status: 'invalid',
      field: 'started_on',
    })
    const { data } = await admin.from('couple_members').select('couple_id').eq('profile_id', user.id)
    expect(data).toHaveLength(0)
  })
})

describe('A5 — criar convite', () => {
  it('código Crockford de 6, validade de 7 dias', async () => {
    const { invite } = await coupleWithInvite('a5')
    expect(invite.status).toBe('created')
    expect(invite.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/)
    const days = (new Date(invite.expires_at as string).getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThan(7.01)
  })

  it('um segundo convite revoga o primeiro (I5, "trocar e-mail")', async () => {
    const { owner, coupleId, invite } = await coupleWithInvite('a5-troca')
    const second = await rpc(owner.db, 'create_invite', { p_email: 'outro@exemplo.com' })
    expect(second.code).not.toBe(invite.code)

    const { data } = await owner.db.from('couple_invites').select('code, revoked_at').eq('couple_id', coupleId)
    const first = data!.find((row) => row.code === invite.code)
    expect(first?.revoked_at).not.toBeNull()
    expect(data!.filter((row) => row.revoked_at === null)).toHaveLength(1)
  })

  it('o próprio e-mail é recusado', async () => {
    const owner = await newUser('a5-proprio')
    await rpc(owner.db, 'create_couple', { p_started_on: '2024-01-01' })
    expect(await rpc(owner.db, 'create_invite', { p_email: owner.email.toUpperCase() })).toEqual({ status: 'own_email' })
  })

  it('renovar zera last_sent_at: o e-mail antigo diz o prazo antigo (R5)', async () => {
    const { owner, invite } = await coupleWithInvite('a5-renova-envio')
    await admin.from('couple_invites').update({ last_sent_at: new Date().toISOString() }).eq('code', invite.code as string)
    await rpc(owner.db, 'renew_invite')
    const { data } = await owner.db.from('couple_invites').select('last_sent_at').eq('code', invite.code as string).single()
    expect(data?.last_sent_at).toBeNull()
  })

  it('renovar mantém o código e estende o prazo, mesmo expirado', async () => {
    const { owner, invite } = await coupleWithInvite('a5-renova')
    await admin.from('couple_invites').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('code', invite.code as string)
    const renewed = await rpc(owner.db, 'renew_invite')
    expect(renewed.status).toBe('renewed')
    expect(renewed.code).toBe(invite.code)
    expect(new Date(renewed.expires_at as string).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000)
  })
})

describe('A6 — preview do convite, com o código como a pessoa digita', () => {
  it('minúsculas, hífen e O no lugar de 0 resolvem para o mesmo convite', async () => {
    const { invite } = await coupleWithInvite('a6')
    const guest = await newUser('a6-conv', null) // o preview não exige perfil
    const code = invite.code as string
    const typed = `${code.slice(0, 3)}-${code.slice(3)}`.toLowerCase().replace(/0/g, 'o')

    const result = await rpc(guest.db, 'lookup_invite', { p_code: typed })
    expect(result).toMatchObject({
      status: 'valid',
      code,
      couple_name: 'Casal a6',
      started_on: '2023-03-03',
      inviter_display_name: 'a6-dono',
      inviter_full_name: 'a6-dono Silva',
      inviter_city: 'São José dos Campos',
    })
    // Quem só tem o código não vê o uid de quem convidou (caminho da foto).
    expect(result).not.toHaveProperty('inviter_avatar_path')
  })
})

describe('A7 — os estados do código', () => {
  let guest: User
  beforeAll(async () => {
    guest = await newUser('a7-conv')
  })

  it('inexistente → `not_found`', async () => {
    expect(await rpc(guest.db, 'lookup_invite', { p_code: 'ZZZZZZ' })).toEqual({ status: 'not_found' })
  })

  it('revogado → `not_found`, igual a inexistente', async () => {
    const { owner, invite } = await coupleWithInvite('a7-rev')
    await rpc(owner.db, 'create_invite', { p_email: 'trocado@exemplo.com' })
    expect(await rpc(guest.db, 'lookup_invite', { p_code: invite.code })).toEqual({ status: 'not_found' })
  })

  it('expirado → `expired`, com quem pedir', async () => {
    const { invite } = await coupleWithInvite('a7-exp')
    await admin.from('couple_invites').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('code', invite.code as string)
    expect(await rpc(guest.db, 'lookup_invite', { p_code: invite.code })).toMatchObject({
      status: 'expired',
      inviter_display_name: 'a7-exp-dono',
    })
  })

  it('aceito → `used`', async () => {
    const { invite } = await coupleWithInvite('a7-usado')
    const first = await newUser('a7-primeiro')
    expect((await rpc(first.db, 'accept_invite', { p_code: invite.code })).status).toBe('joined')
    expect(await rpc(guest.db, 'lookup_invite', { p_code: invite.code })).toEqual({
      status: 'used',
      couple_name: 'Casal a7-usado',
    })
  })
})

describe('A8 — limite de falhas de código (I8)', () => {
  it('passado o limite, nem código válido responde', async () => {
    const { invite } = await coupleWithInvite('a8')
    const guest = await newUser('a8-forca')
    for (let i = 0; i < 10; i++) {
      expect((await rpc(guest.db, 'lookup_invite', { p_code: 'ZZZZZZ' })).status).toBe('not_found')
    }
    const blocked = await rpc(guest.db, 'lookup_invite', { p_code: invite.code })
    expect(blocked.status).toBe('rate_limited')
    expect(blocked.retry_after_s).toBeGreaterThan(3000)

    // O aceite respeita o mesmo contador — senão o limite teria uma porta ao lado.
    expect((await rpc(guest.db, 'accept_invite', { p_code: invite.code })).status).toBe('rate_limited')
  })
})

describe('A9 — anon não chama nenhuma função desta fase (I7)', () => {
  const calls: [string, Record<string, unknown>][] = [
    ['create_couple', { p_started_on: '2024-01-01' }],
    ['create_invite', { p_email: 'x@exemplo.com' }],
    ['renew_invite', {}],
    ['begin_invite_send', { p_invite_id: '00000000-0000-0000-0000-000000000000' }],
    ['mark_invite_sent', { p_invite_id: '00000000-0000-0000-0000-000000000000' }],
    ['lookup_invite', { p_code: 'ZZZZZZ' }],
    ['accept_invite', { p_code: 'ZZZZZZ' }],
  ]

  it.each(calls)('%s é recusada por permissão', async (fn, args) => {
    const { error } = await (anonClient().rpc as (f: string, a: object) => ReturnType<Db['rpc']>)(fn, args)
    expect(error?.code).toBe('42501')
  })
})

describe('A10 — dois aceites do mesmo convite ao mesmo tempo (I2, I10)', () => {
  it('um `joined`, um `used`, dois membros com cores diferentes', async () => {
    const { owner, coupleId, invite } = await coupleWithInvite('a10')
    const [x, y] = await Promise.all([newUser('a10-x'), newUser('a10-y')])

    const results = await Promise.all([
      rpc(x.db, 'accept_invite', { p_code: invite.code }),
      rpc(y.db, 'accept_invite', { p_code: invite.code }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(['joined', 'used'])

    const { data: members } = await admin.from('couple_members').select('profile_id, slot').eq('couple_id', coupleId)
    expect(members).toHaveLength(2)
    expect(members!.find((m) => m.profile_id === owner.id)?.slot).toBe(1)

    const ids = members!.map((m) => m.profile_id)
    const { data: profiles } = await admin.from('profiles').select('color').in('id', ids)
    expect(new Set(profiles!.map((p) => p.color)).size).toBe(2)
  })
})

describe('A11 — quem já está num casal', () => {
  it('não aceita convite de outro casal', async () => {
    const { invite } = await coupleWithInvite('a11-alvo')
    const { owner: busy } = await coupleWithInvite('a11-ocupado')
    expect(await rpc(busy.db, 'accept_invite', { p_code: invite.code })).toEqual({
      status: 'already_member',
      couple_name: 'Casal a11-ocupado',
    })
  })

  it('quem criou recebe `own_couple` com o próprio código', async () => {
    const { owner, invite } = await coupleWithInvite('a11-proprio')
    expect(await rpc(owner.db, 'lookup_invite', { p_code: invite.code })).toEqual({ status: 'own_couple' })
  })

  it('aceitar sem perfil → `no_profile`, e nada muda', async () => {
    const { coupleId, invite } = await coupleWithInvite('a11-semperfil')
    const guest = await newUser('a11-semperfil-conv', null)
    expect(await rpc(guest.db, 'accept_invite', { p_code: invite.code })).toEqual({ status: 'no_profile' })
    const { data } = await admin.from('couple_members').select('profile_id').eq('couple_id', coupleId)
    expect(data).toHaveLength(1)
  })
})

describe('A12 — entrar num casal só pela função (I3)', () => {
  it('insert direto em couple_members é recusado', async () => {
    const { coupleId } = await coupleWithInvite('a12')
    const guest = await newUser('a12-conv')
    const { error } = await guest.db.from('couple_members').insert({ couple_id: coupleId, profile_id: guest.id, slot: 2 })
    expect(error).not.toBeNull()
  })

  it('insert direto em couple_invites é recusado, mesmo por membro', async () => {
    const { owner, coupleId } = await coupleWithInvite('a12-conv2')
    const { error } = await owner.db.from('couple_invites').insert({
      couple_id: coupleId,
      code: '7K4Q92',
      email: 'x@exemplo.com',
      created_by: owner.id,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(error).not.toBeNull()
  })
})

describe('A20 — a lista fechada de funções security definer', () => {
  it('exatamente sete em public, executáveis por authenticated e por nenhum anon', () => {
    const rows = sql(`
      select p.proname,
             has_function_privilege('authenticated', p.oid, 'execute'),
             has_function_privilege('anon', p.oid, 'execute')
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      order by p.proname`)
    expect(rows.split('\n')).toEqual([
      'accept_invite|t|f',
      'begin_invite_send|t|f',
      'create_couple|t|f',
      'create_invite|t|f',
      'lookup_invite|t|f',
      'mark_invite_sent|t|f',
      'renew_invite|t|f',
    ])
  })
})

describe('A14 — cidades: busca local, escrita fechada (I9)', () => {
  it('o cliente não insere cidade', async () => {
    const user = await newUser('a14')
    const { error } = await user.db
      .from('cities')
      .insert({ name: 'Cidade Inventada', state_code: 'SP', country_code: 'BR', lat: 0, lng: 0 })
    expect(error).not.toBeNull()
  })

  it('"sao jose dos" acha São José dos Campos com o UUID fixo da Fase 0', async () => {
    const user = await newUser('a14-busca')
    const { data, error } = await user.db.rpc('search_cities', { p_query: 'sao jose dos' })
    expect(error).toBeNull()
    expect(data!.find((c) => c.name === 'São José dos Campos')?.id).toBe(CITY.sjc)
  })

  it('prefixo vem antes de "contém", e menos de 2 caracteres não busca', async () => {
    const user = await newUser('a14-ordem')
    const { data } = await user.db.rpc('search_cities', { p_query: 'marau' })
    expect(data![0]?.id).toBe(CITY.marau)
    const { data: tooShort } = await user.db.rpc('search_cities', { p_query: 'm' })
    expect(tooShort).toEqual([])
  })
})

describe('A15 — o seed do IBGE está inteiro', () => {
  it('5.571 municípios, todos com código único', () => {
    // 5.571 e não os 5.570 da spec: Boa Esperança do Norte (MT) foi criado em
    // 2023 e está nas duas fontes. Ruling no ledger.
    expect(sql(`select count(*), count(ibge_code), count(distinct ibge_code) from public.cities where country_code = 'BR'`))
      .toBe('5571|5571|5571')
  })
})
