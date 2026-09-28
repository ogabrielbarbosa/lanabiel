// Cidades (dpzT3): as duas casas, a distância, e as cidades salvas.
//
// Cada pessoa troca só a PRÓPRIA cidade-casa (R11) — a policy
// `profiles_update_self` é a regra. Trocar recalcula a história inteira, sem
// reescrever estadia (ADR 0002, I7): o aviso vem antes de gravar (R12).

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Ellipsis, House, MapPin, Plus, Route, Trash2 } from 'lucide-react'
import { cityLabel } from '../../data/cities'
import type { City } from '../../data/cities'
import { distanceKm } from '../../domain/onboarding'
import { formatCoord, formatThousands } from '../../domain/settings'
import { Button, Card, CitySearch, Dialog, FieldError, Segmented } from '../parts'
import { failureMessage } from '../context'
import type { TabContext } from '../context'

export function CitiesTab(ctx: TabContext) {
  const { data, api, writes, update, me } = ctx
  const [dialog, setDialog] = useState<'home' | 'add' | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const members = data.couple.members
  const homes = new Map(members.map((m) => [m.homeCity.id, m]))
  const saved = data.savedCities.filter((c) => !homes.has(c.id))

  const remove = (cityId: string) =>
    writes.run(`saved:${cityId}`, async () => {
      const result = await api.removeSavedCity(cityId)
      if (result.status !== 'ok') return failureMessage(result)
      update((d) => ({ ...d, savedCities: d.savedCities.filter((c) => c.id !== cityId) }))
      return null
    })

  const [a, b] = members

  return (
    <div className="st-stack">
      <div className="st-homes">
        {members.map((m) => (
          <Card key={m.profileId} className="st-home">
            <span className="st-dot st-dot--lg" style={{ background: m.color }} aria-hidden="true" />
            <div>
              <p className="st-member-name">{m.displayName}</p>
              <p className="st-hint">
                <MapPin size={12} aria-hidden="true" /> {cityLabel(m.homeCity)}
              </p>
            </div>
            {m.profileId === me.profileId && (
              <Button variant="link" onClick={() => setDialog('home')}>
                Trocar cidade
              </Button>
            )}
          </Card>
        ))}
      </div>

      {a && b && (
        <Card className="st-distance">
          <div>
            <p className="st-row-hint">
              <Route size={14} aria-hidden="true" /> Distância entre as cidades
            </p>
            <p className="st-distance-value">
              {formatThousands(distanceKm(a.homeCity, b.homeCity))} <span>km</span>
            </p>
          </div>
          <div className="st-distance-source">
            <p className="st-row-hint">De onde vem o número</p>
            <Segmented
              label="De onde vem o número"
              value="straight"
              onChange={() => undefined}
              options={[
                { value: 'road', label: 'Pela estrada (rodoviária)', disabled: true },
                { value: 'straight', label: 'Em linha reta' },
              ]}
            />
            <p className="st-hint">A distância pela estrada precisa de um serviço de rotas. Fica pra depois.</p>
          </div>
        </Card>
      )}

      <div className="st-subhead">
        <h3>Cidades salvas</h3>
        <Button icon={Plus} onClick={() => setDialog('add')}>
          Adicionar cidade
        </Button>
      </div>
      <Card className="st-list">
        <ul>
          {members.map((m) => (
            <CityRow key={`home:${m.profileId}`} city={m.homeCity} tag={`Casa de ${m.displayName}`} />
          ))}
          {saved.map((c) => (
            <CityRow key={c.id} city={c} country={c.countryCode}>
              <div className="st-row-menu">
                <button
                  type="button"
                  className="st-icon-btn"
                  aria-label={`Opções de ${c.name}`}
                  aria-expanded={menuFor === c.id}
                  onClick={() => setMenuFor(menuFor === c.id ? null : c.id)}
                >
                  <Ellipsis size={16} />
                </button>
                {menuFor === c.id && (
                  <div className="lg st-popover" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={writes.pending(`saved:${c.id}`)}
                      onClick={() => {
                        setMenuFor(null)
                        void remove(c.id)
                      }}
                    >
                      <Trash2 size={14} aria-hidden="true" /> Remover
                    </button>
                  </div>
                )}
              </div>
              <FieldError message={writes.error(`saved:${c.id}`)} />
            </CityRow>
          ))}
        </ul>
        {saved.length === 0 && (
          <p className="st-hint st-list-empty">
            Salve as cidades que vocês visitam sempre. Elas aparecem primeiro no Calendário e na Lista.
          </p>
        )}
      </Card>

      {dialog === 'home' && <ChangeHomeCity ctx={ctx} onClose={() => setDialog(null)} />}
      {dialog === 'add' && (
        <Dialog title="Adicionar cidade" onClose={() => setDialog(null)}>
          <CitySearch
            search={api.searchCities}
            excluded={
              new Map([
                ...members.map((m): [string, string] => [m.homeCity.id, `casa de ${m.displayName}`]),
                ...saved.map((c): [string, string] => [c.id, 'já salva']),
              ])
            }
            onPick={(city) => {
              setDialog(null)
              void writes.run('add-city', async () => {
                const result = await api.saveCity(data.couple.id, city.id)
                if (result.status === 'already_saved') {
                  ctx.reload()
                  return null
                }
                if (result.status !== 'ok') return failureMessage(result)
                update((d) => ({
                  ...d,
                  savedCities: [
                    ...d.savedCities,
                    { ...city, countryCode: 'BR', addedAt: new Date(ctx.api.now()).toISOString() },
                  ],
                }))
                return null
              })
            }}
          />
        </Dialog>
      )}
      <FieldError message={writes.error('add-city')} />
    </div>
  )
}

function CityRow({
  city,
  tag,
  country = 'BR',
  children,
}: {
  city: City
  tag?: string
  country?: string
  children?: ReactNode
}) {
  return (
    <li className="st-city-row">
      <span className="st-row-icon" aria-hidden="true">
        {tag ? <House size={15} /> : <MapPin size={15} />}
      </span>
      <div className="st-row-text">
        <span className="st-row-label">
          {city.name} <span className="st-hint">{[city.stateCode, country === 'BR' ? 'Brasil' : country].filter(Boolean).join(', ')}</span>
        </span>
        {tag && <span className="st-row-hint">{tag}</span>}
      </div>
      <span className="st-hint st-coord">{formatCoord(city.lat, city.lng)}</span>
      {children}
    </li>
  )
}

/**
 * Trocar a própria cidade-casa: busca, e o aviso de recálculo ANTES de gravar
 * (R12). Usado aqui e em Meu perfil.
 */
export function ChangeHomeCity({ ctx, onClose }: { ctx: TabContext; onClose: () => void }) {
  const { api, update, me } = ctx
  const [picked, setPicked] = useState<City | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm(city: City) {
    setBusy(true)
    setError(null)
    const result = await api.updateProfile({ homeCityId: city.id })
    setBusy(false)
    if (result.status === 'ok') {
      update((d) => ({
        ...d,
        couple: {
          ...d.couple,
          members: d.couple.members.map((m) => (m.profileId === me.profileId ? { ...m, homeCity: city } : m)),
        },
      }))
      onClose()
      return
    }
    setError(
      result.status === 'invalid' || result.status === 'color_taken'
        ? 'A cidade não foi aceita.'
        : failureMessage(result),
    )
  }

  return (
    <Dialog title="Trocar sua cidade" onClose={onClose}>
      {picked === null ? (
        <CitySearch
          label="Cidade onde você mora"
          search={api.searchCities}
          excluded={new Map([[me.homeCity.id, 'sua cidade atual']])}
          onPick={setPicked}
        />
      ) : (
        <div className="st-dialog-form">
          <p>
            Sua casa passa a ser <strong>{cityLabel(picked)}</strong>.
          </p>
          <p className="st-warning">
            Isso recalcula a história inteira: dias em que vocês estavam juntos em {me.homeCity.name} passam a contar
            como viajando juntos. Nenhuma estadia é apagada, e dá pra desfazer trocando de novo.
          </p>
          <FieldError message={error} />
          <div className="st-dialog-actions">
            <Button onClick={() => setPicked(null)}>Escolher outra</Button>
            <Button variant="primary" disabled={busy} onClick={() => void confirm(picked)}>
              {busy ? 'Trocando…' : 'Trocar cidade'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  )
}
