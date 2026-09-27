// Monta um pedaço do Calendário (visão Mês, painel, modais) dentro do
// `CalendarContext`, sem a tela inteira: o valor é o mesmo formato que a
// `CalendarScreen` publica, derivado do setembro de `fixtures.ts` com as mesmas
// funções (`peopleOf`, `membersOf`, `namesOf`, `withHomes`).

import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { vi } from 'vitest'
import type { SettingsData } from '../../data/settings'
import type { CalendarEvent, Stay } from '../../domain/calendar'
import type { CalendarApi } from '../api'
import { CalendarContext, membersOf, namesOf, peopleOf, withHomes } from '../context'
import type { CalendarContextValue } from '../context'
import { monthOf } from '../view'
import { ALL_CITIES, LIST_REFS, SEPTEMBER_EVENTS, SEPTEMBER_KISSES, SEPTEMBER_STAYS, TODAY, calendarContext, fakeCalendarApi } from './fixtures'

export interface CalendarValueOptions {
  api?: CalendarApi
  stays?: Stay[]
  events?: CalendarEvent[]
  settings?: Partial<SettingsData['coupleSettings']>
  /** `null` = 💋 não lidos. */
  kisses?: ReadonlyMap<string, number> | null
  today?: string
}

/** Um valor de contexto completo; os callbacks são `vi.fn()` para o teste conferir. */
export function calendarValue(options: CalendarValueOptions = {}, overrides: Partial<CalendarContextValue> = {}): CalendarContextValue {
  const ctx = calendarContext(options.stays ?? SEPTEMBER_STAYS, options.settings)
  const cities = withHomes(ctx, new Map(ALL_CITIES.map((c) => [c.id, c])))
  const people = peopleOf(ctx, cities, {})
  if (!people) throw new Error('fixture sem os dois integrantes')
  const today = options.today ?? TODAY
  return {
    api: options.api ?? fakeCalendarApi(),
    coupleId: ctx.couple.id,
    me: people[1],
    people,
    members: membersOf(people),
    names: namesOf(people),
    stays: ctx.stays,
    events: options.events ?? SEPTEMBER_EVENTS,
    listItems: LIST_REFS,
    cities,
    settings: ctx.coupleSettings,
    startedOn: ctx.couple.startedOn,
    today,
    kisses: options.kisses === undefined ? SEPTEMBER_KISSES : options.kisses,
    selectedDay: today,
    selectDay: vi.fn(),
    visibleMonth: monthOf(today),
    setVisibleMonth: vi.fn(),
    shiftMonth: vi.fn(),
    goToToday: vi.fn(),
    view: 'month',
    setView: vi.fn(),
    reload: vi.fn(async () => {}),
    modal: null,
    openNewEvent: vi.fn(),
    openEditEvent: vi.fn(),
    openNewPeriod: vi.fn(),
    openEditPeriod: vi.fn(),
    closeModal: vi.fn(),
    ...overrides,
  }
}

export function renderInCalendar(ui: ReactElement, value: CalendarContextValue) {
  const result = render(<CalendarContext.Provider value={value}>{ui}</CalendarContext.Provider>)
  return {
    ...result,
    rerenderWith: (next: CalendarContextValue) =>
      result.rerender(<CalendarContext.Provider value={next}>{ui}</CalendarContext.Provider>),
  }
}
