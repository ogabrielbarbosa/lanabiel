// A tela de consentimento do OAuth (ADR 0031). Fica atrás do `AuthGate`: quem
// chega sem sessão vê o Login e volta para cá, com o `authorization_id` ainda
// na URL. Não está no .pen; usa a moldura do Login.
//
// Spec: .agent/Tasks/mcp-server.md, R4 e A9

import { useEffect, useState } from 'react'
import { AuthShell } from './AuthShell'
import { authorizationIdFrom, hostOf } from './consentApi'
import type { ConsentApi, ConsentRequest } from './consentApi'

type View =
  | { status: 'loading' }
  | { status: 'ask'; request: ConsentRequest }
  | { status: 'leaving' }
  | { status: 'error'; message: string }

const CAPTION = { title: 'Pedido de acesso.', subtitle: 'Confira quem está pedindo antes de permitir.' }

export interface OAuthConsentProps {
  api: ConsentApi
  /** `window.location.search`, injetável no teste. */
  search?: string
}

export function OAuthConsent({ api, search = window.location.search }: OAuthConsentProps) {
  const authorizationId = authorizationIdFrom(search)
  const [view, setView] = useState<View>(() =>
    authorizationId
      ? { status: 'loading' }
      : { status: 'error', message: 'Este link não traz um pedido de acesso. Volte ao assistente e conecte de novo.' },
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!authorizationId) return
    let alive = true
    void api.details(authorizationId).then((result) => {
      if (!alive) return
      if (result.status === 'redirect') {
        setView({ status: 'leaving' })
        api.go(result.url)
      } else if (result.status === 'ask') {
        setView({ status: 'ask', request: result.request })
      } else {
        setView({ status: 'error', message: `Este pedido não vale mais. Volte ao assistente e conecte de novo. (${result.cause})` })
      }
    })
    return () => {
      alive = false
    }
  }, [api, authorizationId])

  async function decide(approve: boolean) {
    if (view.status !== 'ask') return
    setBusy(true)
    const id = view.request.authorizationId
    const result = approve ? await api.approve(id) : await api.deny(id)
    if (result.status === 'redirect') {
      setView({ status: 'leaving' })
      api.go(result.url)
      return
    }
    setBusy(false)
    setView({ status: 'error', message: `Não deu pra concluir: ${result.cause}` })
  }

  return (
    <AuthShell caption={CAPTION}>
      {view.status === 'loading' && (
        <p className="auth-hint" role="status">
          Carregando o pedido…
        </p>
      )}

      {view.status === 'leaving' && (
        <p className="auth-hint" role="status">
          Voltando para o assistente…
        </p>
      )}

      {view.status === 'error' && (
        <div className="auth-heading">
          <h1>Pedido de acesso</h1>
          <p className="auth-error" role="alert">
            {view.message}
          </p>
        </div>
      )}

      {view.status === 'ask' && (
        <>
          <div className="auth-heading">
            <h1>{view.request.clientName} quer acessar o lanabiel</h1>
            <p>
              Com o acesso, ele pode ler e alterar a Lista, a agenda e as viagens do espaço, em seu nome. Só permita se
              foi você que conectou agora.
            </p>
          </div>

          <dl className="auth-consent">
            <div>
              <dt>Volta para</dt>
              <dd>{hostOf(view.request.redirectUri)}</dd>
            </div>
            {view.request.scopes.length > 0 && (
              <div>
                <dt>Permissões pedidas</dt>
                <dd>{view.request.scopes.join(', ')}</dd>
              </div>
            )}
          </dl>

          <div className="auth-providers">
            <button type="button" className="auth-btn auth-btn-primary" disabled={busy} onClick={() => void decide(true)}>
              {busy ? 'Enviando…' : 'Permitir'}
            </button>
            <button type="button" className="lg auth-btn" disabled={busy} onClick={() => void decide(false)}>
              Recusar
            </button>
          </div>
        </>
      )}
    </AuthShell>
  )
}
