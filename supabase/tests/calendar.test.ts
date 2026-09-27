// Critérios A1, A2 e A3 (lado do banco), A7–A10 — .agent/Tasks/fase-5-calendario.md, seção 10.
// ADRs: .agent/Decisions/0017-cidades-do-mundo-por-casal.md
//       .agent/Decisions/0018-periodo-se-grava-pintando-estadias.md
//
// Contra o projeto online (ADR 0014). Dois casais `@test.local` e as duas
// direções. As cidades estrangeiras criadas aqui morrem com o casal (cascade).

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CALENDAR_LIMITS, EVENT_KINDS } from '../../src/domain/calendar'
import type { EventDraft } from '../../src/domain/calendar'
import { PAINT_CASES } from '../../src/domain/paintCases'
import type { CaseCity, CasePerson, CaseStay } from '../../src/domain/paintCases'
import { CITY as CASE_CITY, EVENT_VALIDATION_CASES, TRAVELER } from '../../src/domain/eventValidationCases'
import { eventDraftToInsert } from '../../src/data/calendarRow'
import { admin, anonClient, buildScenario, CITY, deleteUserAndCouple, signIn, sql } from './harness'
import type { Db, Scenario } from './harness'

// Cliente sem tipo de propósito: estes testes GRAVAM linhas que o tipo gerado
// recusaria (evento sem destino, argumento malformado na RPC) — é o banco, não
// o TypeScript, que tem de recusá-las. E as tabelas novas ainda não estão no
// tipo gerado até o `types:gen` depois do push.
function raw(db: Db): SupabaseClient {
  return db as unknown as SupabaseClient
}

let scene: Scenario
let asGabriel: SupabaseClient
let asLana: SupabaseClient
let asOutsider: SupabaseClient
const root = raw(admin)
let paraty: string

beforeAll(async () => {
  scene = await buildScenario('cal')
  asGabriel = raw(await signIn(scene.gabriel.email))
  asLana = raw(await signIn(scene.lana.email))
  asOutsider = raw(await signIn(scene.outsider.email))
  const { data, error } = await root.from('cities').select('id').eq('name', 'Paraty').eq('state_code', 'RJ').single()
  if (error) throw new Error(`Paraty: ${error.message}`)
  paraty = (data as { id: string }).id
}, 120_000)

// Estadias, eventos, 💋 e cidades estrangeiras caem em cascata com o casal.
afterAll(async () => {
  for (const user of [scene.gabriel, scene.lana, scene.outsider]) await deleteUserAndCouple(user.id)
}, 120_000)

/** O nome da regra: o PostgREST devolve o HINT, não o `constraint` do RAISE. */
function rule(error: PostgrestError | null): string {
  return `${error?.message ?? ''} ${error?.hint ?? ''}`
}

/** As listas de um CHECK, na ordem em que aparecem (como em list.test.ts). */
function checkLists(constraint: string): string[][] {
  const def = sql(`select pg_get_constraintdef(oid) as def from pg_constraint where conname = '${constraint}'`)
  return [...def.matchAll(/ARRAY\[([^\]]+)\]/g)].map((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!))
}

/** Hoje no fuso do casal — o mesmo `today_br()` do banco. */
function todayBr(offsetDays = 0): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d + offsetDays))
  return date.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Pessoas e cidades simbólicas das tabelas de casos → as do cenário.
// ---------------------------------------------------------------------------
function personId(p: CasePerson): string {
  return p === 'g' ? scene.gabriel.id : scene.lana.id
}
function caseCityId(c: CaseCity): string {
  return c === 'sjc' ? CITY.sjc : c === 'marau' ? CITY.marau : paraty
}

interface Entry {
  profile_id: string
  city_id: string
  from: string
  to: string | null
}
function entryOf(s: CaseStay): Entry {
  return { profile_id: personId(s.person), city_id: caseCityId(s.city), from: s.from, to: s.to }
}

function paint(db: SupabaseClient, entries: Entry[]) {
  return db.rpc('paint_stays', { p_entries: entries })
}

/** As estadias do casal A, lidas sem RLS, no formato da tabela de casos. */
async function staysOfA(): Promise<CaseStay[]> {
  const { data, error } = await root
    .from('stays')
    .select('profile_id, city_id, starts_on, ends_on')
    .eq('couple_id', scene.coupleA)
  if (error) throw new Error(`stays: ${error.message}`)
  const people: Record<string, CasePerson> = { [scene.gabriel.id]: 'g', [scene.lana.id]: 'l' }
  const cities: Record<string, CaseCity> = { [CITY.sjc]: 'sjc', [CITY.marau]: 'marau', [paraty]: 'paraty' }
  return sortStays(
    (data as { profile_id: string; city_id: string; starts_on: string; ends_on: string | null }[]).map((r) => ({
      person: people[r.profile_id] ?? (r.profile_id as CasePerson),
      city: cities[r.city_id] ?? (r.city_id as CaseCity),
      from: r.starts_on,
      to: r.ends_on,
    })),
  )
}

function sortStays(stays: readonly CaseStay[]): CaseStay[] {
  return [...stays].sort((a, b) => a.person.localeCompare(b.person) || a.from.localeCompare(b.from))
}

/** Troca as estadias do casal A pelas dadas (sem RLS, sem pintura). */
async function resetStays(stays: readonly CaseStay[]): Promise<void> {
  await root.from('stays').delete().eq('couple_id', scene.coupleA)
  if (stays.length === 0) return
  const { error } = await root.from('stays').insert(
    stays.map((s) => ({
      couple_id: scene.coupleA,
      profile_id: personId(s.person),
      city_id: caseCityId(s.city),
      starts_on: s.from,
      ends_on: s.to,
    })),
  )
  if (error) throw new Error(`resetStays: ${error.message}`)
}

/** Uma cidade estrangeira do casal, criada pelo cliente dado. */
async function worldCity(db: SupabaseClient, coupleId: string, osmRef: string, name = 'Lisboa'): Promise<string> {
  const insert = await db
    .from('cities')
    .insert({ name, country_code: 'PT', region: 'Lisboa', lat: 38.7077, lng: -9.1366, couple_id: coupleId, osm_ref: osmRef })
  if (insert.error) throw new Error(`worldCity: ${insert.error.message}`)
  const { data, error } = await db.from('cities').select('id').eq('osm_ref', osmRef).single()
  if (error) throw new Error(`worldCity id: ${error.message}`)
  return (data as { id: string }).id
}

const date: EventDraft = {
  kind: 'date',
  title: 'Jantar na Casa Amarela',
  startsOn: '2026-09-25',
  endsOn: null,
  allDay: false,
  startsAt: '20:00',
  endsAt: null,
  travelers: null,
  travelerId: null,
  cityId: null,
  place: 'Casa Amarela Bistrô',
  repeatsYearly: false,
  note: null,
  listItemId: null,
}

/** Cria um evento direto na tabela. Lança se o banco recusar. */
async function newEvent(db: SupabaseClient, coupleId: string, draft: EventDraft = date): Promise<string> {
  const { data, error } = await db.from('calendar_events').insert(eventDraftToInsert(draft, coupleId)).select('id').single()
  if (error) throw new Error(`criar evento: ${error.message}`)
  return (data as { id: string }).id
}

/** `ok` se o banco aceitou (e desfaz), ou o SQLSTATE e a regra da recusa. */
async function tryEvent(draft: EventDraft): Promise<{ code: string; rule: string }> {
  const { data, error } = await asGabriel
    .from('calendar_events')
    .insert(eventDraftToInsert(draft, scene.coupleA))
    .select('id')
    .single()
  if (error) return { code: error.code, rule: rule(error) }
  await root.from('calendar_events').delete().eq('id', (data as { id: string }).id)
  return { code: 'ok', rule: '' }
}

describe('A1 — paridade entre src/domain/calendar.ts e o banco', () => {
  it('tipos: os de EVENT_KINDS, na mesma ordem', () => {
    expect(checkLists('calendar_events_kind')).toEqual([[...EVENT_KINDS]])
  })

  // Ler o tamanho de dentro de `pg_get_constraintdef` seria frágil (o
  // Postgres reescreve a expressão). A prova é o banco aceitar no limite e
  // recusar no limite + 1.
  const probes: [string, number, (n: number) => EventDraft][] = [
    ['title', CALENDAR_LIMITS.title, (n) => ({ ...date, title: 'x'.repeat(n) })],
    ['note', CALENDAR_LIMITS.note, (n) => ({ ...date, note: 'x'.repeat(n) })],
    ['place', CALENDAR_LIMITS.place, (n) => ({ ...date, place: 'x'.repeat(n) })],
  ]
  for (const [label, limit, draftOf] of probes) {
    it(`${label}: aceita ${limit}, recusa ${limit + 1}`, async () => {
      expect((await tryEvent(draftOf(limit))).code).toBe('ok')
      const refused = await tryEvent(draftOf(limit + 1))
      expect(refused.code).toBe('23514')
      expect(refused.rule).toContain(`calendar_events_${label}`)
    })
  }

  it(`spanDays: ends_on − starts_on = ${CALENDAR_LIMITS.spanDays - 1} aceita, ${CALENDAR_LIMITS.spanDays} recusa`, async () => {
    const compromisso = (endsOn: string): EventDraft => ({
      ...date,
      kind: 'compromisso',
      startsOn: '2026-01-01',
      endsOn,
    })
    // 2026 não é bissexto: 2027-01-01 é o dia 365 depois de 2026-01-01.
    expect(CALENDAR_LIMITS.spanDays).toBe(366)
    expect((await tryEvent(compromisso('2027-01-01'))).code).toBe('ok')
    expect((await tryEvent(compromisso('2027-01-02'))).code).toBe('23514')
  })

  it(`paintEntries: ${CALENDAR_LIMITS.paintEntries} entradas pintam, ${CALENDAR_LIMITS.paintEntries + 1} → 22023`, async () => {
    await resetStays([])
    const entries = (n: number): Entry[] =>
      Array.from({ length: n }, (_, i) => ({
        profile_id: scene.gabriel.id,
        city_id: i % 2 === 0 ? CITY.sjc : CITY.marau,
        from: `2026-03-${String(i + 1).padStart(2, '0')}`,
        to: `2026-03-${String(i + 1).padStart(2, '0')}`,
      }))
    const over = await paint(asGabriel, entries(CALENDAR_LIMITS.paintEntries + 1))
    expect(over.error?.code).toBe('22023')
    expect(await staysOfA()).toEqual([])

    const atLimit = await paint(asGabriel, entries(CALENDAR_LIMITS.paintEntries))
    expect(atLimit.error).toBeNull()
    expect(await staysOfA()).toHaveLength(CALENDAR_LIMITS.paintEntries)
  })

  it(`kissesPerDay: o trigger conta até ${CALENDAR_LIMITS.kissesPerDay}`, () => {
    // O comportamento está em A10; aqui, que o número do trigger é o do domínio.
    const src = sql(`select prosrc as src from pg_proc where proname = 'day_kisses_guard'`)
    expect(src).toContain(`>= ${CALENDAR_LIMITS.kissesPerDay}`)
  })
})

describe('A2 — os PAINT_CASES, do lado do banco (paint_stays)', () => {
  // A MESMA tabela que roda contra `paintStays` (src/domain/calendar.test.ts).
  // Cada caso começa das estadias `before` do casal A, gravadas sem RLS.
  for (const c of PAINT_CASES) {
    it(c.name, async () => {
      await resetStays(c.before)
      const { data, error } = await paint(asGabriel, c.entries.map(entryOf))
      expect(error).toBeNull()
      expect(data).toEqual({ status: 'ok' })
      expect(await staysOfA()).toEqual(sortStays(c.after))
    })
  }

  it('quem pinta fica como created_by — também no pedaço partido', async () => {
    await resetStays([{ person: 'l', city: 'marau', from: '2026-09-01', to: null }])
    await paint(asGabriel, [entryOf({ person: 'l', city: 'sjc', from: '2026-10-01', to: '2026-10-03' })])
    const { data } = await root.from('stays').select('created_by').eq('couple_id', scene.coupleA).gte('starts_on', '2026-10-01')
    expect((data as { created_by: string }[]).map((r) => r.created_by)).toEqual([scene.gabriel.id, scene.gabriel.id])
  })
})

describe('A2 — paint_stays: sessão, casal e entrada malformada', () => {
  const ok: Entry = { profile_id: '', city_id: CITY.marau, from: '2026-10-01', to: '2026-10-03' }

  it('sem sessão → 42501', async () => {
    const { error } = await paint(raw(anonClient()), [{ ...ok, profile_id: scene.gabriel.id }])
    expect(error?.code).toBe('42501')
  })

  it('malformada → 22023: lista vazia, objeto, sem `to`, fim antes do começo, uuid e data inválidos', async () => {
    await resetStays([{ person: 'g', city: 'sjc', from: '2026-09-01', to: null }])
    const g = scene.gabriel.id
    const bad: unknown[] = [
      [],
      {},
      [{ profile_id: g, city_id: CITY.marau, from: '2026-10-01' }],
      [{ profile_id: g, city_id: CITY.marau, from: '2026-10-05', to: '2026-10-01' }],
      [{ profile_id: 'abc', city_id: CITY.marau, from: '2026-10-01', to: null }],
      [{ profile_id: g, city_id: CITY.marau, from: '2026-02-30', to: null }],
    ]
    for (const entries of bad) {
      const { error } = await asGabriel.rpc('paint_stays', { p_entries: entries })
      expect(error?.code, JSON.stringify(entries)).toBe('22023')
    }
    expect(await staysOfA()).toEqual([{ person: 'g', city: 'sjc', from: '2026-09-01', to: null }])
  })
})

describe('A3 — os EVENT_VALIDATION_CASES, do lado do banco', () => {
  // A MESMA fixture que roda contra `validateEvent` (src/domain/calendar.test.ts),
  // convertida pelo MESMO mapeador que a fronteira de dados usa. Os marcadores
  // viram um integrante do casal e uma cidade do IBGE.
  const swap = (v: string | null) => (v === TRAVELER ? scene.gabriel.id : v === CASE_CITY ? CITY.marau : v)

  for (const c of EVENT_VALIDATION_CASES) {
    const expected = c.failsOn === null ? 'aceita' : `recusa (${c.failsOn})`
    it(`${c.name} → ${expected}`, async () => {
      const draft = { ...c.draft, travelerId: swap(c.draft.travelerId), cityId: swap(c.draft.cityId) }
      const result = await tryEvent(draft)
      if (c.failsOn === null) {
        expect(result.code).toBe('ok')
      } else {
        expect(result.code).toBe('23514')
        expect(result.rule).toMatch(/calendar_events_(format|title|note|place)/)
      }
    })
  }
})

describe('A7 — isolamento por casal: evento, 💋, estadia e cidade estrangeira', () => {
  let eventA: string
  let eventB: string
  let lisboaB: string

  beforeAll(async () => {
    eventA = await newEvent(asGabriel, scene.coupleA)
    eventB = await newEvent(asOutsider, scene.coupleB, { ...date, title: 'Deles' })
    lisboaB = await worldCity(asOutsider, scene.coupleB, 'R5400890')
    await asOutsider.from('day_kisses').insert({ couple_id: scene.coupleB, day: '2026-01-10' })
    await root
      .from('stays')
      .insert({ couple_id: scene.coupleB, profile_id: scene.outsider.id, city_id: CITY.londrina, starts_on: '2026-01-01' })
  })

  it('o Gabriel não lê nada do casal B', async () => {
    const events = await asGabriel.from('calendar_events').select('id')
    const ids = (events.data ?? []).map((r: { id: string }) => r.id)
    expect(ids).toContain(eventA)
    expect(ids).not.toContain(eventB)
    expect((await asGabriel.from('day_kisses').select('id').eq('couple_id', scene.coupleB)).data).toEqual([])
    expect((await asGabriel.from('stays').select('id').eq('couple_id', scene.coupleB)).data).toEqual([])
    expect((await asGabriel.from('cities').select('id').eq('id', lisboaB)).data).toEqual([])
  })

  it('o de fora não lê o evento do casal A', async () => {
    const { data } = await asOutsider.from('calendar_events').select('id').eq('id', eventA)
    expect(data).toEqual([])
  })

  it('o Gabriel não edita nem apaga evento, 💋 ou estadia do B', async () => {
    expect((await asGabriel.from('calendar_events').update({ title: 'hack' }).eq('id', eventB).select()).data).toEqual([])
    expect((await asGabriel.from('calendar_events').delete().eq('id', eventB).select()).data).toEqual([])
    expect((await asGabriel.from('day_kisses').delete().eq('couple_id', scene.coupleB).select()).data).toEqual([])
    expect((await asGabriel.from('stays').delete().eq('couple_id', scene.coupleB).select()).data).toEqual([])
    const kept = await Promise.all([
      root.from('calendar_events').select('title').eq('id', eventB).single(),
      root.from('day_kisses').select('*', { count: 'exact', head: true }).eq('couple_id', scene.coupleB),
      root.from('stays').select('*', { count: 'exact', head: true }).eq('couple_id', scene.coupleB),
    ])
    expect((kept[0].data as { title: string }).title).toBe('Deles')
    expect([kept[1].count, kept[2].count]).toEqual([1, 1])
  })

  it('o Gabriel não cria evento, 💋 nem cidade no casal B', async () => {
    expect((await asGabriel.from('calendar_events').insert(eventDraftToInsert(date, scene.coupleB))).error).not.toBeNull()
    expect((await asGabriel.from('day_kisses').insert({ couple_id: scene.coupleB, day: '2026-01-10' })).error).not.toBeNull()
    const city = await asGabriel
      .from('cities')
      .insert({ name: 'Porto', country_code: 'PT', lat: 41.1, lng: -8.6, couple_id: scene.coupleB, osm_ref: 'R1' })
    expect(city.error).not.toBeNull()
  })

  it('ninguém cria evento nem 💋 em nome da outra pessoa', async () => {
    const event = await asGabriel
      .from('calendar_events')
      .insert({ ...eventDraftToInsert(date, scene.coupleA), created_by: scene.lana.id })
    expect(event.error).not.toBeNull()
    const kiss = await asGabriel.from('day_kisses').insert({ couple_id: scene.coupleA, day: '2026-01-10', added_by: scene.lana.id })
    expect(kiss.error).not.toBeNull()
  })

  it('estadia ou evento com a cidade estrangeira do casal B → recusa', async () => {
    const stay = await asGabriel.from('stays').insert({
      couple_id: scene.coupleA,
      profile_id: scene.gabriel.id,
      city_id: lisboaB,
      starts_on: '2025-01-01',
      ends_on: '2025-01-02',
      created_by: scene.gabriel.id,
    })
    expect(stay.error?.code).toBe('23514')
    expect(rule(stay.error)).toContain('stays_city')

    const event = await asGabriel.from('calendar_events').insert(
      eventDraftToInsert(
        { ...date, kind: 'viagem', place: null, endsOn: '2026-10-05', travelers: 'both', cityId: lisboaB },
        scene.coupleA,
      ),
    )
    expect(event.error?.code).toBe('23514')
    expect(rule(event.error)).toContain('calendar_events_city')
  })

  it('estadia com pessoa ou autor de fora do casal → recusa', async () => {
    const stranger = await asGabriel.from('stays').insert({
      couple_id: scene.coupleA,
      profile_id: scene.outsider.id,
      city_id: CITY.sjc,
      starts_on: '2025-01-01',
      ends_on: '2025-01-02',
    })
    expect(stranger.error?.code).toBe('23514')
    expect(rule(stranger.error)).toContain('stays_member')

    const author = await asGabriel.from('stays').insert({
      couple_id: scene.coupleA,
      profile_id: scene.lana.id,
      city_id: CITY.sjc,
      starts_on: '2025-01-01',
      ends_on: '2025-01-02',
      created_by: scene.outsider.id,
    })
    expect(author.error?.code).toBe('23514')
    expect(rule(author.error)).toContain('stays_member')
  })

  it('evento com viajante de fora do casal → recusa', async () => {
    const { error } = await asGabriel.from('calendar_events').insert(
      eventDraftToInsert(
        { ...date, kind: 'visita', place: null, endsOn: '2026-10-05', travelers: 'solo', travelerId: scene.outsider.id, cityId: CITY.marau },
        scene.coupleA,
      ),
    )
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('calendar_events_member')
  })

  it('paint_stays com perfil de fora → recusa, e NADA muda (nem a entrada válida antes dele)', async () => {
    const before: CaseStay[] = [
      { person: 'g', city: 'sjc', from: '2026-09-01', to: null },
      { person: 'l', city: 'marau', from: '2026-09-01', to: null },
    ]
    await resetStays(before)
    const { error } = await paint(asGabriel, [
      entryOf({ person: 'g', city: 'marau', from: '2026-10-01', to: '2026-10-03' }),
      { profile_id: scene.outsider.id, city_id: CITY.sjc, from: '2026-10-01', to: '2026-10-03' },
    ])
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('stays_member')
    expect(await staysOfA()).toEqual(sortStays(before))
  })

  it('paint_stays com a cidade do casal B → recusa, e nada muda', async () => {
    const before: CaseStay[] = [{ person: 'g', city: 'sjc', from: '2026-09-01', to: null }]
    await resetStays(before)
    const { error } = await paint(asGabriel, [
      { profile_id: scene.gabriel.id, city_id: lisboaB, from: '2026-10-01', to: '2026-10-03' },
    ])
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('stays_city')
    expect(await staysOfA()).toEqual(before)
  })

  it('o de fora chamando paint_stays pinta só no casal dele, nunca no A', async () => {
    await resetStays([{ person: 'g', city: 'sjc', from: '2026-09-01', to: null }])
    const { error } = await paint(asOutsider, [entryOf({ person: 'g', city: 'marau', from: '2026-10-01', to: '2026-10-03' })])
    expect(error?.code).toBe('23514')
    expect(await staysOfA()).toEqual([{ person: 'g', city: 'sjc', from: '2026-09-01', to: null }])
  })
})

describe('A8 — cidades do mundo (ADR 0017)', () => {
  it('cidade brasileira com couple_id → recusa (cities_scope)', async () => {
    const { error } = await asGabriel.from('cities').insert({
      name: 'Marau',
      state_code: 'RS',
      country_code: 'BR',
      lat: -28.4,
      lng: -52.2,
      couple_id: scene.coupleA,
      osm_ref: 'R296624',
      ibge_code: 9999999,
    })
    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('cities_scope')
  })

  it('sem osm_ref, ou sem couple_id (global) → recusa', async () => {
    const noRef = await asGabriel
      .from('cities')
      .insert({ name: 'Porto', country_code: 'PT', lat: 41.1, lng: -8.6, couple_id: scene.coupleA })
    expect(noRef.error).not.toBeNull()
    const global = await asGabriel
      .from('cities')
      .insert({ name: 'Porto', country_code: 'PT', lat: 41.1, lng: -8.6, osm_ref: 'R3372453' })
    expect(global.error).not.toBeNull()
  })

  it('a mesma osm_ref duas vezes no casal → um id só (on conflict do nothing)', async () => {
    const row = { name: 'Paris', country_code: 'FR', lat: 48.85, lng: 2.35, couple_id: scene.coupleA, osm_ref: 'R7444' }
    expect((await asGabriel.from('cities').upsert(row, { onConflict: 'couple_id,osm_ref', ignoreDuplicates: true })).error).toBeNull()
    expect((await asLana.from('cities').upsert(row, { onConflict: 'couple_id,osm_ref', ignoreDuplicates: true })).error).toBeNull()
    const { data } = await asLana.from('cities').select('id').eq('osm_ref', 'R7444')
    expect(data).toHaveLength(1)
  })

  it('update e delete em cities → zero linhas', async () => {
    const id = await worldCity(asGabriel, scene.coupleA, 'R2202162', 'Madrid')
    expect((await asGabriel.from('cities').update({ name: 'X' }).eq('id', id).select()).data).toEqual([])
    expect((await asGabriel.from('cities').delete().eq('id', id).select()).data).toEqual([])
    expect((await asGabriel.from('cities').update({ name: 'X' }).eq('id', CITY.sjc).select()).data).toEqual([])
    const kept = await root.from('cities').select('name').eq('id', id).single()
    expect((kept.data as { name: string }).name).toBe('Madrid')
  })

  it('search_cities("Lisboa") não devolve a Lisboa do casal, só o IBGE', async () => {
    const lisboaA = await worldCity(asGabriel, scene.coupleA, 'R5400890')
    const { data, error } = await asGabriel.rpc('search_cities', { p_query: 'Lisboa' })
    expect(error).toBeNull()
    const rows = data as { id: string; couple_id: string | null; ibge_code: number | null }[]
    expect(rows.map((r) => r.id)).not.toContain(lisboaA)
    for (const r of rows) expect(r).toMatchObject({ couple_id: null })
    for (const r of rows) expect(r.ibge_code).not.toBeNull()
  })
})

describe('A9 — create_event (o evento pinta uma vez)', () => {
  function createEvent(db: SupabaseClient, draft: EventDraft, paintIt: boolean) {
    return db.rpc('create_event', { p_event: eventDraftToInsert(draft, scene.coupleA), p_paint: paintIt })
  }

  const visit = (): EventDraft => ({
    kind: 'visita',
    title: 'Feriado de Finados em Marau',
    startsOn: '2026-10-30',
    endsOn: '2026-11-03',
    allDay: false,
    startsAt: '19:20',
    endsAt: '21:05',
    travelers: 'solo',
    travelerId: scene.gabriel.id,
    cityId: CITY.marau,
    place: null,
    repeatsYearly: false,
    note: null,
    listItemId: null,
  })

  const separated: CaseStay[] = [
    { person: 'g', city: 'sjc', from: '2026-09-01', to: null },
    { person: 'l', city: 'marau', from: '2026-09-01', to: null },
  ]
  const afterVisit: CaseStay[] = [
    { person: 'g', city: 'sjc', from: '2026-09-01', to: '2026-10-29' },
    { person: 'g', city: 'marau', from: '2026-10-30', to: '2026-11-03' },
    { person: 'g', city: 'sjc', from: '2026-11-04', to: null },
    { person: 'l', city: 'marau', from: '2026-09-01', to: null },
  ]

  it('visita com pintura grava o evento E parte a estadia aberta do viajante', async () => {
    await resetStays(separated)
    const { data, error } = await createEvent(asGabriel, visit(), true)
    expect(error).toBeNull()
    const result = data as { status: string; id: string }
    expect(result.status).toBe('ok')

    const event = await root.from('calendar_events').select('title, created_by, couple_id').eq('id', result.id).single()
    expect(event.data).toEqual({ title: 'Feriado de Finados em Marau', created_by: scene.gabriel.id, couple_id: scene.coupleA })
    expect(await staysOfA()).toEqual(sortStays(afterVisit))
  })

  it('viagem dos dois pinta os dois', async () => {
    await resetStays(separated)
    const trip: EventDraft = { ...visit(), kind: 'viagem', title: 'Paraty', travelers: 'both', travelerId: null, cityId: paraty }
    const { error } = await createEvent(asLana, trip, true)
    expect(error).toBeNull()
    expect(await staysOfA()).toEqual(
      sortStays([
        { person: 'g', city: 'sjc', from: '2026-09-01', to: '2026-10-29' },
        { person: 'g', city: 'paraty', from: '2026-10-30', to: '2026-11-03' },
        { person: 'g', city: 'sjc', from: '2026-11-04', to: null },
        { person: 'l', city: 'marau', from: '2026-09-01', to: '2026-10-29' },
        { person: 'l', city: 'paraty', from: '2026-10-30', to: '2026-11-03' },
        { person: 'l', city: 'marau', from: '2026-11-04', to: null },
      ]),
    )
  })

  it('com um destino de outro casal, NADA é gravado', async () => {
    await resetStays(separated)
    const { data: foreign } = await root.from('cities').select('id').eq('couple_id', scene.coupleB).limit(1).single()
    const cityB = (foreign as { id: string } | null)?.id ?? (await worldCity(asOutsider, scene.coupleB, 'R5400890'))
    const { error } = await createEvent(asGabriel, { ...visit(), title: 'Destino alheio', cityId: cityB }, true)
    expect(error?.code).toBe('23514')
    const { count } = await root
      .from('calendar_events')
      .select('*', { count: 'exact', head: true })
      .eq('title', 'Destino alheio')
    expect(count).toBe(0)
    expect(await staysOfA()).toEqual(sortStays(separated))
  })

  it('date com p_paint = true não mexe em estadia', async () => {
    await resetStays(separated)
    const { error } = await createEvent(asGabriel, date, true)
    expect(error).toBeNull()
    expect(await staysOfA()).toEqual(sortStays(separated))
  })

  it('visita com p_paint = false não mexe em estadia', async () => {
    await resetStays(separated)
    const { error } = await createEvent(asGabriel, visit(), false)
    expect(error).toBeNull()
    expect(await staysOfA()).toEqual(sortStays(separated))
  })

  it('editar e apagar o evento não mexem nas estadias (I6)', async () => {
    await resetStays(separated)
    const { data } = await createEvent(asGabriel, visit(), true)
    const id = (data as { id: string }).id

    const upd = await asLana
      .from('calendar_events')
      .update({ starts_on: '2026-10-29', ends_on: '2026-11-05' })
      .eq('id', id)
      .select('id')
    expect(upd.data).toHaveLength(1)
    expect(await staysOfA()).toEqual(sortStays(afterVisit))

    const del = await asLana.from('calendar_events').delete().eq('id', id).select('id')
    expect(del.data).toHaveLength(1)
    expect(await staysOfA()).toEqual(sortStays(afterVisit))
  })

  it('formato inválido pela RPC → 23514 calendar_events_format, sem pintar', async () => {
    await resetStays(separated)
    const { error } = await createEvent(asGabriel, { ...visit(), endsOn: null, endsAt: null }, true)
    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('calendar_events_format')
    expect(await staysOfA()).toEqual(sortStays(separated))
  })

  it('sem sessão → 42501', async () => {
    const { error } = await raw(anonClient()).rpc('create_event', { p_event: {}, p_paint: false })
    expect(error?.code).toBe('42501')
  })

  it('apagar o item vinculado deixa o evento com list_item_id nulo', async () => {
    const { data: item, error: itemError } = await asGabriel
      .from('list_items')
      .insert({ couple_id: scene.coupleA, category: 'filme', name: 'Past Lives', platform: 'MUBI' })
      .select('id')
      .single()
    if (itemError) throw new Error(itemError.message)
    const itemId = (item as { id: string }).id

    const { data } = await createEvent(asGabriel, { ...date, title: 'Cinema', listItemId: itemId }, false)
    const eventId = (data as { id: string }).id

    expect((await asLana.from('list_items').delete().eq('id', itemId).select('id')).data).toHaveLength(1)
    const event = await root.from('calendar_events').select('list_item_id').eq('id', eventId).single()
    expect(event.data).toEqual({ list_item_id: null })
  })

  it('mudar o couple_id do evento é recusado — até pelo service_role', async () => {
    const id = await newEvent(asGabriel, scene.coupleA)
    const { error } = await root.from('calendar_events').update({ couple_id: scene.coupleB }).eq('id', id)
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('calendar_events_couple_immutable')
  })
})

describe('A10 — 💋 (I12)', () => {
  const DAY = '2026-01-15'

  it(`o ${CALENDAR_LIMITS.kissesPerDay + 1}º do dia → day_kisses_limit`, async () => {
    const rows = Array.from({ length: CALENDAR_LIMITS.kissesPerDay }, () => ({ couple_id: scene.coupleA, day: DAY }))
    expect((await asGabriel.from('day_kisses').insert(rows)).error).toBeNull()

    // A outra pessoa também bate no limite: é do casal, não de quem marca.
    const { error } = await asLana.from('day_kisses').insert({ couple_id: scene.coupleA, day: DAY })
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('day_kisses_limit')
  })

  it('dia depois de amanhã → day_kisses_future; amanhã (fuso) passa', async () => {
    const future = await asGabriel.from('day_kisses').insert({ couple_id: scene.coupleA, day: todayBr(2) })
    expect(future.error?.code).toBe('23514')
    expect(rule(future.error)).toContain('day_kisses_future')

    const tomorrow = await asGabriel.from('day_kisses').insert({ couple_id: scene.coupleA, day: todayBr(1) })
    expect(tomorrow.error).toBeNull()
  })

  it('a Lana apaga o 💋 do Gabriel (o número é do casal)', async () => {
    const { data } = await asGabriel
      .from('day_kisses')
      .insert({ couple_id: scene.coupleA, day: '2026-01-20' })
      .select('id')
      .single()
    const id = (data as { id: string }).id
    const del = await asLana.from('day_kisses').delete().eq('id', id).select('id')
    expect(del.data).toEqual([{ id }])
  })

  it('💋 não se edita', async () => {
    const { data } = await asGabriel.from('day_kisses').update({ day: '2026-01-01' }).eq('day', DAY).select()
    expect(data).toEqual([])
  })
})
