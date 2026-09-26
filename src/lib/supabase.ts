// ADR: .agent/Decisions/0001-supabase-com-rls-por-casal.md
// ADR: .agent/Decisions/0004-login-com-senha-e-oauth.md

import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  // Falha no boot, alto. A alternativa é um cliente que constrói e devolve
  // erro de rede em toda query — indistinguível de "o projeto pausou".
  throw new Error(
    'VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY são obrigatórias. Ver .env.example.',
  )
}

/**
 * A chave publishable é pública por construção: ela vai no bundle. O que
 * protege o acervo é RLS, não o segredo da chave — e é por isso que nenhuma
 * query no cliente filtra por `couple_id`.
 *
 * O cliente é ÚNICO na aplicação (invariante I4 da Fase 1). Dois clientes são
 * dois armazenamentos de sessão e duas rotações de refresh token disputando o
 * mesmo registro — e o sintoma é sessão caindo sozinha, sem erro.
 *
 * As três primeiras opções já são o padrão do supabase-js; estão escritas
 * porque padrão implícito é decisão que ninguém revisa. `flowType` NÃO é:
 * auth-js 2.109 usa 'implicit', que devolve o access_token no fragmento da
 * URL — de onde ele entra no histórico do navegador e em qualquer Referer que
 * a página dispare. Ver .agent/Decisions/0004-login-com-senha-e-oauth.md.
 */
export const supabase = createClient<Database>(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})
