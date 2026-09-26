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

// Os testes rodam contra o projeto ONLINE — o único banco que existe (ADR
// 0010) — enquanto o app não estiver aberto a outros casais (ADR 0014). As
// chaves vêm de `.env.local` (URL e chave publicável, as mesmas do app) e de
// `.env.test.local` (a `service_role`, que NUNCA entra no `.env.local`: o Vite
// não a exporia, mas um arquivo a menos com ela é um vazamento a menos).
for (const file of ['.env.local', '.env.test.local']) {
  try {
    process.loadEnvFile(file)
  } catch {
    // Ausente é permitido aqui; a checagem abaixo diz o que faltou.
  }
}

export const URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''

// Trava de segurança: estes testes criam e APAGAM usuários com a chave de
// administrador. Só usuários deles (`…@test.local`, limpos por id), mas ainda
// assim contra produção — então é opt-in explícito, e só para o host do
// projeto `lanabiel`. Qualquer outro host aborta antes do primeiro request.
const PROD_HOST = 'https://smdtcznadmnrdubeidyz.supabase.co'
if (URL !== PROD_HOST) {
  throw new Error(`supabase/tests só roda contra ${PROD_HOST}, e a URL é "${URL}"`)
}
if (process.env.LANABIEL_DB_TESTS_ON_PROD !== '1') {
  throw new Error(
    'supabase/tests roda contra PRODUÇÃO (ADR 0014): exporte LANABIEL_DB_TESTS_ON_PROD=1 ' +
      '(o `npm run test:db` já faz). Só enquanto o app não estiver aberto a outros casais.',
  )
}
export const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!ANON_KEY || !SERVICE_KEY) {
  throw new Error(
    'faltam chaves: VITE_SUPABASE_PUBLISHABLE_KEY em .env.local e ' +
      'SUPABASE_SERVICE_ROLE_KEY em .env.test.local (painel → Project Settings → API)',
  )
}

export type Db = SupabaseClient<Database>

/** Cliente com service_role: ignora RLS. Só para montar e limpar o cenário. */
export const admin: Db = createClient<Database>(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * O Auth do projeto online aceita 30 logins a cada 5 min por IP
 * (`sign_in_sign_ups`), e a suíte faz mais de 100. Decisão do Gabriel
 * (2026-09-26): não afrouxar o limite de produção — os arquivos rodam em série
 * (vitest.config.ts) e o login espera a janela e tenta de novo.
 */
const RATE_LIMIT_WAIT_MS = 30_000
const RATE_LIMIT_TRIES = 12

function isRateLimited(error: { code?: string; message: string } | null): boolean {
  return error?.code === 'over_request_rate_limit' || /rate limit/i.test(error?.message ?? '')
}

/** Cliente anônimo, novo e sem sessão. É o que o navegador teria. */
export function anonClient(): Db {
  const client = createClient<Database>(URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = client.auth.signInWithPassword.bind(client.auth)
  client.auth.signInWithPassword = async (credentials) => {
    for (let attempt = 1; ; attempt++) {
      const result = await signIn(credentials)
      if (!isRateLimited(result.error) || attempt >= RATE_LIMIT_TRIES) return result
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_WAIT_MS))
    }
  }
  return client
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
 * SQL direto no Postgres, para o que a API não expõe (o catálogo, em A20). Vai
 * pela Management API (`supabase db query --linked`), com a sessão da CLI —
 * sem senha de banco no repositório. Devolve no formato do `psql -tA`: uma
 * linha por registro, colunas separadas por `|`, booleanos como `t`/`f`.
 *
 * As colunas PRECISAM ter nomes distintos (use `as`): a resposta vem como
 * objeto JSON por linha, e dois `count(*)` viram uma chave só — em silêncio.
 */
export function sql(query: string): string {
  // A Management API devolve cada linha como objeto JSON com as chaves em
  // ordem ALFABÉTICA. Para manter a ordem das colunas, o próprio Postgres
  // serializa cada linha (`row_to_json` preserva a ordem) numa coluna de texto.
  const wrapped = `select coalesce(json_agg(row_to_json(q))::text, '[]') as rows from (${query}) q`
  const out = execFileSync('npx', ['supabase', 'db', 'query', '--linked', '-o', 'json', wrapped], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  })
  const { rows } = JSON.parse(out) as { rows: { rows: string }[] }
  const records = JSON.parse(rows[0]!.rows) as Record<string, unknown>[]
  const cell = (v: unknown) => (v === true ? 't' : v === false ? 'f' : v === null ? '' : String(v))
  return records.map((r) => Object.values(r).map(cell).join('|')).join('\n')
}

async function recreateUser(
  email: string,
  homeCityId: string,
  name: string,
  color: string = '#7FD8C4',
): Promise<TestUser> {
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
    .insert({ id: data.user.id, display_name: name, full_name: `${name} de Teste`, color, home_city_id: homeCityId })
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
  const lana = await recreateUser(`${prefix}-lana@test.local`, CITY.marau, 'Lana', '#F4A3B4')
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

export interface SignedUser {
  id: string
  email: string
  db: Db
}

/**
 * Fábrica de usuários descartáveis de um arquivo de teste (Fase 3). Cada
 * arquivo tem o seu `prefix` — o vitest roda arquivos em paralelo, e
 * `auth.users` é global. `sweep()` apaga restos de rodadas anteriores do
 * prefixo; `cleanup()`, o que esta rodada criou. Só `…@test.local`, por id.
 */
export function userFactory(prefix: string) {
  const created: string[] = []

  async function newUser(tag: string, homeCityId: string | null = CITY.sjc): Promise<SignedUser> {
    const email = `${prefix}-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@test.local`
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
    if (error || !data.user) throw new Error(`criar ${email}: ${error?.message}`)
    created.push(data.user.id)

    const db = anonClient()
    const { error: signInError } = await db.auth.signInWithPassword({ email, password: PASSWORD })
    if (signInError) throw new Error(`login ${email}: ${signInError.message}`)

    if (homeCityId) {
      const { error: profileError } = await db
        .from('profiles')
        .insert({ id: data.user.id, full_name: `${tag} Silva`, display_name: tag, home_city_id: homeCityId })
      if (profileError) throw new Error(`perfil ${email}: ${profileError.message}`)
    }
    return { id: data.user.id, email, db }
  }

  async function sweep() {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    for (const user of data.users) {
      if (user.email?.startsWith(`${prefix}-`) && user.email.endsWith('@test.local')) {
        await deleteUserAndCouple(user.id)
      }
    }
  }

  async function cleanup() {
    for (const id of created) await deleteUserAndCouple(id)
  }

  return { newUser, sweep, cleanup }
}

/** RPC com nome variável; o tipo gerado exige literal. Lança no erro. */
export async function rpc(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const { data, error } = await (db.rpc as (f: string, a: object) => ReturnType<Db['rpc']>)(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as Record<string, unknown>
}

/** Casal completo de dois, pelo caminho real: create_couple → create_invite → accept_invite. */
export async function coupleOfTwo(
  factory: ReturnType<typeof userFactory>,
  tag: string,
): Promise<{ a: SignedUser; b: SignedUser; coupleId: string }> {
  const a = await factory.newUser(`${tag}-a`)
  const b = await factory.newUser(`${tag}-b`, CITY.marau)
  const couple = await rpc(a.db, 'create_couple', { p_started_on: '2024-09-17', p_name: `Casal ${tag}` })
  const invite = await rpc(a.db, 'create_invite', { p_email: `${tag}-b@exemplo.com` })
  const joined = await rpc(b.db, 'accept_invite', { p_code: invite.code })
  if (joined.status !== 'joined') throw new Error(`accept_invite: ${JSON.stringify(joined)}`)
  return { a, b, coupleId: couple.couple_id as string }
}
