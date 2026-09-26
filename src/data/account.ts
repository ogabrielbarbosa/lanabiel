// Spec: .agent/Tasks/fase-1-login.md, seção 5 ("O portão — a ponte para a Fase 2")
//
// Responde a pergunta que o roteamento inteiro depende: esta pessoa está
// autenticada, e quão longe ela chegou no cadastro? Três estágios, não dois,
// porque as duas lacunas pedem passos diferentes do onboarding (Fase 2).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { DataResult } from './result'

type Db = SupabaseClient<Database>

export type AccountStage =
  /** Autenticado, sem linha em `profiles`. O onboarding começa do passo 1. */
  | { stage: 'needs_profile' }
  /** Perfil existe, mas nenhuma linha em `couple_members`. */
  | { stage: 'needs_couple'; profileId: string }
  | { stage: 'ready'; profileId: string; coupleId: string; slot: 1 | 2 }

/**
 * O estágio da conta de quem está pedindo.
 *
 * Devolve `DataResult` pelo mesmo motivo que `listStays`: sem sessão, RLS
 * responde ZERO LINHAS e não erro, e o projeto pausado responde falha de rede.
 * Colapsar os três em "não tem perfil" mandaria quem tem casal para a tela de
 * onboarding porque a rede caiu.
 *
 * Os dois filtros por `auth.uid()` aqui são IDENTIDADE, não autorização — é
 * uma distinção que importa: o cliente continua sem filtrar por `couple_id` em
 * lugar nenhum, e quem corta continua sendo a policy.
 */
export async function loadAccountStage(db: Db): Promise<DataResult<AccountStage>> {
  const { data: sessionData, error: sessionError } = await db.auth.getSession()
  if (sessionError) return { status: 'error', cause: sessionError.message }

  const session = sessionData.session
  if (!session) return { status: 'unauthenticated' }
  const profileId = session.user.id

  // Zero linhas aqui significa mesmo "não tem perfil": a policy
  // `profiles_select_self_or_partner` sempre deixa a pessoa ler a si mesma.
  // Se um dia ela mudar, esta leitura passa a mentir — e é por isso que a
  // dependência está escrita aqui, e não só na spec.
  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id')
    .eq('id', profileId)
    .maybeSingle()
  if (profileError) return { status: 'error', cause: profileError.message }
  if (!profile) return { status: 'ok', rows: { stage: 'needs_profile' } }

  // `.eq('profile_id', ...)` porque a policy devolve as linhas dos DOIS
  // integrantes do casal, e o que interessa aqui é a própria.
  const { data: membership, error: membershipError } = await db
    .from('couple_members')
    .select('couple_id, slot')
    .eq('profile_id', profileId)
    .maybeSingle()
  if (membershipError) return { status: 'error', cause: membershipError.message }
  if (!membership) return { status: 'ok', rows: { stage: 'needs_couple', profileId } }

  // O `CHECK (slot in (1, 2))` do schema garante isto. Falhar alto se um dia
  // não garantir é melhor que estreitar o tipo na marra e a faixa do
  // calendário sair errada sem ninguém saber por quê.
  if (membership.slot !== 1 && membership.slot !== 2) {
    return { status: 'error', cause: `slot fora de (1,2): ${membership.slot}` }
  }

  return {
    status: 'ok',
    rows: { stage: 'ready', profileId, coupleId: membership.couple_id, slot: membership.slot },
  }
}
