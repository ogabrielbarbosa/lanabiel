// Os pins (R11): `Pin / Quero ir` (PfsUA), `Pin / Já fomos` (shqGO), o grupo
// com _"+n"_, o `Map Pin Label` (GxIWr) e o pin selecionado com o pulso.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R11, I3, I12, I13
// Ledger: T0 — pins são React POR CIMA do mapa, posicionados por
// `handle.project` a cada movimento (`useMapTick`); nada do casal vira
// camada do provedor.
//
// O agrupamento é `clusterPoints` (domínio), na ordem do mais recente: o líder
// do grupo é o item mais novo e dá o ícone. O selecionado fica FORA do
// agrupamento — o cartão do lugar precisa dele à vista.

import type { CSSProperties } from 'react'
import { CLUSTER_PX, cityCode, clusterPoints } from '../../domain/map'
import type { FocusPath, MapLevel, Pin } from '../../domain/map'
import { CATEGORY_ICONS, catClass } from '../../list/categories'
import type { MapHandle } from '../../map/engine'
import { useMapTick } from '../../map/useMap'

export interface PinsProps {
  handle: MapHandle
  /** Os pins sob os filtros (I3). */
  pins: readonly Pin[]
  selectedId: string | null
  level: MapLevel
  path: FocusPath
  onSelect: (itemId: string) => void
  onGroup: (group: readonly Pin[]) => void
}

const byRecent = (a: Pin, b: Pin) => b.item.createdAt.localeCompare(a.item.createdAt)

const at = (x: number, y: number) => ({ left: x, top: y }) as CSSProperties

function PinDot({ pin, size }: { pin: Pin; size: 'normal' | 'selected' }) {
  const Icon = CATEGORY_ICONS[pin.category]
  return (
    <span className={`hm-pin hm-pin--${pin.item.status} ${catClass(pin.category)}${size === 'selected' ? ' hm-pin--selected' : ''}`}>
      <Icon size={size === 'selected' ? 18 : 14} aria-hidden="true" />
    </span>
  )
}

export function Pins({ handle, pins, selectedId, level, path, onSelect, onGroup }: PinsProps) {
  // Só os pins reprojetam a cada quadro de movimento, não a área inteira.
  useMapTick(handle)
  const byId = new Map<string, Pin>()
  const points: { id: string; x: number; y: number }[] = []
  let selected: { pin: Pin; x: number; y: number } | null = null
  for (const pin of [...pins].sort(byRecent)) {
    const p = handle.project(pin)
    if (!p) continue
    byId.set(pin.item.id, pin)
    if (pin.item.id === selectedId) selected = { pin, ...p }
    else points.push({ id: pin.item.id, x: p.x, y: p.y })
  }
  const clusters = clusterPoints(points, CLUSTER_PX)
  const atCity = level === 'city'

  return (
    <div className="hm-pins" role="group" aria-label="Lugares no mapa">
      {clusters.map((c) => {
        const group = c.ids.map((id) => byId.get(id) as Pin)
        const head = group[0]
        const others = group.length - 1
        if (others === 0) {
          // No nível cidade, os de OUTRAS cidades levam o nome (GxIWr).
          const labeled = atCity && head.cityKey !== path.cityKey
          return (
            <button
              key={c.head}
              type="button"
              className={`hm-pin-btn${labeled ? ' hm-pin-btn--labeled' : ''}`}
              style={at(c.x, c.y)}
              aria-label={head.item.name}
              data-pin=""
              onClick={() => onSelect(head.item.id)}
            >
              <PinDot pin={head} size="normal" />
              {labeled && (
                <span className="hm-pin-label" aria-hidden="true">
                  {head.item.name}
                </span>
              )}
            </button>
          )
        }
        const inFocusCity = atCity && head.cityKey !== null && head.cityKey === path.cityKey && path.cityName !== null
        const count = inFocusCity ? `+${others} em ${cityCode(path.cityName as string)}` : `+${others}`
        return (
          <button
            key={c.head}
            type="button"
            className={`hm-pin-btn hm-pin-btn--group${inFocusCity ? ' hm-pin-btn--city' : ''}`}
            style={at(c.x, c.y)}
            aria-label={`${head.item.name} e mais ${others}`}
            data-pin=""
            onClick={() => onGroup(group)}
          >
            <PinDot pin={head} size="normal" />
            <span className="hm-pin-count" aria-hidden="true">
              {count}
            </span>
          </button>
        )
      })}
      {selected && (
        <button
          type="button"
          className={`hm-pin-btn hm-pin-btn--selected${atCity ? ' hm-pin-btn--at-city' : ''}`}
          style={at(selected.x, selected.y)}
          aria-label={selected.pin.item.name}
          aria-pressed="true"
          data-pin=""
          onClick={() => onSelect(selected.pin.item.id)}
        >
          <span className="hm-pulse hm-pulse--outer" aria-hidden="true" />
          <span className="hm-pulse" aria-hidden="true" />
          <PinDot pin={selected.pin} size="selected" />
        </button>
      )}
    </div>
  )
}
