// Critérios A17–A19 da spec — .agent/Tasks/fase-2-onboarding.md, seção 10.
// ADR: .agent/Decisions/0006-email-transacional-por-resend-em-edge-function.md
//
// A17 e A18 passam pela edge function DE VERDADE, servida pela stack local com
// o transporte `mailpit`, e leem a mensagem pela API do Mailpit. A19 chama o
// `handler.ts` direto com um transporte que falha, contra as RPCs reais —
// derrubar o Mailpit compartilhado para provar uma falha derrubaria os outros
// testes junto.
//
// O Mailpit é compartilhado com o login (Fase 1): a limpeza é por
// destinatário, nunca "apaga tudo".

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleSendInvite } from '../functions/send-invite/handler'
import type { BeginSendResult } from '../functions/send-invite/handler'
import { admin, anonClient, CITY, deleteUserAndCouple, PASSWORD } from './harness'
import type { Db } from './harness'

const PREFIX = 'snd'
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:55324'
const created: string[] = []

interface Mail {
  ID: string
  Subject: string
}

async function mailsTo(address: string): Promise<Mail[]> {
  const query = encodeURIComponent(`to:"${address}"`)
  const response = await fetch(`${MAILPIT}/api/v1/search?query=${query}`)
  const body = (await response.json()) as { messages: Mail[] }
  return body.messages
}

async function clearMailsTo(address: string): Promise<void> {
  const query = encodeURIComponent(`to:"${address}"`)
  await fetch(`${MAILPIT}/api/v1/search?query=${query}`, { method: 'DELETE' })
}

async function mailText(id: string): Promise<{ Text: string; HTML: string }> {
  const response = await fetch(`${MAILPIT}/api/v1/message/${id}`)
  return (await response.json()) as { Text: string; HTML: string }
}

async function newMember(tag: string): Promise<{ id: string; db: Db }> {
  const email = `${PREFIX}-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`
  const { data } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  created.push(data.user!.id)
  const db = anonClient()
  await db.auth.signInWithPassword({ email, password: PASSWORD })
  await db.from('profiles').insert({ id: data.user!.id, full_name: 'Rafael Souza', display_name: 'Rafa', home_city_id: CITY.sjc })
  return { id: data.user!.id, db }
}

/** Casal com um membro e convite aberto para um destinatário único. */
async function setup(tag: string) {
  const owner = await newMember(tag)
  await owner.db.rpc('create_couple', { p_started_on: '2023-03-03', p_name: 'Rafa & <b>Duda</b>' })
  const recipient = `${PREFIX}-${tag}-${Date.now()}@exemplo.com`
  const { data } = await owner.db.rpc('create_invite', { p_email: recipient, p_invitee_name: 'Duda' })
  const invite = data as { invite_id: string; code: string }
  await clearMailsTo(recipient)
  return { owner, recipient, invite }
}

async function invoke(db: Db, inviteId: string) {
  const { data, error } = await db.functions.invoke('send-invite', { body: { invite_id: inviteId } })
  if (error) throw new Error(`send-invite: ${error.message}`)
  return data as { status: string; retry_after_s?: number }
}

beforeAll(async () => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const user of data.users) {
    if (user.email?.startsWith(`${PREFIX}-`)) await deleteUserAndCouple(user.id)
  }
}, 60_000)

afterAll(async () => {
  for (const id of created) await deleteUserAndCouple(id)
}, 60_000)

describe('A17 — o e-mail sai, com o código e o link', () => {
  it('uma mensagem para o convidado, e last_sent_at preenchido', async () => {
    const { owner, recipient, invite } = await setup('a17')

    expect(await invoke(owner.db, invite.invite_id)).toEqual({ status: 'sent' })

    const mails = await mailsTo(recipient)
    expect(mails).toHaveLength(1)
    expect(mails[0]!.Subject).toBe('Rafa te convidou pro espaço Rafa & <b>Duda</b> 💌')

    const body = await mailText(mails[0]!.ID)
    expect(body.Text).toContain(`#convite=${invite.code}`)
    expect(body.Text).toContain(`${invite.code.slice(0, 3)}-${invite.code.slice(3)}`)
    expect(body.Text).toContain('Oi, Duda!')
    // O nome do casal é texto do usuário: no HTML ele chega escapado.
    expect(body.HTML).toContain('Rafa &amp; &lt;b&gt;Duda&lt;/b&gt;')
    expect(body.HTML).not.toContain('<b>Duda</b>')

    const { data } = await owner.db.from('couple_invites').select('last_sent_at, send_count').eq('id', invite.invite_id).single()
    expect(data?.last_sent_at).not.toBeNull()
    expect(data?.send_count).toBe(1)
  })
})

describe('A18 — só membro manda, e não em rajada', () => {
  it('quem é de fora recebe `not_member` e nada sai', async () => {
    const { recipient, invite } = await setup('a18-fora')
    const stranger = await newMember('a18-estranho')

    expect(await invoke(stranger.db, invite.invite_id)).toEqual({ status: 'not_member' })
    expect(await mailsTo(recipient)).toHaveLength(0)
  })

  it('dois envios em menos de 60 s: o segundo é `rate_limited`', async () => {
    const { owner, recipient, invite } = await setup('a18-rajada')

    expect((await invoke(owner.db, invite.invite_id)).status).toBe('sent')
    const second = await invoke(owner.db, invite.invite_id)
    expect(second.status).toBe('rate_limited')
    expect(second.retry_after_s).toBeGreaterThan(0)
    expect(await mailsTo(recipient)).toHaveLength(1)
  })

  it('sem sessão, o gateway recusa antes da função', async () => {
    const { invite } = await setup('a18-anon')
    const { error } = await anonClient().functions.invoke('send-invite', { body: { invite_id: invite.invite_id } })
    expect(error).not.toBeNull()
  })
})

describe('A19 — transporte que falha não vira "enviado"', () => {
  it('`send_failed`, last_sent_at nulo, convite continua pendente', async () => {
    const { owner, invite } = await setup('a19')

    const result = await handleSendInvite(
      { invite_id: invite.invite_id },
      {
        appUrl: 'http://127.0.0.1:5173',
        transport: async () => {
          throw new Error('connect ECONNREFUSED 127.0.0.1:1')
        },
        beginSend: async (id) => {
          const { data, error } = await owner.db.rpc('begin_invite_send', { p_invite_id: id })
          if (error) throw new Error(error.message)
          return data as BeginSendResult
        },
        markSent: async (id) => {
          await owner.db.rpc('mark_invite_sent', { p_invite_id: id })
        },
      },
    )

    expect(result).toEqual({ status: 'send_failed', cause: 'connect ECONNREFUSED 127.0.0.1:1' })

    const { data } = await owner.db
      .from('couple_invites')
      .select('last_sent_at, send_count, accepted_at, revoked_at, expires_at')
      .eq('id', invite.invite_id)
      .single()
    expect(data?.last_sent_at).toBeNull()
    expect(data?.send_count).toBe(1) // a tentativa conta, para o limite
    expect(data?.accepted_at).toBeNull()
    expect(data?.revoked_at).toBeNull()
    expect(new Date(data!.expires_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('corpo inválido → `invalid_request`, sem tocar no banco', async () => {
    let touched = false
    const result = await handleSendInvite(
      { invite_id: 'nao-e-uuid' },
      {
        appUrl: 'x',
        transport: async () => {},
        beginSend: async () => {
          touched = true
          return { status: 'not_member' }
        },
        markSent: async () => {},
      },
    )
    expect(result).toEqual({ status: 'invalid_request' })
    expect(touched).toBe(false)
  })
})
