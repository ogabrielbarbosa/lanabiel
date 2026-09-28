// O que a Home pede ao mundo, num objeto só — o padrão de `TripsApi`: a tela
// recebe isto por parâmetro (pelo `HomeContext`), e o teste de interface
// dirige cada resposta sem rede (`src/home/test/fakeApi.ts`).
//
// Spec: .agent/Tasks/fase-7-mapa.md, seção 5 ("A tela — src/home/"), I1, I2
//
// A Home SÓ LÊ (I1): não há escrita aqui, e cada leitura é a MESMA função que
// a tela dona já usa — `loadSettings` (Configurações, Calendário, Lista,
// Viagens), `loadList` (Lista), `loadTrips` (Viagens), `loadCalCities`. Nada é
// relido por um caminho paralelo (I2). A engine do mapa também entra por aqui,
// para o teste trocar pela falsa (jsdom não tem WebGL — ADR 0005).

import type { SupabaseClient } from '@supabase/supabase-js'
import { avatarUrl } from '../data/avatar'
import { loadCalCities, loadStateCities } from '../data/cities'
import type { City } from '../data/cities'
import { loadList } from '../data/list'
import type { ListData } from '../data/list'
import { signedMediaUrls } from '../data/media'
import type { DataResult } from '../data/result'
import { coverUrl, loadSettings } from '../data/settings'
import type { SettingsData } from '../data/settings'
import { loadTrips } from '../data/trips'
import type { TripsData } from '../data/trips'
import type { CalCity } from '../domain/calendar'
import type { Database } from '../lib/database.types'
import { todayISO } from '../lib/date'
import { mapboxEngine } from '../map/engine'
import type { MapEngine } from '../map/engine'

export type { ListData } from '../data/list'
export type { TripsData } from '../data/trips'

type Db = SupabaseClient<Database>

export interface HomeApi {
  /** `YYYY-MM-DD`: o "hoje" do cabeçalho, do _Nosso ritmo_ e das viagens. */
  today: () => string

  // --- Leitura (tudo em paralelo; ver `context.ts`) ----------------------
  /**
   * Quem sou eu, o casal (nome, capa), os dois integrantes (nome, avatar,
   * cor, cidade-casa), `couple_settings` e as estadias — a MESMA leitura das
   * outras telas.
   */
  loadContext: () => Promise<DataResult<SettingsData>>
  /** Itens, memórias e fotos da Lista (a leitura da Fase 4). */
  loadList: () => Promise<DataResult<ListData>>
  /** As viagens com as filhas (memórias, capas, saídas) — a leitura da Fase 6. */
  loadTrips: () => Promise<DataResult<TripsData>>
  /** Casas, cidades das estadias e destinos de viagem — IBGE e do mundo. */
  loadCities: (ids: readonly string[]) => Promise<DataResult<Map<string, CalCity>>>
  /** Fotos da Lista e das viagens, num lote (1 hora). Só das visíveis (seção 8). */
  signedUrls: (paths: readonly (string | null)[]) => Promise<DataResult<Map<string, string>>>
  avatarUrl: (path: string | null) => Promise<string | null>
  /** A foto do casal (`couples.cover_path`), para o `Couple Status` com `use_couple_cover` (R4). */
  coverUrl: (path: string | null) => Promise<string | null>
  /** Todos os municípios do IBGE de uma UF — o seletor de cidades (R9). */
  stateCities: (uf: string) => Promise<DataResult<City[]>>

  /** A engine do mapa. Em produção, o Mapbox (ADR 0022); nos testes, `fakeMapEngine`. */
  mapEngine: MapEngine
}

export function homeApi(db: Db): HomeApi {
  // Os municípios não mudam: cada UF é lida uma vez por sessão da tela.
  const byUf = new Map<string, Promise<DataResult<City[]>>>()
  return {
    today: todayISO,
    loadContext: () => loadSettings(db),
    loadList: () => loadList(db),
    loadTrips: () => loadTrips(db),
    loadCities: (ids) => loadCalCities(db, ids),
    signedUrls: (paths) => signedMediaUrls(db, paths),
    avatarUrl: (path) => avatarUrl(db, path),
    coverUrl: (path) => coverUrl(db, path),
    stateCities: (uf) => {
      const cached = byUf.get(uf)
      if (cached) return cached
      const pending = loadStateCities(db, uf).then((result) => {
        if (result.status !== 'ok') byUf.delete(uf)
        return result
      })
      byUf.set(uf, pending)
      return pending
    },
    mapEngine: mapboxEngine,
  }
}
