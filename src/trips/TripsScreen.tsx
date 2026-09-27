// A tela das Viagens: o cabeçalho comum, a Grade (`OmXwr`) ou a Linha do tempo
// (`NAPHW`), o painel _Pelo mundo, juntos_ (`lB4rw`) e a _Nova viagem_
// (`MQHBd`). Lê tudo do `TripsContext` — a `TripsRoute` já tratou carregando,
// erro (A17) e ausência.
//
// Spec: .agent/Tasks/fase-6-viagens.md — R3–R13, R24, R31 (A10–A12)
//
// A troca Grade/Linha do tempo é estado da tela (começa em Grade), não
// caminho (R1). Toda copy com dado sai de `tripDerive.ts`; aqui só se monta.
// As URLs das capas visíveis são pedidas num lote só (seção 8).

import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Building2,
  CalendarDays,
  CalendarHeart,
  CalendarRange,
  CircleCheck,
  CircleDashed,
  Clock3,
  GitCommitVertical,
  Globe,
  Images,
  LayoutGrid,
  MapPin,
  PenLine,
  Plane,
  PlaneTakeoff,
  Plus,
  Route,
} from 'lucide-react'
import { CouplePair } from '../calendar/parts'
import { shortCityName } from '../domain/calendar'
import {
  applyGridFilter,
  countryLabel,
  daysLabel,
  daysUntil,
  departuresLine,
  doneTrips,
  formatNumber,
  gridFilterOptions,
  heroTrip,
  memoriesLabel,
  ongoingDay,
  originOf,
  photosLabel,
  plannedAfterHero,
  plannedKicker,
  readiness,
  routeLabel,
  timeline,
  tripDateRange,
  tripDays,
  tripRating,
  tripTotals,
  tripsKicker,
  tripsLabel,
} from '../domain/tripDerive'
import type { GridFilter, TimelineEntry } from '../domain/tripDerive'
import type { Trip } from '../domain/trips'
import { coverPath, usePhotoUrls, useTrips } from './context'
import { Cover, HeartsLine, TripLink } from './parts'
import { TripModal } from './TripModal'
import { TripsPanel } from './TripsPanel'
import './trips.css'

type View = 'grid' | 'timeline'

/** O modal aberto: só a _Nova viagem_ nesta tela (a edição é do detalhe). */
type ModalState = { initialQuery?: string } | null

export function TripsScreen() {
  const { trips, today, listItems } = useTrips()
  const [view, setView] = useState<View>('grid')
  const [modal, setModal] = useState<ModalState>(null)

  // Seção 8: as capas de tudo que pode aparecer nas duas vistas e no painel,
  // num lote. (As duas vistas mostram as mesmas viagens; o painel, a do "Há
  // um ano" e as fotos dos sonhos.)
  const paths = useMemo(
    () => [...trips.map(coverPath), ...listItems.filter((i) => i.photoPath && (i.category === 'pais' || i.category === 'cidade')).map((i) => i.photoPath)],
    [trips, listItems],
  )
  usePhotoUrls(paths)

  const openNew = (initialQuery?: string) => setModal(initialQuery ? { initialQuery } : {})

  return (
    <div className="tr-screen">
      <div className="tr-area">
        <header className="tr-header">
          <div className="tr-title">
            <p className="tr-kicker">
              <Plane size={13} aria-hidden="true" />
              {tripsKicker(trips)}
            </p>
            <h1>Nossas viagens</h1>
          </div>
          <div className="tr-controls">
            <div className="tr-segmented" role="group" aria-label="Visão">
              <button type="button" aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
                <LayoutGrid size={14} aria-hidden="true" />
                Grade
              </button>
              <button type="button" aria-pressed={view === 'timeline'} onClick={() => setView('timeline')}>
                <GitCommitVertical size={14} aria-hidden="true" />
                Linha do tempo
              </button>
            </div>
            <button type="button" className="tr-btn tr-btn--primary" onClick={() => openNew()}>
              <Plus size={17} aria-hidden="true" />
              Nova viagem
            </button>
          </div>
        </header>

        <Stats />

        {view === 'grid' ? <GridView onNew={() => openNew()} today={today} /> : <TimelineView />}

        <div className="tr-fade" aria-hidden="true" />
      </div>

      <aside className="tr-panel" aria-label="Pelo mundo, juntos">
        <TripsPanel onPlan={(query) => openNew(query)} />
      </aside>

      {modal && <TripModal mode="new" initialQuery={modal.initialQuery} onClose={() => setModal(null)} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Os cinco números (R4, `Stat Metric` JHJxK)
// ---------------------------------------------------------------------------

function Stats() {
  const { trips, cities, home, today } = useTrips()
  const t = tripTotals(trips, cities, home, today)
  return (
    <ul className="tr-stats" aria-label="Números das viagens feitas">
      <Stat icon={<Plane size={16} />} tone="emphasis" value={formatNumber(t.trips)} label="viagens feitas" />
      <Stat icon={<Globe size={16} />} tone="sky" value={formatNumber(t.countries)} label={t.countries === 1 ? 'país' : 'países'} />
      <Stat icon={<Building2 size={16} />} tone="terra" value={formatNumber(t.cities)} label={t.cities === 1 ? 'cidade' : 'cidades'} />
      <Stat icon={<Route size={16} />} tone="accent" value={formatNumber(Math.round(t.km))} unit="km" label="viajados juntos" />
      <Stat icon={<CalendarHeart size={16} />} tone="heart" value={formatNumber(t.days)} unit={t.days === 1 ? 'dia' : 'dias'} label="viajando juntos" />
    </ul>
  )
}

function Stat({ icon, tone, value, unit, label }: { icon: ReactNode; tone: string; value: string; unit?: string; label: string }) {
  return (
    <li className="tr-stat">
      <span className={`tr-stat-icon tr-tone--${tone}`} aria-hidden="true">
        {icon}
      </span>
      <span className="tr-stat-value">
        <strong>{value}</strong>
        {unit && <span>{unit}</span>}
      </span>
      <span className="tr-stat-label">{label}</span>
    </li>
  )
}

// ---------------------------------------------------------------------------
// Grade (OmXwr)
// ---------------------------------------------------------------------------

function GridView({ onNew, today }: { onNew: () => void; today: string }) {
  const { trips, cities } = useTrips()
  const hero = heroTrip(trips, today)
  const planned = plannedAfterHero(trips, today)
  const done = doneTrips(trips, today)
  const options = gridFilterOptions(done, cities)
  const [filterId, setFilterId] = useState('all')
  // Um filtro que deixou de existir (a última viagem do ano foi apagada) volta a _Todas_.
  const active = options.find((o) => o.id === filterId) ?? options[0]
  const filter: GridFilter = active?.filter ?? { kind: 'all' }
  const shown = applyGridFilter(done, filter, cities)
  const years = options.filter((o) => o.filter.kind === 'all' || o.filter.kind === 'year')
  const where = options.filter((o) => o.filter.kind === 'br' || o.filter.kind === 'abroad')

  return (
    <>
      {hero ? <Hero trip={hero} /> : <EmptyHero onNew={onNew} />}

      {planned.length > 0 && (
        <section className="tr-section" aria-labelledby="tr-planned">
          <div className="tr-section-head">
            <h2 id="tr-planned">Planejadas</h2>
            <span className="tr-section-meta">{planned.length} mais pra frente</span>
          </div>
          <ul className={`tr-planned ${planned.length > 2 ? 'tr-planned--scroll' : ''}`}>
            {planned.map((t) => (
              <li key={t.id}>
                <PlannedCard trip={t} today={today} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <section className="tr-section tr-section--done" aria-labelledby="tr-done">
          <div className="tr-section-head">
            <div className="tr-section-left">
              <h2 id="tr-done">Já fizemos</h2>
              <span className="tr-section-meta">{tripsLabel(done.length)}</span>
            </div>
            <div className="tr-filters" role="group" aria-label="Filtrar viagens feitas">
              {[years, where].map(
                (group, g) =>
                  group.length > 0 && (
                    <div key={g} className="tr-chips">
                      {group.map((o) => {
                        const Icon =
                          o.filter.kind === 'all' ? CalendarDays : o.filter.kind === 'year' ? CalendarRange : o.filter.kind === 'br' ? MapPin : Globe
                        const small = o.filter.kind === 'br' || o.filter.kind === 'abroad'
                        return (
                          <button
                            key={o.id}
                            type="button"
                            className="tr-chip"
                            aria-pressed={o.id === active?.id}
                            onClick={() => setFilterId(o.id)}
                          >
                            <Icon size={small ? 12 : 14} aria-hidden="true" />
                            {o.label}
                          </button>
                        )
                      })}
                    </div>
                  ),
              )}
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="tr-empty">Nenhuma viagem nesse filtro.</p>
          ) : (
            <ul className="tr-done">
              {shown.map((t) => (
                <li key={t.id}>
                  <DoneCard trip={t} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}

/** R5: a em andamento, senão a próxima planejada. */
function Hero({ trip }: { trip: Trip }) {
  const { today, cities, me, members, names, people } = useTrips()
  const dest = cities.get(trip.cityId)
  const on = ongoingDay(trip, today)
  const ready = readiness(trip)
  const until = daysUntil(trip, today)
  const origin = originOf(trip, me.profileId, me.homeCity.name)
  return (
    <TripLink id={trip.id} className="tr-hero" label={`${on ? 'Viajando agora' : 'Próxima viagem'}: ${trip.title}`}>
      <Cover path={coverPath(trip)} className="tr-hero-cover" />
      <span className="tr-hero-scrim" aria-hidden="true" />
      <div className="tr-hero-info">
        <span className="tr-hero-kicker">
          <PlaneTakeoff size={13} aria-hidden="true" />
          {on ? `Viajando agora · dia ${on.k} de ${on.n}` : 'Próxima viagem'}
        </span>
        <div className="tr-hero-bottom">
          <h2 className="tr-hero-title">{trip.title}</h2>
          <div className="tr-hero-meta">
            <span>
              <CalendarDays size={14} aria-hidden="true" />
              {tripDateRange(trip, { year: true })}
            </span>
            <span>
              <Clock3 size={14} aria-hidden="true" />
              {daysLabel(tripDays(trip))}
            </span>
            <span>
              <Plane size={14} aria-hidden="true" />
              {routeLabel(origin, dest ? shortCityName(dest.name) : '?')}
            </span>
          </div>
          <div className="tr-hero-couple">
            <CouplePair people={[people[1], people[2]]} together />
            <span>{departuresLine(trip, members, names, cities)}</span>
          </div>
        </div>
      </div>
      <div className="tr-prep">
        <div className="tr-prep-top">
          {!on ? (
            <span className="tr-prep-count">
              <span>em</span>
              <strong>{until}</strong>
              <span>{until === 1 ? 'dia' : 'dias'}</span>
            </span>
          ) : (
            <span />
          )}
          <span className="tr-prep-ready">{ready.readyCount} de 3 prontos</span>
        </div>
        <span className="tr-prep-track" aria-hidden="true">
          <span style={{ width: `${(ready.readyCount / 3) * 100}%` }} />
        </span>
        <ul className="tr-prep-lines">
          {ready.lines.map((l) => (
            <li key={l.key} className={l.ready ? 'is-ready' : ''}>
              {l.ready ? (
                <CircleCheck size={16} aria-label="pronto" />
              ) : (
                <CircleDashed size={16} aria-label="falta" />
              )}
              <span className="tr-prep-label">{l.label}</span>
              {l.detail && <span className="tr-prep-detail">{l.detail}</span>}
            </li>
          ))}
        </ul>
      </div>
    </TripLink>
  )
}

/** R5 sem viagem futura nem em andamento. */
function EmptyHero({ onNew }: { onNew: () => void }) {
  return (
    <section className="tr-hero tr-hero--empty" aria-label="Próxima viagem">
      <span className="tr-hero-scrim" aria-hidden="true" />
      <div className="tr-hero-info">
        <span className="tr-hero-kicker">
          <PlaneTakeoff size={13} aria-hidden="true" />
          Próxima viagem
        </span>
        <div className="tr-hero-bottom">
          <h2 className="tr-hero-title">Para onde vai a próxima?</h2>
          <div>
            <button type="button" className="tr-btn tr-btn--primary" onClick={onNew}>
              <Plus size={17} aria-hidden="true" />
              Nova viagem
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

/** R6, `Trip Card Planned` (PwXcG). */
function PlannedCard({ trip, today }: { trip: Trip; today: string }) {
  const until = daysUntil(trip, today)
  return (
    <TripLink id={trip.id} className="tr-pcard">
      <Cover path={coverPath(trip)} className="tr-pcard-cover" />
      <span className="tr-pcard-body">
        <span className="tr-pcard-kicker">{plannedKicker(trip)}</span>
        <span className="tr-pcard-title">{trip.title}</span>
        <span className="tr-pcard-dates">
          {tripDateRange(trip, { year: true })} · {daysLabel(tripDays(trip))}
        </span>
      </span>
      <span className="tr-countdown">
        <span>em</span>
        <strong>{until}</strong>
        <span>{until === 1 ? 'dia' : 'dias'}</span>
      </span>
    </TripLink>
  )
}

/** R7, `Trip Card` (OHmBS). */
function DoneCard({ trip }: { trip: Trip }) {
  const { cities, members, names } = useTrips()
  const dest = cities.get(trip.cityId)
  return (
    <TripLink id={trip.id} className="tr-dcard">
      <Cover path={coverPath(trip)} className="tr-dcard-cover">
        {dest && (
          <span className="tr-badge">
            <MapPin size={11} aria-hidden="true" />
            {countryLabel(dest.countryCode)}
          </span>
        )}
      </Cover>
      <span className="tr-dcard-body">
        <span className="tr-dcard-title">{trip.title}</span>
        <span className="tr-dcard-dates">
          {tripDateRange(trip, { year: true })} · {daysLabel(tripDays(trip))}
        </span>
        <span className="tr-dcard-foot">
          <span title={photosLabel(trip.photos.length)}>
            <Images size={13} aria-hidden="true" />
            <span className="visually-hidden">{photosLabel(trip.photos.length)}</span>
            <span aria-hidden="true">{trip.photos.length}</span>
          </span>
          <span>
            <PenLine size={13} aria-hidden="true" />
            {memoriesLabel(trip.memories.length)}
          </span>
          <HeartsLine rating={tripRating(trip.memories, members, names)} />
        </span>
      </span>
    </TripLink>
  )
}

// ---------------------------------------------------------------------------
// Linha do tempo (NAPHW, R8)
// ---------------------------------------------------------------------------

function TimelineView() {
  const { trips, today } = useTrips()
  const tl = timeline(trips, today)
  const future = tl.entries.slice(0, tl.todayIndex)
  const past = tl.entries.slice(tl.todayIndex)
  return (
    <section className="tr-tl" aria-label="Linha do tempo">
      {future.length > 0 && (
        <ol className="tr-tl-group tr-tl-group--future">
          {future.map((e) => (
            <TimelineRow key={e.trip.id} entry={e} />
          ))}
        </ol>
      )}
      <div className="tr-tl-past">
        <p className="tr-tl-today">
          <span>{tl.todayLabel}</span>
        </p>
        {past.length > 0 && (
          <ol className="tr-tl-group">
            {past.map((e) => (
              <TimelineRow key={e.trip.id} entry={e} />
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const { today, cities, me, members, names } = useTrips()
  const { trip, status, isHero } = entry
  const done = status === 'done'
  const on = ongoingDay(trip, today)
  const until = daysUntil(trip, today)
  const dest = cities.get(trip.cityId)
  const extra = trip.note?.trim() || routeLabel(originOf(trip, me.profileId, me.homeCity.name), dest ? shortCityName(dest.name) : '?')
  const kicker = done ? 'Já fomos' : on ? `Viajando agora · dia ${on.k} de ${on.n}` : isHero ? 'Próxima viagem' : 'Planejada'
  const tone = done ? 'is-past' : isHero ? 'is-hero' : 'is-future'
  return (
    <li className={`tr-tl-row ${tone}`} data-trip={trip.id}>
      <span className="tr-tl-date" aria-hidden="true">
        <span className="tr-tl-month">{entry.month}</span>
        <span className="tr-tl-year">{entry.year}</span>
      </span>
      <span className="tr-tl-dot" aria-hidden="true" />
      <TripLink id={trip.id} className="tr-tl-card">
        <Cover path={coverPath(trip)} className="tr-tl-cover" />
        <span className="tr-tl-text">
          <span className="tr-tl-kicker">{kicker}</span>
          <span className="tr-tl-title">{trip.title}</span>
          <span className="tr-tl-line">
            {tripDateRange(trip, { year: false })} · {daysLabel(tripDays(trip))}
            {!done && ` · ${extra}`}
          </span>
        </span>
        <span className="tr-tl-right">
          {done ? (
            <>
              <HeartsLine rating={tripRating(trip.memories, members, names)} />
              <span className="tr-tl-sub">
                {photosLabel(trip.photos.length)} · {memoriesLabel(trip.memories.length)}
              </span>
            </>
          ) : (
            <>
              {!on && <span className="tr-tl-until">em {daysLabel(until)}</span>}
              {isHero && <span className="tr-tl-sub">{readiness(trip).readyCount} de 3 prontos</span>}
            </>
          )}
        </span>
      </TripLink>
    </li>
  )
}
