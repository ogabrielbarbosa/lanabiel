// Formatação de data das telas de onboarding. Datas de calendário chegam como
// ISO `YYYY-MM-DD` e passam por `parseISODate` (horário local); instantes
// (`expires_at`) chegam como timestamptz e são mostrados no fuso do casal (I12).

import { parseISODate } from '../lib/date'

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** `'2024-09-17'` → `'17 set 2024'`, como o design escreve. */
export function shortDate(iso: string): string {
  const date = parseISODate(iso)
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
}

/** Instante → `'3 de outubro'`, em America/Sao_Paulo. */
export function dayMonth(instant: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(instant))
}

/** Instante → `'12 set'`, em America/Sao_Paulo. */
export function dayMonthShort(instant: string): string {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).formatToParts(new Date(instant))
  const day = parts.find((p) => p.type === 'day')?.value ?? ''
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? 1)
  return `${Number(day)} ${MONTHS_SHORT[month - 1]}`
}

/** `'há 2 min'`, `'há 3 h'`, `'agora'`. Para "enviado há…". */
export function ago(instant: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - new Date(instant).getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

/** `'Rafael Souza'` → `'RS'`. O avatar sem foto. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
