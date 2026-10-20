import { describe, expect, it, vi } from 'vitest'
import { geocodeUrl, looksLikeAddress, searchAddresses, v6ToCandidate } from './addresses'
import { searchPlaces } from './places'

const SJC = { lat: -23.1896, lng: -45.8841 }

/** A forma real do v6 (consulta de 2026-10-11, "Rua Vilaça 500"), sem os ids. */
const VILACA = {
  properties: {
    name: 'Rua Vilaça 500',
    feature_type: 'address',
    coordinates: { latitude: -23.18, longitude: -45.89, accuracy: 'interpolated' },
    context: {
      address: { address_number: '500', street_name: 'Rua Vilaça', name: 'Rua Vilaça 500' },
      street: { name: 'Rua Vilaça' },
      place: { name: 'São José dos Campos' },
      region: { name: 'São Paulo', region_code: 'SP' },
      country: { name: 'Brasil', country_code: 'BR' },
    },
  },
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('endereço pelo Mapbox (ADR 0030)', () => {
  it('só busca endereço quando o texto tem número', () => {
    expect(looksLikeAddress('Rua Vilaça 500')).toBe(true)
    expect(looksLikeAddress('Coco Bambu')).toBe(false)
  })

  it('pede o modo permanente, só endereço, numa caixa em volta de onde a pessoa está', () => {
    const url = new URL(geocodeUrl('Rua Vilaça 500', 'pk.x', SJC))
    expect(url.searchParams.get('permanent')).toBe('true')
    expect(url.searchParams.get('types')).toBe('address')
    expect(url.searchParams.get('proximity')).toBe('-45.8841,-23.1896')
    const [w, s, e, n] = url.searchParams.get('bbox')!.split(',').map(Number)
    expect(w).toBeLessThan(SJC.lng)
    expect(e).toBeGreaterThan(SJC.lng)
    expect(s).toBeLessThan(SJC.lat)
    expect(n).toBeGreaterThan(SJC.lat)
  })

  it('a feature vira lugar com rua e número, cidade e país', () => {
    expect(v6ToCandidate(VILACA)).toEqual({
      label: 'Rua Vilaça 500',
      address: 'Rua Vilaça, 500',
      city: 'São José dos Campos',
      state: 'São Paulo',
      country: 'Brasil',
      countryCode: 'BR',
      lat: -23.18,
      lng: -45.89,
    })
  })

  it('sem cidade ou sem coordenada fica de fora (o CHECK recusaria)', () => {
    const noCity = { properties: { ...VILACA.properties, context: { ...VILACA.properties.context, place: undefined } } }
    expect(v6ToCandidate(noCity)).toBeNull()
    expect(v6ToCandidate({ properties: { ...VILACA.properties, coordinates: {} } })).toBeNull()
  })

  it('nada perto de casa → tenta no mundo, sem a caixa', async () => {
    const fetchFn = vi.fn<typeof fetch>(async (input) =>
      new URL(String(input)).searchParams.has('bbox') ? json({ features: [] }) : json({ features: [VILACA] }),
    )
    const result = await searchAddresses('Rua Vilaça 500', SJC, { token: 'pk.x', fetchFn })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ status: 'ok', rows: [{ label: 'Rua Vilaça 500' }] })
  })

  it('sem cidade no texto, a primeira tentativa leva a cidade de onde a pessoa está', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json({ features: [VILACA] }))
    await searchAddresses('Rua Bento Gonçalves 500', { lat: -28.45, lng: -52.2, name: 'Marau' }, { token: 'pk.x', fetchFn })
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('q')).toBe('Rua Bento Gonçalves 500, Marau')
    fetchFn.mockClear()
    await searchAddresses('Rua X 100, Porto Alegre', { lat: -28.45, lng: -52.2, name: 'Marau' }, { token: 'pk.x', fetchFn })
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('q')).toBe('Rua X 100, Porto Alegre')
  })

  it('o número vem no topo mesmo com a rua sem número do Photon mais perto (fora dos anéis)', async () => {
    const nearStreet = {
      geometry: { coordinates: [SJC.lng, SJC.lat] },
      properties: { name: 'Rua 7 de Setembro', type: 'street', osm_key: 'highway', city: 'São José dos Campos', countrycode: 'BR' },
    }
    const farNumber = { ...v6ToCandidate(VILACA)!, label: 'Rua Sete de Setembro 200', lat: SJC.lat + 0.05 }
    const fetchFn = vi.fn<typeof fetch>(async () => json({ features: [nearStreet] }))
    const result = await searchPlaces('Rua Sete de Setembro 200', {
      mode: 'place',
      bias: SJC,
      fetchFn,
      searchAddresses: async () => ({ status: 'ok', rows: [farNumber] }),
    })
    expect(result.status === 'ok' && result.rows.map((r) => r.label)).toEqual(['Rua Sete de Setembro 200', 'Rua 7 de Setembro'])
  })

  it('na busca da Lista, o endereço vem antes da rua do Photon', async () => {
    const photonStreet = {
      geometry: { coordinates: [-45.889, -23.181] },
      properties: { name: 'Rua Vilaça', type: 'street', city: 'São José dos Campos', countrycode: 'BR', state: 'São Paulo' },
    }
    const fetchFn = vi.fn<typeof fetch>(async () => json({ features: [photonStreet] }))
    const searchAddresses = vi.fn(async () => ({ status: 'ok' as const, rows: [v6ToCandidate(VILACA)!] }))
    const result = await searchPlaces('Rua Vilaça 500', { mode: 'place', bias: SJC, fetchFn, searchAddresses })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rows.map((r) => r.label)).toEqual(['Rua Vilaça 500', 'Rua Vilaça'])
    expect(result.rows[0].detail).toBe('Rua Vilaça, 500 · São José dos Campos, SP')
  })

  it('sem número no texto, o Mapbox nem é chamado', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json({ features: [] }))
    const searchAddresses = vi.fn()
    await searchPlaces('Coco Bambu', { mode: 'place', bias: SJC, fetchFn, searchAddresses })
    expect(searchAddresses).not.toHaveBeenCalled()
  })

  it('Mapbox fora do ar não derruba a busca: fica o Photon', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => json({ features: [] }))
    const searchAddresses = vi.fn(async () => ({ status: 'error' as const, cause: 'Mapbox respondeu 401' }))
    const result = await searchPlaces('Rua Vilaça 500', { mode: 'place', bias: SJC, fetchFn, searchAddresses })
    expect(result).toEqual({ status: 'ok', rows: [], fallback: false })
  })
})
