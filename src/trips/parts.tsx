// Peças pequenas das Viagens, reaproveitadas pela Grade, pela Linha do tempo,
// pelo painel e pelo modal: a capa (foto assinada ou o gradiente do frame), os
// corações da nota (I6) e o link que abre o detalhe.

import type { ReactNode } from 'react'
import type { TripRating } from '../domain/tripDerive'
import { useTrips } from './context'
import { followLink, tripPath } from './links'

/** Um cartão que abre o detalhe da viagem (R5–R8: "Tocar abre o detalhe"). */
export function TripLink({ id, className, label, children }: { id: string; className: string; label?: string; children: ReactNode }) {
  const path = tripPath(id)
  return (
    <a href={path} className={className} aria-label={label} onClick={(e) => followLink(e, path)}>
      {children}
    </a>
  )
}

/**
 * A capa: a foto assinada quando o caminho já tem URL (a tela pede as URLs de
 * tudo que está visível num lote só, seção 8); senão o gradiente do frame —
 * nunca um `<img>` quebrado.
 */
export function Cover({ path, className, children }: { path: string | null; className: string; children?: ReactNode }) {
  const { urls } = useTrips()
  const url = path ? urls.get(path) : undefined
  return (
    <div className={`tr-cover ${url ? '' : 'tr-cover--empty'} ${className}`}>
      {url && <img src={url} alt="" loading="lazy" />}
      {children}
    </div>
  )
}

/**
 * Os corações da nota da viagem (I6): acesos até a nota, apagados no resto.
 * Sem nota (nenhuma memória), os cinco apagados e o nome acessível diz isso.
 */
export function HeartsLine({ rating, className = '' }: { rating: TripRating | null; className?: string }) {
  const on = rating?.hearts ?? 0
  return (
    <span
      className={`tr-hearts ${className}`}
      role="img"
      aria-label={rating ? `nota ${rating.hearts} de 5` : 'sem nota ainda'}
    >
      <span className="tr-hearts-on">{'♥'.repeat(on)}</span>
      <span className="tr-hearts-off">{'♥'.repeat(5 - on)}</span>
    </span>
  )
}
