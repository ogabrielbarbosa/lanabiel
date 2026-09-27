// A12 (navegação) e A13 — a casca: barra com só o que existe, e a rota na URL.
// A9 (Fase 6) — Viagens na barra, `/viagens` e `/viagens/<id>`.

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fakeCalendarApi } from '../calendar/test/fixtures'
import { fakeListApi } from '../list/test/fixtures'
import { fakeApi } from '../settings/test/fixtures'
import { seededTripsApi } from '../trips/test/fakeApi'
import { TRIP_ILHABELA_ID, UNKNOWN_TRIP_ID } from '../trips/test/fixtures'
import { Shell } from './Shell'

beforeEach(() => window.history.replaceState(null, '', '/'))
afterEach(() => window.history.replaceState(null, '', '/'))

function renderShell() {
  return render(
    <Shell
      calendarApi={fakeCalendarApi()}
      api={fakeApi()}
      listApi={fakeListApi()}
      tripsApi={seededTripsApi()}
      onStageChanged={() => undefined}
    />,
  )
}

function mainNav() {
  return screen.getByRole('navigation', { name: 'Navegação principal' })
}

describe('A13 (Fase 3), A19 (Fase 4) e A9 (Fase 6) — a barra mostra só destinos que existem', () => {
  it('Calendário, Lista, Viagens e Configurações, nessa ordem, e nada de Home', () => {
    renderShell()
    const links = [...mainNav().querySelectorAll('a')].map((a) => a.textContent)
    expect(links).toEqual(['Calendário', 'Lista', 'Viagens', 'Configurações'])
  })
})

describe('A9 (Fase 6) — /viagens e /viagens/<id>', () => {
  it('clicar em Viagens vai para /viagens, renderiza as Viagens e marca o destino', async () => {
    renderShell()
    await userEvent.click(within(mainNav()).getByRole('link', { name: 'Viagens' }))
    expect(window.location.pathname).toBe('/viagens')
    expect(await screen.findByRole('heading', { name: 'Nossas viagens', level: 1 })).toBeInTheDocument()
    expect(within(mainNav()).getByRole('link', { name: 'Viagens' })).toHaveAttribute('aria-current', 'page')
  })

  it('/viagens/<id> de uma viagem do casal abre o detalhe, com Viagens marcado', async () => {
    window.history.replaceState(null, '', `/viagens/${TRIP_ILHABELA_ID}`)
    renderShell()
    expect(await screen.findByRole('heading', { name: 'Ilhabela, SP', level: 1 })).toBeInTheDocument()
    expect(within(mainNav()).getByRole('link', { name: 'Viagens' })).toHaveAttribute('aria-current', 'page')
  })

  it('id que não é viagem do casal: "Essa viagem não está aqui." e o caminho de volta', async () => {
    window.history.replaceState(null, '', `/viagens/${UNKNOWN_TRIP_ID}`)
    renderShell()
    expect(await screen.findByText('Essa viagem não está aqui.')).toBeInTheDocument()
    expect(window.location.pathname).toBe(`/viagens/${UNKNOWN_TRIP_ID}`)
    await userEvent.click(screen.getByRole('link', { name: 'Voltar para Nossas viagens' }))
    expect(window.location.pathname).toBe('/viagens')
    expect(await screen.findByRole('heading', { name: 'Nossas viagens', level: 1 })).toBeInTheDocument()
  })

  it('id malformado também mostra o R1, em vez de ir para o Calendário', async () => {
    window.history.replaceState(null, '', '/viagens/nao-e-um-id')
    renderShell()
    expect(await screen.findByText('Essa viagem não está aqui.')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/viagens/nao-e-um-id')
  })

  it('uuid em maiúsculas vira o caminho canônico em minúsculas', async () => {
    window.history.replaceState(null, '', `/viagens/${TRIP_ILHABELA_ID.toUpperCase()}`)
    renderShell()
    expect(await screen.findByRole('heading', { name: 'Ilhabela, SP', level: 1 })).toBeInTheDocument()
    expect(window.location.pathname).toBe(`/viagens/${TRIP_ILHABELA_ID}`)
  })
})

describe('A19 — /lista', () => {
  it('abrir /lista renderiza a Lista e marca o destino', () => {
    window.history.replaceState(null, '', '/lista')
    renderShell()
    expect(window.location.pathname).toBe('/lista')
    expect(screen.getByRole('heading', { name: 'Nossa lista', level: 1 })).toBeInTheDocument()
    expect(within(mainNav()).getByRole('link', { name: 'Lista' })).toHaveAttribute('aria-current', 'page')
    expect(screen.queryByRole('heading', { name: 'Setembro 2026', level: 1 })).not.toBeInTheDocument()
  })

  it('clicar em Lista na barra vai para /lista', async () => {
    renderShell()
    await userEvent.click(within(mainNav()).getByRole('link', { name: 'Lista' }))
    expect(window.location.pathname).toBe('/lista')
    expect(screen.getByRole('heading', { name: 'Nossa lista', level: 1 })).toBeInTheDocument()
  })
})

describe('A12 — rotas', () => {
  it('/ mostra o Calendário (A21 da Fase 5); clicar em Configurações vai para a primeira aba', async () => {
    renderShell()
    expect(await screen.findByRole('heading', { name: 'Setembro 2026', level: 1 })).toBeInTheDocument()
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

describe('A21 (Fase 5) — o Adicionar da barra', () => {
  function addButton() {
    return within(mainNav()).getByRole('button', { name: 'Adicionar' })
  }

  it('abre o seletor com evento e item, e Esc fecha', async () => {
    window.history.replaceState(null, '', '/configuracoes/perfil-do-casal')
    renderShell()
    await userEvent.click(addButton())
    const menu = screen.getByRole('menu', { name: 'Adicionar' })
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual(['Novo evento', 'Item na lista'])
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('Novo evento vai para o Calendário e abre o modal, de qualquer rota', async () => {
    window.history.replaceState(null, '', '/lista')
    renderShell()
    await userEvent.click(addButton())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Novo evento' }))
    expect(window.location.pathname).toBe('/')
    expect(await screen.findByRole('dialog', { name: 'Novo evento' })).toBeInTheDocument()
  })

  it('pedir de novo reabre: o segundo Novo evento abre o modal outra vez', async () => {
    renderShell()
    for (let i = 0; i < 2; i++) {
      await userEvent.click(addButton())
      await userEvent.click(screen.getByRole('menuitem', { name: 'Novo evento' }))
      const modal = await screen.findByRole('dialog', { name: 'Novo evento' })
      await userEvent.click(within(modal).getByRole('button', { name: 'Fechar' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    }
  })

  it('Item na lista vai para a Lista e abre o modal de adicionar', async () => {
    renderShell()
    await userEvent.click(addButton())
    await userEvent.click(screen.getByRole('menuitem', { name: 'Item na lista' }))
    expect(window.location.pathname).toBe('/lista')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
