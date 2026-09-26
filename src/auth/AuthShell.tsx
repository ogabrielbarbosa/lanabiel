// Moldura compartilhada pelas três telas de autenticação, desenhada a partir do
// frame `Login [LMpij]`: o globo ocupa a tela inteira e o painel de vidro flutua
// à direita, 16px afastado das bordas.

import type { InputHTMLAttributes, ReactNode } from 'react'
import globeUrl from './assets/globe.webp'
import { HeartHandshake, Lock } from './icons'

export interface AuthShellProps {
  children: ReactNode
  /**
   * A legenda grande sobre o globo. O Login usa a do desenho; cada tela de
   * onboarding tem a sua ("Oi, Rafa. / Vamos montar o cantinho de vocês.").
   */
  caption?: { title: string; subtitle: string }
}

const DEFAULT_CAPTION = { title: 'Duas cidades.', subtitle: 'Um lugar só de vocês.' }

export function AuthShell({ children, caption = DEFAULT_CAPTION }: AuthShellProps) {
  return (
    <div className="auth">
      {/* Decorativo: fora da árvore de acessibilidade. As camadas seguem a
          ordem do `Globe Area` no .pen — halo, atmosfera, imagem, sombra,
          luz de borda. A imagem é o IMAGEFILL do nó `Globe [tebI3]`, exportado. */}
      <div className="auth-stage" aria-hidden="true">
        <div className="auth-halo" />
        <div className="auth-atmosphere" />
        <img className="auth-globe" src={globeUrl} alt="" />
        <div className="auth-shading" />
        <div className="auth-rim" />
      </div>

      <p className="auth-caption">
        {caption.title}
        <span>{caption.subtitle}</span>
      </p>

      <div className="auth-panel">
        <div className="auth-top">
          <div className="auth-logo">
            <span className="auth-mark" aria-hidden="true">
              <HeartHandshake />
            </span>
            lanabiel
          </div>
          <span className="auth-pill">
            <Lock />
            Só vocês dois
          </span>
        </div>
        <div className="auth-main">{children}</div>
      </div>
    </div>
  )
}

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string
  label: string
  icon: ReactNode
  children?: ReactNode
}

/** O `Form Field [U3E63f]` do design: rótulo acima, caixa de vidro com ícone. */
export function AuthField({ id, label, icon, children, ...input }: AuthFieldProps) {
  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className="auth-input">
        {icon}
        <input id={id} {...input} />
      </div>
      {children}
    </div>
  )
}
