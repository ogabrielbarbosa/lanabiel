// A navegação do mapa da Home: nível da câmera, caminho em foco, seletor
// aberto, pin selecionado e o recorte de _Aqui por perto_ a um grupo.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R2, R6–R11, R13, I5, I6, I12
//
// Tudo isto é ESTADO DA TELA (I5): não vai para a URL nem é gravado. A regra
// (câmera, caminho de cidade, níveis) é a do domínio (`cameraFor`,
// `pathOfCity`, `pathOfPin`); aqui só se decide QUAL vista vem depois de cada
// toque, e a câmera é pedida à engine (`handle.flyTo`) no mesmo toque. Sem
// engine (falhou, A15) a vista muda do mesmo jeito — só não há câmera para
// voar.
//
// `initialNav` é puro: é também de onde sai a câmera de MONTAGEM do mapa, e o
// `mapFocus` pendente (R2) entra só por ele.

import { useState } from 'react'
import type { MapFocus } from '../../app/mapFocus'
import type { CalCity, CityMap } from '../../domain/calendar'
import { EMPTY_PATH, cameraFor, cityKeyOf, pathOfCity, pathOfPin, pinOf, ufOf } from '../../domain/map'
import type { Camera, FocusPath, MapLevel, MapView, Pin, RegionRow } from '../../domain/map'
import type { ListItem } from '../../domain/list'
import type { LatLng } from '../../domain/onboarding'
import type { MapHandle } from '../../map/engine'

/** O nível cujo seletor está aberto: o seletor de um nível lista os FILHOS dele (R8/R9). */
export type PickerLevel = 'world' | 'country' | 'state'

export interface NavState extends MapView {
  picker: PickerLevel | null
  /** O pin do cartão do lugar (R14). */
  selectedId: string | null
  /** _Aqui por perto_ recortado a um grupo tocado no nível cidade (R11). */
  group: readonly string[] | null
}

/** O que a navegação precisa saber do mundo, tirado do `HomeContext`. */
export interface NavWorld {
  /** Os pins sem os filtros (só `hidden_categories`): a câmera não pula quando o filtro muda. */
  pins: readonly Pin[]
  items: readonly ListItem[]
  cities: CityMap
  /** A cidade de quem vê hoje (R7). */
  viewerCity: CalCity
}

const pickerOf = (level: MapLevel): PickerLevel | null => (level === 'city' ? null : level)

export const viewerCenter = (world: NavWorld): LatLng => ({ lat: world.viewerCity.lat, lng: world.viewerCity.lng })

/** A cidade de `cities` com esta chave (I4), se houver: ela dá o `cityId` e o centro. */
function cityByKey(cities: CityMap, key: string): CalCity | null {
  for (const c of cities.values()) {
    if (cityKeyOf(c.countryCode.toUpperCase(), ufOf(c.stateCode), c.name) === key) return c
  }
  return null
}

/** O caminho de uma cidade escolhida pelo nome (seletor, grupo): o de `cities` quando existe. */
function cityPath(base: FocusPath, key: string, name: string, cities: CityMap): FocusPath {
  const known = cityByKey(cities, key)
  if (known) return pathOfCity(known)
  return { ...base, cityKey: key, cityName: name, cityId: null, cityCenter: null }
}

/** O caminho de um pin, com o `cityId` e o centro de `cities` quando a cidade está lá. */
function pinPath(pin: Pin, cities: CityMap): FocusPath {
  const path = pathOfPin(pin)
  return path.cityKey ? cityPath(path, path.cityKey, path.cityName ?? '', cities) : path
}

/** R7 / R2: a vista ao abrir a Home. */
export function initialNav(focus: MapFocus | null, world: NavWorld): NavState {
  const base: NavState = { level: 'world', path: pathOfCity(world.viewerCity), picker: null, selectedId: null, group: null }
  if (!focus || focus.kind === 'world') return base
  if (focus.kind === 'city') {
    const city = world.cities.get(focus.cityId)
    return city ? { ...base, level: 'city', path: pathOfCity(city) } : base
  }
  const item = world.items.find((i) => i.id === focus.id)
  const pin = item ? pinOf(item) : null
  if (!pin) return base
  // Item `pais` não tem cidade: desce ao país (I4).
  const path = pinPath(pin, world.cities)
  return { ...base, level: path.cityKey ? 'city' : 'country', path, selectedId: pin.item.id }
}

/** A câmera de uma vista (I6), centrada na cidade de quem vê no globo. */
export function cameraOf(view: MapView, world: NavWorld, pins: readonly Pin[] = world.pins): Camera {
  return cameraFor(view, pins, viewerCenter(world))
}

/**
 * Um nível abaixo, pela região de `head` (o pin do grupo tocado). `null` quando
 * não há o que descer: item brasileiro sem UF no país, item sem cidade.
 */
function descend(view: MapView, head: Pin, cities: CityMap): MapView | null {
  const { level, path } = view
  if (level === 'world') {
    return { level: 'country', path: head.countryCode === path.countryCode ? path : { ...EMPTY_PATH, countryCode: head.countryCode } }
  }
  if (level === 'country' && head.countryCode === 'BR') {
    if (!head.uf) return null
    return { level: 'state', path: head.uf === path.uf ? path : { ...EMPTY_PATH, countryCode: 'BR', uf: head.uf } }
  }
  if (!head.cityKey) return null
  return { level: 'city', path: pinPath(head, cities) }
}

/** O caminho depois de escolher uma linha do seletor de `level` (R8/R9). */
function chosenView(level: PickerLevel, path: FocusPath, row: RegionRow, cities: CityMap): MapView {
  if (level === 'world') {
    return { level: 'country', path: row.key === path.countryCode ? path : { ...EMPTY_PATH, countryCode: row.key } }
  }
  if (level === 'country' && path.countryCode === 'BR') {
    const uf = row.key as FocusPath['uf']
    return { level: 'state', path: uf === path.uf ? path : { ...EMPTY_PATH, countryCode: 'BR', uf } }
  }
  const base: FocusPath = { ...EMPTY_PATH, countryCode: path.countryCode, uf: path.countryCode === 'BR' ? path.uf : null }
  return { level: 'city', path: cityPath(base, row.key, row.name, cities) }
}

export interface MapNav {
  state: NavState
  /** Tocar num segmento do breadcrumb: vai ao nível e abre o seletor dele; no ativo, alterna (R7). */
  tapSegment: (level: MapLevel) => void
  /** O globo do breadcrumb: volta ao mundo (R7). */
  goWorld: () => void
  /** Escolher uma linha do seletor: desce um nível e abre o seletor seguinte (R8/R9). */
  choose: (level: PickerLevel, row: RegionRow) => void
  /** Uma cidade do IBGE, de _Ver cidades sem lugares_ (R9). */
  chooseCity: (city: CalCity) => void
  closePicker: () => void
  /** O alvo dos Zoom Controls: nível cidade da cidade de quem vê (R10). */
  locate: () => void
  /** Tocar num pin: abre o cartão do lugar (R14); `null` fecha. */
  select: (itemId: string | null) => void
  /** Tocar num cartão de _Aqui por perto_: seleciona e voa até o pin (R13). */
  focusPin: (pin: Pin) => void
  /** Tocar num grupo: desce um nível centrado nele; no nível cidade, recorta _Aqui por perto_ (R11). */
  openGroup: (group: readonly Pin[]) => void
  clearGroup: () => void
  /** Um foco pedido com a Home já aberta (o painel: _Ver mapa_, _Nessa região_ — R18). */
  goFocus: (focus: MapFocus) => void
}

export function useMapNav(initial: () => NavState, world: NavWorld, handle: MapHandle | null): MapNav {
  const [state, setState] = useState<NavState>(initial)

  /** Troca a vista e pede a câmera dela (com `pins` de enquadramento, se dados). */
  function goView(view: MapView, picker: PickerLevel | null, pins?: readonly Pin[]) {
    setState({ ...view, picker, selectedId: null, group: null })
    handle?.flyTo(cameraOf(view, world, pins))
  }

  return {
    state,
    tapSegment(level) {
      if (level === state.level) {
        const own = pickerOf(level)
        setState({ ...state, picker: state.picker === own ? null : own })
        return
      }
      goView({ level, path: state.path }, pickerOf(level))
    },
    goWorld() {
      goView({ level: 'world', path: state.path }, null)
    },
    choose(level, row) {
      const view = chosenView(level, state.path, row, world.cities)
      goView(view, pickerOf(view.level))
    },
    chooseCity(city) {
      goView({ level: 'city', path: pathOfCity(city) }, null)
    },
    closePicker() {
      if (state.picker !== null) setState({ ...state, picker: null })
    },
    locate() {
      goView({ level: 'city', path: pathOfCity(world.viewerCity) }, null)
    },
    select(itemId) {
      setState({ ...state, selectedId: itemId })
    },
    focusPin(pin) {
      setState({ ...state, selectedId: pin.item.id, picker: null })
      const camera = cameraOf(state, world)
      handle?.flyTo(camera.kind === 'center' ? { ...camera, center: { lat: pin.lat, lng: pin.lng } } : camera)
    },
    openGroup(group) {
      const head = group[0]
      if (!head) return
      if (state.level === 'city') {
        setState({ ...state, group: group.map((p) => p.item.id), selectedId: null, picker: null })
        return
      }
      const next = descend(state, head, world.cities)
      if (next) goView(next, null, group)
      // Sem nível abaixo (sem UF, sem cidade): aproxima no grupo sem trocar o nível.
      else handle?.flyTo(cameraOf(state, world, group))
    },
    goFocus(focus) {
      const next = initialNav(focus, world)
      setState(next)
      handle?.flyTo(cameraOf(next, world))
    },
    clearGroup() {
      setState({ ...state, group: null })
    },
  }
}
