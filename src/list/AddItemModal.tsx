// Adicionar / editar item (os 8 modais: `RvlR2`, `i160RR`, `PmKZ4`, `cX0DT`,
// `UaQ1K`, `e3jts`, `wBKDf`, `NuAJ6`). Spec: R11–R15, seção 7, A14.
//
// ── CONTRATO (T6) — preencha SEM mudar as props ─────────────────────────────
// Quem abre: a `ListScreen`, dentro do `ListContext` (use `useList()` para
// `api`, `coupleId`, `me`, `members`, `today`, `urls`).
//
//   <AddItemModal mode="create" initialCategory?={cat} onClose onSaved />
//     - "Adicionar" do cabeçalho → sem categoria (passo 1 aberto).
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
// Decisões onde o frame não decide:
// - País não tem campo "Local" no frame: o próprio Nome é a busca de país
//   (`layer=country`); escolher um resultado põe o nome em português no Nome.
// - Foto que falha DEPOIS de o item ser gravado: o modal troca para o aviso
//   ("O item foi adicionado, mas a foto não subiu: …") com _Entendi_, e só
//   então chama `onSaved` — chamar na hora faria a tela fechar o modal e o
//   aviso sumir. Fechar por Esc/× nesse estado também chama `onSaved` (o item
//   existe; a lista precisa reler). Os campos ficam travados: salvar de novo
//   criaria um segundo item.

import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  Camera,
  Check,
  Flag,
  Layers,
  Link2,
  MapPin,
  PenLine,
  Plus,
  Search,
  Star,
  StickyNote,
  Store,
  X,
} from 'lucide-react'
import { MAX_INPUT_BYTES } from '../data/avatar'
import { PLACE_MIN_QUERY, placeDetail } from '../data/places'
import type { PlaceCandidate, PlaceMode, PlaceSearchResult } from '../data/places'
import { CATEGORY_LABELS, LIST_LIMITS, PLATFORMS, isMediaCategory, validateItem } from '../domain/list'
import type { DraftField, GeoPlace, ItemDraft, ListCategory, ListItem } from '../domain/list'
import type { ListApi } from './api'
import { CATEGORY_ICONS, catClass } from './categories'
import { failureMessage, useList } from './context'
import { Avatar, ItemPhoto, ListDialog } from './parts'

export type AddItemModalProps = (
  | { mode: 'create'; initialCategory?: ListCategory }
  | { mode: 'edit'; item: ListItem }
) & {
  onClose: () => void
  onSaved: (item: ListItem) => void
}

/** A ordem dos chips no frame (não a de `LIST_CATEGORIES`). */
const TILE_ORDER: readonly ListCategory[] = [
  'pais',
  'cidade',
  'restaurante',
  'parque',
  'comida',
  'filme',
  'serie',
  'experiencia',
]

const DEBOUNCE_MS = 350
const SEARCH_DOWN = 'A busca de lugares está fora do ar. Tente de novo daqui a pouco.'
const FALLBACK_NOTICE = 'A busca fora do Brasil não respondeu. Por enquanto, só cidades brasileiras.'
const CITY_ONLY = 'Não achei. Usar só a cidade'

/** Modo de busca por categoria (R13 / ADR 0016). Mídia não busca. */
function searchModeOf(category: ListCategory): PlaceMode | null {
  switch (category) {
    case 'pais':
      return 'country'
    case 'cidade':
    case 'comida':
      return 'city'
    case 'restaurante':
    case 'parque':
    case 'experiencia':
      return 'place'
    default:
      return null
  }
}

/** "instagram.com/x" → "https://instagram.com/x"; com esquema, fica como está (seção 9). */
function normalizeLink(raw: string): string | null {
  const link = raw.trim()
  if (link === '') return null
  if (/^[a-z][a-z0-9+.-]*:/i.test(link)) return link
  return `https://${link.replace(/^\/+/, '')}`
}

function detailsLabel(category: ListCategory): string {
  const label = CATEGORY_LABELS[category]
  return `2 · Detalhes ${label.gender === 'm' ? 'do' : 'da'} ${label.one.toLowerCase()}`
}

interface Chosen {
  label: string
  detail: string
}

/** O lugar já gravado, mostrado como resultado escolhido (edição). */
function chosenFromItem(item: ListItem): Chosen | null {
  const place = item.place
  const mode = searchModeOf(item.category)
  if (!place || !mode) return null
  const label = mode === 'country' ? place.country : mode === 'city' ? (place.city ?? place.country) : item.name
  return { label, detail: placeDetail(place, mode) }
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
function usePlaceSearch(
  api: ListApi,
  mode: PlaceMode | null,
  query: string,
  armed: boolean,
  bias: { lat: number; lng: number },
) {
  const [landed, setLanded] = useState<Landed | null>(null)
  const seq = useRef(0)
  const { lat, lng } = bias
  const q = query.trim()
  const key = `${mode}|${q}`

  useEffect(() => {
    if (!mode || !armed || q.length < PLACE_MIN_QUERY) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      const id = ++seq.current
      void api.searchPlaces(q, { mode, bias: { lat, lng }, signal: controller.signal }).then((result) => {
        if (id !== seq.current || result.status === 'aborted') return
        setLanded({ key: `${mode}|${q}`, result })
      })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [api, mode, q, armed, lat, lng])

  const active = !!mode && armed && q.length >= PLACE_MIN_QUERY
  const current = active && landed?.key === key ? landed.result : null
  /** A última resposta que chegou foi falha: sem lugar, não há como salvar geográfico. */
  const down = landed !== null && landed.result.status !== 'ok'
  return { active, current, down }
}

function PlaceCombobox({
  id,
  value,
  onType,
  placeholder,
  icon,
  search,
  onPick,
  offerCityOnly,
  onCityOnly,
  invalid,
  describedBy,
}: {
  id: string
  value: string
  onType: (value: string) => void
  placeholder?: string
  icon: ReactNode
  search: ReturnType<typeof usePlaceSearch>
  onPick: (candidate: PlaceCandidate) => void
  offerCityOnly: boolean
  onCityOnly: () => void
  invalid: boolean
  describedBy?: string
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const result = search.current
  const rows = result?.status === 'ok' ? result.rows : []
  const options: ({ kind: 'row'; row: PlaceCandidate } | { kind: 'city-only' })[] = [
    ...rows.map((row) => ({ kind: 'row' as const, row })),
    ...(offerCityOnly && result?.status === 'ok' ? [{ kind: 'city-only' as const }] : []),
  ]
  const expanded = open && search.active && result !== null && result.status === 'ok'
  const loading = open && search.active && result === null

  function choose(index: number) {
    const option = options[index]
    if (!option) return
    setOpen(false)
    setActiveIndex(-1)
    if (option.kind === 'city-only') onCityOnly()
    else onPick(option.row)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && options.length > 0) {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((i) => (i + 1) % options.length)
    } else if (event.key === 'ArrowUp' && options.length > 0) {
      event.preventDefault()
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
          maxLength={LIST_LIMITS.name}
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
      {loading && <p className="ls-add-searching">Buscando…</p>}
      {search.down && (
        <p className="ls-add-error" role="alert">
          {SEARCH_DOWN}
        </p>
      )}
      <div className="ls-add-results lg" hidden={!expanded}>
        {result?.status === 'ok' && result.fallback && <p className="ls-add-fallback">{FALLBACK_NOTICE}</p>}
        <ul id={listId} role="listbox" aria-label="Resultados da busca">
          {options.map((option, index) => (
            <li
              key={option.kind === 'row' ? `${option.row.label}|${option.row.lat}|${option.row.lng}` : 'city-only'}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              className={`ls-add-option ${option.kind === 'city-only' ? 'ls-add-option--city' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(index)}
            >
              {option.kind === 'row' ? (
                <>
                  <MapPin size={15} aria-hidden="true" />
                  <span className="ls-add-option-text">
                    <span className="ls-add-option-label">{option.row.label}</span>
                    <span className="ls-add-option-detail">{option.row.detail}</span>
                  </span>
                </>
              ) : (
                <>
                  <MapPin size={15} aria-hidden="true" />
                  <span className="ls-add-option-label">{CITY_ONLY}</span>
                </>
              )}
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="ls-add-empty">Nada encontrado para “{value.trim()}”.</p>}
        {result?.status === 'ok' && !result.fallback && <p className="ls-add-credit">© OpenStreetMap</p>}
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
  className = '',
}: {
  label: string
  htmlFor?: string
  hint?: string
  error?: string | null
  errorId?: string
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`ls-add-field ${className}`}>
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

function photoRejection(reason: 'not_image' | 'too_large'): string {
  return reason === 'not_image' ? 'Esse arquivo não é uma imagem.' : 'A foto é grande demais (até 10 MB).'
}

// ---------------------------------------------------------------------------
// O modal
// ---------------------------------------------------------------------------

export function AddItemModal(props: AddItemModalProps) {
  const { api, coupleId, me, members, urls } = useList()
  const editing = props.mode === 'edit'
  const item = props.mode === 'edit' ? props.item : null

  const [category, setCategory] = useState<ListCategory | null>(
    item ? item.category : props.mode === 'create' ? (props.initialCategory ?? null) : null,
  )
  const [name, setName] = useState(item?.name ?? '')
  const [link, setLink] = useState(item?.link ?? '')
  const [note, setNote] = useState(item?.note ?? '')
  const [featured, setFeatured] = useState(item?.featured ?? false)
  const [region, setRegion] = useState(item?.region ?? '')
  const [venue, setVenue] = useState(item?.venue ?? '')
  const [highlights, setHighlights] = useState<string[]>(item?.highlights ?? [])
  const [highlightDraft, setHighlightDraft] = useState('')
  const [platform, setPlatform] = useState<string | null>(item?.platform ?? null)
  const [otherPlatform, setOtherPlatform] = useState(
    !!item?.platform && !(PLATFORMS as readonly string[]).includes(item.platform),
  )
  const [seasons, setSeasons] = useState(item?.seasons != null ? String(item.seasons) : '')

  const [place, setPlace] = useState<GeoPlace | null>(item?.place ?? null)
  const [chosen, setChosen] = useState<Chosen | null>(item ? chosenFromItem(item) : null)
  const [placeQuery, setPlaceQuery] = useState(() => {
    if (!item?.place || item.category === 'pais') return ''
    return chosenFromItem(item)?.label ?? ''
  })
  const [armed, setArmed] = useState(false)
  const [cityOnly, setCityOnly] = useState(false)
  const [address, setAddress] = useState('')

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

  const home = members.get(me.profileId)?.homeCity ?? me.homeCity
  const baseMode = category ? searchModeOf(category) : null
  const mode: PlaceMode | null = baseMode === 'place' && cityOnly ? 'city' : baseMode
  const query = category === 'pais' ? name : placeQuery
  const search = usePlaceSearch(api, mode, query, armed, { lat: home.lat, lng: home.lng })

  // O foco vai ao campo que a validação apontou (a cada tentativa: `nonce`).
  useEffect(() => {
    if (fieldError) document.getElementById(fieldError.targetId)?.focus()
  }, [fieldError])

  const media = category !== null && isMediaCategory(category)
  const geo = category !== null && !media
  const locked = saving || partial !== null

  function errorFor(...fields: DraftField[]): string | null {
    return fieldError && fields.includes(fieldError.field) ? fieldError.message : null
  }

  function pickCategory(next: ListCategory) {
    if (editing || next === category) return
    setCategory(next)
    setPlace(null)
    setChosen(null)
    setPlaceQuery('')
    setArmed(false)
    setCityOnly(false)
    setAddress('')
    setRegion('')
    setVenue('')
    setHighlights([])
    setHighlightDraft('')
    setPlatform(null)
    setOtherPlatform(false)
    setSeasons('')
    setFieldError(null)
    setFailure(null)
  }

  function pickPlace(candidate: PlaceCandidate) {
    const { label, detail, ...geoPlace } = candidate
    setPlace(geoPlace)
    setChosen({ label, detail })
    setArmed(false)
    if (category === 'pais') setName(label)
    else setPlaceQuery(label)
    setFieldError(null)
  }

  function chooseCityOnly() {
    setCityOnly(true)
    setPlace(null)
    setChosen(null)
    // A mesma consulta roda de novo, agora na camada de cidade.
    setArmed(true)
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
    const input = document.getElementById(fid(category === 'pais' ? 'name' : 'place'))
    input?.focus()
  }

  function addHighlight() {
    const city = highlightDraft.trim()
    if (city === '') return
    if (highlights.length >= LIST_LIMITS.highlights) return
    if (!highlights.some((h) => h.toLocaleLowerCase('pt-BR') === city.toLocaleLowerCase('pt-BR'))) {
      setHighlights([...highlights, city])
    }
    setHighlightDraft('')
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
    const isMedia = isMediaCategory(cat)
    const typedAddress = address.trim()
    const geoPlace = !isMedia && place ? (cityOnly && typedAddress ? { ...place, address: typedAddress } : place) : null
    const seasonsText = seasons.trim()
    return {
      category: cat,
      name: name.trim(),
      note: note.trim() === '' ? null : note.trim(),
      link: normalizeLink(link),
      featured,
      place: geoPlace,
      region: cat === 'cidade' && region.trim() !== '' ? region.trim() : null,
      venue: cat === 'comida' && venue.trim() !== '' ? venue.trim() : null,
      highlights: cat === 'pais' ? highlights : [],
      platform: isMedia ? (platform?.trim() ?? null) : null,
      seasons: cat === 'serie' && seasonsText !== '' ? Number(seasonsText) : null,
    }
  }

  async function save(event?: FormEvent) {
    event?.preventDefault()
    if (!category || locked) return
    const draft = buildDraft(category)
    if (draft.link !== null) setLink(draft.link)
    const verdict = validateItem(draft)
    if (!verdict.ok) {
      setFieldError({
        field: verdict.field,
        message: verdict.reason,
        targetId: fid(fieldTarget(verdict.field, category)),
        nonce: ++attempts.current,
      })
      return
    }
    setFieldError(null)
    setFailure(null)
    setSaving(true)

    const written = item ? await api.updateItem(item.id, draft) : await api.createItem(coupleId, draft)
    if (written.status !== 'ok') {
      setSaving(false)
      setFailure(
        written.status === 'invalid'
          ? `O banco recusou (${written.constraint}): ${written.cause}`
          : failureMessage(written),
      )
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
          message: item
            ? `As alterações foram salvas, mas a foto não subiu: ${cause}`
            : `O item foi adicionado, mas a foto não subiu: ${cause}`,
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
  const offline = search.down && geo && place === null

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

  const nameField =
    category === 'pais' && mode ? (
      <Field label="Nome" htmlFor={fid('name')} error={nameError ?? placeError} errorId={fid('name-error')}>
        <PlaceCombobox
          id={fid('name')}
          value={name}
          onType={(v) => {
            setName(v)
            setArmed(true)
          }}
          placeholder="Busque o país"
          icon={<Flag size={15} aria-hidden="true" />}
          search={search}
          onPick={pickPlace}
          offerCityOnly={false}
          onCityOnly={chooseCityOnly}
          invalid={!!(nameError ?? placeError)}
          describedBy={nameError || placeError ? fid('name-error') : undefined}
        />
        {chosenCard}
      </Field>
    ) : (
      <Field label="Nome" htmlFor={fid('name')} error={nameError} errorId={fid('name-error')}>
        <div className={`ls-add-input ${nameError ? 'is-invalid' : ''} lg`}>
          <PenLine size={15} aria-hidden="true" />
          <input
            id={fid('name')}
            type="text"
            value={name}
            maxLength={LIST_LIMITS.name}
            aria-invalid={!!nameError || undefined}
            aria-describedby={nameError ? fid('name-error') : undefined}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      </Field>
    )

  const textField = (
    field: 'link' | 'note' | 'region' | 'venue' | 'address' | 'country',
    label: string,
    value: string,
    onChange: ((v: string) => void) | null,
    icon: ReactNode,
    extra: { hint?: string; maxLength?: number; placeholder?: string; errorFields?: DraftField[] } = {},
  ) => {
    const error = extra.errorFields ? errorFor(...extra.errorFields) : null
    return (
      <Field label={label} htmlFor={fid(field)} hint={extra.hint} error={error} errorId={fid(`${field}-error`)}>
        <div className={`ls-add-input ${error ? 'is-invalid' : ''} ${onChange ? '' : 'is-readonly'} lg`}>
          {icon}
          <input
            id={fid(field)}
            type={field === 'link' ? 'url' : 'text'}
            inputMode={field === 'link' ? 'url' : undefined}
            value={value}
            readOnly={!onChange}
            maxLength={extra.maxLength}
            placeholder={extra.placeholder}
            aria-invalid={!!error || undefined}
            aria-describedby={error ? fid(`${field}-error`) : undefined}
            onChange={onChange ? (e) => onChange(e.target.value) : undefined}
          />
        </div>
      </Field>
    )
  }

  const linkField = textField('link', 'Link', link, setLink, <Link2 size={15} aria-hidden="true" />, {
    maxLength: LIST_LIMITS.link,
    errorFields: ['link'],
  })
  const noteField = (
    <Field label="Nota" htmlFor={fid('note')} error={errorFor('note')} errorId={fid('note-error')}>
      <div className={`ls-add-input ls-add-input--area ${errorFor('note') ? 'is-invalid' : ''} lg`}>
        <StickyNote size={15} aria-hidden="true" />
        <textarea
          id={fid('note')}
          rows={2}
          value={note}
          maxLength={LIST_LIMITS.note}
          aria-invalid={!!errorFor('note') || undefined}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
    </Field>
  )

  const placeLabel = category === 'cidade' ? 'Local · busca de cidade' : category === 'comida' ? 'Local · cidade' : 'Local'
  const localField = mode && category !== 'pais' && (
    <>
      <Field label={placeLabel} htmlFor={fid('place')} error={placeError} errorId={fid('place-error')}>
        <PlaceCombobox
          id={fid('place')}
          value={placeQuery}
          onType={(v) => {
            setPlaceQuery(v)
            setArmed(true)
          }}
          placeholder={
            category === 'experiencia'
              ? 'Busque cidade, região ou endereço (ex.: Capadócia)'
              : mode === 'city'
                ? 'Busque a cidade'
                : 'Busque o lugar ou o endereço'
          }
          icon={<Search size={15} aria-hidden="true" />}
          search={search}
          onPick={pickPlace}
          offerCityOnly={baseMode === 'place' && !cityOnly}
          onCityOnly={chooseCityOnly}
          invalid={!!placeError}
          describedBy={placeError ? fid('place-error') : undefined}
        />
        {chosenCard}
        {cityOnly && (
          <p className="ls-add-hint">
            Buscando só a cidade. O pin fica no centro dela.{' '}
            <button type="button" className="ls-add-link-btn" onClick={backToPlaceSearch}>
              Buscar o lugar de novo
            </button>
          </p>
        )}
      </Field>
      {cityOnly &&
        textField('address', 'Endereço', address, setAddress, <MapPin size={15} aria-hidden="true" />, {
          maxLength: LIST_LIMITS.address,
          placeholder: 'Rua, número, bairro',
          errorFields: ['place.address'],
        })}
    </>
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

  const seasonsError = errorFor('seasons')
  const seasonsField = (
    <Field label="Temporadas" htmlFor={fid('seasons')} error={seasonsError} errorId={fid('seasons-error')}>
      <div className={`ls-add-input ls-add-input--short ${seasonsError ? 'is-invalid' : ''} lg`}>
        <Layers size={15} aria-hidden="true" />
        <input
          id={fid('seasons')}
          type="number"
          inputMode="numeric"
          min={LIST_LIMITS.seasonsMin}
          max={LIST_LIMITS.seasonsMax}
          step={1}
          placeholder="Opcional"
          value={seasons}
          aria-invalid={!!seasonsError || undefined}
          onChange={(e) => setSeasons(e.target.value)}
        />
      </div>
    </Field>
  )

  const highlightsError = errorFor('highlights')
  const highlightsField = (
    <Field
      label="Cidades que interessam"
      htmlFor={fid('highlights')}
      hint="Aparece como segunda linha do item na lista"
      error={highlightsError}
      errorId={fid('highlights-error')}
    >
      <div className="ls-add-chips">
        {highlights.map((city) => (
          <span key={city} className="ls-chip ls-add-highlight lg">
            <span className="ls-dot ls-cat--cidade" aria-hidden="true" />
            {city}
            <button
              type="button"
              className="ls-add-remove"
              aria-label={`Remover ${city}`}
              onClick={() => setHighlights(highlights.filter((h) => h !== city))}
            >
              ×
            </button>
          </span>
        ))}
        <span className="ls-chip ls-add-highlight-new lg">
          <Plus size={15} aria-hidden="true" />
          <input
            id={fid('highlights')}
            type="text"
            placeholder="Adicionar cidade"
            aria-label="Adicionar cidade"
            value={highlightDraft}
            maxLength={LIST_LIMITS.highlight}
            disabled={highlights.length >= LIST_LIMITS.highlights}
            onChange={(e) => setHighlightDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault()
                addHighlight()
              }
            }}
            onBlur={addHighlight}
          />
        </span>
      </div>
    </Field>
  )

  function formFields(cat: ListCategory): ReactNode {
    switch (cat) {
      case 'pais':
        return (
          <>
            {nameField}
            {highlightsField}
            {linkField}
            {noteField}
          </>
        )
      case 'cidade':
        return (
          <>
            <div className="ls-add-row">
              {nameField}
              {textField('country', 'País', place?.country ?? '', null, <Flag size={15} aria-hidden="true" />, {
                placeholder: 'Vem do local',
              })}
            </div>
            {textField('region', 'Região', region, setRegion, <MapPin size={15} aria-hidden="true" />, {
              hint: 'Aparece como segunda linha do item na lista',
              maxLength: LIST_LIMITS.region,
              errorFields: ['region'],
            })}
            {localField}
            {linkField}
            {noteField}
          </>
        )
      case 'comida':
        return (
          <>
            {nameField}
            {textField('venue', 'Onde comer · opcional', venue, setVenue, <Store size={15} aria-hidden="true" />, {
              hint: 'Pode ficar vazio se for um prato, não um lugar',
              maxLength: LIST_LIMITS.venue,
              errorFields: ['venue'],
            })}
            {localField}
            {linkField}
            {noteField}
          </>
        )
      case 'restaurante':
      case 'parque':
      case 'experiencia':
        return (
          <>
            {nameField}
            {linkField}
            {localField}
            {noteField}
          </>
        )
      case 'filme':
      case 'serie':
        return (
          <>
            {nameField}
            {platformField}
            {cat === 'serie' && seasonsField}
            {linkField}
            {noteField}
          </>
        )
    }
  }

  const existingUrl = item?.photoPath ? (urls.get(item.photoPath) ?? null) : null
  const photoUrl = photo?.url ?? existingUrl
  const CategoryIcon = category ? CATEGORY_ICONS[category] : null

  const side = category && (
    <div className="ls-add-side">
      <Field label="Foto" error={photoError} errorId={fid('photo-error')}>
        <ItemPhoto category={category} url={photoUrl} className="ls-add-photo">
          <label className="ls-add-photo-change">
            <Camera size={13} aria-hidden="true" />
            Trocar foto
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

      {media ? (
        <div className="ls-add-preview ls-add-preview--media lg">
          <p className="ls-add-preview-head">Sem local</p>
          <p className="ls-add-hint">
            Filmes e séries não aparecem no globo, só na lista e nas sugestões pras noites em que vocês estão longe.
          </p>
        </div>
      ) : (
        <div className={`ls-add-preview ${catClass(category)}`}>
          <p className="ls-add-preview-head">
            Vai virar um pin no globo
            <MapPin size={14} aria-hidden="true" />
          </p>
          <div className="ls-add-map lg">
            <span className="ls-add-map-pin" aria-hidden="true">
              {CategoryIcon && <CategoryIcon size={15} />}
            </span>
            <span className="ls-add-map-label">{chosen?.label ?? 'Escolha o local'}</span>
          </div>
          {category === 'pais' && (
            <p className="ls-add-hint">
              O pin fica no centro do país, não num endereço. As cidades acima não viram pins.
            </p>
          )}
        </div>
      )}

      <div className="ls-add-emphasis lg">
        <span className="ls-add-emphasis-icon" aria-hidden="true">
          <Star size={16} />
        </span>
        <span className="ls-add-emphasis-text">
          <span id={fid('featured-label')}>Dar ênfase</span>
          <span className="ls-add-emphasis-sub">Aparece em destaque</span>
        </span>
        <button
          type="button"
          role="switch"
          className="ls-add-switch"
          aria-checked={featured}
          aria-labelledby={fid('featured-label')}
          onClick={() => setFeatured(!featured)}
        >
          <span className="ls-add-switch-knob" aria-hidden="true" />
        </button>
      </div>
    </div>
  )

  const subtitle = media
    ? 'Filmes e séries: sem local, com plataforma'
    : 'Escolha a categoria primeiro. Os campos mudam conforme ela.'

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
            <button
              type="submit"
              form={formId}
              className="ls-btn ls-btn--primary"
              disabled={!category || saving || offline}
            >
              {editing ? <Check size={17} aria-hidden="true" /> : <Plus size={17} aria-hidden="true" />}
              {saving ? 'Salvando…' : editing ? 'Salvar' : 'Adicionar à lista'}
            </button>
          </>
        )}
      </span>
    </div>
  )

  return (
    <ListDialog title={editing ? 'Editar' : 'Adicionar à lista'} subtitle={subtitle} onClose={close} footer={footer}>
      <form id={formId} className="ls-add" onSubmit={(e) => void save(e)} noValidate aria-busy={saving}>
        <fieldset className="ls-add-fieldset" disabled={locked}>
          <section className="ls-add-step" aria-labelledby={fid('step1')}>
            <p className="ls-add-step-label" id={fid('step1')}>
              1 · Categoria
            </p>
            <div className="ls-add-tiles" role="group" aria-labelledby={fid('step1')}>
              {TILE_ORDER.map((cat, index) => {
                const Icon = CATEGORY_ICONS[cat]
                return (
                  <button
                    key={cat}
                    id={index === 0 ? fid('category') : undefined}
                    type="button"
                    className={`ls-add-tile ${catClass(cat)} lg`}
                    aria-pressed={category === cat}
                    disabled={editing && category !== cat}
                    onClick={() => pickCategory(cat)}
                  >
                    <span className="ls-add-tile-icon" aria-hidden="true">
                      <Icon size={17} />
                    </span>
                    {CATEGORY_LABELS[cat].many}
                  </button>
                )
              })}
            </div>
            {editing && <p className="ls-add-hint">A categoria não muda na edição. Pra trocar, apague o item e adicione de novo.</p>}
          </section>

          {category && (
            <div className="ls-add-body">
              <section className="ls-add-form" aria-labelledby={fid('step2')}>
                <p className="ls-add-step-label" id={fid('step2')}>
                  {detailsLabel(category)}
                </p>
                {formFields(category)}
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
function fieldTarget(field: DraftField, category: ListCategory | null): string {
  switch (field) {
    case 'place':
    case 'place.city':
    case 'place.countryCode':
    case 'place.lat':
    case 'place.lng':
      return category === 'pais' ? 'name' : 'place'
    case 'place.address':
      return 'address'
    default:
      return field
  }
}
