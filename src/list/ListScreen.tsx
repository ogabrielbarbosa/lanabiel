// A tela da Lista (`B3rwp`, `DXg1A`): cabeçalho, busca, chips, filtros, Em
// destaque, a grade, os estados vazios, e o painel da direita (ListPanel).
//
// Spec: .agent/Tasks/fase-4-lista.md — R2–R10, R28, seção 7
// ADR:  .agent/Decisions/0015-lista-sem-realtime-reler-ao-voltar.md
//
// Leitura: `loadList` e `loadContext` em paralelo (+ as cidades das estadias
// de hoje, para `whereWeAre`). Enquanto não houver um `ok`, a tela mostra
// esqueleto ou erro — NUNCA o estado "lista vazia" (R10), que é o erro que o
// `DataResult` existe para impedir. Releitura: depois de cada escrita própria,
// ao voltar ao foco e antes de as URLs assinadas vencerem; a que falha mantém
// a tela e avisa. O dia (`today`) é relido a cada leitura — a aba aberta de
// um dia para o outro não fica presa ao dia em que montou.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ArrowDownUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  FunnelX,
  Layers,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { useAddIntent } from '../app/addIntent'
import { clearListFocus, peekListFocus } from '../app/listFocus'
import { PanelSkeleton } from '../app/PanelSkeleton'
import { navigate } from '../app/router'
import type { City } from '../data/cities'
import { SIGNED_URL_SECONDS } from '../data/list'
import type { ListData } from '../data/list'
import type { DataResult } from '../data/result'
import type { SettingsData } from '../data/settings'
import {
  CATEGORY_LABELS,
  EMPTY_FILTERS,
  applyFilters,
  countByCategory,
  emptyStateCopy,
  normalizeSearch,
  progress,
  relativeAge,
  secondaryLine,
  sortItems,
  whereWeAre,
} from '../domain/list'
import type { ListCategory, ListFilters, ListItem, ListSort } from '../domain/list'
import { localDateOf, shortDayMonth } from '../lib/date'
import type { ListApi } from './api'
import { AddItemModal } from './AddItemModal'
import { CATEGORY_ICONS, catClass } from './categories'
import { ListContext, failureMessage, memberName } from './context'
import type { ListContextValue, ListMember } from './context'
import { ItemSheet } from './ItemSheet'
import { ListPanel } from './ListPanel'
import { MarkDoneModal } from './MarkDoneModal'
import { Avatar, CategoryTag, CoupleMark, ItemPhoto } from './parts'
import './list.css'

export interface ListScreenProps {
  /** O que a Lista pede ao mundo. Injetado: o teste dirige sem rede. */
  api: ListApi
}

/** O que uma leitura completa devolve. */
interface Snapshot {
  list: ListData
  ctx: SettingsData
  cities: ReadonlyMap<string, City>
  /** O dia em que ESTA leitura foi feita (`api.today()`), usado em tudo que ela mostra. */
  today: string
}

/**
 * Releitura automática antes de as URLs assinadas vencerem (1 h): com a aba
 * visível e ninguém escrevendo, nada mais relê, e as fotos quebrariam. Dez
 * minutos de folga para a leitura e as imagens preguiçosas.
 */
export const URL_REFRESH_MS = (SIGNED_URL_SECONDS - 10 * 60) * 1000

const SETTINGS_LIST_PATH = '/configuracoes/lista'

/** Qual sobreposto está aberto (um por vez). */
type Overlay =
  | { kind: 'add'; initialCategory?: ListCategory }
  | { kind: 'edit'; item: ListItem }
  | { kind: 'sheet'; itemId: string }
  | { kind: 'done'; item: ListItem }
  | null

const SORT_LABELS: Record<ListSort, { option: string; heading: string }> = {
  recent: { option: 'Recentes', heading: 'Recentes primeiro' },
  az: { option: 'A–Z', heading: 'A–Z' },
  category: { option: 'Categoria', heading: 'Por categoria' },
}

function causeOf(result: { status: 'unauthenticated' } | { status: 'error'; cause: string }): string {
  return result.status === 'error' ? result.cause : 'sua sessão expirou'
}

/** Itens + contexto + as cidades onde cada um está hoje (não só as casas). */
async function readAll(api: ListApi, today: string): Promise<DataResult<Snapshot>> {
  const [list, ctx] = await Promise.all([api.loadList(), api.loadContext()])
  if (list.status !== 'ok') return list.status === 'error' ? list : { status: 'unauthenticated' }
  if (ctx.status !== 'ok') return ctx.status === 'error' ? ctx : { status: 'unauthenticated' }

  const cities = new Map<string, City>(ctx.rows.couple.members.map((m) => [m.homeCity.id, m.homeCity]))
  const current = ctx.rows.stays.filter((s) => s.startsOn <= today && (s.endsOn === null || today <= s.endsOn))
  const missing = [...new Set(current.map((s) => s.cityId))].filter((id) => !cities.has(id))
  if (missing.length > 0) {
    const found = await api.loadCitiesByIds(missing)
    if (found.status !== 'ok') return found.status === 'error' ? found : { status: 'unauthenticated' }
    for (const [id, city] of found.rows) cities.set(id, city)
  }
  return { status: 'ok', rows: { list: list.rows, ctx: ctx.rows, cities, today } }
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function ListScreen({ api }: ListScreenProps) {
  // Fase 7, R3: o pedido da Home não sobrevive à saída da Lista — nem quando
  // a leitura falhou e o `Loaded` nunca o consumiu.
  useEffect(() => () => clearListFocus(), [])
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(new Map())
  const [avatars, setAvatars] = useState<Readonly<Record<string, string | null>>>({})
  const generation = useRef(0)
  const hasSnap = useRef(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // A própria `reload`, para o timer chamar sem entrar nas dependências.
  const reloadRef = useRef<() => Promise<void>>(async () => {})

  const reload = useCallback(async () => {
    const mine = ++generation.current
    const result = await readAll(api, api.today())
    if (mine !== generation.current) return
    if (result.status !== 'ok') {
      if (hasSnap.current) setStale(true)
      else setLoadError(causeOf(result))
      return
    }
    hasSnap.current = true
    setSnap(result.rows)
    setLoadError(null)
    setStale(false)

    // As URLs desta leitura vencem em `SIGNED_URL_SECONDS`: relê antes. Cada
    // leitura bem-sucedida recomeça a contagem.
    if (refreshTimer.current !== null) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null
      void reloadRef.current()
    }, URL_REFRESH_MS)

    // Um lote de URLs por leitura (seção 8). Falhou: sem URL, o card mostra
    // o fundo da categoria (seção 7).
    const { list, ctx } = result.rows
    const [signed, avatarPairs] = await Promise.all([
      api.signedUrls([...list.items.map((i) => i.photoPath), ...list.photos.map((p) => p.path)]),
      Promise.all(ctx.couple.members.map(async (m) => [m.profileId, await api.avatarUrl(m.avatarPath)] as const)),
    ])
    if (mine !== generation.current) return
    setUrls(signed.status === 'ok' ? signed.rows : new Map())
    setAvatars(Object.fromEntries(avatarPairs))
  }, [api])

  useEffect(() => {
    reloadRef.current = reload
  }, [reload])

  useEffect(() => {
    const gen = generation
    const timer = refreshTimer
    // `reload` só chama setState depois do `await` da leitura.
    // eslint-disable-next-line react/set-state-in-effect
    void reload()
    // Desmontou: a leitura em voo não escreve mais em nada, e o timer morre.
    return () => {
      gen.current++
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = null
    }
  }, [reload])

  // ADR 0015: voltar à aba relê.
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') void reload()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [reload])

  function retry() {
    setLoadError(null)
    void reload()
  }

  return (
    <div className="ls">
      {snap ? (
        <Loaded snap={snap} api={api} today={snap.today} urls={urls} avatars={avatars} stale={stale} reload={reload} />
      ) : (
        <div className="ls-area">
          <header className="ls-header">
            <div className="ls-title">
              <h1>Nossa lista</h1>
            </div>
          </header>
          {loadError !== null ? (
            <div className="ls-load-error lg" role="alert">
              <p>Não deu pra carregar a lista: {loadError}</p>
              <button type="button" className="ls-btn lg" onClick={retry}>
                Tentar de novo
              </button>
            </div>
          ) : (
            <Skeleton />
          )}
        </div>
      )}
      {!snap && <EmptyPanel busy={loadError === null} />}
    </div>
  )
}

/**
 * O painel da Lista antes do `ok` (ou sem ele): no mesmo lugar e do mesmo
 * tamanho, para a grade não se mexer quando os dados chegam.
 */
function EmptyPanel({ busy = false }: { busy?: boolean }) {
  return (
    <aside className="ls-panel lg" aria-label="Painel da lista" aria-busy={busy || undefined}>
      <div className="ls-panel-scroll">
        <PanelSkeleton busy={busy} cards={[236, 168, 168, 200]} />
      </div>
    </aside>
  )
}

function Skeleton() {
  return (
    <div className="ls-skeleton" aria-busy="true">
      <span className="visually-hidden">Carregando a lista…</span>
      <div className="ls-skeleton-chips" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="ls-grid" aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="ls-skeleton-card lg" />
        ))}
      </div>
    </div>
  )
}

function Loaded({
  snap,
  api,
  today,
  urls,
  avatars,
  stale,
  reload,
}: {
  snap: Snapshot
  api: ListApi
  today: string
  urls: ReadonlyMap<string, string>
  avatars: Readonly<Record<string, string | null>>
  stale: boolean
  reload: () => Promise<void>
}) {
  const { list, ctx } = snap
  const settings = ctx.coupleSettings
  const hidden = settings.hiddenCategories

  const [filters, setFilters] = useState<ListFilters>(EMPTY_FILTERS)
  // R4: começa na preferência do casal e vale só até sair da tela.
  const [sort, setSort] = useState<ListSort>(settings.listDefaultSort)
  // Fase 7, R3: a Home pediu um item (a seta do cartão do lugar, os cartões do
  // painel). Lido ao montar — o `Loaded` só monta com os dados, então o id já
  // pode ser conferido — e apagado no efeito abaixo. Id que não está na Lista
  // (a outra pessoa apagou) abre a tela sem ficha.
  const [overlay, setOverlay] = useState<Overlay>(() => {
    const id = peekListFocus()
    return id !== null && list.items.some((i) => i.id === id) ? { kind: 'sheet', itemId: id } : null
  })
  useEffect(() => clearListFocus(), [])
  // R1 (Fase 5): o _Adicionar_ da barra pediu um item.
  useAddIntent('new-item', () => setOverlay({ kind: 'add' }))
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl+K foca a busca (R2).
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const memberList = useMemo<ListMember[]>(
    () =>
      ctx.couple.members.map((m) => ({
        profileId: m.profileId,
        name: m.displayName,
        color: m.color,
        avatarUrl: avatars[m.profileId] ?? null,
        homeCity: { id: m.homeCity.id, name: m.homeCity.name, lat: m.homeCity.lat, lng: m.homeCity.lng },
      })),
    [ctx.couple.members, avatars],
  )
  const members = useMemo(() => new Map(memberList.map((m) => [m.profileId, m])), [memberList])
  const me = members.get(ctx.me.profileId)

  const where = useMemo(
    () =>
      whereWeAre(
        ctx.stays,
        ctx.couple.members.map((m) => ({ profileId: m.profileId, homeCityId: m.homeCity.id })),
        snap.cities,
        today,
      ),
    [ctx, snap.cities, today],
  )

  const value = useMemo<ListContextValue | null>(
    () =>
      me
        ? {
            api,
            coupleId: ctx.couple.id,
            me,
            members,
            items: list.items,
            memories: list.memories,
            photos: list.photos,
            urls,
            where,
            today,
            reload,
          }
        : null,
    [api, ctx.couple.id, me, members, list, urls, where, today, reload],
  )

  if (!value) {
    // Saiu do casal em outro aparelho: nada aqui é mais dele.
    return (
      <>
        <div className="ls-area">
          <div className="ls-load-error lg" role="alert">
            <p>Este espaço mudou. Recarregue a página.</p>
          </div>
        </div>
        <EmptyPanel />
      </>
    )
  }

  const items = list.items
  // R10 é sobre o que a pessoa VÊ: itens todos em categorias ocultas também
  // são "lista vazia" — com a dica de onde elas foram escondidas.
  const visibleCount = items.filter((i) => !hidden.includes(i.category)).length
  const totals = progress(items, hidden)
  const counts = countByCategory(items, hidden)
  const shown = sortItems(applyFilters(items, filters, hidden), sort)
  const query = normalizeSearch(filters.query)
  const filtering = filters.category !== 'all' || filters.status !== 'all' || query !== ''
  const featured = filtering ? [] : sortItems(items.filter((i) => i.featured && !hidden.includes(i.category)), sort)
  const namesById = Object.fromEntries(memberList.map((m) => [m.profileId, m.name]))

  const activeFilters = describeFilters(filters, namesById)
  const header =
    `${plural(totals.total, 'coisa', 'coisas')} · ${totals.done} já feitas` +
    (activeFilters.length > 0 ? ` · filtrando: ${activeFilters.map((f) => f.summary).join(', ')}` : '')

  function patchFilters(patch: Partial<ListFilters>) {
    setFilters((f) => {
      const next = { ...f, ...patch }
      // "Quem" só existe com "Já fizemos" (R4).
      if (next.status !== 'done') next.who = 'all'
      return next
    })
  }

  async function afterWrite() {
    setOverlay(null)
    await reload()
  }

  async function toggleFeatured(item: ListItem) {
    const key = `featured:${item.id}`
    setPending((p) => new Set(p).add(key))
    setNotice(null)
    const result = await api.setFeatured(item.id, !item.featured)
    setPending((p) => {
      const next = new Set(p)
      next.delete(key)
      return next
    })
    if (result.status !== 'ok' && result.status !== 'not_found') {
      setNotice(`Não deu pra ${item.featured ? 'tirar a ênfase' : 'dar ênfase'}: ${failureMessage(result)}`)
    }
    await reload()
  }

  const open = (itemId: string) => setOverlay({ kind: 'sheet', itemId })
  const markDone = (item: ListItem) => setOverlay({ kind: 'done', item })

  let body: ReactNode
  if (visibleCount === 0) {
    body = (
      <div className="ls-empty lg">
        <span className="ls-empty-icon ls-empty-icon--accent lg" aria-hidden="true">
          <Sparkles size={36} />
        </span>
        <div className="ls-empty-text">
          <h2>A lista está vazia</h2>
          <p>Adicione lugares, comidas, filmes ou qualquer coisa que vocês queiram fazer juntos.</p>
          {items.length > 0 && (
            <p>
              Algumas categorias estão escondidas nas Configurações.{' '}
              <a
                href={SETTINGS_LIST_PATH}
                onClick={(event) => {
                  event.preventDefault()
                  navigate(SETTINGS_LIST_PATH)
                }}
              >
                Ver nas Configurações
              </a>
            </p>
          )}
        </div>
        <div className="ls-empty-actions">
          <button type="button" className="ls-btn ls-btn--primary" onClick={() => setOverlay({ kind: 'add' })}>
            <Plus size={17} aria-hidden="true" />
            Adicionar o primeiro
          </button>
        </div>
      </div>
    )
  } else if (shown.length === 0) {
    const copy = emptyStateCopy(filters, { byId: namesById })
    const category = filters.category === 'all' ? null : filters.category
    const Icon = category ? CATEGORY_ICONS[category] : Search
    body = (
      <div className="ls-empty lg">
        <span className={`ls-empty-icon ${category ? catClass(category) : 'ls-empty-icon--accent'} lg`} aria-hidden="true">
          <Icon size={36} />
        </span>
        <div className="ls-empty-text">
          <h2>{copy.title}</h2>
          <p>{copy.body}</p>
        </div>
        <ul className="ls-empty-filters" aria-label="Filtros ativos">
          {activeFilters.map((f) => (
            <li key={f.key}>
              <span>{f.chip}</span>
              <button type="button" aria-label={`Tirar o filtro ${f.chip}`} onClick={() => patchFilters(f.clear)}>
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <div className="ls-empty-actions">
          <button type="button" className="ls-btn lg" onClick={() => setFilters(EMPTY_FILTERS)}>
            <FunnelX size={16} aria-hidden="true" />
            Limpar filtros
          </button>
          <button
            type="button"
            className="ls-btn ls-btn--primary"
            onClick={() => setOverlay(category ? { kind: 'add', initialCategory: category } : { kind: 'add' })}
          >
            <Plus size={17} aria-hidden="true" />
            {category ? `Adicionar ${CATEGORY_LABELS[category].one.toLowerCase()}` : 'Adicionar'}
          </button>
        </div>
      </div>
    )
  } else {
    body = (
      <>
        {featured.length > 0 && <Featured items={featured} urls={urls} onOpen={open} />}
        <section className="ls-section" aria-labelledby="ls-all-title">
          <div className="ls-section-head">
            <div className="ls-section-left">
              <h2 id="ls-all-title">Tudo</h2>
              <span className="ls-meta">{plural(shown.length, 'item', 'itens')}</span>
            </div>
            <span className="ls-meta ls-meta--small">{SORT_LABELS[sort].heading}</span>
          </div>
          <ul className="ls-grid" aria-label="Itens da lista">
            {shown.map((item) => (
              <li key={item.id}>
                <ItemCard
                  item={item}
                  url={item.photoPath ? (urls.get(item.photoPath) ?? null) : null}
                  members={members}
                  memberList={memberList}
                  today={today}
                  pendingFeatured={pending.has(`featured:${item.id}`)}
                  onOpen={() => open(item.id)}
                  onMarkDone={() => markDone(item)}
                  onToggleFeatured={() => void toggleFeatured(item)}
                />
              </li>
            ))}
          </ul>
        </section>
      </>
    )
  }

  return (
    <ListContext.Provider value={value}>
      <div className="ls-area">
        <header className="ls-header">
          <div className="ls-title">
            <p className="ls-kicker">
              <Sparkles size={13} aria-hidden="true" />
              <span>{header}</span>
            </p>
            <h1>Nossa lista</h1>
          </div>
          <div className="ls-controls">
            <label className="ls-search lg">
              <Search size={16} aria-hidden="true" />
              <span className="visually-hidden">Buscar na lista</span>
              <input
                ref={searchRef}
                type="search"
                placeholder="Buscar lugar, filme, comida…"
                value={filters.query}
                onChange={(e) => patchFilters({ query: e.target.value })}
              />
              <kbd aria-hidden="true">{isMac() ? '⌘K' : 'Ctrl K'}</kbd>
            </label>
            <button type="button" className="ls-btn ls-btn--primary" onClick={() => setOverlay({ kind: 'add' })}>
              <Plus size={17} aria-hidden="true" />
              Adicionar
            </button>
          </div>
        </header>

        {stale && (
          <p className="ls-notice lg" role="status">
            Não deu pra atualizar. Você está vendo a última versão carregada.
          </p>
        )}
        {notice && (
          <p className="ls-notice ls-notice--error lg" role="alert">
            {notice}
          </p>
        )}

        {visibleCount > 0 && (
          <>
            <div className="ls-chips" role="group" aria-label="Categorias">
              <CategoryChip
                label="Todos"
                count={totals.total}
                icon={<Layers size={15} aria-hidden="true" />}
                active={filters.category === 'all'}
                onClick={() => patchFilters({ category: 'all' })}
              />
              {counts.map(({ category, count }) => {
                const Icon = CATEGORY_ICONS[category]
                return (
                  <CategoryChip
                    key={category}
                    label={CATEGORY_LABELS[category].many}
                    count={count}
                    className={catClass(category)}
                    icon={<Icon size={15} aria-hidden="true" className="ls-cat-icon" />}
                    active={filters.category === category}
                    onClick={() => patchFilters({ category })}
                  />
                )
              })}
            </div>

            <div className="ls-filters">
              <div className="ls-segmented lg" role="group" aria-label="Status">
                {(
                  [
                    ['want', 'Quero fazer'],
                    ['done', 'Já fizemos'],
                    ['all', 'Todos'],
                  ] as const
                ).map(([status, label]) => (
                  <button
                    key={status}
                    type="button"
                    aria-pressed={filters.status === status}
                    onClick={() => patchFilters({ status })}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {filters.status === 'done' && (
                <div className="ls-who">
                  <span className="ls-meta ls-meta--small" aria-hidden="true">
                    Quem
                  </span>
                  <div className="ls-who-options lg" role="group" aria-label="Quem">
                    {memberList.map((m) => (
                      <button
                        key={m.profileId}
                        type="button"
                        className="ls-who-person"
                        aria-label={m.name}
                        title={m.name}
                        aria-pressed={filters.who === m.profileId}
                        onClick={() => patchFilters({ who: filters.who === m.profileId ? 'all' : m.profileId })}
                      >
                        <Avatar member={m} size={22} />
                      </button>
                    ))}
                    <button
                      type="button"
                      className="ls-who-both"
                      aria-label="♥ os dois"
                      aria-pressed={filters.who === 'both'}
                      onClick={() => patchFilters({ who: filters.who === 'both' ? 'all' : 'both' })}
                    >
                      <CoupleMark members={memberList} />
                      <span aria-hidden="true">os dois</span>
                    </button>
                  </div>
                </div>
              )}

              <label className="ls-sort lg">
                <ArrowDownUp size={13} aria-hidden="true" />
                <span className="visually-hidden">Ordenar</span>
                <select value={sort} onChange={(e) => setSort(e.target.value as ListSort)}>
                  {(Object.keys(SORT_LABELS) as ListSort[]).map((s) => (
                    <option key={s} value={s}>
                      {SORT_LABELS[s].option}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} aria-hidden="true" className="ls-sort-chevron" />
              </label>
            </div>
          </>
        )}

        {body}
      </div>

      <ListPanel
        showCategoryProgress={settings.showCategoryProgress}
        showDailySuggestion={settings.showDailySuggestion}
        hidden={hidden}
        onShowDone={() => setFilters({ ...EMPTY_FILTERS, status: 'done' })}
        onShowRecent={() => {
          setFilters(EMPTY_FILTERS)
          setSort('recent')
        }}
        onOpen={open}
        onMarkDone={markDone}
      />

      {overlay?.kind === 'add' && (
        <AddItemModal
          mode="create"
          initialCategory={overlay.initialCategory}
          onClose={() => setOverlay(null)}
          onSaved={() => void afterWrite()}
        />
      )}
      {overlay?.kind === 'edit' && (
        <AddItemModal mode="edit" item={overlay.item} onClose={() => setOverlay(null)} onSaved={() => void afterWrite()} />
      )}
      {overlay?.kind === 'sheet' && (
        <ItemSheet
          itemId={overlay.itemId}
          onClose={() => setOverlay(null)}
          onEdit={(item) => setOverlay({ kind: 'edit', item })}
          onMarkDone={(item) => setOverlay({ kind: 'done', item })}
          onDeleted={() => void afterWrite()}
        />
      )}
      {overlay?.kind === 'done' && (
        <MarkDoneModal item={overlay.item} onClose={() => setOverlay(null)} onDone={() => void afterWrite()} />
      )}
    </ListContext.Provider>
  )
}

interface ActiveFilter {
  key: string
  /** No cabeçalho: "Séries", "já feitas", "só Gabriel". */
  summary: string
  /** No chip do estado vazio: "Séries", "Já fizemos", "Gabriel". */
  chip: string
  clear: Partial<ListFilters>
}

/**
 * Os filtros ativos, na ordem do frame `DXg1A`. "Quem" diz "só {nome}" e não
 * "do {nome}": o artigo por pessoa seria inferir gênero pelo nome (a mesma
 * decisão do T2 no corpo do estado vazio), e "só" é o que o filtro faz (R4).
 */
function describeFilters(filters: ListFilters, names: Record<string, string>): ActiveFilter[] {
  const out: ActiveFilter[] = []
  if (filters.category !== 'all') {
    const label = CATEGORY_LABELS[filters.category].many
    out.push({ key: 'category', summary: label, chip: label, clear: { category: 'all' } })
  }
  if (filters.status === 'done') out.push({ key: 'status', summary: 'já feitas', chip: 'Já fizemos', clear: { status: 'all' } })
  if (filters.status === 'want') out.push({ key: 'status', summary: 'a fazer', chip: 'Quero fazer', clear: { status: 'all' } })
  if (filters.status === 'done' && filters.who !== 'all') {
    const name = filters.who === 'both' ? null : (names[filters.who] ?? 'Alguém')
    out.push({
      key: 'who',
      summary: name ? `só ${name}` : 'os dois',
      chip: name ?? '♥ os dois',
      clear: { who: 'all' },
    })
  }
  const query = filters.query.trim()
  if (query !== '') out.push({ key: 'query', summary: `“${query}”`, chip: `“${query}”`, clear: { query: '' } })
  return out
}

function CategoryChip({
  label,
  count,
  icon,
  active,
  className = '',
  onClick,
}: {
  label: string
  count: number
  icon: ReactNode
  active: boolean
  className?: string
  onClick: () => void
}) {
  return (
    <button type="button" className={`ls-chip ${className} lg`} aria-pressed={active} onClick={onClick}>
      {icon}
      <span className="ls-chip-label">{label}</span>{' '}
      <span className="ls-chip-count">{count}</span>
    </button>
  )
}

/** "Em destaque · {k} com ênfase" (R6): faixa horizontal de `Destaque Card`. */
function Featured({
  items,
  urls,
  onOpen,
}: {
  items: readonly ListItem[]
  urls: ReadonlyMap<string, string>
  onOpen: (id: string) => void
}) {
  const rowRef = useRef<HTMLUListElement>(null)
  const scroll = (direction: 1 | -1) => rowRef.current?.scrollBy?.({ left: direction * 314, behavior: 'smooth' })
  return (
    <section className="ls-section" aria-labelledby="ls-featured-title">
      <div className="ls-section-head">
        <div className="ls-section-left">
          <Sparkles size={16} aria-hidden="true" className="ls-emphasis" />
          <h2 id="ls-featured-title">Em destaque</h2>
          <span className="ls-meta">{items.length} com ênfase</span>
        </div>
        <div className="ls-arrows">
          <button type="button" className="ls-icon-btn ls-icon-btn--glass lg" aria-label="Destaques anteriores" onClick={() => scroll(-1)}>
            <ChevronLeft size={15} aria-hidden="true" />
          </button>
          <button type="button" className="ls-icon-btn ls-icon-btn--glass lg" aria-label="Próximos destaques" onClick={() => scroll(1)}>
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul ref={rowRef} className="ls-featured" aria-label="Em destaque">
        {items.map((item) => (
          <li key={item.id}>
            <button type="button" className="ls-feature lg" onClick={() => onOpen(item.id)}>
              <ItemPhoto category={item.category} url={item.photoPath ? (urls.get(item.photoPath) ?? null) : null} className="ls-feature-photo" />
              <span className="ls-feature-scrim">
                <span className="ls-feature-top">
                  <CategoryTag category={item.category} className="ls-tag--glass" />
                  <span className="ls-feature-badge lg" aria-hidden="true">
                    <Sparkles size={14} />
                  </span>
                </span>
                <span className="ls-feature-info">
                  <span className="ls-feature-name">{item.name}</span>
                  <span className="ls-feature-place">{secondaryLine(item)}</span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** `List Card` (`jjOX2`). Tocar abre o detalhe; o hover traz ênfase e "Marcar como feito". */
function ItemCard({
  item,
  url,
  members,
  memberList,
  today,
  pendingFeatured,
  onOpen,
  onMarkDone,
  onToggleFeatured,
}: {
  item: ListItem
  url: string | null
  members: ReadonlyMap<string, ListMember>
  memberList: readonly ListMember[]
  today: string
  pendingFeatured: boolean
  onOpen: () => void
  onMarkDone: () => void
  onToggleFeatured: () => void
}) {
  const done = item.status === 'done'
  const Icon = CATEGORY_ICONS[item.category]
  const secondary = secondaryLine(item)

  // R7: feito → quem estava + desde quando; a fazer → quem adicionou + desde
  // quando (a data LOCAL do `created_at`, não a de UTC).
  let mark: ReactNode
  let who: string
  if (done && item.doneWith === 'both') {
    mark = <CoupleMark members={memberList} />
    who = `os dois · ${relativeAge(item.doneOn ?? today, today)}`
  } else if (done) {
    mark = <Avatar member={members.get(item.doneSoloBy ?? '') ?? null} />
    who = `${memberName(members, item.doneSoloBy)} · ${relativeAge(item.doneOn ?? today, today)}`
  } else {
    mark = <Avatar member={members.get(item.addedBy ?? '') ?? null} />
    who = `${memberName(members, item.addedBy)} · ${relativeAge(localDateOf(item.createdAt), today)}`
  }

  return (
    <article className={`ls-card ${catClass(item.category)} lg`} aria-label={item.name}>
      <ItemPhoto category={item.category} url={url} className="ls-card-photo">
        {item.featured && (
          <span className="ls-card-emphasis" title="Em destaque">
            <Sparkles size={14} aria-hidden="true" />
            <span className="visually-hidden">Em destaque</span>
          </span>
        )}
        {done && item.doneOn && (
          <span className="ls-card-done">
            <CircleCheck size={12} aria-hidden="true" />
            Feito · {shortDayMonth(item.doneOn)}
          </span>
        )}
        <span className="ls-card-actions">
          <button
            type="button"
            className="ls-card-action lg"
            aria-label={item.featured ? 'Tirar ênfase' : 'Dar ênfase'}
            title={item.featured ? 'Tirar ênfase' : 'Dar ênfase'}
            aria-pressed={item.featured}
            disabled={pendingFeatured}
            onClick={onToggleFeatured}
          >
            <Sparkles size={15} aria-hidden="true" />
          </button>
          {!done && (
            <button type="button" className="ls-card-action lg" aria-label="Marcar como feito" title="Marcar como feito" onClick={onMarkDone}>
              <Check size={15} aria-hidden="true" />
            </button>
          )}
          <span className="ls-card-action ls-card-action--static lg" aria-hidden="true">
            <ArrowUpRight size={15} />
          </span>
        </span>
      </ItemPhoto>
      <div className="ls-card-body">
        <h3 className="ls-card-name">
          <button type="button" className="ls-card-open" onClick={onOpen}>
            {item.name}
          </button>
        </h3>
        <p className="ls-card-meta">
          <Icon size={13} aria-hidden="true" className="ls-cat-icon" />
          <span className="ls-card-cat">{CATEGORY_LABELS[item.category].one}</span>
          {secondary && <span className="ls-card-place">· {secondary}</span>}
        </p>
        <div className="ls-card-foot">
          <span className="ls-card-who">
            {mark}
            <span>{who}</span>
          </span>
          {done ? (
            <CircleCheck size={16} className="ls-card-status ls-card-status--done" aria-label="Feito" />
          ) : (
            <CircleDashed size={16} className="ls-card-status" aria-label="Quero fazer" />
          )}
        </div>
      </div>
    </article>
  )
}
