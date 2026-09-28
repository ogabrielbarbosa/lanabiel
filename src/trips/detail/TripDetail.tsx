// O **Detalhe da viagem** (`Peoa7` feita, `f3yqz` futura; em andamento pelas
// regras da spec): a barra do topo, o herói com a capa, os quatro números e
// as duas colunas de blocos, que mudam com o estado da viagem (R18).
//
// Spec: .agent/Tasks/fase-6-viagens.md — R14–R23, R10b, R27, R32, seção 7
// ADR:  0019 (a viagem é o evento), 0021 (o mapa), 0018 (editar não repinta)
//
// Tudo que é texto com dado sai de `tripDerive.ts`; a tela só escolhe onde
// desenhar. Cada escrita passa por um modal (ou pelo `useTripWrite`) que só
// mostra o valor novo depois do `ok` e da releitura (R27).
//
// A `TripsRoute` só monta isto com um `id` que é viagem do casal; o `?? null`
// abaixo cobre a releitura em que ela some entre um render e outro.

import { useRef, useState } from 'react'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarHeart,
  CalendarRange,
  CircleCheck,
  Clock3,
  Expand,
  ImagePlus,
  Images,
  ListChecks,
  ListPlus,
  MapPin,
  Pencil,
  Plane,
  PlaneTakeoff,
  Route,
  X,
} from 'lucide-react'
import { requestCalendarFocus } from '../../app/calendarFocus'
import { navigate } from '../../app/router'
import { CouplePair } from '../../calendar/parts'
import {
  daysLabel,
  daysSpanLabel,
  departuresLine,
  doneHere,
  formatNumber,
  heroTrip,
  itemsLabel,
  itineraryCounts,
  itineraryPlan,
  nearbyListItems,
  originOf,
  photosLabel,
  prepSummary,
  routeLabel,
  statusLabel,
  suggestionsFor,
  tripCities,
  tripDateRange,
  tripDays,
  tripKm,
  tripRating,
  tripStatus,
} from '../../domain/tripDerive'
import type { ItineraryItem, PrepItem, Trip, TripMemory } from '../../domain/trips'
import { TRIP_LIMITS } from '../../domain/trips'
import { coverPath, usePhotoUrls, useTrips } from '../context'
import { CalendarStripCard, DoneHereCard, MemoriesCard, NearbyCard, TripMapCard } from './blocks'
import { BudgetModal, LodgingModal, MemoryModal, PrepModal } from './editors'
import { FullGallery, GalleryCard } from './Gallery'
import { Itinerary } from './Itinerary'
import { DayTitleModal, ItineraryModal } from './ItineraryModal'
import type { ItineraryModalMode } from './ItineraryModal'
import { citiesLabel, placesLabel, toneStyle } from './format'
import { AppLink, HeartsText, SeasonIcon } from './parts'
import { BudgetCard, LodgingCard, PrepCard } from './Planning'
import { usePhotoUpload } from './usePhotoUpload'
import './trip-detail.css'

type Modal =
  | { kind: 'itinerary'; mode: ItineraryModalMode }
  | { kind: 'dayTitle'; day: string }
  | { kind: 'prep'; item: PrepItem | null }
  | { kind: 'budget' }
  | { kind: 'lodging' }
  | { kind: 'memory'; mine: TripMemory | null }
  | { kind: 'gallery'; start: number }

export function TripDetail({ id, onEditTrip }: { id: string; onEditTrip?: () => void }) {
  const { tripById } = useTrips()
  const trip = tripById(id)
  if (!trip) return null
  return <Detail trip={trip} onEditTrip={onEditTrip} />
}

function Detail({ trip, onEditTrip }: { trip: Trip; onEditTrip?: () => void }) {
  const ctx = useTrips()
  const { today, trips, cities, home, me, people, members, names, listItems, notice, clearNotice } = ctx
  const [modal, setModal] = useState<Modal | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { state: upload, upload: send, dismiss } = usePhotoUpload(trip)

  const status = tripStatus(trip, today)
  const done = status !== 'planned' // feita ou em andamento: os blocos da feita (R18)
  const dest = cities.get(trip.cityId)
  const destName = dest?.name ?? trip.title
  const isHero = heroTrip(trips, today)?.id === trip.id
  const origin = originOf(trip, me.profileId, home.name)
  const nearby = nearbyListItems(dest, listItems)
  const suggestions = suggestionsFor(trip, dest, listItems)
  const hereDone = doneHere(trip, listItems)
  const prep = prepSummary(trip)
  const counts = itineraryCounts(trip)
  const citiesList = tripCities(trip, dest, listItems)
  const rating = tripRating(trip.memories, members, names)
  const km = dest ? Math.round(tripKm(home, dest)) : null
  const cover = coverPath(trip)
  const urls = usePhotoUrls([cover])
  const coverUrl = cover ? (urls.get(cover) ?? null) : null

  const close = () => setModal(null)
  const addItem = (day?: string, listItemId?: string | null) =>
    setModal({
      kind: 'itinerary',
      mode: { kind: 'new', day: day ?? itineraryPlan(trip, []).firstEmptyDay, listItemId: listItemId ?? null },
    })
  const editItem = (item: ItineraryItem) => setModal({ kind: 'itinerary', mode: { kind: 'edit', item } })
  const openGallery = (start = 0) => setModal({ kind: 'gallery', start })
  const pickPhotos = () => fileRef.current?.click()
  const toCalendar = () => {
    requestCalendarFocus(trip.startsOn)
    navigate('/calendario')
  }

  // A linha das saídas sem repetir "Gabriel e Lana" que já está ao lado (R15).
  const pairName = `${names[1]} e ${names[2]}`
  const departures = departuresLine(trip, members, names, cities).replace(`${pairName} · `, '')

  const KickerIcon = status === 'done' ? CircleCheck : status === 'ongoing' ? Plane : PlaneTakeoff

  return (
    <div className="td">
      <span className="td-glow td-glow--aqua" aria-hidden="true" />
      <span className="td-glow td-glow--sky" aria-hidden="true" />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="td-photo-input"
        aria-label={`Escolher até ${TRIP_LIMITS.photosPerUpload} fotos`}
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          e.target.value = ''
          void send(files)
        }}
      />

      <nav className="td-top" aria-label="Viagem">
        <AppLink to="/viagens" className="lg td-pill-btn">
          <ArrowLeft size={16} aria-hidden="true" />
          Nossas viagens
        </AppLink>
        <div className="td-top-actions">
          <button type="button" className="lg td-pill-btn" onClick={toCalendar}>
            <CalendarRange size={16} aria-hidden="true" />
            Ver no calendário
          </button>
          <button type="button" className="lg td-pill-btn" onClick={() => addItem()}>
            <ListPlus size={16} aria-hidden="true" />
            Adicionar ao roteiro
          </button>
          <button type="button" className="lg td-pill-btn" onClick={pickPhotos} disabled={upload.phase === 'sending'}>
            <ImagePlus size={16} aria-hidden="true" />
            Adicionar fotos
          </button>
          {onEditTrip && (
            <button type="button" className="lg td-round" aria-label="Editar viagem" onClick={onEditTrip}>
              <Pencil size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </nav>

      {notice && (
        <p className="td-notice lg" role="status">
          {notice}
          <button type="button" className="td-notice-x" aria-label="Fechar aviso" onClick={clearNotice}>
            <X size={14} aria-hidden="true" />
          </button>
        </p>
      )}
      {upload.phase !== 'idle' && (
        <p className={`td-notice lg ${upload.phase === 'done' && upload.failed ? 'is-failed' : ''}`} role="status" aria-live="polite">
          {upload.phase === 'sending' ? `Enviando ${upload.done} de ${upload.total}` : upload.message}
          {upload.phase === 'done' && (
            <button type="button" className="td-notice-x" aria-label="Fechar aviso" onClick={dismiss}>
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </p>
      )}

      {/* Herói (R15) */}
      <header className={`td-hero ${coverUrl ? '' : 'td-hero--nocover'}`}>
        {coverUrl && <img className="td-hero-img" src={coverUrl} alt="" />}
        <span className="td-hero-scrim" aria-hidden="true" />
        <div className="td-hero-corner">
          {done ? (
            <span className="td-hero-chip">
              <Images size={14} aria-hidden="true" />
              {photosLabel(trip.photos.length)}
            </span>
          ) : (
            <span className="td-hero-chip">
              <ListChecks size={14} aria-hidden="true" />
              {prep.done} de {prep.total} prontos
            </span>
          )}
          {trip.photos.length > 0 && (
            <button type="button" className="lg td-round td-round--dark" aria-label="Galeria em tela cheia" onClick={() => openGallery(0)}>
              <Expand size={15} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="td-hero-info">
          <p className={`td-kicker td-kicker--${status === 'planned' ? 'planned' : status}`}>
            <KickerIcon size={13} aria-hidden="true" />
            {statusLabel(trip, today, { isHero, countryCode: dest?.countryCode })}
          </p>
          <h1 className="td-hero-title">{trip.title}</h1>
          <p className="td-hero-meta">
            <span>
              <CalendarDays size={15} aria-hidden="true" />
              {tripDateRange(trip, { year: true })}
            </span>
            <span>
              <Clock3 size={15} aria-hidden="true" />
              {daysLabel(tripDays(trip))}
            </span>
            {trip.note && (
              <span>
                <SeasonIcon startsOn={trip.startsOn} lat={dest?.lat} size={15} />
                {trip.note}
              </span>
            )}
          </p>
          <p className="td-hero-couple">
            <CouplePair people={[people[1], people[2]]} together />
            <strong>{pairName}</strong>
            {status === 'done' ? (
              <>
                <HeartsText n={rating?.hearts ?? 0} className="td-hearts--hero" />
                <span className="td-hero-sub">{rating ? 'nota da viagem' : 'sem nota ainda'}</span>
              </>
            ) : (
              <span className="td-hero-sub">{departures}</span>
            )}
          </p>
        </div>
      </header>

      {/* Os quatro números (R16) */}
      <ul className="td-stats" aria-label="Números da viagem">
        <li className="lg" style={toneStyle('peach')}>
          <span className="td-stat-chip lg" aria-hidden="true">
            <Building2 size={18} />
          </span>
          <span className="td-stat-text">
            <strong>{citiesList.join(' · ')}</strong>
            <span>{citiesLabel(citiesList.length)}</span>
          </span>
        </li>
        <li className="lg" style={toneStyle('aqua')}>
          <span className="td-stat-chip lg" aria-hidden="true">
            <Route size={18} />
          </span>
          <span className="td-stat-text">
            <strong>{km !== null ? `${formatNumber(km)} km` : '— km'}</strong>
            <span>{done ? `percorridos · ${routeLabel(origin, destName, true)}` : routeLabel(origin, destName)}</span>
          </span>
        </li>
        <li className="lg" style={toneStyle('heart')}>
          <span className="td-stat-chip lg" aria-hidden="true">
            <CalendarHeart size={18} />
          </span>
          <span className="td-stat-text">
            <strong>{daysLabel(tripDays(trip))}</strong>
            <span>juntos · {daysSpanLabel(trip.startsOn, trip.endsOn)}</span>
          </span>
        </li>
        <li className="lg" style={toneStyle('sky')}>
          <span className="td-stat-chip lg" aria-hidden="true">
            <MapPin size={18} />
          </span>
          <span className="td-stat-text">
            {done ? (
              <>
                <strong>{placesLabel(counts.items)}</strong>
                <span>visitados · {counts.fromList} da nossa lista</span>
              </>
            ) : (
              <>
                <strong>{itemsLabel(nearby.length)}</strong>
                <span>da lista em {destName}</span>
              </>
            )}
          </span>
        </li>
      </ul>

      {/* As duas colunas (R17, R18) */}
      <div className="td-columns">
        <div className="td-col td-col--left">
          <Itinerary
            trip={trip}
            done={done}
            suggestions={suggestions}
            listItems={listItems}
            destName={destName}
            actions={{
              onAdd: (day, listItemId) => addItem(day, listItemId),
              onEdit: editItem,
              onDayTitle: (day) => setModal({ kind: 'dayTitle', day }),
            }}
          />
          {done ? (
            <>
              <GalleryCard trip={trip} onOpen={openGallery} onAddPhotos={pickPhotos} />
              <MemoriesCard trip={trip} onWrite={(mine) => setModal({ kind: 'memory', mine })} />
            </>
          ) : (
            <>
              <div className="td-planning">
                <PrepCard trip={trip} onEdit={(item) => setModal({ kind: 'prep', item })} onAdd={() => setModal({ kind: 'prep', item: null })} />
                <BudgetCard trip={trip} onEdit={() => setModal({ kind: 'budget' })} />
              </div>
              <LodgingCard trip={trip} onEdit={() => setModal({ kind: 'lodging' })} />
            </>
          )}
        </div>
        <div className="td-col td-col--right">
          <TripMapCard trip={trip} dest={dest} home={home} originLabel={origin} done={status === 'done'} listItems={listItems} />
          {done ? (
            <DoneHereCard trip={trip} items={hereDone} />
          ) : (
            <NearbyCard trip={trip} destName={destName} items={nearby} onAdd={(listItemId) => addItem(undefined, listItemId)} />
          )}
          <CalendarStripCard trip={trip} destName={destName} planned={status === 'planned'} onOpen={toCalendar} />
        </div>
      </div>

      {modal?.kind === 'itinerary' && <ItineraryModal trip={trip} mode={modal.mode} onClose={close} />}
      {modal?.kind === 'dayTitle' && <DayTitleModal trip={trip} day={modal.day} onClose={close} />}
      {modal?.kind === 'prep' && <PrepModal trip={trip} item={modal.item} onClose={close} />}
      {modal?.kind === 'budget' && <BudgetModal trip={trip} onClose={close} />}
      {modal?.kind === 'lodging' && <LodgingModal trip={trip} onClose={close} />}
      {modal?.kind === 'memory' && <MemoryModal trip={trip} mine={modal.mine} onClose={close} />}
      {modal?.kind === 'gallery' && <FullGallery trip={trip} start={modal.start} onClose={close} />}
    </div>
  )
}
