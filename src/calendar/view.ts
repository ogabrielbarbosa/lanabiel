// Contas de exibição do Calendário, sem JSX: título do mês, navegação, janelas
// da grade, a cor de cada faixa e o ícone de cada tipo de evento. Separadas dos
// componentes para o fast refresh (oxlint `only-export-components`).

import { Bell, Briefcase, Cake, Heart, Luggage, Plane } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CoupleSettings } from '../data/settings'
import { countDrawn, monthWeeks } from '../domain/calendar'
import type { Band, EventKind, MembersBySlot, Stay } from '../domain/calendar'
import { countStates } from '../domain/coupleState'
import { addDays, daysInclusive, isLeapYear, isoOf } from '../lib/date'
import type { YearMonth } from './context'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** `{2026, 9}` → "Setembro 2026" (o título do frame, sem o "de"). */
export function monthTitle({ year, month }: YearMonth): string {
  return `${MONTHS[month - 1]} ${year}`
}

/** `9` → "Setembro". */
export function monthName(month: number): string {
  return MONTHS[month - 1]
}

export function monthOf(day: string): YearMonth {
  return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) }
}

export function shiftYearMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

/** A cor de cada faixa vem de `couple_settings` — nunca chumbada no CSS (R6). */
export function bandColor(settings: CoupleSettings, band: Exclude<Band, 'unknown'>): string {
  switch (band) {
    case 'home1':
      return settings.colorTogetherHome1
    case 'home2':
      return settings.colorTogetherHome2
    case 'away':
      return settings.colorTogetherAway
    case 'apart':
      return settings.colorApart
  }
}

/** Ícone de cada tipo de evento, como nos chips do frame. */
export const EVENT_ICONS: Record<EventKind, LucideIcon> = {
  viagem: Plane,
  visita: Luggage,
  date: Heart,
  data_especial: Cake,
  compromisso: Briefcase,
  lembrete: Bell,
}

/** O primeiro e o último dia do mês. */
export function monthBounds({ year, month }: YearMonth): { from: string; to: string } {
  const next = month === 12 ? isoOf(year + 1, 1, 1) : isoOf(year, month + 1, 1)
  return { from: isoOf(year, month, 1), to: addDays(next, -1) }
}

/** O primeiro e o último dia da GRADE (com os vizinhos) — a janela do 💋 (seção 8). */
export function gridBounds(month: YearMonth, weekStartsOn: 'sun' | 'mon'): { from: string; to: string } {
  const weeks = monthWeeks(month.year, month.month, weekStartsOn)
  return { from: weeks[0][0], to: weeks[weeks.length - 1][6] }
}


/** "1 dia" · "4 dias". */
export function daysWord(n: number): string {
  return n === 1 ? '1 dia' : `${n} dias`
}

/**
 * R10, o kicker da visão Ano. Ano corrente e ano passado contam o VIVIDO
 * (`countStates`, nunca passa de hoje); ano futuro conta o DESENHADO
 * (`countDrawn`), porque vivido lá é sempre zero (I5).
 */
export function yearKicker(year: number, today: string, stays: readonly Stay[], members: MembersBySlot): string {
  const from = isoOf(year, 1, 1)
  const to = isoOf(year, 12, 31)
  if (from > today) {
    const c = countDrawn(from, to, stays, members)
    return `${c.home1 + c.home2 + c.away} dias juntos planejados`
  }
  const lived = countStates(from, to, today, stays, [members[1], members[2]]).together
  if (to < today) {
    const total = isLeapYear(year) ? 366 : 365
    return `${lived} dias juntos · ${Math.floor((100 * lived) / total)}% do ano`
  }
  const elapsed = daysInclusive(from, today)
  return `${lived} dias juntos · ${Math.floor((100 * lived) / elapsed)}% do ano até agora`
}
