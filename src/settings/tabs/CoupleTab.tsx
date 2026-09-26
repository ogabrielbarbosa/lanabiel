// Perfil do casal (MzQxz): capa, nome, começo do namoro, três toggles, os dois
// integrantes — e, quando o casal tem um só, o convite pendente (R22a).

import { useEffect, useRef, useState } from 'react'
import { CalendarHeart, Cake, Camera, Heart, House, Image, Send, Type, UserPlus, X } from 'lucide-react'
import type { OpenInvite } from '../../data/invites'
import type { DataResult } from '../../data/result'
import { cityLabel } from '../../data/cities'
import { LIMITS, formatInviteCode, isValidEmail, togetherFor } from '../../domain/onboarding'
import { coupleLabel, isCreator } from '../../domain/settings'
import { dayOfMonth, diffDays, longDateBR } from '../../lib/date'
import { dayMonth, shortDate } from '../../onboarding/format'
import { Avatar, Button, Card, Dialog, FieldError, TextField, Toggle } from '../parts'
import { failureMessage } from '../context'
import type { TabContext } from '../context'

export function CoupleTab(ctx: TabContext) {
  const { data, api, writes, update, today, me } = ctx
  const { couple, coupleSettings: cs } = data
  const alone = couple.members.length < 2

  const saveSetting = (key: 'remindAnniversary' | 'showHomeCounter' | 'useCoupleCover', value: boolean) =>
    writes.run(key, async () => {
      const result = await api.updateCoupleSettings({ [key]: value })
      if (result.status === 'ok') {
        update((d) => ({ ...d, coupleSettings: result.value }))
        return null
      }
      return result.status === 'invalid' ? result.cause : failureMessage(result)
    })

  const saveCouple = (key: 'name' | 'startedOn', patch: { name: string | null } | { startedOn: string }) =>
    writes.run(key, async () => {
      const result = await api.updateCouple(couple.id, patch)
      if (result.status === 'ok') {
        update((d) => ({ ...d, couple: { ...d.couple, ...patch } }))
        return null
      }
      if (result.status === 'invalid') {
        return result.field === 'started_on'
          ? 'O começo do namoro não pode ser no futuro.'
          : `O nome pode ter até ${LIMITS.coupleName} caracteres.`
      }
      return failureMessage(result)
    })

  return (
    <div className="st-stack">
      <Cover {...ctx} />

      <div className="st-fields">
        <TextField
          label="Nome do casal (opcional)"
          icon={Type}
          value={couple.name ?? ''}
          placeholder={coupleLabel(null, couple.members)}
          maxLength={LIMITS.coupleName}
          pending={writes.pending('name')}
          error={writes.error('name')}
          onCommit={(next) => saveCouple('name', { name: next.trim() || null })}
        />
        <TextField
          label="Começo do namoro"
          icon={CalendarHeart}
          type="date"
          max={today}
          value={couple.startedOn}
          pending={writes.pending('startedOn')}
          error={writes.error('startedOn')}
          onCommit={(next) => {
            if (!next) return false
            if (next > today) return writes.run('startedOn', async () => 'O começo do namoro não pode ser no futuro.')
            return saveCouple('startedOn', { startedOn: next })
          }}
        />
      </div>

      <Card className="st-toggles">
        <Toggle
          icon={Cake}
          label="Lembrar do aniversário de namoro"
          hint={`Todo dia ${dayOfMonth(couple.startedOn)}, às 9h, pros dois`}
          checked={cs.remindAnniversary}
          pending={writes.pending('remindAnniversary')}
          error={writes.error('remindAnniversary')}
          onChange={(v) => void saveSetting('remindAnniversary', v)}
        />
        <Toggle
          icon={House}
          label="Mostrar contador na Home"
          hint={`“${togetherFor(couple.startedOn, today).replace(/^j/, 'J')}” no topo do globo`}
          checked={cs.showHomeCounter}
          pending={writes.pending('showHomeCounter')}
          error={writes.error('showHomeCounter')}
          onChange={(v) => void saveSetting('showHomeCounter', v)}
        />
        <Toggle
          icon={Image}
          label="Usar foto do casal na capa"
          hint={couple.coverPath ? 'Em vez das fotos separadas' : 'Suba uma foto do casal em “Trocar fotos”'}
          checked={cs.useCoupleCover}
          pending={writes.pending('useCoupleCover')}
          error={writes.error('useCoupleCover')}
          onChange={(v) => void saveSetting('useCoupleCover', v)}
        />
      </Card>

      <div className="st-members">
        {couple.members.map((m) => (
          <div key={m.profileId} className="st-member">
            <Avatar url={ctx.urls.avatar(m.profileId)} name={m.displayName} color={m.color} size={40} />
            <div>
              <p className="st-member-name">{m.fullName}</p>
              <p className="st-hint">
                {m.profileId === me.profileId ? 'Você · ' : ''}
                {isCreator(m, couple) ? 'criou o espaço' : `Entrou em ${shortDate(m.joinedAt.slice(0, 10))}`}
              </p>
              <p className="st-hint">{cityLabel(m.homeCity)}</p>
            </div>
          </div>
        ))}
        {alone && <PendingInvite {...ctx} />}
      </div>
    </div>
  )
}

/** A capa: avatares (ou a foto do casal) e "Trocar fotos". */
function Cover({ data, api, writes, update, urls, refreshUrls, today }: TabContext) {
  const { couple, coupleSettings } = data
  const input = useRef<HTMLInputElement>(null)
  const days = diffDays(couple.startedOn, today)
  const showCover = coupleSettings.useCoupleCover && urls.cover

  async function upload(file: File) {
    await writes.run('cover', async () => {
      const prepared = await api.prepareCover(file)
      if (prepared.status === 'not_image') return 'Esse arquivo não é uma imagem.'
      if (prepared.status === 'too_large') return 'A foto é grande demais (até 10 MB).'
      const result = await api.replaceCover(couple, prepared)
      if (result.status !== 'ok') return failureMessage(result)
      update((d) => ({ ...d, couple: { ...d.couple, coverPath: result.path } }))
      refreshUrls()
      return null
    })
  }

  return (
    <Card className="st-cover">
      <div className="st-cover-photos">
        {showCover ? (
          <img src={urls.cover!} alt="Foto do casal" className="st-cover-img" />
        ) : (
          couple.members.map((m) => (
            <Avatar key={m.profileId} url={urls.avatar(m.profileId)} name={m.displayName} color={m.color} size={72} />
          ))
        )}
        <span className="st-cover-heart" aria-hidden="true">
          <Heart size={14} />
        </span>
      </div>
      <div className="st-cover-text">
        <p className="st-cover-name">{coupleLabel(couple.name, couple.members)}</p>
        <p className="st-cover-since">
          <span className="st-hint">juntos há </span>
          <strong>{togetherFor(couple.startedOn, today).replace(/^juntos (há|desde) /, '')}</strong>
        </p>
        <p className="st-hint">
          desde {longDateBR(couple.startedOn)} · {days} dias
        </p>
        <FieldError message={writes.error('cover')} />
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label="Foto do casal"
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file) void upload(file)
        }}
      />
      <Button icon={Camera} onClick={() => input.current?.click()} disabled={writes.pending('cover')}>
        {writes.pending('cover') ? 'Enviando…' : 'Trocar fotos'}
      </Button>
    </Card>
  )
}

/**
 * O cartão da vaga, com o convite aberto (R22a). Convite é da pessoa
 * convidada (I11): cancelar o revoga; convidar outra pessoa cria um novo e o
 * banco revoga o anterior.
 */
function PendingInvite({ api, writes }: TabContext) {
  const [invite, setInvite] = useState<DataResult<OpenInvite | null> | null>(null)
  const [version, setVersion] = useState(0)
  const [dialog, setDialog] = useState<'cancel' | 'invite' | null>(null)

  useEffect(() => {
    let cancelled = false
    void api.loadOpenInvite().then((r) => {
      if (!cancelled) setInvite(r)
    })
    return () => {
      cancelled = true
    }
  }, [api, version])

  const reload = () => setVersion((v) => v + 1)

  if (invite === null) {
    return (
      <div className="st-member st-member--empty" aria-busy="true">
        <span className="st-hint">Carregando o convite…</span>
      </div>
    )
  }
  if (invite.status !== 'ok') {
    return (
      <div className="st-member st-member--empty" role="alert">
        <FieldError message={`Não deu pra ler o convite: ${failureMessage(invite)}`} />
        <Button onClick={reload}>Tentar de novo</Button>
      </div>
    )
  }

  const open = invite.rows
  return (
    <div className="st-member st-member--empty">
      <span className="st-member-slot" aria-hidden="true">
        <UserPlus size={18} />
      </span>
      <div>
        {open ? (
          <>
            <p className="st-member-name">Convite para {open.inviteeName ?? open.email}</p>
            <p className="st-hint">
              {open.inviteeName ? `${open.email} · ` : ''}expira em {dayMonth(open.expiresAt)}
            </p>
            <p className="st-invite-code">
              Código <strong>{formatInviteCode(open.code)}</strong>
            </p>
            {open.lastSentAt === null && (
              // O e-mail pode não ter saído (Resend no fim do roadmap). Dizer
              // "enviado" sem ter saído é a falha silenciosa que a Fase 2 proíbe.
              <p className="st-hint">O e-mail não foi enviado — passe o código por mensagem.</p>
            )}
          </>
        ) : (
          <>
            <p className="st-member-name">Ninguém convidado</p>
            <p className="st-hint">O espaço tem lugar para mais uma pessoa.</p>
          </>
        )}
        <FieldError message={writes.error('invite')} />
      </div>
      <div className="st-member-actions">
        {open && (
          <Button icon={X} onClick={() => setDialog('cancel')} disabled={writes.pending('invite')}>
            Cancelar convite
          </Button>
        )}
        <Button icon={Send} variant="primary" onClick={() => setDialog('invite')} disabled={writes.pending('invite')}>
          {open ? 'Convidar outra pessoa' : 'Convidar alguém'}
        </Button>
      </div>

      {dialog === 'cancel' && open && (
        <Dialog title="Cancelar o convite?" onClose={() => setDialog(null)}>
          <p>
            O código que foi para {open.email} deixa de valer agora. Se quiser, depois você convida outra pessoa.
          </p>
          <div className="st-dialog-actions">
            <Button onClick={() => setDialog(null)}>Voltar</Button>
            <Button
              variant="danger"
              onClick={() => {
                setDialog(null)
                void writes.run('invite', async () => {
                  const result = await api.cancelInvite()
                  if (result.status === 'cancelled' || result.status === 'none_open') {
                    reload()
                    return null
                  }
                  if (result.status === 'not_member') return 'Você não está mais neste espaço.'
                  return failureMessage(result)
                })
              }}
            >
              Cancelar convite
            </Button>
          </div>
        </Dialog>
      )}

      {dialog === 'invite' && (
        <InviteDialog
          replacing={open}
          onClose={() => setDialog(null)}
          onSubmit={async (input) => {
            const result = await api.createInvite(input)
            switch (result.status) {
              case 'created': {
                // O e-mail pode não sair (Resend no fim do roadmap): o convite
                // existe mesmo assim, e o código aparece no cartão da Aguardando.
                await api.sendInvite(result.inviteId)
                setDialog(null)
                reload()
                return null
              }
              case 'own_email':
                return 'Esse é o seu e-mail.'
              case 'invalid':
                return result.field === 'email' ? 'Esse e-mail não parece válido.' : 'O nome está comprido demais.'
              case 'couple_full':
                return 'O espaço já tem dois.'
              case 'not_member':
                return 'Você não está mais neste espaço.'
              default:
                return failureMessage(result)
            }
          }}
        />
      )}
    </div>
  )
}

function InviteDialog({
  replacing,
  onClose,
  onSubmit,
}: {
  replacing: OpenInvite | null
  onClose: () => void
  onSubmit: (input: { email: string; inviteeName: string | null }) => Promise<string | null>
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const valid = isValidEmail(email) && name.trim().length <= LIMITS.inviteeName

  return (
    <Dialog title={replacing ? 'Convidar outra pessoa' : 'Convidar alguém'} onClose={onClose}>
      <form
        className="st-dialog-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!valid) return
          setBusy(true)
          setError(await onSubmit({ email: email.trim(), inviteeName: name.trim() || null }))
          setBusy(false)
        }}
      >
        {replacing && (
          <p className="st-hint">O convite para {replacing.email} deixa de valer quando este for criado.</p>
        )}
        <label className="st-field">
          <span className="st-field-label">Nome (opcional)</span>
          <span className="st-input">
            <input value={name} maxLength={LIMITS.inviteeName} onChange={(e) => setName(e.target.value)} />
          </span>
        </label>
        <label className="st-field">
          <span className="st-field-label">E-mail</span>
          <span className="st-input">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </span>
        </label>
        <FieldError message={error} />
        <div className="st-dialog-actions">
          <Button onClick={onClose}>Voltar</Button>
          <Button type="submit" variant="primary" icon={Send} disabled={!valid || busy}>
            {busy ? 'Criando…' : 'Criar convite'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
