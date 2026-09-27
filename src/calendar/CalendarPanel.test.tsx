// Critério A16 — .agent/Tasks/fase-5-calendario.md, seção 10 (R12, I9, I10, I11).
// ADR 0005: comportamento de tela se prova renderizando.
//
// O setembro de `test/fixtures.ts`: separados 3–10, Paraty 11–14, Gabriel em
// Marau 15–20, Lana em SJC 21–30, Lisboa 1–5/out, e cada um em casa, em
// aberto, a partir de 6/out. Hoje = sexta, 25 de setembro.

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CalendarPanel } from './CalendarPanel'
import { CalendarScreen } from './CalendarScreen'
import { SEPTEMBER_EVENTS, TODAY, seededCalendarApi } from './test/fixtures'
import { calendarValue, renderInCalendar } from './test/renderInCalendar'

const card = (name: string | RegExp) => within(screen.getByRole('region', { name }))
const countdowns = () =>
  within(screen.getByRole('list', { name: 'Contadores' }))
    .getAllByRole('listitem')
    .map((li) => li.textContent)

describe('A16 — Agora', () => {
  it('visitando: o título com a cidade curta, quem visita, "dia k de N" e os dois contadores', async () => {
    const value = calendarValue()
    renderInCalendar(<CalendarPanel />, value)
    const now = card('Agora')
    expect(now.getByText('Juntos em SJC há 4 dias')).toBeInTheDocument()
    expect(now.getByText('Lana está visitando desde 21 set')).toBeInTheDocument()
    expect(now.getByRole('progressbar', { name: 'Andamento do período' })).toHaveAttribute('aria-valuenow', '5')
    expect(now.getByText('dia 5 de 10')).toBeInTheDocument()
    expect(now.getByText('21 set')).toBeInTheDocument()
    expect(now.getByText('30 set')).toBeInTheDocument()
    // Lisboa começa em 1/out; a Lana volta pra Marau em 6/out.
    expect(countdowns()).toEqual(['Lisboa começa em6 dias', 'Lana volta pra casa em11 dias'])

    await userEvent.click(now.getByRole('button', { name: 'Ver período' }))
    expect(value.openEditPeriod).toHaveBeenCalledWith(expect.objectContaining({ from: '2026-09-21', to: '2026-09-30', band: 'home1' }))
  })

  it('separados: "Separados há n dias", onde cada um está, e "Juntos de novo em"', () => {
    renderInCalendar(<CalendarPanel />, calendarValue({ today: '2026-09-05' }))
    const now = card('Agora')
    expect(now.getByText('Separados há 2 dias')).toBeInTheDocument()
    expect(now.getByText('Gabriel em SJC · Lana em Marau')).toBeInTheDocument()
    expect(now.getByText('dia 3 de 8')).toBeInTheDocument()
    expect(countdowns()).toEqual(['Paraty começa em6 dias', 'Juntos de novo em6 dias'])
  })

  it('viajando juntos: "Em {cidade curta} desde" e "Voltam pra casa em"', () => {
    renderInCalendar(<CalendarPanel />, calendarValue({ today: '2026-10-02' }))
    const now = card('Agora')
    expect(now.getByText('Viajando juntos há 1 dia')).toBeInTheDocument()
    expect(now.getByText('Em Lisboa desde 1 out')).toBeInTheDocument()
    expect(countdowns()).toEqual(['Voltam pra casa em4 dias'])
  })

  it('trecho em aberto: sem barra de progresso, e um contador sem resposta não aparece', () => {
    renderInCalendar(<CalendarPanel />, calendarValue({ today: '2026-10-10' }))
    const now = card('Agora')
    expect(now.getByText('Separados há 4 dias')).toBeInTheDocument()
    expect(now.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Contadores' })).not.toBeInTheDocument()
  })

  it('unknown: "Sem registro…" com Criar período em hoje, sem barra, sem contadores, sem Ver período', async () => {
    const value = calendarValue({ today: '2026-07-01' })
    renderInCalendar(<CalendarPanel />, value)
    const now = card('Agora')
    expect(now.getByText('Sem registro de onde vocês estão hoje')).toBeInTheDocument()
    expect(now.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Contadores' })).not.toBeInTheDocument()
    expect(now.queryByRole('button', { name: 'Ver período' })).not.toBeInTheDocument()
    await userEvent.click(now.getByRole('button', { name: 'Criar período' }))
    expect(value.openNewPeriod).toHaveBeenCalledWith('2026-07-01')
  })
})

describe('A16 — o dia selecionado', () => {
  it('hoje: uma linha por pessoa com a cidade inteira e o status; os eventos do dia; sem "Hoje"', async () => {
    const value = calendarValue()
    renderInCalendar(<CalendarPanel />, value)
    const day = card('Sexta, 25 set')
    expect(day.queryByRole('button', { name: 'Hoje' })).not.toBeInTheDocument()
    const people = within(day.getByRole('list', { name: 'Onde cada um está' })).getAllByRole('listitem')
    expect(people.map((p) => p.textContent)).toEqual([
      'GGabrielSão José dos Camposem casa',
      'LLanaSão José dos Camposvisitando · dia 5',
    ])

    expect(day.getByText('Eventos do dia · 4')).toBeInTheDocument()
    const events = within(day.getByRole('list', { name: 'Eventos do dia' }))
    // A visita que cobre o dia (começou em 21) primeiro; depois dia inteiro e
    // por hora; subtítulo de eventSubtitle (I11).
    expect(events.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Lana chegaSão José dos Campos, SP · 10 diasdia inteiro',
      'Ligar pra vóLembretedia inteiro',
      'VicentinaDate · da nossa lista16:00',
      'Jantar 20hDate20:00',
    ])
    await userEvent.click(events.getByRole('button', { name: /^Vicentina/ }))
    expect(value.openEditEvent).toHaveBeenCalledWith(SEPTEMBER_EVENTS.find((e) => e.id === 'e-vicentina'))

    await userEvent.click(day.getByRole('button', { name: 'Adicionar evento' }))
    expect(value.openNewEvent).toHaveBeenCalledWith(TODAY)
  })

  it('outro dia: viajando · dia k, o evento de vários dias que cobre o dia, e "Hoje" volta', async () => {
    const value = calendarValue({}, { selectedDay: '2026-09-12' })
    renderInCalendar(<CalendarPanel />, value)
    const day = card('Sábado, 12 set')
    const people = within(day.getByRole('list', { name: 'Onde cada um está' })).getAllByRole('listitem')
    expect(people.map((p) => p.textContent)).toEqual(['GGabrielParatyviajando · dia 2', 'LLanaParatyviajando · dia 2'])
    expect(day.getByText('Eventos do dia · 2')).toBeInTheDocument()
    expect(day.getByRole('button', { name: /^Paraty · fim de semana/ })).toHaveTextContent('Paraty, RJ · 4 dias')

    await userEvent.click(day.getByRole('button', { name: 'Adicionar evento' }))
    expect(value.openNewEvent).toHaveBeenCalledWith('2026-09-12')
    await userEvent.click(day.getByRole('button', { name: 'Hoje' }))
    expect(value.selectDay).toHaveBeenCalledWith(TODAY)
  })

  it('um dia sem registro: "sem registro" e nenhuma cidade', () => {
    renderInCalendar(<CalendarPanel />, calendarValue({}, { selectedDay: '2026-07-10' }))
    const people = within(card('Sexta, 10 jul').getByRole('list', { name: 'Onde cada um está' })).getAllByRole('listitem')
    expect(people.map((p) => p.textContent)).toEqual(['GGabrielsem registro', 'LLanasem registro'])
    expect(screen.getByText('Eventos do dia · 0')).toBeInTheDocument()
  })

  it('na tela inteira: tocar num dia troca o bloco, e "Hoje" do painel volta', async () => {
    render(<CalendarScreen api={seededCalendarApi()} />)
    await screen.findByRole('group', { name: 'Dias do mês' })
    await userEvent.click(screen.getByRole('button', { name: /^Sábado, 12 de setembro ·/ }))
    const panel = within(screen.getByRole('complementary', { name: 'Onde a gente está' }))
    expect(panel.getByRole('region', { name: 'Sábado, 12 set' })).toBeInTheDocument()
    await userEvent.click(panel.getByRole('button', { name: 'Hoje' }))
    expect(panel.getByRole('region', { name: 'Sexta, 25 set' })).toBeInTheDocument()
    expect(panel.queryByRole('region', { name: 'Sábado, 12 set' })).not.toBeInTheDocument()
  })
})

describe('A16 — próximos eventos', () => {
  it('os próximos 6 a partir de hoje, com o selo de data', () => {
    renderInCalendar(<CalendarPanel />, calendarValue())
    const list = within(card('Próximos eventos').getByRole('list', { name: 'Próximos eventos' }))
    const items = list.getAllByRole('listitem')
    expect(items).toHaveLength(6)
    expect(items.map((li) => li.querySelector('.cal-event-title')?.textContent)).toEqual([
      'Ligar pra vó',
      'Vicentina',
      'Jantar 20h',
      'Cinema',
      'Check-in',
      'Malas',
    ])
    expect(items[3]!.querySelector('.cal-event-date')).toHaveTextContent('26SET')
    expect(screen.queryByRole('button', { name: 'Ver todos' })).not.toBeInTheDocument()
  })

  it('inclui o aniversário de namoro derivado (I7), sem ser botão', () => {
    const events = SEPTEMBER_EVENTS.filter((e) => e.id === 'e-cinema' || e.id === 'e-lisboa')
    renderInCalendar(<CalendarPanel />, calendarValue({ events }))
    const items = within(card('Próximos eventos').getByRole('list', { name: 'Próximos eventos' })).getAllByRole('listitem')
    // started_on = 17/09/2024: o próximo é 17/09/2027, dentro da janela de um ano.
    expect(items.map((li) => li.textContent)).toEqual([
      'CinemaDate26SET',
      'Lisboa, PortugalLisboa, Portugal · 5 dias1OUT',
      '3 anos juntosData especial17SET',
    ])
    expect(within(items[2]!).queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('A16 — resumo do mês visível', () => {
  it('setembro: juntos e separados desenhados, e uma linha por estado, sem "Sem registro"', async () => {
    const value = calendarValue()
    renderInCalendar(<CalendarPanel />, value)
    const summary = card('Resumo de setembro')
    expect(summary.getByText('22').nextSibling).toHaveTextContent('dias juntos')
    expect(summary.getAllByText('8')[0]!.nextSibling).toHaveTextContent('dias separados')
    expect(
      within(summary.getByRole('list', { name: 'Dias de setembro' }))
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Em SJC10 dias', 'Em Marau8 dias', 'Viajando4 dias', 'Separados8 dias'])

    await userEvent.click(summary.getByRole('button', { name: 'Ano' }))
    expect(value.setView).toHaveBeenCalledWith('year')
  })

  it('um mês com dias sem registro ganha "Sem registro · n dias"', () => {
    renderInCalendar(<CalendarPanel />, calendarValue({}, { visibleMonth: { year: 2026, month: 7 } }))
    const lines = within(card('Resumo de julho').getByRole('list', { name: 'Dias de julho' })).getAllByRole('listitem')
    expect(lines.map((li) => li.textContent)).toEqual(['Em SJC0 dias', 'Em Marau0 dias', 'Viajando0 dias', 'Separados0 dias', 'Sem registro31 dias'])
  })

  it('na visão Ano, o atalho "Ano" some', () => {
    renderInCalendar(<CalendarPanel />, calendarValue({}, { view: 'year' }))
    expect(card('Resumo de setembro').queryByRole('button', { name: 'Ano' })).not.toBeInTheDocument()
  })
})
