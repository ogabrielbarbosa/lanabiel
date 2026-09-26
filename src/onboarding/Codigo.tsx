// Frame `C3 · 2 — Digitar código`.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, R7 — maiúsculas/minúsculas, hífen,
// O→0, I/L→1, e colar a mensagem inteira do WhatsApp.

import { useState } from 'react'
import { AuthShell } from '../auth/AuthShell'
import { Copy } from '../auth/icons'
import { extractInviteCode, normalizeInviteCode } from '../domain/onboarding'
import { CodeInput } from './parts'

export interface CodigoProps {
  initial?: string
  onBack: () => void
  onSubmit: (code: string) => void
}

export function Codigo({ initial = '', onBack, onSubmit }: CodigoProps) {
  const [value, setValue] = useState(initial)
  const [pasteProblem, setPasteProblem] = useState<string | null>(null)
  const code = normalizeInviteCode(value)

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      const extracted = extractInviteCode(text)
      if (extracted) {
        setValue(extracted)
        setPasteProblem(null)
      } else {
        setPasteProblem('Não achamos um código no que você copiou.')
      }
    } catch {
      // Navegador sem permissão de leitura: colar direto no campo funciona.
      setPasteProblem('Seu navegador não deixou ler a área de transferência. Cole direto no campo.')
    }
  }

  return (
    <AuthShell caption={{ title: 'Tem um código?', subtitle: '6 caracteres e vocês estão juntos.' }}>
      <div className="auth-heading onb-heading">
        <h1>Digite o código de convite</h1>
        <p>Seu amor recebeu o código quando criou o espaço. Ele também está no e-mail de convite.</p>
      </div>

      <form
        className="auth-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (code) onSubmit(code)
        }}
      >
        <CodeInput value={value} onChange={setValue} />

        <button type="button" className="auth-btn onb-btn-small onb-self-start" onClick={() => void pasteFromClipboard()}>
          <Copy />
          Colar do WhatsApp
        </button>
        {pasteProblem && <p className="onb-field-hint">{pasteProblem}</p>}

        <p className="auth-hint onb-note">
          Letras e números, sem diferença entre maiúsculas e minúsculas. O código vale por 7 dias.
        </p>

        <div className="onb-actions">
          <button type="button" className="auth-btn" onClick={onBack}>
            Voltar
          </button>
          <button type="submit" className="auth-btn auth-btn-primary" disabled={!code}>
            Continuar
          </button>
        </div>
      </form>
    </AuthShell>
  )
}
