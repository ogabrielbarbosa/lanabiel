// Moldura compartilhada pelas três telas de autenticação: o globo à esquerda,
// o painel de vidro à direita. Copy do frame `Login [LMpij]`.

import type { ReactNode } from 'react'

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <div className="auth-stage">
        {/* Decorativo: o globo do design é um IMAGEFILL não exportado, e isto é
            uma aproximação em gradiente. Fora da árvore de acessibilidade. */}
        <div className="auth-globe" aria-hidden="true" />
        <p className="auth-caption">
          Duas cidades.
          <span>Um lugar só de vocês.</span>
        </p>
      </div>

      <div className="auth-panel">
        <div className="auth-top">
          <div className="auth-logo">
            <span className="auth-mark" aria-hidden="true" />
            lanabiel
          </div>
          <span className="auth-pill">Só vocês dois</span>
        </div>
        {children}
      </div>
    </div>
  )
}
