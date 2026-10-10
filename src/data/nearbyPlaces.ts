// Estabelecimentos perto de casa (ADR 0027): a busca no Overture pela edge
// function `places-nearby`, que guarda a chave da Open Places API. O formato
// é o do `handler.ts` dela; quem junta com o Photon é `searchPlaces`.

import { FunctionsHttpError } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'

type Db = SupabaseClient<Database>

export interface NearbyPlace {
  name: string
  address: string | null
  city: string | null
  state: string | null
  countryCode: string
  lat: number
  lng: number
}

export type NearbySearchResult =
  | { status: 'ok'; places: NearbyPlace[] }
  /** Sem `OPEN_PLACES_API_KEY` no projeto: a busca fica só com o Photon. */
  | { status: 'unconfigured' }
  | { status: 'aborted' }
  | { status: 'error'; cause: string }

export async function searchNearbyPlaces(
  db: Db,
  query: string,
  near: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<NearbySearchResult> {
  const { data, error } = await db.functions.invoke('places-nearby', {
    body: { query, lat: near.lat, lng: near.lng },
    signal,
  })
  if (signal?.aborted) return { status: 'aborted' }
  let raw: Record<string, unknown> | null = data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  if (error) {
    raw = null
    if (error instanceof FunctionsHttpError) {
      raw = (await (error.context as Response).json().catch(() => null)) as Record<string, unknown> | null
    }
    if (!raw || typeof raw.status !== 'string') return { status: 'error', cause: error.message }
  }
  if (raw?.status === 'ok' && Array.isArray(raw.places)) return { status: 'ok', places: raw.places as NearbyPlace[] }
  if (raw?.status === 'unconfigured') return { status: 'unconfigured' }
  return { status: 'error', cause: typeof raw?.cause === 'string' ? raw.cause : `places-nearby: ${String(raw?.status)}` }
}
