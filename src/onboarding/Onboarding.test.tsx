// Critérios A21–A28 da spec — .agent/Tasks/fase-2-onboarding.md, seção 10.
// ADR 0005: comportamento de tela se prova renderizando.
//
// O portão inteiro é montado, com `db` falso (só a sessão) e a API do
// onboarding injetada. O que o banco REALMENTE responde está em
// supabase/tests/data-onboarding.test.ts; aqui se prova qual tela aparece, o
// que ela diz, e em que ordem ela chama o mundo.

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthGate } from '../auth/AuthGate'
import type { AccountStage } from '../data/account'
import type { City } from '../data/cities'
import type { CoupleView } from '../data/couple'
import type { InvitePreview, OpenInvite } from '../data/invites'
import type { DataResult } from '../data/result'
import type { Database } from '../lib/database.types'
import type { OnboardingApi } from './api'
import { STORAGE_KEY } from './pendingInvite'

type Db = SupabaseClient<Database>
type Session = { user: { id: string; email: string | null } } | null

const SESSION = { user: { id: 'u-rafa', email: 'rafa@test.local' } }
const PELOTAS: City = { id: 'city-pel', name: 'Pelotas', stateCode: 'RS', lat: -31.77, lng: -52.34 }
const JF: City = { id: 'city-jf', name: 'Juiz de Fora', stateCode: 'MG', lat: -21.76, lng: -43.35 }
const IN_A_WEEK = new Date(Date.now() + 7 * 86_400_000).toISOString()

const PREVIEW: InvitePreview = {
  code: '7K4Q92',
  coupleName: 'Rafa & Duda',
  startedOn: '2023-03-03',
  inviterName: 'Rafa',
  inviterFullName: 'Rafael Souza',
  inviterCity: 'Pelotas',
  expiresAt: IN_A_WEEK,
}

const OPEN: OpenInvite = {
  id: 'inv-1',
  code: '7K4Q92',
  email: 'duda@exemplo.com',
  inviteeName: 'Duda',
  expiresAt: IN_A_WEEK,
  lastSentAt: null,
}

const COUPLE: CoupleView = {
  id: 'c-1',
  name: 'Rafa & Duda',
  startedOn: '2023-03-03',
  members: [
    { profileId: 'u-rafa', slot: 1, displayName: 'Rafa', fullName: 'Rafael Souza', avatarPath: null, color: '#3b82f6', city: PELOTAS },
    { profileId: 'u-duda', slot: 2, displayName: 'Duda', fullName: 'Maria Eduarda', avatarPath: null, color: '#ec4899', city: JF },
  ],
}

/** API falsa: cada função registra a chamada; o teste troca o que precisar. */
function fakeApi(overrides: Partial<OnboardingApi> = {}) {
  const calls: string[] = []
  const track =
    <A extends unknown[], R>(name: string, fn: (...args: A) => R) =>
    (...args: A) => {
      calls.push(name)
      return fn(...args)
    }

  const api: OnboardingApi = {
    today: () => '2026-09-26',
    searchCities: track('searchCities', async (q: string) => ({
      status: 'ok' as const,
      rows: [PELOTAS, JF].filter((c) => c.name.toLowerCase().startsWith(q.toLowerCase())),
    })),
    prepareAvatar: async () => ({ status: 'not_image' as const }),
    uploadAvatar: track('uploadAvatar', async () => ({ status: 'ok' as const, path: 'u-rafa/x.webp' })),
    avatarUrl: async () => null,
    createProfile: track('createProfile', async () => ({ status: 'created' as const, profileId: 'u-rafa' })),
    createCouple: track('createCouple', async () => ({ status: 'created' as const, coupleId: 'c-1' })),
    updateCouple: track('updateCouple', async () => ({ status: 'ok' as const })),
    loadCouple: async () => ({ status: 'ok' as const, rows: COUPLE }),
    createInvite: track('createInvite', async () => ({
      status: 'created' as const,
      inviteId: 'inv-1',
      code: '7K4Q92',
      expiresAt: IN_A_WEEK,
    })),
    renewInvite: track('renewInvite', async () => ({
      status: 'renewed' as const,
      inviteId: 'inv-1',
      code: '7K4Q92',
      expiresAt: IN_A_WEEK,
    })),
    sendInvite: track('sendInvite', async () => ({ status: 'sent' as const })),
    loadOpenInvite: async () => ({ status: 'ok' as const, rows: null }),
    lookupInvite: track('lookupInvite', async () => ({ status: 'valid' as const, invite: PREVIEW })),
    acceptInvite: track('acceptInvite', async () => ({ status: 'joined' as const, coupleId: 'c-1' })),
    ...overrides,
  }
  return { api, calls }
}

function fakeDb() {
  let listener: (event: string, session: Session) => void = () => {}
  const db = {
    auth: {
      onAuthStateChange(cb: typeof listener) {
        listener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: vi.fn(async () => {}),
    },
  } as unknown as Db
  return { db, emit: (session: Session) => act(() => listener('SIGNED_IN', session)) }
}

/** Estágio mutável: o teste o avança como o banco avançaria. */
function stages(initial: AccountStage) {
  let current = initial
  return {
    set: (next: AccountStage) => {
      current = next
    },
    load: vi.fn(async (): Promise<DataResult<AccountStage>> => ({ status: 'ok', rows: current })),
  }
}

function mount(stage: ReturnType<typeof stages>, api: OnboardingApi) {
  const { db, emit } = fakeDb()
  render(
    <AuthGate db={db} loadStage={stage.load} providers={[]} api={api}>
      <div data-testid="domain">tela de domínio</div>
    </AuthGate>,
  )
  return { emit, db }
}

beforeEach(() => {
  window.sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('A21 — a Escolha leva aos dois caminhos', () => {
  it('"Tenho um código" abre a digitação; "Criar" abre o perfil', async () => {
    const { api } = fakeApi()
    const { emit } = mount(stages({ stage: 'needs_profile' }), api)
    emit(SESSION)

    await userEvent.click(await screen.findByRole('button', { name: /Tenho um código/ }))
    expect(screen.getByRole('heading', { name: 'Digite o código de convite' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    await userEvent.click(screen.getByRole('button', { name: /Criar nosso espaço/ }))
    expect(screen.getByRole('heading', { name: 'Primeiro, você' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Passo 1 de 4' })).toBeInTheDocument()
  })
})

describe('A22 — criar o espaço: perfil → casal → convite → envio, nessa ordem', () => {
  it('chega ao código formatado, com "Convite enviado!"', async () => {
    const { api, calls } = fakeApi()
    const stage = stages({ stage: 'needs_profile' })
    const { emit } = mount(stage, api)
    emit(SESSION)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Criar nosso espaço/ }))
    await user.type(screen.getByLabelText('Nome'), 'Rafael Souza')
    await user.type(screen.getByLabelText('Como te chamam'), 'Rafa')
    await user.type(screen.getByRole('combobox', { name: 'Cidade onde você mora' }), 'pelo')
    await user.click(await screen.findByRole('option', { name: 'Pelotas, RS' }))
    stage.set({ stage: 'needs_couple', profileId: 'u-rafa' })
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: 'Sobre a gente' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Passo 2 de 4' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Começo do namoro'), '2023-03-03')
    expect(screen.getByText(/juntos há 3 anos e 207 dias/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nome do casal (opcional)'), 'Rafa & Duda')
    stage.set({ stage: 'awaiting_partner', profileId: 'u-rafa', coupleId: 'c-1', slot: 1 })
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: 'Convide seu amor' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Nome de quem você vai convidar (opcional)'), 'Duda')
    await user.type(screen.getByLabelText('E-mail'), 'duda@exemplo.com')

    // Depois do envio, o convite aberto já tem last_sent_at.
    api.loadOpenInvite = async () => ({ status: 'ok', rows: { ...OPEN, lastSentAt: new Date().toISOString() } })
    await user.click(screen.getByRole('button', { name: /Enviar convite/ }))

    expect(await screen.findByRole('heading', { name: 'Convite enviado!' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Código 7K4-Q92' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Passo 4 de 4' })).toBeInTheDocument()

    expect(calls.filter((c) => c !== 'searchCities')).toEqual([
      'createProfile',
      'createCouple',
      'createInvite',
      'sendInvite',
    ])
  })

  it('quem já tem perfil vê "Passo 1 de 3" e pula o perfil', async () => {
    const { api } = fakeApi()
    const { emit } = mount(stages({ stage: 'needs_couple', profileId: 'u-rafa' }), api)
    emit(SESSION)

    await userEvent.click(await screen.findByRole('button', { name: /Criar nosso espaço/ }))
    expect(screen.getByRole('heading', { name: 'Sobre a gente' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Passo 1 de 3' })).toBeInTheDocument()
  })

  it('data futura não passa: o botão fica desabilitado e a tela diz por quê', async () => {
    const { api, calls } = fakeApi()
    const { emit } = mount(stages({ stage: 'needs_couple', profileId: 'u-rafa' }), api)
    emit(SESSION)

    await userEvent.click(await screen.findByRole('button', { name: /Criar nosso espaço/ }))
    await userEvent.type(screen.getByLabelText('Começo do namoro'), '2026-12-25')
    expect(screen.getByText('A data não pode ser no futuro.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled()
    expect(calls).not.toContain('createCouple')
  })
})

describe('A23 — envio que falhou não diz "enviado" (R5)', () => {
  it('mostra o código, "Tentar de novo", e nenhuma forma de "enviado"', async () => {
    const { api } = fakeApi({
      sendInvite: async () => ({ status: 'send_failed', cause: 'Resend 500' }),
      loadOpenInvite: async () => ({ status: 'ok', rows: OPEN }), // last_sent_at nulo
    })
    const { emit } = mount(stages({ stage: 'awaiting_partner', profileId: 'u-rafa', coupleId: 'c-1', slot: 1 }), api)
    emit(SESSION)

    // Chega com convite aberto e nunca enviado.
    expect(await screen.findByRole('heading', { name: 'O e-mail não saiu' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('recusou')
    expect(screen.getByRole('img', { name: 'Código 7K4-Q92' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Tentar de novo/ })).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/enviado/i)
  })
})

describe('A24 — o link do e-mail guarda o código e limpa a URL (R6)', () => {
  it('sem sessão: código em sessionStorage, sem fragmento, Login de convite', async () => {
    window.history.replaceState(null, '', '/#convite=7k4-q92')
    const { api } = fakeApi()
    const { emit } = mount(stages({ stage: 'needs_profile' }), api)
    emit(null)

    expect(await screen.findByRole('heading', { name: 'Entre pra aceitar o convite' })).toBeInTheDocument()
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('7K4Q92')
    expect(window.location.hash).toBe('')
  })

  it('depois do login, o convite aparece direto — sem passar pela Escolha', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '7K4Q92')
    const { api, calls } = fakeApi()
    const { emit } = mount(stages({ stage: 'needs_profile' }), api)
    emit(SESSION)

    expect(await screen.findByRole('heading', { name: 'Rafa te convidou para o espaço Rafa & Duda' })).toBeInTheDocument()
    expect(screen.getByText(/Espaço criado por Rafael Souza · Pelotas/)).toBeInTheDocument()
    expect(calls).toContain('lookupInvite')
  })
})

describe('A24 — link colado numa aba já aberta (hashchange, sem recarga)', () => {
  it('troca a tela para o convite e limpa o fragmento', async () => {
    const { api } = fakeApi({ loadOpenInvite: async () => ({ status: 'ok', rows: OPEN }) })
    const { emit } = mount(stages({ stage: 'awaiting_partner', profileId: 'u-rafa', coupleId: 'c-1', slot: 1 }), api)
    emit(SESSION)
    await screen.findByText(/Aguardando Duda entrar/)

    act(() => {
      window.history.replaceState(null, '', '/#convite=7K4Q92')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    // Quem criou o espaço, com o próprio código: `own_couple` vem da API real;
    // aqui a falsa responde `valid`, e o que se prova é a troca de tela.
    expect(await screen.findByRole('heading', { name: /te convidou para/ })).toBeInTheDocument()
    expect(window.location.hash).toBe('')
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('7K4Q92')
  })
})

describe('revisão — estados que sobreviviam errado', () => {
  it('um `#` que não é convite não mexe no fluxo', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '7K4Q92')
    const { api, calls } = fakeApi()
    const { emit } = mount(stages({ stage: 'needs_couple', profileId: 'u-duda' }), api)
    emit(SESSION)
    await screen.findByText('Rafa te passou o código.')
    const lookups = calls.filter((c) => c === 'lookupInvite').length

    act(() => {
      window.history.replaceState(null, '', '/#qualquer-coisa')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(screen.getByText('Rafa te passou o código.')).toBeInTheDocument()
    expect(calls.filter((c) => c === 'lookupInvite').length).toBe(lookups)
  })

  it('o aviso da foto que não subiu chega ao Confirmar, e o progresso é 2 de 2', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '7K4Q92')
    const { api } = fakeApi({
      prepareAvatar: async () => ({ status: 'ok', blob: new Blob(['x'], { type: 'image/webp' }), extension: 'webp' }),
      uploadAvatar: async () => ({ status: 'error', cause: 'storage fora' }),
    })
    URL.createObjectURL = () => 'blob:foto'
    URL.revokeObjectURL = () => {}
    const stage = stages({ stage: 'needs_profile' })
    const { emit } = mount(stage, api)
    emit(SESSION)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Aceitar convite' }))
    await user.upload(screen.getByLabelText('Escolher foto'), new File(['x'], 'f.png', { type: 'image/png' }))
    await user.type(screen.getByLabelText('Nome'), 'Maria Eduarda')
    await user.type(screen.getByLabelText('Como te chamam'), 'Duda')
    await user.type(screen.getByRole('combobox', { name: 'Cidade onde você mora' }), 'juiz')
    await user.click(await screen.findByRole('option', { name: 'Juiz de Fora, MG' }))
    // O estágio já responde `ready` quando o portão reler — o pior caso da corrida.
    stage.set({ stage: 'ready', profileId: 'u-duda', coupleId: 'c-1', slot: 2 })
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: 'Confere com a gente' })).toBeInTheDocument()
    expect(screen.getByText(/A foto não subiu/)).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Passo 2 de 2' })).toBeInTheDocument()
  })

  it('Tudo pronto de um casal que começou hoje não inventa "anos"', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '7K4Q92')
    const today = { ...COUPLE, startedOn: '2026-09-26' }
    const { api } = fakeApi({ loadCouple: async () => ({ status: 'ok', rows: today }) })
    const { emit } = mount(stages({ stage: 'needs_couple', profileId: 'u-duda' }), api)
    emit(SESSION)

    await userEvent.click(await screen.findByRole('button', { name: 'Aceitar convite' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Tá tudo certo' }))
    await screen.findByRole('heading', { name: 'Tudo pronto, Rafa & Duda!' })
    expect(screen.getByText('26 set 2026')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/juntos desde hoje/)
  })
})

describe('A25 — cada recusa do código tem tela própria, sem gênero', () => {
  const cases = [
    [{ status: 'not_found' }, 'Esse código não existe'],
    [{ status: 'expired', inviterName: 'Rafa', createdAt: '2026-09-12T12:00:00Z', expiresAt: '2026-09-19T12:00:00Z' }, 'Esse convite expirou'],
    [{ status: 'used', coupleName: 'Rafa & Duda' }, 'Esse convite já foi usado'],
    [{ status: 'own_couple' }, 'Esse é o código do seu espaço'],
    [{ status: 'already_member', coupleName: 'Outro espaço' }, 'Você já está num espaço'],
    [{ status: 'rate_limited', retryAfterS: 1800 }, 'Muitas tentativas'],
  ] as const

  it.each(cases)('%o → "%s"', async (refusal, title) => {
    window.sessionStorage.setItem(STORAGE_KEY, '7K4Q92')
    const { api } = fakeApi({ lookupInvite: async () => refusal })
    const { emit } = mount(stages({ stage: 'needs_couple', profileId: 'u-duda' }), api)
    emit(SESSION)

    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument()
    // R13: nada de "ela", "ele", "dela", "dele" — nem o botão que o desenho
    // tinha e a fase não tem ("Pedir novo convite", "Falar com …").
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/\b(ela|ele|dela|dele)\b/i)
    expect(text).not.toMatch(/Pedir novo convite|Falar com/)
  })

  it('expirado diz quando e de quem pedir', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '7K4Q92')
    const { api } = fakeApi({
      lookupInvite: async () => ({
        status: 'expired',
        inviterName: 'Rafa',
        createdAt: '2026-09-12T15:00:00Z',
        expiresAt: '2026-09-19T15:00:00Z',
      }),
    })
    const { emit } = mount(stages({ stage: 'needs_couple', profileId: 'u-duda' }), api)
    emit(SESSION)

    expect(await screen.findByText(/criado por Rafa em 12 set e expirou em 19 set\. Peça um novo a Rafa\./)).toBeInTheDocument()
  })

  it('aceitar recusado depois do preview troca para a recusa (o preview não é autorização)', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '7K4Q92')
    const { api } = fakeApi({ acceptInvite: async () => ({ status: 'used', coupleName: 'Rafa & Duda' }) })
    const { emit } = mount(stages({ stage: 'needs_couple', profileId: 'u-duda' }), api)
    emit(SESSION)

    await userEvent.click(await screen.findByRole('button', { name: 'Aceitar convite' }))
    expect(await screen.findByRole('heading', { name: 'Esse convite já foi usado' })).toBeInTheDocument()
  })
})

describe('entrar por convite: perfil → aceite → Confirmar → Tudo pronto', () => {
  it('sem perfil, aceitar pede o perfil, e só então aceita', async () => {
    window.sessionStorage.setItem(STORAGE_KEY, '7K4Q92')
    const { api, calls } = fakeApi({
      loadCouple: async () => ({ status: 'ok', rows: COUPLE }),
    })
    const stage = stages({ stage: 'needs_profile' })
    const { emit } = mount(stage, api)
    emit(SESSION)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Aceitar convite' }))
    expect(screen.getByRole('heading', { name: 'Primeiro, você' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Passo 1 de 2' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Nome'), 'Maria Eduarda')
    await user.type(screen.getByLabelText('Como te chamam'), 'Duda')
    await user.type(screen.getByRole('combobox', { name: 'Cidade onde você mora' }), 'juiz')
    await user.click(await screen.findByRole('option', { name: 'Juiz de Fora, MG' }))
    stage.set({ stage: 'ready', profileId: 'u-duda', coupleId: 'c-1', slot: 2 })
    await user.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(await screen.findByRole('heading', { name: 'Confere com a gente' })).toBeInTheDocument()
    expect(screen.getByText('Rafa preencheu isso. Se algo estiver diferente, é só editar.')).toBeInTheDocument()
    expect(calls.filter((c) => ['createProfile', 'acceptInvite'].includes(c))).toEqual(['createProfile', 'acceptInvite'])
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull()

    // Sem mudança: não grava nada.
    await user.click(screen.getByRole('button', { name: 'Tá tudo certo' }))
    expect(calls).not.toContain('updateCouple')

    expect(await screen.findByRole('heading', { name: 'Tudo pronto, Rafa & Duda!' })).toBeInTheDocument()
    expect(screen.getByText(/Lá fora são 1\.\d{3} km — aqui dentro, nenhum\./)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByTestId('domain')).toBeInTheDocument()
  })
})

describe('A26 — Aguardando: sem convite, pendente, expirado', () => {
  const awaiting = () => stages({ stage: 'awaiting_partner', profileId: 'u-rafa', coupleId: 'c-1', slot: 1 })

  it('sem convite aberto → formulário de convidar', async () => {
    const { api } = fakeApi()
    const { emit } = mount(awaiting(), api)
    emit(SESSION)
    expect(await screen.findByRole('heading', { name: 'Convide seu amor' })).toBeInTheDocument()
  })

  it('pendente e enviado → Reenviar e Trocar e-mail', async () => {
    const { api, calls } = fakeApi({
      loadOpenInvite: async () => ({ status: 'ok', rows: { ...OPEN, lastSentAt: new Date().toISOString() } }),
    })
    const { emit } = mount(awaiting(), api)
    emit(SESSION)

    expect(await screen.findByText(/Aguardando Duda entrar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reenviar/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trocar e-mail' })).toBeInTheDocument()

    // Reenviar = mesmo código, mais 7 dias, e um envio novo.
    await userEvent.click(screen.getByRole('button', { name: /Reenviar/ }))
    await waitFor(() => expect(calls).toEqual(['renewInvite', 'sendInvite']))
  })

  it('expirado → Renovar', async () => {
    const { api } = fakeApi({
      loadOpenInvite: async () => ({
        status: 'ok',
        rows: { ...OPEN, expiresAt: new Date(Date.now() - 1000).toISOString(), lastSentAt: '2026-09-12T12:00:00Z' },
      }),
    })
    const { emit } = mount(awaiting(), api)
    emit(SESSION)

    expect(await screen.findByRole('heading', { name: 'O convite expirou' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Renovar convite/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Copiar código/ })).toBeNull()
  })

  it('"Continuar pro app" leva à tela de domínio', async () => {
    const { api } = fakeApi({ loadOpenInvite: async () => ({ status: 'ok', rows: OPEN }) })
    const { emit } = mount(awaiting(), api)
    emit(SESSION)

    await userEvent.click(await screen.findByRole('button', { name: 'Continuar pro app' }))
    expect(await screen.findByTestId('domain')).toBeInTheDocument()
  })
})

describe('A27 — Aguardando percebe a entrada do outro ao voltar o foco', () => {
  it('foco na janela relê o estágio; `ready` mostra o app', async () => {
    const { api } = fakeApi({ loadOpenInvite: async () => ({ status: 'ok', rows: OPEN }) })
    const stage = stages({ stage: 'awaiting_partner', profileId: 'u-rafa', coupleId: 'c-1', slot: 1 })
    const { emit } = mount(stage, api)
    emit(SESSION)
    await screen.findByText(/Aguardando Duda entrar/)
    const loadsBefore = stage.load.mock.calls.length

    stage.set({ stage: 'ready', profileId: 'u-rafa', coupleId: 'c-1', slot: 1 })
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })

    expect(await screen.findByTestId('domain')).toBeInTheDocument()
    expect(stage.load.mock.calls.length).toBeGreaterThan(loadsBefore)
  })
})

describe('A28 — colar a mensagem do WhatsApp no campo do código', () => {
  it('extrai o código de um texto qualquer e habilita Continuar', async () => {
    const { api } = fakeApi()
    const { emit } = mount(stages({ stage: 'needs_couple', profileId: 'u-duda' }), api)
    emit(SESSION)
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: /Tenho um código/ }))
    const input = screen.getByLabelText('Código de convite')
    await user.click(input)
    await user.paste('entra aí: 7K4-Q92 ❤️')

    expect(input).toHaveValue('7K4Q92')
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Continuar' }))
    const heading = await screen.findByRole('heading', { name: /te convidou para/ })
    expect(within(heading.closest('.auth-panel')!).getByText(/Código 7K4-Q92 válido/)).toBeInTheDocument()
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('7K4Q92')
  })
})
