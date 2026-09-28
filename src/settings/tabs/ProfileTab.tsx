// Meu perfil (TXqEo): foto, nome de exibição, cidade, cor, e a conta.
//
// Não existe troca de e-mail (decisão de produto, spec seção 13): o e-mail é
// só leitura e o botão do frame não é renderizado.

import { useRef, useState } from 'react'
import { Camera, KeyRound, LogOut, Mail, MapPin, Type } from 'lucide-react'
import { cityLabel } from '../../data/cities'
import { MIN_PASSWORD } from '../../auth/signIn'
import { LIMITS } from '../../domain/onboarding'
import { PERSON_COLORS } from '../../domain/settings'
import type { PersonColor } from '../../domain/settings'
import { isCreator } from '../../domain/settings'
import { addDays, parseISODate } from '../../lib/date'
import { shortDate } from '../../onboarding/format'
import { Avatar, Button, Card, Dialog, FieldError, Swatches, TextField } from '../parts'
import { failureMessage } from '../context'
import type { TabContext } from '../context'
import { ChangeHomeCity } from './CitiesTab'

export function ProfileTab(ctx: TabContext) {
  const { data, api, writes, update, me, partner } = ctx
  const input = useRef<HTMLInputElement>(null)
  const [dialog, setDialog] = useState<'city' | 'password' | null>(null)

  const setMe = (patch: Partial<typeof me>) =>
    update((d) => ({
      ...d,
      couple: {
        ...d.couple,
        members: d.couple.members.map((m) => (m.profileId === me.profileId ? { ...m, ...patch } : m)),
      },
    }))

  async function uploadPhoto(file: File) {
    await writes.run('avatar', async () => {
      const prepared = await api.prepareAvatar(file)
      if (prepared.status === 'not_image') return 'Esse arquivo não é uma imagem.'
      if (prepared.status === 'too_large') return 'A foto é grande demais (até 10 MB).'
      const uploaded = await api.uploadAvatar(prepared)
      if (uploaded.status !== 'ok') return failureMessage(uploaded)
      const saved = await api.updateProfile({ avatarPath: uploaded.path })
      if (saved.status === 'invalid') return saved.cause
      // `color_taken` não vem de trocar a foto; o tipo só não sabe disso.
      if (saved.status === 'color_taken') return 'Não deu pra salvar a foto.'
      if (saved.status !== 'ok') return failureMessage(saved)
      setMe({ avatarPath: uploaded.path })
      ctx.refreshUrls()
      return null
    })
  }

  const saveName = (next: string) =>
    writes.run('displayName', async () => {
      const name = next.trim()
      if (!name) return 'O nome não pode ficar vazio.'
      const result = await api.updateProfile({ displayName: name })
      if (result.status === 'ok') {
        setMe({ displayName: name })
        return null
      }
      if (result.status === 'invalid') return `O nome pode ter até ${LIMITS.displayName} caracteres.`
      if (result.status === 'color_taken') return 'Não deu pra salvar o nome.'
      return failureMessage(result)
    })

  const saveColor = (color: PersonColor) =>
    writes.run('color', async () => {
      const result = await api.updateProfile({ color })
      if (result.status === 'ok') {
        setMe({ color })
        return null
      }
      if (result.status === 'color_taken') {
        // A outra pessoa escolheu essa cor segundos antes, noutro aparelho.
        ctx.reload()
        return `${partner?.displayName ?? 'A outra pessoa'} acabou de escolher essa cor.`
      }
      return result.status === 'invalid' ? result.cause : failureMessage(result)
    })

  return (
    <div className="st-stack">
      <Card className="st-cover">
        <div className="st-cover-photos">
          <Avatar url={ctx.urls.avatar(me.profileId)} name={me.displayName} color={me.color} size={72} />
        </div>
        <div className="st-cover-text">
          <p className="st-cover-name">{me.displayName}</p>
          <p className="st-hint">
            {me.fullName} · {isCreator(me, data.couple) ? 'criou o espaço' : 'entrou no espaço'} em{' '}
            {shortDate(me.joinedAt.slice(0, 10))}
          </p>
          <FieldError message={writes.error('avatar')} />
        </div>
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          aria-label="Sua foto"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void uploadPhoto(file)
          }}
        />
        <Button icon={Camera} onClick={() => input.current?.click()} disabled={writes.pending('avatar')}>
          {writes.pending('avatar') ? 'Enviando…' : 'Trocar foto'}
        </Button>
      </Card>

      <div className="st-fields">
        <TextField
          label="Nome de exibição"
          icon={Type}
          value={me.displayName}
          maxLength={LIMITS.displayName}
          pending={writes.pending('displayName')}
          error={writes.error('displayName')}
          onCommit={saveName}
        />
        <div className="st-field">
          <span className="st-field-label">Cidade onde moro</span>
          <button type="button" className="st-input st-input--button" onClick={() => setDialog('city')}>
            <MapPin size={15} aria-hidden="true" />
            <span>{cityLabel(me.homeCity)}</span>
          </button>
        </div>
      </div>

      <Card className="st-color">
        <div className="st-color-head">
          <div>
            <p className="st-row-label">Sua cor</p>
            <p className="st-row-hint">
              É a cor da sua faixa no calendário.
              {partner ? ` A ${partner.displayName} aparece ao lado, na cor dela.` : ''}
            </p>
          </div>
          <Swatches
            label="Sua cor"
            colors={PERSON_COLORS}
            value={me.color}
            disabledColors={partner ? [partner.color] : []}
            disabledHint={partner ? `a cor de ${partner.displayName}` : undefined}
            pending={writes.pending('color')}
            onChange={(c) => void saveColor(c as PersonColor)}
          />
        </div>
        <FieldError message={writes.error('color')} />
        <LanePreview today={ctx.today} people={[me, ...(partner ? [partner] : [])]} />
      </Card>

      <Card className="st-account">
        <div className="st-row">
          <span className="st-row-icon" aria-hidden="true">
            <Mail size={17} />
          </span>
          <div className="st-row-text">
            <span className="st-row-label">{data.me.email ?? 'sem e-mail'}</span>
            <span className="st-row-hint">E-mail de acesso · só leitura</span>
          </div>
        </div>
        <div className="st-row">
          <span className="st-row-icon" aria-hidden="true">
            <KeyRound size={17} />
          </span>
          <div className="st-row-text">
            <span className="st-row-label" aria-label="Senha">
              ••••••••••
            </span>
          </div>
          <Button onClick={() => setDialog('password')}>Alterar senha</Button>
        </div>
      </Card>

      <div>
        <Button icon={LogOut} variant="link" onClick={() => void api.signOut()}>
          Sair desta conta
        </Button>
      </div>

      {dialog === 'city' && <ChangeHomeCity ctx={ctx} onClose={() => setDialog(null)} />}
      {dialog === 'password' && <PasswordDialog ctx={ctx} onClose={() => setDialog(null)} />}
    </div>
  )
}

/** A semana de exemplo do frame: uma faixa por pessoa, na cor de cada uma. */
function LanePreview({ today, people }: { today: string; people: { displayName: string; color: string; homeCity: { name: string } }[] }) {
  const start = addDays(today, -parseISODate(today).getDay())
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="st-lanes" aria-label="Faixa de exemplo">
      <div className="st-lanes-days">
        {days.map((d) => (
          <span key={d}>{Number(d.slice(8))}</span>
        ))}
      </div>
      {people.map((p) => (
        <div key={p.displayName} className="st-lane" style={{ background: p.color }}>
          {p.displayName} · {p.homeCity.name}
        </div>
      ))}
    </div>
  )
}

function PasswordDialog({ ctx, onClose }: { ctx: TabContext; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null)
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD
  const mismatch = confirm.length > 0 && confirm !== password
  const valid = password.length >= MIN_PASSWORD && confirm === password

  return (
    <Dialog title="Alterar senha" onClose={onClose}>
      <form
        className="st-dialog-form"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!valid) return
          setBusy(true)
          const result = await ctx.api.changePassword(password)
          setBusy(false)
          switch (result.status) {
            case 'changed':
              setMessage({ kind: 'ok', text: 'Senha alterada. Esta sessão continua aberta.' })
              setPassword('')
              setConfirm('')
              break
            case 'weak_password':
              setMessage({
                kind: 'error',
                text:
                  result.reason === 'leaked'
                    ? 'Essa senha já apareceu em vazamentos conhecidos. Escolha outra.'
                    : `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`,
              })
              break
            case 'same_password':
              setMessage({ kind: 'error', text: 'Essa já é a sua senha.' })
              break
            case 'unauthenticated':
              setMessage({ kind: 'error', text: 'Sua sessão expirou. Entre de novo.' })
              break
            case 'error':
              setMessage({ kind: 'error', text: `Não deu pra alterar: ${result.cause}` })
              break
          }
        }}
      >
        <label className="st-field">
          <span className="st-field-label">Senha nova</span>
          <span className="st-input">
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              minLength={MIN_PASSWORD}
              onChange={(e) => setPassword(e.target.value)}
            />
          </span>
        </label>
        {tooShort && <p className="st-hint">Pelo menos {MIN_PASSWORD} caracteres.</p>}
        <label className="st-field">
          <span className="st-field-label">Repita a senha nova</span>
          <span className="st-input">
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </span>
        </label>
        {mismatch && <p className="st-hint">As duas não são iguais.</p>}
        {message?.kind === 'error' && <FieldError message={message.text} />}
        {message?.kind === 'ok' && (
          <p className="st-ok" role="status">
            {message.text}
          </p>
        )}
        <div className="st-dialog-actions">
          <Button onClick={onClose}>{message?.kind === 'ok' ? 'Fechar' : 'Cancelar'}</Button>
          <Button type="submit" variant="primary" disabled={!valid || busy}>
            {busy ? 'Alterando…' : 'Alterar senha'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
