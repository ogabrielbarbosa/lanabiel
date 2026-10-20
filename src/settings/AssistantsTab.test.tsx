// Aba Assistentes (ADR 0031): o link do MCP, os passos, e quem está conectado.
// ADR 0005: comportamento de tela se prova renderizando.

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppearanceControl } from '../app/useAppearance'
import { MCP_URL } from '../data/assistants'
import type { SettingsApi } from './api'
import { SettingsScreen } from './SettingsScreen'
import { fakeApi, settingsData } from './test/fixtures'

const appearance: AppearanceControl = {
  appearance: { theme: 'dark', density: 'comfortable', reduceMotion: false },
  storable: true,
  update: vi.fn(),
}

function renderAssistants(overrides: Partial<SettingsApi> = {}) {
  const api = fakeApi(settingsData(), overrides)
  render(<SettingsScreen tab="assistentes" api={api} appearance={appearance} onStageChanged={vi.fn()} />)
  return api
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard')
})

describe('Assistentes', () => {
  it('aparece no menu e mostra o link e os passos', async () => {
    renderAssistants()
    const menu = screen.getByRole('navigation', { name: 'Seções das configurações' })
    expect(within(menu).getByRole('link', { name: 'Assistentes' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText(MCP_URL)).toBeInTheDocument()
    expect(MCP_URL).toBe('https://lanabiel.ogabarbosa.com/mcp')
    expect(screen.getByText(/Adicionar conector personalizado/)).toBeInTheDocument()
  })

  it('copia o link', async () => {
    const writeText = vi.fn(async () => undefined)
    stubClipboard(writeText)
    renderAssistants()
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar' }))
    expect(writeText).toHaveBeenCalledWith(MCP_URL)
    expect(await screen.findByRole('button', { name: 'Copiado' })).toBeInTheDocument()
  })

  it('sem área de transferência, pede pra copiar à mão', async () => {
    stubClipboard(async () => Promise.reject(new Error('negado')))
    renderAssistants()
    await userEvent.click(await screen.findByRole('button', { name: 'Copiar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu pra copiar')
  })

  it('sem conexão, diz que não há nenhum', async () => {
    renderAssistants()
    expect(await screen.findByText('Nenhum assistente conectado à sua conta.')).toBeInTheDocument()
  })

  it('lista os conectados e desconecta', async () => {
    const listAssistants = vi
      .fn<SettingsApi['listAssistants']>()
      .mockResolvedValueOnce({ status: 'ok', rows: [{ clientId: 'c-1', name: 'Claude', grantedAt: '2026-09-25T13:00:00Z' }] })
      .mockResolvedValueOnce({ status: 'ok', rows: [] })
    const api = renderAssistants({ listAssistants })
    expect(await screen.findByText('Claude')).toBeInTheDocument()
    expect(screen.getByText('conectado há 2 h')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Desconectar' }))
    expect(api.disconnectAssistant).toHaveBeenCalledWith('c-1')
    expect(await screen.findByText('Nenhum assistente conectado à sua conta.')).toBeInTheDocument()
  })

  it('falha ao ler mostra a causa, não "nenhum"', async () => {
    renderAssistants({ listAssistants: vi.fn(async () => ({ status: 'error' as const, cause: 'rede' })) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu pra ler os assistentes: rede')
    expect(screen.queryByText('Nenhum assistente conectado à sua conta.')).not.toBeInTheDocument()
  })
})
