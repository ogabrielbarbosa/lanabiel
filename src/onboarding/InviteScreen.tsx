// Frames `C2 · 1 — Convite` e `C3 · 3 — Preview do espaço`, fundidos, mais os
// estados de `Estados e erros [S6AT2]`.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, R8, R9, R12, seção 7 e seção 9.
//
// O preview NUNCA é autorização: o aceite repete toda checagem no banco, e o
// que ele devolver substitui o que o preview mostrou.
//
// Divergências deliberadas do desenho, todas aprovadas (spec, seção 13):
// o preview vem DEPOIS do login; "Pedir novo convite" e "Falar com o Gabriel"
// saem (não há avisos nesta fase); a frase sobre O e 0 sai (o alfabeto já
// resolve); nenhuma copy presume gênero.

import { useEffect, useState } from 'react'
import { AuthShell } from '../auth/AuthShell'
import { Heart } from '../auth/icons'
import type { AcceptResult, InvitePreview, InviteRefusal, LookupResult } from '../data/invites'
import { formatInviteCode } from '../domain/onboarding'
import type { OnboardingApi } from './api'
import { dayMonth, dayMonthShort, shortDate } from './format'
import { CodeBoxes } from './parts'

export interface InviteScreenProps {
  api: OnboardingApi
  code: string
  /** Veio do link do e-mail (e não digitado)? Só muda a legenda. */
  fromLink: boolean
  /** A pessoa ainda não tem perfil: aceitar leva ao passo "Seu perfil" antes. */
  needsProfile: boolean
  onNeedProfile: (invite: InvitePreview) => void
  onJoined: (invite: InvitePreview) => void
  /** Descartar este código e voltar à Escolha (ou ao app, se já tem casal). */
  onDismiss: () => void
  /** Digitar outro código. */
  onRetype: () => void
  /** `true` quando sair é para aceitar com outra conta: o código fica guardado. */
  onSignOut: (keepInvite: boolean) => void
}

type State =
  | { kind: 'loading' }
  | { kind: 'valid'; invite: InvitePreview }
  | { kind: 'refused'; refusal: InviteRefusal }
  | { kind: 'failed'; cause: string }

function toState(result: LookupResult | AcceptResult): State | null {
  switch (result.status) {
    case 'valid':
      return { kind: 'valid', invite: result.invite }
    case 'not_found':
    case 'expired':
    case 'used':
    case 'own_couple':
    case 'already_member':
    case 'rate_limited':
      return { kind: 'refused', refusal: result }
    case 'unauthenticated':
      return { kind: 'failed', cause: 'Sua sessão caiu. Entre de novo pra continuar.' }
    case 'error':
      return { kind: 'failed', cause: result.cause }
    default:
      return null
  }
}

export function InviteScreen(props: InviteScreenProps) {
  const { api, code, fromLink, needsProfile, onNeedProfile, onJoined } = props
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    void api.lookupInvite(code).then((result) => {
      if (!cancelled) setState(toState(result) ?? { kind: 'failed', cause: 'resposta inesperada' })
    })
    return () => {
      cancelled = true
    }
  }, [api, code, attempt])

  async function accept(invite: InvitePreview) {
    if (needsProfile) return onNeedProfile(invite)
    setBusy(true)
    const result = await api.acceptInvite(code)
    setBusy(false)
    if (result.status === 'joined') return onJoined(invite)
    if (result.status === 'no_profile') return onNeedProfile(invite)
    setState(toState(result) ?? { kind: 'failed', cause: 'resposta inesperada' })
  }

  if (state.kind === 'loading') {
    return (
      <AuthShell caption={{ title: 'Um instante.', subtitle: 'Conferindo o código.' }}>
        <p className="auth-hint onb-center">Conferindo o código…</p>
      </AuthShell>
    )
  }

  if (state.kind === 'failed') {
    return (
      <AuthShell caption={{ title: 'Hmm.', subtitle: 'Não deu pra conferir.' }}>
        <p className="auth-error" role="alert">
          Não deu pra conferir o código: {state.cause}
        </p>
        <div className="onb-actions">
          <button type="button" className="auth-btn" onClick={props.onDismiss}>
            Voltar
          </button>
          <button type="button" className="auth-btn auth-btn-primary" onClick={() => setAttempt((n) => n + 1)}>
            Tentar de novo
          </button>
        </div>
      </AuthShell>
    )
  }

  if (state.kind === 'refused') return <Refusal {...props} refusal={state.refusal} />

  const invite = state.invite
  const space = invite.coupleName ? `o espaço ${invite.coupleName}` : 'o espaço de vocês'
  const caption = fromLink
    ? { title: 'Oi!', subtitle: 'Alguém quer dividir o mundo com você.' }
    : { title: 'Oi!', subtitle: `${invite.inviterName} te passou o código.` }

  return (
    <AuthShell caption={caption}>
      <div className="auth-heading onb-heading">
        <span className="onb-kicker">Convite privado</span>
        <h1>
          {invite.inviterName} te convidou para {space}
        </h1>
        <p>Confere se é mesmo seu amor antes de entrar.</p>
      </div>

      <div className="onb-card">
        <strong className="onb-card-title">{invite.coupleName ?? 'Espaço de vocês'}</strong>
        <span className="onb-card-sub">
          Espaço criado por {invite.inviterFullName}
          {invite.inviterCity ? ` · ${invite.inviterCity}` : ''}
        </span>
        <span className="onb-together">
          <Heart /> juntos desde {shortDate(invite.startedOn)}
        </span>
        <span className="onb-card-sub">
          Código {formatInviteCode(invite.code)} válido até {dayMonth(invite.expiresAt)}
        </span>
      </div>

      <div className="onb-actions onb-bottom">
        <button type="button" className="auth-btn" onClick={props.onDismiss}>
          Não é essa pessoa?
        </button>
        <button
          type="button"
          className="auth-btn auth-btn-primary"
          disabled={busy}
          onClick={() => void accept(invite)}
        >
          {busy ? 'Entrando…' : 'Aceitar convite'}
        </button>
      </div>
    </AuthShell>
  )
}

function Refusal({ refusal, code, onRetype, onDismiss, onSignOut }: InviteScreenProps & { refusal: InviteRefusal }) {
  const boxes = <CodeBoxes code={code} />

  switch (refusal.status) {
    case 'not_found':
      return (
        <AuthShell caption={{ title: 'Hmm.', subtitle: 'Esse código não bateu.' }}>
          <Heading title="Digite o código de convite" />
          {boxes}
          <Problem title="Esse código não existe">
            Confere se digitou certinho — é o código de 6 caracteres que seu amor recebeu.
          </Problem>
          <div className="onb-actions onb-bottom">
            <button type="button" className="auth-btn" onClick={onDismiss}>
              Voltar
            </button>
            <button type="button" className="auth-btn auth-btn-primary" onClick={onRetype}>
              Digitar de novo
            </button>
          </div>
        </AuthShell>
      )

    case 'expired':
      return (
        <AuthShell caption={{ title: 'Quase!', subtitle: 'Esse convite passou da validade.' }}>
          <Heading title="Digite o código de convite" />
          {boxes}
          <Problem title="Esse convite expirou">
            Convites valem por 7 dias. Esse foi criado por {refusal.inviterName} em{' '}
            {dayMonthShort(refusal.createdAt)} e expirou em {dayMonthShort(refusal.expiresAt)}. Peça um novo a{' '}
            {refusal.inviterName}.
          </Problem>
          <div className="onb-actions onb-bottom">
            <button type="button" className="auth-btn" onClick={onDismiss}>
              Voltar
            </button>
            <button type="button" className="auth-btn auth-btn-primary" onClick={onRetype}>
              Digitar outro código
            </button>
          </div>
        </AuthShell>
      )

    case 'used':
      return (
        <AuthShell caption={{ title: 'Opa.', subtitle: 'Esse espaço já tem dois.' }}>
          <Heading title="Digite o código de convite" />
          {boxes}
          <Problem title="Esse convite já foi usado">
            Alguém já entrou {refusal.coupleName ? `no espaço ${refusal.coupleName}` : 'nesse espaço'} com esse
            código. Se foi você, é só entrar com a mesma conta.
          </Problem>
          <div className="onb-actions onb-bottom">
            <button type="button" className="auth-btn" onClick={onDismiss}>
              Voltar
            </button>
            <button type="button" className="auth-btn auth-btn-primary" onClick={() => onSignOut(false)}>
              Entrar com outra conta
            </button>
          </div>
        </AuthShell>
      )

    case 'own_couple':
      return (
        <AuthShell caption={{ title: 'Esse é seu.', subtitle: 'Quem cria o espaço já está dentro.' }}>
          <Heading title="Esse é o código do seu espaço" />
          {boxes}
          <p className="auth-hint">Mande pra seu amor — é com esse código que seu amor entra.</p>
          <button type="button" className="auth-btn auth-btn-primary onb-bottom" onClick={onDismiss}>
            Voltar pro meu espaço
          </button>
        </AuthShell>
      )

    case 'already_member':
      return (
        <AuthShell caption={{ title: 'Opa.', subtitle: 'Você já tem um espaço.' }}>
          <Heading title="Você já está num espaço" />
          <Problem title={refusal.coupleName ? `Você já está no espaço ${refusal.coupleName}` : 'Esta conta já está num espaço'}>
            Cada conta fica num espaço só. Pra aceitar este convite, entre com a conta que você quer usar nele.
          </Problem>
          <div className="onb-actions onb-bottom">
            <button type="button" className="auth-btn" onClick={onDismiss}>
              Continuar no meu espaço
            </button>
            <button type="button" className="auth-btn auth-btn-primary" onClick={() => onSignOut(true)}>
              Trocar de conta
            </button>
          </div>
        </AuthShell>
      )

    case 'rate_limited':
      return (
        <AuthShell caption={{ title: 'Calma aí.', subtitle: 'Foram muitas tentativas.' }}>
          <Heading title="Muitas tentativas" />
          <Problem title="Espere um pouco">
            Por segurança, espere {Math.max(1, Math.ceil(refusal.retryAfterS / 60))} min antes de tentar outro
            código.
          </Problem>
          <button type="button" className="auth-btn onb-bottom" onClick={onDismiss}>
            Voltar
          </button>
        </AuthShell>
      )
  }
}

function Heading({ title }: { title: string }) {
  return (
    <div className="auth-heading onb-heading">
      <h1>{title}</h1>
    </div>
  )
}

function Problem({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // `h2`, não `strong`: é o título da situação para quem usa leitor de tela,
    // abaixo do `h1` que o desenho mantém ("Digite o código de convite").
    <div className="onb-problem" role="alert">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  )
}
