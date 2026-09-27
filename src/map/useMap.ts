// Monta UMA instância de mapa por montagem da tela (I12) e expõe o estado.
//
// Spec: .agent/Tasks/fase-7-mapa.md, I12, seção 7

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { MapEngine, MapFailureReason, MapHandle, MountOptions } from './engine'

export type MapState =
  | { status: 'loading' }
  | { status: 'ready'; handle: MapHandle }
  | { status: 'failed'; reason: MapFailureReason }

/**
 * `options` é lido só na montagem (e no _Tentar de novo_): mudar câmera,
 * filtro ou dado depois NÃO recria o mapa — quem chama usa o `handle`.
 * O movimento NÃO re-renderiza quem chama: quem desenha por cima (pins,
 * cartão) assina com `useMapTick(handle)` e só ele reprojeta a cada quadro.
 */
export function useMap(engine: MapEngine, options: MountOptions) {
  const ref = useRef<HTMLDivElement>(null)
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })
  const [state, setState] = useState<MapState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const host = ref.current
    if (!host) return
    // Um contêiner novo por montagem: no StrictMode (e no _Tentar de novo_) a
    // montagem anterior ainda pode estar resolvendo quando a próxima começa, e
    // o Mapbox recusa contêiner que não está vazio.
    const el = document.createElement('div')
    el.className = 'map-host'
    el.style.position = 'absolute'
    el.style.inset = '0'
    host.appendChild(el)
    let handle: MapHandle | null = null
    let alive = true
    setState({ status: 'loading' })
    // Um microtick antes de montar: no StrictMode a primeira montagem é
    // desfeita na hora, e assim ela nem constrói o mapa (não gasta um load).
    void Promise.resolve()
      .then(() => (alive ? engine.mount(el, optionsRef.current) : null))
      .then((result) => {
        if (result === null) return
        if (!alive) {
          if (result.status === 'ok') result.handle.destroy()
          return
        }
        if (result.status !== 'ok') {
          setState(result)
          return
        }
        handle = result.handle
        setState({ status: 'ready', handle })
      })
    return () => {
      alive = false
      handle?.destroy()
      el.remove()
    }
  }, [engine, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return { ref, state, retry }
}

/**
 * Re-renderiza o componente que chama a cada movimento do mapa — só ele (os
 * pins, o cartão preso ao pin), não a tela inteira.
 */
export function useMapTick(handle: MapHandle | null): void {
  const [, bump] = useReducer((n: number) => n + 1, 0)
  useEffect(() => (handle ? handle.onMove(bump) : undefined), [handle])
}
