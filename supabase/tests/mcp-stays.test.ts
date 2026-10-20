// Período, visita e viagem pelo MCP (`stayTools.ts`): as partes puras e a
// volta da prévia, sem rede. O que a pintura grava de verdade está em
// `mcp.test.ts`, contra o projeto online.

import { describe, expect, it, vi } from 'vitest'
import type { Couple, Ctx } from '../functions/mcp/context'
import {
  cityRowLabel,
  decodeWorldRef,
  encodeWorldRef,
  featureToWorldCity,
  peopleOf,
  recordPeriod,
  replacedStays,
} from '../functions/mcp/stayTools'
import type { WorldCity } from '../functions/mcp/stayTools'

const LISBOA: WorldCity = { osmRef: 'R5400890', name: 'Lisboa', region: 'Lisboa', countryCode: 'PT', lat: 38.7077, lng: -9.1365 }

describe('city_ref de cidade de fora', () => {
  it('ida e volta', () => {
    const ref = encodeWorldRef(LISBOA)
    expect(ref.startsWith('world:')).toBe(true)
    expect(decodeWorldRef(ref)).toEqual(LISBOA)
  })

  it('aceita acento e caractere de fora do latim', () => {
    const city = { ...LISBOA, name: 'São Tomé 東京', region: 'Ilha' }
    expect(decodeWorldRef(encodeWorldRef(city))).toEqual(city)
  })

  it('recusa o que o agente pode ter mexido', () => {
    expect(decodeWorldRef('world:nao-e-base64')).toBeNull()
    expect(decodeWorldRef('city:abc')).toBeNull()
    expect(decodeWorldRef(encodeWorldRef({ ...LISBOA, osmRef: 'X1' }))).toBeNull()
    // Cidade do Brasil é sempre a do IBGE (I2).
    expect(decodeWorldRef(encodeWorldRef({ ...LISBOA, countryCode: 'BR' }))).toBeNull()
    expect(decodeWorldRef(encodeWorldRef({ ...LISBOA, lat: 120 }))).toBeNull()
    expect(decodeWorldRef(encodeWorldRef({ ...LISBOA, name: ' ' }))).toBeNull()
  })
})

describe('featureToWorldCity', () => {
  const feature = (props: Record<string, unknown>) => ({
    geometry: { type: 'Point', coordinates: [-9.1365, 38.7077] },
    properties: { name: 'Lisboa', type: 'city', state: 'Lisboa', countrycode: 'PT', country: 'Portugal', osm_type: 'R', osm_id: 5400890, ...props },
  })

  it('cidade de fora com osm_ref', () => {
    expect(featureToWorldCity(feature({}))).toEqual(LISBOA)
  })

  it('o Brasil fica de fora e sem osm_ref não serve', () => {
    expect(featureToWorldCity(feature({ countrycode: 'BR' }))).toBeNull()
    expect(featureToWorldCity(feature({ osm_type: undefined }))).toBeNull()
    expect(featureToWorldCity(feature({ osm_id: -1 }))).toBeNull()
  })
})

describe('cityRowLabel', () => {
  it('Brasil com UF, fora com o país em português', () => {
    expect(cityRowLabel({ name: 'Marau', state_code: 'RS', country_code: 'BR' })).toBe('Marau, RS')
    expect(cityRowLabel({ name: 'Lisboa', state_code: null, country_code: 'PT' })).toBe('Lisboa · Portugal')
  })
})

const NAMES = new Map([
  ['p-g', 'Gabriel'],
  ['p-l', 'Lana'],
])
const SJC = { name: 'São José dos Campos', state_code: 'SP', country_code: 'BR' }
const MARAU = { name: 'Marau', state_code: 'RS', country_code: 'BR' }

describe('replacedStays (a prévia)', () => {
  it('corta ao intervalo e mostra só o que muda de cidade', () => {
    const rows = [
      { profile_id: 'p-g', city_id: 'sjc', starts_on: '2026-01-01', ends_on: null, cities: SJC },
      { profile_id: 'p-l', city_id: 'marau', starts_on: '2026-11-12', ends_on: '2026-11-20', cities: MARAU },
    ]
    expect(replacedStays(rows, 'marau', '2026-11-10', '2026-11-15', NAMES)).toEqual([
      { who: 'Gabriel', city: 'São José dos Campos, SP', from: '2026-11-10', to: '2026-11-15' },
    ])
  })

  it('período em aberto mantém o fim de cada estadia', () => {
    const rows = [{ profile_id: 'p-g', city_id: 'sjc', starts_on: '2026-12-01', ends_on: '2026-12-10', cities: SJC }]
    expect(replacedStays(rows, 'marau', '2026-11-01', null, NAMES)).toEqual([
      { who: 'Gabriel', city: 'São José dos Campos, SP', from: '2026-12-01', to: '2026-12-10' },
    ])
  })
})

const member = (profileId: string, name: string, slot: number) => ({ profileId, name, slot, homeCity: null })
const couple = (partner = true): Couple => ({
  coupleId: 'c-1',
  name: null,
  startedOn: '2024-09-17',
  me: member('p-l', 'Lana', 2),
  partner: partner ? member('p-g', 'Gabriel', 1) : null,
  names: NAMES,
})

describe('peopleOf', () => {
  it('me, partner e os dois na ordem dos slots', () => {
    expect(peopleOf(couple(), 'me').map((m) => m.name)).toEqual(['Lana'])
    expect(peopleOf(couple(), 'partner').map((m) => m.name)).toEqual(['Gabriel'])
    expect(peopleOf(couple(), 'both').map((m) => m.name)).toEqual(['Gabriel', 'Lana'])
  })

  it('sem a outra pessoa no espaço, só me', () => {
    expect(() => peopleOf(couple(false), 'both')).toThrow(/ainda não entrou/)
  })
})

describe('record_period recusa antes de tocar o banco', () => {
  // O casal é lido primeiro; depois disso, nada pode chegar ao `rpc`.
  function ctx(): { ctx: Ctx; rpc: ReturnType<typeof vi.fn> } {
    const rpc = vi.fn()
    const rows = { couple_members: [{ couple_id: 'c-1', profile_id: 'u-1', slot: 1 }] }
    const chain = (table: string) => {
      const result = table === 'couple_members' ? { data: rows.couple_members, error: null } : table === 'couples' ? { data: { name: null, started_on: '2024-09-17' }, error: null } : { data: [{ id: 'u-1', display_name: 'Lana', cities: null }], error: null }
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'eq', 'in']) q[m] = () => q
      q.single = () => Promise.resolve(result)
      q.maybeSingle = () => Promise.resolve(result)
      q.then = (resolve: (v: unknown) => unknown) => resolve(result)
      return q
    }
    const db = { from: chain, rpc } as unknown as Ctx['db']
    return { ctx: { db, userId: 'u-1', fetch, today: () => '2026-10-20', keys: {} as Ctx['keys'] }, rpc }
  }

  it('sem `to` e sem open_ended', async () => {
    const { ctx: c, rpc } = ctx()
    await expect(recordPeriod(c, { who: 'me', city_ref: 'city:x', from: '2026-11-01' })).rejects.toThrow(/open_ended/)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('data que não existe e fim antes do começo', async () => {
    const { ctx: c, rpc } = ctx()
    await expect(recordPeriod(c, { who: 'me', city_ref: 'city:x', from: '2026-02-30', to: '2026-03-02' })).rejects.toThrow(/from/)
    await expect(recordPeriod(c, { who: 'me', city_ref: 'city:x', from: '2026-03-10', to: '2026-03-02' })).rejects.toThrow(/antes/)
    expect(rpc).not.toHaveBeenCalled()
  })
})
