// Critério A17 — .agent/Tasks/fase-4-lista.md, seção 10 (R21–R25, I9–I11).
// O painel se prova dentro da tela real: ele lê o `ListContext` que a
// `ListScreen` publica, e "Ver tudo" / "Ver todos" mexem nos filtros dela.

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ListApi } from './api'
import type { MarkDoneModalProps } from './MarkDoneModal'
import { ListScreen } from './ListScreen'
import { STAYS, seededListApi } from './test/fixtures'

vi.mock('./MarkDoneModal', () => ({
  MarkDoneModal: (props: MarkDoneModalProps) => (
    <div role="dialog" aria-label="MarkDoneModal">
      done:{props.item.id}
    </div>
  ),
}))

async function renderPanel(api: ListApi) {
  render(<ListScreen api={api} />)
  return screen.findByRole('complementary', { name: 'Painel da lista' })
}

const region = (panel: HTMLElement, name: string) => within(panel).getByRole('region', { name })

describe('A17 — onde o casal está hoje decide sugestão e "Perto de vocês"', () => {
  it('juntos em SJC: os 3 mais perto com a distância, e a sugestão vem de perto', async () => {
    const panel = await renderPanel(seededListApi({ stays: STAYS.togetherInSJC }))
    expect(within(panel).getByText('Sábado, 26 de setembro')).toBeInTheDocument()

    const near = region(panel, 'Perto de vocês')
    expect(near).toHaveTextContent('Juntos em São José dos Campos')
    expect(near).toHaveTextContent('3 itens da lista na cidade · do calendário')
    const rows = within(within(near).getByRole('list', { name: 'Mais perto' })).getAllByRole('button')
    expect(rows.map((r) => r.textContent)).toEqual([
      'Sorveteria da PraçaComida· menos de 100 m',
      'Parque Vicentina AranhaParque· 1,2 km',
      'Aula de cerâmica a doisExperiência· 2,9 km',
    ])

    const suggestion = region(panel, 'Sugestão do momento')
    expect(suggestion).toHaveTextContent('Sorveteria da Praça')
    expect(suggestion).toHaveTextContent('Comida · São José dos Campos · menos de 100 m')
    expect(suggestion).toHaveTextContent('Vocês estão juntos em São José dos Campos até 30 set')
  })

  it('juntos com as duas estadias em aberto: sem o "até"', async () => {
    const stays = STAYS.togetherInSJC.map((s) => ({ ...s, endsOn: null }))
    const panel = await renderPanel(seededListApi({ stays }))
    const suggestion = region(panel, 'Sugestão do momento')
    expect(within(suggestion).getByText('Vocês estão juntos em São José dos Campos')).toBeInTheDocument()
  })

  it('separados: sugestão de filme ou série, sem distância nenhuma', async () => {
    const panel = await renderPanel(seededListApi({ stays: STAYS.apart }))
    const suggestion = region(panel, 'Sugestão do momento')
    expect(suggestion).toHaveTextContent('Severance')
    expect(suggestion).toHaveTextContent('Série · Apple TV+')
    expect(suggestion).toHaveTextContent('Pra uma noite separados, cada um na sua casa.')
    expect(region(panel, 'Perto de vocês')).toHaveTextContent('Vocês estão em cidades diferentes hoje')
    expect(panel.textContent).not.toMatch(/\bkm\b/)
  })

  it('sem estadia: os textos de unknown, nenhuma distância, e a cidade-casa nunca vira palpite', async () => {
    const panel = await renderPanel(seededListApi({ stays: STAYS.unknown }))
    const near = region(panel, 'Perto de vocês')
    expect(near).toHaveTextContent('Sem registro de onde vocês estão hoje — marque no Calendário.')
    // R23: o "marque no Calendário" leva ao Calendário, sem recarregar a página.
    const link = within(near).getByRole('link', { name: 'marque no Calendário' })
    expect(link).toHaveAttribute('href', '/')
    window.history.pushState(null, '', '/lista')
    await userEvent.click(link)
    expect(window.location.pathname).toBe('/')
    const suggestion = region(panel, 'Sugestão do momento')
    expect(suggestion).toHaveTextContent('Sem registro de onde vocês estão hoje.')
    // Sorteada de qualquer item não feito — o primeiro, com random = 0.
    expect(suggestion).toHaveTextContent('Parque Vicentina Aranha')
    expect(panel.textContent).not.toMatch(/\bkm\b/)
    expect(panel.textContent).not.toContain('Juntos em')
  })
})

describe('A17 — as preferências do casal', () => {
  it('show_daily_suggestion = false esconde a sugestão', async () => {
    const panel = await renderPanel(seededListApi({ stays: STAYS.apart, settings: { showDailySuggestion: false } }))
    expect(within(panel).queryByRole('region', { name: 'Sugestão do momento' })).not.toBeInTheDocument()
    expect(region(panel, 'Perto de vocês')).toBeInTheDocument()
  })

  it('show_category_progress = false esconde as barras, não o total', async () => {
    const panel = await renderPanel(seededListApi({ settings: { showCategoryProgress: false } }))
    const progress = region(panel, 'Progresso')
    expect(within(progress).queryByRole('list', { name: 'Progresso por categoria' })).not.toBeInTheDocument()
    expect(progress).toHaveTextContent('4de 13 feitas30%')
  })

  it('progresso por categoria: "{feitos}/{total}" das visíveis', async () => {
    const panel = await renderPanel(seededListApi())
    const bars = within(region(panel, 'Progresso')).getByRole('list', { name: 'Progresso por categoria' })
    expect(within(bars).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Países0/1',
      'Cidades0/1',
      'Restaurantes1/2',
      'Parques1/2',
      'Comidas0/2',
      'Experiências1/2',
      'Filmes1/2',
      'Séries0/1',
    ])
  })
})

describe('R23 — o sorteio', () => {
  it('"Outra" nunca repete a atual enquanto há alternativa', async () => {
    const random = vi.fn(() => 0)
    const panel = await renderPanel(seededListApi({ stays: STAYS.togetherInSJC }, { random }))
    const suggestion = region(panel, 'Sugestão do momento')
    const name = () => suggestion.querySelector('.ls-suggestion-name')!.textContent
    const seen = [name()]
    for (let i = 0; i < 4; i++) {
      await userEvent.click(within(suggestion).getByRole('button', { name: 'Outra' }))
      seen.push(name())
      expect(seen[seen.length - 1]).not.toBe(seen[seen.length - 2])
    }
    expect(random).toHaveBeenCalled()
    // O ícone de sortear faz o mesmo.
    await userEvent.click(within(suggestion).getByRole('button', { name: 'Sortear outra' }))
    expect(name()).not.toBe(seen[seen.length - 1])
  })

  it('"Bora fazer" abre o Marcar como feito do item sorteado', async () => {
    const panel = await renderPanel(seededListApi({ stays: STAYS.apart }))
    await userEvent.click(within(region(panel, 'Sugestão do momento')).getByRole('button', { name: 'Bora fazer' }))
    expect(screen.getByRole('dialog', { name: 'MarkDoneModal' })).toHaveTextContent('done:i-severance')
  })

  it('sem nada pra sugerir, diz isso', async () => {
    // Juntos em SJC com a categoria de todos os itens da cidade oculta.
    const panel = await renderPanel(
      seededListApi({ stays: STAYS.togetherInSJC, settings: { hiddenCategories: ['parque', 'comida', 'experiencia'] } }),
    )
    expect(region(panel, 'Sugestão do momento')).toHaveTextContent('Nada pra sugerir por aqui — adicione algo à lista.')
    expect(region(panel, 'Perto de vocês')).toHaveTextContent('0 itens da lista na cidade')
  })
})

describe('R22 e R25 — atalhos do painel para a grade', () => {
  it('"Ver tudo" do progresso aplica "Já fizemos"', async () => {
    const panel = await renderPanel(seededListApi())
    await userEvent.click(within(region(panel, 'Progresso')).getByRole('button', { name: 'Ver tudo' }))
    const status = screen.getByRole('group', { name: 'Status' })
    expect(within(status).getByRole('button', { name: 'Já fizemos' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('list', { name: 'Itens da lista' })).getAllByRole('article')).toHaveLength(4)
  })

  it('Adicionados recentemente: os 4 últimos; "Ver todos" zera os filtros e ordena por Recentes', async () => {
    const panel = await renderPanel(seededListApi({ settings: { listDefaultSort: 'az' } }))
    const recent = region(panel, 'Adicionados recentemente')
    const rows = within(within(recent).getByRole('list', { name: 'Últimos adicionados' })).getAllByRole('button')
    expect(rows.map((r) => r.querySelector('.ls-recent-name')!.textContent)).toEqual([
      'Severance',
      'Acarajé da Dinha',
      'Mocotó',
      'Aula de cerâmica a dois',
    ])
    expect(rows.map((r) => r.querySelector('.ls-recent-note')!.textContent)).toEqual([
      'Apple TV+ · há 3 dias',
      'Salvador · há 5 dias',
      'São Paulo · há 1 sem',
      'São José dos Campos · há 1 sem',
    ])

    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar na lista' }), 'mocoto')
    await userEvent.click(within(recent).getByRole('button', { name: 'Ver todos' }))
    expect(screen.getByRole('searchbox', { name: 'Buscar na lista' })).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Ordenar' })).toHaveValue('recent')
    const names = within(screen.getByRole('list', { name: 'Itens da lista' }))
      .getAllByRole('article')
      .map((a) => a.getAttribute('aria-label'))
    expect(names.slice(0, 2)).toEqual(['Severance', 'Acarajé da Dinha'])
  })
})
