import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { Member, Stay } from '../domain/coupleState'
import type { DataResult, WriteResult } from './result'

type Db = SupabaseClient<Database>
type StayRow = Database['public']['Tables']['stays']['Row']

/** Fronteira: snake_case do banco → camelCase do domínio. Um lugar só. */
export function toDomainStay(row: StayRow): Stay {
  return {
    id: row.id,
    profileId: row.profile_id,
    cityId: row.city_id,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
  }
}

async function hasSession(db: Db): Promise<boolean> {
  const { data } = await db.auth.getSession()
  return data.session !== null
}

/**
 * Todas as estadias do casal. Nenhum filtro por `couple_id`: quem decide é a
 * policy. Uma query que precisasse do filtro aqui teria o mesmo resultado com
 * RLS desligada, e aí a autorização estaria no cliente.
 */
export async function listStays(db: Db): Promise<DataResult<Stay[]>> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }

  const { data, error } = await db.from('stays').select('*').order('starts_on')
  if (error) return { status: 'error', cause: error.message }

  return { status: 'ok', rows: data.map(toDomainStay) }
}

/** Os dois integrantes, com a cidade-casa que a derivação precisa. */
export async function listMembers(db: Db): Promise<DataResult<Member[]>> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }

  const { data, error } = await db
    .from('couple_members')
    .select('slot, profiles!inner(id, home_city_id)')
    .order('slot')
  if (error) return { status: 'error', cause: error.message }

  return {
    status: 'ok',
    rows: data.map((row) => ({
      profileId: row.profiles.id,
      homeCityId: row.profiles.home_city_id,
    })),
  }
}

export interface NewStay {
  coupleId: string
  profileId: string
  cityId: string
  startsOn: string
  endsOn: string | null
}

export async function insertStay(db: Db, stay: NewStay): Promise<WriteResult<Stay>> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }

  const { data, error } = await db
    .from('stays')
    .insert({
      couple_id: stay.coupleId,
      profile_id: stay.profileId,
      city_id: stay.cityId,
      starts_on: stay.startsOn,
      ends_on: stay.endsOn,
    })
    .select('*')
    .single()

  if (error) {
    // O erro do Postgres é opaco para quem lê a tela. Traduzir a violação num
    // caso nomeado é o que permite a UI dizer "vocês já têm registro nesse
    // período" em vez de "algo deu errado".
    if (error.message.includes('stays_no_overlap')) return { status: 'overlapping_stay' }
    return { status: 'error', cause: error.message }
  }

  return { status: 'ok', row: toDomainStay(data) }
}
