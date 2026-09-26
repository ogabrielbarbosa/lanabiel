export type PersonId = 'gabriel' | 'lana'

export interface Person {
  id: PersonId
  name: string
  color: string
}

export interface Stay {
  id: string
  person: PersonId
  /** Data ISO (YYYY-MM-DD), inclusiva. */
  start: string
  /** Data ISO (YYYY-MM-DD), inclusiva. `undefined` = ainda não acabou. */
  end?: string
  city: string
  note?: string
}

/** Interseção calculada: os dois na mesma cidade, no mesmo intervalo. */
export interface TogetherPeriod {
  start: string
  /** `undefined` = ainda estão juntos, sem data de fim. */
  end?: string
  city: string
}
