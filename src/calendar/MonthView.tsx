// A visão Mês (`D1Zny4`, área `oLicQ`): a grade de semanas, as faixas de
// estado, os chips de evento, o par de avatares, o 💋 e a legenda.
//
// Spec: .agent/Tasks/fase-5-calendario.md — R4–R8, I1, I4, I5, I9
//
// Cada semana é uma grade CSS de 7 colunas com linhas fixas:
//   1. topo (número, par de avatares)
//   2…k+1. um chip corrido por evento de vários dias
//   k+2. os chips de um dia (até 2 + "+n")
//   k+3. o 💋
//   k+4. as faixas
// O fundo de cada célula ocupa todas as linhas da coluna e carrega o botão do
// dia; o resto fica por cima (`pointer-events` só nos próprios botões).
//
// Nada aqui grava estado do casal: faixa, rótulo e avatar saem de
// `coupleStateOn` / `runs` sobre as estadias (I1, ADR 0002).

import type { CSSProperties } from 'react'
import { coupleStateOn } from '../domain/coupleState'
import {
  bandLabel,
  bandOf,
  countDrawn,
  monthWeeks,
  occurrences,
  runAround,
  runs,
  shortCityName,
} from '../domain/calendar'
import type { Band, Occurrence } from '../domain/calendar'
import { dayOfMonth, daysInclusive, weekdayDayMonthLabel } from '../lib/date'
import { useCalendar } from './context'
import type { CalendarContextValue, YearMonth } from './context'
import { KissCounter } from './KissCounter'
import { CouplePair } from './parts'
import { EVENT_ICONS, bandColor, monthBounds } from './view'

const WEEKDAYS_SUN = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']

function weekdayHeads(weekStartsOn: 'sun' | 'mon'): string[] {
  return weekStartsOn === 'mon' ? [...WEEKDAYS_SUN.slice(1), WEEKDAYS_SUN[0]] : WEEKDAYS_SUN
}

/** "Sexta, 25 de setembro" → "25 de setembro". */
const dayMonthOf = (day: string): string => weekdayDayMonthLabel(day).split(', ')[1] ?? day

/** Dia inteiro (e o aniversário) primeiro, depois por hora (R7). */
function compareSingles(a: Occurrence, b: Occurrence): number {
  const ta = a.event === null || a.event.allDay || a.event.startsAt === null ? '' : a.event.startsAt
  const tb = b.event === null || b.event.allDay || b.event.startsAt === null ? '' : b.event.startsAt
  return ta.localeCompare(tb)
}

/** Cor do chip por tipo; o aniversário derivado usa a de Data especial (R21). */
function chipClass(o: Occurrence): string {
  return `cal-chip cal-ev--${o.event?.kind ?? 'data_especial'}`
}

function EventChip({ o, label, style, className = '' }: { o: Occurrence; label: string; style?: CSSProperties; className?: string }) {
  const { openEditEvent } = useCalendar()
  const Icon = EVENT_ICONS[o.event?.kind ?? 'data_especial']
  const content = (
    <>
      <Icon size={11} aria-hidden="true" />
      <span className="cal-chip-label">{label}</span>
    </>
  )
  const event = o.event
  // O aniversário não se edita ali (vem das Configurações, R21): não é botão.
  if (event === null) {
    return (
      <span className={`${chipClass(o)} ${className}`} style={style}>
        {content}
      </span>
    )
  }
  return (
    <button type="button" className={`${chipClass(o)} ${className}`} style={style} onClick={() => openEditEvent(event)}>
      {content}
    </button>
  )
}

/** Como o dia é lido por leitor de tela: "Sexta, 25 de setembro · juntos em SJC · hoje". */
function dayStateText(c: CalendarContextValue, day: string): { text: string; together: boolean | null } {
  const state = coupleStateOn(day, c.stays, [c.members[1], c.members[2]])
  if (state.kind === 'unknown') return { text: 'sem registro', together: null }
  if (state.kind === 'apart') return { text: 'separados', together: false }
  const city = shortCityName(c.cities.get(state.cityId)?.name ?? '?')
  return {
    text: bandOf(state, c.members) === 'away' ? `viajando juntos em ${city}` : `juntos em ${city}`,
    together: true,
  }
}

function Week({ c, days, occs, inMonth }: { c: CalendarContextValue; days: string[]; occs: Occurrence[]; inMonth: (day: string) => boolean }) {
  const { settings, today } = c
  const visible = days.map((d) => settings.showAdjacentDays || inMonth(d))
  const visFrom = days[visible.indexOf(true)]
  const visTo = days[visible.lastIndexOf(true)]
  const col = (day: string) => days.indexOf(day) + 1

  const multi = occs
    .filter((o) => o.endDay > o.day && o.day <= visTo && o.endDay >= visFrom)
    .map((o) => {
      const from = o.day > visFrom ? o.day : visFrom
      const to = o.endDay < visTo ? o.endDay : visTo
      return { o, from, to, cont: o.day < from, contAfter: o.endDay > to }
    })
  const lanes = multi.length
  const rowSingles = lanes + 2
  const rowKiss = lanes + 3
  const rowBand = lanes + 4

  const bands = runs(c.stays, c.members, visFrom, visTo).filter(
    (r): r is typeof r & { band: Exclude<Band, 'unknown'> } => r.band !== 'unknown',
  )

  const style = { gridTemplateRows: `auto ${'auto '.repeat(lanes)}1fr auto auto` } as CSSProperties
  const people = [c.people[1], c.people[2]]

  return (
    <div className="cal-week" style={style} data-week-start={days[0]}>
      {days.map((day, i) => {
        const gridColumn = i + 1
        if (!visible[i]) {
          return <div key={day} className="cal-day cal-day--empty" style={{ gridColumn, gridRow: '1 / -1' }} aria-hidden="true" />
        }
        const state = dayStateText(c, day)
        const isToday = day === today
        // Dia que já passou: o topo e os eventos apagados (o frame, 0.5 e 0.55).
        const past = day < today ? 'is-past' : ''
        const selected = day === c.selectedDay
        const singles = occs.filter((o) => o.day === day && o.endDay === day).sort(compareSingles)
        const kisses = c.kisses === null || !settings.showDayMarkers || day > today ? null : (c.kisses.get(day) ?? 0)
        const cls = [
          'cal-day',
          inMonth(day) ? '' : 'cal-day--adjacent',
          isToday ? 'cal-day--today' : '',
          selected ? 'cal-day--selected' : '',
        ].join(' ')
        return [
          <div key={`bg-${day}`} className={cls} style={{ gridColumn, gridRow: '1 / -1' }}>
            <button
              type="button"
              className="cal-day-hit"
              aria-label={`${weekdayDayMonthLabel(day)} · ${state.text}${isToday ? ' · hoje' : ''}`}
              aria-pressed={selected}
              onClick={() => c.selectDay(day)}
            />
          </div>,
          <div
            key={`top-${day}`}
            className={`cal-day-top ${inMonth(day) ? '' : 'cal-day--adjacent'} ${past}`}
            style={{ gridColumn, gridRow: 1 }}
          >
            <span className={`cal-day-number ${isToday ? 'cal-day-number--today' : ''}`} aria-hidden="true">
              {dayOfMonth(day)}
            </span>
            {settings.showDayMarkers && state.together !== null && (
              <CouplePair people={people} together={state.together} />
            )}
          </div>,
          singles.length > 0 && (
            <div key={`ev-${day}`} className={`cal-day-events ${past}`} style={{ gridColumn, gridRow: rowSingles }}>
              {singles.slice(0, 2).map((o) => (
                <EventChip key={`${o.event?.id ?? 'anniversary'}-${o.day}`} o={o} label={o.title} />
              ))}
              {singles.length > 2 && <span className="cal-more">+{singles.length - 2}</span>}
            </div>
          ),
          kisses !== null && (
            <div key={`kiss-${day}`} className="cal-day-kiss" style={{ gridColumn, gridRow: rowKiss }}>
              <KissCounter day={day} count={kisses} dayLabel={dayMonthOf(day)} />
            </div>
          ),
        ]
      })}

      {multi.map(({ o, from, to, cont, contAfter }, lane) => (
        <EventChip
          key={`multi-${o.event?.id ?? 'anniversary'}-${o.day}`}
          o={o}
          label={`${o.title}${cont ? ' (cont.)' : ''}`}
          className={[
            'cal-chip--span',
            cont ? 'cal-chip--cont-start' : '',
            contAfter ? 'cal-chip--cont-end' : '',
            to < today ? 'is-past' : '',
          ].join(' ')}
          style={{ gridColumn: `${col(from)} / ${col(to) + 1}`, gridRow: lane + 2, zIndex: 1 }}
        />
      ))}

      {bands.map((r) => {
        const to = r.to as string
        const label = bandLabel(r, c.names, c.cities, c.members)
        const past = r.from > today ? 0 : daysInclusive(r.from, to < today ? to : today)
        const future = daysInclusive(r.from, to) - past
        // Onde o trecho continua na semana vizinha, a faixa sai reta (o frame).
        const whole = runAround(r.from, c.stays, c.members)
        const edges = [
          whole.from < r.from ? 'cal-band--cont-start' : '',
          whole.to === null || whole.to > to ? 'cal-band--cont-end' : '',
        ].join(' ')
        return (
          <button
            key={`band-${r.from}`}
            type="button"
            className={`cal-band cal-band--${r.band} ${edges}`}
            style={{ gridColumn: `${col(r.from)} / ${col(to) + 1}`, gridRow: rowBand, '--band': bandColor(settings, r.band) } as CSSProperties}
            aria-label={label}
            onClick={() => c.openEditPeriod(runAround(r.from, c.stays, c.members))}
          >
            <span className="cal-band-label" aria-hidden="true">
              {label}
            </span>
            <span className="cal-band-bar" data-band={r.band} aria-hidden="true">
              {past > 0 && <span style={{ flexGrow: past }} />}
              {future > 0 && <span className="cal-band-planned" style={{ flexGrow: future }} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function MonthView() {
  const c = useCalendar()
  const { settings } = c
  const weeks = monthWeeks(c.visibleMonth.year, c.visibleMonth.month, settings.weekStartsOn)
  const month = monthBounds(c.visibleMonth)
  const inMonth = (day: string) => month.from <= day && day <= month.to
  const occs = occurrences(c.events, { startedOn: c.startedOn }, weeks[0][0], weeks[weeks.length - 1][6])
  const hasUnknown = countDrawn(month.from, month.to, c.stays, c.members).unknown > 0

  return (
    <div className="cal-month">
      <div className="cal-grid" role="group" aria-label="Dias do mês">
        <div className="cal-weekdays" aria-hidden="true">
          {weekdayHeads(settings.weekStartsOn).map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        {weeks.map((days) => (
          <Week key={days[0]} c={c} days={days} occs={occs} inMonth={inMonth} />
        ))}
      </div>

      <CalendarLegend hasUnknown={hasUnknown} />
    </div>
  )
}

/**
 * A legenda (R8): os estados com a cor do casal, _Sem registro_ quando a janela
 * tem algum dia `unknown`, e a dica dos avatares. Usada pelo Mês e pelo Ano.
 */
export function CalendarLegend({ hasUnknown }: { hasUnknown: boolean }) {
  const c = useCalendar()
  const { settings } = c
  const sameHome = c.people[1].homeCity.id === c.people[2].homeCity.id

  const legend: { band: Exclude<Band, 'unknown'>; label: string }[] = [
    { band: 'home1', label: `Juntos em ${shortCityName(c.people[1].homeCity.name)}` },
    ...(sameHome ? [] : [{ band: 'home2' as const, label: `Juntos em ${shortCityName(c.people[2].homeCity.name)}` }]),
    { band: 'away', label: 'Viajando juntos' },
    ...(sameHome ? [] : [{ band: 'apart' as const, label: 'Separados' }]),
  ]
  const people = [c.people[1], c.people[2]]

  return (
    <div className="cal-legend" role="list" aria-label="Legenda">
      {legend.map((l) => (
        <span key={l.band} role="listitem" className="cal-legend-item">
          <span className="cal-legend-swatch" style={{ '--band': bandColor(settings, l.band) } as CSSProperties} />
          {l.label}
        </span>
      ))}
      {hasUnknown && (
        <span role="listitem" className="cal-legend-item">
          <span className="cal-legend-swatch cal-legend-swatch--unknown" />
          Sem registro
        </span>
      )}
      {settings.showDayMarkers && (
        <span className="cal-legend-pairs">
          <span role="listitem" className="cal-legend-item">
            <CouplePair people={people} together />
            juntos
          </span>
          <span role="listitem" className="cal-legend-item">
            <CouplePair people={people} together={false} />
            separados
          </span>
        </span>
      )}
    </div>
  )
}

/**
 * A grade sem faixa, sem avatar e sem 💋 — só os números. É o que a tela
 * mostra com um integrante só (seção 7), quando `coupleStateOn` não roda.
 */
export function BareMonthGrid({ month, weekStartsOn, showAdjacentDays, today }: {
  month: YearMonth
  weekStartsOn: 'sun' | 'mon'
  showAdjacentDays: boolean
  today: string
}) {
  const weeks = monthWeeks(month.year, month.month, weekStartsOn)
  const bounds = monthBounds(month)
  return (
    <div className="cal-grid" role="group" aria-label="Dias do mês">
      <div className="cal-weekdays" aria-hidden="true">
        {weekdayHeads(weekStartsOn).map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      {weeks.map((days) => (
        <div key={days[0]} className="cal-week cal-week--bare">
          {days.map((day) => {
            const inMonth = bounds.from <= day && day <= bounds.to
            if (!inMonth && !showAdjacentDays) return <div key={day} className="cal-day cal-day--empty" />
            return (
              <div key={day} className={`cal-day ${inMonth ? '' : 'cal-day--adjacent'} ${day === today ? 'cal-day--today' : ''}`}>
                <div className="cal-day-top">
                  <span className={`cal-day-number ${day === today ? 'cal-day-number--today' : ''}`}>{dayOfMonth(day)}</span>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
