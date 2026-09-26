// O estado de aparência do aparelho, aplicado no `<html>` e seguindo o sistema
// ao vivo quando o tema é "Do sistema".

import { useEffect, useState } from 'react'
import { applyAppearance, loadAppearance, safeLocalStorage, saveAppearance } from './appearance'
import type { Appearance } from './appearance'

function media(query: string): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(query).matches
}

export function useAppearance() {
  const [state, setState] = useState(() =>
    loadAppearance(safeLocalStorage(), media('(prefers-reduced-motion: reduce)')),
  )
  const [systemDark, setSystemDark] = useState(() => media('(prefers-color-scheme: dark)'))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    applyAppearance(document.documentElement, state.appearance, systemDark)
  }, [state.appearance, systemDark])

  function update(patch: Partial<Appearance>) {
    // Funcional: dois gestos no mesmo tick não se perdem. Gravar dentro do
    // atualizador é idempotente (o StrictMode o chama duas vezes, com o mesmo
    // valor). Não gravou (modo privado): continua valendo nesta sessão.
    setState((current) => {
      const appearance = { ...current.appearance, ...patch }
      return { appearance, storable: saveAppearance(safeLocalStorage(), appearance) }
    })
  }

  return { appearance: state.appearance, storable: state.storable, update }
}

export type AppearanceControl = ReturnType<typeof useAppearance>
