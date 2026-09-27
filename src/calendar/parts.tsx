// Peças pequenas do Calendário, reaproveitadas pela grade, pelo cartão do
// primeiro período e (T8–T11) pelo ano, pelo painel e pelos modais.

import { useRef } from 'react'
import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react'
import { Calendar, Heart } from 'lucide-react'
import { weekdayShortDayMonth } from '../lib/date'
import type { CalendarPerson } from './context'

/** Avatar com foto assinada, ou a inicial sobre a cor da pessoa. */
export function Avatar({ person, size = 18 }: { person: Pick<CalendarPerson, 'name' | 'color' | 'avatarUrl'>; size?: number }) {
  const style = { width: size, height: size, '--person': person.color } as CSSProperties
  return (
    <span className="cal-avatar" style={style} aria-hidden="true">
      {person.avatarUrl ? <img src={person.avatarUrl} alt="" /> : <span>{person.name.slice(0, 1).toUpperCase()}</span>}
    </span>
  )
}

/**
 * O par de avatares (`TRoUw` / `CVJkd`): sobrepostos nos dois casos (3px), com
 * ♥ quando juntos. Em `unknown` quem chama não desenha nada.
 */
export function CouplePair({ people, together }: { people: readonly CalendarPerson[]; together: boolean }) {
  return (
    <span className={`cal-pair ${together ? 'cal-pair--together' : 'cal-pair--apart'}`} aria-hidden="true">
      {people.map((p) => (
        <Avatar key={p.profileId} person={p} />
      ))}
      {together && (
        <span className="cal-pair-heart">
          <Heart size={9} fill="currentColor" />
        </span>
      )}
    </span>
  )
}

/**
 * O par grande com o ♥ embaixo (`orAVy` no _Agora_, `moBJ2` na prévia do
 * evento). Cada lugar do frame tem a sua medida: avatar, sobreposição, o
 * coração (tamanho e canto de cima à esquerda) e o ícone dele.
 */
export function BigPair({ people, together, size, overlap, heart, icon }: {
  people: readonly CalendarPerson[]
  together: boolean
  size: number
  overlap: number
  heart: { size: number; x: number; y: number }
  icon: number
}) {
  const style = {
    '--pair-overlap': `${together ? overlap : -4}px`,
    '--pair-heart': `${heart.size}px`,
    '--pair-heart-x': `${heart.x}px`,
    '--pair-heart-y': `${heart.y}px`,
    paddingBottom: together ? Math.max(0, heart.y + heart.size - size) : 0,
  } as CSSProperties
  return (
    <span className="cal-bigpair" style={style} aria-hidden="true">
      {people.map((p) => (
        <Avatar key={p.profileId} person={p} size={size} />
      ))}
      {together && (
        <span className="cal-bigpair-heart">
          <Heart size={icon} fill="currentColor" />
        </span>
      )}
    </span>
  )
}

/**
 * Campo de data como o `Form Field` do frame: ícone, o valor por extenso
 * ("Sex, 13 nov") e, por baixo do valor, o `<input type="date">` nativo
 * invisível — é ele que recebe foco, teclado e o seletor do sistema
 * (`showPicker()` quando existe; senão, o foco). `children` vai depois do
 * valor (a hora da Ida/Volta).
 */
export function DateField({
  value,
  onChange,
  format = weekdayShortDayMonth,
  placeholder = 'Escolher',
  icon,
  children,
  inputProps,
}: {
  value: string
  onChange: (value: string) => void
  format?: (iso: string) => string
  placeholder?: string
  icon?: ReactNode
  children?: ReactNode
  inputProps: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'>
}) {
  const ref = useRef<HTMLInputElement>(null)

  function open() {
    const input = ref.current
    if (!input || input.disabled) return
    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker()
        return
      }
    } catch {
      // Sem gesto do usuário ou sem suporte: fica o foco, e o teclado.
    }
    input.focus()
  }

  return (
    <>
      {icon ?? <Calendar size={15} aria-hidden="true" />}
      <span className="cal-date">
        <span className={`cal-date-text ${value ? '' : 'is-empty'}`} aria-hidden="true">
          {value ? format(value) : placeholder}
        </span>
        <input
          {...inputProps}
          ref={ref}
          type="date"
          className="cal-date-native"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={open}
        />
      </span>
      {children}
    </>
  )
}
