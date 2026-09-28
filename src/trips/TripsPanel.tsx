// O painel _Pelo mundo, juntos_ (`lB4rw`, o mesmo nas duas vistas): o mapa
// com os pins e os arcos, os destinos dos sonhos, os recordes e o "Há um ano".
//
// Spec: .agent/Tasks/fase-6-viagens.md — R9–R13 (A12)
//       .agent/Tasks/fase-7-mapa.md — R2, R22 (o mapa na engine, _Abrir globo_)
//
// O mapa é o da engine (ADR 0022), plano e sem interação, com os pins em React
// por cima (`TripMap`). Bloco sem resposta some, em vez de mostrar zero.

import type { ReactNode } from 'react'
import { ChevronRight, Hourglass, PlaneTakeoff, Repeat, Route } from 'lucide-react'
import { requestMapFocus } from '../app/mapFocus'
import { navigate } from '../app/router'
import { Avatar } from '../calendar/parts'
import { shortCityName } from '../domain/calendar'
import type { CalCity } from '../domain/calendar'
import type { Camera } from '../domain/map'
import { secondaryLine } from '../domain/list'
import type { ListItem } from '../domain/list'
import {
  daysLabel,
  excerpt,
  formatNumber,
  latestMemory,
  oneYearAgo,
  tripDateRange,
  tripDays,
  tripRecords,
  tripStatus,
  tripTotals,
} from '../domain/tripDerive'
import { weekdayDayMonthLabel, shortMonthYear } from '../lib/date'
import { CategoryTag, ItemPhoto } from '../list/parts'
import '../list/list.css'
import { coverPath, useTrips } from './context'
import { tripPath } from './links'
import { Cover } from './parts'
import { TripMap } from './TripMap'

/** R11: quantos sonhos aparecem. */
const DREAMS = 3

export interface TripsPanelProps {
  /** R11 _Planejar_: abre a _Nova viagem_ com a busca do Destino preenchida. */
  onPlan: (query: string) => void
}

export function TripsPanel({ onPlan }: TripsPanelProps) {
  const { today } = useTrips()
  return (
    <div className="tr-panel-scroll">
      <header className="tr-panel-head">
        <p>{weekdayDayMonthLabel(today)}</p>
        <h2>Pelo mundo, juntos</h2>
      </header>
      <WorldCard />
      <DreamsCard onPlan={onPlan} />
      <RecordsCard />
      <YearAgoCard />
    </div>
  )
}

function Card({ title, action, children, className = '' }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`tr-card lg ${className}`} aria-label={title}>
      <div className="tr-card-head">
        <h3>{title}</h3>
        {action}
      </div>
      <div className="tr-card-body">{children}</div>
    </section>
  )
}

function CardAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="tr-link" onClick={onClick}>
      {label}
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Onde já estivemos (R10)
// ---------------------------------------------------------------------------

type PinKind = 'done' | 'planned'

interface Pin {
  city: CalCity
  kind: PinKind
}

/**
 * Um pin por cidade de destino; a cidade que tem viagem feita E planejada fica
 * verde (já estivemos lá). A casa de quem vê não vira pin de destino — ela já
 * tem o dela, rosa e maior.
 */
function pinsOf(trips: ReturnType<typeof useTrips>['trips'], cities: ReturnType<typeof useTrips>['cities'], today: string, homeId: string): Pin[] {
  const byCity = new Map<string, Pin>()
  for (const t of trips) {
    const city = cities.get(t.cityId)
    if (!city || city.id === homeId) continue
    const kind: PinKind = tripStatus(t, today) === 'done' ? 'done' : 'planned'
    const prev = byCity.get(city.id)
    if (!prev || (prev.kind === 'planned' && kind === 'done')) byCity.set(city.id, { city, kind })
  }
  return [...byCity.values()]
}

/**
 * O mundo inteiro na caixa 2:1 (o `MFVF7`): de quase a Antártida ao norte da
 * Groenlândia, sem folga — o `fitBounds` escolhe o zoom pela largura da caixa.
 */
const WORLD_CAMERA: Camera = {
  kind: 'bounds',
  sw: { lat: -56, lng: -170 },
  ne: { lat: 72, lng: 178 },
  minZoom: -2,
  maxZoom: 2,
  padding: 0,
}

function WorldCard() {
  const { api, trips, cities, home, today } = useTrips()
  const pins = pinsOf(trips, cities, today, home.id)
  const totals = tripTotals(trips, cities, home, today)
  const homeShort = shortCityName(home.name)
  return (
    <Card
      title="Onde já estivemos"
      action={
        <CardAction
          label="Abrir globo"
          onClick={() => {
            requestMapFocus({ kind: 'world' })
            navigate('/')
          }}
        />
      }
    >
      <TripMap
        engine={api.mapEngine}
        camera={WORLD_CAMERA}
        arcs={pins.map((p) => ({ id: p.city.id, from: p.city, to: home, dashed: p.kind === 'planned' }))}
        label={`Mapa: ${pins.length} destinos e a casa (${homeShort})`}
        className="tr-map"
      >
        {(place) => (
          <>
            {pins.map((p) => {
              const style = place(p.city)
              return (
                style && (
                  <span key={p.city.id} className={`tr-pin tr-pin--${p.kind}`} data-pin={p.kind} data-city={p.city.name} style={style} />
                )
              )
            })}
            {(() => {
              const style = place(home)
              return style && <span className="tr-pin tr-pin--home" data-pin="home" data-city={home.name} style={style} />
            })()}
          </>
        )}
      </TripMap>
      <div className="tr-legend">
        <span className="tr-legend-items">
          <span>
            <span className="tr-legend-dot tr-legend-dot--done" aria-hidden="true" />
            feitas
          </span>
          <span>
            <span className="tr-legend-dot tr-legend-dot--planned" aria-hidden="true" />
            planejadas
          </span>
          <span>
            <span className="tr-legend-dot tr-legend-dot--home" aria-hidden="true" />
            casa ({homeShort})
          </span>
        </span>
        <span className="tr-legend-total">
          {formatNumber(totals.countries)} {totals.countries === 1 ? 'país' : 'países'} · {formatNumber(totals.cities)}{' '}
          {totals.cities === 1 ? 'cidade' : 'cidades'}
        </span>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Destinos dos sonhos (R11)
// ---------------------------------------------------------------------------

/** R11: País e Cidade, a fazer, os mais recentes. */
function dreamsOf(items: readonly ListItem[]): ListItem[] {
  return items
    .filter((i) => (i.category === 'pais' || i.category === 'cidade') && i.status === 'want')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, DREAMS)
}

/** O que o _Planejar_ busca: a cidade (item Cidade) ou o país (item País). */
function planQuery(item: ListItem): string {
  const fromPlace = item.category === 'cidade' ? item.place?.city : item.place?.country
  return fromPlace?.trim() || item.name
}

function DreamsCard({ onPlan }: { onPlan: (query: string) => void }) {
  const { listItems, urls } = useTrips()
  const dreams = dreamsOf(listItems)
  if (dreams.length === 0) return null
  return (
    <Card title="Destinos dos sonhos" action={<CardAction label="Ver na lista" onClick={() => navigate('/lista')} />}>
      <ul className="tr-dreams">
        {dreams.map((item) => {
          const second = secondaryLine(item)
          return (
            <li key={item.id} className="tr-dream">
              <ItemPhoto category={item.category} url={(item.photoPath && urls.get(item.photoPath)) || null} className="tr-dream-thumb" />
              <span className="tr-dream-info">
                <span className="tr-dream-name">{item.name}</span>
                <span className="tr-dream-meta">
                  <CategoryTag category={item.category} />
                  {second && <span className="tr-dream-note">{second}</span>}
                </span>
              </span>
              <button
                type="button"
                className="tr-plan lg"
                aria-label={`Planejar ${item.name}`}
                onClick={() => onPlan(planQuery(item))}
              >
                <PlaneTakeoff size={12} aria-hidden="true" />
                Planejar
              </button>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Recordes (R12)
// ---------------------------------------------------------------------------

function RecordsCard() {
  const { trips, cities, home, today } = useTrips()
  const r = tripRecords(trips, cities, home, today)
  const rows: { key: string; icon: ReactNode; tone: string; label: string; value: string; side: string }[] = []
  if (r.longest) {
    rows.push({
      key: 'longest',
      icon: <Hourglass size={17} />,
      tone: 'emphasis',
      label: 'Viagem mais longa',
      value: r.longest.trip.title,
      side: `${daysLabel(r.longest.days)} · ${shortMonthYear(r.longest.trip.startsOn)}`,
    })
  }
  if (r.farthest) {
    rows.push({
      key: 'farthest',
      icon: <Route size={17} />,
      tone: 'accent',
      label: 'Mais distante',
      value: r.farthest.trip.title,
      side: `${formatNumber(Math.round(r.farthest.km))} km de ${shortCityName(home.name)}`,
    })
  }
  if (r.mostRepeated) {
    rows.push({
      key: 'repeated',
      icon: <Repeat size={17} />,
      tone: 'heart',
      label: 'Destino mais repetido',
      value: r.mostRepeated.city?.name ?? '?',
      side: `${r.mostRepeated.count} vezes`,
    })
  }
  if (rows.length === 0) return null
  return (
    <Card title="Recordes">
      <ul className="tr-records">
        {rows.map((row) => (
          <li key={row.key} data-record={row.key}>
            <span className={`tr-record-chip lg tr-tone--${row.tone}`} aria-hidden="true">
              {row.icon}
            </span>
            <span className="tr-record-text">
              <span className="tr-record-label">{row.label}</span>
              <span className="tr-record-value">{row.value}</span>
            </span>
            <span className="tr-record-side">{row.side}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Há um ano (R13)
// ---------------------------------------------------------------------------

function YearAgoCard() {
  const { trips, today, people } = useTrips()
  const trip = oneYearAgo(trips, today)
  if (!trip) return null
  const memory = latestMemory(trip.memories)
  const author = memory ? [people[1], people[2]].find((p) => p.profileId === memory.profileId) : undefined
  return (
    <Card title="Há um ano" action={<CardAction label="Ver viagem" onClick={() => navigate(tripPath(trip.id))} />}>
      <Cover path={coverPath(trip)} className="tr-yearago-photo">
        <span className="tr-yearago-scrim" aria-hidden="true" />
        <span className="tr-yearago-kicker">
          {tripDateRange(trip, { year: true })} · {daysLabel(tripDays(trip))}
        </span>
        <span className="tr-yearago-title">{trip.title}</span>
      </Cover>
      {memory && (
        <blockquote className="tr-quote">
          {author && <Avatar person={author} size={24} />}
          <p>“{excerpt(memory.body)}”</p>
        </blockquote>
      )}
    </Card>
  )
}
