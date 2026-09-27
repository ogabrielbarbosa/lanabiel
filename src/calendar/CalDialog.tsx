// A casca dos modais do Calendário (`IZ8MX` período, `wfbuT` evento): véu,
// vidro, cabeçalho com título, subtítulo e ×, corpo e rodapé. Esc e clique no
// véu fecham; o foco entra no diálogo e volta a quem o abriu. É o mesmo
// comportamento do `ListDialog` da Lista, com o visual do frame.

import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { X } from 'lucide-react'
import type { CoupleSettings } from '../data/settings'
import type { Band } from '../domain/calendar'
import { bandColor } from './view'
import './calendar.css'
import './modals.css'

export function CalDialog({
  title,
  subtitle,
  icon,
  iconClass = '',
  onClose,
  closeDisabled = false,
  wide = false,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  /** Classe do quadro do ícone (a cor do tipo: `cal-ev--{tipo}`). */
  iconClass?: string
  onClose: () => void
  /** Enquanto grava, fechar sairia com a escrita em voo. */
  closeDisabled?: boolean
  wide?: boolean
  children: ReactNode
  footer: ReactNode
}) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const disabledRef = useRef(closeDisabled)
  useEffect(() => {
    closeRef.current = onClose
    disabledRef.current = closeDisabled
  }, [onClose, closeDisabled])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !disabledRef.current) closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  return (
    <div
      className="cal-modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && !closeDisabled && onClose()}
    >
      <div
        ref={ref}
        className={`cal-modal ${wide ? 'cal-modal--wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="cal-modal-head">
          {icon && (
            <span className={`cal-modal-icon ${iconClass}`} aria-hidden="true">
              {icon}
            </span>
          )}
          <div className="cal-modal-titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="cal-modal-close" aria-label="Fechar" onClick={onClose} disabled={closeDisabled}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="cal-modal-body">{children}</div>
        <div className="cal-modal-foot">{footer}</div>
      </div>
    </div>
  )
}

/** Rótulo + controle + erro, como o `Form Field` (`U3E63f`) do .pen. */
export function ModalField({
  label,
  htmlFor,
  field,
  error,
  errorId,
  children,
}: {
  label?: string
  htmlFor?: string
  /** `data-field`: o teste confere quais campos cada tipo mostra. */
  field: string
  error?: string | null
  errorId?: string
  children: ReactNode
}) {
  return (
    <div className="cal-mf" data-field={field}>
      {label &&
        (htmlFor ? (
          <label className="cal-mf-label" htmlFor={htmlFor}>
            {label}
          </label>
        ) : (
          <span className="cal-mf-label">{label}</span>
        ))}
      {children}
      {error && (
        <p className="cal-mf-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

/** Interruptor acessível (`role="switch"`), como o _Dia inteiro_ do frame. */
export function ModalSwitch({
  id,
  label,
  checked,
  onChange,
  icon,
}: {
  id: string
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  icon?: ReactNode
}) {
  return (
    <div className="cal-mf-switch-row">
      {icon}
      <span id={`${id}-label`} className="cal-mf-switch-label">
        {label}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        className="cal-mf-switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        onClick={() => onChange(!checked)}
      >
        <span className="cal-mf-switch-knob" aria-hidden="true" />
      </button>
    </div>
  )
}

/**
 * A tira de dias das prévias (`IZ8MX`, `wfbuT`): o número e a faixa do dia
 * depois de salvar, na cor do casal. `highlight` = os dias que a escrita pinta:
 * fundo na cor da faixa e a faixa com brilho. Cada trecho é UMA faixa contínua
 * de 4px — as peças de cada dia se emendam por cima do vão, e só as pontas
 * reais do trecho ganham recuo e canto. Dia futuro fora da pintura com a
 * opacidade de _planejado_; `unknown` sem faixa. `weekdays` = a linha de
 * iniciais em cima (a prévia do evento).
 */
export function BandStrip({
  days,
  bands,
  settings,
  today,
  highlight,
  label,
  weekdays,
  tall = false,
}: {
  days: readonly string[]
  bands: ReadonlyMap<string, Band>
  settings: CoupleSettings
  today: string
  highlight: (day: string) => boolean
  label: string
  weekdays?: readonly string[]
  tall?: boolean
}) {
  // Um trecho acaba onde muda a faixa ou onde começa/acaba a pintura.
  const keyOf = (i: number) => (i < 0 || i >= days.length ? null : `${bands.get(days[i]) ?? 'unknown'}|${highlight(days[i])}`)
  return (
    <div className="cal-strip-box">
      {weekdays && (
        <div className="cal-strip-weekdays" aria-hidden="true">
          {weekdays.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
      )}
      <ol className={`cal-strip ${tall ? 'cal-strip--tall' : ''}`} aria-label={label}>
        {days.map((d, i) => {
          const band = bands.get(d) ?? 'unknown'
          const on = highlight(d)
          const key = keyOf(i)
          const bar = [
            'cal-strip-bar',
            d > today && !on ? 'cal-band-planned' : '',
            keyOf(i - 1) !== key ? 'is-start' : i % 7 === 0 ? 'is-row-start' : '',
            keyOf(i + 1) !== key ? 'is-end' : i % 7 === 6 ? 'is-row-end' : '',
          ].join(' ')
          return (
            <li
              key={d}
              className={`cal-strip-day ${on ? 'is-on' : ''}`}
              data-day={d}
              data-band={band}
              style={band === 'unknown' ? undefined : ({ '--band': bandColor(settings, band) } as CSSProperties)}
            >
              <span className="cal-strip-num">{Number(d.slice(8, 10))}</span>
              {band !== 'unknown' && <span className={bar} aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
