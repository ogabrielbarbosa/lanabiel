// _Em destaque · Ver lista ›_ (R19): os itens `featured`, a fazer, mais
// recentes — um grande e até dois pequenos (`Destaque Card` vg3JO). Tocar abre
// o item na ficha da Lista (R3). Sem destaque, o bloco some.

import { Sparkles } from 'lucide-react'
import { requestListFocus } from '../../app/listFocus'
import { navigate } from '../../app/router'
import type { ListItem } from '../../domain/list'
import { CATEGORY_ICONS, catClass } from '../../list/categories'
import { CategoryTag } from '../../list/parts'
import { usePhotoUrls, useHome } from '../context'
import { featuredItems, featuredPlace } from './derive'
import { CardAction, PanelCard } from './parts'

/** R19: um grande e dois pequenos. */
const FEATURED = 3

export function Featured() {
  const { items, settings, photoOf } = useHome()
  const featured = featuredItems(items, settings.hiddenCategories, FEATURED)
  const urls = usePhotoUrls(featured.map(photoOf))
  if (featured.length === 0) return null

  const open = (item: ListItem) => {
    requestListFocus(item.id)
    navigate('/lista')
  }
  const card = (item: ListItem, size: 'big' | 'small') => {
    const path = photoOf(item)
    const url = path ? urls.get(path) : undefined
    const Icon = CATEGORY_ICONS[item.category]
    return (
      <button
        key={item.id}
        type="button"
        className={`hp-feat hp-feat--${size} ${catClass(item.category)} ${url ? '' : 'hp-feat--empty'}`}
        aria-label={`Abrir ${item.name} na Lista`}
        onClick={() => open(item)}
      >
        {url ? <img src={url} alt="" loading="lazy" /> : <Icon className="hp-feat-icon" size={36} aria-hidden="true" />}
        <span className="hp-feat-scrim">
          <span className="hp-feat-top">
            <CategoryTag category={item.category} className="ls-tag--glass" />
            <span className="hp-feat-spark" aria-hidden="true">
              <Sparkles size={14} />
            </span>
          </span>
          <span className="hp-feat-info">
            <span className="hp-feat-name">{item.name}</span>
            <span className="hp-feat-place">{featuredPlace(item)}</span>
          </span>
        </span>
      </button>
    )
  }

  const [first, ...rest] = featured
  return (
    <PanelCard title="Em destaque" action={<CardAction label="Ver lista" onClick={() => navigate('/lista')} />}>
      <div className="hp-feats">
        {card(first, 'big')}
        {rest.length > 0 && <div className="hp-feats-row">{rest.map((i) => card(i, 'small'))}</div>}
      </div>
    </PanelCard>
  )
}
