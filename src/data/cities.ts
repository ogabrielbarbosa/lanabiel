// Busca de cidade — sobre os municípios do IBGE (ADR 0007).
//
// Spec: .agent/Tasks/fase-2-onboarding.md, seção 5 (migration 4) e seção 8

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { CalCity } from '../domain/calendar'
import type { DataResult } from './result'

type Db = SupabaseClient<Database>

export interface City {
  id: string
  name: string
  stateCode: string | null
  lat: number
  lng: number
}

export const MIN_QUERY = 2

/** `'Pelotas, RS'`. */
export function cityLabel(city: Pick<City, 'name' | 'stateCode'>): string {
  return city.stateCode ? `${city.name}, ${city.stateCode}` : city.name
}

export async function searchCities(db: Db, query: string): Promise<DataResult<City[]>> {
  // O banco já devolve vazio abaixo de 2 caracteres; poupar a viagem é daqui.
  if (query.trim().length < MIN_QUERY) return { status: 'ok', rows: [] }

  const { data, error } = await db.rpc('search_cities', { p_query: query })
  if (error) {
    return error.code === '42501' ? { status: 'unauthenticated' } : { status: 'error', cause: error.message }
  }
  return {
    status: 'ok',
    rows: data.map((c) => ({ id: c.id, name: c.name, stateCode: c.state_code, lat: c.lat, lng: c.lng })),
  }
}

/** Cidades por id — para o export resolver as das estadias. Global, legível por qualquer sessão. */
export async function loadCitiesByIds(db: Db, ids: readonly string[]): Promise<DataResult<Map<string, City>>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return { status: 'ok', rows: new Map() }
  const { data, error } = await db.from('cities').select('id, name, state_code, lat, lng').in('id', unique)
  if (error) return { status: 'error', cause: error.message }
  return {
    status: 'ok',
    rows: new Map(data.map((c) => [c.id, { id: c.id, name: c.name, stateCode: c.state_code, lat: c.lat, lng: c.lng }])),
  }
}

/**
 * As cidades do Calendário por id — IBGE e do mundo (I2, ADR 0017), com país e
 * região. À parte de `loadCitiesByIds` para não mudar o `City` que Lista e
 * Configurações já consomem.
 *
 * Sem filtro de casal: a policy mostra as globais e as do próprio casal. Por
 * isso mesmo a sessão é conferida antes — sem ela a leitura devolve zero
 * linhas, e a faixa de Lisboa sumiria como se a cidade não existisse.
 */
export async function loadCalCities(db: Db, ids: readonly string[]): Promise<DataResult<Map<string, CalCity>>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return { status: 'ok', rows: new Map() }
  const { data: session } = await db.auth.getSession()
  if (!session.session) return { status: 'unauthenticated' }
  const { data, error } = await db
    .from('cities')
    .select('id, name, state_code, country_code, region, lat, lng')
    .in('id', unique)
  if (error) {
    return error.code === '42501' ? { status: 'unauthenticated' } : { status: 'error', cause: error.message }
  }
  return { status: 'ok', rows: new Map(data.map((c) => [c.id, rowToCalCity(c)])) }
}

export function rowToCalCity(
  c: Pick<Database['public']['Tables']['cities']['Row'], 'id' | 'name' | 'state_code' | 'country_code' | 'region' | 'lat' | 'lng'>,
): CalCity {
  return {
    id: c.id,
    name: c.name,
    stateCode: c.state_code,
    countryCode: c.country_code,
    region: c.region,
    lat: c.lat,
    lng: c.lng,
  }
}
