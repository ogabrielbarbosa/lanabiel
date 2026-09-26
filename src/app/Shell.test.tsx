// A12 (navegação) e A13 — a casca: barra com só o que existe, e a rota na URL.

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeApi } from '../settings/test/fixtures'
import { Shell } from './Shell'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => window.history.replaceState(null, '', '/'))

function renderShell() {
  return render(<Shell calendar={<p>timeline antiga</p>} api={fakeApi()} onStageChanged={() => undefined} />)
}

describe('A13 — a barra mostra só destinos que existem', () => {
  it('Calendário e Configurações, e nada de Home, Lista, Viagens ou Adicionar', () => {
    renderShell()
    const nav = screen.getByRole('navigation', { name: 'Navegação principal' })
    const links = [...nav.querySelectorAll('a')].map((a) => a.textContent)
    expect(links).toEqual(['Calendário', 'Configurações'])
  })
})

describe('A12 — rotas', () => {
  it('/ mostra a timeline; clicar em Configurações vai para a primeira aba', async () => {
    renderShell()
    expect(screen.getByText('timeline antiga')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Configurações' }))
    expect(window.location.pathname).toBe('/configuracoes/perfil-do-casal')
    expect(await screen.findByRole('heading', { name: 'Configurações', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute('aria-current', 'page')
  })

  it('slug inválido volta para /, substituindo o histórico', () => {
    window.history.replaceState(null, '', '/configuracoes/nada')
    const before = window.history.length
    renderShell()
    expect(window.location.pathname).toBe('/')
    expect(window.history.length).toBe(before)
  })

  it('voltar do navegador troca a aba', async () => {
    window.history.replaceState(null, '', '/configuracoes/cidades')
    renderShell()
    expect(await screen.findByRole('heading', { name: 'Cidades', level: 2 })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'Lista' }))
    expect(await screen.findByRole('heading', { name: 'Lista', level: 2 })).toBeInTheDocument()
    await act(async () => {
      window.history.back()
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(await screen.findByRole('heading', { name: 'Cidades', level: 2 })).toBeInTheDocument()
  })
})
