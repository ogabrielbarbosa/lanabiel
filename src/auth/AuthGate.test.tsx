// Critérios A9 a A12 e A14 da spec — .agent/Tasks/fase-1-login.md, seção 10.
// ADR 0005: comportamento de tela se prova renderizando, não lendo o código.
//
// O `db` é falso e expõe só o que o portão usa. O que o banco REALMENTE
// responde é provado em `supabase/tests/auth.test.ts`; aqui o que está sob
// prova é a decisão de qual tela aparece.

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthGate } from './AuthGate'
import type { AccountStage } from '../data/account'
import type { DataResult } from '../data/result'
import type { Database } from '../lib/database.types'

type Db = SupabaseClient<Database>
type Session = { user: { id: string; email: string | null } } | null
type Listener = (event: string, session: Session) => void

/** Cliente falso: guarda o listener para o teste poder emitir eventos. */
function fakeDb() {
  let listener: Listener = () => {}
  const db = {
    auth: {
      onAuthStateChange(cb: Listener) {
        listener = cb
        return { data: { subscription: { unsubscribe: () => {} } } }
      },
      signOut: vi.fn(async () => {}),
    },
  } as unknown as Db

  return {
    db,
    emit(session: Session) {
      listener('SIGNED_IN', session)
    },
  }
}

const SESSION = { user: { id: 'u-1', email: 'lana@test.local' } }

function stageOf(stage: AccountStage) {
  return async (): Promise<DataResult<AccountStage>> => ({ status: 'ok', rows: stage })
}

const DOMAIN = <div data-testid="domain">tela de domínio</div>

function setup(loadStage: (db: Db) => Promise<DataResult<AccountStage>>) {
  const { db, emit } = fakeDb()
  render(
    <AuthGate db={db} loadStage={loadStage} providers={['google']}>
      {DOMAIN}
    </AuthGate>,
  )
  return { emit }
}

describe('A11 — `loading` não é `signed_out`', () => {
  it('antes do primeiro evento de sessão, não mostra Login nem tela de domínio', () => {
    setup(stageOf({ stage: 'needs_profile' }))

    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Entrar' })).toBeNull()
    expect(screen.queryByTestId('domain')).toBeNull()
  })
})

describe('A9 — deslogado vê o Login, e nenhuma tela de domínio', () => {
  it('mostra o Login', async () => {
    const { emit } = setup(stageOf({ stage: 'ready', profileId: 'p', coupleId: 'c', slot: 1 }))
    emit(null)

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.getByLabelText('Senha')).toBeInTheDocument()
    expect(screen.queryByTestId('domain')).toBeNull()
  })

  it('não oferece link mágico — ADR 0004', async () => {
    const { emit } = setup(stageOf({ stage: 'needs_profile' }))
    emit(null)

    await screen.findByRole('heading', { name: 'Entrar' })
    expect(screen.queryByText(/link mágico/i)).toBeNull()
    expect(screen.queryByText(/sem senha pra lembrar/i)).toBeNull()
  })
})

describe('A14 — provedor sem credencial não é renderizado', () => {
  it('com apenas `google`, o botão da Apple não existe', async () => {
    const { emit } = setup(stageOf({ stage: 'needs_profile' }))
    emit(null)

    expect(await screen.findByRole('button', { name: 'Continuar com Google' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continuar com Apple' })).toBeNull()
  })

  it('sem provedor nenhum, some também o divisor "ou com e-mail"', async () => {
    const { db, emit } = fakeDb()
    render(
      <AuthGate db={db} loadStage={stageOf({ stage: 'needs_profile' })} providers={[]}>
        {DOMAIN}
      </AuthGate>,
    )
    emit(null)

    await screen.findByRole('heading', { name: 'Entrar' })
    expect(screen.queryByRole('button', { name: /Continuar com/ })).toBeNull()
    expect(screen.queryByText('ou com e-mail')).toBeNull()
    // O caminho que sempre funciona continua lá.
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })
})

describe('A10 — sem casal vê a Escolha, e ela não afirma ter procurado convite', () => {
  it.each([
    ['needs_profile', { stage: 'needs_profile' } as AccountStage],
    ['needs_couple', { stage: 'needs_couple', profileId: 'p-1' } as AccountStage],
  ])('estágio %s → Escolha', async (_name, stage) => {
    const { emit } = setup(stageOf(stage))
    emit(SESSION)

    expect(await screen.findByRole('heading', { name: 'Bem-vindo ao lanabiel.' })).toBeInTheDocument()
    expect(screen.queryByTestId('domain')).toBeNull()
  })

  // R8: não existe tabela de convites, então ninguém procurou. A tela não pode
  // dizer que procurou.
  it('não diz nada sobre convite pendente', async () => {
    const { emit } = setup(stageOf({ stage: 'needs_profile' }))
    emit(SESSION)

    await screen.findByRole('heading', { name: 'Bem-vindo ao lanabiel.' })
    expect(screen.queryByText(/convite pendente/i)).toBeNull()
    expect(screen.queryByText(/não achamos/i)).toBeNull()
  })

  // Fase 2, A21: o que era "desabilitado com motivo" agora funciona.
  it('os dois caminhos estão habilitados, sem o aviso de "próxima etapa"', async () => {
    const { emit } = setup(stageOf({ stage: 'needs_profile' }))
    emit(SESSION)

    const criar = await screen.findByRole('button', { name: /Criar nosso espaço/ })
    const codigo = screen.getByRole('button', { name: /Tenho um código/ })
    expect(criar).toBeEnabled()
    expect(codigo).toBeEnabled()
    expect(screen.queryByText('Chega na próxima etapa')).toBeNull()
  })
})

describe('I1 — tela de domínio só com `ready`', () => {
  it('renderiza a tela de domínio quando o estágio é `ready`', async () => {
    const { emit } = setup(stageOf({ stage: 'ready', profileId: 'p', coupleId: 'c', slot: 1 }))
    emit(SESSION)

    expect(await screen.findByTestId('domain')).toBeInTheDocument()
  })

  it('enquanto o estágio não volta, mostra esqueleto — nunca a tela de domínio', async () => {
    let resolve!: (r: DataResult<AccountStage>) => void
    const pending = new Promise<DataResult<AccountStage>>((r) => {
      resolve = r
    })
    const { emit } = setup(() => pending)
    emit(SESSION)

    await waitFor(() => expect(screen.getByText('Carregando…')).toBeInTheDocument())
    expect(screen.queryByTestId('domain')).toBeNull()

    resolve({ status: 'ok', rows: { stage: 'ready', profileId: 'p', coupleId: 'c', slot: 1 } })
    expect(await screen.findByTestId('domain')).toBeInTheDocument()
  })
})

describe('A12 — a sessão morrendo no meio do uso leva ao Login', () => {
  it('volta ao Login sem recarregar, e a tela de domínio some', async () => {
    const { emit } = setup(stageOf({ stage: 'ready', profileId: 'p', coupleId: 'c', slot: 1 }))
    emit(SESSION)
    expect(await screen.findByTestId('domain')).toBeInTheDocument()

    // É isto que o token revogado, o projeto pausado e o logout na outra aba
    // produzem. Sem reagir, a tela fica no ar e as queries seguintes devolvem
    // zero linhas — falha silenciosa nº 1 do SOP.
    emit(null)

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByTestId('domain')).toBeNull()
  })
})

describe('I2 — falha de rede não vira Escolha nem lista vazia', () => {
  it('mostra o erro, e não a tela de onboarding', async () => {
    const { emit } = setup(async () => ({ status: 'error', cause: 'fetch failed' }))
    emit(SESSION)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('fetch failed')
    expect(screen.queryByRole('heading', { name: 'Bem-vindo ao lanabiel.' })).toBeNull()
    expect(screen.queryByTestId('domain')).toBeNull()
  })

  it('`unauthenticated` vindo da leitura leva ao Login', async () => {
    const { emit } = setup(async () => ({ status: 'unauthenticated' }))
    emit(SESSION)

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(screen.queryByTestId('domain')).toBeNull()
  })
})
