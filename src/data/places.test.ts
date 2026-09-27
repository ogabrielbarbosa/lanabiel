// A11 — `searchPlaces` sobre respostas REAIS do Photon, gravadas em
// __fixtures__/photon (2026-09-26). `fetch` simulado: o teste não depende da
// rede nem da instância pública.
// Spec: .agent/Tasks/fase-4-lista.md, R13, seção 5 e A11 · ADR 0016

import { describe, expect, it, vi } from 'vitest'
import casaAmarela from './__fixtures__/photon/casa-amarela.json'
import goreme from './__fixtures__/photon/goreme.json'
import gramadoCity from './__fixtures__/photon/gramado-city.json'
import japaoCountry from './__fixtures__/photon/japao-country.json'
import mocoto from './__fixtures__/photon/mocoto.json'
import vicentina from './__fixtures__/photon/vicentina.json'
import type { City } from './cities'
import type { DataResult } from './result'
import { PHOTON_URL, formatCoordinate, osmRef, searchPlaces } from './places'
import type { PlaceSearchResult } from './places'

function respond(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }))
}

function rows(result: PlaceSearchResult) {
  if (result.status !== 'ok') throw new Error(`esperava ok, veio ${result.status}`)
  return result.rows
}

function calledUrl(fetchFn: ReturnType<typeof respond>): URL {
  return new URL(String(fetchFn.mock.calls[0][0]))
}

const GRAMADO_IBGE: City = { id: 'c-gramado', name: 'Gramado', stateCode: 'RS', lat: -29.3788, lng: -50.8744 }

describe('A11 — mapeamento das Features reais', () => {
  it('Mocotó: restaurante com [lng, lat] na ordem certa, endereço e "{rua, nº} · {cidade}, {UF}"', async () => {
    const result = await searchPlaces('Mocotó São Paulo', { mode: 'place', fetchFn: respond(mocoto) })
    const [first] = rows(result)
    expect(first).toEqual({
      label: 'Mocotó',
      address: 'Avenida Nossa Senhora do Loreto, 1100',
      city: 'São Paulo',
      state: 'São Paulo',
      country: 'Brasil',
      countryCode: 'BR',
      lat: -23.4867214,
      lng: -46.5815741,
      detail: 'Avenida Nossa Senhora do Loreto, 1100 · São Paulo, SP',
      osmRef: 'W621005163',
    })
    expect(rows(result)).toHaveLength(5)
    // Sem número: só a rua.
    expect(rows(result)[1].address).toBe('Rua Cembira')
  })

  it('Parque Vicentina Aranha: parque em SJC', async () => {
    const [park] = rows(await searchPlaces('Parque Vicentina Aranha', { mode: 'place', fetchFn: respond(vicentina) }))
    expect(park.label).toBe('Parque Vicentina Aranha')
    expect(park.city).toBe('São José dos Campos')
    expect(park.detail).toBe('Rua Engenheiro Prudente Meireles de Moraes, 302 · São José dos Campos, SP')
    expect([park.lat, park.lng]).toEqual([-23.1982378, -45.8970653])
  })

  it('Göreme: a feature que É a cidade leva o próprio nome em `city`, e o país sai em português', async () => {
    const result = rows(await searchPlaces('Göreme', { mode: 'place', fetchFn: respond(goreme) }))
    const [village] = result
    expect(village).toMatchObject({
      label: 'Göreme',
      address: null,
      city: 'Göreme',
      state: 'Nevşehir',
      country: 'Turquia',
      countryCode: 'TR',
      lat: 38.642089,
      lng: 34.8296234,
      detail: 'Göreme, Turquia',
    })
    // Nunca o nome local do OSM.
    expect(result.map((r) => r.country)).not.toContain('Türkiye')
    expect(result.find((r) => r.countryCode === 'DE')?.country).toBe('Alemanha')
  })

  it('Gramado no modo city: `city` = nome, detail "{estado}, {país} · {lat}, {lng}" com vírgula e menos tipográfico', async () => {
    const [gramado] = rows(await searchPlaces('Gramado', { mode: 'city', fetchFn: respond(gramadoCity) }))
    expect(gramado).toMatchObject({ label: 'Gramado', city: 'Gramado', state: 'Rio Grande do Sul', address: null })
    // O frame mostra "−29,37, −50,88" (texto de design); a coordenada real
    // −29,3792858 / −50,8737019 arredonda para −29,38 / −50,87.
    expect(gramado.detail).toBe('Rio Grande do Sul, Brasil · −29,38, −50,87')
  })

  it('Japão no modo country: country "Japão", countryCode "JP", city nula, rótulo em português', async () => {
    const [japan] = rows(await searchPlaces('Japão', { mode: 'country', fetchFn: respond(japaoCountry) }))
    expect(japan).toMatchObject({
      label: 'Japão',
      country: 'Japão',
      countryCode: 'JP',
      city: null,
      state: null,
      address: null,
      lat: 36.5748441,
      lng: 139.2394179,
    })
    expect(japan.label).not.toBe('日本')
  })

  it('Casa Amarela Bistrô não é achada: o resultado não tem o bistrô (daí R13, "usar só a cidade")', async () => {
    const result = rows(
      await searchPlaces('Casa Amarela Bistrô São José dos Campos', { mode: 'place', fetchFn: respond(casaAmarela) }),
    )
    expect(result.length).toBeGreaterThan(0)
    expect(result.some((r) => /casa amarela/i.test(r.label))).toBe(false)
  })

  it('resultados idênticos (mesmo nome, mesma coordenada arredondada) aparecem uma vez só', async () => {
    const duplicated = { features: [mocoto.features[0], { ...mocoto.features[0] }, mocoto.features[1]] }
    expect(rows(await searchPlaces('Mocotó', { mode: 'place', fetchFn: respond(duplicated) }))).toHaveLength(2)
  })

  it('formatCoordinate: 2 casas, vírgula, menos tipográfico só em negativo', () => {
    expect(formatCoordinate(-29.3792858)).toBe('−29,38')
    expect(formatCoordinate(139.2394179)).toBe('139,24')
    expect(formatCoordinate(-0.001)).toBe('0,00')
  })
})

describe('A11 — a requisição', () => {
  it('parâmetros: q, limit=5, lang=default; layer por modo; viés em lat/lon', async () => {
    const place = respond(mocoto)
    await searchPlaces('  Mocotó São Paulo ', { mode: 'place', bias: { lat: -23.18, lng: -45.89 }, fetchFn: place })
    const url = calledUrl(place)
    expect(`${url.origin}${url.pathname}`).toBe(PHOTON_URL)
    expect(url.searchParams.get('q')).toBe('Mocotó São Paulo')
    expect(url.searchParams.get('limit')).toBe('5')
    expect(url.searchParams.get('lang')).toBe('default')
    expect(url.searchParams.has('layer')).toBe(false)
    expect(url.searchParams.get('lat')).toBe('-23.18')
    expect(url.searchParams.get('lon')).toBe('-45.89')

    const city = respond(gramadoCity)
    await searchPlaces('Gramado', { mode: 'city', fetchFn: city })
    expect(calledUrl(city).searchParams.get('layer')).toBe('city')
    expect(calledUrl(city).searchParams.has('lat')).toBe(false)

    const country = respond(japaoCountry)
    await searchPlaces('Japão', { mode: 'country', fetchFn: country })
    expect(calledUrl(country).searchParams.get('layer')).toBe('country')
  })

  it('sem cookie nem referrer, e com o signal repassado (seção 9)', async () => {
    const fetchFn = respond(mocoto)
    const controller = new AbortController()
    await searchPlaces('Mocotó', { mode: 'place', fetchFn, signal: controller.signal })
    const init = fetchFn.mock.calls[0][1]
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal })
  })

  it('menos de 3 caracteres (depois do trim) não chama a rede', async () => {
    const fetchFn = respond(mocoto)
    expect(await searchPlaces(' Mo ', { mode: 'place', fetchFn })).toEqual({ status: 'ok', rows: [], fallback: false })
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('A11 — falha do Photon', () => {
  const ibge = (result: DataResult<City[]>) => vi.fn(async (_q: string) => result)

  it('fetch que rejeita → cidades do IBGE, marcadas como fallback', async () => {
    const searchCities = ibge({ status: 'ok', rows: [GRAMADO_IBGE] })
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Failed to fetch')
    })
    const result = await searchPlaces('Gramado', { mode: 'city', fetchFn, searchCities })
    expect(searchCities).toHaveBeenCalledWith('Gramado')
    expect(result).toEqual({
      status: 'ok',
      fallback: true,
      rows: [
        {
          label: 'Gramado',
          address: null,
          city: 'Gramado',
          state: 'RS',
          country: 'Brasil',
          countryCode: 'BR',
          lat: -29.3788,
          lng: -50.8744,
          detail: 'RS, Brasil · −29,38, −50,87',
        },
      ],
    })
  })

  it('HTTP ≠ 200 e JSON inválido também caem no IBGE', async () => {
    const searchCities = ibge({ status: 'ok', rows: [GRAMADO_IBGE] })
    const http = await searchPlaces('Gramado', { mode: 'place', fetchFn: respond({}, 503), searchCities })
    expect(http).toMatchObject({ status: 'ok', fallback: true })
    const badJson = vi.fn<typeof fetch>(async () => new Response('<html>', { status: 200 }))
    expect(await searchPlaces('Gramado', { mode: 'place', fetchFn: badJson, searchCities })).toMatchObject({
      status: 'ok',
      fallback: true,
    })
  })

  it('Photon e IBGE fora → error', async () => {
    const result = await searchPlaces('Gramado', {
      mode: 'city',
      fetchFn: respond({}, 500),
      searchCities: ibge({ status: 'error', cause: 'pausado' }),
    })
    expect(result.status).toBe('error')
  })

  it('no modo country não há fallback (o IBGE não tem países)', async () => {
    const searchCities = ibge({ status: 'ok', rows: [GRAMADO_IBGE] })
    const result = await searchPlaces('Japão', { mode: 'country', fetchFn: respond({}, 500), searchCities })
    expect(result.status).toBe('error')
    expect(searchCities).not.toHaveBeenCalled()
  })

  it('abort não é falha: devolve aborted e não consulta o IBGE', async () => {
    const searchCities = ibge({ status: 'ok', rows: [GRAMADO_IBGE] })
    const controller = new AbortController()
    const fetchFn = vi.fn<typeof fetch>(async () => {
      controller.abort()
      throw new DOMException('The operation was aborted.', 'AbortError')
    })
    const result = await searchPlaces('Gramado', { mode: 'city', fetchFn, searchCities, signal: controller.signal })
    expect(result).toEqual({ status: 'aborted' })
    expect(searchCities).not.toHaveBeenCalled()
  })

  it('resposta que chega depois do abort é descartada', async () => {
    const controller = new AbortController()
    const fetchFn = vi.fn<typeof fetch>(async () => {
      controller.abort()
      return new Response(JSON.stringify(mocoto), { status: 200 })
    })
    expect(await searchPlaces('Mocotó', { mode: 'place', fetchFn, signal: controller.signal })).toEqual({
      status: 'aborted',
    })
  })
})

describe('A12 — `osmRef` a partir de `osm_type` + `osm_id` das respostas gravadas', () => {
  it('Gramado (layer=city): cada resultado leva a sua chave, na ordem', async () => {
    const result = rows(await searchPlaces('Gramado', { mode: 'city', fetchFn: respond(gramadoCity) }))
    expect(result.map((r) => [r.label, r.osmRef])).toEqual([
      ['Gramado', 'R242571'],
      ['Gramado dos Loureiros', 'R242635'],
      ['Gramado Xavier', 'R242555'],
      ['Granada', 'R344685'],
      ['Gramat', 'R123059'],
    ])
  })

  it('N, W e R, todas no formato do CHECK `cities_osm_ref`', async () => {
    const result = rows(await searchPlaces('Göreme', { mode: 'place', fetchFn: respond(goreme) }))
    expect(result.map((r) => r.osmRef)).toEqual(['R1774221', 'R14405251', 'R252585', 'N427711469', 'W1183558909'])
    for (const r of result) expect(r.osmRef).toMatch(/^[NWR][0-9]+$/)
  })

  it('tipo desconhecido, id ausente ou não numérico → sem chave (nunca uma inventada)', () => {
    expect(osmRef({ osm_type: 'R', osm_id: 5400890 })).toBe('R5400890')
    expect(osmRef({ osm_type: 'r', osm_id: 5400890 })).toBe('R5400890')
    expect(osmRef({ osm_type: 'X', osm_id: 1 })).toBeNull()
    expect(osmRef({ osm_type: 'R' })).toBeNull()
    expect(osmRef({ osm_type: 'R', osm_id: '5400890' })).toBeNull()
    expect(osmRef({ osm_type: 'R', osm_id: 1.5 })).toBeNull()
    expect(osmRef({ osm_type: 'R', osm_id: 0 })).toBeNull()
  })

  it('feature sem `osm_type`: o candidato sai, sem `osmRef`', async () => {
    const [feature] = gramadoCity.features
    const { osm_type: _dropped, ...properties } = feature.properties
    const body = { ...gramadoCity, features: [{ ...feature, properties }] }
    const [only] = rows(await searchPlaces('Gramado', { mode: 'city', fetchFn: respond(body) }))
    expect(only.label).toBe('Gramado')
    expect(only).not.toHaveProperty('osmRef')
  })
})
