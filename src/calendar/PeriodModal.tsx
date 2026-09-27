// Novo período / Editar período (`DLeES`, modal `IZ8MX`). Spec: R13–R16, I3,
// seção 7 ("Pintura"), A17. ADR 0018: período se grava PINTANDO estadias.
//
// ── CONTRATO ────────────────────────────────────────────────────────────────
//   <PeriodModal env mode={{ kind: 'new', day }} onClose onSaved />
//   <PeriodModal env mode={{ kind: 'edit', run }} onClose onSaved />
//     `env`: o `ModalEnv` (o contexto do Calendário serve).
//     `run`: o trecho com as bordas REAIS (`runAround`), `to: null` = em aberto.
//     onSaved(): o banco devolveu `ok`. Quem abriu relê e fecha; o modal fica
//       desabilitado até a promessa resolver.
//   Na falha, fica aberto com o que foi escolhido e a causa (R25).
// ─────────────────────────────────────────────────────────────────────────────
//
// A prévia é `paintStays` sobre as estadias carregadas — a mesma regra que o
// banco espelha (A2). `paintStays` LANÇA em intervalo invertido e
// `entriesForPeriod('away')` LANÇA sem cidade (ledger, T2): por isso a prévia
// só é calculada com o rascunho válido; o inválido mostra o motivo e trava o
// Salvar.

import { useId, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import {
  CALENDAR_LIMITS,
  entriesForDelete,
  entriesForEdit,
  entriesForPeriod,
  paintStays,
  shortCityName,
} from '../domain/calendar'
import type { PaintEntry, PeriodChoice, PeriodDraft, Run } from '../domain/calendar'
import { addDays, daysInclusive, diffDays, shortDayMonth } from '../lib/date'
import { BandStrip, CalDialog, ModalField } from './CalDialog'
import { CityPicker } from './CityPicker'
import { previewCityId, resolveCity } from './cityChoice'
import type { CityChoice } from './cityChoice'
import { writeFailureMessage } from './context'
import type { ModalEnv } from './modalEnv'
import { bandsByDay, daysBetween, monthNameOf, replacedDays } from './modalPreview'
import { CouplePair } from './parts'
import { bandColor } from './view'
import './calendar.css'
import './modals.css'

export type PeriodModalMode = { kind: 'new'; day: string } | { kind: 'edit'; run: Run }

export interface PeriodModalProps {
  env: ModalEnv
  mode: PeriodModalMode
  onClose: () => void
  onSaved: () => void | Promise<void>
}

const DELETE_CONFIRM = 'Nesses dias, cada um volta pra própria casa.'

function choiceOfRun(run: Run): PeriodChoice | null {
  return run.band === 'unknown' ? null : run.band
}

export function PeriodModal({ env, mode, onClose, onSaved }: PeriodModalProps) {
  const { api, coupleId, people, members, stays, cities, settings, today } = env
  // Um trecho `unknown` não tem o que editar: vira um Novo período no começo dele.
  const run = mode.kind === 'edit' && mode.run.band !== 'unknown' ? mode.run : null
  const editing = run !== null
  const startDay = mode.kind === 'new' ? mode.day : mode.run.from

  const [choice, setChoice] = useState<PeriodChoice | null>(run ? choiceOfRun(run) : null)
  const [city, setCity] = useState<CityChoice | null>(() => {
    if (!run || run.band !== 'away' || run.cityId === null) return null
    return cities.get(run.cityId) ?? null
  })
  const [from, setFrom] = useState(startDay)
  const [to, setTo] = useState(run?.to ?? '')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const ids = useId()
  const fid = (name: string) => `${ids}-${name}`

  const sameHome = people[1].homeCity.id === people[2].homeCity.id
  const home1 = shortCityName(people[1].homeCity.name)
  const home2 = shortCityName(people[2].homeCity.name)
  const cards: { choice: PeriodChoice; title: string; sub: string }[] = sameHome
    ? [
        { choice: 'home1', title: `Juntos em ${home1}`, sub: 'Os dois em casa' },
        { choice: 'away', title: 'Viajando juntos', sub: 'Outra cidade' },
      ]
    : [
        { choice: 'home1', title: `Juntos em ${home1}`, sub: `${people[2].name} veio` },
        { choice: 'home2', title: `Juntos em ${home2}`, sub: `${people[1].name} foi` },
        { choice: 'away', title: 'Viajando juntos', sub: 'Outra cidade' },
        { choice: 'apart', title: 'Separados', sub: 'Cada um na sua' },
      ]

  // Em aberto só na edição de um trecho que já estava em aberto (R16).
  const openAllowed = editing && run.to === null
  const end = to === '' ? null : to
  let invalid: { message: string; field: 'choice' | 'from' | 'to' | 'city' } | null = null
  if (choice === null) invalid = { message: 'Escolha onde cada um vai estar.', field: 'choice' }
  else if (from === '') invalid = { message: 'Escolha o início.', field: 'from' }
  else if (end === null && !openAllowed) invalid = { message: 'Escolha o fim.', field: 'to' }
  else if (end !== null && end < from) invalid = { message: 'O fim precisa ser no dia do início ou depois.', field: 'to' }
  else if (end !== null && diffDays(from, end) >= CALENDAR_LIMITS.spanDays) {
    invalid = { message: `No máximo ${CALENDAR_LIMITS.spanDays} dias.`, field: 'to' }
  } else if (choice === 'away' && city === null) invalid = { message: 'Escolha a cidade.', field: 'city' }

  function entriesWith(cityId: string | null): PaintEntry[] {
    const draft: PeriodDraft = { choice: choice as PeriodChoice, cityId, from, to: end }
    return run ? entriesForEdit(run, draft, members) : entriesForPeriod(draft, members)
  }

  // Só com o rascunho válido: a pintura lança no inválido (ver o topo).
  const preview = (() => {
    if (invalid !== null || choice === null) return null
    const entries = entriesWith(city ? previewCityId(city) : null)
    const after = paintStays(stays, entries, api.newId)
    const stripFrom = addDays(from, -3)
    const stripTo = addDays(from, 3)
    return {
      replaced: replacedDays(stays, after, members, entries),
      days: daysBetween(stripFrom, stripTo),
      bands: bandsByDay(after, members, stripFrom, stripTo),
    }
  })()

  const band = choice ?? 'home1'
  const stateWord =
    choice === 'home1'
      ? `juntos em ${home1}`
      : choice === 'home2'
        ? `juntos em ${home2}`
        : choice === 'away'
          ? 'viajando'
          : 'separados'
  const n = end === null ? null : daysInclusive(from, end)
  const previewLabel = n === null ? `desde ${shortDayMonth(from)} · ${stateWord}` : `${n === 1 ? '1 dia' : `${n} dias`} ${stateWord}`

  // _Apagar período_ some quando não mudaria nada: separados, cada um em casa.
  const deletable =
    run !== null &&
    !(
      run.band === 'apart' &&
      run.positions[0]?.cityId === members[1].homeCityId &&
      run.positions[1]?.cityId === members[2].homeCityId
    )

  async function write(entries: () => Promise<PaintEntry[] | string>) {
    setPending(true)
    setFailure(null)
    const built = await entries()
    if (typeof built === 'string') {
      setFailure(`Não deu pra salvar: ${built}`)
      setPending(false)
      return
    }
    const result = await api.paint(built)
    if (result.status !== 'ok') {
      setFailure(`Não deu pra salvar: ${writeFailureMessage(result)}`)
      setPending(false)
      return
    }
    await onSaved()
    setPending(false)
  }

  function save() {
    if (invalid !== null || pending) return
    void write(async () => {
      if (choice !== 'away' || city === null) return entriesWith(null)
      // Cascata da seção 7: a cidade do mundo vira linha do casal antes da pintura.
      const resolved = await resolveCity(api, coupleId, city)
      if (!resolved.ok) return resolved.message
      setCity(resolved.city)
      return entriesWith(resolved.city.id)
    })
  }

  function erase() {
    if (!run || pending) return
    void write(async () => entriesForDelete(run, members))
  }

  const footer = confirmDelete ? (
    <div className="cal-modal-confirm" role="group" aria-label="Apagar período">
      <p>{DELETE_CONFIRM}</p>
      <span className="cal-modal-actions">
        <button type="button" className="cal-btn" onClick={() => setConfirmDelete(false)} disabled={pending}>
          Voltar
        </button>
        <button type="button" className="cal-btn cal-btn--danger" onClick={erase} disabled={pending}>
          <Trash2 size={16} aria-hidden="true" />
          {pending ? 'Apagando…' : 'Apagar'}
        </button>
      </span>
    </div>
  ) : (
    <>
      {deletable && (
        <button type="button" className="cal-btn cal-btn--ghost-danger" onClick={() => setConfirmDelete(true)} disabled={pending}>
          <Trash2 size={16} aria-hidden="true" />
          Apagar período
        </button>
      )}
      <span className="cal-modal-actions">
        <button type="button" className="cal-btn" onClick={onClose} disabled={pending}>
          <X size={16} aria-hidden="true" />
          Cancelar
        </button>
        <button type="button" className="cal-btn cal-btn--primary" onClick={save} disabled={invalid !== null || pending}>
          <Check size={17} aria-hidden="true" />
          {pending ? 'Salvando…' : 'Salvar período'}
        </button>
      </span>
    </>
  )

  return (
    <CalDialog
      title={editing ? 'Editar período' : 'Novo período'}
      subtitle="Marque onde cada um vai estar"
      onClose={onClose}
      closeDisabled={pending}
      footer={footer}
    >
      <fieldset className="cal-mf-fieldset" disabled={pending} aria-busy={pending}>
        <ModalField label="Estado" field="state">
          <div className="cal-pcards" role="radiogroup" aria-label="Estado">
            {cards.map((c) => (
              <button
                key={c.choice}
                type="button"
                role="radio"
                aria-checked={choice === c.choice}
                className="cal-pcard"
                style={{ '--band': bandColor(settings, c.choice) } as CSSProperties}
                onClick={() => {
                  setChoice(c.choice)
                  setFailure(null)
                }}
              >
                <span className="cal-pcard-top">
                  <CouplePair people={[people[1], people[2]]} together={c.choice !== 'apart'} />
                  <span className="cal-pcard-radio" aria-hidden="true" />
                </span>
                <span className="cal-pcard-title">{c.title}</span>
                <span className="cal-pcard-sub">{c.sub}</span>
                <span className="cal-pcard-bar" aria-hidden="true" />
              </button>
            ))}
          </div>
        </ModalField>

        {choice === 'away' && (
          <div className="cal-mf" data-field="city">
            <CityPicker
              api={api}
              homes={[
                { city: people[1].homeCity, owner: people[1].name },
                { city: people[2].homeCity, owner: people[2].name },
              ]}
              value={city}
              onChange={setCity}
              label="Cidade"
              id={fid('city')}
              disabled={pending}
            />
          </div>
        )}

        <div className="cal-mf-row">
          <ModalField label="Início" htmlFor={fid('from')} field="from">
            <div className="cal-mf-input">
              <input
                id={fid('from')}
                type="date"
                value={from}
                required
                aria-invalid={invalid?.field === 'from' || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
          </ModalField>
          <ModalField label="Fim" htmlFor={fid('to')} field="to">
            <div className={`cal-mf-input ${invalid?.field === 'to' ? 'is-invalid' : ''}`}>
              <input
                id={fid('to')}
                type="date"
                value={to}
                min={from}
                required={!openAllowed}
                aria-invalid={invalid?.field === 'to' || undefined}
                aria-describedby={invalid ? fid('invalid') : undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </ModalField>
        </div>
        {openAllowed && <p className="cal-mf-hint">Sem fim, o período continua em aberto.</p>}

        {preview && (
          <section className="cal-pprev" aria-label={`Prévia · ${monthNameOf(from)}`}>
            <header className="cal-pprev-head">
              <span>Prévia · {monthNameOf(from)}</span>
              <span className="cal-pprev-label" style={{ '--band': bandColor(settings, band) } as CSSProperties}>
                {previewLabel}
              </span>
            </header>
            <BandStrip
              days={preview.days}
              bands={preview.bands}
              settings={settings}
              today={today}
              highlight={(d) => d >= from && (end === null || d <= end)}
              label="Como os dias vão ficar"
            />
            {preview.replaced > 0 && (
              <p className="cal-pprev-replaced">
                {preview.replaced === 1
                  ? 'Substitui 1 dia que já estava no calendário'
                  : `Substitui ${preview.replaced} dias que já estavam no calendário`}
              </p>
            )}
          </section>
        )}

        {invalid !== null && (choice !== null || editing) && (
          <p className="cal-mf-hint" id={fid('invalid')}>
            {invalid.message}
          </p>
        )}
        {failure && (
          <p className="cal-mf-error" role="alert">
            {failure}
          </p>
        )}
      </fieldset>
    </CalDialog>
  )
}
