// O esqueleto (ADR 0026): o lugar do que vem do banco, no tamanho do real.
//
// `Loading` é a região que lê — `aria-busy` e o texto para leitor de tela —;
// `Skeleton` é cada forma dentro dela. As formas são decoração (`aria-hidden`):
// quem anuncia é o rótulo da região.

import type { CSSProperties, ReactNode } from 'react'
import './ui.css'

export interface SkeletonProps {
  width?: number | string
  height?: number | string
  /** Raio próprio; o padrão é o do cartão (`--radius-md`). */
  radius?: number | string
  /** Linha de texto: ponta redonda. */
  text?: boolean
  className?: string
  style?: CSSProperties
}

export function Skeleton({ width, height, radius, text = false, className, style }: SkeletonProps) {
  const classes = ['skeleton', text && 'skeleton--text', className].filter(Boolean).join(' ')
  return <span className={classes} aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />
}

export interface LoadingProps {
  /** O que o leitor de tela ouve: "Carregando a lista…". */
  label: string
  className?: string
  children: ReactNode
}

/** A região em leitura: o corpo da tela enquanto o banco não respondeu. */
export function Loading({ label, className, children }: LoadingProps) {
  return (
    <div className={className ? `loading ${className}` : 'loading'} aria-busy="true">
      <span className="visually-hidden">{label}</span>
      {children}
    </div>
  )
}
