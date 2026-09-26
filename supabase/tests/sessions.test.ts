// Critério A10 — .agent/Tasks/fase-3-configuracoes.md, seção 10.
// Sessões: cada um lista e encerra só as próprias (I8), sem IP na resposta.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, PASSWORD, rpc, userFactory } from './harness'

const users = userFactory('ses')

beforeAll(() => users.sweep(), 120_000)
afterAll(() => users.cleanup(), 120_000)

describe('A10 — list_my_sessions e end_my_session', () => {
  it('lista só as minhas, sem IP, com a atual marcada', async () => {
    const me = await users.newUser('eu')
    const other = await users.newUser('outro')
    // Segunda sessão da mesma conta, noutro "aparelho".
    const phone = anonClient()
    await phone.auth.signInWithPassword({ email: me.email, password: PASSWORD })

    const { data, error } = await me.db.rpc('list_my_sessions')
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
    expect(data!.filter((s) => s.is_current)).toHaveLength(1)
    for (const s of data!) expect(Object.keys(s).sort()).toEqual(['created_at', 'id', 'is_current', 'last_active_at', 'user_agent'])

    const { data: theirs } = await other.db.rpc('list_my_sessions')
    expect(theirs).toHaveLength(1)
    expect(theirs![0]!.id).not.toBe(data![0]!.id)
  })

  it('encerrar a de outra pessoa: not_found; a própria: some, e o refresh daquele cliente falha', async () => {
    const me = await users.newUser('dono')
    const intruder = await users.newUser('intruso')
    const phone = anonClient()
    await phone.auth.signInWithPassword({ email: me.email, password: PASSWORD })
    const { data: sessions } = await me.db.rpc('list_my_sessions')
    const phoneSession = sessions!.find((s) => !s.is_current)!

    expect(await rpc(intruder.db, 'end_my_session', { p_session_id: phoneSession.id })).toEqual({ status: 'not_found' })
    expect(await rpc(me.db, 'end_my_session', { p_session_id: phoneSession.id })).toEqual({ status: 'ended' })

    const { data: after } = await me.db.rpc('list_my_sessions')
    expect(after!.map((s) => s.id)).not.toContain(phoneSession.id)
    const { error } = await phone.auth.refreshSession()
    expect(error).not.toBeNull()
  })
})
