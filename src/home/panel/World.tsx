// _Juntos pelo mundo · Detalhes ›_ (R21, I11): os números das viagens FEITAS,
// pelo `tripTotals` das Viagens (km da casa de quem vê), mais os países mais
// visitados, a divisão Brasil/lá fora e a frase da volta ao mundo. Sem viagem
// feita, o bloco some (zeros diriam o mesmo que o silêncio, com mais ruído).

import { Building2, Globe, Plane } from 'lucide-react'
import { navigate } from '../../app/router'
import { circumferenceLine, citiesSplit, countriesLine, countriesOfDone } from '../../domain/map'
import { formatNumber, tripTotals } from '../../domain/tripDerive'
import { useHome } from '../context'
import { CardAction, PanelCard } from './parts'

export function World() {
  const { trips, cities, me, today } = useHome()
  const totals = tripTotals(trips, cities, me.homeCity, today)
  if (totals.trips === 0) return null

  const km = Math.round(totals.km)
  const split = citiesSplit(trips, cities, today)
  const circle = circumferenceLine(km)

  return (
    <PanelCard title="Juntos pelo mundo" action={<CardAction label="Detalhes" onClick={() => navigate('/viagens')} />}>
      <div className="hp-world">
        <div className="hp-world-row">
          <div className="hp-stat" data-stat="countries">
            <span className="hp-stat-head">
              <span className="hp-stat-icon hp-ic-blue" aria-hidden="true">
                <Globe size={14} />
              </span>
              Países
            </span>
            <span className="hp-stat-value">{formatNumber(totals.countries)}</span>
            <span className="hp-stat-caption">{countriesLine(countriesOfDone(trips, cities, today))}</span>
          </div>
          <div className="hp-stat" data-stat="cities">
            <span className="hp-stat-head">
              <span className="hp-stat-icon hp-ic-emphasis" aria-hidden="true">
                <Building2 size={14} />
              </span>
              Cidades
            </span>
            <span className="hp-stat-value">{formatNumber(totals.cities)}</span>
            <span className="hp-stat-caption">
              {split.br} no Brasil, {split.abroad} lá fora
            </span>
          </div>
        </div>
        <div className="hp-stat hp-stat--km" data-stat="km">
          <span className="hp-stat-head">
            <span className="hp-stat-icon hp-ic-accent" aria-hidden="true">
              <Plane size={14} />
            </span>
            Quilômetros viajados
          </span>
          <span className="hp-stat-value-row">
            <span className="hp-stat-value hp-stat-value--km">{formatNumber(km)}</span>
            <span className="hp-stat-unit">km</span>
          </span>
          <span className="hp-stat-caption">{circle.text}</span>
          <span className="hp-km-track" aria-hidden="true">
            <span style={{ width: `${Math.min(circle.pct, 100)}%` }} />
          </span>
        </div>
      </div>
    </PanelCard>
  )
}
