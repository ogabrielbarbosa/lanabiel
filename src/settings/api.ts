// O que as Configurações pedem ao mundo, num objeto só — o mesmo padrão de
// `OnboardingApi`: a tela recebe isto por parâmetro, e o teste de interface
// dirige cada resposta (ok, erro, cor ocupada…) sem rede. O que o banco
// REALMENTE responde está em supabase/tests/settings.test.ts e vizinhos.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, seção 5 ("Cliente")

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { todayISO } from '../lib/date'
import { changePassword, signOut } from '../auth/signIn'
import { avatarUrl, prepareAvatar, prepareCover, uploadAvatar } from '../data/avatar'
import { loadCalCities, searchCities } from '../data/cities'
import { loadCalendarExport } from '../data/calendar'
import { createInvite, loadOpenInvite, sendInvite } from '../data/invites'
import { endMySession, listMySessions } from '../data/sessions'
import { loadListCounts, loadListExport } from '../data/listSummary'
import {
  cancelInvite,
  coverUrl,
  deleteCouple,
  leaveCouple,
  loadPhotoStats,
  loadSettings,
  removeSavedCity,
  replaceCover,
  saveCity,
  savePendingPartner,
  updateCouple,
  updateCoupleSettings,
  updateProfile,
  updateProfileSettings,
} from '../data/settings'
import type { SettingsCouple } from '../data/settings'
import { loadTrips } from '../data/trips'

type Db = SupabaseClient<Database>

export interface SettingsApi {
  today: () => string
  now: () => number
  loadSettings: () => ReturnType<typeof loadSettings>
  updateCoupleSettings: (patch: Parameters<typeof updateCoupleSettings>[1]) => ReturnType<typeof updateCoupleSettings>
  updateProfileSettings: (patch: Parameters<typeof updateProfileSettings>[1]) => ReturnType<typeof updateProfileSettings>
  updateCouple: (coupleId: string, patch: Parameters<typeof updateCouple>[2]) => ReturnType<typeof updateCouple>
  updateProfile: (patch: Parameters<typeof updateProfile>[1]) => ReturnType<typeof updateProfile>
  searchCities: (query: string) => ReturnType<typeof searchCities>
  /** As cidades de estadias e eventos, com país e região — para o export (R24). */
  loadCalCities: (ids: readonly string[]) => ReturnType<typeof loadCalCities>
  saveCity: (coupleId: string, cityId: string) => ReturnType<typeof saveCity>
  removeSavedCity: (cityId: string) => ReturnType<typeof removeSavedCity>
  prepareAvatar: typeof prepareAvatar
  uploadAvatar: (image: { blob: Blob; extension: 'webp' | 'jpg' }) => ReturnType<typeof uploadAvatar>
  avatarUrl: (path: string | null) => Promise<string | null>
  prepareCover: typeof prepareCover
  replaceCover: (
    couple: { id: string; coverPath: string | null },
    image: { blob: Blob; extension: 'webp' | 'jpg' },
  ) => ReturnType<typeof replaceCover>
  coverUrl: (path: string | null) => Promise<string | null>
  changePassword: (password: string) => ReturnType<typeof changePassword>
  signOut: () => Promise<void>
  listSessions: () => ReturnType<typeof listMySessions>
  endSession: (sessionId: string) => ReturnType<typeof endMySession>
  loadPhotoStats: (couple: SettingsCouple) => ReturnType<typeof loadPhotoStats>
  /** R26: total e contagem por categoria da Lista. */
  loadListCounts: () => ReturnType<typeof loadListCounts>
  /** R27: itens, memórias e contagem de fotos, para o export. */
  loadListExport: () => ReturnType<typeof loadListExport>
  /** Fase 5, R24: eventos e 💋 inteiros (agregado por dia), só para o export. */
  loadCalendarExport: () => ReturnType<typeof loadCalendarExport>
  /** Fase 6: as viagens inteiras — o resumo conta as feitas (R28) e o export as leva. */
  loadTrips: () => ReturnType<typeof loadTrips>
  loadOpenInvite: () => ReturnType<typeof loadOpenInvite>
  createInvite: (input: Parameters<typeof createInvite>[1]) => ReturnType<typeof createInvite>
  sendInvite: (inviteId: string) => ReturnType<typeof sendInvite>
  cancelInvite: () => ReturnType<typeof cancelInvite>
  /** Cria ou edita o perfil provisório de quem vai entrar (ADR 0024). */
  savePendingPartner: (input: Parameters<typeof savePendingPartner>[1]) => ReturnType<typeof savePendingPartner>
  leaveCouple: () => ReturnType<typeof leaveCouple>
  deleteCouple: (coupleId: string) => ReturnType<typeof deleteCouple>
  /** Entrega o arquivo ao navegador. Injetável: o jsdom não baixa nada. */
  download: (filename: string, json: string) => void
}

function downloadInBrowser(filename: string, json: string) {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // Revogar na hora pode cancelar o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function settingsApi(db: Db): SettingsApi {
  return {
    today: todayISO,
    now: () => Date.now(),
    loadSettings: () => loadSettings(db),
    updateCoupleSettings: (patch) => updateCoupleSettings(db, patch),
    updateProfileSettings: (patch) => updateProfileSettings(db, patch),
    updateCouple: (coupleId, patch) => updateCouple(db, coupleId, patch),
    updateProfile: (patch) => updateProfile(db, patch),
    searchCities: (query) => searchCities(db, query),
    loadCalCities: (ids) => loadCalCities(db, ids),
    saveCity: (coupleId, cityId) => saveCity(db, coupleId, cityId),
    removeSavedCity: (cityId) => removeSavedCity(db, cityId),
    prepareAvatar,
    uploadAvatar: (image) => uploadAvatar(db, image),
    avatarUrl: (path) => avatarUrl(db, path),
    prepareCover,
    replaceCover: (couple, image) => replaceCover(db, couple, image),
    coverUrl: (path) => coverUrl(db, path),
    changePassword: (password) => changePassword(db, password),
    signOut: () => signOut(db),
    listSessions: () => listMySessions(db),
    endSession: (sessionId) => endMySession(db, sessionId),
    loadPhotoStats: (couple) => loadPhotoStats(db, couple),
    loadListCounts: () => loadListCounts(db),
    loadListExport: () => loadListExport(db),
    loadCalendarExport: () => loadCalendarExport(db),
    loadTrips: () => loadTrips(db),
    loadOpenInvite: () => loadOpenInvite(db),
    createInvite: (input) => createInvite(db, input),
    sendInvite: (inviteId) => sendInvite(db, inviteId),
    cancelInvite: () => cancelInvite(db),
    savePendingPartner: (input) => savePendingPartner(db, input),
    leaveCouple: () => leaveCouple(db),
    deleteCouple: (coupleId) => deleteCouple(db, coupleId),
    download: downloadInBrowser,
  }
}
