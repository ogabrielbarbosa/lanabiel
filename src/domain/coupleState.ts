// ADR: .agent/Decisions/0002-estadia-por-pessoa-estado-derivado.md
//
// O estado do casal é DERIVADO das duas posições e das duas cidades-casa.
// Nenhuma tabela o armazena — ver o ADR para o porquê, incluindo a tentativa
// anterior que o persistiu numa coluna `location_type` com RS e SP chumbados.

import { addDays } from '../lib/date'

export type CityId = string
export type ProfileId = string

/** Estadia de uma pessoa. Intervalo inclusivo nas duas pontas. */
export interface Stay {
  id: string
  profileId: ProfileId
  cityId: CityId
  /** Data ISO `YYYY-MM-DD`, inclusiva. */
  startsOn: string
  /** Data ISO `YYYY-MM-DD`, inclusiva. `null` = em aberto, nunca "terminou hoje". */
  endsOn: string | null
}

export interface Member {
  profileId: ProfileId
  homeCityId: CityId
}

export type CoupleState =
  /**
   * Os dois na mesma cidade. `hostProfileIds` diz de quem é a casa:
   * vazio  → "Viajando juntos"; um → "Juntos em <cidade>"; dois → moram juntos.
   */
  | { kind: 'together'; cityId: CityId; hostProfileIds: readonly ProfileId[] }
  /** Cidades diferentes. */
  | { kind: 'apart'; positions: readonly { profileId: ProfileId; cityId: CityId }[] }
  /**
   * Ao menos um dos dois sem estadia registrada no dia. NÃO é "separados":
   * chamar lacuna de separação faria a contagem afirmar o que não se sabe.
   */
  | { kind: 'unknown' }

export interface StateCounts {
  together: number
  apart: number
  unknown: number
}

/**
 * Estadia vigente de uma pessoa num dia.
 *
 * `endsOn` nulo é tratado como ilimitado — não como "até hoje". Capar em hoje
 * aqui faria a barra de uma estadia em aberto sumir do calendário em todo dia
 * futuro, sem erro nenhum. O corte em hoje é assunto de CONTAGEM, e vive em
 * `effectiveEndForCounting`.
 */
export function stayOn(
  stays: readonly Stay[],
  profileId: ProfileId,
  day: string,
): Stay | undefined {
  return stays.find(
    (s) => s.profileId === profileId && s.startsOn <= day && (s.endsOn === null || day <= s.endsOn),
  )
}

export function coupleStateOn(
  day: string,
  stays: readonly Stay[],
  members: readonly [Member, Member],
): CoupleState {
  const [a, b] = members
  const stayA = stayOn(stays, a.profileId, day)
  const stayB = stayOn(stays, b.profileId, day)

  if (!stayA || !stayB) return { kind: 'unknown' }

  if (stayA.cityId !== stayB.cityId) {
    return {
      kind: 'apart',
      positions: [
        { profileId: a.profileId, cityId: stayA.cityId },
        { profileId: b.profileId, cityId: stayB.cityId },
      ],
    }
  }

  const cityId = stayA.cityId
  return {
    kind: 'together',
    cityId,
    hostProfileIds: members.filter((m) => m.homeCityId === cityId).map((m) => m.profileId),
  }
}

/**
 * Fim efetivo para SOMAR DIAS VIVIDOS: `min(endsOn ?? hoje, hoje)`.
 * Dia futuro nunca entra em "dias juntos" — senão o contador afirma que já
 * aconteceu o que está só planejado.
 */
export function effectiveEndForCounting(stay: Stay, today: string): string {
  if (stay.endsOn === null) return today
  return stay.endsOn < today ? stay.endsOn : today
}

/**
 * Fim efetivo para DESENHAR: `endsOn ?? fim da janela visível`.
 * Uma estadia em aberto vai até a borda do que está na tela, não até hoje.
 */
export function effectiveEndForDisplay(stay: Stay, windowEnd: string): string {
  return stay.endsOn ?? windowEnd
}

/**
 * Contagem por estado num intervalo inclusivo, sem nunca contar dia futuro.
 * `unknown` não engorda `together` nem `apart`.
 */
export function countStates(
  from: string,
  to: string,
  today: string,
  stays: readonly Stay[],
  members: readonly [Member, Member],
): StateCounts {
  const counts: StateCounts = { together: 0, apart: 0, unknown: 0 }
  const last = to < today ? to : today

  for (let day = from; day <= last; day = addDays(day, 1)) {
    counts[coupleStateOn(day, stays, members).kind] += 1
  }

  return counts
}
