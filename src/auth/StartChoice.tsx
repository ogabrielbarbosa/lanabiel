// Frame `Escolha [UEca1]`.
//
// Fase 2 (.agent/Tasks/fase-2-onboarding.md, R1 e R14): os dois caminhos
// funcionam. A linha "Não achamos convite pendente pra <e-mail>" continua
// FORA — agora não por falta de tabela, mas por decisão: o e-mail da sessão não
// é verificado, e uma busca por ele entregaria o convite a quem se cadastrasse
// primeiro com o endereço alheio (seção 9; ADR 0008). A frase do desenho sobre
// abrir o link do e-mail fica, porque ela aponta o caminho que prova posse.

import { AuthShell } from './AuthShell'

export interface StartChoiceProps {
  onCreate: () => void
  onHaveCode: () => void
  onSignOut: () => void
}

export function StartChoice({ onCreate, onHaveCode, onSignOut }: StartChoiceProps) {
  return (
    <AuthShell caption={{ title: 'Bem-vindo ao lanabiel.', subtitle: 'Como vocês vão começar?' }}>
      <div className="auth-heading">
        <h1>Bem-vindo ao lanabiel.</h1>
        <p>Como vocês vão começar?</p>
      </div>

      <div className="auth-choices">
        <button type="button" className="lg auth-choice" onClick={onCreate}>
          <strong>Criar nosso espaço</strong>
          <span>Você cria o espaço e manda um convite por e-mail pra outra pessoa.</span>
        </button>

        <button type="button" className="lg auth-choice" onClick={onHaveCode}>
          <strong>Tenho um código</strong>
          <span>Seu amor já criou o espaço e te passou um código de 6 caracteres.</span>
        </button>
      </div>

      <p className="auth-hint">
        Recebeu um convite por e-mail? Abra o link que está nele, o código já vem preenchido.
      </p>

      <div className="auth-footer">
        <div className="auth-footer-row">
          Não é você?
          <button type="button" className="auth-btn-link" onClick={onSignOut}>
            Trocar de conta
          </button>
        </div>
      </div>
    </AuthShell>
  )
}
