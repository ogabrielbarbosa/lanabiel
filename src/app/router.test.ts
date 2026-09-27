// A12 (parte de rota) — .agent/Tasks/fase-3-configuracoes.md, seção 10.
// A9 (rotas das Viagens) — .agent/Tasks/fase-6-viagens.md, seção 10; ADR 0020.
// A2 (Home em /, Calendário em /calendario) — .agent/Tasks/fase-7-mapa.md; ADR 0023.

import { describe, expect, it } from 'vitest'
import { canonicalPath, parseRoute, pathFor } from './router'

describe('parseRoute', () => {
  it('A2 (Fase 7) — a raiz é a Home; /calendario é o Calendário (ADR 0023)', () => {
    expect(parseRoute('/')).toEqual({ name: 'home' })
    expect(parseRoute('//')).toEqual({ name: 'home' })
    expect(parseRoute('/calendario')).toEqual({ name: 'calendar' })
    expect(parseRoute('/calendario/')).toEqual({ name: 'calendar' })
  })

  it('A19 — /lista é a Lista, sem parâmetro', () => {
    expect(parseRoute('/lista')).toEqual({ name: 'list' })
    expect(parseRoute('/lista/')).toEqual({ name: 'list' })
    expect(parseRoute('/lista/abc')).toBeNull()
  })

  it('A9 (Fase 6) — /viagens é a Grade; /viagens/<uuid> é o detalhe, em minúsculas', () => {
    const id = '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d'
    expect(parseRoute('/viagens')).toEqual({ name: 'trips' })
    expect(parseRoute('/viagens/')).toEqual({ name: 'trips' })
    expect(parseRoute(`/viagens/${id}`)).toEqual({ name: 'trip', id })
    expect(parseRoute(`/viagens/${id}/`)).toEqual({ name: 'trip', id })
    expect(parseRoute(`/viagens/${id.toUpperCase()}`)).toEqual({ name: 'trip', id })
  })

  it('A9 — id malformado ainda é o detalhe (a tela mostra o R1), e sub-caminho não é rota', () => {
    expect(parseRoute('/viagens/abc')).toEqual({ name: 'trip', id: 'abc' })
    expect(parseRoute('/viagens/abc/fotos')).toBeNull()
    expect(parseRoute('/viagem')).toBeNull()
  })

  it('as nove abas por slug', () => {
    expect(parseRoute('/configuracoes/cidades')).toEqual({ name: 'settings', tab: 'cidades' })
    expect(parseRoute('/configuracoes/zona-sensivel')).toEqual({ name: 'settings', tab: 'zona-sensivel' })
  })

  it('slug inexistente e caminho desconhecido não são rota', () => {
    expect(parseRoute('/configuracoes/cidade')).toBeNull()
    expect(parseRoute('/configuracoes')).toBeNull()
    expect(parseRoute('/listas')).toBeNull()
  })
})

describe('canonicalPath', () => {
  it('/configuracoes vai para a primeira aba', () => {
    expect(canonicalPath('/configuracoes')).toBe('/configuracoes/perfil-do-casal')
    expect(canonicalPath('/configuracoes/')).toBe('/configuracoes/perfil-do-casal')
  })
  it('caminho desconhecido vai para a raiz', () => {
    expect(canonicalPath('/nada')).toBe('/')
    expect(canonicalPath('/configuracoes/nada')).toBe('/')
  })
  it('caminho canônico não muda', () => {
    expect(canonicalPath('/')).toBeNull()
    expect(canonicalPath('/calendario')).toBeNull()
    expect(canonicalPath('/lista')).toBeNull()
    expect(canonicalPath('/configuracoes/lista')).toBeNull()
  })
  it('barra no fim sai', () => expect(canonicalPath('/configuracoes/lista/')).toBe('/configuracoes/lista'))
  it('viagens: canônico fica; uuid em maiúsculas desce; barra no fim sai', () => {
    const id = '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d'
    expect(canonicalPath('/viagens')).toBeNull()
    expect(canonicalPath(`/viagens/${id}`)).toBeNull()
    expect(canonicalPath(`/viagens/${id.toUpperCase()}`)).toBe(`/viagens/${id}`)
    expect(canonicalPath('/viagens/')).toBe('/viagens')
    expect(canonicalPath('/viagens/abc/fotos')).toBe('/')
  })
})

it('pathFor', () => {
  expect(pathFor({ name: 'home' })).toBe('/')
  expect(pathFor({ name: 'calendar' })).toBe('/calendario')
  expect(pathFor({ name: 'list' })).toBe('/lista')
  expect(pathFor({ name: 'settings', tab: 'aparencia' })).toBe('/configuracoes/aparencia')
  expect(pathFor({ name: 'trips' })).toBe('/viagens')
  expect(pathFor({ name: 'trip', id: 'abc' })).toBe('/viagens/abc')
})
