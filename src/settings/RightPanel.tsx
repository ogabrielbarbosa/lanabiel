// O painel "O espaço de vocês" (`Right Panel`, hWcCy), igual em todas as abas.
//
// Spec: R5. "Itens na lista" e "viagens" mostram — até as Fases 4 e 6: as
// tabelas não existem, e zero afirmaria o que não se sabe.

import { Info, MessageSquareHeart } from 'lucide-react'
import { cityLabel } from '../data/cities'
import type { SettingsData } from '../data/settings'
import { coupleLabel, daysTogetherInYear, formatThousands } from '../domain/settings'
import { distanceKm, togetherFor } from '../domain/onboarding'
import { weekdayDayMonthLabel } from '../lib/date'
import { Avatar } from './parts'

export function RightPanel({
  data,
  today,
  urls,
}: {
  data: SettingsData
  today: string
  urls: { avatars: Record<string, string | null>; cover: string | null }
}) {
  const { couple } = data
  const [a, b] = couple.members
  const year = Number(today.slice(0, 4))
  const together =
    a && b
      ? daysTogetherInYear(
          data.stays,
          [
            { profileId: a.profileId, homeCityId: a.homeCity.id },
            { profileId: b.profileId, homeCityId: b.homeCity.id },
          ],
          year,
          today,
        )
      : null
  const feedback = import.meta.env.VITE_FEEDBACK_EMAIL as string | undefined
  const since = togetherFor(couple.startedOn, today)

  return (
    <aside className="st-panel" aria-label="O espaço de vocês">
      <p className="st-panel-date">{weekdayDayMonthLabel(today)}</p>
      <h2 className="st-panel-title">O espaço de vocês</h2>

      <div className="st-card st-panel-couple">
        <p className="st-panel-name">{coupleLabel(couple.name, couple.members)}</p>
        <div className="st-panel-avatars">
          {couple.members.map((m) => (
            <Avatar key={m.profileId} url={urls.avatars[m.profileId] ?? null} name={m.displayName} color={m.color} size={36} />
          ))}
          <p className="st-panel-since">
            <span className="st-hint">{since.startsWith('juntos há') ? 'juntos há' : ''}</span>
            <strong>{since.replace(/^juntos há /, '')}</strong>
          </p>
        </div>
        <ul className="st-panel-cities">
          {couple.members.map((m) => (
            <li key={m.profileId}>
              <span className="st-dot" style={{ background: m.color }} aria-hidden="true" />
              {cityLabel(m.homeCity)}
            </li>
          ))}
        </ul>
        {a && b && (
          <p className="st-panel-distance">
            <span>Distância entre as cidades</span>
            <strong>{formatThousands(distanceKm(a.homeCity, b.homeCity))} km</strong>
          </p>
        )}
      </div>

      <div className="st-card">
        <h3 className="st-panel-subtitle">Resumo rápido</h3>
        <dl className="st-metrics">
          <div>
            <dt>itens na lista</dt>
            <dd title="A Lista chega numa próxima fase">—</dd>
          </div>
          <div>
            <dt>viagens</dt>
            <dd title="As Viagens chegam numa próxima fase">—</dd>
          </div>
          <div>
            <dt>dias juntos em {year}</dt>
            <dd>{together === null ? '—' : formatThousands(together)}</dd>
          </div>
        </dl>
      </div>

      <div className="st-card">
        <h3 className="st-panel-subtitle">Sobre o app</h3>
        <ul className="st-about">
          <li>
            <Info size={15} aria-hidden="true" />
            <span>Versão</span>
            <span className="st-hint">
              lanabiel {__APP_VERSION__} · build {__APP_BUILD__}
            </span>
          </li>
          {feedback && (
            <li>
              <MessageSquareHeart size={15} aria-hidden="true" />
              <span>Enviar feedback</span>
              <a href={`mailto:${feedback}?subject=${encodeURIComponent('Feedback do lanabiel')}`}>Escrever</a>
            </li>
          )}
        </ul>
      </div>
    </aside>
  )
}
