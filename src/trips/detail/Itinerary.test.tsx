// A15 — .agent/Tasks/fase-6-viagens.md, seção 10: o roteiro (R17) — colapso
// dos dias vazios, _Ver dias 5 a N_, _Fora das datas da viagem_, sugestões —
// e o editor do item (R19: criar, editar, apagar, validar, falha, gravando) e
// do título do dia (R20). ADR 0005.

import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TripsApi } from '../api'
import { deferred, okWrite, seededTripsApi } from '../test/fakeApi'
import { COUPLE, TRIP_ILHABELA, TRIP_ILHABELA_ID, TRIP_LISBOA, TRIP_LISBOA_ID, itinerary } from '../test/fixtures'
import { renderInTrips, tripsValue } from '../test/renderInTrips'
import { TripDetail } from './TripDetail'

const roteiro = () => within(screen.getByRole('region', { name: 'Roteiro dia a dia' }))
const dayPills = () => roteiro().getAllByText(/^Dia \d+( a \d+)?$/).map((el) => el.textContent)

describe('R17 — os dias', () => {
  it('feita com 6 dias com itens: mostra até o dia 4 e "Ver dias 5 a 8" expande (com o bloco em aberto 7 a 8)', async () => {
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />)
    expect(dayPills()).toEqual(['Dia 1', 'Dia 2', 'Dia 3', 'Dia 4'])
    expect(roteiro().getByText('Dom, 12 jul')).toBeInTheDocument()
    expect(roteiro().getByRole('button', { name: 'Editar o título do dia 1: Chegada' })).toHaveTextContent('· Chegada')
    expect(roteiro().getByRole('button', { name: 'Editar roteiro' })).toBeInTheDocument()

    await userEvent.click(roteiro().getByRole('button', { name: 'Ver dias 5 a 8' }))
    expect(dayPills()).toEqual(['Dia 1', 'Dia 2', 'Dia 3', 'Dia 4', 'Dia 5', 'Dia 6', 'Dia 7 a 8'])
    expect(roteiro().getByText('· em aberto')).toBeInTheDocument()
    await userEvent.click(roteiro().getByRole('button', { name: 'Mostrar menos' }))
    expect(dayPills()).toHaveLength(4)
  })

  it('itens por hora (sem hora no fim), com tipo, nota e o selo "da lista"', () => {
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />)
    const day1 = roteiro().getAllByRole('button', { name: /Balsa|Check-in/ })
    expect(day1.map((b) => b.textContent)).toEqual([
      expect.stringContaining('15:30Balsa São Sebastião → IlhabelaTransporte'),
      expect.stringContaining('17:00Check-in na pousadaHospedagem'),
    ])
    const bonete = roteiro().getByRole('button', { name: /Trilha até a Praia do Bonete/ })
    expect(bonete).toHaveTextContent('Parque· 4h de trilha, levar águada lista')
  })

  it('futura: um bloco "Dia 3 a 9 · em aberto" com os dias livres e as sugestões da Lista', () => {
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />)
    expect(dayPills()).toEqual(['Dia 1', 'Dia 2', 'Dia 3 a 9'])
    expect(roteiro().getByText('Sáb, 3 → Sex, 9 out')).toBeInTheDocument()
    expect(roteiro().getByText('7 dias livres. Dá pra trazer itens da lista de Lisboa pra cá.')).toBeInTheDocument()
    const suggestions = within(roteiro().getByRole('group', { name: 'Sugestões da lista' }))
    expect(suggestions.getAllByRole('button').map((b) => b.textContent)).toEqual(['LX Factory', 'Pastéis de Belém'])
    expect(roteiro().getByRole('button', { name: 'Montar roteiro' })).toBeInTheDocument()
    expect(roteiro().queryByText(/^Ver dias/)).not.toBeInTheDocument()
  })

  it('item com data fora da viagem vai para "Fora das datas da viagem"', () => {
    const t = { ...TRIP_LISBOA, itinerary: [...TRIP_LISBOA.itinerary, itinerary('it-x', '2026-10-15', 'Jantar de volta', { kind: 'restaurante' })] }
    renderInTrips(<TripDetail id={t.id} />, tripsValue({ trips: [t] }))
    const outside = within(screen.getByRole('region', { name: 'Fora das datas da viagem' }))
    expect(outside.getByText('Qui, 15 out')).toBeInTheDocument()
    expect(outside.getByRole('button', { name: /Jantar de volta/ })).toBeInTheDocument()
  })
})

describe('R19 — o item do roteiro', () => {
  it('sugestão abre o modal já vinculado, no primeiro dia livre; salvar cria com o vínculo', async () => {
    const api = seededTripsApi({}, { createItinerary: vi.fn(async () => okWrite(TRIP_LISBOA.itinerary[0])) })
    const value = tripsValue({ api })
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />, value)
    await userEvent.click(roteiro().getByRole('button', { name: /^Pastéis de Belém — pôr no roteiro/ }))
    const dialog = within(screen.getByRole('dialog', { name: 'Novo item no roteiro' }))
    expect(dialog.getByLabelText('Dia')).toHaveValue('2026-10-03')
    expect(dialog.getByLabelText('Título')).toHaveValue('Pastéis de Belém')
    expect(dialog.getByRole('button', { name: 'Comida' })).toHaveAttribute('aria-pressed', 'true')
    expect(dialog.getByText('Pastéis de Belém', { selector: '.cal-mf-chosen' })).toBeInTheDocument()

    await userEvent.type(dialog.getByLabelText('Hora'), '09:00')
    await userEvent.click(dialog.getByRole('button', { name: 'Salvar item' }))
    expect(api.createItinerary).toHaveBeenCalledWith(COUPLE, expect.objectContaining({ id: TRIP_LISBOA_ID }), {
      day: '2026-10-03',
      at: '09:00',
      title: 'Pastéis de Belém',
      kind: 'comida',
      note: null,
      listItemId: 'i-pasteis',
    })
    expect(value.reload).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('_Montar roteiro_ abre no primeiro dia sem item; _Da lista_ busca e preenche título e tipo', async () => {
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />)
    await userEvent.click(roteiro().getByRole('button', { name: 'Montar roteiro' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Novo item no roteiro' }))
    expect(dialog.getByLabelText('Dia')).toHaveValue('2026-10-03')
    expect(dialog.getAllByRole('option').map((o) => o.textContent)).toContain('Dia 1 · Qui, 1 out')
    await userEvent.type(dialog.getByPlaceholderText('Busque um item da lista'), 'lx')
    await userEvent.click(dialog.getByRole('option', { name: /LX Factory/ }))
    expect(dialog.getByLabelText('Título')).toHaveValue('LX Factory')
    expect(dialog.getByRole('button', { name: 'Experiência' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('título vazio: recusa pelo domínio, sem chamar a API', async () => {
    const api = seededTripsApi()
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />, tripsValue({ api }))
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Viagem' })).getByRole('button', { name: 'Adicionar ao roteiro' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Novo item no roteiro' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Salvar item' }))
    expect(dialog.getByText('Dê um título ao item.')).toBeInTheDocument()
    expect(api.createItinerary).not.toHaveBeenCalled()
  })

  it('editar: grava pelo id; enquanto grava, desabilitado; falha mantém aberto com a causa', async () => {
    const gate = deferred<Awaited<ReturnType<TripsApi['updateItinerary']>>>()
    const api = seededTripsApi({}, { updateItinerary: vi.fn(() => gate.promise) })
    const value = tripsValue({ api })
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />, value)
    await userEvent.click(roteiro().getByRole('button', { name: /Cachoeira da Toca/ }))
    const dialog = within(screen.getByRole('dialog', { name: 'Editar item do roteiro' }))
    const title = dialog.getByLabelText('Título')
    await userEvent.clear(title)
    await userEvent.type(title, 'Cachoeira da Toca e piscinas')
    await userEvent.click(dialog.getByRole('button', { name: 'Salvar item' }))
    expect(api.updateItinerary).toHaveBeenCalledWith('it-ilh-4', {
      day: '2026-07-14',
      at: null,
      title: 'Cachoeira da Toca e piscinas',
      kind: 'parque',
      note: null,
      listItemId: null,
    })
    expect(dialog.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    expect(dialog.getByLabelText('Título')).toBeDisabled()

    await act(async () => gate.resolve({ status: 'invalid', constraint: 'trip_itinerary_day_in_trip', cause: 'x' }))
    expect(dialog.getByRole('alert')).toHaveTextContent('Não deu pra salvar: esse dia está fora das datas da viagem')
    expect(screen.getByRole('dialog', { name: 'Editar item do roteiro' })).toBeInTheDocument()
    expect(value.reload).not.toHaveBeenCalled()
  })

  it('apagar pede confirmação e apaga pelo id', async () => {
    const api = seededTripsApi({}, { deleteItinerary: vi.fn(async () => okWrite()) })
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />, tripsValue({ api }))
    await userEvent.click(roteiro().getByRole('button', { name: /Almoço no Viana/ }))
    const dialog = within(screen.getByRole('dialog'))
    await userEvent.click(dialog.getByRole('button', { name: 'Apagar' }))
    expect(dialog.getByText('Apagar Almoço no Viana do roteiro?')).toBeInTheDocument()
    await userEvent.click(within(dialog.getByRole('group', { name: 'Apagar item' })).getByRole('button', { name: 'Apagar' }))
    expect(api.deleteItinerary).toHaveBeenCalledWith('it-ilh-5')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('R20 — título do dia', () => {
  it('editar grava; vazio apaga (null)', async () => {
    const api = seededTripsApi({}, { setDayTitle: vi.fn(async () => okWrite()) })
    renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />, tripsValue({ api }))
    await userEvent.click(roteiro().getByRole('button', { name: 'Editar o título do dia 2: Bonete' }))
    const dialog = within(screen.getByRole('dialog', { name: 'Título do dia' }))
    expect(dialog.getByText('Dia 2 · Seg, 13 jul')).toBeInTheDocument()
    const input = dialog.getByLabelText('Título')
    await userEvent.clear(input)
    await userEvent.click(dialog.getByRole('button', { name: 'Salvar' }))
    expect(api.setDayTitle).toHaveBeenCalledWith(COUPLE, TRIP_ILHABELA_ID, '2026-07-13', null)

    await userEvent.click(roteiro().getByRole('button', { name: 'Dar um título ao dia 3' }))
    await userEvent.type(screen.getByLabelText('Título'), 'Cachoeiras{Enter}')
    expect(api.setDayTitle).toHaveBeenLastCalledWith(COUPLE, TRIP_ILHABELA.id, '2026-07-14', 'Cachoeiras')
  })
})
