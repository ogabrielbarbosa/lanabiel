// CalendarApi falsa para os testes de interface: toda leitura responde `ok`
// vazio, toda escrita responde `error`, a não ser que o teste troque a função.
// Relógio fixo em 2026-09-25 (a sexta do frame `D1Zny4`). `seededCalendarApi`
// é o ponto de partida com um setembro realista; T8–T11 estendem daqui.
//
// Gabriel = slot 1, casa em SJC (`u-gabriel`); Lana = slot 2, casa em Marau
// (`u-lana`) — os mesmos de `settingsData()`.

import { vi } from 'vitest'
import type { SettingsData } from '../../data/settings'
import type { CalCity, CalendarEvent, Stay } from '../../domain/calendar'
import { MARAU, PARATY, SJC, settingsData } from '../../settings/test/fixtures'
import type { CalendarApi, CalendarData, ListItemRef } from '../api'

export const TODAY = '2026-09-25'
export const GABRIEL = 'u-gabriel'
export const LANA = 'u-lana'

const br = (c: typeof SJC): CalCity => ({ ...c, countryCode: 'BR', region: null })
export const CITY_SJC = br(SJC)
export const CITY_MARAU = br(MARAU)
export const CITY_PARATY = br(PARATY)
export const CITY_LISBOA: CalCity = {
  id: 'c-lisboa',
  name: 'Lisboa',
  stateCode: null,
  countryCode: 'PT',
  region: 'Lisboa',
  lat: 38.7223,
  lng: -9.1393,
}
export const ALL_CITIES: CalCity[] = [CITY_SJC, CITY_MARAU, CITY_PARATY, CITY_LISBOA]

const notWired = { status: 'error', cause: 'não ligado no teste' } as const

export function fakeCalendarApi(overrides: Partial<CalendarApi> = {}): CalendarApi {
  let n = 0
  return {
    today: () => TODAY,
    newId: () => `new-${++n}`,
    loadContext: vi.fn<CalendarApi['loadContext']>(async () => ({ status: 'ok', rows: settingsData({ stays: [] }) })),
    loadCalendar: vi.fn<CalendarApi['loadCalendar']>(async () => ({ status: 'ok', rows: { events: [], listItems: [] } })),
    loadCities: vi.fn<CalendarApi['loadCities']>(async (ids) => ({
      status: 'ok',
      rows: new Map(ALL_CITIES.filter((c) => ids.includes(c.id)).map((c) => [c.id, c])),
    })),
    loadKisses: vi.fn<CalendarApi['loadKisses']>(async () => ({ status: 'ok', rows: new Map() })),
    avatarUrl: vi.fn<CalendarApi['avatarUrl']>(async () => null),
    paint: vi.fn<CalendarApi['paint']>(async () => notWired),
    createEvent: vi.fn<CalendarApi['createEvent']>(async () => notWired),
    updateEvent: vi.fn<CalendarApi['updateEvent']>(async () => notWired),
    deleteEvent: vi.fn<CalendarApi['deleteEvent']>(async () => notWired),
    addKiss: vi.fn<CalendarApi['addKiss']>(async () => notWired),
    removeKiss: vi.fn<CalendarApi['removeKiss']>(async () => notWired),
    searchCities: vi.fn<CalendarApi['searchCities']>(async () => ({ status: 'ok', rows: [] })),
    searchWorldCities: vi.fn<CalendarApi['searchWorldCities']>(async () => ({ status: 'ok', rows: [] })),
    ensureWorldCity: vi.fn<CalendarApi['ensureWorldCity']>(async () => notWired),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setembro de 2026, parecido com o frame. Contagem desenhada do mês:
//   Marau (home2) 1–2 e 15–20 = 8 · separados 3–10 = 8 · Paraty (away) 11–14
//   = 4 · SJC (home1) 21–30 = 10 → "22 dias juntos · 8 separados".
// Depois: Lisboa juntos 1–5 out, e cada um em casa, em aberto, a partir do 6.
// ---------------------------------------------------------------------------

const stay = (id: string, profileId: string, cityId: string, startsOn: string, endsOn: string | null): Stay => ({
  id,
  profileId,
  cityId,
  startsOn,
  endsOn,
})

export const SEPTEMBER_STAYS: Stay[] = [
  stay('g1', GABRIEL, SJC.id, '2026-08-01', '2026-08-29'),
  stay('g2', GABRIEL, MARAU.id, '2026-08-30', '2026-09-02'),
  stay('g3', GABRIEL, SJC.id, '2026-09-03', '2026-09-10'),
  stay('g4', GABRIEL, PARATY.id, '2026-09-11', '2026-09-14'),
  stay('g5', GABRIEL, MARAU.id, '2026-09-15', '2026-09-20'),
  stay('g6', GABRIEL, SJC.id, '2026-09-21', '2026-09-30'),
  stay('g7', GABRIEL, CITY_LISBOA.id, '2026-10-01', '2026-10-05'),
  stay('g8', GABRIEL, SJC.id, '2026-10-06', null),
  stay('l1', LANA, MARAU.id, '2026-08-01', '2026-09-10'),
  stay('l2', LANA, PARATY.id, '2026-09-11', '2026-09-14'),
  stay('l3', LANA, MARAU.id, '2026-09-15', '2026-09-20'),
  stay('l4', LANA, SJC.id, '2026-09-21', '2026-09-30'),
  stay('l5', LANA, CITY_LISBOA.id, '2026-10-01', '2026-10-05'),
  stay('l6', LANA, MARAU.id, '2026-10-06', null),
]

/** Um evento com tudo coerente; `overrides` troca o que o teste precisa. */
export function calEvent(overrides: Partial<CalendarEvent> & Pick<CalendarEvent, 'id' | 'kind' | 'title' | 'startsOn'>): CalendarEvent {
  return {
    endsOn: null,
    allDay: true,
    startsAt: null,
    endsAt: null,
    travelers: null,
    travelerId: null,
    cityId: null,
    place: null,
    repeatsYearly: false,
    note: null,
    listItemId: null,
    createdBy: GABRIEL,
    ...overrides,
  }
}

const travel = (traveler: string | null) =>
  traveler === null ? { travelers: 'both' as const, travelerId: null } : { travelers: 'solo' as const, travelerId: traveler }

export const SEPTEMBER_EVENTS: CalendarEvent[] = [
  calEvent({ id: 'e-visita-marau', kind: 'visita', title: 'Visita a Marau', startsOn: '2026-08-30', endsOn: '2026-09-02', cityId: MARAU.id, ...travel(GABRIEL) }),
  calEvent({ id: 'e-passagens', kind: 'lembrete', title: 'Passagens', startsOn: '2026-09-07' }),
  calEvent({ id: 'e-tcc', kind: 'compromisso', title: 'Entrega TCC', startsOn: '2026-09-08', allDay: false, startsAt: '14:00' }),
  calEvent({ id: 'e-filme', kind: 'date', title: 'Filme online', startsOn: '2026-09-09', allDay: false, startsAt: '21:00' }),
  calEvent({ id: 'e-paraty', kind: 'viagem', title: 'Paraty · fim de semana', startsOn: '2026-09-11', endsOn: '2026-09-14', cityId: PARATY.id, ...travel(null) }),
  calEvent({ id: 'e-barco', kind: 'date', title: 'Barco', startsOn: '2026-09-12', allDay: false, startsAt: '10:00' }),
  calEvent({ id: 'e-ida-marau', kind: 'visita', title: 'Ida a Marau', startsOn: '2026-09-15', endsOn: '2026-09-20', cityId: MARAU.id, ...travel(GABRIEL) }),
  calEvent({ id: 'e-mercado', kind: 'date', title: 'Mercado', startsOn: '2026-09-19' }),
  calEvent({ id: 'e-lana-chega', kind: 'visita', title: 'Lana chega', startsOn: '2026-09-21', endsOn: '2026-09-30', cityId: SJC.id, createdBy: LANA, ...travel(LANA) }),
  calEvent({ id: 'e-reuniao', kind: 'compromisso', title: 'Reunião', startsOn: '2026-09-23', allDay: false, startsAt: '09:30' }),
  calEvent({ id: 'e-jantar', kind: 'date', title: 'Jantar 20h', startsOn: '2026-09-25', allDay: false, startsAt: '20:00' }),
  calEvent({ id: 'e-vicentina', kind: 'date', title: 'Vicentina', startsOn: '2026-09-25', allDay: false, startsAt: '16:00', listItemId: 'i-vicentina' }),
  calEvent({ id: 'e-vo', kind: 'lembrete', title: 'Ligar pra vó', startsOn: '2026-09-25' }),
  calEvent({ id: 'e-cinema', kind: 'date', title: 'Cinema', startsOn: '2026-09-26' }),
  calEvent({ id: 'e-checkin', kind: 'lembrete', title: 'Check-in', startsOn: '2026-09-27' }),
  calEvent({ id: 'e-malas', kind: 'lembrete', title: 'Malas', startsOn: '2026-09-30' }),
  calEvent({ id: 'e-lisboa', kind: 'viagem', title: 'Lisboa, Portugal', startsOn: '2026-10-01', endsOn: '2026-10-05', cityId: CITY_LISBOA.id, ...travel(null) }),
]

export const LIST_REFS: ListItemRef[] = [
  { id: 'i-vicentina', name: 'Parque Vicentina Aranha', category: 'parque' },
  { id: 'i-vinicola', name: 'Vinícola em Marau', category: 'experiencia' },
]

/** 💋 da grade de setembro (30/ago a 10/out, semana começando no domingo). */
export const SEPTEMBER_KISSES: ReadonlyMap<string, number> = new Map([
  ['2026-08-30', 1],
  ['2026-09-12', 3],
  ['2026-09-21', 2],
  ['2026-09-24', 1],
  ['2026-09-25', 20],
])

export function calendarContext(
  stays: Stay[] = SEPTEMBER_STAYS,
  coupleSettings: Partial<SettingsData['coupleSettings']> = {},
): SettingsData {
  const data = settingsData({ stays })
  return { ...data, coupleSettings: { ...data.coupleSettings, ...coupleSettings } }
}

export function calendarData(events: CalendarEvent[] = SEPTEMBER_EVENTS): CalendarData {
  return { events, listItems: LIST_REFS }
}

/** `CalendarApi` com o setembro acima já lido — o ponto de partida dos testes de tela. */
export function seededCalendarApi(
  options: {
    stays?: Stay[]
    events?: CalendarEvent[]
    kisses?: ReadonlyMap<string, number>
    settings?: Partial<SettingsData['coupleSettings']>
  } = {},
  overrides: Partial<CalendarApi> = {},
): CalendarApi {
  const ctx = calendarContext(options.stays, options.settings)
  const data = calendarData(options.events)
  const kisses = options.kisses ?? SEPTEMBER_KISSES
  return fakeCalendarApi({
    loadContext: vi.fn<CalendarApi['loadContext']>(async () => ({ status: 'ok', rows: ctx })),
    loadCalendar: vi.fn<CalendarApi['loadCalendar']>(async () => ({ status: 'ok', rows: data })),
    loadKisses: vi.fn<CalendarApi['loadKisses']>(async (from, to) => ({
      status: 'ok',
      rows: new Map([...kisses].filter(([day]) => from <= day && day <= to)),
    })),
    ...overrides,
  })
}
