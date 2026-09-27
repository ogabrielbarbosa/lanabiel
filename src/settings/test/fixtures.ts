// Dados e API falsos das Configurações, para os testes de interface e do
// export. Gabriel (slot 1, SJC) e Lana (slot 2, Marau).

import { vi } from 'vitest'
import type { CalendarExportData } from '../../data/calendar'
import type { City } from '../../data/cities'
import type { CalCity } from '../../domain/calendar'
import type { SettingsData } from '../../data/settings'
import type { ListCounts, ListExportData } from '../../data/listSummary'
import type { ListItem } from '../../domain/list'
import type { SettingsApi } from '../api'

export const SJC: City = { id: 'c-sjc', name: 'São José dos Campos', stateCode: 'SP', lat: -23.1791, lng: -45.8872 }
export const MARAU: City = { id: 'c-marau', name: 'Marau', stateCode: 'RS', lat: -28.4498, lng: -52.2 }
export const PARATY: City = { id: 'c-paraty', name: 'Paraty', stateCode: 'RJ', lat: -23.2178, lng: -44.7131 }
export const PASSO_FUNDO: City = { id: 'c-pf', name: 'Passo Fundo', stateCode: 'RS', lat: -28.26, lng: -52.41 }

/** As mesmas cidades como o Calendário as lê (com país e região) — o export as resolve assim. */
const br = (c: City): CalCity => ({ ...c, countryCode: 'BR', region: null })
export const CAL_SJC = br(SJC)
export const CAL_MARAU = br(MARAU)
export const LISBOA: CalCity = {
  id: 'c-lisboa',
  name: 'Lisboa',
  stateCode: null,
  countryCode: 'PT',
  region: 'Lisboa',
  lat: 38.7223,
  lng: -9.1393,
}

const notify = {} as SettingsData['profileSettings']['notify']
for (const event of ['partner_list_item', 'partner_done', 'partner_event', 'anniversary', 'trip_eve', 'own_reminders']) {
  for (const channel of ['app', 'email', 'push']) {
    ;(notify as Record<string, boolean>)[`notify_${event}_${channel}`] = channel !== 'email'
  }
}

export function settingsData(overrides: Partial<SettingsData> = {}): SettingsData {
  return {
    me: { profileId: 'u-gabriel', email: 'gabriel@test.local' },
    couple: {
      id: 'couple-1',
      name: 'Gabi & Lana',
      startedOn: '2024-09-17',
      coverPath: null,
      createdAt: '2024-09-17T12:00:00Z',
      members: [
        {
          profileId: 'u-gabriel',
          slot: 1,
          displayName: 'Gabriel',
          fullName: 'Gabriel Barbosa',
          avatarPath: null,
          color: '#7FD8C4',
          joinedAt: '2024-09-17T12:00:00Z',
          homeCity: SJC,
        },
        {
          profileId: 'u-lana',
          slot: 2,
          displayName: 'Lana',
          fullName: 'Lana Martins',
          avatarPath: null,
          color: '#F4A3B4',
          joinedAt: '2024-09-18T12:00:00Z',
          homeCity: MARAU,
        },
      ],
    },
    coupleSettings: {
      remindAnniversary: true,
      showHomeCounter: true,
      useCoupleCover: false,
      calendarDefaultView: 'month',
      weekStartsOn: 'sun',
      showAdjacentDays: true,
      showDayMarkers: true,
      colorTogetherHome1: '#7FD8C4',
      colorTogetherHome2: '#9CCBF2',
      colorTogetherAway: '#F6E3A1',
      colorApart: '#8E97BD',
      listDefaultSort: 'recent',
      showCategoryProgress: true,
      hiddenCategories: [],
      showDailySuggestion: true,
    },
    profileSettings: { notifyPartnerByDefault: true, notify },
    savedCities: [{ ...PARATY, countryCode: 'BR', addedAt: '2026-01-01T00:00:00Z' }],
    stays: [
      { id: 's1', profileId: 'u-gabriel', cityId: SJC.id, startsOn: '2026-09-20', endsOn: null },
      { id: 's2', profileId: 'u-lana', cityId: SJC.id, startsOn: '2026-09-20', endsOn: '2026-09-22' },
      { id: 's3', profileId: 'u-lana', cityId: MARAU.id, startsOn: '2026-09-23', endsOn: null },
    ],
    ...overrides,
  }
}

// UUIDs com o formato real, para o teste do export poder varrer o JSON por
// "algo com cara de id de perfil" — `u-gabriel` não tem essa cara.
export const GABRIEL_UUID = '0b6a8f3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b'
export const LANA_UUID = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a'
export const EX_UUID = '11111111-2222-4333-8444-555555555555'
export const COUPLE_UUID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
export const ITEM_PARATY = '7c1b2d3e-4f5a-4b6c-9d7e-8f9a0b1c2d3e'
export const ITEM_FILME = '3e2d1c0b-9a8f-4e7d-a6c5-b4a3928170ff'

/** Os mesmos dois, com UUIDs reais nos ids de perfil e de casal. */
export function settingsDataWithUuids(): SettingsData {
  const data = settingsData()
  data.me.profileId = GABRIEL_UUID
  data.couple.id = COUPLE_UUID
  data.couple.members[0]!.profileId = GABRIEL_UUID
  data.couple.members[1]!.profileId = LANA_UUID
  data.stays = data.stays.map((s) => ({ ...s, profileId: s.profileId === 'u-gabriel' ? GABRIEL_UUID : LANA_UUID }))
  return data
}

const baseItem = {
  note: null,
  link: null,
  featured: false,
  region: null,
  venue: null,
  highlights: [],
  platform: null,
  seasons: null,
  photoPath: null,
  rating: null,
  doneOn: null,
  doneWith: null,
  doneSoloBy: null,
} satisfies Partial<ListItem>

/** Um lugar feito pela Lana sozinha, um filme adicionado por quem já saiu. */
export function listExportData(): ListExportData {
  return {
    items: [
      {
        ...baseItem,
        id: ITEM_PARATY,
        category: 'cidade',
        name: 'Paraty',
        place: { address: null, city: 'Paraty', state: 'RJ', country: 'Brasil', countryCode: 'BR', lat: -23.2178, lng: -44.7131 },
        region: 'Costa Verde',
        photoPath: `${COUPLE_UUID}/item/aaaa.webp`,
        status: 'done',
        rating: 5,
        addedBy: GABRIEL_UUID,
        createdAt: '2026-09-01T12:00:00Z',
        doneOn: '2026-09-10',
        doneWith: 'solo',
        doneSoloBy: LANA_UUID,
      },
      {
        ...baseItem,
        id: ITEM_FILME,
        category: 'filme',
        name: 'Past Lives',
        place: null,
        platform: 'MUBI',
        status: 'want',
        addedBy: EX_UUID,
        createdAt: '2026-09-02T12:00:00Z',
      },
    ],
    memories: [
      { itemId: ITEM_PARATY, profileId: LANA_UUID, body: 'Chuva o dia todo', createdAt: '2026-09-11T10:00:00Z', updatedAt: '2026-09-11T10:00:00Z' },
      { itemId: ITEM_PARATY, profileId: EX_UUID, body: 'Não fui', createdAt: '2026-09-12T10:00:00Z', updatedAt: '2026-09-12T10:00:00Z' },
    ],
    photoCounts: new Map([[ITEM_PARATY, 3]]),
  }
}

export const EVENT_LISBOA = '6a5b4c3d-2e1f-4a0b-9c8d-7e6f5a4b3c2d'
export const EVENT_PARATY = '0f1e2d3c-4b5a-4968-8776-655443322110'

/**
 * Uma viagem da Lana a Lisboa criada pelo Gabriel, um date vinculado a
 * Paraty criado por quem já saiu, e 💋 em dois dias.
 */
export function calendarExportData(): CalendarExportData {
  const base = {
    endsOn: null,
    allDay: true,
    startsAt: null,
    endsAt: null,
    travelers: null,
    travelerId: null,
    cityId: null,
    place: null,
    repeatsYearly: false,
    note: null,
    listItemId: null,
  } as const
  return {
    events: [
      {
        ...base,
        id: EVENT_LISBOA,
        kind: 'viagem',
        title: 'Lisboa',
        startsOn: '2026-10-01',
        endsOn: '2026-10-08',
        allDay: false,
        startsAt: '22:10',
        endsAt: '14:30',
        travelers: 'solo',
        travelerId: LANA_UUID,
        cityId: LISBOA.id,
        createdBy: GABRIEL_UUID,
      },
      {
        ...base,
        id: EVENT_PARATY,
        kind: 'date',
        title: 'Fim de semana em Paraty',
        startsOn: '2026-11-14',
        place: 'Pousada do Sandi',
        listItemId: ITEM_PARATY,
        createdBy: EX_UUID,
      },
    ],
    kisses: [
      { day: '2026-09-20', count: 2 },
      { day: '2026-09-21', count: 1 },
    ],
  }
}

export function listCounts(overrides: Partial<ListCounts['byCategory']> = {}): ListCounts {
  const byCategory = { pais: 7, cidade: 2, restaurante: 0, parque: 1, comida: 0, experiencia: 0, filme: 3, serie: 0, ...overrides }
  return { total: Object.values(byCategory).reduce((a, b) => a + b, 0), byCategory }
}

export function fakeApi(data: SettingsData = settingsData(), overrides: Partial<SettingsApi> = {}): SettingsApi {
  return {
    today: () => '2026-09-25',
    now: () => Date.UTC(2026, 8, 25, 15),
    loadSettings: vi.fn(async () => ({ status: 'ok' as const, rows: data })),
    updateCoupleSettings: vi.fn(async (patch) => ({
      status: 'ok' as const,
      value: { ...data.coupleSettings, ...patch },
    })),
    updateProfileSettings: vi.fn(async (patch) => ({
      status: 'ok' as const,
      value:
        'column' in patch
          ? { ...data.profileSettings, notify: { ...data.profileSettings.notify, [patch.column]: patch.value } }
          : { ...data.profileSettings, notifyPartnerByDefault: patch.notifyPartnerByDefault },
    })),
    updateCouple: vi.fn(async () => ({ status: 'ok' as const })),
    updateProfile: vi.fn(async () => ({ status: 'ok' as const })),
    searchCities: vi.fn(async () => ({ status: 'ok' as const, rows: [PASSO_FUNDO, MARAU, PARATY] })),
    loadCalCities: vi.fn(async () => ({
      status: 'ok' as const,
      rows: new Map([CAL_SJC, CAL_MARAU, LISBOA].map((c) => [c.id, c])),
    })),
    saveCity: vi.fn(async () => ({ status: 'ok' as const })),
    removeSavedCity: vi.fn(async () => ({ status: 'ok' as const })),
    prepareAvatar: vi.fn(async () => ({ status: 'not_image' as const })),
    uploadAvatar: vi.fn(async () => ({ status: 'ok' as const, path: 'u-gabriel/x.webp' })),
    avatarUrl: vi.fn(async () => null),
    prepareCover: vi.fn(async () => ({ status: 'not_image' as const })),
    replaceCover: vi.fn(async () => ({ status: 'ok' as const, path: 'couple-1/cover/x.webp' })),
    coverUrl: vi.fn(async () => null),
    changePassword: vi.fn(async () => ({ status: 'changed' as const })),
    signOut: vi.fn(async () => undefined),
    listSessions: vi.fn(async () => ({ status: 'ok' as const, rows: [] })),
    endSession: vi.fn(async () => ({ status: 'ended' as const })),
    loadPhotoStats: vi.fn(async () => ({ status: 'ok' as const, rows: { count: 2, bytes: 200_000, truncated: false } })),
    loadListCounts: vi.fn(async () => ({ status: 'ok' as const, rows: listCounts() })),
    loadListExport: vi.fn(async () => ({ status: 'ok' as const, rows: listExportData() })),
    loadCalendarExport: vi.fn(async () => ({ status: 'ok' as const, rows: calendarExportData() })),
    loadOpenInvite: vi.fn(async () => ({ status: 'ok' as const, rows: null })),
    createInvite: vi.fn(async () => ({ status: 'created' as const, inviteId: 'inv-2', code: 'ABC123', expiresAt: '2026-10-02T00:00:00Z' })),
    sendInvite: vi.fn(async () => ({ status: 'send_failed' as const, cause: 'sem Resend' })),
    cancelInvite: vi.fn(async () => ({ status: 'cancelled' as const })),
    leaveCouple: vi.fn(async () => ({ status: 'left' as const, coupleDeleted: false })),
    deleteCouple: vi.fn(async () => ({ status: 'deleted' as const })),
    download: vi.fn(),
    ...overrides,
  }
}
