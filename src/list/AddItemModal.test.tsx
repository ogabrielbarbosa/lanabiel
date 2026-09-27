// Critério A14 — .agent/Tasks/fase-4-lista.md, seção 10 (R11–R15, R28, seção 7).
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
const JAPAO = candidate({
  label: 'Japão',
  city: null,
  state: null,
  country: 'Japão',
  countryCode: 'JP',
  lat: 36.2,
  lng: 138.25,
  detail: 'País · 36,20, 138,25',
})
const SAO_PAULO_CITY = candidate({ label: 'São Paulo', detail: 'São Paulo, Brasil · −23,55, −46,63', lat: -23.55, lng: -46.63 })

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
) {
  const onClose = props.onClose ?? vi.fn()
  const onSaved = props.onSaved ?? vi.fn()
  const modalProps = { ...props, onClose, onSaved } as AddItemModalProps
  render(
    <ListContext.Provider value={contextValue(api)}>
      <AddItemModal {...modalProps} />
    </ListContext.Provider>,
  )
  return { onClose, onSaved, dialog: screen.getByRole('dialog') }
}

const tile = (name: string) => screen.getByRole('button', { name })
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
// R11: os campos de cada categoria
// ---------------------------------------------------------------------------

describe('A14 — cada categoria mostra exatamente os campos de R11', () => {
  const table: [string, ListCategory, string, string[]][] = [
    ['Países', 'pais', '2 · Detalhes do país', ['Nome', 'Cidades que interessam', 'Link', 'Nota']],
    ['Cidades', 'cidade', '2 · Detalhes da cidade', ['Nome', 'País', 'Região', 'Local · busca de cidade', 'Link', 'Nota']],
    ['Restaurantes', 'restaurante', '2 · Detalhes do restaurante', ['Nome', 'Link', 'Local', 'Nota']],
    ['Parques', 'parque', '2 · Detalhes do parque', ['Nome', 'Link', 'Local', 'Nota']],
    ['Comidas', 'comida', '2 · Detalhes da comida', ['Nome', 'Onde comer · opcional', 'Local · cidade', 'Link', 'Nota']],
    ['Experiências', 'experiencia', '2 · Detalhes da experiência', ['Nome', 'Link', 'Local', 'Nota']],
    ['Filmes', 'filme', '2 · Detalhes do filme', ['Nome', 'Onde assistir', 'Link', 'Nota']],
    ['Séries', 'serie', '2 · Detalhes da série', ['Nome', 'Onde assistir', 'Temporadas', 'Link', 'Nota']],
  ]

  it.each(table)('%s', async (tileName, category, heading, fields) => {
    renderModal(fakeListApi())
    expect(screen.getByRole('heading', { name: 'Adicionar à lista' })).toBeInTheDocument()
    // Passo 1 aberto: os 8 chips, nenhum campo ainda.
    expect(within(screen.getByRole('group', { name: '1 · Categoria' })).getAllByRole('button')).toHaveLength(8)
    expect(document.querySelector('.ls-add-form')).toBeNull()

    await userEvent.click(tile(tileName))
    expect(tile(tileName)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('region', { name: heading })).toBeInTheDocument()
    expect(fieldLabels()).toEqual(fields)

    // A coluna da direita: Foto · Trocar foto, a prévia do pin (ou "Sem local") e Dar ênfase.
    expect(screen.getByText('Foto')).toBeInTheDocument()
    expect(screen.getByLabelText('Trocar foto')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Dar ênfase' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Aparece em destaque')).toBeInTheDocument()

    const media = category === 'filme' || category === 'serie'
    if (media) {
      expect(screen.getByText('Filmes e séries: sem local, com plataforma')).toBeInTheDocument()
      expect(screen.getByText('Sem local')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Filmes e séries não viram pin no globo — aparecem só na lista e nas sugestões para as noites separados.',
        ),
      ).toBeInTheDocument()
      expect(screen.queryByText('Vai virar um pin no globo')).toBeNull()
      expect(screen.queryByRole('combobox')).toBeNull()
    } else {
      expect(screen.getByText('Escolha a categoria primeiro — os campos se ajustam')).toBeInTheDocument()
      expect(screen.getByText('Vai virar um pin no globo')).toBeInTheDocument()
      expect(screen.queryByText('Sem local')).toBeNull()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    }
  })

  it('os textos auxiliares do frame', async () => {
    renderModal(fakeListApi())
    await userEvent.click(tile('Países'))
    expect(screen.getByText('Aparece como segunda linha do item na lista')).toBeInTheDocument()
    expect(
      screen.getByText('O pin fica no centro do país, não num endereço — as cidades acima não viram pins.'),
    ).toBeInTheDocument()

    await userEvent.click(tile('Cidades'))
    expect(screen.getByText('Aparece como segunda linha do item na lista')).toBeInTheDocument()
    expect(screen.getByLabelText('País')).toHaveAttribute('readonly')

    await userEvent.click(tile('Comidas'))
    expect(screen.getByText('Pode ficar vazio se for um prato, não um lugar')).toBeInTheDocument()

    await userEvent.click(tile('Experiências'))
    expect(screen.getByRole('combobox')).toHaveAttribute(
      'placeholder',
      'Busque cidade, região ou endereço — ex.: Capadócia',
    )
  })

  it('R12: Onde assistir tem as 6 plataformas e "Outra…", sem os números do frame', async () => {
    renderModal(fakeListApi(), { mode: 'create', initialCategory: 'filme' })
    const group = screen.getByRole('group', { name: 'Onde assistir' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Netflix',
      'Prime Video',
      'Max',
      'Disney+',
      'Apple TV+',
      'MUBI',
      'Outra…',
    ])
    expect(group).not.toHaveTextContent(/\d/)
    expect(screen.queryByLabelText('Outra plataforma')).toBeNull()
    await userEvent.click(within(group).getByRole('button', { name: 'Outra…' }))
    expect(screen.getByLabelText('Outra plataforma')).toHaveAttribute('maxLength', '30')
  })

  it('rodapé: "Adicionando como Gabriel", sem "recebe um aviso"', () => {
    const { dialog } = renderModal(fakeListApi(), { mode: 'create', initialCategory: 'restaurante' })
    expect(screen.getByText('Adicionando como Gabriel')).toBeInTheDocument()
    expect(dialog).not.toHaveTextContent('recebe um aviso')
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(saveButton()).toHaveTextContent('Adicionar à lista')
  })
})

// ---------------------------------------------------------------------------
// R13: a busca de lugar
// ---------------------------------------------------------------------------

describe('A14 — busca de lugar (R13)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  async function wait(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } })

  it('País busca com mode "country" e o viés da cidade-casa de quem busca', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ok([JAPAO]))
    renderModal(fakeListApi({ searchPlaces }), { mode: 'create', initialCategory: 'pais' })
    const nome = screen.getByRole('combobox', { name: 'Nome' })
    type(nome, 'Japão')
    await wait(350)
    expect(searchPlaces).toHaveBeenCalledTimes(1)
    expect(searchPlaces.mock.calls[0][0]).toBe('Japão')
    expect(searchPlaces.mock.calls[0][1]).toMatchObject({ mode: 'country', bias: { lat: SJC.lat, lng: SJC.lng } })

    fireEvent.click(screen.getByRole('option', { name: /Japão/ }))
    expect(nome).toHaveValue('Japão')
    expect(document.querySelector('.ls-add-map-label')).toHaveTextContent('Japão')
  })

  it('Restaurante busca com mode "place" + viés; cada resultado tem nome e detalhe, e o crédito do OSM', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ok([MOCOTO, MOCOTO_CAFE]))
    renderModal(fakeListApi({ searchPlaces }), { mode: 'create', initialCategory: 'restaurante' })
    const local = screen.getByRole('combobox', { name: 'Local' })
    expect(local).toHaveAttribute('aria-expanded', 'false')
    type(local, 'Mocotó')
    await wait(350)
    expect(searchPlaces.mock.calls[0][1]).toMatchObject({ mode: 'place', bias: { lat: SJC.lat, lng: SJC.lng } })
    expect(searchPlaces.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)

    expect(local).toHaveAttribute('aria-expanded', 'true')
    const listbox = screen.getByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual([
      'Mocotó RestauranteAv. Nossa Senhora do Loreto, 1100 · São Paulo, SP',
      'Mocotó CaféMercado de Pinheiros · São Paulo, SP',
      'Não achei — usar só a cidade',
    ])
    expect(screen.getByText('© OpenStreetMap')).toBeInTheDocument()

    // Setas + Enter escolhem.
    fireEvent.keyDown(local, { key: 'ArrowDown' })
    expect(local).toHaveAttribute('aria-activedescendant', options[0].id)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(local, { key: 'ArrowDown' })
    fireEvent.keyDown(local, { key: 'ArrowUp' })
    fireEvent.keyDown(local, { key: 'Enter' })
    expect(local).toHaveAttribute('aria-expanded', 'false')
    expect(local).toHaveValue('Mocotó Restaurante')
    const chosen = document.querySelector('.ls-add-chosen') as HTMLElement
    expect(chosen).toHaveTextContent('Mocotó Restaurante')
    expect(chosen).toHaveTextContent('Av. Nossa Senhora do Loreto, 1100 · São Paulo, SP')
    expect(within(chosen).getByRole('button', { name: 'Trocar' })).toBeInTheDocument()
    expect(document.querySelector('.ls-add-map-label')).toHaveTextContent('Mocotó Restaurante')
  })

  it('menos de 3 caracteres não busca; 350 ms sem digitar, uma busca só com o texto final', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ok([MOCOTO]))
    renderModal(fakeListApi({ searchPlaces }), { mode: 'create', initialCategory: 'restaurante' })
    const local = screen.getByRole('combobox', { name: 'Local' })

    type(local, 'Mo')
    await wait(2000)
    expect(searchPlaces).not.toHaveBeenCalled()

    type(local, 'Moc')
    await wait(200)
    type(local, 'Moco')
    await wait(200)
    type(local, 'Mocot')
    await wait(349)
    expect(searchPlaces).not.toHaveBeenCalled()
    await wait(1)
    expect(searchPlaces).toHaveBeenCalledTimes(1)
    expect(searchPlaces.mock.calls[0][0]).toBe('Mocot')
  })

  it('a resposta atrasada de uma consulta velha é descartada, e a anterior é abortada', async () => {
    const pending: { resolve: (r: PlaceSearchResult) => void; signal?: AbortSignal }[] = []
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(
      (_q, options) =>
        new Promise((resolve) => {
          pending.push({ resolve, signal: options.signal })
        }),
    )
    renderModal(fakeListApi({ searchPlaces }), { mode: 'create', initialCategory: 'restaurante' })
    const local = screen.getByRole('combobox', { name: 'Local' })

    type(local, 'Moc')
    await wait(350)
    type(local, 'Mocotó Café')
    await wait(350)
    expect(searchPlaces).toHaveBeenCalledTimes(2)
    expect(pending[0].signal?.aborted).toBe(true)
    expect(pending[1].signal?.aborted).toBe(false)

    await act(async () => pending[1].resolve(ok([MOCOTO_CAFE])))
    await act(async () => pending[0].resolve(ok([MOCOTO])))
    const labels = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)
    expect(labels[0]).toContain('Mocotó Café')
    expect(labels.join()).not.toContain('Mocotó Restaurante')
  })

  it('"Não achei — usar só a cidade" troca para mode "city" e libera Endereço, que vai para place.address', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async (_q, options) =>
      options.mode === 'city' ? ok([SAO_PAULO_CITY]) : ok([]),
    )
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    const { onSaved } = renderModal(fakeListApi({ searchPlaces, createItem }), {
      mode: 'create',
      initialCategory: 'restaurante',
    })
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Casa Amarela Bistrô' } })
    const local = screen.getByRole('combobox', { name: 'Local' })
    expect(screen.queryByLabelText('Endereço')).toBeNull()

    type(local, 'Casa Amarela Bistrô')
    await wait(350)
    expect(screen.getByText('Nada encontrado para “Casa Amarela Bistrô”.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: 'Não achei — usar só a cidade' }))

    const endereco = screen.getByLabelText('Endereço')
    expect(endereco).toHaveAttribute('maxLength', '160')

    type(local, 'São Paulo')
    await wait(350)
    expect(searchPlaces.mock.lastCall?.[1].mode).toBe('city')
    // Já na camada de cidade, não se oferece "Não achei" de novo.
    expect(screen.queryByRole('option', { name: 'Não achei — usar só a cidade' })).toBeNull()
    fireEvent.click(screen.getByRole('option', { name: /São Paulo/ }))
    type(endereco, 'Rua Tal, 12 · Vila Madalena')

    fireEvent.click(saveButton())
    await wait(0)
    expect(createItem).toHaveBeenCalledTimes(1)
    expect(draftOf(createItem).place).toEqual({
      address: 'Rua Tal, 12 · Vila Madalena',
      city: 'São Paulo',
      state: 'São Paulo',
      country: 'Brasil',
      countryCode: 'BR',
      lat: -23.55,
      lng: -46.63,
    })
    expect(onSaved).toHaveBeenCalled()
  })

  it('fallback do IBGE: avisa "Busca mundial indisponível — mostrando cidades do Brasil", sem o crédito do OSM', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ok([SAO_PAULO_CITY], true))
    renderModal(fakeListApi({ searchPlaces }), { mode: 'create', initialCategory: 'comida' })
    const local = screen.getByRole('combobox', { name: 'Local · cidade' })
    type(local, 'São Paulo')
    await wait(350)
    expect(searchPlaces.mock.calls[0][1].mode).toBe('city')
    expect(screen.getByText('Busca mundial indisponível — mostrando cidades do Brasil')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /São Paulo/ })).toBeInTheDocument()
    expect(screen.queryByText('© OpenStreetMap')).toBeNull()
  })

  it('a busca fora do ar: a mensagem, e salvar fica desabilitado para item geográfico sem lugar', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ({ status: 'error', cause: 'Photon respondeu 502' }))
    const createItem = vi.fn<ListApi['createItem']>()
    renderModal(fakeListApi({ searchPlaces, createItem }), { mode: 'create', initialCategory: 'restaurante' })
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Mocotó' } })
    expect(saveButton()).toBeEnabled()

    type(screen.getByRole('combobox', { name: 'Local' }), 'Mocotó')
    await wait(350)
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A busca de lugares está fora do ar — tente de novo em instantes',
    )
    expect(saveButton()).toBeDisabled()
    fireEvent.click(saveButton())
    expect(createItem).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Gravar: validação, normalização do link, falhas (R28), edição (R14), foto (R15)
// ---------------------------------------------------------------------------

describe('A14 — gravar', () => {
  it('filme: sem local, com plataforma; o link sem esquema vira https://', async () => {
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    const { onSaved } = renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'filme' })
    await userEvent.type(screen.getByLabelText('Nome'), 'Past Lives')
    await userEvent.click(screen.getByRole('button', { name: 'MUBI' }))
    await userEvent.type(screen.getByLabelText('Link'), 'imdb.com/title/tt13238346')
    await userEvent.click(screen.getByRole('switch', { name: 'Dar ênfase' }))
    await userEvent.click(saveButton())

    expect(createItem).toHaveBeenCalledTimes(1)
    expect(createItem.mock.calls[0][0]).toBe('couple-1')
    expect(draftOf(createItem)).toEqual({
      category: 'filme',
      name: 'Past Lives',
      note: null,
      link: 'https://imdb.com/title/tt13238346',
      featured: true,
      place: null,
      region: null,
      venue: null,
      highlights: [],
      platform: 'MUBI',
      seasons: null,
    })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'i-new', name: 'Past Lives' }))
  })

  it('série com "Outra…" e temporadas; país com cidades que interessam', async () => {
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'serie' })
    await userEvent.type(screen.getByLabelText('Nome'), 'The Bear')
    await userEvent.click(screen.getByRole('button', { name: 'Outra…' }))
    await userEvent.type(screen.getByLabelText('Outra plataforma'), 'Star+')
    await userEvent.type(screen.getByLabelText('Temporadas'), '4')
    await userEvent.click(saveButton())
    expect(draftOf(createItem)).toMatchObject({ platform: 'Star+', seasons: 4, place: null })
  })

  it('país: as cidades entram como chips removíveis e vão em highlights', async () => {
    const searchPlaces = vi.fn<ListApi['searchPlaces']>(async () => ok([JAPAO]))
    const createItem = vi.fn<ListApi['createItem']>(async (_c, draft) => ({ status: 'ok', value: createdFrom(draft) }))
    renderModal(fakeListApi({ searchPlaces, createItem }), { mode: 'create', initialCategory: 'pais' })
    await userEvent.type(screen.getByRole('combobox', { name: 'Nome' }), 'Japão')
    await userEvent.click(await screen.findByRole('option', { name: /Japão/ }))

    const nova = screen.getByLabelText('Adicionar cidade')
    await userEvent.type(nova, 'Tóquio{Enter}Kyoto{Enter}Osaka{Enter}')
    expect(screen.getByRole('button', { name: 'Remover Kyoto' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remover Kyoto' }))
    await userEvent.click(saveButton())
    expect(draftOf(createItem)).toMatchObject({
      name: 'Japão',
      highlights: ['Tóquio', 'Osaka'],
      place: { city: null, country: 'Japão', countryCode: 'JP', lat: 36.2, lng: 138.25 },
    })
  })

  it('a validação do domínio bloqueia: a mensagem junto do campo, o foco nele, nada gravado', async () => {
    const createItem = vi.fn<ListApi['createItem']>()
    renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'restaurante' })

    await userEvent.click(saveButton())
    const nome = screen.getByLabelText('Nome')
    expect(screen.getByText('Dê um nome.')).toBeInTheDocument()
    expect(nome).toHaveFocus()
    expect(nome).toHaveAttribute('aria-invalid', 'true')

    await userEvent.type(nome, 'Mocotó')
    await userEvent.click(saveButton())
    expect(screen.queryByText('Dê um nome.')).toBeNull()
    expect(screen.getByText('Escolha o local.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Local' })).toHaveFocus()
    expect(createItem).not.toHaveBeenCalled()
  })

  it('link com esquema que não é http(s) é recusado no cliente', async () => {
    const createItem = vi.fn<ListApi['createItem']>()
    renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'filme' })
    await userEvent.type(screen.getByLabelText('Nome'), 'Aftersun')
    await userEvent.click(screen.getByRole('button', { name: 'MUBI' }))
    await userEvent.type(screen.getByLabelText('Link'), 'javascript:alert(1)')
    await userEvent.click(saveButton())
    expect(screen.getByText('O link precisa começar com http:// ou https://.')).toBeInTheDocument()
    expect(screen.getByLabelText('Link')).toHaveFocus()
    expect(createItem).not.toHaveBeenCalled()
  })

  it('R28: desabilitado enquanto grava; a falha do banco mantém o que foi digitado e mostra a causa', async () => {
    let finish: (value: Awaited<ReturnType<ListApi['createItem']>>) => void = () => {}
    const createItem = vi.fn<ListApi['createItem']>(() => new Promise((resolve) => (finish = resolve)))
    const { onSaved } = renderModal(fakeListApi({ createItem }), { mode: 'create', initialCategory: 'filme' })
    await userEvent.type(screen.getByLabelText('Nome'), 'Aftersun')
    await userEvent.click(screen.getByRole('button', { name: 'MUBI' }))
    await userEvent.type(screen.getByLabelText('Nota'), 'Numa noite separados')
    await userEvent.click(saveButton())

    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled()
    expect(screen.getByLabelText('Nome')).toBeDisabled()

    await act(async () => finish({ status: 'error', cause: 'Failed to fetch' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to fetch')
    expect(screen.getByLabelText('Nome')).toHaveValue('Aftersun')
    expect(screen.getByLabelText('Nome')).toBeEnabled()
    expect(screen.getByLabelText('Nota')).toHaveValue('Numa noite separados')
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
    expect(screen.getByRole('alert')).toHaveTextContent('Sua sessão expirou — entre de novo.')
  })

  it('R14: editar abre preenchido, com a categoria travada, e chama updateItem', async () => {
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
    const updateItem = vi.fn<ListApi['updateItem']>(async (id, draft) => ({
      status: 'ok',
      value: { ...mocoto, ...draft, id },
    }))
    const createItem = vi.fn<ListApi['createItem']>()
    const { onSaved } = renderModal(fakeListApi({ updateItem, createItem }), { mode: 'edit', item: mocoto })

    expect(screen.getByRole('heading', { name: 'Editar' })).toBeInTheDocument()
    expect(tile('Restaurantes')).toHaveAttribute('aria-pressed', 'true')
    for (const other of ['Países', 'Cidades', 'Parques', 'Comidas', 'Filmes', 'Séries', 'Experiências']) {
      expect(tile(other)).toBeDisabled()
    }
    expect(screen.getByLabelText('Nome')).toHaveValue('Mocotó')
    expect(screen.getByLabelText('Link')).toHaveValue('https://instagram.com/mocotorestaurante')
    expect(screen.getByLabelText('Nota')).toHaveValue('Pedir o torresmo')
    expect(screen.getByRole('switch', { name: 'Dar ênfase' })).toHaveAttribute('aria-checked', 'true')
    expect(document.querySelector('.ls-add-chosen')).toHaveTextContent('Av. Nossa Senhora do Loreto, 1100 · São Paulo, SP')

    await userEvent.click(tile('Filmes'))
    expect(tile('Restaurantes')).toHaveAttribute('aria-pressed', 'true')

    await userEvent.clear(screen.getByLabelText('Nota'))
    await userEvent.type(screen.getByLabelText('Nota'), 'Num sábado')
    expect(saveButton()).toHaveTextContent('Salvar')
    await userEvent.click(saveButton())

    expect(createItem).not.toHaveBeenCalled()
    expect(updateItem).toHaveBeenCalledTimes(1)
    expect(updateItem.mock.calls[0][0]).toBe('i-mocoto')
    expect(draftOf(updateItem)).toMatchObject({ category: 'restaurante', note: 'Num sábado', place: mocoto.place })
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'i-mocoto', note: 'Num sábado' }))
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
