// Frames `C1 · 1 — Meu perfil` e `C2 · 3 — Perfil da Lana`. Um componente, dois
// contextos: quem cria o espaço e quem entra por convite.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, R2, seção 6 (dois nomes, copy sem
// gênero) e seção 7 (foto que falha no upload).

import { useState } from 'react'
import { AuthShell } from '../auth/AuthShell'
import { User } from '../auth/icons'
import type { City } from '../data/cities'
import { fitsLimit, LIMITS } from '../domain/onboarding'
import type { OnboardingApi } from './api'
import { initialsOf } from './format'
import { AvatarPicker, CitySearch, Field, StepProgress } from './parts'
import type { PickedAvatar, Progress } from './parts'

export interface PerfilProps {
  api: OnboardingApi
  progress: Progress
  /** Quem convidou, quando se chega por convite. Muda a copy, não o formulário. */
  inviterName: string | null
  /** Perfil criado. `notice` é o aviso que a próxima tela mostra, se houver. */
  onDone: (notice: string | null) => void
}

export function Perfil({ api, progress, inviterName, onDone }: PerfilProps) {
  const [fullName, setFullName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [city, setCity] = useState<City | null>(null)
  const [avatar, setAvatar] = useState<PickedAvatar | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid =
    fitsLimit(fullName, LIMITS.fullName) && fitsLimit(displayName, LIMITS.displayName) && city !== null

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid || !city) return
    setBusy(true)
    setError(null)

    // A foto é opcional: se não subir, o perfil nasce sem ela e a próxima tela
    // avisa. Travar o cadastro por causa de uma foto seria o erro maior.
    let avatarPath: string | null = null
    let notice: string | null = null
    if (avatar) {
      const uploaded = await api.uploadAvatar(avatar)
      if (uploaded.status === 'ok') avatarPath = uploaded.path
      else notice = 'A foto não subiu — seguimos sem ela. Dá pra pôr depois.'
    }

    const result = await api.createProfile({ fullName, displayName, homeCityId: city.id, avatarPath })
    setBusy(false)
    switch (result.status) {
      case 'created':
      case 'already_exists':
        return onDone(notice)
      case 'invalid':
        return setError('Algum campo passou do tamanho. Confere e tenta de novo.')
      case 'unauthenticated':
        return setError('Sua sessão caiu. Entre de novo pra continuar.')
      case 'error':
        return setError(`Não deu pra salvar: ${result.cause}`)
    }
  }

  const caption = inviterName
    ? { title: 'Oi!', subtitle: 'Só mais dois passos.' }
    : { title: displayName.trim() ? `Oi, ${displayName.trim()}.` : 'Oi!', subtitle: 'Vamos montar o cantinho de vocês.' }

  return (
    <AuthShell caption={caption}>
      <StepProgress {...progress} />
      <div className="auth-heading onb-heading">
        <h1>Primeiro, você</h1>
        <p>
          Isso aparece {inviterName ? `pra ${inviterName}` : 'pro seu amor'} e ajuda o calendário a saber onde
          você está em cada dia.
        </p>
      </div>

      <form className="auth-form" onSubmit={submit}>
        <AvatarPicker api={api} value={avatar} onChange={setAvatar} initials={initialsOf(fullName)} />

        <div className="onb-row">
          <Field label="Nome" htmlFor="perfil-nome">
            <div className="auth-input">
              <User />
              <input
                id="perfil-nome"
                autoComplete="name"
                placeholder="Nome e sobrenome"
                maxLength={LIMITS.fullName}
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          </Field>
          <Field label="Como te chamam" htmlFor="perfil-apelido">
            <div className="auth-input">
              <input
                id="perfil-apelido"
                autoComplete="nickname"
                placeholder="Apelido"
                maxLength={LIMITS.displayName}
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          </Field>
        </div>

        <CitySearch api={api} value={city} onChange={setCity} />
        <p className="auth-hint onb-note">
          O calendário usa sua cidade pra mostrar quando vocês estão juntos ou separados. Dá pra mudar depois.
        </p>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="auth-btn auth-btn-primary" disabled={!valid || busy}>
          {busy ? 'Salvando…' : 'Continuar'}
        </button>
      </form>
    </AuthShell>
  )
}
