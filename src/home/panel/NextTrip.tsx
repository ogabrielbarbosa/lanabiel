// _Próxima viagem · Roteiro ›_ (R16): a `heroTrip` das Viagens — a em
// andamento, senão a próxima planejada. Sem nenhuma: _"Nenhuma viagem pela
// frente"_ com _Planejar_.

import { CalendarDays, MapPin, Plane, PlaneTakeoff } from 'lucide-react'
import { navigate } from '../../app/router'
import { countryLabel, daysLabel, daysUntil, heroTrip, ongoingDay, tripDateRange, tripDays } from '../../domain/tripDerive'
import { coverPath } from '../../trips/context'
import { tripPath } from '../../trips/links'
import { usePhotoUrls, useHome } from '../context'
import { routeChip } from './derive'
import { CardAction, PanelCard, PanelPhoto, PersonAvatar } from './parts'


export function NextTrip() {
  const { trips, today, me, people, cities } = useHome()
  const trip = heroTrip(trips, today)
  const cover = trip ? coverPath(trip) : null
  usePhotoUrls([cover])

  if (!trip) {
    return (
      <PanelCard title="Próxima viagem">
        <div className="hp-empty">
          <p>Nenhuma viagem pela frente</p>
          <button type="button" className="hp-pill-btn" onClick={() => navigate('/viagens')}>
            <PlaneTakeoff size={14} aria-hidden="true" />
            Planejar
          </button>
        </div>
      </PanelCard>
    )
  }

  const dest = cities.get(trip.cityId)
  const destName = dest?.name ?? '?'
  const open = () => navigate(tripPath(trip.id))
  const ongoing = ongoingDay(trip, today)
  const until = daysUntil(trip, today)

  return (
    <PanelCard title="Próxima viagem" action={<CardAction label="Roteiro" onClick={open} />}>
      <a
        href={tripPath(trip.id)}
        className="hp-trip"
        aria-label={`Abrir a viagem ${trip.title}`}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
          e.preventDefault()
          open()
        }}
      >
        <PanelPhoto path={cover} className="hp-trip-cover">
          <span className="hp-trip-top">
            <span className="hp-route">
              <Plane size={13} aria-hidden="true" />
              {routeChip(trip, me, destName)}
            </span>
            <span className="hp-couple">
              <PersonAvatar person={people[2]} size={26} />
              <PersonAvatar person={people[1]} size={26} />
            </span>
          </span>
        </PanelPhoto>
        <span className="hp-trip-info">
          <span className="hp-trip-dest">
            <span className="hp-trip-city">{destName}</span>
            <span className="hp-trip-details">
              <span>
                <MapPin size={13} aria-hidden="true" />
                {dest ? countryLabel(dest.countryCode) : '?'}
              </span>
              <span>
                <CalendarDays size={13} aria-hidden="true" />
                {tripDateRange(trip, { year: false })} · {daysLabel(tripDays(trip))}
              </span>
            </span>
          </span>
          {ongoing ? (
            <span className="hp-countdown">
              <span className="visually-hidden">{`Viajando agora · dia ${ongoing.k} de ${ongoing.n}`}</span>
              <span className="hp-countdown-prefix" aria-hidden="true">
                Viajando agora
              </span>
              <span className="hp-countdown-row" aria-hidden="true">
                <span className="hp-countdown-unit">dia</span>
                <span className="hp-countdown-num">{ongoing.k}</span>
                <span className="hp-countdown-unit">de {ongoing.n}</span>
              </span>
            </span>
          ) : (
            <span className="hp-countdown">
              <span className="visually-hidden">{`embarque em ${daysLabel(until)}`}</span>
              <span className="hp-countdown-prefix" aria-hidden="true">
                embarque
              </span>
              <span className="hp-countdown-row" aria-hidden="true">
                <span className="hp-countdown-unit">em</span>
                <span className="hp-countdown-num">{until}</span>
                <span className="hp-countdown-unit">{until === 1 ? 'dia' : 'dias'}</span>
              </span>
            </span>
          )}
        </span>
      </a>
    </PanelCard>
  )
}
