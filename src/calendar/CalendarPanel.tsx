// O painel "Onde a gente está" (`n2aVYz`, painel `Mt65b`): Agora, o dia
// selecionado, Próximos eventos e o Resumo do mês visível.
//
// Spec: .agent/Tasks/fase-5-calendario.md — R12, I5, I7, I9, I10, I11
//
// Tudo aqui é derivado das estadias e dos eventos já lidos pela tela (nada é
// gravado, I1). As DUAS contagens não se misturam (I5): o _Agora_ conta a
// partir do começo do trecho de hoje (`nowSummary`); o _Resumo_ conta o
// DESENHADO do mês visível (`countDrawn`), com o planejado incluso.
//
// Cidade: nome curto (I9) no Agora, nos contadores e no Resumo; nome inteiro
// nas linhas de pessoa do bloco do dia.

import type { CSSProperties, ReactNode } from 'react'
import { ChevronRight, Luggage, Plane, Plus } from 'lucide-react'
import {
  bandOf,
  countDrawn,
  eventSubtitle,
  nowSummary,
  occurrences,
  personStatus,
  shortCityName,
  upcoming,
} from '../domain/calendar'
import type { CityMap, NowSummary, Occurrence, PersonDay } from '../domain/calendar'
import { coupleStateOn } from '../domain/coupleState'
import { isoOf, shortDayMonth, weekdayDayMonthLabel } from '../lib/date'
import { useCalendar } from './context'
import type { CalendarContextValue, CalendarPerson } from './context'
import { Avatar } from './parts'
import { EVENT_ICONS, bandColor, daysWord, monthBounds, monthName } from './view'

/** "Sexta, 25 set" — o título do bloco do dia. */
function dayTitle(day: string): string {
  return `${weekdayDayMonthLabel(day).split(',')[0]}, ${shortDayMonth(day)}`
}

/** O mesmo dia daqui a um ano (29/2 → 28/2): a janela dos próximos eventos. */
function oneYearAfter(day: string): string {
  const year = Number(day.slice(0, 4)) + 1
  return day.slice(5) === '02-29' ? isoOf(year, 2, 28) : `${year}${day.slice(4)}`
}

/**
 * O título e o subtítulo do _Agora_ com a cidade CURTA (I9, frame: "Juntos em
 * SJC há 4 dias"). `nowSummary` escreve o nome inteiro; aqui só se troca o
 * prefixo exato — se o domínio mudar a frase, fica a do domínio.
 */
function withShortCity(summary: NowSummary, cities: CityMap): { title: string; subtitle: string | null } {
  const name = summary.run?.cityId ? cities.get(summary.run.cityId)?.name : undefined
  if (!name) return { title: summary.title, subtitle: summary.subtitle }
  const short = shortCityName(name)
  const swap = (text: string | null, prefix: string, next: string) =>
    text !== null && text.startsWith(prefix) ? next + text.slice(prefix.length) : text
  return {
    title: swap(summary.title, `Juntos em ${name} `, `Juntos em ${short} `) as string,
    subtitle: swap(summary.subtitle, `Em ${name} desde`, `Em ${short} desde`),
  }
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="cal-card" aria-label={title}>
      <div className="cal-card-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function CardAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="cal-link" onClick={onClick}>
      {label}
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  )
}

function Now({ c }: { c: CalendarContextValue }) {
  const summary = nowSummary(c.today, c.stays, c.members, c.names, c.events, c.cities)
  const run = summary.run
  const { title, subtitle } = withShortCity(summary, c.cities)
  const people = [c.people[1], c.people[2]]

  if (run === null) {
    return (
      <Card title="Agora">
        <p className="cal-now-title">{title}</p>
        <button type="button" className="cal-btn cal-btn--wide" onClick={() => c.openNewPeriod(c.today)}>
          <Plus size={16} aria-hidden="true" />
          Criar período
        </button>
      </Card>
    )
  }

  const together = run.band !== 'apart'
  const progress = summary.progress
  const color = bandColor(c.settings, run.band as Exclude<typeof run.band, 'unknown'>)

  return (
    <Card title="Agora" action={<CardAction label="Ver período" onClick={() => c.openEditPeriod(run)} />}>
      <div className="cal-now">
        <span className={`cal-now-pair ${together ? 'cal-now-pair--together' : ''}`} aria-hidden="true">
          {people.map((p) => (
            <Avatar key={p.profileId} person={p} size={36} />
          ))}
        </span>
        <div className="cal-now-text">
          <p className="cal-now-title">{title}</p>
          {subtitle !== null && <p className="cal-now-sub">{subtitle}</p>}
        </div>
      </div>

      {progress !== null && (
        <div className="cal-now-progress" style={{ '--band': color } as CSSProperties}>
          <div
            className="cal-now-track"
            role="progressbar"
            aria-label="Andamento do período"
            aria-valuemin={1}
            aria-valuemax={progress.total}
            aria-valuenow={progress.dayK}
          >
            <span style={{ width: `${(100 * progress.dayK) / progress.total}%` }} />
          </div>
          <div className="cal-now-progress-labels">
            <span>{shortDayMonth(progress.from)}</span>
            <strong>
              dia {progress.dayK} de {progress.total}
            </strong>
            <span>{shortDayMonth(progress.to)}</span>
          </div>
        </div>
      )}

      {summary.countdowns.length > 0 && (
        <ul className="cal-countdowns" aria-label="Contadores">
          {summary.countdowns.map((cd) => {
            // O primeiro é sempre a próxima viagem/visita ("{destino} começa em").
            const trip = cd.label.endsWith('começa em')
            const Icon = trip ? Plane : Luggage
            return (
              <li key={cd.label} className={`cal-countdown ${trip ? 'cal-ev--viagem' : 'cal-ev--visita'}`}>
                <span className="cal-countdown-icon" aria-hidden="true">
                  <Icon size={14} />
                </span>
                <span className="cal-countdown-label">{cd.label}</span>
                <span className="cal-countdown-value">
                  <strong>{cd.days}</strong> {cd.days === 1 ? 'dia' : 'dias'}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

const STATUS_TEXT: Record<PersonDay['status'], (k: number | null) => string> = {
  home: () => 'em casa',
  visiting: (k) => `visitando · dia ${k}`,
  traveling: (k) => `viajando · dia ${k}`,
  unknown: () => 'sem registro',
}

function PersonRow({ c, person, day }: { c: CalendarContextValue; person: CalendarPerson; day: string }) {
  const where = personStatus(person.profileId, day, c.stays, c.members)
  const band = bandOf(coupleStateOn(day, c.stays, [c.members[1], c.members[2]]), c.members)
  const dot = band === 'unknown' ? undefined : bandColor(c.settings, band)
  const city = where.cityId === null ? null : (c.cities.get(where.cityId)?.name ?? '?')
  return (
    <li className="cal-person">
      <Avatar person={person} size={36} />
      <span className="cal-person-text">
        <span className="cal-person-name">{person.name}</span>
        {city !== null && (
          <span className="cal-person-city" style={dot ? ({ '--band': dot } as CSSProperties) : undefined}>
            {city}
          </span>
        )}
      </span>
      <span className="cal-person-status">{STATUS_TEXT[where.status](where.dayN)}</span>
    </li>
  )
}

/** Uma linha de evento: ícone, título, subtítulo e, à direita, `side`. */
function EventRow({ c, o, side }: { c: CalendarContextValue; o: Occurrence; side: ReactNode }) {
  const kind = o.event?.kind ?? 'data_especial'
  const Icon = EVENT_ICONS[kind]
  const subtitle = eventSubtitle(o, { cities: c.cities })
  const content = (
    <>
      <span className="cal-event-icon" aria-hidden="true">
        <Icon size={15} />
      </span>
      <span className="cal-event-text">
        <span className="cal-event-title">{o.title}</span>
        <span className="cal-event-sub">{subtitle}</span>
      </span>
      <span className="cal-event-side">{side}</span>
    </>
  )
  const event = o.event
  // O aniversário derivado não se edita ali (R21): não é botão.
  if (event === null) return <li className={`cal-event cal-ev--${kind}`}>{content}</li>
  return (
    <li>
      <button type="button" className={`cal-event cal-ev--${kind}`} onClick={() => c.openEditEvent(event)}>
        {content}
      </button>
    </li>
  )
}

function SelectedDay({ c }: { c: CalendarContextValue }) {
  const day = c.selectedDay
  const occs = occurrences(c.events, { startedOn: c.startedOn }, day, day)
  return (
    <Card
      title={dayTitle(day)}
      action={day !== c.today ? <CardAction label="Hoje" onClick={() => c.selectDay(c.today)} /> : undefined}
    >
      <ul className="cal-people" aria-label="Onde cada um está">
        <PersonRow c={c} person={c.people[1]} day={day} />
        <PersonRow c={c} person={c.people[2]} day={day} />
      </ul>
      <p className="cal-subhead">Eventos do dia · {occs.length}</p>
      {occs.length > 0 && (
        <ul className="cal-events" aria-label="Eventos do dia">
          {occs.map((o) => (
            <EventRow
              key={`${o.event?.id ?? 'anniversary'}-${o.day}`}
              c={c}
              o={o}
              side={o.event !== null && !o.event.allDay && o.event.startsAt !== null ? o.event.startsAt : 'dia inteiro'}
            />
          ))}
        </ul>
      )}
      <button type="button" className="cal-btn cal-btn--wide" onClick={() => c.openNewEvent(day)}>
        <Plus size={16} aria-hidden="true" />
        Adicionar evento
      </button>
    </Card>
  )
}

function Upcoming({ c }: { c: CalendarContextValue }) {
  const next = upcoming(occurrences(c.events, { startedOn: c.startedOn }, c.today, oneYearAfter(c.today)), c.today)
  return (
    <Card title="Próximos eventos">
      {next.length === 0 ? (
        <p className="cal-hint">Nada marcado pela frente.</p>
      ) : (
        <ul className="cal-events" aria-label="Próximos eventos">
          {next.map((o) => {
            const [d, m] = shortDayMonth(o.day).split(' ')
            return (
              <EventRow
                key={`${o.event?.id ?? 'anniversary'}-${o.day}`}
                c={c}
                o={o}
                side={
                  <span className="cal-event-date">
                    <strong>{d}</strong>
                    <small>{m.toUpperCase()}</small>
                  </span>
                }
              />
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function Summary({ c }: { c: CalendarContextValue }) {
  const { visibleMonth, settings, people } = c
  const bounds = monthBounds(visibleMonth)
  const counts = countDrawn(bounds.from, bounds.to, c.stays, c.members)
  const together = counts.home1 + counts.home2 + counts.away
  const sameHome = people[1].homeCity.id === people[2].homeCity.id
  const name = monthName(visibleMonth.month).toLowerCase()
  const title = `Resumo de ${name}${visibleMonth.year === Number(c.today.slice(0, 4)) ? '' : ` de ${visibleMonth.year}`}`

  const lines: { band: keyof typeof counts; label: string }[] = [
    { band: 'home1', label: `Em ${shortCityName(people[1].homeCity.name)}` },
    ...(sameHome ? [] : [{ band: 'home2' as const, label: `Em ${shortCityName(people[2].homeCity.name)}` }]),
    { band: 'away', label: 'Viajando' },
    { band: 'apart', label: 'Separados' },
    ...(counts.unknown > 0 ? [{ band: 'unknown' as const, label: 'Sem registro' }] : []),
  ]
  const color = (band: keyof typeof counts) => (band === 'unknown' ? undefined : bandColor(settings, band))
  const total = together + counts.apart + counts.unknown

  return (
    <Card title={title} action={c.view === 'year' ? undefined : <CardAction label="Ano" onClick={() => c.setView('year')} />}>
      <div className="cal-totals">
        <p style={{ '--band': settings.colorTogetherHome1 } as CSSProperties}>
          <strong>{together}</strong>
          <span>dias juntos</span>
        </p>
        <p style={{ '--band': settings.colorApart } as CSSProperties}>
          <strong>{counts.apart}</strong>
          <span>dias separados</span>
        </p>
      </div>
      <div className="cal-stack" aria-hidden="true">
        {lines
          .filter((l) => counts[l.band] > 0)
          .map((l) => (
            <span
              key={l.band}
              className={l.band === 'unknown' ? 'cal-stack--unknown' : undefined}
              style={{ flexGrow: counts[l.band] / total, '--band': color(l.band) } as CSSProperties}
            />
          ))}
      </div>
      <ul className="cal-breakdown" aria-label={`Dias de ${name}`}>
        {lines.map((l) => (
          <li
            key={l.band}
            className={l.band === 'unknown' ? 'cal-breakdown--unknown' : undefined}
            style={{ '--band': color(l.band) } as CSSProperties}
          >
            <span>{l.label}</span>
            <strong>{daysWord(counts[l.band])}</strong>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function CalendarPanel() {
  const c = useCalendar()
  return (
    <>
      <div className="cal-panel-head">
        <p>{weekdayDayMonthLabel(c.today)}</p>
        <h2>Onde a gente está</h2>
      </div>
      <Now c={c} />
      <SelectedDay c={c} />
      <Upcoming c={c} />
      <Summary c={c} />
    </>
  )
}
