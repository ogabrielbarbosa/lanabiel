// Os dois mapas das Viagens (_Onde já estivemos_ e _Mapa da viagem_) sobre a
// engine do mapa, não interativos (R22). A engine desenha o fundo e os arcos;
// os pins e os rótulos são React por cima, posicionados por `handle.project` a
// cada movimento (ledger T0) — nenhum dado do casal vai para o provedor (I13).
//
// Spec: .agent/Tasks/fase-7-mapa.md — R22, I12, I13, seção 7
// ADR:  .agent/Decisions/0022-engine-do-mapa-mapbox.md (supersede a 0021)

import { useEffect, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { Camera } from '../domain/map'
import type { LatLng } from '../domain/onboarding'
import type { Arc, MapEngine } from '../map/engine'
import { MapFailed } from '../map/MapFailed'
import { useMap, useMapTick } from '../map/useMap'
import './trips.css'

/** Coordenada → estilo de posição no contêiner; `null` quando fora de vista. */
export type Place = (point: LatLng) => CSSProperties | null

export interface TripMapProps {
  engine: MapEngine
  /** Lido na montagem; depois, mudança real de enquadramento vira `flyTo` instantâneo. */
  camera: Camera
  arcs: readonly Arc[]
  /** O nome acessível do mapa (`role="img"`). */
  label: string
  /** A caixa (`tr-map`, `td-map-box`): tamanho, borda e fundo vêm da folha da tela. */
  className: string
  /** Os pins, desenhados só com o mapa pronto. */
  children: (place: Place) => ReactNode
}

export function TripMap({ engine, camera, arcs, label, className, children }: TripMapProps) {
  const { ref, state, retry } = useMap(engine, { interactive: false, projection: 'mercator', camera })
  const handle = state.status === 'ready' ? state.handle : null
  // Os pins por cima reprojetam a cada movimento (o mapa não é interativo, mas
  // redimensiona e faz o enquadramento).
  useMapTick(handle)

  // Os arcos: reenviados só quando mudam de fato (a releitura recria o array).
  const arcsKey = JSON.stringify(arcs)
  useEffect(() => {
    if (handle) handle.setArcs(JSON.parse(arcsKey) as Arc[])
  }, [handle, arcsKey])

  // A câmera da montagem já está no mapa; só um enquadramento NOVO (editaram o
  // destino) move — sem recriar o mapa (I12).
  const cameraKey = JSON.stringify(camera)
  const mountedCamera = useRef(cameraKey)
  useEffect(() => {
    if (!handle || cameraKey === mountedCamera.current) return
    mountedCamera.current = cameraKey
    handle.flyTo(JSON.parse(cameraKey) as Camera, { instant: true })
  }, [handle, cameraKey])

  const place: Place = (point) => {
    const p = handle?.project(point)
    return p ? { left: `${p.x}px`, top: `${p.y}px` } : null
  }

  return (
    <div className={`tr-mapbox ${className}`}>
      <div ref={ref} className="tr-mapbox-canvas" />
      {state.status === 'failed' ? (
        <MapFailed reason={state.reason} onRetry={retry} />
      ) : (
        <div className="tr-mapbox-overlay" role="img" aria-label={label}>
          {handle && children(place)}
        </div>
      )}
    </div>
  )
}
