// Adicionar / editar item. Spec da Fase 4: R11–R15, seção 7, A14; simplificado
// pela pesquisa `.agent/Research/lista-adicionar-simples.md`.
//
// ── CONTRATO — as props não mudaram ─────────────────────────────────────────
// Quem abre: a `ListScreen`, dentro do `ListContext` (use `useList()` para
// `api`, `coupleId`, `me`, `members`, `today`, `urls`, `searchFrom`).
//
//   <AddItemModal mode="create" initialCategory?={cat} onClose onSaved />
//     - "Adicionar" do cabeçalho → sem grupo (passo 1 aberto).
//     - "Adicionar {categoria}" do estado vazio (R9) → `initialCategory`.
//   <AddItemModal mode="edit" item={item} onClose onSaved />
//     - "Editar" do detalhe. A categoria NÃO muda na edição (R14).
//
//   onSaved(item) — o banco devolveu `ok`; `item` é a linha gravada. A tela
//     fecha o modal e relê a lista. NÃO chame `reload()` aqui também.
//   onClose() — cancelar / Esc / Fechar, sem gravar.
//
// Enquanto grava, o modal fica aberto e desabilitado; na falha continua
// aberto com o que foi digitado e a causa (R28).
// ─────────────────────────────────────────────────────────────────────────────
//
// Cinco GRUPOS na tela, oito categorias no banco (ADR 0003 intacto). O grupo é
// o que a pessoa escolhe; a categoria sai do que ela preencheu:
//   - Países e cidades: país sem cidade → `pais`; com cidade → `cidade`. Os
//     países são os do seletor da Home; as cidades, as do IBGE (Brasil) ou do
//     GeoNames (ADR 0029), e o Photon para a cidade pequena que não está lá.
//   - Restaurantes e parques: uma busca só. Escolher o resultado preenche o
//     nome; parque do OSM já marca _Parque_. Endereço com número vem do Mapbox
//     (ADR 0030).
//   - Comidas, Filmes e séries, Experiências: o nome e um campo cada.
// Link, região, cidades que interessam e temporadas saíram do formulário. O que
// o item já tinha nessas colunas é mantido na edição, não apagado.
//
// Foto que falha DEPOIS de o item ser gravado: o modal troca para o aviso
// ("O item foi adicionado, mas a foto não subiu: …") com _Entendi_, e só então
// chama `onSaved` — chamar na hora faria a tela fechar o modal e o aviso sumir.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import { Camera, Check, Clapperboard, Flag, Globe, MapPin, PenLine, Plus, Search, Soup, Sparkles, Star, StickyNote, Utensils, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { MAX_INPUT_BYTES } from '../data/avatar'
import type { WorldCity } from '../data/cities'
import { PLACE_MIN_QUERY, cityToCandidate, countryNamePt, placeDetail } from '../data/places'
import type { PlaceCandidate, PlaceMode, PlaceSearchResult } from '../data/places'
import { COUNTRY_CENTERS, COUNTRY_CODES } from '../domain/countries'
import { CATEGORY_LABELS, LIST_LIMITS, PLATFORMS, validateItem } from '../domain/list'
import type { DraftField, GeoPlace, ItemDraft, ListCategory, ListItem } from '../domain/list'
import { normalizeName } from '../domain/map'
import type { ListApi } from './api'
import { failureMessage, useList } from './context'
import { Avatar, ItemPhoto, ListDialog } from './parts'

export type AddItemModalProps = (
  | { mode: 'create'; initialCategory?: ListCategory }
  | { mode: 'edit'; item: ListItem }
) & {
  onClose: () => void
  onSaved: (item: ListItem) => void
}

// ---------------------------------------------------------------------------
// Os grupos
// ---------------------------------------------------------------------------

export type ItemGroup = 'mundo' | 'lugar' | 'comida' | 'tela' | 'experiencia'

const GROUPS: readonly { key: ItemGroup; label: string; icon: LucideIcon; categories: readonly ListCategory[] }[] = [
  { key: 'mundo', label: 'Países e cidades', icon: Globe, categories: ['pais', 'cidade'] },
  { key: 'lugar', label: 'Restaurantes e parques', icon: Utensils, categories: ['restaurante', 'parque'] },
  { key: 'comida', label: 'Comidas', icon: Soup, categories: ['comida'] },
  { key: 'tela', label: 'Filmes e séries', icon: Clapperboard, categories: ['filme', 'serie'] },
  { key: 'experiencia', label: 'Experiências', icon: Sparkles, categories: ['experiencia'] },
]

function groupOf(category: ListCategory): ItemGroup {
  return GROUPS.find((g) => g.categories.includes(category))!.key
}

const DEBOUNCE_MS = 350
const SEARCH_DOWN = 'A busca de lugares está fora do ar. Tente de novo daqui a pouco.'
const FALLBACK_NOTICE = 'A busca fora do Brasil não respondeu. Por enquanto, só cidades brasileiras.'
const CITY_ONLY = 'Não achei. Usar só a cidade'
/** Quantas cidades do país aparecem de uma vez (as maiores primeiro). */
const CITY_OPTIONS = 40

interface Chosen {
  label: string
  detail: string
}

interface Option {
  key: string
  label: string
  detail?: string
}

// ---------------------------------------------------------------------------
// Busca de lugar (R13)
// ---------------------------------------------------------------------------

interface Landed {
  key: string
  result: Exclude<PlaceSearchResult, { status: 'aborted' }>
}

/**
 * ≥ 3 caracteres, 350 ms sem digitar, uma requisição em voo (a anterior é
 * abortada) e a resposta de consulta velha descartada (sequência + chave).
 * `armed` = a pessoa digitou desde a última escolha; texto preenchido pela
 * edição ou pela escolha não dispara busca.
 */
function usePlaceSearch(api: ListApi, mode: PlaceMode | null, query: string, armed: boolean, bias: { lat: number; lng: number; name?: string }) {
  const [landed, setLanded] = useState<Landed | null>(null)
  const seq = useRef(0)
  const { lat, lng, name } = bias
  const q = query.trim()
  const key = `${mode}|${q}`

  useEffect(() => {
    if (!mode || !armed || q.length < PLACE_MIN_QUERY) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const id = ++seq.current
      void api.searchPlaces(q, { mode, bias: name ? { lat, lng, name } : { lat, lng }, signal: controller.signal }).then((result) => {
        if (id !== seq.current || result.status === 'aborted') return
        setLanded({ key: `${mode}|${q}`, result })
      })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [api, mode, q, armed, lat, lng, name])

  const active = !!mode && armed && q.length >= PLACE_MIN_QUERY
  const current = active && landed?.key === key ? landed.result : null
  /** A última resposta que chegou foi falha: sem lugar, não há como salvar geográfico. */
  const down = landed !== null && landed.result.status !== 'ok'
  return { active, current, down }
}

/** Os países do seletor da Home (ISO + `Intl`), em ordem alfabética. */
function useCountries(): { code: string; name: string; norm: string }[] {
  return useMemo(
    () =>
      COUNTRY_CODES.map((code) => {
        const name = countryNamePt(code)
        return { code, name, norm: normalizeName(name) }
      }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [],
  )
}

/** Quem começa com o texto vem antes de quem só o contém. */
function filterByName<T>(rows: readonly T[], name: (row: T) => string, query: string): T[] {
  const q = normalizeName(query)
  if (q === '') return [...rows]
  const starts: T[] = []
  const contains: T[] = []
  for (const row of rows) {
    const n = normalizeName(name(row))
    if (n.startsWith(q)) starts.push(row)
    else if (n.includes(q)) contains.push(row)
  }
  return [...starts, ...contains]
}

interface CityOption extends Option {
  place: GeoPlace
}

/**
 * As cidades do país escolhido. Fora do Brasil, a lista do GeoNames (lida uma
 * vez) filtrada aqui, e o Photon só quando ela não tem o nome (Göreme). No
 * Brasil, o IBGE pelo `search_cities`, porque são 5.571.
 */
function useCityOptions(api: ListApi, countryCode: string | null, query: string, armed: boolean) {
  const [world, setWorld] = useState<{ code: string; rows: WorldCity[] | null } | null>(null)
  const [landed, setLanded] = useState<{ key: string; rows: CityOption[] } | null>(null)
  const q = query.trim()
  const br = countryCode === 'BR'

  useEffect(() => {
    if (!countryCode || countryCode === 'BR') return
    let live = true
    void api.countryCities(countryCode).then((result) => {
      if (live) setWorld({ code: countryCode, rows: result.status === 'ok' ? result.rows : [] })
    })
    return () => {
      live = false
    }
  }, [api, countryCode])

  const worldRows = !br && world?.code === countryCode ? world.rows : null
  const local = worldRows ? filterByName(worldRows, (c) => c.name, armed ? q : '').slice(0, CITY_OPTIONS) : []
  const needRemote = !!countryCode && armed && (br ? q.length >= 2 : worldRows !== null && local.length === 0 && q.length >= PLACE_MIN_QUERY)
  const key = `${countryCode}|${q}`

  useEffect(() => {
    if (!needRemote || !countryCode) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const done = (rows: CityOption[]) => {
        if (!controller.signal.aborted) setLanded({ key: `${countryCode}|${q}`, rows })
      }
      if (countryCode === 'BR') {
        void api.searchCities(q).then((r) =>
          done(
            r.status === 'ok'
              ? r.rows.map((c) => {
                  const { label, detail, ...place } = cityToCandidate(c)
                  return { key: c.id, label, detail: c.stateCode ?? detail, place }
                })
              : [],
          ),
        )
      } else {
        void api.searchPlaces(q, { mode: 'city', signal: controller.signal }).then((r) =>
          done(
            r.status === 'ok'
              ? r.rows
                  .filter((c) => c.countryCode === countryCode)
                  .map(({ label, detail, osmRef: _ref, kind: _kind, ...place }) => ({ key: `${label}|${place.lat}|${place.lng}`, label, detail, place }))
              : [],
          ),
        )
      }
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [api, needRemote, countryCode, q])

  const remote = landed?.key === key ? landed.rows : null
  const rows: CityOption[] =
    !br && local.length > 0
      ? local.map((c) => ({
          key: c.id,
          label: c.name,
          detail: c.region ?? undefined,
          place: { address: null, city: c.name, state: c.region, country: countryNamePt(c.countryCode), countryCode: c.countryCode, lat: c.lat, lng: c.lng },
        }))
      : (remote ?? [])
  const loading = !!countryCode && ((!br && worldRows === null) || (needRemote && remote === null))
  return { rows, loading }
}

// ---------------------------------------------------------------------------
// Combobox (a busca e as listas de país e cidade)
// ---------------------------------------------------------------------------

function Combobox({
  id,
  value,
  onType,
  placeholder,
  icon,
  options,
  shown,
  loading,
  down,
  onPick,
  extra,
  notice,
  credit,
  invalid,
  describedBy,
  maxLength = LIST_LIMITS.name,
}: {
  id: string
  value: string
  onType: (value: string) => void
  placeholder?: string
  icon: ReactNode
  options: readonly Option[]
  /** Há uma lista para mostrar (busca respondeu, ou lista local pronta). */
  shown: boolean
  loading: boolean
  down?: boolean
  onPick: (index: number) => void
  /** Uma última linha que não é resultado ("Não achei. Usar só a cidade"). */
  extra?: { label: string; onPick: () => void } | null
  notice?: string | null
  credit?: string | null
  invalid: boolean
  describedBy?: string
  maxLength?: number
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const total = options.length + (extra ? 1 : 0)
  const expanded = open && shown
  const optionId = (index: number) => `${listId}-opt-${index}`

  function choose(index: number) {
    if (index < 0 || index >= total) return
    setOpen(false)
    setActiveIndex(-1)
    if (index < options.length) onPick(index)
    else extra?.onPick()
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && total > 0) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (i + 1) % total)
    } else if (event.key === 'ArrowUp' && total > 0) {
      event.preventDefault()
      setActiveIndex((i) => (i <= 0 ? total - 1 : i - 1))
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

  return (
    <div className="ls-add-combo">
      <div className={`ls-add-input ls-add-input--search ${invalid ? 'is-invalid' : ''} lg`}>
        {icon}
        <input
          id={id}
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
          value={value}
          maxLength={maxLength}
          onChange={(e) => {
            onType(e.target.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && loading && <p className="ls-add-searching">Buscando…</p>}
      {down && (
        <p className="ls-add-error" role="alert">
          {SEARCH_DOWN}
        </p>
      )}
      <div className="ls-add-results lg" hidden={!expanded}>
        {notice && <p className="ls-add-fallback">{notice}</p>}
        <ul id={listId} role="listbox" aria-label="Resultados da busca">
          {options.map((option, index) => (
            <li
              key={option.key}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className="ls-add-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(index)}
            >
              <MapPin size={15} aria-hidden="true" />
              <span className="ls-add-option-text">
                <span className="ls-add-option-label">{option.label}</span>
                {option.detail && <span className="ls-add-option-detail">{option.detail}</span>}
              </span>
            </li>
          ))}
          {extra && (
            <li
              id={optionId(options.length)}
              role="option"
              aria-selected={activeIndex === options.length}
              className="ls-add-option ls-add-option--city"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(options.length)}
            >
              <MapPin size={15} aria-hidden="true" />
              <span className="ls-add-option-label">{extra.label}</span>
            </li>
          )}
        </ul>
        {options.length === 0 && <p className="ls-add-empty">Nada encontrado para “{value.trim()}”.</p>}
        {credit && <p className="ls-add-credit">{credit}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Peças do formulário
// ---------------------------------------------------------------------------

function Field({
  label,
  htmlFor,
  hint,
  error,
  errorId,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string | null
  errorId?: string
  children: ReactNode
}) {
  return (
    <div className="ls-add-field">
      {htmlFor ? (
        <label className="ls-add-label" htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="ls-add-label">{label}</span>
      )}
      {children}
      {error && (
        <p className="ls-add-error" id={errorId} role="alert">
          {error}
        </p>
      )}
      {hint && <p className="ls-add-hint">{hint}</p>}
    </div>
  )
}

/** Dois ou mais botões de escolha única (Restaurante/Parque, Filme/Série, plataformas). */
function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled,
  firstId,
}: {
  label: string
  options: readonly { value: T; label: string }[]
  value: T | null
  onChange: (value: T) => void
  disabled?: boolean
  firstId?: string
}) {
  return (
    <div className="ls-add-chips" role="group" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.value}
          id={i === 0 ? firstId : undefined}
          type="button"
          className="ls-chip lg"
          aria-pressed={value === o.value}
          disabled={disabled && value !== o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function photoRejection(reason: 'not_image' | 'too_large'): string {
  return reason === 'not_image' ? 'Esse arquivo não é uma imagem.' : 'A foto é grande demais (até 10 MB).'
}

function stripCandidate({ label, detail, osmRef: _ref, kind: _kind, ...place }: PlaceCandidate): { place: GeoPlace; chosen: Chosen } {
  return { place, chosen: { label, detail } }
}

function countryPlace(code: string): GeoPlace {
  const [lat, lng] = COUNTRY_CENTERS[code] ?? [0, 0]
  return { address: null, city: null, state: null, country: countryNamePt(code), countryCode: code, lat, lng }
}

/** O lugar já gravado, mostrado como resultado escolhido (edição). */
function chosenFromItem(item: ListItem): Chosen | null {
  const place = item.place
  if (!place) return null
  if (item.category === 'pais') return { label: place.country, detail: 'País' }
  const label = item.category === 'cidade' || item.category === 'comida' ? (item.venue ?? place.city ?? place.country) : item.name
  return { label, detail: placeDetail(place, 'place') }
}

// ---------------------------------------------------------------------------
// O modal
// ---------------------------------------------------------------------------

export function AddItemModal(props: AddItemModalProps) {
  const { api, coupleId, me, urls, searchFrom } = useList()
  const editing = props.mode === 'edit'
  const item = props.mode === 'edit' ? props.item : null
  const initial = item?.category ?? (props.mode === 'create' ? props.initialCategory : undefined) ?? null

  const [group, setGroup] = useState<ItemGroup | null>(initial ? groupOf(initial) : null)
  /** O tipo dentro do grupo quando é a pessoa quem diz (Restaurante/Parque, Filme/Série). */
  const [kindChoice, setKindChoice] = useState<ListCategory | null>(initial)

  const [name, setName] = useState(item?.name ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [featured, setFeatured] = useState(item?.featured ?? false)
  const [venue, setVenue] = useState<string | null>(item?.venue ?? null)
  const [platform, setPlatform] = useState<string | null>(item?.platform ?? null)
  const [otherPlatform, setOtherPlatform] = useState(!!item?.platform && !(PLATFORMS as readonly string[]).includes(item.platform))

  // O lugar (todos os geográficos menos o "Países e cidades").
  const [place, setPlace] = useState<GeoPlace | null>(item && item.category !== 'pais' && item.category !== 'cidade' ? item.place : null)
  const [chosen, setChosen] = useState<Chosen | null>(item && item.category !== 'pais' && item.category !== 'cidade' ? chosenFromItem(item) : null)
  const [placeQuery, setPlaceQuery] = useState('')
  const [armed, setArmed] = useState(false)
  const [cityOnly, setCityOnly] = useState(false)
  const [address, setAddress] = useState('')

  // "Países e cidades".
  const [countryCode, setCountryCode] = useState<string | null>(
    item && (item.category === 'pais' || item.category === 'cidade') ? (item.place?.countryCode ?? null) : null,
  )
  const [countryQuery, setCountryQuery] = useState(countryCode ? countryNamePt(countryCode) : '')
  const [countryArmed, setCountryArmed] = useState(false)
  const [cityPlace, setCityPlace] = useState<GeoPlace | null>(item?.category === 'cidade' ? item.place : null)
  const [cityQuery, setCityQuery] = useState(item?.category === 'cidade' ? (item.place?.city ?? '') : '')
  const [cityArmed, setCityArmed] = useState(false)

  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)

  const [fieldError, setFieldError] = useState<{ field: DraftField; message: string; targetId: string; nonce: number } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /** Conta as tentativas recusadas: cada uma é um objeto novo e o foco volta ao campo. */
  const attempts = useRef(0)
  /** Gravado, mas a foto não subiu: só resta avisar e devolver o item (ver o topo). */
  const [partial, setPartial] = useState<{ item: ListItem; message: string } | null>(null)

  const ids = useId()
  const fid = (field: string) => `${ids}-${field}`
  const formId = fid('form')

  // A prévia local da foto é revogada ao trocar (no handler) e ao desmontar.
  const photoUrlRef = useRef<string | null>(null)
  useEffect(
    () => () => {
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    },
    [],
  )

  const countries = useCountries()
  const countryOptions = countryArmed ? filterByName(countries, (c) => c.name, countryQuery).slice(0, 8) : []
  const cities = useCityOptions(api, countryCode, cityQuery, cityArmed)

  const placeMode: PlaceMode | null = group === 'lugar' || group === 'comida' || group === 'experiencia' ? (cityOnly ? 'city' : 'place') : null
  const search = usePlaceSearch(api, placeMode, placeQuery, armed, searchFrom)
  const searchResult = search.current
  const searchRows = searchResult?.status === 'ok' ? searchResult.rows : []

  // O foco vai ao campo que a validação apontou (a cada tentativa: `nonce`).
  useEffect(() => {
    if (fieldError) document.getElementById(fieldError.targetId)?.focus()
  }, [fieldError])

  const locked = saving || partial !== null

  /** A categoria que vai para o banco: travada na edição, derivada na criação. */
  function categoryNow(): ListCategory | null {
    if (item) return item.category
    switch (group) {
      case 'mundo':
        return cityPlace ? 'cidade' : 'pais'
      case 'lugar':
        return kindChoice === 'parque' ? 'parque' : 'restaurante'
      case 'comida':
        return 'comida'
      case 'tela':
        return kindChoice === 'serie' ? 'serie' : 'filme'
      case 'experiencia':
        return 'experiencia'
      default:
        return null
    }
  }
  const category = categoryNow()

  function errorFor(...fields: DraftField[]): string | null {
    return fieldError && fields.includes(fieldError.field) ? fieldError.message : null
  }

  function pickGroup(next: ItemGroup) {
    if (editing || next === group) return
    setGroup(next)
    setKindChoice(next === 'lugar' ? 'restaurante' : next === 'tela' ? 'filme' : null)
    setName('')
    setVenue(null)
    setPlace(null)
    setChosen(null)
    setPlaceQuery('')
    setArmed(false)
    setCityOnly(false)
    setAddress('')
    setCountryCode(null)
    setCountryQuery('')
    setCityPlace(null)
    setCityQuery('')
    setPlatform(null)
    setOtherPlatform(false)
    setFieldError(null)
    setFailure(null)
  }

  function pickPlace(candidate: PlaceCandidate) {
    const { place: geo, chosen: shown } = stripCandidate(candidate)
    setPlace(geo)
    setChosen(shown)
    setArmed(false)
    setPlaceQuery('')
    setFieldError(null)
    if (group === 'lugar') {
      // O nome do lugar vem do resultado; endereço e cidade não são nome.
      if (candidate.kind !== 'address' && candidate.kind !== 'city') setName(candidate.label)
      if (!editing && candidate.kind === 'park') setKindChoice('parque')
    } else if (group === 'comida') {
      setVenue(candidate.kind === 'address' || candidate.kind === 'city' || cityOnly ? null : candidate.label)
    }
  }

  function chooseCityOnly() {
    // O que a pessoa digitou era o nome do lugar: ele fica, e a busca vira de cidade.
    if (group === 'lugar' && name.trim() === '') setName(placeQuery.trim())
    setCityOnly(true)
    setPlace(null)
    setChosen(null)
    setPlaceQuery('')
    setArmed(false)
  }

  function backToPlaceSearch() {
    setCityOnly(false)
    setAddress('')
    setPlace(null)
    setChosen(null)
  }

  function clearChosen() {
    setPlace(null)
    setChosen(null)
    document.getElementById(fid('place'))?.focus()
  }

  function pickCountry(code: string) {
    setCountryCode(code)
    setCountryQuery(countryNamePt(code))
    setCountryArmed(false)
    setCityPlace(null)
    setCityQuery('')
    setFieldError(null)
  }

  function pickCity(option: CityOption) {
    setCityPlace(option.place)
    setCityQuery(option.label)
    setCityArmed(false)
    setFieldError(null)
  }

  function onPhotoPicked(file: File | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) return setPhotoError(photoRejection('not_image'))
    if (file.size > MAX_INPUT_BYTES) return setPhotoError(photoRejection('too_large'))
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current)
    const url = URL.createObjectURL(file)
    photoUrlRef.current = url
    setPhoto({ file, url })
    setPhotoError(null)
  }

  function buildDraft(cat: ListCategory): ItemDraft {
    const same = item?.category === cat
    const kept = { region: same ? item!.region : null, highlights: same ? item!.highlights : [], seasons: same ? item!.seasons : null }
    const base = { category: cat, note: note.trim() === '' ? null : note.trim(), link: item?.link ?? null, featured, venue: null, platform: null, ...kept }

    if (group === 'mundo') {
      if (cat === 'cidade') {
        const city = cityPlace
        // O nome é o da cidade; na edição sem trocar de cidade, o que já estava ("Gramado no Natal").
        const unchanged = item && city === item.place
        return { ...base, name: unchanged ? name.trim() : (city?.city ?? ''), place: city, highlights: [] }
      }
      const unchanged = item && countryCode === item.place?.countryCode
      const country = countryCode ? (unchanged && item?.place ? item.place : countryPlace(countryCode)) : null
      return { ...base, name: unchanged ? name.trim() : (country?.country ?? ''), place: country, region: null }
    }
    if (group === 'tela') {
      return { ...base, name: name.trim(), place: null, region: null, highlights: [], platform: platform?.trim() ?? null }
    }
    const typedAddress = address.trim()
    const geo = place ? (cityOnly && typedAddress ? { ...place, address: typedAddress } : place) : null
    return {
      ...base,
      name: name.trim(),
      place: geo,
      region: null,
      highlights: [],
      seasons: null,
      venue: cat === 'comida' && venue && venue.trim() !== '' ? venue.trim().slice(0, LIST_LIMITS.venue) : null,
    }
  }

  /** O que a tela sabe antes do domínio: sem lugar escolhido, aponte a busca, não o nome. */
  function missingPlace(): { field: DraftField; message: string; target: string } | null {
    if (group === 'mundo' && !countryCode) return { field: 'place', message: 'Escolha o país.', target: 'country' }
    if ((group === 'lugar' || group === 'experiencia' || group === 'comida') && !place) {
      return { field: 'place', message: cityOnly ? 'Escolha a cidade.' : 'Busque e escolha um resultado.', target: 'place' }
    }
    if (group === 'tela' && (!platform || platform.trim() === '')) {
      return { field: 'platform', message: 'Diga onde assistir.', target: otherPlatform ? 'platform-other' : 'platform' }
    }
    return null
  }

  async function save(event?: FormEvent) {
    event?.preventDefault()
    if (!category || locked) return
    const missing = missingPlace()
    if (missing) {
      setFieldError({ field: missing.field, message: missing.message, targetId: fid(missing.target), nonce: ++attempts.current })
      return
    }
    const draft = buildDraft(category)
    const verdict = validateItem(draft)
    if (!verdict.ok) {
      setFieldError({ field: verdict.field, message: verdict.reason, targetId: fid(fieldTarget(verdict.field, group, category)), nonce: ++attempts.current })
      return
    }
    setFieldError(null)
    setFailure(null)
    setSaving(true)

    const written = item ? await api.updateItem(item.id, draft) : await api.createItem(coupleId, draft)
    if (written.status !== 'ok') {
      setSaving(false)
      setFailure(written.status === 'invalid' ? `O banco recusou (${written.constraint}): ${written.cause}` : failureMessage(written))
      return
    }

    let saved = written.value
    if (photo) {
      const uploaded = await api.replaceItemPhoto(coupleId, saved, photo.file)
      if (uploaded.status === 'ok') {
        saved = uploaded.value
      } else {
        const cause = uploaded.status === 'photo_rejected' ? photoRejection(uploaded.reason) : failureMessage(uploaded)
        setSaving(false)
        setPartial({
          item: saved,
          message: item ? `As alterações foram salvas, mas a foto não subiu: ${cause}` : `O item foi adicionado, mas a foto não subiu: ${cause}`,
        })
        return
      }
    }
    setSaving(false)
    props.onSaved(saved)
  }

  const close = partial ? () => props.onSaved(partial.item) : props.onClose

  // --- pedaços -------------------------------------------------------------

  const nameError = errorFor('name')
  const placeError = errorFor('place', 'place.city', 'place.countryCode', 'place.lat', 'place.lng')
  const offline = search.down && placeMode !== null && place === null

  const chosenCard = chosen && place && (
    <div className="ls-add-chosen lg">
      <Check size={15} aria-hidden="true" className="ls-add-chosen-check" />
      <span className="ls-add-option-text">
        <span className="ls-add-option-label">{chosen.label}</span>
        <span className="ls-add-option-detail">{chosen.detail}</span>
      </span>
      <button type="button" className="ls-add-link-btn" onClick={clearChosen}>
        Trocar
      </button>
    </div>
  )

  const textInput = (field: string, label: string, value: string, onChange: (v: string) => void, icon: ReactNode, opts: { placeholder?: string; maxLength: number; error?: string | null; hint?: string }) => (
    <Field label={label} htmlFor={fid(field)} hint={opts.hint} error={opts.error} errorId={fid(`${field}-error`)}>
      <div className={`ls-add-input ${opts.error ? 'is-invalid' : ''} lg`}>
        {icon}
        <input
          id={fid(field)}
          type="text"
          value={value}
          maxLength={opts.maxLength}
          placeholder={opts.placeholder}
          aria-invalid={!!opts.error || undefined}
          aria-describedby={opts.error ? fid(`${field}-error`) : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </Field>
  )

  const nameField = (label: string, placeholder?: string) =>
    textInput('name', label, name, setName, <PenLine size={15} aria-hidden="true" />, { placeholder, maxLength: LIST_LIMITS.name, error: nameError })

  const placeSearch = (label: string, placeholder: string) => (
    <>
      <Field label={label} htmlFor={fid('place')} error={placeError} errorId={fid('place-error')}>
        {chosenCard || (
          <Combobox
            id={fid('place')}
            value={placeQuery}
            onType={(v) => {
              setPlaceQuery(v)
              setArmed(true)
            }}
            placeholder={cityOnly ? 'Busque a cidade' : placeholder}
            icon={<Search size={15} aria-hidden="true" />}
            options={searchRows.map((r) => ({ key: `${r.label}|${r.lat}|${r.lng}`, label: r.label, detail: r.detail }))}
            shown={search.active && searchResult?.status === 'ok'}
            loading={search.active && searchResult === null}
            down={search.down}
            onPick={(i) => pickPlace(searchRows[i])}
            extra={!cityOnly && searchResult?.status === 'ok' ? { label: CITY_ONLY, onPick: chooseCityOnly } : null}
            notice={searchResult?.status === 'ok' && searchResult.fallback ? FALLBACK_NOTICE : null}
            credit={searchResult?.status === 'ok' && !searchResult.fallback ? '© OpenStreetMap · © Mapbox' : null}
            invalid={!!placeError}
            describedBy={placeError ? fid('place-error') : undefined}
          />
        )}
        {cityOnly && (
          <p className="ls-add-hint">
            O pin fica no centro da cidade.{' '}
            <button type="button" className="ls-add-link-btn" onClick={backToPlaceSearch}>
              Buscar o lugar de novo
            </button>
          </p>
        )}
      </Field>
      {cityOnly &&
        textInput('address', 'Endereço · opcional', address, setAddress, <MapPin size={15} aria-hidden="true" />, {
          placeholder: 'Rua, número, bairro',
          maxLength: LIST_LIMITS.address,
          error: errorFor('place.address'),
        })}
    </>
  )

  const noteField = (
    <Field label="Nota · opcional" htmlFor={fid('note')} error={errorFor('note')} errorId={fid('note-error')}>
      <div className={`ls-add-input ls-add-input--area ${errorFor('note') ? 'is-invalid' : ''} lg`}>
        <StickyNote size={15} aria-hidden="true" />
        <textarea id={fid('note')} rows={2} value={note} maxLength={LIST_LIMITS.note} aria-invalid={!!errorFor('note') || undefined} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Field>
  )

  const platformError = errorFor('platform')
  const platformField = (
    <Field label="Onde assistir" error={platformError} errorId={fid('platform-error')}>
      <div className="ls-add-chips" role="group" aria-label="Onde assistir">
        {PLATFORMS.map((p, i) => (
          <button
            key={p}
            id={i === 0 ? fid('platform') : undefined}
            type="button"
            className="ls-chip lg"
            aria-pressed={!otherPlatform && platform === p}
            onClick={() => {
              setPlatform(p)
              setOtherPlatform(false)
            }}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className="ls-chip lg"
          aria-pressed={otherPlatform}
          onClick={() => {
            setOtherPlatform(true)
            setPlatform('')
          }}
        >
          Outra…
        </button>
      </div>
      {otherPlatform && (
        <div className="ls-add-input lg">
          <PenLine size={15} aria-hidden="true" />
          <input
            id={fid('platform-other')}
            type="text"
            aria-label="Outra plataforma"
            placeholder="Globoplay, Crunchyroll…"
            value={platform ?? ''}
            maxLength={LIST_LIMITS.platform}
            autoFocus
            onChange={(e) => setPlatform(e.target.value)}
          />
        </div>
      )}
    </Field>
  )

  const countryError = group === 'mundo' ? placeError : null
  const worldFields = (
    <>
      <Field label="País" htmlFor={fid('country')} error={category === 'pais' ? countryError : null} errorId={fid('country-error')}>
        <Combobox
          id={fid('country')}
          value={countryQuery}
          onType={(v) => {
            setCountryQuery(v)
            setCountryArmed(true)
            setCountryCode(null)
            setCityPlace(null)
            setCityQuery('')
          }}
          placeholder="Busque o país"
          icon={<Flag size={15} aria-hidden="true" />}
          options={countryOptions.map((c) => ({ key: c.code, label: c.name }))}
          shown={countryArmed && countryQuery.trim() !== ''}
          loading={false}
          onPick={(i) => pickCountry(countryOptions[i].code)}
          invalid={category === 'pais' && !!countryError}
          describedBy={countryError ? fid('country-error') : undefined}
        />
      </Field>
      {countryCode && !(editing && item?.category === 'pais') && (
        <Field
          label={editing ? 'Cidade' : 'Cidade · opcional'}
          htmlFor={fid('city')}
          hint={editing ? undefined : 'Sem cidade, o item é o país inteiro.'}
          error={category === 'cidade' ? countryError : null}
          errorId={fid('city-error')}
        >
          <Combobox
            id={fid('city')}
            value={cityQuery}
            onType={(v) => {
              setCityQuery(v)
              setCityArmed(true)
              setCityPlace(null)
            }}
            placeholder={`Cidades em ${countryNamePt(countryCode)}`}
            icon={<Search size={15} aria-hidden="true" />}
            options={cities.rows}
            shown={(cityArmed || (countryCode !== 'BR' && cityQuery === '')) && !cities.loading && (cities.rows.length > 0 || cityQuery.trim().length >= 2)}
            loading={cities.loading}
            onPick={(i) => pickCity(cities.rows[i])}
            invalid={category === 'cidade' && !!countryError}
            describedBy={countryError ? fid('city-error') : undefined}
          />
        </Field>
      )}
    </>
  )

  function formFields(g: ItemGroup): ReactNode {
    switch (g) {
      case 'mundo':
        return (
          <>
            {worldFields}
            {noteField}
          </>
        )
      case 'lugar':
        return (
          <>
            {placeSearch('Busca', 'Nome do lugar ou endereço com número')}
            {(place || cityOnly || editing) && nameField('Nome', 'Como vocês chamam o lugar')}
            <Choice
              label="Tipo"
              options={[
                { value: 'restaurante', label: 'Restaurante' },
                { value: 'parque', label: 'Parque' },
              ]}
              value={category as 'restaurante' | 'parque'}
              onChange={(v) => setKindChoice(v)}
              disabled={editing}
            />
            {noteField}
          </>
        )
      case 'comida':
        return (
          <>
            {nameField('O que comer', 'Acarajé, pastel de feira…')}
            {placeSearch('Onde', 'Restaurante, cidade ou endereço')}
            {noteField}
          </>
        )
      case 'tela':
        return (
          <>
            {nameField('Nome', 'Título do filme ou da série')}
            <Choice
              label="Tipo"
              options={[
                { value: 'filme', label: 'Filme' },
                { value: 'serie', label: 'Série' },
              ]}
              value={category as 'filme' | 'serie'}
              onChange={(v) => setKindChoice(v)}
              disabled={editing}
            />
            {platformField}
            {noteField}
          </>
        )
      case 'experiencia':
        return (
          <>
            {nameField('O que fazer', 'Mergulho, balão, show…')}
            {placeSearch('Onde', 'Cidade, região ou lugar')}
            {noteField}
          </>
        )
    }
  }

  const existingUrl = item?.photoPath ? (urls.get(item.photoPath) ?? null) : null
  const photoUrl = photo?.url ?? existingUrl

  const side = category && (
    <div className="ls-add-side">
      <Field label="Foto · opcional" error={photoError} errorId={fid('photo-error')}>
        <ItemPhoto category={category} url={photoUrl} className="ls-add-photo">
          <label className="ls-add-photo-change">
            <Camera size={13} aria-hidden="true" />
            {photoUrl ? 'Trocar foto' : 'Pôr foto'}
            <input
              type="file"
              accept="image/*"
              className="ls-add-file"
              aria-label="Trocar foto"
              onChange={(e) => {
                onPhotoPicked(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
        </ItemPhoto>
      </Field>

      <div className="ls-add-emphasis lg">
        <span className="ls-add-emphasis-icon" aria-hidden="true">
          <Star size={16} />
        </span>
        <span className="ls-add-emphasis-text">
          <span id={fid('featured-label')}>Dar ênfase</span>
          <span className="ls-add-emphasis-sub">Aparece em destaque</span>
        </span>
        <button type="button" role="switch" className="ls-add-switch" aria-checked={featured} aria-labelledby={fid('featured-label')} onClick={() => setFeatured(!featured)}>
          <span className="ls-add-switch-knob" aria-hidden="true" />
        </button>
      </div>
    </div>
  )

  const footer = (
    <div className="ls-add-foot">
      <span className="ls-add-who">
        <Avatar member={me} size={22} />
        {editing ? `Editando como ${me.name}` : `Adicionando como ${me.name}`}
      </span>
      <span className="ls-add-actions">
        {partial ? (
          <button type="button" className="ls-btn ls-btn--primary" onClick={close}>
            <Check size={16} aria-hidden="true" />
            Entendi
          </button>
        ) : (
          <>
            <button type="button" className="ls-btn lg" onClick={props.onClose} disabled={saving}>
              <X size={16} aria-hidden="true" />
              Cancelar
            </button>
            <button type="submit" form={formId} className="ls-btn ls-btn--primary" disabled={!category || saving || offline}>
              {editing ? <Check size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
              {saving ? 'Salvando…' : editing ? 'Salvar' : 'Adicionar à lista'}
            </button>
          </>
        )}
      </span>
    </div>
  )

  const subtitle = editing && category ? CATEGORY_LABELS[category].one : 'Escolha o que é, depois busque. O resto vem preenchido.'

  return (
    <ListDialog title={editing ? 'Editar' : 'Adicionar à lista'} subtitle={subtitle} onClose={close} footer={footer}>
      <form id={formId} className="ls-add" onSubmit={(e) => void save(e)} noValidate aria-busy={saving}>
        <fieldset className="ls-add-fieldset" disabled={locked}>
          {!editing && (
            <div className="ls-add-tiles" role="group" aria-label="O que é">
              {GROUPS.map((g, index) => {
                const Icon = g.icon
                return (
                  <button
                    key={g.key}
                    id={index === 0 ? fid('category') : undefined}
                    type="button"
                    className={`ls-add-tile ls-cat--${g.categories[0]} lg`}
                    aria-pressed={group === g.key}
                    onClick={() => pickGroup(g.key)}
                  >
                    <span className="ls-add-tile-icon" aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    {g.label}
                  </button>
                )
              })}
            </div>
          )}

          {group && (
            <div className="ls-add-body">
              <section className="ls-add-form" aria-label="Detalhes">
                {formFields(group)}
              </section>
              {side}
            </div>
          )}
        </fieldset>

        {failure && (
          <p className="ls-notice ls-notice--error lg" role="alert">
            {failure}
          </p>
        )}
        {partial && (
          <p className="ls-notice ls-notice--error lg" role="alert">
            {partial.message}
          </p>
        )}
      </form>
    </ListDialog>
  )
}

/** O `id` (sufixo) do controle que recebe o foco quando `validateItem` aponta `field`. */
function fieldTarget(field: DraftField, group: ItemGroup | null, category: ListCategory): string {
  switch (field) {
    case 'place.city':
      return group === 'mundo' ? (category === 'cidade' ? 'city' : 'country') : 'place'
    case 'place':
    case 'place.countryCode':
    case 'place.lat':
    case 'place.lng':
      return group === 'mundo' ? 'country' : 'place'
    case 'place.address':
      return 'address'
    default:
      return field
  }
}
