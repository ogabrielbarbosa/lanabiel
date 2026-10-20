// Assistentes conectados pelo MCP (ADR 0031): cada um é uma autorização que a
// pessoa deu no consentimento do OAuth do Supabase Auth. Não há tabela nossa;
// quem guarda é o Auth, e só a própria pessoa vê as dela.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { DataResult } from './result'
import type { Failure } from './rpc'

type Db = SupabaseClient<Database>

/** O endereço que se cola no assistente. É o que a função anuncia (`MCP_PUBLIC_URL`). */
export const MCP_URL = 'https://lanabiel.ogabarbosa.com/mcp'

export interface ConnectedAssistant {
  clientId: string
  name: string
  grantedAt: string
}

const sessionGone = (message: string) => /session|jwt|not authenticated/i.test(message)

export async function listAssistants(db: Db): Promise<DataResult<ConnectedAssistant[]>> {
  const { data, error } = await db.auth.oauth.listGrants()
  if (error) return sessionGone(error.message) ? { status: 'unauthenticated' } : { status: 'error', cause: error.message }
  return {
    status: 'ok',
    rows: (data ?? [])
      .map((g) => ({ clientId: g.client.id, name: g.client.name?.trim() || 'Assistente sem nome', grantedAt: g.granted_at }))
      .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt)),
  }
}

/** Revoga: o Auth apaga as sessões daquele cliente e invalida o refresh token. */
export async function disconnectAssistant(db: Db, clientId: string): Promise<{ status: 'ok' } | Failure> {
  const { error } = await db.auth.oauth.revokeGrant({ clientId })
  if (error) return sessionGone(error.message) ? { status: 'unauthenticated' } : { status: 'error', cause: error.message }
  return { status: 'ok' }
}
