import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
// Node 20 não tem `WebSocket` global, e o cliente de realtime do supabase-js
// exige um. O navegador tem nativo, então isto é só do harness —
// `src/lib/supabase.ts` não precisa.
//
// Preenchido no global em vez de passado como `realtime.transport`: passar a
// opção muda a inferência do genérico de schema do `createClient`, e o cliente
// deixa de ser atribuível a `SupabaseClient<Database>`.
import ws from 'ws'

globalThis.WebSocket ??= ws as unknown as typeof globalThis.WebSocket
import type { Database } from '../../src/lib/database.types'

// Chaves de DESENVOLVIMENTO LOCAL. São as mesmas em toda instalação do Supabase
// CLI — estão na documentação e não protegem nada. Nunca use isto contra o
// projeto remoto; para lá, passe por variável de ambiente.
const LOCAL_ANON =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const LOCAL_SERVICE =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:55321'
export const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? LOCAL_ANON
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? LOCAL_SERVICE

export type Db = SupabaseClient<Database>

/** Cliente com service_role: ignora RLS. Só para montar e limpar o cenário. */
export const admin: Db = createClient<Database>(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/** Cliente anônimo, novo e sem sessão. É o que o navegador teria. */
export function anonClient(): Db {
  return createClient<Database>(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

// Cidades do seed (UUID fixo na migration 20260925120300).
export const CITY = {
  sjc: 'c17e0b1a-0001-4000-8000-000000000001',
  marau: 'c17e0b1a-0002-4000-8000-000000000002',
  londrina: 'c17e0b1a-0003-4000-8000-000000000003',
} as const

export const PASSWORD = 'senha-de-teste-123'

export interface TestUser {
  id: string
  email: string
}

export interface Scenario {
  coupleA: string
  coupleB: string
  gabriel: TestUser
  lana: TestUser
  outsider: TestUser
}

/**
 * Apaga o usuário e, antes, o casal em que ele estava. `couple_members` cai em
 * cascata com o perfil, mas `couples` não — sem isto, cada rodada deixaria um
 * casal órfão no banco local.
 */
export async function deleteUserAndCouple(userId: string): Promise<void> {
  const { data: memberships } = await admin
    .from('couple_members')
    .select('couple_id')
    .eq('profile_id', userId)
  const coupleIds = (memberships ?? []).map((m) => m.couple_id)
  if (coupleIds.length > 0) await admin.from('couples').delete().in('id', coupleIds)
  await admin.auth.admin.deleteUser(userId)
}

/**
 * SQL direto no Postgres local, para o que a API não expõe (o catálogo, em
 * A20). Só local: roda `psql` dentro do container da stack.
 */
export function sql(query: string): string {
  return execFileSync(
    'docker',
    ['exec', 'supabase_db_lanabiel', 'psql', '-U', 'postgres', '-tA', '-c', query],
    { encoding: 'utf8' },
  ).trim()
}

async function recreateUser(email: string, homeCityId: string, name: string): Promise<TestUser> {
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const user of existing.users) {
    if (user.email === email) await deleteUserAndCouple(user.id)
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`criar ${email}: ${error?.message}`)

  // O perfil é criado explicitamente, não por trigger. O schema anterior tinha
  // um `handle_new_user` que criava o profile no cadastro — impossível agora,
  // porque `home_city_id` é NOT NULL e um trigger não tem cidade para pôr. É o
  // onboarding (Fase 2) que sabe a cidade, então é ele que cria o perfil.
  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: data.user.id, display_name: name, full_name: `${name} de Teste`, color: '#000000', home_city_id: homeCityId })
  if (profileError) throw new Error(`perfil de ${email}: ${profileError.message}`)

  return { id: data.user.id, email }
}

/**
 * Dois casais e três pessoas: é o mínimo para provar isolamento nas DUAS
 * direções.
 *
 * O `prefix` existe porque o vitest roda arquivos de teste em PARALELO, e
 * `auth.users` é global: dois arquivos montando "gabriel@test.local" ao mesmo
 * tempo apagam o usuário um do outro no meio do caminho. Cada arquivo passa o
 * seu prefixo e fica com o seu próprio cenário.
 */
export async function buildScenario(prefix: string): Promise<Scenario> {
  const gabriel = await recreateUser(`${prefix}-gabriel@test.local`, CITY.sjc, 'Gabriel')
  const lana = await recreateUser(`${prefix}-lana@test.local`, CITY.marau, 'Lana')
  const outsider = await recreateUser(`${prefix}-outro@test.local`, CITY.londrina, 'Outro')

  // Casais antigos deste prefixo já saíram junto com os usuários
  // (`deleteUserAndCouple`) — `couples.invite_code`, que servia de chave de
  // limpeza, não existe mais desde a Fase 2.
  const { data: couples, error } = await admin
    .from('couples')
    .insert([
      { name: 'Gabi & Lana', started_on: '2024-09-17' },
      { name: 'Outro casal', started_on: '2025-01-01' },
    ])
    .select('id, name')
  if (error || !couples) throw new Error(`casais: ${error?.message}`)

  const coupleA = couples.find((c) => c.name === 'Gabi & Lana')!.id
  const coupleB = couples.find((c) => c.name === 'Outro casal')!.id

  await admin.from('couple_members').insert([
    { couple_id: coupleA, profile_id: gabriel.id, slot: 1 },
    { couple_id: coupleA, profile_id: lana.id, slot: 2 },
    { couple_id: coupleB, profile_id: outsider.id, slot: 1 },
  ])

  return { coupleA, coupleB, gabriel, lana, outsider }
}

export async function signIn(email: string): Promise<Db> {
  const db = anonClient()
  const { error } = await db.auth.signInWithPassword({ email, password: PASSWORD })
  if (error) throw new Error(`login de ${email}: ${error.message}`)
  return db
}
