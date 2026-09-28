// Critérios A12, A13 e A18 — .agent/Tasks/fase-4-lista.md, seção 10.
// ADR 0005: comportamento de tela se prova renderizando.
//
// Os três sobrepostos (modal, detalhe, marcar como feito) são trocados por
// dublês que mostram as props e expõem os callbacks: aqui se prova QUANDO a
// tela os abre, com QUE props, e que ela relê depois de `onSaved` / `onDone` /
// `onDeleted`. O miolo de cada um tem o próprio teste.

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearListFocus, peekListFocus, requestListFocus } from '../app/listFocus'
import type { ListApi } from './api'
import type { AddItemModalProps } from './AddItemModal'
import type { ItemSheetProps } from './ItemSheet'
import type { MarkDoneModalProps } from './MarkDoneModal'
import { ListScreen, URL_REFRESH_MS } from './ListScreen'
import { fakeListApi, listContext, listData, listItem, listItems, seededListApi } from './test/fixtures'

vi.mock('./AddItemModal', () => ({
  AddItemModal: (props: AddItemModalProps) => (
    <div role="dialog" aria-label="AddItemModal">
      <p>
        {props.mode === 'edit' ? `edit:${props.item.id}` : `create:${props.initialCategory ?? '-'}`}
      </p>
      <button type="button" onClick={() => props.onSaved(listItem({ id: 'novo', name: 'Novo', category: 'filme' }))}>
        dublê: salvou
      </button>
    </div>
  ),
}))
vi.mock('./ItemSheet', () => ({
  ItemSheet: (props: ItemSheetProps) => (
    <div role="dialog" aria-label="ItemSheet">
      <p>sheet:{props.itemId}</p>
      <button type="button" onClick={() => props.onEdit(listItem({ id: props.itemId, name: 'x', category: 'filme' }))}>
        dublê: editar
      </button>
      <button type="button" onClick={props.onDeleted}>
        dublê: apagou
      </button>
    </div>
  ),
}))
vi.mock('./MarkDoneModal', () => ({
  MarkDoneModal: (props: MarkDoneModalProps) => (
    <div role="dialog" aria-label="MarkDoneModal">
      <p>done:{props.item.id}</p>
      <button type="button" onClick={props.onDone}>
        dublê: feito
      </button>
    </div>
  ),
}))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

function renderList(api: ListApi = seededListApi()) {
  const utils = render(<ListScreen api={api} />)
  return { ...utils, api }
}

const grid = () => screen.getByRole('list', { name: 'Itens da lista' })
const cardNames = () =>
  within(grid())
    .getAllByRole('article')
    .map((a) => a.getAttribute('aria-label'))
const kicker = () => document.querySelector('.ls-kicker')?.textContent

async function loaded() {
  await screen.findByRole('group', { name: 'Categorias' })
}

describe('A12 — leitura: esqueleto, erro, e nunca o vazio antes do ok', () => {
  it('com a leitura em voo, esqueleto — sem chips, sem grade, sem o estado vazio', async () => {
    const api = fakeListApi({ loadList: vi.fn<ListApi['loadList']>(() => new Promise(() => undefined)) })
    renderList(api)
    expect(screen.getByText('Carregando a lista…')).toBeInTheDocument()
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(screen.queryByText('A lista está vazia')).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Categorias' })).not.toBeInTheDocument()
    // O painel já está no lugar (sem layout shift), mas só com o esqueleto.
    const panel = screen.getByRole('complementary', { name: 'Painel da lista' })
    expect(panel).toHaveAttribute('aria-busy', 'true')
    expect(within(panel).queryByRole('heading')).not.toBeInTheDocument()
    expect(within(panel).queryByText(/feitas/)).not.toBeInTheDocument()
  })

  it('com erro, a causa e "Tentar de novo" — que relê e mostra a lista', async () => {
    const load = vi
      .fn<ListApi['loadList']>()
      .mockResolvedValueOnce({ status: 'error', cause: 'projeto pausado' })
      .mockResolvedValueOnce({ status: 'ok', rows: listData() })
    renderList(seededListApi({}, { loadList: load }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu pra carregar a lista: projeto pausado')
    expect(screen.queryByText('A lista está vazia')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await loaded()
    expect(cardNames()).toContain('Mocotó')
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('lista ok e vazia, mas o contexto ainda lendo: não afirma que a lista está vazia', async () => {
    let resolve!: (v: Awaited<ReturnType<ListApi['loadContext']>>) => void
    const api = fakeListApi({ loadContext: vi.fn<ListApi['loadContext']>(() => new Promise((r) => (resolve = r))) })
    renderList(api)
    await waitFor(() => expect(api.loadList).toHaveBeenCalled())
    expect(screen.queryByText('A lista está vazia')).not.toBeInTheDocument()
    await act(async () => resolve({ status: 'ok', rows: listContext() }))
    expect(await screen.findByText('A lista está vazia')).toBeInTheDocument()
  })

  it('erro no contexto também é erro — nunca o vazio', async () => {
    renderList(fakeListApi({ loadContext: vi.fn<ListApi['loadContext']>(async () => ({ status: 'error', cause: 'rede caiu' })) }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu pra carregar a lista: rede caiu')
    expect(screen.queryByText('A lista está vazia')).not.toBeInTheDocument()
  })

  it('R10: zero itens com ok → o começo da lista, e o painel só com progresso e recentes vazios', async () => {
    renderList(fakeListApi())
    expect(await screen.findByText('A lista está vazia')).toBeInTheDocument()
    expect(screen.getByText('Adicione lugares, comidas, filmes ou qualquer coisa que vocês queiram fazer juntos.')).toBeInTheDocument()
    const panel = screen.getByRole('complementary', { name: 'Painel da lista' })
    expect(within(panel).getByText('de 0 feitas')).toBeInTheDocument()
    expect(within(panel).getByText('Nada adicionado ainda.')).toBeInTheDocument()
    expect(within(panel).queryByRole('region', { name: 'Sugestão do momento' })).not.toBeInTheDocument()
    expect(within(panel).queryByRole('region', { name: 'Perto de vocês' })).not.toBeInTheDocument()
    expect(kicker()).toBe('0 coisas · 0 já feitas')

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar o primeiro' }))
    expect(screen.getByRole('dialog', { name: 'AddItemModal' })).toHaveTextContent('create:-')
  })
})

describe('A13 — chips, filtros, cabeçalho, estado sem resultado', () => {
  it('chips com o total de cada categoria, ignorando os outros filtros', async () => {
    renderList()
    await loaded()
    const chips = screen.getByRole('group', { name: 'Categorias' })
    const names = within(chips)
      .getAllByRole('button')
      .map((b) => b.textContent)
    expect(names).toEqual([
      'Todos 13',
      'Países 1',
      'Cidades 1',
      'Restaurantes 2',
      'Parques 2',
      'Comidas 2',
      'Experiências 2',
      'Filmes 2',
      'Séries 1',
    ])
    expect(kicker()).toBe('13 coisas · 4 já feitas')

    await userEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Já fizemos' }))
    expect(within(chips).getByRole('button', { name: 'Parques 2' })).toBeInTheDocument()
  })

  it('categoria oculta some de chips, grade, destaque, progresso e cabeçalho', async () => {
    renderList(seededListApi({ settings: { hiddenCategories: ['filme', 'pais'] } }))
    await loaded()
    const chips = screen.getByRole('group', { name: 'Categorias' })
    expect(within(chips).queryByRole('button', { name: /^Filmes/ })).not.toBeInTheDocument()
    expect(within(chips).queryByRole('button', { name: /^Países/ })).not.toBeInTheDocument()
    expect(within(chips).getByRole('button', { name: 'Todos 10' })).toBeInTheDocument()
    expect(cardNames()).not.toContain('Past Lives')
    expect(cardNames()).not.toContain('Aftersun')
    expect(cardNames()).not.toContain('Japão')
    expect(within(screen.getByRole('list', { name: 'Em destaque' })).queryByText('Japão')).not.toBeInTheDocument()
    expect(kicker()).toBe('10 coisas · 3 já feitas')

    const panel = screen.getByRole('complementary')
    expect(within(panel).getByText('de 10 feitas')).toBeInTheDocument()
    const bars = within(panel).getByRole('list', { name: 'Progresso por categoria' })
    expect(within(bars).queryByText('Filmes')).not.toBeInTheDocument()
    expect(within(bars).getAllByRole('listitem')).toHaveLength(6)
  })

  it('"Quem" só aparece com "Já fizemos" e filtra por quem estava', async () => {
    renderList()
    await loaded()
    const status = screen.getByRole('group', { name: 'Status' })
    expect(screen.queryByRole('group', { name: 'Quem' })).not.toBeInTheDocument()

    await userEvent.click(within(status).getByRole('button', { name: 'Já fizemos' }))
    const who = screen.getByRole('group', { name: 'Quem' })
    expect(within(who).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Gabriel',
      'Lana',
      '♥ os dois',
    ])
    expect(cardNames()).toEqual(['Mergulho em Noronha', 'Casa Amarela Bistrô', 'Parque Ibirapuera', 'Past Lives'].sort(byRecentOf))

    await userEvent.click(within(who).getByRole('button', { name: 'Lana' }))
    expect(cardNames()).toEqual(['Past Lives'])
    await userEvent.click(within(who).getByRole('button', { name: '♥ os dois' }))
    expect(cardNames()).toEqual(['Mergulho em Noronha', 'Parque Ibirapuera'])

    await userEvent.click(within(status).getByRole('button', { name: 'Quero fazer' }))
    expect(screen.queryByRole('group', { name: 'Quem' })).not.toBeInTheDocument()
    expect(cardNames()).toHaveLength(9)
  })

  it('o frame DXg1A: série + já feitas + Gabriel — cabeçalho, texto, chips, Limpar e Adicionar série', async () => {
    renderList()
    await loaded()
    await userEvent.click(within(screen.getByRole('group', { name: 'Categorias' })).getByRole('button', { name: 'Séries 1' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Já fizemos' }))
    await userEvent.click(within(screen.getByRole('group', { name: 'Quem' })).getByRole('button', { name: 'Gabriel' }))

    expect(kicker()).toBe('13 coisas · 4 já feitas · filtrando: Séries, já feitas, só Gabriel')
    expect(screen.getByRole('heading', { name: 'Nenhuma série por aqui ainda' })).toBeInTheDocument()
    expect(
      screen.getByText('Gabriel ainda não marcou nenhuma série como vista. Que tal escolher a próxima pra maratonar juntos?'),
    ).toBeInTheDocument()
    const active = screen.getByRole('list', { name: 'Filtros ativos' })
    expect(within(active).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Séries', 'Já fizemos', 'Gabriel'])
    expect(screen.queryByRole('list', { name: 'Itens da lista' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Em destaque' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar série' }))
    expect(screen.getByRole('dialog', { name: 'AddItemModal' })).toHaveTextContent('create:serie')

    // Tirar um filtro pelo X do chip.
    await userEvent.click(screen.getByRole('button', { name: 'Tirar o filtro Gabriel' }))
    expect(within(screen.getByRole('list', { name: 'Filtros ativos' })).getAllByRole('listitem')).toHaveLength(2)

    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(cardNames()).toHaveLength(13)
    expect(kicker()).toBe('13 coisas · 4 já feitas')
  })

  it('busca sem acento e sem maiúscula, compondo com os filtros; o destaque some', async () => {
    renderList()
    await loaded()
    expect(screen.getByRole('heading', { name: 'Em destaque' })).toBeInTheDocument()
    const search = screen.getByRole('searchbox', { name: 'Buscar na lista' })
    await userEvent.type(search, 'acaraje')
    expect(cardNames()).toEqual(['Acarajé da Dinha'])
    expect(screen.queryByRole('heading', { name: 'Em destaque' })).not.toBeInTheDocument()

    await userEvent.clear(search)
    await userEvent.type(search, 'SAO PAULO')
    expect(cardNames()).toEqual(['Mocotó', 'Parque Ibirapuera'])
    expect(kicker()).toBe('13 coisas · 4 já feitas · filtrando: “SAO PAULO”')

    await userEvent.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Já fizemos' }))
    expect(cardNames()).toEqual(['Parque Ibirapuera'])
  })

  it('⌘K e Ctrl+K focam a busca', async () => {
    renderList()
    await loaded()
    const search = screen.getByRole('searchbox', { name: 'Buscar na lista' })
    expect(search).not.toHaveFocus()
    await userEvent.keyboard('{Meta>}k{/Meta}')
    expect(search).toHaveFocus()
    search.blur()
    await userEvent.keyboard('{Control>}k{/Control}')
    expect(search).toHaveFocus()
  })

  it('ordem começa em list_default_sort e muda só na tela', async () => {
    const api = seededListApi({ settings: { listDefaultSort: 'az' } })
    renderList(api)
    await loaded()
    expect(screen.getByText('A–Z', { selector: '.ls-section-head span' })).toBeInTheDocument()
    expect(cardNames()[0]).toBe('Acarajé da Dinha')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Ordenar' }), 'category')
    expect(screen.getByText('Por categoria')).toBeInTheDocument()
    expect(cardNames()[0]).toBe('Japão')
    expect(screen.getByText('13 itens')).toBeInTheDocument()
  })
})

describe('R7 — o card', () => {
  it('feito: quem estava e desde quando; a fazer: quem adicionou e desde quando', async () => {
    renderList()
    await loaded()
    const card = (name: string) => screen.getByRole('article', { name })
    expect(card('Parque Vicentina Aranha')).toHaveTextContent('Lana · 2 sem')
    expect(card('Severance')).toHaveTextContent('Gabriel · 3 dias')
    expect(card('Casa Amarela Bistrô')).toHaveTextContent('Gabriel · 1 mês')
    expect(card('Casa Amarela Bistrô')).toHaveTextContent('Feito · 26 ago')
    expect(card('Mergulho em Noronha')).toHaveTextContent('os dois · 3 sem')
    expect(card('Past Lives')).toHaveTextContent('Lana · 2 meses')
    expect(card('Severance')).toHaveTextContent('Série· Apple TV+')
    expect(card('Japão')).toHaveTextContent('Tóquio, Kyoto e Osaka')
  })

  it('"há quanto tempo" do item a fazer usa a data LOCAL do created_at', async () => {
    vi.stubEnv('TZ', 'America/Sao_Paulo')
    // 23h de 22/09 em SJC = 02h de 23/09 em UTC: são 4 dias, não 3.
    const items = [listItem({ id: 'x', name: 'Tarde', category: 'filme', platform: 'MUBI', createdAt: '2026-09-23T02:00:00Z' })]
    renderList(seededListApi({ items }))
    await loaded()
    expect(screen.getByRole('article', { name: 'Tarde' })).toHaveTextContent('Gabriel · 4 dias')
  })

  it('foto assinada num lote só, com loading lazy; sem URL, o fundo da categoria', async () => {
    const { api } = renderList()
    await loaded()
    await waitFor(() => expect(screen.getByRole('article', { name: 'Mocotó' }).querySelector('img')).not.toBeNull())
    const img = screen.getByRole('article', { name: 'Mocotó' }).querySelector('img')!
    expect(img).toHaveAttribute('src', 'https://example.test/mocoto.webp')
    expect(img).toHaveAttribute('loading', 'lazy')
    expect(screen.getByRole('article', { name: 'Severance' }).querySelector('img')).toBeNull()
    expect(screen.getByRole('article', { name: 'Severance' }).querySelector('.ls-photo--empty')).not.toBeNull()
    expect(api.signedUrls).toHaveBeenCalledTimes(1)
    expect(api.signedUrls).toHaveBeenCalledWith(expect.arrayContaining(['couple-1/item/mocoto.webp']))
  })
})

describe('sobrepostos — quem abre o quê, e a releitura depois', () => {
  it('tocar o card abre o detalhe; Editar dele abre o modal em modo edit', async () => {
    renderList()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Mocotó' }))
    expect(screen.getByRole('dialog', { name: 'ItemSheet' })).toHaveTextContent('sheet:i-mocoto')
    await userEvent.click(screen.getByRole('button', { name: 'dublê: editar' }))
    expect(screen.queryByRole('dialog', { name: 'ItemSheet' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'AddItemModal' })).toHaveTextContent('edit:i-mocoto')
  })

  it('"Marcar como feito" do card só no item a fazer, e onDone fecha e relê', async () => {
    const { api } = renderList()
    await loaded()
    expect(within(screen.getByRole('article', { name: 'Past Lives' })).queryByRole('button', { name: 'Marcar como feito' })).toBeNull()
    await userEvent.click(within(screen.getByRole('article', { name: 'Severance' })).getByRole('button', { name: 'Marcar como feito' }))
    expect(screen.getByRole('dialog', { name: 'MarkDoneModal' })).toHaveTextContent('done:i-severance')
    await userEvent.click(screen.getByRole('button', { name: 'dublê: feito' }))
    expect(screen.queryByRole('dialog', { name: 'MarkDoneModal' })).not.toBeInTheDocument()
    await waitFor(() => expect(api.loadList).toHaveBeenCalledTimes(2))
  })

  it('onSaved e onDeleted também releem', async () => {
    const { api } = renderList()
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar' }))
    await userEvent.click(screen.getByRole('button', { name: 'dublê: salvou' }))
    await waitFor(() => expect(api.loadList).toHaveBeenCalledTimes(2))
    await userEvent.click(screen.getByRole('button', { name: 'Mocotó' }))
    await userEvent.click(screen.getByRole('button', { name: 'dublê: apagou' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(api.loadList).toHaveBeenCalledTimes(3))
  })

  it('Dar ênfase grava e relê', async () => {
    const api = seededListApi(
      {},
      { setFeatured: vi.fn<ListApi['setFeatured']>(async () => ({ status: 'ok', value: listItems()[2]! })) },
    )
    renderList(api)
    await loaded()
    await userEvent.click(within(screen.getByRole('article', { name: 'Severance' })).getByRole('button', { name: 'Dar ênfase' }))
    expect(api.setFeatured).toHaveBeenCalledWith('i-severance', true)
    await waitFor(() => expect(api.loadList).toHaveBeenCalledTimes(2))
  })
})

describe('A18 — releitura ao voltar à aba (ADR 0015)', () => {
  function showTab() {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  it('visibilitychange → visible relê e mostra o que mudou', async () => {
    const load = vi
      .fn<ListApi['loadList']>()
      .mockResolvedValueOnce({ status: 'ok', rows: listData() })
      .mockResolvedValueOnce({
        status: 'ok',
        rows: listData([...listItems(), listItem({ id: 'n', name: 'Item da Lana', category: 'filme', platform: 'Netflix', addedBy: 'u-lana', createdAt: '2026-09-26T12:00:00Z' })]),
      })
    renderList(seededListApi({}, { loadList: load }))
    await loaded()
    expect(cardNames()).not.toContain('Item da Lana')
    await act(async () => showTab())
    await waitFor(() => expect(cardNames()).toContain('Item da Lana'))
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('releitura com erro mantém os itens e mostra o aviso', async () => {
    const load = vi
      .fn<ListApi['loadList']>()
      .mockResolvedValueOnce({ status: 'ok', rows: listData() })
      .mockResolvedValueOnce({ status: 'error', cause: 'rede caiu' })
    renderList(seededListApi({}, { loadList: load }))
    await loaded()
    await act(async () => showTab())
    expect(await screen.findByText('Não deu pra atualizar. Você está vendo a última versão carregada.')).toBeInTheDocument()
    expect(cardNames()).toHaveLength(13)
    expect(screen.queryByText(/Não deu pra carregar a lista/)).not.toBeInTheDocument()
  })
})

describe('o dia é relido a cada leitura', () => {
  it('api.today muda entre a primeira leitura e a volta à aba → card e painel usam o dia novo', async () => {
    const today = vi.fn<ListApi['today']>().mockReturnValue('2026-09-26')
    const api = seededListApi({}, { today })
    renderList(api)
    await loaded()
    expect(screen.getByRole('article', { name: 'Severance' })).toHaveTextContent('Gabriel · 3 dias')
    const panel = screen.getByRole('complementary', { name: 'Painel da lista' })
    expect(panel.querySelector('.ls-panel-date')).toHaveTextContent('26 de setembro')

    today.mockReturnValue('2026-09-28')
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))

    await waitFor(() => expect(screen.getByRole('article', { name: 'Severance' })).toHaveTextContent('Gabriel · 5 dias'))
    expect(panel.querySelector('.ls-panel-date')).toHaveTextContent('28 de setembro')
  })
})

describe('R10 com categorias ocultas', () => {
  it('itens só em categorias ocultas → o começo da lista, com a dica e o link para as Configurações', async () => {
    const items = [
      listItem({ id: 'a', name: 'Aftersun', category: 'filme', platform: 'MUBI' }),
      listItem({ id: 'b', name: 'Severance', category: 'serie', platform: 'Apple TV+' }),
    ]
    renderList(seededListApi({ items, settings: { hiddenCategories: ['filme', 'serie'] } }))
    expect(await screen.findByText('A lista está vazia')).toBeInTheDocument()
    expect(screen.getByText(/Algumas categorias estão escondidas nas Configurações\./)).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Itens da lista' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Categorias' })).not.toBeInTheDocument()

    const link = screen.getByRole('link', { name: 'Ver nas Configurações' })
    expect(link).toHaveAttribute('href', '/configuracoes/lista')
    await userEvent.click(link)
    expect(window.location.pathname).toBe('/configuracoes/lista')
  })

  it('lista realmente vazia: sem a dica das ocultas', async () => {
    renderList(fakeListApi())
    expect(await screen.findByText('A lista está vazia')).toBeInTheDocument()
    expect(screen.queryByText(/Algumas categorias estão escondidas/)).not.toBeInTheDocument()
  })
})

describe('URLs assinadas: relê antes de vencerem', () => {
  it(`relê ${URL_REFRESH_MS / 60000} min depois da última leitura boa, reagenda, e para ao desmontar`, async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { api, unmount } = renderList()
    await loaded()
    await waitFor(() => expect(api.signedUrls).toHaveBeenCalledTimes(1))
    expect(URL_REFRESH_MS).toBeLessThan(3600 * 1000)

    await act(async () => vi.advanceTimersByTimeAsync(URL_REFRESH_MS - 1000))
    expect(api.loadList).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTimeAsync(1000))
    await waitFor(() => expect(api.signedUrls).toHaveBeenCalledTimes(2))
    expect(api.loadList).toHaveBeenCalledTimes(2)

    // Reagendado a partir da segunda leitura.
    await act(async () => vi.advanceTimersByTimeAsync(URL_REFRESH_MS))
    await waitFor(() => expect(api.loadList).toHaveBeenCalledTimes(3))

    unmount()
    await vi.advanceTimersByTimeAsync(URL_REFRESH_MS * 3)
    expect(api.loadList).toHaveBeenCalledTimes(3)
  })
})

/** A ordem padrão (Recentes): `created_at` decrescente. */
function byRecentOf(a: string, b: string): number {
  const created = new Map(listItems().map((i) => [i.name, i.createdAt]))
  return created.get(b)!.localeCompare(created.get(a)!)
}

// Fase 7, R3 — .agent/Tasks/fase-7-mapa.md: a Home pede um item e a Lista abre
// com ele na ficha; o pedido é consumido (voltar à Lista não reabre).
describe('Fase 7 R3 — listFocus abre a ficha do item pedido', () => {
  afterEach(() => clearListFocus())

  it('item existente: a ficha abre com os dados lidos e o pedido some', async () => {
    const id = listItems()[0].id
    requestListFocus(id)
    renderList()
    const sheet = await screen.findByRole('dialog', { name: 'ItemSheet' })
    expect(sheet).toHaveTextContent(`sheet:${id}`)
    expect(peekListFocus()).toBeNull()
  })

  it('id que não está na Lista: a tela abre sem ficha e o pedido some', async () => {
    requestListFocus('nao-existe')
    renderList()
    await loaded()
    expect(screen.queryByRole('dialog', { name: 'ItemSheet' })).toBeNull()
    expect(peekListFocus()).toBeNull()
  })

  it('sem pedido: nenhuma ficha', async () => {
    renderList()
    await loaded()
    expect(screen.queryByRole('dialog', { name: 'ItemSheet' })).toBeNull()
  })
})
