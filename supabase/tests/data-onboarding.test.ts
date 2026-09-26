// A fronteira `src/data/*` da Fase 2 contra o banco local: o cenário da seção 2
// da spec (Rafa cria, Duda entra), passando pelas MESMAS funções que as telas
// chamam. As RPCs em si estão provadas em onboarding.test.ts; aqui se prova o
// mapeamento — que cada `status` do banco chega à tela com o nome certo.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadAccountStage } from '../../src/data/account'
import { createCouple, loadCouple, updateCouple } from '../../src/data/couple'
import { searchCities } from '../../src/data/cities'
import { acceptInvite, createInvite, loadOpenInvite, lookupInvite, renewInvite, sendInvite } from '../../src/data/invites'
import { createProfile } from '../../src/data/profile'
import { admin, anonClient, deleteUserAndCouple, PASSWORD } from './harness'
import type { Db } from './harness'

const PREFIX = 'dat'
const created: string[] = []

async function signedUp(tag: string): Promise<{ id: string; db: Db }> {
  const email = `${PREFIX}-${tag}-${Date.now()}@test.local`
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  created.push(data.user!.id)
  const db = anonClient()
  await db.auth.signInWithPassword({ email, password: PASSWORD })
  return { id: data.user!.id, db }
}

let rafa: { id: string; db: Db }
let duda: { id: string; db: Db }
let pelotas: string
let juizDeFora: string
let code: string
let coupleId: string

beforeAll(async () => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const user of data.users) {
    if (user.email?.startsWith(`${PREFIX}-`)) await deleteUserAndCouple(user.id)
  }
  rafa = await signedUp('rafa')
  duda = await signedUp('duda')
}, 60_000)

afterAll(async () => {
  for (const id of created) await deleteUserAndCouple(id)
}, 60_000)

describe('o cenário da seção 2, pela fronteira de dados', () => {
  it('busca de cidade', async () => {
    const result = await searchCities(rafa.db, 'pelo')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const city = result.rows.find((c) => c.name === 'Pelotas' && c.stateCode === 'RS')
    expect(city).toBeDefined()
    pelotas = city!.id

    const jf = await searchCities(duda.db, 'juiz de')
    if (jf.status !== 'ok') throw new Error('busca')
    juizDeFora = jf.rows.find((c) => c.stateCode === 'MG')!.id

    expect(await searchCities(rafa.db, 'p')).toEqual({ status: 'ok', rows: [] })
  })

  it('Rafa: needs_profile → perfil → needs_couple', async () => {
    expect(await loadAccountStage(rafa.db)).toEqual({ status: 'ok', rows: { stage: 'needs_profile' } })
    expect(
      await createProfile(rafa.db, { fullName: 'Rafael Souza', displayName: 'Rafa', homeCityId: pelotas, avatarPath: null }),
    ).toEqual({ status: 'created', profileId: rafa.id })
    expect(await loadAccountStage(rafa.db)).toEqual({ status: 'ok', rows: { stage: 'needs_couple', profileId: rafa.id } })
  })

  it('Rafa cria o casal e fica `awaiting_partner`', async () => {
    const result = await createCouple(rafa.db, { startedOn: '2023-03-03', name: 'Rafa & Duda' })
    expect(result.status).toBe('created')
    if (result.status !== 'created') return
    coupleId = result.coupleId

    expect(await loadAccountStage(rafa.db)).toEqual({
      status: 'ok',
      rows: { stage: 'awaiting_partner', profileId: rafa.id, coupleId, slot: 1 },
    })
    expect(await loadOpenInvite(rafa.db)).toEqual({ status: 'ok', rows: null })
  })

  it('convite: criado, enviado, e o aberto aparece com last_sent_at', async () => {
    const created = await createInvite(rafa.db, { email: `${PREFIX}-duda@exemplo.com`, inviteeName: 'Duda' })
    expect(created.status).toBe('created')
    if (created.status !== 'created') return
    code = created.code

    const open = async () => {
      const r = await loadOpenInvite(rafa.db)
      expect(r.status).toBe('ok')
      return r.status === 'ok' ? r.rows : null
    }

    if (process.env.MAILPIT_URL) {
      expect(await sendInvite(rafa.db, created.inviteId)).toEqual({ status: 'sent' })
      // Segunda vez em menos de 60 s: o nome do status sobrevive ao caminho HTTP.
      expect((await sendInvite(rafa.db, created.inviteId)).status).toBe('rate_limited')
      expect((await open())?.lastSentAt).not.toBeNull()
    } else {
      // Projeto online sem os segredos do Resend (fim do roadmap): a função
      // responde erro, e o convite continua pendente, sem last_sent_at (R5).
      expect((await sendInvite(rafa.db, created.inviteId)).status).not.toBe('sent')
      expect((await open())?.lastSentAt).toBeNull()
    }
    expect(await open()).toMatchObject({ code, inviteeName: 'Duda' })

    expect((await renewInvite(rafa.db)).status).toBe('renewed')
  })

  it('recusas chegam com nome: e-mail próprio, own_couple', async () => {
    const { data } = await rafa.db.auth.getUser()
    expect(await createInvite(rafa.db, { email: data.user!.email!, inviteeName: null })).toEqual({ status: 'own_email' })
    expect(await lookupInvite(rafa.db, code)).toEqual({ status: 'own_couple' })
  })

  it('Duda vê o preview sem perfil, e aceitar sem perfil pede perfil', async () => {
    const preview = await lookupInvite(duda.db, code.toLowerCase())
    expect(preview).toMatchObject({
      status: 'valid',
      invite: { code, coupleName: 'Rafa & Duda', inviterName: 'Rafa', inviterFullName: 'Rafael Souza', inviterCity: 'Pelotas' },
    })
    expect(await acceptInvite(duda.db, code)).toEqual({ status: 'no_profile' })
  })

  it('Duda cria o perfil, aceita, e os dois ficam `ready`', async () => {
    await createProfile(duda.db, { fullName: 'Maria Eduarda Lima', displayName: 'Duda', homeCityId: juizDeFora, avatarPath: null })
    expect(await acceptInvite(duda.db, code)).toEqual({ status: 'joined', coupleId })

    expect(await loadAccountStage(duda.db)).toEqual({
      status: 'ok',
      rows: { stage: 'ready', profileId: duda.id, coupleId, slot: 2 },
    })
    expect(await loadAccountStage(rafa.db)).toMatchObject({ status: 'ok', rows: { stage: 'ready', slot: 1 } })
  })

  it('Confirmar: Duda corrige a data; data futura é recusada pelo servidor', async () => {
    expect(await updateCouple(duda.db, { coupleId, startedOn: '2023-03-04', name: 'Rafa & Duda' })).toEqual({ status: 'ok' })
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    expect(await updateCouple(duda.db, { coupleId, startedOn: future, name: 'Rafa & Duda' })).toEqual({
      status: 'invalid',
      field: 'started_on',
    })
  })

  it('Tudo pronto: o casal com as duas cidades e cores diferentes', async () => {
    const result = await loadCouple(duda.db)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok' || !result.rows) return
    expect(result.rows.startedOn).toBe('2023-03-04')
    expect(result.rows.members.map((m) => [m.slot, m.displayName, m.city.name])).toEqual([
      [1, 'Rafa', 'Pelotas'],
      [2, 'Duda', 'Juiz de Fora'],
    ])
    expect(result.rows.members[0]!.color).not.toBe(result.rows.members[1]!.color)
  })

  it('o código usado responde `used` para um terceiro', async () => {
    const third = await signedUp('terceiro')
    expect(await lookupInvite(third.db, code)).toEqual({ status: 'used', coupleName: 'Rafa & Duda' })
  })

  it('sem sessão, as funções dizem `unauthenticated` — não `not_found`', async () => {
    expect(await lookupInvite(anonClient(), code)).toEqual({ status: 'unauthenticated' })
    expect(await createCouple(anonClient(), { startedOn: '2024-01-01', name: null })).toEqual({ status: 'unauthenticated' })
  })
})
