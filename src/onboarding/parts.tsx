// Peças que as telas de onboarding repetem: progresso, caixas do código,
// campo do código, busca de cidade e foto. Componentes do .pen que elas
// espelham: `Step Progress [dz3UR]`, `Code Boxes [o3wGTW]`, `Form Field [U3E63f]`.

import { useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Camera, MapPin } from '../auth/icons'
import { cityLabel } from '../data/cities'
import type { City } from '../data/cities'
import { CODE_LENGTH, extractInviteCode } from '../domain/onboarding'
import type { OnboardingApi } from './api'

// ---------------------------------------------------------------------------
// Progresso
// ---------------------------------------------------------------------------

export interface Progress {
  current: number
  total: number
  label: string
}

/** "Passo 1 de 3" conta só os passos que vão aparecer (spec, seção 5). */
export function StepProgress({ current, total, label }: Progress) {
  if (total < 2) return null
  return (
    <div className="onb-progress">
      <div className="onb-progress-labels">
        <span>
          Passo {current} de {total}
        </span>
        <span>{label}</span>
      </div>
      <div
        className="onb-progress-bar"
        role="progressbar"
        aria-label={`Passo ${current} de ${total}`}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < current ? 'is-done' : undefined} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Código
// ---------------------------------------------------------------------------

/** Só exibição: seis caixas com o hífen no meio. O texto real fica acessível. */
export function CodeBoxes({ code }: { code: string }) {
  const chars = code.padEnd(CODE_LENGTH, ' ').slice(0, CODE_LENGTH).split('')
  return (
    <div className="onb-code" aria-label={`Código ${code.slice(0, 3)}-${code.slice(3)}`} role="img">
      {chars.map((ch, i) => (
        <span key={i} className="onb-code-box" aria-hidden="true">
          {i === 3 && <i className="onb-code-dash" />}
          {ch.trim()}
        </span>
      ))}
    </div>
  )
}

/**
 * Um `<input>` de verdade (acessível, colável, com teclado de sistema), com as
 * seis caixas desenhadas por cima. Colar uma mensagem inteira do WhatsApp
 * extrai o código dela (R7).
 */
export function CodeInput({
  value,
  onChange,
  invalid,
}: {
  value: string
  onChange: (value: string) => void
  invalid?: boolean
}) {
  const id = useId()
  const clean = (raw: string) =>
    raw
      .toUpperCase()
      .replace(/[^0-9A-Z]/g, '')
      .slice(0, CODE_LENGTH)

  return (
    <div className={`onb-code-input${invalid ? ' is-invalid' : ''}`}>
      <label htmlFor={id} className="onb-sr-only">
        Código de convite
      </label>
      <input
        id={id}
        value={value}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="one-time-code"
        spellCheck={false}
        maxLength={CODE_LENGTH + 1}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(clean(e.target.value))}
        onPaste={(e) => {
          const extracted = extractInviteCode(e.clipboardData.getData('text'))
          if (extracted) {
            e.preventDefault()
            onChange(extracted)
          }
        }}
      />
      <CodeBoxes code={value} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Campo de formulário (mesma aparência do AuthField, com textarea de erro)
// ---------------------------------------------------------------------------

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="auth-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <p className="onb-field-hint">{hint}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cidade — combobox sobre `search_cities`
// ---------------------------------------------------------------------------

export function CitySearch({
  api,
  value,
  onChange,
  label = 'Cidade onde você mora',
}: {
  api: Pick<OnboardingApi, 'searchCities'>
  value: City | null
  onChange: (city: City | null) => void
  label?: string
}) {
  const id = useId()
  const listId = `${id}-list`
  const [query, setQuery] = useState(value ? cityLabel(value) : '')
  const [results, setResults] = useState<City[]>([])
  const [searched, setSearched] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const request = useRef(0)

  useEffect(() => {
    if (value && query === cityLabel(value)) return
    if (query.trim().length < 2) return
    const ticket = ++request.current
    const timer = setTimeout(() => {
      void api.searchCities(query).then((result) => {
        if (ticket !== request.current) return // resposta de uma busca velha
        if (result.status === 'ok') {
          setResults(result.rows)
          setFailure(null)
        } else {
          setResults([])
          setFailure(result.status === 'error' ? result.cause : 'Sua sessão caiu.')
        }
        setSearched(query)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [api, query, value])

  const showList = open && query.trim().length >= 2 && searched === query
  const empty = showList && results.length === 0 && !failure

  return (
    <div className="auth-field onb-city">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input">
        <MapPin />
        <input
          id={id}
          role="combobox"
          aria-expanded={showList && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Digite o nome da cidade"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            if (value) onChange(null)
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {showList && results.length > 0 && (
        <ul id={listId} role="listbox" className="onb-city-list" aria-label="Cidades">
          {results.map((city) => (
            <li
              key={city.id}
              role="option"
              aria-selected={value?.id === city.id}
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(city)
                setQuery(cityLabel(city))
                setOpen(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onChange(city)
                  setQuery(cityLabel(city))
                  setOpen(false)
                }
              }}
            >
              {cityLabel(city)}
            </li>
          ))}
        </ul>
      )}
      {empty && <p className="onb-field-hint">Não achamos essa cidade. Por enquanto só cidades do Brasil.</p>}
      {failure && (
        <p className="auth-error" role="alert">
          Não deu pra buscar cidades: {failure}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Foto — escolhida e reduzida no aparelho; sobe só no "Continuar"
// ---------------------------------------------------------------------------

export interface PickedAvatar {
  blob: Blob
  extension: 'webp' | 'jpg'
  previewUrl: string
}

export function AvatarPicker({
  api,
  value,
  onChange,
  initials,
}: {
  api: Pick<OnboardingApi, 'prepareAvatar'>
  value: PickedAvatar | null
  onChange: (avatar: PickedAvatar | null) => void
  initials: string
}) {
  const inputId = useId()
  const [problem, setProblem] = useState<string | null>(null)

  async function pick(file: File | undefined) {
    if (!file) return
    const prepared = await api.prepareAvatar(file)
    if (prepared.status === 'too_large') return setProblem('Essa foto é grande demais. Tente uma de até 10 MB.')
    if (prepared.status === 'not_image') return setProblem('Esse arquivo não parece uma imagem.')
    setProblem(null)
    if (value) URL.revokeObjectURL(value.previewUrl)
    onChange({ blob: prepared.blob, extension: prepared.extension, previewUrl: URL.createObjectURL(prepared.blob) })
  }

  return (
    <div className="onb-avatar">
      <span className="onb-avatar-img" aria-hidden="true">
        {value ? <img src={value.previewUrl} alt="" /> : initials || <Camera size={20} />}
      </span>
      <div className="onb-avatar-text">
        <strong>Sua foto</strong>
        <span>Aparece no calendário e na lista</span>
        {problem && (
          <span className="onb-avatar-problem" role="alert">
            {problem}
          </span>
        )}
      </div>
      <label htmlFor={inputId} className="lg auth-btn onb-btn-small">
        {value ? 'Trocar foto' : 'Escolher foto'}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        className="onb-sr-only"
        onChange={(e) => void pick(e.target.files?.[0])}
      />
    </div>
  )
}
