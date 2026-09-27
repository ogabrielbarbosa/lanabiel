// A área do mapa da Home (`Home — Escuro` eocRt, `Navegação · Estados`
// j32cy, `Navegação · Cidades` saMmF, `Zoom São José dos Campos` XwYKK): o
// cabeçalho do casal, o globo, o breadcrumb com os seletores, o zoom, os pins
// com o cartão do lugar, os filtros e _Aqui por perto_.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R2, R4, R6–R14, R24, I3–I6, I8, I9,
//       I12, I13, seção 7 (A10–A12, A14, A15, A17, A18)
// Ledger: T0 (pins em React por cima do mapa), T5a (contrato do contexto)
//
// UMA instância de mapa por montagem (I12): `useMap` monta com a câmera da
// vista inicial e nunca mais — nível, filtro e releitura só mexem no estado da
// tela e pedem câmera ao `handle`. A `HomeScreen` só monta esta área depois
// do primeiro `ok` e a mantém montada nas releituras (R24).
//
// Engine com falha (seção 7, A15): `MapFailed` no lugar do globo, e o resto —
// breadcrumb, seletores, filtros, _Aqui por perto_ — segue sobre os dados, só
// sem câmera (e sem pins: sem projeção não há onde desenhá-los).

import { useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { LocateFixed, Minus, Plus } from 'lucide-react'
import { clearMapFocus, peekMapFocus } from '../app/mapFocus'
import type { MapFocus } from '../app/mapFocus'
import { DEFAULT_FILTERS, NEARBY_MAP_KM, allPins, applyFilters, cityCenter, nearby } from '../domain/map'
import type { MapFilters as Filters, NearbySort, Pin } from '../domain/map'
import { MapFailed } from '../map/MapFailed'
import type { MapHandle } from '../map/engine'
import { useMap, useMapTick } from '../map/useMap'
import { usePhotoUrls, useHome } from './context'
import { Breadcrumb } from './map/Breadcrumb'
import { CoupleStatus } from './map/CoupleStatus'
import { MapFilters } from './map/MapFilters'
import { Nearby } from './map/Nearby'
import { Pins } from './map/Pins'
import { PlacePopover } from './map/PlacePopover'
import { cameraOf, initialNav, useMapNav, viewerCenter } from './map/useMapNav'
import type { MapNav, NavWorld } from './map/useMapNav'
import '../list/list.css'

/** Um clique que andou mais que isso foi arrasto do mapa, não "tocar fora". */
const DRAG_PX = 5

/** O tamanho da área, para o cartão do lugar não sair dela. */
function useBounds(ref: RefObject<HTMLElement | null>) {
  const [bounds, setBounds] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      setBounds({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return bounds
}

/**
 * Esc e tocar fora (R7, R14): fecham o seletor, e depois o cartão do lugar.
 * Os ouvintes vão uma vez no documento e leem a navegação mais recente.
 */
function useDismiss(nav: MapNav) {
  const latest = useRef(nav)
  useEffect(() => {
    latest.current = nav
  })
  useEffect(() => {
    let down: { x: number; y: number } | null = null
    const inside = (target: EventTarget | null, selector: string) => target instanceof Element && target.closest(selector) !== null
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      const { state, closePicker, select } = latest.current
      if (state.picker !== null) closePicker()
      else if (state.selectedId !== null) select(null)
    }
    function onDown(e: PointerEvent) {
      down = { x: e.clientX, y: e.clientY }
      const { state, closePicker } = latest.current
      if (state.picker !== null && !inside(e.target, '.hm-crumbs')) closePicker()
    }
    function onClick(e: MouseEvent) {
      const moved = down !== null && Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX
      down = null
      const { state, select } = latest.current
      if (moved || state.selectedId === null) return
      if (!inside(e.target, '.hm-popover, [data-pin], .hm-nearby')) select(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('click', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('click', onClick)
    }
  }, [])
}

/**
 * O cartão do lugar preso ao pin: reprojeta a cada quadro (`useMapTick`), sem
 * re-renderizar a área inteira. Sem engine, fica ancorado sob o breadcrumb;
 * com engine e o pin fora de vista (atrás do globo), some.
 */
function AnchoredPopover({
  handle,
  pin,
  bounds,
  photoUrl,
}: {
  handle: MapHandle | null
  pin: Pin
  bounds: { width: number; height: number }
  photoUrl: string | null
}) {
  useMapTick(handle)
  const anchor = handle ? handle.project(pin) : null
  if (handle && anchor === null) return null
  return <PlacePopover pin={pin} anchor={anchor} bounds={bounds} photoUrl={photoUrl} />
}

/** Um foco pedido de fora com a Home aberta; `nonce` muda a cada pedido (o mesmo foco duas vezes voa duas vezes). */
export interface FocusRequest {
  focus: MapFocus
  nonce: number
}

export function MapArea({ request = null }: { request?: FocusRequest | null }) {
  const { items, settings, cities, viewerCity, photoOf, api } = useHome()
  const hidden = settings.hiddenCategories
  const all = useMemo(() => allPins(items, hidden), [items, hidden])
  const world: NavWorld = { pins: all, items, cities, viewerCity }

  // R2: o pedido pendente entra só na vista inicial (lido puro), e sai num efeito.
  const [initial] = useState(() => initialNav(peekMapFocus(), world))
  useEffect(() => clearMapFocus(), [])

  const { ref: mapRef, state: mapState, retry } = useMap(api.mapEngine, { interactive: true, projection: 'globe', camera: cameraOf(initial, world) })
  const handle = mapState.status === 'ready' ? mapState.handle : null
  const nav = useMapNav(() => initial, world, handle)
  const { level, path, selectedId, group } = nav.state
  useDismiss(nav)

  // O painel pede foco com a Home já montada (R18): aplica cada pedido uma vez.
  // A navegação é lida por ref — ela muda a cada render e não é o gatilho.
  const navRef = useRef(nav)
  useEffect(() => {
    navRef.current = nav
  })
  const applied = useRef<number | null>(null)
  useEffect(() => {
    if (!request || applied.current === request.nonce) return
    applied.current = request.nonce
    navRef.current.goFocus(request.focus)
  }, [request])

  const rootRef = useRef<HTMLElement>(null)
  const bounds = useBounds(rootRef)
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [sort, setSort] = useState<NearbySort>('near')
  const pins = useMemo(() => applyFilters(all, filters), [all, filters])

  // R13: do centro da cidade em foco, sob os filtros; recortado ao grupo tocado.
  const around = level === 'city' ? nearby(pins, cityCenter(path, all) ?? viewerCenter(world), NEARBY_MAP_KM, sort) : []
  const nearbyRows = group ? around.filter((r) => group.includes(r.pin.item.id)) : around

  // Selecionado fora dos filtros: sem pin, sem cartão.
  const selected: Pin | null = selectedId ? (pins.find((p) => p.item.id === selectedId) ?? null) : null

  // Fotos assinadas só das visíveis (seção 8): os cartões por perto e o selecionado.
  const urls = usePhotoUrls([...nearbyRows.map((r) => photoOf(r.pin.item)), selected ? photoOf(selected.item) : null])
  const photoUrl = (pin: Pin) => {
    const path = photoOf(pin.item)
    return path ? (urls.get(path) ?? null) : null
  }

  return (
    <section ref={rootRef} className={`home-map hm-level--${level}`} aria-label="Mapa">
      <div ref={mapRef} className="hm-canvas" />
      {level !== 'world' && <div className="hm-vignette" aria-hidden="true" />}
      {mapState.status === 'failed' && <MapFailed reason={mapState.reason} onRetry={retry} />}

      {handle && (
        <Pins
          handle={handle}
          pins={pins}
          selectedId={selectedId}
          level={level}
          path={path}
          onSelect={nav.select}
          onGroup={nav.openGroup}
        />
      )}

      <div className="hm-top">
        <CoupleStatus />
        <Breadcrumb nav={nav} pins={pins} searchCities={api.searchCities} />
      </div>

      <div className="hm-zoom" role="group" aria-label="Zoom">
        <button type="button" aria-label="Aproximar" disabled={!handle} onClick={() => handle?.zoomBy(1)}>
          <Plus size={17} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Afastar" disabled={!handle} onClick={() => handle?.zoomBy(-1)}>
          <Minus size={17} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Onde estou" onClick={nav.locate}>
          <LocateFixed size={17} aria-hidden="true" />
        </button>
      </div>

      {level === 'city' && (
        <Nearby
          rows={nearbyRows}
          sort={sort}
          onSort={setSort}
          selectedId={selectedId}
          grouped={group !== null}
          onClearGroup={nav.clearGroup}
          onFocus={nav.focusPin}
          photoUrl={photoUrl}
        />
      )}

      {selected && <AnchoredPopover handle={handle} pin={selected} bounds={bounds} photoUrl={photoUrl(selected)} />}

      <MapFilters items={items} hidden={hidden} filters={filters} onChange={setFilters} />
    </section>
  )
}
