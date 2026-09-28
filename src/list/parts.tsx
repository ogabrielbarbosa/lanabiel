// Peças pequenas da Lista, reaproveitadas pela tela, pelo painel e pelos
// componentes sobrepostos (modal, detalhe, marcar como feito).

import { useEffect, useId, useRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Heart, X } from 'lucide-react'
import { useExitTransition } from '../app/motion'
import { CATEGORY_LABELS } from '../domain/list'
import type { ListCategory } from '../domain/list'
import { CATEGORY_ICONS, catClass } from './categories'
import type { ListMember } from './context'

/** Avatar com foto assinada, ou a inicial sobre a cor da pessoa. */
export function Avatar({ member, size = 18 }: { member: Pick<ListMember, 'name' | 'color' | 'avatarUrl'> | null; size?: number }) {
  const style = { width: size, height: size, '--person': member?.color } as CSSProperties
  return (
    <span className="ls-avatar" style={style} aria-hidden="true">
      {member?.avatarUrl ? <img src={member.avatarUrl} alt="" /> : <span>{member?.name.slice(0, 1).toUpperCase() ?? '?'}</span>}
    </span>
  )
}

/** "Casal / Juntos" (`TRoUw`): os dois avatares e o coração no meio. */
export function CoupleMark({ members }: { members: readonly ListMember[] }) {
  return (
    <span className="ls-couple" aria-hidden="true">
      {members.slice(0, 2).map((m) => (
        <Avatar key={m.profileId} member={m} size={18} />
      ))}
      <span className="ls-couple-heart">
        <Heart size={9} fill="currentColor" />
      </span>
    </span>
  )
}

/** `Category Tag` (`DwK4I`): ponto na cor da categoria + o nome no singular. */
export function CategoryTag({ category, className = '' }: { category: ListCategory; className?: string }) {
  return (
    <span className={`ls-tag ${catClass(category)} ${className}`}>
      <span className="ls-dot" aria-hidden="true" />
      {CATEGORY_LABELS[category].one}
    </span>
  )
}

/** Foto do item, ou o fundo da categoria com o ícone dela quando não há URL. */
export function ItemPhoto({
  category,
  url,
  className = '',
  children,
}: {
  category: ListCategory
  url: string | null
  className?: string
  children?: ReactNode
}) {
  const Icon = CATEGORY_ICONS[category]
  return (
    <div className={`ls-photo ${catClass(category)} ${url ? '' : 'ls-photo--empty'} ${className}`}>
      {url ? (
        <img src={url} alt="" loading="lazy" />
      ) : (
        <Icon className="ls-photo-icon" size={28} aria-hidden="true" />
      )}
      {children}
    </div>
  )
}

/**
 * Diálogo sobreposto acessível: `role="dialog"`, `aria-modal`, título ligado,
 * Esc e o botão Fechar chamam `onClose`, o foco entra no diálogo ao abrir.
 * `variant="sheet"` é o painel lateral do detalhe (`RWegR`).
 */
export function ListDialog({
  title,
  subtitle,
  onClose,
  variant = 'modal',
  children,
  footer,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  variant?: 'modal' | 'sheet'
  children?: ReactNode
  footer?: ReactNode
}) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  // Fechar pelo botão, Esc ou véu anima a saída antes de o dono desmontar.
  const { ref: exitRef, closing, requestClose } = useExitTransition<HTMLDivElement>(onClose)
  const closeRef = useRef(requestClose)
  useEffect(() => {
    closeRef.current = requestClose
  }, [requestClose])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  return (
    <div
      ref={exitRef}
      className={`ls-overlay ls-overlay--${variant} ${closing ? 'is-closing' : ''}`}
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <div ref={ref} className={`ls-dialog ls-dialog--${variant} lg`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="ls-dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="ls-dialog-sub">{subtitle}</p>}
          </div>
          <button type="button" className="ls-icon-btn" aria-label="Fechar" onClick={requestClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="ls-dialog-scroll">
          <div className="ls-dialog-body">{children}</div>
        </div>
        {footer && <div className="ls-dialog-foot">{footer}</div>}
      </div>
    </div>
  )
}
