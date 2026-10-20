// Agenda e viagens. Leitura de `calendar_events` e `trips`, e criação dos
// eventos que NÃO pintam estadia (date, data especial, compromisso, lembrete)
// pela RPC `create_event` com `p_paint = false`. Viagem e visita ficam no app:
// elas pintam o período (ADR 0018) e a pintura tem regra demais para chegar
// pela conversa sem a prévia (spec seção 11).

import { ToolFailure, loadCouple } from './context.ts'
import type { Ctx } from './context.ts'
import { dbFailure } from './listTools.ts'

export const EVENT_KINDS = ['viagem', 'visita', 'date', 'data_especial', 'compromisso', 'lembrete'] as const
export const CREATABLE_KINDS = ['date', 'data_especial', 'compromisso', 'lembrete'] as const
export type CreatableKind = (typeof CREATABLE_KINDS)[number]

export const EVENT_LIMITS = { title: 80, note: 280, place: 80, spanDays: 366 } as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

interface EventRow {
  id: string
  kind: string
  title: string
  starts_on: string
  ends_on: string | null
  all_day: boolean
  starts_at: string | null
  ends_at: string | null
  travelers: string | null
  traveler_id: string | null
  place: string | null
  repeats_yearly: boolean
  note: string | null
  list_item_id: string | null
  created_by: string | null
  cities: { name: string; state_code: string | null; country_code: string } | null
}

const EVENT_COLUMNS =
  'id, kind, title, starts_on, ends_on, all_day, starts_at, ends_at, travelers, traveler_id, place, repeats_yearly, note, list_item_id, created_by, cities:city_id (name, state_code, country_code)'

/**
 * As datas em que um evento anual cai dentro de [from, to]. 29/02 em ano não
 * bissexto cai em 28/02, como no Calendário.
 */
export function yearlyOccurrences(startsOn: string, from: string, to: string): string[] {
  const [, month, day] = startsOn.split('-')
  const out: string[] = []
  for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
    let date = `${year}-${month}-${day}`
    if (month === '02' && day === '29' && !(year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0))) date = `${year}-02-28`
    if (date >= startsOn && date >= from && date <= to) out.push(date)
  }
  return out
}

export async function listEvents(ctx: Ctx, input: { from?: string; to?: string; kind?: string }) {
  const couple = await loadCouple(ctx)
  const from = input.from ?? ctx.today()
  const to = input.to ?? addDays(from, 60)
  if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) throw new ToolFailure('invalid', 'Datas no formato YYYY-MM-DD.')
  if (to < from) throw new ToolFailure('invalid', '`to` antes de `from`.')
  if (daysBetween(from, to) > 800) throw new ToolFailure('invalid', 'Intervalo de no máximo ~2 anos.')

  // Pontuais que tocam o intervalo + todos os anuais (filtrados em código).
  let ranged = ctx.db
    .from('calendar_events')
    .select(EVENT_COLUMNS)
    .eq('repeats_yearly', false)
    .lte('starts_on', to)
    .or(`ends_on.gte.${from},and(ends_on.is.null,starts_on.gte.${from})`)
  let yearly = ctx.db.from('calendar_events').select(EVENT_COLUMNS).eq('repeats_yearly', true).lte('starts_on', to)
  if (input.kind) {
    ranged = ranged.eq('kind', input.kind)
    yearly = yearly.eq('kind', input.kind)
  }
  const [a, b] = await Promise.all([ranged.order('starts_on'), yearly])
  if (a.error) throw dbFailure(a.error)
  if (b.error) throw dbFailure(b.error)

  const name = (id: string | null) => (id ? (couple.names.get(id) ?? id) : null)
  const shape = (row: EventRow, on: string) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    starts_on: on,
    ends_on: row.ends_on,
    time: row.all_day ? null : [row.starts_at?.slice(0, 5), row.ends_at?.slice(0, 5)].filter(Boolean).join('–'),
    city: row.cities ? [row.cities.name, row.cities.state_code ?? row.cities.country_code].filter(Boolean).join(', ') : null,
    place: row.place,
    travelers: row.travelers === 'solo' ? name(row.traveler_id) : row.travelers === 'both' ? 'os dois' : null,
    repeats_yearly: row.repeats_yearly,
    note: row.note,
    list_item_id: row.list_item_id,
    created_by: name(row.created_by),
  })
  const events = [
    ...((a.data ?? []) as unknown as EventRow[]).map((r) => shape(r, r.starts_on)),
    ...((b.data ?? []) as unknown as EventRow[]).flatMap((r) => yearlyOccurrences(r.starts_on, from, to).map((on) => shape(r, on))),
  ].sort((x, y) => (x.starts_on < y.starts_on ? -1 : x.starts_on > y.starts_on ? 1 : 0))
  return { from, to, events }
}

export interface CreateEventInput {
  kind: CreatableKind
  title: string
  starts_on: string
  ends_on?: string | null
  starts_at?: string | null
  place?: string | null
  repeats_yearly?: boolean
  note?: string | null
  list_item_id?: string | null
}

/** O espelho do `calendar_events_format` para os quatro tipos que o MCP cria. */
export function validateEvent(input: CreateEventInput): { field: string; reason: string } | null {
  if (!(CREATABLE_KINDS as readonly string[]).includes(input.kind)) {
    return { field: 'kind', reason: 'Pelo MCP: date, data_especial, compromisso ou lembrete. Viagem e visita se criam no app.' }
  }
  const title = input.title.trim()
  if (title.length === 0 || title.length > EVENT_LIMITS.title) return { field: 'title', reason: `De 1 a ${EVENT_LIMITS.title} caracteres.` }
  if (!ISO_DATE.test(input.starts_on)) return { field: 'starts_on', reason: 'Data no formato YYYY-MM-DD.' }
  if (input.ends_on) {
    if (input.kind !== 'compromisso') return { field: 'ends_on', reason: 'Só compromisso tem data de fim.' }
    if (!ISO_DATE.test(input.ends_on) || input.ends_on < input.starts_on) return { field: 'ends_on', reason: 'Fim no formato YYYY-MM-DD, não antes do começo.' }
    if (daysBetween(input.starts_on, input.ends_on) >= EVENT_LIMITS.spanDays) return { field: 'ends_on', reason: 'No máximo 366 dias.' }
  }
  if (input.starts_at && !TIME.test(input.starts_at)) return { field: 'starts_at', reason: 'Hora no formato HH:MM.' }
  if (input.place) {
    if (input.kind !== 'date' && input.kind !== 'compromisso') return { field: 'place', reason: 'Local só em date e compromisso.' }
    if (input.place.trim().length > EVENT_LIMITS.place) return { field: 'place', reason: `Até ${EVENT_LIMITS.place} caracteres.` }
  }
  if (input.repeats_yearly && input.kind !== 'data_especial') return { field: 'repeats_yearly', reason: 'Só data especial se repete todo ano.' }
  if (input.note && input.note.length > EVENT_LIMITS.note) return { field: 'note', reason: `Até ${EVENT_LIMITS.note} caracteres.` }
  return null
}

export async function createEvent(ctx: Ctx, input: CreateEventInput) {
  await loadCouple(ctx)
  const invalid = validateEvent(input)
  if (invalid) throw new ToolFailure('invalid', `${invalid.field}: ${invalid.reason}`, invalid)
  const allDay = !input.starts_at
  const { data, error } = await ctx.db.rpc('create_event', {
    p_event: {
      kind: input.kind,
      title: input.title.trim(),
      starts_on: input.starts_on,
      ends_on: input.ends_on ?? null,
      all_day: allDay,
      starts_at: allDay ? null : `${input.starts_at}:00`,
      ends_at: null,
      place: input.place?.trim() || null,
      repeats_yearly: input.repeats_yearly ?? false,
      note: input.note?.trim() || null,
      list_item_id: input.list_item_id ?? null,
    },
    p_paint: false,
  })
  if (error) throw dbFailure(error)
  const result = data as { status?: string; id?: string } | null
  if (result?.status === 'not_member') throw new ToolFailure('not_member', 'Esta conta ainda não está num espaço do lanabiel.')
  return { status: 'ok', id: result?.id ?? null }
}

/** Planejada, em andamento ou feita, derivado de hoje (Fase 6); nunca gravado. */
export function tripState(startsOn: string, endsOn: string | null, today: string): 'planned' | 'ongoing' | 'done' {
  if (today < startsOn) return 'planned'
  if (today > (endsOn ?? startsOn)) return 'done'
  return 'ongoing'
}

export async function listTrips(ctx: Ctx, input: { state?: 'planned' | 'ongoing' | 'done' }) {
  const couple = await loadCouple(ctx)
  const [events, trips] = await Promise.all([
    ctx.db.from('calendar_events').select(EVENT_COLUMNS).eq('kind', 'viagem').order('starts_on', { ascending: false }),
    ctx.db.from('trips').select('event_id, lodging_name, lodging_check_in, lodging_check_out'),
  ])
  if (events.error) throw dbFailure(events.error)
  if (trips.error) throw dbFailure(trips.error)
  const today = ctx.today()
  const byEvent = new Map((trips.data ?? []).map((t) => [t.event_id as string, t]))
  const rows = ((events.data ?? []) as unknown as EventRow[]).map((e) => {
    const trip = byEvent.get(e.id)
    return {
      id: e.id,
      title: e.title,
      destination: e.cities ? [e.cities.name, e.cities.state_code ?? e.cities.country_code].filter(Boolean).join(', ') : null,
      starts_on: e.starts_on,
      ends_on: e.ends_on,
      state: tripState(e.starts_on, e.ends_on, today),
      who: e.travelers === 'solo' ? (couple.names.get(e.traveler_id ?? '') ?? 'uma pessoa') : 'os dois',
      lodging: trip?.lodging_name ?? null,
      note: e.note,
    }
  })
  return { today, trips: input.state ? rows.filter((r) => r.state === input.state) : rows }
}
