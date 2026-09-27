// Cidades de fora do Brasil — o seletor de cidade do Calendário (R17) e a
// linha do casal em `cities` (I2).
//
// Spec: .agent/Tasks/fase-5-calendario.md, R17, seção 5 ("Cliente — fronteira
//       de dados") e seção 7 ("Evento de viagem — cascata")
// ADR:  .agent/Decisions/0017-cidades-do-mundo-por-casal.md
//
// A busca é a de `places.ts` (Photon, `layer=city`): nada aqui sabe montar URL
// nem ler `Feature`. O que é deste arquivo: descartar o Brasil (cidade
// brasileira é SEMPRE a linha do IBGE) e gravar a cidade escolhida como linha
// do casal, deduplicada pela `osm_ref`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarWrite, WorldCityCandidate, WorldSearchResult } from '../calendar/api'
import type { CalCity } from '../domain/calendar'
import type { Database } from '../lib/database.types'
import { translateCalendarError } from './calendar'
import { rowToCalCity } from './cities'
import { searchPlaces } from './places'
import type { PlaceCandidate } from './places'

type Db = SupabaseClient<Database>

/** `cities_region` (≤ 80). A região é só de exibir: cortar não muda identidade. */
const REGION_MAX = 80

export interface WorldSearchOptions {
  signal?: AbortSignal
  /** Injetável para o teste; o padrão é o `fetch` global. */
  fetchFn?: typeof fetch
}

/**
 * Candidato do Photon → candidato de cidade do mundo, ou `null` quando não
 * serve: resultado do Brasil (I2) ou sem `osmRef` (sem a chave de dedupe a
 * linha não pode ser gravada — `cities_scope` exige `osm_ref`).
 */
export function toWorldCandidate(c: PlaceCandidate): WorldCityCandidate | null {
  if (c.countryCode === 'BR' || !c.osmRef) return null
  return {
    osmRef: c.osmRef,
    name: c.label,
    region: c.state,
    countryCode: c.countryCode,
    country: c.country,
    lat: c.lat,
    lng: c.lng,
  }
}

/**
 * Photon `layer=city` SEM o Brasil. Sem fallback do IBGE aqui: o seletor já
 * busca o IBGE em paralelo (R17), e o fallback mostraria as mesmas cidades
 * duas vezes. Photon fora → `error`, e a tela mostra só o Brasil com o aviso.
 */
export async function searchWorldCities(query: string, options: WorldSearchOptions = {}): Promise<WorldSearchResult> {
  const result = await searchPlaces(query, { mode: 'city', signal: options.signal, fetchFn: options.fetchFn })
  switch (result.status) {
    case 'ok':
      return {
        status: 'ok',
        rows: result.rows.map(toWorldCandidate).filter((c): c is WorldCityCandidate => c !== null),
      }
    case 'aborted':
      return result
    case 'error':
      return result
    case 'unauthenticated':
      // Só o fallback do IBGE devolve isso, e ele não é passado.
      return { status: 'error', cause: 'busca mundial sem sessão' }
  }
}

/**
 * ADR 0017: `insert … on conflict (couple_id, osm_ref) do nothing` e depois o
 * `select` pela `osm_ref`. As duas pessoas escolhendo Lisboa, até ao mesmo
 * tempo, terminam no MESMO `id` — quem chegou segundo não insere e lê a linha
 * da outra.
 *
 * O `select` não filtra `couple_id` (ADR 0001): a policy mostra as globais e as
 * do próprio casal, as globais têm `osm_ref` nula, e a unicidade é por casal —
 * sobra no máximo uma linha. `couple_id` vai no insert como DADO da linha
 * nova, e o `with check` recusa outro casal.
 */
export async function ensureWorldCity(
  db: Db,
  coupleId: string,
  candidate: WorldCityCandidate,
): Promise<CalendarWrite<CalCity>> {
  const { data: session } = await db.auth.getSession()
  if (!session.session) return { status: 'unauthenticated' }

  const { error: insertError } = await db.from('cities').upsert(
    {
      couple_id: coupleId,
      osm_ref: candidate.osmRef,
      name: candidate.name,
      region: candidate.region === null ? null : candidate.region.slice(0, REGION_MAX),
      country_code: candidate.countryCode,
      state_code: null,
      ibge_code: null,
      lat: candidate.lat,
      lng: candidate.lng,
    },
    { onConflict: 'couple_id,osm_ref', ignoreDuplicates: true },
  )
  if (insertError) return translateCalendarError(insertError, 'write')

  const { data, error } = await db
    .from('cities')
    .select('id, name, state_code, country_code, region, lat, lng')
    .eq('osm_ref', candidate.osmRef)
    .limit(1)
  if (error) return translateCalendarError(error, 'read')
  const [row] = data ?? []
  // O insert passou (ou colidiu) e a linha não aparece: a policy de leitura
  // não a mostra — a pessoa saiu do casal entre as duas chamadas.
  if (!row) return { status: 'not_member' }
  return { status: 'ok', value: rowToCalCity(row) }
}
