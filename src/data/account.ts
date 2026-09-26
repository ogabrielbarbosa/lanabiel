// Spec: .agent/Tasks/fase-1-login.md, seção 5 ("O portão — a ponte para a Fase 2")
//       .agent/Tasks/fase-2-onboarding.md, seção 5 ("Cliente") — `awaiting_partner`
//
// Responde a pergunta que o roteamento inteiro depende: esta pessoa está
// autenticada, e quão longe ela chegou no cadastro? Quatro estágios, porque
// cada lacuna pede uma tela diferente: sem perfil, sem casal, e casal de um só.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { DataResult } from './result'

type Db = SupabaseClient<Database>

export type AccountStage =
  /** Autenticado, sem linha em `profiles`. O onboarding começa do passo 1. */
  | { stage: 'needs_profile' }
  /** Perfil existe, mas nenhuma linha em `couple_members`. */
  | { stage: 'needs_couple'; profileId: string }
  /**
   * Criou o espaço e está sozinho nele: a tela Aguardando. Sempre slot 1 —
   * quem entra por convite entra como slot 2, num casal que já tem o 1.
   */
  | { stage: 'awaiting_partner'; profileId: string; coupleId: string; slot: 1 }
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

  // SEM `.eq('profile_id', ...)`: a policy devolve as linhas do casal
  // inteiro — as da própria pessoa e as de quem divide casal com ela — e é a
  // contagem que separa `awaiting_partner` de `ready`. Continua sendo a
  // segunda e última viagem. Com `unique (profile_id)` (I1 da Fase 2), não há
  // como estas linhas virem de dois casais.
  const { data: memberships, error: membershipError } = await db
    .from('couple_members')
    .select('couple_id, profile_id, slot')
  if (membershipError) return { status: 'error', cause: membershipError.message }

  const own = memberships.find((m) => m.profile_id === profileId)
  if (!own) return { status: 'ok', rows: { stage: 'needs_couple', profileId } }

  // O `CHECK (slot in (1, 2))` do schema garante isto. Falhar alto se um dia
  // não garantir é melhor que estreitar o tipo na marra e a faixa do
  // calendário sair errada sem ninguém saber por quê.
  if (own.slot !== 1 && own.slot !== 2) {
    return { status: 'error', cause: `slot fora de (1,2): ${own.slot}` }
  }

  const together = memberships.filter((m) => m.couple_id === own.couple_id).length
  if (together < 2) {
    if (own.slot !== 1) {
      // Slot 2 sozinho: o slot 1 saiu do casal. Não há fluxo que produza isto
      // nesta fase (sair do casal é da Fase 3); falhar alto em vez de mostrar
      // "Aguardando" para quem entrou por convite.
      return { status: 'error', cause: 'slot 2 sem slot 1 no casal' }
    }
    return {
      status: 'ok',
      rows: { stage: 'awaiting_partner', profileId, coupleId: own.couple_id, slot: 1 },
    }
  }

  return {
    status: 'ok',
    rows: { stage: 'ready', profileId, coupleId: own.couple_id, slot: own.slot },
  }
}
