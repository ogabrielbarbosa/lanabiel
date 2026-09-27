// Calendário (Fase 5): a fronteira entre o domínio (camelCase, `EventDraft`) e
// as colunas de `calendar_events`. O snake_case não passa daqui. Puro, sem
// rede: o mesmo mapeador serve à fronteira de dados (`create_event`, update
// direto) e ao teste de banco que roda `EVENT_VALIDATION_CASES` (A3) — um bug
// de mapeamento aparece nos dois lados, em vez de ser mascarado.
//
// Spec: .agent/Tasks/fase-5-calendario.md, seção 5 · migration 20260926150100_calendar.sql

import type { CalendarEvent, EventDraft, EventKind, Travelers } from '../domain/calendar'
import type { Database } from '../lib/database.types'

type Tables = Database['public']['Tables']

// Tipos gerados (`npm run types:gen`): renomear coluna quebra o typecheck aqui.
export type CalendarEventRow = Tables['calendar_events']['Row']

/**
 * O que o cliente escreve ao criar. `created_by` nasce do default
 * (`auth.uid()`), e `id`, `created_at`, `updated_at` são do banco. `Required`
 * sobre o `Insert` gerado: esquecer uma coluna é erro de tipo, não um default
 * silencioso do banco.
 */
export type CalendarEventInsert = Required<
  Pick<
    Tables['calendar_events']['Insert'],
    | 'couple_id' | 'kind' | 'title' | 'starts_on' | 'ends_on' | 'all_day' | 'starts_at' | 'ends_at'
    | 'travelers' | 'traveler_id' | 'city_id' | 'place' | 'repeats_yearly' | 'note' | 'list_item_id'
  >
>

/** Editar: sem casal (I13) nem tipo (R20 — o tipo não muda na edição). */
export type CalendarEventUpdate = Omit<CalendarEventInsert, 'couple_id' | 'kind'>

export function eventDraftToUpdate(draft: EventDraft): CalendarEventUpdate {
  return {
    title: draft.title,
    starts_on: draft.startsOn,
    ends_on: draft.endsOn,
    all_day: draft.allDay,
    starts_at: draft.startsAt,
    ends_at: draft.endsAt,
    travelers: draft.travelers,
    traveler_id: draft.travelerId,
    city_id: draft.cityId,
    place: draft.place,
    repeats_yearly: draft.repeatsYearly,
    note: draft.note,
    list_item_id: draft.listItemId,
  }
}

export function eventDraftToInsert(draft: EventDraft, coupleId: string): CalendarEventInsert {
  return { couple_id: coupleId, kind: draft.kind, ...eventDraftToUpdate(draft) }
}

/** `time` do Postgres volta `HH:MM:SS`; o domínio fala `HH:MM`. */
function hhmm(value: string | null): string | null {
  return value === null ? null : value.slice(0, 5)
}

export function rowToEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    // Os literais são garantidos pelos CHECK (`calendar_events_kind`,
    // `calendar_events_travelers`).
    kind: row.kind as EventKind,
    title: row.title,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    allDay: row.all_day,
    startsAt: hhmm(row.starts_at),
    endsAt: hhmm(row.ends_at),
    travelers: row.travelers as Travelers | null,
    travelerId: row.traveler_id,
    cityId: row.city_id,
    place: row.place,
    repeatsYearly: row.repeats_yearly,
    note: row.note,
    listItemId: row.list_item_id,
    createdBy: row.created_by,
  }
}
