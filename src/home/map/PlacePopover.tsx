// `Place Popover` (RWZKP): o cartão do lugar, preso ao pin selecionado.
//
// Spec: .agent/Tasks/fase-7-mapa.md — R3, R14, I1
//
// Foto (a do item ou a primeira do feito — `photoOf`), _Quero ir_ / _Já
// fomos_, a tag da categoria, nome, quem adicionou e a seta, que abre o item
// na Lista (`listFocus`). A Home só lê (I1): a seta leva à tela dona.

import type { CSSProperties } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { requestListFocus } from '../../app/listFocus'
import { navigate } from '../../app/router'
import type { Pin } from '../../domain/map'
import { CATEGORY_ICONS, catClass } from '../../list/categories'
import { useHome } from '../context'
import { CategoryTag, MapAvatar, StatusMarker } from './parts'

const STATUS_LABEL = { want: 'Quero ir', done: 'Já fomos' } as const

/** O cartão tem 267 × 267 com a borda (o `.pen`: 247 + 2 × 10). */
const CARD = 267
/** Distância do centro do pin até a borda do cartão. */
const GAP = 30
/** Abaixo do cabeçalho e do breadcrumb (36 + 52 + 18 + 44, e folga). */
const TOP_MIN = 160

/**
 * O canto do cartão: à esquerda do pin, com a base um pouco abaixo dele (como
 * no `eocRt`); vira para a direita quando não cabe, e desce quando bateria no
 * cabeçalho. Sem engine não há âncora: o cartão fica sob o breadcrumb (e,
 * com o pin atrás do globo, quem chama nem o desenha).
 */
function placement(anchor: { x: number; y: number } | null, bounds: { width: number; height: number }): CSSProperties {
  if (!anchor) return {}
  let left = anchor.x - GAP - CARD
  if (left < 16) left = anchor.x + GAP
  if (bounds.width > 0) left = Math.min(left, bounds.width - CARD - 16)
  let top = anchor.y + 20 - CARD
  if (top < TOP_MIN) top = TOP_MIN
  if (bounds.height > 0) top = Math.min(top, bounds.height - CARD - 16)
  return { left, top, right: 'auto' }
}

export function PlacePopover({
  pin,
  anchor,
  bounds,
  photoUrl,
}: {
  pin: Pin
  anchor: { x: number; y: number } | null
  bounds: { width: number; height: number }
  photoUrl: string | null
}) {
  const { people } = useHome()
  const item = pin.item
  // Quem adicionou, entre os dois; quem já saiu do casal não tem nome aqui.
  const author = [people[1], people[2]].find((p) => p.profileId === item.addedBy) ?? null
  const Icon = CATEGORY_ICONS[pin.category]

  function open() {
    requestListFocus(item.id)
    navigate('/lista')
  }

  return (
    <div
      className={`hm-popover${anchor ? '' : ' hm-popover--docked'}`}
      style={placement(anchor, bounds)}
      role="dialog"
      aria-label={item.name}
    >
      <div className={`hm-popover-photo ${catClass(pin.category)}`}>
        {photoUrl ? <img src={photoUrl} alt="" /> : <Icon size={28} aria-hidden="true" />}
        <span className="hm-popover-status">
          <StatusMarker status={item.status} />
          {STATUS_LABEL[item.status]}
        </span>
      </div>
      <div className="hm-popover-body">
        <CategoryTag category={pin.category} />
        <p className="hm-popover-name">{item.name}</p>
        <div className="hm-popover-foot">
          {author && (
            <span className="hm-popover-author">
              <MapAvatar person={author} size={22} />
              Adicionado por {author.name}
            </span>
          )}
          <button type="button" className="hm-popover-open" aria-label={`Abrir ${item.name} na Lista`} onClick={open}>
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  )
}
