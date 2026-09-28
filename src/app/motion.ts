// Movimento do app: a troca de tela e a saída dos modais.
//
// Quase toda animação é CSS puro (entrada de modal, menu, botão, login, a
// cascata dos cartões). Só o fechar precisa de código: o modal espera a
// animação de saída antes de o dono desmontá-lo.
//
// "Reduzir animações" (`data-reduce-motion` no <html>, appearance.ts e o
// script do index.html) a desliga; o CSS já corta o resto.

import { useCallback, useEffect, useRef, useState } from 'react'

export function motionReduced(): boolean {
  if (typeof document === 'undefined') return true
  const flag = document.documentElement.dataset.reduceMotion
  if (flag === 'true') return true
  if (flag === 'false') return false
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** As animações finitas em curso sob `element` (o brilho infinito do vidro não conta). */
function finiteAnimations(element: Element): Animation[] {
  return element
    .getAnimations({ subtree: true })
    .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
}

/**
 * Fechar com animação de saída. Devolve `closing` (para a classe `is-closing`
 * no sobreposto), `ref` (a raiz que anima) e `requestClose`, que marca a saída
 * e só chama `onClose` quando as animações dela terminam — com um teto, para
 * uma animação que não acaba nunca não prender o modal aberto. Sem
 * `getAnimations` (jsdom) fecha na hora, como antes.
 */
export function useExitTransition<T extends HTMLElement>(onClose: () => void, maxMs = 400) {
  const ref = useRef<T>(null)
  const [closing, setClosing] = useState(false)
  const latest = useRef(onClose)
  useEffect(() => {
    latest.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!closing) return
    const element = ref.current
    const animations = element ? finiteAnimations(element) : []
    // Fechou, volta ao repouso: quem continua montado (o menu do _Adicionar_)
    // reabriria já saindo, invisível, e o próximo clique não faria nada.
    const close = () => {
      setClosing(false)
      latest.current()
    }
    if (animations.length === 0) {
      close()
      return
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      close()
    }
    const timer = window.setTimeout(finish, maxMs)
    Promise.allSettled(animations.map((animation) => animation.finished)).then(finish)
    return () => {
      done = true
      window.clearTimeout(timer)
    }
  }, [closing, maxMs])

  const requestClose = useCallback(() => {
    const element = ref.current
    if (!element || typeof element.getAnimations !== 'function' || motionReduced()) {
      latest.current()
      return
    }
    setClosing(true)
  }, [])

  return { ref, closing, requestClose }
}
