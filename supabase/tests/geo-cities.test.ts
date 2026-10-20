// `geo_cities` (ADR 0029): as cidades do mundo, fora do Brasil, pelo GeoNames.
// Referência só de leitura: qualquer sessão lê, ninguém escreve pelo cliente,
// e sem sessão não se lê nada.
//
// `npm run test:db -- supabase/tests/geo-cities.test.ts`

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, anonClient, userFactory } from './harness'
import type { SignedUser } from './harness'

const users = userFactory('geo')
let user: SignedUser

beforeAll(async () => {
  await users.sweep()
  user = await users.newUser('leitor')
}, 120_000)

afterAll(() => users.cleanup(), 120_000)

describe('geo_cities', () => {
  it('a seed está lá: ~29 mil cidades, nenhuma do Brasil (o Brasil é do IBGE)', async () => {
    const { count, error } = await admin.from('geo_cities').select('*', { count: 'exact', head: true })
    expect(error).toBeNull()
    expect(count).toBeGreaterThan(29_000)
    const br = await admin.from('geo_cities').select('*', { count: 'exact', head: true }).eq('country_code', 'BR')
    expect(br.count).toBe(0)
  })

  it('com sessão: a África do Sul tem cidades, as maiores primeiro, com nome em português', async () => {
    const { data, error } = await user.db
      .from('geo_cities')
      .select('name, region, population')
      .eq('country_code', 'ZA')
      .order('population', { ascending: false })
      .limit(3)
    expect(error).toBeNull()
    expect(data?.map((c) => c.name)).toEqual(['Joanesburgo', 'Cidade do Cabo', 'Durban'])
  })

  it('sem sessão: nada', async () => {
    const { data } = await anonClient().from('geo_cities').select('name').eq('country_code', 'ZA').limit(1)
    expect(data ?? []).toEqual([])
  })

  it('o cliente não escreve: insert, update e delete são recusados ou não tocam linha', async () => {
    const insert = await user.db
      .from('geo_cities')
      .insert({ geoname_id: 1, name: 'Inventada', country_code: 'ZZ', lat: 0, lng: 0 })
    expect(insert.error).not.toBeNull()

    await user.db.from('geo_cities').update({ name: 'Joburg' }).eq('geoname_id', 993800)
    await user.db.from('geo_cities').delete().eq('geoname_id', 993800)
    const { data } = await admin.from('geo_cities').select('name').eq('geoname_id', 993800).single()
    expect(data?.name).toBe('Joanesburgo')
  })
})
