// Frame `Login [LMpij]`. A copy é a do desenho, menos a do link mágico, que
// saiu no ADR 0004 — ver seção 13 da spec para os pontos de divergência.

import { useState } from 'react'
import { AuthField, AuthShell } from './AuthShell'
import { Apple, GoogleG, KeyRound, LogIn, Mail } from './icons'
import type { Credentials, Provider, SignInResult } from './signIn'

const PROVIDER_LABEL: Record<Provider, string> = {
  google: 'Continuar com Google',
  apple: 'Continuar com Apple',
}

const PROVIDER_ICON: Record<Provider, React.ReactNode> = {
  google: <GoogleG />,
  apple: <Apple />,
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
  /**
   * Há um código de convite guardado (link do e-mail). A tela diz para que se
   * está entrando; os nomes do convite só aparecem DEPOIS do login — resolver
   * código sem sessão abriria força bruta anônima (Fase 2, seção 9).
   */
  inviteContext?: boolean
}

export function Login({ providers, onSignIn, onProvider, onCreateAccount, inviteContext = false }: LoginProps) {
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
    <AuthShell caption={inviteContext ? { title: 'Oi!', subtitle: 'Entre pra aceitar o convite.' } : undefined}>
      {inviteContext ? (
        <div className="auth-heading">
          <h1>Entre pra aceitar o convite</h1>
          <p>
            Use a conta com que você quer ficar no espaço de vocês. O código fica guardado — depois
            de entrar, você vê o convite.
          </p>
        </div>
      ) : (
        <div className="auth-heading">
          <h1>Pra quem ama de longe.</h1>
          <p>
            O cantinho privado de vocês dois: lugares, viagens e os dias que faltam pro próximo
            abraço.
          </p>
        </div>
      )}

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
                {PROVIDER_ICON[provider]}
                {PROVIDER_LABEL[provider]}
              </button>
            ))}
          </div>
          <div className="auth-divider">ou com e-mail</div>
        </>
      )}

      <form className="auth-form" onSubmit={handleSubmit}>
        <AuthField
          id="login-email"
          label="E-mail"
          icon={<Mail />}
          type="email"
          autoComplete="email"
          placeholder="voce@email.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <AuthField
          id="login-password"
          label="Senha"
          icon={<KeyRound />}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* `role="alert"` para o erro ser anunciado, não só pintado de vermelho. */}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="auth-btn auth-btn-primary" disabled={busy}>
          <LogIn />
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
        <p className="auth-legal">Ao continuar você concorda com os Termos e a Privacidade</p>
      </div>
    </AuthShell>
  )
}
