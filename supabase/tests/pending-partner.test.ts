// Critérios A1–A9 — .agent/Tasks/perfil-provisorio.md, seção 10.
// O perfil provisório da outra pessoa e a herança dele no aceite do convite.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { admin, CITY, rpc, sql, userFactory } from './harness'
import type { SignedUser } from './harness'
import { loadAccountStage } from '../../src/data/account'
import { draftToInsert } from '../../src/data/listRow'
import type { ItemDraft } from '../../src/domain/list'

const users = userFactory('pend')

beforeAll(() => users.sweep(), 120_000)
afterAll(async () => {
  // Provisório não tem conta: não sai com o sweep dos usuários.
  await admin.from('profiles').delete().is('user_id', null).like('display_name', 'pend-%')
  await users.cleanup()
}, 120_000)

const LILAC = '#C3B3F2'
const MOVIE: ItemDraft = {
  category: 'filme',
  name: 'Past Lives',
  note: null,
  link: null,
  featured: false,
  place: null,
  region: null,
  venue: null,
  highlights: [],
  platform: 'MUBI',
  seasons: null,
}

async function soloCouple(tag: string): Promise<{ a: SignedUser; coupleId: string }> {
  const a = await users.newUser(`${tag}-a`)
  const couple = await rpc(a.db, 'create_couple', { p_started_on: '2024-09-17', p_name: `Casal ${tag}` })
  return { a, coupleId: couple.couple_id as string }
}

async function withPending(tag: string) {
  const solo = await soloCouple(tag)
  const saved = await rpc(solo.a.db, 'save_pending_partner', {
    p_display_name: `pend-${tag}`,
    p_home_city_id: CITY.marau,
    p_color: LILAC,
  })
  expect(saved.status).toBe('created')
  return { ...solo, pending: saved.profile_id as string }
}

/** Quantas linhas, em cada FK de coluna única para profiles, apontam para `id`. */
function referencesTo(id: string): number {
  const out = sql(`
    select coalesce(sum((xpath('/row/n/text()', query_to_xml(
             format('select count(*) as n from %s where %I = %L', c.conrelid::regclass, a.attname, '${id}'),
             false, true, '')))[1]::text::int), 0) as total
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.profiles'::regclass and array_length(c.conkey, 1) = 1`)
  return Number(out)
}

describe('A1 — criar o provisório', () => {
  it('dois integrantes, o novo sem conta, e o estágio de quem criou vira ready', async () => {
    const { a, coupleId, pending } = await withPending('cria')

    const { data: members } = await a.db.from('couple_members').select('profile_id, slot').order('slot')
    expect(members).toEqual([
      { profile_id: a.id, slot: 1 },
      { profile_id: pending, slot: 2 },
    ])
    const { data: profile } = await a.db.from('profiles').select('user_id, display_name, color').eq('id', pending).single()
    expect(profile).toEqual({ user_id: null, display_name: 'pend-cria', color: LILAC })

    const stage = await loadAccountStage(a.db)
    expect(stage.status === 'ok' && stage.rows.stage).toBe('ready')
    expect(coupleId).toBeTruthy()
  })

  it('salvar de novo edita o mesmo provisório', async () => {
    const { a, pending } = await withPending('edita')
    const again = await rpc(a.db, 'save_pending_partner', {
      p_display_name: 'pend-edita-2',
      p_home_city_id: CITY.londrina,
      p_color: '#9CCBF2',
    })
    expect(again).toEqual({ status: 'updated', profile_id: pending })
    const { data } = await a.db.from('profiles').select('display_name, home_city_id, color').eq('id', pending).single()
    expect(data).toEqual({ display_name: 'pend-edita-2', home_city_id: CITY.londrina, color: '#9CCBF2' })
  })
})

describe('A2–A4 — escrever com o provisório e herdar no aceite', () => {
  it('estadias, viagem, beijo, item e memória passam para quem aceita; nada aponta para o provisório', async () => {
    const { a, coupleId, pending } = await withPending('herda')

    // A2: tudo aceito com o provisório como integrante.
    const painted = await a.db.rpc('paint_stays', {
      p_entries: [{ profile_id: pending, city_id: CITY.marau, from: '2026-01-01', to: '2026-01-31' }],
    })
    expect(painted.error).toBeNull()
    const trip = await a.db.rpc('create_trip', {
      p_trip: {
        title: 'Londrina, PR',
        city_id: CITY.londrina,
        starts_on: '2027-03-05',
        ends_on: '2027-03-09',
        note: null,
        lodging_name: null,
        departures: [
          { profile_id: a.id, origin_code: null, note: null },
          { profile_id: pending, origin_code: 'POA', note: null },
        ],
      },
    })
    expect(trip.error).toBeNull()
    const kiss = await admin.from('day_kisses').insert({ couple_id: coupleId, day: '2026-01-10', added_by: pending })
    expect(kiss.error).toBeNull()
    const { data: item, error: itemError } = await a.db
      .from('list_items')
      .insert(draftToInsert(MOVIE, coupleId))
      .select('id')
      .single()
    expect(itemError).toBeNull()
    const solo = await admin.from('list_items').update({ added_by: pending }).eq('id', item!.id)
    expect(solo.error).toBeNull()
    const memory = await admin
      .from('list_memories')
      .insert({ item_id: item!.id, couple_id: coupleId, profile_id: pending, body: 'do provisório' })
    expect(memory.error).toBeNull()

    const before = referencesTo(pending)
    expect(before).toBeGreaterThan(5)

    // A3: a convidada tem conta, perfil e a mesma cor de quem criou.
    const invite = await rpc(a.db, 'create_invite', { p_email: 'lana@exemplo.com' })
    const b = await users.newUser('herda-b', CITY.londrina)
    const { data: aColor } = await a.db.from('profiles').select('color').eq('id', a.id).single()
    await b.db.from('profiles').update({ color: aColor!.color, display_name: 'Lana' }).eq('id', b.id)

    expect((await rpc(b.db, 'lookup_invite', { p_code: invite.code })).status).toBe('valid')
    expect((await rpc(b.db, 'accept_invite', { p_code: invite.code })).status).toBe('joined')

    expect(referencesTo(pending)).toBe(0)
    const { data: gone } = await admin.from('profiles').select('id').eq('id', pending)
    expect(gone).toEqual([])

    const { data: members } = await b.db.from('couple_members').select('profile_id, slot').order('slot')
    expect(members).toEqual([
      { profile_id: a.id, slot: 1 },
      { profile_id: b.id, slot: 2 },
    ])
    const { data: stays } = await b.db.from('stays').select('city_id, starts_on').eq('profile_id', b.id).order('starts_on')
    expect(stays!.map((s) => s.starts_on)).toContain('2026-01-01')
    const { data: departures } = await b.db.from('trip_departures').select('origin_code').eq('profile_id', b.id)
    expect(departures).toEqual([{ origin_code: 'POA' }])
    const { data: memories } = await b.db.from('list_memories').select('body').eq('profile_id', b.id)
    expect(memories).toEqual([{ body: 'do provisório' }])

    // A4: o perfil é o dela; a cor repetida vira a outra padrão.
    const { data: profile } = await b.db
      .from('profiles')
      .select('display_name, home_city_id, color, user_id')
      .eq('id', b.id)
      .single()
    expect(profile!.display_name).toBe('Lana')
    expect(profile!.home_city_id).toBe(CITY.londrina)
    expect(profile!.user_id).toBe(b.id)
    expect(profile!.color).not.toBe(aColor!.color)
  })
})

describe('A5 — save_pending_partner recusa', () => {
  it('sem casal, casal cheio, nome, cidade de casal e cor', async () => {
    const lone = await users.newUser('recusa-sem')
    const args = { p_display_name: 'pend-x', p_home_city_id: CITY.marau, p_color: LILAC }
    expect(await rpc(lone.db, 'save_pending_partner', args)).toEqual({ status: 'not_member' })

    const { a } = await soloCouple('recusa')
    const invalid = async (patch: Record<string, unknown>) =>
      rpc(a.db, 'save_pending_partner', { ...args, ...patch })
    expect(await invalid({ p_display_name: '  ' })).toEqual({ status: 'invalid', field: 'display_name' })
    expect(await invalid({ p_display_name: 'x'.repeat(31) })).toEqual({ status: 'invalid', field: 'display_name' })
    expect(await invalid({ p_home_city_id: crypto.randomUUID() })).toEqual({ status: 'invalid', field: 'home_city' })
    expect(await invalid({ p_color: '#000000' })).toEqual({ status: 'invalid', field: 'color' })
    const { data: mine } = await a.db.from('profiles').select('color').eq('id', a.id).single()
    expect(await invalid({ p_color: mine!.color })).toEqual({ status: 'invalid', field: 'color' })

    const invite = await rpc(a.db, 'create_invite', { p_email: 'b@exemplo.com' })
    const b = await users.newUser('recusa-b', CITY.marau)
    await rpc(b.db, 'accept_invite', { p_code: invite.code })
    expect(await rpc(a.db, 'save_pending_partner', args)).toEqual({ status: 'couple_full' })
  })

  it('cidade estrangeira do casal não serve de cidade-casa', async () => {
    const { a, coupleId } = await soloCouple('recusa-cidade')
    const { data: city } = await admin
      .from('cities')
      .insert({ name: 'Porto', country_code: 'PT', lat: 41.1, lng: -8.6, couple_id: coupleId, osm_ref: `R${Date.now()}` })
      .select('id')
      .single()
    const res = await rpc(a.db, 'save_pending_partner', {
      p_display_name: 'pend-y',
      p_home_city_id: city!.id,
      p_color: LILAC,
    })
    expect(res).toEqual({ status: 'invalid', field: 'home_city' })
  })
})

describe('A6 — o cliente não fabrica nem converte provisório', () => {
  it('insert com outro id, update de outro perfil e mudança de user_id são recusados', async () => {
    const { a, pending } = await withPending('cliente')
    const fake = await a.db
      .from('profiles')
      .insert({ id: crypto.randomUUID(), display_name: 'x', full_name: 'x', home_city_id: CITY.sjc })
    expect(fake.error).not.toBeNull()

    const other = await a.db.from('profiles').update({ display_name: 'hack' }).eq('id', pending).select()
    expect(other.data ?? []).toEqual([])

    const self = await a.db.from('profiles').update({ user_id: null } as never).eq('id', a.id)
    expect(self.error?.code).toBe('23514')
  })
})

describe('A7 — sair e apagar levam o provisório', () => {
  it('leave_couple com provisório apaga casal e provisório', async () => {
    const { a, coupleId, pending } = await withPending('sai')
    expect(await rpc(a.db, 'leave_couple')).toEqual({ status: 'left', couple_deleted: true })
    expect((await admin.from('couples').select('id').eq('id', coupleId)).data).toEqual([])
    expect((await admin.from('profiles').select('id').eq('id', pending)).data).toEqual([])
  })

  it('delete_couple apaga o provisório', async () => {
    const { a, coupleId, pending } = await withPending('apaga')
    expect(await rpc(a.db, 'delete_couple')).toEqual({ status: 'deleted' })
    expect((await admin.from('couples').select('id').eq('id', coupleId)).data).toEqual([])
    expect((await admin.from('profiles').select('id').eq('id', pending)).data).toEqual([])
  })
})

describe('A8 — o convite continua funcionando com provisório', () => {
  it('create_invite não diz couple_full', async () => {
    const { a } = await withPending('convite')
    expect((await rpc(a.db, 'create_invite', { p_email: 'c@exemplo.com' })).status).toBe('created')
  })
})

describe('A9 — o provisório é do casal dele', () => {
  it('quem é de fora não lê', async () => {
    const { pending } = await withPending('isola')
    const outsider = await users.newUser('isola-fora')
    const { data } = await outsider.db.from('profiles').select('id').eq('id', pending)
    expect(data).toEqual([])
  })
})
