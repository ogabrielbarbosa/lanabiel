// A chamada de RPC comum às funções da Fase 2.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, seção 5 ("Funções")
//
// As RPCs devolvem `{ status }` para toda falha ESPERADA e só levantam exceção
// para "sem sessão" (42501) e para o inesperado. Aqui as duas saídas ruins
// viram casos irmãos do resultado — a mesma separação de `DataResult`: rede
// caída não pode parecer "código não encontrado".

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

type Db = SupabaseClient<Database>
type Functions = Database['public']['Functions']

export type Failure = { status: 'unauthenticated' } | { status: 'error'; cause: string }

export async function callRpc<Name extends keyof Functions>(
  db: Db,
  fn: Name,
  // Opcional: função sem parâmetro tem `Args` = `never` nos tipos gerados do
  // projeto online (o gerador local dava `{}`), e aí não se passa nada.
  args?: Functions[Name]['Args'],
): Promise<{ status: 'ok'; data: Record<string, unknown> } | Failure> {
  const { data, error } = await (
    db.rpc as (f: string, a: unknown) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>
  )(fn, args)
  if (error) {
    return error.code === '42501' ? { status: 'unauthenticated' } : { status: 'error', cause: error.message }
  }
  if (data === null || typeof data !== 'object') {
    return { status: 'error', cause: `${String(fn)}: resposta inesperada` }
  }
  return { status: 'ok', data: data as Record<string, unknown> }
}

/** `'23514'` é CHECK/trigger de faixa: a regra do banco recusou o valor. */
export function isCheckViolation(error: { code?: string } | null): boolean {
  return error?.code === '23514'
}
