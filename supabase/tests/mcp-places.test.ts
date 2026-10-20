// `find_place` do MCP contra o resolvedor da Lista (`src/data/places.ts`): as
// mesmas features do Photon viram o mesmo `GeoPlace`, e a ordem por
// proximidade é a mesma. Mais a busca com `fetch` falso. Sem rede.

import { describe, expect, it } from 'vitest'
import { featureToCandidate as appFeature, rankByProximity as appRank } from '../../src/data/places'
import type { Ctx } from '../functions/mcp/context'
import { featureToCandidate, findPlace, rankByProximity } from '../functions/mcp/places'
import type { PhotonFeature, PlaceMode } from '../functions/mcp/places'

const FEATURES: PhotonFeature[] = [
  {
    geometry: { type: 'Point', coordinates: [-46.5815741, -23.4867214] },
    properties: { name: 'Mocotó', type: 'house', housenumber: '1100', street: 'Avenida Nossa Senhora do Loreto', city: 'São Paulo', state: 'São Paulo', country: 'Brasil', countrycode: 'BR', osm_key: 'amenity', osm_value: 'restaurant' },
  },
  {
    geometry: { type: 'Point', coordinates: [34.8287, 38.6431] },
    properties: { name: 'Göreme', type: 'city', state: 'Nevşehir', country: 'Türkiye', countrycode: 'TR', osm_key: 'place', osm_value: 'town' },
  },
  {
    geometry: { type: 'Point', coordinates: [-50.8762, -29.3792] },
    properties: { name: 'Lago Negro', type: 'street', county: 'Gramado', state: 'Rio Grande do Sul', country: 'Brasil', countrycode: 'br', osm_key: 'leisure', osm_value: 'park' },
  },
  { geometry: { type: 'Point', coordinates: [139.69, 35.68] }, properties: { name: '日本', countrycode: 'JP', country: '日本' } },
  { geometry: { type: 'Point', coordinates: ['x', 1] }, properties: { name: 'quebrado', countrycode: 'BR' } },
  { geometry: { type: 'Point', coordinates: [1, 1] }, properties: { name: 'sem país' } },
]

const pick = (c: Record<string, unknown> | null) =>
  c && { address: c.address, city: c.city, state: c.state, country: c.country, countryCode: c.countryCode, lat: c.lat, lng: c.lng, label: c.label }

describe('paridade com o resolvedor da Lista', () => {
  for (const mode of ['place', 'city', 'country'] as PlaceMode[]) {
    it.each(FEATURES.map((f, i) => [i, f] as const))(`feature %i no modo ${mode}`, (_i, feature) => {
      expect(pick(featureToCandidate(feature, mode) as never)).toEqual(pick(appFeature(feature as never, mode) as never))
    })
  }

  it('rankByProximity ordena igual', () => {
    const sjc = { lat: -23.1896, lng: -45.8841 }
    const rows = [
      { id: 'bahia', lat: -12.97, lng: -38.5, countryCode: 'BR' },
      { id: 'sjc', lat: -23.19, lng: -45.885, countryCode: 'BR' },
      { id: 'lisboa', lat: 38.72, lng: -9.14, countryCode: 'PT' },
      { id: 'sp', lat: -23.55, lng: -46.63, countryCode: 'BR' },
    ]
    expect(rankByProximity(rows, sjc).map((r) => r.id)).toEqual(appRank(rows, sjc).map((r) => r.id))
    expect(rankByProximity(rows, sjc).map((r) => r.id)).toEqual(['sjc', 'sp', 'bahia', 'lisboa'])
  })
})

function ctxWith(fetchFn: typeof fetch, rpc?: (fn: string, args: unknown) => unknown): Ctx {
  return {
    db: { rpc: async (fn: string, args: unknown) => rpc?.(fn, args) ?? { data: [], error: null } } as never,
    userId: 'u1',
    fetch: fetchFn,
    today: () => '2026-10-19',
    keys: { apifyToken: null, geminiKey: null, geminiModel: 'm', firecrawlKey: null, openPlacesKey: 'op-key' },
  }
}

describe('findPlace', () => {
  it('junta Overture e Photon, ordena por proximidade e marca a fonte', async () => {
    const calls: string[] = []
    const fetchFn = (async (url: string) => {
      calls.push(url)
      if (url.startsWith('https://photon.komoot.io')) {
        return new Response(JSON.stringify({ features: [FEATURES[0]] }), { status: 200 })
      }
      return new Response(
        JSON.stringify({
          results: [
            { name: 'Mocotó Café', lat: -23.487, lon: -46.582, category: 'cafe', address: { freeform: 'Av. N. S. do Loreto, 1100', locality: 'São Paulo', region: 'SP', country_code: 'BR' }, confidence: 0.9, operating_status: 'operational' },
          ],
        }),
        { status: 200 },
      )
    }) as typeof fetch
    const result = await findPlace(ctxWith(fetchFn), { query: 'Mocotó', mode: 'place' }, { lat: -23.19, lng: -45.88, name: 'SJC' })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.candidates.map((c) => [c.label, c.source])).toEqual([
      ['Mocotó Café', 'overture'],
      ['Mocotó', 'photon'],
    ])
    expect(result.candidates[1]).toMatchObject({ city: 'São Paulo', countryCode: 'BR', address: 'Avenida Nossa Senhora do Loreto, 1100' })
    expect(calls.some((u) => u.includes('lat=-23.19'))).toBe(true)
  })

  it('near_city é resolvido no Photon e vira o viés', async () => {
    const urls: string[] = []
    const fetchFn = (async (url: string) => {
      urls.push(url)
      if (url.includes('layer=city')) return new Response(JSON.stringify({ features: [FEATURES[2]] }), { status: 200 })
      return new Response(JSON.stringify({ features: [] }), { status: 200 })
    }) as typeof fetch
    const result = await findPlace(ctxWith(fetchFn), { query: 'Tio Pedro', mode: 'place', nearCity: 'Gramado' }, null)
    expect(result.status === 'ok' && result.near?.name).toBe('Lago Negro')
    expect(urls[1]).toContain('lat=-29.3792')
  })

  it('Photon fora cai nas cidades do IBGE com fallback: true', async () => {
    const fetchFn = (async () => new Response('down', { status: 503 })) as unknown as typeof fetch
    const ctx = ctxWith(fetchFn, (fn) =>
      fn === 'search_cities' ? { data: [{ name: 'Marau', state_code: 'RS', country_code: 'BR', lat: -28.45, lng: -52.2 }], error: null } : null,
    )
    const result = await findPlace(ctx, { query: 'Marau', mode: 'city' }, null)
    expect(result).toMatchObject({ status: 'ok', fallback: true, candidates: [{ label: 'Marau', city: 'Marau', state: 'RS', source: 'ibge' }] })
  })

  it('consulta curta é recusada sem rede', async () => {
    const fetchFn = (async () => {
      throw new Error('não devia chamar')
    }) as unknown as typeof fetch
    expect(await findPlace(ctxWith(fetchFn), { query: 'ab', mode: 'place' }, null)).toMatchObject({ status: 'error' })
  })
})
