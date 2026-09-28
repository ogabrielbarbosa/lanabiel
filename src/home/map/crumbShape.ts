// A silhueta do breadcrumb com o seletor aberto (OspYO/XXySj): a pílula e o
// painel que pende dela são UM path só no `.pen` — o desfoque, o
// preenchimento, o contorno em degradê e a sombra correm pela forma inteira, e
// onde o painel encosta na barra os cantos se curvam para fora (raio 16). Duas
// caixas com cantos postiços nunca batem: a pílula mantém o contorno de baixo
// e o canto invertido não tem borda nem desfoque.
//
// O path segue o do `.pen` (`M22 0h426a22 22 0 0 1 0 44h0a16 16 0 0 0-16 16…`)
// com as medidas do DOM no lugar das fixas.

/** Raio da pílula (altura 44). */
export const BAR_RADIUS = 22
/** Raio dos cantos invertidos, onde o painel encontra a barra. */
export const JOIN_RADIUS = 16
/** Raio dos cantos de baixo do painel. */
export const PANEL_RADIUS = 26

export interface CrumbBox {
  /** Largura da barra. */
  barWidth: number
  /** Altura da barra (44). */
  barHeight: number
  /** Bordas do painel, na coordenada da barra. */
  panelLeft: number
  panelRight: number
  panelBottom: number
}

/** Folga mínima entre a pílula e o painel para caber a curva invertida. */
const GAP = BAR_RADIUS + JOIN_RADIUS

/**
 * Onde o painel deve ficar para a silhueta fechar. Como no `.pen`: ele pende
 * 10 à esquerda do segmento, mas não passa da ponta da pílula — recua até
 * sobrar a curva invertida (XXySj: painel até 432 numa barra de 470). Só
 * quando a barra é curta demais para as duas curvas ele encosta na ponta
 * (lado reto) ou a ultrapassa. Devolve o deslocamento horizontal a aplicar.
 */
export function panelSnap(barWidth: number, left: number, right: number): number {
  const fits = (shift: number) => left + shift >= GAP && right + shift <= barWidth - GAP
  if (right > barWidth - GAP && fits(barWidth - GAP - right)) return barWidth - GAP - right
  if (left < GAP && fits(GAP - left)) return GAP - left
  if (left > -GAP && left < GAP) return -left
  if (right > barWidth - GAP && right < barWidth + GAP) return barWidth - right
  return 0
}

const r = (n: number) => Math.round(n * 100) / 100

/** A caixa que a silhueta ocupa, na coordenada da barra. */
export function crumbBounds({ barWidth, panelLeft, panelRight, panelBottom }: CrumbBox) {
  const left = Math.min(0, panelLeft)
  return { left, width: Math.max(barWidth, panelRight) - left, height: panelBottom }
}

/**
 * O `d` da silhueta. Espera o painel já ajustado por `panelSnap`. `originX`
 * desloca o path para a origem de uma caixa que começa à esquerda da barra
 * (`clip-path: path()` mede do canto do elemento).
 */
export function crumbSilhouette(box: CrumbBox, originX = 0): string {
  const { barWidth: W, barHeight: H, panelLeft: L, panelRight: R, panelBottom: B } = box
  const x = (n: number) => r(n - originX)
  // Enquanto o painel abre (ou fecha) ele é mais baixo que as curvas: os raios
  // crescem com a altura, e em `B = H` a silhueta é só a pílula.
  const grow = Math.min(1, Math.max(0, (B - H) / (JOIN_RADIUS + PANEL_RADIUS)))
  const b = BAR_RADIUS
  const j = r(JOIN_RADIUS * grow)
  const p = r(Math.min(PANEL_RADIUS * grow, Math.max(0, R - L) / 2))
  const gap = b + j
  const d: string[] = [`M${x(b)} 0`, `H${x(W - b)}`]

  // Lado direito, de cima para baixo.
  if (R <= W - gap) {
    d.push(`A${b} ${b} 0 0 1 ${x(W - b)} ${r(H)}`, `H${x(R + j)}`, `A${j} ${j} 0 0 0 ${x(R)} ${r(H + j)}`)
  } else if (R >= W + gap) {
    d.push(
      `A${b} ${b} 0 0 1 ${x(W)} ${r(H / 2)}`,
      `V${r(H - j)}`,
      `A${j} ${j} 0 0 0 ${x(W + j)} ${r(H)}`,
      `H${x(R - b)}`,
      `A${b} ${b} 0 0 1 ${x(R)} ${r(H + b)}`,
    )
  } else {
    d.push(`A${b} ${b} 0 0 1 ${x(W)} ${r(H / 2)}`)
  }
  d.push(`V${r(B - p)}`, `A${p} ${p} 0 0 1 ${x(R - p)} ${r(B)}`, `H${x(L + p)}`, `A${p} ${p} 0 0 1 ${x(L)} ${r(B - p)}`)

  // Lado esquerdo, de baixo para cima.
  if (L >= gap) {
    d.push(`V${r(H + j)}`, `A${j} ${j} 0 0 0 ${x(L - j)} ${r(H)}`, `H${x(b)}`, `A${b} ${b} 0 0 1 ${x(b)} 0`)
  } else if (L <= -gap) {
    d.push(
      `V${r(H + b)}`,
      `A${b} ${b} 0 0 1 ${x(L + b)} ${r(H)}`,
      `H${x(-j)}`,
      `A${j} ${j} 0 0 0 ${x(0)} ${r(H - j)}`,
      `V${r(H / 2)}`,
      `A${b} ${b} 0 0 1 ${x(b)} 0`,
    )
  } else {
    d.push(`V${r(H / 2)}`, `A${b} ${b} 0 0 1 ${x(b)} 0`)
  }
  return d.join('') + 'Z'
}

/** A silhueta entre duas caixas (a animação de abrir, fechar e trocar). */
export function lerpBox(from: CrumbBox, to: CrumbBox, t: number): CrumbBox {
  const at = (a: number, b: number) => a + (b - a) * t
  return {
    barWidth: to.barWidth,
    barHeight: to.barHeight,
    panelLeft: at(from.panelLeft, to.panelLeft),
    panelRight: at(from.panelRight, to.panelRight),
    panelBottom: at(from.panelBottom, to.panelBottom),
  }
}

/**
 * A caixa fechada: o painel recolhido no segmento, rente ao pé da barra (a
 * silhueta é só a pílula). Presa ao miolo para caber a curva invertida quando
 * ela começar a crescer.
 */
export function collapsedBox(barWidth: number, barHeight: number, segLeft: number, segRight: number): CrumbBox {
  const left = Math.max(segLeft, GAP)
  const right = Math.max(left, Math.min(segRight, barWidth - GAP))
  return { barWidth, barHeight, panelLeft: left, panelRight: right, panelBottom: barHeight }
}
