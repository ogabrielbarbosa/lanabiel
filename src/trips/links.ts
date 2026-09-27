// Os caminhos das Viagens e o clique que navega sem recarregar. Sem JSX: fica
// fora de `parts.tsx` para o fast refresh (oxlint `only-export-components`).

import type { MouseEvent } from 'react'
import { navigate } from '../app/router'

/** O caminho do detalhe (ADR 0020). */
export const tripPath = (id: string): string => `/viagens/${id}`

/**
 * Clique simples navega sem recarregar; cmd/ctrl/shift-clique e botão do meio
 * ficam com o navegador (abrir em outra aba), como o link do R1.
 */
export function followLink(event: MouseEvent<HTMLAnchorElement>, path: string): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
  event.preventDefault()
  navigate(path)
}
