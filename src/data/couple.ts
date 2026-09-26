// Fronteira de banco do casal: criar, confirmar, e a leitura que as telas
// Confirmar e Tudo pronto precisam.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, seções 2, 5 e 6

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { DataResult } from './result'
import { callRpc, isCheckViolation } from './rpc'
import type { Failure } from './rpc'

type Db = SupabaseClient<Database>

export type CreateCoupleResult =
  | { status: 'created'; coupleId: string }
  | { status: 'no_profile' }
  | { status: 'already_member' }
  | { status: 'invalid'; field: 'started_on' | 'name' }
  | Failure

/** Casal + membro slot 1, na mesma transação, no banco. */
export async function createCouple(
  db: Db,
  input: { startedOn: string; name: string | null },
): Promise<CreateCoupleResult> {
  const result = await callRpc(db, 'create_couple', {
    p_started_on: input.startedOn,
    p_name: input.name ?? undefined,
  })
  if (result.status !== 'ok') return result
  const raw = result.data
  switch (raw.status) {
    case 'created':
      return { status: 'created', coupleId: String(raw.couple_id) }
    case 'invalid':
      return { status: 'invalid', field: raw.field === 'name' ? 'name' : 'started_on' }
    case 'no_profile':
    case 'already_member':
      return { status: raw.status }
    default:
      return { status: 'error', cause: `create_couple: status inesperado ${String(raw.status)}` }
  }
}

export type UpdateCoupleResult =
  | { status: 'ok' }
  | { status: 'invalid'; field: 'started_on' | 'name' }
  | Failure

/**
 * A tela Confirmar. UPDATE direto: a policy `couples_update_member` corta, e o
 * trigger `couples_started_on_not_future` recusa data futura. O `.eq('id')` é
 * qual linha, não autorização.
 */
export async function updateCouple(
  db: Db,
  input: { coupleId: string; startedOn: string; name: string | null },
): Promise<UpdateCoupleResult> {
  const { data, error } = await db
    .from('couples')
    .update({ started_on: input.startedOn, name: input.name })
    .eq('id', input.coupleId)
    .select('id')
  if (isCheckViolation(error)) {
    return { status: 'invalid', field: error!.message.includes('name') ? 'name' : 'started_on' }
  }
  if (error) return { status: 'error', cause: error.message }
  // Zero linhas = a policy não deixou ou o casal não existe mais. Não é
  // sucesso silencioso — e também não é "sessão caiu", que mandaria a pessoa
  // procurar o problema no lugar errado.
  if (!data || data.length === 0) return { status: 'error', cause: 'o espaço não foi encontrado' }
  return { status: 'ok' }
}

export interface MemberView {
  profileId: string
  slot: 1 | 2
  displayName: string
  fullName: string
  avatarPath: string | null
  color: string
  city: { name: string; stateCode: string | null; lat: number; lng: number }
}

export interface CoupleView {
  id: string
  name: string | null
  startedOn: string
  members: MemberView[]
}

/** O casal de quem pede, com os integrantes. Sem filtro: a policy decide. */
export async function loadCouple(db: Db): Promise<DataResult<CoupleView | null>> {
  const { data: session } = await db.auth.getSession()
  if (!session.session) return { status: 'unauthenticated' }

  const { data: couple, error } = await db.from('couples').select('id, name, started_on').maybeSingle()
  if (error) return { status: 'error', cause: error.message }
  if (!couple) return { status: 'ok', rows: null }

  const { data: members, error: membersError } = await db
    .from('couple_members')
    .select(
      'slot, profiles!inner(id, display_name, full_name, avatar_path, color, cities!inner(name, state_code, lat, lng))',
    )
    .eq('couple_id', couple.id)
    .order('slot')
  if (membersError) return { status: 'error', cause: membersError.message }

  return {
    status: 'ok',
    rows: {
      id: couple.id,
      name: couple.name,
      startedOn: couple.started_on,
      members: members.map((m) => ({
        profileId: m.profiles.id,
        slot: m.slot === 2 ? 2 : 1,
        displayName: m.profiles.display_name,
        fullName: m.profiles.full_name,
        avatarPath: m.profiles.avatar_path,
        color: m.profiles.color,
        city: {
          name: m.profiles.cities.name,
          stateCode: m.profiles.cities.state_code,
          lat: m.profiles.cities.lat,
          lng: m.profiles.cities.lng,
        },
      })),
    },
  }
}
