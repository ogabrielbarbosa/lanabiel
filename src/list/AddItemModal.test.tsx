// Critério A14 — .agent/Tasks/fase-4-lista.md, seção 10 (R11–R15, R28, seção 7),
// com o modal de cinco grupos de .agent/Research/lista-adicionar-simples.md.
// O modal se prova renderizado dentro do `ListContext`, com a `ListApi` falsa:
// cada resposta do banco e da busca de lugar é dirigida pelo teste.

import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlaceCandidate, PlaceSearchResult } from '../data/places'
import type { ItemDraft, ListCategory, ListItem } from '../domain/list'
import { SJC, MARAU } from '../settings/test/fixtures'
import type { ListApi } from './api'
import { AddItemModal } from './AddItemModal'
import type { AddItemModalProps } from './AddItemModal'
import { ListContext } from './context'
import type { ListContextValue, ListMember } from './context'
import { GABRIEL, LANA, fakeListApi, listItem } from './test/fixtures'

// --- fixtures locais --------------------------------------------------------

const gabriel: ListMember = {
  profileId: GABRIEL,
  name: 'Gabriel',
  color: '#7FD8C4',
  avatarUrl: null,
  homeCity: { id: SJC.id, name: SJC.name, lat: SJC.lat, lng: SJC.lng },
}
const lana: ListMember = {
  profileId: LANA,
  name: 'Lana',
  color: '#F4A3B4',
  avatarUrl: null,
  homeCity: { id: MARAU.id, name: MARAU.name, lat: MARAU.lat, lng: MARAU.lng },
}

function candidate(overrides: Partial<PlaceCandidate> & Pick<PlaceCandidate, 'label'>): PlaceCandidate {
  return {
    address: null,
    city: 'São Paulo',
    state: 'São Paulo',
    country: 'Brasil',
    countryCode: 'BR',
    lat: -23.49,
    lng: -46.58,
    detail: 'São Paulo, SP',
    ...overrides,
  }
}

const MOCOTO = candidate({
  label: 'Mocotó Restaurante',
  address: 'Av. Nossa Senhora do Loreto, 1100',
  detail: 'Av. Nossa Senhora do Loreto, 1100 · São Paulo, SP',
})
const MOCOTO_CAFE = candidate({ label: 'Mocotó Café', detail: 'Mercado de Pinheiros · São Paulo, SP', lat: -23.56 })
const SAO_PAULO_CITY = candidate({ label: 'São Paulo', detail: 'São Paulo, Brasil · −23,55, −46,63', lat: -23.55, lng: -46.63, kind: 'city' })
const VILACA = candidate({ label: 'Rua Vilaça 500', address: 'Rua Vilaça, 500', city: 'São José dos Campos', detail: 'Rua Vilaça, 500 · São José dos Campos, SP', kind: 'address' })
const IBIRAPUERA = candidate({ label: 'Parque Ibirapuera', detail: 'São Paulo, SP', kind: 'park' })

const ok = (rows: PlaceCandidate[], fallback = false): PlaceSearchResult => ({ status: 'ok', rows, fallback })

function contextValue(api: ListApi, overrides: Partial<ListContextValue> = {}): ListContextValue {
  return {
    api,
    coupleId: 'couple-1',
    me: gabriel,
    members: new Map([
      [GABRIEL, gabriel],
      [LANA, lana],
    ]),
    items: [],
    memories: [],
    photos: [],
    urls: new Map(),
    where: { kind: 'unknown' },
    searchFrom: { lat: SJC.lat, lng: SJC.lng },
    today: '2026-09-26',
    reload: vi.fn(async () => {}),
    ...overrides,
  }
}

type Extra = Partial<Pick<AddItemModalProps, 'onClose' | 'onSaved'>>

function renderModal(
  api: ListApi,
  props: ({ mode: 'create'; initialCategory?: ListCategory } | { mode: 'edit'; item: ListItem }) & Extra = {
    mode: 'create',
  },
  context: Partial<ListContextValue> = {},
) {
  const onClose = props.onClose ?? vi.fn()
  const onSaved = props.onSaved ?? vi.fn()
  const modalProps = { ...props, onClose, onSaved } as AddItemModalProps
  render(
    <ListContext.Provider value={contextValue(api, context)}>
      <AddItemModal {...modalProps} />
    </ListContext.Provider>,
  )
  return { onClose, onSaved, dialog: screen.getByRole('dialog') }
}

const tile = (name: string) => screen.getByRole('button', { name })
const nota = () => screen.getByLabelText(/^Nota/)
const saveButton = () => screen.getByRole('button', { name: /Adicionar à lista|Salvar/ })

function fieldLabels(): string[] {
  const form = document.querySelector('.ls-add-form') as HTMLElement
  return [...form.querySelectorAll('.ls-add-label')].map((l) => l.textContent ?? '')
}

function draftOf(mock: unknown, call = 0): ItemDraft {
  return (mock as { mock: { calls: unknown[][] } }).mock.calls[call].at(-1) as ItemDraft
}

/** Os mocks devolvem `ListItem` a partir do rascunho recebido. */
function createdFrom(draft: ItemDraft, id = 'i-new'): ListItem {
  return listItem({ ...draft, id })
}

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => 'blob:foto')
  URL.revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// Os cinco grupos
// ---------------------------------------------------------------------------

describe('cinco grupos, poucos campos', () => {
  it('o passo 1 tem os cinco grupos, e nenhum formulário antes de escolher', () => {
    renderModal(fakeListApi())
    const group = screen.getByRole('group', { name: 'O que é' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Países e cidades',
      'Restaurantes e parques',
      'Comidas',
      'Filmes e séries',
      'Experiências',
    ])
    expect(document.querySelector('.ls-add-form')).toBeNull()
  })

  it.each([
    ['Países e cidades', ['País', 'Nota · opcional']],
    ['Restaurantes e parques', ['Busca', 'Nota · opcional']],
    ['Comidas', ['O que comer', 'Onde', 'Nota · opcional']],
    ['Filmes e séries', ['Nome', 'Onde assistir', 'Nota · opcional']],
    ['Experiências', ['O que fazer', 'Onde', 'Nota · opcional']],
  ])('%s: só estes campos, e nenhum Link', async (group, labels) => {
    renderModal(fakeListApi())
    await userEvent.click(tile(group))
    expect(fieldLabels()).toEqual(labels)
    expect(screen.queryByLabelText('Link')).toBeNull()
  })

  it('"Adicionar série" do estado vazio abre Filmes e séries com Série marcada', () => {
    renderModal(fakeListApi(), { mode: 'create', initialCategory: 'serie' })
    expect(tile('Filmes e séries')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Série' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('rodapé: "Adicionando como Gabriel"', () => {
    renderModal(fakeListApi(), { mode: 'create', initialCategory: 'filme' })
    expect(screen.getByText('Adicionando como Gabriel')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Busca de lugar
// ---------------------------------------------------------------------------

describe('Restaurantes e parques: uma busca preenche tudo', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  async function wait(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } })

  it('busca com mode "place" a partir de onde a pessoa está; escolher preenche o nome', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ok([MOCOTO, MOCOTO_CAFE]))
    renderModal(fakeListApi({ searchPlaces }), { mode: 'create', initialCategory: 'restaurante' }, { searchFrom: { lat: MARAU.lat, lng: MARAU.lng } })
    const busca = screen.getByRole('combobox', { name: 'Busca' })
    type(busca, 'Mocotó')
    await wait(350)
    expect(searchPlaces).toHaveBeenCalledTimes(1)
    expect(searchPlaces.mock.calls[0][1]).toMatchObject({ mode: 'place', bias: { lat: MARAU.lat, lng: MARAU.lng } })
    const options = within(screen.getByRole('listbox')).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Mocotó RestauranteAv. Nossa Senhora do Loreto, 1100 · São Paulo, SP',
      'Mocotó CaféMercado de Pinheiros · São Paulo, SP',
      'Não achei. Usar só a cidade',
    ])
    fireEvent.click(options[0])
    expect(screen.getByLabelText('Nome')).toHaveValue('Mocotó Restaurante')
    expect(document.querySelector('.ls-add-chosen')).toHaveTextContent('Av. Nossa Senhora do Loreto, 1100 · São Paulo, SP')
  })

  it('menos de 3 caracteres não busca; 350 ms sem digitar, uma busca só com o texto final', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ok([]))
    renderModal(fakeListApi({ searchPlaces }), { mode: 'create', initialCategory: 'restaurante' })
    const busca = screen.getByRole('combobox', { name: 'Busca' })
    type(busca, 'Mo')
    await wait(500)
    expect(searchPlaces).not.toHaveBeenCalled()
    type(busca, 'Moc')
    await wait(200)
    type(busca, 'Moco')
    await wait(350)
    expect(searchPlaces).toHaveBeenCalledTimes(1)
    expect(searchPlaces.mock.calls[0][0]).toBe('Moco')
  })

  it('endereço com número: o nome não vira "Rua Vilaça 500", fica para a pessoa escrever', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ok([VILACA]))
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    renderModal(fakeListApi({ searchPlaces, createItem }), { mode: 'create', initialCategory: 'restaurante' })
    type(screen.getByRole('combobox', { name: 'Busca' }), 'Rua Vilaça 500')
    await wait(350)
    fireEvent.click(screen.getByRole('option', { name: /Rua Vilaça 500/ }))
    const nome = screen.getByLabelText('Nome')
    expect(nome).toHaveValue('')
    await userEvent.click(saveButton())
    expect(screen.getByText('Dê um nome.')).toBeInTheDocument()
    expect(nome).toHaveFocus()
    await userEvent.type(nome, 'Casa Amarela Bistrô')
    await userEvent.click(saveButton())
    expect(draftOf(createItem)).toMatchObject({
      category: 'restaurante',
      name: 'Casa Amarela Bistrô',
      link: null,
      place: { address: 'Rua Vilaça, 500', city: 'São José dos Campos', countryCode: 'BR' },
    })
  })

  it('parque do OSM marca Parque sozinho e grava como parque', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ok([IBIRAPUERA]))
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    renderModal(fakeListApi({ searchPlaces, createItem }))
    await userEvent.click(tile('Restaurantes e parques'))
    expect(screen.getByRole('button', { name: 'Restaurante' })).toHaveAttribute('aria-pressed', 'true')
    type(screen.getByRole('combobox', { name: 'Busca' }), 'Ibirapuera')
    await wait(350)
    fireEvent.click(screen.getByRole('option', { name: /Parque Ibirapuera/ }))
    expect(screen.getByRole('button', { name: 'Parque' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(saveButton())
    expect(draftOf(createItem)).toMatchObject({ category: 'parque', name: 'Parque Ibirapuera' })
  })

  it('sem escolher resultado, salvar aponta a busca, não o nome', async () => {
    const createItem = vi.fn<ListApi['createItem']>()
    renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'restaurante' })
    await userEvent.click(saveButton())
    expect(screen.getByText('Busque e escolha um resultado.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Busca' })).toHaveFocus()
    expect(createItem).not.toHaveBeenCalled()
  })

  it('"Não achei. Usar só a cidade": o texto vira o nome, a busca vira de cidade e o endereço vai para place.address', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async (_q, o) => ok(o.mode === 'city' ? [SAO_PAULO_CITY] : [MOCOTO]))
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    renderModal(fakeListApi({ searchPlaces, createItem }), { mode: 'create', initialCategory: 'restaurante' })
    type(screen.getByRole('combobox', { name: 'Busca' }), 'Bar do Zé')
    await wait(350)
    fireEvent.click(screen.getByRole('option', { name: 'Não achei. Usar só a cidade' }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Bar do Zé')
    type(screen.getByRole('combobox', { name: 'Busca' }), 'São Paulo')
    await wait(350)
    expect(searchPlaces.mock.calls.at(-1)![1].mode).toBe('city')
    fireEvent.click(screen.getByRole('option', { name: /São Paulo/ }))
    await userEvent.type(screen.getByLabelText('Endereço · opcional'), 'Rua Augusta, 10')
    await userEvent.click(saveButton())
    expect(draftOf(createItem)).toMatchObject({ name: 'Bar do Zé', place: { city: 'São Paulo', address: 'Rua Augusta, 10' } })
  })

  it('a busca fora do ar: a mensagem, e salvar fica desabilitado sem lugar', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ({ status: 'error', cause: 'Photon 503' }))
    renderModal(fakeListApi({ searchPlaces }), { mode: 'create', initialCategory: 'restaurante' })
    type(screen.getByRole('combobox', { name: 'Busca' }), 'Mocotó')
    await wait(350)
    expect(screen.getByText('A busca de lugares está fora do ar. Tente de novo daqui a pouco.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })
})

describe('Países e cidades: a lista da Home, sem digitar o nome', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  async function wait(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  const CAPE_TOWN = { id: 'geo:3369157', name: 'Cidade do Cabo', stateCode: null, countryCode: 'ZA', region: 'Western Cape', lat: -33.93, lng: 18.42 }
  const JOBURG = { id: 'geo:993800', name: 'Joanesburgo', stateCode: null, countryCode: 'ZA', region: 'Gauteng', lat: -26.2, lng: 28.04 }

  it('só o país: vira `pais`, com o nome em português e o centro do país, sem rede', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>()
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    renderModal(fakeListApi({ searchPlaces, createItem }), { mode: 'create', initialCategory: 'pais' })
    await userEvent.type(screen.getByRole('combobox', { name: 'País' }), 'japa')
    await userEvent.click(screen.getByRole('option', { name: 'Japão' }))
    await userEvent.click(saveButton())
    expect(searchPlaces).not.toHaveBeenCalled()
    expect(draftOf(createItem)).toMatchObject({
      category: 'pais',
      name: 'Japão',
      place: { city: null, country: 'Japão', countryCode: 'JP', lat: 36, lng: 138 },
    })
  })

  it('África do Sul lista as cidades do país, e escolher uma grava `cidade`', async () => {
    const countryCities = vi.fn<ListApi['countryCities']>(async () => ({ status: 'ok', rows: [JOBURG, CAPE_TOWN] }))
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    renderModal(fakeListApi({ countryCities, createItem }))
    await userEvent.click(tile('Países e cidades'))
    await userEvent.type(screen.getByRole('combobox', { name: 'País' }), 'África do')
    await userEvent.click(screen.getByRole('option', { name: 'África do Sul' }))
    expect(countryCities).toHaveBeenCalledWith('ZA')
    const cidade = screen.getByRole('combobox', { name: 'Cidade · opcional' })
    await userEvent.click(cidade)
    expect(within(screen.getAllByRole('listbox').at(-1)!).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'JoanesburgoGauteng',
      'Cidade do CaboWestern Cape',
    ])
    await userEvent.type(cidade, 'cabo')
    await userEvent.click(screen.getByRole('option', { name: /Cidade do Cabo/ }))
    await userEvent.click(saveButton())
    expect(draftOf(createItem)).toMatchObject({
      category: 'cidade',
      name: 'Cidade do Cabo',
      place: { city: 'Cidade do Cabo', state: 'Western Cape', country: 'África do Sul', countryCode: 'ZA', lat: -33.93 },
    })
  })

  it('no Brasil, a cidade vem do IBGE pela busca', async () => {
    const searchCities = vi.fn<ListApi['searchCities']>(async () => ({
      status: 'ok',
      rows: [{ id: 'c-gramado', name: 'Gramado', stateCode: 'RS', lat: -29.37, lng: -50.87 }],
    }))
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    renderModal(fakeListApi({ searchCities, createItem }), { mode: 'create', initialCategory: 'cidade' })
    await userEvent.type(screen.getByRole('combobox', { name: 'País' }), 'Brasil')
    await userEvent.click(screen.getByRole('option', { name: 'Brasil' }))
    await userEvent.type(screen.getByRole('combobox', { name: 'Cidade · opcional' }), 'Gram')
    await wait(350)
    expect(searchCities).toHaveBeenCalledWith('Gram')
    await userEvent.click(screen.getByRole('option', { name: /Gramado/ }))
    await userEvent.click(saveButton())
    expect(draftOf(createItem)).toMatchObject({ category: 'cidade', name: 'Gramado', place: { city: 'Gramado', state: 'RS', countryCode: 'BR' } })
  })

  it('sem país, salvar aponta o país', async () => {
    renderModal(fakeListApi(), { mode: 'create', initialCategory: 'pais' })
    await userEvent.click(saveButton())
    expect(screen.getByText('Escolha o país.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'País' })).toHaveFocus()
  })
})

// ---------------------------------------------------------------------------
// Gravar
// ---------------------------------------------------------------------------

describe('A14 — gravar', () => {
  it('filme: sem local, com plataforma, sem link', async () => {
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    const { onSaved } = renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'filme' })
    await userEvent.type(screen.getByLabelText('Nome'), 'Past Lives')
    await userEvent.click(screen.getByRole('button', { name: 'MUBI' }))
    await userEvent.click(saveButton())
    expect(createItem).toHaveBeenCalledWith('couple-1', expect.anything())
    expect(draftOf(createItem)).toEqual({
      category: 'filme',
      name: 'Past Lives',
      note: null,
      link: null,
      featured: false,
      place: null,
      region: null,
      venue: null,
      highlights: [],
      platform: 'MUBI',
      seasons: null,
    })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'i-new', name: 'Past Lives' }))
  })

  it('série com "Outra…"', async () => {
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    renderModal(fakeListApi({ createItem }))
    await userEvent.click(tile('Filmes e séries'))
    await userEvent.click(screen.getByRole('button', { name: 'Série' }))
    await userEvent.type(screen.getByLabelText('Nome'), 'Sintonia')
    await userEvent.click(screen.getByRole('button', { name: 'Outra…' }))
    await userEvent.type(screen.getByLabelText('Outra plataforma'), 'Globoplay')
    await userEvent.click(saveButton())
    expect(draftOf(createItem)).toMatchObject({ category: 'serie', platform: 'Globoplay', seasons: null })
  })

  it('sem plataforma: a mensagem junto do campo, o foco nele, nada gravado', async () => {
    const createItem = vi.fn<ListApi['createItem']>()
    renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'filme' })
    await userEvent.type(screen.getByLabelText('Nome'), 'Aftersun')
    await userEvent.click(saveButton())
    expect(screen.getByText('Diga onde assistir.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Netflix' })).toHaveFocus()
    expect(createItem).not.toHaveBeenCalled()
  })

  it('R28: desabilitado enquanto grava; a falha do banco mantém o que foi digitado e mostra a causa', async () => {
    let finish: (value: Awaited<ReturnType<ListApi['createItem']>>) => void = () => {}
    const createItem = vi.fn<ListApi['createItem']>(() => new Promise((resolve) => (finish = resolve)))
    const { onSaved } = renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'filme' })
    await userEvent.type(screen.getByLabelText('Nome'), 'Aftersun')
    await userEvent.click(screen.getByRole('button', { name: 'MUBI' }))
    await userEvent.type(nota(), 'Numa noite separados')
    await userEvent.click(saveButton())

    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    expect(screen.getByLabelText('Nome')).toBeDisabled()

    await act(async () => finish({ status: 'error', cause: 'Failed to fetch' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch')
    expect(screen.getByLabelText('Nome')).toHaveValue('Aftersun')
    expect(screen.getByLabelText('Nome')).toBeEnabled()
    expect(nota()).toHaveValue('Numa noite separados')
    expect(screen.getByRole('button', { name: 'MUBI' })).toHaveAttribute('aria-pressed', 'true')
    expect(saveButton()).toBeEnabled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('invalid do banco (divergência) mostra a causa com o nome da constraint', async () => {
    const createItem = vi.fn<ListApi['createItem']>(async () => ({
      status: 'invalid',
      constraint: 'list_items_format',
      cause: 'new row violates check constraint "list_items_format"',
    }))
    renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'filme' })
    await userEvent.type(screen.getByLabelText('Nome'), 'Aftersun')
    await userEvent.click(screen.getByRole('button', { name: 'MUBI' }))
    await userEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('list_items_format')
  })

  it('sessão expirada: a causa de failureMessage', async () => {
    const createItem = vi.fn<ListApi['createItem']>(async () => ({ status: 'unauthenticated' }))
    renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'filme' })
    await userEvent.type(screen.getByLabelText('Nome'), 'Aftersun')
    await userEvent.click(screen.getByRole('button', { name: 'MUBI' }))
    await userEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent('Sua sessão expirou. Entre de novo.')
  })

  it('R14: editar abre preenchido, sem o passo 1, e mantém o que o formulário não mostra mais', async () => {
    const mocoto = listItem({
      id: 'i-mocoto',
      name: 'Mocotó',
      category: 'restaurante',
      link: 'https://instagram.com/mocotorestaurante',
      note: 'Pedir o torresmo',
      featured: true,
      place: {
        address: 'Av. Nossa Senhora do Loreto, 1100',
        city: 'São Paulo',
        state: 'São Paulo',
        country: 'Brasil',
        countryCode: 'BR',
        lat: -23.4896,
        lng: -46.5794,
      },
    })
    const updateItem = vi.fn<ListApi['updateItem']>(async (id, draft) => ({ status: 'ok', value: { ...mocoto, ...draft, id } }))
    const createItem = vi.fn<ListApi['createItem']>()
    const { onSaved } = renderModal(fakeListApi({ updateItem, createItem }), { mode: 'edit', item: mocoto })

    expect(screen.getByRole('heading', { name: 'Editar' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'O que é' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Parque' })).toBeDisabled()
    expect(screen.getByLabelText('Nome')).toHaveValue('Mocotó')
    expect(nota()).toHaveValue('Pedir o torresmo')
    expect(screen.getByRole('switch', { name: 'Dar ênfase' })).toHaveAttribute('aria-checked', 'true')
    expect(document.querySelector('.ls-add-chosen')).toHaveTextContent('Av. Nossa Senhora do Loreto, 1100 · São Paulo, SP')

    await userEvent.clear(nota())
    await userEvent.type(nota(), 'Num sábado')
    expect(saveButton()).toHaveTextContent('Salvar')
    await userEvent.click(saveButton())

    expect(createItem).not.toHaveBeenCalled()
    expect(updateItem.mock.calls[0][0]).toBe('i-mocoto')
    expect(draftOf(updateItem)).toMatchObject({
      category: 'restaurante',
      note: 'Num sábado',
      place: mocoto.place,
      link: 'https://instagram.com/mocotorestaurante',
    })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'i-mocoto', note: 'Num sábado' }))
  })

  it('editar um país mantém as cidades que interessam e não oferece cidade', async () => {
    const japao = listItem({
      id: 'i-japao',
      name: 'Japão',
      category: 'pais',
      highlights: ['Tóquio', 'Kyoto'],
      place: { address: null, city: null, state: null, country: 'Japão', countryCode: 'JP', lat: 36.2, lng: 138.25 },
    })
    const updateItem = vi.fn<ListApi['updateItem']>(async (id, draft) => ({ status: 'ok', value: { ...japao, ...draft, id } }))
    renderModal(fakeListApi({ updateItem }), { mode: 'edit', item: japao })
    expect(screen.getByRole('combobox', { name: 'País' })).toHaveValue('Japão')
    expect(screen.queryByRole('combobox', { name: /Cidade/ })).toBeNull()
    await userEvent.click(saveButton())
    expect(draftOf(updateItem)).toMatchObject({ category: 'pais', name: 'Japão', highlights: ['Tóquio', 'Kyoto'], place: japao.place })
  })

  it('R15: criar com foto sobe a foto depois do item e devolve o item com a foto', async () => {
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    const replaceItemPhoto = vi.fn<ListApi['replaceItemPhoto']>(async (_c, item) => ({
      status: 'ok',
      value: { ...(item as ListItem), photoPath: 'couple-1/item/x.webp' },
    }))
    const { onSaved } = renderModal(fakeListApi({ createItem, replaceItemPhoto }), {
      mode: 'create',
      initialCategory: 'filme',
    })
    await userEvent.type(screen.getByLabelText('Nome'), 'Aftersun')
    await userEvent.click(screen.getByRole('button', { name: 'MUBI' }))
    const file = new File(['x'], 'foto.jpg', { type: 'image/jpeg' })
    await userEvent.upload(screen.getByLabelText('Trocar foto'), file)
    expect(document.querySelector('.ls-add-photo img')).toHaveAttribute('src', 'blob:foto')

    await userEvent.click(saveButton())
    expect(replaceItemPhoto).toHaveBeenCalledWith('couple-1', expect.objectContaining({ id: 'i-new' }), file)
    expect(createItem.mock.invocationCallOrder[0]).toBeLessThan(replaceItemPhoto.mock.invocationCallOrder[0])
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ photoPath: 'couple-1/item/x.webp' }))
  })

  it('R15: a foto que falha depois de criar o item → aviso, e onSaved com o item criado', async () => {
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    const replaceItemPhoto = vi.fn<ListApi['replaceItemPhoto']>(async () => ({
      status: 'error',
      cause: 'Payload too large',
    }))
    const { onSaved } = renderModal(fakeListApi({ createItem, replaceItemPhoto }), {
      mode: 'create',
      initialCategory: 'filme',
    })
    await userEvent.type(screen.getByLabelText('Nome'), 'Aftersun')
    await userEvent.click(screen.getByRole('button', { name: 'MUBI' }))
    await userEvent.upload(screen.getByLabelText('Trocar foto'), new File(['x'], 'foto.jpg', { type: 'image/jpeg' }))
    await userEvent.click(saveButton())

    expect(screen.getByRole('alert')).toHaveTextContent('O item foi adicionado, mas a foto não subiu: Payload too large')
    // Salvar de novo criaria um segundo item: os campos travam.
    expect(screen.getByLabelText('Nome')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Adicionar à lista' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Entendi' }))
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'i-new', photoPath: null }))
    expect(createItem).toHaveBeenCalledTimes(1)
  })

  it('R15: photo_rejected vira a mensagem de formato; arquivo que não é imagem nem entra', async () => {
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    const replaceItemPhoto = vi.fn<ListApi['replaceItemPhoto']>(async () => ({
      status: 'photo_rejected',
      index: 0,
      reason: 'not_image',
    }))
    const { onSaved } = renderModal(fakeListApi({ createItem, replaceItemPhoto }), {
      mode: 'create',
      initialCategory: 'filme',
    })
    const input = screen.getByLabelText('Trocar foto')
    await userEvent.upload(input, new File(['x'], 'nota.txt', { type: 'text/plain' }), { applyAccept: false })
    expect(screen.getByText('Esse arquivo não é uma imagem.')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Nome'), 'Aftersun')
    await userEvent.click(screen.getByRole('button', { name: 'MUBI' }))
    await userEvent.upload(input, new File(['x'], 'foto.heic', { type: 'image/heic' }))
    await userEvent.click(saveButton())
    expect(screen.getByRole('alert')).toHaveTextContent(
      'O item foi adicionado, mas a foto não subiu: Esse arquivo não é uma imagem.',
    )
    // Fechar pelo × nesse estado também devolve o item: ele existe.
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('a prévia local é revogada ao desmontar', async () => {
    const { unmount } = render(
      <ListContext.Provider value={contextValue(fakeListApi())}>
        <AddItemModal mode="create" initialCategory="filme" onClose={vi.fn()} onSaved={vi.fn()} />
      </ListContext.Provider>,
    )
    await userEvent.upload(screen.getByLabelText('Trocar foto'), new File(['x'], 'foto.jpg', { type: 'image/jpeg' }))
    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:foto')
  })

  it('Cancelar chama onClose sem gravar', async () => {
    const createItem = vi.fn<ListApi['createItem']>()
    const { onClose } = renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'filme' })
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onClose).toHaveBeenCalled()
    expect(createItem).not.toHaveBeenCalled()
  })
})
