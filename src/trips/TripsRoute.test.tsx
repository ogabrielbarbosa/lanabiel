// A9 e A17 — .agent/Tasks/fase-6-viagens.md, seção 10 — a parte da ROTA:
// esqueleto, erro de leitura (nunca a Grade vazia), _Tentar de novo_, a
// viagem que não está aqui (R1), a releitura ao voltar à aba (ADR 0015) e as
// URLs assinadas sob demanda (seção 8). A Grade e o Detalhe em si são da T4/T5.
// ADR 0005: comportamento de tela se prova renderizando.

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { settingsData } from '../settings/test/fixtures'
import type { TripsApi } from './api'
import { TripsContext, usePhotoUrls, useTrips, useTripsData } from './context'
import { deferred, fakeTripsApi, seededTripsApi } from './test/fakeApi'
import { TRIP_ILHABELA, TRIP_ILHABELA_ID, UNKNOWN_TRIP_ID, signedUrlOf } from './test/fixtures'
import { renderTripsRoute } from './test/renderInTrips'

const failing = { status: 'error', cause: 'projeto pausado' } as const

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('A17 — leitura: esqueleto, erro e nunca a Grade vazia', () => {
  it('com a leitura em voo, esqueleto — sem o título da Grade', () => {
    renderTripsRoute(seededTripsApi({}, { loadTrips: vi.fn<TripsApi['loadTrips']>(() => new Promise(() => undefined)) }))
    expect(screen.getByText('Carregando as viagens…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nossas viagens' })).not.toBeInTheDocument()
  })

  it.each(['loadContext', 'loadTrips', 'loadListItems', 'loadCities'] as const)(
    '%s falhou: "Não deu para carregar as viagens." e Tentar de novo relê',
    async (fn) => {
      const api = seededTripsApi({}, { [fn]: vi.fn(async () => failing) } as Partial<TripsApi>)
      renderTripsRoute(api)
      expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar as viagens.')
      expect(screen.queryByRole('heading', { name: 'Nossas viagens' })).not.toBeInTheDocument()

      const healthy = seededTripsApi()
      vi.mocked(api[fn]).mockImplementation(healthy[fn] as never)
      await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
      expect(await screen.findByRole('heading', { name: 'Nossas viagens', level: 1 })).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    },
  )

  it('sessão caída também é erro, não lista vazia', async () => {
    renderTripsRoute(seededTripsApi({}, { loadTrips: vi.fn(async () => ({ status: 'unauthenticated' as const })) }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para carregar as viagens.')
  })

  it('zero viagens com leitura ok É a Grade (vazia de verdade)', async () => {
    renderTripsRoute(fakeTripsApi())
    expect(await screen.findByRole('heading', { name: 'Nossas viagens', level: 1 })).toBeInTheDocument()
  })
})

describe('R1 — o detalhe', () => {
  it('id de viagem do casal: o detalhe', async () => {
    renderTripsRoute(seededTripsApi(), { name: 'trip', id: TRIP_ILHABELA_ID })
    expect(await screen.findByRole('heading', { name: 'Ilhabela, SP', level: 1 })).toBeInTheDocument()
  })

  it('id que não é do casal: "Essa viagem não está aqui."', async () => {
    renderTripsRoute(seededTripsApi(), { name: 'trip', id: UNKNOWN_TRIP_ID })
    expect(await screen.findByText('Essa viagem não está aqui.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar para Nossas viagens' })).toHaveAttribute('href', '/viagens')
  })

  it('a outra pessoa apagou a viagem: a releitura não a acha e o detalhe vira o R1 (seção 7)', async () => {
    const api = seededTripsApi()
    renderTripsRoute(api, { name: 'trip', id: TRIP_ILHABELA_ID })
    expect(await screen.findByRole('heading', { name: 'Ilhabela, SP' })).toBeInTheDocument()
    vi.mocked(api.loadTrips).mockResolvedValue({ status: 'ok', rows: { trips: [], events: new Map() } })
    await act(async () => setVisibility('visible'))
    expect(await screen.findByText('Essa viagem não está aqui.')).toBeInTheDocument()
  })
})

describe('ADR 0015 — releitura ao voltar à aba', () => {
  it('relê tudo; a releitura que falha mantém a tela e avisa', async () => {
    const api = seededTripsApi()
    renderTripsRoute(api)
    await screen.findByRole('heading', { name: 'Nossas viagens' })
    expect(api.loadTrips).toHaveBeenCalledTimes(1)

    vi.mocked(api.loadTrips).mockResolvedValue(failing)
    await act(async () => setVisibility('hidden'))
    expect(api.loadTrips).toHaveBeenCalledTimes(1)
    await act(async () => setVisibility('visible'))
    await waitFor(() => expect(api.loadTrips).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Não deu pra atualizar — mostrando o que já estava aqui')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Nossas viagens' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('a outra pessoa saiu', () => {
  it('um integrante só: as viagens são dos dois — aviso, não a Grade', async () => {
    const alone = settingsData()
    alone.couple.members = alone.couple.members.slice(0, 1)
    renderTripsRoute(seededTripsApi({ context: alone }))
    expect(await screen.findByText('As viagens são de vocês dois — convide de novo em Configurações.')).toBeInTheDocument()
  })
})

// --- O hook, direto: URLs sob demanda e releitura explícita ----------------

function Probe({ paths }: { paths: string[] }) {
  const urls = usePhotoUrls(paths)
  const { trips, reload } = useTrips()
  return (
    <>
      <p data-testid="count">{trips.length}</p>
      <p data-testid="urls">{paths.map((p) => urls.get(p) ?? '-').join(' ')}</p>
      <button type="button" onClick={() => void reload()}>
        reler
      </button>
    </>
  )
}

function Harness({ api, paths }: { api: TripsApi; paths: string[] }) {
  const load = useTripsData(api)
  if (load.status !== 'ok' || !load.value) return <p>{load.status}</p>
  return (
    <TripsContext.Provider value={load.value}>
      <Probe paths={paths} />
    </TripsContext.Provider>
  )
}

describe('seção 8 — URLs assinadas só do que a tela pede, num lote', () => {
  it('pede só os caminhos visíveis, uma vez; a releitura re-assina os mesmos', async () => {
    const api = seededTripsApi()
    const paths = [TRIP_ILHABELA.photos[0].path, TRIP_ILHABELA.photos[1].path]
    render(<Harness api={api} paths={paths} />)
    await waitFor(() => expect(screen.getByTestId('urls')).toHaveTextContent(paths.map(signedUrlOf).join(' ')))
    expect(api.signedUrls).toHaveBeenCalledTimes(1)
    expect(api.signedUrls).toHaveBeenCalledWith(paths)

    await userEvent.click(screen.getByRole('button', { name: 'reler' }))
    await waitFor(() => expect(api.signedUrls).toHaveBeenCalledTimes(2))
    expect(vi.mocked(api.signedUrls).mock.calls[1][0]).toEqual(paths)
  })

  it('assinatura que falha: nada de URL (sem <img> quebrado), e pedir de novo tenta de novo', async () => {
    const api = seededTripsApi({}, { signedUrls: vi.fn(async () => failing) })
    const paths = [TRIP_ILHABELA.photos[0].path]
    render(<Harness api={api} paths={paths} />)
    await waitFor(() => expect(api.signedUrls).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId('urls')).toHaveTextContent('-')
  })

  it('re-assinatura da releitura não apaga a URL pedida enquanto ela estava em voo', async () => {
    const api = seededTripsApi()
    const [a, b] = [TRIP_ILHABELA.photos[0].path, TRIP_ILHABELA.photos[1].path]
    const view = render(<Harness api={api} paths={[a]} />)
    await waitFor(() => expect(screen.getByTestId('urls')).toHaveTextContent(signedUrlOf(a)))

    const slow = deferred<Awaited<ReturnType<TripsApi['signedUrls']>>>()
    vi.mocked(api.signedUrls).mockImplementationOnce(() => slow.promise)
    await userEvent.click(screen.getByRole('button', { name: 'reler' }))
    await waitFor(() => expect(api.signedUrls).toHaveBeenCalledTimes(2))

    view.rerender(<Harness api={api} paths={[a, b]} />)
    await waitFor(() => expect(screen.getByTestId('urls')).toHaveTextContent(signedUrlOf(b)))
    await act(async () => slow.resolve({ status: 'ok', rows: new Map([[a, signedUrlOf(a)]]) }))
    expect(screen.getByTestId('urls')).toHaveTextContent(`${signedUrlOf(a)} ${signedUrlOf(b)}`)
  })

  it('releitura em voo que perde para uma mais nova não escreve por cima', async () => {
    const api = seededTripsApi()
    render(<Harness api={api} paths={[]} />)
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('5'))
    const slow = deferred<Awaited<ReturnType<TripsApi['loadTrips']>>>()
    vi.mocked(api.loadTrips).mockImplementationOnce(() => slow.promise)
    await userEvent.click(screen.getByRole('button', { name: 'reler' }))
    vi.mocked(api.loadTrips).mockResolvedValueOnce({ status: 'ok', rows: { trips: [TRIP_ILHABELA], events: new Map() } })
    await userEvent.click(screen.getByRole('button', { name: 'reler' }))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'))
    await act(async () => slow.resolve({ status: 'ok', rows: { trips: [], events: new Map() } }))
    expect(screen.getByTestId('count')).toHaveTextContent('1')
  })
})

describe('R26 — o lápis do Detalhe abre o Editar viagem', () => {
  it('toca no lápis → diálogo "Editar viagem" com o nome da viagem; Cancelar fecha', async () => {
    renderTripsRoute(seededTripsApi(), { name: 'trip', id: TRIP_ILHABELA_ID })
    await userEvent.click(await screen.findByRole('button', { name: 'Editar viagem' }))
    const dialog = screen.getByRole('dialog', { name: 'Editar viagem' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByLabelText('Nome da viagem')).toHaveValue(TRIP_ILHABELA.title)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Editar viagem' })).not.toBeInTheDocument()
  })
})
