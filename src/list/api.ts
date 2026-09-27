// O que a Lista pede ao mundo, num objeto só — o padrão de `SettingsApi`: a
// tela recebe isto por parâmetro, e o teste de interface dirige cada resposta
// (ok, erro, `already_done`, `photo_limit`…) sem rede. O relógio (`today`) e o
// sorteio (`random`) também entram por aqui, para o teste ser determinístico.
// O que o banco REALMENTE responde está em supabase/tests/list.test.ts.
//
// Spec: .agent/Tasks/fase-4-lista.md, seção 5 ("Cliente — fronteira de dados")

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { calendarApi } from '../calendar/api'
import type { CalendarApi } from '../calendar/api'
import { todayISO } from '../lib/date'
import { avatarUrl } from '../data/avatar'
import { loadCitiesByIds, searchCities } from '../data/cities'
import {
  addPhoto,
  createItem,
  deleteItem,
  deleteMemory,
  loadList,
  markDone,
  removePhoto,
  replaceItemPhoto,
  saveMemory,
  setFeatured,
  setRating,
  signedUrls,
  updateItem,
} from '../data/list'
import { searchPlaces } from '../data/places'
import type { PlaceSearchOptions } from '../data/places'
import { loadSettings } from '../data/settings'

type Db = SupabaseClient<Database>

/** O que a busca de lugar recebe da tela: o `fetch` e o fallback do IBGE já vêm ligados. */
export type PlaceQueryOptions = Pick<PlaceSearchOptions, 'mode' | 'bias' | 'signal'>

type Tail<F> = F extends (db: Db, ...rest: infer R) => infer Out ? (...rest: R) => Out : never

export interface ListApi {
  today: () => string
  /** Sorteio da sugestão do momento (R23). */
  random: () => number

  /** Itens, memórias e fotos (três `select`s em paralelo). */
  loadList: Tail<typeof loadList>
  /**
   * Quem sou eu, o casal com os dois integrantes (nome, avatar, cor,
   * cidade-casa), `couple_settings` (as preferências da Lista) e as estadias —
   * a MESMA leitura das Configurações, reaproveitada.
   */
  loadContext: Tail<typeof loadSettings>
  /** As cidades das estadias, para `whereWeAre` (I11). */
  loadCitiesByIds: Tail<typeof loadCitiesByIds>
  /** Um lote por releitura (seção 8). */
  signedUrls: Tail<typeof signedUrls>
  avatarUrl: (path: string | null) => Promise<string | null>

  createItem: Tail<typeof createItem>
  updateItem: Tail<typeof updateItem>
  setRating: Tail<typeof setRating>
  setFeatured: Tail<typeof setFeatured>
  deleteItem: Tail<typeof deleteItem>
  markDone: (coupleId: string, input: Parameters<typeof markDone>[2]) => ReturnType<typeof markDone>
  saveMemory: Tail<typeof saveMemory>
  deleteMemory: Tail<typeof deleteMemory>
  addPhoto: (coupleId: string, itemId: string, file: File) => ReturnType<typeof addPhoto>
  removePhoto: Tail<typeof removePhoto>
  replaceItemPhoto: (
    coupleId: string,
    item: Parameters<typeof replaceItemPhoto>[2],
    file: File,
  ) => ReturnType<typeof replaceItemPhoto>

  searchPlaces: (query: string, options: PlaceQueryOptions) => ReturnType<typeof searchPlaces>
  searchCities: Tail<typeof searchCities>

  /**
   * O _Agendar_ do detalhe (Fase 5, R23) abre o `EventModal` do Calendário
   * fora da tela dele: `loadModalEnv(api.calendar)` + `createEvent`.
   */
  calendar: CalendarApi
}

export function listApi(db: Db): ListApi {
  return {
    today: todayISO,
    random: Math.random,
    loadList: () => loadList(db),
    loadContext: () => loadSettings(db),
    loadCitiesByIds: (ids) => loadCitiesByIds(db, ids),
    signedUrls: (paths) => signedUrls(db, paths),
    avatarUrl: (path) => avatarUrl(db, path),
    createItem: (coupleId, draft) => createItem(db, coupleId, draft),
    updateItem: (id, draft) => updateItem(db, id, draft),
    setRating: (id, rating) => setRating(db, id, rating),
    setFeatured: (id, featured) => setFeatured(db, id, featured),
    deleteItem: (item, photos) => deleteItem(db, item, photos),
    markDone: (coupleId, input) => markDone(db, coupleId, input),
    saveMemory: (itemId, coupleId, body) => saveMemory(db, itemId, coupleId, body),
    deleteMemory: (itemId) => deleteMemory(db, itemId),
    addPhoto: (coupleId, itemId, file) => addPhoto(db, coupleId, itemId, file),
    removePhoto: (photo) => removePhoto(db, photo),
    replaceItemPhoto: (coupleId, item, file) => replaceItemPhoto(db, coupleId, item, file),
    searchPlaces: (query, options) =>
      searchPlaces(query, { ...options, searchCities: (q) => searchCities(db, q) }),
    searchCities: (query) => searchCities(db, query),
    calendar: calendarApi(db),
  }
}
