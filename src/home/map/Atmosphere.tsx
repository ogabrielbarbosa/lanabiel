// A atmosfera do globo (`Home — Escuro` eocRt: Halo Outer b5qgU, Atmosphere
// Vd1Ju, Rim Light X3Z5z5): o halo verde-água, o anel desfocado em degradê —
// verde-água no alto, rosa nos lados, amarelo embaixo — e o brilho branco na
// borda de cima. A névoa do Mapbox só pinta uma cor; o anel é React por cima,
// preso ao disco da Terra a cada quadro (`handle.globe`), como os pins.
//
// As medidas saem do `.pen` relativas ao raio do disco (463 px no frame).

import type { CSSProperties } from 'react'
import type { MapHandle } from '../../map/engine'
import { useMapTick } from '../../map/useMap'

export function Atmosphere({ handle }: { handle: MapHandle }) {
  useMapTick(handle)
  const disc = handle.globe()
  if (!disc) return null
  const style = { left: disc.x, top: disc.y, '--r': `${disc.r}px` } as CSSProperties
  return (
    <div className="hm-atmo" style={style} aria-hidden="true">
      <span className="hm-atmo-halo" />
      <span className="hm-atmo-ring" />
      <span className="hm-atmo-rim" />
    </div>
  )
}
