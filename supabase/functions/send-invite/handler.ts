// O miolo de `send-invite`, sem Deno e sem supabase-js: as dependências entram
// por parâmetro. É o que deixa o teste provar a falha de transporte (A19) sem
// derrubar o Mailpit de verdade.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, seções 5 ("Edge function") e 7
// ADR:  .agent/Decisions/0006-email-transacional-por-resend-em-edge-function.md

import { renderInviteEmail } from './email.ts'
import type { InviteEmailData, RenderedEmail } from './email.ts'

export type BeginSendResult =
  | ({ status: 'ok'; send_count: number } & InviteEmailData)
  | { status: 'not_member' }
  | { status: 'not_pending' }
  | { status: 'rate_limited'; retry_after_s: number }

export type SendInviteResult =
  | { status: 'sent' }
  | { status: 'send_failed'; cause: string }
  | { status: 'not_member' }
  | { status: 'not_pending' }
  | { status: 'rate_limited'; retry_after_s: number }
  | { status: 'invalid_request' }

export interface SendInviteDeps {
  /** RPC `begin_invite_send`, chamada COM O JWT de quem pediu — nunca service_role. */
  beginSend: (inviteId: string) => Promise<BeginSendResult>
  /** RPC `mark_invite_sent`. Só depois de o transporte aceitar. */
  markSent: (inviteId: string) => Promise<void>
  /** Resolve quando o provedor aceitou; rejeita com a causa quando não. */
  transport: (message: RenderedEmail, idempotencyKey: string) => Promise<void>
  appUrl: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function handleSendInvite(body: unknown, deps: SendInviteDeps): Promise<SendInviteResult> {
  const inviteId = (body as { invite_id?: unknown } | null)?.invite_id
  if (typeof inviteId !== 'string' || !UUID.test(inviteId)) return { status: 'invalid_request' }

  // A autorização mora aqui dentro, no banco, sob a identidade de quem chama.
  // Esta função não decide quem pode — ela pergunta.
  const begun = await deps.beginSend(inviteId)
  if (begun.status !== 'ok') return begun

  const message = renderInviteEmail(begun, deps.appUrl)

  try {
    // `send_count` já foi incrementado: uma repetição desta mesma tentativa
    // cai na mesma chave, e um reenvio legítimo tem chave nova.
    await deps.transport(message, `${inviteId}:${begun.send_count}`)
  } catch (error) {
    // Nada de `markSent`: a tela continua dizendo que o e-mail não saiu (R5).
    return { status: 'send_failed', cause: error instanceof Error ? error.message : String(error) }
  }

  // Se isto falhar, a pessoa recebeu o e-mail e a tela vai dizer que não. É o
  // lado seguro do erro: duplicar em vez de mentir (spec, seção 7).
  await deps.markSent(inviteId)
  return { status: 'sent' }
}
