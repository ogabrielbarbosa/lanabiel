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
import type { NearbyPlace } from './nearbyPlaces'
import {
  PHOTON_URL,
  PLACE_LIMIT,
  featureToCandidate,
  formatCoordinate,
  mergeNearby,
  nearbyToCandidate,
  osmRef,
  proximityRing,
  rankByProximity,
  searchPlaces,
} from './places'
import type { PlaceCandidate, PlaceSearchOptions, PlaceSearchResult } from './places'

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
  it('parâmetros: q, limit (10 com viés, para ordenar por proximidade; 5 sem), lang=default; layer por modo; viés em lat/lon', async () => {
    const place = respond(mocoto)
    await searchPlaces('  Mocotó São Paulo ', { mode: 'place', bias: { lat: -23.18, lng: -45.89 }, fetchFn: place })
    const url = calledUrl(place)
    expect(`${url.origin}${url.pathname}`).toBe(PHOTON_URL)
    expect(url.searchParams.get('q')).toBe('Mocotó São Paulo')
    expect(url.searchParams.get('limit')).toBe('10')
    expect(url.searchParams.get('lang')).toBe('default')
    expect(url.searchParams.has('layer')).toBe(false)
    expect(url.searchParams.get('lat')).toBe('-23.18')
    expect(url.searchParams.get('lon')).toBe('-45.89')

    const city = respond(gramadoCity)
    await searchPlaces('Gramado', { mode: 'city', fetchFn: city })
    expect(calledUrl(city).searchParams.get('layer')).toBe('city')
    expect(calledUrl(city).searchParams.has('lat')).toBe(false)
    expect(calledUrl(city).searchParams.get('limit')).toBe('5')

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

// ADR 0027 — os estabelecimentos do Overture perto de casa, junto do Photon.
describe('Overture perto de casa (ADR 0027)', () => {
  const MARAU = { lat: -28.449, lng: -52.199 }
  const BAMBINA: NearbyPlace = {
    name: 'Bambina Pizzaria',
    address: 'Rua Parana, 201',
    city: 'Marau',
    state: 'RS',
    countryCode: 'BR',
    lat: -28.4512,
    lng: -52.2004,
  }
  const nearbyOk = (...places: NearbyPlace[]) =>
    vi.fn<NonNullable<PlaceSearchOptions['searchNearby']>>(async () => ({ status: 'ok', places }))
  const failing = vi.fn<typeof fetch>(async () => {
    throw new TypeError('Failed to fetch')
  })

  it('o estabelecimento do Overture vem primeiro, no formato do Photon, e o Photon completa a lista', async () => {
    const searchNearby = nearbyOk(BAMBINA)
    const result = rows(
      await searchPlaces('Bambina', { mode: 'place', bias: MARAU, searchNearby, fetchFn: respond(mocoto) }),
    )
    expect(result[0]).toEqual({
      label: 'Bambina Pizzaria',
      address: 'Rua Parana, 201',
      city: 'Marau',
      state: 'RS',
      country: 'Brasil',
      countryCode: 'BR',
      lat: -28.4512,
      lng: -52.2004,
      detail: 'Rua Parana, 201 · Marau, RS',
    })
    expect(result).toHaveLength(PLACE_LIMIT)
    const photonOnly = rows(await searchPlaces('Bambina', { mode: 'place', fetchFn: respond(mocoto) }))
    expect(result.slice(1)).toEqual(photonOnly.slice(0, PLACE_LIMIT - 1))
    expect(searchNearby).toHaveBeenCalledWith('Bambina', MARAU, undefined)
  })

  it('Overture cheio ainda deixa duas vagas ao Photon (a rua de mesmo nome não some)', async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ ...BAMBINA, name: `Lugar ${i}`, lat: BAMBINA.lat + i * 0.01 }))
    const result = rows(
      await searchPlaces('Lugar', { mode: 'place', bias: MARAU, searchNearby: nearbyOk(...many), fetchFn: respond(mocoto) }),
    )
    expect(result.map((r) => r.label)).toEqual(['Lugar 0', 'Lugar 1', 'Lugar 2', 'Mocotó', expect.any(String)])
  })

  it('o mesmo lugar nas duas fontes aparece uma vez (nome sem acento/caixa, a menos de ~150 m)', () => {
    const overture = nearbyToCandidate({ ...BAMBINA, name: 'Mocotó' })
    const photon = { ...overture, label: 'MOCOTO', lat: overture.lat + 0.0005, address: null }
    const far = { ...overture, label: 'Mocotó', lat: overture.lat + 0.01 }
    expect(mergeNearby([overture], [photon, far], 5)).toEqual([overture, far])
  })

  it('só no modo place e com viés: cidade e país não chamam o Overture', async () => {
    const searchNearby = nearbyOk(BAMBINA)
    await searchPlaces('Gramado', { mode: 'city', bias: MARAU, searchNearby, fetchFn: respond(gramadoCity) })
    await searchPlaces('Japão', { mode: 'country', bias: MARAU, searchNearby, fetchFn: respond(japaoCountry) })
    await searchPlaces('Bambina', { mode: 'place', searchNearby, fetchFn: respond(mocoto) })
    expect(searchNearby).not.toHaveBeenCalled()
  })

  it('Overture sem chave, com erro ou rejeitando: fica o Photon, sem aviso', async () => {
    const photonOnly = rows(await searchPlaces('Mocotó', { mode: 'place', fetchFn: respond(mocoto) }))
    for (const searchNearby of [
      vi.fn(async () => ({ status: 'unconfigured' as const })),
      vi.fn(async () => ({ status: 'error' as const, cause: 'Open Places 402' })),
      vi.fn(async () => {
        throw new Error('rede')
      }),
    ]) {
      const result = await searchPlaces('Mocotó', { mode: 'place', bias: MARAU, searchNearby, fetchFn: respond(mocoto) })
      expect(result).toEqual({ status: 'ok', rows: photonOnly, fallback: false })
    }
  })

  it('Photon fora e Overture ok: o Overture sozinho, sem cair no IBGE', async () => {
    const searchCities = vi.fn()
    const result = await searchPlaces('Bambina', {
      mode: 'place',
      bias: MARAU,
      searchNearby: nearbyOk(BAMBINA),
      searchCities,
      fetchFn: failing,
    })
    expect(result).toMatchObject({ status: 'ok', fallback: false, rows: [{ label: 'Bambina Pizzaria' }] })
    expect(searchCities).not.toHaveBeenCalled()
  })

  it('Photon fora e Overture vazio: o IBGE, como antes', async () => {
    const searchCities = vi.fn(async (): Promise<DataResult<City[]>> => ({ status: 'ok', rows: [GRAMADO_IBGE] }))
    const result = await searchPlaces('Gramado', {
      mode: 'place',
      bias: MARAU,
      searchNearby: nearbyOk(),
      searchCities,
      fetchFn: failing,
    })
    expect(result).toMatchObject({ status: 'ok', fallback: true, rows: [{ label: 'Gramado' }] })
  })

  it('abort cancela as duas buscas e devolve aborted', async () => {
    const controller = new AbortController()
    const searchNearby = vi.fn<NonNullable<PlaceSearchOptions['searchNearby']>>(async (_q, _near, signal) => {
      controller.abort()
      return signal?.aborted ? { status: 'aborted' } : { status: 'ok', places: [BAMBINA] }
    })
    const result = await searchPlaces('Bambina', {
      mode: 'place',
      bias: MARAU,
      searchNearby,
      signal: controller.signal,
      fetchFn: respond(mocoto),
    })
    expect(result).toEqual({ status: 'aborted' })
    expect(searchNearby.mock.calls[0][2]).toBe(controller.signal)
  })
})

// Do meio para fora: bairro, cidade, estado, país, continente, mundo.
describe('ordem por proximidade', () => {
  const SJC = { lat: -23.1794, lng: -45.8869 }
  const at = (label: string, lat: number, lng: number): PlaceCandidate => ({
    label,
    detail: '',
    address: null,
    city: null,
    state: null,
    country: 'Brasil',
    countryCode: 'BR',
    lat,
    lng,
  })
  const centro = at('Vaca Preta (centro de SJC)', -23.1830, -45.8850)
  const urbanova = at('Vaca Preta (Urbanova)', -23.2000, -45.9500)
  const saoPaulo = at('Vaca Preta (São Paulo)', -23.5505, -46.6333)
  const bahia = at('Vaca Preta (norte da Bahia)', -9.4100, -40.5000)
  const lisboa = { ...at('Vaca Preta (Lisboa)', 38.7223, -9.1393), country: 'Portugal', countryCode: 'PT' }
  const toquio = { ...at('Vaca Preta (Tóquio)', 35.6762, 139.6503), country: 'Japão', countryCode: 'JP' }

  it('cada lugar no seu anel: bairro, cidade, estado, país, continente, mundo', () => {
    const rings = [centro, urbanova, saoPaulo, bahia, lisboa, toquio].map((p) => proximityRing(SJC, p, 'BR'))
    expect(rings).toEqual([0, 1, 2, 3, 5, 5])
    // Buenos Aires está mais perto de SJC que o norte da Bahia, mas é outro país.
    const buenosAires = { ...at('Buenos Aires', -34.6037, -58.3816), countryCode: 'AR' }
    expect(proximityRing(SJC, buenosAires, 'BR')).toBe(4)
    // Sem saber o país de origem, o anel do país é distância (até 1.500 km).
    expect(proximityRing(SJC, buenosAires)).toBe(4)
    expect(proximityRing(SJC, bahia)).toBe(4)
  })

  it('o país de origem sai do resultado mais perto: o norte da Bahia fica no anel do país', () => {
    expect(rankByProximity([toquio, bahia, lisboa, centro], SJC)).toEqual([centro, bahia, toquio, lisboa])
  })

  it('o de perto passa na frente do de longe, venha na ordem que vier', () => {
    expect(rankByProximity([toquio, bahia, saoPaulo, urbanova, centro], SJC)).toEqual([centro, urbanova, saoPaulo, bahia, toquio])
  })

  it('no mesmo anel a ordem do provedor fica (o nome que bate melhor não perde para o mais perto)', () => {
    const longe = at('Vaca Preta (7 km)', -23.2, -45.95)
    const perto = at('Vaca Preta (5 km)', -23.22, -45.9)
    expect([longe, perto].map((p) => proximityRing(SJC, p))).toEqual([1, 1])
    expect(rankByProximity([longe, perto], SJC)).toEqual([longe, perto])
  })

  it('busca com viés: o resultado do Photon na Bahia vai para depois do de SJC', async () => {
    const feature = (name: string, p: PlaceCandidate) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { name, city: 'X', state: 'Y', country: 'Brasil', countrycode: 'BR', osm_type: 'N', osm_id: Math.round(Math.abs(p.lat) * 1000) },
    })
    const body = { features: [feature('Vaca Preta', bahia), feature('Vaca Preta', saoPaulo), feature('Vaca Preta', centro)] }
    const result = rows(await searchPlaces('Vaca Preta', { mode: 'place', bias: SJC, fetchFn: respond(body) }))
    expect(result.map((r) => r.lat)).toEqual([centro.lat, saoPaulo.lat, bahia.lat])

    // Sem viés, fica a ordem do Photon.
    const raw = rows(await searchPlaces('Vaca Preta', { mode: 'place', fetchFn: respond(body) }))
    expect(raw.map((r) => r.lat)).toEqual([bahia.lat, saoPaulo.lat, centro.lat])
  })

  it('Overture e Photon juntos por anel, e o Photon ainda com duas vagas', () => {
    const overture = Array.from({ length: 6 }, (_, i) => at(`Overture ${i}`, -23.18 - i * 0.001, -45.887))
    const photon = [at('Rua Vaca Preta', -23.19, -45.89), bahia]
    const merged = mergeNearby(overture, photon, 5, SJC)
    expect(merged.map((r) => r.label)).toEqual(['Overture 0', 'Overture 1', 'Overture 2', 'Rua Vaca Preta', bahia.label])
  })
})

describe('o tipo do resultado (o modal escolhe Parque e não põe rua como nome)', () => {
  type Fc = { features: Parameters<typeof featureToCandidate>[0][] }
  const kinds = (fixture: unknown) => (fixture as Fc).features.map((f) => featureToCandidate(f, 'place')?.kind ?? null)

  it('restaurante num prédio com número (type "house") não é endereço; a rua é', () => {
    expect(kinds(mocoto).slice(0, 4)).toEqual([null, null, null, 'address'])
  })

  it('leisure=park é parque; a vila Göreme é cidade', () => {
    expect(kinds(vicentina)[0]).toBe('park')
    expect(kinds(goreme)[0]).toBe('city')
  })

  it('fora do modo place não há tipo', () => {
    const [first] = (vicentina as unknown as Fc).features
    expect(featureToCandidate(first, 'city')?.kind).toBeUndefined()
  })
})
