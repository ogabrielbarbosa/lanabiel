import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { addDays, diffDays, todayISO } from '../lib/date'
import type { Stay } from './types'

export type DragMode = 'move' | 'start' | 'end'

interface DragState {
  stay: Stay
  mode: DragMode
  /** Grade do mês onde o arrasto começou — o ponteiro é preso a ela. */
  scope: HTMLElement | null
  anchor: string
  start: string
  end?: string
  moved: boolean
}

/**
 * Qual dia está sob o ponteiro, via geometria das semanas. O ponteiro é preso
 * à grade de origem: os dois meses ficam lado a lado, e sem isso arrastar para
 * fora da borda cairia no mês vizinho, pulando semanas de uma vez.
 */
function dateFromPoint(x: number, y: number, scope: HTMLElement | null): string | null {
  if (!scope) return null

  const weeks = Array.from(scope.querySelectorAll<HTMLElement>('[data-week-start]'))
  if (weeks.length === 0) return null

  const bounds = scope.getBoundingClientRect()
  const clampedX = Math.min(Math.max(x, bounds.left + 1), bounds.right - 1)
  const clampedY = Math.min(Math.max(y, bounds.top + 1), bounds.bottom - 1)

  const week =
    weeks.find((element) => {
      const rect = element.getBoundingClientRect()
      return clampedY >= rect.top && clampedY <= rect.bottom
    }) ?? weeks[weeks.length - 1]

  const rect = week.getBoundingClientRect()
  const column = Math.floor(((clampedX - rect.left) / rect.width) * 7)
  return addDays(week.dataset.weekStart as string, Math.min(6, Math.max(0, column)))
}

export function useBarDrag(onCommit: (id: string, patch: { start: string; end?: string }) => void) {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressClick = useRef(false)

  const update = useCallback((next: DragState | null) => {
    dragRef.current = next
    setDrag(next)
  }, [])

  const beginDrag = useCallback(
    (event: ReactPointerEvent, stay: Stay, mode: DragMode) => {
      event.preventDefault()
      event.stopPropagation()
      const scope = (event.currentTarget as HTMLElement).closest<HTMLElement>('.month-grid')
      const anchor = dateFromPoint(event.clientX, event.clientY, scope) ?? stay.start
      update({ stay, mode, scope, anchor, start: stay.start, end: stay.end, moved: false })
    },
    [update],
  )

  const dragging = drag !== null

  useEffect(() => {
    if (!dragging) return

    function onPointerMove(event: PointerEvent) {
      const current = dragRef.current
      if (!current) return

      const hovered = dateFromPoint(event.clientX, event.clientY, current.scope)
      if (!hovered) return

      const delta = diffDays(current.anchor, hovered)
      const original = current.stay
      const effectiveEnd = original.end ?? todayISO()

      let start = original.start
      let end = original.end

      if (current.mode === 'move') {
        start = addDays(original.start, delta)
        end = original.end ? addDays(original.end, delta) : undefined
      } else if (current.mode === 'start') {
        const candidate = addDays(original.start, delta)
        start = candidate > effectiveEnd ? effectiveEnd : candidate
      } else {
        const candidate = addDays(effectiveEnd, delta)
        end = candidate < original.start ? original.start : candidate
      }

      const moved = current.moved || delta !== 0
      if (start === current.start && end === current.end && moved === current.moved) return
      update({ ...current, start, end, moved })
    }

    function onPointerUp() {
      const current = dragRef.current
      if (current?.moved) {
        suppressClick.current = true
        onCommit(current.stay.id, { start: current.start, end: current.end })
      }
      update(null)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [dragging, onCommit, update])

  const preview: Stay | null = drag ? { ...drag.stay, start: drag.start, end: drag.end } : null

  /** O clique logo após um arrasto é descartado — foi arrasto, não clique. */
  const consumeClick = useCallback(() => {
    if (!suppressClick.current) return false
    suppressClick.current = false
    return true
  }, [])

  return { preview, dragging, beginDrag, consumeClick }
}
