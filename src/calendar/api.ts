// O que o Calendário pede ao mundo, num objeto só — o padrão de `ListApi`: a
// tela recebe isto por parâmetro, e o teste de interface dirige cada resposta
// sem rede. O relógio (`today`) e o gerador de id da prévia (`newId`) também
// entram por aqui. O que o banco REALMENTE responde está em
// supabase/tests/calendar.test.ts.
//
// Spec: .agent/Tasks/fase-5-calendario.md, seção 5 ("Cliente — fronteira de dados")
//
// A interface é escrita à mão (e não derivada das funções de `src/data/`, como
// `ListApi`) porque nasceu antes da fronteira de dados: as telas começam contra
// ela enquanto a migration sobe. `calendarApi(db)` a liga em `src/data/calendar.ts`.

import type { DataResult } from '../data/result'
import type { City } from '../data/cities'
import type { SettingsData } from '../data/settings'
import type { CalCity, CalendarEvent, EventDraft, PaintEntry } from '../domain/calendar'
import type { ListCategory } from '../domain/list'

/** Um item da lista como o _Vínculo com a lista_ o mostra. */
export interface ListItemRef {
  id: string
  name: string
  category: ListCategory
}

export interface CalendarData {
  events: CalendarEvent[]
  listItems: ListItemRef[]
}

/** Um resultado de cidade estrangeira vindo do Photon, ainda não gravado (R17). */
export interface WorldCityCandidate {
  /** `N`/`W`/`R` + `osm_id` — a chave de dedupe dentro do casal (ADR 0017). */
  osmRef: string
  name: string
  /** Província/estado, como o OSM escreve. */
  region: string | null
  countryCode: string
  /** Nome do país em português (`Intl.DisplayNames`). */
  country: string
  lat: number
  lng: number
}

export type WorldSearchResult =
  | { status: 'ok'; rows: WorldCityCandidate[] }
  /** Uma busca mais nova cancelou esta: a tela ignora. */
  | { status: 'aborted' }
  | { status: 'error'; cause: string }

export type Failure = { status: 'unauthenticated' } | { status: 'error'; cause: string }

/**
 * Escritas do Calendário. `invalid` traz o nome da constraint que recusou
 * (`calendar_events_format`, `stays_no_overlap`, …): a tela diz o que falhou.
 * `not_member` = o espaço mudou (a pessoa saiu do casal) → "recarregue".
 */
export type CalendarWrite<T = undefined> =
  | (T extends undefined ? { status: 'ok' } : { status: 'ok'; value: T })
  | { status: 'invalid'; constraint: string }
  | { status: 'not_member' }
  | Failure

export type KissWrite =
  | { status: 'ok' }
  /** `day_kisses_limit`: 20 no dia. */
  | { status: 'kiss_limit' }
  /** `day_kisses_future`. */
  | { status: 'kiss_future' }
  /** `−` que apagou zero linhas (a outra pessoa tirou antes): relê, sem erro. */
  | { status: 'nothing_to_remove' }
  | Failure

export interface CalendarApi {
  today: () => string
  /** Id das estadias que a PRÉVIA inventa (`paintStays`); nunca vai para o banco. */
  newId: () => string

  /**
   * Quem sou eu, o casal (com `startedOn`), os dois integrantes (nome, avatar,
   * cor, cidade-casa), `couple_settings` e as estadias — a MESMA leitura das
   * Configurações e da Lista (`loadSettings`).
   */
  loadContext: () => Promise<DataResult<SettingsData>>
  /** Eventos e os itens da lista (só id, nome e categoria) para o vínculo. */
  loadCalendar: () => Promise<DataResult<CalendarData>>
  /** As cidades de estadias, eventos e casas — IBGE e do mundo (I2). */
  loadCities: (ids: readonly string[]) => Promise<DataResult<Map<string, CalCity>>>
  /** 💋 da janela visível, `day` → contagem (seção 8). */
  loadKisses: (from: string, to: string) => Promise<DataResult<Map<string, number>>>
  avatarUrl: (path: string | null) => Promise<string | null>

  /** `paint_stays` (I3, ADR 0018). */
  paint: (entries: readonly PaintEntry[]) => Promise<CalendarWrite>
  /** `create_event`: com `paint`, viagem e visita pintam na mesma transação (I6). */
  createEvent: (coupleId: string, draft: EventDraft, paint: boolean) => Promise<CalendarWrite<{ id: string }>>
  /** Update direto. Nunca mexe em estadia (I6). */
  updateEvent: (id: string, draft: EventDraft) => Promise<CalendarWrite>
  deleteEvent: (id: string) => Promise<CalendarWrite>

  addKiss: (coupleId: string, day: string) => Promise<KissWrite>
  /** Apaga a linha MAIS RECENTE do dia, de qualquer autor (R22). */
  removeKiss: (day: string) => Promise<KissWrite>

  /** Municípios do IBGE (R17), a partir de 2 caracteres. */
  searchCities: (query: string) => Promise<DataResult<City[]>>
  /** Photon `layer=city`, SEM os resultados do Brasil (I2). */
  searchWorldCities: (query: string, options: { signal?: AbortSignal }) => Promise<WorldSearchResult>
  /** `insert … on conflict do nothing` + `select id` pela `osm_ref` (ADR 0017). */
  ensureWorldCity: (coupleId: string, candidate: WorldCityCandidate) => Promise<CalendarWrite<CalCity>>
}
