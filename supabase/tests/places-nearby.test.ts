// A regra da edge function `places-nearby` (ADR 0027), com um `fetch` falso.
// Não importa o harness: roda sem rede e sem o projeto online —
// `npx vitest run --project db supabase/tests/places-nearby.test.ts`.

import { describe, expect, it } from 'vitest'
import { handleNearby, toNearbyPlace } from '../functions/places-nearby/handler'

// O formato do endereço é o do Overture no Brasil (release 2026-09-23.1, Marau).
const API_PLACE = {
  place_id: 'overture:08f2c',
  name: ' Bambina Pizzaria ',
  lat: -28.4512,
  lon: -52.2004,
  distance_mi: 0.4,
  category: 'pizza_restaurant',
  address: { freeform: 'Rua Parana, 201', locality: 'Marau', postcode: '99150-000', region: 'RS', country_code: 'BR' },
  confidence: 0.92,
  operating_status: 'operational',
}

function fakeFetch(body: unknown, status = 200) {
  const calls: { url: string; init?: RequestInit }[] = []
  const f = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    return { ok: status === 200, status, json: async () => body } as Response
  }) as unknown as typeof fetch
  return { f, calls }
}

const MARAU = { lat: -28.449, lng: -52.199 }

describe('toNearbyPlace', () => {
  it('mapeia o endereço do Overture para o GeoPlace (sem o nome do país)', () => {
    expect(toNearbyPlace(API_PLACE)).toEqual({
      name: 'Bambina Pizzaria',
      address: 'Rua Parana, 201',
      city: 'Marau',
      state: 'RS',
      countryCode: 'BR',
      lat: -28.4512,
      lng: -52.2004,
    })
  })

  it('aceita `country` no lugar de `country_code` e endereço vazio vira nulo', () => {
    expect(toNearbyPlace({ ...API_PLACE, address: { freeform: '', locality: 'Marau', country: 'br' } })).toMatchObject({
      address: null,
      state: null,
      countryCode: 'BR',
    })
  })

  it('sigla do estado em minúsculas (como a API devolve) sai em maiúsculas; nome por extenso fica', () => {
    expect(toNearbyPlace({ ...API_PLACE, address: { ...API_PLACE.address, region: 'rs' } })?.state).toBe('RS')
    expect(toNearbyPlace({ ...API_PLACE, address: { ...API_PLACE.address, region: 'Rio Grande do Sul' } })?.state).toBe('Rio Grande do Sul')
  })

  it('recusa sem nome, sem coordenada, sem país e fechado', () => {
    expect(toNearbyPlace({ ...API_PLACE, name: '  ' })).toBeNull()
    expect(toNearbyPlace({ ...API_PLACE, lat: '−28' })).toBeNull()
    expect(toNearbyPlace({ ...API_PLACE, lon: 200 })).toBeNull()
    expect(toNearbyPlace({ ...API_PLACE, address: { locality: 'Marau' } })).toBeNull()
    expect(toNearbyPlace({ ...API_PLACE, operating_status: 'permanently_closed' })).toBeNull()
  })
})

describe('handleNearby', () => {
  it('sem chave → unconfigured, sem chamar a API', async () => {
    const { f, calls } = fakeFetch({})
    expect(await handleNearby({ query: 'Bambina', ...MARAU }, { apiKey: null, fetch: f })).toEqual({ status: 'unconfigured' })
    expect(calls).toHaveLength(0)
  })

  it('busca perto do ponto, no raio máximo, com a chave no cabeçalho, e descarta o que não serve', async () => {
    const { f, calls } = fakeFetch({ results: [API_PLACE, { name: 'sem coordenada' }] })
    const result = await handleNearby({ query: ' Bambina ', ...MARAU }, { apiKey: 'k', fetch: f })
    expect(result).toMatchObject({ status: 'ok', places: [{ name: 'Bambina Pizzaria' }] })
    const url = new URL(calls[0]!.url)
    expect(url.origin + url.pathname).toBe('https://api.openplacesapi.com/v1/places')
    expect(url.searchParams.get('q')).toBe('Bambina')
    expect(url.searchParams.get('lat')).toBe(String(MARAU.lat))
    expect(url.searchParams.get('lon')).toBe(String(MARAU.lng))
    expect(url.searchParams.get('radius_mi')).toBe('50')
    expect((calls[0]!.init!.headers as Record<string, string>).Authorization).toBe('Bearer k')
  })

  it('cota esgotada (402) e limite (429) → error, não ok vazio', async () => {
    for (const status of [402, 429, 503]) {
      const { f } = fakeFetch({}, status)
      expect(await handleNearby({ query: 'Bambina', ...MARAU }, { apiKey: 'k', fetch: f })).toEqual({
        status: 'error',
        cause: `Open Places ${status}`,
      })
    }
  })

  it('pedido inválido não gasta cota', async () => {
    const { f, calls } = fakeFetch({})
    for (const body of [null, { query: 'ab', ...MARAU }, { query: 'x'.repeat(129), ...MARAU }, { query: 'Bambina', lat: 91, lng: 0 }, { query: 'Bambina' }]) {
      expect(await handleNearby(body, { apiKey: 'k', fetch: f })).toEqual({ status: 'invalid_request' })
    }
    expect(calls).toHaveLength(0)
  })
})
