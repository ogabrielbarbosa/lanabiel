// O pedido para a Home abrir num lugar (R2): _Ver no globo_ (Lista), _Abrir
// globo_ e _Abrir no globo_ (Viagens). Como `calendarFocus.ts`: um valor só,
// em memória, lido ao montar (`peek`, puro) e apagado num efeito (`clear`).
//
// Spec: .agent/Tasks/fase-7-mapa.md, R2

export type MapFocus = { kind: 'item'; id: string } | { kind: 'city'; cityId: string } | { kind: 'world' }

let pending: MapFocus | null = null

/** Chame antes de `navigate('/')`. */
export function requestMapFocus(focus: MapFocus): void {
  pending = focus
}

export function peekMapFocus(): MapFocus | null {
  return pending
}

export function clearMapFocus(): void {
  pending = null
}
