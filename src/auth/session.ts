// Spec: .agent/Tasks/fase-1-login.md, seção 5
//
// Módulo sem import de componente: testável sem DOM.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

type Db = SupabaseClient<Database>

export type AuthState =
  /**
   * Ainda restaurando do armazenamento. NÃO é 'signed_out' (I8) — tratar os
   * dois como um faz o Login piscar em toda recarga de quem já está logado, e
   * é o bug mais comum desta classe de tela.
   */
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'signed_in'; userId: string; email: string | null }

/**
 * Assina as mudanças de sessão e devolve a função de cancelamento.
 *
 * `onAuthStateChange` dispara uma vez no registro com a sessão restaurada (ou
 * com `null`), então não é preciso um `getSession()` inicial em paralelo —
 * fazer os dois produz duas respostas para a mesma pergunta, que chegam fora
 * de ordem.
 */
export function subscribeToAuth(db: Db, onChange: (state: AuthState) => void): () => void {
  const {
    data: { subscription },
  } = db.auth.onAuthStateChange((_event, session) => {
    onChange(
      session
        ? { status: 'signed_in', userId: session.user.id, email: session.user.email ?? null }
        : { status: 'signed_out' },
    )
  })

  return () => subscription.unsubscribe()
}
