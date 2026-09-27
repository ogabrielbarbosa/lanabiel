// A navegação do app: caminho na barra, sem biblioteca (ADR 0013).
//
// O app tem hoje três áreas (Calendário, Lista e Configurações) e nove abas;
// nenhuma rota tem parâmetro além do slug da aba, e nenhuma carrega dado por
// rota. O item aberto na Lista é estado da tela, não caminho (Fase 4, seção 5).
// Enquanto for assim, ~50 linhas sobre `history` bastam. O ADR diz quando
// trocar por biblioteca.

import { useSyncExternalStore } from 'react'
import { isSettingsTab } from '../domain/settings'
import type { SettingsTab } from '../domain/settings'

export type Route =
  | { name: 'calendar' }
  | { name: 'list' }
  | { name: 'settings'; tab: SettingsTab }

export const SETTINGS_DEFAULT_TAB: SettingsTab = 'perfil-do-casal'

/**
 * Caminho → rota. `null` quando o caminho não existe: quem chama decide para
 * onde mandar (a casca redireciona para `/`, substituindo o histórico).
 * `/configuracoes` sem aba também é `null` aqui — `canonicalPath` resolve.
 */
export function parseRoute(pathname: string): Route | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '/calendario') return { name: 'calendar' }
  if (path === '/lista') return { name: 'list' }
  const match = /^\/configuracoes\/([a-z-]+)$/.exec(path)
  if (match && isSettingsTab(match[1])) return { name: 'settings', tab: match[1] }
  return null
}

/** O caminho a pôr na barra quando o atual não é canônico; `null` se já é. */
export function canonicalPath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/configuracoes') return `/configuracoes/${SETTINGS_DEFAULT_TAB}`
  if (parseRoute(path) === null) return '/'
  return path === pathname ? null : path
}

export function pathFor(route: Route): string {
  if (route.name === 'calendar') return '/'
  if (route.name === 'list') return '/lista'
  return `/configuracoes/${route.tab}`
}

const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

export function navigate(path: string, options: { replace?: boolean } = {}): void {
  if (path === window.location.pathname) return
  if (options.replace) window.history.replaceState(window.history.state, '', path)
  else window.history.pushState(null, '', path)
  notify()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('popstate', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

/** O caminho atual, reativo a `navigate` e a voltar/avançar do navegador. */
export function usePathname(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname)
}
