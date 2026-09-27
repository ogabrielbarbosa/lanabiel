// O botão global _Adicionar_ (`Add Button`, NVoXy) da barra: ele escolhe entre
// evento e item, navega para a tela dona e pede que ela abra o modal.
//
// Spec: .agent/Tasks/fase-5-calendario.md, R1
//
// O pedido fica guardado aqui até a tela de destino terminar de carregar e
// consumi-lo — a tela só abre o modal com os dados lidos, e a navegação chega
// antes deles. Consumir apaga o pedido: voltar à tela depois não reabre nada.
// Sem biblioteca de rotas nem parâmetro na URL (ADR 0013): é um valor só, em
// memória, com o mesmo `useSyncExternalStore` do roteador.

import { useEffect, useSyncExternalStore } from 'react'

export type AddIntent = 'new-event' | 'new-item'

let pending: AddIntent | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** A barra pede: a próxima tela que consumir `intent` abre o modal. */
export function requestAdd(intent: AddIntent): void {
  pending = intent
  for (const listener of listeners) listener()
}

/**
 * A tela de destino consome: chama `open` uma vez quando há um pedido para ela.
 * Montar o hook só depois de ter os dados é o que garante que o modal abre
 * com eles.
 */
export function useAddIntent(intent: AddIntent, open: () => void): void {
  const current = useSyncExternalStore(subscribe, () => pending)
  useEffect(() => {
    if (current !== intent) return
    pending = null
    open()
    // `open` muda a cada render na maioria das telas; o que decide é o pedido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, intent])
}
