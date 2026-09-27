// A casca do app: a barra de navegação (`Navbar`, PajKz) e a rota.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, R1–R4 · .agent/Tasks/fase-4-lista.md, R1
// ADR:  .agent/Decisions/0013-casca-e-navegacao-por-caminho.md
//
// A barra mostra só destinos que existem (R1). A Lista entrou na Fase 4, entre
// Calendário e Configurações; o Calendário desenhado substituiu a timeline
// antiga na Fase 5. Home e Viagens entram com as fases deles.

import { useEffect, useRef, useState } from 'react'
import { CalendarHeart, CalendarPlus, ListChecks, ListPlus, Plus, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CalendarApi } from '../calendar/api'
import { CalendarScreen } from '../calendar/CalendarScreen'
import type { ListApi } from '../list/api'
import { ListScreen } from '../list/ListScreen'
import type { SettingsApi } from '../settings/api'
import { SettingsScreen } from '../settings/SettingsScreen'
import { requestAdd } from './addIntent'
import type { AddIntent } from './addIntent'
import { canonicalPath, navigate, parseRoute, usePathname } from './router'
import type { Route } from './router'
import { useAppearance } from './useAppearance'
import './app.css'

export interface ShellProps {
  /** O que o Calendário pede ao mundo. Injetado, como `api`. */
  calendarApi: CalendarApi
  /** O que as Configurações pedem ao mundo. Injetado: o teste dirige sem rede. */
  api: SettingsApi
  /** O que a Lista pede ao mundo. Injetado, como `api`. */
  listApi: ListApi
  /** A conta mudou de estágio (saiu do casal, apagou o espaço). */
  onStageChanged?: () => void
}

const NAV: { name: Route['name']; label: string; path: string; icon: LucideIcon }[] = [
  { name: 'calendar', label: 'Calendário', path: '/', icon: CalendarHeart },
  // `list-checks`: o ícone do destino Lista no Navbar do design (PajKz).
  { name: 'list', label: 'Lista', path: '/lista', icon: ListChecks },
]

// Recarregar do zero é o jeito mais curto de o portão reavaliar o estágio: a
// sessão continua, e ele recomeça pelo banco.
const reloadApp = () => window.location.assign('/')

export function Shell({ calendarApi, api, listApi, onStageChanged = reloadApp }: ShellProps) {
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
          <li>
            <AddButton />
          </li>
        </ul>
      </nav>
      {route?.name === 'settings' ? (
        <main className="shell-main">
          <SettingsScreen tab={route.tab} api={api} appearance={appearance} onStageChanged={onStageChanged} />
        </main>
      ) : route?.name === 'list' ? (
        <main className="shell-main">
          <ListScreen api={listApi} />
        </main>
      ) : (
        <main className="shell-main">
          <CalendarScreen api={calendarApi} />
        </main>
      )}
    </div>
  )
}

/**
 * R1 (Fase 5): o _Adicionar_ da barra escolhe entre evento e item, vai para a
 * tela dona e pede que ela abra o modal (`addIntent.ts`). Vale em qualquer rota.
 */
function AddButton() {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !root.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const choose = (intent: AddIntent, path: string) => {
    setOpen(false)
    requestAdd(intent)
    navigate(path)
  }

  return (
    <div className="shell-add" ref={root}>
      <button
        type="button"
        className="shell-add-button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Adicionar"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus size={20} aria-hidden="true" />
        <span className="visually-hidden">Adicionar</span>
      </button>
      {open && (
        <div className="shell-add-menu" role="menu" aria-label="Adicionar">
          <button type="button" role="menuitem" onClick={() => choose('new-event', '/')}>
            <CalendarPlus size={16} aria-hidden="true" />
            Novo evento
          </button>
          <button type="button" role="menuitem" onClick={() => choose('new-item', '/lista')}>
            <ListPlus size={16} aria-hidden="true" />
            Item na lista
          </button>
        </div>
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
