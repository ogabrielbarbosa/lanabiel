// Peças pequenas do Detalhe da viagem (`Peoa7`, `f3yqz`): o cartão de vidro
// com cabeçalho, os corações de leitura, o link interno e o ícone da estação.
// As constantes e rótulos moram em `format.ts`; o R27, em `useTripWrite.ts`.
//
// Spec: .agent/Tasks/fase-6-viagens.md — R15–R23, R27

import type { ReactNode } from 'react'
import { ChevronRight, Flower2, Leaf, Snowflake, Sun } from 'lucide-react'
import { navigate } from '../../app/router'
import { seasonOf } from './format'

/** Corações só de leitura (o ♥♥♥♥♥ do frame): `n` acesos, o resto apagado. */
export function HeartsText({ n, className = '' }: { n: number; className?: string }) {
  return (
    <span className={`td-hearts ${className}`} role="img" aria-label={n > 0 ? `${n} de 5` : 'sem nota'}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= n ? 'is-on' : ''} aria-hidden="true">
          ♥
        </span>
      ))}
    </span>
  )
}

/** Um link interno do app (`/lista`, `/viagens`) que navega sem recarregar. */
export function AppLink({ to, className, children, label }: { to: string; className?: string; children: ReactNode; label?: string }) {
  return (
    <a
      href={to}
      className={className}
      aria-label={label}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

/** A ação do cabeçalho de um cartão ("Editar roteiro ›"): botão, link ou só texto. */
export type CardAction =
  | { label: string; onClick: () => void; ariaLabel?: string }
  | { label: string; to: string; ariaLabel?: string }
  | { label: string; href: string; ariaLabel?: string }
  | { label: string; text: true }

/** O cartão de vidro de cada bloco (`Roteiro dia a dia`, `Galeria`, …): título 20 e a ação à direita. */
export function Card({
  title,
  action,
  className = '',
  children,
  labelledBy,
}: {
  title: string
  action?: CardAction | null
  className?: string
  children: ReactNode
  labelledBy: string
}) {
  const inner = action ? (
    <>
      {action.label}
      <ChevronRight size={14} aria-hidden="true" />
    </>
  ) : null
  return (
    <section className={`td-card lg ${className}`} aria-labelledby={labelledBy}>
      <header className="td-card-head">
        <h2 id={labelledBy}>{title}</h2>
        {action &&
          ('onClick' in action ? (
            <button type="button" className="td-card-action" onClick={action.onClick} aria-label={action.ariaLabel}>
              {inner}
            </button>
          ) : 'to' in action ? (
            <AppLink to={action.to} className="td-card-action" label={action.ariaLabel}>
              {inner}
            </AppLink>
          ) : 'href' in action ? (
            <a href={action.href} className="td-card-action" target="_blank" rel="noopener noreferrer" aria-label={action.ariaLabel}>
              {inner}
            </a>
          ) : (
            <span className="td-card-action td-card-action--text">{inner}</span>
          ))}
      </header>
      <div className="td-card-body">{children}</div>
    </section>
  )
}

/** O ícone da nota no herói, pela estação no destino (`seasonOf`). */
export function SeasonIcon({ startsOn, lat, size }: { startsOn: string; lat: number | undefined; size: number }) {
  switch (seasonOf(startsOn, lat)) {
    case 'inverno':
      return <Snowflake size={size} aria-hidden="true" />
    case 'primavera':
      return <Flower2 size={size} aria-hidden="true" />
    case 'verao':
      return <Sun size={size} aria-hidden="true" />
    case 'outono':
      return <Leaf size={size} aria-hidden="true" />
  }
}
