import { useSyncExternalStore } from 'react'

/**
 * Se a consulta de mídia vale agora, e re-renderiza quando muda. Sem
 * `matchMedia` (jsdom) devolve `false`: quem usa escolhe a consulta de modo
 * que `false` seja o caso seguro.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof matchMedia !== 'function') return () => {}
      const list = matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => typeof matchMedia === 'function' && matchMedia(query).matches,
    () => false,
  )
}
