// A Home — a parte da LEITURA e do esqueleto (Fase 7): carregando → ok, erro
// com _Tentar de novo_ e o mapa sem montar (A16), releitura ao voltar à aba
// sem recriar a tela nem o mapa (R24, A17), `stale`, e o contrato do
// `HomeContext` (quem vê, a cidade de hoje, a foto do item, as URLs).
// O mapa em si e o painel são das outras tarefas (`MapArea`, `HomePanel`).
// ADR 0005: comportamento de tela se prova renderizando.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R24, I12, seção 7, A16, A17

import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ListPhoto } from '../domain/list'
import { fakeMapEngine } from '../map/fakeEngine'
import { tripsContextData, TRIP_LIST_ITEMS } from '../trips/test/fixtures'
import type { HomeApi } from './api'
import { useHomeData } from './context'
import type { HomeContextValue } from './context'
import { HomeScreen } from './HomeScreen'
import { deferred, seededHomeApi, signedUrlOf } from './test/fakeApi'

const failing = { status: 'error', cause: 'projeto pausado' } as const

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** A área do mapa da Home (a casca da `MapArea`), que só existe com leitura `ok`. */
const mapSlot = (container: HTMLElement) => container.querySelector('.home-map-slot')

async function okValue(api: HomeApi): Promise<HomeContextValue> {
  const { result } = renderHook(() => useHomeData(api))
  await waitFor(() => expect(result.current.status).toBe('ok'))
  const load = result.current
  if (load.status !== 'ok' || load.value === null) throw new Error('sem valor')
  return load.value
}

describe('carregando → ok', () => {
  it('com a leitura em voo: esqueleto, sem mapa montado', () => {
    const map = fakeMapEngine()
    const { container } = render(
      <HomeScreen api={seededHomeApi({ map }, { loadList: vi.fn<HomeApi['loadList']>(() => new Promise(() => undefined)) })} />,
    )
    expect(screen.getByText('Carregando a Home…')).toBeInTheDocument()
    expect(mapSlot(container)).toBeNull()
    expect(map.mounts).toHaveLength(0)
  })

  it('a leitura chega: a área do mapa e o painel aparecem', async () => {
    const api = seededHomeApi()
    const { container } = render(<HomeScreen api={api} />)
    await waitFor(() => expect(mapSlot(container)).not.toBeNull())
    expect(screen.queryByText('Carregando a Home…')).not.toBeInTheDocument()
    expect(api.loadContext).toHaveBeenCalledTimes(1)
    expect(api.loadList).toHaveBeenCalledTimes(1)
    expect(api.loadTrips).toHaveBeenCalledTimes(1)
  })

  it('as cidades pedidas são as casas, as estadias e os destinos de viagem', async () => {
    const api = seededHomeApi()
    render(<HomeScreen api={api} />)
    await waitFor(() => expect(api.loadCities).toHaveBeenCalledTimes(1))
    const ids = vi.mocked(api.loadCities).mock.calls[0][0]
    expect(ids).toEqual(expect.arrayContaining(['c-sjc', 'c-marau', 'c-lisboa', 'c-ilhabela', 'c-paraty']))
  })
})

describe('A16 — leitura falhou: erro com Tentar de novo, e o mapa não recebe pins', () => {
  it.each(['loadContext', 'loadList', 'loadTrips', 'loadCities'] as const)(
    '%s falhou: "Não deu para carregar a Home.", sem mapa; Tentar de novo relê',
    async (fn) => {
      const map = fakeMapEngine()
      const api = seededHomeApi({ map }, { [fn]: vi.fn(async () => failing) } as Partial<HomeApi>)
      const { container } = render(<HomeScreen api={api} />)
      expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar a Home.')
      // Sem instância de mapa não há pin: um globo vazio diria "não salvaram nada".
      expect(mapSlot(container)).toBeNull()
      expect(map.mounts).toHaveLength(0)

      const healthy = seededHomeApi()
      vi.mocked(api[fn]).mockImplementation(healthy[fn] as never)
      await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
      await waitFor(() => expect(mapSlot(container)).not.toBeNull())
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('sessão caída também é erro, nunca zero linhas', async () => {
    render(<HomeScreen api={seededHomeApi({}, { loadTrips: vi.fn(async () => ({ status: 'unauthenticated' as const })) })} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar a Home.')
  })

  it('a outra pessoa saiu: o aviso, sem mapa', async () => {
    const ctx = tripsContextData()
    const alone = { ...ctx, couple: { ...ctx.couple, members: ctx.couple.members.slice(0, 1) } }
    const { container } = render(<HomeScreen api={seededHomeApi({ context: alone })} />)
    expect(await screen.findByRole('status')).toHaveTextContent('O mapa aparece quando as duas pessoas estiverem no espaço. Em Configurações, na aba Casal, você convida a outra pessoa ou cria o perfil dela para já ir preenchendo.')
    expect(mapSlot(container)).toBeNull()
  })
})

describe('R24 / A17 — releitura ao voltar à aba', () => {
  it('relê todas as leituras e mantém a MESMA árvore (o mapa não é recriado)', async () => {
    const map = fakeMapEngine()
    const api = seededHomeApi({ map })
    const { container } = render(<HomeScreen api={api} />)
    await waitFor(() => expect(mapSlot(container)).not.toBeNull())
    const slot = mapSlot(container)
    const mounts = map.mounts.length

    act(() => setVisibility('hidden'))
    act(() => setVisibility('visible'))
    await waitFor(() => expect(api.loadList).toHaveBeenCalledTimes(2))
    expect(api.loadContext).toHaveBeenCalledTimes(2)
    expect(api.loadTrips).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(api.loadCities).toHaveBeenCalledTimes(2))

    // Nada de esqueleto no meio: a tela não desmonta para reler.
    expect(screen.queryByText('Carregando a Home…')).not.toBeInTheDocument()
    expect(mapSlot(container)).toBe(slot)
    expect(map.mounts).toHaveLength(mounts)
    expect(map.destroyed).toBe(0)
  })

  it('releitura que falha: a tela fica, com o aviso de desatualizada', async () => {
    const api = seededHomeApi()
    const { container } = render(<HomeScreen api={api} />)
    await waitFor(() => expect(mapSlot(container)).not.toBeNull())
    const slot = mapSlot(container)

    vi.mocked(api.loadList).mockImplementation(async () => failing)
    act(() => setVisibility('visible'))
    expect(await screen.findByText('Não deu pra atualizar. Você está vendo a última versão carregada.')).toBeInTheDocument()
    expect(mapSlot(container)).toBe(slot)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('o contrato do HomeContext', () => {
  it('quem vê, o outro, os nomes e a cidade de hoje (a estadia, senão a casa)', async () => {
    const value = await okValue(seededHomeApi())
    expect(value.me.name).toBe('Gabriel')
    expect(value.partner.name).toBe('Lana')
    expect(value.names).toEqual({ 1: 'Gabriel', 2: 'Lana' })
    expect(value.viewerCity.id).toBe('c-sjc')
    expect(value.today).toBe('2026-09-25')
    expect(value.items.length).toBe(TRIP_LIST_ITEMS.length)
  })

  it('sem estadia hoje, a cidade de quem vê é a casa (R7)', async () => {
    const value = await okValue(seededHomeApi({ context: tripsContextData({ stays: [] }) }))
    expect(value.viewerCity.id).toBe('c-sjc')
  })

  it('a foto do item: a capa, senão a primeira foto do feito', async () => {
    const [withCover, bare] = TRIP_LIST_ITEMS
    const items = [
      { ...withCover, photoPath: 'couple-1/item/capa.webp' },
      { ...bare, photoPath: null },
    ]
    const photo = (id: string, createdAt: string): ListPhoto => ({
      id,
      itemId: bare.id,
      path: `couple-1/memory/${id}.webp`,
      addedBy: null,
      createdAt,
    })
    const value = await okValue(
      seededHomeApi({ items, photos: [photo('b', '2026-09-02T10:00:00Z'), photo('a', '2026-09-01T10:00:00Z')] }),
    )
    expect(value.photoOf(items[0])).toBe('couple-1/item/capa.webp')
    expect(value.photoOf(items[1])).toBe('couple-1/memory/a.webp')
    expect(value.photoOf({ id: 'sem-foto', photoPath: null })).toBeNull()
    expect(value.listPhotos.get(bare.id)?.map((p) => p.id)).toEqual(['a', 'b'])
  })

  it('URLs: pedidas em lote, só as novas, e re-assinadas na releitura', async () => {
    const api = seededHomeApi()
    const { result } = renderHook(() => useHomeData(api))
    await waitFor(() => expect(result.current.status).toBe('ok'))
    const get = () => {
      const load = result.current
      if (load.status !== 'ok' || load.value === null) throw new Error('sem valor')
      return load.value
    }
    const path = TRIP_LIST_ITEMS.find((i) => i.photoPath)!.photoPath!
    act(() => get().requestUrls([path, path, null]))
    await waitFor(() => expect(get().urls.get(path)).toBe(signedUrlOf(path)))
    const firstCalls = vi.mocked(api.signedUrls).mock.calls.filter((c) => c[0].includes(path))
    expect(firstCalls).toHaveLength(1)
    expect(firstCalls[0][0]).toEqual([path])

    act(() => get().requestUrls([path]))
    expect(vi.mocked(api.signedUrls).mock.calls.filter((c) => c[0].includes(path))).toHaveLength(1)

    await act(() => get().reload())
    expect(vi.mocked(api.signedUrls).mock.calls.filter((c) => c[0].includes(path))).toHaveLength(2)
  })

  it('a foto do casal chega pelo coverUrl (R4)', async () => {
    const ctx = tripsContextData()
    const api = seededHomeApi(
      { context: { ...ctx, couple: { ...ctx.couple, coverPath: 'couple-1/cover.webp' } } },
      { coverUrl: vi.fn(async (p: string | null) => (p ? `https://signed/${p}` : null)) },
    )
    const { result } = renderHook(() => useHomeData(api))
    await waitFor(() => {
      const load = result.current
      expect(load.status === 'ok' && load.value?.coverUrl).toBe('https://signed/couple-1/cover.webp')
    })
  })

  it('uma leitura antiga que chega depois da nova não sobrescreve', async () => {
    const slow = deferred<Awaited<ReturnType<HomeApi['loadList']>>>()
    const api = seededHomeApi()
    const healthy = api.loadList
    const loadList = vi.fn<HomeApi['loadList']>().mockImplementationOnce(() => slow.promise).mockImplementation(healthy)
    const racing = { ...api, loadList }
    const { result } = renderHook(() => useHomeData(racing))
    act(() => setVisibility('visible'))
    await waitFor(() => expect(result.current.status).toBe('ok'))
    await act(async () => slow.resolve(failing))
    expect(result.current.status).toBe('ok')
    const load = result.current
    expect(load.status === 'ok' && load.value?.stale).toBe(false)
  })
})

describe('R18 — o painel pede foco à área do mapa com a Home aberta', () => {
  it('_Ver mapa_ leva o mapa ao nível cidade da cidade de quem vê, sem remontar', async () => {
    const map = fakeMapEngine()
    render(<HomeScreen api={seededHomeApi({ map })} />)
    const verMapa = await screen.findByRole('button', { name: /Ver mapa/ })
    await waitFor(() => expect(map.mounts).toHaveLength(1))
    const before = map.flights.length
    await userEvent.click(verMapa)
    await waitFor(() => expect(map.flights.length).toBe(before + 1))
    const camera = map.flights[map.flights.length - 1]
    // Nível cidade (I6): inclinada, com terreno, no centro de SJC.
    expect(camera).toMatchObject({ kind: 'center', pitch: 60, terrain: true })
    expect(screen.getByRole('heading', { name: 'Aqui por perto' })).toBeInTheDocument()
    expect(map.mounts).toHaveLength(1)
  })
})
