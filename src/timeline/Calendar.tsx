import type { PointerEvent as ReactPointerEvent } from 'react'
import { buildMonthGrid, daysInclusive, diffDays, formatDateBR, monthLabel, todayISO, WEEKDAYS_PT } from '../lib/date'
import type { GridDay } from '../lib/date'
import { personById } from './people'
import { isTogetherOn } from './together'
import type { DragMode } from './useBarDrag'
import type { Stay } from './types'

interface CalendarProps {
  year: number
  month: number
  stays: Stay[]
  onDayClick: (iso: string) => void
  onStayClick: (stay: Stay) => void
  onBarPointerDown: (event: ReactPointerEvent, stay: Stay, mode: DragMode) => void
  consumeClick: () => boolean
}

interface Segment {
  stay: Stay
  lane: number
  colStart: number
  colEnd: number
  capStart: boolean
  capEnd: boolean
}

function weekSegments(stays: Stay[], week: GridDay[], today: string): Segment[] {
  const weekStart = week[0].iso
  const weekEnd = week[6].iso

  return stays.flatMap((stay) => {
    const effectiveEnd = stay.end ?? today
    if (stay.start > weekEnd || effectiveEnd < weekStart) return []

    return [
      {
        stay,
        lane: stay.person === 'gabriel' ? 0 : 1,
        colStart: Math.max(0, diffDays(weekStart, stay.start)),
        colEnd: Math.min(6, diffDays(weekStart, effectiveEnd)),
        capStart: stay.start >= weekStart,
        capEnd: effectiveEnd <= weekEnd,
      },
    ]
  })
}

function tooltipFor(stay: Stay, today: string): string {
  const person = personById(stay.person)
  const end = stay.end ? formatDateBR(stay.end) : 'hoje'
  const days = daysInclusive(stay.start, stay.end ?? today)
  return `${person.name} · ${stay.city}\n${formatDateBR(stay.start)} — ${end} · ${days} dias${stay.note ? `\n${stay.note}` : ''}`
}

export function Calendar({
  year,
  month,
  stays,
  onDayClick,
  onStayClick,
  onBarPointerDown,
  consumeClick,
}: CalendarProps) {
  const today = todayISO()
  const weeks = buildMonthGrid(year, month)

  return (
    <section className="month">
      <h2 className="month-title">{monthLabel(year, month)}</h2>

      <div className="month-grid">
        <div className="weekday-row">
          {WEEKDAYS_PT.map((weekday) => (
            <span key={weekday} className="weekday">
              {weekday}
            </span>
          ))}
        </div>

        {weeks.map((week) => (
          <div className="week" key={week[0].iso} data-week-start={week[0].iso}>
            <div className="week-days">
              {week.map((day) => (
                <button
                  type="button"
                  key={day.iso}
                  className={[
                    'day',
                    day.inMonth ? '' : 'day-out',
                    day.iso === today ? 'day-today' : '',
                    isTogetherOn(stays, day.iso) ? 'day-together' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onDayClick(day.iso)}
                  aria-label={`Adicionar período em ${formatDateBR(day.iso)}`}
                >
                  <span className="day-num">{Number(day.iso.slice(-2))}</span>
                </button>
              ))}
            </div>

            <div className="week-bars">
              {weekSegments(stays, week, today).map((segment) => (
                <button
                  type="button"
                  key={segment.stay.id}
                  className={[
                    'bar',
                    segment.capStart ? 'cap-start' : '',
                    segment.capEnd ? 'cap-end' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{
                    gridColumn: `${segment.colStart + 1} / ${segment.colEnd + 2}`,
                    gridRow: segment.lane + 1,
                    background: personById(segment.stay.person).color,
                  }}
                  title={tooltipFor(segment.stay, today)}
                  onPointerDown={(event) => onBarPointerDown(event, segment.stay, 'move')}
                  onClick={() => {
                    if (!consumeClick()) onStayClick(segment.stay)
                  }}
                >
                  {segment.capStart && (
                    <span
                      className="bar-handle bar-handle-left"
                      onPointerDown={(event) => onBarPointerDown(event, segment.stay, 'start')}
                    />
                  )}
                  <span className="bar-label">{segment.stay.city}</span>
                  {segment.capEnd && (
                    <span
                      className="bar-handle bar-handle-right"
                      onPointerDown={(event) => onBarPointerDown(event, segment.stay, 'end')}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
