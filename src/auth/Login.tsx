// Frame `Login [LMpij]`. A copy é a do desenho, menos a do link mágico, que
// saiu no ADR 0004 — ver seção 13 da spec para os pontos de divergência.

import { useState } from 'react'
import { AuthShell } from './AuthShell'
import type { Credentials, Provider, SignInResult } from './signIn'

const PROVIDER_LABEL: Record<Provider, string> = {
  google: 'Continuar com Google',
  apple: 'Continuar com Apple',
}

function message(result: SignInResult): string | null {
  switch (result.status) {
    case 'signed_in':
      return null
    case 'invalid_credentials':
      return 'E-mail ou senha não conferem.'
    case 'rate_limited':
      return result.retryAfterSeconds
        ? `Muitas tentativas. Tente de novo em ${result.retryAfterSeconds} segundos.`
        : 'Muitas tentativas. Espere alguns minutos e tente de novo.'
    case 'error':
      return `Não deu pra entrar: ${result.cause}`
  }
}

export interface LoginProps {
  /** Vazio é válido: a tela mostra só e-mail e senha (R1). */
  providers: readonly Provider[]
  onSignIn: (creds: Credentials) => Promise<SignInResult>
  onProvider: (provider: Provider) => void
  onCreateAccount: () => void
}

export function Login({ providers, onSignIn, onProvider, onCreateAccount }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(message(await onSignIn({ email, password })))
    setBusy(false)
  }

  return (
    <AuthShell>
      <div className="auth-heading">
        <h1>Pra quem ama de longe.</h1>
        <p>
          O cantinho privado de vocês dois: lugares, viagens e os dias que faltam pro próximo
          abraço.
        </p>
      </div>

      {providers.length > 0 && (
        <>
          <div className="auth-providers">
            {providers.map((provider) => (
              <button
                key={provider}
                type="button"
                className="auth-btn"
                onClick={() => onProvider(provider)}
              >
                {PROVIDER_LABEL[provider]}
              </button>
            ))}
          </div>
          <div className="auth-divider">ou com e-mail</div>
        </>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="login-email">E-mail</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="login-password">Senha</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {/* `role="alert"` para o erro ser anunciado, não só pintado de vermelho. */}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="auth-btn auth-btn-primary" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <div className="auth-footer">
        <div className="auth-footer-row">
          Primeira vez aqui?
          <button type="button" className="auth-btn-link" onClick={onCreateAccount}>
            Criar conta
          </button>
        </div>
        Ao continuar você concorda com os Termos e a Privacidade
      </div>
    </AuthShell>
  )
}
