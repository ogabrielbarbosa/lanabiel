// A navegação do app: caminho na barra, sem biblioteca (ADR 0013, 0020).
//
// O app tem cinco áreas (Home, Calendário, Lista, Viagens e Configurações) e
// nove abas. A Home ocupa `/` e o Calendário mora em `/calendario` desde a
// Fase 7 (ADR 0023). Uma rota tem parâmetro: o detalhe da viagem, `/viagens/<id>`
// (Fase 6, ADR 0020) — o parâmetro é só identidade, e nenhuma rota carrega
// dado. O item aberto na Lista é estado da tela, não caminho (Fase 4, seção
// 5). O ADR 0020 diz quando trocar por biblioteca.

import { useSyncExternalStore } from 'react'
import { isSettingsTab } from '../domain/settings'
import type { SettingsTab } from '../domain/settings'

export type Route =
  | { name: 'home' }
  | { name: 'calendar' }
  | { name: 'list' }
  | { name: 'trips' }
  /** `id` = o do evento `viagem` (ADR 0019), em minúsculas. */
  | { name: 'trip'; id: string }
  | { name: 'settings'; tab: SettingsTab }

export const SETTINGS_DEFAULT_TAB: SettingsTab = 'perfil-do-casal'

/** O formato de um uuid, sem caixa (ADR 0020). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Caminho → rota. `null` quando o caminho não existe: quem chama decide para
 * onde mandar (a casca redireciona para `/`, substituindo o histórico).
 * `/configuracoes` sem aba também é `null` aqui — `canonicalPath` resolve.
 */
export function parseRoute(pathname: string): Route | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/') return { name: 'home' }
  if (path === '/calendario') return { name: 'calendar' }
  if (path === '/lista') return { name: 'list' }
  if (path === '/viagens') return { name: 'trips' }
  // R1: qualquer segmento é o detalhe — um id que não é viagem do casal (ou
  // nem é uuid) mostra "Essa viagem não está aqui.", em vez de sumir para o
  // Calendário. O uuid em maiúsculas é o mesmo id: `canonicalPath` o baixa.
  const trip = /^\/viagens\/([A-Za-z0-9-]+)$/.exec(path)
  if (trip) return { name: 'trip', id: UUID.test(trip[1]) ? trip[1].toLowerCase() : trip[1] }
  const match = /^\/configuracoes\/([a-z-]+)$/.exec(path)
  if (match && isSettingsTab(match[1])) return { name: 'settings', tab: match[1] }
  return null
}

/** O caminho a pôr na barra quando o atual não é canônico; `null` se já é. */
export function canonicalPath(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/configuracoes') return `/configuracoes/${SETTINGS_DEFAULT_TAB}`
  const route = parseRoute(path)
  if (route === null) return '/'
  // `/viagens/<UUID>` → minúsculas: um endereço só por viagem.
  const canonical = route.name === 'trip' ? pathFor(route) : path
  return canonical === pathname ? null : canonical
}

export function pathFor(route: Route): string {
  if (route.name === 'home') return '/'
  if (route.name === 'calendar') return '/calendario'
  if (route.name === 'list') return '/lista'
  if (route.name === 'trips') return '/viagens'
  if (route.name === 'trip') return `/viagens/${route.id}`
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
