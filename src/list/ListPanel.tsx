// Painel da direita da Lista (`ltlFV`): data, Progresso, Sugestão do momento,
// Perto de vocês e Adicionados recentemente.
//
// Spec: .agent/Tasks/fase-4-lista.md — R21–R25, I9–I11
//
// "Onde o casal está" vem das estadias do banco (`whereWeAre`), nunca da
// cidade-casa. Sem ele (`unknown`) ou separados, NENHUMA distância aparece.

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarPlus, ChevronRight, Dices, Shuffle, Sparkles } from 'lucide-react'
import {
  CATEGORY_LABELS,
  formatDistance,
  nearby,
  pickSuggestion,
  progress,
  relativeAge,
  secondaryLine,
  sortItems,
  suggestionPool,
} from '../domain/list'
import type { ListCategory, ListItem, WhereWeAre } from '../domain/list'
import { distanceKmExact } from '../domain/onboarding'
import { navigate } from '../app/router'
import { localDateOf, shortDayMonth, weekdayDayMonthLabel } from '../lib/date'
import { CATEGORY_ICONS, catClass } from './categories'
import { useList } from './context'
import { Avatar, CategoryTag, CoupleMark, ItemPhoto } from './parts'

export interface ListPanelProps {
  showCategoryProgress: boolean
  showDailySuggestion: boolean
  hidden: readonly ListCategory[]
  /** "Ver tudo" do Progresso: aplica "Já fizemos" na grade. */
  onShowDone: () => void
  /** "Ver todos" dos recentes: zera os filtros e ordena por Recentes. */
  onShowRecent: () => void
  onOpen: (itemId: string) => void
  /** "Bora fazer". */
  onMarkDone: (item: ListItem) => void
}


function contextLine(where: WhereWeAre): string {
  if (where.kind === 'together') {
    const base = `Vocês estão juntos em ${where.city.name}`
    return where.until ? `${base} até ${shortDayMonth(where.until)}` : base
  }
  if (where.kind === 'apart') return 'Pra uma noite separados, cada um na sua casa.'
  return 'Sem registro de onde vocês estão hoje.'
}

export function ListPanel({
  showCategoryProgress,
  showDailySuggestion,
  hidden,
  onShowDone,
  onShowRecent,
  onOpen,
  onMarkDone,
}: ListPanelProps) {
  const { items, today } = useList()
  const empty = items.length === 0

  return (
    <aside className="ls-panel" aria-label="Painel da lista">
      <div className="ls-panel-head">
        <p className="ls-panel-date">{weekdayDayMonthLabel(today)}</p>
        <h2 className="ls-panel-title">O que vem por aí</h2>
      </div>
      <ProgressCard hidden={hidden} showCategoryProgress={showCategoryProgress} onShowDone={onShowDone} />
      {!empty && showDailySuggestion && <SuggestionCard hidden={hidden} onMarkDone={onMarkDone} />}
      {!empty && <NearbyCard hidden={hidden} onOpen={onOpen} />}
      <RecentCard hidden={hidden} onOpen={onOpen} onShowRecent={onShowRecent} />
    </aside>
  )
}

function PanelCard({
  title,
  action,
  children,
}: {
  title: string
  action?: { label: string; onClick: () => void }
  children: ReactNode
}) {
  return (
    <section className="ls-panel-card" aria-label={title}>
      <div className="ls-panel-card-head">
        <h3>{title}</h3>
        {action && (
          <button type="button" className="ls-link" onClick={action.onClick}>
            {action.label}
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function ProgressCard({
  hidden,
  showCategoryProgress,
  onShowDone,
}: {
  hidden: readonly ListCategory[]
  showCategoryProgress: boolean
  onShowDone: () => void
}) {
  const { items } = useList()
  const p = progress(items, hidden)
  return (
    <PanelCard title="Progresso" action={{ label: 'Ver tudo', onClick: onShowDone }}>
      <div className="ls-progress-top">
        <p className="ls-progress-numbers">
          <strong>{p.done}</strong>
          <span>de {p.total} feitas</span>
        </p>
        <span className="ls-progress-pct">{p.percent}%</span>
      </div>
      <div
        className="ls-track ls-track--main"
        role="progressbar"
        aria-label="Feitas"
        aria-valuemin={0}
        aria-valuemax={p.total}
        aria-valuenow={p.done}
      >
        <span style={{ width: `${p.percent}%` }} />
      </div>
      {showCategoryProgress && (
        <ul className="ls-progress-cats" aria-label="Progresso por categoria">
          {p.byCategory.map(({ category, done, total }) => {
            const Icon = CATEGORY_ICONS[category]
            return (
              <li key={category} className={catClass(category)}>
                <Icon size={14} aria-hidden="true" className="ls-cat-icon" />
                <span className="ls-progress-cat-name">{CATEGORY_LABELS[category].many}</span>
                <span className="ls-track" aria-hidden="true">
                  <span style={{ width: total === 0 ? 0 : `${(done * 100) / total}%` }} />
                </span>
                <span className="ls-progress-cat-count">
                  {done}/{total}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </PanelCard>
  )
}

function SuggestionCard({ hidden, onMarkDone }: { hidden: readonly ListCategory[]; onMarkDone: (item: ListItem) => void }) {
  const { items, where, api, urls } = useList()
  const pool = useMemo(() => suggestionPool(items, where, hidden), [items, where, hidden])
  const [currentId, setCurrentId] = useState<string | null>(() => pickSuggestion(pool, null, api.random)?.id ?? null)
  const current = pool.find((i) => i.id === currentId) ?? null

  // A atual saiu do conjunto numa releitura (foi feita, apagada, a cidade
  // mudou): sorteia outra já neste render — ajuste de estado durante o
  // render, sem efeito, e só quando a atual some (a sugestão não pula a cada
  // volta à aba).
  if (current === null && pool.length > 0) {
    setCurrentId(pickSuggestion(pool, null, api.random)?.id ?? null)
  }

  function another() {
    setCurrentId(pickSuggestion(pool, currentId, api.random)?.id ?? null)
  }

  // I11: só com a cidade de hoje; separados ou sem registro, sem distância.
  const distance = current?.place && where.kind === 'together' ? distanceKmExact(where.city, current.place) : undefined

  return (
    <PanelCard title="Sugestão do momento" action={pool.length > 1 ? { label: 'Outra', onClick: another } : undefined}>
      {current === null ? (
        <p className="ls-hint">Nada pra sugerir por aqui — adicione algo à lista.</p>
      ) : (
        <div className="ls-suggestion">
          <ItemPhoto
            category={current.category}
            url={current.photoPath ? (urls.get(current.photoPath) ?? null) : null}
            className="ls-suggestion-photo"
          >
            <span className="ls-suggestion-badge">
              <Dices size={13} aria-hidden="true" />
              Sorteado da lista
            </span>
          </ItemPhoto>
          <div className="ls-suggestion-info">
            <p className="ls-suggestion-name">{current.name}</p>
            <p className={`ls-suggestion-meta ${catClass(current.category)}`}>
              <SuggestionIcon category={current.category} />
              <span>
                {[CATEGORY_LABELS[current.category].one, secondaryLine(current), distance !== undefined ? formatDistance(distance) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </p>
            <p className="ls-suggestion-context">{contextLine(where)}</p>
          </div>
          <div className="ls-suggestion-actions">
            <button type="button" className="ls-btn ls-btn--primary ls-btn--wide" onClick={() => onMarkDone(current)}>
              <CalendarPlus size={17} aria-hidden="true" />
              Bora fazer
            </button>
            {pool.length > 1 && (
              <button type="button" className="ls-icon-btn ls-icon-btn--glass ls-icon-btn--40" aria-label="Sortear outra" onClick={another}>
                <Shuffle size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}
    </PanelCard>
  )
}

function SuggestionIcon({ category }: { category: ListCategory }) {
  const Icon = CATEGORY_ICONS[category]
  return <Icon size={13} aria-hidden="true" className="ls-cat-icon" />
}

function NearbyCard({ hidden, onOpen }: { hidden: readonly ListCategory[]; onOpen: (id: string) => void }) {
  const { items, where, urls, members } = useList()
  const memberList = [...members.values()]

  if (where.kind !== 'together') {
    return (
      <PanelCard title="Perto de vocês">
        <p className="ls-hint">
          {where.kind === 'apart' ? (
            'Vocês estão em cidades diferentes hoje'
          ) : (
            <>
              Sem registro de onde vocês estão hoje —{' '}
              <a
                href="/calendario"
                className="ls-hint-link"
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
                  event.preventDefault()
                  navigate('/calendario')
                }}
              >
                marque no Calendário
              </a>
              .
            </>
          )}
        </p>
      </PanelCard>
    )
  }

  const close = nearby(
    items.filter((i) => !hidden.includes(i.category)),
    where.city,
  )
  return (
    <PanelCard title="Perto de vocês">
      <div className="ls-where">
        <CoupleMark members={memberList} />
        <div>
          <p className="ls-where-title">Juntos em {where.city.name}</p>
          <p className="ls-where-sub">
            {close.length === 1 ? '1 item' : `${close.length} itens`} da lista na cidade · do calendário
          </p>
        </div>
      </div>
      {close.length > 0 && (
        <ul className="ls-nearby" aria-label="Mais perto">
          {close.slice(0, 3).map(({ item, km }) => (
            <li key={item.id}>
              <button type="button" className="ls-quick" onClick={() => onOpen(item.id)}>
                <ItemPhoto
                  category={item.category}
                  url={item.photoPath ? (urls.get(item.photoPath) ?? null) : null}
                  className="ls-quick-thumb"
                />
                <span className="ls-quick-text">
                  <span className="ls-quick-name">{item.name}</span>
                  <span className={`ls-quick-meta ${catClass(item.category)}`}>
                    <span className="ls-dot" aria-hidden="true" />
                    <span className="ls-quick-cat">{CATEGORY_LABELS[item.category].one}</span>
                    <span>· {formatDistance(km)}</span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  )
}

function RecentCard({
  hidden,
  onOpen,
  onShowRecent,
}: {
  hidden: readonly ListCategory[]
  onOpen: (id: string) => void
  onShowRecent: () => void
}) {
  const { items, urls, members, today } = useList()
  const recent = sortItems(
    items.filter((i) => !hidden.includes(i.category)),
    'recent',
  ).slice(0, 4)

  return (
    <PanelCard title="Adicionados recentemente" action={recent.length > 0 ? { label: 'Ver todos', onClick: onShowRecent } : undefined}>
      {recent.length === 0 ? (
        <p className="ls-hint">Nada adicionado ainda.</p>
      ) : (
        <ul className="ls-recent" aria-label="Últimos adicionados">
          {recent.map((item) => {
            const age = relativeAge(localDateOf(item.createdAt), today)
            const secondary = secondaryLine(item)
            return (
              <li key={item.id}>
                <button type="button" className="ls-recent-row" onClick={() => onOpen(item.id)}>
                  <ItemPhoto
                    category={item.category}
                    url={item.photoPath ? (urls.get(item.photoPath) ?? null) : null}
                    className="ls-recent-thumb"
                  />
                  <span className="ls-recent-info">
                    <span className="ls-recent-name">{item.name}</span>
                    <span className="ls-recent-meta">
                      <CategoryTag category={item.category} />
                      <span className="ls-recent-note">
                        {[secondary, age === 'hoje' ? 'hoje' : `há ${age}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </span>
                  {item.featured && <Sparkles size={18} aria-label="Em destaque" className="ls-emphasis" />}
                  <Avatar member={members.get(item.addedBy ?? '') ?? null} size={24} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </PanelCard>
  )
}
