// Fronteira de banco do convite. snake_case do banco → camelCase da tela, num
// lugar só, como `stays.ts`.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, seções 5, 7 e 9
// ADR:  .agent/Decisions/0008-convite-portador-e-um-casal-por-pessoa.md
//       .agent/Decisions/0006-email-transacional-por-resend-em-edge-function.md

import type { SupabaseClient } from '@supabase/supabase-js'
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { DataResult } from './result'
import { callRpc } from './rpc'
import type { Failure } from './rpc'

type Db = SupabaseClient<Database>
type Raw = Record<string, unknown>

const str = (v: unknown) => (typeof v === 'string' ? v : null)

// ---------------------------------------------------------------------------
// Recusas comuns ao preview e ao aceite. Revogado NÃO aparece aqui: o banco o
// devolve como `not_found` (spec, seção 9).
// ---------------------------------------------------------------------------
export type InviteRefusal =
  | { status: 'not_found' }
  | { status: 'expired'; inviterName: string; createdAt: string; expiresAt: string }
  | { status: 'used'; coupleName: string | null }
  | { status: 'own_couple' }
  | { status: 'already_member'; coupleName: string | null }
  | { status: 'rate_limited'; retryAfterS: number }

function toRefusal(raw: Raw): InviteRefusal | null {
  switch (raw.status) {
    case 'not_found':
      return { status: 'not_found' }
    case 'expired':
      return {
        status: 'expired',
        inviterName: str(raw.inviter_display_name) ?? '',
        createdAt: str(raw.created_at) ?? '',
        expiresAt: str(raw.expires_at) ?? '',
      }
    case 'used':
      return { status: 'used', coupleName: str(raw.couple_name) }
    case 'own_couple':
      return { status: 'own_couple' }
    case 'already_member':
      return { status: 'already_member', coupleName: str(raw.couple_name) }
    case 'rate_limited':
      return { status: 'rate_limited', retryAfterS: Number(raw.retry_after_s) || 60 }
    default:
      return null
  }
}

const unexpected = (fn: string, raw: Raw): Failure => ({
  status: 'error',
  cause: `${fn}: status inesperado ${String(raw.status)}`,
})

// ---------------------------------------------------------------------------
// Preview e aceite
// ---------------------------------------------------------------------------
export interface InvitePreview {
  code: string
  coupleName: string | null
  startedOn: string
  inviterName: string
  inviterFullName: string
  inviterCity: string | null
  expiresAt: string
}

export type LookupResult = { status: 'valid'; invite: InvitePreview } | InviteRefusal | Failure

export async function lookupInvite(db: Db, code: string): Promise<LookupResult> {
  const result = await callRpc(db, 'lookup_invite', { p_code: code })
  if (result.status !== 'ok') return result
  const raw = result.data
  if (raw.status === 'valid') {
    return {
      status: 'valid',
      invite: {
        code: str(raw.code) ?? code,
        coupleName: str(raw.couple_name),
        startedOn: str(raw.started_on) ?? '',
        inviterName: str(raw.inviter_display_name) ?? '',
        inviterFullName: str(raw.inviter_full_name) ?? '',
        inviterCity: str(raw.inviter_city),
        expiresAt: str(raw.expires_at) ?? '',
      },
    }
  }
  return toRefusal(raw) ?? unexpected('lookup_invite', raw)
}

export type AcceptResult =
  | { status: 'joined'; coupleId: string }
  | { status: 'no_profile' }
  | InviteRefusal
  | Failure

export async function acceptInvite(db: Db, code: string): Promise<AcceptResult> {
  const result = await callRpc(db, 'accept_invite', { p_code: code })
  if (result.status !== 'ok') return result
  const raw = result.data
  if (raw.status === 'joined') return { status: 'joined', coupleId: str(raw.couple_id) ?? '' }
  if (raw.status === 'no_profile') return { status: 'no_profile' }
  return toRefusal(raw) ?? unexpected('accept_invite', raw)
}

// ---------------------------------------------------------------------------
// Criar, renovar, ler o aberto
// ---------------------------------------------------------------------------
export interface IssuedInvite {
  inviteId: string
  code: string
  expiresAt: string
}

export type CreateInviteResult =
  | ({ status: 'created' } & IssuedInvite)
  | { status: 'not_member' }
  | { status: 'couple_full' }
  | { status: 'invalid'; field: 'email' | 'invitee_name' }
  | { status: 'own_email' }
  | Failure

const toIssued = (raw: Raw): IssuedInvite => ({
  inviteId: str(raw.invite_id) ?? '',
  code: str(raw.code) ?? '',
  expiresAt: str(raw.expires_at) ?? '',
})

/** Havendo convite aberto, o banco o revoga e cria outro ("trocar e-mail"). */
export async function createInvite(
  db: Db,
  input: { email: string; inviteeName: string | null },
): Promise<CreateInviteResult> {
  const result = await callRpc(db, 'create_invite', {
    p_email: input.email,
    p_invitee_name: input.inviteeName ?? undefined,
  })
  if (result.status !== 'ok') return result
  const raw = result.data
  switch (raw.status) {
    case 'created':
      return { status: 'created', ...toIssued(raw) }
    case 'invalid':
      return { status: 'invalid', field: raw.field === 'invitee_name' ? 'invitee_name' : 'email' }
    case 'not_member':
    case 'couple_full':
    case 'own_email':
      return { status: raw.status }
    default:
      return unexpected('create_invite', raw)
  }
}

export type RenewInviteResult =
  | ({ status: 'renewed' } & IssuedInvite)
  | { status: 'no_open_invite' }
  | { status: 'not_member' }
  | Failure

/** Mesmo código, mais 7 dias. Vale para pendente e para expirado. */
export async function renewInvite(db: Db): Promise<RenewInviteResult> {
  const result = await callRpc(db, 'renew_invite')
  if (result.status !== 'ok') return result
  const raw = result.data
  if (raw.status === 'renewed') return { status: 'renewed', ...toIssued(raw) }
  if (raw.status === 'no_open_invite' || raw.status === 'not_member') return { status: raw.status }
  return unexpected('renew_invite', raw)
}

export interface OpenInvite {
  id: string
  code: string
  email: string
  inviteeName: string | null
  expiresAt: string
  /** Último envio ACEITO pelo provedor. Nulo = o e-mail ainda não saiu (R5). */
  lastSentAt: string | null
}

/**
 * O convite aberto do casal de quem pede, ou `null`. Sem filtro por casal: a
 * policy devolve só os do próprio, e I5 garante no máximo um aberto.
 */
export async function loadOpenInvite(db: Db): Promise<DataResult<OpenInvite | null>> {
  const { data: session } = await db.auth.getSession()
  if (!session.session) return { status: 'unauthenticated' }

  const { data, error } = await db
    .from('couple_invites')
    .select('id, code, email, invitee_name, expires_at, last_sent_at')
    .is('accepted_at', null)
    .is('revoked_at', null)
    .maybeSingle()
  if (error) return { status: 'error', cause: error.message }
  if (!data) return { status: 'ok', rows: null }
  return {
    status: 'ok',
    rows: {
      id: data.id,
      code: data.code,
      email: data.email,
      inviteeName: data.invitee_name,
      expiresAt: data.expires_at,
      lastSentAt: data.last_sent_at,
    },
  }
}

// ---------------------------------------------------------------------------
// Envio — a edge function
// ---------------------------------------------------------------------------
export type SendInviteResult =
  | { status: 'sent' }
  | { status: 'send_failed'; cause: string }
  | { status: 'not_member' }
  | { status: 'not_pending' }
  | { status: 'rate_limited'; retryAfterS: number }
  | Failure

/**
 * Só `sent` autoriza a tela a dizer "enviado" (R5). Todo o resto — inclusive a
 * função fora do ar — é "o e-mail não saiu", com o código ainda na tela.
 */
export async function sendInvite(db: Db, inviteId: string): Promise<SendInviteResult> {
  const { data, error } = await db.functions.invoke('send-invite', { body: { invite_id: inviteId } })

  let raw: Raw | null = data && typeof data === 'object' ? (data as Raw) : null
  if (error) {
    // Não-2xx: o corpo ainda diz o porquê (401 sem sessão, 500 inesperado).
    if (error instanceof FunctionsHttpError) {
      const response = error.context as Response
      if (response.status === 401) return { status: 'unauthenticated' }
      raw = (await response.json().catch(() => null)) as Raw | null
    }
    if (!raw) return { status: 'error', cause: error.message }
  }
  if (!raw) return { status: 'error', cause: 'send-invite: resposta vazia' }

  switch (raw.status) {
    case 'sent':
    case 'not_member':
    case 'not_pending':
      return { status: raw.status }
    case 'send_failed':
      return { status: 'send_failed', cause: str(raw.cause) ?? 'falha no provedor' }
    case 'rate_limited':
      return { status: 'rate_limited', retryAfterS: Number(raw.retry_after_s) || 60 }
    default:
      return { status: 'error', cause: str(raw.cause) ?? `send-invite: ${String(raw.status)}` }
  }
}
