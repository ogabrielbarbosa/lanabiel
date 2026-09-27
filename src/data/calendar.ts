// Fronteira de banco do Calendário (Fase 5). snake_case não passa daqui — o
// mapeamento de linha mora em `calendarRow.ts`.
//
// Spec: .agent/Tasks/fase-5-calendario.md, seções 5 ("Cliente — fronteira de
//       dados" e as RPCs), 6 (os nomes das constraints), 7 e 8
// ADR:  .agent/Decisions/0018-periodo-se-grava-pintando-estadias.md
//
// Nenhuma query filtra por `couple_id` (ADR 0001). Onde há `.eq('id' | 'day',
// …)`, é IDENTIDADE — qual linha das que a pessoa pode ver —, não autorização.
// No INSERT o `couple_id` vai como DADO da linha nova, e a policy `with check`
// recusa outro casal. As RPCs nem o recebem: descobrem o casal pela sessão.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarData, CalendarWrite, KissWrite, ListItemRef } from '../calendar/api'
import type { CalendarEvent, EventDraft, PaintEntry } from '../domain/calendar'
import type { ListCategory } from '../domain/list'
import type { Database, Json } from '../lib/database.types'
import { eventDraftToInsert, eventDraftToUpdate, rowToEvent } from './calendarRow'
import { selectAll } from './paginate'
import type { DataResult } from './result'

type Db = SupabaseClient<Database>

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

interface PgError {
  code?: string
  message: string
  hint?: string | null
  details?: string | null
}

/** A falha de uma escrita do Calendário (tudo menos o `ok`). */
export type CalendarFailure = Exclude<CalendarWrite, { status: 'ok' }>

const CONSTRAINT_IN_TEXT = /constraint "([a-z0-9_]+)"/i
const RULE_NAME = /^[a-z][a-z0-9_]*$/

/**
 * O nome da regra que recusou. O trigger o põe no HINT (a opção `constraint`
 * do RAISE não chega ao cliente); o CHECK declarado e a exclusão, na mensagem
 * (`violates check constraint "calendar_events_format"`), às vezes também em
 * `details`.
 */
export function constraintName(error: PgError): string | null {
  const hint = error.hint?.trim()
  if (hint && RULE_NAME.test(hint)) return hint
  return CONSTRAINT_IN_TEXT.exec(error.message)?.[1] ?? CONSTRAINT_IN_TEXT.exec(error.details ?? '')?.[1] ?? null
}

/**
 * Erro do PostgREST → caso nomeado.
 *
 * `42501` depende de onde veio. Das RPCs (`paint_stays`, `create_event`) é
 * "sem sessão" — elas o levantam só nesse caso, e o "sem casal" sai como
 * `{status:'not_member'}`. De uma escrita DIRETA, com a sessão já conferida
 * antes, é a policy `with check` recusando: a pessoa saiu do casal em outro
 * aparelho → `not_member` ("recarregue"). Numa leitura, sessão.
 */
export function translateCalendarError(error: PgError, origin: 'rpc' | 'write' | 'read'): CalendarFailure {
  if (error.code === 'PGRST301' || error.code === '401') return { status: 'unauthenticated' }
  if (error.code === '42501') return origin === 'write' ? { status: 'not_member' } : { status: 'unauthenticated' }
  if (error.code === '23514' || error.code === '23P01') {
    return { status: 'invalid', constraint: constraintName(error) ?? error.code }
  }
  return { status: 'error', cause: error.message }
}

async function hasSession(db: Db): Promise<boolean> {
  const { data } = await db.auth.getSession()
  return data.session !== null
}

/**
 * Chamada de RPC que devolve `{ status }`. A exceção vira falha traduzida; o
 * `{status:'not_member'}` do banco vira o caso irmão. Resposta que não é
 * objeto é `error` — nunca `ok` por omissão.
 */
async function rpc(
  db: Db,
  fn: 'paint_stays' | 'create_event',
  args: Record<string, Json>,
): Promise<{ status: 'ok'; data: Record<string, unknown> } | CalendarFailure> {
  const { data, error } = await (
    db.rpc as (f: string, a: unknown) => PromiseLike<{ data: unknown; error: PgError | null }>
  )(fn, args)
  if (error) return translateCalendarError(error, 'rpc')
  if (data === null || typeof data !== 'object') return { status: 'error', cause: `${fn}: resposta inesperada` }
  const body = data as Record<string, unknown>
  if (body.status === 'not_member') return { status: 'not_member' }
  if (body.status !== 'ok') return { status: 'error', cause: `${fn}: status inesperado ${String(body.status)}` }
  return { status: 'ok', data: body }
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

/**
 * Eventos e itens da lista (só `id, name, category`, para o vínculo), em
 * paralelo, sem filtro de casal (a policy corta), cada um paginado até o fim
 * (`selectAll`). Qualquer um que falhe derruba o todo: o modal de evento não
 * mostra "nenhum item na lista" por uma leitura que caiu.
 */
export async function loadCalendar(db: Db): Promise<DataResult<CalendarData>> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }
  const [events, items] = await Promise.all([
    selectAll((from, to) =>
      db.from('calendar_events').select('*').order('starts_on').order('id').range(from, to),
    ),
    selectAll((from, to) =>
      db.from('list_items').select('id, name, category').order('name').order('id').range(from, to),
    ),
  ])
  if (events.status !== 'ok') return events
  if (items.status !== 'ok') return items
  return {
    status: 'ok',
    rows: {
      events: events.rows.map(rowToEvent),
      listItems: items.rows.map(
        (r): ListItemRef => ({ id: r.id, name: r.name, category: r.category as ListCategory }),
      ),
    },
  }
}

/**
 * 💋 da janela `[from, to]` (inclusiva), `day` → contagem. Dia sem marca não
 * entra no mapa: a tela lê ausência como 0 — mas só com a leitura `ok`, e a
 * falha é caso próprio (seção 7: "não se mostra 0 sem ter lido").
 */
export async function loadKisses(db: Db, from: string, to: string): Promise<DataResult<Map<string, number>>> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }
  const rows = await selectAll((start, end) =>
    db.from('day_kisses').select('id, day').gte('day', from).lte('day', to).order('day').order('id').range(start, end),
  )
  if (rows.status !== 'ok') return rows
  return { status: 'ok', rows: countByDay(rows.rows) }
}

function countByDay(rows: readonly { day: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const { day } of rows) counts.set(day, (counts.get(day) ?? 0) + 1)
  return counts
}

/** O que o export leva do Calendário (R24). */
export interface CalendarExportData {
  events: CalendarEvent[]
  /** 💋 agregado por dia, em ordem de dia. Dia sem marca não entra. */
  kisses: { day: string; count: number }[]
}

/**
 * Eventos e 💋 INTEIROS, sem janela — só para o "Exportar tudo" (R24). O 💋
 * não sai da tela do Calendário para nenhuma outra superfície (I12); o
 * arquivo do próprio casal é a única exceção, e é por isso que esta leitura
 * existe à parte de `loadKisses`, e só o export a chama.
 */
export async function loadCalendarExport(db: Db): Promise<DataResult<CalendarExportData>> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }
  const [events, kisses] = await Promise.all([
    selectAll((from, to) =>
      db.from('calendar_events').select('*').order('starts_on').order('id').range(from, to),
    ),
    selectAll((from, to) => db.from('day_kisses').select('id, day').order('day').order('id').range(from, to)),
  ])
  if (events.status !== 'ok') return events
  if (kisses.status !== 'ok') return kisses
  return {
    status: 'ok',
    rows: {
      events: events.rows.map(rowToEvent),
      kisses: [...countByDay(kisses.rows)].map(([day, count]) => ({ day, count })),
    },
  }
}

// ---------------------------------------------------------------------------
// Pintura e eventos
// ---------------------------------------------------------------------------

/**
 * `paint_stays` (I3, ADR 0018): tudo ou nada, em ordem. `to` vai SEMPRE como
 * chave, nula quando em aberto — a RPC recusa entrada sem ela, porque pintar
 * em aberto apaga o futuro da pessoa e não pode acontecer por campo esquecido.
 *
 * Zero entradas = nada a pintar → `ok` sem chamar o banco (a RPC exige 1..8 e
 * responderia 22023 a uma chamada que não pede nada).
 */
export async function paint(db: Db, entries: readonly PaintEntry[]): Promise<CalendarWrite> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }
  if (entries.length === 0) return { status: 'ok' }
  const result = await rpc(db, 'paint_stays', {
    p_entries: entries.map((e) => ({ profile_id: e.profileId, city_id: e.cityId, from: e.from, to: e.to ?? null })),
  })
  return result.status === 'ok' ? { status: 'ok' } : result
}

/**
 * `create_event`: o evento e, com `paint` em viagem/visita, a pintura dos
 * viajantes no destino, na MESMA transação (I6). O `couple_id` do payload é
 * ignorado pela RPC (vem da sessão); vai por ser o mesmo mapeador do teste de
 * banco.
 */
export async function createEvent(
  db: Db,
  coupleId: string,
  draft: EventDraft,
  paintStays: boolean,
): Promise<CalendarWrite<{ id: string }>> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }
  const result = await rpc(db, 'create_event', {
    p_event: eventDraftToInsert(draft, coupleId) as unknown as Json,
    p_paint: paintStays,
  })
  if (result.status !== 'ok') return result
  const id = result.data.id
  if (typeof id !== 'string') return { status: 'error', cause: 'create_event: resposta sem id' }
  return { status: 'ok', value: { id } }
}

/**
 * Update direto (I6: nunca mexe em estadia). Zero linhas = o evento sumiu (a
 * outra pessoa apagou) ou não é mais visível: `error` com a causa, e a tela
 * relê — nunca `ok` para uma edição que não gravou.
 */
export async function updateEvent(db: Db, id: string, draft: EventDraft): Promise<CalendarWrite> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }
  const { data, error } = await db.from('calendar_events').update(eventDraftToUpdate(draft)).eq('id', id).select('id')
  if (error) return translateCalendarError(error, 'write')
  if ((data ?? []).length !== 1) return { status: 'error', cause: 'Este evento não existe mais — recarregue' }
  return { status: 'ok' }
}

/** Delete direto. Zero linhas = a outra pessoa já apagou → `ok` (idempotente). */
export async function deleteEvent(db: Db, id: string): Promise<CalendarWrite> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }
  const { error } = await db.from('calendar_events').delete().eq('id', id).select('id')
  if (error) return translateCalendarError(error, 'write')
  return { status: 'ok' }
}

// ---------------------------------------------------------------------------
// 💋 (R22, I12)
// ---------------------------------------------------------------------------

/** `KissWrite` não tem `not_member`/`invalid`: o que não é regra do 💋 vira `error` com a causa. */
function kissFailure(error: PgError): KissWrite {
  const name = constraintName(error)
  if (name === 'day_kisses_limit') return { status: 'kiss_limit' }
  if (name === 'day_kisses_future') return { status: 'kiss_future' }
  const failure = translateCalendarError(error, 'write')
  switch (failure.status) {
    case 'unauthenticated':
    case 'error':
      return failure
    case 'not_member':
      return { status: 'error', cause: 'Este espaço mudou — recarregue' }
    case 'invalid':
      return { status: 'error', cause: `${failure.constraint}: ${error.message}` }
  }
}

/** `+`: uma linha. `added_by` nasce do default (`auth.uid()`), e a policy o confere. */
export async function addKiss(db: Db, coupleId: string, day: string): Promise<KissWrite> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }
  const { error } = await db.from('day_kisses').insert({ couple_id: coupleId, day })
  if (error) return kissFailure(error)
  return { status: 'ok' }
}

/**
 * `−`: apaga a linha MAIS RECENTE do dia, de qualquer autor (R22 — o número é
 * do casal). Lê o `id` e apaga por `id`: um `delete … where day = d` levaria
 * todas. Zero linhas na leitura OU no delete (a outra pessoa tirou antes, entre
 * as duas chamadas) → `nothing_to_remove`, e a tela relê.
 */
export async function removeKiss(db: Db, day: string): Promise<KissWrite> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }
  const { data: latest, error: readError } = await db
    .from('day_kisses')
    .select('id')
    .eq('day', day)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
  if (readError) return kissFailure(readError)
  const [row] = latest ?? []
  if (!row) return { status: 'nothing_to_remove' }

  const { data: deleted, error } = await db.from('day_kisses').delete().eq('id', row.id).select('id')
  if (error) return kissFailure(error)
  if ((deleted ?? []).length === 0) return { status: 'nothing_to_remove' }
  return { status: 'ok' }
}
