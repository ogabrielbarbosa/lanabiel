// Os blocos do detalhe que não são roteiro nem planejamento (spec R10b, R18):
// _Memórias_, _Da nossa lista · feitos aqui_, _Na lista em {destino}_, _No
// calendário_ e o _Mapa da viagem_ (ADR 0021: o mapa-múndi recortado por
// `cropFor`, com SVG por cima).

import type { CSSProperties, ReactNode } from 'react'
import { CalendarCheck, CircleCheck, CirclePlus, ListChecks, ListPlus, PlaneLanding } from 'lucide-react'
import { Avatar, CouplePair } from '../../calendar/parts'
import { bandColor } from '../../calendar/view'
import { runs } from '../../domain/calendar'
import type { Band, CalCity, Run } from '../../domain/calendar'
import { CATEGORY_LABELS } from '../../domain/list'
import type { ListItem } from '../../domain/list'
import { cropFor, dateRangeLabel, formatNumber, inItineraryDay, itemsLabel, tripDates, tripKm, tripRating } from '../../domain/tripDerive'
import type { Trip, TripMemory } from '../../domain/trips'
import { shortDayMonth, shortMonth, shortMonthYear } from '../../lib/date'
import { CATEGORY_ICONS } from '../../list/categories'
import worldMap from '../assets/world-map.jpg'
import type { TripPerson } from '../context'
import { usePhotoUrls, useTrips } from '../context'
import { calendarStripLabel, toneStyle } from './format'
import { AppLink, Card, HeartsText } from './parts'

// Recorte mínimo do Mapa da viagem. A imagem tem ~3,8 px por grau; abaixo de
// ~60° os pontos do mapa pontilhado viram bolas (medido no harness com
// SJC → Ilhabela). O custo é a viagem curta ficar com os pins juntos — ADR 0021.
const TRIP_MAP_MIN_DEG = 60

// ---------------------------------------------------------------------------
// Memórias (R18, R23)
// ---------------------------------------------------------------------------

export function MemoriesCard({ trip, onWrite }: { trip: Trip; onWrite: (mine: TripMemory | null) => void }) {
  const { me, members, names, people } = useTrips()
  const rating = tripRating(trip.memories, members, names)
  const mine = trip.memories.find((m) => m.profileId === me.profileId) ?? null
  const byId = new Map([people[1], people[2]].map((p) => [p.profileId, p]))
  const memories = [...trip.memories]
    .filter((m) => byId.has(m.profileId))
    .sort((a, b) => a.writtenOn.localeCompare(b.writtenOn) || a.profileId.localeCompare(b.profileId))

  return (
    <Card
      title="Memórias"
      labelledBy={`td-memories-${trip.id}`}
      className="td-memories"
      action={{ label: mine ? 'Editar a minha' : 'Escrever', onClick: () => onWrite(mine) }}
    >
      <div className="td-rating">
        <div>
          <p className="td-rating-title">Nota da viagem</p>
          <p className="td-rating-sub">{rating ? rating.label : 'sem nota ainda'}</p>
        </div>
        <HeartsText n={rating?.hearts ?? 0} className="td-hearts--big" />
      </div>
      {memories.map((m) => {
        const person = byId.get(m.profileId) as TripPerson
        return (
          <article key={m.profileId} className="td-memory" aria-label={`Memória de ${person.name}`}>
            <Avatar person={person} size={40} />
            <div className="td-memory-text">
              <p className="td-memory-head">
                <strong>{person.name}</strong>
                <span>escrito em {shortDayMonth(m.writtenOn)}</span>
              </p>
              <p className="td-memory-body">{m.body}</p>
            </div>
          </article>
        )
      })}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Cartão de item da Lista (o `List Card` do frame, 189×223)
// ---------------------------------------------------------------------------

function ListCard({
  item,
  url,
  badge,
  who,
  side,
}: {
  item: ListItem
  url: string | null
  badge: string | null
  who: ReactNode
  side: ReactNode
}) {
  const Icon = CATEGORY_ICONS[item.category]
  return (
    <li className="td-lcard" style={toneStyle(`cat-${item.category}`)}>
      <div className={`td-lcard-photo ${url ? '' : 'is-empty'}`}>
        {url ? <img src={url} alt="" loading="lazy" /> : <Icon size={28} aria-hidden="true" />}
        {badge && (
          <span className="td-lcard-badge">
            <CircleCheck size={12} aria-hidden="true" />
            {badge}
          </span>
        )}
      </div>
      <div className="td-lcard-body">
        <p className="td-lcard-name">{item.name}</p>
        <p className="td-lcard-meta">
          <Icon size={13} className="td-tone-icon" aria-hidden="true" />
          <span className="td-lcard-cat">{CATEGORY_LABELS[item.category].one}</span>
          {item.place?.city && <span className="td-lcard-place">· {item.place.city}</span>}
        </p>
        <div className="td-lcard-foot">
          <span className="td-lcard-who">{who}</span>
          {side}
        </div>
      </div>
    </li>
  )
}

/** R18 "♥ {os dois | nome}": quem fez o item. */
function DoneBy({ item, people }: { item: ListItem; people: readonly TripPerson[] }) {
  if (item.doneWith === 'solo') {
    const p = people.find((x) => x.profileId === item.doneSoloBy)
    return p ? (
      <>
        <Avatar person={p} size={18} />
        <span>{p.name}</span>
      </>
    ) : null
  }
  return (
    <>
      <CouplePair people={people} together />
      <span>os dois</span>
    </>
  )
}

/** Quem pôs o item na Lista. */
function AddedBy({ item, people }: { item: ListItem; people: readonly TripPerson[] }) {
  const p = people.find((x) => x.profileId === item.addedBy)
  return p ? (
    <>
      <CouplePair people={[p]} together={false} />
      <span>{p.name}</span>
    </>
  ) : null
}

// ---------------------------------------------------------------------------
// Da nossa lista · feitos aqui (feita, R18)
// ---------------------------------------------------------------------------

export function DoneHereCard({ trip, items }: { trip: Trip; items: readonly ListItem[] }) {
  const { people } = useTrips()
  const pair = [people[1], people[2]]
  const shown = items.slice(0, 4)
  const urls = usePhotoUrls(shown.map((i) => i.photoPath))
  const n = items.length
  return (
    <Card
      title="Da nossa lista · feitos aqui"
      labelledBy={`td-donehere-${trip.id}`}
      className="td-listblock"
      action={{ label: itemsLabel(n), to: '/lista', ariaLabel: `${itemsLabel(n)} — abrir a lista` }}
    >
      {n === 0 ? (
        <div className="td-empty td-empty--left">
          <p>Nenhum item da lista feito nesta viagem ainda.</p>
        </div>
      ) : (
        <>
          <ul className="td-lgrid">
            {shown.map((item) => (
              <ListCard
                key={item.id}
                item={item}
                url={item.photoPath ? (urls.get(item.photoPath) ?? null) : null}
                badge={item.doneOn ? `Feito · ${shortMonth(item.doneOn)}` : 'Feito'}
                who={<DoneBy item={item} people={pair} />}
                side={<CircleCheck size={16} className="td-lcard-done" aria-label="Feito" />}
              />
            ))}
          </ul>
          <AppLink to="/lista" className="td-pill-btn td-pill-btn--wide">
            <ListChecks size={16} aria-hidden="true" />
            {n === 1 ? 'Ver o item na lista' : `Ver os ${n} itens na lista`}
          </AppLink>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Na lista em {destino} (futura, R18)
// ---------------------------------------------------------------------------

export function NearbyCard({
  trip,
  destName,
  items,
  onAdd,
}: {
  trip: Trip
  destName: string
  items: readonly ListItem[]
  /** `listItemId` = pôr esse item no roteiro; sem = o modal vazio. */
  onAdd: (listItemId?: string) => void
}) {
  const { people } = useTrips()
  const pair = [people[1], people[2]]
  const shown = items.slice(0, 4)
  const urls = usePhotoUrls(shown.map((i) => i.photoPath))
  const n = items.length
  return (
    <Card
      title={`Na lista em ${destName}`}
      labelledBy={`td-nearby-${trip.id}`}
      className="td-listblock"
      action={{ label: itemsLabel(n), to: '/lista', ariaLabel: `${itemsLabel(n)} — abrir a lista` }}
    >
      {n > 0 && (
        <ul className="td-lgrid">
          {shown.map((item) => {
            const day = inItineraryDay(trip, item.id)
            return (
              <ListCard
                key={item.id}
                item={item}
                url={item.photoPath ? (urls.get(item.photoPath) ?? null) : null}
                badge={day === null ? null : `No roteiro · dia ${day}`}
                who={<AddedBy item={item} people={pair} />}
                side={
                  day === null ? (
                    <button type="button" className="td-lcard-add" aria-label={`Fora do roteiro — pôr ${item.name} no roteiro`} onClick={() => onAdd(item.id)}>
                      <CirclePlus size={16} aria-hidden="true" />
                    </button>
                  ) : (
                    <CalendarCheck size={16} className="td-lcard-planned" aria-label={`No roteiro · dia ${day}`} />
                  )
                }
              />
            )
          })}
        </ul>
      )}
      {n === 0 && (
        <div className="td-empty td-empty--left">
          <p>Nada da lista a até 30 km de {destName}.</p>
        </div>
      )}
      <button type="button" className="td-pill-btn td-pill-btn--wide" onClick={() => onAdd()}>
        <ListPlus size={16} aria-hidden="true" />
        Adicionar ao roteiro
      </button>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// No calendário (R18): a tira dos dias com a faixa derivada das estadias
// ---------------------------------------------------------------------------

/** O trecho que ocupa mais dias da viagem — o rótulo da legenda. */
function dominantRun(list: readonly Run[]): Run | null {
  let best: Run | null = null
  let bestDays = -1
  for (const r of list) {
    const days = tripDates({ startsOn: r.from, endsOn: r.to as string }).length
    if (days > bestDays) [best, bestDays] = [r, days]
  }
  return best
}

export function CalendarStripCard({ trip, destName, planned, onOpen }: { trip: Trip; destName: string; planned: boolean; onOpen: () => void }) {
  const { stays, members, names, cities, settings, people } = useTrips()
  const list = runs(stays, members, trip.startsOn, trip.endsOn)
  const bandOn = (day: string): Band => list.find((r) => r.from <= day && day <= (r.to as string))?.band ?? 'unknown'
  const main = dominantRun(list)
  const label = calendarStripLabel(main, destName, { names, cities, members })
  const mainBand = main?.band ?? 'unknown'
  const together = mainBand === 'home1' || mainBand === 'home2' || mainBand === 'away'

  return (
    <Card title="No calendário" labelledBy={`td-cal-${trip.id}`} className="td-calstrip" action={{ label: 'Abrir', onClick: onOpen, ariaLabel: 'Abrir no calendário' }}>
      <ol className="td-strip" aria-label="Os dias da viagem no calendário">
        {tripDates(trip).map((d) => {
          const band = bandOn(d)
          return (
            <li
              key={d}
              className={`td-strip-day ${band === 'unknown' ? 'is-unknown' : ''}`}
              data-day={d}
              data-band={band}
              style={band === 'unknown' ? undefined : ({ '--band': bandColor(settings, band) } as CSSProperties)}
            >
              <span>{Number(d.slice(8, 10))}</span>
              <span className="td-strip-bar" aria-hidden="true" />
            </li>
          )
        })}
      </ol>
      <div className="td-strip-legend">
        <span
          className="td-strip-label"
          style={mainBand === 'unknown' ? undefined : ({ '--band': bandColor(settings, mainBand) } as CSSProperties)}
        >
          {mainBand !== 'unknown' && <CouplePair people={[people[1], people[2]]} together={together} />}
          {label}
        </span>
        <span className="td-strip-when">
          {planned ? `${dateRangeLabel(trip.startsOn, trip.endsOn, { year: false })} · planejado` : shortMonthYear(trip.startsOn)}
        </span>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Mapa da viagem (R10b, ADR 0021)
// ---------------------------------------------------------------------------

/** A caixa do mapa no frame: 392×300. */
const MAP_ASPECT = 392 / 300

export function TripMapCard({
  trip,
  dest,
  home,
  originLabel,
  done,
  listItems,
}: {
  trip: Trip
  dest: CalCity | undefined
  home: CalCity
  /** "SJC" (ou o `originCode` da saída de quem vê). */
  originLabel: string
  done: boolean
  listItems: readonly ListItem[]
}) {
  const byId = new Map(listItems.map((i) => [i.id, i]))
  const seen = new Set<string>()
  const pins = trip.itinerary.flatMap((it) => {
    const item = it.listItemId ? byId.get(it.listItemId) : undefined
    if (!item?.place || seen.has(item.id)) return []
    seen.add(item.id)
    return [item]
  })
  const points = [home, ...(dest ? [dest] : [])]
  const crop = cropFor(points, { aspect: MAP_ASPECT, padDeg: 8, minWidthDeg: TRIP_MAP_MIN_DEG })
  const pos = (p: { lat: number; lng: number }) => crop.project(p)
  const h = pos(home)
  const d = dest ? pos(dest) : null
  const km = dest ? Math.round(tripKm(home, dest)) : null
  const destName = dest?.name ?? trip.title

  // Uma curva suave de casa ao destino (o arco do frame), em fração da caixa.
  const path = d
    ? (() => {
        const mx = (h.x + d.x) / 2
        const my = (h.y + d.y) / 2
        const dx = d.x - h.x
        const dy = d.y - h.y
        const bend = 0.18
        return `M ${h.x * 392} ${h.y * 300} Q ${(mx - dy * bend) * 392} ${(my + dx * bend) * 300} ${d.x * 392} ${d.y * 300}`
      })()
    : null

  const imgStyle: CSSProperties = {
    width: `${100 / crop.frame.w}%`,
    height: `${100 / crop.frame.h}%`,
    left: `${(-crop.frame.x / crop.frame.w) * 100}%`,
    top: `${(-crop.frame.y / crop.frame.h) * 100}%`,
  }
  const at = (p: { x: number; y: number }): CSSProperties => ({ left: `${p.x * 100}%`, top: `${p.y * 100}%` })

  return (
    <Card title="Mapa da viagem" labelledBy={`td-map-${trip.id}`} className="td-map">
      <div className="td-map-box" role="img" aria-label={`Mapa: ${originLabel} até ${destName}`}>
        <img className="td-map-img" src={worldMap} alt="" style={imgStyle} />
        {path && (
          <svg className="td-map-svg" viewBox="0 0 392 300" preserveAspectRatio="none" aria-hidden="true">
            <path d={path} />
          </svg>
        )}
        <span className="td-map-home" style={at(h)} aria-hidden="true" />
        <span className="td-map-label td-map-label--home" style={at(h)} aria-hidden="true">
          {originLabel}
        </span>
        {pins.map((item) => {
          const Icon = CATEGORY_ICONS[item.category]
          const p = pos({ lat: item.place!.lat, lng: item.place!.lng })
          if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) return null
          return (
            <span key={item.id} className="td-map-pin td-map-pin--item" style={{ ...at(p), ...toneStyle(`cat-${item.category}`) }} title={item.name} aria-hidden="true">
              <Icon size={12} />
            </span>
          )
        })}
        {d && (
          <>
            <span className={`td-map-pin td-map-pin--dest ${done ? 'is-done' : 'is-planned'}`} style={at(d)} aria-hidden="true">
              {done ? <CircleCheck size={15} /> : <PlaneLanding size={15} />}
            </span>
            <span className="td-map-label td-map-label--dest" style={at(d)} aria-hidden="true">
              {destName}
            </span>
          </>
        )}
      </div>
      <div className="td-map-legend">
        <span>
          {originLabel} → {destName}
        </span>
        <strong>
          {km !== null ? `${formatNumber(km)} km` : ''}
          {pins.length > 0 ? `${km !== null ? ' · ' : ''}${pins.length} ${pins.length === 1 ? 'pin' : 'pins'}` : ''}
        </strong>
      </div>
    </Card>
  )
}
