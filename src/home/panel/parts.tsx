// Peças do painel da Home: o cartão de vidro com título e ação (o `Header` de
// cada seção do `LFEx4`), o avatar e a foto assinada.

import type { CSSProperties, ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { HomePerson } from '../context'
import { useHome } from '../context'

/** Uma seção do painel: título à esquerda, a ação (_Roteiro ›_…) à direita. */
export function PanelCard({
  title,
  action,
  children,
  className = '',
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`hp-card ${className}`} aria-label={title}>
      <div className="hp-card-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  )
}

export function CardAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="hp-link" onClick={onClick}>
      {label}
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  )
}

/** Avatar com a foto assinada, ou a inicial sobre a cor da pessoa. */
export function PersonAvatar({ person, size }: { person: Pick<HomePerson, 'name' | 'color' | 'avatarUrl'>; size: number }) {
  const style = { width: size, height: size, '--person': person.color } as CSSProperties
  return (
    <span className="hp-avatar" style={style} aria-hidden="true">
      {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <span>{person.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  )
}

/**
 * Uma foto por caminho: a URL assinada quando já chegou, senão o gradiente do
 * cartão — nunca um `<img>` quebrado. O pedido das URLs é de quem monta a
 * seção (`usePhotoUrls`, só das visíveis).
 */
export function PanelPhoto({ path, className, children }: { path: string | null; className: string; children?: ReactNode }) {
  const { urls } = useHome()
  const url = path ? urls.get(path) : undefined
  return (
    <div className={`hp-photo ${url ? '' : 'hp-photo--empty'} ${className}`}>
      {url && <img src={url} alt="" loading="lazy" />}
      {children}
    </div>
  )
}
