// Moldura compartilhada pelas três telas de autenticação, desenhada a partir do
// frame `Login [LMpij]`: o globo ocupa a tela inteira e o painel de vidro flutua
// à direita, 16px afastado das bordas.

import { useEffect, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'
import globeUrl from './assets/globe.webp'
import { HeartHandshake, Lock } from './icons'

export interface AuthShellProps {
  children: ReactNode
  /**
   * A legenda grande sobre o globo. O Login usa a do desenho; cada tela de
   * onboarding tem a sua ("Oi, Rafa. / Comece pelo seu perfil.").
   */
  caption?: { title: string; subtitle: string }
}

const DEFAULT_CAPTION = { title: 'Que bom te ver.', subtitle: 'Entre pra continuar de onde parou.' }

// A abertura (o globo surgindo, o painel deslizando) toca uma vez por carga da
// página. Cada tela do login e do onboarding monta a própria moldura; sem isto,
// ir do Login ao Cadastro faria o globo nascer de novo a cada passo. Do segundo
// passo em diante só o conteúdo do painel entra.
let introPlayed = false

export function AuthShell({ children, caption = DEFAULT_CAPTION }: AuthShellProps) {
  const [intro] = useState(() => !introPlayed)
  useEffect(() => {
    introPlayed = true
  }, [])
  return (
    <div className={`auth ${intro ? 'auth--intro' : ''}`}>
      {/* Decorativo: fora da árvore de acessibilidade. As camadas seguem a
          ordem do `Globe Area` no .pen — halo, atmosfera, imagem, sombra,
          luz de borda. A imagem é o IMAGEFILL do nó `Globe [tebI3]`, exportado. */}
      <div className="auth-stage" aria-hidden="true">
        <div className="auth-halo" />
        <div className="auth-stars" />
        <div className="auth-atmosphere" />
        <img className="auth-globe" src={globeUrl} alt="" />
        <div className="auth-shading" />
        <div className="auth-rim" />
      </div>

      <p className="auth-caption">
        <span className="auth-caption-title">{caption.title}</span>
        <span>{caption.subtitle}</span>
      </p>

      <div className="lg auth-panel">
        <div className="auth-top">
          <div className="auth-logo">
            <span className="auth-mark" aria-hidden="true">
              <HeartHandshake />
            </span>
            lanabiel
          </div>
          <span className="auth-pill">
            <Lock />
            Privado
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
