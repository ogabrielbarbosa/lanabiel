// Período, visita e viagem: as escritas que PINTAM estadias (ADR 0018). A regra
// da pintura mora nas RPCs (`paint_stays`, `create_event` com `p_paint`,
// `create_trip`); aqui só se monta o pedido, como a pessoa logada.
//
// Pintar sobrescreve onde cada um esteve, então toda escrita tem duas voltas:
// sem `confirm`, devolve a prévia (o que existe hoje no intervalo e o que passa
// a valer) e não grava nada; com `confirm: true`, grava. Mesmo espírito da
// prévia do modal de período no Calendário.
//
// Cidade: brasileira é sempre a linha do IBGE; de fora vira linha do casal em
// `cities`, deduplicada pela `osm_ref` (ADR 0017), e só na hora de gravar.

import { ToolFailure, loadCouple } from './context.ts'
import type { Couple, Ctx, Member } from './context.ts'
import { dbFailure } from './listTools.ts'
import { EVENT_LIMITS } from './calendarTools.ts'
import { countryNamePt, photonUrl } from './places.ts'
import type { PhotonFeature } from './places.ts'

export type Who = 'me' | 'partner' | 'both'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CITY_MIN_QUERY = 2
const WORLD_MIN_QUERY = 3
const GROUP_LIMIT = 5
/** `cities_region` (≤ 80). */
const REGION_MAX = 80
const LODGING_MAX = 80

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000)
}

function validDate(iso: string): boolean {
  if (!ISO_DATE.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// ---------------------------------------------------------------------------
// Cidade: `find_city` e a referência que as escritas recebem
// ---------------------------------------------------------------------------

/** Cidade de fora ainda não gravada: o que `cities` precisa para a linha do casal. */
export interface WorldCity {
  osmRef: string
  name: string
  region: string | null
  countryCode: string
  lat: number
  lng: number
}

export interface CityOption {
  /** O que se passa em `city_ref` de record_period, create_visit e create_trip. */
  city_ref: string
  label: string
  source: 'ibge' | 'casal' | 'mundo'
}

function b64url(text: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromB64url(text: string): string {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

export function encodeWorldRef(city: WorldCity): string {
  return `world:${b64url(JSON.stringify([city.osmRef, city.name, city.region, city.countryCode, city.lat, city.lng]))}`
}

/** A referência volta do agente: confere tudo, como dado de fora. */
export function decodeWorldRef(ref: string): WorldCity | null {
  if (!ref.startsWith('world:')) return null
  try {
    const value = JSON.parse(fromB64url(ref.slice('world:'.length))) as unknown
    if (!Array.isArray(value) || value.length !== 6) return null
    const [osmRef, name, region, countryCode, lat, lng] = value as unknown[]
    if (typeof osmRef !== 'string' || !/^[NWR][0-9]+$/.test(osmRef)) return null
    if (typeof name !== 'string' || name.trim().length === 0 || name.length > 120) return null
    if (region !== null && typeof region !== 'string') return null
    if (typeof countryCode !== 'string' || !/^[A-Z]{2}$/.test(countryCode) || countryCode === 'BR') return null
    if (typeof lat !== 'number' || typeof lng !== 'number' || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
    return { osmRef, name: name.trim(), region: region === null ? null : region.slice(0, REGION_MAX), countryCode, lat, lng }
  } catch {
    return null
  }
}

/** `osm_type` + `osm_id` → `'R5400890'`, como `osmRef` do app. */
export function osmRefOf(p: { osm_type?: unknown; osm_id?: unknown }): string | null {
  const type = typeof p.osm_type === 'string' ? p.osm_type.toUpperCase() : null
  if (type !== 'N' && type !== 'W' && type !== 'R') return null
  if (typeof p.osm_id !== 'number' || !Number.isSafeInteger(p.osm_id) || p.osm_id <= 0) return null
  return `${type}${p.osm_id}`
}

/** Feature do Photon (`layer=city`) → cidade de fora; o Brasil é sempre IBGE (I2). */
export function featureToWorldCity(feature: PhotonFeature & { properties?: { osm_type?: unknown; osm_id?: unknown } }): WorldCity | null {
  const p = feature.properties ?? {}
  const coords = feature.geometry?.coordinates
  if (!Array.isArray(coords) || coords.length < 2) return null
  const [lng, lat] = coords as [unknown, unknown]
  if (typeof lat !== 'number' || typeof lng !== 'number') return null
  const countryCode = p.countrycode?.toUpperCase()
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode) || countryCode === 'BR') return null
  const osmRef = osmRefOf(p)
  if (!osmRef || !p.name) return null
  return { osmRef, name: p.name, region: p.state ? p.state.slice(0, REGION_MAX) : null, countryCode, lat, lng }
}

interface CityRow {
  id: string
  name: string
  state_code: string | null
  country_code: string
  osm_ref?: string | null
}

export function cityRowLabel(c: Pick<CityRow, 'name' | 'state_code' | 'country_code'>): string {
  if (c.country_code === 'BR') return c.state_code ? `${c.name}, ${c.state_code}` : c.name
  return `${c.name} · ${countryNamePt(c.country_code)}`
}

export async function findCity(ctx: Ctx, input: { query: string }) {
  await loadCouple(ctx)
  const query = input.query.trim()
  if (query.length < CITY_MIN_QUERY) throw new ToolFailure('invalid', `Busque com pelo menos ${CITY_MIN_QUERY} letras.`)
  const like = query.replace(/[%_\\,()]/g, ' ')

  const [ibge, mine, world] = await Promise.all([
    ctx.db.rpc('search_cities', { p_query: query, p_limit: GROUP_LIMIT }),
    // As cidades de fora que o casal já usou (a policy só mostra as do casal).
    ctx.db.from('cities').select('id, name, state_code, country_code, osm_ref').not('couple_id', 'is', null).ilike('name', `%${like}%`).limit(GROUP_LIMIT),
    query.length >= WORLD_MIN_QUERY ? photonCities(ctx, query) : Promise.resolve({ ok: true as const, rows: [] as WorldCity[] }),
  ])
  if (ibge.error) throw dbFailure(ibge.error)
  if (mine.error) throw dbFailure(mine.error)

  const saved = (mine.data ?? []) as CityRow[]
  const savedRefs = new Set(saved.map((c) => c.osm_ref))
  const options: CityOption[] = [
    ...((ibge.data ?? []) as CityRow[]).map((c): CityOption => ({ city_ref: `city:${c.id}`, label: cityRowLabel(c), source: 'ibge' })),
    ...saved.map((c): CityOption => ({ city_ref: `city:${c.id}`, label: cityRowLabel(c), source: 'casal' })),
    ...(world.ok ? world.rows : [])
      .filter((c) => !savedRefs.has(c.osmRef))
      .slice(0, GROUP_LIMIT)
      .map((c): CityOption => ({
        city_ref: encodeWorldRef(c),
        label: [c.name, c.region, countryNamePt(c.countryCode)].filter(Boolean).join(' · '),
        source: 'mundo',
      })),
  ]
  return {
    status: 'ok',
    cities: options,
    warning: world.ok ? null : `Busca de cidades fora do Brasil indisponível: ${world.cause}`,
  }
}

async function photonCities(ctx: Ctx, query: string): Promise<{ ok: true; rows: WorldCity[] } | { ok: false; cause: string }> {
  try {
    const response = await ctx.fetch(photonUrl(query, 'city', null, 25), { headers: { 'User-Agent': 'lanabiel-mcp/1.0' } })
    if (response.status !== 200) return { ok: false, cause: `Photon respondeu ${response.status}` }
    const body = (await response.json()) as { features?: unknown }
    if (!Array.isArray(body.features)) return { ok: false, cause: 'Photon sem features' }
    const rows = new Map<string, WorldCity>()
    for (const feature of body.features as PhotonFeature[]) {
      const city = featureToWorldCity(feature)
      if (city && !rows.has(city.osmRef)) rows.set(city.osmRef, city)
    }
    return { ok: true, rows: [...rows.values()] }
  } catch (error) {
    return { ok: false, cause: error instanceof Error ? error.message : String(error) }
  }
}

interface ResolvedCity {
  /** Nulo só na prévia de uma cidade de fora ainda não gravada. */
  id: string | null
  label: string
  countryCode: string
}

/** `city:<uuid>` ou `world:…` → a cidade. Com `save`, a de fora vira linha do casal. */
async function resolveCity(ctx: Ctx, couple: Couple, ref: string, save: boolean): Promise<ResolvedCity> {
  if (ref.startsWith('city:')) {
    const id = ref.slice('city:'.length)
    if (!UUID.test(id)) throw new ToolFailure('invalid', 'city_ref inválida. Use uma de find_city.')
    const { data, error } = await ctx.db.from('cities').select('id, name, state_code, country_code').eq('id', id).maybeSingle()
    if (error) throw dbFailure(error)
    if (!data) throw new ToolFailure('not_found', 'Cidade não encontrada. Busque de novo com find_city.')
    return { id: data.id, label: cityRowLabel(data as CityRow), countryCode: data.country_code }
  }
  const world = decodeWorldRef(ref)
  if (!world) throw new ToolFailure('invalid', 'city_ref inválida. Use uma de find_city.')
  const label = [world.name, countryNamePt(world.countryCode)].join(' · ')
  if (!save) {
    // Já gravada pelo casal? Então a prévia usa a linha, e a escrita também.
    const { data } = await ctx.db.from('cities').select('id').eq('osm_ref', world.osmRef).limit(1)
    return { id: (data ?? [])[0]?.id ?? null, label, countryCode: world.countryCode }
  }
  // ADR 0017: insert … on conflict do nothing, depois o select pela osm_ref.
  const { error: insertError } = await ctx.db.from('cities').upsert(
    {
      couple_id: couple.coupleId,
      osm_ref: world.osmRef,
      name: world.name,
      region: world.region,
      country_code: world.countryCode,
      state_code: null,
      ibge_code: null,
      lat: world.lat,
      lng: world.lng,
    },
    { onConflict: 'couple_id,osm_ref', ignoreDuplicates: true },
  )
  if (insertError) throw dbFailure(insertError)
  const { data, error } = await ctx.db.from('cities').select('id').eq('osm_ref', world.osmRef).limit(1)
  if (error) throw dbFailure(error)
  const id = (data ?? [])[0]?.id
  if (!id) throw new ToolFailure('not_member', 'Não deu para guardar a cidade neste espaço.')
  return { id, label, countryCode: world.countryCode }
}

// ---------------------------------------------------------------------------
// Quem e a prévia
// ---------------------------------------------------------------------------

export function peopleOf(couple: Couple, who: Who): Member[] {
  if (who === 'me') return [couple.me]
  if (!couple.partner) throw new ToolFailure('invalid', 'A outra pessoa ainda não entrou no espaço. Use who: "me".')
  return who === 'partner' ? [couple.partner] : [couple.me, couple.partner].sort((a, b) => a.slot - b.slot)
}

interface StayRow {
  profile_id: string
  city_id: string
  starts_on: string
  ends_on: string | null
  cities: Pick<CityRow, 'name' | 'state_code' | 'country_code'> | null
}

export interface Replaced {
  who: string
  city: string
  from: string
  /** Nulo = em aberto. */
  to: string | null
}

/**
 * O que a pintura substitui: as estadias de cada pessoa que tocam [from, to],
 * cortadas ao intervalo. Estadia na mesma cidade não muda nada e fica de fora.
 */
export function replacedStays(rows: readonly StayRow[], cityId: string | null, from: string, to: string | null, names: Map<string, string>): Replaced[] {
  return rows
    .filter((s) => s.city_id !== cityId)
    .map((s) => ({
      who: names.get(s.profile_id) ?? s.profile_id,
      city: s.cities ? cityRowLabel(s.cities) : s.city_id,
      from: s.starts_on > from ? s.starts_on : from,
      to: to === null ? s.ends_on : s.ends_on === null || s.ends_on > to ? to : s.ends_on,
    }))
}

async function preview(ctx: Ctx, couple: Couple, people: Member[], city: ResolvedCity, from: string, to: string | null) {
  const { data, error } = await ctx.db
    .from('stays')
    .select('profile_id, city_id, starts_on, ends_on, cities:city_id (name, state_code, country_code)')
    .in(
      'profile_id',
      people.map((p) => p.profileId),
    )
    .lte('starts_on', to ?? '9999-12-31')
    .or(`ends_on.gte.${from},ends_on.is.null`)
    .order('starts_on')
  if (error) throw dbFailure(error)
  const replaced = replacedStays((data ?? []) as unknown as StayRow[], city.id, from, to, couple.names)
  return {
    will_record: people.map((p) => ({ who: p.name, city: city.label, from, to })),
    replaces: replaced,
    note:
      replaced.length === 0
        ? 'Nada registrado nesse intervalo muda de cidade.'
        : 'Esses trechos deixam de valer no intervalo. Fora dele, nada muda.',
  }
}

const CONFIRM_HINT = 'Nada foi gravado. Mostre a prévia à pessoa e, se ela concordar, chame de novo com confirm: true.'

function checkRange(from: string, to: string, fromField: string, toField: string) {
  if (!validDate(from)) throw new ToolFailure('invalid', `${fromField}: data no formato YYYY-MM-DD.`)
  if (!validDate(to)) throw new ToolFailure('invalid', `${toField}: data no formato YYYY-MM-DD.`)
  if (to < from) throw new ToolFailure('invalid', `${toField} antes de ${fromField}.`)
  if (daysBetween(from, to) >= EVENT_LIMITS.spanDays) throw new ToolFailure('invalid', 'No máximo 366 dias.')
}

function checkTitle(title: string): string {
  const t = title.trim()
  if (t.length === 0 || t.length > EVENT_LIMITS.title) throw new ToolFailure('invalid', `title: de 1 a ${EVENT_LIMITS.title} caracteres.`)
  return t
}

function checkNote(note: string | null | undefined): string | null {
  const n = note?.trim() || null
  if (n && n.length > EVENT_LIMITS.note) throw new ToolFailure('invalid', `note: até ${EVENT_LIMITS.note} caracteres.`)
  return n
}

// ---------------------------------------------------------------------------
// As três escritas
// ---------------------------------------------------------------------------

export interface RecordPeriodInput {
  who: Who
  city_ref: string
  from: string
  to?: string | null
  open_ended?: boolean
  confirm?: boolean
}

/** "Fulano esteve em C de `from` até `to`" — `paint_stays`, uma entrada por pessoa. */
export async function recordPeriod(ctx: Ctx, input: RecordPeriodInput) {
  const couple = await loadCouple(ctx)
  const to = input.to ?? null
  if (to === null && !input.open_ended) {
    throw new ToolFailure('invalid', 'Falta `to`. Período em aberto (mudança, sem data de volta) só com open_ended: true.')
  }
  if (to !== null && input.open_ended) throw new ToolFailure('invalid', 'open_ended é para período sem `to`.')
  if (to === null) {
    if (!validDate(input.from)) throw new ToolFailure('invalid', 'from: data no formato YYYY-MM-DD.')
  } else {
    checkRange(input.from, to, 'from', 'to')
  }
  const people = peopleOf(couple, input.who)

  if (!input.confirm) {
    const city = await resolveCity(ctx, couple, input.city_ref, false)
    return { status: 'preview', ...(await preview(ctx, couple, people, city, input.from, to)), next: CONFIRM_HINT }
  }
  const city = await resolveCity(ctx, couple, input.city_ref, true)
  const { data, error } = await ctx.db.rpc('paint_stays', {
    p_entries: people.map((p) => ({ profile_id: p.profileId, city_id: city.id, from: input.from, to })),
  })
  if (error) throw dbFailure(error)
  if ((data as { status?: string } | null)?.status === 'not_member') throw new ToolFailure('not_member', 'Esta conta ainda não está num espaço do lanabiel.')
  return { status: 'ok', recorded: people.map((p) => ({ who: p.name, city: city.label, from: input.from, to })) }
}

export interface CreateVisitInput {
  who: Who
  city_ref: string
  starts_on: string
  ends_on: string
  title?: string | null
  note?: string | null
  /** Pinta o período de quem viaja (padrão). Falso: só o evento na agenda. */
  record_period?: boolean
  confirm?: boolean
}

/** Visita: `create_event` com `kind = visita` e, por padrão, a pintura na mesma transação. */
export async function createVisit(ctx: Ctx, input: CreateVisitInput) {
  const couple = await loadCouple(ctx)
  checkRange(input.starts_on, input.ends_on, 'starts_on', 'ends_on')
  const people = peopleOf(couple, input.who)
  const paint = input.record_period ?? true
  const note = checkNote(input.note)

  if (!input.confirm) {
    const city = await resolveCity(ctx, couple, input.city_ref, false)
    const title = checkTitle(input.title ?? `Visita a ${city.label.split(/[,·]/)[0].trim()}`)
    const period = paint
      ? await preview(ctx, couple, people, city, input.starts_on, input.ends_on)
      : { will_record: [], replaces: [], note: 'Só o evento na agenda; o período de ninguém muda.' }
    return { status: 'preview', event: { kind: 'visita', title, city: city.label, starts_on: input.starts_on, ends_on: input.ends_on }, ...period, next: CONFIRM_HINT }
  }
  const city = await resolveCity(ctx, couple, input.city_ref, true)
  const title = checkTitle(input.title ?? `Visita a ${city.label.split(/[,·]/)[0].trim()}`)
  const solo = people.length === 1
  const { data, error } = await ctx.db.rpc('create_event', {
    p_event: {
      kind: 'visita',
      title,
      starts_on: input.starts_on,
      ends_on: input.ends_on,
      all_day: true,
      travelers: solo ? 'solo' : 'both',
      traveler_id: solo ? people[0].profileId : null,
      city_id: city.id,
      note,
    },
    p_paint: paint,
  })
  if (error) throw dbFailure(error)
  const result = data as { status?: string; id?: string } | null
  if (result?.status === 'not_member') throw new ToolFailure('not_member', 'Esta conta ainda não está num espaço do lanabiel.')
  return { status: 'ok', id: result?.id ?? null, title, city: city.label, period_recorded: paint }
}

export interface CreateTripInput {
  who: Who
  city_ref: string
  starts_on: string
  ends_on: string
  title?: string | null
  note?: string | null
  lodging_name?: string | null
  confirm?: boolean
}

/** Viagem: `create_trip` (evento `viagem`, pintura e a linha de `trips`, numa transação). */
export async function createTrip(ctx: Ctx, input: CreateTripInput) {
  const couple = await loadCouple(ctx)
  checkRange(input.starts_on, input.ends_on, 'starts_on', 'ends_on')
  const people = peopleOf(couple, input.who)
  const note = checkNote(input.note)
  const lodging = input.lodging_name?.trim() || null
  if (lodging && lodging.length > LODGING_MAX) throw new ToolFailure('invalid', `lodging_name: até ${LODGING_MAX} caracteres.`)

  if (!input.confirm) {
    const city = await resolveCity(ctx, couple, input.city_ref, false)
    const title = checkTitle(input.title ?? city.label.split(/[,·]/)[0].trim())
    return {
      status: 'preview',
      trip: { title, destination: city.label, starts_on: input.starts_on, ends_on: input.ends_on, who: people.map((p) => p.name), lodging },
      ...(await preview(ctx, couple, people, city, input.starts_on, input.ends_on)),
      next: CONFIRM_HINT,
    }
  }
  const city = await resolveCity(ctx, couple, input.city_ref, true)
  const title = checkTitle(input.title ?? city.label.split(/[,·]/)[0].trim())
  const solo = people.length === 1
  const { data, error } = await ctx.db.rpc('create_trip', {
    p_trip: {
      title,
      city_id: city.id,
      starts_on: input.starts_on,
      ends_on: input.ends_on,
      note,
      lodging_name: lodging,
      travelers: solo ? 'solo' : 'both',
      traveler_id: solo ? people[0].profileId : null,
    },
  })
  if (error) throw dbFailure(error)
  const result = data as { status?: string; id?: string } | null
  if (result?.status === 'not_member') throw new ToolFailure('not_member', 'Esta conta ainda não está num espaço do lanabiel.')
  if (result?.status !== 'ok') throw new ToolFailure('error', `create_trip: status inesperado ${String(result?.status)}`)
  return { status: 'ok', id: result.id ?? null, title, destination: city.label, who: people.map((p) => p.name) }
}
