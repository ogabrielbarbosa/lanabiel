// Frames `C1 · 3 — Convidar`, `C1 · 4 — Convite enviado`, `Estado — Enviando
// convite` e o banner "Aguardando a Lana entrar" da Home — que vira tela
// própria, porque a Home desenhada ainda não existe (spec, seção 14).
//
// Uma tela só para os quatro porque eles são o MESMO estado do banco
// (`awaiting_partner`) visto em momentos diferentes. Recarregar no meio do
// assistente cai aqui, e aqui se retoma: sem convite → formulário; com
// convite → código; expirado → renovar (R10).
//
// R5 é a regra que manda nesta tela: "enviado" só aparece quando o provedor
// aceitou (`lastSentAt` preenchido, ou `sent` agora). Até lá, o código está na
// tela e a pessoa manda pelo WhatsApp.

import { useEffect, useState } from 'react'
import { AuthShell } from '../auth/AuthShell'
import { Copy, Mail, MessageCircle, Send, User } from '../auth/icons'
import type { OpenInvite, SendInviteResult } from '../data/invites'
import { formatInviteCode, isValidEmail, LIMITS } from '../domain/onboarding'
import type { OnboardingApi } from './api'
import { ago, dayMonth } from './format'
import { CodeBoxes, Field, StepProgress } from './parts'
import type { Progress } from './parts'

export interface AguardandoProps {
  api: OnboardingApi
  /** Presente quando se chega pelo assistente de criação (passos 3 e 4). */
  wizard: { invite: Progress; sent: Progress } | null
  notice: string | null
  onEnterApp: () => void
  /** O mesmo "Trocar de conta" da Escolha. Sem ele, quem está esperando não
   * teria saída: a timeline antiga também não tem logout. */
  onSignOut: () => void
}

type View =
  | { kind: 'loading' }
  | { kind: 'failed'; cause: string }
  | { kind: 'form'; replacing: OpenInvite | null }
  /** `now`: o instante da leitura. "Expirou?" se decide contra ele, e não
   * contra `Date.now()` no render — que mudaria a tela a cada renderização. */
  | { kind: 'invite'; invite: OpenInvite; now: number }

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'failed'; message: string }

function toView(result: Awaited<ReturnType<OnboardingApi['loadOpenInvite']>>, now: number): View {
  if (result.status === 'ok') {
    return result.rows ? { kind: 'invite', invite: result.rows, now } : { kind: 'form', replacing: null }
  }
  return { kind: 'failed', cause: result.status === 'error' ? result.cause : 'Sua sessão caiu.' }
}

function sendFailureMessage(result: Exclude<SendInviteResult, { status: 'sent' }>): string {
  switch (result.status) {
    case 'send_failed':
      return 'O provedor de e-mail recusou a mensagem.'
    case 'rate_limited':
      return `Espere ${result.retryAfterS} s antes de tentar de novo.`
    case 'not_pending':
      return 'Esse convite não está mais aberto.'
    case 'not_member':
    case 'unauthenticated':
      return 'Sua sessão caiu. Entre de novo pra continuar.'
    case 'error':
      return `Não deu pra falar com o servidor de e-mail: ${result.cause}`
  }
}

export function Aguardando({ api, wizard, notice, onEnterApp, onSignOut }: AguardandoProps) {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [send, setSend] = useState<SendState>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    void api.loadOpenInvite().then((result) => {
      if (!cancelled) setView(toView(result, Date.now()))
    })
    return () => {
      cancelled = true
    }
  }, [api])

  async function reload() {
    setView(toView(await api.loadOpenInvite(), Date.now()))
  }

  async function deliver(inviteId: string) {
    setSend({ kind: 'sending' })
    const result = await api.sendInvite(inviteId)
    if (result.status === 'sent') setSend({ kind: 'idle' })
    else setSend({ kind: 'failed', message: sendFailureMessage(result) })
    await reload()
  }

  async function renewAndSend() {
    setSend({ kind: 'sending' })
    const renewed = await api.renewInvite()
    if (renewed.status !== 'renewed') {
      setSend({
        kind: 'failed',
        message: renewed.status === 'error' ? `Não deu pra renovar: ${renewed.cause}` : 'Não deu pra renovar o convite.',
      })
      return
    }
    await deliver(renewed.inviteId)
  }

  if (view.kind === 'loading') {
    return (
      <AuthShell caption={{ title: 'Um instante.', subtitle: 'Buscando o convite.' }}>
        <p className="auth-hint onb-center">Carregando…</p>
      </AuthShell>
    )
  }

  if (view.kind === 'failed') {
    return (
      <AuthShell caption={{ title: 'Hmm.', subtitle: 'Algo não carregou.' }}>
        <p className="auth-error" role="alert">
          Não deu pra carregar o convite: {view.cause}
        </p>
        <button type="button" className="auth-btn" onClick={() => void reload()}>
          Tentar de novo
        </button>
      </AuthShell>
    )
  }

  if (view.kind === 'form') {
    return (
      <InviteForm
        api={api}
        progress={wizard?.invite ?? null}
        notice={notice}
        replacing={view.replacing}
        onCancel={view.replacing ? () => setView({ kind: 'invite', invite: view.replacing!, now: Date.now() }) : null}
        onCreated={async (inviteId) => {
          await deliver(inviteId)
        }}
      />
    )
  }

  const { invite, now } = view
  const expired = new Date(invite.expiresAt).getTime() <= now
  const sent = invite.lastSentAt !== null && send.kind !== 'failed'
  const who = invite.inviteeName ?? 'seu amor'
  const pretty = formatInviteCode(invite.code)
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    `Criei nosso espaço no lanabiel ❤️ Entra com o código ${pretty}`,
  )}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(pretty)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const caption = expired
    ? { title: 'O convite expirou.', subtitle: 'Renove e mande de novo.' }
    : wizard && sent
      ? { title: 'Convite enviado.', subtitle: 'Pode ir entrando, seu amor chega depois.' }
      : { title: `Aguardando ${who} entrar.`, subtitle: 'O código já vale.' }

  return (
    <AuthShell caption={caption}>
      {wizard && <StepProgress {...wizard.sent} />}
      {notice && <p className="onb-notice">{notice}</p>}

      <div className="auth-heading onb-heading">
        {expired ? (
          <>
            <h1>O convite expirou</h1>
            <p>
              Convites valem por 7 dias. Renove pra mandar o mesmo código, com prazo novo, pra {invite.email}.
            </p>
          </>
        ) : sent ? (
          <>
            <h1>Convite enviado!</h1>
            <p>
              O e-mail pra {invite.email} já tem um link com o código dentro. Se preferir, mande o código direto:
            </p>
          </>
        ) : (
          <>
            <h1>O e-mail não saiu</h1>
            <p>O código já vale — mande direto pra {who}, ou tente o e-mail de novo.</p>
          </>
        )}
      </div>

      {send.kind === 'failed' && (
        <p className="auth-error" role="alert">
          {send.message}
        </p>
      )}

      <div className="onb-card">
        <div className="onb-card-row">
          <span>Código de convite</span>
          <span>{expired ? 'expirado' : `vale até ${dayMonth(invite.expiresAt)}`}</span>
        </div>
        <CodeBoxes code={invite.code} />
        {!expired && (
          <div className="onb-actions">
            <button type="button" className="auth-btn onb-btn-small" onClick={() => void copy()}>
              <Copy />
              {copied ? 'Copiado' : 'Copiar código'}
            </button>
            <a className="auth-btn onb-btn-small" href={whatsapp} target="_blank" rel="noreferrer">
              <MessageCircle />
              Enviar pelo WhatsApp
            </a>
          </div>
        )}
      </div>

      {sent && !expired && invite.lastSentAt && (
        <p className="auth-hint">
          Mandado pra {invite.email} · {ago(invite.lastSentAt, now)} · vale até {dayMonth(invite.expiresAt)}
        </p>
      )}

      <div className="onb-actions">
        {expired ? (
          <button
            type="button"
            className="auth-btn auth-btn-primary"
            disabled={send.kind === 'sending'}
            onClick={() => void renewAndSend()}
          >
            <Send />
            {send.kind === 'sending' ? 'Renovando…' : 'Renovar convite'}
          </button>
        ) : (
          <button
            type="button"
            className="auth-btn"
            disabled={send.kind === 'sending'}
            onClick={() => void (sent ? renewAndSend() : deliver(invite.id))}
          >
            <Send />
            {send.kind === 'sending' ? 'Enviando…' : sent ? 'Reenviar' : 'Tentar de novo'}
          </button>
        )}
        <button type="button" className="auth-btn" onClick={() => setView({ kind: 'form', replacing: invite })}>
          Trocar e-mail
        </button>
      </div>

      <button type="button" className="auth-btn auth-btn-primary onb-bottom" onClick={onEnterApp}>
        {wizard ? 'Entrar no app' : 'Continuar pro app'}
      </button>

      <div className="auth-footer-row onb-signout">
        Não é você?
        <button type="button" className="auth-btn-link" onClick={onSignOut}>
          Trocar de conta
        </button>
      </div>
    </AuthShell>
  )
}

function InviteForm({
  api,
  progress,
  notice,
  replacing,
  onCancel,
  onCreated,
}: {
  api: OnboardingApi
  progress: Progress | null
  notice: string | null
  replacing: OpenInvite | null
  onCancel: (() => void) | null
  onCreated: (inviteId: string) => Promise<void>
}) {
  const [inviteeName, setInviteeName] = useState(replacing?.inviteeName ?? '')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = isValidEmail(email) && inviteeName.trim().length <= LIMITS.inviteeName

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    const result = await api.createInvite({ email: email.trim(), inviteeName: inviteeName.trim() || null })
    switch (result.status) {
      case 'created':
        await onCreated(result.inviteId)
        break
      case 'own_email':
        setError('Esse é o seu e-mail. Coloque o do seu amor.')
        break
      case 'invalid':
        setError(result.field === 'email' ? 'Esse e-mail não parece válido.' : 'O nome está comprido demais.')
        break
      case 'couple_full':
        setError('O espaço já tem dois. Não precisa mais de convite.')
        break
      case 'not_member':
      case 'unauthenticated':
        setError('Sua sessão caiu. Entre de novo pra continuar.')
        break
      case 'error':
        setError(`Não deu pra criar o convite: ${result.cause}`)
        break
    }
    setBusy(false)
  }

  return (
    <AuthShell caption={{ title: 'Falta só seu amor.', subtitle: 'Mande o convite por e-mail.' }}>
      {progress && <StepProgress {...progress} />}
      {notice && <p className="onb-notice">{notice}</p>}
      <div className="auth-heading onb-heading">
        <h1>{replacing ? 'Trocar o e-mail' : 'Convide seu amor'}</h1>
        <p>
          {replacing
            ? `O código que foi pra ${replacing.email} deixa de valer, e um novo vai pro e-mail certo.`
            : 'Mandamos um e-mail com um link. O código vai junto, pra ninguém precisar digitar.'}
        </p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <Field label="Nome de quem você vai convidar (opcional)" htmlFor="convite-nome">
          <div className="auth-input">
            <User />
            <input
              id="convite-nome"
              maxLength={LIMITS.inviteeName}
              value={inviteeName}
              onChange={(e) => setInviteeName(e.target.value)}
            />
          </div>
        </Field>
        <Field label="E-mail" htmlFor="convite-email">
          <div className="auth-input">
            <Mail />
            <input
              id="convite-email"
              type="email"
              autoComplete="off"
              placeholder="amor@email.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </Field>
        <p className="auth-hint onb-note">Só quem tiver o link ou o código entra. O convite vale por 7 dias.</p>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <div className="onb-actions">
          {onCancel && (
            <button type="button" className="auth-btn" onClick={onCancel}>
              Voltar
            </button>
          )}
          <button type="submit" className="auth-btn auth-btn-primary" disabled={!valid || busy}>
            <Send />
            {busy ? 'Enviando convite…' : 'Enviar convite'}
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
