// Spec: .agent/Tasks/fase-1-login.md, seção 5 e invariante I1.
//
// O portão. Decide, a cada carregamento, entre esqueleto, Login, Escolha e a
// tela de domínio — e a ordem importa: NENHUMA tela de domínio renderiza antes
// de `stage: 'ready'`. Não é zelo: `listStays` para quem não tem casal devolve
// `ok` com zero linhas, indistinguível de "o casal não tem estadias".
//
// `db` e `loadStage` entram por parâmetro para o teste poder dirigir a
// assinatura de sessão sem rede. O que o banco responde é provado à parte, em
// `supabase/tests/auth.test.ts`.

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAccountStage } from '../data/account'
import type { AccountStage } from '../data/account'
import type { DataResult } from '../data/result'
import type { Database } from '../lib/database.types'
import { consumeAuthCallback } from './callback'
import { CriarConta } from './CriarConta'
import { Escolha } from './Escolha'
import { Login } from './Login'
import {
  enabledProviders,
  signInWithPassword,
  signInWithProvider,
  signOut,
  signUpWithPassword,
} from './signIn'
import type { Provider } from './signIn'
import { subscribeToAuth } from './session'
import type { AuthState } from './session'
import './auth.css'

type Db = SupabaseClient<Database>

export interface AuthGateProps {
  db: Db
  /** Tela de domínio. Só renderiza com `stage: 'ready'`. */
  children: ReactNode
  loadStage?: (db: Db) => Promise<DataResult<AccountStage>>
  providers?: readonly Provider[]
}

function Skeleton() {
  // `loading` não é `signed_out` (I8). Sem este estado o Login aparece por um
  // instante em toda recarga de quem já está logado.
  return (
    <div className="auth auth-skeleton">
      <span className="auth-skeleton-mark" aria-hidden="true" />
      <span className="auth-hint">Carregando…</span>
    </div>
  )
}

export function AuthGate({ db, children, loadStage = loadAccountStage, providers }: AuthGateProps) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  const [showSignUp, setShowSignUp] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // O estágio é guardado JUNTO do usuário a que pertence, e derivado na
  // renderização. Guardar só o resultado exigiria limpá-lo ao trocar de conta,
  // e um `setState` dentro do efeito para isso é render em cascata — além de
  // deixar uma janela em que a tela mostra o estágio de quem já saiu. Assim a
  // obsolescência é impossível por construção, não por disciplina.
  const [stageFor, setStageFor] = useState<{
    userId: string
    result: DataResult<AccountStage>
  } | null>(null)

  const available = providers ?? enabledProviders(import.meta.env.VITE_AUTH_PROVIDERS)
  const userId = auth.status === 'signed_in' ? auth.userId : null
  const stage = stageFor !== null && stageFor.userId === userId ? stageFor.result : null

  // Volta do OAuth. Roda uma vez; sem `code` nem `error` na URL não toca no db.
  useEffect(() => {
    const replaceUrl = (href: string) =>
      window.history.replaceState(window.history.state, '', href)

    void consumeAuthCallback(db, new URL(window.location.href), replaceUrl).then((result) => {
      if (result.status === 'provider_denied') setNotice(`O provedor recusou: ${result.cause}`)
      if (result.status === 'error') setNotice(`Não deu pra concluir a entrada: ${result.cause}`)
    })
  }, [db])

  useEffect(() => subscribeToAuth(db, setAuth), [db])

  useEffect(() => {
    if (!userId) return
    // `cancelled` cobre o descarte da resposta em voo quando o efeito é
    // refeito; o par `{ userId, result }` cobre o resto.
    let cancelled = false
    void loadStage(db).then((result) => {
      if (!cancelled) setStageFor({ userId, result })
    })
    return () => {
      cancelled = true
    }
  }, [db, userId, loadStage])

  function renderLogin() {
    return showSignUp ? (
      <CriarConta
        onSignUp={(creds) => signUpWithPassword(db, creds)}
        onBack={() => setShowSignUp(false)}
      />
    ) : (
      <Login
        providers={available}
        onSignIn={(creds) => signInWithPassword(db, creds)}
        onProvider={(provider) => void signInWithProvider(db, provider, window.location.origin)}
        onCreateAccount={() => setShowSignUp(true)}
      />
    )
  }

  if (auth.status === 'loading') return <Skeleton />

  if (auth.status === 'signed_out') {
    return (
      <>
        {notice && (
          <p className="auth-error" role="alert">
            {notice}
          </p>
        )}
        {renderLogin()}
      </>
    )
  }

  // Autenticado, mas o estágio ainda não voltou. Esqueleto de novo, e não a
  // tela de domínio: renderizá-la aqui é justamente o que I1 proíbe.
  if (stage === null) return <Skeleton />

  // A sessão morreu entre a assinatura e a leitura. Login, não tela vazia.
  if (stage.status === 'unauthenticated') return renderLogin()

  if (stage.status === 'error') {
    return (
      <div className="auth auth-skeleton">
        <p className="auth-error" role="alert">
          Não deu pra carregar sua conta: {stage.cause}
        </p>
      </div>
    )
  }

  if (stage.rows.stage !== 'ready') {
    return <Escolha onSignOut={() => void signOut(db)} />
  }

  return <>{children}</>
}
