// A tela do Calendário (`D1Zny4`): cabeçalho, visão Mês (ou Ano), o cartão do
// primeiro período, e o slot do painel "Onde a gente está".
//
// Spec: .agent/Tasks/fase-5-calendario.md — R3–R9, R22, R25, seção 7
// ADR:  .agent/Decisions/0015-lista-sem-realtime-reler-ao-voltar.md (estendido ao Calendário)
//
// Leitura: `loadContext` e `loadCalendar` em paralelo; depois, com as ids em
// mãos e a semana do casal (`week_starts_on`) conhecida, `loadCities` e
// `loadKisses` da grade visível, também em paralelo. Enquanto não houver um
// `ok`, a tela mostra esqueleto ou erro — NUNCA o cartão _Primeiro período_,
// que com o projeto pausado faria o casal regravar a história por cima.
//
// O 💋 é a única parte que pode falhar sozinha: o calendário abre sem 💋 e com
// um aviso discreto — nunca um 0 que não foi lido. Trocar de mês relê só os 💋
// da nova grade (seção 8).
//
// Releitura: depois de cada escrita própria (`reload` no contexto) e ao voltar
// à aba. A que falha mantém a tela e avisa. O dia (`today`) é relido a cada
// leitura, como na Lista.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CalendarCheck, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useAddIntent } from '../app/addIntent'
import { clearCalendarFocus, peekCalendarFocus } from '../app/calendarFocus'
import { PanelSkeleton } from '../app/PanelSkeleton'
import type { DataResult } from '../data/result'
import type { SettingsData } from '../data/settings'
import { countDrawn } from '../domain/calendar'
import type { CalCity, CalendarEvent, EventDraft, Run } from '../domain/calendar'
import type { CalendarApi, CalendarData } from './api'
import { CalendarModals } from './CalendarModals'
import { CalendarCityPicker } from './CityPicker'
import { CalendarContext, membersOf, namesOf, peopleOf, withHomes } from './context'
import type { CalendarContextValue, CalendarModal, YearMonth } from './context'
import { FirstPeriodCard } from './FirstPeriodCard'
import type { FirstPeriodCardProps } from './FirstPeriodCard'
import { CalendarPanel } from './CalendarPanel'
import { BareMonthGrid, MonthView } from './MonthView'
import { gridBounds, monthBounds, monthOf, monthTitle, shiftYearMonth, yearKicker } from './view'
import { YearView } from './YearView'
import './calendar.css'

export interface CalendarScreenProps {
  /** O que o Calendário pede ao mundo. Injetado: o teste dirige sem rede. */
  api: CalendarApi
  /**
   * O seletor de cidade (R17) do primeiro período. Padrão: o `CityPicker`
   * real, sobre o contexto; o teste pode trocar por um dublê.
   */
  renderCityPicker?: FirstPeriodCardProps['renderCityPicker']
}

/** O que uma leitura completa devolve (sem os 💋, que têm janela própria). */
interface Snapshot {
  ctx: SettingsData
  cal: CalendarData
  cities: ReadonlyMap<string, CalCity>
  /** O dia em que ESTA leitura foi feita (`api.today()`). */
  today: string
}

/** Os 💋 de uma janela; `counts: null` = a leitura falhou. */
interface Kisses {
  from: string
  to: string
  counts: ReadonlyMap<string, number> | null
}

function causeOf(result: { status: 'unauthenticated' } | { status: 'error'; cause: string }): string {
  return result.status === 'error' ? result.cause : 'sua sessão expirou'
}

function cityIdsOf(ctx: SettingsData, events: readonly CalendarEvent[]): string[] {
  const ids = new Set<string>()
  for (const m of ctx.couple.members) ids.add(m.homeCity.id)
  for (const s of ctx.stays) ids.add(s.cityId)
  for (const e of events) if (e.cityId !== null) ids.add(e.cityId)
  return [...ids]
}

async function readAll(
  api: CalendarApi,
  today: string,
  month: YearMonth,
): Promise<DataResult<{ snap: Snapshot; kisses: Kisses }>> {
  const [ctx, cal] = await Promise.all([api.loadContext(), api.loadCalendar()])
  if (ctx.status !== 'ok') return ctx.status === 'error' ? ctx : { status: 'unauthenticated' }
  if (cal.status !== 'ok') return cal.status === 'error' ? cal : { status: 'unauthenticated' }

  const grid = gridBounds(month, ctx.rows.coupleSettings.weekStartsOn)
  const [cities, kisses] = await Promise.all([
    api.loadCities(cityIdsOf(ctx.rows, cal.rows.events)),
    api.loadKisses(grid.from, grid.to),
  ])
  if (cities.status !== 'ok') return cities.status === 'error' ? cities : { status: 'unauthenticated' }
  return {
    status: 'ok',
    rows: {
      snap: { ctx: ctx.rows, cal: cal.rows, cities: withHomes(ctx.rows, cities.rows), today },
      kisses: { ...grid, counts: kisses.status === 'ok' ? kisses.rows : null },
    },
  }
}

export function CalendarScreen({ api, renderCityPicker = defaultCityPicker }: CalendarScreenProps) {
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [kisses, setKisses] = useState<Kisses | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [avatars, setAvatars] = useState<Readonly<Record<string, string | null>>>({})
  // Fase 6, R32: o _Ver no calendário_ das Viagens pediu um mês. Lido ao
  // montar (puro), apagado no efeito abaixo.
  const [focus] = useState(peekCalendarFocus)
  const [visibleMonth, setVisibleMonthState] = useState<YearMonth>(() => focus ?? monthOf(api.today()))
  const monthRef = useRef(visibleMonth)
  const generation = useRef(0)
  const kissGeneration = useRef(0)
  const hasSnap = useRef(false)

  useEffect(() => clearCalendarFocus(), [])

  const setVisibleMonth = useCallback((month: YearMonth) => {
    monthRef.current = month
    setVisibleMonthState(month)
  }, [])

  const reload = useCallback(async () => {
    const mine = ++generation.current
    const kissMine = ++kissGeneration.current
    const result = await readAll(api, api.today(), monthRef.current)
    if (mine !== generation.current) return
    if (result.status !== 'ok') {
      if (hasSnap.current) setStale(true)
      else setLoadError(causeOf(result))
      return
    }
    hasSnap.current = true
    setSnap(result.rows.snap)
    if (kissMine === kissGeneration.current) setKisses(result.rows.kisses)
    setLoadError(null)
    setStale(false)

    const { ctx } = result.rows.snap
    const pairs = await Promise.all(
      ctx.couple.members.map(async (m) => [m.profileId, await api.avatarUrl(m.avatarPath)] as const),
    )
    if (mine !== generation.current) return
    setAvatars(Object.fromEntries(pairs))
  }, [api])

  useEffect(() => {
    const gen = generation
    // `reload` só chama setState depois do `await` da leitura.
    // eslint-disable-next-line react/set-state-in-effect
    void reload()
    // Desmontou: a leitura em voo não escreve mais em nada.
    return () => {
      gen.current++
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

  // Trocou de mês (ou de início de semana): só os 💋 da grade nova.
  const weekStartsOn = snap?.ctx.coupleSettings.weekStartsOn
  useEffect(() => {
    if (weekStartsOn === undefined) return
    const grid = gridBounds(visibleMonth, weekStartsOn)
    if (kisses && kisses.from === grid.from && kisses.to === grid.to) return
    const mine = ++kissGeneration.current
    void api.loadKisses(grid.from, grid.to).then((result) => {
      if (mine !== kissGeneration.current) return
      setKisses({ ...grid, counts: result.status === 'ok' ? result.rows : null })
    })
  }, [api, visibleMonth, weekStartsOn, kisses])

  function retry() {
    setLoadError(null)
    void reload()
  }

  if (!snap) {
    return (
      <div className="cal">
        <div className="cal-area">
          <header className="cal-header">
            <div className="cal-title">
              <h1>Calendário</h1>
            </div>
          </header>
          {loadError !== null ? (
            <div className="cal-load-error lg" role="alert">
              <p>Não deu pra carregar o calendário: {loadError}</p>
              <button type="button" className="cal-btn lg" onClick={retry}>
                Tentar de novo
              </button>
            </div>
          ) : (
            <Skeleton />
          )}
        </div>
        <EmptyPanel busy={loadError === null} />
      </div>
    )
  }

  // Os 💋 só valem para a grade que está na tela; em voo = nenhum 💋.
  const grid = gridBounds(visibleMonth, snap.ctx.coupleSettings.weekStartsOn)
  const kissesNow = kisses && kisses.from === grid.from && kisses.to === grid.to ? kisses : null

  return (
    <Loaded
      api={api}
      snap={snap}
      avatars={avatars}
      kisses={kissesNow?.counts ?? null}
      kissFailed={kissesNow !== null && kissesNow.counts === null}
      stale={stale}
      reload={reload}
      visibleMonth={visibleMonth}
      setVisibleMonth={setVisibleMonth}
      renderCityPicker={renderCityPicker}
      initialView={focus ? 'month' : undefined}
    />
  )
}

const defaultCityPicker: NonNullable<FirstPeriodCardProps['renderCityPicker']> = (props) => <CalendarCityPicker {...props} />

/**
 * O painel "Onde a gente está" antes do `ok` (ou sem ele): no mesmo lugar e do
 * mesmo tamanho, para a grade não se mexer quando os dados chegam.
 */
function EmptyPanel({ busy = false }: { busy?: boolean }) {
  return (
    <aside className="cal-panel lg" aria-label="Onde a gente está" aria-busy={busy || undefined}>
      <div className="cal-panel-scroll">
        <PanelSkeleton busy={busy} cards={[132, 220, 180]} />
      </div>
    </aside>
  )
}

function Skeleton() {
  return (
    <div className="cal-skeleton" aria-busy="true">
      <span className="visually-hidden">Carregando o calendário…</span>
      <div className="cal-skeleton-grid" aria-hidden="true">
        {Array.from({ length: 35 }, (_, i) => (
          <span key={i} />
        ))}
      </div>
    </div>
  )
}

function Loaded({
  api,
  snap,
  avatars,
  kisses,
  kissFailed,
  stale,
  reload,
  visibleMonth,
  setVisibleMonth,
  renderCityPicker,
  initialView,
}: {
  api: CalendarApi
  snap: Snapshot
  avatars: Readonly<Record<string, string | null>>
  kisses: ReadonlyMap<string, number> | null
  kissFailed: boolean
  stale: boolean
  reload: () => Promise<void>
  visibleMonth: YearMonth
  setVisibleMonth: (month: YearMonth) => void
  renderCityPicker?: FirstPeriodCardProps['renderCityPicker']
  /** R32 (Fase 6): o pedido de foco abre na visão Mês, seja qual for a preferência. */
  initialView?: 'month' | 'year'
}) {
  const { ctx, cal, cities, today } = snap
  const settings = ctx.coupleSettings
  // R3: começa na preferência do casal e vale só até sair da tela.
  const [view, setView] = useState<'month' | 'year'>(initialView ?? settings.calendarDefaultView)
  const [selectedDay, setSelectedDay] = useState(today)
  const [modal, setModal] = useState<CalendarModal | null>(null)
  // R1: o _Adicionar_ da barra pediu um evento — abre com os dados já lidos.
  useAddIntent('new-event', () => setModal({ kind: 'newEvent', day: today }))

  const people = useMemo(() => peopleOf(ctx, cities, avatars), [ctx, cities, avatars])
  const me = people && (people[1].profileId === ctx.me.profileId ? people[1] : people[2].profileId === ctx.me.profileId ? people[2] : null)

  const shiftMonth = useCallback((delta: number) => setVisibleMonth(shiftYearMonth(visibleMonth, delta)), [visibleMonth, setVisibleMonth])
  const goToToday = useCallback(() => {
    setVisibleMonth(monthOf(today))
    setSelectedDay(today)
  }, [today, setVisibleMonth])

  const value = useMemo<CalendarContextValue | null>(() => {
    if (!people || !me) return null
    return {
      api,
      coupleId: ctx.couple.id,
      me,
      people,
      members: membersOf(people),
      names: namesOf(people),
      stays: ctx.stays,
      events: cal.events,
      listItems: cal.listItems,
      cities,
      settings,
      startedOn: ctx.couple.startedOn,
      today,
      kisses,
      selectedDay,
      selectDay: setSelectedDay,
      visibleMonth,
      setVisibleMonth,
      shiftMonth,
      goToToday,
      view,
      setView,
      reload,
      modal,
      openNewEvent: (day?: string, preset?: Partial<EventDraft>) =>
        setModal({ kind: 'newEvent', day: day ?? selectedDay, ...(preset ? { preset } : {}) }),
      openEditEvent: (event: CalendarEvent) => setModal({ kind: 'editEvent', event }),
      openNewPeriod: (day?: string) => setModal({ kind: 'newPeriod', day: day ?? selectedDay }),
      openEditPeriod: (run: Run) => setModal({ kind: 'editPeriod', run }),
      closeModal: () => setModal(null),
    }
  }, [api, ctx, cal, cities, settings, today, kisses, selectedDay, visibleMonth, setVisibleMonth, shiftMonth, goToToday, view, reload, modal, people, me])

  const notices = (
    <>
      {stale && (
        <p className="cal-notice lg" role="status">
          Não deu pra atualizar. Você está vendo a última versão carregada.
        </p>
      )}
      {kissFailed && (
        <p className="cal-notice cal-notice--quiet" role="status">
          Os 💋 deste mês não carregaram
        </p>
      )}
    </>
  )

  if (!people) {
    // Um integrante só (a outra pessoa saiu): sem faixa, sem avatar, sem 💋,
    // e nunca o primeiro período (seção 7).
    return (
      <div className="cal">
        <div className="cal-area">
          <Header visibleMonth={visibleMonth} kicker={null} onShift={(d) => setVisibleMonth(shiftYearMonth(visibleMonth, d))}>
            <button type="button" className="cal-btn lg" onClick={goToToday}>
              <CalendarCheck size={16} aria-hidden="true" />
              Hoje
            </button>
          </Header>
          {notices}
          <p className="cal-notice lg" role="status">
            O calendário começa quando as duas pessoas estiverem no espaço. Em Configurações, na aba Casal, você convida a outra pessoa ou cria o perfil dela para já ir preenchendo.
          </p>
          <BareMonthGrid
            month={visibleMonth}
            weekStartsOn={settings.weekStartsOn}
            showAdjacentDays={settings.showAdjacentDays}
            today={today}
          />
        </div>
        <EmptyPanel />
      </div>
    )
  }

  if (!value) {
    // Saiu do casal em outro aparelho: nada aqui é mais dele.
    return (
      <div className="cal">
        <div className="cal-area">
          <div className="cal-load-error lg" role="alert">
            <p>Este espaço mudou. Recarregue a página.</p>
          </div>
        </div>
        <EmptyPanel />
      </div>
    )
  }

  const month = monthBounds(visibleMonth)
  const counts = countDrawn(month.from, month.to, value.stays, value.members)
  const kicker =
    view === 'month'
      ? `${counts.home1 + counts.home2 + counts.away} dias juntos · ${counts.apart} separados`
      : yearKicker(visibleMonth.year, today, value.stays, value.members)

  return (
    <CalendarContext.Provider value={value}>
      <div className="cal">
        <div className="cal-area">
          <Header
            visibleMonth={visibleMonth}
            title={view === 'year' ? String(visibleMonth.year) : undefined}
            kicker={kicker}
            onShift={(d) => shiftMonth(view === 'year' ? d * 12 : d)}
          >
            <div className="cal-segmented lg" role="group" aria-label="Visão">
              <button type="button" aria-pressed={view === 'month'} onClick={() => setView('month')}>
                <CalendarDays size={14} aria-hidden="true" />
                Mês
              </button>
              <button type="button" aria-pressed={view === 'year'} onClick={() => setView('year')}>
                <CalendarRange size={14} aria-hidden="true" />
                Ano
              </button>
            </div>
            <button type="button" className="cal-btn lg" onClick={goToToday}>
              <CalendarCheck size={16} aria-hidden="true" />
              Hoje
            </button>
            <button type="button" className="cal-btn cal-btn--primary" onClick={() => value.openNewEvent()}>
              <Plus size={17} aria-hidden="true" />
              Novo evento
            </button>
          </Header>

          {notices}

          {view === 'month' ? <MonthView /> : <YearView />}
        </div>

        <aside className="cal-panel lg" aria-label="Onde a gente está">
          <div className="cal-panel-scroll">
            <CalendarPanel
              first={value.stays.length === 0 ? <FirstPeriodCard renderCityPicker={renderCityPicker} /> : undefined}
            />
          </div>
        </aside>
      </div>

      {/* O modal pedido em `value.modal` (período / evento, T10/T11). */}
      <CalendarModals />
    </CalendarContext.Provider>
  )
}

function Header({
  visibleMonth,
  title,
  kicker,
  onShift,
  children,
}: {
  visibleMonth: YearMonth
  title?: string
  kicker: string | null
  onShift: (delta: number) => void
  children: ReactNode
}) {
  return (
    <header className="cal-header">
      <div className="cal-title">
        {kicker !== null && (
          <p className="cal-kicker">
            <span className="cal-kicker-dot" aria-hidden="true" />
            {kicker}
          </p>
        )}
        <div className="cal-title-row">
          <h1>{title ?? monthTitle(visibleMonth)}</h1>
          <button type="button" className="cal-round-btn lg" aria-label="Anterior" onClick={() => onShift(-1)}>
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button type="button" className="cal-round-btn lg" aria-label="Próximo" onClick={() => onShift(1)}>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="cal-controls">{children}</div>
    </header>
  )
}
