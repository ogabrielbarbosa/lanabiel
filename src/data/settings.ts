// Fronteira de banco das Configurações (Fase 3). snake_case não passa daqui.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, seções 5 e 7
// ADR:  .agent/Decisions/0011-preferencias-em-tres-escopos.md
//
// Nenhuma query filtra por `couple_id`: a policy decide (ADR 0001). Onde há
// `.eq('profile_id' | 'id', uid)`, é IDENTIDADE — qual das linhas que a pessoa
// pode ver é a dela —, não autorização.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { Stay } from '../domain/coupleState'
import { NOTIFY_CHANNELS, NOTIFY_EVENTS, notifyColumn } from '../domain/settings'
import type { BandColor, ListCategory, NotifyColumn, PersonColor } from '../domain/settings'
import type { City } from './cities'
import type { DataResult } from './result'
import { callRpc, isCheckViolation } from './rpc'
import type { Failure } from './rpc'
import { toDomainStay } from './stays'

type Db = SupabaseClient<Database>
type Tables = Database['public']['Tables']
type CoupleSettingsRow = Tables['couple_settings']['Row']
type ProfileSettingsRow = Tables['profile_settings']['Row']

// ---------------------------------------------------------------------------
// Preferências do casal
// ---------------------------------------------------------------------------
export interface CoupleSettings {
  remindAnniversary: boolean
  showHomeCounter: boolean
  useCoupleCover: boolean
  calendarDefaultView: 'month' | 'year'
  weekStartsOn: 'sun' | 'mon'
  showAdjacentDays: boolean
  showDayMarkers: boolean
  colorTogetherHome1: BandColor
  colorTogetherHome2: BandColor
  colorTogetherAway: BandColor
  colorApart: BandColor
  listDefaultSort: 'recent' | 'az' | 'category'
  showCategoryProgress: boolean
  hiddenCategories: ListCategory[]
  showDailySuggestion: boolean
}

/** camelCase da tela → coluna. Uma tabela só, usada nos dois sentidos. */
const COUPLE_COLUMNS = {
  remindAnniversary: 'remind_anniversary',
  showHomeCounter: 'show_home_counter',
  useCoupleCover: 'use_couple_cover',
  calendarDefaultView: 'calendar_default_view',
  weekStartsOn: 'week_starts_on',
  showAdjacentDays: 'show_adjacent_days',
  showDayMarkers: 'show_day_markers',
  colorTogetherHome1: 'color_together_home_1',
  colorTogetherHome2: 'color_together_home_2',
  colorTogetherAway: 'color_together_away',
  colorApart: 'color_apart',
  listDefaultSort: 'list_default_sort',
  showCategoryProgress: 'show_category_progress',
  hiddenCategories: 'hidden_categories',
  showDailySuggestion: 'show_daily_suggestion',
} as const satisfies Record<keyof CoupleSettings, keyof CoupleSettingsRow>

export function toCoupleSettings(row: CoupleSettingsRow): CoupleSettings {
  const out = {} as Record<string, unknown>
  for (const [key, column] of Object.entries(COUPLE_COLUMNS)) out[key] = row[column]
  // Os CHECK garantem os valores; o `as` é a fronteira confiando no schema,
  // como `toDomainStay` confia no `daterange`.
  return out as unknown as CoupleSettings
}

function toCoupleColumns(patch: Partial<CoupleSettings>): Partial<CoupleSettingsRow> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(patch)) {
    out[COUPLE_COLUMNS[key as keyof CoupleSettings]] = value
  }
  return out as Partial<CoupleSettingsRow>
}

export type SettingsWriteResult<T> =
  | { status: 'ok'; value: T }
  /** O CHECK recusou — a tela já valida, então é divergência. */
  | { status: 'invalid'; cause: string }
  | Failure

/**
 * Grava SÓ as colunas do patch: mudanças dos dois em colunas diferentes não
 * se sobrescrevem (spec, seção 7). Devolve a linha inteira como ficou — a
 * tela mostra o que está gravado, não o que pediu.
 */
export async function updateCoupleSettings(
  db: Db,
  patch: Partial<CoupleSettings>,
): Promise<SettingsWriteResult<CoupleSettings>> {
  const { data: session } = await db.auth.getSession()
  if (!session.session) return { status: 'unauthenticated' }

  const { data, error } = await db
    .from('couple_settings')
    .update(toCoupleColumns(patch))
    .not('couple_id', 'is', null) // o PostgREST exige filtro em UPDATE; quem corta é a policy
    .select('*')
  if (isCheckViolation(error) || error?.code === '23514') return { status: 'invalid', cause: error!.message }
  if (error) return { status: 'error', cause: error.message }
  // Zero linhas: a policy não deixou (saiu do casal em outro aparelho).
  if (!data || data.length !== 1) return { status: 'error', cause: 'este espaço mudou — recarregue' }
  return { status: 'ok', value: toCoupleSettings(data[0]) }
}

// ---------------------------------------------------------------------------
// Preferências da pessoa
// ---------------------------------------------------------------------------
export interface ProfileSettings {
  notifyPartnerByDefault: boolean
  notify: Record<NotifyColumn, boolean>
}

export function toProfileSettings(row: ProfileSettingsRow): ProfileSettings {
  const notify = {} as Record<NotifyColumn, boolean>
  for (const event of NOTIFY_EVENTS) {
    for (const channel of NOTIFY_CHANNELS) {
      const column = notifyColumn(event, channel)
      notify[column] = row[column]
    }
  }
  return { notifyPartnerByDefault: row.notify_partner_by_default, notify }
}

export type ProfileSettingsPatch =
  | { notifyPartnerByDefault: boolean }
  | { column: NotifyColumn; value: boolean }

export async function updateProfileSettings(
  db: Db,
  patch: ProfileSettingsPatch,
): Promise<SettingsWriteResult<ProfileSettings>> {
  const { data: session } = await db.auth.getSession()
  const uid = session.session?.user.id
  if (!uid) return { status: 'unauthenticated' }

  const columns: Partial<ProfileSettingsRow> =
    'column' in patch ? { [patch.column]: patch.value } : { notify_partner_by_default: patch.notifyPartnerByDefault }
  const { data, error } = await db
    .from('profile_settings')
    .update(columns)
    .eq('profile_id', uid)
    .select('*')
  if (error) return { status: 'error', cause: error.message }
  if (!data || data.length !== 1) return { status: 'error', cause: 'suas preferências não foram encontradas' }
  return { status: 'ok', value: toProfileSettings(data[0]) }
}

// ---------------------------------------------------------------------------
// O casal e o perfil, como as Configurações os mostram
// ---------------------------------------------------------------------------
export interface SettingsMember {
  profileId: string
  slot: 1 | 2
  displayName: string
  fullName: string
  avatarPath: string | null
  color: PersonColor
  joinedAt: string
  homeCity: City
}

export interface SettingsCouple {
  id: string
  name: string | null
  startedOn: string
  coverPath: string | null
  /** Quem criou é quem entrou no mesmo instante em que o casal nasceu (mesma transação). */
  createdAt: string
  members: SettingsMember[]
}

export interface SavedCity extends City {
  countryCode: string
  addedAt: string
}

export interface SettingsData {
  me: { profileId: string; email: string | null }
  couple: SettingsCouple
  coupleSettings: CoupleSettings
  profileSettings: ProfileSettings
  savedCities: SavedCity[]
  stays: Stay[]
}

type CityRow = Tables['cities']['Row']
const toCity = (c: Pick<CityRow, 'id' | 'name' | 'state_code' | 'lat' | 'lng'>): City => ({
  id: c.id,
  name: c.name,
  stateCode: c.state_code,
  lat: c.lat,
  lng: c.lng,
})

/**
 * Tudo que a tela precisa para abrir, em paralelo (≤ 5 viagens, seção 8).
 * Qualquer parte não-`ok` derruba o todo: a tela não abre com metade do dado
 * e padrões no lugar do resto (seção 7).
 */
export async function loadSettings(db: Db): Promise<DataResult<SettingsData>> {
  const { data: session } = await db.auth.getSession()
  const user = session.session?.user
  if (!user) return { status: 'unauthenticated' }

  const [couple, members, coupleSettings, profileSettings, saved, stays] = await Promise.all([
    db.from('couples').select('id, name, started_on, cover_path, created_at').maybeSingle(),
    db
      .from('couple_members')
      .select(
        'slot, joined_at, profiles!inner(id, display_name, full_name, avatar_path, color, cities!inner(id, name, state_code, lat, lng))',
      )
      .order('slot'),
    db.from('couple_settings').select('*').maybeSingle(),
    db.from('profile_settings').select('*').eq('profile_id', user.id).maybeSingle(),
    db
      .from('couple_saved_cities')
      .select('created_at, cities!inner(id, name, state_code, country_code, lat, lng)')
      .order('created_at'),
    db.from('stays').select('*').order('starts_on'),
  ])

  const failed = [couple, members, coupleSettings, profileSettings, saved, stays].find((r) => r.error)
  if (failed?.error) return { status: 'error', cause: failed.error.message }
  // Com `ready` garantido pelo portão, as três linhas existem (os triggers da
  // migration criam as preferências). Ausência aqui é divergência, não "use o
  // padrão" (I2).
  if (!couple.data) return { status: 'error', cause: 'o espaço de vocês não foi encontrado' }
  if (!coupleSettings.data) return { status: 'error', cause: 'as preferências do casal não foram encontradas' }
  if (!profileSettings.data) return { status: 'error', cause: 'suas preferências não foram encontradas' }

  return {
    status: 'ok',
    rows: {
      me: { profileId: user.id, email: user.email ?? null },
      couple: {
        id: couple.data.id,
        name: couple.data.name,
        startedOn: couple.data.started_on,
        coverPath: couple.data.cover_path,
        createdAt: couple.data.created_at,
        members: members.data!.map((m) => ({
          profileId: m.profiles.id,
          slot: m.slot === 2 ? 2 : 1,
          displayName: m.profiles.display_name,
          fullName: m.profiles.full_name,
          avatarPath: m.profiles.avatar_path,
          color: m.profiles.color as PersonColor,
          joinedAt: m.joined_at,
          homeCity: toCity(m.profiles.cities),
        })),
      },
      coupleSettings: toCoupleSettings(coupleSettings.data),
      profileSettings: toProfileSettings(profileSettings.data),
      savedCities: saved.data!.map((s) => ({
        ...toCity(s.cities),
        countryCode: s.cities.country_code,
        addedAt: s.created_at,
      })),
      stays: stays.data!.map(toDomainStay),
    },
  }
}

// ---------------------------------------------------------------------------
// Casal e perfil
// ---------------------------------------------------------------------------
export type CouplePatch = { name: string | null } | { startedOn: string } | { coverPath: string | null }

export type CoupleWriteResult =
  | { status: 'ok' }
  | { status: 'invalid'; field: 'name' | 'started_on' | 'cover_path' }
  | Failure

/** UPDATE direto: `couples_update_member` corta; o trigger recusa data futura. */
export async function updateCouple(db: Db, coupleId: string, patch: CouplePatch): Promise<CoupleWriteResult> {
  const columns =
    'name' in patch
      ? { name: patch.name }
      : 'startedOn' in patch
        ? { started_on: patch.startedOn }
        : { cover_path: patch.coverPath }
  const { data, error } = await db.from('couples').update(columns).eq('id', coupleId).select('id')
  if (isCheckViolation(error)) {
    const field = 'name' in patch ? 'name' : 'startedOn' in patch ? 'started_on' : 'cover_path'
    return { status: 'invalid', field }
  }
  if (error) return error.code === '42501' ? { status: 'unauthenticated' } : { status: 'error', cause: error.message }
  if (!data || data.length === 0) return { status: 'error', cause: 'este espaço mudou — recarregue' }
  return { status: 'ok' }
}

export type ProfilePatch =
  | { displayName: string }
  | { color: PersonColor }
  | { homeCityId: string }
  | { avatarPath: string | null }

export type ProfileWriteResult =
  | { status: 'ok' }
  | { status: 'invalid'; cause: string }
  /** A outra pessoa já usa essa cor (trigger `profiles_color_distinct`, I4). */
  | { status: 'color_taken' }
  | Failure

export async function updateProfile(db: Db, patch: ProfilePatch): Promise<ProfileWriteResult> {
  const { data: session } = await db.auth.getSession()
  const uid = session.session?.user.id
  if (!uid) return { status: 'unauthenticated' }

  const columns =
    'displayName' in patch
      ? { display_name: patch.displayName.trim() }
      : 'color' in patch
        ? { color: patch.color }
        : 'homeCityId' in patch
          ? { home_city_id: patch.homeCityId }
          : { avatar_path: patch.avatarPath }
  const { data, error } = await db.from('profiles').update(columns).eq('id', uid).select('id')
  // O trigger põe o nome da regra no `hint` — é o que o PostgREST repassa
  // (a opção `constraint` do RAISE não chega ao cliente).
  if (error?.hint === 'profiles_color_taken') return { status: 'color_taken' }
  if (isCheckViolation(error)) return { status: 'invalid', cause: error!.message }
  if (error) return { status: 'error', cause: error.message }
  if (!data || data.length === 0) return { status: 'error', cause: 'seu perfil não foi encontrado' }
  return { status: 'ok' }
}

// ---------------------------------------------------------------------------
// Cidades salvas
// ---------------------------------------------------------------------------
export type SavedCityWriteResult = { status: 'ok' } | { status: 'already_saved' } | Failure

export async function saveCity(db: Db, coupleId: string, cityId: string): Promise<SavedCityWriteResult> {
  const { data: session } = await db.auth.getSession()
  const uid = session.session?.user.id
  if (!uid) return { status: 'unauthenticated' }
  // `couple_id` aqui é o DADO da linha nova, não filtro: a policy de INSERT
  // confere que ele é um dos casais de quem insere.
  const { error } = await db
    .from('couple_saved_cities')
    .insert({ couple_id: coupleId, city_id: cityId, added_by: uid })
  if (error?.code === '23505') return { status: 'already_saved' }
  if (error) return { status: 'error', cause: error.message }
  return { status: 'ok' }
}

export async function removeSavedCity(db: Db, cityId: string): Promise<{ status: 'ok' } | Failure> {
  const { error } = await db.from('couple_saved_cities').delete().eq('city_id', cityId)
  if (error) return { status: 'error', cause: error.message }
  return { status: 'ok' }
}

// ---------------------------------------------------------------------------
// Sair, apagar, cancelar convite
// ---------------------------------------------------------------------------
export type LeaveResult = { status: 'left'; coupleDeleted: boolean } | { status: 'not_member' } | Failure

export async function leaveCouple(db: Db): Promise<LeaveResult> {
  const result = await callRpc(db, 'leave_couple')
  if (result.status !== 'ok') return result
  const raw = result.data
  if (raw.status === 'left') return { status: 'left', coupleDeleted: raw.couple_deleted === true }
  if (raw.status === 'not_member') return { status: 'not_member' }
  return { status: 'error', cause: `leave_couple: status inesperado ${String(raw.status)}` }
}

export type DeleteCoupleResult =
  | { status: 'deleted' }
  | { status: 'not_member' }
  /** A pasta de mídia não saiu: nada foi apagado. */
  | { status: 'media_failed'; cause: string }
  /** A mídia saiu, o casal não: perdeu só a capa (spec, seção 7). */
  | { status: 'couple_failed'; cause: string }
  | { status: 'unauthenticated' }

/**
 * Ordem: arquivos de `couple-media/<couple_id>/` primeiro, RPC depois. O
 * Storage recusa delete por SQL, e depois da RPC a pessoa já não é membro — a
 * policy não a deixaria apagar mais nada.
 */
export async function deleteCouple(db: Db, coupleId: string): Promise<DeleteCoupleResult> {
  const media = await removeFolder(db, 'couple-media', coupleId)
  if (media.status !== 'ok') return { status: 'media_failed', cause: media.cause }

  const result = await callRpc(db, 'delete_couple')
  if (result.status === 'unauthenticated') return result
  if (result.status === 'error') return { status: 'couple_failed', cause: result.cause }
  if (result.data.status === 'deleted') return { status: 'deleted' }
  if (result.data.status === 'not_member') return { status: 'not_member' }
  return { status: 'couple_failed', cause: `delete_couple: status inesperado ${String(result.data.status)}` }
}

export type CancelInviteResult = { status: 'cancelled' } | { status: 'none_open' } | { status: 'not_member' } | Failure

export async function cancelInvite(db: Db): Promise<CancelInviteResult> {
  const result = await callRpc(db, 'cancel_invite')
  if (result.status !== 'ok') return result
  const raw = result.data
  if (raw.status === 'cancelled' || raw.status === 'none_open' || raw.status === 'not_member') {
    return { status: raw.status }
  }
  return { status: 'error', cause: `cancel_invite: status inesperado ${String(raw.status)}` }
}

// ---------------------------------------------------------------------------
// Storage: listar recursivamente (a API lista uma pasta por vez)
// ---------------------------------------------------------------------------
interface StoredFile {
  path: string
  size: number
}

const LIST_LIMIT = 1000

async function listFiles(
  db: Db,
  bucket: string,
  folder: string,
): Promise<{ status: 'ok'; files: StoredFile[]; truncated: boolean } | { status: 'error'; cause: string }> {
  const { data, error } = await db.storage.from(bucket).list(folder, { limit: LIST_LIMIT })
  if (error) return { status: 'error', cause: error.message }
  const files: StoredFile[] = []
  let truncated = data.length >= LIST_LIMIT
  for (const entry of data) {
    const path = `${folder}/${entry.name}`
    // Pasta = entrada sem `id` na listagem do Storage.
    if (entry.id === null) {
      const nested = await listFiles(db, bucket, path)
      if (nested.status !== 'ok') return nested
      files.push(...nested.files)
      truncated ||= nested.truncated
    } else {
      files.push({ path, size: Number((entry.metadata as { size?: number } | null)?.size ?? 0) })
    }
  }
  return { status: 'ok', files, truncated }
}

async function removeFolder(db: Db, bucket: string, folder: string): Promise<{ status: 'ok' } | { status: 'error'; cause: string }> {
  const listed = await listFiles(db, bucket, folder)
  if (listed.status !== 'ok') return listed
  if (listed.files.length === 0) return { status: 'ok' }
  const { error } = await db.storage.from(bucket).remove(listed.files.map((f) => f.path))
  if (error) return { status: 'error', cause: error.message }
  return { status: 'ok' }
}

export interface PhotoStats {
  count: number
  bytes: number
  /** Passou de 1000 arquivos numa pasta: a contagem é piso, não total (seção 8). */
  truncated: boolean
}

/** Fotos de perfil dos dois e mídia do casal (R20). */
export async function loadPhotoStats(db: Db, couple: SettingsCouple): Promise<DataResult<PhotoStats>> {
  const folders: [string, string][] = [
    ...couple.members.map((m): [string, string] => ['avatars', m.profileId]),
    ['couple-media', couple.id],
  ]
  const listings = await Promise.all(folders.map(([bucket, folder]) => listFiles(db, bucket, folder)))
  let count = 0
  let bytes = 0
  let truncated = false
  for (const listing of listings) {
    if (listing.status !== 'ok') return { status: 'error', cause: listing.cause }
    count += listing.files.length
    bytes += listing.files.reduce((sum, f) => sum + f.size, 0)
    truncated ||= listing.truncated
  }
  return { status: 'ok', rows: { count, bytes, truncated } }
}

// ---------------------------------------------------------------------------
// Capa do casal (ADR 0012)
// ---------------------------------------------------------------------------
export type CoverUploadResult = { status: 'ok'; path: string } | Failure

/**
 * Sobe a capa nova, grava `cover_path`, e só então apaga a antiga. Falhou o
 * UPDATE: apaga a recém-subida (melhor esforço). Falhou apagar a antiga: órfã
 * aceita (spec, seção 7).
 */
export async function replaceCover(
  db: Db,
  couple: { id: string; coverPath: string | null },
  image: { blob: Blob; extension: 'webp' | 'jpg' },
): Promise<CoverUploadResult> {
  const path = `${couple.id}/cover/${crypto.randomUUID()}.${image.extension}`
  const { error: uploadError } = await db.storage.from('couple-media').upload(path, image.blob, {
    contentType: image.extension === 'webp' ? 'image/webp' : 'image/jpeg',
    upsert: false,
  })
  if (uploadError) return { status: 'error', cause: uploadError.message }

  const saved = await updateCouple(db, couple.id, { coverPath: path })
  if (saved.status !== 'ok') {
    await db.storage.from('couple-media').remove([path])
    if (saved.status === 'unauthenticated') return saved
    return { status: 'error', cause: saved.status === 'error' ? saved.cause : 'a capa não foi aceita' }
  }

  if (couple.coverPath) await db.storage.from('couple-media').remove([couple.coverPath])
  return { status: 'ok', path }
}

export async function coverUrl(db: Db, path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await db.storage.from('couple-media').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}
