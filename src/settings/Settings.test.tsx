// Critérios A12–A22 da spec — .agent/Tasks/fase-3-configuracoes.md, seção 10.
// ADR 0005: comportamento de tela se prova renderizando.
//
// A tela é montada com a SettingsApi injetada. O que o banco REALMENTE
// responde está em supabase/tests/settings.test.ts e vizinhos; aqui se prova
// o que a tela mostra, o que ela pede, e em que ordem.

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Appearance } from '../app/appearance'
import type { AppearanceControl } from '../app/useAppearance'
import type { SettingsTab } from '../domain/settings'
import type { SettingsApi } from './api'
import { SettingsScreen } from './SettingsScreen'
import { MARAU, PARATY, PASSO_FUNDO, fakeApi, settingsData } from './test/fixtures'

function appearanceControl(overrides: Partial<AppearanceControl> = {}): AppearanceControl {
  const appearance: Appearance = { theme: 'dark', density: 'comfortable', reduceMotion: false }
  return { appearance, storable: true, update: vi.fn(), ...overrides }
}

function renderTab(tab: SettingsTab, api: SettingsApi = fakeApi(), extra: { onStageChanged?: () => void; appearance?: AppearanceControl } = {}) {
  const onStageChanged = extra.onStageChanged ?? vi.fn()
  const utils = render(
    <SettingsScreen tab={tab} api={api} appearance={extra.appearance ?? appearanceControl()} onStageChanged={onStageChanged} />,
  )
  return { ...utils, api, onStageChanged }
}

describe('A14 — leitura: esqueleto, erro, e nunca padrão no lugar de dado', () => {
  it('com a leitura em voo, não há toggle na tela', async () => {
    let resolve!: (v: Awaited<ReturnType<SettingsApi['loadSettings']>>) => void
    const api = fakeApi(settingsData(), {
      loadSettings: vi.fn<SettingsApi['loadSettings']>(() => new Promise((r) => (resolve = r))),
    })
    renderTab('perfil-do-casal', api)
    expect(screen.getByText('Carregando…')).toBeInTheDocument()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    resolve({ status: 'ok', rows: settingsData() })
    expect(await screen.findAllByRole('switch')).toHaveLength(3)
  })

  it('com erro, mostra a causa e tenta de novo', async () => {
    const load = vi
      .fn<SettingsApi['loadSettings']>()
      .mockResolvedValueOnce({ status: 'error', cause: 'projeto pausado' })
      .mockResolvedValueOnce({ status: 'ok', rows: settingsData() })
    renderTab('perfil-do-casal', fakeApi(settingsData(), { loadSettings: load }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu pra carregar as configurações: projeto pausado')
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findAllByRole('switch')).toHaveLength(3)
    expect(load).toHaveBeenCalledTimes(2)
  })
})

describe('A12 — menu', () => {
  it('as nove abas, a ativa marcada, e o rótulo do espaço privado', async () => {
    renderTab('cidades')
    const menu = screen.getByRole('navigation', { name: 'Seções das configurações' })
    expect(within(menu).getAllByRole('link')).toHaveLength(9)
    expect(within(menu).getByRole('link', { name: 'Cidades' })).toHaveAttribute('aria-current', 'page')
    expect(await screen.findByText('Espaço privado · só Gabriel e Lana')).toBeInTheDocument()
  })
})

describe('A15 — escrita: patch da coluna certa, e volta atrás no erro', () => {
  it('Perfil do casal: toggle grava a coluna e mostra o valor gravado', async () => {
    const { api } = renderTab('perfil-do-casal')
    const toggle = await screen.findByRole('switch', { name: 'Mostrar contador na Home' })
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(toggle)
    expect(api.updateCoupleSettings).toHaveBeenCalledWith({ showHomeCounter: false })
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'))
  })

  it('erro: o toggle fica no valor anterior e a causa aparece junto', async () => {
    const api = fakeApi(settingsData(), {
      updateCoupleSettings: vi.fn(async () => ({ status: 'error' as const, cause: 'rede caiu' })),
    })
    renderTab('perfil-do-casal', api)
    const toggle = await screen.findByRole('switch', { name: 'Usar foto do casal na capa' })
    await userEvent.click(toggle)
    expect(await screen.findByText('rede caiu')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'false')
  })

  it('Perfil do casal: nome grava ao sair do campo; vazio vira null', async () => {
    const { api } = renderTab('perfil-do-casal')
    const field = await screen.findByLabelText('Nome do casal (opcional)')
    await userEvent.clear(field)
    await userEvent.tab()
    expect(api.updateCouple).toHaveBeenCalledWith('couple-1', { name: null })
  })

  it('Perfil do casal: data futura não sai do cliente', async () => {
    const { api } = renderTab('perfil-do-casal')
    const field = await screen.findByLabelText('Começo do namoro')
    await userEvent.clear(field)
    await userEvent.type(field, '2027-01-01')
    await userEvent.tab()
    expect(api.updateCouple).not.toHaveBeenCalled()
    expect(await screen.findByText('O começo do namoro não pode ser no futuro.')).toBeInTheDocument()
  })

  it('Meu perfil: a cor da outra pessoa está desabilitada; color_taken mostra o nome dela', async () => {
    const api = fakeApi(settingsData(), { updateProfile: vi.fn(async () => ({ status: 'color_taken' as const })) })
    renderTab('meu-perfil', api)
    const palette = await screen.findByRole('radiogroup', { name: 'Sua cor' })
    expect(within(palette).getByRole('radio', { name: /#F4A3B4/ })).toBeDisabled()
    await userEvent.click(within(palette).getByRole('radio', { name: '#C3B3F2' }))
    expect(api.updateProfile).toHaveBeenCalledWith({ color: '#C3B3F2' })
    expect(await screen.findByText('Lana acabou de escolher essa cor.')).toBeInTheDocument()
  })

  it('Calendário: segmento e cor de faixa gravam a coluna certa', async () => {
    const { api } = renderTab('calendario')
    await userEvent.click(await screen.findByRole('radio', { name: 'Seg' }))
    expect(api.updateCoupleSettings).toHaveBeenCalledWith({ weekStartsOn: 'mon' })
    await userEvent.click(screen.getByRole('button', { name: 'Trocar a cor de Juntos em Marau' }))
    await userEvent.click(within(screen.getByRole('radiogroup', { name: 'Cor de Juntos em Marau' })).getByRole('radio', { name: '#C3B3F2' }))
    expect(api.updateCoupleSettings).toHaveBeenCalledWith({ colorTogetherHome2: '#C3B3F2' })
    expect(screen.getByText('Sem registro')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Trocar a cor de Sem registro/ })).not.toBeInTheDocument()
  })

  it('Lista: ordenação grava a coluna', async () => {
    const { api } = renderTab('lista')
    await userEvent.click(await screen.findByRole('radio', { name: 'A–Z' }))
    expect(api.updateCoupleSettings).toHaveBeenCalledWith({ listDefaultSort: 'az' })
  })

  it('Notificações: cada chave grava a sua coluna', async () => {
    const { api } = renderTab('notificacoes')
    await userEvent.click(await screen.findByRole('switch', { name: 'Véspera de viagem — E-mail' }))
    expect(api.updateProfileSettings).toHaveBeenCalledWith({ column: 'notify_trip_eve_email', value: true })
  })
})

describe('A16 — aniversário desligado desabilita a linha nas Notificações', () => {
  it('desabilitada e com a legenda', async () => {
    const data = settingsData()
    data.coupleSettings.remindAnniversary = false
    renderTab('notificacoes', fakeApi(data))
    expect(await screen.findByRole('switch', { name: 'Aniversário de namoro — Push' })).toBeDisabled()
    expect(screen.getByText('Desligado em Perfil do casal')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Véspera de viagem — Push' })).toBeEnabled()
  })
})

describe('A16a — convite pendente com um integrante só', () => {
  const alone = () => {
    const data = settingsData()
    data.couple.members = [data.couple.members[1]!]
    data.me = { profileId: 'u-lana', email: 'lana@test.local' }
    return data
  }

  it('mostra o convite aberto; cancelar pede confirmação e revoga', async () => {
    const api = fakeApi(alone(), {
      loadOpenInvite: vi
        .fn<SettingsApi['loadOpenInvite']>()
        .mockResolvedValueOnce({
          status: 'ok',
          rows: { id: 'inv', code: 'ABC123', email: 'bia@exemplo.com', inviteeName: 'Bia', expiresAt: '2026-10-01T12:00:00Z', lastSentAt: null },
        })
        .mockResolvedValue({ status: 'ok', rows: null }),
    })
    renderTab('perfil-do-casal', api)
    expect(await screen.findByText('Convite para Bia')).toBeInTheDocument()
    // O código na tela, e a verdade sobre o e-mail (lastSentAt nulo).
    expect(screen.getByText('ABC-123')).toBeInTheDocument()
    expect(screen.getByText(/O e-mail não foi enviado/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar convite' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancelar o convite?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar convite' }))
    expect(api.cancelInvite).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('Ninguém convidado')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Convidar alguém' })).toBeInTheDocument()
  })

  it('convidar outra pessoa cria o convite', async () => {
    const api = fakeApi(alone())
    renderTab('perfil-do-casal', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Convidar alguém' }))
    const dialog = screen.getByRole('dialog', { name: 'Convidar alguém' })
    await userEvent.type(within(dialog).getByLabelText('E-mail'), 'bia@exemplo.com')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar convite' }))
    expect(api.createInvite).toHaveBeenCalledWith({ email: 'bia@exemplo.com', inviteeName: null })
    expect(api.sendInvite).toHaveBeenCalledWith('inv-2')
  })

  it('com dois integrantes, nada de convite; e Meu perfil não tem Trocar e-mail', async () => {
    renderTab('perfil-do-casal')
    await screen.findAllByRole('switch')
    expect(screen.queryByText(/Convidar/)).not.toBeInTheDocument()
  })

  it('Meu perfil não oferece troca de e-mail', async () => {
    renderTab('meu-perfil')
    expect(await screen.findByText('E-mail de acesso · só leitura')).toBeInTheDocument()
    expect(screen.queryByText(/Trocar e-mail/)).not.toBeInTheDocument()
  })
})

describe('A17 — Cidades', () => {
  it('Trocar cidade só no próprio cartão', async () => {
    renderTab('cidades')
    expect(await screen.findAllByRole('button', { name: 'Trocar cidade' })).toHaveLength(1)
  })

  it('o aviso de recálculo aparece antes de gravar', async () => {
    const { api } = renderTab('cidades')
    await userEvent.click(await screen.findByRole('button', { name: 'Trocar cidade' }))
    await userEvent.type(screen.getByLabelText('Cidade onde você mora'), 'pa')
    await userEvent.click(await screen.findByRole('button', { name: /Passo Fundo, RS/ }))
    expect(screen.getByText(/Isso recalcula a história inteira/)).toBeInTheDocument()
    expect(api.updateProfile).not.toHaveBeenCalled()
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Trocar cidade' }))
    expect(api.updateProfile).toHaveBeenCalledWith({ homeCityId: PASSO_FUNDO.id })
  })

  it('Adicionar cidade não oferece casa nem cidade já salva', async () => {
    renderTab('cidades')
    await userEvent.click(await screen.findByRole('button', { name: 'Adicionar cidade' }))
    await userEvent.type(screen.getByLabelText('Buscar cidade'), 'ma')
    expect(await screen.findByRole('button', { name: /Marau, RS.*casa de Lana/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Paraty, RJ.*já salva/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /Passo Fundo, RS/ })).toBeEnabled()
  })

  it('casas não têm Remover; salva tem', async () => {
    const { api } = renderTab('cidades')
    expect(await screen.findByText('Casa de Lana')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: `Opções de ${MARAU.name}` })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: `Opções de ${PARATY.name}` }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Remover' }))
    expect(api.removeSavedCity).toHaveBeenCalledWith(PARATY.id)
  })

  it('distância em linha reta; pela estrada desabilitada', async () => {
    renderTab('cidades')
    expect(await screen.findByRole('radio', { name: 'Pela estrada (rodoviária)' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: 'Em linha reta' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('A18 — Lista: a última categoria não desliga', () => {
  it('com sete escondidas, a oitava fica travada', async () => {
    const data = settingsData()
    data.coupleSettings.hiddenCategories = ['pais', 'cidade', 'restaurante', 'parque', 'comida', 'experiencia', 'filme']
    const { api } = renderTab('lista', fakeApi(data))
    expect(await screen.findByRole('button', { name: /^Séries/ })).toBeDisabled()
    expect(screen.getByText(/1 de 8 ligadas/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Filmes/ }))
    expect(api.updateCoupleSettings).toHaveBeenCalledWith({
      hiddenCategories: ['pais', 'cidade', 'restaurante', 'parque', 'comida', 'experiencia'],
    })
  })
})

describe('A20 (Fase 4) — Lista: contagem por chip', () => {
  it('cada chip mostra o nome e, num selo à parte, quantos itens a categoria tem — inclusive as desligadas', async () => {
    const data = settingsData()
    data.coupleSettings.hiddenCategories = ['filme']
    renderTab('lista', fakeApi(data))
    const chips = await screen.findByRole('group', { name: 'Categorias visíveis' })
    const count = (name: string) => within(chips).getByRole('button', { name: new RegExp(`^${name}`) }).querySelector('.st-chip-count')
    await waitFor(() => expect(count('Países')).toHaveTextContent('7'))
    expect(within(chips).getByRole('button', { name: /^Países/ })).toHaveAttribute('aria-pressed', 'true')
    expect(count('Cidades')).toHaveTextContent('2')
    expect(count('Filmes')).toHaveTextContent('3')
    expect(within(chips).getByRole('button', { name: /^Filmes/ })).toHaveAttribute('aria-pressed', 'false')
    expect(count('Séries')).toHaveTextContent('0')
  })

  it('subtítulo da aba com o total real', async () => {
    renderTab('lista')
    expect(await screen.findByText('Como os 13 itens aparecem e o que o app sugere.')).toBeInTheDocument()
  })

  it('contagem com erro: os chips ficam só com o nome, e continuam funcionando', async () => {
    const api = fakeApi(settingsData(), {
      loadListCounts: vi.fn(async () => ({ status: 'error' as const, cause: 'rede' })),
    })
    renderTab('lista', api)
    const chips = await screen.findByRole('group', { name: 'Categorias visíveis' })
    await waitFor(() => expect(api.loadListCounts).toHaveBeenCalled())
    const pais = within(chips).getByRole('button', { name: 'Países' })
    expect(pais.querySelector('.st-chip-count')).toBeNull()
    expect(screen.getByText('Como os itens aparecem e o que o app sugere.')).toBeInTheDocument()
    await userEvent.click(pais)
    expect(api.updateCoupleSettings).toHaveBeenCalledWith({ hiddenCategories: ['pais'] })
  })
})

describe('A19 — Aparência', () => {
  it('escolher Claro chama o controle do aparelho, não a API', async () => {
    const appearance = appearanceControl()
    const { api } = renderTab('aparencia', fakeApi(), { appearance })
    await userEvent.click(within(await screen.findByRole('radiogroup', { name: 'Tema' })).getByRole('radio', { name: 'Claro' }))
    expect(appearance.update).toHaveBeenCalledWith({ theme: 'light' })
    expect(api.updateCoupleSettings).not.toHaveBeenCalled()
  })

  it('sem localStorage, avisa', async () => {
    renderTab('aparencia', fakeApi(), { appearance: appearanceControl({ storable: false }) })
    expect(await screen.findByText(/Não dá pra guardar neste navegador/)).toBeInTheDocument()
  })
})

describe('A20 — Zona sensível', () => {
  it('Apagar pra sempre só habilita com o nome exato, e chama a API', async () => {
    const { api, onStageChanged } = renderTab('zona-sensivel')
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar o espaço' }))
    const dialog = screen.getByRole('dialog', { name: 'Apagar o espaço pra sempre?' })
    const confirm = within(dialog).getByRole('button', { name: 'Apagar o espaço pra sempre' })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Digite “Gabi & Lana” pra confirmar'), 'Gabi & Lan')
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Digite “Gabi & Lana” pra confirmar'), 'a')
    await userEvent.click(confirm)
    expect(api.deleteCouple).toHaveBeenCalledWith('couple-1')
    await waitFor(() => expect(onStageChanged).toHaveBeenCalled())
  })

  it('falha depois da mídia: a mensagem diz que só a capa se foi', async () => {
    const api = fakeApi(settingsData(), {
      deleteCouple: vi.fn(async () => ({ status: 'couple_failed' as const, cause: 'rede' })),
    })
    const { onStageChanged } = renderTab('zona-sensivel', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Apagar o espaço' }))
    const dialog = screen.getByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/pra confirmar/), 'Gabi & Lana')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar o espaço pra sempre' }))
    expect(await within(dialog).findByText(/A foto do casal foi apagada, mas o espaço não/)).toBeInTheDocument()
    expect(onStageChanged).not.toHaveBeenCalled()
  })

  it('sair do casal pede o nome e avisa o portão', async () => {
    const { api, onStageChanged } = renderTab('zona-sensivel')
    await userEvent.click(await screen.findByRole('button', { name: 'Sair do casal' }))
    const dialog = screen.getByRole('dialog', { name: 'Sair do casal?' })
    await userEvent.type(within(dialog).getByLabelText(/pra confirmar/), 'Gabi & Lana')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sair do casal' }))
    expect(api.leaveCouple).toHaveBeenCalled()
    await waitFor(() => expect(onStageChanged).toHaveBeenCalled())
  })
})

describe('A20 (Fase 4) — Zona sensível: itens na lista', () => {
  it('mostra o total real', async () => {
    renderTab('zona-sensivel')
    const card = (await screen.findByRole('heading', { name: 'Apagar o espaço' })).closest('.st-card') as HTMLElement
    await waitFor(() => expect(within(card).getByText('itens na lista').nextSibling).toHaveTextContent('13'))
  })

  it('contagem com erro mostra —, e a tela continua de pé', async () => {
    const api = fakeApi(settingsData(), {
      loadListCounts: vi.fn(async () => ({ status: 'error' as const, cause: 'rede' })),
    })
    renderTab('zona-sensivel', api)
    const card = (await screen.findByRole('heading', { name: 'Apagar o espaço' })).closest('.st-card') as HTMLElement
    await waitFor(() => expect(within(card).getByText('itens na lista').nextSibling).toHaveTextContent('—'))
    expect(within(card).getByText('itens na lista').nextSibling).toHaveAttribute('title', 'Não deu pra contar os itens: rede')
    expect(screen.getByRole('button', { name: 'Apagar o espaço' })).toBeEnabled()
  })
})

describe('R24 — campo de texto recusado volta ao valor gravado', () => {
  it('nome do casal com erro do banco: o campo mostra o gravado de novo', async () => {
    const api = fakeApi(settingsData(), { updateCouple: vi.fn(async () => ({ status: 'error' as const, cause: 'rede caiu' })) })
    renderTab('perfil-do-casal', api)
    const field = await screen.findByLabelText('Nome do casal (opcional)')
    await userEvent.clear(field)
    await userEvent.type(field, 'Outro nome')
    await userEvent.tab()
    expect(await screen.findByText('rede caiu')).toBeInTheDocument()
    await waitFor(() => expect(field).toHaveValue('Gabi & Lana'))
  })
})

describe('I9 — sozinho, sair é apagar (a pasta de fotos sai antes)', () => {
  it('chama deleteCouple, não leaveCouple', async () => {
    const data = settingsData()
    data.couple.members = [data.couple.members[0]!]
    const api = fakeApi(data)
    const { onStageChanged } = renderTab('zona-sensivel', api)
    expect(await screen.findByText(/sair apaga o espaço/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sair do casal' }))
    const dialog = screen.getByRole('dialog', { name: 'Apagar o espaço pra sempre?' })
    await userEvent.type(within(dialog).getByLabelText(/pra confirmar/), 'Gabi & Lana')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apagar o espaço pra sempre' }))
    expect(api.deleteCouple).toHaveBeenCalledWith('couple-1')
    expect(api.leaveCouple).not.toHaveBeenCalled()
    await waitFor(() => expect(onStageChanged).toHaveBeenCalled())
  })
})

describe('A21 — export pela tela', () => {
  it('baixa lanabiel-<hoje>.json', async () => {
    const { api } = renderTab('dados-e-privacidade')
    await userEvent.click(await screen.findByRole('button', { name: 'Baixar' }))
    await waitFor(() => expect(api.download).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.download).mock.calls[0]![0]).toBe('lanabiel-2026-09-25.json')
  })

  it('baixa version 3 com a Lista e o Calendário', async () => {
    const { api } = renderTab('dados-e-privacidade')
    await userEvent.click(await screen.findByRole('button', { name: 'Baixar' }))
    await waitFor(() => expect(api.download).toHaveBeenCalledTimes(1))
    const doc = JSON.parse(vi.mocked(api.download).mock.calls[0]![1])
    expect(doc.version).toBe(3)
    expect(doc.list_items).toHaveLength(2)
    expect(doc.list_photos).toHaveLength(1)
    expect(doc.calendar_events).toHaveLength(2)
    expect(doc.day_kisses).toEqual([
      { day: '2026-09-20', count: 2 },
      { day: '2026-09-21', count: 1 },
    ])
  })

  it('leitura da Lista com erro aborta sem baixar', async () => {
    const api = fakeApi(settingsData(), {
      loadListExport: vi.fn(async () => ({ status: 'error' as const, cause: 'rede' })),
    })
    renderTab('dados-e-privacidade', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Baixar' }))
    expect(await screen.findByText('Não deu pra exportar: a lista: rede')).toBeInTheDocument()
    expect(api.download).not.toHaveBeenCalled()
  })

  it('leitura do Calendário com erro aborta sem baixar', async () => {
    const api = fakeApi(settingsData(), {
      loadCalendarExport: vi.fn(async () => ({ status: 'error' as const, cause: 'rede' })),
    })
    renderTab('dados-e-privacidade', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Baixar' }))
    expect(await screen.findByText('Não deu pra exportar: o calendário: rede')).toBeInTheDocument()
    expect(api.download).not.toHaveBeenCalled()
  })

  it('Fotos guardadas: a legenda inclui a lista', async () => {
    renderTab('dados-e-privacidade')
    expect(await screen.findByText('Fotos de perfil, do casal e da lista')).toBeInTheDocument()
  })

  it('leitura com erro aborta sem baixar', async () => {
    const api = fakeApi(settingsData(), {
      loadCalCities: vi.fn(async () => ({ status: 'error' as const, cause: 'rede' })),
    })
    renderTab('dados-e-privacidade', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Baixar' }))
    expect(await screen.findByText(/Não deu pra exportar/)).toBeInTheDocument()
    expect(api.download).not.toHaveBeenCalled()
  })

  it('sessões: a atual é "este aparelho"; encerrar outra chama a API', async () => {
    const api = fakeApi(settingsData(), {
      listSessions: vi.fn(async () => ({
        status: 'ok' as const,
        rows: [
          { id: 's-here', userAgent: 'Mozilla/5.0 (Macintosh) Chrome/140.0 Safari/537.36', createdAt: 'x', lastActiveAt: '2026-09-25T15:00:00Z', isCurrent: true },
          { id: 's-phone', userAgent: 'Mozilla/5.0 (iPhone) Version/18.0 Mobile Safari/604.1', createdAt: 'x', lastActiveAt: '2026-09-25T13:00:00Z', isCurrent: false },
        ],
      })),
    })
    renderTab('dados-e-privacidade', api)
    expect(await screen.findByText('agora · este aparelho')).toBeInTheDocument()
    const buttons = screen.getAllByRole('button', { name: 'Encerrar' })
    await userEvent.click(buttons[1]!)
    expect(api.endSession).toHaveBeenCalledWith('s-phone')
    expect(await screen.findByText(/O outro aparelho sai em até 1 hora/)).toBeInTheDocument()
  })
})

describe('A22 — Alterar senha', () => {
  it('curta e confirmação diferente bloqueiam; weak_password vira mensagem', async () => {
    const api = fakeApi(settingsData(), {
      changePassword: vi.fn(async () => ({ status: 'weak_password' as const, reason: 'leaked' as const })),
    })
    renderTab('meu-perfil', api)
    await userEvent.click(await screen.findByRole('button', { name: 'Alterar senha' }))
    const dialog = screen.getByRole('dialog', { name: 'Alterar senha' })
    const submit = within(dialog).getByRole('button', { name: 'Alterar senha' })
    await userEvent.type(within(dialog).getByLabelText('Senha nova'), 'curta')
    expect(submit).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText('Senha nova'), '-mas-agora-longa')
    await userEvent.type(within(dialog).getByLabelText('Repita a senha nova'), 'outra-coisa-qualquer')
    expect(submit).toBeDisabled()
    await userEvent.clear(within(dialog).getByLabelText('Repita a senha nova'))
    await userEvent.type(within(dialog).getByLabelText('Repita a senha nova'), 'curta-mas-agora-longa')
    await userEvent.click(submit)
    expect(api.changePassword).toHaveBeenCalledWith('curta-mas-agora-longa')
    expect(await within(dialog).findByText(/apareceu em vazamentos/)).toBeInTheDocument()
  })
})

describe('R5 — painel', () => {
  it('dias juntos no ano contados, itens na lista com o total real, viagens como —', async () => {
    renderTab('perfil-do-casal')
    const panel = await screen.findByRole('complementary', { name: 'O espaço de vocês' })
    expect(within(panel).getByText('Sexta, 25 de setembro')).toBeInTheDocument()
    // 20, 21, 22 de setembro juntos em SJC.
    expect(within(panel).getByText('dias juntos em 2026').nextSibling).toHaveTextContent('3')
    // R26 (Fase 4): 7 + 2 + 1 + 3 do fixture.
    await waitFor(() => expect(within(panel).getByText('itens na lista').nextSibling).toHaveTextContent('13'))
    expect(within(panel).getByText('viagens').nextSibling).toHaveTextContent('—')
    expect(within(panel).getAllByText('—')).toHaveLength(1)
    expect(within(panel).getByText('lanabiel 0.0.0-test · build test')).toBeInTheDocument()
  })
})

describe('R26 — painel: contagem da Lista que falha', () => {
  it('mostra — em itens na lista, e o resto da tela abre normalmente', async () => {
    const api = fakeApi(settingsData(), {
      loadListCounts: vi.fn(async () => ({ status: 'error' as const, cause: 'projeto pausado' })),
    })
    renderTab('perfil-do-casal', api)
    const panel = await screen.findByRole('complementary', { name: 'O espaço de vocês' })
    await waitFor(() => expect(api.loadListCounts).toHaveBeenCalled())
    await waitFor(() => expect(within(panel).getByText('itens na lista').nextSibling).toHaveTextContent('—'))
    expect(within(panel).getAllByText('—')).toHaveLength(2)
    expect(await screen.findAllByRole('switch')).toHaveLength(3)
    expect(screen.queryByText(/Não deu pra carregar as configurações/)).not.toBeInTheDocument()
  })
})
