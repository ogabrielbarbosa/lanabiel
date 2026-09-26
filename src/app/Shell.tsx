// A casca do app: a barra de navegação (`Navbar`, PajKz) e a rota.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, R1–R4
// ADR:  .agent/Decisions/0013-casca-e-navegacao-por-caminho.md
//
// A barra mostra só destinos que existem (R1). Home, Lista, Viagens e o botão
// Adicionar entram com as fases deles.

import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { CalendarHeart, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SettingsApi } from '../settings/api'
import { SettingsScreen } from '../settings/SettingsScreen'
import { canonicalPath, navigate, parseRoute, usePathname } from './router'
import type { Route } from './router'
import { useAppearance } from './useAppearance'
import './app.css'

export interface ShellProps {
  /** A tela de hoje (timeline antiga) até a Fase 5. */
  calendar: ReactNode
  /** O que as Configurações pedem ao mundo. Injetado: o teste dirige sem rede. */
  api: SettingsApi
  /** A conta mudou de estágio (saiu do casal, apagou o espaço). */
  onStageChanged?: () => void
}

const NAV: { name: Route['name']; label: string; path: string; icon: LucideIcon }[] = [
  { name: 'calendar', label: 'Calendário', path: '/', icon: CalendarHeart },
]

// Recarregar do zero é o jeito mais curto de o portão reavaliar o estágio: a
// sessão continua, e ele recomeça pelo banco.
const reloadApp = () => window.location.assign('/')

export function Shell({ calendar, api, onStageChanged = reloadApp }: ShellProps) {
  const pathname = usePathname()
  const route = parseRoute(pathname)
  const appearance = useAppearance()

  useEffect(() => {
    const canonical = canonicalPath(pathname)
    if (canonical) navigate(canonical, { replace: true })
  }, [pathname])

  return (
    <div className="shell">
      <nav className="shell-nav" aria-label="Navegação principal">
        <ul className="shell-nav-group">
          {NAV.map(({ name, label, path, icon: Icon }) => (
            <li key={name}>
              <NavLink path={path} label={label} current={route?.name === name} icon={Icon} />
            </li>
          ))}
        </ul>
        <ul className="shell-nav-group">
          <li>
            <NavLink
              path="/configuracoes"
              label="Configurações"
              current={route?.name === 'settings'}
              icon={Settings}
            />
          </li>
        </ul>
      </nav>
      {route?.name === 'settings' ? (
        <main className="shell-main">
          <SettingsScreen tab={route.tab} api={api} appearance={appearance} onStageChanged={onStageChanged} />
        </main>
      ) : (
        <main className="shell-main shell-main--legacy">{calendar}</main>
      )}
    </div>
  )
}

function NavLink({ path, label, current, icon: Icon }: { path: string; label: string; current: boolean; icon: LucideIcon }) {
  return (
    <a
      href={path}
      className="shell-nav-button"
      aria-current={current ? 'page' : undefined}
      title={label}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        navigate(path)
      }}
    >
      <Icon size={20} aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </a>
  )
}
