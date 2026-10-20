// O consentimento do servidor OAuth 2.1 do Supabase Auth (ADR 0031): o Claude
// (ou outro cliente MCP) manda a pessoa a `/oauth/consent?authorization_id=…`,
// e esta tela mostra quem pede e devolve a decisão ao Auth.
//
// Spec: .agent/Tasks/mcp-server.md, R4

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

type Db = SupabaseClient<Database>

export const CONSENT_PATH = '/oauth/consent'

export interface ConsentRequest {
  authorizationId: string
  clientName: string
  redirectUri: string
  scopes: string[]
}

export type ConsentDetails =
  | { status: 'ask'; request: ConsentRequest }
  /** Já consentido antes: o Auth devolve direto para onde ir. */
  | { status: 'redirect'; url: string }
  | { status: 'error'; cause: string }

export type ConsentDecision = { status: 'redirect'; url: string } | { status: 'error'; cause: string }

export interface ConsentApi {
  details: (authorizationId: string) => Promise<ConsentDetails>
  approve: (authorizationId: string) => Promise<ConsentDecision>
  deny: (authorizationId: string) => Promise<ConsentDecision>
  /** Sair da página para o cliente. Injetável: o jsdom não navega. */
  go: (url: string) => void
}

export function authorizationIdFrom(search: string): string | null {
  const id = new URLSearchParams(search).get('authorization_id')
  return id && id.trim() !== '' ? id.trim() : null
}

/** `go` vem de fora (`window.location.assign` no app): este arquivo também roda no Node, no teste do OAuth. */
export function consentApi(db: Db, go: (url: string) => void = () => {}): ConsentApi {
  return {
    async details(authorizationId) {
      const { data, error } = await db.auth.oauth.getAuthorizationDetails(authorizationId)
      if (error || !data) return { status: 'error', cause: error?.message ?? 'resposta vazia' }
      if (!('authorization_id' in data)) return { status: 'redirect', url: data.redirect_url }
      return {
        status: 'ask',
        request: {
          authorizationId: data.authorization_id,
          clientName: data.client?.name?.trim() || 'Um aplicativo',
          redirectUri: data.redirect_uri,
          scopes: (data.scope ?? '').split(/\s+/).filter(Boolean),
        },
      }
    },
    async approve(authorizationId) {
      const { data, error } = await db.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
      if (error || !data) return { status: 'error', cause: error?.message ?? 'resposta vazia' }
      return { status: 'redirect', url: data.redirect_url }
    },
    async deny(authorizationId) {
      const { data, error } = await db.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true })
      if (error || !data) return { status: 'error', cause: error?.message ?? 'resposta vazia' }
      return { status: 'redirect', url: data.redirect_url }
    },
    go,
  }
}

/** `https://claude.ai/api/mcp/auth_callback` → `claude.ai`. URL ruim fica como veio. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host || url
  } catch {
    return url
  }
}
