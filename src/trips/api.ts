// O que as Viagens pedem ao mundo, num objeto só — o padrão de `CalendarApi`
// e `ListApi`: as telas recebem isto (pelo `TripsContext`), e o teste de
// interface dirige cada resposta sem rede (`src/trips/test/fakeApi.ts`). O
// relógio (`today`) entra por aqui. O que o banco REALMENTE responde está em
// supabase/tests/trips.test.ts.
//
// Spec: .agent/Tasks/fase-6-viagens.md, seção 5 ("Cliente — fronteira de dados")
//
// As escritas recebem o `Trip` (ou a chave dele) em vez de só o id quando
// precisam de algo dele: a `position` da linha nova, as datas do `taken_on`,
// os arquivos a apagar. A tela nunca calcula isso à mão.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarApi, CalendarWrite, WorldCityCandidate, WorldSearchResult } from '../calendar/api'
import { avatarUrl } from '../data/avatar'
import { loadCalCities, searchCities } from '../data/cities'
import type { City } from '../data/cities'
import type { DataResult } from '../data/result'
import { loadSettings } from '../data/settings'
import type { SettingsData } from '../data/settings'
import {
  createBudget,
  createItinerary,
  createPrep,
  createTrip,
  deleteBudget,
  deleteItinerary,
  deletePrep,
  deleteTrip,
  deleteTripMemory,
  deleteTripPhoto,
  loadTripListItems,
  loadTrips,
  saveDepartures,
  saveTripMemory,
  setDayTitle,
  setPhotoCaption,
  setPhotoFavorite,
  setPrepDone,
  tripSignedUrls,
  updateBudget,
  updateItinerary,
  updatePrep,
  updateTrip,
  updateTripEvent,
  uploadTripCover,
  uploadTripPhotos,
} from '../data/trips'
import type {
  DeleteTripResult,
  PhotoFailure,
  TripEventPatch,
  TripPatch,
  TripWrite,
  TripsData,
  UploadPhotosResult,
} from '../data/trips'
import { ensureWorldCity, searchWorldCities } from '../data/worldCities'
import type { CalCity, CalendarEvent } from '../domain/calendar'
import type { ListItem } from '../domain/list'
import type {
  BudgetDraft,
  BudgetLine,
  ItineraryDraft,
  ItineraryItem,
  MemoryDraft,
  NewTripDraft,
  PrepDraft,
  PrepItem,
  Trip,
  TripDeparture,
  TripMemory,
  TripPhoto,
} from '../domain/trips'
import type { Database } from '../lib/database.types'
import { todayISO } from '../lib/date'

export type {
  DeleteTripResult,
  PhotoFailure,
  TripEventPatch,
  TripFailure,
  TripPatch,
  TripWrite,
  TripsData,
  UploadPhotosResult,
} from '../data/trips'

type Db = SupabaseClient<Database>

/** A viagem como as escritas das filhas a precisam: id, casal e as linhas de hoje. */
export type TripRef = Pick<Trip, 'id' | 'startsOn' | 'endsOn' | 'itinerary' | 'prep' | 'budget' | 'photos'>

export type CoverResult = TripWrite<TripPhoto> | { status: 'photo_failed'; failure: PhotoFailure }

export interface TripsApi {
  /** `YYYY-MM-DD`, o "hoje" de `tripStatus` (I4). */
  today: () => string

  // --- Leitura (a tela lê tudo em paralelo; ver `context.ts`) ------------
  /**
   * Quem sou eu, o casal, os dois integrantes (nome, avatar, cor, cidade-casa)
   * e as estadias (a faixa do _No calendário_) — a MESMA leitura das
   * Configurações, do Calendário e da Lista.
   */
  loadContext: () => Promise<DataResult<SettingsData>>
  /** As viagens com todas as filhas, e os eventos crus (para editar pelo Calendário). */
  loadTrips: () => Promise<DataResult<TripsData>>
  /** Os itens da Lista inteiros (lugar, status): perto do destino, feitos aqui, sonhos, vínculo. */
  loadListItems: () => Promise<DataResult<ListItem[]>>
  /** Destinos, casas e cidades das estadias — IBGE e do mundo. */
  loadCities: (ids: readonly string[]) => Promise<DataResult<Map<string, CalCity>>>
  /** Fotos da viagem e da Lista, num lote (1 hora). Só das visíveis (seção 8). */
  signedUrls: (paths: readonly (string | null)[]) => Promise<DataResult<Map<string, string>>>
  avatarUrl: (path: string | null) => Promise<string | null>

  // --- O `CityPicker` do Calendário (R24) --------------------------------
  searchCities: (query: string) => Promise<DataResult<City[]>>
  searchWorldCities: (query: string, options: { signal?: AbortSignal }) => Promise<WorldSearchResult>
  ensureWorldCity: (coupleId: string, candidate: WorldCityCandidate) => Promise<CalendarWrite<CalCity>>

  // --- A viagem ----------------------------------------------------------
  /** `create_trip` (R25): evento + pintura + `trips` + preparação + hospedagem + saídas. */
  createTrip: (draft: NewTripDraft) => Promise<TripWrite<{ id: string }>>
  /** R26: título, destino, datas e nota do EVENTO, pelo `updateEvent` do Calendário. Não repinta. */
  updateTripEvent: (event: CalendarEvent, patch: TripEventPatch) => Promise<TripWrite>
  /** Hospedagem (R20d) e/ou capa (R22) em `trips`. */
  updateTrip: (tripId: string, patch: TripPatch) => Promise<TripWrite>
  /** R26 / seção 7: os arquivos das fotos primeiro, depois o evento (a cascata leva o resto). */
  deleteTrip: (trip: Pick<Trip, 'id' | 'photos'>) => Promise<DeleteTripResult>
  /** R24/R26: as saídas de cada um, upsert por pessoa. */
  saveDepartures: (coupleId: string, tripId: string, departures: readonly TripDeparture[]) => Promise<TripWrite>

  // --- Roteiro (R17, R19, R20) -------------------------------------------
  /** Vazio (ou `null`) apaga o título do dia. */
  setDayTitle: (coupleId: string, tripId: string, day: string, title: string | null) => Promise<TripWrite>
  /** A `position` nova vem depois da maior do roteiro. */
  createItinerary: (coupleId: string, trip: TripRef, draft: ItineraryDraft) => Promise<TripWrite<ItineraryItem>>
  updateItinerary: (id: string, draft: ItineraryDraft) => Promise<TripWrite<ItineraryItem>>
  deleteItinerary: (id: string) => Promise<TripWrite>

  // --- Preparação (R20b) -------------------------------------------------
  createPrep: (coupleId: string, trip: TripRef, draft: PrepDraft) => Promise<TripWrite<PrepItem>>
  updatePrep: (id: string, draft: PrepDraft) => Promise<TripWrite<PrepItem>>
  setPrepDone: (id: string, done: boolean) => Promise<TripWrite<PrepItem>>
  deletePrep: (id: string) => Promise<TripWrite>

  // --- Orçamento (R20c) --------------------------------------------------
  createBudget: (coupleId: string, trip: TripRef, draft: BudgetDraft) => Promise<TripWrite<BudgetLine>>
  updateBudget: (id: string, draft: BudgetDraft) => Promise<TripWrite<BudgetLine>>
  deleteBudget: (id: string) => Promise<TripWrite>

  // --- Memória (R23): cada um só a sua -----------------------------------
  saveMemory: (coupleId: string, tripId: string, draft: MemoryDraft) => Promise<TripWrite<TripMemory>>
  deleteMemory: (tripId: string) => Promise<TripWrite>

  // --- Fotos (R21, R22, R25) ---------------------------------------------
  /** Até 50 por vez, 3 em paralelo; falha de um não para os outros. `onProgress(k, n)`. */
  uploadPhotos: (
    coupleId: string,
    trip: TripRef,
    files: readonly File[],
    onProgress?: (done: number, total: number) => void,
  ) => Promise<UploadPhotosResult>
  /** Uma foto nova que já vira a capa (Nova viagem, R25). */
  uploadCover: (coupleId: string, trip: TripRef, file: File) => Promise<CoverResult>
  setCaption: (photoId: string, caption: string | null) => Promise<TripWrite<TripPhoto>>
  setFavorite: (photoId: string, favorite: boolean) => Promise<TripWrite<TripPhoto>>
  /** Arquivo, depois linha (seção 7). Capa apagada → a capa fica vazia (FK `set null`). */
  deletePhoto: (photo: Pick<TripPhoto, 'id' | 'path'>) => Promise<TripWrite>
}

/** A próxima `position` de uma lista: depois da maior (lista vazia → 0). */
export function nextPosition(rows: readonly { position: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.position + 1), 0)
}

/**
 * O pedaço da `CalendarApi` que o `CityPicker` e o `resolveCity` do Calendário
 * usam, montado sobre a `TripsApi` — para a _Nova viagem_ reaproveitar o
 * seletor sem uma segunda API.
 */
export function cityPickerApi(api: TripsApi): Pick<CalendarApi, 'searchCities' | 'searchWorldCities' | 'ensureWorldCity'> {
  return { searchCities: api.searchCities, searchWorldCities: api.searchWorldCities, ensureWorldCity: api.ensureWorldCity }
}

export function tripsApi(db: Db): TripsApi {
  const key = (coupleId: string, tripId: string) => ({ coupleId, tripId })
  const target = (coupleId: string, trip: TripRef) => ({ coupleId, tripId: trip.id, startsOn: trip.startsOn, endsOn: trip.endsOn })
  return {
    today: todayISO,
    loadContext: () => loadSettings(db),
    loadTrips: () => loadTrips(db),
    loadListItems: () => loadTripListItems(db),
    loadCities: (ids) => loadCalCities(db, ids),
    signedUrls: (paths) => tripSignedUrls(db, paths),
    avatarUrl: (path) => avatarUrl(db, path),
    searchCities: (query) => searchCities(db, query),
    searchWorldCities: (query, options) => searchWorldCities(query, { signal: options.signal }),
    ensureWorldCity: (coupleId, candidate) => ensureWorldCity(db, coupleId, candidate),
    createTrip: (draft) => createTrip(db, draft),
    updateTripEvent: (event, patch) => updateTripEvent(db, event, patch),
    updateTrip: (tripId, patch) => updateTrip(db, tripId, patch),
    deleteTrip: (trip) => deleteTrip(db, trip),
    saveDepartures: (coupleId, tripId, departures) => saveDepartures(db, key(coupleId, tripId), departures),
    setDayTitle: (coupleId, tripId, day, title) => setDayTitle(db, key(coupleId, tripId), day, title),
    createItinerary: (coupleId, trip, draft) =>
      createItinerary(db, key(coupleId, trip.id), draft, nextPosition(trip.itinerary)),
    updateItinerary: (id, draft) => updateItinerary(db, id, draft),
    deleteItinerary: (id) => deleteItinerary(db, id),
    createPrep: (coupleId, trip, draft) => createPrep(db, key(coupleId, trip.id), draft, nextPosition(trip.prep)),
    updatePrep: (id, draft) => updatePrep(db, id, draft),
    setPrepDone: (id, done) => setPrepDone(db, id, done),
    deletePrep: (id) => deletePrep(db, id),
    createBudget: (coupleId, trip, draft) => createBudget(db, key(coupleId, trip.id), draft, nextPosition(trip.budget)),
    updateBudget: (id, draft) => updateBudget(db, id, draft),
    deleteBudget: (id) => deleteBudget(db, id),
    saveMemory: (coupleId, tripId, draft) => saveTripMemory(db, key(coupleId, tripId), draft),
    deleteMemory: (tripId) => deleteTripMemory(db, tripId),
    uploadPhotos: (coupleId, trip, files, onProgress) => uploadTripPhotos(db, target(coupleId, trip), files, { onProgress }),
    uploadCover: (coupleId, trip, file) => uploadTripCover(db, target(coupleId, trip), file),
    setCaption: (photoId, caption) => setPhotoCaption(db, photoId, caption),
    setFavorite: (photoId, favorite) => setPhotoFavorite(db, photoId, favorite),
    deletePhoto: (photo) => deleteTripPhoto(db, photo),
  }
}
