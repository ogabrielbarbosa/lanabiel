// _Nosso ritmo · Calendário ›_ (R17, I7): o trecho de hoje, o mês dia a dia e
// as duas métricas do ano. Tudo derivado das estadias pelas funções do
// domínio — `currentPeriod` (os `runs`), `monthStrip` (`countDrawn`: o mês
// DESENHADO, planejado incluso) e `yearTogether` (`countStates`: o VIVIDO).
// As duas contagens não se trocam (I2).
//
// As barras do mês têm duas cores fixas do `.pen` — juntos verde-água,
// separados rosa —, não as quatro cores de faixa das Configurações (decisão 6
// da spec). Dia sem registro (`unknown`) fica vazio.

import { CalendarHeart, Heart, HeartHandshake, HeartOff, Plane } from 'lucide-react'
import { navigate } from '../../app/router'
import { currentPeriod, monthStrip, yearTogether } from '../../domain/map'
import type { CurrentPeriod, StripDay } from '../../domain/map'
import { daysLabel } from '../../domain/tripDerive'
import { dayOfMonth, monthLong, shortDayMonth } from '../../lib/date'
import { useHome } from '../context'
import { CardAction, PanelCard } from './parts'

const STATE_LABEL: Record<Exclude<CurrentPeriod['kind'], 'unknown'>, string> = {
  together: 'Juntos',
  traveling: 'Viajando juntos',
  apart: 'Separados',
}

export function Rhythm() {
  const { today, stays, members } = useHome()
  const period = currentPeriod(today, stays, members)
  const strip = monthStrip(today, stays, members)
  const year = yearTogether(today, stays, members)

  return (
    <PanelCard title="Nosso ritmo" action={<CardAction label="Calendário" onClick={() => navigate('/calendario')} />}>
      <div className="hp-rhythm">
        <Period period={period} />
        <hr className="hp-divider" />
        <MonthStrip today={today} days={strip.days} together={strip.together} apart={strip.apart} />
        <div className="hp-metrics">
          <div className="hp-metric">
            <span className="hp-metric-head">
              <Heart size={14} className="hp-ic-accent" aria-hidden="true" />
              do ano juntos
            </span>
            <span className="hp-metric-value">{year.pct}%</span>
            <span className="hp-metric-caption">desde janeiro</span>
          </div>
          <div className="hp-metric">
            <span className="hp-metric-head">
              <CalendarHeart size={14} className="hp-ic-pink" aria-hidden="true" />
              dias juntos
            </span>
            <span className="hp-metric-value">{year.days.toLocaleString('pt-BR')}</span>
            <span className="hp-metric-caption">em {today.slice(0, 4)}</span>
          </div>
        </div>
      </div>
    </PanelCard>
  )
}

function Period({ period }: { period: CurrentPeriod }) {
  if (period.kind === 'unknown' || period.run === null) {
    return (
      <div className="hp-period hp-period--unknown">
        <div className="hp-period-status">
          <span className="hp-period-badge" aria-hidden="true">
            <HeartHandshake size={18} />
          </span>
          <span className="hp-period-text">
            <span className="hp-period-eyebrow">Período atual</span>
            <span className="hp-period-line">Sem registro de hoje</span>
          </span>
          <button type="button" className="hp-pill-btn" onClick={() => navigate('/calendario')}>
            Registrar
          </button>
        </div>
      </div>
    )
  }

  const { run, dayK, total, kind } = period
  const label = STATE_LABEL[kind]
  const Icon = kind === 'traveling' ? Plane : kind === 'apart' ? HeartOff : HeartHandshake
  const dayText = total === null ? `dia ${dayK}` : `dia ${dayK} de ${total}`
  const remaining = total === null ? null : total - dayK
  const fill = total === null ? 100 : Math.min(100, (100 * dayK) / total)

  return (
    <div className={`hp-period hp-period--${kind}`} data-period={kind}>
      <div className="hp-period-status">
        <span className="hp-period-badge" aria-hidden="true">
          <Icon size={18} />
        </span>
        <span className="hp-period-text">
          <span className="hp-period-eyebrow">Período atual</span>
          <span className="visually-hidden">{`${label} · ${dayText}`}</span>
          <span className="hp-period-line" aria-hidden="true">
            <span className="hp-period-state">{label}</span>
            <span>· {dayText}</span>
          </span>
        </span>
        {remaining !== null && (
          <span className="hp-remaining">
            <span className="visually-hidden">{`${daysLabel(remaining)} ${remaining === 1 ? 'restante' : 'restantes'}`}</span>
            <span className="hp-remaining-num" aria-hidden="true">
              {remaining}
            </span>
            <span className="hp-remaining-label" aria-hidden="true">
              {remaining === 1 ? 'dia restante' : 'dias restantes'}
            </span>
          </span>
        )}
      </div>
      <div className="hp-progress" aria-hidden="true">
        <span style={{ width: `${fill}%` }} />
      </div>
      <div className="hp-progress-labels">
        <span>{shortDayMonth(run.from)}</span>
        <span>{run.to === null ? 'em aberto' : shortDayMonth(run.to)}</span>
      </div>
    </div>
  )
}

/** Os rótulos do eixo: 1, 8, 15, 22 e o último dia do mês (o `.pen`: 1 · 8 · 15 · 22 · 30). */
function axisDays(last: number): number[] {
  return [1, 8, 15, 22, last]
}

function MonthStrip({ today, days, together, apart }: { today: string; days: readonly StripDay[]; together: number; apart: number }) {
  const last = days.length > 0 ? dayOfMonth(days[days.length - 1].day) : 30
  return (
    <div className="hp-month">
      <div className="hp-month-head">
        <span className="hp-month-name">{monthLong(today)}</span>
        <span className="hp-month-summary">
          {together} juntos · {apart} separados
        </span>
      </div>
      <ol className="hp-days" aria-label={`${monthLong(today)} dia a dia`}>
        {days.map((d) => (
          <li
            key={d.day}
            className={`hp-day hp-day--${d.mark}${d.today ? ' hp-day--today' : ''}${d.planned ? ' hp-day--planned' : ''}`}
            data-mark={d.mark}
            data-today={d.today || undefined}
            data-planned={d.planned || undefined}
            title={`${dayOfMonth(d.day)}`}
          />
        ))}
      </ol>
      <div className="hp-days-axis" aria-hidden="true">
        {axisDays(last).map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
      <div className="hp-legend" aria-hidden="true">
        <span>
          <i className="hp-swatch hp-swatch--together" />
          Juntos
        </span>
        <span>
          <i className="hp-swatch hp-swatch--apart" />
          Separados
        </span>
        <span>
          <i className="hp-swatch hp-swatch--today" />
          Hoje
        </span>
        <span>
          <i className="hp-swatch hp-swatch--planned" />
          Planejado
        </span>
      </div>
    </div>
  )
}
