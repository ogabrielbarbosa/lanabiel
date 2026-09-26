// Tela que o desenho NÃO tem. O rodapé do frame `Login` já oferece "Criar
// conta", mas o fluxo desenhado era link mágico e não tinha para onde ir. Com
// o ADR 0004 ela passa a existir, no padrão do painel vizinho. Ver seção 13 da
// spec: é um dos três pontos a ajustar no Pencil.

import { useState } from 'react'
import { AuthShell } from './AuthShell'
import type { Credentials, SignUpResult } from './signIn'

/** Espelha `minimum_password_length` do config.toml. Feedback instantâneo na
 *  tela; a autoridade continua sendo o servidor, que recusa de novo. */
const MIN_PASSWORD = 12

function message(result: SignUpResult): string | null {
  switch (result.status) {
    case 'signed_in':
      return null
    case 'email_taken':
      return 'Já existe conta com esse e-mail. Volte e entre com ela.'
    case 'weak_password':
      return result.reason === 'leaked'
        ? 'Essa senha já apareceu em vazamentos conhecidos. Não é fraca — é conhecida. Escolha outra.'
        : `A senha precisa ter pelo menos ${MIN_PASSWORD} caracteres.`
    case 'invalid_email':
      return 'Esse e-mail não parece válido.'
    case 'rate_limited':
      return result.retryAfterSeconds
        ? `Muitas tentativas. Tente de novo em ${result.retryAfterSeconds} segundos.`
        : 'Muitas tentativas. Espere alguns minutos e tente de novo.'
    case 'error':
      return `Não deu pra criar a conta: ${result.cause}`
  }
}

export interface CriarContaProps {
  onSignUp: (creds: Credentials) => Promise<SignUpResult>
  onBack: () => void
}

export function CriarConta({ onSignUp, onBack }: CriarContaProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(message(await onSignUp({ email, password })))
    setBusy(false)
  }

  return (
    <AuthShell>
      <div className="auth-heading">
        <h1>Criar conta.</h1>
        <p>É só e-mail e senha. Quem vocês são e onde moram vem no passo seguinte.</p>
      </div>

      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="auth-field">
          <label htmlFor="signup-email">E-mail</label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="auth-field">
          <label htmlFor="signup-password">Senha</label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="auth-hint">
            Pelo menos {MIN_PASSWORD} caracteres. Uma frase que só vocês dois sabem vale mais que
            símbolo no meio da palavra.
          </p>
        </div>

        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="auth-btn auth-btn-primary"
          disabled={busy || tooShort || password.length === 0}
        >
          {busy ? 'Criando…' : 'Criar conta'}
        </button>
      </form>

      <div className="auth-footer">
        <div className="auth-footer-row">
          Já tem conta?
          <button type="button" className="auth-btn-link" onClick={onBack}>
            Entrar
          </button>
        </div>
        Ao continuar você concorda com os Termos e a Privacidade
      </div>
    </AuthShell>
  )
}
