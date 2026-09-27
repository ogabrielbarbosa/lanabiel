// A12 (navegação) e A13 — a casca: barra com só o que existe, e a rota na URL.

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeListApi } from '../list/test/fixtures'
import { fakeApi } from '../settings/test/fixtures'
import { Shell } from './Shell'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => window.history.replaceState(null, '', '/'))

function renderShell() {
  return render(
    <Shell calendar={<p>timeline antiga</p>} api={fakeApi()} listApi={fakeListApi()} onStageChanged={() => undefined} />,
  )
}

function mainNav() {
  return screen.getByRole('navigation', { name: 'Navegação principal' })
}

describe('A13 (Fase 3) e A19 (Fase 4) — a barra mostra só destinos que existem', () => {
  it('Calendário, Lista e Configurações, nessa ordem, e nada de Home, Viagens ou Adicionar', () => {
    renderShell()
    const links = [...mainNav().querySelectorAll('a')].map((a) => a.textContent)
    expect(links).toEqual(['Calendário', 'Lista', 'Configurações'])
  })
})

describe('A19 — /lista', () => {
  it('abrir /lista renderiza a Lista e marca o destino', () => {
    window.history.replaceState(null, '', '/lista')
    renderShell()
    expect(window.location.pathname).toBe('/lista')
    expect(screen.getByRole('heading', { name: 'Nossa lista', level: 1 })).toBeInTheDocument()
    expect(within(mainNav()).getByRole('link', { name: 'Lista' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByText('timeline antiga')).not.toBeInTheDocument()
  })

  it('clicar em Lista na barra vai para /lista', async () => {
    renderShell()
    await userEvent.click(within(mainNav()).getByRole('link', { name: 'Lista' }))
    expect(window.location.pathname).toBe('/lista')
    expect(screen.getByRole('heading', { name: 'Nossa lista', level: 1 })).toBeInTheDocument()
  })
})

describe('A12 — rotas', () => {
  it('/ mostra a timeline; clicar em Configurações vai para a primeira aba', async () => {
    renderShell()
    expect(screen.getByText('timeline antiga')).toBeInTheDocument()
    await userEvent.click(within(mainNav()).getByRole('link', { name: 'Configurações' }))
    expect(window.location.pathname).toBe('/configuracoes/perfil-do-casal')
    expect(await screen.findByRole('heading', { name: 'Configurações', level: 1 })).toBeInTheDocument()
    expect(within(mainNav()).getByRole('link', { name: 'Configurações' })).toHaveAttribute('aria-current', 'page')
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
    // A aba "Lista" das Configurações — não o destino Lista da barra principal.
    const tabs = screen.getAllByRole('link', { name: 'Lista' }).filter((a) => !mainNav().contains(a))
    expect(tabs).toHaveLength(1)
    await userEvent.click(tabs[0])
    expect(await screen.findByRole('heading', { name: 'Lista', level: 2 })).toBeInTheDocument()
    await act(async () => {
      window.history.back()
      await new Promise((r) => setTimeout(r, 20))
    })
    expect(await screen.findByRole('heading', { name: 'Cidades', level: 2 })).toBeInTheDocument()
  })
})
