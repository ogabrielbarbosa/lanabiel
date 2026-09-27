// Os editores sem frame (spec R20c orçamento, R20d hospedagem) e o dinheiro
// digitado. R27: grava, relê no ok, falha mantém aberto com a causa. ADR 0005.

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { okWrite, seededTripsApi } from '../test/fakeApi'
import { COUPLE, TRIP_GRAMADO_ID, TRIP_LISBOA, TRIP_LISBOA_ID } from '../test/fixtures'
import { renderInTrips, tripsValue } from '../test/renderInTrips'
import { centsText, parseBRL } from './format'
import { TripDetail } from './TripDetail'

describe('dinheiro', () => {
  it.each([
    ['9.800', 980_000],
    ['9800', 980_000],
    ['R$ 9.800,50', 980_050],
    ['42,5', 4_250],
    ['12.5', 1_250],
    ['', null],
  ])('parseBRL(%j) = %j', (text, cents) => {
    expect(parseBRL(text)).toBe(cents)
  })

  it('lixo é NaN, e centsText volta ao texto do campo', () => {
    expect(parseBRL('dez reais')).toBeNaN()
    expect(centsText(980_000)).toBe('9.800')
    expect(centsText(980_050)).toBe('9.800,50')
    expect(centsText(null)).toBe('')
  })
})

describe('R20c — orçamento', () => {
  it('muda uma linha, apaga outra e cria uma nova, depois relê', async () => {
    const api = seededTripsApi(
      {},
      {
        updateBudget: vi.fn(async () => okWrite(TRIP_LISBOA.budget[2])),
        deleteBudget: vi.fn(async () => okWrite()),
        createBudget: vi.fn(async () => okWrite({ id: 'b-new', label: 'Seguro', plannedCents: 50_000, spentCents: 0, position: 4 })),
      },
    )
    const value = tripsValue({ api })
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />, value)
    await userEvent.click(screen.getByRole('button', { name: 'Editar orçamento' }))
    const d = within(screen.getByRole('dialog', { name: 'Orçamento estimado' }))
    expect(d.getByLabelText('Planejado da linha 1')).toHaveValue('9.800')

    const comida = d.getByLabelText('Planejado da linha 3')
    await userEvent.clear(comida)
    await userEvent.type(comida, '2.600')
    await userEvent.click(d.getByRole('button', { name: 'Apagar a linha Passeios' }))
    await userEvent.click(d.getByRole('button', { name: 'Adicionar linha' }))
    await userEvent.type(d.getByLabelText('Rótulo da linha 4'), 'Seguro')
    await userEvent.type(d.getByLabelText('Planejado da linha 4'), '500')
    await userEvent.click(d.getByRole('button', { name: 'Salvar orçamento' }))

    expect(api.deleteBudget).toHaveBeenCalledWith('b-lis-4')
    expect(api.updateBudget).toHaveBeenCalledTimes(1)
    expect(api.updateBudget).toHaveBeenCalledWith('b-lis-3', { label: 'Comida', plannedCents: 260_000, spentCents: 0 })
    expect(api.createBudget).toHaveBeenCalledWith(COUPLE, expect.objectContaining({ id: TRIP_LISBOA_ID }), {
      label: 'Seguro',
      plannedCents: 50_000,
      spentCents: 0,
    })
    expect(value.reload).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('linha sem rótulo é recusada pelo domínio; falha da API mantém aberto', async () => {
    const api = seededTripsApi({}, { createBudget: vi.fn(async () => ({ status: 'invalid' as const, constraint: 'trip_budget_limit', cause: 'x' })) })
    renderInTrips(<TripDetail id={TRIP_GRAMADO_ID} />, tripsValue({ api }))
    await userEvent.click(screen.getByRole('button', { name: 'Editar orçamento' }))
    const d = within(screen.getByRole('dialog'))
    await userEvent.type(d.getByLabelText('Planejado da linha 1'), '100')
    await userEvent.click(d.getByRole('button', { name: 'Salvar orçamento' }))
    expect(d.getByText('Dê um nome à linha.')).toBeInTheDocument()
    expect(api.createBudget).not.toHaveBeenCalled()

    await userEvent.type(d.getByLabelText('Rótulo da linha 1'), 'Passagens')
    await userEvent.click(d.getByRole('button', { name: 'Salvar orçamento' }))
    expect(d.getByRole('alert')).toHaveTextContent('Não deu pra salvar Passagens: o orçamento já tem 12 linhas')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})

describe('R20d — hospedagem', () => {
  it('tocar no cartão abre os campos preenchidos e salvar grava a hospedagem inteira', async () => {
    const api = seededTripsApi({}, { updateTrip: vi.fn(async () => okWrite()) })
    const value = tripsValue({ api })
    renderInTrips(<TripDetail id={TRIP_LISBOA_ID} />, value)
    await userEvent.click(screen.getByRole('button', { name: 'Editar hospedagem: Casa do Largo' }))
    const d = within(screen.getByRole('dialog', { name: 'Hospedagem' }))
    expect(d.getByLabelText('Check-in')).toHaveValue('2026-10-01T15:00')
    expect(d.getByLabelText('Valor')).toHaveValue('3.200')
    await userEvent.click(d.getByRole('switch', { name: 'Pago' }))
    await userEvent.click(d.getByRole('button', { name: 'Salvar hospedagem' }))
    expect(api.updateTrip).toHaveBeenCalledWith(TRIP_LISBOA_ID, { lodging: { ...TRIP_LISBOA.lodging, paid: true } })
    expect(value.reload).toHaveBeenCalled()
  })

  it('link sem http(s) é recusado pelo domínio', async () => {
    const api = seededTripsApi()
    renderInTrips(<TripDetail id={TRIP_GRAMADO_ID} />, tripsValue({ api }))
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar hospedagem' }))
    const d = within(screen.getByRole('dialog', { name: 'Hospedagem' }))
    await userEvent.type(d.getByLabelText('Nome'), 'Pousada da Serra')
    await userEvent.type(d.getByLabelText('Link da reserva'), 'pousada.com.br')
    await userEvent.click(d.getByRole('button', { name: 'Salvar hospedagem' }))
    expect(d.getByText('O link precisa começar com http:// ou https://.')).toBeInTheDocument()
    expect(api.updateTrip).not.toHaveBeenCalled()
  })
})
