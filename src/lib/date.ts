export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysInclusive(start: string, end: string): number {
  const ms = parseISODate(end).getTime() - parseISODate(start).getTime()
  return Math.round(ms / 86_400_000) + 1
}

/** Diferença em dias entre duas datas ISO (positiva quando `to` é depois de `from`). */
export function diffDays(from: string, to: string): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime()
  return Math.round(ms / 86_400_000)
}

export function addDays(iso: string, amount: number): string {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + amount)
  return toISODate(date)
}

export const WEEKDAYS_PT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function monthLabel(year: number, month: number): string {
  return `${MONTHS_PT[month]} de ${year}`
}

export function formatDateBR(iso: string): string {
  return parseISODate(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export interface GridDay {
  iso: string
  inMonth: boolean
}

/** Semanas de 7 dias cobrindo o mês, incluindo os dias vizinhos que completam a grade. */
export function buildMonthGrid(year: number, month: number): GridDay[][] {
  const startWeekday = new Date(year, month, 1).getDay()
  const weeks: GridDay[][] = []

  for (let week = 0; week < 6; week++) {
    const days: GridDay[] = []
    for (let weekday = 0; weekday < 7; weekday++) {
      const date = new Date(year, month, 1 - startWeekday + week * 7 + weekday)
      days.push({ iso: toISODate(date), inMonth: date.getMonth() === month })
    }
    if (week > 3 && days.every((day) => !day.inMonth)) break
    weeks.push(days)
  }

  return weeks
}
