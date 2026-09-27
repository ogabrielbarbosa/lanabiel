// A12 — cidades do mundo: a busca descarta o Brasil (I2) e `ensureWorldCity`
// termina no MESMO `id` quando a cidade já existe (ADR 0017). `fetch` e `db`
// simulados; o que o banco REALMENTE responde (o `on conflict`, a RLS) está em
// supabase/tests/calendar.test.ts.
// Spec: .agent/Tasks/fase-5-calendario.md, R17, seção 5 e A12

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorldCityCandidate } from '../calendar/api'
import type { Database } from '../lib/database.types'
import gramadoCity from './__fixtures__/photon/gramado-city.json'
import { ensureWorldCity, searchWorldCities } from './worldCities'

function respond(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }))
}

describe('A12 — searchWorldCities', () => {
  it('Gramado: os três resultados do Brasil saem; Granada e Gramat ficam, com país em português e região', async () => {
    const result = await searchWorldCities('Gramado', { fetchFn: respond(gramadoCity) })
    expect(result).toEqual({
      status: 'ok',
      rows: [
        {
          osmRef: 'R344685',
          name: 'Granada',
          region: 'Andalucía',
          countryCode: 'ES',
          country: 'Espanha',
          lat: expect.any(Number),
          lng: expect.any(Number),
        },
        {
          osmRef: 'R123059',
          name: 'Gramat',
          region: 'Occitanie',
          countryCode: 'FR',
          country: 'França',
          lat: expect.any(Number),
          lng: expect.any(Number),
        },
      ],
    })
  })

  it('pede a camada de cidade do Photon', async () => {
    const fetchFn = respond(gramadoCity)
    await searchWorldCities('Gramado', { fetchFn })
    expect(new URL(String(fetchFn.mock.calls[0][0])).searchParams.get('layer')).toBe('city')
  })

  it('resultado estrangeiro sem `osm_type` é descartado: sem a chave, a linha não pode ser gravada', async () => {
    const features = gramadoCity.features.map((f) =>
      f.properties.name === 'Granada' ? { ...f, properties: { ...f.properties, osm_type: undefined } } : f,
    )
    const result = await searchWorldCities('Gramado', { fetchFn: respond({ ...gramadoCity, features }) })
    expect(result.status === 'ok' && result.rows.map((r) => r.name)).toEqual(['Gramat'])
  })

  it('Photon fora → `error` (sem fallback do IBGE: o seletor já o busca em paralelo)', async () => {
    const result = await searchWorldCities('Gramado', { fetchFn: respond({}, 503) })
    expect(result).toEqual({ status: 'error', cause: 'Photon respondeu 503' })
  })

  it('cancelada por uma busca mais nova → `aborted`', async () => {
    const controller = new AbortController()
    controller.abort()
    expect(await searchWorldCities('Gramado', { fetchFn: respond(gramadoCity), signal: controller.signal })).toEqual({
      status: 'aborted',
    })
  })
})

// ---------------------------------------------------------------------------
// ensureWorldCity
// ---------------------------------------------------------------------------

type Response = { data: unknown; error: { code?: string; message: string; hint?: string | null } | null }

const LISBOA: WorldCityCandidate = {
  osmRef: 'R5400890',
  name: 'Lisboa',
  region: 'Lisboa',
  countryCode: 'PT',
  country: 'Portugal',
  lat: 38.7077507,
  lng: -9.1365919,
}

const LISBOA_ROW = {
  id: 'city-lisboa',
  name: 'Lisboa',
  state_code: null,
  country_code: 'PT',
  region: 'Lisboa',
  lat: 38.7077507,
  lng: -9.1365919,
}

function fakeDb(options: { session?: boolean; upsert?: Response; select?: Response } = {}) {
  const calls: { op: string; args: unknown[] }[] = []
  function from(table: string) {
    let op = 'select'
    const builder = {
      upsert: (...args: unknown[]) => ((op = 'upsert'), calls.push({ op: `${table}.upsert`, args }), builder),
      select: (...args: unknown[]) => (calls.push({ op: `${table}.select`, args }), builder),
      eq: (...args: unknown[]) => (calls.push({ op: `${table}.eq`, args }), builder),
      limit: () => builder,
      then(resolve: (r: Response) => unknown, reject: (e: unknown) => unknown) {
        const value = op === 'upsert' ? options.upsert : options.select
        return Promise.resolve(value ?? { data: null, error: null }).then(resolve, reject)
      },
    }
    return builder
  }
  const db = {
    auth: {
      getSession: async () => ({ data: { session: options.session === false ? null : { user: { id: 'u-gabriel' } } } }),
    },
    from,
  }
  return { db: db as unknown as SupabaseClient<Database>, calls }
}

describe('A12 — ensureWorldCity', () => {
  it('insert com `on conflict do nothing` pela chave do casal, e o `id` lido pela `osm_ref`', async () => {
    const { db, calls } = fakeDb({ select: { data: [LISBOA_ROW], error: null } })
    const result = await ensureWorldCity(db, 'couple-1', LISBOA)
    expect(result).toEqual({
      status: 'ok',
      value: {
        id: 'city-lisboa',
        name: 'Lisboa',
        stateCode: null,
        countryCode: 'PT',
        region: 'Lisboa',
        lat: 38.7077507,
        lng: -9.1365919,
      },
    })
    const upsert = calls.find((c) => c.op === 'cities.upsert')
    expect(upsert?.args).toEqual([
      {
        couple_id: 'couple-1',
        osm_ref: 'R5400890',
        name: 'Lisboa',
        region: 'Lisboa',
        country_code: 'PT',
        state_code: null,
        ibge_code: null,
        lat: 38.7077507,
        lng: -9.1365919,
      },
      { onConflict: 'couple_id,osm_ref', ignoreDuplicates: true },
    ])
    // A leitura é por identidade (`osm_ref`), nunca por `couple_id`: quem corta é a policy.
    const filters = calls.filter((c) => c.op === 'cities.eq').map((c) => c.args[0])
    expect(filters).toEqual(['osm_ref'])
  })

  it('conflito (a outra pessoa gravou Lisboa antes): o insert não devolve nada, e sai o `id` existente', async () => {
    // `ignoreDuplicates` = `on conflict do nothing`: sem erro e sem linha.
    const { db } = fakeDb({
      upsert: { data: null, error: null },
      select: { data: [{ ...LISBOA_ROW, id: 'city-lisboa-da-lana' }], error: null },
    })
    const result = await ensureWorldCity(db, 'couple-1', LISBOA)
    expect(result.status === 'ok' && result.value.id).toBe('city-lisboa-da-lana')
  })

  it('região maior que o CHECK `cities_region` (80) é cortada, não recusada', async () => {
    const { db, calls } = fakeDb({ select: { data: [LISBOA_ROW], error: null } })
    await ensureWorldCity(db, 'couple-1', { ...LISBOA, region: 'x'.repeat(120) })
    const upsert = calls.find((c) => c.op === 'cities.upsert')
    if (!upsert) throw new Error('upsert não foi chamado')
    expect((upsert.args[0] as { region: string }).region).toHaveLength(80)
  })

  it('CHECK recusou (`cities_scope`) → `invalid` com o nome', async () => {
    const { db } = fakeDb({
      upsert: {
        data: null,
        error: { code: '23514', message: 'new row for relation "cities" violates check constraint "cities_scope"' },
      },
    })
    expect(await ensureWorldCity(db, 'couple-1', LISBOA)).toEqual({ status: 'invalid', constraint: 'cities_scope' })
  })

  it('policy recusou o insert (saiu do casal) → `not_member`', async () => {
    const { db } = fakeDb({
      upsert: { data: null, error: { code: '42501', message: 'new row violates row-level security policy for table "cities"' } },
    })
    expect(await ensureWorldCity(db, 'couple-1', LISBOA)).toEqual({ status: 'not_member' })
  })

  it('insert passou e a linha não aparece na leitura → `not_member`, nunca `ok` sem `id`', async () => {
    const { db } = fakeDb({ select: { data: [], error: null } })
    expect(await ensureWorldCity(db, 'couple-1', LISBOA)).toEqual({ status: 'not_member' })
  })

  it('sem sessão → `unauthenticated`, sem tocar no banco', async () => {
    const { db, calls } = fakeDb({ session: false })
    expect(await ensureWorldCity(db, 'couple-1', LISBOA)).toEqual({ status: 'unauthenticated' })
    expect(calls).toEqual([])
  })

  it('leitura falhou → `error` com a causa', async () => {
    const { db } = fakeDb({ select: { data: null, error: { message: 'fetch failed' } } })
    expect(await ensureWorldCity(db, 'couple-1', LISBOA)).toEqual({ status: 'error', cause: 'fetch failed' })
  })
})
