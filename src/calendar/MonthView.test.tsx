// Critérios A14 e A19 — .agent/Tasks/fase-5-calendario.md, seção 10.
// ADR 0005: comportamento de tela se prova renderizando.
//
// A grade é montada dentro do contexto (`renderInCalendar`), com o setembro de
// `test/fixtures.ts`: separados 3–10, Paraty 11–14, Gabriel em Marau 15–20,
// Lana em SJC 21–30, hoje = sexta, 25 de setembro. Os testes do 💋 que
// dependem da releitura montam a tela inteira.

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { BandColor } from '../domain/settings'
import type { CalendarApi, KissWrite } from './api'
import { CalendarScreen } from './CalendarScreen'
import { MonthView } from './MonthView'
import { GABRIEL, LANA, SEPTEMBER_EVENTS, SEPTEMBER_STAYS, seededCalendarApi } from './test/fixtures'
import { calendarValue, renderInCalendar } from './test/renderInCalendar'

const dayButton = (dayMonth: string) => screen.getByRole('button', { name: new RegExp(`^\\S+, ${dayMonth} ·`) })
const queryDayButton = (dayMonth: string) => screen.queryByRole('button', { name: new RegExp(`^\\S+, ${dayMonth} ·`) })
const weekdays = () => [...document.querySelectorAll('.cal-weekdays span')].map((s) => s.textContent)
const bandVar = (name: string) => screen.getAllByRole('button', { name })[0]!.style.getPropertyValue('--band')
const legend = () => within(screen.getByRole('list', { name: 'Legenda' }))

describe('A14 — a grade do mês', () => {
  it('week_starts_on = "sun" começa em DOM; "mon" começa em SEG', () => {
    const { unmount } = renderInCalendar(<MonthView />, calendarValue())
    expect(weekdays()).toEqual(['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'])
    unmount()
    renderInCalendar(<MonthView />, calendarValue({ settings: { weekStartsOn: 'mon' } }))
    expect(weekdays()).toEqual(['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'])
    // Setembro de 2026 começa numa terça: com a semana na segunda, 31/ago abre a grade.
    expect(document.querySelector('.cal-week')?.getAttribute('data-week-start')).toBe('2026-08-31')
  })

  it('show_adjacent_days: os dias vizinhos aparecem com faixa; desligado, a célula fica vazia e sem faixa', () => {
    const { unmount } = renderInCalendar(<MonthView />, calendarValue())
    expect(dayButton('30 de agosto')).toHaveAccessibleName('Domingo, 30 de agosto · juntos em Marau')
    // A faixa da primeira semana começa no vizinho: "Gabriel em Marau" de 30/ago a 2/set.
    expect(screen.getAllByRole('button', { name: 'Gabriel em Marau' })[0]!.style.gridColumn).toBe('1 / 5')
    unmount()

    renderInCalendar(<MonthView />, calendarValue({ settings: { showAdjacentDays: false } }))
    expect(queryDayButton('30 de agosto')).not.toBeInTheDocument()
    expect(queryDayButton('3 de outubro')).not.toBeInTheDocument()
    expect(document.querySelectorAll('.cal-day--empty')).toHaveLength(2 + 3)
    // A faixa agora vai de 1/set (coluna 3) a 2/set.
    expect(screen.getAllByRole('button', { name: 'Gabriel em Marau' })[0]!.style.gridColumn).toBe('3 / 5')
    expect(screen.queryByRole('button', { name: 'Lisboa' })).not.toBeInTheDocument()
  })

  it('show_day_markers = false esconde o par de avatares e o 💋', () => {
    const { unmount } = renderInCalendar(<MonthView />, calendarValue())
    expect(document.querySelectorAll('.cal-grid .cal-pair').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '💋 20 em 25 de setembro' })).toBeInTheDocument()
    unmount()

    renderInCalendar(<MonthView />, calendarValue({ settings: { showDayMarkers: false } }))
    expect(document.querySelectorAll('.cal-grid .cal-pair')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^💋/ })).not.toBeInTheDocument()
    expect(document.querySelector('.cal-legend-pairs')).toBeNull()
  })

  it('o par de avatares: sobreposto com ♥ juntos, lado a lado separados', () => {
    renderInCalendar(<MonthView />, calendarValue())
    const cellTop = (day: string) => document.querySelectorAll('.cal-day-top')[Number(day)] as HTMLElement
    // Índice na grade que começa em 30/ago: 25/set é o 27º dia (índice 26).
    expect(cellTop('26').querySelector('.cal-pair--together .cal-pair-heart')).not.toBeNull()
    // 5/set (índice 6): separados.
    expect(cellTop('6').querySelector('.cal-pair--apart')).not.toBeNull()
    expect(cellTop('6').querySelector('.cal-pair-heart')).toBeNull()
  })

  it('as faixas usam as cores de couple_settings, uma por trecho, com o rótulo de bandLabel', () => {
    const settings = {
      colorTogetherHome1: '#F4A3B4' as BandColor,
      colorTogetherHome2: '#7FD8C4' as BandColor,
      colorTogetherAway: '#9CCBF2' as BandColor,
      colorApart: '#F6E3A1' as BandColor,
    }
    renderInCalendar(<MonthView />, calendarValue({ settings }))
    expect(bandVar('Separados · SJC e Marau')).toBe('#F6E3A1')
    expect(bandVar('Lana em SJC')).toBe('#F4A3B4')
    expect(bandVar('Lisboa')).toBe('#9CCBF2')
    expect(screen.getAllByRole('button', { name: 'Gabriel em Marau' })[0]!.style.getPropertyValue('--band')).toBe('#7FD8C4')
    // Paraty (11–14) cruza a semana: um rótulo por semana em que continua (I9).
    expect(screen.getAllByRole('button', { name: 'Paraty' })).toHaveLength(2)
    // A legenda também.
    const swatch = legend().getByText('Juntos em SJC').querySelector('.cal-legend-swatch') as HTMLElement
    expect(swatch.style.getPropertyValue('--band')).toBe('#F4A3B4')
  })

  it('dia futuro tem a faixa na mesma cor, com a parte planejada esmaecida', () => {
    renderInCalendar(<MonthView />, calendarValue())
    // Semana 20–26: "Lana em SJC" de 21 a 26; hoje é 25 → 5 dias vividos, 1 planejado.
    const bar = screen.getAllByRole('button', { name: 'Lana em SJC' })[0]!.querySelector('.cal-band-bar') as HTMLElement
    const parts = [...bar.children] as HTMLElement[]
    expect(parts.map((p) => [p.className, p.style.flexGrow])).toEqual([
      ['', '5'],
      ['cal-band-planned', '1'],
    ])
  })

  it('dia unknown não tem faixa nem avatar, e a legenda ganha "Sem registro"', () => {
    const { unmount } = renderInCalendar(<MonthView />, calendarValue())
    expect(legend().queryByText('Sem registro')).not.toBeInTheDocument()
    unmount()

    // A Lana só tem registro a partir de 15/set: de 3 a 14, "sem registro" (e não "separados").
    const stays = SEPTEMBER_STAYS.filter((s) => s.profileId === GABRIEL || s.startsOn >= '2026-09-15')
    renderInCalendar(<MonthView />, calendarValue({ stays }))
    expect(dayButton('5 de setembro')).toHaveAccessibleName('Sábado, 5 de setembro · sem registro')
    const cellTop = document.querySelectorAll('.cal-day-top')[6] as HTMLElement
    expect(cellTop.querySelector('.cal-pair')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Separados/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Paraty' })).not.toBeInTheDocument()
    expect(legend().getByText('Sem registro')).toBeInTheDocument()
  })

  it('evento de vários dias vira chip corrido, com "(cont.)" na semana seguinte', () => {
    renderInCalendar(<MonthView />, calendarValue())
    const first = screen.getByRole('button', { name: 'Paraty · fim de semana' })
    const cont = screen.getByRole('button', { name: 'Paraty · fim de semana (cont.)' })
    expect(first.style.gridColumn).toBe('6 / 8') // sex 11 e sáb 12
    expect(cont.style.gridColumn).toBe('1 / 3') // dom 13 e seg 14
  })

  it('até 2 chips de um dia, dia inteiro primeiro e depois por hora, e "+n"', () => {
    renderInCalendar(<MonthView />, calendarValue())
    const events = document.querySelectorAll('.cal-day-events')
    const today = [...events].find((e) => e.textContent?.includes('Vicentina')) as HTMLElement
    expect([...today.querySelectorAll('.cal-chip')].map((c) => c.textContent)).toEqual(['Ligar pra vó', 'Vicentina'])
    expect(within(today).getByText('+1')).toBeInTheDocument()
  })

  it('o aniversário de namoro aparece e não é botão (vem das Configurações)', () => {
    renderInCalendar(<MonthView />, calendarValue())
    const chip = screen.getByText('2 anos juntos').closest('.cal-chip') as HTMLElement
    expect(chip.tagName).toBe('SPAN')
    expect(chip).toHaveClass('cal-ev--data_especial')
  })

  it('tocar na célula seleciona o dia; na faixa, edita o trecho inteiro; no evento, edita o evento', async () => {
    const value = calendarValue()
    renderInCalendar(<MonthView />, value)
    await userEvent.click(dayButton('10 de setembro'))
    expect(value.selectDay).toHaveBeenCalledWith('2026-09-10')

    // A faixa da semana 20–26 é só um pedaço: o modal recebe o trecho real, 21–30.
    await userEvent.click(screen.getAllByRole('button', { name: 'Lana em SJC' })[0]!)
    expect(value.openEditPeriod).toHaveBeenCalledWith({
      from: '2026-09-21',
      to: '2026-09-30',
      band: 'home1',
      key: 'together:c-sjc',
      cityId: 'c-sjc',
      positions: [
        { profileId: GABRIEL, cityId: 'c-sjc' },
        { profileId: LANA, cityId: 'c-sjc' },
      ],
    })

    await userEvent.click(screen.getByRole('button', { name: 'Cinema' }))
    expect(value.openEditEvent).toHaveBeenCalledWith(SEPTEMBER_EVENTS.find((e) => e.id === 'e-cinema'))
  })

  it('hoje em destaque e selecionado', () => {
    renderInCalendar(<MonthView />, calendarValue())
    const today = dayButton('25 de setembro')
    expect(today).toHaveAccessibleName('Sexta, 25 de setembro · juntos em SJC · hoje')
    expect(today).toHaveAttribute('aria-pressed', 'true')
    expect(today.parentElement).toHaveClass('cal-day--today')
  })
})

describe('A14 — o kicker do mês usa a contagem desenhada', () => {
  it('setembro: 22 dias juntos · 8 separados (planejado incluso, como no frame)', async () => {
    render(<CalendarScreen api={seededCalendarApi()} />)
    expect(await screen.findByText('22 dias juntos · 8 separados')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Setembro 2026')
  })
})

describe('A19 — o 💋', () => {
  it('número quando > 0; +1 ao passar o mouse; dia futuro sem 💋', async () => {
    renderInCalendar(<MonthView />, calendarValue())
    const kiss = screen.getByRole('button', { name: '💋 em 10 de setembro' })
    expect(kiss).not.toHaveTextContent('+1')
    await userEvent.hover(kiss)
    expect(kiss).toHaveTextContent('+1')
    expect(screen.getByRole('button', { name: '💋 3 em 12 de setembro' })).toHaveTextContent('3')
    // 26/set em diante é futuro: sem 💋.
    expect(screen.queryByRole('button', { name: /^💋.* em 26 de setembro$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^💋.* em 30 de setembro$/ })).not.toBeInTheDocument()
  })

  it('💋 não lidos (null): nenhum 💋 — nunca um 0 sem ter lido', () => {
    renderInCalendar(<MonthView />, calendarValue({ kisses: null }))
    expect(screen.queryByRole('button', { name: /^💋/ })).not.toBeInTheDocument()
  })

  it('− desabilitado em zero; + desabilitado em 20', async () => {
    renderInCalendar(<MonthView />, calendarValue())
    await userEvent.click(screen.getByRole('button', { name: '💋 em 10 de setembro' }))
    let stepper = screen.getByRole('group', { name: '💋 em 10 de setembro' })
    expect(within(stepper).getByRole('button', { name: 'Menos um' })).toBeDisabled()
    expect(within(stepper).getByRole('button', { name: 'Mais um' })).toBeEnabled()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(screen.getByRole('button', { name: '💋 20 em 25 de setembro' }))
    stepper = screen.getByRole('group', { name: '💋 em 25 de setembro' })
    expect(within(stepper).getByRole('button', { name: 'Mais um' })).toBeDisabled()
    expect(within(stepper).getByRole('button', { name: 'Menos um' })).toBeEnabled()
  })

  it('+ chama addKiss e o número só muda depois do ok (e da releitura)', async () => {
    const counts = new Map([['2026-09-24', 1]])
    let finish!: (r: KissWrite) => void
    const api = seededCalendarApi(
      {},
      {
        loadKisses: vi.fn<CalendarApi['loadKisses']>(async () => ({ status: 'ok', rows: new Map(counts) })),
        addKiss: vi.fn<CalendarApi['addKiss']>(
          () =>
            new Promise((resolve) => {
              finish = resolve
            }),
        ),
      },
    )
    render(<CalendarScreen api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: '💋 1 em 24 de setembro' }))
    await userEvent.click(within(screen.getByRole('group', { name: '💋 em 24 de setembro' })).getByRole('button', { name: 'Mais um' }))
    expect(api.addKiss).toHaveBeenCalledWith('couple-1', '2026-09-24')

    // Em voo: o número não mudou, e os dois botões esperam.
    const stepper = screen.getByRole('group', { name: '💋 em 24 de setembro' })
    expect(within(stepper).getByRole('status')).toHaveTextContent('1')
    expect(within(stepper).getByRole('button', { name: 'Mais um' })).toBeDisabled()

    counts.set('2026-09-24', 2)
    await act(async () => finish({ status: 'ok' }))
    await waitFor(() => expect(within(stepper).getByRole('status')).toHaveTextContent('2'))
    expect(screen.getByRole('button', { name: '💋 2 em 24 de setembro' })).toBeInTheDocument()
    expect(api.loadContext).toHaveBeenCalledTimes(2)
  })

  it('− chama removeKiss; "nothing_to_remove" relê sem erro', async () => {
    const api = seededCalendarApi({}, { removeKiss: vi.fn<CalendarApi['removeKiss']>(async () => ({ status: 'nothing_to_remove' })) })
    render(<CalendarScreen api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: '💋 1 em 24 de setembro' }))
    await userEvent.click(screen.getByRole('button', { name: 'Menos um' }))
    expect(api.removeKiss).toHaveBeenCalledWith('2026-09-24')
    await waitFor(() => expect(api.loadContext).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('kiss_limit → "Esse dia já está no máximo", e relê', async () => {
    const api = seededCalendarApi({}, { addKiss: vi.fn<CalendarApi['addKiss']>(async () => ({ status: 'kiss_limit' })) })
    render(<CalendarScreen api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: '💋 1 em 24 de setembro' }))
    await userEvent.click(screen.getByRole('button', { name: 'Mais um' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Esse dia já está no máximo')
    expect(api.loadContext).toHaveBeenCalledTimes(2)
  })
})
