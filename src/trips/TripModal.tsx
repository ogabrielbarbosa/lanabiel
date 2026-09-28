// Nova viagem / Editar viagem (`MQHBd`, modal `xLhij`).
//
// Spec: .agent/Tasks/fase-6-viagens.md — R24, R25, R26, R27, I10 (A13)
// ADR:  .agent/Decisions/0018-periodo-se-grava-pintando-estadias.md
//
// ── CONTRATO ────────────────────────────────────────────────────────────────
//   <TripModal mode="new" initialQuery? onClose />          (a Grade, o _Planejar_)
//   <TripModal mode="edit" trip={trip} onClose />           (o lápis do herói, no detalhe)
//
//   Dentro da `TripsRoute` (lê `useTrips()`). Grava, relê (`reload`) e só então
//   fecha: a Nova viagem navega para `/viagens/<id>`; apagar volta para
//   `/viagens`. Na falha fica aberto com o que foi digitado e a causa (R27).
// ─────────────────────────────────────────────────────────────────────────────
//
// Criar (R25): `resolveCity` (cidade do mundo vira linha do casal só agora) →
// `createTrip` (evento + pintura + `trips` + preparação + hospedagem + saídas,
// numa transação) → a capa, se houver (`uploadCover`). Capa que falha não
// desfaz a viagem: o detalhe abre com o aviso.
//
// Editar (R26): o EVENTO muda (`updateTripEvent`, nunca repinta — ADR 0018),
// e só o que mudou em `trips` (hospedagem, capa) e nas saídas é gravado.
//
// _Ao salvar_ é a prévia da pintura: `paintStays` + `bandsByDay` sobre as
// estadias lidas, a mesma regra do `create_event` (A2 da Fase 5). _Da lista em
// {destino}_ é só leitura: os itens aparecem no detalhe (R18).

import { useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Check, House, ImagePlus, PlaneLanding, PlaneTakeoff, Sparkles, StickyNote, Trash2, Type } from 'lucide-react'
import { navigate } from '../app/router'
import { BandStrip, CalDialog, ModalField } from '../calendar/CalDialog'
import { CityPicker } from '../calendar/CityPicker'
import { isWorldPick, previewCityId, resolveCity } from '../calendar/cityChoice'
import type { CityChoice } from '../calendar/cityChoice'
import { bandsByDay, daysBetween, monthNameOf } from '../calendar/modalPreview'
import { Avatar, CouplePair, DateField } from '../calendar/parts'
import { bandColor } from '../calendar/view'
import { tripEventDraft } from '../data/trips'
import { CALENDAR_LIMITS, entriesForEvent, paintStays, shortCityName, validateEvent } from '../domain/calendar'
import type { Band } from '../domain/calendar'
import { CATEGORY_LABELS } from '../domain/list'
import { arrowRangeLabel, destinationLabel, itemsLabel, nearbyListItems, sortPhotos } from '../domain/tripDerive'
import { TRIP_LIMITS } from '../domain/trips'
import type { NewTripDraft, Trip, TripDeparture } from '../domain/trips'
import { addDays, daysInclusive, diffDays, weekdayDayMonthYear, weekdayOf } from '../lib/date'
import { CATEGORY_ICONS, catClass } from '../list/categories'
import { ItemPhoto } from '../list/parts'
import { cityPickerApi } from './api'
import type { TripRef } from './api'
import { tripFailureMessage, useTrips } from './context'
import type { TripPerson } from './context'
import { tripPath } from './links'
import './trips.css'

export type TripModalProps =
  | { mode: 'new'; initialQuery?: string; onClose(): void }
  | { mode: 'edit'; trip: Trip; onClose(): void }

const SUBTITLE = 'Cria o período no calendário e puxa itens da lista do destino'
const EDIT_NOTICE = 'Mudar datas ou destino aqui não muda o período. Pra isso, ajuste no calendário.'
const COVER_FAILED = 'A viagem foi salva, mas a capa não subiu.'
const DEPARTURE_PLACEHOLDER = 'voo GRU → FLN · 1h05'
const STRIP_WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
/** O mini-mês mostra no máximo cinco semanas (uma viagem pode ter 366 dias). */
const STRIP_MAX_DAYS = 35
/** R24: até 3 nomes da Lista. */
const LIST_PREVIEW = 3

type Field = 'title' | 'cityId' | 'startsOn' | 'endsOn' | 'note' | 'lodgingName'

type CoverChoice =
  | { kind: 'keep' }
  | { kind: 'photo'; id: string }
  | { kind: 'file'; file: File; url: string | null }

interface FormState {
  title: string
  dest: CityChoice | null
  startsOn: string
  endsOn: string
  note: string
  lodgingName: string
  /** Por `profileId`: o "voo POA → FLN · 55min" de cada um. */
  departures: Record<string, string>
  cover: CoverChoice
}

const trimOrNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())

function initialState(props: TripModalProps, cities: ReturnType<typeof useTrips>['cities']): FormState {
  if (props.mode === 'new') {
    return { title: '', dest: null, startsOn: '', endsOn: '', note: '', lodgingName: '', departures: {}, cover: { kind: 'keep' } }
  }
  const t = props.trip
  return {
    title: t.title,
    dest: cities.get(t.cityId) ?? null,
    startsOn: t.startsOn,
    endsOn: t.endsOn,
    note: t.note ?? '',
    lodgingName: t.lodging.name ?? '',
    departures: Object.fromEntries(t.departures.map((d) => [d.profileId, d.note ?? ''])),
    cover: { kind: 'keep' },
  }
}

/** O nome e as coordenadas do destino escolhido, com ou sem `id`. */
function destInfo(choice: CityChoice): { name: string; lat: number; lng: number } {
  return isWorldPick(choice) ? choice.candidate : choice
}

/** O que o banco recusaria, na ordem em que a pessoa lê o formulário. */
function check(s: FormState, editing: boolean): { field: Field; message: string } | null {
  if (editing && s.title.trim() === '') return { field: 'title', message: 'Dê um nome à viagem.' }
  if (editing && [...s.title.trim()].length > CALENDAR_LIMITS.title) {
    return { field: 'title', message: `No máximo ${CALENDAR_LIMITS.title} caracteres.` }
  }
  if (s.dest === null) return { field: 'cityId', message: 'Escolha o destino.' }
  if (s.startsOn === '') return { field: 'startsOn', message: 'Escolha o dia da ida.' }
  if (s.endsOn === '') return { field: 'endsOn', message: 'Escolha o dia da volta.' }
  if (s.endsOn < s.startsOn) return { field: 'endsOn', message: 'A volta precisa ser no dia da ida ou depois.' }
  if (diffDays(s.startsOn, s.endsOn) >= CALENDAR_LIMITS.spanDays) {
    return { field: 'endsOn', message: `No máximo ${CALENDAR_LIMITS.spanDays} dias.` }
  }
  return null
}

export function TripModal(props: TripModalProps) {
  const { onClose } = props
  const editing = props.mode === 'edit'
  const ctx = useTrips()
  const { api, coupleId, people, members, stays, settings, today, cities, listItems, urls, events, reload, showNotice } = ctx
  const [s, setS] = useState<FormState>(() => initialState(props, cities))
  const [fieldError, setFieldError] = useState<{ field: Field; message: string } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const uid = useId()
  const fid = (name: string) => `${uid}-${name}`
  const slots: TripPerson[] = [people[1], people[2]]

  // A prévia da capa escolhida é uma URL local; solta quando troca ou fecha.
  const coverUrl = s.cover.kind === 'file' ? s.cover.url : null
  useEffect(() => {
    return () => {
      if (coverUrl && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(coverUrl)
    }
  }, [coverUrl])

  // O campo recusado recebe o foco, como no Novo evento do Calendário.
  useEffect(() => {
    if (fieldError) document.getElementById(`${uid}-${fieldError.field}`)?.focus()
  }, [fieldError, uid])

  function set(patch: Partial<FormState>) {
    setS((prev) => ({ ...prev, ...patch }))
    setFailure(null)
    if (fieldError && Object.keys(patch).some((k) => k === fieldError.field || (k === 'dest' && fieldError.field === 'cityId'))) {
      setFieldError(null)
    }
  }

  const errorFor = (field: Field) => (fieldError?.field === field ? fieldError.message : null)

  // --- a prévia (_Ao salvar_ e _Da lista em_) ------------------------------

  const dest = s.dest ? destInfo(s.dest) : null
  const destShort = dest ? shortCityName(dest.name) : null
  const nearby = dest ? nearbyListItems(dest, listItems) : []
  const valid = check(s, false) === null

  const preview = (() => {
    if (editing || !valid || !s.dest) return null
    const draft = tripEventDraft({ title: '·', cityId: previewCityId(s.dest), startsOn: s.startsOn, endsOn: s.endsOn, note: null })
    let n = 0
    const after = paintStays(stays, entriesForEvent(draft, members), () => `preview-${++n}`)
    const offset = (weekdayOf(s.startsOn) - (settings.weekStartsOn === 'mon' ? 1 : 0) + 7) % 7
    const from = addDays(s.startsOn, -offset)
    const endOffset = 6 - ((weekdayOf(s.endsOn) - (settings.weekStartsOn === 'mon' ? 1 : 0) + 7) % 7)
    const lastWanted = addDays(s.endsOn, endOffset)
    const to = diffDays(from, lastWanted) >= STRIP_MAX_DAYS ? addDays(from, STRIP_MAX_DAYS - 1) : lastWanted
    const bands = bandsByDay(after, members, from, to)
    const band: Band = bands.get(s.startsOn) ?? 'unknown'
    return { days: daysBetween(from, to), bands, band }
  })()

  function stateName(band: Band): string {
    switch (band) {
      case 'home1':
        return `Juntos em ${shortCityName(people[1].homeCity.name)}`
      case 'home2':
        return `Juntos em ${shortCityName(people[2].homeCity.name)}`
      case 'away':
        return 'Viajando juntos'
      case 'apart':
        return 'Separados'
      case 'unknown':
        return 'Sem registro'
    }
  }

  // --- gravar --------------------------------------------------------------

  function departuresOf(): TripDeparture[] {
    const old = props.mode === 'edit' ? props.trip.departures : []
    return slots.map((p) => ({
      profileId: p.profileId,
      originCode: old.find((d) => d.profileId === p.profileId)?.originCode ?? null,
      note: trimOrNull(s.departures[p.profileId] ?? ''),
    }))
  }

  async function uploadCover(trip: TripRef): Promise<boolean> {
    if (s.cover.kind !== 'file') return true
    const result = await api.uploadCover(coupleId, trip, s.cover.file)
    return result.status === 'ok'
  }

  async function save() {
    if (pending) return
    const issue = check(s, editing)
    if (issue) {
      setFieldError(issue)
      return
    }
    setFieldError(null)
    setFailure(null)
    setPending(true)
    try {
      // (1) A cidade do mundo vira linha do casal só agora (ADR 0017).
      const resolved = await resolveCity(cityPickerApi(api), coupleId, s.dest as CityChoice)
      if (!resolved.ok) {
        setFailure(`Não deu pra salvar: ${resolved.message}`)
        return
      }
      const city = resolved.city
      setS((prev) => ({ ...prev, dest: city }))

      if (props.mode === 'new') {
        const draft: NewTripDraft = {
          title: destinationLabel(city),
          cityId: city.id,
          startsOn: s.startsOn,
          endsOn: s.endsOn,
          note: trimOrNull(s.note),
          lodgingName: trimOrNull(s.lodgingName),
          departures: departuresOf(),
        }
        const verdict = validateEvent(tripEventDraft(draft))
        if (!verdict.ok) {
          setFailure(`Não deu pra salvar: ${verdict.reason}`)
          return
        }
        const created = await api.createTrip(draft)
        if (created.status !== 'ok') {
          setFailure(`Não deu pra salvar: ${tripFailureMessage(created)}`)
          return
        }
        const id = created.value.id
        const ref: TripRef = { id, startsOn: draft.startsOn, endsOn: draft.endsOn, itinerary: [], prep: [], budget: [], photos: [] }
        if (!(await uploadCover(ref))) showNotice(COVER_FAILED)
        await reload()
        onClose()
        navigate(tripPath(id))
        return
      }

      // Editar (R26): o evento, e só o que mudou do resto.
      const trip = props.trip
      const event = events.get(trip.id)
      if (!event) {
        setFailure('Não deu pra salvar porque essa viagem mudou. Recarregue a página.')
        return
      }
      const eventResult = await api.updateTripEvent(event, {
        title: s.title.trim(),
        cityId: city.id,
        startsOn: s.startsOn,
        endsOn: s.endsOn,
        note: trimOrNull(s.note),
      })
      if (eventResult.status !== 'ok') {
        setFailure(`Não deu pra salvar: ${tripFailureMessage(eventResult)}`)
        return
      }
      const failures: string[] = []
      const lodgingName = trimOrNull(s.lodgingName)
      if (lodgingName !== trip.lodging.name) {
        const r = await api.updateTrip(trip.id, { lodging: { ...trip.lodging, name: lodgingName } })
        if (r.status !== 'ok') failures.push(`a hospedagem: ${tripFailureMessage(r)}`)
      }
      const departures = departuresOf()
      const changed = departures.some((d) => {
        const old = trip.departures.find((o) => o.profileId === d.profileId)
        return (old?.note ?? null) !== d.note
      })
      if (changed) {
        const r = await api.saveDepartures(coupleId, trip.id, departures)
        if (r.status !== 'ok') failures.push(`as saídas: ${tripFailureMessage(r)}`)
      }
      if (s.cover.kind === 'photo' && s.cover.id !== trip.coverPhotoId) {
        const r = await api.updateTrip(trip.id, { coverPhotoId: s.cover.id })
        if (r.status !== 'ok') failures.push(`a capa: ${tripFailureMessage(r)}`)
      }
      const coverOk = await uploadCover({ ...trip, startsOn: s.startsOn, endsOn: s.endsOn })
      // A capa nova já é foto da viagem: um _Salvar_ de novo (depois de uma
      // falha secundária) não pode subir o mesmo arquivo outra vez.
      if (coverOk && s.cover.kind === 'file') setS((prev) => ({ ...prev, cover: { kind: 'keep' } }))
      await reload()
      if (failures.length > 0) {
        // O evento já foi; a tela relida mostra o que ficou, e o modal diz o que não.
        setFailure(`A viagem foi salva, mas não deu pra salvar ${failures.join('; ')}`)
        return
      }
      if (!coverOk) showNotice(COVER_FAILED)
      onClose()
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    if (props.mode !== 'edit' || pending) return
    setPending(true)
    setFailure(null)
    try {
      const result = await api.deleteTrip(props.trip)
      if (result.status === 'ok') {
        await reload()
        onClose()
        navigate('/viagens')
        return
      }
      setConfirming(false)
      if (result.status === 'files_deleted_row_failed') {
        setFailure(`As fotos foram apagadas, mas a viagem não: ${result.cause}`)
        await reload()
        return
      }
      setFailure(`Não deu pra apagar: ${tripFailureMessage(result)}`)
    } finally {
      setPending(false)
    }
  }

  function pickFile(file: File | undefined) {
    if (!file) return
    const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null
    set({ cover: { kind: 'file', file, url } })
  }

  // --- campos --------------------------------------------------------------

  const textInput = (field: Field, value: string, onChange: (v: string) => void, icon: ReactNode, maxLength: number, placeholder?: string) => {
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
          disabled={pending}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? fid(`${field}-error`) : undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    )
  }

  const dateInput = (field: 'startsOn' | 'endsOn', label: string, icon: ReactNode) => {
    const error = errorFor(field)
    return (
      <div className={`cal-mf-input ${error ? 'is-invalid' : ''}`}>
        <DateField
          value={s[field]}
          onChange={(v) => set(field === 'startsOn' ? { startsOn: v } : { endsOn: v })}
          format={weekdayDayMonthYear}
          icon={icon}
          inputProps={{
            id: fid(field),
            'aria-label': label,
            min: field === 'endsOn' ? s.startsOn || undefined : undefined,
            disabled: pending,
            'aria-invalid': !!error || undefined,
            'aria-describedby': error ? fid(`${field}-error`) : undefined,
          }}
        />
      </div>
    )
  }

  const destError = errorFor('cityId')

  // Capa: na edição, até 3 fotos da viagem (a capa atual primeiro); na nova, a
  // escolhida. Sempre o _Enviar_ no fim.
  const photos = props.mode === 'edit' ? sortPhotos(props.trip.photos) : []
  const currentCover = props.mode === 'edit' ? props.trip.coverPhotoId : null
  const photoOptions =
    props.mode === 'edit'
      ? [...photos.filter((p) => p.id === currentCover), ...photos.filter((p) => p.id !== currentCover)].slice(0, s.cover.kind === 'file' ? 2 : 3)
      : []
  const selectedPhoto = s.cover.kind === 'photo' ? s.cover.id : s.cover.kind === 'keep' ? currentCover : null

  const form = (
    <div className="tr-mform">
      {editing && (
        <ModalField label="Nome da viagem" htmlFor={fid('title')} field="title" error={errorFor('title')} errorId={fid('title-error')}>
          {textInput('title', s.title, (title) => set({ title }), <Type size={15} aria-hidden="true" />, CALENDAR_LIMITS.title)}
        </ModalField>
      )}

      <div className="cal-mf" data-field="destination">
        <CityPicker
          api={cityPickerApi(api)}
          homes={slots.map((p) => ({ city: p.homeCity, owner: p.name }))}
          value={s.dest}
          onChange={(d) => set({ dest: d })}
          label="Destino"
          id={fid('cityId')}
          invalid={!!destError}
          describedBy={destError ? fid('cityId-error') : undefined}
          disabled={pending}
          initialQuery={props.mode === 'new' ? props.initialQuery : undefined}
        />
        {destError && (
          <p className="cal-mf-error" id={fid('cityId-error')} role="alert">
            {destError}
          </p>
        )}
      </div>

      <div className="tr-mrow">
        <ModalField label="Ida" htmlFor={fid('startsOn')} field="departure" error={errorFor('startsOn')} errorId={fid('startsOn-error')}>
          {dateInput('startsOn', 'Ida', <PlaneTakeoff size={15} aria-hidden="true" />)}
        </ModalField>
        <ModalField label="Volta" htmlFor={fid('endsOn')} field="return" error={errorFor('endsOn')} errorId={fid('endsOn-error')}>
          {dateInput('endsOn', 'Volta', <PlaneLanding size={15} aria-hidden="true" />)}
        </ModalField>
      </div>

      <ModalField label="Capa" field="cover">
        <div className="tr-covers" role="group" aria-label="Capa">
          {photoOptions.map((p) => {
            const url = urls.get(p.path)
            return (
              <button
                key={p.id}
                type="button"
                className="tr-cover-option"
                aria-pressed={selectedPhoto === p.id}
                aria-label={p.caption ? `Usar como capa: ${p.caption}` : 'Usar esta foto como capa'}
                disabled={pending}
                onClick={() => set({ cover: { kind: 'photo', id: p.id } })}
              >
                {url && <img src={url} alt="" />}
              </button>
            )
          })}
          {s.cover.kind === 'file' && (
            <span className="tr-cover-option tr-cover-option--file" aria-pressed="true" role="img" aria-label={`Capa escolhida: ${s.cover.file.name}`}>
              {s.cover.url && <img src={s.cover.url} alt="" />}
            </span>
          )}
          <button type="button" className="tr-cover-upload lg" disabled={pending} onClick={() => fileRef.current?.click()}>
            <ImagePlus size={18} aria-hidden="true" />
            Enviar
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            aria-label="Escolher a foto da capa"
            tabIndex={-1}
            onChange={(e) => {
              pickFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </ModalField>

      <ModalField label="De onde cada um sai" field="departures">
        <div className="tr-mrow">
          {slots.map((p) => (
            <div key={p.profileId} className="tr-departure lg">
              <Avatar person={p} size={28} />
              <span className="tr-departure-text">
                <span className="tr-departure-home">{p.homeCity.name}</span>
                <input
                  type="text"
                  aria-label={`Como ${p.name} vai`}
                  placeholder={DEPARTURE_PLACEHOLDER}
                  maxLength={TRIP_LIMITS.departureNote}
                  value={s.departures[p.profileId] ?? ''}
                  disabled={pending}
                  onChange={(e) => set({ departures: { ...s.departures, [p.profileId]: e.target.value } })}
                />
              </span>
            </div>
          ))}
        </div>
      </ModalField>

      <div className="tr-mrow">
        <ModalField label="Hospedagem" htmlFor={fid('lodgingName')} field="lodging" error={errorFor('lodgingName')}>
          {textInput('lodgingName', s.lodgingName, (lodgingName) => set({ lodgingName }), <House size={15} aria-hidden="true" />, TRIP_LIMITS.lodgingName, 'Opcional')}
        </ModalField>
        <ModalField label="Nota" htmlFor={fid('note')} field="note" error={errorFor('note')}>
          {textInput('note', s.note, (note) => set({ note }), <StickyNote size={15} aria-hidden="true" />, CALENDAR_LIMITS.note, 'Opcional')}
        </ModalField>
      </div>
    </div>
  )

  const listBlock = destShort && (
    <>
      <span className="tr-mprev-divider" aria-hidden="true" />
      <div className="tr-mprev-list" aria-label={`Da lista em ${destShort}`} role="group">
        <div className="tr-mprev-list-head">
          <span>Da lista em {destShort}</span>
          <span>{itemsLabel(nearby.length)}</span>
        </div>
        {nearby.length > 0 && (
          <ul>
            {nearby.slice(0, LIST_PREVIEW).map((item) => {
              const Icon = CATEGORY_ICONS[item.category]
              return (
                <li key={item.id}>
                  <ItemPhoto category={item.category} url={(item.photoPath && urls.get(item.photoPath)) || null} className="tr-mprev-thumb" />
                  <span className="tr-mprev-item">
                    <span className="tr-mprev-name">{item.name}</span>
                    <span className={`tr-mprev-cat ${catClass(item.category)}`}>
                      <Icon size={11} aria-hidden="true" className="ls-cat-icon" />
                      {CATEGORY_LABELS[item.category].one}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </>
  )

  const side = editing ? (
    <aside className="tr-mprev lg" aria-label="Período">
      <p className="tr-mprev-notice">{EDIT_NOTICE}</p>
      {listBlock}
    </aside>
  ) : (
    <aside className="tr-mprev lg" aria-label="Ao salvar">
      <div className="tr-mprev-head">
        <p className="tr-mprev-kicker">
          <Sparkles size={13} aria-hidden="true" />
          Ao salvar
        </p>
        <h3>No calendário</h3>
      </div>
      {preview && s.dest ? (
        <>
          <div
            className="tr-mprev-card lg"
            data-band={preview.band}
            style={{ '--band': preview.band === 'unknown' ? undefined : bandColor(settings, preview.band) } as CSSProperties}
          >
            <CouplePair people={slots} together={preview.band !== 'apart'} />
            <span className="tr-mprev-card-text">
              <span className="tr-mprev-card-title">{stateName(preview.band)}</span>
              <span className="tr-mprev-card-sub">
                {destShort} · {arrowRangeLabel(s.startsOn, s.endsOn)}
              </span>
            </span>
            <strong>{daysInclusive(s.startsOn, s.endsOn)}d</strong>
          </div>
          <div className="tr-mprev-cal">
            <BandStrip
              days={preview.days}
              bands={preview.bands}
              settings={settings}
              today={today}
              highlight={(d) => d >= s.startsOn && d <= s.endsOn}
              label="Os dias da viagem no calendário"
              weekdays={settings.weekStartsOn === 'mon' ? [...STRIP_WEEKDAYS.slice(1), STRIP_WEEKDAYS[0]] : STRIP_WEEKDAYS}
              tall
            />
            <p className="tr-mprev-month">
              {monthNameOf(s.startsOn)} {s.startsOn.slice(0, 4)}
            </p>
          </div>
        </>
      ) : (
        <p className="tr-mprev-hint">Escolha o destino e as datas para ver como os dias vão ficar.</p>
      )}
      {listBlock}
    </aside>
  )

  const footer = confirming ? (
    <div className="cal-modal-confirm" role="alertdialog" aria-label="Apagar viagem">
      <p>Apagar {props.mode === 'edit' ? props.trip.title : ''}? As fotos e o roteiro vão junto; o período no calendário continua.</p>
      <div className="cal-modal-actions">
        <button type="button" className="cal-btn" disabled={pending} onClick={() => setConfirming(false)}>
          Cancelar
        </button>
        <button type="button" className="cal-btn cal-btn--danger" disabled={pending} onClick={() => void remove()}>
          <Trash2 size={16} aria-hidden="true" />
          Apagar
        </button>
      </div>
    </div>
  ) : (
    <>
      {editing ? (
        <button type="button" className="cal-btn cal-btn--ghost-danger" disabled={pending} onClick={() => setConfirming(true)}>
          <Trash2 size={16} aria-hidden="true" />
          Apagar viagem
        </button>
      ) : (
        <span />
      )}
      <div className="cal-modal-actions">
        <button type="button" className="cal-btn" disabled={pending} onClick={onClose}>
          Cancelar
        </button>
        <button type="button" className="cal-btn cal-btn--primary" disabled={pending} onClick={() => void save()}>
          <Check size={17} aria-hidden="true" />
          {pending ? 'Salvando…' : 'Salvar viagem'}
        </button>
      </div>
    </>
  )

  return (
    <CalDialog
      title={editing ? 'Editar viagem' : 'Nova viagem'}
      subtitle={editing ? undefined : SUBTITLE}
      icon={<PlaneTakeoff size={20} />}
      iconClass="cal-ev--viagem"
      onClose={onClose}
      closeDisabled={pending}
      wide
      footer={footer}
    >
      <div className="tr-mbody">
        {form}
        {side}
      </div>
      {failure && (
        <p className="cal-mf-error tr-mfailure" role="alert">
          {failure}
        </p>
      )}
    </CalDialog>
  )
}
