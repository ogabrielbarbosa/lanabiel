// ADR: .agent/Decisions/0004-login-com-senha-e-oauth.md
// Spec: .agent/Tasks/fase-1-login.md, seção 5
//
// Fronteira: o erro do GoTrue é opaco para quem lê a tela. Traduzir cada um
// numa causa nomeada é o que permite a interface dizer "essa senha já apareceu
// num vazamento" em vez de "algo deu errado" — mesmo raciocínio que levou
// `stays.ts` a traduzir `stays_no_overlap`.

import { isAuthWeakPasswordError } from '@supabase/supabase-js'
import type { AuthError, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

type Db = SupabaseClient<Database>

export type Provider = 'google' | 'apple'

export interface Credentials {
  email: string
  password: string
}

export type SignInResult =
  | { status: 'signed_in' }
  /**
   * E-mail inexistente OU senha errada. Um caso só, de propósito (I10):
   * distinguir os dois informaria a quem tentasse quais e-mails têm conta
   * aqui — que, num app de duas pessoas, é informação sobre duas pessoas.
   */
  | { status: 'invalid_credentials' }
  | { status: 'rate_limited'; retryAfterSeconds: number | null }
  | { status: 'error'; cause: string }

export type SignUpResult =
  | { status: 'signed_in' }
  | { status: 'email_taken' }
  /** `too_short` é regra nossa; `leaked` é a checagem contra listas conhecidas. */
  | { status: 'weak_password'; reason: 'too_short' | 'leaked' }
  | { status: 'invalid_email' }
  | { status: 'rate_limited'; retryAfterSeconds: number | null }
  | { status: 'error'; cause: string }

/** Espelha `minimum_password_length` do config.toml. Feedback instantâneo na
 *  tela; a autoridade continua sendo o servidor, que recusa de novo. */
export const MIN_PASSWORD = 12

export type ChangePasswordResult =
  | { status: 'changed' }
  | { status: 'weak_password'; reason: 'too_short' | 'leaked' }
  /** A senha nova é igual à atual. */
  | { status: 'same_password' }
  | { status: 'unauthenticated' }
  | { status: 'error'; cause: string }

export type RedirectResult = { status: 'redirecting' } | { status: 'error'; cause: string }

/** `Retry-After` chega em segundos quando o GoTrue o envia; nem sempre envia. */
function retryAfter(error: AuthError): number | null {
  const raw = (error as { retryAfter?: unknown }).retryAfter
  return typeof raw === 'number' ? raw : null
}

export async function signInWithPassword(db: Db, creds: Credentials): Promise<SignInResult> {
  const { error } = await db.auth.signInWithPassword(creds)
  if (!error) return { status: 'signed_in' }

  switch (error.code) {
    case 'invalid_credentials':
    case 'user_not_found':
      return { status: 'invalid_credentials' }
    case 'over_request_rate_limit':
      return { status: 'rate_limited', retryAfterSeconds: retryAfter(error) }
    default:
      return { status: 'error', cause: error.message }
  }
}

export async function signUpWithPassword(db: Db, creds: Credentials): Promise<SignUpResult> {
  const { data, error } = await db.auth.signUp(creds)

  if (error) {
    // Precisa vir antes do switch: senha fraca chega como uma subclasse com os
    // motivos dentro, não como um código no `error.code`.
    if (isAuthWeakPasswordError(error)) {
      if (error.reasons.includes('pwned')) return { status: 'weak_password', reason: 'leaked' }
      if (error.reasons.includes('length')) return { status: 'weak_password', reason: 'too_short' }
      // `characters` só existe com `password_requirements` preenchido, e o
      // ADR 0004 o deixa vazio. Chegar aqui é deriva de configuração, e
      // rotulá-la de "curta demais" mandaria a pessoa aumentar uma senha que
      // já tem tamanho. Falha alto.
      return { status: 'error', cause: `senha recusada por ${error.reasons.join(', ')}` }
    }

    switch (error.code) {
      case 'user_already_exists':
      case 'email_exists':
        return { status: 'email_taken' }
      case 'email_address_invalid':
      case 'validation_failed':
        return { status: 'invalid_email' }
      case 'over_request_rate_limit':
        return { status: 'rate_limited', retryAfterSeconds: retryAfter(error) }
      default:
        return { status: 'error', cause: error.message }
    }
  }

  // Com `enable_confirmations` desligado o cadastro devolve sessão na hora. Se
  // alguém religar a confirmação, `session` volta nula e o cadastro passa a
  // "dar certo" sem ninguém entrar — falha silenciosa que esta guarda converte
  // em erro visível.
  if (!data.session) {
    return {
      status: 'error',
      cause: 'cadastro sem sessão: `enable_confirmations` está ligado? Ver ADR 0004.',
    }
  }

  return { status: 'signed_in' }
}

/**
 * `origin` entra por parâmetro em vez de sair de `window`: este módulo é
 * typecheckado também pelo tsconfig dos testes, que não carrega a lib de DOM —
 * e uma origem explícita é o que o teste consegue afirmar (A13).
 */
export async function signInWithProvider(
  db: Db,
  provider: Provider,
  origin: string,
): Promise<RedirectResult> {
  const { error } = await db.auth.signInWithOAuth({ provider, options: { redirectTo: origin } })
  return error ? { status: 'error', cause: error.message } : { status: 'redirecting' }
}

/**
 * Sai DESTE aparelho. O padrão do supabase-js v2 é `scope: 'global'`, que
 * derrubaria todas as sessões da conta — "Sair desta conta" e "Encerrar" na
 * sessão atual (Fase 3, R21) prometem só esta. Encerrar outra sessão é
 * `end_my_session`.
 */
export async function signOut(db: Db): Promise<void> {
  await db.auth.signOut({ scope: 'local' })
}

const KNOWN_PROVIDERS: readonly Provider[] = ['google', 'apple']

/**
 * Provedores com credencial configurada. **Vazio é resposta válida**: a tela
 * mostra só e-mail e senha. Renderizar um botão sem credencial atrás leva a
 * pessoa a um erro do provedor em vez de a um caminho que funciona.
 */
export function enabledProviders(raw: string | undefined): readonly Provider[] {
  if (!raw) return []
  const wanted = raw.split(',').map((p) => p.trim().toLowerCase())
  return KNOWN_PROVIDERS.filter((p) => wanted.includes(p))
}

/**
 * Configurações › Meu perfil (Fase 3). Com `secure_password_change = false`
 * não pede a senha atual — trade-off registrado na seção 9 da spec. Para quem
 * entrou só com Google, esta vira a primeira senha da conta.
 */
export async function changePassword(db: Db, password: string): Promise<ChangePasswordResult> {
  const { error } = await db.auth.updateUser({ password })
  if (!error) return { status: 'changed' }
  if (isAuthWeakPasswordError(error)) {
    if (error.reasons.includes('pwned')) return { status: 'weak_password', reason: 'leaked' }
    if (error.reasons.includes('length')) return { status: 'weak_password', reason: 'too_short' }
    return { status: 'error', cause: `senha recusada por ${error.reasons.join(', ')}` }
  }
  if (error.code === 'same_password') return { status: 'same_password' }
  if (error.code === 'session_not_found' || error.status === 401) return { status: 'unauthenticated' }
  return { status: 'error', cause: error.message }
}
