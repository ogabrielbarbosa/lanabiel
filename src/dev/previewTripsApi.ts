// A `TripsApi` do harness visual (só DEV — ver `Preview.tsx`): em memória,
// semeada com `previewSeed.ts`, sem rede.
//
// As leituras devolvem `ok` com cópias do estado; as escritas passam pelas
// MESMAS validações do domínio que a fronteira real (`tripValidation.ts`) —
// para o modal mostrar o erro do campo como mostraria de verdade — e alteram o
// estado. Não repinta estadia (a nova viagem não aparece na faixa) nem aplica
// os CHECK do banco além dos que o domínio espelha: é para olhar tela, não
// para provar regra (isso é de `src/**/*.test.ts` e `supabase/tests`).

import type { CalendarWrite, WorldCityCandidate } from '../calendar/api'
import type { City } from '../data/cities'
import type { DataResult } from '../data/result'
import type { TripWrite } from '../data/trips'
import type { CalCity, CalendarEvent } from '../domain/calendar'
import type { ListItem } from '../domain/list'
import type { ItineraryItem, PrepItem, Trip, TripMemory, TripPhoto } from '../domain/trips'
import { DEFAULT_PREP, EMPTY_LODGING } from '../domain/trips'
import {
  trimSpaces,
  validateBudget,
  validateCaption,
  validateDayTitle,
  validateDeparture,
  validateItinerary,
  validateLodging,
  validateMemory,
  validatePrep,
} from '../domain/tripValidation'
import type { TripValidation } from '../domain/tripValidation'
import { nextPosition } from '../trips/api'
import type { TripsApi } from '../trips/api'
import { mapboxEngine } from '../map/engine'
import { ALL_CITIES, COUPLE_ID, GABRIEL, LIST_ITEMS, PATH_URLS, PREVIEW_TODAY, STAYS, TRIPS, eventOf, settingsSeed } from './previewSeed'

/** O estado vivo do harness: as quatro APIs do `Preview` leem o MESMO. */
export interface PreviewStore {
  trips: Trip[]
  listItems: ListItem[]
  cities: Map<string, CalCity>
}

export function previewStore(): PreviewStore {
  return {
    trips: structuredClone(TRIPS),
    listItems: structuredClone(LIST_ITEMS),
    cities: new Map(ALL_CITIES.map((c) => [c.id, c])),
  }
}

/** Um pouco de espera, para o esqueleto e o "salvando…" aparecerem. */
const LATENCY_MS = 120
const later = <T>(value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS))

const ok = <T>(rows: T): Promise<DataResult<T>> => later({ status: 'ok', rows })
const done = <T = null>(value: T): Promise<TripWrite<T>> => later({ status: 'ok', value })
const notFound = (): Promise<TripWrite<never>> => later({ status: 'not_found' })
const rejected = (v: Exclude<TripValidation<string>, { ok: true }>): Promise<TripWrite<never>> =>
  later({ status: 'rejected', field: v.field, reason: v.reason })

let seq = 1000
const newId = (prefix: string) => `${prefix}-${++seq}`
const newUuid = () => crypto.randomUUID()

/** Tira os espaços das pontas; vazio → `null` (o mesmo `optional` da fronteira real). */
const optional = (s: string | null): string | null => {
  if (s === null) return null
  const t = trimSpaces(s)
  return t === '' ? null : t
}

/** Uma foto nova: o arquivo vira `blob:` (vive enquanto a aba viver). */
function photoFromFile(tripKey: string, trip: Pick<Trip, 'startsOn'>, file: File): TripPhoto {
  const id = newId('p-up')
  const path = `${COUPLE_ID}/trip/${tripKey}-${id}.webp`
  PATH_URLS.set(path, URL.createObjectURL(file))
  return {
    id,
    path,
    takenOn: trip.startsOn,
    caption: null,
    favorite: false,
    addedBy: GABRIEL,
    createdAt: new Date().toISOString(),
  }
}

export function previewTripsApi(store: PreviewStore = previewStore()): TripsApi {
  const find = (id: string) => store.trips.find((t) => t.id === id)
  /** O id da viagem que tem a filha `childId` numa das listas. */
  const owner = <K extends 'itinerary' | 'prep' | 'budget' | 'photos'>(key: K, childId: string) =>
    store.trips.find((t) => (t[key] as { id: string }[]).some((c) => c.id === childId))

  function patchChild<K extends 'itinerary' | 'prep' | 'budget' | 'photos'>(
    key: K,
    id: string,
    patch: (row: Trip[K][number]) => Trip[K][number],
  ): Trip[K][number] | null {
    const t = owner(key, id)
    if (!t) return null
    const rows = t[key] as Trip[K][number][]
    const i = rows.findIndex((r) => r.id === id)
    rows[i] = patch(rows[i])
    return rows[i]
  }

  function removeChild(key: 'itinerary' | 'prep' | 'budget' | 'photos', id: string): boolean {
    const t = owner(key, id)
    if (!t) return false
    ;(t[key] as { id: string }[]) = (t[key] as { id: string }[]).filter((r) => r.id !== id)
    if (key === 'photos' && t.coverPhotoId === id) t.coverPhotoId = null
    return true
  }

  return {
    today: () => PREVIEW_TODAY,
    mapEngine: mapboxEngine,

    loadContext: () => ok(settingsSeed(STAYS)),
    loadTrips: () => {
      const trips = structuredClone(store.trips).sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0))
      return ok({ trips, events: new Map<string, CalendarEvent>(trips.map((t) => [t.id, eventOf(t)])) })
    },
    loadListItems: () => ok(structuredClone(store.listItems)),
    loadCities: (ids) => ok(new Map(ids.flatMap((id) => (store.cities.has(id) ? [[id, store.cities.get(id)!] as const] : [])))),
    signedUrls: (paths) =>
      ok(new Map(paths.flatMap((p) => (p && PATH_URLS.has(p) ? [[p, PATH_URLS.get(p)!] as const] : [])))),
    avatarUrl: () => Promise.resolve(null),

    searchCities: (query) => {
      const q = query.trim().toLocaleLowerCase('pt-BR')
      if (q.length < 2) return ok<City[]>([])
      return ok(
        [...store.cities.values()]
          .filter((c) => c.countryCode === 'BR' && c.name.toLocaleLowerCase('pt-BR').includes(q))
          .map((c) => ({ id: c.id, name: c.name, stateCode: c.stateCode, lat: c.lat, lng: c.lng })),
      )
    },
    searchWorldCities: async (query) => {
      const q = query.trim().toLocaleLowerCase('pt-BR')
      const rows: WorldCityCandidate[] = [...store.cities.values()]
        .filter((c) => c.countryCode !== 'BR' && q.length >= 2 && c.name.toLocaleLowerCase('pt-BR').includes(q))
        .map((c) => ({
          osmRef: `N${c.id}`,
          name: c.name,
          region: c.region,
          countryCode: c.countryCode,
          country: new Intl.DisplayNames(['pt-BR'], { type: 'region' }).of(c.countryCode) ?? c.countryCode,
          lat: c.lat,
          lng: c.lng,
        }))
      return later({ status: 'ok', rows })
    },
    ensureWorldCity: (_coupleId, candidate) => {
      const existing = [...store.cities.values()].find((c) => `N${c.id}` === candidate.osmRef)
      const city: CalCity = existing ?? {
        id: newId('c-world'),
        name: candidate.name,
        stateCode: null,
        countryCode: candidate.countryCode,
        region: candidate.region,
        lat: candidate.lat,
        lng: candidate.lng,
      }
      store.cities.set(city.id, city)
      return later<CalendarWrite<CalCity>>({ status: 'ok', value: city })
    },

    // --- A viagem --------------------------------------------------------
    createTrip: (draft) => {
      const title = draft.title.trim()
      if (title === '') return rejected({ ok: false, field: 'title', reason: 'dê um nome à viagem' })
      if (draft.endsOn < draft.startsOn) return rejected({ ok: false, field: 'endsOn', reason: 'a volta vem depois da ida' })
      const id = newUuid()
      store.trips.push({
        id,
        title,
        cityId: draft.cityId,
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
        note: optional(draft.note),
        coverPhotoId: null,
        lodging: { ...EMPTY_LODGING, name: optional(draft.lodgingName) },
        departures: draft.departures.map((d) => ({ ...d, originCode: optional(d.originCode), note: optional(d.note) })),
        days: [],
        itinerary: [],
        prep: DEFAULT_PREP.map((p, i) => ({ id: newId('prep'), kind: p.kind, label: p.label, detail: null, done: false, position: i })),
        budget: [],
        memories: [],
        photos: [],
      })
      return done({ id })
    },
    updateTripEvent: (event, patch) => {
      const t = find(event.id)
      if (!t) return notFound()
      Object.assign(t, { title: patch.title.trim(), cityId: patch.cityId, startsOn: patch.startsOn, endsOn: patch.endsOn, note: optional(patch.note) })
      return done(null)
    },
    updateTrip: (tripId, patch) => {
      const t = find(tripId)
      if (!t) return notFound()
      if (patch.lodging) {
        const v = validateLodging(patch.lodging)
        if (!v.ok) return rejected(v)
        t.lodging = { ...patch.lodging }
      }
      if (patch.coverPhotoId !== undefined) t.coverPhotoId = patch.coverPhotoId
      return done(null)
    },
    deleteTrip: (trip) => {
      if (!find(trip.id)) return later({ status: 'ok' })
      store.trips = store.trips.filter((t) => t.id !== trip.id)
      return later({ status: 'ok' })
    },
    saveDepartures: (_coupleId, tripId, departures) => {
      const t = find(tripId)
      if (!t) return notFound()
      for (const d of departures) {
        const v = validateDeparture(d)
        if (!v.ok) return rejected({ ...v, field: `departures.${v.field}` })
      }
      const byPerson = new Map(t.departures.map((d) => [d.profileId, d]))
      for (const d of departures) byPerson.set(d.profileId, { ...d })
      t.departures = [...byPerson.values()]
      return done(null)
    },

    // --- Roteiro -----------------------------------------------------------
    setDayTitle: (_coupleId, tripId, day, title) => {
      const t = find(tripId)
      if (!t) return notFound()
      const clean = optional(title)
      if (clean !== null) {
        const v = validateDayTitle(clean)
        if (!v.ok) return rejected(v)
      }
      t.days = t.days.filter((d) => d.day !== day)
      if (clean !== null) t.days.push({ day, title: clean })
      return done(null)
    },
    createItinerary: (_coupleId, trip, draft) => {
      const t = find(trip.id)
      if (!t) return notFound()
      const v = validateItinerary(draft)
      if (!v.ok) return rejected(v)
      const row: ItineraryItem = { ...draft, id: newId('it'), position: nextPosition(t.itinerary) }
      t.itinerary.push(row)
      return done(row)
    },
    updateItinerary: (id, draft) => {
      const v = validateItinerary(draft)
      if (!v.ok) return rejected(v)
      const row = patchChild('itinerary', id, (r) => ({ ...r, ...draft }))
      return row ? done(row) : notFound()
    },
    deleteItinerary: (id) => (removeChild('itinerary', id) ? done(null) : notFound()),

    // --- Preparação --------------------------------------------------------
    createPrep: (_coupleId, trip, draft) => {
      const t = find(trip.id)
      if (!t) return notFound()
      const v = validatePrep(draft)
      if (!v.ok) return rejected(v)
      const row: PrepItem = { ...draft, id: newId('prep'), position: nextPosition(t.prep) }
      t.prep.push(row)
      return done(row)
    },
    updatePrep: (id, draft) => {
      const v = validatePrep(draft)
      if (!v.ok) return rejected(v)
      const row = patchChild('prep', id, (r) => ({ ...r, ...draft }))
      return row ? done(row) : notFound()
    },
    setPrepDone: (id, isDone) => {
      const row = patchChild('prep', id, (r) => ({ ...r, done: isDone }))
      return row ? done(row) : notFound()
    },
    deletePrep: (id) => (removeChild('prep', id) ? done(null) : notFound()),

    // --- Orçamento ---------------------------------------------------------
    createBudget: (_coupleId, trip, draft) => {
      const t = find(trip.id)
      if (!t) return notFound()
      const v = validateBudget(draft)
      if (!v.ok) return rejected(v)
      const row = { ...draft, id: newId('bud'), position: nextPosition(t.budget) }
      t.budget.push(row)
      return done(row)
    },
    updateBudget: (id, draft) => {
      const v = validateBudget(draft)
      if (!v.ok) return rejected(v)
      const row = patchChild('budget', id, (r) => ({ ...r, ...draft }))
      return row ? done(row) : notFound()
    },
    deleteBudget: (id) => (removeChild('budget', id) ? done(null) : notFound()),

    // --- Memória (quem vê é o Gabriel) --------------------------------------
    saveMemory: (_coupleId, tripId, draft) => {
      const t = find(tripId)
      if (!t) return notFound()
      const v = validateMemory(draft)
      if (!v.ok) return rejected(v)
      const row: TripMemory = { profileId: GABRIEL, rating: draft.rating, body: trimSpaces(draft.body), writtenOn: PREVIEW_TODAY }
      t.memories = [...t.memories.filter((m) => m.profileId !== GABRIEL), row]
      return done(row)
    },
    deleteMemory: (tripId) => {
      const t = find(tripId)
      if (!t) return notFound()
      t.memories = t.memories.filter((m) => m.profileId !== GABRIEL)
      return done(null)
    },

    // --- Fotos -------------------------------------------------------------
    uploadPhotos: async (_coupleId, trip, files, onProgress) => {
      const t = find(trip.id)
      if (!t) return { status: 'rejected', field: 'files', reason: 'essa viagem não existe mais — recarregue' }
      const added: TripPhoto[] = []
      for (const file of files) {
        const photo = photoFromFile(t.id, t, file)
        t.photos.push(photo)
        added.push(photo)
        onProgress?.(added.length, files.length)
      }
      return later({ status: 'ok', added, failed: [] })
    },
    uploadCover: (_coupleId, trip, file) => {
      const t = find(trip.id)
      if (!t) return later({ status: 'not_found' })
      const photo = photoFromFile(t.id, t, file)
      t.photos.push(photo)
      t.coverPhotoId = photo.id
      return later({ status: 'ok', value: photo })
    },
    setCaption: (photoId, caption) => {
      const clean = optional(caption)
      const v = validateCaption(clean)
      if (!v.ok) return rejected(v)
      const row = patchChild('photos', photoId, (r) => ({ ...r, caption: clean }))
      return row ? done(row) : notFound()
    },
    setFavorite: (photoId, favorite) => {
      const row = patchChild('photos', photoId, (r) => ({ ...r, favorite }))
      return row ? done(row) : notFound()
    },
    deletePhoto: (photo) => (removeChild('photos', photo.id) ? done(null) : notFound()),
  }
}
