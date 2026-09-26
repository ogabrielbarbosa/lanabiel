// O assistente de onboarding: qual tela, em que ordem, e o que cada gesto
// grava.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, seção 5 ("O portão") e seção 2.
//
// O passo é estado LOCAL; o banco é a verdade. Recarregar no meio retoma pelo
// estágio (`needs_profile` → Escolha, `awaiting_partner` → Aguardando), não
// pela tela em que se estava. Confirmar e Tudo pronto não são retomáveis de
// propósito: recarregar depois de entrar leva ao app, e a data continua
// editável na Fase 3.

import { useState } from 'react'
import { Escolha } from '../auth/Escolha'
import type { AccountStage } from '../data/account'
import type { CoupleView } from '../data/couple'
import type { InvitePreview } from '../data/invites'
import type { OnboardingApi } from './api'
import { Aguardando } from './Aguardando'
import { Codigo } from './Codigo'
import { Confirmar, TudoPronto } from './Confirmar'
import { Convite } from './Convite'
import { Perfil } from './Perfil'
import { SobreAGente } from './SobreAGente'

type Step =
  | { name: 'escolha' }
  | { name: 'perfil-criar' }
  | { name: 'sobre' }
  | { name: 'aguardando'; wizard: boolean }
  | { name: 'codigo' }
  | { name: 'convite'; code: string; fromLink: boolean }
  | { name: 'perfil-entrar'; code: string; invite: InvitePreview }
  | { name: 'confirmar' }
  | { name: 'pronto'; couple: CoupleView | null }

export interface OnboardingProps {
  api: OnboardingApi
  stage: AccountStage
  pendingCode: string | null
  codeFromLink: boolean
  /** Acabou de entrar num casal: Confirmar e Tudo pronto antes do app. */
  postJoin: boolean
  /** Algo foi gravado: o portão relê o estágio. */
  onRefreshStage: () => void
  onPendingCode: (code: string | null) => void
  onJoined: () => void
  onEnterApp: () => void
  /** `keepInvite`: sair para aceitar com outra conta não pode perder o código. */
  onSignOut: (keepInvite: boolean) => void
}

function initialStep(props: OnboardingProps): Step {
  if (props.postJoin) return { name: 'confirmar' }
  if (props.pendingCode) return { name: 'convite', code: props.pendingCode, fromLink: props.codeFromLink }
  if (props.stage.stage === 'awaiting_partner') return { name: 'aguardando', wizard: false }
  return { name: 'escolha' }
}

export function Onboarding(props: OnboardingProps) {
  const { api, stage, onRefreshStage, onPendingCode, onJoined, onEnterApp, onSignOut } = props
  const [step, setStep] = useState<Step>(() => initialStep(props))
  const [notice, setNotice] = useState<string | null>(null)
  // Fixado no começo de cada caminho: o contador "Passo N de M" não muda de
  // total no meio só porque o perfil acabou de ser criado.
  const [createNeedsProfile, setCreateNeedsProfile] = useState(stage.stage === 'needs_profile')
  const [joinNeedsProfile, setJoinNeedsProfile] = useState(stage.stage === 'needs_profile')

  const createTotal = createNeedsProfile ? 4 : 3
  const createOffset = createNeedsProfile ? 1 : 0
  const joinTotal = joinNeedsProfile ? 2 : 1
  const selfProfileId = stage.stage === 'needs_profile' ? null : stage.profileId

  function leaveInvite() {
    onPendingCode(null)
    setStep(stage.stage === 'awaiting_partner' ? { name: 'aguardando', wizard: false } : { name: 'escolha' })
    // Já tem casal e o código era de outro (ou o próprio): de volta ao app.
    if (stage.stage === 'ready') onEnterApp()
  }

  async function acceptAfterProfile(code: string) {
    const result = await api.acceptInvite(code)
    onRefreshStage()
    if (result.status === 'joined') {
      onPendingCode(null)
      onJoined()
      setStep({ name: 'confirmar' })
    } else {
      // Qualquer recusa: a tela do convite relê e mostra o estado atual.
      setStep({ name: 'convite', code, fromLink: props.codeFromLink })
    }
  }

  switch (step.name) {
    case 'escolha':
      return (
        <Escolha
          onCreate={() => {
            const needs = stage.stage === 'needs_profile'
            setCreateNeedsProfile(needs)
            setStep(needs ? { name: 'perfil-criar' } : { name: 'sobre' })
          }}
          onHaveCode={() => setStep({ name: 'codigo' })}
          onSignOut={() => onSignOut(false)}
        />
      )

    case 'perfil-criar':
      return (
        <Perfil
          api={api}
          progress={{ current: 1, total: createTotal, label: 'Meu perfil' }}
          inviterName={null}
          onDone={(n) => {
            setNotice(n)
            onRefreshStage()
            setStep({ name: 'sobre' })
          }}
        />
      )

    case 'sobre':
      return (
        <SobreAGente
          api={api}
          progress={{ current: 1 + createOffset, total: createTotal, label: 'Sobre a gente' }}
          notice={notice}
          onBack={() => setStep({ name: 'escolha' })}
          onDone={() => {
            setNotice(null)
            onRefreshStage()
            setStep({ name: 'aguardando', wizard: true })
          }}
        />
      )

    case 'aguardando':
      return (
        <Aguardando
          api={api}
          wizard={
            step.wizard
              ? {
                  invite: { current: 2 + createOffset, total: createTotal, label: 'Convidar' },
                  sent: { current: 3 + createOffset, total: createTotal, label: 'Convite enviado' },
                }
              : null
          }
          notice={notice}
          onEnterApp={onEnterApp}
          onSignOut={() => onSignOut(false)}
        />
      )

    case 'codigo':
      return (
        <Codigo
          onBack={() => setStep({ name: 'escolha' })}
          onSubmit={(code) => {
            onPendingCode(code)
            setStep({ name: 'convite', code, fromLink: false })
          }}
        />
      )

    case 'convite':
      return (
        <Convite
          api={api}
          code={step.code}
          fromLink={step.fromLink}
          needsProfile={stage.stage === 'needs_profile'}
          onNeedProfile={(invite) => {
            setJoinNeedsProfile(true)
            setStep({ name: 'perfil-entrar', code: step.code, invite })
          }}
          onJoined={() => {
            setJoinNeedsProfile(false)
            onPendingCode(null)
            onRefreshStage()
            onJoined()
            setStep({ name: 'confirmar' })
          }}
          onDismiss={leaveInvite}
          onRetype={() => {
            onPendingCode(null)
            setStep({ name: 'codigo' })
          }}
          onSignOut={onSignOut}
        />
      )

    case 'perfil-entrar':
      return (
        <Perfil
          api={api}
          progress={{ current: 1, total: joinTotal, label: 'Seu perfil' }}
          inviterName={step.invite.inviterName}
          onDone={(n) => {
            setNotice(n)
            void acceptAfterProfile(step.code)
          }}
        />
      )

    case 'confirmar':
      return (
        <Confirmar
          api={api}
          progress={{ current: joinTotal, total: joinTotal, label: 'Confirmar' }}
          selfProfileId={selfProfileId}
          notice={notice}
          onDone={(couple) => {
            setNotice(null)
            setStep({ name: 'pronto', couple })
          }}
        />
      )

    case 'pronto':
      return <TudoPronto api={api} couple={step.couple} onEnter={onEnterApp} />
  }
}
