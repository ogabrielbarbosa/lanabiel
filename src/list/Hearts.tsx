// Os corações da nota (0–5), compartilhados pelo detalhe (R16) e pelo Marcar
// como feito (R20). Tocar no coração igual à nota atual LIMPA a nota (volta a
// 0): é o único gesto para "sem nota" sem um botão a mais, e o mesmo nos dois.

import { Heart } from 'lucide-react'
import type { Rating } from '../domain/list'

const STEPS = [1, 2, 3, 4, 5] as const satisfies readonly Rating[]

export function Hearts({
  value,
  onPick,
  disabled = false,
  label = 'Quanto vocês amaram?',
  size = 16,
}: {
  value: Rating | null
  /** Recebe a nota nova, ou `null` quando tocou na nota atual. */
  onPick: (next: Rating | null) => void
  disabled?: boolean
  label?: string
  size?: number
}) {
  return (
    <div className="ls-hearts" role="group" aria-label={label}>
      {STEPS.map((n) => {
        const on = value !== null && n <= value
        return (
          <button
            key={n}
            type="button"
            className={`ls-heart ${on ? 'ls-heart--on' : ''}`}
            aria-label={`${n} de 5`}
            aria-pressed={value === n}
            disabled={disabled}
            onClick={() => onPick(value === n ? null : n)}
          >
            <Heart size={size} fill={on ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
