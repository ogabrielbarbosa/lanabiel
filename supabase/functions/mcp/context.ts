// O que toda ferramenta recebe: o cliente Supabase COM O TOKEN de quem chamou
// (a RLS é a autorização, ADR 0001), o `fetch` (injetável no teste), as chaves
// dos provedores e o relógio. E o casal de quem chama, lido uma vez por pedido.
//
// ADR: .agent/Decisions/0031-mcp-remoto-em-edge-function-com-oauth-do-supabase.md

import type { SupabaseClient } from '@supabase/supabase-js'

// deno-lint-ignore no-explicit-any
export type Db = SupabaseClient<any, 'public', any>

export interface ProviderKeys {
  apifyToken: string | null
  geminiKey: string | null
  geminiModel: string
  firecrawlKey: string | null
  openPlacesKey: string | null
}

export interface Ctx {
  db: Db
  userId: string
  fetch: typeof fetch
  keys: ProviderKeys
  /** `YYYY-MM-DD` em America/Sao_Paulo (I6). */
  today: () => string
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash'

/** Hoje no fuso do casal, o mesmo de `private.today_br()`. */
export function todayBr(now: Date = new Date()): string {
  // `en-CA` formata como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now)
}

export interface Member {
  profileId: string
  name: string
  slot: number
  homeCity: { id: string; name: string; stateCode: string | null; countryCode: string; lat: number; lng: number } | null
}

export interface Couple {
  coupleId: string
  name: string | null
  startedOn: string
  me: Member
  /** Nulo enquanto a outra pessoa não entrou (ADR 0024). */
  partner: Member | null
  /** profileId → nome, para devolver nomes em vez de uuids. */
  names: Map<string, string>
}

/** Falha que a ferramenta devolve como está (`status` + texto para o agente). */
export class ToolFailure extends Error {
  readonly status: string
  readonly extra: Record<string, unknown>

  constructor(status: string, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.extra = extra
  }
}

const coupleCache = new WeakMap<Ctx, Promise<Couple>>()

/** O casal de quem chama. Sem casal → `not_member` (R5). Cacheado por pedido. */
export function loadCouple(ctx: Ctx): Promise<Couple> {
  let pending = coupleCache.get(ctx)
  if (!pending) {
    pending = readCouple(ctx)
    coupleCache.set(ctx, pending)
  }
  return pending
}

async function readCouple(ctx: Ctx): Promise<Couple> {
  // Sem filtro de casal: a policy de `couple_members` só mostra o próprio (ADR 0001).
  const { data: members, error } = await ctx.db
    .from('couple_members')
    .select('couple_id, profile_id, slot')
    .order('slot')
  if (error) throw new ToolFailure('error', `Não deu para ler o casal: ${error.message}`)
  if (!members || members.length === 0) {
    throw new ToolFailure('not_member', 'Esta conta ainda não está num espaço do lanabiel.')
  }
  const coupleId = members[0].couple_id as string

  const [couple, profiles] = await Promise.all([
    ctx.db.from('couples').select('name, started_on').eq('id', coupleId).single(),
    ctx.db
      .from('profiles')
      .select('id, display_name, home_city_id, cities:home_city_id (id, name, state_code, country_code, lat, lng)')
      .in(
        'id',
        members.map((m) => m.profile_id as string),
      ),
  ])
  if (couple.error) throw new ToolFailure('error', `Não deu para ler o casal: ${couple.error.message}`)
  if (profiles.error) throw new ToolFailure('error', `Não deu para ler os perfis: ${profiles.error.message}`)

  const toMember = (m: { profile_id: string; slot: number }): Member => {
    // deno-lint-ignore no-explicit-any
    const p = (profiles.data ?? []).find((row: any) => row.id === m.profile_id) as any
    const city = p?.cities ?? null
    return {
      profileId: m.profile_id,
      name: p?.display_name ?? 'Sem nome',
      slot: m.slot,
      homeCity: city
        ? { id: city.id, name: city.name, stateCode: city.state_code, countryCode: city.country_code, lat: city.lat, lng: city.lng }
        : null,
    }
  }
  const all = members.map((m) => toMember(m as { profile_id: string; slot: number }))
  const me = all.find((m) => m.profileId === ctx.userId)
  if (!me) throw new ToolFailure('not_member', 'Esta conta ainda não está num espaço do lanabiel.')
  return {
    coupleId,
    name: couple.data.name,
    startedOn: couple.data.started_on,
    me,
    partner: all.find((m) => m.profileId !== ctx.userId) ?? null,
    names: new Map(all.map((m) => [m.profileId, m.name])),
  }
}
