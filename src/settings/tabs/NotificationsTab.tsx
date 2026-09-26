// Notificações (Z84Ano). Preferências da PESSOA — só ela lê e edita (I1).
// Nada é enviado nesta fase: o envio vem com o agendador e o Resend, no fim
// do roadmap, e lê exatamente estas colunas.

import { Bell, Mail, Smartphone } from 'lucide-react'
import { NOTIFY_CHANNELS, NOTIFY_EVENTS, notifyColumn } from '../../domain/settings'
import type { NotifyChannel, NotifyColumn, NotifyEvent } from '../../domain/settings'
import type { ProfileSettingsPatch } from '../../data/settings'
import { Card, FieldError, Toggle } from '../parts'
import { failureMessage } from '../context'
import type { TabContext } from '../context'

const CHANNEL_LABEL: Record<NotifyChannel, string> = { app: 'No app', email: 'E-mail', push: 'Push' }
const CHANNEL_ICON = { app: Bell, email: Mail, push: Smartphone } as const

function eventText(event: NotifyEvent, partner: string, day: number): { label: string; hint?: string } {
  switch (event) {
    case 'partner_list_item':
      return { label: `${partner} adicionou item na lista` }
    case 'partner_done':
      return { label: 'Marcou algo como feito' }
    case 'partner_event':
      return { label: 'Criou ou mudou um evento' }
    case 'anniversary':
      return { label: 'Aniversário de namoro', hint: `Todo dia ${day}, às 9h, pros dois` }
    case 'trip_eve':
      return { label: 'Véspera de viagem', hint: 'Na noite anterior, com o que falta na mala' }
    case 'own_reminders':
      return { label: 'Lembretes que eu criei' }
  }
}

export function NotificationsTab(ctx: TabContext) {
  const { data, api, writes, update, partner } = ctx
  const ps = data.profileSettings
  const anniversaryOff = !data.coupleSettings.remindAnniversary
  const partnerName = partner?.displayName ?? 'A outra pessoa'

  const save = (key: string, patch: ProfileSettingsPatch) =>
    writes.run(key, async () => {
      const result = await api.updateProfileSettings(patch)
      if (result.status === 'ok') {
        update((d) => ({ ...d, profileSettings: result.value }))
        return null
      }
      return result.status === 'invalid' ? result.cause : failureMessage(result)
    })

  return (
    <div className="st-stack">
      <Card className="st-matrix">
        <table>
          <caption className="visually-hidden">Avisar quando…</caption>
          <thead>
            <tr>
              <th scope="col">Avisar quando…</th>
              {NOTIFY_CHANNELS.map((channel) => {
                const Icon = CHANNEL_ICON[channel]
                return (
                  <th key={channel} scope="col">
                    <Icon size={14} aria-hidden="true" />
                    <span>{CHANNEL_LABEL[channel]}</span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {NOTIFY_EVENTS.map((event) => {
              const { label, hint } = eventText(event, partnerName, Number(data.couple.startedOn.slice(8, 10)))
              const disabled = event === 'anniversary' && anniversaryOff
              return (
                <tr key={event} className={disabled ? 'st-matrix-off' : undefined}>
                  <th scope="row">
                    <span className="st-row-label">{label}</span>
                    {(hint || disabled) && (
                      <span className="st-row-hint">{disabled ? 'Desligado em Perfil do casal' : hint}</span>
                    )}
                    {NOTIFY_CHANNELS.map((channel) => (
                      <FieldError key={channel} message={writes.error(notifyColumn(event, channel))} />
                    ))}
                  </th>
                  {NOTIFY_CHANNELS.map((channel) => {
                    const column: NotifyColumn = notifyColumn(event, channel)
                    return (
                      <td key={channel}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={ps.notify[column]}
                          aria-label={`${label} — ${CHANNEL_LABEL[channel]}`}
                          className="st-toggle"
                          disabled={disabled || writes.pending(column)}
                          onClick={() => void save(column, { column, value: !ps.notify[column] })}
                        >
                          <span className="st-toggle-knob" />
                        </button>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Card className="st-toggles">
        <Toggle
          label={`Marcar “Avisar ${partner ? `a ${partner.displayName}` : 'a outra pessoa'}” por padrão ao salvar evento`}
          hint="A caixa já vem marcada no Novo evento; dá pra desmarcar na hora"
          checked={ps.notifyPartnerByDefault}
          pending={writes.pending('notifyPartnerByDefault')}
          error={writes.error('notifyPartnerByDefault')}
          onChange={(v) => void save('notifyPartnerByDefault', { notifyPartnerByDefault: v })}
        />
      </Card>
    </div>
  )
}
