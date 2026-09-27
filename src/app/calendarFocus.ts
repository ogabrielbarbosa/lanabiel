// _Ver no calendário_ das Viagens (R14, R18, R32): navega para `/` pedindo que
// o Calendário abra num mês, na visão Mês. Desde a Fase 7 o Calendário mora
// em `/calendario` (ADR 0023).
//
// Spec: .agent/Tasks/fase-6-viagens.md, R32
//
// Como `addIntent.ts`: um valor só, em memória, sem parâmetro na URL (ADR
// 0020 — rota com parâmetro só a do detalhe). O Calendário LÊ o pedido ao
// montar (`peekCalendarFocus`, puro, para o inicializador de estado aguentar o
// StrictMode chamá-lo duas vezes) e o APAGA num efeito
// (`clearCalendarFocus`): voltar ao Calendário depois não reabre aquele mês.

/** Mês 1-based, como `YearMonth` do Calendário. */
export interface CalendarFocus {
  year: number
  month: number
}

let pending: CalendarFocus | null = null

/** Pede o mês de `day` (`YYYY-MM-DD`) — chame antes de `navigate('/calendario')`. */
export function requestCalendarFocus(day: string): void {
  pending = { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) }
}

/** O pedido em aberto, sem consumi-lo. */
export function peekCalendarFocus(): CalendarFocus | null {
  return pending
}

export function clearCalendarFocus(): void {
  pending = null
}
