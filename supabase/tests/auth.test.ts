// Critérios A1 a A8 e A13 da spec — .agent/Tasks/fase-1-login.md, seção 10.
//
// Contra a stack local, não contra mock: um mock do cliente Supabase aqui
// provaria que o mock funciona. É a mesma razão pela qual RLS virou teste de
// integração na Fase 0.

import { beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { loadAccountStage } from '../../src/data/account'
import { signInWithPassword, signUpWithPassword } from '../../src/auth/signIn'
import { admin, anonClient, ANON_KEY, buildScenario, CITY, signIn, URL as API_URL } from './harness'
import type { Database } from '../../src/lib/database.types'
import type { Db, Scenario } from './harness'

const PREFIX = 'auth'
const GOOD_PASSWORD = 'quatorze-de-fevereiro-em-marau'
const SHORT_PASSWORD = 'onze-chars1' // 11 < 12

let scene: Scenario

/** E-mail novo a cada chamada: `auth.users` é global e os testes repetem. */
function freshEmail(tag: string): string {
  return `${PREFIX}-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`
}

async function deleteByEmail(email: string): Promise<void> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  for (const user of data.users) {
    if (user.email === email) await admin.auth.admin.deleteUser(user.id)
  }
}

/**
 * Existe conta com este e-mail? Afirma sobre o e-mail tentado, e não sobre o
 * total de `auth.users`: os arquivos de teste rodam em paralelo e criam
 * usuários ao mesmo tempo, então o total oscila sem nada estar errado.
 */
async function userExists(email: string): Promise<boolean> {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  return data.users.some((u) => u.email === email)
}

beforeAll(async () => {
  scene = await buildScenario(PREFIX)
}, 60_000)

describe('A1 — cadastro com senha devolve sessão na hora', () => {
  it('sem passo de confirmação por e-mail', async () => {
    const email = freshEmail('signup')
    const db = anonClient()

    const result = await signUpWithPassword(db, { email, password: GOOD_PASSWORD })
    expect(result).toEqual({ status: 'signed_in' })

    const { data } = await db.auth.getSession()
    expect(data.session).not.toBeNull()
    expect(data.session?.user.email).toBe(email)

    await deleteByEmail(email)
  })

  // A vinculação de identidades (A7) depende disto: o GoTrue só casa uma
  // identidade OAuth com uma conta existente quando o e-mail está confirmado.
  // Com `enable_confirmations` desligado ele confirma no cadastro — o que é
  // precondição provável aqui; a vinculação em si exige credencial real do
  // Google e fica manual. Ver seção 11 da spec.
  it('marca o e-mail como confirmado, que é a precondição da vinculação (A7)', async () => {
    const email = freshEmail('confirmed')
    await signUpWithPassword(anonClient(), { email, password: GOOD_PASSWORD })

    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const created = data.users.find((u) => u.email === email)
    expect(created?.email_confirmed_at).toBeTruthy()

    await deleteByEmail(email)
  })
})

describe('A2 — senha curta é recusada ANTES de a conta existir', () => {
  it('devolve `too_short` e não cria usuário nenhum', async () => {
    const email = freshEmail('short')
    const result = await signUpWithPassword(anonClient(), { email, password: SHORT_PASSWORD })
    expect(result).toEqual({ status: 'weak_password', reason: 'too_short' })

    // A parte que um teste ingênuo esquece: ver o resultado e não ver o efeito.
    // Uma implementação que criasse o usuário e só então recusasse passaria no
    // teste ingênuo e deixaria conta órfã.
    expect(await userExists(email)).toBe(false)
  })
})

describe('A3 — credencial inválida é uma causa só (I10)', () => {
  it('e-mail inexistente e senha errada devolvem o mesmo resultado', async () => {
    const naoExiste = await signInWithPassword(anonClient(), {
      email: freshEmail('fantasma'),
      password: GOOD_PASSWORD,
    })
    const senhaErrada = await signInWithPassword(anonClient(), {
      email: scene.gabriel.email,
      password: 'essa-nao-e-a-senha-dele',
    })

    // Distinguir os dois entregaria quais e-mails têm conta aqui.
    expect(naoExiste).toEqual({ status: 'invalid_credentials' })
    expect(senhaErrada).toEqual({ status: 'invalid_credentials' })
  })
})

describe('A4/A5 — os três estágios da conta', () => {
  it('autenticado sem perfil → `needs_profile`, nunca erro nem unauthenticated', async () => {
    const email = freshEmail('sem-perfil')
    const db = anonClient()
    await signUpWithPassword(db, { email, password: GOOD_PASSWORD })

    expect(await loadAccountStage(db)).toEqual({
      status: 'ok',
      rows: { stage: 'needs_profile' },
    })

    await deleteByEmail(email)
  })

  it('com perfil e sem casal → `needs_couple`', async () => {
    const email = freshEmail('sem-casal')
    const db = anonClient()
    await signUpWithPassword(db, { email, password: GOOD_PASSWORD })
    const { data } = await db.auth.getSession()
    const userId = data.session!.user.id

    await admin
      .from('profiles')
      .insert({ id: userId, display_name: 'Sozinho', full_name: 'Sozinho de Teste', color: '#000000', home_city_id: CITY.sjc })

    expect(await loadAccountStage(db)).toEqual({
      status: 'ok',
      rows: { stage: 'needs_couple', profileId: userId },
    })

    await deleteByEmail(email)
  })

  it('membro do casal → `ready`, com coupleId e slot', async () => {
    const db = await signIn(scene.gabriel.email)

    expect(await loadAccountStage(db)).toEqual({
      status: 'ok',
      rows: {
        stage: 'ready',
        profileId: scene.gabriel.id,
        coupleId: scene.coupleA,
        slot: 1,
      },
    })
  })

  it('a Lana é slot 2 — a faixa do calendário sai daqui', async () => {
    const db = await signIn(scene.lana.email)
    const result = await loadAccountStage(db)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rows).toMatchObject({ stage: 'ready', slot: 2 })
  })
})

describe('A6 — sem sessão é `unauthenticated`, não `needs_profile`', () => {
  it('nunca devolve `ok` para quem não se identificou', async () => {
    const result = await loadAccountStage(anonClient())

    // A falha silenciosa nº 1 do SOP, na forma desta fase: se isto devolvesse
    // `ok` com `needs_profile`, todo visitante veria a tela de onboarding.
    expect(result).toEqual({ status: 'unauthenticated' })
  })
})

describe('A8 — falha de rede é distinguível de vazio', () => {
  it('sessão válida contra um host morto devolve `error`', async () => {
    const live = await signIn(scene.gabriel.email)
    const { data } = await live.auth.getSession()
    const session = data.session!

    // Porta fechada, mas COM sessão: é o projeto pausado por inatividade, que
    // o ADR 0001 registra como custo real do free tier.
    //
    // A sessão é injetada pelo ARMAZENAMENTO, não por `setSession`: contra um
    // host morto o `setSession` não consegue validar e não guarda nada, e o
    // teste acabaria provando `unauthenticated` — que é outro caso. Aqui o
    // token está no armazenamento e dentro da validade, então `getSession()`
    // resolve local e a falha aparece onde tem de aparecer: na primeira query.
    const stored = JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      user: session.user,
    })
    const dead = createClient<Database>('http://127.0.0.1:9', ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        storageKey: 'dead-host-session',
        storage: {
          getItem: (key: string) => (key === 'dead-host-session' ? stored : null),
          setItem: () => {},
          removeItem: () => {},
        },
      },
    })

    const result = await loadAccountStage(dead)
    expect(result.status).toBe('error')
    expect(result).not.toMatchObject({ status: 'ok' })
  }, 30_000)
})

describe('A13 — o retorno do OAuth aponta para a origem do app', () => {
  it('`redirect_to` é a origem passada, e não 127.0.0.1:3000', async () => {
    const origin = 'http://127.0.0.1:5173'
    const db: Db = anonClient()

    const { data, error } = await db.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: origin, skipBrowserRedirect: true },
    })
    expect(error).toBeNull()

    const url = new globalThis.URL(data.url!)
    expect(url.origin).toBe(API_URL)
    expect(url.searchParams.get('redirect_to')).toBe(origin)
    expect(data.url).not.toContain('3000')
  })

  it('o config.toml declara a origem do Vite, que é para onde o GoTrue deixa voltar', async () => {
    const { readFile } = await import('node:fs/promises')
    const config = await readFile('supabase/config.toml', 'utf8')

    // Sem isto o GoTrue rejeita o retorno, e a pessoa fica numa página morta.
    expect(config).toMatch(/^site_url = "http:\/\/127\.0\.0\.1:5173"$/m)
    expect(config).not.toMatch(/^site_url = ".*:3000"$/m)
  })
})
