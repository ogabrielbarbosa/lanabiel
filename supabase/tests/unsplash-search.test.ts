// A regra da edge function `unsplash-search` (ADR 0025), com um `fetch` falso.
// Não importa o harness: roda sem rede e sem o projeto online —
// `npx vitest run --project db supabase/tests/unsplash-search.test.ts`.

import { describe, expect, it } from 'vitest'
import { handleStock, toStockPhoto } from '../functions/unsplash-search/handler'

const API_PHOTO = {
  id: 'abc',
  urls: { regular: 'https://images.unsplash.com/photo-1?w=1080', small: 'https://images.unsplash.com/photo-1?w=400' },
  user: { name: ' Ana Souza ', links: { html: 'https://unsplash.com/@ana' } },
  links: { download_location: 'https://api.unsplash.com/photos/abc/download?ixid=x' },
  alt_description: 'praia',
  color: '#a0c0e0',
}

function fakeFetch(body: unknown, ok = true) {
  const calls: { url: string; init?: RequestInit }[] = []
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return { ok, status: ok ? 200 : 403, json: async () => body } as Response
  }) as unknown as typeof fetch
  return { f, calls }
}

describe('toStockPhoto', () => {
  it('mapeia e põe o utm no perfil do fotógrafo', () => {
    expect(toStockPhoto(API_PHOTO)).toEqual({
      id: 'abc',
      url: 'https://images.unsplash.com/photo-1?w=1080',
      thumb: 'https://images.unsplash.com/photo-1?w=400',
      author: 'Ana Souza',
      authorUrl: 'https://unsplash.com/@ana?utm_source=lanabiel&utm_medium=referral',
      downloadLocation: 'https://api.unsplash.com/photos/abc/download?ixid=x',
      alt: 'praia',
      color: '#a0c0e0',
    })
  })

  it('recusa domínio estranho e foto sem crédito (o CHECK recusaria)', () => {
    expect(toStockPhoto({ ...API_PHOTO, urls: { ...API_PHOTO.urls, regular: 'https://evil.example/x.jpg' } })).toBeNull()
    expect(toStockPhoto({ ...API_PHOTO, user: { name: '', links: API_PHOTO.user.links } })).toBeNull()
    expect(toStockPhoto({ ...API_PHOTO, links: { download_location: 'https://evil.example/d' } })).toBeNull()
  })
})

describe('handleStock', () => {
  it('sem chave → unconfigured, sem chamar o Unsplash', async () => {
    const { f, calls } = fakeFetch({})
    expect(await handleStock({ action: 'search', query: 'Lisboa' }, { accessKey: null, fetch: f })).toEqual({ status: 'unconfigured' })
    expect(calls).toHaveLength(0)
  })

  it('busca em paisagem, com a chave no cabeçalho, e descarta o que não serve', async () => {
    const { f, calls } = fakeFetch({ results: [API_PHOTO, { id: 'sem-url' }] })
    const result = await handleStock({ action: 'search', query: ' Lisboa ' }, { accessKey: 'k', fetch: f })
    expect(result).toMatchObject({ status: 'ok', photos: [{ id: 'abc' }] })
    const url = new URL(calls[0]!.url)
    expect(url.pathname).toBe('/search/photos')
    expect(url.searchParams.get('query')).toBe('Lisboa')
    expect(url.searchParams.get('orientation')).toBe('landscape')
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('Client-ID k')
  })

  it('erro do Unsplash vira error, nunca lista vazia', async () => {
    const { f } = fakeFetch({}, false)
    expect(await handleStock({ action: 'search', query: 'Lisboa' }, { accessKey: 'k', fetch: f })).toEqual({ status: 'error', cause: 'Unsplash 403' })
  })

  it('download só aceita o endpoint do Unsplash', async () => {
    const { f, calls } = fakeFetch({})
    expect(await handleStock({ action: 'download', downloadLocation: 'https://evil.example/x' }, { accessKey: 'k', fetch: f })).toEqual({ status: 'invalid_request' })
    expect(calls).toHaveLength(0)
    expect(await handleStock({ action: 'download', downloadLocation: API_PHOTO.links.download_location }, { accessKey: 'k', fetch: f })).toEqual({ status: 'tracked' })
  })

  it('pedido malformado', async () => {
    const { f } = fakeFetch({})
    for (const body of [null, 'x', { action: 'search' }, { action: 'search', query: '' }, { action: 'outra' }]) {
      expect(await handleStock(body, { accessKey: 'k', fetch: f })).toEqual({ status: 'invalid_request' })
    }
  })
})
