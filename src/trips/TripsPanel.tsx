// O painel _Pelo mundo, juntos_ (`lB4rw`, o mesmo nas duas vistas): o mapa
// com os pins e os arcos, os destinos dos sonhos, os recordes e o "Há um ano".
//
// Spec: .agent/Tasks/fase-6-viagens.md — R9–R13 (A12) · ADR 0021 (o mapa)
//
// O mapa é a imagem do `.pen` com pins por projeção equiretangular
// (`project`, em fração da caixa → porcentagem no CSS). _Abrir globo_ fica
// para a Fase 7 (seção 14). Bloco sem resposta some, em vez de mostrar zero.

import type { ReactNode } from 'react'
import { ChevronRight, Hourglass, PlaneTakeoff, Repeat, Route } from 'lucide-react'
import { navigate } from '../app/router'
import { Avatar } from '../calendar/parts'
import { shortCityName } from '../domain/calendar'
import type { CalCity } from '../domain/calendar'
import { secondaryLine } from '../domain/list'
import type { ListItem } from '../domain/list'
import {
  daysLabel,
  excerpt,
  formatNumber,
  latestMemory,
  oneYearAgo,
  project,
  tripDateRange,
  tripDays,
  tripRecords,
  tripStatus,
  tripTotals,
} from '../domain/tripDerive'
import { weekdayDayMonthLabel, shortMonthYear } from '../lib/date'
import { CategoryTag, ItemPhoto } from '../list/parts'
import '../list/list.css'
import worldMap from './assets/world-map.jpg'
import { coverPath, useTrips } from './context'
import { tripPath } from './links'
import { Cover } from './parts'

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
    <section className={`tr-card ${className}`} aria-label={title}>
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

/** Posição em porcentagem da caixa (a imagem é o mundo inteiro, ADR 0021). */
const pct = (lat: number, lng: number) => {
  const p = project(lat, lng)
  return { left: `${(p.x * 100).toFixed(3)}%`, top: `${(p.y * 100).toFixed(3)}%` }
}

/** O arco destino → casa, num SVG de 1000×500 (a proporção do mapa), bojo para o norte. */
function arcPath(from: CalCity, to: CalCity): string {
  const a = project(from.lat, from.lng)
  const b = project(to.lat, to.lng)
  const [x1, y1, x2, y2] = [a.x * 1000, a.y * 500, b.x * 1000, b.y * 500]
  const dist = Math.hypot(x2 - x1, y2 - y1)
  const cx = (x1 + x2) / 2
  const cy = (y1 + y2) / 2 - dist * 0.28
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

function WorldCard() {
  const { trips, cities, home, today } = useTrips()
  const pins = pinsOf(trips, cities, today, home.id)
  const totals = tripTotals(trips, cities, home, today)
  const homeShort = shortCityName(home.name)
  return (
    <Card title="Onde já estivemos">
      <div className="tr-map" role="img" aria-label={`Mapa: ${pins.length} destinos e a casa (${homeShort})`}>
        <img src={worldMap} alt="" className="tr-map-img" />
        <svg className="tr-map-arcs" viewBox="0 0 1000 500" preserveAspectRatio="none" aria-hidden="true">
          {pins.map((p) => (
            <path
              key={p.city.id}
              d={arcPath(p.city, home)}
              className={`tr-arc tr-arc--${p.kind}`}
              data-arc={p.kind}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        {pins.map((p) => (
          <span
            key={p.city.id}
            className={`tr-pin tr-pin--${p.kind}`}
            data-pin={p.kind}
            data-city={p.city.name}
            style={pct(p.city.lat, p.city.lng)}
          />
        ))}
        <span className="tr-pin tr-pin--home" data-pin="home" data-city={home.name} style={pct(home.lat, home.lng)} />
      </div>
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
                className="tr-plan"
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
            <span className={`tr-record-chip tr-tone--${row.tone}`} aria-hidden="true">
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
