// Os editores do roteiro, sem frame próprio (spec R19, R20): o **item do
// roteiro** (novo/editar) e o **título do dia**, na moldura do `CalDialog` do
// Calendário e com os campos `Form Field` do `xLhij`.
//
// R27: o modal fica aberto e desabilitado enquanto grava; na falha continua
// aberto com a causa; depois do `ok`, relê e fecha.

import { useId, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { CalendarDays, Check, Clock, Link2, ListPlus, StickyNote, Trash2, Type, X } from 'lucide-react'
import { CalDialog, ModalField } from '../../calendar/CalDialog'
import type { ListCategory, ListItem } from '../../domain/list'
import { CATEGORY_LABELS } from '../../domain/list'
import { tripDates } from '../../domain/tripDerive'
import { ITINERARY_KINDS, ITINERARY_KIND_LABEL, TRIP_LIMITS } from '../../domain/trips'
import type { ItineraryDraft, ItineraryItem, ItineraryKind, Trip } from '../../domain/trips'
import { validateDayTitle, validateItinerary } from '../../domain/tripValidation'
import type { ItineraryField } from '../../domain/tripValidation'
import { useTrips } from '../context'
import { ITINERARY_VISUAL, dayOptionLabel, toneStyle } from './format'
import { useTripWrite } from './useTripWrite'

export type ItineraryModalMode =
  | { kind: 'new'; day: string; listItemId?: string | null }
  | { kind: 'edit'; item: ItineraryItem }

/** A categoria da Lista → o tipo do item do roteiro, quando o vínculo preenche o tipo (R19). */
const KIND_OF_CATEGORY: Record<ListCategory, ItineraryKind> = {
  pais: 'cidade',
  cidade: 'cidade',
  restaurante: 'restaurante',
  parque: 'parque',
  comida: 'comida',
  experiencia: 'experiencia',
  filme: 'outro',
  serie: 'outro',
}

export function ItineraryModal({ trip, mode, onClose }: { trip: Trip; mode: ItineraryModalMode; onClose: () => void }) {
  const { api, coupleId, listItems } = useTrips()
  const fid = useId()
  const editing = mode.kind === 'edit'
  const initialLink = mode.kind === 'edit' ? mode.item.listItemId : (mode.listItemId ?? null)
  const linked = initialLink ? listItems.find((i) => i.id === initialLink) : undefined

  const [day, setDay] = useState(mode.kind === 'edit' ? mode.item.day : mode.day)
  const [at, setAt] = useState(mode.kind === 'edit' ? (mode.item.at ?? '') : '')
  const [title, setTitle] = useState(mode.kind === 'edit' ? mode.item.title : (linked?.name ?? ''))
  const [kind, setKind] = useState<ItineraryKind>(
    mode.kind === 'edit' ? mode.item.kind : linked ? KIND_OF_CATEGORY[linked.category] : 'outro',
  )
  const [kindTouched, setKindTouched] = useState(editing || !!linked)
  const [note, setNote] = useState(mode.kind === 'edit' ? (mode.item.note ?? '') : '')
  const [listItemId, setListItemId] = useState<string | null>(initialLink)
  const [invalid, setInvalid] = useState<{ field: ItineraryField; reason: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { pending, failure, run } = useTripWrite()

  const days = tripDates(trip)
  if (!days.includes(day)) days.push(day)

  const errorFor = (field: ItineraryField) => (invalid?.field === field ? invalid.reason : null)

  function pickLink(id: string | null) {
    setListItemId(id)
    const item = id ? listItems.find((i) => i.id === id) : undefined
    if (!item) return
    if (title.trim() === '') setTitle(item.name)
    if (!kindTouched) setKind(KIND_OF_CATEGORY[item.category])
  }

  async function save() {
    const draft: ItineraryDraft = {
      day,
      at: at === '' ? null : at.slice(0, 5),
      title: title.trim(),
      kind,
      note: note.trim() === '' ? null : note.trim(),
      listItemId,
    }
    const v = validateItinerary(draft)
    if (!v.ok) {
      setInvalid({ field: v.field, reason: v.reason })
      document.getElementById(`${fid}-${v.field}`)?.focus()
      return
    }
    setInvalid(null)
    const ok = await run(async () =>
      mode.kind === 'edit' ? api.updateItinerary(mode.item.id, draft) : api.createItinerary(coupleId, trip, draft),
    )
    if (ok) onClose()
  }

  async function erase() {
    if (mode.kind !== 'edit') return
    const ok = await run(() => api.deleteItinerary(mode.item.id), 'Não deu pra apagar')
    if (ok) onClose()
  }

  const Icon = ITINERARY_VISUAL[kind].icon

  const footer = confirmDelete ? (
    <div className="cal-modal-confirm" role="group" aria-label="Apagar item">
      <p>Apagar {mode.kind === 'edit' ? mode.item.title : ''} do roteiro?</p>
      <span className="cal-modal-actions">
        <button type="button" className="cal-btn" onClick={() => setConfirmDelete(false)} disabled={pending}>
          Voltar
        </button>
        <button type="button" className="cal-btn cal-btn--danger" onClick={() => void erase()} disabled={pending}>
          <Trash2 size={16} aria-hidden="true" />
          {pending ? 'Apagando…' : 'Apagar'}
        </button>
      </span>
    </div>
  ) : (
    <>
      {editing && (
        <button type="button" className="cal-btn cal-btn--ghost-danger" onClick={() => setConfirmDelete(true)} disabled={pending}>
          <Trash2 size={16} aria-hidden="true" />
          Apagar
        </button>
      )}
      <span className="cal-modal-actions">
        <button type="button" className="cal-btn" onClick={onClose} disabled={pending}>
          Cancelar
        </button>
        <button type="button" className="cal-btn cal-btn--primary" onClick={() => void save()} disabled={pending}>
          <Check size={17} aria-hidden="true" />
          {pending ? 'Salvando…' : 'Salvar item'}
        </button>
      </span>
    </>
  )

  return (
    <CalDialog
      title={editing ? 'Editar item do roteiro' : 'Novo item no roteiro'}
      subtitle={trip.title}
      icon={<Icon size={20} />}
      iconClass="td-modal-icon"
      onClose={onClose}
      closeDisabled={pending}
      footer={footer}
    >
      <fieldset className="cal-mf-fieldset" disabled={pending} aria-busy={pending}>
        <div className="cal-mf-row">
          <ModalField label="Dia" htmlFor={`${fid}-day`} field="day" error={errorFor('day')}>
            <div className="cal-mf-input">
              <CalendarDays size={15} aria-hidden="true" />
              <select id={`${fid}-day`} className="td-select" value={day} onChange={(e) => setDay(e.target.value)}>
                {days.map((d) => (
                  <option key={d} value={d}>
                    {dayOptionLabel(trip, d)}
                  </option>
                ))}
              </select>
            </div>
          </ModalField>
          <ModalField label="Hora" htmlFor={`${fid}-at`} field="at" error={errorFor('at')}>
            <div className="cal-mf-input cal-mf-input--time">
              <Clock size={15} aria-hidden="true" />
              <input id={`${fid}-at`} type="time" value={at} onChange={(e) => setAt(e.target.value)} />
            </div>
          </ModalField>
        </div>

        <ModalField label="Título" htmlFor={`${fid}-title`} field="title" error={errorFor('title')}>
          <div className={`cal-mf-input ${errorFor('title') ? 'is-invalid' : ''}`}>
            <Type size={15} aria-hidden="true" />
            <input
              id={`${fid}-title`}
              type="text"
              value={title}
              maxLength={TRIP_LIMITS.itineraryTitle}
              placeholder="Trilha até a Praia do Bonete"
              aria-invalid={!!errorFor('title') || undefined}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
        </ModalField>

        <ModalField label="Tipo" field="kind" error={errorFor('kind')}>
          <div className="td-kinds" role="group" aria-label="Tipo">
            {ITINERARY_KINDS.map((k) => {
              const V = ITINERARY_VISUAL[k]
              return (
                <button
                  key={k}
                  type="button"
                  className="td-kind lg"
                  style={toneStyle(V.tone)}
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k)
                    setKindTouched(true)
                  }}
                >
                  <V.icon size={14} aria-hidden="true" />
                  {ITINERARY_KIND_LABEL[k]}
                </button>
              )
            })}
          </div>
        </ModalField>

        <ModalField label="Nota" htmlFor={`${fid}-note`} field="note" error={errorFor('note')}>
          <div className={`cal-mf-input ${errorFor('note') ? 'is-invalid' : ''}`}>
            <StickyNote size={15} aria-hidden="true" />
            <input
              id={`${fid}-note`}
              type="text"
              value={note}
              maxLength={TRIP_LIMITS.itineraryNote}
              placeholder="opcional"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </ModalField>

        <ModalField label="Da lista" htmlFor={`${fid}-listItemId`} field="link" error={errorFor('listItemId')}>
          <ListLink id={`${fid}-listItemId`} items={listItems} value={listItemId} onChange={pickLink} />
        </ModalField>

        {failure && (
          <p className="cal-mf-error" role="alert">
            {failure}
          </p>
        )}
      </fieldset>
    </CalDialog>
  )
}

// ---------------------------------------------------------------------------
// Título do dia (R20)
// ---------------------------------------------------------------------------

export function DayTitleModal({ trip, day, onClose }: { trip: Trip; day: string; onClose: () => void }) {
  const { api, coupleId } = useTrips()
  const fid = useId()
  const current = trip.days.find((d) => d.day === day)?.title ?? ''
  const [title, setTitle] = useState(current)
  const [invalid, setInvalid] = useState<string | null>(null)
  const { pending, failure, run } = useTripWrite()

  async function save() {
    const value = title.trim()
    if (value !== '') {
      const v = validateDayTitle(value)
      if (!v.ok) {
        setInvalid(v.reason)
        return
      }
    }
    setInvalid(null)
    const ok = await run(() => api.setDayTitle(coupleId, trip.id, day, value === '' ? null : value))
    if (ok) onClose()
  }

  return (
    <CalDialog
      title="Título do dia"
      subtitle={dayOptionLabel(trip, day)}
      onClose={onClose}
      closeDisabled={pending}
      footer={
        <span className="cal-modal-actions">
          <button type="button" className="cal-btn" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button type="button" className="cal-btn cal-btn--primary" onClick={() => void save()} disabled={pending}>
            <Check size={17} aria-hidden="true" />
            {pending ? 'Salvando…' : 'Salvar'}
          </button>
        </span>
      }
    >
      <fieldset className="cal-mf-fieldset" disabled={pending} aria-busy={pending}>
        <ModalField label="Título" htmlFor={`${fid}-title`} field="title" error={invalid}>
          <div className={`cal-mf-input ${invalid ? 'is-invalid' : ''}`}>
            <Type size={15} aria-hidden="true" />
            <input
              id={`${fid}-title`}
              type="text"
              value={title}
              maxLength={TRIP_LIMITS.dayTitle}
              placeholder="Chegada e pôr do sol"
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void save()
                }
              }}
            />
          </div>
        </ModalField>
        <p className="cal-mf-hint">Deixe em branco para tirar o título.</p>
        {failure && (
          <p className="cal-mf-error" role="alert">
            {failure}
          </p>
        )}
      </fieldset>
    </CalDialog>
  )
}

// ---------------------------------------------------------------------------
// Da lista — o _Vínculo com a lista_ do Calendário (EventModal), aqui com o
// ícone de adicionar: busca por nome nos itens do casal; escolhido vira chip.
// ---------------------------------------------------------------------------

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

const LINK_LIMIT = 6

function ListLink({
  id,
  items,
  value,
  onChange,
}: {
  id: string
  items: readonly ListItem[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  if (value !== null) {
    const item = items.find((i) => i.id === value)
    return (
      <div className="cal-mf-input cal-mf-input--chosen">
        <Link2 size={15} aria-hidden="true" />
        <span className="cal-mf-chosen" id={id} tabIndex={-1}>
          {item ? item.name : 'Item da lista'}
          {item && <span className="cal-mf-chosen-sub"> · {CATEGORY_LABELS[item.category].one}</span>}
        </span>
        <button type="button" className="cal-mf-x" aria-label="Desfazer vínculo" onClick={() => onChange(null)}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    )
  }

  const q = fold(query)
  const matches = q === '' ? [] : items.filter((i) => fold(i.name).includes(q)).slice(0, LINK_LIMIT)
  const expanded = open && matches.length > 0

  function choose(index: number) {
    const item = matches[index]
    if (!item) return
    setQuery('')
    setOpen(false)
    setActive(-1)
    onChange(item.id)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && matches.length > 0) {
      event.preventDefault()
      setOpen(true)
      setActive((i) => (i + 1) % matches.length)
    } else if (event.key === 'ArrowUp' && matches.length > 0) {
      event.preventDefault()
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (expanded && active >= 0) choose(active)
    } else if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="cal-city">
      <div className="cal-mf-input">
        <ListPlus size={15} aria-hidden="true" />
        <input
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          placeholder="Busque um item da lista"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
      </div>
      <div className="cal-city-results" hidden={!expanded}>
        <ul id={listId} role="listbox" aria-label="Itens da lista">
          {matches.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              className="cal-city-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(index)}
            >
              {item.name}
              <span className="cal-mf-chosen-sub"> · {CATEGORY_LABELS[item.category].one}</span>
            </li>
          ))}
        </ul>
      </div>
      {open && q !== '' && matches.length === 0 && <p className="cal-mf-hint">Nenhum item com “{query.trim()}”.</p>}
    </div>
  )
}
