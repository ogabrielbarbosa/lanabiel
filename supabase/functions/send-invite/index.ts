// Edge function `send-invite` — Deno. Só liga o `handler.ts` ao mundo.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, seção 5 ("Edge function")
// ADR:  .agent/Decisions/0006-email-transacional-por-resend-em-edge-function.md
//
// NÃO usa service_role. O cliente Supabase daqui carrega o `Authorization` de
// quem chamou, então `begin_invite_send` roda sob a identidade dessa pessoa e
// a autorização continua na RPC, sob RLS (ADR 0001).
//
// Segredos: INVITE_EMAIL_TRANSPORT ('resend' | 'mailpit'), RESEND_API_KEY,
// INVITE_FROM ('lanabiel <convite@dominio>'), APP_URL, MAILPIT_URL.
// SUPABASE_URL e SUPABASE_ANON_KEY o runtime já injeta.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleSendInvite } from './handler.ts'
import type { BeginSendResult } from './handler.ts'
import type { RenderedEmail } from './email.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function env(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`segredo ausente: ${name}`)
  return value
}

/** `'lanabiel <convite@x.app>'` → `{ name: 'lanabiel', email: 'convite@x.app' }`. */
function parseFrom(from: string): { name: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return match ? { name: match[1], email: match[2] } : { name: '', email: from.trim() }
}

async function resend(message: RenderedEmail, idempotencyKey: string): Promise<void> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      from: env('INVITE_FROM'),
      to: [message.to],
      subject: message.subject,
      html: message.html,
      text: message.text,
    }),
  })
  if (!response.ok) throw new Error(`Resend ${response.status}: ${await response.text()}`)
}

/** Só local: o Mailpit da stack do Supabase aceita envio por HTTP. */
async function mailpit(message: RenderedEmail): Promise<void> {
  const from = parseFrom(env('INVITE_FROM'))
  const response = await fetch(`${env('MAILPIT_URL')}/api/v1/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      From: { Email: from.email, Name: from.name },
      To: [{ Email: message.to }],
      Subject: message.subject,
      HTML: message.html,
      Text: message.text,
    }),
  })
  if (!response.ok) throw new Error(`Mailpit ${response.status}: ${await response.text()}`)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  if (request.method !== 'POST') return reply({ status: 'invalid_request' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return reply({ status: 'not_member' }, 401)

  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const transportName = Deno.env.get('INVITE_EMAIL_TRANSPORT') ?? 'resend'
  const transport =
    transportName === 'mailpit'
      ? (message: RenderedEmail) => mailpit(message)
      : (message: RenderedEmail, key: string) => resend(message, key)

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    return reply({ status: 'invalid_request' }, 400)
  }

  try {
    const result = await handleSendInvite(body, {
      appUrl: env('APP_URL'),
      transport,
      beginSend: async (inviteId) => {
        const { data, error } = await db.rpc('begin_invite_send', { p_invite_id: inviteId })
        if (error) throw new Error(`begin_invite_send: ${error.message}`)
        return data as BeginSendResult
      },
      markSent: async (inviteId) => {
        const { error } = await db.rpc('mark_invite_sent', { p_invite_id: inviteId })
        if (error) throw new Error(`mark_invite_sent: ${error.message}`)
      },
    })
    return reply(result, result.status === 'invalid_request' ? 400 : 200)
  } catch (error) {
    // Inesperado: rede com o banco, segredo ausente. Nunca "enviado".
    return reply({ status: 'error', cause: error instanceof Error ? error.message : String(error) }, 500)
  }
})
