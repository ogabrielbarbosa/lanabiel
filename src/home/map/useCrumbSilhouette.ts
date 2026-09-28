// A silhueta do breadcrumb em movimento (crumbShape.ts): o seletor nasce do
// segmento tocado e cresce até o painel, recolhe de volta nele ao fechar, e
// ao trocar de seletor (Mundo → Brasil → São Paulo) a forma vai do painel
// antigo ao novo em vez de sumir e reaparecer. Também anima quando o painel
// muda de altura (a busca encurta a lista).
//
// Um só dono do movimento: a caixa exibida (`shown`) vive num ref e cada
// alvo novo parte dela — interromper uma animação no meio continua do ponto
// em que ela estava, sem salto.

import { useLayoutEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { collapsedBox, crumbBounds, crumbSilhouette, lerpBox, panelSnap } from './crumbShape'
import type { CrumbBox } from './crumbShape'

export interface Silhouette {
  /** O path na origem da caixa (`left`, 0). */
  d: string
  left: number
  width: number
  height: number
}

const OPEN_MS = 420
const CLOSE_MS = 260

/** Sai rápido e pousa devagar — o `cubic-bezier(.22, 1, .36, 1)` do resto. */
const easeOut = (t: number) => 1 - (1 - t) ** 4

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

const sameBox = (a: CrumbBox, b: CrumbBox) =>
  Math.abs(a.barWidth - b.barWidth) < 0.5 &&
  Math.abs(a.panelLeft - b.panelLeft) < 0.5 &&
  Math.abs(a.panelRight - b.panelRight) < 0.5 &&
  Math.abs(a.panelBottom - b.panelBottom) < 0.5

/**
 * `openKey` identifica o seletor aberto (ou `null`); `leaving`, o que está
 * fechando — ele segue no DOM até a silhueta recolher, e aí `onClosed`.
 */
export function useCrumbSilhouette(
  navRef: RefObject<HTMLElement | null>,
  openKey: string | null,
  leaving: boolean,
  onClosed: () => void,
): Silhouette | null {
  const [shape, setShape] = useState<Silhouette | null>(null)
  const shown = useRef<CrumbBox | null>(null)
  const closed = useRef(onClosed)
  useLayoutEffect(() => {
    closed.current = onClosed
  }, [onClosed])

  useLayoutEffect(() => {
    const nav = navRef.current
    const picker = openKey === null ? null : nav?.querySelector<HTMLElement>('.hm-picker')
    const slot = picker?.parentElement
    const segment = slot?.querySelector<HTMLElement>('.hm-crumb')
    if (!nav || !picker || !slot || !segment) {
      shown.current = null
      setShape(null)
      if (leaving) closed.current()
      return
    }

    let frame = 0
    let target: CrumbBox | null = null

    const paint = (box: CrumbBox, panel: CrumbBox) => {
      shown.current = box
      const bounds = crumbBounds(box)
      const d = crumbSilhouette(box, bounds.left)
      setShape((s) => (s?.d === d ? s : { d, ...bounds }))
      // O conteúdo não passa da forma enquanto ela cresce.
      const inset = (n: number) => `${Math.max(0, n)}px`
      picker.style.clipPath = `inset(0 ${inset(panel.panelRight - box.panelRight)} ${inset(panel.panelBottom - box.panelBottom)} ${inset(box.panelLeft - panel.panelLeft)} round 0 0 26px 26px)`
    }

    const measure = () => {
      const n = nav.getBoundingClientRect()
      // O retângulo sai na escala da tela; a silhueta é desenhada em px do CSS.
      // Um `zoom`/`scale` num ancestral os separa.
      const k = nav.offsetWidth > 0 ? n.width / nav.offsetWidth : 1
      const width = n.width / k
      const height = n.height / k
      const p = picker.getBoundingClientRect()
      const s = segment.getBoundingClientRect()
      const shift = parseFloat(slot.style.getPropertyValue('--picker-shift')) || 0
      const left = (p.left - n.left) / k - shift
      const right = (p.right - n.left) / k - shift
      const snap = leaving ? shift : panelSnap(width, left, right)
      if (snap !== shift) slot.style.setProperty('--picker-shift', `${snap}px`)
      const panel: CrumbBox = {
        barWidth: width,
        barHeight: height,
        panelLeft: left + snap,
        panelRight: right + snap,
        panelBottom: (p.bottom - n.top) / k,
      }
      const folded = collapsedBox(width, height, (s.left - n.left) / k, (s.right - n.left) / k)
      return { panel, folded }
    }

    const run = () => {
      const { panel, folded } = measure()
      const next = leaving ? folded : panel
      if (target && sameBox(target, next)) return
      target = next
      const from = shown.current ?? folded
      const ms = reducedMotion() ? 0 : leaving ? CLOSE_MS : OPEN_MS
      const start = performance.now()
      cancelAnimationFrame(frame)
      const step = (now: number) => {
        // O carimbo do rAF é o início do quadro e pode vir ANTES de `start`: sem
        // o piso, o t negativo extrapola a curva e a forma pisca para trás.
        const t = ms === 0 ? 1 : Math.min(1, Math.max(0, (now - start) / ms))
        paint(lerpBox(from, next, easeOut(t)), panel)
        if (t < 1) frame = requestAnimationFrame(step)
        else if (leaving) {
          shown.current = null
          setShape(null)
          closed.current()
        }
      }
      // O primeiro quadro já sai antes da pintura: sem piscar o painel inteiro.
      step(start)
    }

    run()
    // jsdom não tem ResizeObserver: lá a silhueta fica na primeira medida.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(run)
    observer?.observe(nav)
    observer?.observe(picker)
    return () => {
      observer?.disconnect()
      cancelAnimationFrame(frame)
      picker.style.clipPath = ''
    }
  }, [navRef, openKey, leaving])

  return shape
}
