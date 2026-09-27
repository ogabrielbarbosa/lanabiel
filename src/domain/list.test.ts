import { describe, expect, it } from 'vitest'
import type { Member, Stay } from './coupleState'
import {
  formatDistance,
  CATEGORY_LABELS,
  EMPTY_FILTERS,
  EMPTY_STATE_FALLBACK,
  LIST_CATEGORIES,
  NEARBY_RADIUS_KM,
  applyFilters,
  countByCategory,
  emptyStateCopy,
  nearby,
  pickSuggestion,
  progress,
  ratingLabel,
  relativeAge,
  secondaryLine,
  sortItems,
  suggestionPool,
  validateItem,
  whereWeAre,
} from './list'
import type { GeoPlace, ItemDraft, ListCity, ListFilters, ListItem } from './list'
import { VALIDATION_CASES } from './listValidationCases'
import { LIST_CATEGORY_LABEL } from './settings'

const G = 'profile-gabriel'
const L = 'profile-lana'

const SJC_PLACE: GeoPlace = {
  address: null,
  city: 'São José dos Campos',
  state: 'São Paulo',
  country: 'Brasil',
  countryCode: 'BR',
  lat: -23.18,
  lng: -45.88,
}

function at(city: string, lat: number, lng: number, extra: Partial<GeoPlace> = {}): GeoPlace {
  return { ...SJC_PLACE, city, lat, lng, ...extra }
}

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
    createdAt: `2026-09-${String(seq % 28 + 1).padStart(2, '0')}T12:00:00+00:00`,
    doneOn: null,
    doneWith: null,
    doneSoloBy: null,
    ...partial,
  }
}

function media(partial: Partial<ListItem> = {}): ListItem {
  return item({ category: 'filme', place: null, platform: 'MUBI', ...partial })
}

function done(partial: Partial<ListItem> = {}): Partial<ListItem> {
  return { status: 'done', doneOn: '2026-09-01', doneWith: 'both', ...partial }
}

describe('validateItem — a fixture compartilhada com o banco (A2)', () => {
  it.each(VALIDATION_CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const result = validateItem(c.draft)
    if (c.failsOn === null) {
      expect(result).toEqual({ ok: true })
    } else {
      expect(result).toMatchObject({ ok: false, field: c.failsOn })
    }
  })

  it('confere o nome depois do trim', () => {
    const draft: ItemDraft = { ...item(), name: `  ${'x'.repeat(80)}  ` }
    expect(validateItem(draft)).toEqual({ ok: true })
  })

  it('recusa temporada fracionária', () => {
    const draft: ItemDraft = { ...media({ category: 'serie' }), seasons: 1.5 }
    expect(validateItem(draft)).toMatchObject({ ok: false, field: 'seasons' })
  })

  it('aceita link com esquema em maiúsculas, como o CHECK com ~*', () => {
    expect(validateItem({ ...item(), link: 'HTTPS://example.com' })).toEqual({ ok: true })
  })
})

describe('rótulos', () => {
  it('CATEGORY_LABELS.many é o mesmo rótulo das Configurações', () => {
    for (const c of LIST_CATEGORIES) expect(CATEGORY_LABELS[c].many).toBe(LIST_CATEGORY_LABEL[c])
  })

  it('ratingLabel', () => {
    expect(ratingLabel(4)).toBe('4 de 5 · Amamos')
    expect(ratingLabel(1)).toBe('1 de 5 · Não foi pra nós')
  })
})

describe('secondaryLine (I10)', () => {
  const japan = at('', 36.57, 139.24, { city: null, state: null, country: 'Japão', countryCode: 'JP' })

  it.each<[string, Partial<ListItem>, string]>([
    ['filme → plataforma', { category: 'filme', place: null, platform: 'MUBI' }, 'MUBI'],
    ['série → plataforma', { category: 'serie', place: null, platform: 'Disney+', seasons: 4 }, 'Disney+'],
    ['país com 3 cidades', { category: 'pais', place: japan, highlights: ['Tóquio', 'Kyoto', 'Osaka'] }, 'Tóquio, Kyoto e Osaka'],
    ['país com 2 cidades', { category: 'pais', place: japan, highlights: ['Tóquio', 'Kyoto'] }, 'Tóquio e Kyoto'],
    ['país com 1 cidade', { category: 'pais', place: japan, highlights: ['Tóquio'] }, 'Tóquio'],
    ['país sem cidades → nome do país', { category: 'pais', place: japan }, 'Japão'],
    ['cidade com região', { category: 'cidade', place: at('Gramado', -29.37, -50.87, { state: 'Rio Grande do Sul' }), region: 'Serra Gaúcha' }, 'Serra Gaúcha'],
    ['cidade sem região → estado, país', { category: 'cidade', place: at('Gramado', -29.37, -50.87, { state: 'Rio Grande do Sul' }) }, 'Rio Grande do Sul, Brasil'],
    ['comida com onde comer', { category: 'comida', place: at('Salvador', -12.97, -38.5), venue: 'Largo de Santana' }, 'Largo de Santana, Salvador'],
    ['comida sem onde comer → cidade', { category: 'comida', place: at('Salvador', -12.97, -38.5) }, 'Salvador'],
    ['restaurante → cidade', { category: 'restaurante', place: at('São Paulo', -23.48, -46.58) }, 'São Paulo'],
    ['parque → cidade', { category: 'parque' }, 'São José dos Campos'],
    ['experiência → cidade', { category: 'experiencia', place: at('Göreme', 38.64, 34.82, { country: 'Turquia', countryCode: 'TR' }) }, 'Göreme'],
  ])('%s', (_name, partial, expected) => {
    expect(secondaryLine(item(partial))).toBe(expected)
  })
})

describe('applyFilters', () => {
  const tokyo = item({ category: 'pais', name: 'Japão', place: { ...SJC_PLACE, city: null, country: 'Japão', countryCode: 'JP' }, highlights: ['Tóquio'] })
  const mocoto = item({ name: 'Mocotó', place: at('São Paulo', -23.48, -46.58), note: 'Pedir o torresmo' })
  const bear = media({ category: 'serie', name: 'The Bear', platform: 'Disney+', ...done({ doneWith: 'both' }) })
  const severance = media({ category: 'serie', name: 'Severance', platform: 'Apple TV+', ...done({ doneWith: 'solo', doneSoloBy: L }) })
  const pastLives = media({ name: 'Past Lives', ...done({ doneWith: 'solo', doneSoloBy: G }) })
  const gramado = item({ category: 'cidade', name: 'Gramado no Natal', region: 'Serra Gaúcha', place: at('Gramado', -29.37, -50.87) })
  const acaraje = item({ category: 'comida', name: 'Acarajé', venue: 'Largo de Santana', place: at('Salvador', -12.97, -38.5) })
  const all = [tokyo, mocoto, bear, severance, pastLives, gramado, acaraje]
  const f = (partial: Partial<ListFilters>): ListFilters => ({ ...EMPTY_FILTERS, ...partial })
  const ids = (items: ListItem[]) => items.map((i) => i.name)

  it('sem filtro devolve tudo, na ordem de entrada', () => {
    expect(applyFilters(all, EMPTY_FILTERS, [])).toEqual(all)
  })

  it('categoria', () => {
    expect(ids(applyFilters(all, f({ category: 'serie' }), []))).toEqual(['The Bear', 'Severance'])
  })

  it('status', () => {
    expect(ids(applyFilters(all, f({ status: 'done' }), []))).toEqual(['The Bear', 'Severance', 'Past Lives'])
    expect(ids(applyFilters(all, f({ status: 'want' }), []))).toEqual(['Japão', 'Mocotó', 'Gramado no Natal', 'Acarajé'])
  })

  it('quem: os dois, e uma pessoa sem incluir os feitos pelos dois', () => {
    expect(ids(applyFilters(all, f({ status: 'done', who: 'both' }), []))).toEqual(['The Bear'])
    expect(ids(applyFilters(all, f({ status: 'done', who: L }), []))).toEqual(['Severance'])
    expect(ids(applyFilters(all, f({ status: 'done', who: G }), []))).toEqual(['Past Lives'])
  })

  it('quem é ignorado fora de "Já fizemos"', () => {
    expect(applyFilters(all, f({ status: 'all', who: L }), [])).toHaveLength(all.length)
    expect(applyFilters(all, f({ status: 'want', who: 'both' }), [])).toHaveLength(4)
  })

  it('categoria × status × quem compõem', () => {
    expect(ids(applyFilters(all, f({ category: 'serie', status: 'done', who: G }), []))).toEqual([])
    expect(ids(applyFilters(all, f({ category: 'filme', status: 'done', who: G }), []))).toEqual(['Past Lives'])
  })

  it.each([
    ['nome sem acento', 'mocoto', ['Mocotó']],
    ['nome em maiúsculas', 'GRAMADO', ['Gramado no Natal']],
    ['nota', 'torresmo', ['Mocotó']],
    ['cidade do lugar', 'sao paulo', ['Mocotó']],
    ['região', 'serra gaucha', ['Gramado no Natal']],
    ['onde comer', 'santana', ['Acarajé']],
    ['cidades de interesse', 'toquio', ['Japão']],
    ['plataforma', 'apple', ['Severance']],
    ['busca com acento acha sem acento', 'Acarajé', ['Acarajé']],
  ])('busca: %s', (_name, query, expected) => {
    expect(ids(applyFilters(all, f({ query }), []))).toEqual(expected)
  })

  it('busca só de espaços é sem busca', () => {
    expect(applyFilters(all, f({ query: '   ' }), [])).toHaveLength(all.length)
  })

  it('a busca compõe com os filtros', () => {
    expect(ids(applyFilters(all, f({ query: 'e', category: 'serie', status: 'done', who: L }), []))).toEqual(['Severance'])
  })

  it('as ocultas somem, inclusive com a categoria selecionada', () => {
    expect(ids(applyFilters(all, EMPTY_FILTERS, ['serie', 'filme']))).toEqual(['Japão', 'Mocotó', 'Gramado no Natal', 'Acarajé'])
    expect(applyFilters(all, f({ category: 'serie' }), ['serie'])).toEqual([])
  })
})

describe('sortItems (R8)', () => {
  const a = item({ id: 'a', name: 'Éclair', category: 'comida', createdAt: '2026-09-10T10:00:00+00:00' })
  const b = item({ id: 'b', name: 'abacaxi', category: 'pais', createdAt: '2026-09-12T10:00:00+00:00' })
  const c = item({ id: 'c', name: 'Banana', category: 'comida', createdAt: '2026-09-12T10:00:00+00:00' })
  const d = item({ id: 'd', name: 'eclair', category: 'serie', createdAt: '2026-09-01T10:00:00+00:00' })
  const input = [a, b, c, d]
  const order = (items: ListItem[]) => items.map((i) => i.id)

  it('recentes: createdAt desc, empate por id', () => {
    expect(order(sortItems(input, 'recent'))).toEqual(['b', 'c', 'a', 'd'])
  })

  it('A–Z sem acento nem maiúscula, empate por recentes', () => {
    expect(order(sortItems(input, 'az'))).toEqual(['b', 'c', 'a', 'd'])
  })

  it('categoria na ordem de LIST_CATEGORIES, depois recentes', () => {
    expect(order(sortItems(input, 'category'))).toEqual(['b', 'c', 'a', 'd'])
  })

  it('não muta a entrada', () => {
    const copy = [...input]
    sortItems(input, 'az')
    expect(input).toEqual(copy)
  })

  it('é igual ao ordenar entradas permutadas (empate estável e determinístico)', () => {
    for (const sort of ['recent', 'az', 'category'] as const) {
      expect(order(sortItems([d, c, b, a], sort))).toEqual(order(sortItems(input, sort)))
    }
  })
})

describe('countByCategory e progress (R3, R22)', () => {
  const items = [
    item({ category: 'restaurante', ...done() }),
    item({ category: 'restaurante' }),
    item({ category: 'parque' }),
    media({ category: 'serie', ...done() }),
    media({ category: 'serie', ...done() }),
    media({ category: 'filme' }),
  ]

  it('conta por categoria visível, na ordem de LIST_CATEGORIES', () => {
    const counts = countByCategory(items, ['parque'])
    expect(counts.map((c) => c.category)).toEqual(LIST_CATEGORIES.filter((c) => c !== 'parque'))
    expect(counts.find((c) => c.category === 'restaurante')?.count).toBe(2)
    expect(counts.find((c) => c.category === 'pais')?.count).toBe(0)
  })

  it('progress sem ocultas', () => {
    const p = progress(items, [])
    expect(p).toMatchObject({ done: 3, total: 6, percent: 50 })
    expect(p.byCategory).toHaveLength(8)
    expect(p.byCategory.find((c) => c.category === 'serie')).toEqual({ category: 'serie', done: 2, total: 2 })
  })

  it('progress ignora as ocultas em tudo', () => {
    const p = progress(items, ['serie'])
    expect(p).toMatchObject({ done: 1, total: 4, percent: 25 })
    expect(p.byCategory.map((c) => c.category)).not.toContain('serie')
  })

  it('percent arredonda para baixo e é 0 sem itens', () => {
    expect(progress([item({ ...done() }), item(), item()], []).percent).toBe(33)
    expect(progress([], [])).toMatchObject({ done: 0, total: 0, percent: 0 })
  })
})

describe('relativeAge', () => {
  it.each([
    ['2026-09-26', 'hoje'],
    ['2026-09-25', '1 dia'],
    ['2026-09-20', '6 dias'],
    ['2026-09-19', '1 sem'],
    ['2026-09-06', '2 sem'],
    ['2026-08-28', '4 sem'],
    ['2026-08-27', '1 mês'],
    ['2026-07-28', '2 meses'],
    ['2025-09-27', '12 meses'],
    ['2025-09-26', '1 ano'],
    ['2023-09-26', '3 anos'],
    ['2026-09-19T23:59:59+00:00', '1 sem'],
    ['2026-09-30', 'hoje'],
  ])('%s → %s', (from, expected) => {
    expect(relativeAge(from, '2026-09-26')).toBe(expected)
  })
})

describe('whereWeAre (I9, A4)', () => {
  const SJC: ListCity = { id: 'city-sjc', name: 'São José dos Campos', lat: -23.18, lng: -45.88 }
  const MARAU: ListCity = { id: 'city-marau', name: 'Marau', lat: -28.45, lng: -52.2 }
  const LISBOA: ListCity = { id: 'city-lisboa', name: 'Lisboa', lat: 38.72, lng: -9.14 }
  const CITIES = new Map([SJC, MARAU, LISBOA].map((c) => [c.id, c]))
  const MEMBERS: Member[] = [
    { profileId: G, homeCityId: SJC.id },
    { profileId: L, homeCityId: MARAU.id },
  ]
  const today = '2026-09-26'
  const stay = (profileId: string, cityId: string, startsOn: string, endsOn: string | null): Stay => ({
    id: `${profileId}-${startsOn}`,
    profileId,
    cityId,
    startsOn,
    endsOn,
  })

  it('juntos em casa, as duas estadias em aberto → until null', () => {
    const stays = [stay(G, SJC.id, '2026-09-01', null), stay(L, SJC.id, '2026-09-20', null)]
    expect(whereWeAre(stays, MEMBERS, CITIES, today)).toEqual({ kind: 'together', city: SJC, until: null })
  })

  it('juntos viajando, com fins diferentes → o menor', () => {
    const stays = [
      stay(G, SJC.id, '2026-08-01', '2026-09-19'),
      stay(G, LISBOA.id, '2026-09-20', '2026-10-05'),
      stay(L, LISBOA.id, '2026-09-22', '2026-10-02'),
    ]
    expect(whereWeAre(stays, MEMBERS, CITIES, today)).toEqual({ kind: 'together', city: LISBOA, until: '2026-10-02' })
  })

  it('uma aberta e uma com fim → o fim', () => {
    const stays = [stay(G, MARAU.id, '2026-09-20', '2026-09-30'), stay(L, MARAU.id, '2026-01-01', null)]
    expect(whereWeAre(stays, MEMBERS, CITIES, today)).toEqual({ kind: 'together', city: MARAU, until: '2026-09-30' })
  })

  it('separados', () => {
    const stays = [stay(G, SJC.id, '2026-09-01', null), stay(L, MARAU.id, '2026-09-01', null)]
    expect(whereWeAre(stays, MEMBERS, CITIES, today)).toEqual({ kind: 'apart' })
  })

  it('unknown com um dos dois sem estadia — nunca "separados" nem "em casa"', () => {
    const stays = [stay(G, SJC.id, '2026-09-01', null), stay(L, MARAU.id, '2026-09-01', '2026-09-25')]
    expect(whereWeAre(stays, MEMBERS, CITIES, today)).toEqual({ kind: 'unknown' })
    expect(whereWeAre([], MEMBERS, CITIES, today)).toEqual({ kind: 'unknown' })
  })

  it('unknown quando a cidade não está no mapa', () => {
    const stays = [stay(G, 'city-x', '2026-09-01', null), stay(L, 'city-x', '2026-09-01', null)]
    expect(whereWeAre(stays, MEMBERS, CITIES, today)).toEqual({ kind: 'unknown' })
  })

  it('unknown sem dois integrantes', () => {
    expect(whereWeAre([stay(G, SJC.id, '2026-09-01', null)], MEMBERS.slice(0, 1), CITIES, today)).toEqual({ kind: 'unknown' })
  })
})

describe('nearby, suggestionPool e pickSuggestion (R23, R24)', () => {
  const SJC = { id: 'city-sjc', name: 'São José dos Campos', lat: -23.18, lng: -45.88 }
  const vicentina = item({ category: 'parque', name: 'Parque Vicentina Aranha', place: at('São José dos Campos', -23.1937, -45.887) })
  const jacarei = item({ name: 'Restaurante em Jacareí', place: at('Jacareí', -23.305, -45.966) })
  const cacapava = item({ category: 'comida', name: 'Pastel em Caçapava', place: at('Caçapava', -23.1, -45.707) })
  const taubate = item({ name: 'Restaurante em Taubaté', place: at('Taubaté', -23.026, -45.556) })
  const campos = item({ category: 'cidade', name: 'Campos do Jordão', place: at('Campos do Jordão', -22.739, -45.591) })
  const feitoPerto = item({ name: 'Já fomos', place: at('São José dos Campos', -23.2, -45.9), ...done() })
  const filme = media({ name: 'Past Lives' })
  const serie = media({ category: 'serie', name: 'The Bear', platform: 'Disney+' })
  const serieFeita = media({ category: 'serie', name: 'Severance', ...done() })
  const all = [taubate, campos, cacapava, jacarei, vicentina, feitoPerto, filme, serie, serieFeita]

  it('nearby ordena por distância e corta em 30 km, só geográficos não feitos', () => {
    const result = nearby(all, SJC)
    expect(result.map((r) => r.item.name)).toEqual(['Parque Vicentina Aranha', 'Restaurante em Jacareí', 'Pastel em Caçapava'])
    expect(result.every((r) => r.km <= NEARBY_RADIUS_KM)).toBe(true)
    expect(result.map((r) => r.km)).toEqual([...result.map((r) => r.km)].sort((a, b) => a - b))
  })

  it('nearby com raio maior inclui Taubaté (~37 km) e não Campos do Jordão (~57 km)', () => {
    expect(nearby(all, SJC, 45).map((r) => r.item.name)).toContain('Restaurante em Taubaté')
    expect(nearby(all, SJC, 45).map((r) => r.item.name)).not.toContain('Campos do Jordão')
  })

  it('juntos → geográficos não feitos perto da cidade', () => {
    const pool = suggestionPool(all, { kind: 'together', city: SJC, until: null }, [])
    expect(pool.map((i) => i.name)).toEqual(['Parque Vicentina Aranha', 'Restaurante em Jacareí', 'Pastel em Caçapava'])
  })

  it('juntos respeita as ocultas', () => {
    const pool = suggestionPool(all, { kind: 'together', city: SJC, until: null }, ['parque'])
    expect(pool.map((i) => i.name)).not.toContain('Parque Vicentina Aranha')
  })

  it('separados → filme e série não feitos', () => {
    expect(suggestionPool(all, { kind: 'apart' }, []).map((i) => i.name)).toEqual(['Past Lives', 'The Bear'])
    expect(suggestionPool(all, { kind: 'apart' }, ['filme']).map((i) => i.name)).toEqual(['The Bear'])
  })

  it('unknown → qualquer não feito, sem as ocultas', () => {
    const pool = suggestionPool(all, { kind: 'unknown' }, ['cidade'])
    expect(pool).toHaveLength(6)
    expect(pool.every((i) => i.status === 'want' && i.category !== 'cidade')).toBe(true)
  })

  it('pickSuggestion é determinístico com o random injetado', () => {
    const pool = [vicentina, jacarei, cacapava]
    expect(pickSuggestion(pool, null, () => 0)).toBe(vicentina)
    expect(pickSuggestion(pool, null, () => 0.5)).toBe(jacarei)
    expect(pickSuggestion(pool, null, () => 0.9999)).toBe(cacapava)
  })

  it('pickSuggestion não repete a atual quando há alternativa', () => {
    const pool = [vicentina, jacarei]
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(pickSuggestion(pool, vicentina.id, () => r)).toBe(jacarei)
    }
  })

  it('pickSuggestion repete quando é a única, e é null com conjunto vazio', () => {
    expect(pickSuggestion([vicentina], vicentina.id, () => 0.5)).toBe(vicentina)
    expect(pickSuggestion([], null, () => 0.5)).toBeNull()
  })
})

describe('emptyStateCopy (R9)', () => {
  const names = { byId: { [G]: 'Gabriel', [L]: 'Lana' } }
  const f = (partial: Partial<ListFilters>): ListFilters => ({ ...EMPTY_FILTERS, ...partial })

  it('o texto do frame: série + já feitas + pessoa', () => {
    expect(emptyStateCopy(f({ category: 'serie', status: 'done', who: G }), names)).toEqual({
      title: 'Nenhuma série por aqui ainda',
      body: 'Gabriel ainda não marcou nenhuma série como vista. Que tal escolher a próxima pra maratonar juntos?',
    })
  })

  it('título concorda com o gênero da categoria', () => {
    expect(emptyStateCopy(f({ category: 'filme' }), names).title).toBe('Nenhum filme por aqui ainda')
    expect(emptyStateCopy(f({ category: 'experiencia' }), names).title).toBe('Nenhuma experiência por aqui ainda')
    expect(emptyStateCopy(f({ category: 'pais' }), names).title).toBe('Nenhum país por aqui ainda')
  })

  it('sem categoria → "Nada por aqui ainda" e o fallback', () => {
    expect(emptyStateCopy(f({ status: 'done' }), names)).toEqual({ title: 'Nada por aqui ainda', body: EMPTY_STATE_FALLBACK })
  })

  it('status "todos" e busca ativa caem no fallback', () => {
    expect(emptyStateCopy(f({ category: 'parque' }), names).body).toBe(EMPTY_STATE_FALLBACK)
    expect(emptyStateCopy(f({ category: 'serie', status: 'done', query: 'bear' }), names).body).toBe(EMPTY_STATE_FALLBACK)
  })

  it('pessoa desconhecida cai no fallback em vez de mostrar um id', () => {
    expect(emptyStateCopy(f({ category: 'serie', status: 'done', who: 'profile-x' }), names).body).toBe(EMPTY_STATE_FALLBACK)
  })

  it.each<[Partial<ListFilters>, string]>([
    [{ category: 'filme', status: 'want' }, 'Nenhum filme na fila. Adicione um pra próxima noite juntos.'],
    [{ category: 'serie', status: 'want' }, 'Nenhuma série na fila. Adicione uma pra próxima noite juntos.'],
    [{ category: 'restaurante', status: 'want' }, 'Nenhum restaurante na fila. Adicione um restaurante que vocês querem conhecer.'],
    [{ category: 'filme', status: 'done' }, 'Vocês ainda não marcaram nenhum filme como visto. Quando assistirem, marquem aqui.'],
    [{ category: 'cidade', status: 'done' }, 'Vocês ainda não marcaram nenhuma cidade como feita. Quando acontecer, marquem aqui.'],
    [{ category: 'serie', status: 'done', who: 'both' }, 'Nenhuma série vista pelos dois ainda. Que tal escolher a próxima pra verem juntos?'],
    [{ category: 'parque', status: 'done', who: 'both' }, 'Nenhum parque feito pelos dois ainda. Que tal escolher o próximo?'],
    [{ category: 'filme', status: 'done', who: L }, 'Lana ainda não marcou nenhum filme como visto. Que tal escolher o próximo pra assistirem juntos?'],
    [{ category: 'comida', status: 'done', who: L }, 'Nenhuma comida feita só por Lana ainda. Os melhores ficam pra fazer juntos.'],
  ])('tabela: %o', (partial, body) => {
    expect(emptyStateCopy(f(partial), names).body).toBe(body)
  })
})

describe('formatDistance', () => {
  it.each([
    [0.05, 'menos de 100 m'],
    [1.23, '1,2 km'],
    [9.94, '9,9 km'],
    [10.4, '10 km'],
    [861.2, '861 km'],
    [1234.6, '1.235 km'],
  ])('%s km → %s', (km, label) => {
    expect(formatDistance(km)).toBe(label)
  })
})

