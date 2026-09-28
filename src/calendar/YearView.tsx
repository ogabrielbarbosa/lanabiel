// A visão Ano (`XEnYP`, área `lSxDz`): uma linha por mês, com os trechos do
// mês como barras, o anel em hoje e a coluna _JUNTOS_.
//
// Spec: .agent/Tasks/fase-5-calendario.md — R10, R11, I4, I5
//
// Cada linha é uma grade de 31 colunas (um dia por coluna), então fevereiro
// termina antes dos outros, como no frame. As barras saem de `runs` do mês —
// a mesma derivação das faixas do Mês (I4) —, na cor de `couple_settings`
// (`--band` inline). O trecho `unknown` não vira barra: fica o vazio.
//
// A coluna _JUNTOS_ é a contagem DESENHADA (`countDrawn`, I5), esmaecida nos
// meses que ainda não começaram. O kicker do ano (vivido) é do cabeçalho, na
// `CalendarScreen`.
//
// Os ícones de evento dentro das barras do frame NÃO são renderizados (seção 14).

import type { CSSProperties } from 'react'
import { bandLabel, countDrawn, runs } from '../domain/calendar'
import type { Band } from '../domain/calendar'
import { dayOfMonth, daysInclusive, isoOf } from '../lib/date'
import { useCalendar } from './context'
import { CalendarLegend } from './MonthView'
import { bandColor, daysWord, monthBounds, monthName, monthOf } from './view'

const SCALE = [1, 5, 10, 15, 20, 25, 31]

export function YearView() {
  const c = useCalendar()
  const { settings, today } = c
  const year = c.visibleMonth.year
  const current = monthOf(today)
  const hasUnknown = countDrawn(isoOf(year, 1, 1), isoOf(year, 12, 31), c.stays, c.members).unknown > 0

  function open(month: number) {
    c.setVisibleMonth({ year, month })
    c.setView('month')
  }

  return (
    <section className="cal-year" aria-label="Ano">
      <div className="cal-year-grid lg">
        <div className="cal-year-scale" aria-hidden="true">
          <span />
          <span className="cal-year-days">
            {SCALE.map((d) => (
              <span key={d} style={{ gridColumn: d }}>
                {d}
              </span>
            ))}
          </span>
          <span className="cal-year-total-head">JUNTOS</span>
        </div>

        {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
          const bounds = monthBounds({ year, month })
          const counts = countDrawn(bounds.from, bounds.to, c.stays, c.members)
          const together = counts.home1 + counts.home2 + counts.away
          const future = bounds.from > today
          const isCurrent = current.year === year && current.month === month
          const bars = runs(c.stays, c.members, bounds.from, bounds.to).filter(
            (r): r is typeof r & { band: Exclude<Band, 'unknown'> } => r.band !== 'unknown',
          )
          return (
            <button
              key={month}
              type="button"
              className={`cal-year-row ${isCurrent ? 'cal-year-row--current' : ''}`}
              aria-label={`${monthName(month)}: ${daysWord(together)} juntos`}
              onClick={() => open(month)}
            >
              <span className="cal-year-month" aria-hidden="true">
                {monthName(month).slice(0, 3)}
              </span>
              <span className="cal-year-days" aria-hidden="true">
                {bars.map((r) => {
                  const to = r.to as string
                  const past = r.from > today ? 0 : daysInclusive(r.from, to < today ? to : today)
                  const planned = daysInclusive(r.from, to) - past
                  return (
                    <span
                      key={r.from}
                      className="cal-year-bar"
                      data-band={r.band}
                      title={bandLabel(r, c.names, c.cities, c.members)}
                      style={
                        {
                          gridColumn: `${dayOfMonth(r.from)} / ${dayOfMonth(to) + 1}`,
                          '--band': bandColor(settings, r.band),
                        } as CSSProperties
                      }
                    >
                      {past > 0 && <span style={{ flexGrow: past }} />}
                      {planned > 0 && <span className="cal-band-planned" style={{ flexGrow: planned }} />}
                    </span>
                  )
                })}
                {isCurrent && <span className="cal-year-today" style={{ gridColumn: dayOfMonth(today) }} />}
              </span>
              <span className={`cal-year-total ${future ? 'cal-year-total--future' : ''}`} aria-hidden="true">
                {together}
                <small> d</small>
              </span>
            </button>
          )
        })}
      </div>

      <CalendarLegend hasUnknown={hasUnknown} />
    </section>
  )
}
