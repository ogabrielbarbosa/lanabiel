// Critérios A1, A2 (lado do banco) e A3–A7 — .agent/Tasks/fase-6-viagens.md, seção 10.
// ADR: .agent/Decisions/0019-viagem-e-o-evento-estendido-por-trips.md
//
// Contra o projeto online (ADR 0014). Dois casais `@test.local` e as duas
// direções. As fotos daqui são só LINHAS em `trip_photos`: nenhum arquivo sobe
// (o lado do Storage é o `couple-media` da Fase 3, que não mudou).

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_PREP, EMPTY_LODGING, ITINERARY_KINDS, PREP_KINDS, TRIP_LIMITS } from '../../src/domain/trips'
import type { Lodging } from '../../src/domain/trips'
import { CASE_TRIP, TRIP_VALIDATION_CASES } from '../../src/domain/tripValidationCases'
import type { TripValidationCase } from '../../src/domain/tripValidationCases'
import { admin, anonClient, buildScenario, CITY, deleteUserAndCouple, signIn, sql, userFactory } from './harness'
import type { Db, Scenario } from './harness'

// Cliente sem tipo de propósito: estes testes GRAVAM linhas que o tipo gerado
// recusaria (texto acima do limite, payload malformado na RPC) — é o banco, não
// o TypeScript, que tem de recusá-las. E as tabelas novas só entram no tipo
// gerado com o `types:gen` depois do push.
function raw(db: Db): SupabaseClient {
  return db as unknown as SupabaseClient
}

let scene: Scenario
let asGabriel: SupabaseClient
let asLana: SupabaseClient
let asOutsider: SupabaseClient
const root = raw(admin)
const factory = userFactory('trp')
let paraty: string
/** A viagem do casal A onde rodam os casos (datas de CASE_TRIP). */
let caseTrip: string

beforeAll(async () => {
  await factory.sweep()
  scene = await buildScenario('trp')
  asGabriel = raw(await signIn(scene.gabriel.email))
  asLana = raw(await signIn(scene.lana.email))
  asOutsider = raw(await signIn(scene.outsider.email))
  const { data, error } = await root.from('cities').select('id').eq('name', 'Paraty').eq('state_code', 'RJ').single()
  if (error) throw new Error(`Paraty: ${error.message}`)
  paraty = (data as { id: string }).id
  caseTrip = await newTrip(asGabriel, CASE_TRIP.startsOn, CASE_TRIP.endsOn)
}, 120_000)

// Eventos, viagens (e com elas todas as filhas) e estadias caem em cascata com o casal.
afterAll(async () => {
  for (const user of [scene.gabriel, scene.lana, scene.outsider]) await deleteUserAndCouple(user.id)
  await factory.cleanup()
}, 120_000)

/** O nome da regra: o PostgREST devolve o HINT, não o `constraint` do RAISE. */
function rule(error: PostgrestError | null): string {
  return `${error?.message ?? ''} ${error?.hint ?? ''}`
}

/** As listas de um CHECK, na ordem em que aparecem (como em calendar.test.ts). */
function checkLists(constraint: string): string[][] {
  const def = sql(`select pg_get_constraintdef(oid) as def from pg_constraint where conname = '${constraint}'`)
  return [...def.matchAll(/ARRAY\[([^\]]+)\]/g)].map((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!))
}

function one<T>(res: { data: unknown; error: PostgrestError | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res.data as T
}

/**
 * Uma viagem dos dois, pelo `create_event` do Calendário SEM pintar: o trigger
 * `calendar_events_trip` cria a linha de `trips`. Devolve o id do evento.
 */
async function newTrip(db: SupabaseClient, from: string, to: string, city: string = paraty): Promise<string> {
  const res = await db.rpc('create_event', {
    p_event: { kind: 'viagem', title: 'Paraty, RJ', starts_on: from, ends_on: to, travelers: 'both', city_id: city, all_day: true },
    p_paint: false,
  })
  return one<{ id: string }>(res, 'newTrip').id
}

function photoPath(coupleId: string): string {
  return `${coupleId}/trip/${crypto.randomUUID()}.webp`
}

// ---------------------------------------------------------------------------
// Estadias do casal A, no formato curto (como em calendar.test.ts).
// ---------------------------------------------------------------------------
interface ShortStay {
  who: 'g' | 'l'
  city: string
  from: string
  to: string | null
}

async function staysOfA(): Promise<ShortStay[]> {
  const rows = one<{ profile_id: string; city_id: string; starts_on: string; ends_on: string | null }[]>(
    await root.from('stays').select('profile_id, city_id, starts_on, ends_on').eq('couple_id', scene.coupleA),
    'stays',
  )
  const names: Record<string, string> = { [CITY.sjc]: 'sjc', [CITY.marau]: 'marau', [paraty]: 'paraty' }
  return rows
    .map((r) => ({
      who: (r.profile_id === scene.gabriel.id ? 'g' : 'l') as ShortStay['who'],
      city: names[r.city_id] ?? r.city_id,
      from: r.starts_on,
      to: r.ends_on,
    }))
    .sort((a, b) => a.who.localeCompare(b.who) || a.from.localeCompare(b.from))
}

async function resetSeparated(): Promise<void> {
  await root.from('stays').delete().eq('couple_id', scene.coupleA)
  one(
    await root.from('stays').insert([
      { couple_id: scene.coupleA, profile_id: scene.gabriel.id, city_id: CITY.sjc, starts_on: '2026-09-01' },
      { couple_id: scene.coupleA, profile_id: scene.lana.id, city_id: CITY.marau, starts_on: '2026-09-01' },
    ]),
    'resetSeparated',
  )
}

const SEPARATED: ShortStay[] = [
  { who: 'g', city: 'sjc', from: '2026-09-01', to: null },
  { who: 'l', city: 'marau', from: '2026-09-01', to: null },
]

// ---------------------------------------------------------------------------
// Um caso da tabela → a escrita que ele representa, no casal A, pelo Gabriel.
//
// O mapeamento camel → snake é local ao teste por ora: `src/data/tripRow.ts`
// (T3) ainda não existe. Quando existir, estes mapeadores devem ser trocados
// pelos dele — como o calendar.test.ts usa `eventDraftToInsert`.
// ---------------------------------------------------------------------------
function lodgingColumns(l: Lodging) {
  return {
    lodging_name: l.name,
    lodging_address: l.address,
    lodging_check_in: l.checkIn,
    lodging_check_out: l.checkOut,
    lodging_url: l.url,
    lodging_code: l.code,
    lodging_cents: l.cents,
    lodging_paid: l.paid,
  }
}

const base = () => ({ trip_id: caseTrip, couple_id: scene.coupleA })

/** `ok` se o banco aceitou (e desfaz), ou o SQLSTATE e a regra da recusa. */
async function tryCase(c: TripValidationCase): Promise<{ code: string; rule: string }> {
  let res: { error: PostgrestError | null }
  let undo: () => PromiseLike<unknown>
  switch (c.target) {
    case 'itinerary': {
      const d = c.draft
      res = await asGabriel
        .from('trip_itinerary_items')
        .insert({ ...base(), day: d.day, at: d.at, title: d.title, kind: d.kind, note: d.note, list_item_id: d.listItemId })
      undo = () => root.from('trip_itinerary_items').delete().eq('trip_id', caseTrip)
      break
    }
    case 'prep': {
      const d = c.draft
      const inserted = await asGabriel
        .from('trip_prep_items')
        .insert({ ...base(), kind: d.kind, label: d.label, detail: d.detail, done: d.done })
        .select('id')
      res = inserted
      // Os cinco padrão ficam: só sai a linha que o caso inseriu.
      const ids = ((inserted.data ?? []) as { id: string }[]).map((r) => r.id)
      undo = () => root.from('trip_prep_items').delete().in('id', ids)
      break
    }
    case 'budget': {
      const d = c.draft
      res = await asGabriel
        .from('trip_budget_lines')
        .insert({ ...base(), label: d.label, planned_cents: d.plannedCents, spent_cents: d.spentCents })
      undo = () => root.from('trip_budget_lines').delete().eq('trip_id', caseTrip)
      break
    }
    case 'memory': {
      res = await asGabriel.from('trip_memories').insert({ ...base(), rating: c.draft.rating, body: c.draft.body })
      undo = () => root.from('trip_memories').delete().eq('trip_id', caseTrip)
      break
    }
    case 'lodging': {
      res = await asGabriel.from('trips').update(lodgingColumns(c.draft)).eq('event_id', caseTrip)
      undo = () => root.from('trips').update(lodgingColumns(EMPTY_LODGING)).eq('event_id', caseTrip)
      break
    }
    case 'departure': {
      const d = c.draft
      // `PERSON` é o Gabriel.
      res = await asGabriel
        .from('trip_departures')
        .insert({ ...base(), profile_id: scene.gabriel.id, origin_code: d.originCode, note: d.note })
      undo = () => root.from('trip_departures').delete().eq('trip_id', caseTrip)
      break
    }
    case 'dayTitle': {
      res = await asGabriel.from('trip_days').insert({ ...base(), day: '2027-01-10', title: c.draft })
      undo = () => root.from('trip_days').delete().eq('trip_id', caseTrip)
      break
    }
    case 'caption': {
      res = await asGabriel.from('trip_photos').insert({ ...base(), path: photoPath(scene.coupleA), caption: c.draft })
      undo = () => root.from('trip_photos').delete().eq('trip_id', caseTrip)
      break
    }
  }
  if (res.error) return { code: res.error.code, rule: rule(res.error) }
  await undo()
  return { code: 'ok', rule: '' }
}

describe('A1 — paridade entre src/domain/trips.ts e o banco', () => {
  it('tipos do roteiro e da preparação: os de ITINERARY_KINDS e PREP_KINDS, na mesma ordem', () => {
    expect(checkLists('trip_itinerary_kind')).toEqual([[...ITINERARY_KINDS]])
    expect(checkLists('trip_prep_kind')).toEqual([[...PREP_KINDS]])
  })

  it('DEFAULT_PREP: o trigger insere os mesmos itens, na mesma ordem, desmarcados', async () => {
    const rows = one<{ kind: string; label: string; position: number; done: boolean; detail: string | null }[]>(
      await asGabriel.from('trip_prep_items').select('kind, label, position, done, detail').eq('trip_id', caseTrip).order('position'),
      'prep',
    )
    expect(rows.map(({ kind, label }) => ({ kind, label }))).toEqual(DEFAULT_PREP.map(({ kind, label }) => ({ kind, label })))
    expect(rows.map((r) => r.position)).toEqual(DEFAULT_PREP.map((_, i) => i))
    expect(rows.every((r) => !r.done && r.detail === null)).toBe(true)
  })

  it('tetos por viagem: o número de cada trigger é o de TRIP_LIMITS', () => {
    // O comportamento está no A6; aqui, que o número do trigger é o do domínio.
    const limits: [string, number][] = [
      ['trip_itinerary_limit', TRIP_LIMITS.itineraryPerTrip],
      ['trip_prep_limit', TRIP_LIMITS.prepPerTrip],
      ['trip_budget_limit', TRIP_LIMITS.budgetPerTrip],
      ['trip_photos_limit', TRIP_LIMITS.photosPerTrip],
    ]
    for (const [fn, n] of limits) {
      expect(sql(`select prosrc as src from pg_proc where proname = '${fn}'`), fn).toContain(`>= ${n}`)
    }
  })

  // Ler o tamanho de dentro de `pg_get_constraintdef` seria frágil (o Postgres
  // reescreve a expressão). A prova é o banco aceitar no limite e recusar no
  // limite + 1, com o nome da constraint.
  const x = (n: number) => 'x'.repeat(n)
  const L = TRIP_LIMITS
  const item = { day: '2027-01-10', at: null, title: 'Belém', kind: 'cidade', note: null, listItemId: null } as const
  const prep = { kind: 'outro', label: 'Vacina', detail: null, done: false } as const
  const budget = { label: 'Voo', plannedCents: 0, spentCents: 0 }
  const departure = { profileId: '$person', originCode: null, note: null }
  const probes: [string, number, string, (n: number) => TripValidationCase][] = [
    ['dayTitle', L.dayTitle, 'trip_day_title_len', (n) => ({ target: 'dayTitle', name: '', draft: x(n), failsOn: null })],
    ['itineraryTitle', L.itineraryTitle, 'trip_itinerary_title_len', (n) => ({ target: 'itinerary', name: '', draft: { ...item, title: x(n) }, failsOn: null })],
    ['itineraryNote', L.itineraryNote, 'trip_itinerary_note_len', (n) => ({ target: 'itinerary', name: '', draft: { ...item, note: x(n) }, failsOn: null })],
    ['prepLabel', L.prepLabel, 'trip_prep_label_len', (n) => ({ target: 'prep', name: '', draft: { ...prep, label: x(n) }, failsOn: null })],
    ['prepDetail', L.prepDetail, 'trip_prep_detail_len', (n) => ({ target: 'prep', name: '', draft: { ...prep, detail: x(n) }, failsOn: null })],
    ['budgetLabel', L.budgetLabel, 'trip_budget_label_len', (n) => ({ target: 'budget', name: '', draft: { ...budget, label: x(n) }, failsOn: null })],
    ['centsMax (orçamento)', L.centsMax, 'trip_budget_cents', (n) => ({ target: 'budget', name: '', draft: { ...budget, plannedCents: n }, failsOn: null })],
    ['centsMax (hospedagem)', L.centsMax, 'trip_lodging_cents', (n) => ({ target: 'lodging', name: '', draft: { ...EMPTY_LODGING, cents: n }, failsOn: null })],
    ['memoryBody', L.memoryBody, 'trip_memory_body_len', (n) => ({ target: 'memory', name: '', draft: { rating: 5, body: x(n) }, failsOn: null })],
    ['ratingMax', L.ratingMax, 'trip_memory_rating', (n) => ({ target: 'memory', name: '', draft: { rating: n, body: 'ok' }, failsOn: null })],
    ['lodgingName', L.lodgingName, 'trip_lodging_name_len', (n) => ({ target: 'lodging', name: '', draft: { ...EMPTY_LODGING, name: x(n) }, failsOn: null })],
    ['lodgingAddress', L.lodgingAddress, 'trip_lodging_address_len', (n) => ({ target: 'lodging', name: '', draft: { ...EMPTY_LODGING, address: x(n) }, failsOn: null })],
    [
      'lodgingUrl',
      L.lodgingUrl,
      'trip_lodging_url_format',
      (n) => ({ target: 'lodging', name: '', draft: { ...EMPTY_LODGING, url: 'https://' + x(n - 'https://'.length) }, failsOn: null }),
    ],
    ['lodgingCode', L.lodgingCode, 'trip_lodging_code_len', (n) => ({ target: 'lodging', name: '', draft: { ...EMPTY_LODGING, code: x(n) }, failsOn: null })],
    ['originCode', L.originCode, 'trip_departure_origin_len', (n) => ({ target: 'departure', name: '', draft: { ...departure, originCode: x(n) }, failsOn: null })],
    ['departureNote', L.departureNote, 'trip_departure_note_len', (n) => ({ target: 'departure', name: '', draft: { ...departure, note: x(n) }, failsOn: null })],
    ['caption', L.caption, 'trip_photo_caption_len', (n) => ({ target: 'caption', name: '', draft: x(n), failsOn: null })],
  ]
  for (const [label, limit, constraint, caseOf] of probes) {
    it(`${label}: aceita ${limit}, recusa ${limit + 1} (${constraint})`, async () => {
      expect((await tryCase(caseOf(limit))).code).toBe('ok')
      const refused = await tryCase(caseOf(limit + 1))
      expect(refused.code).toBe('23514')
      expect(refused.rule).toContain(constraint)
    })
  }

  it(`ratingMin: aceita ${TRIP_LIMITS.ratingMin}, recusa ${TRIP_LIMITS.ratingMin - 1}`, async () => {
    const memory = (rating: number): TripValidationCase => ({ target: 'memory', name: '', draft: { rating, body: 'ok' }, failsOn: null })
    expect((await tryCase(memory(TRIP_LIMITS.ratingMin))).code).toBe('ok')
    expect((await tryCase(memory(TRIP_LIMITS.ratingMin - 1))).rule).toContain('trip_memory_rating')
  })
})

describe('A2 — os TRIP_VALIDATION_CASES, do lado do banco', () => {
  // A MESMA fixture que roda contra `tripValidation.ts`
  // (src/domain/tripValidation.test.ts). Toda recusa é um CHECK `trip_*`.
  for (const c of TRIP_VALIDATION_CASES) {
    const expected = c.failsOn === null ? 'aceita' : `recusa (${c.failsOn})`
    it(`${c.target}: ${c.name} → ${expected}`, async () => {
      const result = await tryCase(c)
      if (c.failsOn === null) {
        expect(result).toEqual({ code: 'ok', rule: '' })
      } else {
        expect(result.code).toBe('23514')
        expect(result.rule).toMatch(/trip_[a-z_]+/)
      }
    })
  }
})

describe('A3 — create_trip: tudo numa transação', () => {
  function createTrip(db: SupabaseClient, payload: unknown) {
    return db.rpc('create_trip', { p_trip: payload })
  }

  const payload = () => ({
    title: 'Paraty, RJ',
    city_id: paraty,
    starts_on: '2027-03-05',
    ends_on: '2027-03-09',
    note: 'Férias sem notebook',
    lodging_name: 'Pousada do Sandi',
    departures: [
      { profile_id: scene.gabriel.id, origin_code: null, note: 'carro · 4h' },
      { profile_id: scene.lana.id, origin_code: 'POA', note: 'voo POA → GRU · 1h35' },
    ],
  })

  const painted: ShortStay[] = [
    { who: 'g', city: 'sjc', from: '2026-09-01', to: '2027-03-04' },
    { who: 'g', city: 'paraty', from: '2027-03-05', to: '2027-03-09' },
    { who: 'g', city: 'sjc', from: '2027-03-10', to: null },
    { who: 'l', city: 'marau', from: '2026-09-01', to: '2027-03-04' },
    { who: 'l', city: 'paraty', from: '2027-03-05', to: '2027-03-09' },
    { who: 'l', city: 'marau', from: '2027-03-10', to: null },
  ]

  async function eventsTitled(title: string): Promise<number> {
    const { count } = await root.from('calendar_events').select('*', { count: 'exact', head: true }).eq('title', title)
    return count ?? -1
  }

  it('grava o evento, trips, os 5 de preparação, a hospedagem e as saídas, e pinta os dois', async () => {
    await resetSeparated()
    const { data, error } = await createTrip(asLana, payload())
    expect(error).toBeNull()
    const result = data as { status: string; id: string }
    expect(result.status).toBe('ok')

    const event = one(
      await root.from('calendar_events').select('kind, title, travelers, traveler_id, all_day, city_id, starts_on, ends_on, note, created_by, couple_id').eq('id', result.id).single(),
      'evento',
    )
    expect(event).toEqual({
      kind: 'viagem',
      title: 'Paraty, RJ',
      travelers: 'both',
      traveler_id: null,
      all_day: true,
      city_id: paraty,
      starts_on: '2027-03-05',
      ends_on: '2027-03-09',
      note: 'Férias sem notebook',
      created_by: scene.lana.id,
      couple_id: scene.coupleA,
    })

    const trip = one(await asGabriel.from('trips').select('lodging_name, cover_photo_id').eq('event_id', result.id).single(), 'trips')
    expect(trip).toEqual({ lodging_name: 'Pousada do Sandi', cover_photo_id: null })

    const prep = one<{ kind: string }[]>(await asGabriel.from('trip_prep_items').select('kind').eq('trip_id', result.id).order('position'), 'prep')
    expect(prep.map((p) => p.kind)).toEqual(DEFAULT_PREP.map((p) => p.kind))

    const deps = one<{ profile_id: string; origin_code: string | null; note: string | null }[]>(
      await asGabriel.from('trip_departures').select('profile_id, origin_code, note').eq('trip_id', result.id),
      'saídas',
    )
    expect(deps).toHaveLength(2)
    expect(deps).toEqual(
      expect.arrayContaining([
        { profile_id: scene.gabriel.id, origin_code: null, note: 'carro · 4h' },
        { profile_id: scene.lana.id, origin_code: 'POA', note: 'voo POA → GRU · 1h35' },
      ]),
    )

    expect(await staysOfA()).toEqual(painted)
  })

  it('sem hospedagem e sem saídas também vale', async () => {
    const { data, error } = await createTrip(asGabriel, { ...payload(), title: 'Só o destino', lodging_name: null, departures: [] })
    expect(error).toBeNull()
    const id = (data as { id: string }).id
    expect(one(await asGabriel.from('trips').select('lodging_name').eq('event_id', id).single(), 'trips')).toEqual({ lodging_name: null })
    expect(one<unknown[]>(await asGabriel.from('trip_departures').select('profile_id').eq('trip_id', id), 'saídas')).toEqual([])
  })

  it('com a cidade de outro casal, NADA é gravado', async () => {
    await resetSeparated()
    const lisboaB = one<{ id: string }>(
      await asOutsider
        .from('cities')
        .insert({ name: 'Lisboa', country_code: 'PT', region: 'Lisboa', lat: 38.7077, lng: -9.1366, couple_id: scene.coupleB, osm_ref: 'R5400890' })
        .select('id')
        .single(),
      'Lisboa do B',
    ).id
    const { error } = await createTrip(asGabriel, { ...payload(), title: 'Destino alheio', city_id: lisboaB })
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('calendar_events_city')
    expect(await eventsTitled('Destino alheio')).toBe(0)
    expect(await staysOfA()).toEqual(SEPARATED)
  })

  it('saída de quem não é do casal → trip_member, e o evento e a pintura voltam', async () => {
    await resetSeparated()
    const { error } = await createTrip(asGabriel, {
      ...payload(),
      title: 'Saída alheia',
      departures: [{ profile_id: scene.gabriel.id, origin_code: null, note: null }, { profile_id: scene.outsider.id, origin_code: null, note: null }],
    })
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('trip_member')
    expect(await eventsTitled('Saída alheia')).toBe(0)
    expect(await staysOfA()).toEqual(SEPARATED)
  })

  it('hospedagem fora do CHECK → 23514, e nada é gravado', async () => {
    await resetSeparated()
    const { error } = await createTrip(asGabriel, { ...payload(), title: 'Hospedagem longa', lodging_name: 'x'.repeat(TRIP_LIMITS.lodgingName + 1) })
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('trip_lodging_name_len')
    expect(await eventsTitled('Hospedagem longa')).toBe(0)
    expect(await staysOfA()).toEqual(SEPARATED)
  })

  it('malformado → 22023: não objeto, departures não lista, saída sem pessoa, uuid inválido, pessoa repetida, hospedagem não texto', async () => {
    await resetSeparated()
    const g = scene.gabriel.id
    const bad: unknown[] = [
      [],
      'viagem',
      { ...payload(), title: 'Malformado', departures: {} },
      { ...payload(), title: 'Malformado', departures: [{ origin_code: 'GRU' }] },
      { ...payload(), title: 'Malformado', departures: ['x'] },
      { ...payload(), title: 'Malformado', departures: [{ profile_id: 'abc' }] },
      { ...payload(), title: 'Malformado', departures: [{ profile_id: g }, { profile_id: g }] },
      { ...payload(), title: 'Malformado', departures: [{ profile_id: g, origin_code: 5 }] },
      { ...payload(), title: 'Malformado', lodging_name: 7 },
      { ...payload(), title: 'Malformado', starts_on: '2027-02-30' },
    ]
    for (const p of bad) {
      const { error } = await createTrip(asGabriel, p)
      expect(error?.code, JSON.stringify(p)).toBe('22023')
    }
    expect(await eventsTitled('Malformado')).toBe(0)
    expect(await staysOfA()).toEqual(SEPARATED)
  })

  it('sem sessão → 42501; sem casal → not_member', async () => {
    const anon = await raw(anonClient()).rpc('create_trip', { p_trip: payload() })
    expect(anon.error?.code).toBe('42501')

    const loner = await factory.newUser('sozinho')
    const { data, error } = await raw(loner.db).rpc('create_trip', { p_trip: payload() })
    expect(error).toBeNull()
    expect(data).toEqual({ status: 'not_member' })
  })

  it('é invoker, executável por authenticated e não por anon — fora das doze definer', () => {
    const rows = sql(`
      select p.prosecdef as definer,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'create_trip'`)
    expect(rows).toBe('f|t|f')
  })
})

describe('A4 — o trigger: viagem dos dois ganha trips; visita e solo não (I2)', () => {
  async function tripRow(id: string): Promise<unknown[]> {
    return one<unknown[]>(await root.from('trips').select('event_id').eq('event_id', id), 'trips')
  }
  async function prepCount(id: string): Promise<number> {
    const { count } = await root.from('trip_prep_items').select('*', { count: 'exact', head: true }).eq('trip_id', id)
    return count ?? -1
  }
  function event(travelers: 'both' | 'solo', kind: 'viagem' | 'visita' = 'viagem') {
    return {
      kind,
      title: `${kind} ${travelers}`,
      starts_on: '2027-06-01',
      ends_on: '2027-06-03',
      city_id: CITY.marau,
      travelers,
      traveler_id: travelers === 'solo' ? scene.gabriel.id : null,
      all_day: true,
    }
  }
  async function create(p: object): Promise<string> {
    return one<{ id: string }>(await asGabriel.rpc('create_event', { p_event: p, p_paint: false }), 'create_event').id
  }

  it('viagem dos dois pelo create_event do Calendário → trips e os 5 de preparação', async () => {
    const id = await create(event('both'))
    expect(await tripRow(id)).toHaveLength(1)
    expect(await prepCount(id)).toBe(DEFAULT_PREP.length)
  })

  it('visita e viagem solo → nenhuma linha', async () => {
    const visit = await create(event('solo', 'visita'))
    const solo = await create(event('solo'))
    expect(await tripRow(visit)).toEqual([])
    expect(await tripRow(solo)).toEqual([])
  })

  it('solo → dos dois cria; dos dois → solo mantém; de volta → sem duplicar nem perder a edição', async () => {
    const id = await create(event('solo'))
    one(await asLana.from('calendar_events').update({ travelers: 'both', traveler_id: null }).eq('id', id).select('id'), 'para both')
    expect(await tripRow(id)).toHaveLength(1)
    expect(await prepCount(id)).toBe(DEFAULT_PREP.length)

    one(
      await asLana.from('trip_prep_items').update({ label: 'Passagens compradas' }).eq('trip_id', id).eq('kind', 'passagens').select('id'),
      'editar prep',
    )
    one(await asGabriel.from('calendar_events').update({ travelers: 'solo', traveler_id: scene.gabriel.id }).eq('id', id).select('id'), 'para solo')
    expect(await tripRow(id)).toHaveLength(1)
    one(await asGabriel.from('calendar_events').update({ travelers: 'both', traveler_id: null }).eq('id', id).select('id'), 'de volta')

    expect(await prepCount(id)).toBe(DEFAULT_PREP.length)
    const labels = one<{ label: string }[]>(await root.from('trip_prep_items').select('label').eq('trip_id', id).eq('kind', 'passagens'), 'label')
    expect(labels).toEqual([{ label: 'Passagens compradas' }])
  })

  it('backfill: nenhum evento viagem dos dois, de casal nenhum, fica sem trips', () => {
    const missing = sql(`
      select count(*) as n from public.calendar_events e
       where e.kind = 'viagem' and e.travelers = 'both'
         and not exists (select 1 from public.trips t where t.event_id = e.id)`)
    expect(missing).toBe('0')
  })
})

describe('A5 — isolamento por casal e FKs compostas', () => {
  let tripA: string
  let otherTripA: string
  let tripB: string
  let photoOtherTripA: string
  let itemB: string

  const TABLES = [
    ['trip_departures', 'trip_id'],
    ['trip_days', 'trip_id'],
    ['trip_itinerary_items', 'trip_id'],
    ['trip_prep_items', 'trip_id'],
    ['trip_budget_lines', 'trip_id'],
    ['trip_memories', 'trip_id'],
    ['trip_photos', 'trip_id'],
    ['trips', 'event_id'],
  ] as const

  beforeAll(async () => {
    tripA = await newTrip(asGabriel, '2027-07-01', '2027-07-05')
    otherTripA = await newTrip(asLana, '2027-08-01', '2027-08-05')
    tripB = await newTrip(asOutsider, '2027-07-01', '2027-07-05', CITY.sjc)
    photoOtherTripA = one<{ id: string }>(
      await asLana.from('trip_photos').insert({ trip_id: otherTripA, couple_id: scene.coupleA, path: photoPath(scene.coupleA) }).select('id').single(),
      'foto da outra viagem',
    ).id

    const b = { trip_id: tripB, couple_id: scene.coupleB }
    one(await asOutsider.from('trip_departures').insert({ ...b, profile_id: scene.outsider.id }), 'saída B')
    one(await asOutsider.from('trip_days').insert({ ...b, day: '2027-07-02', title: 'Deles' }), 'dia B')
    one(await asOutsider.from('trip_itinerary_items').insert({ ...b, day: '2027-07-02', title: 'Deles', kind: 'outro' }), 'item B')
    one(await asOutsider.from('trip_budget_lines').insert({ ...b, label: 'Deles', planned_cents: 100 }), 'orçamento B')
    one(await asOutsider.from('trip_memories').insert({ ...b, rating: 4, body: 'deles' }), 'memória B')
    one(await asOutsider.from('trip_photos').insert({ ...b, path: photoPath(scene.coupleB) }), 'foto B')
    itemB = one<{ id: string }>(
      await asOutsider.from('list_items').insert({ couple_id: scene.coupleB, category: 'filme', name: 'Deles', platform: 'MUBI' }).select('id').single(),
      'item da Lista B',
    ).id
  })

  it('o Gabriel não lê nenhuma tabela nova do casal B', async () => {
    for (const [table, key] of TABLES) {
      const { data, error } = await asGabriel.from(table).select('*').eq(key, tripB)
      expect(error, table).toBeNull()
      expect(data, table).toEqual([])
    }
  })

  it('o de fora não lê nada da viagem do casal A', async () => {
    for (const [table, key] of TABLES) {
      expect((await asOutsider.from(table).select('*').eq(key, tripA)).data, table).toEqual([])
    }
  })

  it('o Gabriel não edita nem apaga nada do casal B', async () => {
    for (const [table, key] of TABLES) {
      expect((await asGabriel.from(table).delete().eq(key, tripB).select()).data, `delete ${table}`).toEqual([])
    }
    expect((await asGabriel.from('trips').update({ lodging_name: 'hack' }).eq('event_id', tripB).select()).data).toEqual([])
    expect((await asGabriel.from('trip_days').update({ title: 'hack' }).eq('trip_id', tripB).select()).data).toEqual([])
    for (const [table, key] of TABLES) {
      const { count } = await root.from(table).select('*', { count: 'exact', head: true }).eq(key, tripB)
      // trips: 1 · prep: os 5 padrão · as outras: a linha que o B gravou.
      expect(count, table).toBe(table === 'trip_prep_items' ? DEFAULT_PREP.length : 1)
    }
  })

  it('o Gabriel não escreve na viagem do B: nem com o casal B (RLS), nem com o casal A (FK composta)', async () => {
    const asB = await asGabriel.from('trip_days').insert({ trip_id: tripB, couple_id: scene.coupleB, day: '2027-07-02', title: 'hack' })
    expect(asB.error).not.toBeNull()
    const asA = await asGabriel.from('trip_days').insert({ trip_id: tripB, couple_id: scene.coupleA, day: '2027-07-03', title: 'hack' })
    expect(asA.error?.code).toBe('23503')
    expect(rule(asA.error)).toContain('trip_days_trip')
  })

  it('item do roteiro com item da Lista do casal B → FK composta recusa', async () => {
    const { error } = await asGabriel
      .from('trip_itinerary_items')
      .insert({ trip_id: tripA, couple_id: scene.coupleA, day: '2027-07-02', title: 'x', kind: 'outro', list_item_id: itemB })
    expect(error?.code).toBe('23503')
    expect(rule(error)).toContain('trip_itinerary_list_item')
  })

  it('capa com a foto de OUTRA viagem → trips_cover_same_trip; a da mesma passa', async () => {
    const other = await asGabriel.from('trips').update({ cover_photo_id: photoOtherTripA }).eq('event_id', tripA)
    expect(other.error?.code).toBe('23503')
    expect(rule(other.error)).toContain('trips_cover_same_trip')

    const own = one<{ id: string }>(
      await asGabriel.from('trip_photos').insert({ trip_id: tripA, couple_id: scene.coupleA, path: photoPath(scene.coupleA) }).select('id').single(),
      'foto de A',
    ).id
    expect((await asGabriel.from('trips').update({ cover_photo_id: own }).eq('event_id', tripA)).error).toBeNull()

    // Apagar a foto tira a capa, não a viagem.
    one(await asLana.from('trip_photos').delete().eq('id', own).select('id'), 'apagar capa')
    expect(one(await root.from('trips').select('cover_photo_id').eq('event_id', tripA).single(), 'capa')).toEqual({ cover_photo_id: null })
  })

  it('foto na pasta de outro casal → trip_photos_path; em nome da Lana → recusa', async () => {
    const path = await asGabriel.from('trip_photos').insert({ trip_id: tripA, couple_id: scene.coupleA, path: photoPath(scene.coupleB) })
    expect(path.error?.code).toBe('23514')
    expect(rule(path.error)).toContain('trip_photos_path')

    const author = await asGabriel
      .from('trip_photos')
      .insert({ trip_id: tripA, couple_id: scene.coupleA, path: photoPath(scene.coupleA), added_by: scene.lana.id })
    expect(author.error).not.toBeNull()
  })

  it('saída de quem é de fora do casal → trip_member', async () => {
    const { error } = await asGabriel.from('trip_departures').insert({ trip_id: tripA, couple_id: scene.coupleA, profile_id: scene.outsider.id })
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('trip_member')
  })

  it('memória: cada um grava só a sua; a Lana lê a do Gabriel mas não edita nem apaga', async () => {
    one(await asGabriel.from('trip_memories').insert({ trip_id: tripA, couple_id: scene.coupleA, rating: 5, body: 'a minha' }), 'memória do Gabriel')

    const forHim = await asLana.from('trip_memories').insert({ trip_id: tripA, couple_id: scene.coupleA, profile_id: scene.gabriel.id, rating: 1, body: 'hack' })
    expect(forHim.error).not.toBeNull()

    const read = one<{ body: string }[]>(await asLana.from('trip_memories').select('body').eq('trip_id', tripA), 'ler')
    expect(read).toEqual([{ body: 'a minha' }])
    expect((await asLana.from('trip_memories').update({ body: 'hack' }).eq('trip_id', tripA).select()).data).toEqual([])
    expect((await asLana.from('trip_memories').delete().eq('trip_id', tripA).select()).data).toEqual([])

    const mine = one<{ written_on: string }>(
      await asLana.from('trip_memories').insert({ trip_id: tripA, couple_id: scene.coupleA, rating: 4, body: 'a dela' }).select('written_on').single(),
      'memória da Lana',
    )
    expect(mine.written_on).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(one<unknown[]>(await root.from('trip_memories').select('profile_id').eq('trip_id', tripA), 'duas')).toHaveLength(2)
  })

  it('trips não se apaga pelo cliente — apagar a viagem é apagar o evento (I1)', async () => {
    expect((await asGabriel.from('trips').delete().eq('event_id', tripA).select()).data).toEqual([])
    expect(one<unknown[]>(await root.from('trips').select('event_id').eq('event_id', tripA), 'trips')).toHaveLength(1)
  })
})

describe('A6 — o dia dentro da viagem e os tetos, com o nome da regra', () => {
  const at = (trip: string, day: string, title = 'x') => ({ trip_id: trip, couple_id: scene.coupleA, day, title, kind: 'outro' })

  it('dia fora da viagem → trip_itinerary_day_in_trip; as duas pontas passam', async () => {
    const trip = await newTrip(asGabriel, '2027-09-10', '2027-09-12')
    for (const day of ['2027-09-09', '2027-09-13']) {
      const { error } = await asGabriel.from('trip_itinerary_items').insert(at(trip, day))
      expect(error?.code, day).toBe('23514')
      expect(rule(error), day).toContain('trip_itinerary_day_in_trip')
    }
    expect((await asGabriel.from('trip_itinerary_items').insert([at(trip, '2027-09-10'), at(trip, '2027-09-12')])).error).toBeNull()
  })

  it('a viagem mudou de data: o item que ficou fora se edita; mudar o dia para fora não', async () => {
    const trip = await newTrip(asGabriel, '2027-10-10', '2027-10-15')
    const id = one<{ id: string }>(await asGabriel.from('trip_itinerary_items').insert(at(trip, '2027-10-14')).select('id').single(), 'item').id
    one(await asLana.from('calendar_events').update({ starts_on: '2027-10-01', ends_on: '2027-10-05' }).eq('id', trip).select('id'), 'mudar datas')

    expect((await asGabriel.from('trip_itinerary_items').update({ title: 'editado' }).eq('id', id).select('id')).data).toHaveLength(1)
    const moved = await asGabriel.from('trip_itinerary_items').update({ day: '2027-10-20' }).eq('id', id)
    expect(moved.error?.code).toBe('23514')
    expect(rule(moved.error)).toContain('trip_itinerary_day_in_trip')
    expect((await asGabriel.from('trip_itinerary_items').update({ day: '2027-10-03' }).eq('id', id).select('id')).data).toHaveLength(1)
  })

  it(`roteiro: ${TRIP_LIMITS.itineraryPerTrip} entram, o seguinte → trip_itinerary_limit`, async () => {
    const trip = await newTrip(asGabriel, '2027-11-01', '2027-11-05')
    const rows = Array.from({ length: TRIP_LIMITS.itineraryPerTrip }, (_, i) => at(trip, '2027-11-02', `item ${i}`))
    expect((await asGabriel.from('trip_itinerary_items').insert(rows)).error).toBeNull()
    // A outra pessoa também bate no teto: é da viagem, não de quem escreve.
    const { error } = await asLana.from('trip_itinerary_items').insert(at(trip, '2027-11-03'))
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('trip_itinerary_limit')
  })

  it(`preparação: com os ${DEFAULT_PREP.length} padrão, até ${TRIP_LIMITS.prepPerTrip}; o seguinte → trip_prep_limit`, async () => {
    const trip = await newTrip(asGabriel, '2027-11-01', '2027-11-05')
    const rows = Array.from({ length: TRIP_LIMITS.prepPerTrip - DEFAULT_PREP.length }, (_, i) => ({
      trip_id: trip,
      couple_id: scene.coupleA,
      kind: 'outro',
      label: `prep ${i}`,
    }))
    expect((await asGabriel.from('trip_prep_items').insert(rows)).error).toBeNull()
    const { error } = await asLana.from('trip_prep_items').insert({ trip_id: trip, couple_id: scene.coupleA, kind: 'outro', label: 'demais' })
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('trip_prep_limit')
  })

  it(`orçamento: ${TRIP_LIMITS.budgetPerTrip} linhas; a seguinte → trip_budget_limit`, async () => {
    const trip = await newTrip(asGabriel, '2027-11-01', '2027-11-05')
    const line = (label: string) => ({ trip_id: trip, couple_id: scene.coupleA, label, planned_cents: 100 })
    const rows = Array.from({ length: TRIP_LIMITS.budgetPerTrip }, (_, i) => line(`linha ${i}`))
    expect((await asGabriel.from('trip_budget_lines').insert(rows)).error).toBeNull()
    const { error } = await asLana.from('trip_budget_lines').insert(line('demais'))
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('trip_budget_limit')
  })

  it(`fotos: ${TRIP_LIMITS.photosPerTrip}; a seguinte → trip_photos_limit`, async () => {
    const trip = await newTrip(asGabriel, '2027-11-01', '2027-11-05')
    const photo = () => ({ trip_id: trip, couple_id: scene.coupleA, path: photoPath(scene.coupleA) })
    const rows = Array.from({ length: TRIP_LIMITS.photosPerTrip }, photo)
    expect((await asGabriel.from('trip_photos').insert(rows)).error).toBeNull()
    const { error } = await asLana.from('trip_photos').insert(photo())
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('trip_photos_limit')
  })
})

describe('A7 — apagar o evento leva a viagem inteira; as estadias ficam', () => {
  it('evento apagado → trips e as sete filhas vazias; as estadias pintadas não mudam', async () => {
    await resetSeparated()
    const { data, error } = await asGabriel.rpc('create_trip', {
      p_trip: {
        title: 'Paraty, RJ',
        city_id: paraty,
        starts_on: '2027-12-01',
        ends_on: '2027-12-04',
        note: null,
        lodging_name: 'Pousada',
        departures: [{ profile_id: scene.gabriel.id, origin_code: 'SJC', note: null }],
      },
    })
    expect(error).toBeNull()
    const id = (data as { id: string }).id
    const b = { trip_id: id, couple_id: scene.coupleA }
    const cover = one<{ id: string }>(await asGabriel.from('trip_photos').insert({ ...b, path: photoPath(scene.coupleA) }).select('id').single(), 'foto').id
    one(await asGabriel.from('trips').update({ cover_photo_id: cover }).eq('event_id', id).select('event_id'), 'capa')
    one(await asGabriel.from('trip_days').insert({ ...b, day: '2027-12-02', title: 'Centro histórico' }), 'dia')
    one(await asGabriel.from('trip_itinerary_items').insert({ ...b, day: '2027-12-02', title: 'Passeio de barco', kind: 'experiencia' }), 'item')
    one(await asGabriel.from('trip_budget_lines').insert({ ...b, label: 'Barco', planned_cents: 15_000 }), 'orçamento')
    one(await asLana.from('trip_memories').insert({ ...b, rating: 5, body: 'O barco!' }), 'memória')
    const painted = await staysOfA()
    expect(painted).not.toEqual(SEPARATED)

    // Com a capa apontando para uma foto: a cascata dá a volta (evento → trips
    // → fotos → `set null` na capa de uma linha que já saiu) sem erro.
    expect((await asLana.from('calendar_events').delete().eq('id', id).select('id')).data).toHaveLength(1)

    for (const table of ['trip_departures', 'trip_days', 'trip_itinerary_items', 'trip_prep_items', 'trip_budget_lines', 'trip_memories', 'trip_photos']) {
      const { count } = await root.from(table).select('*', { count: 'exact', head: true }).eq('trip_id', id)
      expect(count, table).toBe(0)
    }
    const { count } = await root.from('trips').select('*', { count: 'exact', head: true }).eq('event_id', id)
    expect(count).toBe(0)
    expect(await staysOfA()).toEqual(painted)
  })
})
