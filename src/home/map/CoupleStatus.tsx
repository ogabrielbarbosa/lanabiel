// `Couple Status` (X89zD): os dois avatares — ou a foto do casal — e as duas
// linhas do trecho de hoje.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R4, I2
//
// As linhas saem de `coupleStatusLines(currentPeriod(…))` (domínio, sobre
// `runAround`): nada é recalculado aqui. A segunda linha (_"Juntos há 12
// dias"_) some com `show_home_counter` desligado e em `unknown`.

import { useMemo } from 'react'
import { coupleStatusLines, currentPeriod } from '../../domain/map'
import { useHome } from '../context'
import { MapAvatar } from './parts'

export function CoupleStatus() {
  const { me, partner, coverUrl, settings, today, stays, members, cities } = useHome()
  const period = useMemo(() => currentPeriod(today, stays, members), [today, stays, members])
  const lines = coupleStatusLines(period, (id) => cities.get(id)?.name ?? '?', me.profileId)
  const cover = settings.useCoupleCover && coverUrl ? coverUrl : null
  const counter = settings.showHomeCounter ? lines.counter : null

  return (
    <div className="hm-status">
      {cover ? (
        <span className="hm-status-cover" aria-hidden="true">
          <img src={cover} alt="" />
        </span>
      ) : (
        <span className="hm-status-pair" aria-hidden="true">
          <MapAvatar person={partner} size={52} />
          <MapAvatar person={me} size={52} />
        </span>
      )}
      <div className="hm-status-text">
        <p className={`hm-status-live hm-status-live--${period.kind}`}>
          <span className="hm-status-dot" aria-hidden="true" />
          {lines.status}
        </p>
        {counter && <p className="hm-status-big">{counter}</p>}
      </div>
    </div>
  )
}
