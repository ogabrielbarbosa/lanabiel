// `Breadcrumb` (RrNiQ, e `/ Estados` OspYO, `/ Cidades` XXySj): o globo e os
// segmentos do caminho em foco; o ativo é o nível da câmera. O seletor aberto
// pende do segmento dele, numa silhueta só com a barra.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R6, R7, R8, R9

import { Fragment } from 'react'
import { ChevronRight, Globe } from 'lucide-react'
import { BR_STATES, countryName, levelsOf } from '../../domain/map'
import type { FocusPath, MapLevel, Pin } from '../../domain/map'
import type { RegionPickerProps } from './RegionPicker'
import { RegionPicker } from './RegionPicker'
import type { MapNav } from './useMapNav'

function labelOf(level: MapLevel, path: FocusPath): string {
  if (level === 'world') return 'Mundo'
  if (level === 'country') return countryName(path.countryCode ?? '')
  if (level === 'state') return path.uf ? BR_STATES[path.uf].name : ''
  return path.cityName ?? ''
}

export function Breadcrumb({
  nav,
  pins,
  searchCities,
}: {
  nav: MapNav
  pins: readonly Pin[]
  searchCities: RegionPickerProps['searchCities']
}) {
  const { level, path, picker } = nav.state
  const levels = levelsOf(path)

  return (
    <nav className="hm-crumbs" aria-label="Onde o mapa está">
      <button type="button" className="hm-crumbs-globe" aria-label="Voltar ao globo" onClick={nav.goWorld}>
        <Globe size={15} aria-hidden="true" />
      </button>
      {levels.map((l, i) => {
        const active = l === level
        return (
          <Fragment key={l}>
            {i > 0 && <ChevronRight className="hm-crumb-sep" size={12} aria-hidden="true" />}
            <span className="hm-crumb-slot">
              <button
                type="button"
                className={`hm-crumb${active ? ' is-active' : ''}${picker === l ? ' is-open' : ''}`}
                aria-current={active ? 'location' : undefined}
                aria-expanded={l === 'city' ? undefined : picker === l}
                onClick={() => nav.tapSegment(l)}
              >
                {labelOf(l, path)}
              </button>
              {picker !== null && picker === l && (
                <RegionPicker
                  key={`${l}:${path.countryCode}:${path.uf}`}
                  level={l}
                  path={path}
                  pins={pins}
                  searchCities={searchCities}
                  onChoose={nav.choose}
                  onChooseCity={nav.chooseCity}
                />
              )}
            </span>
          </Fragment>
        )
      })}
    </nav>
  )
}
