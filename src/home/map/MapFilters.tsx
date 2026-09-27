// `Map Filters` (ZLuWp): status _Todos · Quero ir · Já fomos_ com as contagens,
// e as categorias geográficas visíveis.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R12, I3
//
// As contagens de status contam os pins sob o filtro de CATEGORIA
// (`statusCounts`). Os chips são as categorias geográficas reais, na ordem de
// `LIST_CATEGORIES`, sem as ocultas (`categoryChips`) — filme e série não têm
// lugar e não entram no mapa (spec, seção 13, decisão 2).

import { Layers } from 'lucide-react'
import { CATEGORY_LABELS } from '../../domain/list'
import type { ListCategory, ListItem } from '../../domain/list'
import { categoryChips, statusCounts } from '../../domain/map'
import type { MapFilters as Filters, StatusFilter } from '../../domain/map'
import { CATEGORY_ICONS } from '../../list/categories'
import { StatusMarker } from './parts'

const STATUS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'want', label: 'Quero ir' },
  { key: 'done', label: 'Já fomos' },
]

export function MapFilters({
  items,
  hidden,
  filters,
  onChange,
}: {
  items: readonly ListItem[]
  hidden: readonly ListCategory[]
  filters: Filters
  onChange: (filters: Filters) => void
}) {
  const counts = statusCounts(items, hidden, filters.category)
  return (
    <div className="hm-filters">
      <div className="hm-filters-status" role="group" aria-label="Status">
        {STATUS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`hm-status-opt${filters.status === key ? ' is-active' : ''}`}
            aria-pressed={filters.status === key}
            onClick={() => onChange({ ...filters, status: key })}
          >
            <StatusMarker status={key} />
            {label}
            <span className="hm-status-count">{counts[key]}</span>
          </button>
        ))}
      </div>
      <div className="hm-filters-cats" role="group" aria-label="Categoria">
        <button
          type="button"
          className={`hm-chip${filters.category === 'all' ? ' is-active' : ''}`}
          aria-pressed={filters.category === 'all'}
          onClick={() => onChange({ ...filters, category: 'all' })}
        >
          <Layers size={15} aria-hidden="true" />
          Todas
        </button>
        {categoryChips(hidden).map((c) => {
          const Icon = CATEGORY_ICONS[c]
          return (
            <button
              key={c}
              type="button"
              className={`hm-chip${filters.category === c ? ' is-active' : ''}`}
              aria-pressed={filters.category === c}
              onClick={() => onChange({ ...filters, category: c })}
            >
              <Icon size={15} aria-hidden="true" />
              {CATEGORY_LABELS[c].one}
            </button>
          )
        })}
      </div>
    </div>
  )
}
