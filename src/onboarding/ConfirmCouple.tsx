// Frames `C2 · 4 — Confirmar dados` e `C2 · 5 — Tudo pronto` (R11).
//
// Quem acabou de entrar confere a data e o nome que o outro preencheu. A copy
// do desenho dizia "ele recebe um aviso" — não há avisos nesta fase (spec,
// seção 14), então a frase sai em vez de prometer o que não acontece.

import { useEffect, useState } from 'react'
import { AuthShell } from '../auth/AuthShell'
import { Calendar, Heart, MapPin } from '../auth/icons'
import type { CoupleView, MemberView } from '../data/couple'
import { distanceKm, LIMITS, togetherFor } from '../domain/onboarding'
import type { OnboardingApi } from './api'
import { shortDate } from './format'
import { Field, StepProgress } from './parts'
import type { Progress } from './parts'

type Load = { kind: 'loading' } | { kind: 'ok'; couple: CoupleView } | { kind: 'failed'; cause: string }

/** Carrega o casal — a menos que a tela anterior já o tenha. */
function useCouple(api: OnboardingApi, known: CoupleView | null = null) {
  const [load, setLoad] = useState<Load>(known ? { kind: 'ok', couple: known } : { kind: 'loading' })
  useEffect(() => {
    if (known) return
    let cancelled = false
    void api.loadCouple().then((result) => {
      if (cancelled) return
      if (result.status === 'ok' && result.rows) setLoad({ kind: 'ok', couple: result.rows })
      else setLoad({ kind: 'failed', cause: result.status === 'error' ? result.cause : 'casal não encontrado' })
    })
    return () => {
      cancelled = true
    }
  }, [api, known])
  return load
}

function Loading({ load }: { load: Exclude<Load, { kind: 'ok' }> }) {
  return (
    <AuthShell caption={{ title: 'Buscando o espaço', subtitle: '' }}>
      {load.kind === 'failed' ? (
        <p className="auth-error" role="alert">
          Não deu pra carregar o espaço: {load.cause}
        </p>
      ) : (
        <p className="auth-hint onb-center">Carregando…</p>
      )}
    </AuthShell>
  )
}

export interface ConfirmCoupleProps {
  api: OnboardingApi
  progress: Progress
  /** O perfil de quem acabou de entrar — o "outro" é quem convidou. */
  selfProfileId: string | null
  notice: string | null
  /** O casal como ficou (com a edição, se houve) — Tudo pronto não relê. */
  onDone: (couple: CoupleView) => void
}

export function ConfirmCouple({ api, progress, selfProfileId, notice, onDone }: ConfirmCoupleProps) {
  const load = useCouple(api)
  if (load.kind !== 'ok') return <Loading load={load} />
  return (
    <ConfirmCoupleForm
      api={api}
      progress={progress}
      couple={load.couple}
      selfProfileId={selfProfileId}
      notice={notice}
      onDone={onDone}
    />
  )
}

function otherMember(couple: CoupleView, selfProfileId: string | null): MemberView | undefined {
  // Sem id conhecido, o "outro" é o slot 1: quem entra por convite é sempre o 2.
  return couple.members.find((m) => (selfProfileId ? m.profileId !== selfProfileId : m.slot === 1))
}

function ConfirmCoupleForm({
  api,
  progress,
  couple,
  selfProfileId,
  notice,
  onDone,
}: ConfirmCoupleProps & { couple: CoupleView }) {
  const today = api.today()
  const inviter = otherMember(couple, selfProfileId)
  const inviterName = inviter?.displayName ?? 'Seu amor'
  const [startedOn, setStartedOn] = useState(couple.startedOn)
  const [name, setName] = useState(couple.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const future = startedOn > today
  const changed = startedOn !== couple.startedOn || (name.trim() || null) !== couple.name
  const valid = startedOn !== '' && !future && name.trim().length <= LIMITS.coupleName

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    if (!changed) return onDone(couple)
    setBusy(true)
    const result = await api.updateCouple({ coupleId: couple.id, startedOn, name: name.trim() || null })
    setBusy(false)
    if (result.status === 'ok') return onDone({ ...couple, startedOn, name: name.trim() || null })
    if (result.status === 'invalid') {
      return setError(result.field === 'started_on' ? 'A data não pode ser no futuro.' : 'O nome está comprido demais.')
    }
    setError(result.status === 'error' ? `Não deu pra salvar: ${result.cause}` : 'Sua sessão caiu.')
  }

  return (
    <AuthShell caption={{ title: 'Quase lá.', subtitle: `Confere se ${inviterName} acertou a data.` }}>
      <StepProgress {...progress} />
      {notice && <p className="onb-notice">{notice}</p>}
      <div className="auth-heading onb-heading">
        <h1>Confere com a gente</h1>
        <p>{inviterName} preencheu isso. Se algo estiver diferente, é só editar.</p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <Field
          label="Começo do namoro"
          htmlFor="confirmar-inicio"
          hint={
            future ? (
              <span className="onb-invalid">A data não pode ser no futuro.</span>
            ) : (
              <span className="onb-together">
                <Heart /> {togetherFor(startedOn, today)}
              </span>
            )
          }
        >
          <div className="auth-input">
            <Calendar />
            <input
              id="confirmar-inicio"
              type="date"
              max={today}
              required
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
            />
          </div>
        </Field>

        <Field label="Nome do casal" htmlFor="confirmar-nome">
          <div className="auth-input">
            <input
              id="confirmar-nome"
              maxLength={LIMITS.coupleName}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </Field>

        {inviter && (
          <div className="onb-readonly">
            <span>Cidade de {inviter.displayName}</span>
            <strong>
              <MapPin /> {inviter.city.name}
              {inviter.city.stateCode ? `, ${inviter.city.stateCode}` : ''}
            </strong>
          </div>
        )}

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="auth-btn auth-btn-primary" disabled={!valid || busy}>
          {busy ? 'Salvando…' : 'Tá tudo certo'}
        </button>
      </form>
    </AuthShell>
  )
}

export interface AllSetProps {
  api: OnboardingApi
  couple: CoupleView | null
  onEnter: () => void
}

/** `'juntos há 3 anos e 207 dias'` → `'3 anos'`; menos de um ano → nulo. */
function yearsLabel(together: string): string | null {
  const match = together.match(/^juntos há (\d+ anos?)/)
  return match ? match[1]! : null
}

export function AllSet({ api, couple: known, onEnter }: AllSetProps) {
  const load = useCouple(api, known)
  if (load.kind !== 'ok') return <Loading load={load} />

  const { couple } = load
  const [a, b] = couple.members
  const names = couple.members.map((m) => m.displayName).join(' & ')
  const title = couple.name ?? names
  const km = a && b ? distanceKm(a.city, b.city) : null
  const distance =
    km === null
      ? null
      : km === 0
        ? 'Vocês moram na mesma cidade.'
        : `Vocês moram a ${km.toLocaleString('pt-BR')} km um do outro.`
  const years = yearsLabel(togetherFor(couple.startedOn, api.today()))

  return (
    <AuthShell caption={{ title: `${title}.`, subtitle: 'Os dois já estão aqui.' }}>
      <div className="auth-heading onb-heading">
        <span className="onb-kicker">Você entrou no espaço {title}</span>
        <h1>Tudo pronto, {title}!</h1>
        <p>Agora o espaço tem as duas pessoas.{distance ? ` ${distance}` : ''}</p>
      </div>

      <div className="lg onb-card">
        <div className="onb-card-row">
          <span>Juntos desde</span>
          <strong>
            {shortDate(couple.startedOn)}
            {years ? ` · ${years}` : ''}
          </strong>
        </div>
        <div className="onb-card-row">
          <span>{couple.members.map((m) => m.displayName).join(' · ')}</span>
          <span>{couple.members.map((m) => m.city.name).join(' · ')}</span>
        </div>
      </div>

      <button type="button" className="auth-btn auth-btn-primary onb-bottom" onClick={onEnter}>
        Entrar
      </button>
    </AuthShell>
  )
}
