// Os blocos da viagem FUTURA (spec R18, R20b–R20d; `f3yqz`): _Preparação_,
// _Orçamento estimado_ e _Hospedagem_. Os editores deles moram em
// `editors.tsx`; aqui é o que se vê e o toque que os abre.

import { useState } from 'react'
import { CalendarDays, CircleCheck, CircleDashed, House, Link as LinkIcon, MapPin, Plane, Plus, Soup, Sparkles, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CouplePair } from '../../calendar/parts'
import { budgetSummary, checkTimeLabel, formatBRL, prepSummary, shortUrl } from '../../domain/tripDerive'
import type { PrepItem, Trip } from '../../domain/trips'
import { useTrips } from '../context'
import { toneStyle } from './format'
import { Card } from './parts'
import { useTripWrite } from './useTripWrite'

// ---------------------------------------------------------------------------
// Preparação (R20b)
// ---------------------------------------------------------------------------

export function PrepCard({ trip, onEdit, onAdd }: { trip: Trip; onEdit: (item: PrepItem) => void; onAdd: () => void }) {
  const { api, people } = useTrips()
  const { done, total } = prepSummary(trip)
  const items = [...trip.prep].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
  const { pending, failure, run } = useTripWrite()
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(item: PrepItem) {
    setBusy(item.id)
    await run(() => api.setPrepDone(item.id, !item.done), 'Não deu pra marcar')
    setBusy(null)
  }

  return (
    <Card title="Preparação" labelledBy={`td-prep-${trip.id}`} className="td-prep" action={{ label: `${done} de ${total}`, text: true }}>
      <div className="td-track" role="progressbar" aria-label="Preparação" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span style={{ width: total === 0 ? 0 : `${(100 * done) / total}%` }} />
      </div>
      <ul className="td-prep-list">
        {items.map((item) => (
          <li key={item.id} className={`td-prep-item ${item.done ? 'is-done' : ''}`}>
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              aria-label={item.label}
              className="td-prep-check"
              disabled={pending && busy === item.id}
              onClick={() => void toggle(item)}
            >
              {item.done ? <CircleCheck size={18} aria-hidden="true" /> : <CircleDashed size={18} aria-hidden="true" />}
            </button>
            <button type="button" className="td-prep-text" aria-label={`Editar ${item.label}`} onClick={() => onEdit(item)}>
              <span className="td-prep-label">{item.label}</span>
              {item.detail && <span className="td-prep-detail">{item.detail}</span>}
            </button>
            {item.done && <CouplePair people={[people[1], people[2]]} together />}
          </li>
        ))}
        <li>
          <button type="button" className="td-prep-add" onClick={onAdd}>
            <Plus size={16} aria-hidden="true" />
            Adicionar item
          </button>
        </li>
      </ul>
      {failure && (
        <p className="cal-mf-error" role="alert">
          {failure}
        </p>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Orçamento (R20c)
// ---------------------------------------------------------------------------

const BUDGET_TONES = ['sky', 'peach', 'sand', 'lime', 'pink', 'lilac', 'coral', 'aqua'] as const

/** O ícone de uma linha pelo rótulo (o do frame para as quatro de sempre). */
function budgetIcon(label: string): LucideIcon {
  const l = label.toLocaleLowerCase('pt-BR')
  if (/passag|voo|aére/.test(l)) return Plane
  if (/hosped|hotel|pousada|casa|apê|ape/.test(l)) return House
  if (/comid|restaur|aliment/.test(l)) return Soup
  if (/passei|ingress|tour|experi/.test(l)) return Sparkles
  return Wallet
}

export function BudgetCard({ trip, onEdit }: { trip: Trip; onEdit: () => void }) {
  const b = budgetSummary(trip)
  return (
    <Card title="Orçamento estimado" labelledBy={`td-budget-${trip.id}`} className="td-budget" action={{ label: 'Editar', onClick: onEdit, ariaLabel: 'Editar orçamento' }}>
      {b.lines.length === 0 ? (
        <div className="td-empty td-empty--left">
          <p>Sem orçamento ainda</p>
        </div>
      ) : (
        <>
          <div className="td-budget-total">
            <div>
              <p className="td-budget-sum">{formatBRL(b.totalCents)}</p>
              <p className="td-budget-per">{formatBRL(b.perPersonCents)} por pessoa</p>
            </div>
            <p className="td-budget-spent">gasto até agora {formatBRL(b.spentCents)}</p>
          </div>
          <div className="td-budget-bar" aria-hidden="true">
            {b.lines.map((l, i) => (
              <span key={l.id} style={{ ...toneStyle(BUDGET_TONES[i % BUDGET_TONES.length]), flexGrow: l.fraction }} />
            ))}
          </div>
          <ul className="td-budget-lines">
            {b.lines.map((l, i) => {
              const Icon = budgetIcon(l.label)
              return (
                <li key={l.id} style={toneStyle(BUDGET_TONES[i % BUDGET_TONES.length])}>
                  <Icon size={14} className="td-tone-icon" aria-hidden="true" />
                  <span className="td-budget-label">{l.label}</span>
                  <span className="td-budget-value">{formatBRL(l.plannedCents)}</span>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Hospedagem (R20d)
// ---------------------------------------------------------------------------

export function LodgingCard({ trip, onEdit }: { trip: Trip; onEdit: () => void }) {
  const l = trip.lodging
  const empty = l.name === null && l.address === null && l.checkIn === null && l.checkOut === null && l.url === null && l.code === null && l.cents === null
  const checks = [l.checkIn ? `Check-in ${checkTimeLabel(l.checkIn)}` : null, l.checkOut ? `Check-out ${checkTimeLabel(l.checkOut)}` : null].filter(Boolean).join(' · ')
  const link = [l.url ? shortUrl(l.url) : null, l.code ? `reserva #${l.code}` : null].filter(Boolean).join(' · ')

  return (
    <Card
      title="Hospedagem"
      labelledBy={`td-lodging-${trip.id}`}
      className="td-lodging"
      action={l.url ? { label: 'Abrir reserva', href: l.url } : null}
    >
      {empty ? (
        <div className="td-empty td-empty--left">
          <button type="button" className="td-pill-btn" onClick={onEdit}>
            <Plus size={16} aria-hidden="true" />
            Adicionar hospedagem
          </button>
        </div>
      ) : (
        <button type="button" className="td-lodging-row" aria-label={`Editar hospedagem: ${l.name ?? 'sem nome'}`} onClick={onEdit}>
          <span className="td-lodging-photo" aria-hidden="true">
            <House size={32} />
          </span>
          <span className="td-lodging-text">
            <span className="td-lodging-name">{l.name ?? 'Hospedagem'}</span>
            {l.address && (
              <span className="td-lodging-line">
                <MapPin size={14} aria-hidden="true" />
                {l.address}
              </span>
            )}
            {checks && (
              <span className="td-lodging-line">
                <CalendarDays size={14} aria-hidden="true" />
                {checks}
              </span>
            )}
            {link && (
              <span className="td-lodging-line">
                <LinkIcon size={14} aria-hidden="true" />
                {link}
              </span>
            )}
            {l.cents !== null && (
              <span className={`td-lodging-paid ${l.paid ? 'is-paid' : 'is-due'}`}>
                {l.paid ? <CircleCheck size={12} aria-hidden="true" /> : <CircleDashed size={12} aria-hidden="true" />}
                {l.paid ? 'Pago' : 'A pagar'} · {formatBRL(l.cents)}
              </span>
            )}
          </span>
        </button>
      )}
    </Card>
  )
}
