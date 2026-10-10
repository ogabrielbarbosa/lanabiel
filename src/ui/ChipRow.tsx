// A faixa de chips que rola de lado (ADR 0026): categorias da Lista, e o que
// mais vier. O respiro que o brilho do chip ativo precisa, o degradê da borda
// e o "não encolher na coluna" moram no `ui.css`, não em cada tela.

import type { ReactNode } from 'react'
import './ui.css'

export interface ChipRowProps {
  /** O nome do grupo para o leitor de tela ("Categorias"). */
  label: string
  className?: string
  /** `aria-hidden`: a faixa do esqueleto, que é só forma. */
  decorative?: boolean
  children: ReactNode
}

export function ChipRow({ label, className, decorative = false, children }: ChipRowProps) {
  const classes = className ? `chip-row ${className}` : 'chip-row'
  if (decorative) {
    return (
      <div className={classes} aria-hidden="true">
        {children}
      </div>
    )
  }
  return (
    <div className={classes} role="group" aria-label={label}>
      {children}
    </div>
  )
}
