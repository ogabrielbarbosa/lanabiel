// O ÚNICO arquivo que importa `mapbox-gl` (A22). Chega por `import()` a partir
// de `../engine.ts`, num chunk próprio (A21).
//
// Spec: .agent/Tasks/fase-7-mapa.md, R5, I6, I12, I13, seção 7
// ADR:  .agent/Decisions/0022-engine-do-mapa-mapbox.md

import mapboxgl from 'mapbox-gl'
import type { FogSpecification, LngLatBoundsLike, StyleSpecification } from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { Camera } from '../../domain/map'
import type { Arc, MapHandle, MountOptions, MountResult } from '../engine'
import { CUSTOM_RASTER, FOG, STANDARD, TERRAIN_EXAGGERATION, recipeFromUrl } from '../style'

const DEM_SOURCE = 'lanabiel-dem'
const ARC_SOURCE = 'lanabiel-arcs'

function customStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      satellite: { type: 'raster', url: 'mapbox://mapbox.satellite', tileSize: 256 },
    },
    layers: [
      { id: 'space', type: 'background', paint: { 'background-color': FOG['space-color'] } },
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        paint: {
          'raster-saturation': CUSTOM_RASTER.saturation,
          'raster-contrast': CUSTOM_RASTER.contrast,
          'raster-brightness-min': CUSTOM_RASTER.brightnessMin,
          'raster-brightness-max': CUSTOM_RASTER.brightnessMax,
        },
      },
    ],
  }
}

function hasWebGl(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

/** Distância angular (graus) entre dois pontos — para esconder o que está atrás do globo. */
function angularDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180
  const cos =
    Math.sin(rad(a.lat)) * Math.sin(rad(b.lat)) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng))
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI
}

function arcCoordinates(arc: Arc, steps = 48): [number, number][] {
  // Grande círculo por interpolação esférica (R22).
  const rad = (d: number) => (d * Math.PI) / 180
  const deg = (r: number) => (r * 180) / Math.PI
  const [la1, lo1, la2, lo2] = [rad(arc.from.lat), rad(arc.from.lng), rad(arc.to.lat), rad(arc.to.lng)]
  const d = rad(angularDistance(arc.from, arc.to))
  if (d === 0) return [[arc.from.lng, arc.from.lat]]
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps
    const A = Math.sin((1 - f) * d) / Math.sin(d)
    const B = Math.sin(f * d) / Math.sin(d)
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2)
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2)
    const z = A * Math.sin(la1) + B * Math.sin(la2)
    out.push([deg(Math.atan2(y, x)), deg(Math.atan2(z, Math.sqrt(x * x + y * y)))])
  }
  return out
}

export async function mountMapbox(el: HTMLElement, opts: MountOptions): Promise<MountResult> {
  const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
  if (!token) return { status: 'failed', reason: 'no_token' }
  // Token secreto (`sk.`) nunca vai para o navegador: toda `VITE_*` entra no
  // bundle público (ADR 0022). O Mapbox também o recusaria, mas só depois de ele
  // já estar na página.
  if (!token.startsWith('pk.')) {
    console.warn('VITE_MAPBOX_TOKEN precisa ser um token PÚBLICO (pk.…) — veja o .env.example.')
    return { status: 'failed', reason: 'no_token' }
  }
  if (!hasWebGl()) return { status: 'failed', reason: 'no_webgl' }

  mapboxgl.accessToken = token
  const recipe = recipeFromUrl(window.location.search)
  const start = opts.camera

  const map = new mapboxgl.Map({
    container: el,
    style: recipe === 'standard' ? STANDARD.style : customStyle(),
    ...(recipe === 'standard' ? { config: { basemap: { ...STANDARD.config } } } : {}),
    projection: opts.projection,
    interactive: opts.interactive,
    attributionControl: true,
    logoPosition: 'bottom-right',
    ...(start.kind === 'center'
      ? { center: [start.center.lng, start.center.lat] as [number, number], zoom: start.zoom, pitch: start.pitch, bearing: start.bearing }
      : { bounds: [[start.sw.lng, start.sw.lat], [start.ne.lng, start.ne.lat]] as LngLatBoundsLike, fitBoundsOptions: { padding: start.padding, maxZoom: start.maxZoom } }),
  })

  const loaded = await new Promise<boolean>((resolve) => {
    map.once('load', () => resolve(true))
    // Só erro de ESTILO (token, rede na carga do estilo) derruba a montagem: um
    // tile que falhou (`sourceId`/`tile`) é parcial e o Mapbox preenche depois
    // (seção 7).
    const onError = (e: mapboxgl.MapEvents['error']) => {
      const tileError = e as unknown as { sourceId?: string; tile?: unknown }
      if (tileError.sourceId !== undefined || tileError.tile !== undefined) return
      map.off('error', onError)
      resolve(false)
    }
    map.on('error', onError)
  })
  if (!loaded) {
    map.remove()
    return { status: 'failed', reason: 'load_error' }
  }

  map.setFog(FOG as FogSpecification)
  map.addSource(DEM_SOURCE, { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 })
  const setTerrain = (on: boolean) =>
    map.setTerrain(on ? { source: DEM_SOURCE, exaggeration: TERRAIN_EXAGGERATION } : null)
  setTerrain(start.kind === 'center' && start.terrain)

  const flyTo: MapHandle['flyTo'] = (camera: Camera, o = {}) => {
    const duration = o.instant ? 0 : 1800
    if (camera.kind === 'center') {
      setTerrain(camera.terrain)
      map.flyTo({
        center: [camera.center.lng, camera.center.lat],
        zoom: camera.zoom,
        pitch: camera.pitch,
        bearing: camera.bearing,
        duration,
        essential: true,
      })
    } else {
      setTerrain(false)
      // O ALVO do enquadramento, calculado antes de voar, com o zoom mínimo do
      // nível (I6) aplicado a ele — `getZoom()` depois de um `fitBounds`
      // animado ainda devolve o zoom de partida.
      const target = map.cameraForBounds([[camera.sw.lng, camera.sw.lat], [camera.ne.lng, camera.ne.lat]], {
        padding: camera.padding,
        maxZoom: camera.maxZoom,
        pitch: 0,
        bearing: 0,
      })
      if (!target) return
      map.flyTo({
        ...target,
        zoom: Math.max(camera.minZoom, target.zoom ?? camera.minZoom),
        pitch: 0,
        bearing: 0,
        duration,
        essential: true,
      })
    }
  }

  return {
    status: 'ok',
    handle: {
      flyTo,
      zoomBy: (delta) => (delta > 0 ? map.zoomIn() : map.zoomOut()),
      project: (point) => {
        // No globo, o que passa de ~80° do centro está atrás da Terra.
        if (map.getProjection().name === 'globe' && map.getZoom() < 5) {
          const c = map.getCenter()
          if (angularDistance({ lat: c.lat, lng: c.lng }, point) > 80) return null
        }
        const p = map.project([point.lng, point.lat])
        const { clientWidth: w, clientHeight: h } = el
        if (p.x < -40 || p.y < -40 || p.x > w + 40 || p.y > h + 40) return null
        return { x: p.x, y: p.y }
      },
      onMove: (cb) => {
        map.on('move', cb)
        map.on('moveend', cb)
        map.on('resize', cb)
        return () => {
          map.off('move', cb)
          map.off('moveend', cb)
          map.off('resize', cb)
        }
      },
      setArcs: (arcs) => {
        const data: Parameters<mapboxgl.GeoJSONSource["setData"]>[0] = {
          type: 'FeatureCollection',
          features: arcs.map((a) => ({
            type: 'Feature',
            properties: { id: a.id, dashed: a.dashed },
            geometry: { type: 'LineString', coordinates: arcCoordinates(a) },
          })),
        }
        const source = map.getSource(ARC_SOURCE) as mapboxgl.GeoJSONSource | undefined
        if (source) {
          source.setData(data)
          return
        }
        map.addSource(ARC_SOURCE, { type: 'geojson', data })
        const paint = { 'line-color': '#7FD8C4', 'line-width': 1.6, 'line-opacity': 0.9 }
        map.addLayer({ id: 'arcs-solid', type: 'line', source: ARC_SOURCE, filter: ['!', ['get', 'dashed']], paint })
        map.addLayer({
          id: 'arcs-dashed',
          type: 'line',
          source: ARC_SOURCE,
          filter: ['get', 'dashed'],
          paint: { ...paint, 'line-color': '#F6E3A1', 'line-dasharray': [2, 2] },
        })
      },
      destroy: () => map.remove(),
    },
  }
}
