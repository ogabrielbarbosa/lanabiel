// O contrato entre a tela do Calendário e tudo que se pendura nela (visão Mês,
// visão Ano, o painel "Onde a gente está", os modais de período e de evento).
// A `CalendarScreen` lê tudo e publica ESTE objeto; os filhos leem daqui com
// `useCalendar()` em vez de buscar de novo, e chamam `reload()` depois de cada
// escrita própria (ADR 0015, R25).
//
// Spec: .agent/Tasks/fase-5-calendario.md, seções 3 (R3–R9, R22, R25), 4 e 7
//
// Mudar um campo aqui é mudar o contrato de quatro telas (T7–T11): acrescente,
// não renomeie.

import { createContext, useContext } from 'react'
import type { CoupleSettings, SettingsData } from '../data/settings'
import type { CalCity, CalendarEvent, CityMap, EventDraft, MembersBySlot, NamesBySlot, Run, Slot, Stay } from '../domain/calendar'
import type { CalendarApi, CalendarWrite, ListItemRef } from './api'

/** Um integrante do casal, como o Calendário o mostra. */
export interface CalendarPerson {
  profileId: string
  slot: Slot
  /** `display_name` — "Gabriel". */
  name: string
  /** Cor da pessoa (dado, não tema): avatar sem foto. */
  color: string
  /** URL assinada do avatar, ou `null` (inicial sobre a cor). Chega DEPOIS da leitura. */
  avatarUrl: string | null
  homeCity: CalCity
}

export interface PeopleBySlot {
  1: CalendarPerson
  2: CalendarPerson
}

/** `{ year, month }`, mês 1-based como na string ISO (o mesmo de `monthWeeks`). */
export interface YearMonth {
  year: number
  month: number
}

/**
 * O pedido de abrir um modal. A tela guarda o pedido; quem o desenha são as
 * tarefas T10 (período) e T11 (evento). `preset` é o que já vem preenchido no
 * Novo evento — o _Agendar_ da Lista (R23) manda `{ kind: 'date', title,
 * listItemId }`.
 */
export type CalendarModal =
  | { kind: 'newEvent'; day: string; preset?: Partial<EventDraft> }
  | { kind: 'editEvent'; event: CalendarEvent }
  | { kind: 'newPeriod'; day: string }
  | { kind: 'editPeriod'; run: Run }

export interface CalendarContextValue {
  api: CalendarApi
  /** O casal de quem está vendo: vai como DADO nas escritas (a policy confere). */
  coupleId: string
  /** Quem está vendo. */
  me: CalendarPerson
  /** Os dois, por slot (faixa fixa: slot 1 = `home1`). */
  people: PeopleBySlot
  /** O formato que o domínio pede (`runs`, `bandLabel`, `entriesFor*`…). */
  members: MembersBySlot
  names: NamesBySlot
  stays: readonly Stay[]
  events: readonly CalendarEvent[]
  /** Os itens da lista para o _Vínculo com a lista_ (id, nome, categoria). */
  listItems: readonly ListItemRef[]
  /** Cidades de estadias, eventos e casas. Uma que faltar aparece como "?" nos rótulos. */
  cities: CityMap
  /** `couple_settings`: a visão inicial, a semana, os marcadores e as quatro cores. */
  settings: CoupleSettings
  /** `couples.started_on` — o aniversário de namoro derivado (R21). */
  startedOn: string
  /** `YYYY-MM-DD`, do relógio injetado, relido a cada leitura. */
  today: string
  /**
   * 💋 da grade visível, `day` → contagem. `null` = não lido (em voo ou
   * falhou): NÃO mostre 💋 nenhum — nunca um 0 sem ter lido (seção 7).
   */
  kisses: ReadonlyMap<string, number> | null

  /** O dia do bloco 2 do painel (R12). Começa em hoje. */
  selectedDay: string
  selectDay: (day: string) => void

  visibleMonth: YearMonth
  setVisibleMonth: (month: YearMonth) => void
  /** `delta` meses a partir do visível (−1, +1; ±12 na visão Ano). */
  shiftMonth: (delta: number) => void
  /** _Hoje_: o mês de hoje, e hoje selecionado. */
  goToToday: () => void

  /** Começa em `calendar_default_view`; a troca vale só até sair da tela (R3). */
  view: 'month' | 'year'
  setView: (view: 'month' | 'year') => void

  /**
   * Relê tudo (contexto, eventos, cidades, 💋 da janela). Nunca rejeita: a que
   * falha mantém a tela e mostra o aviso da própria tela.
   */
  reload: () => Promise<void>

  /** O modal pedido, ou `null`. */
  modal: CalendarModal | null
  /** `day` padrão = o dia selecionado. */
  openNewEvent: (day?: string, preset?: Partial<EventDraft>) => void
  openEditEvent: (event: CalendarEvent) => void
  openNewPeriod: (day?: string) => void
  /** `run` com as bordas REAIS (`runAround`), não o pedaço da semana. */
  openEditPeriod: (run: Run) => void
  closeModal: () => void
}

export const CalendarContext = createContext<CalendarContextValue | null>(null)

/** Para os componentes dentro da `CalendarScreen`. Fora dela é erro de montagem. */
export function useCalendar(): CalendarContextValue {
  const value = useContext(CalendarContext)
  if (!value) throw new Error('useCalendar() fora da CalendarScreen')
  return value
}

/** Cidade das Configurações (sempre IBGE) no formato do Calendário. */
function homeAsCalCity(city: SettingsData['couple']['members'][number]['homeCity']): CalCity {
  return { id: city.id, name: city.name, stateCode: city.stateCode, countryCode: 'BR', region: null, lat: city.lat, lng: city.lng }
}

/**
 * Os dois integrantes por slot, a partir da leitura de contexto. `null` com
 * menos de dois (a outra pessoa saiu): aí `coupleStateOn` não roda e a tela
 * mostra o aviso da seção 7 em vez de faixas.
 */
export function peopleOf(
  ctx: SettingsData,
  cities: CityMap,
  avatars: Readonly<Record<string, string | null>>,
): PeopleBySlot | null {
  const bySlot = new Map(ctx.couple.members.map((m) => [m.slot, m]))
  const one = bySlot.get(1)
  const two = bySlot.get(2)
  if (!one || !two) return null
  const person = (m: typeof one): CalendarPerson => ({
    profileId: m.profileId,
    slot: m.slot,
    name: m.displayName,
    color: m.color,
    avatarUrl: avatars[m.profileId] ?? null,
    homeCity: cities.get(m.homeCity.id) ?? homeAsCalCity(m.homeCity),
  })
  return { 1: person(one), 2: person(two) }
}

export function membersOf(people: PeopleBySlot): MembersBySlot {
  return {
    1: { profileId: people[1].profileId, homeCityId: people[1].homeCity.id },
    2: { profileId: people[2].profileId, homeCityId: people[2].homeCity.id },
  }
}

export function namesOf(people: PeopleBySlot): NamesBySlot {
  return { 1: people[1].name, 2: people[2].name }
}

/** As casas entram no mapa de cidades mesmo que `loadCities` não as devolva. */
export function withHomes(ctx: SettingsData, cities: CityMap): Map<string, CalCity> {
  const out = new Map<string, CalCity>()
  for (const m of ctx.couple.members) out.set(m.homeCity.id, homeAsCalCity(m.homeCity))
  for (const [id, city] of cities) out.set(id, city)
  return out
}

/**
 * Mensagem de uma escrita que não deu `ok`, para mostrar junto do controle.
 * `invalid` mostra o nome da constraint: o cliente já valida, então chegar
 * aqui é divergência, e ela precisa aparecer (seção 7).
 */
export function writeFailureMessage(result: Exclude<CalendarWrite<unknown>, { status: 'ok' }>): string {
  switch (result.status) {
    case 'invalid':
      return `o banco recusou (${result.constraint})`
    case 'not_member':
      return 'este espaço mudou — recarregue'
    case 'unauthenticated':
      return 'sua sessão expirou — entre de novo'
    case 'error':
      return result.cause
  }
}
