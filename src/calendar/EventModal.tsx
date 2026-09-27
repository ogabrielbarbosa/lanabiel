// Novo evento / Editar evento (`BOR8L`, modal `wfbuT`). Spec: R18–R20, I6, I8,
// I11, seção 7 ("Evento de viagem — cascata"), A18.
//
// ── CONTRATO ────────────────────────────────────────────────────────────────
//   <EventModal env mode={{ kind: 'new', day, preset? }} onClose onSaved />
//   <EventModal env mode={{ kind: 'edit', event }} onClose onSaved />
//
//   `env` é um `ModalEnv` (modalEnv.ts). Dentro da `CalendarScreen`, o próprio
//   contexto (`useCalendar()`) serve. FORA dela — o _Agendar_ da Lista (R23):
//
//     const env = await loadModalEnv(calendarApi)       // DataResult<ModalEnv>
//     if (env.status === 'ok')
//       <EventModal env={env.rows}
//         mode={{ kind: 'new', day: env.rows.today,
//                 preset: { kind: 'date', title: item.name, listItemId: item.id } }}
//         onClose={fechar}
//         onSaved={({ startsOn }) => { fechar(); avisar(`Agendado para ${shortDayMonth(startsOn)}`) }} />
//
//     (com `import './calendar.css'` já feito pelo próprio modal). Leitura que
//     não deu `ok` → a Lista mostra a causa em vez do modal.
//
//   onSaved(outcome): o banco devolveu `ok`. Quem abriu relê e fecha; o modal
//     fica desabilitado até a promessa resolver. NÃO chame `reload()` aqui e no
//     modal ao mesmo tempo.
//   Na falha, fica aberto com o que foi digitado e a causa (R25).
// ─────────────────────────────────────────────────────────────────────────────
//
// Viagem e Visita pintam o período UMA vez, ao criar (I6, ADR 0018): a prévia
// _Período automático_ é `entriesForEvent` + `paintStays` + `previewImpact`,
// a mesma regra de `create_event`. Na edição, o bloco dá lugar ao aviso de que
// mudar datas ou destino não mexe no período. _"Avisar a…"_ não existe
// (seção 14).

import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Clock,
  Link2,
  PlaneLanding,
  PlaneTakeoff,
  Repeat,
  Sparkles,
  StickyNote,
  Trash2,
  Type,
  X,
} from 'lucide-react'
import {
  CALENDAR_LIMITS,
  EVENT_KINDS,
  EVENT_KIND_LABEL,
  TRAVEL_KINDS,
  entriesForEvent,
  paintStays,
  previewImpact,
  shortCityName,
  validateEvent,
} from '../domain/calendar'
import type { Band, CalendarEvent, EventDraft, EventField, EventKind, Travelers } from '../domain/calendar'
import { LIST_CATEGORY_LABEL } from '../domain/settings'
import { addDays, daysInclusive, shortDayMonth, weekdayOf } from '../lib/date'
import { BandStrip, CalDialog, ModalField, ModalSwitch } from './CalDialog'
import { CityPicker } from './CityPicker'
import { previewCityId, resolveCity } from './cityChoice'
import type { CityChoice } from './cityChoice'
import { writeFailureMessage } from './context'
import type { CalendarPerson } from './context'
import type { ModalEnv } from './modalEnv'
import { bandsByDay, daysBetween, monthNameOf } from './modalPreview'
import { Avatar, BigPair, DateField } from './parts'
import { EVENT_ICONS, bandColor } from './view'
import './calendar.css'
import './modals.css'

export type EventModalMode =
  | { kind: 'new'; day: string; preset?: Partial<EventDraft> }
  | { kind: 'edit'; event: CalendarEvent }

export interface EventSaved {
  action: 'created' | 'updated' | 'deleted'
  /** O dia do evento gravado (ou do apagado) — o "Agendado para {d mmm}" da Lista. */
  startsOn: string
}

export interface EventModalProps {
  env: ModalEnv
  mode: EventModalMode
  onClose: () => void
  onSaved: (outcome: EventSaved) => void | Promise<void>
}

const SUBTITLE = 'Visitas e viagens já criam o período de onde vocês vão estar'
const EDIT_TRAVEL_NOTICE = 'Mudar datas ou destino aqui não muda o período — ajuste no calendário.'

const isTravel = (kind: EventKind): boolean => (TRAVEL_KINDS as readonly EventKind[]).includes(kind)
/** Tipos com hora de começo e o _Dia inteiro_ (a hora do lembrete é o _Até_). */
const hasClock = (kind: EventKind): boolean => isTravel(kind) || kind === 'date' || kind === 'compromisso'
const hasPlace = (kind: EventKind): boolean => kind === 'date' || kind === 'compromisso'
const hasLink = (kind: EventKind): boolean => isTravel(kind) || kind === 'date'
const hasEnd = (kind: EventKind): boolean => isTravel(kind) || kind === 'compromisso'

interface FormState {
  kind: EventKind
  title: string
  startsOn: string
  endsOn: string
  /** O interruptor: esconde as horas. Hora nenhuma preenchida também é dia inteiro. */
  allDaySwitch: boolean
  startsAt: string
  endsAt: string
  travelers: Travelers | null
  travelerId: string | null
  dest: CityChoice | null
  /** A pessoa escolheu o destino: trocar _Quem viaja_ não o muda mais. */
  destTouched: boolean
  place: string
  repeatsYearly: boolean
  note: string
  listItemId: string | null
}

/** _Visita_: destino padrão na casa da OUTRA pessoa; com os dois, vazio (R18). */
function defaultDest(env: ModalEnv, kind: EventKind, travelers: Travelers | null, travelerId: string | null): CityChoice | null {
  if (kind !== 'visita' || travelers !== 'solo' || travelerId === null) return null
  const other = env.people[1].profileId === travelerId ? env.people[2] : env.people[1]
  return other.homeCity
}

/** Os padrões por tipo: Viagem → os dois; Visita → quem cria (R18). */
function travelDefaults(env: ModalEnv, kind: EventKind): Pick<FormState, 'travelers' | 'travelerId' | 'dest'> {
  if (kind === 'viagem') return { travelers: 'both', travelerId: null, dest: null }
  if (kind === 'visita') return { travelers: 'solo', travelerId: env.me.profileId, dest: defaultDest(env, 'visita', 'solo', env.me.profileId) }
  return { travelers: null, travelerId: null, dest: null }
}

function initialState(env: ModalEnv, mode: EventModalMode): FormState {
  if (mode.kind === 'edit') {
    const e = mode.event
    return {
      kind: e.kind,
      title: e.title,
      startsOn: e.startsOn,
      endsOn: e.endsOn ?? '',
      allDaySwitch: e.allDay && hasClock(e.kind),
      startsAt: e.startsAt ?? '',
      endsAt: e.endsAt ?? '',
      travelers: e.travelers,
      travelerId: e.travelerId,
      dest: e.cityId === null ? null : (env.cities.get(e.cityId) ?? null),
      destTouched: true,
      place: e.place ?? '',
      repeatsYearly: e.repeatsYearly,
      note: e.note ?? '',
      listItemId: e.listItemId,
    }
  }
  const p = mode.preset ?? {}
  const kind = p.kind ?? 'visita'
  const travel = travelDefaults(env, kind)
  const travelers = p.travelers !== undefined ? p.travelers : travel.travelers
  const travelerId = p.travelerId !== undefined ? p.travelerId : travel.travelerId
  const presetCity = p.cityId ? (env.cities.get(p.cityId) ?? null) : null
  return {
    kind,
    title: p.title ?? '',
    startsOn: p.startsOn ?? mode.day,
    endsOn: p.endsOn ?? '',
    allDaySwitch: false,
    startsAt: p.startsAt ?? '',
    endsAt: p.endsAt ?? '',
    travelers,
    travelerId,
    dest: presetCity ?? defaultDest(env, kind, travelers, travelerId),
    destTouched: presetCity !== null,
    place: p.place ?? '',
    repeatsYearly: p.repeatsYearly ?? kind === 'data_especial',
    note: p.note ?? '',
    listItemId: p.listItemId ?? null,
  }
}

/** O rascunho que `validateEvent` e o banco julgam; a cidade do mundo com id provisório. */
function draftOf(s: FormState, cityId?: string): EventDraft {
  const travel = isTravel(s.kind)
  const clock = hasClock(s.kind) && !s.allDaySwitch
  const startsAt = s.kind === 'lembrete' ? s.startsAt || null : clock ? s.startsAt || null : null
  const endsAt = travel && clock ? s.endsAt || null : null
  const trim = (v: string) => (v.trim() === '' ? null : v.trim())
  return {
    kind: s.kind,
    title: s.title.trim(),
    startsOn: s.startsOn,
    endsOn: hasEnd(s.kind) ? s.endsOn || null : null,
    allDay: startsAt === null && endsAt === null,
    startsAt,
    endsAt,
    travelers: travel ? s.travelers : null,
    travelerId: travel && s.travelers === 'solo' ? s.travelerId : null,
    cityId: travel ? (cityId ?? (s.dest ? previewCityId(s.dest) : null)) : null,
    place: hasPlace(s.kind) ? trim(s.place) : null,
    repeatsYearly: s.kind === 'data_especial' && s.repeatsYearly,
    note: trim(s.note),
    listItemId: hasLink(s.kind) ? s.listItemId : null,
  }
}

/** O controle que recebe o foco quando `validateEvent` aponta `field`. */
function targetOf(field: EventField): string {
  switch (field) {
    case 'travelerId':
      return 'travelers'
    case 'allDay':
      return 'startsAt'
    default:
      return field
  }
}

/** As iniciais da linha de dias da prévia (`K2CKom`), a partir do domingo. */
const STRIP_WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/** O nome do estado no cartão da prévia: "Juntos em Marau", "Viajando juntos"… */
function stateName(band: Band, env: ModalEnv): string {
  switch (band) {
    case 'home1':
      return `Juntos em ${shortCityName(env.people[1].homeCity.name)}`
    case 'home2':
      return `Juntos em ${shortCityName(env.people[2].homeCity.name)}`
    case 'away':
      return 'Viajando juntos'
    case 'apart':
      return 'Separados'
    case 'unknown':
      return 'Sem registro'
  }
}

export function EventModal({ env, mode, onClose, onSaved }: EventModalProps) {
  const { api, coupleId, people, members, stays, settings, today } = env
  const editing = mode.kind === 'edit'
  const [s, setS] = useState<FormState>(() => initialState(env, mode))
  const [fieldError, setFieldError] = useState<{ field: EventField; message: string; nonce: number } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const attempts = useRef(0)
  const ids = useId()
  const fid = (name: string) => `${ids}-${name}`

  useEffect(() => {
    if (fieldError) document.getElementById(`${ids}-${targetOf(fieldError.field)}`)?.focus()
  }, [fieldError, ids])

  const set = (patch: Partial<FormState>) => {
    setS((prev) => ({ ...prev, ...patch }))
    setFailure(null)
  }
  const errorFor = (...fields: EventField[]) => (fieldError && fields.includes(fieldError.field) ? fieldError.message : null)

  const travel = isTravel(s.kind)

  function pickKind(kind: EventKind) {
    if (editing || kind === s.kind) return
    setS((prev) => ({
      ...prev,
      kind,
      ...travelDefaults(env, kind),
      destTouched: false,
      endsOn: hasEnd(kind) ? prev.endsOn : '',
      endsAt: isTravel(kind) ? prev.endsAt : '',
      place: hasPlace(kind) ? prev.place : '',
      repeatsYearly: kind === 'data_especial',
      listItemId: hasLink(kind) ? prev.listItemId : null,
    }))
    setFieldError(null)
    setFailure(null)
  }

  function pickTravelers(travelers: Travelers, travelerId: string | null) {
    setS((prev) => ({
      ...prev,
      travelers,
      travelerId,
      dest: prev.destTouched ? prev.dest : defaultDest(env, prev.kind, travelers, travelerId),
    }))
    setFailure(null)
  }

  // --- Período automático (só criar, só viagem/visita) ----------------------

  const draft = draftOf(s)
  const auto = (() => {
    if (editing || !travel) return null
    // Só com o rascunho válido: `paintStays` lança em intervalo invertido. O
    // título não muda os dias, então a prévia não espera por ele.
    if (!validateEvent({ ...draft, title: draft.title || '·' }).ok || draft.endsOn === null) return { ready: false as const }
    const entries = entriesForEvent(draft, members)
    if (entries.length === 0) return { ready: false as const }
    const after = paintStays(stays, entries, api.newId)
    const impact = previewImpact(stays, entries, members, { from: draft.startsOn, to: draft.endsOn })
    const offset = (weekdayOf(draft.startsOn) - (settings.weekStartsOn === 'mon' ? 1 : 0) + 7) % 7
    const stripFrom = addDays(draft.startsOn, -offset)
    const stripTo = addDays(stripFrom, 13)
    const bands = bandsByDay(after, members, stripFrom, stripTo)
    // A cor e o nome do cartão: o estado do casal no primeiro dia pintado.
    const band = bands.get(draft.startsOn) ?? 'unknown'
    return {
      ready: true as const,
      band,
      color: band === 'unknown' ? undefined : bandColor(settings, band),
      state: stateName(band, env),
      from: draft.startsOn,
      to: draft.endsOn,
      days: daysBetween(stripFrom, stripTo),
      bands,
      impact,
    }
  })()

  const whoTravels = (() => {
    if (s.travelers === 'both') return 'Os dois viajam'
    const person = [people[1], people[2]].find((p) => p.profileId === s.travelerId)
    return person ? `${person.name} viaja` : 'Quem viaja?'
  })()

  // --- gravar ----------------------------------------------------------------

  async function save() {
    if (pending) return
    const verdict = validateEvent(draft)
    if (!verdict.ok) {
      setFieldError({ field: verdict.field, message: verdict.reason, nonce: ++attempts.current })
      return
    }
    setFieldError(null)
    setFailure(null)
    setPending(true)

    let final = draft
    if (travel && s.dest) {
      // Cascata da seção 7: (1) a cidade do mundo; (2) o evento.
      const resolved = await resolveCity(api, coupleId, s.dest)
      if (!resolved.ok) {
        setFailure(`Não deu pra salvar: ${resolved.message}`)
        setPending(false)
        return
      }
      setS((prev) => ({ ...prev, dest: resolved.city }))
      final = draftOf({ ...s, dest: resolved.city }, resolved.city.id)
    }

    const result =
      mode.kind === 'edit'
        ? await api.updateEvent(mode.event.id, final)
        : await api.createEvent(coupleId, final, isTravel(final.kind))
    if (result.status !== 'ok') {
      setFailure(`Não deu pra salvar: ${writeFailureMessage(result)}`)
      setPending(false)
      return
    }
    await onSaved({ action: editing ? 'updated' : 'created', startsOn: final.startsOn })
    setPending(false)
  }

  async function erase() {
    if (mode.kind !== 'edit' || pending) return
    setPending(true)
    setFailure(null)
    const result = await api.deleteEvent(mode.event.id)
    if (result.status !== 'ok') {
      setFailure(`Não deu pra apagar: ${writeFailureMessage(result)}`)
      setPending(false)
      return
    }
    await onSaved({ action: 'deleted', startsOn: mode.event.startsOn })
    setPending(false)
  }

  // --- campos ----------------------------------------------------------------

  const textInput = (
    field: 'title' | 'place',
    value: string,
    onChange: (v: string) => void,
    icon: ReactNode,
    maxLength: number,
    placeholder?: string,
  ) => {
    const error = errorFor(field)
    return (
      <div className={`cal-mf-input ${error ? 'is-invalid' : ''}`}>
        {icon}
        <input
          id={fid(field)}
          type="text"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? fid(`${field}-error`) : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    )
  }

  /**
   * O campo de data do frame ("Sex, 30 out"). Na Ida/Volta a hora mora DENTRO
   * do campo, depois de um "·" ("Sex, 30 out · 19:20"), e some com _Dia inteiro_.
   */
  const dateInput = (
    field: 'startsOn' | 'endsOn',
    label: string,
    extra: { min?: string; icon?: ReactNode; time?: { field: 'startsAt' | 'endsAt'; label: string } } = {},
  ) => {
    const error = errorFor(field)
    const time = extra.time && !s.allDaySwitch ? extra.time : null
    const timeError = time ? errorFor(time.field) : null
    return (
      <div className={`cal-mf-input ${error || timeError ? 'is-invalid' : ''}`}>
        <DateField
          value={field === 'startsOn' ? s.startsOn : s.endsOn}
          onChange={(v) => set(field === 'startsOn' ? { startsOn: v } : { endsOn: v })}
          icon={extra.icon}
          inputProps={{
            id: fid(field),
            'aria-label': label,
            min: extra.min,
            'aria-invalid': !!error || undefined,
            'aria-describedby': error ? fid(`${field}-error`) : undefined,
          }}
        >
          {time && (
            <>
              <span className="cal-date-sep" aria-hidden="true">
                ·
              </span>
              <input
                id={fid(time.field)}
                type="time"
                className="cal-date-time"
                aria-label={time.label}
                value={time.field === 'startsAt' ? s.startsAt : s.endsAt}
                aria-invalid={!!timeError || undefined}
                onChange={(e) => set(time.field === 'startsAt' ? { startsAt: e.target.value } : { endsAt: e.target.value })}
              />
            </>
          )}
        </DateField>
      </div>
    )
  }

  const timeInput = (field: 'startsAt' | 'endsAt', label: string) => {
    const error = errorFor(field)
    return (
      <div className={`cal-mf-input cal-mf-input--time ${error ? 'is-invalid' : ''}`}>
        <Clock size={15} aria-hidden="true" />
        <input
          id={fid(field)}
          type="time"
          aria-label={label}
          value={field === 'startsAt' ? s.startsAt : s.endsAt}
          aria-invalid={!!error || undefined}
          onChange={(e) => set(field === 'startsAt' ? { startsAt: e.target.value } : { endsAt: e.target.value })}
        />
      </div>
    )
  }

  const titleField = (
    <ModalField label="Título" htmlFor={fid('title')} field="title" error={errorFor('title')} errorId={fid('title-error')}>
      {textInput('title', s.title, (v) => set({ title: v }), <Type size={15} aria-hidden="true" />, CALENDAR_LIMITS.title)}
    </ModalField>
  )

  const noteField = (
    <ModalField label="Nota" htmlFor={fid('note')} field="note" error={errorFor('note')} errorId={fid('note-error')}>
      <div className={`cal-mf-input ${errorFor('note') ? 'is-invalid' : ''}`}>
        <StickyNote size={15} aria-hidden="true" />
        <input
          id={fid('note')}
          type="text"
          value={s.note}
          maxLength={CALENDAR_LIMITS.note}
          aria-invalid={!!errorFor('note') || undefined}
          onChange={(e) => set({ note: e.target.value })}
        />
      </div>
    </ModalField>
  )

  const placeField = (
    <ModalField label="Local" htmlFor={fid('place')} field="place" error={errorFor('place')} errorId={fid('place-error')}>
      {textInput('place', s.place, (v) => set({ place: v }), null, CALENDAR_LIMITS.place, 'Opcional')}
    </ModalField>
  )

  const linkField = (
    <ModalField label="Vínculo com a lista" htmlFor={fid('listItemId')} field="link" error={errorFor('listItemId')}>
      <ListLink
        id={fid('listItemId')}
        items={env.listItems}
        value={s.listItemId}
        onChange={(listItemId) => set({ listItemId })}
      />
    </ModalField>
  )

  const allDayField = (
    <ModalField field="allDay">
      <ModalSwitch
        id={fid('allDay')}
        label="Dia inteiro"
        checked={s.allDaySwitch}
        onChange={(allDaySwitch) => set({ allDaySwitch })}
        icon={<Clock size={15} aria-hidden="true" />}
      />
    </ModalField>
  )

  /** _Hora (ou dia inteiro)_ de Date e Compromisso: a hora some com o interruptor. */
  const clockField = (
    <ModalField label="Hora" htmlFor={s.allDaySwitch ? undefined : fid('startsAt')} field="time" error={errorFor('startsAt', 'allDay')}>
      <div className="cal-mf-inline">
        {!s.allDaySwitch && timeInput('startsAt', 'Hora')}
        <ModalSwitch id={fid('allDay')} label="Dia inteiro" checked={s.allDaySwitch} onChange={(allDaySwitch) => set({ allDaySwitch })} />
      </div>
    </ModalField>
  )

  const travelersField = (
    <ModalField label="Quem viaja" field="travelers" error={errorFor('travelers', 'travelerId')}>
      <div className="cal-mf-seg" role="radiogroup" aria-label="Quem viaja" id={fid('travelers')} tabIndex={-1}>
        {([people[1], people[2]] as CalendarPerson[]).map((p) => (
          <button
            key={p.profileId}
            type="button"
            role="radio"
            aria-checked={s.travelers === 'solo' && s.travelerId === p.profileId}
            onClick={() => pickTravelers('solo', p.profileId)}
          >
            <Avatar person={p} size={22} />
            {p.name}
          </button>
        ))}
        <button type="button" role="radio" aria-checked={s.travelers === 'both'} onClick={() => pickTravelers('both', null)}>
          <span className="cal-mf-seg-pair" aria-hidden="true">
            <Avatar person={people[1]} size={22} />
            <Avatar person={people[2]} size={22} />
          </span>
          Os dois
        </button>
      </div>
    </ModalField>
  )

  const destError = errorFor('cityId')
  const destField = (
    <div className="cal-mf" data-field="destination">
      <CityPicker
        api={api}
        homes={[
          { city: people[1].homeCity, owner: people[1].name },
          { city: people[2].homeCity, owner: people[2].name },
        ]}
        value={s.dest}
        onChange={(dest) => set({ dest, destTouched: true })}
        label="Destino"
        id={fid('cityId')}
        invalid={!!destError}
        describedBy={destError ? fid('cityId-error') : undefined}
      />
      {destError && (
        <p className="cal-mf-error" id={fid('cityId-error')} role="alert">
          {destError}
        </p>
      )}
    </div>
  )

  function fields(): ReactNode {
    switch (s.kind) {
      case 'viagem':
      case 'visita':
        return (
          <>
            {titleField}
            {travelersField}
            {destField}
            <div className="cal-mf-row">
              <ModalField label="Ida" htmlFor={fid('startsOn')} field="departure" error={errorFor('startsOn', 'startsAt')}>
                {dateInput('startsOn', 'Ida', {
                  icon: <PlaneTakeoff size={15} aria-hidden="true" />,
                  time: { field: 'startsAt', label: 'Hora da ida' },
                })}
              </ModalField>
              <ModalField label="Volta" htmlFor={fid('endsOn')} field="return" error={errorFor('endsOn', 'endsAt')}>
                {dateInput('endsOn', 'Volta', {
                  min: s.startsOn,
                  icon: <PlaneLanding size={15} aria-hidden="true" />,
                  time: { field: 'endsAt', label: 'Hora da volta' },
                })}
              </ModalField>
            </div>
            {allDayField}
            <div className="cal-mf-row">
              {noteField}
              {linkField}
            </div>
          </>
        )
      case 'date':
        return (
          <>
            {titleField}
            <div className="cal-mf-row">
              <ModalField label="Dia" htmlFor={fid('startsOn')} field="day" error={errorFor('startsOn')}>
                {dateInput('startsOn', 'Dia')}
              </ModalField>
              {clockField}
            </div>
            {placeField}
            <div className="cal-mf-row">
              {noteField}
              {linkField}
            </div>
          </>
        )
      case 'data_especial':
        return (
          <>
            {titleField}
            <ModalField label="Dia" htmlFor={fid('startsOn')} field="day" error={errorFor('startsOn')}>
              {dateInput('startsOn', 'Dia')}
            </ModalField>
            <ModalField field="repeats" error={errorFor('repeatsYearly')}>
              <ModalSwitch
                id={fid('repeatsYearly')}
                label="Repete todo ano"
                checked={s.repeatsYearly}
                onChange={(repeatsYearly) => set({ repeatsYearly })}
                icon={<Repeat size={15} aria-hidden="true" />}
              />
            </ModalField>
            {noteField}
          </>
        )
      case 'compromisso':
        return (
          <>
            {titleField}
            <div className="cal-mf-row">
              <ModalField label="Início" htmlFor={fid('startsOn')} field="start" error={errorFor('startsOn')}>
                {dateInput('startsOn', 'Início')}
              </ModalField>
              <ModalField label="Fim" htmlFor={fid('endsOn')} field="end" error={errorFor('endsOn')}>
                {dateInput('endsOn', 'Fim', { min: s.startsOn })}
              </ModalField>
            </div>
            {clockField}
            {placeField}
            {noteField}
          </>
        )
      case 'lembrete':
        return (
          <>
            {titleField}
            <div className="cal-mf-row">
              <ModalField label="Dia" htmlFor={fid('startsOn')} field="day" error={errorFor('startsOn')}>
                {dateInput('startsOn', 'Dia')}
              </ModalField>
              <ModalField label="Até" htmlFor={fid('startsAt')} field="until" error={errorFor('startsAt')}>
                {timeInput('startsAt', 'Até')}
              </ModalField>
            </div>
            {noteField}
          </>
        )
    }
  }

  // --- prévia ----------------------------------------------------------------

  let side: ReactNode = null
  if (travel && editing) {
    side = (
      <aside className="cal-eprev cal-eprev--notice" aria-label="Período">
        <p>{EDIT_TRAVEL_NOTICE}</p>
      </aside>
    )
  } else if (auto) {
    side = (
      <aside className="cal-eprev" aria-label="Período automático">
        <div className="cal-eprev-head">
          <p className="cal-eprev-kicker">
            <Sparkles size={13} aria-hidden="true" />
            Período automático
          </p>
          <h3 className="cal-eprev-title">Como os dias vão ficar</h3>
        </div>
        {auto.ready ? (
          <>
            <div className="cal-eprev-card" style={{ '--band': auto.color } as CSSProperties}>
              <BigPair
                people={[people[1], people[2]]}
                together={auto.band !== 'apart'}
                size={30}
                overlap={14}
                heart={{ size: 16, x: 15, y: 16 }}
                icon={9}
              />
              <span className="cal-eprev-card-text">
                <span className="cal-eprev-card-title">{auto.state}</span>
                <span className="cal-eprev-card-sub">
                  {whoTravels} · {shortDayMonth(auto.from)} → {shortDayMonth(auto.to)}
                </span>
              </span>
              <strong>{daysInclusive(auto.from, auto.to)}d</strong>
            </div>
            <div className="cal-eprev-cal">
              <BandStrip
                days={auto.days}
                bands={auto.bands}
                settings={settings}
                today={today}
                highlight={(d) => d >= auto.from && d <= auto.to}
                label="Antes e depois do evento"
                weekdays={settings.weekStartsOn === 'mon' ? [...STRIP_WEEKDAYS.slice(1), STRIP_WEEKDAYS[0]] : STRIP_WEEKDAYS}
                tall
              />
              <div className="cal-eprev-months" aria-hidden="true">
                <span>{monthNameOf(auto.days[0]).slice(0, 3)}</span>
                <span>{monthNameOf(auto.days[auto.days.length - 1]).slice(0, 3)}</span>
              </div>
            </div>
            <ul className="cal-eprev-lines">
              {auto.impact.togetherDeltaYear !== 0 && (
                <li>
                  <ArrowUpRight size={14} aria-hidden="true" className="cal-eprev-up" />
                  {auto.impact.togetherDeltaYear > 0 ? '+' : '−'}
                  {Math.abs(auto.impact.togetherDeltaYear) === 1
                    ? '1 dia juntos no ano'
                    : `${Math.abs(auto.impact.togetherDeltaYear)} dias juntos no ano`}
                </li>
              )}
              {auto.impact.month !== null && auto.impact.apartBefore !== auto.impact.apartAfter && (
                <li>
                  <ArrowDownRight
                    size={14}
                    aria-hidden="true"
                    className="cal-eprev-down"
                    style={{ '--band': bandColor(settings, 'apart') } as CSSProperties}
                  />
                  Separados em {monthNameOf(auto.impact.month)}: {auto.impact.apartBefore} → {auto.impact.apartAfter} dias
                </li>
              )}
              <li>
                <Repeat size={14} aria-hidden="true" />
                Dá pra ajustar o período depois
              </li>
            </ul>
          </>
        ) : (
          <p className="cal-mf-hint">Escolha quem viaja, o destino e a volta para ver como os dias vão ficar.</p>
        )}
      </aside>
    )
  }

  // --- rodapé ----------------------------------------------------------------

  const savedTitle = mode.kind === 'edit' ? mode.event.title : ''
  const footer = confirmDelete ? (
    <div className="cal-modal-confirm" role="group" aria-label="Apagar evento">
      <p>{travel ? `Apagar ${savedTitle}? O período no calendário continua.` : `Apagar ${savedTitle}?`}</p>
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
          {pending ? 'Salvando…' : 'Salvar evento'}
        </button>
      </span>
    </>
  )

  const KindIcon = EVENT_ICONS[s.kind]

  return (
    <CalDialog
      title={editing ? 'Editar evento' : 'Novo evento'}
      subtitle={SUBTITLE}
      icon={<KindIcon size={20} />}
      iconClass={`cal-ev--${s.kind}`}
      onClose={onClose}
      closeDisabled={pending}
      wide={side !== null}
      footer={footer}
    >
      <fieldset className="cal-mf-fieldset" disabled={pending} aria-busy={pending}>
        <ModalField label="Tipo" field="kind">
          <div className="cal-kinds" role="group" aria-label="Tipo">
            {EVENT_KINDS.map((kind) => {
              const Icon = EVENT_ICONS[kind]
              return (
                <button
                  key={kind}
                  id={kind === EVENT_KINDS[0] ? fid('kind') : undefined}
                  type="button"
                  className={`cal-kind cal-ev--${kind}`}
                  aria-pressed={s.kind === kind}
                  disabled={editing && s.kind !== kind}
                  onClick={() => pickKind(kind)}
                >
                  <Icon size={15} aria-hidden="true" />
                  {EVENT_KIND_LABEL[kind]}
                </button>
              )
            })}
          </div>
          {editing && <p className="cal-mf-hint">O tipo não muda na edição.</p>}
        </ModalField>

        <div className={`cal-ebody ${side ? 'cal-ebody--split' : ''}`}>
          <div className="cal-eform">{fields()}</div>
          {side}
        </div>

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
// Vínculo com a lista
// ---------------------------------------------------------------------------

function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim()
}

const LINK_LIMIT = 6

/** Busca por nome nos itens do casal; escolhido vira um chip com _×_ (R18). */
function ListLink({
  id,
  items,
  value,
  onChange,
}: {
  id: string
  items: ModalEnv['listItems']
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
          {item && <span className="cal-mf-chosen-sub"> · {LIST_CATEGORY_LABEL[item.category]}</span>}
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
        <Link2 size={15} aria-hidden="true" />
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
              <span className="cal-mf-chosen-sub"> · {LIST_CATEGORY_LABEL[item.category]}</span>
            </li>
          ))}
        </ul>
      </div>
      {open && q !== '' && matches.length === 0 && <p className="cal-mf-hint">Nenhum item com “{query.trim()}”.</p>}
    </div>
  )
}
