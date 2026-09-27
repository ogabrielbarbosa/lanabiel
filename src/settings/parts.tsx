// Peças das Configurações, fiéis aos componentes do .pen: `Toggle On/Off`,
// `Segment Item`, `Form Field`, `Settings Item`, `Ghost Button`.
//
// Toda peça que grava recebe `pending` e `error` de fora: o valor que ela
// mostra é sempre o que está GRAVADO (R24), nunca o que a pessoa acabou de
// pedir. Enquanto a escrita está em voo, ela fica desabilitada.

import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Check, Search, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cityLabel } from '../data/cities'
import type { City } from '../data/cities'
import type { DataResult } from '../data/result'
import type { ListCounts } from '../data/listSummary'
import { formatThousands } from '../domain/settings'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`st-card ${className}`}>{children}</div>
}

export function FieldError({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <p className="st-error" role="alert">
      {message}
    </p>
  )
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  pending = false,
  disabled = false,
  error,
  icon: Icon,
}: {
  label: string
  hint?: ReactNode
  checked: boolean
  onChange: (next: boolean) => void
  pending?: boolean
  disabled?: boolean
  error?: string | null
  icon?: LucideIcon
}) {
  const id = useId()
  return (
    <div className="st-row">
      {Icon && (
        <span className="st-row-icon" aria-hidden="true">
          <Icon size={17} />
        </span>
      )}
      <div className="st-row-text">
        <label htmlFor={id} className="st-row-label">
          {label}
        </label>
        {hint && <span className="st-row-hint">{hint}</span>}
        <FieldError message={error} />
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        className="st-toggle"
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        onClick={() => onChange(!checked)}
      >
        <span className="st-toggle-knob" />
      </button>
    </div>
  )
}

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
  disabled?: boolean
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  pending = false,
}: {
  label: string
  value: T
  options: readonly SegmentOption<T>[]
  onChange: (next: T) => void
  pending?: boolean
}) {
  return (
    <div className="st-segmented" role="radiogroup" aria-label={label}>
      {options.map(({ value: v, label: l, icon: Icon, disabled }) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={v === value}
          className="st-segment"
          disabled={pending || disabled}
          onClick={() => v !== value && onChange(v)}
        >
          {Icon && <Icon size={14} aria-hidden="true" />}
          {l}
        </button>
      ))}
    </div>
  )
}

/**
 * Campo que grava ao sair ou com Enter (R24). O rascunho é local; o valor
 * gravado vem de fora e reposiciona o rascunho quando muda (outro aparelho,
 * ou a escrita confirmada). Esc desfaz.
 */
export function TextField({
  label,
  value,
  onCommit,
  maxLength,
  placeholder,
  pending = false,
  error,
  icon: Icon,
  type = 'text',
  max,
}: {
  label: string
  value: string
  /** Devolve `false` (ou uma promessa dele) quando o banco recusou: o campo volta ao gravado. */
  onCommit: (next: string) => void | boolean | Promise<boolean>
  maxLength?: number
  placeholder?: string
  pending?: boolean
  error?: string | null
  icon?: LucideIcon
  type?: 'text' | 'date'
  max?: string
}) {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [shownValue, setShownValue] = useState(value)
  // Valor gravado mudou por fora: o rascunho acompanha (sem efeito — é o
  // padrão "ajustar estado durante a renderização" do React).
  if (value !== shownValue) {
    setShownValue(value)
    setDraft(value)
  }

  async function commit() {
    if (draft === value) return
    // Recusado: o campo volta ao valor gravado (R24) — a causa aparece
    // embaixo, e a tela não mostra o que não está no banco.
    if ((await onCommit(draft)) === false) setDraft(value)
  }

  return (
    <div className="st-field">
      <label htmlFor={id} className="st-field-label">
        {label}
      </label>
      <div className="st-input">
        {Icon && <Icon size={15} aria-hidden="true" />}
        <input
          id={id}
          type={type}
          value={draft}
          maxLength={maxLength}
          max={max}
          placeholder={placeholder}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') setDraft(value)
          }}
        />
      </div>
      <FieldError message={error} />
    </div>
  )
}

export function Swatches({
  label,
  colors,
  value,
  onChange,
  disabledColors = [],
  disabledHint,
  pending = false,
}: {
  label: string
  colors: readonly string[]
  value: string
  onChange: (color: string) => void
  disabledColors?: readonly string[]
  disabledHint?: string
  pending?: boolean
}) {
  return (
    <div className="st-swatches" role="radiogroup" aria-label={label}>
      {colors.map((color) => {
        const taken = disabledColors.includes(color)
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={color === value}
            aria-label={taken && disabledHint ? `${color} — ${disabledHint}` : color}
            title={taken ? disabledHint : color}
            className="st-swatch"
            style={{ '--swatch': color } as CSSProperties}
            disabled={pending || taken}
            onClick={() => color !== value && onChange(color)}
          >
            {color === value && <Check size={12} aria-hidden="true" />}
          </button>
        )
      })}
    </div>
  )
}

export function Button({
  children,
  onClick,
  variant = 'ghost',
  icon: Icon,
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'ghost' | 'primary' | 'danger' | 'link'
  icon?: LucideIcon
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} className={`st-btn st-btn--${variant}`} onClick={onClick} disabled={disabled}>
      {Icon && <Icon size={16} aria-hidden="true" />}
      {children}
    </button>
  )
}

/** Diálogo modal nativo (`<dialog>`), com foco preso pelo navegador. */
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    // jsdom não implementa showModal; ali o diálogo abre com o atributo.
    if (typeof dialog.showModal === 'function') dialog.showModal()
    else dialog.setAttribute('open', '')
  }, [])
  return (
    <dialog
      ref={ref}
      className="st-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="st-dialog-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="st-icon-btn" aria-label="Fechar" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      {children}
    </dialog>
  )
}

/**
 * Busca de cidade sobre `search_cities` (IBGE, ADR 0007). `excluded` marca as
 * cidades que não podem ser escolhidas (já salvas, casas) sem escondê-las —
 * quem procura "Marau" precisa ver que ela já está lá.
 */
export function CitySearch({
  search,
  onPick,
  excluded = new Map(),
  label = 'Buscar cidade',
}: {
  search: (query: string) => Promise<DataResult<City[]>>
  onPick: (city: City) => void
  excluded?: ReadonlyMap<string, string>
  label?: string
}) {
  const id = useId()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<{ query: string; rows: City[] } | { query: string; error: string } | null>(null)

  useEffect(() => {
    if (query.trim().length < 2) return
    let cancelled = false
    const timer = setTimeout(() => {
      void search(query).then((r) => {
        if (cancelled) return
        if (r.status === 'ok') setResult({ query, rows: r.rows })
        else setResult({ query, error: r.status === 'error' ? r.cause : 'sua sessão expirou' })
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, search])

  const current = result && result.query === query ? result : null

  return (
    <div className="st-city-search">
      <label htmlFor={id} className="st-field-label">
        {label}
      </label>
      <div className="st-input">
        <Search size={15} aria-hidden="true" />
        <input
          id={id}
          type="search"
          autoFocus
          value={query}
          placeholder="Nome da cidade"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {current && 'error' in current && <FieldError message={`Não deu pra buscar: ${current.error}`} />}
      {current && 'rows' in current && current.rows.length === 0 && (
        <p className="st-hint">Nenhuma cidade brasileira com esse nome.</p>
      )}
      {current && 'rows' in current && current.rows.length > 0 && (
        <ul className="st-city-results" aria-label="Resultados">
          {current.rows.map((city) => {
            const reason = excluded.get(city.id)
            return (
              <li key={city.id}>
                <button type="button" disabled={reason !== undefined} onClick={() => onPick(city)}>
                  <span>{cityLabel(city)}</span>
                  {reason && <span className="st-hint">{reason}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/** Avatar com a foto assinada, ou as iniciais sobre a cor da pessoa. */
export function Avatar({
  url,
  name,
  color,
  size = 40,
}: {
  url: string | null
  name: string
  color: string
  size?: number
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
  return (
    <span className="st-avatar" style={{ width: size, height: size, '--person': color } as CSSProperties}>
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">{initials}</span>}
    </span>
  )
}

/**
 * "Itens na lista" (R26), no painel e na Zona sensível. Falha mostra — com a
 * causa no `title`: é número de resumo, e um zero diria que a lista está vazia.
 */
export function ListTotal({ counts }: { counts: DataResult<ListCounts> | null }) {
  if (counts === null) return <dd aria-busy="true">…</dd>
  if (counts.status !== 'ok') {
    const cause = counts.status === 'error' ? counts.cause : 'sua sessão expirou'
    return <dd title={`Não deu pra contar os itens: ${cause}`}>—</dd>
  }
  return <dd>{formatThousands(counts.rows.total)}</dd>
}
