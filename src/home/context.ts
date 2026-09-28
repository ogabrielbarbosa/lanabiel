// O contrato entre a Home e tudo que se pendura nela (a área do mapa com
// breadcrumb, seletores, filtros, pins e _Aqui por perto_; o painel da
// direita). `HomeScreen` lê tudo com `useHomeData` e publica ESTE objeto; os
// filhos leem com `useHome()` em vez de buscar de novo.
//
// Spec: .agent/Tasks/fase-7-mapa.md — seção 2, R4, R15, R24, I1, I2, seções 7 e 8
// ADR:  .agent/Decisions/0015-lista-sem-realtime-reler-ao-voltar.md
//
// Leitura: `loadContext`, `loadList` e `loadTrips` em paralelo; depois, com as
// ids em mãos, `loadCities` (casas, estadias, destinos). Enquanto não houver
// um `ok`, `status` é `loading` ou `error` — NUNCA zero linhas: com o projeto
// pausado, um globo sem pins diria "vocês não salvaram nada" (seção 7). Uma
// RELEITURA que falha mantém o que está na tela e liga `stale`.
//
// A Home só lê (I1): não há `notice` nem escrita aqui. A releitura troca o
// valor do contexto, não a árvore: quem monta o mapa (a `MapArea`) continua
// montado e a instância não é recriada (I12, R24).
//
// Mudar um campo aqui é mudar o contrato de duas frentes (mapa e painel):
// acrescente, não renomeie.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { membersOf, namesOf, peopleOf, withHomes } from '../calendar/context'
import type { CalendarPerson, PeopleBySlot } from '../calendar/context'
import type { DataResult } from '../data/result'
import type { CoupleSettings, SettingsData } from '../data/settings'
import type { CalCity, CityMap, MembersBySlot, NamesBySlot, Stay } from '../domain/calendar'
import type { ListItem, ListMemory, ListPhoto } from '../domain/list'
import { viewerCityId } from '../domain/map'
import type { Trip } from '../domain/trips'
import type { HomeApi } from './api'

export type HomePerson = CalendarPerson
export type HomePeople = PeopleBySlot

export interface HomeContextValue {
  api: HomeApi
  /** O casal de quem está vendo. */
  coupleId: string
  /** `couples.name` — pode ser nulo. */
  coupleName: string | null
  /** Quem está vendo: a cidade de hoje, as distâncias e a origem do _GRU → LIS_ são dele (R7, R16, I8). */
  me: HomePerson
  /** A outra pessoa. */
  partner: HomePerson
  /** Os dois, por slot (R15: _"Oi, {slot 1} & {slot 2}"_). */
  people: HomePeople
  /** O formato que o domínio pede (`currentPeriod`, `monthStrip`, `yearTogether`…). */
  members: MembersBySlot
  names: NamesBySlot
  /**
   * URL assinada da foto do casal (`couples.cover_path`), ou `null` (sem foto,
   * ainda não chegou, ou falhou). O `Couple Status` a usa quando
   * `settings.useCoupleCover` está ligado (R4); senão, os avatares.
   */
  coverUrl: string | null

  /** As estadias dos dois — trecho de hoje, mês, ano (R4, R17). */
  stays: readonly Stay[]
  /** Casas, cidades das estadias e destinos de viagem. Uma que faltar é `undefined` no `get` (mostre "?"). */
  cities: CityMap
  /** A cidade de quem vê HOJE: a estadia, senão a última posição, senão a casa (`viewerCityId`, R7). */
  viewerCity: CalCity

  /** Os itens da Lista inteiros, na ordem da leitura (mais recentes primeiro). */
  items: readonly ListItem[]
  /** `list_memories` — a _Última memória_ quando é de item (I10). */
  listMemories: readonly ListMemory[]
  /** `list_photos` por item, da mais antiga para a mais nova (as fotos do feito). */
  listPhotos: ReadonlyMap<string, readonly ListPhoto[]>
  /**
   * A foto de um item: a capa dele (`photo_path`), senão a primeira foto do
   * feito. `null` = sem foto (mostre o ícone da categoria). É um CAMINHO:
   * passe por `usePhotoUrls`/`urls`.
   */
  photoOf: (item: Pick<ListItem, 'id' | 'photoPath'>) => string | null

  /** As viagens com as filhas (memórias, capas, saídas), por `starts_on`. */
  trips: readonly Trip[]

  /** `couple_settings`: `showHomeCounter`, `useCoupleCover`, `hiddenCategories`… */
  settings: CoupleSettings
  /** `YYYY-MM-DD`, do relógio injetado, relido a cada leitura. */
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
  /** Relê tudo (R24). Nunca rejeita; a que falha liga `stale`. */
  reload: () => Promise<void>
}

/** Re-assinatura periódica, com folga sobre a validade de 1 hora das URLs. */
const RESIGN_EVERY_MS = 50 * 60 * 1000

export const HomeContext = createContext<HomeContextValue | null>(null)

/** Para os componentes dentro da `HomeScreen`. Fora dela é erro de montagem. */
export function useHome(): HomeContextValue {
  const value = useContext(HomeContext)
  if (!value) throw new Error('useHome() fora da HomeScreen')
  return value
}

/**
 * As URLs de `paths`, pedidas ao montar e quando a lista muda. Devolve o mapa
 * inteiro; leia com `urls.get(path)`.
 */
export function usePhotoUrls(paths: readonly (string | null | undefined)[]): ReadonlyMap<string, string> {
  const { urls, requestUrls } = useHome()
  const key = paths.filter(Boolean).join('|')
  useEffect(() => {
    requestUrls(key === '' ? [] : key.split('|'))
  }, [key, requestUrls])
  return urls
}

// ---------------------------------------------------------------------------
// A leitura
// ---------------------------------------------------------------------------

/** O que uma leitura completa devolve. */
export interface HomeSnapshot {
  ctx: SettingsData
  items: ListItem[]
  listMemories: ListMemory[]
  listPhotos: ListPhoto[]
  trips: Trip[]
  cities: Map<string, CalCity>
  /** O dia em que ESTA leitura foi feita (`api.today()`). */
  today: string
}

/**
 * `ok` com `value: null` = a leitura deu certo mas não há o casal para
 * mostrar: `alone` (a outra pessoa saiu) ou `left` (quem vê saiu do casal em
 * outro aparelho).
 */
export type HomeLoad =
  | { status: 'loading' }
  | { status: 'error'; cause: string; retry: () => void }
  | { status: 'ok'; value: HomeContextValue }
  | { status: 'ok'; value: null; problem: 'alone' | 'left' }

function causeOf(result: { status: 'unauthenticated' } | { status: 'error'; cause: string }): string {
  return result.status === 'error' ? result.cause : 'sua sessão expirou'
}

function fail<T>(r: Exclude<DataResult<T>, { status: 'ok' }>): Exclude<DataResult<never>, { status: 'ok' }> {
  return r.status === 'error' ? r : { status: 'unauthenticated' }
}

/** Casas, estadias e destinos de viagem — o que a Home nomeia ou centra. */
function cityIdsOf(ctx: SettingsData, trips: readonly Trip[]): string[] {
  const ids = new Set<string>()
  for (const m of ctx.couple.members) ids.add(m.homeCity.id)
  for (const s of ctx.stays) ids.add(s.cityId)
  for (const t of trips) ids.add(t.cityId)
  return [...ids]
}

/** Uma leitura inteira: três em paralelo, depois as cidades. Qualquer falha derruba o todo. */
export async function readHome(api: HomeApi): Promise<DataResult<HomeSnapshot>> {
  const today = api.today()
  const [ctx, list, trips] = await Promise.all([api.loadContext(), api.loadList(), api.loadTrips()])
  if (ctx.status !== 'ok') return fail(ctx)
  if (list.status !== 'ok') return fail(list)
  if (trips.status !== 'ok') return fail(trips)
  const cities = await api.loadCities(cityIdsOf(ctx.rows, trips.rows.trips))
  if (cities.status !== 'ok') return fail(cities)
  return {
    status: 'ok',
    rows: {
      ctx: ctx.rows,
      items: list.rows.items,
      listMemories: list.rows.memories,
      listPhotos: list.rows.photos,
      trips: trips.rows.trips,
      cities: withHomes(ctx.rows, cities.rows),
      today,
    },
  }
}

/** `list_photos` por item, da mais antiga para a mais nova. */
function photosByItem(photos: readonly ListPhoto[]): Map<string, ListPhoto[]> {
  const out = new Map<string, ListPhoto[]>()
  for (const p of photos) {
    const list = out.get(p.itemId)
    if (list) list.push(p)
    else out.set(p.itemId, [p])
  }
  for (const list of out.values()) list.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
  return out
}

/** Todo caminho que ainda existe depois de uma leitura (o que pode ser re-assinado). */
function alivePaths(snap: HomeSnapshot): Set<string> {
  const alive = new Set<string>()
  for (const i of snap.items) if (i.photoPath) alive.add(i.photoPath)
  for (const p of snap.listPhotos) alive.add(p.path)
  for (const t of snap.trips) for (const p of t.photos) alive.add(p.path)
  return alive
}

/**
 * Lê tudo ao montar e quando a aba volta a ficar visível (ADR 0015, R24). Só
 * a leitura INICIAL vira `error`; a releitura que falha mantém a tela
 * (`stale`). As URLs assinadas são refeitas a cada releitura para os caminhos
 * já pedidos (validade de 1 hora) e a cada 50 minutos numa aba parada.
 */
export function useHomeData(api: HomeApi): HomeLoad {
  const [snap, setSnap] = useState<HomeSnapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [avatars, setAvatars] = useState<Readonly<Record<string, string | null>>>({})
  const [cover, setCover] = useState<string | null>(null)
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map())
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
        const next = new Map(replace ? [...prev].filter(([p]) => !asked.has(p) && requested.current.has(p)) : prev)
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
    const result = await readHome(api)
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
    const alive = alivePaths(result.rows)
    requested.current = new Set([...requested.current].filter((p) => alive.has(p)))
    const couple = result.rows.ctx.couple
    const [pairs, coverUrl] = await Promise.all([
      Promise.all(couple.members.map(async (m) => [m.profileId, await api.avatarUrl(m.avatarPath)] as const)),
      api.coverUrl(couple.coverPath),
      sign([...requested.current], true),
    ])
    if (mine !== generation.current) return
    setAvatars(Object.fromEntries(pairs))
    setCover(coverUrl)
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

  // As URLs valem 1 hora: numa aba que fica visível mais que isso sem
  // releitura, re-assina antes de vencer.
  useEffect(() => {
    const timer = setInterval(() => void sign([...requested.current], true), RESIGN_EVERY_MS)
    return () => clearInterval(timer)
  }, [sign])

  // ADR 0015 / R24: voltar à aba relê.
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

  const people = useMemo(() => (snap ? peopleOf(snap.ctx, snap.cities, avatars) : null), [snap, avatars])
  const byItem = useMemo(() => (snap ? photosByItem(snap.listPhotos) : new Map<string, ListPhoto[]>()), [snap])
  const photoOf = useCallback(
    (item: Pick<ListItem, 'id' | 'photoPath'>) => item.photoPath ?? byItem.get(item.id)?.[0]?.path ?? null,
    [byItem],
  )

  const value = useMemo<HomeContextValue | null>(() => {
    if (!snap || !people) return null
    const myId = snap.ctx.me.profileId
    const mySlot = people[1].profileId === myId ? 1 : people[2].profileId === myId ? 2 : null
    if (mySlot === null) return null
    const me = people[mySlot]
    const partner = people[mySlot === 1 ? 2 : 1]
    const cityId = viewerCityId(me.profileId, me.homeCity.id, snap.ctx.stays, snap.today)
    return {
      api,
      coupleId: snap.ctx.couple.id,
      coupleName: snap.ctx.couple.name,
      me,
      partner,
      people,
      members: membersOf(people),
      names: namesOf(people),
      coverUrl: cover,
      stays: snap.ctx.stays,
      cities: snap.cities,
      // Uma estadia numa cidade que não veio na leitura cai na casa: centrar
      // o mapa em "?" não existe (seção 7).
      viewerCity: snap.cities.get(cityId) ?? me.homeCity,
      items: snap.items,
      listMemories: snap.listMemories,
      listPhotos: byItem,
      photoOf,
      trips: snap.trips,
      settings: snap.ctx.coupleSettings,
      today: snap.today,
      urls,
      requestUrls,
      stale,
      reload,
    }
  }, [api, snap, people, cover, byItem, photoOf, urls, requestUrls, stale, reload])

  if (!snap) return loadError !== null ? { status: 'error', cause: loadError, retry } : { status: 'loading' }
  // `value` leva `reload` e `requestUrls`, que mexem em refs — mas só quando
  // CHAMADOS (efeito, clique), nunca durante o render: o aviso é falso positivo.
  // eslint-disable-next-line react/refs
  if (value) return { status: 'ok', value }
  return { status: 'ok', value: null, problem: people ? 'left' : 'alone' }
}
