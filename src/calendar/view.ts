// Contas de exibição do Calendário, sem JSX: título do mês, navegação, janelas
// da grade, a cor de cada faixa e o ícone de cada tipo de evento. Separadas dos
// componentes para o fast refresh (oxlint `only-export-components`).

import { Bell, Briefcase, Cake, Heart, Luggage, Plane } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { CoupleSettings } from '../data/settings'
import { monthWeeks } from '../domain/calendar'
import type { Band, EventKind } from '../domain/calendar'
import { addDays, isoOf } from '../lib/date'
import type { YearMonth } from './context'

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

/** `{2026, 9}` → "Setembro 2026" (o título do frame, sem o "de"). */
export function monthTitle({ year, month }: YearMonth): string {
  return `${MONTHS[month - 1]} ${year}`
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

