// A tela de hoje, ainda sobre `localStorage`. Saiu de `App.tsx` na Fase 1
// sem mudar de conteúdo: `App.tsx` virou o portão de sessão, e isto é o que
// ele renderiza quando o estágio da conta é `ready`. Cai na Fase 5, quando o
// Calendário desenhado substituir esta tela.

import { useCallback, useMemo, useState } from 'react'
import { monthLabel, todayISO } from '../lib/date'
import { Calendar } from './Calendar'
import { PEOPLE } from './people'
import { Sidebar } from './Sidebar'
import { StayDialog } from './StayDialog'
import { computeTogetherPeriods } from './together'
import { computeStats } from './timelineStats'
import { useBarDrag } from './useBarDrag'
import { useTimeline } from './useTimeline'
import type { Stay } from './types'
import './timeline.css'

type Editing = { mode: 'create'; date: string } | { mode: 'edit'; stay: Stay }

export function TimelineScreen() {
  const { entries: stays, addEntry, updateEntry, removeEntry } = useTimeline()
  const now = new Date()
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [editing, setEditing] = useState<Editing | null>(null)

  const commitDrag = useCallback(
    (id: string, patch: { start: string; end?: string }) => updateEntry(id, patch),
    [updateEntry],
  )
  const { preview, dragging, beginDrag, consumeClick } = useBarDrag(commitDrag)

  const displayStays = useMemo(
    () => (preview ? stays.map((stay) => (stay.id === preview.id ? preview : stay)) : stays),
    [stays, preview],
  )

  const together = useMemo(() => computeTogetherPeriods(stays), [stays])
  const stats = useMemo(() => computeStats(stays), [stays])
  const cityOptions = useMemo(
    () => [...new Set(stays.map((stay) => stay.city))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [stays],
  )

  const next =
    cursor.month === 11
      ? { year: cursor.year + 1, month: 0 }
      : { year: cursor.year, month: cursor.month + 1 }

  function shiftMonth(delta: number) {
    setCursor(({ year, month }) => {
      const shifted = month + delta
      if (shifted < 0) return { year: year - 1, month: 11 }
      if (shifted > 11) return { year: year + 1, month: 0 }
      return { year, month: shifted }
    })
  }

  function goToToday() {
    const today = new Date()
    setCursor({ year: today.getFullYear(), month: today.getMonth() })
  }

  function handleSave(values: Omit<Stay, 'id'>) {
    if (editing?.mode === 'edit') updateEntry(editing.stay.id, values)
    else addEntry(values)
    setEditing(null)
  }

  const calendarProps = {
    stays: displayStays,
    onDayClick: (iso: string) => setEditing({ mode: 'create', date: iso }),
    onStayClick: (stay: Stay) => setEditing({ mode: 'edit', stay }),
    onBarPointerDown: beginDrag,
    consumeClick,
  }

  return (
    <div className={`app${dragging ? ' app-dragging' : ''}`}>
      <main className="app-main">
        <header className="app-header">
          <div className="brand">
            <span className="brand-marks">
              {PEOPLE.map((person) => (
                <span key={person.id} className="dot" style={{ background: person.color }} />
              ))}
            </span>
            lanabiel
          </div>

          <div className="month-nav">
            <button
              type="button"
              className="btn btn-outline btn-icon"
              onClick={() => shiftMonth(-1)}
              aria-label="Mês anterior"
            >
              ‹
            </button>
            <span className="month-range">
              {monthLabel(cursor.year, cursor.month)} — {monthLabel(next.year, next.month)}
            </span>
            <button
              type="button"
              className="btn btn-outline btn-icon"
              onClick={() => shiftMonth(1)}
              aria-label="Próximo mês"
            >
              ›
            </button>
            <button type="button" className="btn btn-ghost" onClick={goToToday}>
              Hoje
            </button>
          </div>
        </header>

        <div className="calendar-scroll">
          <div className="months">
            <Calendar year={cursor.year} month={cursor.month} {...calendarProps} />
            <Calendar year={next.year} month={next.month} {...calendarProps} />
          </div>
        </div>
      </main>

      <Sidebar
        stats={stats}
        together={together}
        stays={stays}
        onNew={() => setEditing({ mode: 'create', date: todayISO() })}
        onEdit={(stay) => setEditing({ mode: 'edit', stay })}
      />

      {editing && (
        <StayDialog
          key={editing.mode === 'edit' ? editing.stay.id : editing.date}
          stay={editing.mode === 'edit' ? editing.stay : undefined}
          date={editing.mode === 'create' ? editing.date : undefined}
          cityOptions={cityOptions}
          onSave={handleSave}
          onDelete={
            editing.mode === 'edit'
              ? () => {
                  removeEntry(editing.stay.id)
                  setEditing(null)
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
