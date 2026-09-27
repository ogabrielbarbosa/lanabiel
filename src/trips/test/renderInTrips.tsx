// Monta as Viagens nos testes de interface, de dois jeitos:
//
//   · `renderTripsRoute(api, view)` — a rota inteira (`TripsRoute`), com a
//     leitura de verdade pelo `useTripsData`. Para Grade, Detalhe, erro de
//     leitura (A17), "Essa viagem não está aqui." (R1). Espere o conteúdo com
//     `findBy…` (a leitura é assíncrona).
//   · `renderInTrips(ui, tripsValue())` — um pedaço (um cartão, um modal)
//     dentro do `TripsContext`, síncrono, com o valor derivado de
//     `fixtures.ts` pelas MESMAS funções da rota (`peopleOf`, `membersOf`,
//     `namesOf`, `withHomes`). Os callbacks (`reload`, `requestUrls`,
//     `showNotice`…) são `vi.fn()` para o teste conferir.

import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import { membersOf, namesOf, peopleOf, withHomes } from '../../calendar/context'
import type { SettingsData } from '../../data/settings'
import type { ListItem } from '../../domain/list'
import type { Trip } from '../../domain/trips'
import type { TripsApi } from '../api'
import { TripsContext } from '../context'
import type { TripsContextValue } from '../context'
import { TripsRoute } from '../TripsRoute'
import type { TripsView } from '../TripsRoute'
import { ALL_TRIPS, TODAY, TRIP_CITIES, TRIP_LIST_ITEMS, signedUrlOf, tripEvent, tripsContextData } from './fixtures'
import { seededTripsApi } from './fakeApi'

export function renderTripsRoute(api: TripsApi = seededTripsApi(), view: TripsView = { name: 'trips' }) {
  return { ...render(<TripsRoute api={api} view={view} />), api }
}

export interface TripsValueOptions {
  api?: TripsApi
  trips?: readonly Trip[]
  listItems?: readonly ListItem[]
  context?: SettingsData
  today?: string
  /** Quem vê: slot 1 (Gabriel, padrão) ou 2 (Lana). */
  viewer?: 1 | 2
  /**
   * URLs já assinadas. Padrão: todas as fotos das viagens e da Lista, como
   * `signedUrlOf(path)` — o componente mostra as imagens de cara.
   */
  urls?: ReadonlyMap<string, string>
}

/** Um valor de contexto completo e coerente com `fixtures.ts`. */
export function tripsValue(options: TripsValueOptions = {}, overrides: Partial<TripsContextValue> = {}): TripsContextValue {
  const ctx = options.context ?? tripsContextData()
  const viewerSlot = options.viewer ?? 1
  const viewerId = ctx.couple.members.find((m) => m.slot === viewerSlot)?.profileId ?? ctx.me.profileId
  const context: SettingsData = { ...ctx, me: { ...ctx.me, profileId: viewerId } }
  const cities = withHomes(context, new Map(TRIP_CITIES.map((c) => [c.id, c])))
  const people = peopleOf(context, cities, {})
  if (!people) throw new Error('fixture sem os dois integrantes')
  const me = people[viewerSlot]
  const trips = [...(options.trips ?? ALL_TRIPS)]
  const listItems = [...(options.listItems ?? TRIP_LIST_ITEMS)]
  const byId = new Map(trips.map((t) => [t.id, t]))
  const urls =
    options.urls ??
    new Map(
      [...trips.flatMap((t) => t.photos.map((p) => p.path)), ...listItems.flatMap((i) => (i.photoPath ? [i.photoPath] : []))].map(
        (p) => [p, signedUrlOf(p)] as const,
      ),
    )
  return {
    api: options.api ?? seededTripsApi(),
    coupleId: context.couple.id,
    me,
    people,
    members: membersOf(people),
    names: namesOf(people),
    home: me.homeCity,
    trips,
    tripById: (id) => byId.get(id),
    events: new Map(trips.map((t) => [t.id, tripEvent(t)])),
    stays: context.stays,
    listItems,
    cities,
    settings: context.coupleSettings,
    today: options.today ?? TODAY,
    urls,
    requestUrls: vi.fn(),
    stale: false,
    reload: vi.fn(async () => {}),
    notice: null,
    showNotice: vi.fn(),
    clearNotice: vi.fn(),
    ...overrides,
  }
}

export function renderInTrips(ui: ReactElement, value: TripsContextValue = tripsValue()) {
  const result = render(<TripsContext.Provider value={value}>{ui}</TripsContext.Provider>)
  return {
    ...result,
    value,
    rerenderWith: (next: TripsContextValue) => result.rerender(<TripsContext.Provider value={next}>{ui}</TripsContext.Provider>),
  }
}
