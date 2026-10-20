// A9 da spec do MCP (.agent/Tasks/mcp-server.md): a tela de consentimento
// mostra quem pede e devolve a decisão ao Auth. A API é falsa; o que o Auth
// responde de verdade se vê ao conectar um cliente (ADR 0031).

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OAuthConsent } from './OAuthConsent'
import { authorizationIdFrom, hostOf } from './consentApi'
import type { ConsentApi, ConsentDecision, ConsentDetails } from './consentApi'

const ASK: ConsentDetails = {
  status: 'ask',
  request: {
    authorizationId: 'auth-1',
    clientName: 'Claude',
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    scopes: ['openid', 'email'],
  },
}

function fakeApi(details: ConsentDetails, decision: ConsentDecision = { status: 'redirect', url: 'https://claude.ai/cb?code=x' }) {
  const api: ConsentApi = {
    details: vi.fn(async () => details),
    approve: vi.fn(async () => decision),
    deny: vi.fn(async () => ({ status: 'redirect' as const, url: 'https://claude.ai/cb?error=access_denied' })),
    go: vi.fn(),
  }
  return api
}

describe('OAuthConsent', () => {
  it('mostra o cliente, para onde volta e as permissões', async () => {
    const api = fakeApi(ASK)
    render(<OAuthConsent api={api} search="?authorization_id=auth-1" />)
    expect(await screen.findByRole('heading', { name: 'Claude quer acessar o lanabiel' })).toBeInTheDocument()
    expect(screen.getByText('claude.ai')).toBeInTheDocument()
    expect(screen.getByText('openid, email')).toBeInTheDocument()
    expect(api.details).toHaveBeenCalledWith('auth-1')
  })

  it('Permitir aprova e manda o navegador de volta ao cliente', async () => {
    const api = fakeApi(ASK)
    render(<OAuthConsent api={api} search="?authorization_id=auth-1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Permitir' }))
    expect(api.approve).toHaveBeenCalledWith('auth-1')
    expect(api.go).toHaveBeenCalledWith('https://claude.ai/cb?code=x')
    expect(screen.getByRole('status')).toHaveTextContent('Voltando para o assistente')
  })

  it('Recusar nega e também devolve ao cliente', async () => {
    const api = fakeApi(ASK)
    render(<OAuthConsent api={api} search="?authorization_id=auth-1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Recusar' }))
    expect(api.deny).toHaveBeenCalledWith('auth-1')
    expect(api.approve).not.toHaveBeenCalled()
    expect(api.go).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied')
  })

  it('pedido já consentido redireciona sem perguntar', async () => {
    const api = fakeApi({ status: 'redirect', url: 'https://claude.ai/cb?code=y' })
    render(<OAuthConsent api={api} search="?authorization_id=auth-1" />)
    expect(await screen.findByText('Voltando para o assistente…')).toBeInTheDocument()
    expect(api.go).toHaveBeenCalledWith('https://claude.ai/cb?code=y')
  })

  it('sem authorization_id não chama o Auth e explica o que fazer', () => {
    const api = fakeApi(ASK)
    render(<OAuthConsent api={api} search="" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Este link não traz um pedido de acesso')
    expect(api.details).not.toHaveBeenCalled()
  })

  it('falha ao aprovar fica na tela com o motivo', async () => {
    const api = fakeApi(ASK, { status: 'error', cause: 'authorization expired' })
    render(<OAuthConsent api={api} search="?authorization_id=auth-1" />)
    await userEvent.click(await screen.findByRole('button', { name: 'Permitir' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Não deu pra concluir: authorization expired')
    expect(api.go).not.toHaveBeenCalled()
  })
})

describe('auxiliares', () => {
  it('authorizationIdFrom lê o parâmetro e recusa vazio', () => {
    expect(authorizationIdFrom('?authorization_id=abc')).toBe('abc')
    expect(authorizationIdFrom('?authorization_id=')).toBeNull()
    expect(authorizationIdFrom('')).toBeNull()
  })

  it('hostOf mostra só o domínio', () => {
    expect(hostOf('https://claude.ai/api/mcp/auth_callback')).toBe('claude.ai')
    expect(hostOf('não é url')).toBe('não é url')
  })
})
