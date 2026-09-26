// Sessões ativas da própria conta (R21). As RPCs cortam por auth.uid() dentro
// delas (I8) e não devolvem IP nem token.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, seção 5 (migration 5)

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { DataResult } from './result'
import { callRpc } from './rpc'
import type { Failure } from './rpc'

type Db = SupabaseClient<Database>

export interface ActiveSession {
  id: string
  userAgent: string | null
  createdAt: string
  lastActiveAt: string
  isCurrent: boolean
}

export async function listMySessions(db: Db): Promise<DataResult<ActiveSession[]>> {
  const { data, error } = await db.rpc('list_my_sessions')
  if (error) {
    return error.code === '42501' ? { status: 'unauthenticated' } : { status: 'error', cause: error.message }
  }
  return {
    status: 'ok',
    rows: data.map((s) => ({
      id: s.id,
      userAgent: s.user_agent,
      createdAt: s.created_at,
      lastActiveAt: s.last_active_at,
      isCurrent: s.is_current,
    })),
  }
}

export type EndSessionResult = { status: 'ended' } | { status: 'not_found' } | Failure

/**
 * Derruba o refresh token daquela sessão. O access token que o outro aparelho
 * já tem vale até expirar (até 1 h) — a tela diz isso.
 */
export async function endMySession(db: Db, sessionId: string): Promise<EndSessionResult> {
  const result = await callRpc(db, 'end_my_session', { p_session_id: sessionId })
  if (result.status !== 'ok') return result
  if (result.data.status === 'ended' || result.data.status === 'not_found') return { status: result.data.status }
  return { status: 'error', cause: `end_my_session: status inesperado ${String(result.data.status)}` }
}
