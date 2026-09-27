// A engine do mapa atrás de uma interface (Fase 7, seção 5).
//
// Spec: .agent/Tasks/fase-7-mapa.md, R5, I12, I13, seção 7
// ADR:  .agent/Decisions/0022-engine-do-mapa-mapbox.md
//
// As telas só conhecem `MapEngine`/`MapHandle`. O Mapbox mora em
// `src/map/mapbox/` e chega por `import()` dinâmico (A21, A22); os testes
// injetam `fakeMapEngine` (jsdom não tem WebGL — ADR 0005).
//
// Pins, rótulos e cartões NÃO são da engine: a tela os desenha em React por
// cima do mapa, posicionados por `project` a cada `onMove`. Assim o que o casal
// vê de si mesmo nunca é entregue ao provedor (I13), e o comportamento é
// provável em jsdom.

import type { Camera } from '../domain/map'
import type { LatLng } from '../domain/onboarding'

export type MapFailureReason = 'no_token' | 'no_webgl' | 'load_error'
export type MapFailure = { status: 'failed'; reason: MapFailureReason }

export interface MountOptions {
  /** Viagens: sem arrastar, sem zoom (R22). */
  interactive: boolean
  camera: Camera
  /** Globo com atmosfera (Home) ou plano (os mapas pequenos das Viagens). */
  projection: 'globe' | 'mercator'
}

/** Um arco das Viagens: origem → destino, contínuo (feita) ou tracejado (planejada). */
export interface Arc {
  id: string
  from: LatLng
  to: LatLng
  dashed: boolean
}

export interface MapHandle {
  /** Leva a câmera (animação; `instant` para o enquadramento inicial). */
  flyTo(camera: Camera, opts?: { instant?: boolean }): void
  zoomBy(delta: 1 | -1): void
  /**
   * Coordenada → pixel no contêiner. `null` quando o ponto não está à vista
   * (atrás do globo).
   */
  project(point: LatLng): { x: number; y: number } | null
  /** A cada quadro de movimento e ao fim dele; devolve o cancelamento. */
  onMove(cb: () => void): () => void
  setArcs(arcs: readonly Arc[]): void
  destroy(): void
}

export type MountResult = { status: 'ok'; handle: MapHandle } | MapFailure

export interface MapEngine {
  mount(el: HTMLElement, opts: MountOptions): Promise<MountResult>
}

/** A engine de verdade: carrega o chunk do Mapbox só quando alguém monta um mapa. */
export const mapboxEngine: MapEngine = {
  async mount(el, opts) {
    try {
      const { mountMapbox } = await import('./mapbox/adapter')
      return await mountMapbox(el, opts)
    } catch {
      return { status: 'failed', reason: 'load_error' }
    }
  },
}
