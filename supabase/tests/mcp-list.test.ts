// I2 da spec do MCP: o espelho do contrato da Lista na função dá o mesmo
// veredito que o domínio do app, com a mesma tabela de casos. Sem rede:
// `npx vitest run --project db supabase/tests/mcp-list.test.ts`.

import { describe, expect, it } from 'vitest'
import { LIST_LIMITS as APP_LIMITS, validateItem as appValidate } from '../../src/domain/list'
import { LIST_CATEGORIES as APP_CATEGORIES } from '../../src/domain/settings'
import { VALIDATION_CASES } from '../../src/domain/listValidationCases'
import {
  CATEGORY_GUIDE,
  LIST_CATEGORIES,
  LIST_LIMITS,
  findDuplicates,
  normalizeSearch,
  validateItem,
} from '../functions/mcp/list'
import type { ItemDraft, ListItemRow } from '../functions/mcp/list'

describe('paridade com src/domain', () => {
  it('limites e categorias são os mesmos do app', () => {
    expect(LIST_LIMITS).toEqual(APP_LIMITS)
    expect([...LIST_CATEGORIES]).toEqual([...APP_CATEGORIES])
    expect(Object.keys(CATEGORY_GUIDE).sort()).toEqual([...APP_CATEGORIES].sort())
  })

  it.each(VALIDATION_CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const mine = validateItem(c.draft)
    const app = appValidate(c.draft)
    expect(mine).toEqual(app)
    expect(mine.ok ? null : mine.field).toBe(c.failsOn)
  })
})

const base: ItemDraft = {
  category: 'restaurante',
  name: 'Mocotó',
  note: null,
  link: null,
  featured: false,
  place: { address: 'Av. Nossa Senhora do Loreto, 1100', city: 'São Paulo', state: 'SP', country: 'Brasil', countryCode: 'BR', lat: -23.4867, lng: -46.5815 },
  region: null,
  venue: null,
  highlights: [],
  platform: null,
  seasons: null,
}

function row(over: Partial<ListItemRow>): ListItemRow {
  return {
    id: 'r1',
    couple_id: 'c1',
    category: 'restaurante',
    name: 'Outro',
    note: null,
    link: null,
    photo_path: null,
    featured: false,
    status: 'want',
    rating: null,
    added_by: null,
    created_at: '2026-10-01T00:00:00Z',
    done_on: null,
    done_with: null,
    done_solo_by: null,
    address: null,
    city: 'São Paulo',
    state: 'SP',
    country: 'Brasil',
    country_code: 'BR',
    lat: -10,
    lng: -40,
    region: null,
    venue: null,
    highlights: [],
    platform: null,
    seasons: null,
    ...over,
  }
}

describe('findDuplicates (R6)', () => {
  it('nome igual sem acento e caixa é duplicata', () => {
    expect(findDuplicates(base, [row({ name: 'MOCOTO' })])).toHaveLength(1)
  })

  it('um nome contendo o outro (≥ 4 letras) é duplicata', () => {
    expect(findDuplicates(base, [row({ name: 'Restaurante Mocotó' })])).toHaveLength(1)
    expect(findDuplicates({ ...base, name: 'Bar' }, [row({ name: 'Bar do Zé' })])).toHaveLength(0)
  })

  it('outro nome a menos de 150 m na mesma categoria é duplicata; a 1 km não', () => {
    expect(findDuplicates(base, [row({ name: 'Mocotó Café', lat: -23.4868, lng: -46.5816 })])).toHaveLength(1)
    expect(findDuplicates(base, [row({ name: 'Padaria', lat: -23.4867, lng: -46.5816 })])).toHaveLength(1)
    expect(findDuplicates(base, [row({ name: 'Padaria', lat: -23.4957, lng: -46.5815 })])).toHaveLength(0)
  })

  it('outra categoria nunca é duplicata', () => {
    expect(findDuplicates(base, [row({ name: 'Mocotó', category: 'comida' })])).toHaveLength(0)
  })

  it('comida no mesmo ponto (a cidade) só conta pelo nome', () => {
    const coxinha: ItemDraft = { ...base, category: 'comida', name: 'Coxinha', place: { ...base.place!, address: null } }
    expect(findDuplicates(coxinha, [row({ category: 'comida', name: 'Pastel', lat: base.place!.lat, lng: base.place!.lng })])).toHaveLength(0)
  })
})

it('normalizeSearch tira acento e caixa', () => {
  expect(normalizeSearch('  São JOSÉ ')).toBe('sao jose')
})
