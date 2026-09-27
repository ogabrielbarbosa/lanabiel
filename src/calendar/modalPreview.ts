// Contas das prévias dos modais (R14, R18), sem JSX: a faixa de cada dia de
// uma tira, os dias que uma pintura substitui e o nome do mês. Tudo sobre
// `runs` (I4) — a mesma derivação da grade, nunca uma segunda.

import { runs } from '../domain/calendar'
import type { Band, MembersBySlot, PaintEntry, Stay } from '../domain/calendar'
import { addDays } from '../lib/date'

const MONTHS_LOWER = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
]

/** `'2026-11'` ou `'2026-11-13'` → "novembro". */
export function monthNameOf(iso: string): string {
  return MONTHS_LOWER[Number(iso.slice(5, 7)) - 1]
}

/** Os dias de `from` a `to`, inclusivos. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

/** Dia → chave e faixa do trecho, na janela `[from, to]`. */
function keysByDay(stays: readonly Stay[], members: MembersBySlot, from: string, to: string): Map<string, { key: string; band: Band }> {
  const out = new Map<string, { key: string; band: Band }>()
  for (const run of runs(stays, members, from, to)) {
    for (const d of daysBetween(run.from, run.to as string)) out.set(d, { key: run.key, band: run.band })
  }
  return out
}

export function bandsByDay(stays: readonly Stay[], members: MembersBySlot, from: string, to: string): Map<string, Band> {
  return new Map([...keysByDay(stays, members, from, to)].map(([d, v]) => [d, v.band]))
}

/**
 * R14: quantos dias que JÁ tinham registro mudam de estado com a pintura — o
 * "Substitui {n} dias que já estavam no calendário". Dia sem registro antes
 * (`unknown`) não conta: preencher lacuna não substitui nada.
 *
 * A janela vai do primeiro dia pintado até a última borda conhecida (fim ou
 * começo de qualquer estadia, antes ou depois, ou fim de entrada). Depois
 * dela, as estadias que continuam são as abertas, e o que muda ali segue
 * igual para sempre: contar "infinito" não ajuda ninguém, e a borda já mostra
 * que algo em aberto foi trocado.
 */
export function replacedDays(
  before: readonly Stay[],
  after: readonly Stay[],
  members: MembersBySlot,
  entries: readonly PaintEntry[],
): number {
  if (entries.length === 0) return 0
  const from = entries.map((e) => e.from).reduce((a, b) => (a < b ? a : b))
  let to = from
  const bump = (d: string | null) => {
    if (d !== null && d > to) to = d
  }
  for (const e of entries) bump(e.to)
  for (const s of [...before, ...after]) {
    bump(s.startsOn)
    bump(s.endsOn)
  }
  const old = keysByDay(before, members, from, to)
  const next = keysByDay(after, members, from, to)
  let n = 0
  for (const [d, was] of old) {
    if (was.band !== 'unknown' && next.get(d)?.key !== was.key) n++
  }
  return n
}
