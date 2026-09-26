// Frame `Escolha [UEca1]`.
//
// Duas diferenças deliberadas em relação ao desenho, as duas registradas na
// spec:
//
// 1. A linha "Não achamos convite pendente pra <e-mail>" NÃO é renderizada
//    (R8). Não existe tabela de convites, então ninguém procurou — e a tela
//    não afirma ter procurado. A frase do desenho sobre abrir o link do e-mail
//    fica, porque ela cobre a lacuna sem mentir.
// 2. Os dois caminhos estão desabilitados COM MOTIVO VISÍVEL. O fluxo atrás
//    deles é a Fase 2. Botão que não faz nada em silêncio parece defeito.

import { AuthShell } from './AuthShell'

const EM_BREVE = 'Chega na próxima etapa'

export interface EscolhaProps {
  onSignOut: () => void
}

export function Escolha({ onSignOut }: EscolhaProps) {
  return (
    <AuthShell>
      <div className="auth-heading">
        <h1>Bem-vindo ao lanabiel.</h1>
        <p>Como vocês vão começar?</p>
      </div>

      <div className="auth-choices">
        <button type="button" className="auth-choice" disabled>
          <strong>Criar nosso espaço</strong>
          <span>Você monta o cantinho e convida seu amor por e-mail.</span>
          <em>{EM_BREVE}</em>
        </button>

        <button type="button" className="auth-choice" disabled>
          <strong>Tenho um código</strong>
          <span>Seu amor já criou o espaço e te passou um código de 6 dígitos.</span>
          <em>{EM_BREVE}</em>
        </button>
      </div>

      <p className="auth-hint">
        Recebeu um e-mail de convite? Abra o link por lá — o código já vai junto.
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
