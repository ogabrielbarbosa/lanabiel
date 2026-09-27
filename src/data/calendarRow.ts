// Calendário (Fase 5): a fronteira entre o domínio (camelCase, `EventDraft`) e
// as colunas de `calendar_events`. O snake_case não passa daqui. Puro, sem
// rede: o mesmo mapeador serve à fronteira de dados (`create_event`, update
// direto) e ao teste de banco que roda `EVENT_VALIDATION_CASES` (A3) — um bug
// de mapeamento aparece nos dois lados, em vez de ser mascarado.
//
// Spec: .agent/Tasks/fase-5-calendario.md, seção 5 · migration 20260926150100_calendar.sql

import type { EventDraft, EventKind, Travelers } from '../domain/calendar'

// TODO(T5): trocar pelo tipo gerado (`Database['public']['Tables']['calendar_events']['Insert']`)
// depois do `db:push` + `types:gen`. Até lá, o espelho das colunas da migration.
/**
 * O que o cliente escreve ao criar. `created_by` nasce do default
 * (`auth.uid()`), e `id`, `created_at`, `updated_at` são do banco.
 */
export interface CalendarEventInsert {
  couple_id: string
  kind: EventKind
  title: string
  starts_on: string
  ends_on: string | null
  all_day: boolean
  starts_at: string | null
  ends_at: string | null
  travelers: Travelers | null
  traveler_id: string | null
  city_id: string | null
  place: string | null
  repeats_yearly: boolean
  note: string | null
  list_item_id: string | null
}

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
