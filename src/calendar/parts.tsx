// Peças pequenas do Calendário, reaproveitadas pela grade, pelo cartão do
// primeiro período e (T8–T11) pelo ano, pelo painel e pelos modais.

import type { CSSProperties } from 'react'
import { Heart } from 'lucide-react'
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
 * O par de avatares (`TRoUw` / `CVJkd`): sobrepostos com ♥ quando juntos, lado
 * a lado quando separados. Em `unknown` quem chama não desenha nada.
 */
export function CouplePair({ people, together }: { people: readonly CalendarPerson[]; together: boolean }) {
  return (
    <span className={`cal-pair ${together ? 'cal-pair--together' : 'cal-pair--apart'}`} aria-hidden="true">
      {people.map((p) => (
        <Avatar key={p.profileId} person={p} />
      ))}
      {together && (
        <span className="cal-pair-heart">
          <Heart size={8} fill="currentColor" />
        </span>
      )}
    </span>
  )
}
