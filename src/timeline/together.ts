import { todayISO } from '../lib/date'
import type { PersonId, Stay, TogetherPeriod } from './types'

function earlierEnd(a: string | undefined, b: string | undefined): string | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return a < b ? a : b
}

/** Interseção de todas as estadias de um com as do outro, na mesma cidade. */
export function computeTogetherPeriods(stays: Stay[]): TogetherPeriod[] {
  const gabriel = stays.filter((s) => s.person === 'gabriel')
  const lana = stays.filter((s) => s.person === 'lana')

  const periods: TogetherPeriod[] = []
  for (const g of gabriel) {
    for (const l of lana) {
      if (g.city !== l.city) continue
      const start = g.start > l.start ? g.start : l.start
      const end = earlierEnd(g.end, l.end)
      if (end === undefined || start <= end) periods.push({ start, end, city: g.city })
    }
  }

  return periods.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
}

export function stayOnDay(stays: Stay[], person: PersonId, iso: string): Stay | undefined {
  const today = todayISO()
  return stays.find((s) => {
    if (s.person !== person || iso < s.start) return false
    const effectiveEnd = s.end ?? today
    return iso <= effectiveEnd
  })
}

/** Os dois na mesma cidade neste dia. */
export function isTogetherOn(stays: Stay[], iso: string): boolean {
  const gabriel = stayOnDay(stays, 'gabriel', iso)
  const lana = stayOnDay(stays, 'lana', iso)
  return Boolean(gabriel && lana && gabriel.city === lana.city)
}
