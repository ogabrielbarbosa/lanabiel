// _Nessa região · Ver mapa ›_ (R18, I8): os itens da Lista a até
// `NEARBY_RADIUS_KM` (30) do centro da cidade de quem vê hoje, com os chips
// de categoria e os cinco mais perto. Conta feitos e a fazer ("salvos") — são
// os pins do mapa (`allPins`: geográficos com coordenada, sem as categorias
// ocultas), medidos por `nearby` do domínio do mapa.
//
// _Ver mapa_ e tocar num item pedem foco à área do mapa da própria Home
// (`onShowOnMap`): a cidade (nível `city`) ou o item (R2 `item`).

import { useState } from 'react'
import { ChevronRight, MapPin, Sparkles } from 'lucide-react'
import type { MapFocus } from '../../app/mapFocus'
import { NEARBY_RADIUS_KM, secondaryLine } from '../../domain/list'
import { allPins, categoryChips, formatKm, nearby } from '../../domain/map'
import type { GeoCategory } from '../../domain/map'
import { destinationLabel } from '../../domain/tripDerive'
import { catClass } from '../../list/categories'
import { CATEGORY_LABELS } from '../../domain/list'
import { CategoryTag, ItemPhoto } from '../../list/parts'
import { usePhotoUrls, useHome } from '../context'
import { CardAction, PanelCard } from './parts'

/** R18: até 5 itens. */
const REGION_ROWS = 5

export function Region({ onShowOnMap }: { onShowOnMap: (focus: MapFocus) => void }) {
  const { items, settings, viewerCity, photoOf } = useHome()
  const [category, setCategory] = useState<'all' | GeoCategory>('all')

  const hidden = settings.hiddenCategories
  const around = nearby(allPins(items, hidden), viewerCity, NEARBY_RADIUS_KM, 'near')
  const chips = categoryChips(hidden)
  const rows = around.filter((r) => category === 'all' || r.pin.category === category).slice(0, REGION_ROWS)
  const urls = usePhotoUrls(rows.map((r) => photoOf(r.pin.item)))

  return (
    <PanelCard
      title="Nessa região"
      action={<CardAction label="Ver mapa" onClick={() => onShowOnMap({ kind: 'city', cityId: viewerCity.id })} />}
    >
      <div className="hp-region">
        <p className="hp-region-where">
          <MapPin size={15} className="hp-ic-blue" aria-hidden="true" />
          <span className="hp-region-city">{destinationLabel(viewerCity)}</span>
          <span className="hp-region-count">{around.length === 1 ? '1 salvo' : `${around.length} salvos`}</span>
        </p>
        {around.length === 0 ? (
          <p className="hp-region-empty">Nada salvo perto de vocês ainda.</p>
        ) : (
          <>
            <div className="hp-tabs" role="group" aria-label="Categoria">
              <button
                type="button"
                className="hp-tab hp-tab--all lg"
                aria-pressed={category === 'all'}
                onClick={() => setCategory('all')}
              >
                <Sparkles size={15} aria-hidden="true" />
                Todos
              </button>
              {chips.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`hp-tab lg ${catClass(c)}`}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  <span className="hp-tab-dot" aria-hidden="true" />
                  {CATEGORY_LABELS[c].one}
                </button>
              ))}
            </div>
            {rows.length === 0 ? (
              <p className="hp-region-empty">Nada dessa categoria por aqui.</p>
            ) : (
              <ul className="hp-region-list">
                {rows.map(({ pin, km }) => {
                  const item = pin.item
                  const path = photoOf(item)
                  const second = secondaryLine(item)
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`hp-region-item${item.featured ? ' hp-region-item--featured' : ''}`}
                        aria-label={`Ver ${item.name} no mapa`}
                        onClick={() => onShowOnMap({ kind: 'item', id: item.id })}
                      >
                        <ItemPhoto category={item.category} url={(path && urls.get(path)) || null} className="hp-thumb" />
                        <span className="hp-region-info">
                          <span className="hp-region-name">{item.name}</span>
                          <span className="hp-region-meta">
                            <CategoryTag category={item.category} />
                            <span className="hp-region-note">
                              {second && <span className="hp-region-note-text">{second}</span>}
                              <span className="hp-region-km">{second ? ` · ${formatKm(km)}` : formatKm(km)}</span>
                            </span>
                          </span>
                        </span>
                        {item.featured ? (
                          <Sparkles size={18} className="hp-ic-emphasis" aria-label="Em destaque" />
                        ) : (
                          <ChevronRight size={16} className="hp-chevron" aria-hidden="true" />
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </PanelCard>
  )
}
