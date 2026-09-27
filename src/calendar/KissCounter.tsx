// O 💋 de um dia (R5, R22): o número quando > 0, _+1_ ao passar o mouse ou
// focar, e o passo-a-passo _− {n} +_ ao tocar.
//
// Spec: .agent/Tasks/fase-5-calendario.md — R5, R22, I12, seção 7
//
// O número só muda depois do `ok` do banco E da releitura: a tela nunca mostra
// uma contagem que ela mesma inventou. O contador é do casal (qualquer um soma
// ou tira) e mora SÓ no Calendário (I12) — não exporte este componente para
// outra tela.

import { useEffect, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { CALENDAR_LIMITS } from '../domain/calendar'
import type { KissWrite } from './api'
import { useCalendar, writeFailureMessage } from './context'

export interface KissCounterProps {
  day: string
  count: number
  /** Para o nome acessível: "25 de setembro". */
  dayLabel: string
}

function messageOf(result: Exclude<KissWrite, { status: 'ok' } | { status: 'nothing_to_remove' }>): string {
  switch (result.status) {
    case 'kiss_limit':
      return 'Esse dia já está no máximo'
    case 'kiss_future':
      return 'Esse dia ainda não chegou'
    default:
      return writeFailureMessage(result)
  }
}

export function KissCounter({ day, count, dayLabel }: KissCounterProps) {
  const { api, coupleId, reload } = useCalendar()
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  // Fecha ao tocar fora ou com Esc.
  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function step(delta: 1 | -1) {
    setPending(true)
    setError(null)
    const result = delta === 1 ? await api.addKiss(coupleId, day) : await api.removeKiss(day)
    // `nothing_to_remove`: a outra pessoa tirou antes — relê, sem erro (seção 7).
    if (result.status !== 'ok' && result.status !== 'nothing_to_remove') setError(messageOf(result))
    await reload()
    setPending(false)
  }

  return (
    <div className="cal-kiss" ref={root}>
      <button
        type="button"
        className={`cal-kiss-btn ${count > 0 ? 'cal-kiss-btn--on' : ''}`}
        aria-label={count > 0 ? `💋 ${count} em ${dayLabel}` : `💋 em ${dayLabel}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
      >
        <span aria-hidden="true">💋</span>
        {count > 0 && <span className="cal-kiss-count">{count}</span>}
        {hover && !open && (
          <span className="cal-kiss-hint" aria-hidden="true">
            +1
          </span>
        )}
      </button>
      {open && (
        <div className="cal-kiss-stepper" role="group" aria-label={`💋 em ${dayLabel}`}>
          <button type="button" aria-label="Menos um" disabled={pending || count <= 0} onClick={() => void step(-1)}>
            <Minus size={12} aria-hidden="true" />
          </button>
          <output aria-live="polite">{count}</output>
          <button
            type="button"
            aria-label="Mais um"
            disabled={pending || count >= CALENDAR_LIMITS.kissesPerDay}
            onClick={() => void step(1)}
          >
            <Plus size={12} aria-hidden="true" />
          </button>
          {error && (
            <p className="cal-kiss-error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
