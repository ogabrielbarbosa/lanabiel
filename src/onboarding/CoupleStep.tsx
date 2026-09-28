// Frame `C1 · 2 — Sobre a gente`. Cria o casal (R3).

import { useState } from 'react'
import { AuthShell } from '../auth/AuthShell'
import { Calendar, Heart } from '../auth/icons'
import { LIMITS, togetherFor } from '../domain/onboarding'
import type { OnboardingApi } from './api'
import { Field, StepProgress } from './parts'
import type { Progress } from './parts'

export interface CoupleStepProps {
  api: OnboardingApi
  progress: Progress
  notice: string | null
  onBack: () => void
  onDone: () => void
}

export function CoupleStep({ api, progress, notice, onBack, onDone }: CoupleStepProps) {
  const today = api.today()
  const [startedOn, setStartedOn] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Comparação lexicográfica de ISO — a mesma do resto do projeto.
  const future = startedOn !== '' && startedOn > today
  const valid = startedOn !== '' && !future && name.trim().length <= LIMITS.coupleName

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid) return
    setBusy(true)
    setError(null)
    const result = await api.createCouple({ startedOn, name: name.trim() || null })
    setBusy(false)
    switch (result.status) {
      // Duas abas: a outra já criou. O espaço existe, que é o que se queria.
      case 'created':
      case 'already_member':
        return onDone()
      case 'invalid':
        return setError(
          result.field === 'started_on'
            ? 'A data não pode ser no futuro.'
            : `O nome do casal tem até ${LIMITS.coupleName} caracteres.`,
        )
      case 'no_profile':
        return setError('Falta o seu perfil. Volte um passo.')
      case 'unauthenticated':
        return setError('Sua sessão caiu. Entre de novo pra continuar.')
      case 'error':
        return setError(`Não deu pra criar o espaço: ${result.cause}`)
    }
  }

  return (
    <AuthShell caption={{ title: 'Agora, o casal', subtitle: 'Quando começou e como se chama.' }}>
      <StepProgress {...progress} />
      {notice && <p className="onb-notice">{notice}</p>}
      <div className="auth-heading onb-heading">
        <h1>Sobre a gente</h1>
        <p>Com isso o app conta há quanto tempo vocês estão juntos. Dá pra mudar depois.</p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <Field
          label="Começo do namoro"
          htmlFor="casal-inicio"
          hint={
            future ? (
              <span className="onb-invalid">A data não pode ser no futuro.</span>
            ) : startedOn ? (
              <span className="onb-together">
                <Heart /> {togetherFor(startedOn, today)}
              </span>
            ) : null
          }
        >
          <div className="auth-input">
            <Calendar />
            <input
              id="casal-inicio"
              type="date"
              max={today}
              required
              value={startedOn}
              aria-invalid={future || undefined}
              onChange={(e) => setStartedOn(e.target.value)}
            />
          </div>
        </Field>

        <Field label="Nome do casal (opcional)" htmlFor="casal-nome">
          <div className="auth-input">
            <input
              id="casal-nome"
              placeholder="Rafa & Duda"
              maxLength={LIMITS.coupleName}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </Field>

        <p className="auth-hint onb-note">
          No próximo passo você manda o convite por e-mail. Quem receber confere esses dados ao entrar.
        </p>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <div className="onb-actions">
          <button type="button" className="lg auth-btn" onClick={onBack}>
            Voltar
          </button>
          <button type="submit" className="auth-btn auth-btn-primary" disabled={!valid || busy}>
            {busy ? 'Criando…' : 'Continuar'}
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
