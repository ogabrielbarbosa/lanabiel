// Fronteira de dados das Viagens (Fase 6) — tradução de erro, validação antes
// de gravar, a ordem das cascatas da seção 7 e o upload de várias fotos, com
// um `db` falso mínimo (só o que as funções usam). O que o banco REALMENTE
// responde está em supabase/tests/trips.test.ts.
// Spec: .agent/Tasks/fase-6-viagens.md, seções 5, 6, 7 e 8

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarEvent } from '../domain/calendar'
import { EMPTY_LODGING, TRIP_LIMITS } from '../domain/trips'
import type { NewTripDraft } from '../domain/trips'
import type { Database } from '../lib/database.types'
import type { PrepareResult } from './avatar'
import { PAGE_SIZE } from './paginate'
import {
  createItinerary,
  createTrip,
  deleteTrip,
  deleteTripPhoto,
  loadTripListItems,
  loadTrips,
  saveDepartures,
  saveTripMemory,
  setDayTitle,
  setPhotoCaption,
  setPrepDone,
  takenOnFor,
  translateTripError,
  updateItinerary,
  updateTrip,
  updateTripEvent,
  uploadTripCover,
  uploadTripPhotos,
} from './trips'

type PgError = { code?: string; message: string; hint?: string | null; details?: string | null }
type Response = { data: unknown; error: PgError | null }

interface FakeOptions {
  session?: boolean
  /** `"tabela.op"` → resposta, ou função do `.range(from, to)` pedido. Padrão `{ data: [], error: null }`. */
  responses?: Record<string, Response | ((range: [number, number] | null) => Response)>
  rpc?: Response
  /** Upload n (0-based, na ordem das chamadas) falha? */
  uploadFails?: (n: number) => boolean
  removeError?: string
}

/** Um cliente falso que registra, em ordem, cada operação que chega ao "banco" e ao Storage. */
function fakeDb(options: FakeOptions = {}) {
  const log: string[] = []
  const payloads: Record<string, unknown> = {}
  let uploads = 0

  function from(table: string) {
    let op = 'select'
    let range: [number, number] | null = null
    const filters: string[] = []
    const builder = {
      select: () => builder,
      insert: (v: unknown) => ((op = 'insert'), (payloads[`${table}.insert`] = v), builder),
      update: (v: unknown) => ((op = 'update'), (payloads[`${table}.update`] = v), builder),
      upsert: (v: unknown, o?: { onConflict?: string }) => (
        (op = 'upsert'), (payloads[`${table}.upsert`] = v), (payloads[`${table}.onConflict`] = o?.onConflict), builder
      ),
      delete: () => ((op = 'delete'), builder),
      eq: (col: string, v: unknown) => (filters.push(`${col}=${String(v)}`), builder),
      order: () => builder,
      range: (a: number, b: number) => ((range = [a, b]), builder),
      single: () => builder,
      then(resolve: (r: Response) => unknown, reject: (e: unknown) => unknown) {
        log.push(`${table}.${op}${range ? `[${range[0]}-${range[1]}]` : ''}${filters.length ? ` ${filters.join(' ')}` : ''}`)
        const response = options.responses?.[`${table}.${op}`]
        const value = typeof response === 'function' ? response(range) : response
        return Promise.resolve(value ?? { data: [], error: null }).then(resolve, reject)
      },
    }
    return builder
  }

  const bucket = {
    upload: vi.fn(async (path: string) => {
      const n = uploads++
      await new Promise((r) => setTimeout(r, 1))
      if (options.uploadFails?.(n)) {
        log.push(`upload-failed:${path}`)
        return { data: null, error: { message: `upload ${n} falhou` } }
      }
      log.push(`upload:${path}`)
      return { data: { path }, error: null }
    }),
    remove: vi.fn(async (paths: string[]) => {
      log.push(`remove:${paths.join(',')}`)
      return options.removeError ? { data: null, error: { message: options.removeError } } : { data: [], error: null }
    }),
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
      error: null,
    })),
  }

  const db = {
    auth: {
      getSession: async () => ({ data: { session: options.session === false ? null : { user: { id: 'u-gabriel' } } } }),
    },
    from,
    storage: { from: () => bucket },
    rpc: vi.fn(async (fn: string, args: unknown) => {
      log.push(`rpc:${fn}`)
      payloads[`rpc:${fn}`] = args
      return options.rpc ?? { data: { status: 'ok', id: 'ev-new' }, error: null }
    }),
  }
  return { db: db as unknown as SupabaseClient<Database>, log, payloads, bucket }
}

const KEY = { tripId: 'ev-1', coupleId: 'couple-1' }
const TARGET = { ...KEY, startsOn: '2026-07-12', endsOn: '2026-07-19' }
const check = (hint: string): PgError => ({ code: '23514', message: 'recusado', hint })

const eventRow = {
  id: 'ev-1',
  couple_id: 'couple-1',
  kind: 'viagem',
  title: 'Ilhabela, SP',
  starts_on: '2026-07-12',
  ends_on: '2026-07-19',
  all_day: true,
  starts_at: null,
  ends_at: null,
  travelers: 'both',
  traveler_id: null,
  city_id: 'c-ilhabela',
  place: null,
  repeats_yearly: false,
  note: null,
  list_item_id: null,
  created_by: 'u-gabriel',
  created_at: 'x',
  updated_at: 'x',
}

const EVENT: CalendarEvent = {
  id: 'ev-1',
  kind: 'viagem',
  title: 'Ilhabela, SP',
  startsOn: '2026-07-12',
  endsOn: '2026-07-19',
  allDay: false,
  startsAt: '07:00',
  endsAt: '21:30',
  travelers: 'both',
  travelerId: null,
  cityId: 'c-ilhabela',
  place: null,
  repeatsYearly: false,
  note: null,
  listItemId: null,
  createdBy: 'u-lana',
}

const DRAFT: NewTripDraft = {
  title: 'Florianópolis, SC',
  cityId: 'c-floripa',
  startsOn: '2027-01-08',
  endsOn: '2027-01-14',
  note: null,
  lodgingName: null,
  departures: [
    { profileId: 'u-gabriel', originCode: null, note: null },
    { profileId: 'u-lana', originCode: null, note: 'voo POA → FLN · 55min' },
  ],
}

describe('translateTripError', () => {
  it('cada código vira o caso nomeado', () => {
    expect(translateTripError({ code: 'PGRST301', message: 'jwt' })).toEqual({ status: 'unauthenticated' })
    expect(translateTripError({ code: '42501', message: 'rls' })).toEqual({ status: 'not_member' })
    expect(translateTripError({ code: '42501', message: 'sem sessão' }, 'rpc')).toEqual({ status: 'unauthenticated' })
    expect(translateTripError({ code: '23503', message: 'fk' })).toEqual({ status: 'not_found' })
    // O trigger põe o nome no HINT; o CHECK declarado, na mensagem.
    expect(translateTripError(check('trip_itinerary_day_in_trip'))).toEqual({
      status: 'invalid',
      constraint: 'trip_itinerary_day_in_trip',
      cause: 'recusado',
    })
    expect(
      translateTripError({ code: '23514', message: 'new row violates check constraint "trip_memory_rating"' }),
    ).toMatchObject({ status: 'invalid', constraint: 'trip_memory_rating' })
    expect(translateTripError({ code: '22023', message: 'saída malformada' })).toEqual({ status: 'error', cause: 'saída malformada' })
  })
})

describe('loadTrips', () => {
  it('sem sessão: nem pergunta ao banco', async () => {
    const { db, log } = fakeDb({ session: false })
    expect(await loadTrips(db)).toEqual({ status: 'unauthenticated' })
    expect(log).toEqual([])
  })

  it('nove leituras, sem filtro de casal; eventos só `viagem` dos dois (identidade, não autorização)', async () => {
    const { db, log } = fakeDb({ responses: { 'calendar_events.select': { data: [eventRow], error: null } } })
    const result = await loadTrips(db)
    expect(result.status).toBe('ok')
    expect(log).toHaveLength(9)
    expect(log).toContain('calendar_events.select[0-999] kind=viagem travelers=both')
    expect(log.join(' ')).not.toContain('couple_id')
    if (result.status !== 'ok') return
    // Sem linha em `trips` (o trigger não rodou): a viagem aparece com os detalhes vazios.
    expect(result.rows.trips).toHaveLength(1)
    expect(result.rows.trips[0]).toMatchObject({ id: 'ev-1', lodging: EMPTY_LODGING })
    expect(result.rows.events.get('ev-1')?.title).toBe('Ilhabela, SP')
  })

  it.each([
    'calendar_events',
    'trips',
    'trip_departures',
    'trip_days',
    'trip_itinerary_items',
    'trip_prep_items',
    'trip_budget_lines',
    'trip_memories',
    'trip_photos',
  ])('%s falhou: o todo é `error`, nunca viagens sem aquela parte', async (table) => {
    const { db } = fakeDb({ responses: { [`${table}.select`]: { data: null, error: { message: 'pausado' } } } })
    expect(await loadTrips(db)).toEqual({ status: 'error', cause: 'pausado' })
  })

  it('pagina além das 1000 fotos (o corte do PostgREST não é o acervo)', async () => {
    const photo = (i: number) => ({
      id: `p${i}`,
      trip_id: 'ev-1',
      couple_id: 'couple-1',
      path: `couple-1/trip/p${i}.webp`,
      taken_on: null,
      caption: null,
      favorite: false,
      added_by: null,
      created_at: 'x',
    })
    const { db, log } = fakeDb({
      responses: {
        'calendar_events.select': { data: [eventRow], error: null },
        'trip_photos.select': (range) => ({
          data: range![0] === 0 ? Array.from({ length: PAGE_SIZE }, (_, i) => photo(i)) : [photo(PAGE_SIZE)],
          error: null,
        }),
      },
    })
    const result = await loadTrips(db)
    expect(log).toContain('trip_photos.select[1000-1999]')
    expect(result.status === 'ok' && result.rows.trips[0].photos).toHaveLength(PAGE_SIZE + 1)
  })

  it('os itens da Lista vêm inteiros', async () => {
    const { db } = fakeDb({ responses: { 'list_items.select': { data: null, error: { message: 'caiu' } } } })
    expect(await loadTripListItems(db)).toEqual({ status: 'error', cause: 'caiu' })
  })
})

describe('createTrip (R25)', () => {
  it('manda o payload normalizado para `create_trip` e devolve o id', async () => {
    const { db, payloads } = fakeDb()
    const result = await createTrip(db, { ...DRAFT, title: '  Florianópolis, SC ', note: '  ', lodgingName: ' Pousada na Lagoa ' })
    expect(result).toEqual({ status: 'ok', value: { id: 'ev-new' } })
    expect(payloads['rpc:create_trip']).toEqual({
      p_trip: {
        title: 'Florianópolis, SC',
        city_id: 'c-floripa',
        starts_on: '2027-01-08',
        ends_on: '2027-01-14',
        // Só-espaço é "sem nota", não nota em branco.
        note: null,
        lodging_name: 'Pousada na Lagoa',
        departures: [
          { profile_id: 'u-gabriel', origin_code: null, note: null },
          { profile_id: 'u-lana', origin_code: null, note: 'voo POA → FLN · 55min' },
        ],
      },
    })
  })

  it('o domínio recusa antes da rede: volta antes da ida, saída longa demais', async () => {
    const { db, log } = fakeDb()
    expect(await createTrip(db, { ...DRAFT, endsOn: '2027-01-01' })).toMatchObject({ status: 'rejected', field: 'endsOn' })
    const long = { ...DRAFT, departures: [{ profileId: 'u-lana', originCode: 'x'.repeat(TRIP_LIMITS.originCode + 1), note: null }] }
    expect(await createTrip(db, long)).toMatchObject({ status: 'rejected', field: 'departures.originCode' })
    expect(log).toEqual([])
  })

  it('not_member, 42501 (sem sessão na RPC), CHECK e resposta sem id', async () => {
    expect(await createTrip(fakeDb({ rpc: { data: { status: 'not_member' }, error: null } }).db, DRAFT)).toEqual({ status: 'not_member' })
    expect(await createTrip(fakeDb({ rpc: { data: null, error: { code: '42501', message: 'x' } } }).db, DRAFT)).toEqual({
      status: 'unauthenticated',
    })
    expect(await createTrip(fakeDb({ rpc: { data: null, error: check('trip_member') } }).db, DRAFT)).toMatchObject({
      status: 'invalid',
      constraint: 'trip_member',
    })
    expect(await createTrip(fakeDb({ rpc: { data: { status: 'ok' }, error: null } }).db, DRAFT)).toEqual({
      status: 'error',
      cause: 'create_trip: resposta sem id',
    })
  })
})

describe('updateTripEvent (R26)', () => {
  it('grava a linha inteira do evento pelo update do Calendário, mantendo o que a viagem não edita', async () => {
    const { db, payloads, log } = fakeDb({ responses: { 'calendar_events.update': { data: [{ id: 'ev-1' }], error: null } } })
    const result = await updateTripEvent(db, EVENT, {
      title: 'Ilhabela com a família',
      cityId: 'c-ilhabela',
      startsOn: '2026-07-12',
      endsOn: '2026-07-20',
      note: '',
    })
    expect(result).toEqual({ status: 'ok', value: null })
    expect(log).toEqual(['calendar_events.update id=ev-1'])
    expect(payloads['calendar_events.update']).toMatchObject({
      title: 'Ilhabela com a família',
      ends_on: '2026-07-20',
      note: null,
      // Do evento como estava: horas, quem viaja.
      all_day: false,
      starts_at: '07:00',
      ends_at: '21:30',
      travelers: 'both',
    })
    // Nunca pinta (ADR 0018).
    expect(log.some((l) => l.startsWith('rpc:'))).toBe(false)
  })

  it('zero linhas (a outra pessoa apagou) não é `ok`', async () => {
    const { db } = fakeDb({ responses: { 'calendar_events.update': { data: [], error: null } } })
    const result = await updateTripEvent(db, EVENT, { title: 'x', cityId: 'c', startsOn: '2026-07-12', endsOn: '2026-07-19', note: null })
    expect(result.status).toBe('error')
  })
})

describe('updateTrip (R20d, R22)', () => {
  it('hospedagem normalizada e validada; link sem http recusado antes da rede', async () => {
    const { db, log } = fakeDb()
    expect(await updateTrip(db, 'ev-1', { lodging: { ...EMPTY_LODGING, url: 'casadolargo.pt' } })).toMatchObject({
      status: 'rejected',
      field: 'url',
    })
    expect(log).toEqual([])
  })

  it('grava só as colunas pedidas; zero linhas → not_found', async () => {
    const ok = fakeDb({ responses: { 'trips.update': { data: [{ event_id: 'ev-1' }], error: null } } })
    expect(await updateTrip(ok.db, 'ev-1', { coverPhotoId: 'p1' })).toEqual({ status: 'ok', value: null })
    expect(ok.payloads['trips.update']).toEqual({ cover_photo_id: 'p1' })
    expect(ok.log).toEqual(['trips.update event_id=ev-1'])
    const gone = fakeDb({ responses: { 'trips.update': { data: [], error: null } } })
    expect(await updateTrip(gone.db, 'ev-1', { coverPhotoId: null })).toEqual({ status: 'not_found' })
  })
})

describe('deleteTrip (seção 7)', () => {
  const trip = { id: 'ev-1', photos: [{ path: 'couple-1/trip/a.webp' }] } as never

  it('arquivos (os da tela + os que o banco diz agora) e só depois o evento', async () => {
    const { db, log } = fakeDb({
      responses: { 'trip_photos.select': { data: [{ path: 'couple-1/trip/a.webp' }, { path: 'couple-1/trip/nova.webp' }], error: null } },
    })
    expect(await deleteTrip(db, trip)).toEqual({ status: 'ok' })
    expect(log).toEqual([
      'trip_photos.select[0-999] trip_id=ev-1',
      'remove:couple-1/trip/a.webp,couple-1/trip/nova.webp',
      'calendar_events.delete id=ev-1',
    ])
  })

  it('o Storage falhou: para, nada no banco é apagado', async () => {
    const { db, log } = fakeDb({ removeError: 'storage fora' })
    expect(await deleteTrip(db, trip)).toEqual({ status: 'error', cause: 'storage fora' })
    expect(log.some((l) => l.startsWith('calendar_events'))).toBe(false)
  })

  it('a releitura das fotos falhou: nada é apagado', async () => {
    const { db, log } = fakeDb({ responses: { 'trip_photos.select': { data: null, error: { message: 'caiu' } } } })
    expect(await deleteTrip(db, trip)).toEqual({ status: 'error', cause: 'caiu' })
    expect(log.some((l) => l.startsWith('remove') || l.startsWith('calendar_events'))).toBe(false)
  })

  it('os arquivos saíram e o evento não: diz a verdade', async () => {
    const { db } = fakeDb({ responses: { 'calendar_events.delete': { data: null, error: { message: 'timeout' } } } })
    expect(await deleteTrip(db, trip)).toEqual({ status: 'files_deleted_row_failed', cause: 'timeout' })
  })
})

describe('título do dia, roteiro, preparação, memória e saídas', () => {
  it('título vazio apaga; preenchido faz upsert por (trip_id, day)', async () => {
    const { db, log, payloads } = fakeDb()
    await setDayTitle(db, KEY, '2026-07-12', '   ')
    expect(log).toEqual(['trip_days.delete trip_id=ev-1 day=2026-07-12'])
    await setDayTitle(db, KEY, '2026-07-12', ' Chegada ')
    expect(payloads['trip_days.upsert']).toEqual({ trip_id: 'ev-1', couple_id: 'couple-1', day: '2026-07-12', title: 'Chegada' })
    expect(payloads['trip_days.onConflict']).toBe('trip_id,day')
    expect(await setDayTitle(db, KEY, '2026-07-12', 'x'.repeat(TRIP_LIMITS.dayTitle + 1))).toMatchObject({ status: 'rejected' })
  })

  it('item do roteiro: validado, com a position pedida; o dia fora da viagem vem com o nome da regra', async () => {
    const row = { id: 'it-1', trip_id: 'ev-1', couple_id: 'couple-1', day: '2026-07-13', at: '08:00:00', title: 'Trilha', kind: 'parque', note: null, list_item_id: null, position: 4, created_by: 'u-gabriel', created_at: 'x' }
    const { db, payloads } = fakeDb({ responses: { 'trip_itinerary_items.insert': { data: row, error: null } } })
    const draft = { day: '2026-07-13', at: '08:00', title: ' Trilha ', kind: 'parque' as const, note: '', listItemId: null }
    const result = await createItinerary(db, KEY, draft, 4)
    expect(result).toMatchObject({ status: 'ok', value: { id: 'it-1', at: '08:00', position: 4 } })
    expect(payloads['trip_itinerary_items.insert']).toMatchObject({ title: 'Trilha', note: null, position: 4 })

    expect(await createItinerary(fakeDb().db, KEY, { ...draft, title: '' })).toMatchObject({ status: 'rejected', field: 'title' })
    const outside = fakeDb({ responses: { 'trip_itinerary_items.insert': { data: null, error: check('trip_itinerary_day_in_trip') } } })
    expect(await createItinerary(outside.db, KEY, draft)).toMatchObject({ status: 'invalid', constraint: 'trip_itinerary_day_in_trip' })
    const gone = fakeDb({ responses: { 'trip_itinerary_items.update': { data: [], error: null } } })
    expect(await updateItinerary(gone.db, 'it-1', draft)).toEqual({ status: 'not_found' })
  })

  it('alternar a preparação grava só `done`', async () => {
    const row = { id: 'pp-1', trip_id: 'ev-1', couple_id: 'couple-1', kind: 'malas', label: 'Malas', detail: null, done: true, position: 4 }
    const { db, payloads } = fakeDb({ responses: { 'trip_prep_items.update': { data: [row], error: null } } })
    expect(await setPrepDone(db, 'pp-1', true)).toMatchObject({ status: 'ok', value: { id: 'pp-1', done: true } })
    expect(payloads['trip_prep_items.update']).toEqual({ done: true })
  })

  it('memória: a PRÓPRIA (profile_id = a sessão), upsert por (trip_id, profile_id)', async () => {
    const row = { trip_id: 'ev-1', couple_id: 'couple-1', profile_id: 'u-gabriel', rating: 5, body: 'Lindo', written_on: '2026-07-21', updated_at: 'x' }
    const { db, payloads } = fakeDb({ responses: { 'trip_memories.upsert': { data: row, error: null } } })
    expect(await saveTripMemory(db, KEY, { rating: 5, body: ' Lindo ' })).toMatchObject({ status: 'ok', value: { profileId: 'u-gabriel' } })
    expect(payloads['trip_memories.upsert']).toEqual({ trip_id: 'ev-1', couple_id: 'couple-1', profile_id: 'u-gabriel', rating: 5, body: 'Lindo' })
    expect(payloads['trip_memories.onConflict']).toBe('trip_id,profile_id')
    expect(await saveTripMemory(db, KEY, { rating: 6, body: 'x' })).toMatchObject({ status: 'rejected', field: 'rating' })
  })

  it('saídas: todas validadas antes de gravar qualquer uma', async () => {
    const { db, log } = fakeDb()
    const bad = [{ profileId: 'u-gabriel', originCode: 'GRU', note: null }, { profileId: 'u-lana', originCode: 'POA', note: 'x'.repeat(81) }]
    expect(await saveDepartures(db, KEY, bad)).toMatchObject({ status: 'rejected', field: 'note' })
    expect(log).toEqual([])
  })

  it('legenda: vazia apaga (null)', async () => {
    const { db, payloads } = fakeDb({ responses: { 'trip_photos.update': { data: [], error: null } } })
    expect(await setPhotoCaption(db, 'p1', '  ')).toEqual({ status: 'not_found' })
    expect(payloads['trip_photos.update']).toEqual({ caption: null })
  })
})

describe('fotos (R21, R22, R25)', () => {
  const ok = vi.fn(async (): Promise<PrepareResult> => ({ status: 'ok', blob: new Blob(['x']), extension: 'webp' }))
  const file = (name: string, lastModified = new Date(2026, 6, 14, 10).getTime(), type = 'image/jpeg') =>
    new File(['x'], name, { type, lastModified })
  const photoRow = (path: string) => ({
    id: `id-${path}`,
    trip_id: 'ev-1',
    couple_id: 'couple-1',
    path,
    taken_on: null,
    caption: null,
    favorite: false,
    added_by: 'u-gabriel',
    created_at: 'x',
  })

  it('taken_on: a data do arquivo só quando cai dentro da viagem', () => {
    expect(takenOnFor(TARGET, file('a', new Date(2026, 6, 14, 23, 50).getTime()))).toBe('2026-07-14')
    expect(takenOnFor(TARGET, file('a', new Date(2026, 6, 20, 9).getTime()))).toBeNull()
    expect(takenOnFor(TARGET, { lastModified: 0 })).toBeNull()
  })

  it('cada arquivo é independente: o que falha não para os outros; o arquivo sem linha sai', async () => {
    let inserts = 0
    const { db, log } = fakeDb({
      uploadFails: (n) => n === 1,
      responses: {
        'trip_photos.insert': () => {
          inserts++
          // A segunda linha a chegar bate no teto de 500.
          return inserts === 2 ? { data: null, error: check('trip_photos_limit') } : { data: photoRow(`p${inserts}`), error: null }
        },
      },
    })
    const prepare = vi.fn(async (f: File): Promise<PrepareResult> => (f.name === 'ruim' ? { status: 'not_image' } : ok()))
    const progress: string[] = []
    const result = await uploadTripPhotos(db, TARGET, [file('a'), file('b'), file('ruim'), file('c')], {
      prepare,
      onProgress: (k, n) => progress.push(`${k}/${n}`),
    })
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.added).toHaveLength(1)
    expect(result.failed.map((f) => f.reason).sort()).toEqual(['not_image', 'row_failed', 'upload_failed'])
    expect(result.failed.find((f) => f.reason === 'row_failed')?.cause).toBe('trip_photos_limit')
    expect(progress).toEqual(['1/4', '2/4', '3/4', '4/4'])
    // O arquivo que subiu e não virou linha foi removido; o caminho é da pasta `trip`.
    const removed = log.filter((l) => l.startsWith('remove:'))
    expect(removed).toHaveLength(1)
    expect(log.filter((l) => l.startsWith('upload:')).every((l) => /^upload:couple-1\/trip\/[0-9a-f-]{36}\.webp$/.test(l))).toBe(true)
  })

  it('a linha leva o taken_on do arquivo', async () => {
    const { db, payloads } = fakeDb({ responses: { 'trip_photos.insert': { data: photoRow('p'), error: null } } })
    await uploadTripPhotos(db, TARGET, [file('a')], { prepare: ok })
    expect(payloads['trip_photos.insert']).toMatchObject({ trip_id: 'ev-1', couple_id: 'couple-1', taken_on: '2026-07-14', caption: null })
  })

  it(`mais de ${TRIP_LIMITS.photosPerUpload} de uma vez: recusado antes de subir qualquer uma`, async () => {
    const { db, log } = fakeDb()
    const many = Array.from({ length: TRIP_LIMITS.photosPerUpload + 1 }, (_, i) => file(`f${i}`))
    expect(await uploadTripPhotos(db, TARGET, many, { prepare: ok })).toMatchObject({ status: 'rejected', field: 'files' })
    expect(log).toEqual([])
  })

  it('capa: sobe, insere e aponta; se apontar falhar, a foto sai (linha e arquivo)', async () => {
    const good = fakeDb({
      responses: {
        'trip_photos.insert': { data: photoRow('couple-1/trip/c.webp'), error: null },
        'trips.update': { data: [{ event_id: 'ev-1' }], error: null },
      },
    })
    expect(await uploadTripCover(good.db, TARGET, file('capa'), ok)).toMatchObject({ status: 'ok' })
    expect(good.payloads['trips.update']).toEqual({ cover_photo_id: 'id-couple-1/trip/c.webp' })

    const bad = fakeDb({
      responses: {
        'trip_photos.insert': { data: photoRow('couple-1/trip/c.webp'), error: null },
        'trips.update': { data: [], error: null },
      },
    })
    expect(await uploadTripCover(bad.db, TARGET, file('capa'), ok)).toEqual({ status: 'not_found' })
    expect(bad.log.slice(-2)).toEqual(['trip_photos.delete id=id-couple-1/trip/c.webp', 'remove:couple-1/trip/c.webp'])
  })

  it('capa que nem subiu: `photo_failed`, e nada é apontado', async () => {
    const { db, log } = fakeDb({ uploadFails: () => true })
    expect(await uploadTripCover(db, TARGET, file('capa'), ok)).toMatchObject({ status: 'photo_failed', failure: { reason: 'upload_failed' } })
    expect(log.some((l) => l.startsWith('trips.update'))).toBe(false)
  })

  it('apagar foto: arquivo, depois linha; o arquivo não saiu → a linha fica', async () => {
    const { db, log } = fakeDb()
    expect(await deleteTripPhoto(db, { id: 'p1', path: 'couple-1/trip/p1.webp' })).toEqual({ status: 'ok', value: null })
    expect(log).toEqual(['remove:couple-1/trip/p1.webp', 'trip_photos.delete id=p1'])

    const stuck = fakeDb({ removeError: 'fora' })
    expect(await deleteTripPhoto(stuck.db, { id: 'p1', path: 'couple-1/trip/p1.webp' })).toEqual({ status: 'error', cause: 'fora' })
    expect(stuck.log).toEqual(['remove:couple-1/trip/p1.webp'])
  })
})
