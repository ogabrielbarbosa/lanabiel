// Spec: .agent/Tasks/fase-1-login.md, seção 5 e invariante I1.
//       .agent/Tasks/fase-2-onboarding.md, seção 5 ("O portão").
//
// O portão. Decide, a cada carregamento, entre esqueleto, Login, Escolha e a
// tela de domínio — e a ordem importa: NENHUMA tela de domínio renderiza antes
// de `stage: 'ready'`. Não é zelo: `listStays` para quem não tem casal devolve
// `ok` com zero linhas, indistinguível de "o casal não tem estadias".
//
// `db` e `loadStage` entram por parâmetro para o teste poder dirigir a
// assinatura de sessão sem rede. O que o banco responde é provado à parte, em
// `supabase/tests/auth.test.ts`.

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadAccountStage } from '../data/account'
import type { AccountStage } from '../data/account'
import type { DataResult } from '../data/result'
import type { Database } from '../lib/database.types'
import { onboardingApi } from '../onboarding/api'
import type { OnboardingApi } from '../onboarding/api'
import { Onboarding } from '../onboarding/Onboarding'
import { clearPendingInvite, consumeInviteFromUrl, setPendingInvite } from '../onboarding/pendingInvite'
import '../onboarding/onboarding.css'
import { consumeAuthCallback } from './callback'
import { CriarConta } from './CriarConta'
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
  /** As chamadas do onboarding. Injetável para o teste de interface. */
  api?: OnboardingApi
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

export function AuthGate({ db, children, loadStage = loadAccountStage, providers, api }: AuthGateProps) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })

  // O código do link do e-mail (`#convite=`) é lido UMA vez, no primeiro
  // render, e sai da barra de endereços na hora (R6). A ordem dos dois
  // `useState` importa: "veio do link?" precisa ver o fragmento antes de ele
  // ser consumido.
  const [codeFromLink, setCodeFromLink] = useState(() => /(^#|&)convite=/.test(window.location.hash))
  const [pendingCode, setPendingCode] = useState<string | null>(() =>
    consumeInviteFromUrl(new URL(window.location.href), (href) =>
      window.history.replaceState(window.history.state, '', href),
    ),
  )
  // Acabou de entrar num casal: Confirmar e Tudo pronto vêm antes do app.
  const [postJoin, setPostJoin] = useState(false)
  // "Continuar pro app" na tela Aguardando: vale para esta sessão de uso.
  const [skipWaiting, setSkipWaiting] = useState(false)
  // Incrementar relê o estágio sem desmontar a tela (o par abaixo guarda o
  // resultado anterior até o novo chegar).
  const [stageVersion, setStageVersion] = useState(0)
  // Incrementa só quando um código chega DE FORA com a tela aberta (link
  // colado). É a única mudança de código que precisa recomeçar o assistente;
  // as internas (digitar, aceitar, descartar) já definem o passo sozinhas — e
  // remontar nelas perderia estado (aviso da foto, contagem de passos).
  const [inviteArrivals, setInviteArrivals] = useState(0)
  const onboarding = useMemo(() => api ?? onboardingApi(db), [api, db])
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

  // O link colado numa aba em que o app já está aberto muda só o fragmento:
  // não há recarga, e sem isto o código ficaria esquecido na barra.
  useEffect(() => {
    const onHashChange = () => {
      // Só fragmento de convite. Outro `#…` devolveria o código já guardado e
      // o marcaria, errado, como vindo do link.
      if (!/(^#|&)convite=/.test(window.location.hash)) return
      const code = consumeInviteFromUrl(new URL(window.location.href), (href) =>
        window.history.replaceState(window.history.state, '', href),
      )
      if (code) {
        setCodeFromLink(true)
        setPendingCode(code)
        setInviteArrivals((n) => n + 1)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

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
  }, [db, userId, loadStage, stageVersion])

  // Quem está sozinho no espaço percebe a entrada do outro ao voltar para a
  // aba — sem realtime nesta fase (spec, seção 14; A27).
  const waiting = stage?.status === 'ok' && stage.rows.stage === 'awaiting_partner'
  useEffect(() => {
    if (!waiting) return
    const refresh = () => {
      if (document.visibilityState === 'visible') setStageVersion((v) => v + 1)
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [waiting])

  function rememberCode(code: string | null) {
    if (code) setPendingInvite(code)
    else clearPendingInvite()
    // Código guardado por aqui foi digitado; o do link entra pelo fragmento.
    setCodeFromLink(false)
    setPendingCode(code)
  }

  function leave(keepInvite: boolean) {
    // Trocar de conta apaga o código — exceto quando sair é justamente para
    // aceitar o convite com a outra conta (`already_member`).
    if (!keepInvite) rememberCode(null)
    setPostJoin(false)
    setSkipWaiting(false)
    void signOut(db)
  }

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
        inviteContext={pendingCode !== null}
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

  const rows = stage.rows
  const onboardingNeeded =
    postJoin ||
    pendingCode !== null ||
    rows.stage === 'needs_profile' ||
    rows.stage === 'needs_couple' ||
    (rows.stage === 'awaiting_partner' && !skipWaiting)

  if (onboardingNeeded) {
    return (
      <Onboarding
        // Uma instância por pessoa e por chegada de link: trocar de conta
        // recomeça o assistente, e um código que chega com a tela aberta
        // também — o passo inicial é calculado ao montar.
        key={`${userId}:${inviteArrivals}`}
        api={onboarding}
        stage={rows}
        pendingCode={pendingCode}
        codeFromLink={codeFromLink}
        postJoin={postJoin}
        onRefreshStage={() => setStageVersion((v) => v + 1)}
        onPendingCode={rememberCode}
        onJoined={() => setPostJoin(true)}
        onEnterApp={() => {
          setPostJoin(false)
          setSkipWaiting(true)
          setStageVersion((v) => v + 1)
        }}
        onSignOut={leave}
      />
    )
  }

  return <>{children}</>
}
