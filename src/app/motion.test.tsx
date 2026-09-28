// useExitTransition num dono que continua montado (o menu do _Adicionar_):
// fechar com animação e reabrir não pode deixar o menu preso saindo.

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useExitTransition } from './motion'

function Menu() {
  const [open, setOpen] = useState(false)
  const { ref, closing, requestClose } = useExitTransition<HTMLDivElement>(() => setOpen(false))
  return (
    <>
      <button type="button" onClick={() => (open ? requestClose() : setOpen(true))}>
        alternar
      </button>
      {open && <div ref={ref} data-testid="menu" className={closing ? 'is-closing' : ''} />}
    </>
  )
}

// Uma animação de saída que já terminou: o jsdom não tem `getAnimations`.
const original = HTMLElement.prototype.getAnimations
beforeEach(() => {
  HTMLElement.prototype.getAnimations = () =>
    [{ effect: { getComputedTiming: () => ({ endTime: 150 }) }, finished: Promise.resolve() }] as unknown as Animation[]
  document.documentElement.dataset.reduceMotion = 'false'
})
afterEach(() => {
  HTMLElement.prototype.getAnimations = original
  delete document.documentElement.dataset.reduceMotion
})

describe('useExitTransition', () => {
  it('fecha, reabre sem `is-closing` e fecha de novo', async () => {
    const user = userEvent.setup()
    render(<Menu />)
    const toggle = screen.getByRole('button', { name: 'alternar' })

    for (let round = 0; round < 3; round++) {
      await user.click(toggle)
      expect(screen.getByTestId('menu')).not.toHaveClass('is-closing')
      await user.click(toggle)
      await act(async () => {})
      expect(screen.queryByTestId('menu')).toBeNull()
    }
  })
})
