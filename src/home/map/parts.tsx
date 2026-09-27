// Peças pequenas da área do mapa da Home: avatar, marcador de status, tag de
// categoria. A área do mapa é sempre escura (spec, seção 14): as cores são as
// do `.pen`, definidas em `home.css` sob `.home-map`, não os tokens de tema.

import type { CSSProperties } from 'react'
import { CATEGORY_LABELS } from '../../domain/list'
import type { ListCategory, ListItem } from '../../domain/list'
import { catClass } from '../../list/categories'
import type { HomePerson } from '../context'

/** Avatar com foto assinada, ou a inicial sobre a cor da pessoa. */
export function MapAvatar({ person, size }: { person: Pick<HomePerson, 'name' | 'color' | 'avatarUrl'>; size: number }) {
  const style = { width: size, height: size, '--person': person.color } as CSSProperties
  return (
    <span className="hm-avatar" style={style} aria-hidden="true">
      {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <span>{person.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  )
}

/** O marcador do status: anel (quero ir) ou disco (já fomos) — `Map Filters` e o cartão. */
export function StatusMarker({ status }: { status: ListItem['status'] | 'all' }) {
  return <span className={`hm-marker hm-marker--${status}`} aria-hidden="true" />
}

/** A tag da categoria: bolinha na cor da categoria e o nome (`Place Popover`). */
export function CategoryTag({ category }: { category: ListCategory }) {
  return (
    <span className={`hm-tag ${catClass(category)}`}>
      <span className="hm-dot" aria-hidden="true" />
      {CATEGORY_LABELS[category].one}
    </span>
  )
}
