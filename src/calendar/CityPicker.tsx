// Seletor de cidade (R17): um campo só, usado no Novo período, no Novo evento e
// no cartão do primeiro período.
//
// Spec: .agent/Tasks/fase-5-calendario.md — R17, I2, seções 7, 8 e 9
// ADR:  .agent/Decisions/0017-cidades-do-mundo-por-casal.md
//       .agent/Decisions/0016-busca-de-lugares-pelo-photon-osm.md
//
// Ordem: as duas casas ("Marau, RS · casa de Lana"), depois o IBGE ("Pelotas,
// RS"), depois o mundo ("Lisboa · Portugal") com "© OpenStreetMap". Photon com
// `countrycode = BR` é descartado aqui também (a fronteira já filtra): cidade
// brasileira é sempre a linha do IBGE, senão a derivação diria _Separados_ com
// os dois na mesma cidade (I2).
//
// Busca: 350 ms sem digitar; IBGE a partir de 2 caracteres, Photon a partir de
// 3 (uso justo, ADR 0016); a busca anterior é abortada e resposta de consulta
// velha é descartada (sequência + consulta). Texto que veio de uma escolha não
// dispara busca.
//
// Escolher cidade estrangeira NÃO grava: devolve um `WorldPick`, e quem salva
// chama `resolveCity` (cityChoice.ts) antes da escrita.

import { useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Globe, House, MapPin } from 'lucide-react'
import type { CalCity } from '../domain/calendar'
import type { CalendarApi, WorldCityCandidate } from './api'
import { CITY_DEBOUNCE_MS, IBGE_MIN_QUERY, WORLD_MIN_QUERY, cityChoiceLabel, homeLabel, pickedLabel } from './cityChoice'
import type { CityHome, CityPickerProps } from './cityChoice'
import { useCalendar } from './context'
import './calendar.css'
import './modals.css'

const ALL_DOWN = 'A busca de cidades está fora do ar — tente de novo em instantes'
const WORLD_DOWN = 'Busca mundial indisponível — mostrando cidades do Brasil'

export interface CityPickerFullProps extends CityPickerProps {
  api: Pick<CalendarApi, 'searchCities' | 'searchWorldCities'>
  /** As cidades-casa, na ordem dos slots. Aparecem primeiro. */
  homes: readonly CityHome[]
  id?: string
  invalid?: boolean
  describedBy?: string
  disabled?: boolean
  placeholder?: string
}

type Option =
  | { kind: 'home'; city: CalCity; label: string }
  | { kind: 'ibge'; city: CalCity; label: string }
  | { kind: 'world'; candidate: WorldCityCandidate; label: string }

interface Landed<T> {
  query: string
  rows: T[] | null
}

/** Sem acento e em minúsculas: "sao jose" acha "São José dos Campos". */
function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

function useCitySearch(api: CityPickerFullProps['api'], query: string, armed: boolean) {
  const [ibge, setIbge] = useState<Landed<CalCity> | null>(null)
  const [world, setWorld] = useState<Landed<WorldCityCandidate> | null>(null)
  const seq = useRef(0)
  const q = query.trim()

  useEffect(() => {
    if (!armed || q.length < IBGE_MIN_QUERY) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const mine = ++seq.current
      void api.searchCities(q).then((result) => {
        if (mine !== seq.current) return
        setIbge({
          query: q,
          rows:
            result.status === 'ok'
              ? result.rows.map((c) => ({ ...c, countryCode: 'BR', region: null }))
              : null,
        })
      })
      if (q.length < WORLD_MIN_QUERY) return
      void api.searchWorldCities(q, { signal: controller.signal }).then((result) => {
        if (mine !== seq.current || result.status === 'aborted') return
        setWorld({ query: q, rows: result.status === 'ok' ? result.rows.filter((r) => r.countryCode !== 'BR') : null })
      })
    }, CITY_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [api, q, armed])

  const active = armed && q.length >= IBGE_MIN_QUERY
  const wantsWorld = active && q.length >= WORLD_MIN_QUERY
  const ibgeNow = active && ibge?.query === q ? ibge : null
  const worldNow = wantsWorld && world?.query === q ? world : null
  const loading = active && (ibgeNow === null || (wantsWorld && worldNow === null))
  const ibgeDown = ibgeNow !== null && ibgeNow.rows === null
  const worldDown = worldNow !== null && worldNow.rows === null
  const notice = ibgeDown && (!wantsWorld || worldDown) ? ALL_DOWN : worldDown && !ibgeDown ? WORLD_DOWN : null
  return {
    active,
    loading,
    ibgeRows: ibgeNow?.rows ?? [],
    worldRows: worldNow?.rows ?? [],
    notice,
    allDown: notice === ALL_DOWN,
  }
}

export function CityPicker({
  api,
  homes,
  value,
  onChange,
  label,
  id,
  invalid = false,
  describedBy,
  disabled = false,
  placeholder = 'Busque a cidade',
}: CityPickerFullProps) {
  const autoId = useId()
  const inputId = id ?? `${autoId}-input`
  const listId = `${autoId}-list`
  const [text, setText] = useState('')
  const [armed, setArmed] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const search = useCitySearch(api, text, armed)

  // Texto da escolha (e de valor que muda por fora, como o destino padrão da
  // Visita) é derivado do valor; só o que a pessoa digita mora no estado.
  const display = armed ? text : value ? pickedLabel(value, homes) : text

  const q = fold(armed ? text : '')
  const seenHomes = new Set<string>()
  const homeOptions: Option[] = []
  for (const h of homes) {
    if (seenHomes.has(h.city.id)) continue
    seenHomes.add(h.city.id)
    if (q !== '' && !fold(h.city.name).includes(q)) continue
    homeOptions.push({ kind: 'home', city: h.city, label: homeLabel(homes, h.city) as string })
  }
  const options: Option[] = [
    ...homeOptions,
    ...search.ibgeRows
      .filter((c) => !seenHomes.has(c.id))
      .map((city): Option => ({ kind: 'ibge', city, label: cityChoiceLabel(city) })),
    ...search.worldRows.map(
      (candidate): Option => ({ kind: 'world', candidate, label: cityChoiceLabel({ kind: 'world', candidate }) }),
    ),
  ]
  const hasWorld = search.worldRows.length > 0
  const expanded = open && options.length > 0

  function choose(index: number) {
    const option = options[index]
    if (!option) return
    setOpen(false)
    setActiveIndex(-1)
    setArmed(false)
    setText('')
    onChange(option.kind === 'world' ? { kind: 'world', candidate: option.candidate } : option.city)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (i + 1) % options.length)
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1))
    } else if (event.key === 'Enter') {
      // Enter nunca envia o formulário daqui: escolhe, ou não faz nada.
      event.preventDefault()
      if (expanded && activeIndex >= 0) choose(activeIndex)
    } else if (event.key === 'Escape' && expanded) {
      // Fecha só a lista, não o modal.
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
  }

  const optionId = (index: number) => `${listId}-opt-${index}`

  return (
    <div className="cal-city">
      <label className="cal-mf-label" htmlFor={inputId}>
        {label}
      </label>
      <div className={`cal-mf-input ${invalid ? 'is-invalid' : ''}`}>
        <MapPin size={15} aria-hidden="true" />
        <input
          id={inputId}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          value={display}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value)
            setArmed(true)
            setOpen(true)
            setActiveIndex(-1)
            if (value) onChange(null)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && search.loading && <p className="cal-mf-hint">Buscando…</p>}
      {search.notice && (
        <p className={search.allDown ? 'cal-mf-error' : 'cal-mf-hint'} role={search.allDown ? 'alert' : 'status'}>
          {search.notice}
        </p>
      )}
      <div className="cal-city-results" hidden={!expanded}>
        <ul id={listId} role="listbox" aria-label={`${label}: resultados`}>
          {options.map((option, index) => {
            const Icon = option.kind === 'home' ? House : option.kind === 'world' ? Globe : MapPin
            return (
              <li
                key={option.kind === 'world' ? `w-${option.candidate.osmRef}` : `${option.kind}-${option.city.id}`}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className="cal-city-option"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(index)}
              >
                <Icon size={14} aria-hidden="true" />
                {option.label}
              </li>
            )
          })}
        </ul>
        {hasWorld && <p className="cal-city-credit">© OpenStreetMap</p>}
      </div>
      {open && search.active && !search.loading && options.length === 0 && !search.allDown && (
        <p className="cal-mf-hint">Nenhuma cidade para “{text.trim()}”.</p>
      )}
    </div>
  )
}

/**
 * O seletor dentro da `CalendarScreen`: a busca e as casas vêm do contexto.
 * É o que a tela passa ao cartão do primeiro período (`renderCityPicker`).
 */
export function CalendarCityPicker(props: CityPickerProps) {
  const { api, people } = useCalendar()
  return (
    <CityPicker
      {...props}
      api={api}
      homes={[
        { city: people[1].homeCity, owner: people[1].name },
        { city: people[2].homeCity, owner: people[2].name },
      ]}
    />
  )
}
