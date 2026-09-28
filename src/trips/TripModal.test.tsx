// A13 — .agent/Tasks/fase-6-viagens.md (R24–R27, I10): a Nova viagem chama
// `create_trip` com o payload certo, sobe a capa DEPOIS, relê e navega para o
// detalhe; falha mantém o modal com a causa. E o modo edição (R26).
// ADR 0005: comportamento de tela se prova renderizando.

import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LISBOA_CANDIDATE } from '../calendar/test/fixtures'
import type { TripsApi } from './api'
import { TripModal } from './TripModal'
import type { TripModalProps } from './TripModal'
import { okWrite, seededTripsApi } from './test/fakeApi'
import { CITY_LISBOA, GABRIEL, LANA, TRIP_LISBOA, TRIP_LISBOA_ID, photo } from './test/fixtures'
import { renderInTrips, tripsValue } from './test/renderInTrips'

const FLORIPA = { id: 'c-floripa', name: 'Florianópolis', stateCode: 'SC', lat: -27.5954, lng: -48.548 }

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

function renderModal(props: Partial<TripModalProps> & { api?: TripsApi } = {}) {
  const { api: givenApi, ...rest } = props
  const api =
    givenApi ??
    seededTripsApi(
      {},
      {
        searchCities: vi.fn<TripsApi['searchCities']>(async () => ({ status: 'ok', rows: [FLORIPA] })),
        createTrip: vi.fn<TripsApi['createTrip']>(async () => okWrite({ id: 'trip-new' })),
        uploadCover: vi.fn<TripsApi['uploadCover']>(async () => okWrite(photo('p-cover'))),
      },
    )
  const value = tripsValue({ api })
  const onClose = vi.fn()
  const modalProps = { mode: 'new', onClose, ...rest } as TripModalProps
  renderInTrips(<TripModal {...modalProps} />, value)
  return { api, value, onClose }
}

const setValue = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
const save = () => screen.getByRole('button', { name: 'Salvar viagem' })

/** Digita no Destino, espera a busca (350 ms) e escolhe a opção. */
async function pickDestination(query: string, option: string) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Destino' }), { target: { value: query } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
  fireEvent.click(screen.getByRole('option', { name: option }))
}

async function fillFloripa() {
  await pickDestination('Floria', 'Florianópolis, SC')
  setValue('Ida', '2027-01-08')
  setValue('Volta', '2027-01-14')
}

describe('A13 — Nova viagem: campos e prévia (R24)', () => {
  it('título, subtítulo e as duas saídas com a casa de cada um', () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Nova viagem' })
    expect(dialog).toHaveTextContent('Cria o período no calendário e puxa itens da lista do destino')
    expect(within(dialog).getByText('São José dos Campos')).toBeInTheDocument()
    expect(within(dialog).getByText('Marau')).toBeInTheDocument()
    expect(screen.getByLabelText('Como Gabriel vai')).toHaveAttribute('placeholder', 'voo GRU → FLN · 1h05')
    expect(screen.queryByLabelText('Nome da viagem')).not.toBeInTheDocument()
  })

  it('Ao salvar: "Viajando juntos", o destino, as datas, os dias e a tira com os dias marcados', async () => {
    vi.useFakeTimers()
    renderModal()
    await fillFloripa()
    const preview = screen.getByRole('complementary', { name: 'Ao salvar' })
    expect(preview).toHaveTextContent('Viajando juntos')
    expect(preview).toHaveTextContent('Florianópolis · 8 → 14 jan')
    expect(preview).toHaveTextContent('7d')
    expect(preview).toHaveTextContent('janeiro 2027')
    const strip = within(preview).getByRole('list', { name: 'Os dias da viagem no calendário' })
    const marked = [...strip.querySelectorAll('li.is-on')].map((li) => li.getAttribute('data-day'))
    expect(marked).toEqual(['2027-01-08', '2027-01-09', '2027-01-10', '2027-01-11', '2027-01-12', '2027-01-13', '2027-01-14'])
    expect(strip.querySelector('[data-day="2027-01-08"]')).toHaveAttribute('data-band', 'away')
  })

  it('destino na casa de um: "Juntos em Marau" (a prévia é a pintura, não um rótulo fixo)', async () => {
    renderModal()
    const box = screen.getByRole('combobox', { name: 'Destino' })
    fireEvent.focus(box)
    fireEvent.click(screen.getByRole('option', { name: /Marau.*casa de Lana/ }))
    setValue('Ida', '2027-01-08')
    setValue('Volta', '2027-01-10')
    expect(screen.getByRole('complementary', { name: 'Ao salvar' })).toHaveTextContent('Juntos em Marau')
  })

  it('Da lista em {destino}: os itens da Lista perto dele, até 3, só leitura', async () => {
    vi.useFakeTimers()
    renderModal({
      api: seededTripsApi(
        {},
        { searchWorldCities: vi.fn<TripsApi['searchWorldCities']>(async () => ({ status: 'ok', rows: [LISBOA_CANDIDATE] })) },
      ),
    })
    await pickDestination('Lisboa', 'Lisboa · Portugal')
    const block = screen.getByRole('group', { name: 'Da lista em Lisboa' })
    expect(block).toHaveTextContent('3 itens')
    expect(within(block).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Castelo de São Jorge'),
      expect.stringContaining('LX Factory'),
      expect.stringContaining('Pastéis de Belém'),
    ])
    expect(within(block).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('R11: o Planejar abre com a busca do Destino preenchida', async () => {
    const { api } = renderModal({ mode: 'new', initialQuery: 'Japão' })
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveValue('Japão')
    await waitFor(() => expect(api.searchCities).toHaveBeenCalledWith('Japão'))
  })
})

describe('A13 — validação (R24)', () => {
  it('sem destino: "Escolha o destino." e nada é gravado', async () => {
    const { api } = renderModal()
    setValue('Ida', '2027-01-08')
    setValue('Volta', '2027-01-14')
    await act(async () => fireEvent.click(save()))
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o destino.')
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveFocus()
    expect(api.createTrip).not.toHaveBeenCalled()
  })

  it('volta antes da ida, e mais de 366 dias, são recusados', async () => {
    vi.useFakeTimers()
    const { api } = renderModal()
    await pickDestination('Floria', 'Florianópolis, SC')
    setValue('Ida', '2027-01-08')
    setValue('Volta', '2027-01-07')
    await act(async () => fireEvent.click(save()))
    expect(screen.getByRole('alert')).toHaveTextContent('A volta precisa ser no dia da ida ou depois.')
    setValue('Volta', '2028-01-09')
    await act(async () => fireEvent.click(save()))
    expect(screen.getByRole('alert')).toHaveTextContent('No máximo 366 dias.')
    expect(api.createTrip).not.toHaveBeenCalled()
  })
})

describe('A13 — salvar (R25)', () => {
  it('create_trip com o payload certo; a capa sobe DEPOIS; relê e navega para o detalhe', async () => {
    vi.useFakeTimers()
    const { api, value, onClose } = renderModal()
    await fillFloripa()
    setValue('Como Lana vai', 'voo POA → FLN · 55min')
    setValue('Hospedagem', 'Pousada na Lagoa')
    setValue('Nota', '  Férias de verão, sem notebook ')
    const file = new File(['x'], 'capa.jpg', { type: 'image/jpeg' })
    fireEvent.change(screen.getByLabelText('Escolher a foto da capa'), { target: { files: [file] } })
    expect(screen.getByRole('img', { name: 'Capa escolhida: capa.jpg' })).toBeInTheDocument()

    await act(async () => fireEvent.click(save()))

    expect(api.createTrip).toHaveBeenCalledWith({
      title: 'Florianópolis, SC',
      cityId: 'c-floripa',
      startsOn: '2027-01-08',
      endsOn: '2027-01-14',
      note: 'Férias de verão, sem notebook',
      lodgingName: 'Pousada na Lagoa',
      departures: [
        { profileId: GABRIEL, originCode: null, note: null },
        { profileId: LANA, originCode: null, note: 'voo POA → FLN · 55min' },
      ],
    })
    expect(api.uploadCover).toHaveBeenCalledWith('couple-1', expect.objectContaining({ id: 'trip-new', startsOn: '2027-01-08' }), file)
    expect(vi.mocked(api.createTrip).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.uploadCover).mock.invocationCallOrder[0])
    expect(value.reload).toHaveBeenCalled()
    expect(value.showNotice).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
    expect(window.location.pathname).toBe('/viagens/trip-new')
  })

  it('sem capa: não chama o upload', async () => {
    vi.useFakeTimers()
    const { api } = renderModal()
    await fillFloripa()
    await act(async () => fireEvent.click(save()))
    expect(api.createTrip).toHaveBeenCalled()
    expect(api.uploadCover).not.toHaveBeenCalled()
  })

  it('destino do mundo: ensureWorldCity ANTES de create_trip, e o título "Lisboa, Portugal" (I10)', async () => {
    vi.useFakeTimers()
    const api = seededTripsApi(
      {},
      {
        searchWorldCities: vi.fn<TripsApi['searchWorldCities']>(async () => ({ status: 'ok', rows: [LISBOA_CANDIDATE] })),
        ensureWorldCity: vi.fn<TripsApi['ensureWorldCity']>(async () => ({ status: 'ok' as const, value: CITY_LISBOA })),
        createTrip: vi.fn<TripsApi['createTrip']>(async () => okWrite({ id: 'trip-new' })),
      },
    )
    renderModal({ api })
    await pickDestination('Lisboa', 'Lisboa · Portugal')
    setValue('Ida', '2027-05-01')
    setValue('Volta', '2027-05-05')
    await act(async () => fireEvent.click(save()))
    expect(vi.mocked(api.createTrip).mock.calls[0][0]).toMatchObject({ title: 'Lisboa, Portugal', cityId: CITY_LISBOA.id })
    expect(vi.mocked(api.ensureWorldCity).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(api.createTrip).mock.invocationCallOrder[0])
  })

  it('capa falhou: a viagem fica salva, o aviso vai para o detalhe e navega mesmo assim', async () => {
    vi.useFakeTimers()
    const api = seededTripsApi(
      {},
      {
        searchCities: vi.fn<TripsApi['searchCities']>(async () => ({ status: 'ok', rows: [FLORIPA] })),
        createTrip: vi.fn<TripsApi['createTrip']>(async () => okWrite({ id: 'trip-new' })),
        uploadCover: vi.fn<TripsApi['uploadCover']>(async () => ({
          status: 'photo_failed' as const,
          failure: { index: 0, reason: 'upload_failed' as const, cause: 'rede' },
        })),
      },
    )
    const { value, onClose } = renderModal({ api })
    await fillFloripa()
    fireEvent.change(screen.getByLabelText('Escolher a foto da capa'), { target: { files: [new File(['x'], 'c.jpg', { type: 'image/jpeg' })] } })
    await act(async () => fireEvent.click(save()))
    expect(value.showNotice).toHaveBeenCalledWith('A viagem foi salva, mas a capa não subiu.')
    expect(onClose).toHaveBeenCalled()
    expect(window.location.pathname).toBe('/viagens/trip-new')
  })

  it('create_trip falhou: o modal fica aberto, com o que foi digitado e a causa', async () => {
    vi.useFakeTimers()
    const api = seededTripsApi(
      {},
      {
        searchCities: vi.fn<TripsApi['searchCities']>(async () => ({ status: 'ok', rows: [FLORIPA] })),
        createTrip: vi.fn<TripsApi['createTrip']>(async () => ({ status: 'error', cause: 'projeto pausado' })),
      },
    )
    const { value, onClose } = renderModal({ api })
    await fillFloripa()
    setValue('Hospedagem', 'Pousada na Lagoa')
    await act(async () => fireEvent.click(save()))
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu pra salvar: projeto pausado')
    expect(screen.getByRole('dialog', { name: 'Nova viagem' })).toBeInTheDocument()
    expect(screen.getByLabelText('Hospedagem')).toHaveValue('Pousada na Lagoa')
    expect(save()).toBeEnabled()
    expect(onClose).not.toHaveBeenCalled()
    expect(value.reload).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/')
  })

  it('enquanto grava, tudo desabilitado (R27)', async () => {
    vi.useFakeTimers()
    let release: (v: Awaited<ReturnType<TripsApi['createTrip']>>) => void = () => {}
    const api = seededTripsApi(
      {},
      {
        searchCities: vi.fn<TripsApi['searchCities']>(async () => ({ status: 'ok', rows: [FLORIPA] })),
        createTrip: vi.fn<TripsApi['createTrip']>(() => new Promise((r) => (release = r))),
      },
    )
    renderModal({ api })
    await fillFloripa()
    await act(async () => fireEvent.click(save()))
    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeDisabled()
    await act(async () => release(okWrite({ id: 'trip-new' })))
  })
})

describe('R26 — Editar viagem', () => {
  const editApi = () =>
    seededTripsApi(
      {},
      {
        updateTripEvent: vi.fn<TripsApi['updateTripEvent']>(async () => okWrite()),
        updateTrip: vi.fn<TripsApi['updateTrip']>(async () => okWrite()),
        saveDepartures: vi.fn<TripsApi['saveDepartures']>(async () => okWrite()),
        deleteTrip: vi.fn<TripsApi['deleteTrip']>(async () => ({ status: 'ok' as const })),
      },
    )

  it('preenchido, com Nome da viagem e o aviso de que o período não muda', () => {
    renderModal({ mode: 'edit', trip: TRIP_LISBOA, api: editApi() })
    expect(screen.getByRole('dialog', { name: 'Editar viagem' })).toBeInTheDocument()
    expect(screen.getByLabelText('Nome da viagem')).toHaveValue('Lisboa, Portugal')
    expect(screen.getByRole('combobox', { name: 'Destino' })).toHaveValue('Lisboa · Portugal')
    expect(screen.getByLabelText('Hospedagem')).toHaveValue('Casa do Largo')
    expect(screen.getByLabelText('Como Gabriel vai')).toHaveValue('voo GRU → LIS · 10h')
    expect(screen.getByText('Mudar datas ou destino aqui não muda o período. Pra isso, ajuste no calendário.')).toBeInTheDocument()
    expect(screen.queryByText('Ao salvar')).not.toBeInTheDocument()
  })

  it('salvar muda o evento; hospedagem e saídas só quando mudaram', async () => {
    const api = editApi()
    const { value, onClose } = renderModal({ mode: 'edit', trip: TRIP_LISBOA, api })
    setValue('Nome da viagem', 'Lisboa, enfim')
    await act(async () => fireEvent.click(save()))
    expect(api.updateTripEvent).toHaveBeenCalledWith(value.events.get(TRIP_LISBOA_ID), {
      title: 'Lisboa, enfim',
      cityId: CITY_LISBOA.id,
      startsOn: '2026-10-01',
      endsOn: '2026-10-09',
      note: 'Primeira vez na Europa',
    })
    expect(api.updateTrip).not.toHaveBeenCalled()
    expect(api.saveDepartures).not.toHaveBeenCalled()
    expect(value.reload).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('hospedagem e saída mudadas: updateTrip com a hospedagem inteira e saveDepartures com o código mantido', async () => {
    const api = editApi()
    renderModal({ mode: 'edit', trip: TRIP_LISBOA, api })
    setValue('Hospedagem', 'Casa Nova')
    setValue('Como Lana vai', 'voo POA → LIS')
    await act(async () => fireEvent.click(save()))
    expect(api.updateTrip).toHaveBeenCalledWith(TRIP_LISBOA_ID, { lodging: { ...TRIP_LISBOA.lodging, name: 'Casa Nova' } })
    expect(api.saveDepartures).toHaveBeenCalledWith('couple-1', TRIP_LISBOA_ID, [
      { profileId: GABRIEL, originCode: 'GRU', note: 'voo GRU → LIS · 10h' },
      { profileId: LANA, originCode: 'POA', note: 'voo POA → LIS' },
    ])
  })

  it('falha secundária mantém aberto; Salvar de novo não sobe a capa nova outra vez', async () => {
    const api = editApi()
    api.uploadCover = vi.fn<TripsApi['uploadCover']>(async () => okWrite(photo('p-new-cover')))
    vi.mocked(api.saveDepartures).mockResolvedValueOnce({ status: 'error', cause: 'rede' })
    renderModal({ mode: 'edit', trip: TRIP_LISBOA, api })
    fireEvent.change(screen.getByLabelText('Escolher a foto da capa'), { target: { files: [new File(['x'], 'c.jpg', { type: 'image/jpeg' })] } })
    setValue('Como Lana vai', 'voo POA → LIS')
    await act(async () => fireEvent.click(save()))
    expect(screen.getByRole('alert')).toHaveTextContent('A viagem foi salva, mas não deu pra salvar as saídas')
    expect(api.uploadCover).toHaveBeenCalledTimes(1)

    await act(async () => fireEvent.click(save()))
    expect(api.uploadCover).toHaveBeenCalledTimes(1)
  })

  it('Apagar viagem pede confirmação, apaga, relê e volta para /viagens', async () => {
    const api = editApi()
    const { value } = renderModal({ mode: 'edit', trip: TRIP_LISBOA, api })
    fireEvent.click(screen.getByRole('button', { name: 'Apagar viagem' }))
    expect(
      screen.getByText('Apagar Lisboa, Portugal? As fotos e o roteiro vão junto; o período no calendário continua.'),
    ).toBeInTheDocument()
    expect(api.deleteTrip).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Apagar' })))
    expect(api.deleteTrip).toHaveBeenCalledWith(TRIP_LISBOA)
    expect(value.reload).toHaveBeenCalled()
    expect(window.location.pathname).toBe('/viagens')
  })

  it('apagar que falha fica aberto com a causa', async () => {
    const api = editApi()
    vi.mocked(api.deleteTrip).mockResolvedValue({ status: 'error', cause: 'rede' })
    renderModal({ mode: 'edit', trip: TRIP_LISBOA, api })
    fireEvent.click(screen.getByRole('button', { name: 'Apagar viagem' }))
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Apagar' })))
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu pra apagar: rede')
    expect(screen.getByRole('dialog', { name: 'Editar viagem' })).toBeInTheDocument()
  })
})
