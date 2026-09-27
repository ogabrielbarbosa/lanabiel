// Configurações (Fase 3): as nove abas do Pencil, o menu e o painel "O espaço
// de vocês".
//
// Spec: .agent/Tasks/fase-3-configuracoes.md
//
// A tela lê tudo de uma vez (loadSettings) e NUNCA mostra valor padrão no
// lugar de dado não lido (seção 7): enquanto a leitura não volta `ok`, não há
// toggle na tela. Cada escrita atualiza o estado com o que o banco devolveu.

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight, Lock } from 'lucide-react'
import type { SettingsData } from '../data/settings'
import type { ListCounts } from '../data/listSummary'
import type { DataResult } from '../data/result'
import { SETTINGS_TABS } from '../domain/settings'
import type { SettingsTab } from '../domain/settings'
import { navigate } from '../app/router'
import type { AppearanceControl } from '../app/useAppearance'
import type { SettingsApi } from './api'
import { TAB_META, tabLead, useWrites } from './context'
import type { TabContext } from './context'
import { Button } from './parts'
import { RightPanel } from './RightPanel'
import { CoupleTab } from './tabs/CoupleTab'
import { ProfileTab } from './tabs/ProfileTab'
import { CitiesTab } from './tabs/CitiesTab'
import { CalendarTab } from './tabs/CalendarTab'
import { ListTab } from './tabs/ListTab'
import { NotificationsTab } from './tabs/NotificationsTab'
import { AppearanceTab } from './tabs/AppearanceTab'
import { DataTab } from './tabs/DataTab'
import { DangerTab } from './tabs/DangerTab'
import './settings.css'

export interface SettingsScreenProps {
  tab: SettingsTab
  api: SettingsApi
  appearance: AppearanceControl
  onStageChanged: () => void
}

export function SettingsScreen({ tab, api, appearance, onStageChanged }: SettingsScreenProps) {
  const [version, setVersion] = useState(0)
  const [result, setResult] = useState<{ version: number; value: DataResult<SettingsData> } | null>(null)
  const [data, setData] = useState<SettingsData | null>(null)
  const writes = useWrites()

  useEffect(() => {
    let cancelled = false
    void api.loadSettings().then((value) => {
      if (cancelled) return
      setResult({ version, value })
      if (value.status === 'ok') setData(value.rows)
    })
    return () => {
      cancelled = true
    }
  }, [api, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  // R26: a contagem da Lista vem à parte. Falhar aqui NÃO derruba a tela —
  // é um número do resumo (mostra —), não um valor que alguém vá editar
  // achando que é o gravado. Relida junto com o resto (`version`).
  const [listCounts, setListCounts] = useState<DataResult<ListCounts> | null>(null)
  useEffect(() => {
    let cancelled = false
    void api.loadListCounts().then((value) => {
      if (!cancelled) setListCounts(value)
    })
    return () => {
      cancelled = true
    }
  }, [api, version])

  // URLs assinadas das fotos (1 h). Relidas quando os caminhos mudam.
  const [urls, setUrls] = useState<{ avatars: Record<string, string | null>; cover: string | null }>({
    avatars: {},
    cover: null,
  })
  const [urlVersion, setUrlVersion] = useState(0)
  const photoKey = data
    ? [data.couple.coverPath, ...data.couple.members.map((m) => `${m.profileId}:${m.avatarPath}`)].join('|')
    : ''
  useEffect(() => {
    if (!data) return
    let cancelled = false
    void Promise.all([
      Promise.all(data.couple.members.map(async (m) => [m.profileId, await api.avatarUrl(m.avatarPath)] as const)),
      api.coverUrl(data.couple.coverPath),
    ]).then(([avatars, cover]) => {
      if (!cancelled) setUrls({ avatars: Object.fromEntries(avatars), cover })
    })
    return () => {
      cancelled = true
    }
    // `photoKey` resume o que importa de `data` aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, photoKey, urlVersion])

  const today = useMemo(() => api.today(), [api])
  const loading = result === null || result.version !== version

  let body: ReactNode
  if (!data && (loading || result === null)) {
    body = (
      <div className="st-skeleton" aria-busy="true">
        <span className="st-hint">Carregando…</span>
      </div>
    )
  } else if (result && result.value.status !== 'ok' && result.version === version) {
    const cause = result.value.status === 'error' ? result.value.cause : 'sua sessão expirou'
    body = (
      <div className="st-card st-load-error" role="alert">
        <p>Não deu pra carregar as configurações: {cause}</p>
        <Button onClick={reload}>Tentar de novo</Button>
      </div>
    )
  } else if (data) {
    const me = data.couple.members.find((m) => m.profileId === data.me.profileId)
    if (!me) {
      // Saiu do casal em outro aparelho: o portão decide para onde ir.
      body = (
        <div className="st-card st-load-error" role="alert">
          <p>Você não está mais neste espaço.</p>
          <Button onClick={onStageChanged}>Continuar</Button>
        </div>
      )
    } else {
      const ctx: TabContext = {
        data,
        api,
        me,
        partner: data.couple.members.find((m) => m.profileId !== me.profileId) ?? null,
        today,
        writes,
        listCounts,
        update: (fn) => setData((d) => (d ? fn(d) : d)),
        reload,
        urls: { avatar: (id) => urls.avatars[id] ?? null, cover: urls.cover },
        refreshUrls: () => setUrlVersion((v) => v + 1),
        appearance,
        onStageChanged,
      }
      body = <Tab tab={tab} ctx={ctx} />
    }
  }

  const names = data?.couple.members.map((m) => m.displayName) ?? []

  return (
    <div className="st">
      <div className="st-area">
        <header className="st-header">
          <p className="st-kicker">
            <Lock size={13} aria-hidden="true" />
            {names.length === 2 ? `Espaço privado · só ${names[0]} e ${names[1]}` : 'Espaço privado'}
          </p>
          <h1>Configurações</h1>
        </header>
        <div className="st-body">
          <nav className="st-menu" aria-label="Seções das configurações">
            {SETTINGS_TABS.map((slug) => {
              const { label, icon: Icon } = TAB_META[slug]
              const active = slug === tab
              return (
                <a
                  key={slug}
                  ref={active ? scrollIntoViewIfNeeded : undefined}
                  href={`/configuracoes/${slug}`}
                  className={`st-menu-item${slug === 'zona-sensivel' ? ' st-menu-item--danger' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={(event) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                    event.preventDefault()
                    navigate(`/configuracoes/${slug}`)
                  }}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                  {active && <ChevronRight size={14} aria-hidden="true" className="st-menu-chevron" />}
                </a>
              )
            })}
          </nav>
          <section className="st-section" aria-labelledby="st-section-title">
            <div className="st-section-head">
              <h2 id="st-section-title">{TAB_META[tab].label}</h2>
              <p>{tabLead(tab, listCounts)}</p>
            </div>
            {body}
          </section>
        </div>
      </div>
      {data && <RightPanel data={data} today={today} urls={urls} listCounts={listCounts} />}
    </div>
  )
}

/**
 * No celular o menu é uma faixa horizontal: a aba ativa precisa estar à vista.
 * Só em faixa rolável — no desktop o menu é vertical e já cabe inteiro.
 */
function scrollIntoViewIfNeeded(element: HTMLAnchorElement | null) {
  const menu = element?.parentElement
  if (!element || !menu || menu.scrollWidth <= menu.clientWidth) return
  element.scrollIntoView?.({ block: 'nearest', inline: 'center' })
}

function Tab({ tab, ctx }: { tab: SettingsTab; ctx: TabContext }) {
  switch (tab) {
    case 'perfil-do-casal':
      return <CoupleTab {...ctx} />
    case 'meu-perfil':
      return <ProfileTab {...ctx} />
    case 'cidades':
      return <CitiesTab {...ctx} />
    case 'calendario':
      return <CalendarTab {...ctx} />
    case 'lista':
      return <ListTab {...ctx} />
    case 'notificacoes':
      return <NotificationsTab {...ctx} />
    case 'aparencia':
      return <AppearanceTab {...ctx} />
    case 'dados-e-privacidade':
      return <DataTab {...ctx} />
    case 'zona-sensivel':
      return <DangerTab {...ctx} />
  }
}
