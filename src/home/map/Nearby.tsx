// _Aqui por perto_ (XwYKK, só no nível cidade) com `Place Quick Card`
// (apt2z, e `Active` V8VroB para o selecionado).
//
// Spec: .agent/Tasks/fase-7-mapa.md — R11, R13, I8
//
// As linhas são `nearby` (domínio) sobre os pins JÁ FILTRADOS, a ≤
// `NEARBY_MAP_KM` do centro da cidade em foco; tocar num grupo no nível
// cidade recorta a lista àquele grupo (R11).

import { ArrowDownUp, CircleCheck, CircleDashed, LocateFixed } from 'lucide-react'
import { CATEGORY_LABELS } from '../../domain/list'
import { NEARBY_MAP_KM, formatKm } from '../../domain/map'
import type { NearbyRow, NearbySort, Pin } from '../../domain/map'
import { CATEGORY_ICONS, catClass } from '../../list/categories'

const SORT_LABEL: Record<NearbySort, string> = { near: 'Mais perto', recent: 'Mais recentes' }

export interface NearbyProps {
  rows: readonly NearbyRow[]
  sort: NearbySort
  onSort: (sort: NearbySort) => void
  selectedId: string | null
  /** Recortada a um grupo tocado (R11): mostra o caminho de volta. */
  grouped: boolean
  onClearGroup: () => void
  onFocus: (pin: Pin) => void
  photoUrl: (pin: Pin) => string | null
}

export function Nearby({ rows, sort, onSort, selectedId, grouped, onClearGroup, onFocus, photoUrl }: NearbyProps) {
  const n = rows.length
  return (
    <section className="hm-nearby" aria-label="Aqui por perto">
      <header className="hm-nearby-head">
        <div>
          <h2 className="hm-nearby-title">Aqui por perto</h2>
          <p className="hm-nearby-meta">
            {n} {n === 1 ? 'lugar' : 'lugares'} · até {NEARBY_MAP_KM} km
          </p>
        </div>
        <button type="button" className="hm-nearby-sort" onClick={() => onSort(sort === 'near' ? 'recent' : 'near')}>
          <ArrowDownUp size={12} aria-hidden="true" />
          {SORT_LABEL[sort]}
        </button>
      </header>
      {grouped && (
        <button type="button" className="hm-nearby-all" onClick={onClearGroup}>
          Ver todos por perto
        </button>
      )}
      {n === 0 ? (
        <p className="hm-nearby-empty">Nada salvo por aqui ainda.</p>
      ) : (
        <ul className="hm-nearby-list">
          {rows.map(({ pin, km }) => (
            <li key={pin.item.id}>
              <QuickCard pin={pin} km={km} active={pin.item.id === selectedId} photo={photoUrl(pin)} onClick={() => onFocus(pin)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function QuickCard({ pin, km, active, photo, onClick }: { pin: Pin; km: number; active: boolean; photo: string | null; onClick: () => void }) {
  const Icon = CATEGORY_ICONS[pin.category]
  const Status = active ? LocateFixed : pin.item.status === 'done' ? CircleCheck : CircleDashed
  const statusName = active ? 'selecionado' : pin.item.status === 'done' ? 'já fomos' : 'quero ir'
  return (
    <button
      type="button"
      className={`hm-card lg ${catClass(pin.category)}${active ? ' is-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="hm-card-thumb">{photo ? <img src={photo} alt="" /> : <Icon size={18} aria-hidden="true" />}</span>
      <span className="hm-card-text">
        <span className="hm-card-name">{pin.item.name}</span>
        <span className="hm-card-meta">
          <span className="hm-dot" aria-hidden="true" />
          {CATEGORY_LABELS[pin.category].one}
          <span className="hm-card-km">· {formatKm(km)}</span>
        </span>
      </span>
      <span className={`hm-card-status hm-card-status--${active ? 'active' : pin.item.status}`} role="img" aria-label={statusName}>
        <Status size={16} aria-hidden="true" />
      </span>
    </button>
  )
}
