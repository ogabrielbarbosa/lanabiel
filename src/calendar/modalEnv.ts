// O que os modais de período e de evento precisam do mundo — um recorte do
// `CalendarContextValue`. Dentro da `CalendarScreen`, o próprio contexto serve
// (é um superconjunto). Fora dela — o _Agendar_ da Lista (R23) abre o
// `EventModal` sem a tela do Calendário — `loadModalEnv(api)` monta o recorte
// com as MESMAS leituras e as mesmas funções da tela.
//
// Spec: .agent/Tasks/fase-5-calendario.md — R18–R20, R23

import type { DataResult } from '../data/result'
import type { CalendarApi } from './api'
import { membersOf, namesOf, peopleOf, withHomes } from './context'
import type { CalendarContextValue } from './context'

export type ModalEnv = Pick<
  CalendarContextValue,
  'api' | 'coupleId' | 'me' | 'people' | 'members' | 'names' | 'stays' | 'listItems' | 'cities' | 'settings' | 'today'
>

/**
 * Lê contexto, eventos/itens e cidades e devolve o `ModalEnv`. Não `ok` quando
 * qualquer leitura falha, ou quando o casal não tem os dois integrantes (o
 * modal de evento precisa das duas casas para o destino da Visita).
 */
export async function loadModalEnv(api: CalendarApi): Promise<DataResult<ModalEnv>> {
  const [ctx, cal] = await Promise.all([api.loadContext(), api.loadCalendar()])
  if (ctx.status !== 'ok') return ctx
  if (cal.status !== 'ok') return cal
  const ids = new Set<string>()
  for (const m of ctx.rows.couple.members) ids.add(m.homeCity.id)
  for (const s of ctx.rows.stays) ids.add(s.cityId)
  const loaded = await api.loadCities([...ids])
  if (loaded.status !== 'ok') return loaded

  const cities = withHomes(ctx.rows, loaded.rows)
  const people = peopleOf(ctx.rows, cities, {})
  if (!people) return { status: 'error', cause: 'o calendário precisa de vocês dois' }
  const me = [people[1], people[2]].find((p) => p.profileId === ctx.rows.me.profileId)
  if (!me) return { status: 'error', cause: 'este espaço mudou — recarregue' }
  return {
    status: 'ok',
    rows: {
      api,
      coupleId: ctx.rows.couple.id,
      me,
      people,
      members: membersOf(people),
      names: namesOf(people),
      stays: ctx.rows.stays,
      listItems: cal.rows.listItems,
      cities,
      settings: ctx.rows.coupleSettings,
      today: api.today(),
    },
  }
}
