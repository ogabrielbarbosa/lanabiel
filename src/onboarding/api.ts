// O que as telas de onboarding pedem ao mundo, num objeto só.
//
// As telas recebem isto por parâmetro — como o `AuthGate` recebe `loadStage` —
// para o teste de interface dirigir cada resposta (enviado, falhou, expirado…)
// sem rede. O que o banco REALMENTE responde está provado em
// `supabase/tests/data-onboarding.test.ts`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { todayISO } from '../lib/date'
import { avatarUrl, prepareAvatar, uploadAvatar } from '../data/avatar'
import { searchCities } from '../data/cities'
import { createCouple, loadCouple, updateCouple } from '../data/couple'
import {
  acceptInvite,
  createInvite,
  loadOpenInvite,
  lookupInvite,
  renewInvite,
  sendInvite,
} from '../data/invites'
import { createProfile } from '../data/profile'

type Db = SupabaseClient<Database>

export interface OnboardingApi {
  today: () => string
  searchCities: (query: string) => ReturnType<typeof searchCities>
  prepareAvatar: typeof prepareAvatar
  uploadAvatar: (image: { blob: Blob; extension: 'webp' | 'jpg' }) => ReturnType<typeof uploadAvatar>
  avatarUrl: (path: string | null) => Promise<string | null>
  createProfile: (input: Parameters<typeof createProfile>[1]) => ReturnType<typeof createProfile>
  createCouple: (input: Parameters<typeof createCouple>[1]) => ReturnType<typeof createCouple>
  updateCouple: (input: Parameters<typeof updateCouple>[1]) => ReturnType<typeof updateCouple>
  loadCouple: () => ReturnType<typeof loadCouple>
  createInvite: (input: Parameters<typeof createInvite>[1]) => ReturnType<typeof createInvite>
  renewInvite: () => ReturnType<typeof renewInvite>
  sendInvite: (inviteId: string) => ReturnType<typeof sendInvite>
  loadOpenInvite: () => ReturnType<typeof loadOpenInvite>
  lookupInvite: (code: string) => ReturnType<typeof lookupInvite>
  acceptInvite: (code: string) => ReturnType<typeof acceptInvite>
}

export function onboardingApi(db: Db): OnboardingApi {
  return {
    today: todayISO,
    searchCities: (query) => searchCities(db, query),
    prepareAvatar,
    uploadAvatar: (image) => uploadAvatar(db, image),
    avatarUrl: (path) => avatarUrl(db, path),
    createProfile: (input) => createProfile(db, input),
    createCouple: (input) => createCouple(db, input),
    updateCouple: (input) => updateCouple(db, input),
    loadCouple: () => loadCouple(db),
    createInvite: (input) => createInvite(db, input),
    renewInvite: () => renewInvite(db),
    sendInvite: (inviteId) => sendInvite(db, inviteId),
    loadOpenInvite: () => loadOpenInvite(db),
    lookupInvite: (code) => lookupInvite(db, code),
    acceptInvite: (code) => acceptInvite(db, code),
  }
}
