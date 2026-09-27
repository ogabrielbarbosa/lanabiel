// Os editores sem frame próprio do detalhe (spec R20b–R20d, R23): item de
// preparação, linhas do orçamento, hospedagem e memória. Todos na moldura do
// `CalDialog`, com os campos `Form Field` do `xLhij`, e com o mesmo contrato
// (R27): aberto e desabilitado enquanto grava, a causa na falha, relê no `ok`.

import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarDays, Check, Hash, House, Link as LinkIcon, MapPin, NotebookPen, Plus, StickyNote, Trash2, Type, Wallet } from 'lucide-react'
import { CalDialog, ModalField, ModalSwitch } from '../../calendar/CalDialog'
import type { Rating } from '../../domain/list'
import { TRIP_LIMITS } from '../../domain/trips'
import type { BudgetDraft, BudgetLine, Lodging, PrepItem, Trip, TripMemory } from '../../domain/trips'
import { validateBudget, validateLodging, validateMemory, validatePrep } from '../../domain/tripValidation'
import type { LodgingField } from '../../domain/tripValidation'
import { Hearts } from '../../list/Hearts'
import type { TripRef } from '../api'
import { tripFailureMessage, useTrips } from '../context'
import { centsText, parseBRL } from './format'
import { useTripWrite } from './useTripWrite'

function Footer({
  pending,
  onClose,
  onSave,
  saveLabel = 'Salvar',
  left,
}: {
  pending: boolean
  onClose: () => void
  onSave: () => void
  saveLabel?: string
  left?: ReactNode
}) {
  return (
    <>
      {left}
      <span className="cal-modal-actions">
        <button type="button" className="cal-btn" onClick={onClose} disabled={pending}>
          Cancelar
        </button>
        <button type="button" className="cal-btn cal-btn--primary" onClick={onSave} disabled={pending}>
          <Check size={17} aria-hidden="true" />
          {pending ? 'Salvando…' : saveLabel}
        </button>
      </span>
    </>
  )
}

/** O rodapé com _Apagar_ e a confirmação no lugar dos botões. */
function useDeleteFooter(pending: boolean, question: string, erase: () => void) {
  const [confirm, setConfirm] = useState(false)
  const left = (
    <button type="button" className="cal-btn cal-btn--ghost-danger" onClick={() => setConfirm(true)} disabled={pending}>
      <Trash2 size={16} aria-hidden="true" />
      Apagar
    </button>
  )
  const confirmNode = confirm ? (
    <div className="cal-modal-confirm" role="group" aria-label="Confirmar">
      <p>{question}</p>
      <span className="cal-modal-actions">
        <button type="button" className="cal-btn" onClick={() => setConfirm(false)} disabled={pending}>
          Voltar
        </button>
        <button type="button" className="cal-btn cal-btn--danger" onClick={erase} disabled={pending}>
          <Trash2 size={16} aria-hidden="true" />
          {pending ? 'Apagando…' : 'Apagar'}
        </button>
      </span>
    </div>
  ) : null
  return { left, confirmNode }
}

function Failure({ text }: { text: string | null }) {
  return text ? (
    <p className="cal-mf-error" role="alert">
      {text}
    </p>
  ) : null
}

function TextField({
  id,
  label,
  value,
  onChange,
  icon,
  max,
  error,
  placeholder,
  type = 'text',
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  icon: ReactNode
  max?: number
  error?: string | null
  placeholder?: string
  type?: 'text' | 'url' | 'datetime-local'
}) {
  return (
    <ModalField label={label} htmlFor={id} field={id} error={error}>
      <div className={`cal-mf-input ${error ? 'is-invalid' : ''}`}>
        {icon}
        <input
          id={id}
          type={type}
          value={value}
          maxLength={max}
          placeholder={placeholder}
          aria-invalid={!!error || undefined}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </ModalField>
  )
}

const orNull = (s: string): string | null => (s.trim() === '' ? null : s.trim())

// ---------------------------------------------------------------------------
// Preparação (R20b)
// ---------------------------------------------------------------------------

export function PrepModal({ trip, item, onClose }: { trip: Trip; item: PrepItem | null; onClose: () => void }) {
  const { api, coupleId } = useTrips()
  const fid = useId()
  const [label, setLabel] = useState(item?.label ?? '')
  const [detail, setDetail] = useState(item?.detail ?? '')
  const [invalid, setInvalid] = useState<{ field: string; reason: string } | null>(null)
  const { pending, failure, run } = useTripWrite()

  async function save() {
    const draft = { kind: item?.kind ?? ('outro' as const), label: label.trim(), detail: orNull(detail), done: item?.done ?? false }
    const v = validatePrep(draft)
    if (!v.ok) return setInvalid({ field: v.field, reason: v.reason })
    setInvalid(null)
    const ok = await run(() => (item ? api.updatePrep(item.id, draft) : api.createPrep(coupleId, trip, draft)))
    if (ok) onClose()
  }

  async function erase() {
    if (!item) return
    const ok = await run(() => api.deletePrep(item.id), 'Não deu pra apagar')
    if (ok) onClose()
  }
  const del = useDeleteFooter(pending, `Apagar ${item?.label ?? ''} da preparação?`, () => void erase())

  return (
    <CalDialog
      title={item ? 'Editar preparação' : 'Novo item da preparação'}
      subtitle={trip.title}
      onClose={onClose}
      closeDisabled={pending}
      footer={del.confirmNode ?? <Footer pending={pending} onClose={onClose} onSave={() => void save()} left={item ? del.left : undefined} />}
    >
      <fieldset className="cal-mf-fieldset" disabled={pending} aria-busy={pending}>
        <TextField
          id={`${fid}-label`}
          label="Item"
          value={label}
          onChange={setLabel}
          icon={<Type size={15} aria-hidden="true" />}
          max={TRIP_LIMITS.prepLabel}
          placeholder="Passagens"
          error={invalid?.field === 'label' ? invalid.reason : null}
        />
        <TextField
          id={`${fid}-detail`}
          label="Detalhe"
          value={detail}
          onChange={setDetail}
          icon={<StickyNote size={15} aria-hidden="true" />}
          max={TRIP_LIMITS.prepDetail}
          placeholder="opcional"
          error={invalid?.field === 'detail' ? invalid.reason : null}
        />
        <Failure text={failure} />
      </fieldset>
    </CalDialog>
  )
}

// ---------------------------------------------------------------------------
// Orçamento (R20c): o editor das linhas
// ---------------------------------------------------------------------------

interface BudgetRow {
  key: string
  id: string | null
  label: string
  planned: string
  spent: string
}

let rowSeq = 0
const rowOf = (l: BudgetLine | null): BudgetRow => ({
  key: l?.id ?? `new-${++rowSeq}`,
  id: l?.id ?? null,
  label: l?.label ?? '',
  planned: l ? centsText(l.plannedCents) : '',
  spent: l ? centsText(l.spentCents) : '',
})

export function BudgetModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { api, coupleId, reload } = useTrips()
  const fid = useId()
  const original = [...trip.budget].sort((a, b) => a.position - b.position)
  const [rows, setRows] = useState<BudgetRow[]>(() => (original.length > 0 ? original.map(rowOf) : [rowOf(null)]))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const update = (key: string, patch: Partial<BudgetRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  async function save() {
    // Linha toda em branco é linha que não existe.
    const kept = rows.filter((r) => r.id !== null || r.label.trim() !== '' || r.planned.trim() !== '' || r.spent.trim() !== '')
    const drafts = new Map<string, BudgetDraft>()
    const errs: Record<string, string> = {}
    for (const r of kept) {
      const planned = parseBRL(r.planned) ?? 0
      const spent = parseBRL(r.spent) ?? 0
      const draft = { label: r.label.trim(), plannedCents: planned, spentCents: spent }
      const v = validateBudget(draft)
      if (!v.ok) errs[r.key] = v.reason
      else drafts.set(r.key, draft)
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return

    setPending(true)
    setFailure(null)
    const keptIds = new Set(kept.map((r) => r.id).filter(Boolean))
    let ref: TripRef = trip
    let wrote = false
    const fail = async (message: string) => {
      setFailure(message)
      if (wrote) await reload()
      setPending(false)
    }
    for (const line of original) {
      if (keptIds.has(line.id)) continue
      const r = await api.deleteBudget(line.id)
      if (r.status !== 'ok') return fail(`Não deu pra apagar ${line.label}: ${tripFailureMessage(r)}`)
      wrote = true
    }
    for (const row of kept) {
      const draft = drafts.get(row.key) as BudgetDraft
      if (row.id === null) {
        const r = await api.createBudget(coupleId, ref, draft)
        if (r.status !== 'ok') return fail(`Não deu pra salvar ${draft.label}: ${tripFailureMessage(r)}`)
        ref = { ...ref, budget: [...ref.budget, r.value] }
        wrote = true
      } else {
        const before = original.find((l) => l.id === row.id)
        if (before && before.label === draft.label && before.plannedCents === draft.plannedCents && before.spentCents === draft.spentCents) continue
        const r = await api.updateBudget(row.id, draft)
        if (r.status !== 'ok') return fail(`Não deu pra salvar ${draft.label}: ${tripFailureMessage(r)}`)
        wrote = true
      }
    }
    await reload()
    setPending(false)
    onClose()
  }

  return (
    <CalDialog
      title="Orçamento estimado"
      subtitle={trip.title}
      icon={<Wallet size={20} />}
      iconClass="td-modal-icon"
      onClose={onClose}
      closeDisabled={pending}
      wide
      footer={<Footer pending={pending} onClose={onClose} onSave={() => void save()} saveLabel="Salvar orçamento" />}
    >
      <fieldset className="cal-mf-fieldset" disabled={pending} aria-busy={pending}>
        <div className="td-budget-edit" role="table" aria-label="Linhas do orçamento">
          <div className="td-budget-edit-row td-budget-edit-head" role="row">
            <span role="columnheader">Linha</span>
            <span role="columnheader">Planejado</span>
            <span role="columnheader">Gasto</span>
            <span role="columnheader" className="visually-hidden">
              Apagar
            </span>
          </div>
          {rows.map((r, i) => (
            <div key={r.key} className="td-budget-edit-row" role="row">
              <div className={`cal-mf-input ${errors[r.key] ? 'is-invalid' : ''}`} role="cell">
                <input
                  aria-label={`Rótulo da linha ${i + 1}`}
                  id={`${fid}-${r.key}-label`}
                  type="text"
                  value={r.label}
                  maxLength={TRIP_LIMITS.budgetLabel}
                  placeholder="Passagens"
                  onChange={(e) => update(r.key, { label: e.target.value })}
                />
              </div>
              <div className="cal-mf-input" role="cell">
                <span className="td-money-prefix" aria-hidden="true">
                  R$
                </span>
                <input
                  aria-label={`Planejado da linha ${i + 1}`}
                  type="text"
                  inputMode="decimal"
                  value={r.planned}
                  placeholder="0"
                  onChange={(e) => update(r.key, { planned: e.target.value })}
                />
              </div>
              <div className="cal-mf-input" role="cell">
                <span className="td-money-prefix" aria-hidden="true">
                  R$
                </span>
                <input
                  aria-label={`Gasto da linha ${i + 1}`}
                  type="text"
                  inputMode="decimal"
                  value={r.spent}
                  placeholder="0"
                  onChange={(e) => update(r.key, { spent: e.target.value })}
                />
              </div>
              <span role="cell">
                <button
                  type="button"
                  className="cal-mf-x"
                  aria-label={`Apagar a linha ${r.label.trim() || i + 1}`}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </span>
              {errors[r.key] && (
                <p className="cal-mf-error td-budget-edit-error" role="alert">
                  {errors[r.key]}
                </p>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="cal-btn td-budget-add"
          onClick={() => setRows((rs) => [...rs, rowOf(null)])}
          disabled={rows.length >= TRIP_LIMITS.budgetPerTrip}
        >
          <Plus size={16} aria-hidden="true" />
          Adicionar linha
        </button>
        <Failure text={failure} />
      </fieldset>
    </CalDialog>
  )
}

// ---------------------------------------------------------------------------
// Hospedagem (R20d): os sete campos e o _Pago_
// ---------------------------------------------------------------------------

export function LodgingModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const { api } = useTrips()
  const fid = useId()
  const l = trip.lodging
  const [name, setName] = useState(l.name ?? '')
  const [address, setAddress] = useState(l.address ?? '')
  const [checkIn, setCheckIn] = useState(l.checkIn ?? '')
  const [checkOut, setCheckOut] = useState(l.checkOut ?? '')
  const [url, setUrl] = useState(l.url ?? '')
  const [code, setCode] = useState(l.code ?? '')
  const [value, setValue] = useState(centsText(l.cents))
  const [paid, setPaid] = useState(l.paid)
  const [invalid, setInvalid] = useState<{ field: LodgingField; reason: string } | null>(null)
  const { pending, failure, run } = useTripWrite()
  const err = (f: LodgingField) => (invalid?.field === f ? invalid.reason : null)

  async function save() {
    const cents = parseBRL(value)
    const lodging: Lodging = {
      name: orNull(name),
      address: orNull(address),
      checkIn: orNull(checkIn)?.slice(0, 16) ?? null,
      checkOut: orNull(checkOut)?.slice(0, 16) ?? null,
      url: orNull(url),
      code: orNull(code),
      cents,
      paid,
    }
    const v = cents !== null && Number.isNaN(cents) ? ({ ok: false, field: 'cents', reason: 'Valor inválido.' } as const) : validateLodging(lodging)
    if (!v.ok) return setInvalid({ field: v.field, reason: v.reason })
    setInvalid(null)
    const ok = await run(() => api.updateTrip(trip.id, { lodging }))
    if (ok) onClose()
  }

  return (
    <CalDialog
      title="Hospedagem"
      subtitle={trip.title}
      icon={<House size={20} />}
      iconClass="td-modal-icon"
      onClose={onClose}
      closeDisabled={pending}
      footer={<Footer pending={pending} onClose={onClose} onSave={() => void save()} saveLabel="Salvar hospedagem" />}
    >
      <fieldset className="cal-mf-fieldset" disabled={pending} aria-busy={pending}>
        <TextField id={`${fid}-name`} label="Nome" value={name} onChange={setName} icon={<House size={15} aria-hidden="true" />} max={TRIP_LIMITS.lodgingName} placeholder="Casa do Largo" error={err('name')} />
        <TextField id={`${fid}-address`} label="Endereço" value={address} onChange={setAddress} icon={<MapPin size={15} aria-hidden="true" />} max={TRIP_LIMITS.lodgingAddress} error={err('address')} />
        <div className="cal-mf-row">
          <TextField id={`${fid}-checkin`} label="Check-in" type="datetime-local" value={checkIn} onChange={setCheckIn} icon={<CalendarDays size={15} aria-hidden="true" />} error={err('checkIn')} />
          <TextField id={`${fid}-checkout`} label="Check-out" type="datetime-local" value={checkOut} onChange={setCheckOut} icon={<CalendarDays size={15} aria-hidden="true" />} error={err('checkOut')} />
        </div>
        <TextField id={`${fid}-url`} label="Link da reserva" type="url" value={url} onChange={setUrl} icon={<LinkIcon size={15} aria-hidden="true" />} max={TRIP_LIMITS.lodgingUrl} placeholder="https://" error={err('url')} />
        <div className="cal-mf-row">
          <TextField id={`${fid}-code`} label="Código da reserva" value={code} onChange={setCode} icon={<Hash size={15} aria-hidden="true" />} max={TRIP_LIMITS.lodgingCode} error={err('code')} />
          <ModalField label="Valor" htmlFor={`${fid}-cents`} field="cents" error={err('cents')}>
            <div className={`cal-mf-input ${err('cents') ? 'is-invalid' : ''}`}>
              <span className="td-money-prefix" aria-hidden="true">
                R$
              </span>
              <input id={`${fid}-cents`} type="text" inputMode="decimal" value={value} placeholder="0" onChange={(e) => setValue(e.target.value)} />
            </div>
          </ModalField>
        </div>
        <ModalSwitch id={`${fid}-paid`} label="Pago" checked={paid} onChange={setPaid} />
        <Failure text={failure} />
      </fieldset>
    </CalDialog>
  )
}

// ---------------------------------------------------------------------------
// Memória (R23): a minha — corações 1–5 e o texto
// ---------------------------------------------------------------------------

export function MemoryModal({ trip, mine, onClose }: { trip: Trip; mine: TripMemory | null; onClose: () => void }) {
  const { api, coupleId } = useTrips()
  const fid = useId()
  const [rating, setRating] = useState<Rating | null>((mine?.rating as Rating | undefined) ?? null)
  const [body, setBody] = useState(mine?.body ?? '')
  const [invalid, setInvalid] = useState<{ field: string; reason: string } | null>(null)
  const { pending, failure, run } = useTripWrite()

  async function save() {
    const draft = { rating: rating ?? 0, body }
    const v = validateMemory(draft)
    if (!v.ok) return setInvalid({ field: v.field, reason: v.reason })
    setInvalid(null)
    const ok = await run(() => api.saveMemory(coupleId, trip.id, { rating: draft.rating, body: body.trim() }))
    if (ok) onClose()
  }

  async function erase() {
    const ok = await run(() => api.deleteMemory(trip.id), 'Não deu pra apagar')
    if (ok) onClose()
  }
  const del = useDeleteFooter(pending, 'Apagar a sua memória desta viagem?', () => void erase())

  return (
    <CalDialog
      title={mine ? 'Editar a minha memória' : 'Escrever memória'}
      subtitle={trip.title}
      icon={<NotebookPen size={20} />}
      iconClass="td-modal-icon"
      onClose={onClose}
      closeDisabled={pending}
      footer={del.confirmNode ?? <Footer pending={pending} onClose={onClose} onSave={() => void save()} saveLabel="Salvar memória" left={mine ? del.left : undefined} />}
    >
      <fieldset className="cal-mf-fieldset" disabled={pending} aria-busy={pending}>
        <ModalField label="Nota" field="rating" error={invalid?.field === 'rating' ? invalid.reason : null}>
          <Hearts value={rating} onPick={setRating} label="Nota da viagem" size={22} disabled={pending} />
        </ModalField>
        <ModalField label="Como foi" htmlFor={`${fid}-body`} field="body" error={invalid?.field === 'body' ? invalid.reason : null}>
          <textarea
            id={`${fid}-body`}
            className={`td-textarea ${invalid?.field === 'body' ? 'is-invalid' : ''}`}
            value={body}
            rows={6}
            maxLength={TRIP_LIMITS.memoryBody}
            placeholder="O que vocês não querem esquecer?"
            onChange={(e) => setBody(e.target.value)}
          />
        </ModalField>
        <Failure text={failure} />
      </fieldset>
    </CalDialog>
  )
}
