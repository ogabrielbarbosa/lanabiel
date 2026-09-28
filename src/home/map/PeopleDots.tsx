// Onde cada um está: uma bolinha na cor da pessoa, na cidade de hoje — a
// estadia, senão a última posição conhecida, senão a casa (`personMarkers`).
//
// Como os pins (T0): React por cima do mapa, reprojetado a cada quadro por
// `handle.project`; nada vira camada do provedor. Os dois na mesma cidade
// ficam lado a lado, não um em cima do outro. Não recebe clique: o pin que
// cair embaixo continua tocável.

import { useMemo } from 'react'
import type { CSSProperties } from 'react'
import { personMarkers } from '../../domain/map'
import type { MapHandle } from '../../map/engine'
import { useMapTick } from '../../map/useMap'
import { useHome } from '../context'

/** Distância entre os centros das duas bolinhas na mesma cidade. */
const PAIR_GAP = 16

export function PeopleDots({ handle }: { handle: MapHandle }) {
  useMapTick(handle)
  const { people, stays, cities, today } = useHome()
  const markers = useMemo(
    () => personMarkers([people[1], people[2]], stays, cities, today),
    [people, stays, cities, today],
  )

  return (
    <ul className="hm-people" aria-label="Onde cada um está">
      {markers.map((m) => {
        const p = handle.project(m)
        if (!p) return null
        const shift = m.together > 1 ? (m.offset - (m.together - 1) / 2) * PAIR_GAP : 0
        const style = { left: p.x + shift, top: p.y, '--person': m.color } as CSSProperties
        const city = cities.get(m.cityId)?.name
        return (
          <li key={m.profileId} className="hm-person" style={style}>
            <span className="hm-person-dot" aria-hidden="true" />
            <span className="hm-person-name">{city ? `${m.name} em ${city}` : m.name}</span>
          </li>
        )
      })}
    </ul>
  )
}
