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
import { StartChoice } from '../auth/StartChoice'
import type { AccountStage } from '../data/account'
import type { CoupleView } from '../data/couple'
import type { InvitePreview } from '../data/invites'
import type { OnboardingApi } from './api'
import { WaitingScreen } from './WaitingScreen'
import { CodeEntry } from './CodeEntry'
import { ConfirmCouple, AllSet } from './ConfirmCouple'
import { InviteScreen } from './InviteScreen'
import { ProfileStep } from './ProfileStep'
import { CoupleStep } from './CoupleStep'

type Step =
  | { name: 'choose' }
  | { name: 'profile-create' }
  | { name: 'couple' }
  | { name: 'waiting'; wizard: boolean }
  | { name: 'code' }
  | { name: 'invite'; code: string; fromLink: boolean }
  | { name: 'profile-join'; code: string; invite: InvitePreview }
  | { name: 'confirm' }
  | { name: 'done'; couple: CoupleView | null }

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
  if (props.postJoin) return { name: 'confirm' }
  if (props.pendingCode) return { name: 'invite', code: props.pendingCode, fromLink: props.codeFromLink }
  if (props.stage.stage === 'awaiting_partner') return { name: 'waiting', wizard: false }
  return { name: 'choose' }
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
    setStep(stage.stage === 'awaiting_partner' ? { name: 'waiting', wizard: false } : { name: 'choose' })
    // Já tem casal e o código era de outro (ou o próprio): de volta ao app.
    if (stage.stage === 'ready') onEnterApp()
  }

  async function acceptAfterProfile(code: string) {
    const result = await api.acceptInvite(code)
    onRefreshStage()
    if (result.status === 'joined') {
      onPendingCode(null)
      onJoined()
      setStep({ name: 'confirm' })
    } else {
      // Qualquer recusa: a tela do convite relê e mostra o estado atual.
      setStep({ name: 'invite', code, fromLink: props.codeFromLink })
    }
  }

  switch (step.name) {
    case 'choose':
      return (
        <StartChoice
          onCreate={() => {
            const needs = stage.stage === 'needs_profile'
            setCreateNeedsProfile(needs)
            setStep(needs ? { name: 'profile-create' } : { name: 'couple' })
          }}
          onHaveCode={() => setStep({ name: 'code' })}
          onSignOut={() => onSignOut(false)}
        />
      )

    case 'profile-create':
      return (
        <ProfileStep
          api={api}
          progress={{ current: 1, total: createTotal, label: 'Meu perfil' }}
          inviterName={null}
          onDone={(n) => {
            setNotice(n)
            onRefreshStage()
            setStep({ name: 'couple' })
          }}
        />
      )

    case 'couple':
      return (
        <CoupleStep
          api={api}
          progress={{ current: 1 + createOffset, total: createTotal, label: 'Sobre a gente' }}
          notice={notice}
          onBack={() => setStep({ name: 'choose' })}
          onDone={() => {
            setNotice(null)
            onRefreshStage()
            setStep({ name: 'waiting', wizard: true })
          }}
        />
      )

    case 'waiting':
      return (
        <WaitingScreen
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

    case 'code':
      return (
        <CodeEntry
          onBack={() => setStep({ name: 'choose' })}
          onSubmit={(code) => {
            onPendingCode(code)
            setStep({ name: 'invite', code, fromLink: false })
          }}
        />
      )

    case 'invite':
      return (
        <InviteScreen
          api={api}
          code={step.code}
          fromLink={step.fromLink}
          needsProfile={stage.stage === 'needs_profile'}
          onNeedProfile={(invite) => {
            setJoinNeedsProfile(true)
            setStep({ name: 'profile-join', code: step.code, invite })
          }}
          onJoined={() => {
            setJoinNeedsProfile(false)
            onPendingCode(null)
            onRefreshStage()
            onJoined()
            setStep({ name: 'confirm' })
          }}
          onDismiss={leaveInvite}
          onRetype={() => {
            onPendingCode(null)
            setStep({ name: 'code' })
          }}
          onSignOut={onSignOut}
        />
      )

    case 'profile-join':
      return (
        <ProfileStep
          api={api}
          progress={{ current: 1, total: joinTotal, label: 'Seu perfil' }}
          inviterName={step.invite.inviterName}
          onDone={(n) => {
            setNotice(n)
            void acceptAfterProfile(step.code)
          }}
        />
      )

    case 'confirm':
      return (
        <ConfirmCouple
          api={api}
          progress={{ current: joinTotal, total: joinTotal, label: 'Confirmar' }}
          selfProfileId={selfProfileId}
          notice={notice}
          onDone={(couple) => {
            setNotice(null)
            setStep({ name: 'done', couple })
          }}
        />
      )

    case 'done':
      return <AllSet api={api} couple={step.couple} onEnter={onEnterApp} />
  }
}
