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
  onClose,
  closeDisabled = false,
  wide = false,
  children,
  footer,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
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
            <span className="cal-modal-icon" aria-hidden="true">
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
 * depois de salvar, na cor do casal. `highlight` = os dias que a escrita pinta.
 * Dia futuro com a opacidade de _planejado_; `unknown` sem faixa.
 */
export function BandStrip({
  days,
  bands,
  settings,
  today,
  highlight,
  label,
}: {
  days: readonly string[]
  bands: ReadonlyMap<string, Band>
  settings: CoupleSettings
  today: string
  highlight: (day: string) => boolean
  label: string
}) {
  return (
    <ol className="cal-strip" aria-label={label}>
      {days.map((d) => {
        const band = bands.get(d) ?? 'unknown'
        const on = highlight(d)
        return (
          <li key={d} className={`cal-strip-day ${on ? 'is-on' : ''}`} data-day={d} data-band={band}>
            <span className="cal-strip-num">{Number(d.slice(8, 10))}</span>
            {band !== 'unknown' && (
              <span
                className={`cal-strip-bar ${d > today ? 'cal-band-planned' : ''}`}
                style={{ '--band': bandColor(settings, band) } as CSSProperties}
                aria-hidden="true"
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
