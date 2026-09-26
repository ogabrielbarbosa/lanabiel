// ADR: .agent/Decisions/0001-supabase-com-rls-por-casal.md

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
 */
export const supabase = createClient<Database>(url, publishableKey)
