// Critério A15 — .agent/Tasks/fase-5-calendario.md, seção 10 (R10, R11, I5).
// ADR 0005: comportamento de tela se prova renderizando.
//
// O setembro de `test/fixtures.ts`, hoje = 25/09/2026. Vivido em 2026 até hoje:
// Marau 30/ago–2/set (4) + Paraty 11–14 (4) + Marau 15–20 (6) + SJC 21–25 (5)
// = 19 dias juntos, em 268 dias decorridos → 7%. O DESENHADO do ano daria 29
// (SJC até 30/set e Lisboa 1–5/out): o kicker não pode mostrar esse.

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { BandColor } from '../domain/settings'
import { CalendarScreen } from './CalendarScreen'
import { CITY_PARATY, GABRIEL, LANA, SEPTEMBER_STAYS, seededCalendarApi } from './test/fixtures'
import { MARAU, SJC } from '../settings/test/fixtures'
import { calendarValue, renderInCalendar } from './test/renderInCalendar'
import { YearView } from './YearView'

const row = (month: string) => screen.getByRole('button', { name: new RegExp(`^${month}:`) })
const bars = (month: string) => [...row(month).querySelectorAll<HTMLElement>('.cal-year-bar')]
const kicker = () => document.querySelector('.cal-kicker')?.textContent

describe('A15 — a visão Ano', () => {
  it('calendar_default_view = "year" abre no ano, com o kicker VIVIDO (countStates) e o percentual', async () => {
    render(<CalendarScreen api={seededCalendarApi({ settings: { calendarDefaultView: 'year' } })} />)
    expect(await screen.findByRole('region', { name: 'Ano' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2026')
    expect(kicker()).toBe('19 dias juntos · 7% do ano até agora')
  })

  it('ano passado: "% do ano"; ano futuro: dias juntos PLANEJADOS (contagem desenhada)', async () => {
    // As casas em aberto param no fim de 2026; em 2027 os dois vão a Paraty de 1 a 10/jan.
    const stays = [
      ...SEPTEMBER_STAYS.filter((s) => s.endsOn !== null),
      { id: 'g8', profileId: GABRIEL, cityId: SJC.id, startsOn: '2026-10-06', endsOn: '2026-12-31' },
      { id: 'l6', profileId: LANA, cityId: MARAU.id, startsOn: '2026-10-06', endsOn: '2026-12-31' },
      { id: 'g9', profileId: GABRIEL, cityId: CITY_PARATY.id, startsOn: '2027-01-01', endsOn: '2027-01-10' },
      { id: 'l9', profileId: LANA, cityId: CITY_PARATY.id, startsOn: '2027-01-01', endsOn: '2027-01-10' },
    ]
    render(<CalendarScreen api={seededCalendarApi({ stays, settings: { calendarDefaultView: 'year' } })} />)
    await screen.findByRole('region', { name: 'Ano' })

    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2025')
    expect(kicker()).toBe('0 dias juntos · 0% do ano')

    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('2027')
    expect(kicker()).toBe('10 dias juntos planejados')
  })

  it('uma linha por mês; cada trecho é uma barra na cor do casal; unknown fica vazio', () => {
    const settings = {
      colorTogetherHome1: '#F4A3B4' as BandColor,
      colorTogetherHome2: '#7FD8C4' as BandColor,
      colorTogetherAway: '#9CCBF2' as BandColor,
      colorApart: '#F6E3A1' as BandColor,
    }
    renderInCalendar(<YearView />, calendarValue({ settings }, { view: 'year' }))
    expect(within(screen.getByRole('region', { name: 'Ano' })).getAllByRole('button', { name: /dias? juntos$/ })).toHaveLength(12)

    // Janeiro a julho: ninguém tem estadia → nenhuma barra.
    expect(bars('Janeiro')).toHaveLength(0)
    expect(bars('Julho')).toHaveLength(0)

    // Setembro: Marau 1–2 · separados 3–10 · Paraty 11–14 · Marau 15–20 · SJC 21–30.
    const sep = bars('Setembro')
    expect(sep.map((b) => b.dataset.band)).toEqual(['home2', 'apart', 'away', 'home2', 'home1'])
    expect(sep.map((b) => b.style.gridColumn)).toEqual(['1 / 3', '3 / 11', '11 / 15', '15 / 21', '21 / 31'])
    expect(sep.map((b) => b.style.getPropertyValue('--band'))).toEqual(['#7FD8C4', '#F6E3A1', '#9CCBF2', '#7FD8C4', '#F4A3B4'])
    expect(sep.map((b) => b.title)).toEqual(['Gabriel em Marau', 'Separados · SJC e Marau', 'Paraty', 'Gabriel em Marau', 'Lana em SJC'])
  })

  it('o futuro é planejado (esmaecido), e hoje tem o anel', () => {
    renderInCalendar(<YearView />, calendarValue({}, { view: 'year' }))
    const sjc = bars('Setembro')[4]!
    // 21–25 vivido, 26–30 planejado.
    const [past, planned] = [...sjc.children] as HTMLElement[]
    expect(past).not.toHaveClass('cal-band-planned')
    expect(past.style.flexGrow).toBe('5')
    expect(planned).toHaveClass('cal-band-planned')
    expect(planned.style.flexGrow).toBe('5')
    // Outubro inteiro é futuro.
    for (const bar of bars('Outubro')) expect(bar.querySelectorAll(':scope > span:not(.cal-band-planned)')).toHaveLength(0)

    const rings = document.querySelectorAll<HTMLElement>('.cal-year-today')
    expect(rings).toHaveLength(1)
    expect(row('Setembro')).toContainElement(rings[0]!)
    expect(rings[0]!.style.gridColumn).toBe('25')
  })

  it('a coluna JUNTOS conta o desenhado por mês, esmaecida nos meses futuros', () => {
    renderInCalendar(<YearView />, calendarValue({}, { view: 'year' }))
    expect(row('Agosto')).toHaveAccessibleName('Agosto: 2 dias juntos')
    // 22 = Marau 8 + Paraty 4 + SJC 10, com 26–30 planejados: o mesmo número do kicker do mês.
    expect(row('Setembro')).toHaveAccessibleName('Setembro: 22 dias juntos')
    expect(row('Outubro')).toHaveAccessibleName('Outubro: 5 dias juntos')
    expect(row('Janeiro')).toHaveAccessibleName('Janeiro: 0 dias juntos')

    const total = (month: string) => row(month).querySelector('.cal-year-total') as HTMLElement
    expect(total('Setembro')).toHaveTextContent('22 d')
    expect(total('Setembro')).not.toHaveClass('cal-year-total--future')
    expect(total('Outubro')).toHaveClass('cal-year-total--future')
    expect(total('Agosto')).not.toHaveClass('cal-year-total--future')
  })

  it('tocar numa linha abre aquele mês na visão Mês', async () => {
    const value = calendarValue({}, { view: 'year' })
    renderInCalendar(<YearView />, value)
    await userEvent.click(row('Março'))
    expect(value.setVisibleMonth).toHaveBeenCalledWith({ year: 2026, month: 3 })
    expect(value.setView).toHaveBeenCalledWith('month')
  })

  it('na tela inteira: tocar em Outubro mostra a grade de Outubro 2026', async () => {
    render(<CalendarScreen api={seededCalendarApi({ settings: { calendarDefaultView: 'year' } })} />)
    await screen.findByRole('region', { name: 'Ano' })
    await userEvent.click(row('Outubro'))
    expect(await screen.findByRole('group', { name: 'Dias do mês' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Outubro 2026')
    expect(screen.getByRole('button', { name: 'Mês' })).toHaveAttribute('aria-pressed', 'true')
  })
})
