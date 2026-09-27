// A12 (parte de rota) — .agent/Tasks/fase-3-configuracoes.md, seção 10.

import { describe, expect, it } from 'vitest'
import { canonicalPath, parseRoute, pathFor } from './router'

describe('parseRoute', () => {
  it('raiz e /calendario são o calendário', () => {
    expect(parseRoute('/')).toEqual({ name: 'calendar' })
    expect(parseRoute('/calendario')).toEqual({ name: 'calendar' })
    expect(parseRoute('/calendario/')).toEqual({ name: 'calendar' })
  })

  it('A19 — /lista é a Lista, sem parâmetro', () => {
    expect(parseRoute('/lista')).toEqual({ name: 'list' })
    expect(parseRoute('/lista/')).toEqual({ name: 'list' })
    expect(parseRoute('/lista/abc')).toBeNull()
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
    expect(canonicalPath('/lista')).toBeNull()
    expect(canonicalPath('/configuracoes/lista')).toBeNull()
  })
  it('barra no fim sai', () => expect(canonicalPath('/configuracoes/lista/')).toBe('/configuracoes/lista'))
})

it('pathFor', () => {
  expect(pathFor({ name: 'calendar' })).toBe('/')
  expect(pathFor({ name: 'list' })).toBe('/lista')
  expect(pathFor({ name: 'settings', tab: 'aparencia' })).toBe('/configuracoes/aparencia')
})
