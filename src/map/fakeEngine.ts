// Engine falsa para os testes de interface (jsdom não tem WebGL — ADR 0005).
// Registra o que a tela pediu e projeta de um jeito previsível: 4 px por grau,
// com a origem em (180°O, 90°N). Os testes movem a "câmera" com `emitMove`.

import type { Camera } from '../domain/map'
import type { LatLng } from '../domain/onboarding'
import type { Arc, MapEngine, MapFailureReason, MapHandle, MountOptions } from './engine'

export interface FakeMap {
  engine: MapEngine
  mounts: MountOptions[]
  flights: Camera[]
  zooms: (1 | -1)[]
  arcs: (readonly Arc[])[]
  insets: { top: number; right: number }[]
  destroyed: number
  /** Dispara os ouvintes de `onMove` (depois de mudar `hidden`, por exemplo). */
  emitMove(): void
  /** Pontos que `project` diz estarem atrás do globo. */
  hidden: Set<string>
}

export function fakeMapEngine(opts: { fail?: MapFailureReason } = {}): FakeMap {
  const listeners = new Set<() => void>()
  const fake: FakeMap = {
    mounts: [],
    flights: [],
    zooms: [],
    arcs: [],
    insets: [],
    destroyed: 0,
    hidden: new Set(),
    emitMove: () => listeners.forEach((l) => l()),
    engine: {
      async mount(_el, mountOpts) {
        fake.mounts.push(mountOpts)
        if (opts.fail) return { status: 'failed', reason: opts.fail }
        const handle: MapHandle = {
          flyTo: (camera) => {
            fake.flights.push(camera)
          },
          zoomBy: (delta) => {
            fake.zooms.push(delta)
          },
          project: (p: LatLng) => (fake.hidden.has(`${p.lat},${p.lng}`) ? null : { x: (p.lng + 180) * 4, y: (90 - p.lat) * 4 }),
          onMove: (cb) => {
            listeners.add(cb)
            return () => listeners.delete(cb)
          },
          setArcs: (arcs) => {
            fake.arcs.push(arcs)
          },
          globe: () => null,
          setInset: (inset) => {
            fake.insets.push(inset)
          },
          destroy: () => {
            fake.destroyed += 1
          },
        }
        return { status: 'ok', handle }
      },
    },
  }
  return fake
}
