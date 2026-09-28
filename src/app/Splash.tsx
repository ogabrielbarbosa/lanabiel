// A abertura do app: ao abrir (uma vez por sessão do navegador), as duas
// cidades se acendem, um arco sai de cada uma e os dois se encontram no alto,
// onde a logo nasce; o nome entra letra por letra e a cortina sai sozinha.
//
// Fica por CIMA de tudo e não segura nada: o portão de sessão e a casca
// carregam por baixo enquanto ela toca, e um clique a dispensa. Com "Reduzir
// animações" (o `data-reduce-motion` do index.html) ela não aparece.

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { HeartHandshake } from '../auth/icons'
import { motionReduced } from './motion'

const SPLASH_KEY = 'lanabiel:splash'
// Casa com o `--intro-delay` de auth.css (a saída começa aqui e leva 0,6 s).
const HOLD_MS = 2600
const WORD = 'lanabiel'

// Decidido uma vez por carga: o StrictMode chama o inicializador do estado duas
// vezes, e a segunda leria a marca que a primeira acabou de gravar.
let decided: boolean | null = null

function shouldPlay(): boolean {
  if (decided !== null) return decided
  decided = false
  if (motionReduced()) return decided
  try {
    if (sessionStorage.getItem(SPLASH_KEY)) return decided
    sessionStorage.setItem(SPLASH_KEY, '1')
  } catch {
    // Sem sessionStorage (bloqueio): toca, e tocaria de novo a cada recarga.
  }
  decided = true
  // O login espera a cortina para fazer a própria entrada (auth.css).
  document.documentElement.dataset.splash = 'true'
  return decided
}

export function Splash() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>(() => (shouldPlay() ? 'show' : 'gone'))

  useEffect(() => {
    if (phase !== 'show') return
    const timer = window.setTimeout(() => setPhase('leave'), HOLD_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  if (phase === 'gone') return null

  return (
    <div
      className={`splash ${phase === 'leave' ? 'is-leaving' : ''}`}
      aria-hidden="true"
      onClick={() => setPhase('leave')}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && phase === 'leave') setPhase('gone')
      }}
    >
      <div className="splash-glow splash-glow--pink" />
      <div className="splash-glow splash-glow--aqua" />

      <div className="splash-stage">
        <svg className="splash-arcs" viewBox="0 0 360 150" fill="none">
          <defs>
            <linearGradient id="splash-arc-left" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stopColor="#7fd8c4" />
              <stop offset="1" stopColor="#f4a3b4" />
            </linearGradient>
            <linearGradient id="splash-arc-right" x1="1" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#f6e3a1" />
              <stop offset="1" stopColor="#f4a3b4" />
            </linearGradient>
          </defs>
          <path className="splash-arc" d="M30 124 Q 44 34 180 34" stroke="url(#splash-arc-left)" pathLength={1} />
          <path className="splash-arc splash-arc--right" d="M330 124 Q 316 34 180 34" stroke="url(#splash-arc-right)" pathLength={1} />
          <circle className="splash-ping" cx="30" cy="124" r="5" />
          <circle className="splash-ping splash-ping--right" cx="330" cy="124" r="5" />
          <circle className="splash-city" cx="30" cy="124" r="5" fill="#7fd8c4" />
          <circle className="splash-city splash-city--right" cx="330" cy="124" r="5" fill="#f6e3a1" />
        </svg>
        <span className="splash-label">São José dos Campos</span>
        <span className="splash-label splash-label--right">Marau</span>
        <span className="splash-mark">
          <HeartHandshake size={28} />
        </span>
        <span className="splash-burst" />
      </div>

      <p className="splash-word">
        {[...WORD].map((letter, i) => (
          <span key={i} style={{ '--i': i } as CSSProperties}>
            {letter}
          </span>
        ))}
      </p>
      <p className="splash-tagline">Calendário, lista e viagens do casal.</p>
    </div>
  )
}
