import { describe, expect, it } from 'vitest'
import { collapsedBox, crumbBounds, crumbSilhouette, lerpBox, panelSnap } from './crumbShape'

describe('crumbSilhouette', () => {
  it('reproduz o path do .pen (XXySj: barra 470, painel 152–432, fundo 378)', () => {
    const d = crumbSilhouette({ barWidth: 470, barHeight: 44, panelLeft: 152, panelRight: 432, panelBottom: 378 })
    // O do `.pen`, em absoluto: M22 0h426a22 22 0 0 1 0 44h0a16 16 0 0 0-16 16v292a26 26…
    expect(d).toBe(
      'M22 0H448A22 22 0 0 1 448 44H448A16 16 0 0 0 432 60V352A26 26 0 0 1 406 378H178A26 26 0 0 1 152 352' +
        'V60A16 16 0 0 0 136 44H22A22 22 0 0 1 22 0Z',
    )
  })

  it('painel mais largo que a barra: a pílula desce e a curva invertida vira para fora', () => {
    const d = crumbSilhouette({ barWidth: 120, barHeight: 44, panelLeft: 0, panelRight: 280, panelBottom: 300 })
    expect(d).toContain('A22 22 0 0 1 120 22V28A16 16 0 0 0 136 44H258A22 22 0 0 1 280 66')
    // Esquerda rente: lado reto, sem curva invertida.
    expect(d.endsWith('A26 26 0 0 1 0 274V22A22 22 0 0 1 22 0Z')).toBe(true)
  })

  it('desloca pela origem quando o painel sai à esquerda da barra', () => {
    const box = { barWidth: 300, barHeight: 44, panelLeft: -60, panelRight: 220, panelBottom: 300 }
    const { left } = crumbBounds(box)
    expect(left).toBe(-60)
    expect(crumbSilhouette(box, left).startsWith('M82 0')).toBe(true)
  })
})

describe('panelSnap', () => {
  it('não mexe quando cabe a curva invertida dos dois lados', () => {
    expect(panelSnap(470, 152, 432)).toBe(0)
  })

  it('recua para dentro da pílula, deixando a curva invertida (XXySj: segmento em 197)', () => {
    expect(panelSnap(470, 187, 467)).toBe(-35)
    expect(panelSnap(470, 20, 300)).toBe(18)
  })

  it('encosta na ponta quando a barra não comporta as duas curvas', () => {
    expect(panelSnap(300, 20, 300)).toBe(-20)
    expect(panelSnap(120, 34, 314)).toBe(-34)
  })
})

describe('a animação da silhueta', () => {
  const open = { barWidth: 470, barHeight: 44, panelLeft: 152, panelRight: 432, panelBottom: 378 }

  it('fechada, é só a pílula: sem curva nem canto de painel', () => {
    const d = crumbSilhouette(collapsedBox(470, 44, 187, 284))
    expect(d).not.toMatch(/A(16|26) /)
    expect(d).toContain('A0 0 0 0 0')
  })

  it('os raios crescem com a altura e chegam aos do .pen', () => {
    const half = crumbSilhouette({ ...open, panelBottom: 44 + 21 })
    expect(half).toContain('A8 8 0 0 0')
    expect(half).toContain('A13 13 0 0 1')
    expect(crumbSilhouette(lerpBox(collapsedBox(470, 44, 187, 284), open, 1))).toBe(crumbSilhouette(open))
  })

  it('a caixa fechada fica no miolo, onde a curva invertida cabe', () => {
    expect(collapsedBox(470, 44, 400, 462)).toMatchObject({ panelLeft: 400, panelRight: 432 })
    expect(collapsedBox(470, 44, 6, 100)).toMatchObject({ panelLeft: 38, panelRight: 100 })
  })
})
