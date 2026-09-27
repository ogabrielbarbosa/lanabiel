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

const WEEKDAYS_LONG_PT = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** `'Sexta, 25 de setembro'` — o cabeçalho do painel das Configurações. */
export function weekdayDayMonthLabel(iso: string): string {
  const date = parseISODate(iso)
  return `${WEEKDAYS_LONG_PT[date.getDay()]}, ${date.getDate()} de ${MONTHS_PT[date.getMonth()].toLowerCase()}`
}

/** Dia do mês de uma data ISO, sem passar por `Date`. */
export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10))
}

/** `'17 de setembro de 2024'`. */
export function longDateBR(iso: string): string {
  const date = parseISODate(iso)
  return `${date.getDate()} de ${MONTHS_PT[date.getMonth()].toLowerCase()} de ${date.getFullYear()}`
}

const MONTHS_SHORT_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** `'2026-07-18'` → `'18 jul'` — o selo "Feito · 18 jul" e o "até 30 set". */
export function shortDayMonth(iso: string): string {
  return `${dayOfMonth(iso)} ${MONTHS_SHORT_PT[Number(iso.slice(5, 7)) - 1]}`
}

/**
 * A data LOCAL de um timestamp (`timestamptz` do banco). `created_at`
 * `'2026-09-26T01:30:00Z'` é dia 25 em SJC — cortar os 10 primeiros
 * caracteres daria o dia em UTC e faria um item de 22h contar como "amanhã".
 */
export function localDateOf(timestamp: string): string {
  return toISODate(new Date(timestamp))
}

/** `'2026-07-18'` → `'18 jul 2026'` ("Feito em 18 jul 2026", na Lista). */
export function dayMonthYear(iso: string): string {
  return `${shortDayMonth(iso)} ${iso.slice(0, 4)}`
}

const WEEKDAYS_SHORT_CAP = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** `'2026-07-18'` → `'Sáb, 18 jul 2026'` (a data da memória, na Lista). */
export function weekdayDayMonthYear(iso: string): string {
  return `${WEEKDAYS_SHORT_CAP[parseISODate(iso).getDay()]}, ${dayMonthYear(iso)}`
}


/** Dia da semana de uma data ISO: 0 = domingo … 6 = sábado (horário local). */
export function weekdayOf(iso: string): number {
  return parseISODate(iso).getDay()
}

/** Ano bissexto no calendário gregoriano — sem `Date`, só aritmética. */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

/** `(2026, 9, 1)` → `'2026-09-01'`. Mês 1-based, como na própria string ISO. */
export function isoOf(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
