// Fronteira de banco do perfil — criado pelo onboarding, não por trigger.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, seções 5 (migration 1) e 6

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { isCheckViolation } from './rpc'
import type { Failure } from './rpc'

type Db = SupabaseClient<Database>

export interface NewProfile {
  fullName: string
  displayName: string
  homeCityId: string
  avatarPath: string | null
}

export type CreateProfileResult =
  | { status: 'created'; profileId: string }
  /** O CHECK de tamanho recusou — a tela já valida, então é divergência. */
  | { status: 'invalid'; cause: string }
  | { status: 'already_exists' }
  | Failure

/**
 * Insere o próprio perfil. O `id` é o `auth.uid()` da sessão, e a policy
 * `profiles_insert_self` recusa qualquer outro — aqui ele é identidade, não
 * autorização.
 */
export async function createProfile(db: Db, input: NewProfile): Promise<CreateProfileResult> {
  const { data: session } = await db.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) return { status: 'unauthenticated' }

  const { error } = await db.from('profiles').insert({
    id: userId,
    full_name: input.fullName.trim(),
    display_name: input.displayName.trim(),
    home_city_id: input.homeCityId,
    avatar_path: input.avatarPath,
  })
  if (isCheckViolation(error)) return { status: 'invalid', cause: error!.message }
  // Duas abas no mesmo passo: o segundo INSERT bate na chave primária. O
  // perfil existe, que é o que se queria — mas a foto que ESTA aba acabou de
  // subir não pode ficar órfã: ela é ligada ao perfil existente.
  if (error?.code === '23505') {
    if (input.avatarPath) {
      await db.from('profiles').update({ avatar_path: input.avatarPath }).eq('id', userId)
    }
    return { status: 'already_exists' }
  }
  if (error) return { status: 'error', cause: error.message }
  return { status: 'created', profileId: userId }
}
