// O pedido para a Lista abrir com um item na ficha (R3) — a seta do cartão do
// lugar, os cartões do painel da Home. Mesmo formato de `mapFocus.ts`.
//
// Spec: .agent/Tasks/fase-7-mapa.md, R3

let pending: string | null = null

/** O id do item (`list_items.id`). Chame antes de `navigate('/lista')`. */
export function requestListFocus(itemId: string): void {
  pending = itemId
}

export function peekListFocus(): string | null {
  return pending
}

export function clearListFocus(): void {
  pending = null
}
