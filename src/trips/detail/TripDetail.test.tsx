// A14 — .agent/Tasks/fase-6-viagens.md, seção 10: o Detalhe feito (Ilhabela,
// `Peoa7`), o futuro (Lisboa, `f3yqz`) e em andamento renderizam os blocos do
// R15–R18 com os textos derivados; o topo (R14), a preparação (R20b), o
// orçamento (R20c), a hospedagem (R20d), a memória (R23), _Adicionar fotos_
// (R21) e o aviso da capa (R25). ADR 0005: prova-se renderizando.

import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCalendarFocus, peekCalendarFocus } from '../../app/calendarFocus'
import { formatNumber, tripKm } from '../../domain/tripDerive'
import type { TripsApi } from '../api'
import { deferred, okWrite, seededTripsApi } from '../test/fakeApi'
import {
  CITY_ILHABELA,
  CITY_LISBOA,
  CITY_SJC,
  COUPLE,
  TRIP_GRAMADO_ID,
  TRIP_ILHABELA,
  TRIP_ILHABELA_ID,
  TRIP_LISBOA,
  TRIP_LISBOA_ID,
  TRIP_PARATY_ID,
  signedUrlOf,
} from '../test/fixtures'
import { renderInTrips, renderTripsRoute, tripsValue } from '../test/renderInTrips'
import { TripDetail } from './TripDetail'

afterEach(() => {
  clearCalendarFocus()
  window.history.replaceState(null, '', '/')
})

const km = (dest: { lat: number; lng: number }) => `${formatNumber(Math.round(tripKm(CITY_SJC, dest)))} km`

function section(name: string | RegExp) {
  return within(screen.getByRole('region', { name }))
}

describe('A14 — feita (Ilhabela, Peoa7)', () => {
  it('herói, números e os blocos da feita, pela rota de verdade', async () => {
    renderTripsRoute(seededTripsApi(), { name: 'trip', id: TRIP_ILHABELA_ID })
    expect(await screen.findByRole('heading', { name: 'Ilhabela, SP', level: 1 })).toBeInTheDocument()

    // R15
    expect(screen.getByText('Já fomos · Brasil')).toBeInTheDocument()
    expect(screen.getByText('12–19 jul 2026')).toBeInTheDocument()
    expect(screen.getByText('Férias de inverno')).toBeInTheDocument()
    expect(screen.getByText('Gabriel e Lana')).toBeInTheDocument()
    expect(screen.getByText('nota da viagem')).toBeInTheDocument()
    expect(screen.getByText('12 fotos')).toBeInTheDocument()

    // R16
    const stats = within(screen.getByRole('list', { name: 'Números da viagem' }))
    expect(stats.getByText('Ilhabela')).toBeInTheDocument()
    expect(stats.getByText('1 cidade')).toBeInTheDocument()
    expect(stats.getByText(km(CITY_ILHABELA))).toBeInTheDocument()
    expect(stats.getByText('percorridos · SJC → Ilhabela → SJC')).toBeInTheDocument()
    expect(stats.getByText('juntos · 12 a 19 jul')).toBeInTheDocument()
    expect(stats.getByText('7 lugares')).toBeInTheDocument()
    expect(stats.getByText('visitados · 1 da nossa lista')).toBeInTheDocument()

    // R18 feita
    expect(screen.getByRole('heading', { name: 'Galeria · 12 fotos' })).toBeInTheDocument()
    const memories = section('Memórias')
    expect(memories.getByText('os dois deram 5')).toBeInTheDocument()
    expect(memories.getByRole('article', { name: 'Memória de Gabriel' })).toHaveTextContent('escrito em 21 jul')
    expect(memories.getByRole('article', { name: 'Memória de Lana' })).toHaveTextContent('escrito em 22 jul')
    const done = section('Da nossa lista · feitos aqui')
    expect(done.getByText('Praia do Bonete')).toBeInTheDocument()
    expect(done.getByText('Feito · jul')).toBeInTheDocument()
    expect(done.getByText('os dois')).toBeInTheDocument()
    expect(done.getByRole('link', { name: 'Ver o item na lista' })).toHaveAttribute('href', '/lista')
    const cal = section('No calendário')
    expect(cal.getByText('Viajando juntos · Ilhabela')).toBeInTheDocument()
    expect(cal.getByText('jul 2026')).toBeInTheDocument()
    expect(cal.getAllByRole('listitem')).toHaveLength(8)
    // R10b
    const map = section('Mapa da viagem')
    expect(map.getByText('SJC → Ilhabela')).toBeInTheDocument()
    expect(map.getByText(`${km(CITY_ILHABELA)} · 1 pin`)).toBeInTheDocument()

    // Nada da futura
    expect(screen.queryByRole('region', { name: 'Preparação' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Orçamento estimado' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Hospedagem' })).not.toBeInTheDocument()
  })

  it('a capa é a foto do cover_photo_id, por URL assinada', () => {
    const { container } = renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />)
    expect(container.querySelector('.td-hero-img')).toHaveAttribute('src', signedUrlOf(TRIP_ILHABELA.photos[0].path))
  })

  it('sem memória: corações apagados e "sem nota ainda"', () => {
    const t = { ...TRIP_ILHABELA, memories: [] }
    renderInTrips(<TripDetail id={t.id} />, tripsValue({ trips: [t] }))
    expect(screen.getAllByText('sem nota ainda')).toHaveLength(2)
    expect(screen.getAllByRole('img', { name: 'sem nota' }).length).toBeGreaterThan(0)
  })
})

describe('A14 — futura (Lisboa, f3yqz)', () => {
  it('herói, números e os blocos da futura', () => {
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />)
    expect(screen.getByRole('heading', { name: 'Lisboa, Portugal', level: 1 })).toBeInTheDocument()
    expect(screen.getByText('Próxima viagem · em 6 dias')).toBeInTheDocument()
    expect(screen.getByText('1–9 out 2026')).toBeInTheDocument()
    expect(screen.getByText('Gabriel sai de GRU · Lana sai de POA')).toBeInTheDocument()
    expect(screen.getByText('3 de 5 prontos')).toBeInTheDocument()

    const stats = within(screen.getByRole('list', { name: 'Números da viagem' }))
    expect(stats.getByText(km(CITY_LISBOA))).toBeInTheDocument()
    expect(stats.getByText('GRU → Lisboa')).toBeInTheDocument()
    expect(stats.getByText('juntos · 1 a 9 out')).toBeInTheDocument()
    expect(stats.getByText('3 itens')).toBeInTheDocument()
    expect(stats.getByText('da lista em Lisboa')).toBeInTheDocument()

    const prep = section('Preparação')
    expect(prep.getByText('3 de 5')).toBeInTheDocument()
    expect(prep.getByRole('checkbox', { name: 'Passagens' })).toHaveAttribute('aria-checked', 'true')
    expect(prep.getByRole('checkbox', { name: 'Seguro viagem' })).toHaveAttribute('aria-checked', 'false')
    expect(prep.getByText('TAP · GRU → LIS')).toBeInTheDocument()

    const budget = section('Orçamento estimado')
    expect(budget.getByText('R$ 18.400')).toBeInTheDocument()
    expect(budget.getByText('R$ 9.200 por pessoa')).toBeInTheDocument()
    expect(budget.getByText('gasto até agora R$ 9.800')).toBeInTheDocument()
    expect(budget.getByText('R$ 9.800')).toBeInTheDocument()
    expect(budget.getByText('Passeios')).toBeInTheDocument()

    const lodging = section('Hospedagem')
    expect(lodging.getByText('Casa do Largo')).toBeInTheDocument()
    expect(lodging.getByText('Largo do Chafariz de Dentro, 1 · Alfama')).toBeInTheDocument()
    expect(lodging.getByText('Check-in qui 1 out, 15h · Check-out sex 9 out, 11h')).toBeInTheDocument()
    expect(lodging.getByText('booking.com · reserva #HX4K2')).toBeInTheDocument()
    expect(lodging.getByText('A pagar · R$ 3.200')).toBeInTheDocument()
    const open = lodging.getByRole('link', { name: /Abrir reserva/ })
    expect(open).toHaveAttribute('href', TRIP_LISBOA.lodging.url)
    expect(open).toHaveAttribute('target', '_blank')

    const nearby = section('Na lista em Lisboa')
    expect(nearby.getByText('Castelo de São Jorge')).toBeInTheDocument()
    expect(nearby.getByText('No roteiro · dia 2')).toBeInTheDocument()
    expect(nearby.getByRole('button', { name: 'Fora do roteiro — pôr Pastéis de Belém no roteiro' })).toBeInTheDocument()

    const cal = section('No calendário')
    expect(cal.getByText('Viajando juntos · Lisboa')).toBeInTheDocument()
    expect(cal.getByText('1–9 out · planejado')).toBeInTheDocument()

    expect(screen.queryByRole('region', { name: /^Galeria/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Memórias' })).not.toBeInTheDocument()
  })

  it('outra planejada (não a do herói): "Planejada · em {n} dias"', () => {
    renderInTrips(<TripDetail id={TRIP_GRAMADO_ID} />)
    expect(screen.getByText('Planejada · em 84 dias')).toBeInTheDocument()
    expect(screen.getByText('Natal na serra')).toBeInTheDocument()
    expect(section('Orçamento estimado').getByText('Sem orçamento ainda')).toBeInTheDocument()
    expect(section('Hospedagem').getByRole('button', { name: 'Adicionar hospedagem' })).toBeInTheDocument()
    expect(section('Hospedagem').queryByRole('link', { name: /Abrir reserva/ })).not.toBeInTheDocument()
  })

  it('em andamento: "Viajando agora · dia {k} de {N}" e os blocos da feita', () => {
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />, tripsValue({ today: '2026-10-03' }))
    expect(screen.getByText('Viajando agora · dia 3 de 9')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Galeria · 0 fotos' })).toHaveTextContent('Nenhuma foto ainda')
    expect(screen.getByRole('region', { name: 'Memórias' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Preparação' })).not.toBeInTheDocument()
  })
})

describe('R14 — o topo', () => {
  it('_Ver no calendário_ pede o mês da ida e vai para /', async () => {
    window.history.replaceState(null, '', `/viagens/${TRIP_ILHABELA_ID}`)
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ver no calendário' }))
    expect(peekCalendarFocus()).toEqual({ year: 2026, month: 7 })
    expect(window.location.pathname).toBe('/')
  })

  it('_Abrir_ do _No calendário_ faz o mesmo', async () => {
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />)
    await userEvent.click(screen.getByRole('button', { name: 'Abrir no calendário' }))
    expect(peekCalendarFocus()).toEqual({ year: 2026, month: 10 })
  })

  it('_Nossas viagens_ volta para /viagens', async () => {
    window.history.replaceState(null, '', `/viagens/${TRIP_ILHABELA_ID}`)
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />)
    const back = screen.getByRole('link', { name: 'Nossas viagens' })
    expect(back).toHaveAttribute('href', '/viagens')
    await userEvent.click(back)
    expect(window.location.pathname).toBe('/viagens')
  })

  it('o lápis só aparece com onEditTrip, e chama', async () => {
    const { unmount } = renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />)
    expect(screen.queryByRole('button', { name: 'Editar viagem' })).not.toBeInTheDocument()
    unmount()
    const onEditTrip = vi.fn()
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} onEditTrip={onEditTrip} />)
    await userEvent.click(screen.getByRole('button', { name: 'Editar viagem' }))
    expect(onEditTrip).toHaveBeenCalledOnce()
  })

  it('o aviso do R25 aparece e se fecha', async () => {
    const clearNotice = vi.fn()
    renderInTrips(
      <TripDetail id={TRIP_LISBOA_ID} />,
      tripsValue({}, { notice: 'A viagem foi salva, mas a capa não subiu.', clearNotice }),
    )
    expect(screen.getByText('A viagem foi salva, mas a capa não subiu.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(clearNotice).toHaveBeenCalled()
  })
})

describe('R20b — preparação', () => {
  it('tocar na caixa alterna done e só depois do ok relê', async () => {
    const api = seededTripsApi({}, { setPrepDone: vi.fn(async () => okWrite(TRIP_LISBOA.prep[3])) })
    const value = tripsValue({ api })
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />, value)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Seguro viagem' }))
    expect(api.setPrepDone).toHaveBeenCalledWith('pp-lis-3', true)
    expect(value.reload).toHaveBeenCalled()
  })

  it('falha: a causa aparece e nada relê', async () => {
    const api = seededTripsApi({}, { setPrepDone: vi.fn(async () => ({ status: 'error' as const, cause: 'sem rede' })) })
    const value = tripsValue({ api })
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />, value)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Passagens' }))
    expect(api.setPrepDone).toHaveBeenCalledWith('pp-lis-0', false)
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu pra marcar: sem rede')
    expect(value.reload).not.toHaveBeenCalled()
  })

  it('tocar no texto abre o editor; _Adicionar item_ cria', async () => {
    const api = seededTripsApi({}, { createPrep: vi.fn(async () => okWrite(TRIP_LISBOA.prep[0])) })
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />, tripsValue({ api }))
    await userEvent.click(screen.getByRole('button', { name: 'Editar Malas' }))
    expect(screen.getByRole('dialog', { name: 'Editar preparação' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar item' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Novo item da preparação' }))
    await userEvent.type(dialog.getByLabelText('Item'), 'Adaptador de tomada')
    await userEvent.click(dialog.getByRole('button', { name: 'Salvar' }))
    expect(api.createPrep).toHaveBeenCalledWith(COUPLE, expect.objectContaining({ id: TRIP_LISBOA_ID }), {
      kind: 'outro',
      label: 'Adaptador de tomada',
      detail: null,
      done: false,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('R21 — adicionar fotos', () => {
  const file = (name: string) => new File(['x'], name, { type: 'image/jpeg', lastModified: 1 })

  it('progresso "Enviando {k} de {n}" e, no fim, "{x} fotos não subiram"; relê', async () => {
    const gate = deferred<Awaited<ReturnType<TripsApi['uploadPhotos']>>>()
    let progress: ((d: number, t: number) => void) | undefined
    const api = seededTripsApi(
      {},
      {
        uploadPhotos: vi.fn<TripsApi['uploadPhotos']>((_c, _t, _f, onProgress) => {
          progress = onProgress
          return gate.promise
        }),
      },
    )
    const value = tripsValue({ api })
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />, value)
    const input = screen.getByTestId('td-photo-input')
    fireEvent.change(input, { target: { files: [file('a.jpg'), file('b.jpg'), file('c.jpg')] } })
    expect(await screen.findByText('Enviando 0 de 3')).toBeInTheDocument()
    expect(api.uploadPhotos).toHaveBeenCalledWith(COUPLE, expect.objectContaining({ id: TRIP_ILHABELA_ID }), expect.any(Array), expect.any(Function))
    act(() => progress?.(2, 3))
    expect(screen.getByText('Enviando 2 de 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar fotos' })).toBeDisabled()
    await act(async () =>
      gate.resolve({
        status: 'ok',
        added: [TRIP_ILHABELA.photos[0]],
        failed: [
          { index: 1, reason: 'too_large', cause: null },
          { index: 2, reason: 'upload_failed', cause: 'rede' },
        ],
      }),
    )
    expect(screen.getByText('2 fotos não subiram')).toBeInTheDocument()
    expect(value.reload).toHaveBeenCalled()
  })

  it(`mais de 50 de uma vez: recusa sem subir nada`, async () => {
    const api = seededTripsApi()
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />, tripsValue({ api }))
    fireEvent.change(screen.getByTestId('td-photo-input'), {
      target: { files: Array.from({ length: 51 }, (_, i) => file(`${i}.jpg`)) },
    })
    expect(await screen.findByText('Escolha até 50 fotos por vez.')).toBeInTheDocument()
    expect(api.uploadPhotos).not.toHaveBeenCalled()
  })

  it('sem fotos: "Nenhuma foto ainda" com _Adicionar fotos_ que abre o seletor', async () => {
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />, tripsValue({ today: '2026-10-20' }))
    const gallery = section('Galeria · 0 fotos')
    const input = screen.getByTestId('td-photo-input') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    await userEvent.click(gallery.getByRole('button', { name: 'Adicionar fotos' }))
    expect(click).toHaveBeenCalled()
  })
})

describe('R23 — memória', () => {
  it('quem já escreveu edita a sua ("Editar a minha")', async () => {
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />)
    await userEvent.click(section('Memórias').getByRole('button', { name: 'Editar a minha' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Editar a minha memória' }))
    expect(dialog.getByLabelText('Como foi')).toHaveValue(TRIP_ILHABELA.memories[0].body)
    expect(dialog.getByRole('button', { name: '5 de 5' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('quem não escreveu: _Escrever_, corações obrigatórios, grava a sua', async () => {
    const api = seededTripsApi({}, { saveMemory: vi.fn(async () => okWrite({ profileId: 'u-gabriel', rating: 4, body: 'x', writtenOn: '2026-09-25' })) })
    const value = tripsValue({ api })
    renderInTrips(<TripDetail id={TRIP_PARATY_ID} />, value)
    await userEvent.click(section('Memórias').getByRole('button', { name: 'Escrever' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Escrever memória' }))
    await userEvent.type(dialog.getByLabelText('Como foi'), 'Chuva e cachaça.')
    await userEvent.click(dialog.getByRole('button', { name: 'Salvar memória' }))
    expect(dialog.getByText('Dê uma nota de 1 a 5.')).toBeInTheDocument()
    expect(api.saveMemory).not.toHaveBeenCalled()

    await userEvent.click(dialog.getByRole('button', { name: '4 de 5' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Salvar memória' }))
    expect(api.saveMemory).toHaveBeenCalledWith(COUPLE, TRIP_PARATY_ID, { rating: 4, body: 'Chuva e cachaça.' })
    expect(value.reload).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
