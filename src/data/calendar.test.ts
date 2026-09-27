// Fronteira de dados do Calendário — a tradução de erro do PostgREST, o
// mapeamento de linha e os casos do 💋, com um `db` falso mínimo (só o que as
// funções usam). O que o banco REALMENTE responde está em
// supabase/tests/calendar.test.ts.
// Spec: .agent/Tasks/fase-5-calendario.md, seções 5, 6 e 7

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EventDraft } from '../domain/calendar'
import type { Database } from '../lib/database.types'
import {
  addKiss,
  constraintName,
  createEvent,
  deleteEvent,
  loadCalendar,
  loadCalendarExport,
  loadKisses,
  paint,
  removeKiss,
  translateCalendarError,
  updateEvent,
} from './calendar'
import type { CalendarEventRow } from './calendarRow'
import { PAGE_SIZE } from './paginate'

type PgError = { code?: string; message: string; hint?: string | null; details?: string | null }
type Response = { data: unknown; error: PgError | null }

interface FakeOptions {
  session?: boolean
  /** `"tabela.op"` → resposta, ou função do `.range(from, to)` pedido. Padrão `{ data: [], error: null }`. */
  responses?: Record<string, Response | ((range: [number, number] | null) => Response)>
  rpc?: Response
}

/** Um cliente falso que registra cada operação que chega ao "banco", com os filtros. */
function fakeDb(options: FakeOptions = {}) {
  const log: string[] = []
  const payloads: Record<string, unknown> = {}

  function from(table: string) {
    let op = 'select'
    let range: [number, number] | null = null
    const filters: string[] = []
    const builder = {
      select: (cols?: string) => ((payloads[`${table}.select`] ??= cols ?? '*'), builder),
      insert: (v: unknown) => ((op = 'insert'), (payloads[`${table}.insert`] = v), builder),
      update: (v: unknown) => ((op = 'update'), (payloads[`${table}.update`] = v), builder),
      delete: () => ((op = 'delete'), builder),
      eq: (col: string, v: unknown) => (filters.push(`${col}=${String(v)}`), builder),
      gte: (col: string, v: unknown) => (filters.push(`${col}>=${String(v)}`), builder),
      lte: (col: string, v: unknown) => (filters.push(`${col}<=${String(v)}`), builder),
      order: (col: string, o?: { ascending?: boolean }) => (filters.push(`order:${col}${o?.ascending === false ? ':desc' : ''}`), builder),
      limit: (n: number) => (filters.push(`limit:${n}`), builder),
      range: (a: number, b: number) => ((range = [a, b]), builder),
      then(resolve: (r: Response) => unknown, reject: (e: unknown) => unknown) {
        log.push(`${table}.${op}${range ? `[${range[0]}-${range[1]}]` : ''}${filters.length ? ` ${filters.join(' ')}` : ''}`)
        const response = options.responses?.[`${table}.${op}`]
        const value = typeof response === 'function' ? response(range) : response
        return Promise.resolve(value ?? { data: [], error: null }).then(resolve, reject)
      },
    }
    return builder
  }

  const db = {
    auth: {
      getSession: async () => ({ data: { session: options.session === false ? null : { user: { id: 'u-gabriel' } } } }),
    },
    from,
    rpc: vi.fn(async (fn: string, args: unknown) => {
      log.push(`rpc:${fn}`)
      payloads[`rpc:${fn}`] = args
      return options.rpc ?? { data: { status: 'ok' }, error: null }
    }),
  }
  return { db: db as unknown as SupabaseClient<Database>, log, payloads }
}

const TRIP: EventDraft = {
  kind: 'viagem',
  title: 'Lisboa',
  startsOn: '2026-10-10',
  endsOn: '2026-10-20',
  allDay: false,
  startsAt: '08:30',
  endsAt: '22:15',
  travelers: 'both',
  travelerId: null,
  cityId: 'city-lisboa',
  place: null,
  repeatsYearly: false,
  note: 'Pastéis',
  listItemId: 'item-1',
}

const EVENT_ROW: CalendarEventRow = {
  id: 'ev-1',
  couple_id: 'couple-1',
  kind: 'viagem',
  title: 'Lisboa',
  starts_on: '2026-10-10',
  ends_on: '2026-10-20',
  all_day: false,
  starts_at: '08:30:00',
  ends_at: '22:15:00',
  travelers: 'both',
  traveler_id: null,
  city_id: 'city-lisboa',
  place: null,
  repeats_yearly: false,
  note: 'Pastéis',
  list_item_id: 'item-1',
  created_by: 'u-gabriel',
  created_at: '2026-09-26T12:00:00Z',
  updated_at: '2026-09-26T12:00:00Z',
}

const check = (name: string): PgError => ({
  code: '23514',
  message: `new row for relation "calendar_events" violates check constraint "${name}"`,
})
const trigger = (name: string): PgError => ({ code: '23514', message: 'recusado pela regra', hint: name })

// ---------------------------------------------------------------------------
// Tradução de erro
// ---------------------------------------------------------------------------

describe('translateCalendarError — o nome da regra chega à tela (seção 6)', () => {
  it('CHECK declarado: o nome sai da mensagem', () => {
    expect(translateCalendarError(check('calendar_events_format'), 'rpc')).toEqual({
      status: 'invalid',
      constraint: 'calendar_events_format',
    })
  })

  it('trigger: o nome sai do HINT (o `constraint` do RAISE não chega ao cliente)', () => {
    expect(translateCalendarError(trigger('stays_member'), 'rpc')).toEqual({ status: 'invalid', constraint: 'stays_member' })
    expect(translateCalendarError(trigger('calendar_events_city'), 'write')).toEqual({
      status: 'invalid',
      constraint: 'calendar_events_city',
    })
  })

  it('o nome em `details` também serve', () => {
    expect(constraintName({ code: '23514', message: 'x', details: 'Failing row violates check constraint "cities_region"' })).toBe(
      'cities_region',
    )
  })

  it('23P01 `stays_no_overlap` → `invalid` com o nome (na pintura é bug e aparece nomeado)', () => {
    const error = {
      code: '23P01',
      message: 'conflicting key value violates exclusion constraint "stays_no_overlap"',
      details: 'Key (profile_id, daterange(...)) conflicts with existing key',
    }
    expect(translateCalendarError(error, 'rpc')).toEqual({ status: 'invalid', constraint: 'stays_no_overlap' })
  })

  it('23514 sem nome em lugar nenhum → `invalid` com o código, nunca `ok` nem `error` genérico', () => {
    expect(translateCalendarError({ code: '23514', message: 'recusado' }, 'rpc')).toEqual({
      status: 'invalid',
      constraint: '23514',
    })
  })

  it('42501: sem sessão na RPC; a policy recusando numa escrita direta → `not_member`', () => {
    const denied = { code: '42501', message: 'new row violates row-level security policy' }
    expect(translateCalendarError(denied, 'rpc')).toEqual({ status: 'unauthenticated' })
    expect(translateCalendarError(denied, 'read')).toEqual({ status: 'unauthenticated' })
    expect(translateCalendarError(denied, 'write')).toEqual({ status: 'not_member' })
  })

  it('JWT vencido (PGRST301) → `unauthenticated`', () => {
    expect(translateCalendarError({ code: 'PGRST301', message: 'JWT expired' }, 'write')).toEqual({ status: 'unauthenticated' })
  })

  it('o resto (22023 da entrada malformada, rede) → `error` com a causa', () => {
    expect(translateCalendarError({ code: '22023', message: 'entrada malformada' }, 'rpc')).toEqual({
      status: 'error',
      cause: 'entrada malformada',
    })
    expect(translateCalendarError({ code: '', message: 'TypeError: Failed to fetch' }, 'rpc')).toEqual({
      status: 'error',
      cause: 'TypeError: Failed to fetch',
    })
  })
})

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

describe('loadCalendar', () => {
  it('eventos e itens em paralelo, sem filtro de casal, com a linha em camelCase e a hora em HH:MM', async () => {
    const { db, log, payloads } = fakeDb({
      responses: {
        'calendar_events.select': { data: [EVENT_ROW], error: null },
        'list_items.select': { data: [{ id: 'item-1', name: 'Pastéis de Belém', category: 'comida' }], error: null },
      },
    })
    const result = await loadCalendar(db)
    expect(result).toEqual({
      status: 'ok',
      rows: {
        events: [
          {
            id: 'ev-1',
            kind: 'viagem',
            title: 'Lisboa',
            startsOn: '2026-10-10',
            endsOn: '2026-10-20',
            allDay: false,
            startsAt: '08:30',
            endsAt: '22:15',
            travelers: 'both',
            travelerId: null,
            cityId: 'city-lisboa',
            place: null,
            repeatsYearly: false,
            note: 'Pastéis',
            listItemId: 'item-1',
            createdBy: 'u-gabriel',
          },
        ],
        listItems: [{ id: 'item-1', name: 'Pastéis de Belém', category: 'comida' }],
      },
    })
    // Só o necessário do item; nenhuma query filtra por casal.
    expect(payloads['list_items.select']).toBe('id, name, category')
    expect(log.join('\n')).not.toContain('couple_id')
  })

  it('hora nula continua nula (evento de dia inteiro)', async () => {
    const { db } = fakeDb({
      responses: {
        'calendar_events.select': { data: [{ ...EVENT_ROW, all_day: true, starts_at: null, ends_at: null }], error: null },
      },
    })
    const result = await loadCalendar(db)
    expect(result.status === 'ok' && [result.rows.events[0].startsAt, result.rows.events[0].endsAt]).toEqual([null, null])
  })

  it('pagina até o fim: 1000 eventos não são "todos"', async () => {
    const { db, log } = fakeDb({
      responses: {
        'calendar_events.select': (range) => ({
          data: Array.from({ length: range && range[0] === 0 ? PAGE_SIZE : 3 }, (_, i) => ({ ...EVENT_ROW, id: `ev-${range?.[0]}-${i}` })),
          error: null,
        }),
      },
    })
    const result = await loadCalendar(db)
    expect(result.status === 'ok' && result.rows.events).toHaveLength(PAGE_SIZE + 3)
    expect(log.filter((l) => l.startsWith('calendar_events.select'))).toHaveLength(2)
  })

  it('uma leitura que falha derruba o todo — nunca um calendário sem eventos como se não houvesse', async () => {
    const { db } = fakeDb({ responses: { 'list_items.select': { data: null, error: { message: 'Failed to fetch' } } } })
    expect(await loadCalendar(db)).toEqual({ status: 'error', cause: 'Failed to fetch' })
  })

  it('sem sessão → `unauthenticated`, sem ler nada (a RLS devolveria zero linhas, não erro)', async () => {
    const { db, log } = fakeDb({ session: false })
    expect(await loadCalendar(db)).toEqual({ status: 'unauthenticated' })
    expect(log).toEqual([])
  })
})

describe('loadKisses', () => {
  it('janela inclusiva por `day`, agregada por dia', async () => {
    const { db, log } = fakeDb({
      responses: {
        'day_kisses.select': {
          data: [
            { id: 'k1', day: '2026-09-01' },
            { id: 'k2', day: '2026-09-01' },
            { id: 'k3', day: '2026-09-03' },
          ],
          error: null,
        },
      },
    })
    const result = await loadKisses(db, '2026-08-31', '2026-10-11')
    expect(result).toEqual({ status: 'ok', rows: new Map([['2026-09-01', 2], ['2026-09-03', 1]]) })
    expect(log[0]).toContain('day>=2026-08-31 day<=2026-10-11')
    expect(log[0]).not.toContain('couple_id')
  })

  it('falha → `error`, nunca um mapa vazio (a tela não mostra 0 sem ter lido)', async () => {
    const { db } = fakeDb({ responses: { 'day_kisses.select': { data: null, error: { message: 'Failed to fetch' } } } })
    expect(await loadKisses(db, '2026-09-01', '2026-09-30')).toEqual({ status: 'error', cause: 'Failed to fetch' })
  })

  it('sem sessão → `unauthenticated`', async () => {
    const { db } = fakeDb({ session: false })
    expect(await loadKisses(db, '2026-09-01', '2026-09-30')).toEqual({ status: 'unauthenticated' })
  })
})

// ---------------------------------------------------------------------------
// Pintura e eventos
// ---------------------------------------------------------------------------

describe('paint', () => {
  it('`to` vai SEMPRE como chave — nula quando em aberto', async () => {
    const { db, payloads } = fakeDb()
    const result = await paint(db, [
      { profileId: 'u-gabriel', cityId: 'city-sjc', from: '2026-09-01', to: null },
      { profileId: 'u-lana', cityId: 'city-marau', from: '2026-09-01', to: '2026-09-30' },
    ])
    expect(result).toEqual({ status: 'ok' })
    const args = payloads['rpc:paint_stays'] as { p_entries: Record<string, unknown>[] }
    expect(args.p_entries).toEqual([
      { profile_id: 'u-gabriel', city_id: 'city-sjc', from: '2026-09-01', to: null },
      { profile_id: 'u-lana', city_id: 'city-marau', from: '2026-09-01', to: '2026-09-30' },
    ])
    expect(Object.keys(args.p_entries[0])).toContain('to')
    // E sobrevive à serialização do fetch: `undefined` sumiria do JSON.
    expect(JSON.stringify(args)).toContain('"to":null')
  })

  it('zero entradas → `ok` sem chamar o banco', async () => {
    const { db, log } = fakeDb()
    expect(await paint(db, [])).toEqual({ status: 'ok' })
    expect(log).toEqual([])
  })

  it('`{status: not_member}` do banco → `not_member`', async () => {
    const { db } = fakeDb({ rpc: { data: { status: 'not_member' }, error: null } })
    expect(await paint(db, [{ profileId: 'p', cityId: 'c', from: '2026-09-01', to: null }])).toEqual({ status: 'not_member' })
  })

  it('perfil de fora do casal (trigger `stays_member`) → `invalid` com o nome', async () => {
    const { db } = fakeDb({ rpc: { data: null, error: trigger('stays_member') } })
    expect(await paint(db, [{ profileId: 'p', cityId: 'c', from: '2026-09-01', to: null }])).toEqual({
      status: 'invalid',
      constraint: 'stays_member',
    })
  })

  it('42501 da RPC → `unauthenticated`', async () => {
    const { db } = fakeDb({ rpc: { data: null, error: { code: '42501', message: 'paint_stays sem sessão' } } })
    expect(await paint(db, [{ profileId: 'p', cityId: 'c', from: '2026-09-01', to: null }])).toEqual({
      status: 'unauthenticated',
    })
  })

  it('resposta sem `status: ok` nunca é `ok`', async () => {
    const { db } = fakeDb({ rpc: { data: { status: 'huh' }, error: null } })
    const result = await paint(db, [{ profileId: 'p', cityId: 'c', from: '2026-09-01', to: null }])
    expect(result.status).toBe('error')
  })
})

describe('createEvent', () => {
  it('manda a linha em snake_case e a flag de pintura; devolve o id', async () => {
    const { db, payloads } = fakeDb({ rpc: { data: { status: 'ok', id: 'ev-9' }, error: null } })
    expect(await createEvent(db, 'couple-1', TRIP, true)).toEqual({ status: 'ok', value: { id: 'ev-9' } })
    expect(payloads['rpc:create_event']).toEqual({
      p_event: {
        couple_id: 'couple-1',
        kind: 'viagem',
        title: 'Lisboa',
        starts_on: '2026-10-10',
        ends_on: '2026-10-20',
        all_day: false,
        starts_at: '08:30',
        ends_at: '22:15',
        travelers: 'both',
        traveler_id: null,
        city_id: 'city-lisboa',
        place: null,
        repeats_yearly: false,
        note: 'Pastéis',
        list_item_id: 'item-1',
      },
      p_paint: true,
    })
  })

  it('`calendar_events_format` → `invalid` com o nome', async () => {
    const { db } = fakeDb({ rpc: { data: null, error: check('calendar_events_format') } })
    expect(await createEvent(db, 'couple-1', TRIP, true)).toEqual({ status: 'invalid', constraint: 'calendar_events_format' })
  })

  it('`not_member` e resposta sem id', async () => {
    const notMember = fakeDb({ rpc: { data: { status: 'not_member' }, error: null } })
    expect(await createEvent(notMember.db, 'couple-1', TRIP, false)).toEqual({ status: 'not_member' })
    const noId = fakeDb({ rpc: { data: { status: 'ok' }, error: null } })
    expect((await createEvent(noId.db, 'couple-1', TRIP, false)).status).toBe('error')
  })

  it('sem sessão → `unauthenticated`, sem chamar a RPC', async () => {
    const { db, log } = fakeDb({ session: false })
    expect(await createEvent(db, 'couple-1', TRIP, true)).toEqual({ status: 'unauthenticated' })
    expect(log).toEqual([])
  })
})

describe('updateEvent / deleteEvent', () => {
  it('update direto por id, sem casal nem tipo no patch', async () => {
    const { db, log, payloads } = fakeDb({ responses: { 'calendar_events.update': { data: [{ id: 'ev-1' }], error: null } } })
    expect(await updateEvent(db, 'ev-1', TRIP)).toEqual({ status: 'ok' })
    expect(log).toEqual(['calendar_events.update id=ev-1'])
    const patch = payloads['calendar_events.update'] as Record<string, unknown>
    expect(patch).not.toHaveProperty('couple_id')
    expect(patch).not.toHaveProperty('kind')
    expect(patch.starts_at).toBe('08:30')
  })

  it('update de zero linhas (a outra pessoa apagou) → `error`, nunca `ok`', async () => {
    const { db } = fakeDb({ responses: { 'calendar_events.update': { data: [], error: null } } })
    expect((await updateEvent(db, 'ev-1', TRIP)).status).toBe('error')
  })

  it('update recusado pelo trigger (`calendar_events_member`) → `invalid`', async () => {
    const { db } = fakeDb({ responses: { 'calendar_events.update': { data: null, error: trigger('calendar_events_member') } } })
    expect(await updateEvent(db, 'ev-1', TRIP)).toEqual({ status: 'invalid', constraint: 'calendar_events_member' })
  })

  it('delete por id; zero linhas é `ok` (idempotente)', async () => {
    const { db, log } = fakeDb({ responses: { 'calendar_events.delete': { data: [], error: null } } })
    expect(await deleteEvent(db, 'ev-1')).toEqual({ status: 'ok' })
    expect(log).toEqual(['calendar_events.delete id=ev-1'])
  })

  it('delete com falha de rede → `error`', async () => {
    const { db } = fakeDb({ responses: { 'calendar_events.delete': { data: null, error: { message: 'Failed to fetch' } } } })
    expect(await deleteEvent(db, 'ev-1')).toEqual({ status: 'error', cause: 'Failed to fetch' })
  })
})

// ---------------------------------------------------------------------------
// 💋
// ---------------------------------------------------------------------------

describe('addKiss', () => {
  it('insere casal e dia; `added_by` fica com o default do banco', async () => {
    const { db, payloads } = fakeDb()
    expect(await addKiss(db, 'couple-1', '2026-09-26')).toEqual({ status: 'ok' })
    expect(payloads['day_kisses.insert']).toEqual({ couple_id: 'couple-1', day: '2026-09-26' })
  })

  it('`day_kisses_limit` → `kiss_limit`; `day_kisses_future` → `kiss_future`', async () => {
    const limit = fakeDb({ responses: { 'day_kisses.insert': { data: null, error: trigger('day_kisses_limit') } } })
    expect(await addKiss(limit.db, 'couple-1', '2026-09-26')).toEqual({ status: 'kiss_limit' })
    const future = fakeDb({ responses: { 'day_kisses.insert': { data: null, error: trigger('day_kisses_future') } } })
    expect(await addKiss(future.db, 'couple-1', '2026-12-25')).toEqual({ status: 'kiss_future' })
  })

  it('policy recusou (saiu do casal) → `error` com "recarregue" (o 💋 não tem `not_member`)', async () => {
    const { db } = fakeDb({
      responses: { 'day_kisses.insert': { data: null, error: { code: '42501', message: 'row-level security' } } },
    })
    expect(await addKiss(db, 'couple-1', '2026-09-26')).toEqual({ status: 'error', cause: 'Este espaço mudou — recarregue' })
  })

  it('sem sessão → `unauthenticated`', async () => {
    const { db } = fakeDb({ session: false })
    expect(await addKiss(db, 'couple-1', '2026-09-26')).toEqual({ status: 'unauthenticated' })
  })
})

describe('removeKiss (R22)', () => {
  it('lê a mais recente do dia e apaga só ela, por id', async () => {
    const { db, log } = fakeDb({
      responses: {
        'day_kisses.select': { data: [{ id: 'k-latest' }], error: null },
        'day_kisses.delete': { data: [{ id: 'k-latest' }], error: null },
      },
    })
    expect(await removeKiss(db, '2026-09-26')).toEqual({ status: 'ok' })
    expect(log).toEqual([
      'day_kisses.select day=2026-09-26 order:created_at:desc order:id:desc limit:1',
      'day_kisses.delete id=k-latest',
    ])
  })

  it('dia sem linha → `nothing_to_remove`, sem delete', async () => {
    const { db, log } = fakeDb({ responses: { 'day_kisses.select': { data: [], error: null } } })
    expect(await removeKiss(db, '2026-09-26')).toEqual({ status: 'nothing_to_remove' })
    expect(log.some((l) => l.startsWith('day_kisses.delete'))).toBe(false)
  })

  it('a outra pessoa tirou entre a leitura e o delete (zero linhas apagadas) → `nothing_to_remove`', async () => {
    const { db } = fakeDb({
      responses: {
        'day_kisses.select': { data: [{ id: 'k-latest' }], error: null },
        'day_kisses.delete': { data: [], error: null },
      },
    })
    expect(await removeKiss(db, '2026-09-26')).toEqual({ status: 'nothing_to_remove' })
  })

  it('leitura falhou → `error`, nada apagado', async () => {
    const { db, log } = fakeDb({ responses: { 'day_kisses.select': { data: null, error: { message: 'Failed to fetch' } } } })
    expect(await removeKiss(db, '2026-09-26')).toEqual({ status: 'error', cause: 'Failed to fetch' })
    expect(log.some((l) => l.startsWith('day_kisses.delete'))).toBe(false)
  })
})

describe('loadCalendarExport (R24)', () => {
  it('💋 inteiros, sem janela, agregados em [{ day, count }]; eventos mapeados', async () => {
    const { db, log } = fakeDb({
      responses: {
        'day_kisses.select': {
          data: [
            { id: 'k1', day: '2025-02-14' },
            { id: 'k2', day: '2026-09-01' },
            { id: 'k3', day: '2026-09-01' },
          ],
          error: null,
        },
      },
    })
    const result = await loadCalendarExport(db)
    expect(result).toEqual({
      status: 'ok',
      rows: {
        events: [],
        kisses: [
          { day: '2025-02-14', count: 1 },
          { day: '2026-09-01', count: 2 },
        ],
      },
    })
    const kissQuery = log.find((l) => l.includes('day_kisses'))!
    expect(kissQuery).not.toMatch(/day>=|day<=/)
    expect(log.join(' ')).not.toContain('couple_id')
  })

  it('falha em qualquer leitura → a falha, nunca um arquivo sem 💋', async () => {
    const { db } = fakeDb({ responses: { 'day_kisses.select': { data: null, error: { message: 'Failed to fetch' } } } })
    expect(await loadCalendarExport(db)).toEqual({ status: 'error', cause: 'Failed to fetch' })
    expect(await loadCalendarExport(fakeDb({ session: false }).db)).toEqual({ status: 'unauthenticated' })
  })
})
