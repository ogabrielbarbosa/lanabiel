// O vidro líquido (`.lg`, app.css) segue o cursor: o trecho aceso do contorno
// fica onde o ponteiro está. Um só listener no documento escreve `--mx`/`--my`
// (px, relativos à caixa) em cada `.lg` sob o ponteiro — o cartão E o painel
// que o contém, para o contorno do painel acender quando o cursor passa rente
// à borda dele.
//
// No documento, e não por componente: os vidros nascem e somem com os dados
// (popover, cartões, modais) e vivem também fora da casca (login,
// onboarding); nenhum precisa saber disso. Só o mouse: no toque não há hover,
// e o CSS nem liga o efeito.

export function trackGlassPointer(event: PointerEvent): void {
  if (event.pointerType !== 'mouse' || !(event.target instanceof Element)) return
  let glass = event.target.closest<HTMLElement>('.lg')
  while (glass) {
    const box = glass.getBoundingClientRect()
    glass.style.setProperty('--mx', `${event.clientX - box.left}px`)
    glass.style.setProperty('--my', `${event.clientY - box.top}px`)
    glass = glass.parentElement?.closest<HTMLElement>('.lg') ?? null
  }
}

/** Liga o rastreio uma vez, para o app inteiro. Devolve o desligar. */
export function installGlassPointer(target: Document = document): () => void {
  target.addEventListener('pointermove', trackGlassPointer, { passive: true })
  return () => target.removeEventListener('pointermove', trackGlassPointer)
}
