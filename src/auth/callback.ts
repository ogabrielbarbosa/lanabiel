// Spec: .agent/Tasks/fase-1-login.md, seção 5
//
// O único fluxo que volta pela URL é o OAuth — o link mágico saiu no ADR 0004.
// Com `detectSessionInUrl: true` o cliente já troca o `code` por sessão
// sozinho; o que este módulo acrescenta é (a) nomear a recusa do provedor, que
// chega como querystring e não como exceção, e (b) LIMPAR a URL, que o cliente
// faz para o `code` mas não para os parâmetros de erro.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

type Db = SupabaseClient<Database>

export type CallbackResult =
  /** Não havia nada de autenticação na URL — carregamento normal. */
  | { status: 'none' }
  | { status: 'signed_in' }
  /** O provedor recusou, ou a pessoa cancelou na tela dele. */
  | { status: 'provider_denied'; cause: string }
  | { status: 'error'; cause: string }

const AUTH_PARAMS = ['code', 'error', 'error_code', 'error_description', 'state'] as const

/** Tira os parâmetros de auth da barra de endereços sem recarregar (R4). */
function scrub(url: URL, replace: (href: string) => void): void {
  const clean = new URL(url.href)
  let touched = false
  for (const param of AUTH_PARAMS) {
    if (clean.searchParams.has(param)) {
      clean.searchParams.delete(param)
      touched = true
    }
  }
  if (clean.hash) {
    clean.hash = ''
    touched = true
  }
  if (touched) replace(clean.href)
}

export async function consumeAuthCallback(
  db: Db,
  url: URL,
  /** Quem chama passa o `history.replaceState`; aqui não se toca em `window`. */
  replaceUrl: (href: string) => void,
): Promise<CallbackResult> {
  const params = url.searchParams
  const providerError = params.get('error')

  if (providerError) {
    // `error_description` é o texto do provedor e é o que serve para a pessoa;
    // `error` sozinho é `access_denied`, que não diz nada a ninguém.
    const cause = params.get('error_description') ?? providerError
    scrub(url, replaceUrl)
    return { status: 'provider_denied', cause }
  }

  if (!params.has('code')) return { status: 'none' }

  const { error } = await db.auth.exchangeCodeForSession(params.get('code') ?? '')
  scrub(url, replaceUrl)

  return error ? { status: 'error', cause: error.message } : { status: 'signed_in' }
}
