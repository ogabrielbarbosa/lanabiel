import { daysInclusive, diffDays, formatDateBR, todayISO } from '../lib/date'
import { downloadExport } from './exportStays'
import { PEOPLE, personById } from './people'
import type { TimelineStats } from './timelineStats'
import type { Stay, TogetherPeriod } from './types'

interface SidebarProps {
  stats: TimelineStats
  together: TogetherPeriod[]
  stays: Stay[]
  onNew: () => void
  onEdit: (stay: Stay) => void
}

function StatusLine({ stats }: { stats: TimelineStats }) {
  const today = todayISO()

  if (stats.current) {
    return stats.current.end ? (
      <p className="status">
        Juntos em <strong>{stats.current.city}</strong> até {formatDateBR(stats.current.end)}.
      </p>
    ) : (
      <p className="status">
        Juntos em <strong>{stats.current.city}</strong> desde {formatDateBR(stats.current.start)}.
      </p>
    )
  }
  if (stats.next) {
    return (
      <p className="status">
        Faltam <strong>{diffDays(today, stats.next.start)}</strong> dias para se encontrarem em{' '}
        {stats.next.city}.
      </p>
    )
  }
  if (stats.last?.end) {
    return (
      <p className="status">
        Separados há <strong>{diffDays(stats.last.end, today)}</strong> dias. Nenhum reencontro
        planejado.
      </p>
    )
  }
  return <p className="status">Nenhum período em comum ainda.</p>
}

function StayItem({ stay, onEdit }: { stay: Stay; onEdit: () => void }) {
  const person = personById(stay.person)
  return (
    <li>
      <button type="button" className="list-item" onClick={onEdit}>
        <span className="dot" style={{ background: person.color }} />
        <span className="item-body">
          <span className="item-title">
            {person.name} · {stay.city}
          </span>
          <span className="item-sub">
            {formatDateBR(stay.start)} — {stay.end ? formatDateBR(stay.end) : 'hoje'} ·{' '}
            {daysInclusive(stay.start, stay.end ?? todayISO())} dias
          </span>
        </span>
      </button>
    </li>
  )
}

export function Sidebar({ stats, together, stays, onNew, onEdit }: SidebarProps) {
  const today = todayISO()

  const upcoming = stays.filter((s) => s.start > today)
  const current = stays.filter((s) => s.start <= today && (!s.end || s.end >= today))
  const past = stays
    .filter((s) => s.end && s.end < today)
    .sort((a, b) => (a.start < b.start ? 1 : -1))

  const sortedTogether = [...together].sort((a, b) => (a.start < b.start ? 1 : -1))

  return (
    <aside className="sidebar">
      <div className="side-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={onNew}>
          + Novo período
        </button>
        <button
          type="button"
          className="btn btn-outline btn-block"
          onClick={() => downloadExport(stays)}
          title="Baixa um .json com todos os períodos registrados"
        >
          ↓ Exportar JSON
        </button>
      </div>

      <div className="side-card">
        <div className="metric">
          <span className="metric-value">{stats.totalDaysTogether}</span>
          <span className="metric-label">dias juntos até hoje</span>
        </div>
        <StatusLine stats={stats} />
      </div>

      <div className="side-card">
        <h3 className="side-title">Hoje</h3>
        {PEOPLE.map((person) => {
          const stay = person.id === 'gabriel' ? stats.gabrielToday : stats.lanaToday
          return (
            <div className="person-row" key={person.id}>
              <span className="dot" style={{ background: person.color }} />
              <span className="person-name">{person.name}</span>
              <span className="person-city">{stay ? stay.city : '—'}</span>
            </div>
          )
        })}
        <p className="hint">
          Dia com fundo destacado = os dois na mesma cidade. Arraste as pontas da barra para
          esticar, ou clique para editar.
        </p>
      </div>

      {sortedTogether.length > 0 && (
        <div className="side-card">
          <h3 className="side-title">Juntos · {sortedTogether.length}</h3>
          <ul className="list">
            {sortedTogether.map((period) => (
              <li key={`${period.start}-${period.end}-${period.city}`}>
                <div className="list-item list-item-static">
                  <span className="dot dot-together" />
                  <span className="item-body">
                    <span className="item-title">{period.city}</span>
                    <span className="item-sub">
                      {formatDateBR(period.start)} — {period.end ? formatDateBR(period.end) : 'hoje'}{' '}
                      · {daysInclusive(period.start, period.end ?? today)} dias
                    </span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="side-card">
        <h3 className="side-title">Registros</h3>

        {upcoming.length > 0 && (
          <>
            <h4 className="side-subtitle">Planejado</h4>
            <ul className="list">
              {upcoming.map((stay) => (
                <StayItem key={stay.id} stay={stay} onEdit={() => onEdit(stay)} />
              ))}
            </ul>
          </>
        )}

        {current.length > 0 && (
          <>
            <h4 className="side-subtitle">Agora</h4>
            <ul className="list">
              {current.map((stay) => (
                <StayItem key={stay.id} stay={stay} onEdit={() => onEdit(stay)} />
              ))}
            </ul>
          </>
        )}

        {past.length > 0 && (
          <details className="history">
            <summary>Histórico · {past.length}</summary>
            <ul className="list">
              {past.map((stay) => (
                <StayItem key={stay.id} stay={stay} onEdit={() => onEdit(stay)} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </aside>
  )
}
