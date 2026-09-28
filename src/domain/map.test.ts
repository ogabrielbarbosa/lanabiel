// O contrato do mapa da Home (Fase 7).
//
// Spec: .agent/Tasks/fase-7-mapa.md — R4, R11–R13, R17, R20, R21; I3–I11;
// aceites A3 (pins e filtros), A4 (regiões), A5 (câmera), A6 (cityCode),
// A7 (volta ao mundo), A8 (ritmo e cabeçalho), A9 (última memória).

import { describe, expect, it } from 'vitest'
import type { CalCity, MembersBySlot, Stay } from './calendar'
import type { GeoPlace, ListCategory, ListItem, ListMemory } from './list'
import {
  BR_STATES,
  CITY_PITCH,
  CITY_ZOOM,
  DEFAULT_FILTERS,
  EMPTY_PATH,
  WORLD_ZOOM,
  allPins,
  applyFilters,
  cameraFor,
  categoryChips,
  cityCode,
  circumferenceLine,
  clusterPoints,
  countriesLine,
  coupleStatusLines,
  currentPeriod,
  formatKm,
  latestMemory,
  monthStrip,
  nearby,
  pathOfCity,
  pathOfPin,
  personCityId,
  personMarkers,
  pinsOf,
  regionRows,
  statusCounts,
  ufOf,
  yearTogether,
} from './map'
import type { FocusPath, Pin } from './map'
import { EMPTY_LODGING } from './trips'
import type { Trip, TripMemory } from './trips'

// Gabriel = slot 1, casa em SJC; Lana = slot 2, casa em Marau. Hoje = 2026-09-27.
const TODAY = '2026-09-27'
const G = 'profile-gabriel'
const L = 'profile-lana'
const SJC_ID = 'c-sjc'
const MARAU_ID = 'c-marau'
const LIS_ID = 'c-lisboa'
const MEMBERS: MembersBySlot = { 1: { profileId: G, homeCityId: SJC_ID }, 2: { profileId: L, homeCityId: MARAU_ID } }
const CITY_NAMES: Record<string, string> = { [SJC_ID]: 'São José dos Campos', [MARAU_ID]: 'Marau', [LIS_ID]: 'Lisboa' }
const cityName = (id: string) => CITY_NAMES[id] ?? '?'

function place(city: string | null, state: string | null, countryCode: string, lat: number, lng: number): GeoPlace {
  return { address: null, city, state, country: countryCode, countryCode, lat, lng }
}

const SJC_PLACE = place('São José dos Campos', 'São Paulo', 'BR', -23.18, -45.88)

let seq = 0
function item(partial: Partial<ListItem> = {}): ListItem {
  seq += 1
  return {
    id: `item-${String(seq).padStart(3, '0')}`,
    category: 'restaurante',
    name: `Item ${seq}`,
    note: null,
    link: null,
    featured: false,
    place: SJC_PLACE,
    region: null,
    venue: null,
    highlights: [],
    platform: null,
    seasons: null,
    photoPath: null,
    status: 'want',
    rating: null,
    addedBy: G,
    createdAt: `2026-09-${String((seq % 28) + 1).padStart(2, '0')}T12:00:00+00:00`,
    doneOn: null,
    doneWith: null,
    doneSoloBy: null,
    ...partial,
  }
}

const ids = (pins: readonly Pin[]) => pins.map((p) => p.item.id)

let staySeq = 0
function stay(profileId: string, cityId: string, startsOn: string, endsOn: string | null): Stay {
  staySeq += 1
  return { id: `s-${staySeq}`, profileId, cityId, startsOn, endsOn }
}

// ---------------------------------------------------------------------------
// A3 — pins e filtros (I3, R11, R12)
// ---------------------------------------------------------------------------

describe('pinsOf / allPins / applyFilters / statusCounts / categoryChips (A3, I3)', () => {
  // As 8 categorias; cada geográfica com e sem coordenada; mídia com `place` nulo.
  const withPlace: Record<string, ListItem> = {
    pais: item({ category: 'pais', place: place(null, null, 'TR', 39.0, 35.2) }),
    cidade: item({ category: 'cidade', status: 'done' }),
    restaurante: item({ category: 'restaurante' }),
    parque: item({ category: 'parque' }),
    comida: item({ category: 'comida', status: 'done' }),
    experiencia: item({ category: 'experiencia' }),
  }
  const withoutPlace = (['pais', 'cidade', 'restaurante', 'parque', 'comida', 'experiencia'] as ListCategory[]).map((category) =>
    item({ category, place: null }),
  )
  const filme = item({ category: 'filme', place: null, platform: 'MUBI' })
  const serie = item({ category: 'serie', place: null, platform: 'Netflix', status: 'done' })
  const ITEMS = [...Object.values(withPlace), ...withoutPlace, filme, serie]
  const HIDDEN: ListCategory[] = ['parque']

  it('só os geográficos com coordenada viram pin, sem a categoria oculta', () => {
    const pins = allPins(ITEMS, HIDDEN)
    expect(ids(pins)).toEqual(
      ['pais', 'cidade', 'restaurante', 'comida', 'experiencia'].map((c) => withPlace[c].id),
    )
    expect(pins.every((p) => p.category !== 'parque')).toBe(true)
  })

  it('mídia nunca vira pin, nem com `place` preenchido por engano', () => {
    const filmeComLugar = item({ category: 'filme', place: SJC_PLACE, platform: 'MUBI' })
    expect(allPins([filme, serie, filmeComLugar], [])).toEqual([])
  })

  it('sem categoria oculta, o parque volta', () => {
    expect(ids(allPins(ITEMS, []))).toContain(withPlace.parque.id)
  })

  it('o pin guarda país, UF (só Brasil) e a chave da cidade; `pais` não tem cidade', () => {
    const [pais, cidade] = allPins(ITEMS, HIDDEN)
    expect(pais).toMatchObject({ countryCode: 'TR', uf: null, cityKey: null, cityName: null })
    expect(cidade).toMatchObject({ countryCode: 'BR', uf: 'SP', cityKey: 'BR:SP:sao jose dos campos', cityName: 'São José dos Campos' })
  })

  it('filtro de status: quero ir e já fomos', () => {
    expect(ids(pinsOf(ITEMS, HIDDEN, { status: 'want', category: 'all' }))).toEqual(
      [withPlace.pais, withPlace.restaurante, withPlace.experiencia].map((i) => i.id),
    )
    expect(ids(pinsOf(ITEMS, HIDDEN, { status: 'done', category: 'all' }))).toEqual(
      [withPlace.cidade, withPlace.comida].map((i) => i.id),
    )
  })

  it('filtro de categoria, sozinho e combinado com o de status', () => {
    expect(ids(pinsOf(ITEMS, HIDDEN, { status: 'all', category: 'comida' }))).toEqual([withPlace.comida.id])
    expect(pinsOf(ITEMS, HIDDEN, { status: 'want', category: 'comida' })).toEqual([])
    // A categoria oculta não reaparece pelo filtro.
    expect(pinsOf(ITEMS, HIDDEN, { status: 'all', category: 'parque' })).toEqual([])
  })

  it('DEFAULT_FILTERS não filtra nada', () => {
    const all = allPins(ITEMS, HIDDEN)
    expect(applyFilters(all, DEFAULT_FILTERS)).toEqual(all)
    expect(pinsOf(ITEMS, HIDDEN, DEFAULT_FILTERS)).toEqual(all)
  })

  it('statusCounts conta os pins sob o filtro de categoria (R12)', () => {
    expect(statusCounts(ITEMS, HIDDEN, 'all')).toEqual({ all: 5, want: 3, done: 2 })
    expect(statusCounts(ITEMS, HIDDEN, 'comida')).toEqual({ all: 1, want: 0, done: 1 })
    expect(statusCounts(ITEMS, HIDDEN, 'parque')).toEqual({ all: 0, want: 0, done: 0 })
    expect(statusCounts(ITEMS, [], 'parque')).toEqual({ all: 1, want: 1, done: 0 })
  })

  it('statusCounts bate com pinsOf em cada status', () => {
    const c = statusCounts(ITEMS, HIDDEN, 'all')
    expect(pinsOf(ITEMS, HIDDEN, { status: 'want', category: 'all' })).toHaveLength(c.want)
    expect(pinsOf(ITEMS, HIDDEN, { status: 'done', category: 'all' })).toHaveLength(c.done)
  })

  it('categoryChips: as geográficas visíveis, na ordem da Lista, sem mídia', () => {
    expect(categoryChips(HIDDEN)).toEqual(['pais', 'cidade', 'restaurante', 'comida', 'experiencia'])
    expect(categoryChips(['filme', 'serie'])).toEqual(['pais', 'cidade', 'restaurante', 'parque', 'comida', 'experiencia'])
  })
})

// ---------------------------------------------------------------------------
// A4 — regiões (I4, R8, R9)
// ---------------------------------------------------------------------------

describe('regionRows (A4, I4)', () => {
  const sjcFull = item({ category: 'restaurante', place: place('São José dos Campos', 'São Paulo', 'BR', -23.18, -45.88) })
  const sjcPlain = item({ category: 'comida', place: place('Sao Jose dos Campos', 'SP', 'BR', -23.2, -45.9) })
  const ubatuba = item({ category: 'cidade', place: place('Ubatuba', 'SP', 'BR', -23.43, -45.07) })
  const rio = item({ category: 'restaurante', place: place('Rio de Janeiro', 'RJ', 'BR', -22.9, -43.2) })
  const brNoUf = item({ category: 'experiencia', place: place('Marau', null, 'BR', -28.45, -52.2) })
  const lisboa = item({ category: 'restaurante', place: place('Lisboa', 'Lisboa', 'PT', 38.72, -9.14) })
  const lisboa2 = item({ category: 'comida', place: place('lisboa', 'Lisboa', 'PT', 38.71, -9.13) })
  const porto = item({ category: 'cidade', place: place('Porto', 'Porto', 'PT', 41.15, -8.61) })
  const turquia = item({ category: 'pais', place: place(null, null, 'TR', 39.0, 35.2) })
  const PINS = allPins([sjcFull, sjcPlain, ubatuba, rio, brNoUf, lisboa, lisboa2, porto, turquia], [])

  const br: FocusPath = { ...EMPTY_PATH, countryCode: 'BR' }
  const sp: FocusPath = { ...br, uf: 'SP' }
  const pt: FocusPath = { ...EMPTY_PATH, countryCode: 'PT' }

  it('world: todos os países; os com lugar primeiro, por contagem; o BR sem UF e o `pais` contam no país', () => {
    const rows = regionRows(PINS, 'world', EMPTY_PATH)
    expect(rows.slice(0, 3)).toEqual([
      { key: 'BR', code: 'BR', name: 'Brasil', count: 5 },
      { key: 'PT', code: 'PT', name: 'Portugal', count: 3 },
      { key: 'TR', code: 'TR', name: 'Turquia', count: 1 },
    ])
    expect(rows.length).toBeGreaterThan(240)
    expect(rows.find((r) => r.key === 'JP')).toEqual({ key: 'JP', code: 'JP', name: 'Japão', count: 0 })
    const names = rows.slice(3).map((r) => r.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')))
  })

  it('country Brasil: as 27 UFs — "São Paulo" por extenso e "SP" são a mesma; as sem lugar em zero, por nome', () => {
    const rows = regionRows(PINS, 'country', br)
    expect(rows).toHaveLength(27)
    expect(rows.slice(0, 2)).toEqual([
      { key: 'SP', code: 'SP', name: 'São Paulo', count: 3 },
      { key: 'RJ', code: 'RJ', name: 'Rio de Janeiro', count: 1 },
    ])
    const zeros = rows.slice(2)
    expect(zeros.every((r) => r.count === 0)).toBe(true)
    expect(zeros[0]).toEqual({ key: 'AC', code: 'AC', name: 'Acre', count: 0 })
    const names = zeros.map((r) => r.name)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')))
    // O sem UF não entra.
    expect(rows.reduce((s, r) => s + r.count, 0)).toBe(4)
  })

  it('state com os municípios da UF: os sem lugar em zero, e o com pin não duplica', () => {
    const rows = regionRows(PINS, 'state', sp, [{ name: 'São José dos Campos' }, { name: 'Taubaté' }, { name: 'Ubatuba' }])
    expect(rows).toEqual([
      { key: 'BR:SP:sao jose dos campos', code: 'SJC', name: 'São José dos Campos', count: 2 },
      { key: 'BR:SP:ubatuba', code: 'UBA', name: 'Ubatuba', count: 1 },
      { key: 'BR:SP:taubate', code: 'TAU', name: 'Taubaté', count: 0 },
    ])
  })

  it('state: por cidade, sem acento nem caixa ("Sao Jose dos Campos" = "São José dos Campos")', () => {
    expect(regionRows(PINS, 'state', sp)).toEqual([
      { key: 'BR:SP:sao jose dos campos', code: 'SJC', name: 'São José dos Campos', count: 2 },
      { key: 'BR:SP:ubatuba', code: 'UBA', name: 'Ubatuba', count: 1 },
    ])
  })

  it('o BR sem UF não aparece em estado nenhum', () => {
    for (const uf of Object.keys(BR_STATES)) {
      const rows = regionRows(PINS, 'state', { ...br, uf: uf as FocusPath['uf'] })
      expect(rows.some((r) => r.name === 'Marau')).toBe(false)
    }
  })

  it('fora do Brasil, country agrupa por cidade (sem nível de estado)', () => {
    expect(regionRows(PINS, 'country', pt)).toEqual([
      { key: 'PT::lisboa', code: 'LIS', name: 'Lisboa', count: 2 },
      { key: 'PT::porto', code: 'POR', name: 'Porto', count: 1 },
    ])
  })

  it('o `pais` pertence só ao nível país: sem cidade na Turquia', () => {
    expect(regionRows(PINS, 'country', { ...EMPTY_PATH, countryCode: 'TR' })).toEqual([])
  })

  it('empate na contagem desempata pelo nome', () => {
    const a = item({ place: place('Taubaté', 'SP', 'BR', -23.02, -45.55) })
    const b = item({ place: place('Campos do Jordão', 'SP', 'BR', -22.74, -45.59) })
    expect(regionRows(allPins([a, b], []), 'state', sp).map((r) => r.name)).toEqual(['Campos do Jordão', 'Taubaté'])
  })
})

describe('ufOf', () => {
  it('sigla em qualquer caixa, nome com ou sem acento', () => {
    expect(ufOf('SP')).toBe('SP')
    expect(ufOf(' sp ')).toBe('SP')
    expect(ufOf('São Paulo')).toBe('SP')
    expect(ufOf('sao paulo')).toBe('SP')
    expect(ufOf('Rio Grande do Sul')).toBe('RS')
  })

  it('o resto é nulo', () => {
    expect(ufOf(null)).toBeNull()
    expect(ufOf('')).toBeNull()
    expect(ufOf('Lisboa')).toBeNull()
    expect(ufOf('XX')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// A5 — câmera (I6)
// ---------------------------------------------------------------------------

describe('cameraFor (A5, I6)', () => {
  const sjcA = item({ place: place('São José dos Campos', 'SP', 'BR', -23.2, -45.9) })
  const sjcB = item({ place: place('São José dos Campos', 'SP', 'BR', -23.1, -45.8) })
  const rio = item({ place: place('Rio de Janeiro', 'RJ', 'BR', -22.9, -43.2) })
  const marau = item({ place: place('Marau', null, 'BR', -28.45, -52.2) })
  const lisboa = item({ place: place('Lisboa', 'Lisboa', 'PT', 38.72, -9.14) })
  const PINS = allPins([sjcA, sjcB, rio, marau, lisboa], [])
  const VIEWER = { lat: -23.18, lng: -45.88 }
  const br: FocusPath = { ...EMPTY_PATH, countryCode: 'BR' }

  it('world: o globo centrado em quem vê, zoom 2,4, sem inclinação', () => {
    expect(cameraFor({ level: 'world', path: EMPTY_PATH }, PINS, VIEWER)).toEqual({
      kind: 'center',
      center: VIEWER,
      zoom: WORLD_ZOOM,
      pitch: 0,
      bearing: 0,
      terrain: false,
    })
    expect(WORLD_ZOOM).toBe(2.4)
  })

  it('country com pins: bounds dos pins do país (o sem UF incluso), zoom mínimo 3', () => {
    const cam = cameraFor({ level: 'country', path: br }, PINS, VIEWER)
    expect(cam).toMatchObject({ kind: 'bounds', sw: { lat: -28.45, lng: -52.2 }, ne: { lat: -22.9, lng: -43.2 }, minZoom: 3 })
  })

  it('state com pins: bounds só da UF, zoom mínimo 5', () => {
    const cam = cameraFor({ level: 'state', path: { ...br, uf: 'SP' } }, PINS, VIEWER)
    expect(cam).toMatchObject({ kind: 'bounds', sw: { lat: -23.2, lng: -45.9 }, ne: { lat: -23.1, lng: -45.8 }, minZoom: 5 })
  })

  it('state sem pins: o centro de BR_STATES, sem inclinação', () => {
    const cam = cameraFor({ level: 'state', path: { ...br, uf: 'RS' } }, PINS, VIEWER)
    expect(cam).toEqual({
      kind: 'center',
      center: { lat: BR_STATES.RS.lat, lng: BR_STATES.RS.lng },
      zoom: 5,
      pitch: 0,
      bearing: 0,
      terrain: false,
    })
  })

  it('city com centro de `cities`: inclinação 60 e terreno', () => {
    const path = pathOfCity({ id: SJC_ID, name: 'São José dos Campos', stateCode: 'SP', countryCode: 'BR', lat: -23.19, lng: -45.88 })
    const cam = cameraFor({ level: 'city', path }, PINS, VIEWER)
    expect(cam).toMatchObject({ kind: 'center', center: { lat: -23.19, lng: -45.88 }, zoom: CITY_ZOOM, pitch: 60, terrain: true })
    expect(CITY_PITCH).toBe(60)
  })

  it('city sem centro conhecido: a média dos pins da cidade', () => {
    const path = pathOfPin(PINS[0])
    expect(path.cityCenter).toBeNull()
    const cam = cameraFor({ level: 'city', path }, PINS, VIEWER)
    expect(cam.kind).toBe('center')
    if (cam.kind !== 'center') return
    expect(cam.center.lat).toBeCloseTo(-23.15)
    expect(cam.center.lng).toBeCloseTo(-45.85)
    expect(cam).toMatchObject({ pitch: 60, terrain: true })
  })
})

// ---------------------------------------------------------------------------
// A6 — cityCode (I9)
// ---------------------------------------------------------------------------

describe('cityCode (A6, I9)', () => {
  it.each([
    ['São José dos Campos', 'SJC'],
    ['São Paulo', 'SPO'],
    ['Campos do Jordão', 'CDJ'],
    ['Ubatuba', 'UBA'],
    ['Lisboa', 'LIS'],
    ['Ilhabela', 'ILH'],
  ])('%s → %s', (name, code) => {
    expect(cityCode(name)).toBe(code)
  })

  it('partícula entra quando é o que completa três palavras', () => {
    expect(cityCode('Rio de Janeiro')).toBe('RDJ')
    expect(cityCode('Santana do Livramento')).toBe('SDL')
  })

  it('maiúsculas e sem acento', () => {
    expect(cityCode('Tóquio')).toBe('TOQ')
    expect(cityCode('são paulo')).toBe('SPO')
  })
})

// ---------------------------------------------------------------------------
// A7 — volta ao mundo (I11)
// ---------------------------------------------------------------------------

describe('circumferenceLine (A7, I11)', () => {
  it('o .pen: 18.420 km → 46%, quase meia volta', () => {
    expect(circumferenceLine(18420)).toEqual({
      pct: 46,
      text: 'Quase meia volta ao mundo (46% da circunferência da Terra)',
    })
  })

  it('abaixo de 40%: só o percentual', () => {
    expect(circumferenceLine(4000)).toEqual({ pct: 10, text: '10% da circunferência da Terra' })
    expect(circumferenceLine(0)).toEqual({ pct: 0, text: '0% da circunferência da Terra' })
  })

  it('bordas de 40 e 50', () => {
    expect(circumferenceLine(16030).text).toBe('Quase meia volta ao mundo (40% da circunferência da Terra)')
    expect(circumferenceLine(20038)).toEqual({ pct: 50, text: 'Mais de meia volta ao mundo (50% da circunferência da Terra)' })
  })

  it('entre 50 e 99: mais de meia volta', () => {
    expect(circumferenceLine(30000)).toEqual({ pct: 75, text: 'Mais de meia volta ao mundo (75% da circunferência da Terra)' })
  })

  it('exatamente uma volta: "Uma volta ao mundo"', () => {
    expect(circumferenceLine(40075)).toEqual({ pct: 100, text: 'Uma volta ao mundo' })
  })

  it('mais de uma: voltas com uma casa e vírgula', () => {
    expect(circumferenceLine(52100)).toEqual({ pct: 130, text: '1,3 voltas ao mundo' })
    expect(circumferenceLine(80150)).toEqual({ pct: 200, text: '2,0 voltas ao mundo' })
  })
})

// ---------------------------------------------------------------------------
// Onde cada um está: a bolinha de cada pessoa no mapa
// ---------------------------------------------------------------------------

describe('personCityId: hoje, senão a última posição, senão a casa', () => {
  it('a estadia de hoje manda, inclusive em aberto', () => {
    expect(personCityId(G, SJC_ID, [stay(G, LIS_ID, '2026-09-20', null)], TODAY)).toBe(LIS_ID)
    expect(personCityId(G, SJC_ID, [stay(G, LIS_ID, '2026-09-20', TODAY)], TODAY)).toBe(LIS_ID)
  })

  it('sem estadia hoje: a última que já terminou, não a mais antiga', () => {
    const stays = [stay(G, LIS_ID, '2026-08-01', '2026-08-10'), stay(G, MARAU_ID, '2026-09-01', '2026-09-15')]
    expect(personCityId(G, SJC_ID, stays, TODAY)).toBe(MARAU_ID)
  })

  it('estadia futura e de outra pessoa não contam', () => {
    const stays = [stay(G, LIS_ID, '2026-10-01', '2026-10-10'), stay(L, MARAU_ID, '2026-09-01', '2026-09-15')]
    expect(personCityId(G, SJC_ID, stays, TODAY)).toBe(SJC_ID)
  })

  it('sem estadia nenhuma: a casa', () => {
    expect(personCityId(L, MARAU_ID, [], TODAY)).toBe(MARAU_ID)
  })
})

describe('personMarkers', () => {
  const city = (id: string, lat: number, lng: number): CalCity => ({ id, name: CITY_NAMES[id], stateCode: null, countryCode: 'BR', region: null, lat, lng })
  const SJC = city(SJC_ID, -23.18, -45.88)
  const MARAU = city(MARAU_ID, -28.45, -52.2)
  const LIS = { ...city(LIS_ID, 38.72, -9.14), countryCode: 'PT' }
  const CITIES = new Map([SJC, MARAU, LIS].map((c) => [c.id, c]))
  const PEOPLE = [
    { profileId: G, name: 'Gabriel', color: '#e8a33d', homeCity: SJC },
    { profileId: L, name: 'Lana', color: '#c86b8a', homeCity: MARAU },
  ]

  it('separados: cada um na sua cidade, na sua cor', () => {
    const m = personMarkers(PEOPLE, [], CITIES, TODAY)
    expect(m.map((x) => [x.name, x.cityId, x.color, x.lat, x.together])).toEqual([
      ['Gabriel', SJC_ID, '#e8a33d', -23.18, 1],
      ['Lana', MARAU_ID, '#c86b8a', -28.45, 1],
    ])
  })

  it('juntos: a mesma cidade, com o deslocamento lado a lado', () => {
    const m = personMarkers(PEOPLE, [stay(L, SJC_ID, '2026-09-20', null)], CITIES, TODAY)
    expect(m.map((x) => [x.cityId, x.offset, x.together])).toEqual([
      [SJC_ID, 0, 2],
      [SJC_ID, 1, 2],
    ])
  })

  it('cidade que não veio na leitura: a casa, nunca um ponto em "?"', () => {
    const m = personMarkers(PEOPLE, [stay(G, 'c-sumiu', '2026-09-20', null)], CITIES, TODAY)
    expect(m[0].cityId).toBe(SJC_ID)
  })
})

// ---------------------------------------------------------------------------
// A8 — Nosso ritmo e cabeçalho (I7, R4, R17)
// ---------------------------------------------------------------------------

describe('yearTogether / monthStrip / currentPeriod (A8, I7, R17)', () => {
  // 01-01..01-10 juntos em SJC · 01-11..01-20 separados · 01-21..01-31 lacuna
  // da Lana · 02-01..08-31 juntos em Marau · 09-01..09-05 separados ·
  // 09-06..09-10 lacuna do Gabriel · 09-11..09-30 viajando juntos em Lisboa
  // (hoje é 09-27; 28 a 30 são planejados).
  const STAYS: Stay[] = [
    stay(G, SJC_ID, '2026-01-01', '2026-01-31'),
    stay(G, MARAU_ID, '2026-02-01', '2026-09-05'),
    stay(G, LIS_ID, '2026-09-11', '2026-09-30'),
    stay(L, SJC_ID, '2026-01-01', '2026-01-10'),
    stay(L, MARAU_ID, '2026-01-11', '2026-01-20'),
    stay(L, MARAU_ID, '2026-02-01', '2026-08-31'),
    stay(L, SJC_ID, '2026-09-01', '2026-09-05'),
    stay(L, LIS_ID, '2026-09-06', '2026-09-30'),
  ]

  it('yearTogether conta só os dias juntos vividos, sem futuro e sem lacuna (floor)', () => {
    // juntos: 10 (jan) + 212 (fev–ago) + 17 (11 a 27/set) = 239 de 270 dias
    expect(yearTogether(TODAY, STAYS, MEMBERS)).toEqual({ days: 239, pct: 88 })
  })

  it('yearTogether não conta o planejado: amanhã soma um dia vivido, não três', () => {
    expect(yearTogether('2026-09-28', STAYS, MEMBERS).days).toBe(240)
  })

  it('yearTogether sem nenhuma estadia: zero, não "separados"', () => {
    expect(yearTogether(TODAY, [], MEMBERS)).toEqual({ days: 0, pct: 0 })
  })

  it('monthStrip: o mês inteiro, com separados, lacuna, juntos, hoje e planejado', () => {
    const { days, together, apart } = monthStrip(TODAY, STAYS, MEMBERS)
    expect(days).toHaveLength(30)
    expect(days[0]).toEqual({ day: '2026-09-01', mark: 'apart', today: false, planned: false })
    expect(days.slice(0, 5).every((d) => d.mark === 'apart')).toBe(true)
    expect(days.slice(5, 10).every((d) => d.mark === 'unknown')).toBe(true)
    expect(days.slice(10).every((d) => d.mark === 'together')).toBe(true)
    expect(days.filter((d) => d.today).map((d) => d.day)).toEqual([TODAY])
    expect(days.filter((d) => d.planned).map((d) => d.day)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
    // countDrawn: o planejado conta; a lacuna não é nem juntos nem separados.
    expect({ together, apart }).toEqual({ together: 20, apart: 5 })
  })

  it('monthStrip sem estadia: todo dia `unknown`', () => {
    const { days, together, apart } = monthStrip('2026-02-10', [], MEMBERS)
    expect(days).toHaveLength(28)
    expect(days.every((d) => d.mark === 'unknown')).toBe(true)
    expect({ together, apart }).toEqual({ together: 0, apart: 0 })
  })

  it('currentPeriod: viajando, dia 17 de 20', () => {
    const p = currentPeriod(TODAY, STAYS, MEMBERS)
    expect(p).toMatchObject({ kind: 'traveling', dayK: 17, total: 20 })
    expect(p.run).toMatchObject({ from: '2026-09-11', to: '2026-09-30', cityId: LIS_ID })
  })

  it('currentPeriod em aberto: total nulo', () => {
    const open = [stay(G, SJC_ID, '2026-09-16', null), stay(L, SJC_ID, '2026-09-16', null)]
    expect(currentPeriod(TODAY, open, MEMBERS)).toMatchObject({ kind: 'together', dayK: 12, total: null })
  })

  it('currentPeriod sem estadia hoje: unknown, sem trecho', () => {
    expect(currentPeriod(TODAY, [], MEMBERS)).toEqual({ kind: 'unknown', run: null, dayK: 0, total: null })
  })
})

describe('coupleStatusLines (A8, R4)', () => {
  it('juntos em casa, em aberto', () => {
    const stays = [stay(G, SJC_ID, '2026-09-16', null), stay(L, SJC_ID, '2026-09-16', null)]
    expect(coupleStatusLines(currentPeriod(TODAY, stays, MEMBERS), cityName, G)).toEqual({
      status: 'Juntos agora · São José dos Campos',
      counter: 'Juntos há 12 dias',
    })
  })

  it('viajando juntos', () => {
    const stays = [stay(G, LIS_ID, '2026-09-20', '2026-10-02'), stay(L, LIS_ID, '2026-09-20', '2026-10-02')]
    expect(coupleStatusLines(currentPeriod(TODAY, stays, MEMBERS), cityName, L)).toEqual({
      status: 'Viajando juntos · Lisboa',
      counter: 'Juntos há 8 dias',
    })
  })

  it('separados: a cidade de quem vê vem primeiro', () => {
    const stays = [stay(G, SJC_ID, '2026-09-20', null), stay(L, MARAU_ID, '2026-09-20', null)]
    const period = currentPeriod(TODAY, stays, MEMBERS)
    expect(coupleStatusLines(period, cityName, G)).toEqual({
      status: 'Separados agora · São José dos Campos e Marau',
      counter: 'Separados há 8 dias',
    })
    expect(coupleStatusLines(period, cityName, L).status).toBe('Separados agora · Marau e São José dos Campos')
  })

  it('primeiro dia do trecho: "há 1 dia"', () => {
    const stays = [stay(G, SJC_ID, TODAY, null), stay(L, MARAU_ID, TODAY, null)]
    expect(coupleStatusLines(currentPeriod(TODAY, stays, MEMBERS), cityName, G).counter).toBe('Separados há 1 dia')
  })

  it('unknown: "Sem registro de hoje" e sem segunda linha', () => {
    const stays = [stay(G, SJC_ID, '2026-09-01', null)]
    expect(coupleStatusLines(currentPeriod(TODAY, stays, MEMBERS), cityName, G)).toEqual({
      status: 'Sem registro de hoje',
      counter: null,
    })
  })
})

// ---------------------------------------------------------------------------
// A9 — última memória (I10, R20)
// ---------------------------------------------------------------------------

describe('latestMemory (A9, I10)', () => {
  const tripMemory = (writtenOn: string, body = 'Foi lindo.'): TripMemory => ({ profileId: G, rating: 5, body, writtenOn })
  function trip(id: string, memories: TripMemory[]): Trip {
    return {
      id,
      title: 'Viagem',
      cityId: LIS_ID,
      startsOn: '2026-07-12',
      endsOn: '2026-07-19',
      note: null,
      coverPhotoId: null,
      lodging: EMPTY_LODGING,
      departures: [],
      days: [],
      itinerary: [],
      prep: [],
      budget: [],
      memories,
      photos: [],
    }
  }
  // Instante local: o dia comparado é o do aparelho, não o de UTC.
  const localStamp = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min).toISOString()
  const listMemory = (itemId: string, updatedAt: string): ListMemory => ({
    itemId,
    profileId: L,
    body: 'Que noite.',
    createdAt: updatedAt,
    updatedAt,
  })
  const doneItem = item({ id: 'li-done', status: 'done', doneOn: '2026-09-01' })

  it('sem memória nenhuma: nulo', () => {
    expect(latestMemory([], [doneItem], [])).toBeNull()
    expect(latestMemory([trip('t-0', [])], [], [])).toBeNull()
  })

  it('a de viagem mais recente vence entre viagens', () => {
    const t1 = trip('t-1', [tripMemory('2026-07-20')])
    const t2 = trip('t-2', [tripMemory('2026-08-02'), tripMemory('2026-07-01')])
    expect(latestMemory([t1, t2], [], [])).toMatchObject({ kind: 'trip', trip: { id: 't-2' }, memory: { writtenOn: '2026-08-02' } })
  })

  it('a da Lista vence quando é de um dia depois', () => {
    const t = trip('t-1', [tripMemory('2026-09-20')])
    const m = listMemory(doneItem.id, localStamp(2026, 9, 21, 9))
    expect(latestMemory([t], [doneItem], [m])).toEqual({ kind: 'item', item: doneItem, memory: m })
  })

  it('a de viagem vence quando é de um dia depois', () => {
    const t = trip('t-1', [tripMemory('2026-09-22')])
    const m = listMemory(doneItem.id, localStamp(2026, 9, 21, 23, 59))
    expect(latestMemory([t], [doneItem], [m])).toMatchObject({ kind: 'trip', trip: { id: 't-1' } })
  })

  it('empate no dia (mesmo com a da Lista tarde da noite local): a de viagem', () => {
    const t = trip('t-1', [tripMemory('2026-09-20')])
    const m = listMemory(doneItem.id, localStamp(2026, 9, 20, 23, 30))
    expect(latestMemory([t], [doneItem], [m])).toMatchObject({ kind: 'trip', trip: { id: 't-1' } })
  })

  it('memória da Lista de item que não veio na leitura é ignorada', () => {
    const t = trip('t-1', [tripMemory('2026-09-01')])
    const m = listMemory('li-ausente', localStamp(2026, 9, 25, 12))
    expect(latestMemory([t], [doneItem], [m])).toMatchObject({ kind: 'trip' })
  })
})

// ---------------------------------------------------------------------------
// Auxiliares: agrupamento, km, países, por perto
// ---------------------------------------------------------------------------

describe('clusterPoints (R11)', () => {
  it('guloso na ordem de entrada: o primeiro é o líder e o grupo fica na posição dele', () => {
    const out = clusterPoints(
      [
        { id: 'a', x: 100, y: 100 },
        { id: 'b', x: 120, y: 110 },
        { id: 'c', x: 300, y: 300 },
        { id: 'd', x: 130, y: 100 },
        { id: 'e', x: 320, y: 300 },
      ],
      44,
    )
    expect(out).toEqual([
      { head: 'a', ids: ['a', 'b', 'd'], x: 100, y: 100 },
      { head: 'c', ids: ['c', 'e'], x: 300, y: 300 },
    ])
  })

  it('a distância é medida do líder, não do último que entrou', () => {
    // b está a 40 de a; c está a 40 de b mas a 80 de a → grupo novo.
    const out = clusterPoints(
      [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 40, y: 0 },
        { id: 'c', x: 80, y: 0 },
      ],
      44,
    )
    expect(out.map((c) => c.ids)).toEqual([['a', 'b'], ['c']])
  })

  it('exatamente no raio não agrupa (estritamente menor)', () => {
    expect(clusterPoints([{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 44, y: 0 }], 44)).toHaveLength(2)
  })
})

describe('formatKm (I8)', () => {
  it('uma casa com vírgula abaixo de 10 km', () => {
    expect(formatKm(1.24)).toBe('1,2 km')
    expect(formatKm(0)).toBe('0,0 km')
    expect(formatKm(9.94)).toBe('9,9 km')
  })

  it('inteiro acima, com milhar em ponto', () => {
    expect(formatKm(86.4)).toBe('86 km')
    expect(formatKm(10)).toBe('10 km')
    expect(formatKm(18420)).toBe('18.420 km')
  })
})

describe('countriesLine (R21)', () => {
  it('nenhum, um, dois e mais', () => {
    expect(countriesLine([])).toBe('')
    expect(countriesLine(['BR'])).toBe('Brasil')
    expect(countriesLine(['BR', 'TR'])).toBe('Brasil e Turquia')
    expect(countriesLine(['BR', 'TR', 'PT', 'JP', 'AR', 'CL', 'UY'])).toBe('Brasil, Turquia e mais 5')
  })
})

describe('nearby (R13)', () => {
  const center = { lat: -23.1896, lng: -45.8841 } // SJC
  const perto = item({ name: 'Perto', createdAt: '2026-01-01T12:00:00Z', place: place('São José dos Campos', 'SP', 'BR', -23.2, -45.9) })
  const medio = item({ name: 'Médio', createdAt: '2026-09-01T12:00:00Z', place: place('Ubatuba', 'SP', 'BR', -23.43, -45.07) })
  const longe = item({ name: 'Longe', createdAt: '2026-09-20T12:00:00Z', place: place('Marau', 'RS', 'BR', -28.45, -52.2) })
  const PINS = allPins([longe, medio, perto], [])

  it('só dentro do raio, do mais perto ao mais longe', () => {
    const rows = nearby(PINS, center, 150, 'near')
    expect(rows.map((r) => r.pin.item.name)).toEqual(['Perto', 'Médio'])
    expect(rows[0].km).toBeLessThan(3)
    expect(rows[1].km).toBeGreaterThan(80)
    expect(rows[1].km).toBeLessThan(100)
  })

  it('mais recentes: pela criação, do mais novo', () => {
    expect(nearby(PINS, center, 150, 'recent').map((r) => r.pin.item.name)).toEqual(['Médio', 'Perto'])
    expect(nearby(PINS, center, 2000, 'recent').map((r) => r.pin.item.name)).toEqual(['Longe', 'Médio', 'Perto'])
  })

  it('raio pequeno demais: vazio', () => {
    expect(nearby(PINS, center, 0.5, 'near')).toEqual([])
  })
})
