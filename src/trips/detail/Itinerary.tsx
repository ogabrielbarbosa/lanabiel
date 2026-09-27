// O _Roteiro dia a dia_ do detalhe (spec R17; `Itinerary Item` `T51V9`):
// cada dia com a pílula _Dia {k}_, a data e o título (tocar edita, R20), os
// itens por hora (tocar edita, R19), os dias vazios seguidos num bloco _em
// aberto_ com sugestões da Lista, o colapso em 4 dias com itens (_Ver dias 5
// a N_) e o grupo _Fora das datas da viagem_. A forma sai toda de
// `itineraryPlan` (domínio); aqui é só desenho.

import { useState } from 'react'
import { CalendarPlus, ChevronDown, ChevronUp, ListChecks } from 'lucide-react'
import { CATEGORY_LABELS } from '../../domain/list'
import type { ListItem } from '../../domain/list'
import { itineraryPlan } from '../../domain/tripDerive'
import type { PlanBlock } from '../../domain/tripDerive'
import { ITINERARY_KIND_LABEL } from '../../domain/trips'
import type { ItineraryItem, Trip } from '../../domain/trips'
import { weekdayShortDayMonth } from '../../lib/date'
import { CATEGORY_ICONS } from '../../list/categories'
import { usePhotoUrls } from '../context'
import { ITINERARY_VISUAL, toneStyle } from './format'
import { Card } from './parts'

export interface ItineraryActions {
  /** Novo item num dia; `listItemId` = já vinculado (sugestão, R17). */
  onAdd: (day: string, listItemId?: string | null) => void
  onEdit: (item: ItineraryItem) => void
  onDayTitle: (day: string) => void
}

export function Itinerary({
  trip,
  done,
  suggestions,
  listItems,
  destName,
  actions,
}: {
  trip: Trip
  /** Feita ou em andamento: _Editar roteiro_; futura: _Montar roteiro_. */
  done: boolean
  suggestions: readonly ListItem[]
  listItems: readonly ListItem[]
  destName: string
  actions: ItineraryActions
}) {
  const [expanded, setExpanded] = useState(false)
  const plan = itineraryPlan(trip, suggestions, { expanded })
  const byId = new Map(listItems.map((i) => [i.id, i]))
  const urls = usePhotoUrls(trip.itinerary.map((i) => (i.listItemId ? byId.get(i.listItemId)?.photoPath : null)))

  const row = (item: ItineraryItem) => {
    const linked = item.listItemId ? byId.get(item.listItemId) : undefined
    return <ItineraryRow key={item.id} item={item} linked={linked} photoUrl={linked?.photoPath ? (urls.get(linked.photoPath) ?? null) : null} onEdit={actions.onEdit} />
  }

  const block = (b: PlanBlock) =>
    b.kind === 'day' ? (
      <li key={b.day} className="td-day" data-day={b.day}>
        <div className="td-day-head">
          <span className="td-day-pill">Dia {b.k}</span>
          <span className="td-day-date">{b.dateLabel}</span>
          <button
            type="button"
            className={`td-day-title ${b.title ? '' : 'is-empty'}`}
            aria-label={b.title ? `Editar o título do dia ${b.k}: ${b.title}` : `Dar um título ao dia ${b.k}`}
            onClick={() => actions.onDayTitle(b.day)}
          >
            · {b.title ?? 'dar um título'}
          </button>
        </div>
        {b.items.length > 0 && <ul className="td-items">{b.items.map(row)}</ul>}
      </li>
    ) : (
      <li key={b.from} className="td-day td-day--open" data-day={b.from}>
        <div className="td-day-head">
          <span className="td-day-pill td-day-pill--open">
            Dia {b.dayFrom} a {b.dayTo}
          </span>
          <span className="td-day-date">{b.rangeLabel}</span>
          <span className="td-day-title is-static">· em aberto</span>
        </div>
        <div className="td-open">
          <CalendarPlus size={24} className="td-open-icon" aria-hidden="true" />
          <p>
            {b.freeDays} dias livres — puxem itens da lista de {destName} pra cá
          </p>
          {b.suggestions.length > 0 && (
            <div className="td-open-suggestions" role="group" aria-label="Sugestões da lista">
              {b.suggestions.map((s) => {
                const Icon = CATEGORY_ICONS[s.category]
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="td-pill-btn td-suggestion"
                    style={toneStyle(`cat-${s.category}`)}
                    aria-label={`${s.name} — pôr no roteiro, ${b.freeDays} dias livres`}
                    onClick={() => actions.onAdd(b.from, s.id)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {s.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </li>
    )

  return (
    <Card
      title="Roteiro dia a dia"
      labelledBy={`td-itinerary-${trip.id}`}
      className="td-itinerary"
      action={{ label: done ? 'Editar roteiro' : 'Montar roteiro', onClick: () => actions.onAdd(plan.firstEmptyDay) }}
    >
      <ol className="td-days">{plan.visible.map(block)}</ol>
      {(plan.moreLabel || expanded) && (
        <div className="td-more">
          <button type="button" className="td-pill-btn" aria-expanded={expanded} onClick={() => setExpanded((e) => !e)}>
            {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
            {expanded ? 'Mostrar menos' : plan.moreLabel}
          </button>
        </div>
      )}
      {plan.outside.length > 0 && (
        <section className="td-outside" aria-label="Fora das datas da viagem">
          <div className="td-day-head">
            <span className="td-day-pill td-day-pill--open">Fora das datas da viagem</span>
          </div>
          <ul className="td-items">
            {plan.outside.map((item) => (
              <li key={item.id} className="td-outside-item">
                <span className="td-outside-date">{weekdayShortDayMonth(item.day)}</span>
                <ul className="td-items">{row(item)}</ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  )
}

/** Um item (`T51V9`): hora, miniatura, título, tipo · nota e o selo _da lista_. */
function ItineraryRow({
  item,
  linked,
  photoUrl,
  onEdit,
}: {
  item: ItineraryItem
  linked: ListItem | undefined
  photoUrl: string | null
  onEdit: (item: ItineraryItem) => void
}) {
  const V = ITINERARY_VISUAL[item.kind]
  return (
    <li>
      <button type="button" className="td-item" style={toneStyle(V.tone)} onClick={() => onEdit(item)}>
        <span className="td-item-time">{item.at ?? ''}</span>
        <span className="td-item-thumb" aria-hidden="true">
          {photoUrl ? <img src={photoUrl} alt="" loading="lazy" /> : <V.icon size={20} />}
        </span>
        <span className="td-item-text">
          <span className="td-item-name">{item.title}</span>
          <span className="td-item-meta">
            <V.icon size={12} className="td-tone-icon" aria-hidden="true" />
            <span className="td-item-kind">{ITINERARY_KIND_LABEL[item.kind]}</span>
            {item.note && <span className="td-item-note">· {item.note}</span>}
          </span>
        </span>
        {item.listItemId && (
          <span className="td-list-badge" title={linked ? `${linked.name} · ${CATEGORY_LABELS[linked.category].one}` : undefined}>
            <ListChecks size={11} aria-hidden="true" />
            da lista
          </span>
        )}
      </button>
    </li>
  )
}
