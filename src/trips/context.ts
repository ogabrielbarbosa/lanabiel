// O contrato entre a rota das Viagens e tudo que se pendura nela (Grade, Linha
// do tempo, painel, Detalhe, Galeria, os modais). `TripsRoute` lê tudo com
// `useTripsData` e publica ESTE objeto; os filhos leem com `useTrips()` em vez
// de buscar de novo, e chamam `reload()` depois de cada escrita própria
// (R27, ADR 0015).
//
// Spec: .agent/Tasks/fase-6-viagens.md, seções 2, 3 (R1, R27), 7 e 8
// ADR:  .agent/Decisions/0015-lista-sem-realtime-reler-ao-voltar.md
//
// Leitura: `loadContext`, `loadTrips` e `loadListItems` em paralelo; depois,
// com as ids em mãos, `loadCities` (destinos, casas, estadias). Enquanto não
// houver um `ok`, `status` é `loading` ou `error` — NUNCA uma lista vazia: com
// o projeto pausado a Grade vazia faria o casal achar que perdeu as viagens
// (A17). Uma RELEITURA que falha mantém o que está na tela e liga `stale`.
//
// Mudar um campo aqui é mudar o contrato de duas telas (T4, T5): acrescente,
// não renomeie.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { membersOf, namesOf, peopleOf, withHomes } from '../calendar/context'
import type { CalendarPerson, PeopleBySlot } from '../calendar/context'
import type { CoupleSettings, SettingsData } from '../data/settings'
import type { CalCity, CalendarEvent, CityMap, MembersBySlot, NamesBySlot, Stay } from '../domain/calendar'
import type { ListItem } from '../domain/list'
import type { Trip } from '../domain/trips'
import type { DataResult } from '../data/result'
import type { TripFailure, TripsApi } from './api'

export type TripPerson = CalendarPerson
export type TripPeople = PeopleBySlot

export interface TripsContextValue {
  api: TripsApi
  /** O casal de quem está vendo: vai como DADO nas escritas (a policy confere). */
  coupleId: string
  /** Quem está vendo. As distâncias e a "casa" do mapa são dele (I8). */
  me: TripPerson
  /** Os dois, por slot. */
  people: TripPeople
  members: MembersBySlot
  names: NamesBySlot
  /** A casa de quem vê (`me.homeCity`) — origem de km, rota e recordes (I8). */
  home: CalCity

  /** As viagens (I1, R2), por `starts_on`. As derivações de `tripDerive.ts` reordenam o que exibem. */
  trips: readonly Trip[]
  /** `undefined` = não é viagem do casal (R1: _"Essa viagem não está aqui."_). */
  tripById: (id: string) => Trip | undefined
  /** O evento cru de cada viagem — o que `api.updateTripEvent` recebe (R26). */
  events: ReadonlyMap<string, CalendarEvent>
  /** As estadias dos dois — a faixa do _No calendário_ (R18). */
  stays: readonly Stay[]
  /** Os itens da Lista inteiros. */
  listItems: readonly ListItem[]
  /** Destinos, casas e cidades das estadias. Uma que faltar é `undefined` no `get`. */
  cities: CityMap
  /** `couple_settings`: as quatro cores da faixa e a semana. */
  settings: CoupleSettings
  /** `YYYY-MM-DD`, do relógio injetado, relido a cada leitura (I4). */
  today: string

  /**
   * URLs assinadas já obtidas, caminho → URL. Peça as das fotos VISÍVEIS com
   * `usePhotoUrls` (seção 8); caminho ausente = ainda não assinado ou falhou
   * (mostre o fundo sem foto, nunca um `<img>` quebrado).
   */
  urls: ReadonlyMap<string, string>
  /** Pede as URLs de `paths` que ainda não estão em `urls`, num lote. */
  requestUrls: (paths: readonly (string | null | undefined)[]) => void

  /** A última RELEITURA falhou: a tela mostra o que tinha e avisa. */
  stale: boolean
  /** Relê tudo. Nunca rejeita; a que falha liga `stale`. */
  reload: () => Promise<void>

  /**
   * Um aviso que sobrevive à navegação entre Grade e Detalhe — o R25 (_"A
   * viagem foi salva, mas a capa não subiu."_) nasce no modal e aparece no
   * detalhe. `null` = nenhum.
   */
  notice: string | null
  showNotice: (message: string) => void
  clearNotice: () => void
}

/** Re-assinatura periódica, com folga sobre a validade de 1 hora das URLs. */
const RESIGN_EVERY_MS = 50 * 60 * 1000

export const TripsContext = createContext<TripsContextValue | null>(null)

/** Para os componentes dentro da `TripsRoute`. Fora dela é erro de montagem. */
export function useTrips(): TripsContextValue {
  const value = useContext(TripsContext)
  if (!value) throw new Error('useTrips() fora da TripsRoute')
  return value
}

/**
 * As URLs de `paths`, pedidas ao montar e quando a lista muda. Devolve o mapa
 * inteiro; leia com `urls.get(path)`.
 */
export function usePhotoUrls(paths: readonly (string | null | undefined)[]): ReadonlyMap<string, string> {
  const { urls, requestUrls } = useTrips()
  const key = paths.filter(Boolean).join('|')
  useEffect(() => {
    requestUrls(key === '' ? [] : key.split('|'))
  }, [key, requestUrls])
  return urls
}

/** O caminho da capa da viagem (`cover_photo_id`), ou `null`. */
export function coverPath(trip: Pick<Trip, 'coverPhotoId' | 'photos'>): string | null {
  if (trip.coverPhotoId === null) return null
  return trip.photos.find((p) => p.id === trip.coverPhotoId)?.path ?? null
}

/**
 * Mensagem de uma escrita que não deu `ok`, para mostrar junto do controle
 * (R27: o modal continua aberto com a causa). `invalid` traduz as regras
 * conhecidas da spec (seção 6) e mostra o nome das outras: chegar lá depois
 * da validação do domínio é divergência, e ela precisa aparecer.
 */
export function tripFailureMessage(failure: TripFailure): string {
  switch (failure.status) {
    case 'rejected':
      return failure.reason
    case 'invalid':
      return RULE_MESSAGES[failure.constraint] ?? `o banco recusou (${failure.constraint})`
    case 'not_found':
      return 'isso já tinha sido apagado, recarregue a página'
    case 'not_member':
      return 'este espaço mudou, recarregue a página'
    case 'unauthenticated':
      return 'sua sessão expirou, entre de novo'
    case 'error':
      return failure.cause
  }
}

const RULE_MESSAGES: Record<string, string> = {
  trip_itinerary_day_in_trip: 'esse dia está fora das datas da viagem',
  trip_itinerary_limit: 'a viagem já tem 200 itens no roteiro',
  trip_prep_limit: 'a preparação já tem 20 itens',
  trip_budget_limit: 'o orçamento já tem 12 linhas',
  trip_photos_limit: 'a viagem já tem 500 fotos',
  trip_member: 'essa pessoa não está mais no espaço, recarregue a página',
  trips_cover_same_trip: 'essa foto não é desta viagem, recarregue a página',
}

// ---------------------------------------------------------------------------
// A leitura
// ---------------------------------------------------------------------------

/** O que uma leitura completa devolve. */
export interface TripsSnapshot {
  ctx: SettingsData
  trips: Trip[]
  events: Map<string, CalendarEvent>
  listItems: ListItem[]
  cities: Map<string, CalCity>
  /** O dia em que ESTA leitura foi feita (`api.today()`). */
  today: string
}

/**
 * `ok` com `value: null` = a leitura deu certo mas não há o que mostrar como
 * viagens do casal: `alone` (a outra pessoa saiu; as viagens são "dos dois")
 * ou `left` (quem vê saiu do casal em outro aparelho).
 */
export type TripsLoad =
  | { status: 'loading' }
  | { status: 'error'; cause: string; retry: () => void }
  | { status: 'ok'; value: TripsContextValue }
  | { status: 'ok'; value: null; problem: 'alone' | 'left' }

function causeOf(result: { status: 'unauthenticated' } | { status: 'error'; cause: string }): string {
  return result.status === 'error' ? result.cause : 'sua sessão expirou'
}

function fail<T>(r: Exclude<DataResult<T>, { status: 'ok' }>): Exclude<DataResult<never>, { status: 'ok' }> {
  return r.status === 'error' ? r : { status: 'unauthenticated' }
}

function cityIdsOf(ctx: SettingsData, trips: readonly Trip[]): string[] {
  const ids = new Set<string>()
  for (const m of ctx.couple.members) ids.add(m.homeCity.id)
  for (const s of ctx.stays) ids.add(s.cityId)
  for (const t of trips) ids.add(t.cityId)
  return [...ids]
}

/** Uma leitura inteira: três em paralelo, depois as cidades. Qualquer falha derruba o todo. */
export async function readTrips(api: TripsApi): Promise<DataResult<TripsSnapshot>> {
  const today = api.today()
  const [ctx, trips, list] = await Promise.all([api.loadContext(), api.loadTrips(), api.loadListItems()])
  if (ctx.status !== 'ok') return fail(ctx)
  if (trips.status !== 'ok') return fail(trips)
  if (list.status !== 'ok') return fail(list)
  const cities = await api.loadCities(cityIdsOf(ctx.rows, trips.rows.trips))
  if (cities.status !== 'ok') return fail(cities)
  return {
    status: 'ok',
    rows: {
      ctx: ctx.rows,
      trips: trips.rows.trips,
      events: trips.rows.events,
      listItems: list.rows,
      cities: withHomes(ctx.rows, cities.rows),
      today,
    },
  }
}

/**
 * Lê tudo ao montar, relê depois de cada escrita própria (`reload`) e quando a
 * aba volta a ficar visível (ADR 0015). Só a leitura INICIAL vira `error`; a
 * releitura que falha mantém a tela (`stale`). As URLs assinadas são refeitas
 * a cada releitura para os caminhos já pedidos (validade de 1 hora).
 */
export function useTripsData(api: TripsApi): TripsLoad {
  const [snap, setSnap] = useState<TripsSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [avatars, setAvatars] = useState<Readonly<Record<string, string | null>>>({})
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map())
  const [notice, setNotice] = useState<string | null>(null)
  const generation = useRef(0)
  const hasSnap = useRef(false)
  /** Todo caminho já pedido (assinado ou em voo): o que a releitura re-assina. */
  const requested = useRef(new Set<string>())

  const sign = useCallback(
    async (paths: readonly string[], replace: boolean) => {
      if (paths.length === 0) {
        if (replace) setUrls(new Map())
        return
      }
      const result = await api.signedUrls(paths)
      // Falhou: os caminhos saem do "pedido" para a próxima tentativa pedir de novo.
      if (result.status !== 'ok') {
        for (const p of paths) requested.current.delete(p)
        return
      }
      setUrls((prev) => {
        // Na re-assinatura inteira (`replace`), o que foi pedido DEPOIS dela
        // começar e já chegou fica — senão some e nunca é pedido de novo.
        const asked = new Set(paths)
        const next = new Map(
          replace ? [...prev].filter(([p]) => !asked.has(p) && requested.current.has(p)) : prev,
        )
        for (const [path, url] of result.rows) next.set(path, url)
        return next
      })
    },
    [api],
  )

  const requestUrls = useCallback(
    (paths: readonly (string | null | undefined)[]) => {
      const fresh = [...new Set(paths.filter((p): p is string => !!p && !requested.current.has(p)))]
      if (fresh.length === 0) return
      for (const p of fresh) requested.current.add(p)
      void sign(fresh, false)
    },
    [sign],
  )

  const reload = useCallback(async () => {
    const mine = ++generation.current
    const result = await readTrips(api)
    if (mine !== generation.current) return
    if (result.status !== 'ok') {
      if (hasSnap.current) setStale(true)
      else setLoadError(causeOf(result))
      return
    }
    hasSnap.current = true
    setSnap(result.rows)
    setLoadError(null)
    setStale(false)

    // Caminhos que não existem mais (foto apagada) saem; os outros são re-assinados.
    const alive = new Set<string>()
    for (const t of result.rows.trips) for (const p of t.photos) alive.add(p.path)
    for (const i of result.rows.listItems) if (i.photoPath) alive.add(i.photoPath)
    requested.current = new Set([...requested.current].filter((p) => alive.has(p)))
    const [pairs] = await Promise.all([
      Promise.all(
        result.rows.ctx.couple.members.map(async (m) => [m.profileId, await api.avatarUrl(m.avatarPath)] as const),
      ),
      sign([...requested.current], true),
    ])
    if (mine !== generation.current) return
    setAvatars(Object.fromEntries(pairs))
  }, [api, sign])

  useEffect(() => {
    const gen = generation
    // `reload` só chama setState depois do `await` da leitura.
    // eslint-disable-next-line react/set-state-in-effect
    void reload()
    // Desmontou: a leitura em voo não escreve mais em nada.
    return () => {
      gen.current++
    }
  }, [reload])

  // As URLs valem 1 hora (`SIGNED_URL_SECONDS`): numa aba que fica visível
  // mais que isso sem releitura, re-assina antes de vencer.
  useEffect(() => {
    const timer = setInterval(() => void sign([...requested.current], true), RESIGN_EVERY_MS)
    return () => clearInterval(timer)
  }, [sign])

  // ADR 0015: voltar à aba relê.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [reload])

  const retry = useCallback(() => {
    setLoadError(null)
    void reload()
  }, [reload])

  const showNotice = useCallback((message: string) => setNotice(message), [])
  const clearNotice = useCallback(() => setNotice(null), [])

  const people = useMemo(() => (snap ? peopleOf(snap.ctx, snap.cities, avatars) : null), [snap, avatars])

  const value = useMemo<TripsContextValue | null>(() => {
    if (!snap || !people) return null
    const me = people[1].profileId === snap.ctx.me.profileId ? people[1] : people[2].profileId === snap.ctx.me.profileId ? people[2] : null
    if (!me) return null
    const byId = new Map(snap.trips.map((t) => [t.id, t]))
    return {
      api,
      coupleId: snap.ctx.couple.id,
      me,
      people,
      members: membersOf(people),
      names: namesOf(people),
      home: me.homeCity,
      trips: snap.trips,
      tripById: (id: string) => byId.get(id),
      events: snap.events,
      stays: snap.ctx.stays,
      listItems: snap.listItems,
      cities: snap.cities,
      settings: snap.ctx.coupleSettings,
      today: snap.today,
      urls,
      requestUrls,
      stale,
      reload,
      notice,
      showNotice,
      clearNotice,
    }
  }, [api, snap, people, urls, requestUrls, stale, reload, notice, showNotice, clearNotice])

  if (!snap) return loadError !== null ? { status: 'error', cause: loadError, retry } : { status: 'loading' }
  // `value` leva `reload` e `requestUrls`, que mexem em refs — mas só quando
  // CHAMADOS (efeito, clique), nunca durante o render: o aviso é falso positivo.
  // eslint-disable-next-line react/refs
  if (value) return { status: 'ok', value }
  return { status: 'ok', value: null, problem: people ? 'left' : 'alone' }
}
