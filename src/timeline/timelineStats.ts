import type { Stay, TogetherPeriod } from './types'
import { daysInclusive, todayISO } from '../lib/date'
import { computeTogetherPeriods, stayOnDay } from './together'

export interface TimelineStats {
  totalDaysTogether: number
  /** Período junto que inclui hoje (ou continua em aberto), se houver. */
  current: TogetherPeriod | null
  /** Próximo período junto mais cedo, se houver. */
  next: TogetherPeriod | null
  /** Último período junto já encerrado, se houver. */
  last: TogetherPeriod | null
  gabrielToday: Stay | undefined
  lanaToday: Stay | undefined
}

export function computeStats(stays: Stay[]): TimelineStats {
  const today = todayISO()
  const together = computeTogetherPeriods(stays)

  let totalDaysTogether = 0
  let current: TogetherPeriod | null = null
  let next: TogetherPeriod | null = null
  let last: TogetherPeriod | null = null

  for (const period of together) {
    const isOngoing = period.end === undefined

    if (period.start <= today) {
      const cappedEnd = isOngoing || period.end! > today ? today : period.end!
      totalDaysTogether += daysInclusive(period.start, cappedEnd)
    }
    if (period.start <= today && (isOngoing || period.end! >= today)) {
      current = period
    }
    if (period.start > today && (!next || period.start < next.start)) {
      next = period
    }
    if (!isOngoing && period.end! < today && (!last || period.end! > last.end!)) {
      last = period
    }
  }

  return {
    totalDaysTogether,
    current,
    next,
    last,
    gabrielToday: stayOnDay(stays, 'gabriel', today),
    lanaToday: stayOnDay(stays, 'lana', today),
  }
}
