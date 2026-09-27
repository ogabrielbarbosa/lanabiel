// Critério A16 — .agent/Tasks/fase-4-lista.md, seção 10 (R16–R19, I5, I11,
// seção 7 "Apagar item — cascata" e "Adicionar fotos no detalhe").

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ListItem, ListMemory, ListPhoto } from '../domain/list'
import type { ListApi } from './api'
import { ItemSheet } from './ItemSheet'
import type { CalendarApi } from '../calendar/api'
import { LIST_REFS, SEPTEMBER_EVENTS, fakeCalendarApi, seededCalendarApi } from '../calendar/test/fixtures'
import { GABRIEL, LANA, fakeListApi, listItem, listItems } from './test/fixtures'
import { TOGETHER_SJC, listValue, renderInList } from './test/renderInList'

// Um feito pelos dois, geográfico em SJC, com link, nota e 5 fotos.
const DONE: ListItem = listItem({
  id: 'i-bistro',
  name: 'Casa Amarela Bistrô',
  category: 'restaurante',
  link: 'https://instagram.com/casaamarelabistro',
  note: 'Pedir o risoto de cogumelos',
  addedBy: GABRIEL,
  createdAt: '2026-03-12T15:00:00Z',
  place: {
    address: 'Rua Paraibuna, 318',
    city: 'São José dos Campos',
    state: 'SP',
    country: 'Brasil',
    countryCode: 'BR',
    lat: -23.2,
    lng: -45.9,
  },
  status: 'done',
  doneOn: '2026-07-18',
  doneWith: 'both',
  rating: 4,
})

const WANT: ListItem = listItem({
  id: 'i-want',
  name: 'Parque da Cidade',
  category: 'parque',
  place: { address: null, city: 'São José dos Campos', state: 'SP', country: 'Brasil', countryCode: 'BR', lat: -23.19, lng: -45.87 },
})

function photo(n: number, addedBy: string = GABRIEL): ListPhoto {
  return { id: `p${n}`, itemId: DONE.id, path: `couple-1/memory/p${n}.webp`, addedBy, createdAt: `2026-07-18T1${n}:00:00Z` }
}

const PHOTOS: ListPhoto[] = [photo(1), photo(2, LANA), photo(3), photo(4, LANA), photo(5)]
const URLS = new Map(PHOTOS.map((p) => [p.path, `https://example.test/${p.id}.webp`]))

function memory(profileId: string, body: string): ListMemory {
  return { itemId: DONE.id, profileId, body, createdAt: '2026-07-19T10:00:00Z', updatedAt: '2026-07-19T10:00:00Z' }
}

const LANA_MEMORY = memory(LANA, 'Primeiro jantar depois de 40 dias longe.')
const MY_MEMORY = memory(GABRIEL, 'O risoto era tudo isso mesmo.')

function setup(
  options: {
    item?: ListItem
    memories?: ListMemory[]
    photos?: ListPhoto[]
    api?: Partial<ListApi>
    where?: ReturnType<typeof listValue>['where']
  } = {},
) {
  const item = options.item ?? DONE
  const api = fakeListApi(options.api)
  const value = listValue({
    api,
    items: [...listItems(), item],
    memories: options.memories ?? [],
    photos: options.photos ?? [],
    urls: URLS,
    where: options.where ?? { kind: 'unknown' },
  })
  const props = { onClose: vi.fn(), onEdit: vi.fn(), onMarkDone: vi.fn(), onDeleted: vi.fn() }
  const view = renderInList(<ItemSheet itemId={item.id} {...props} />, value)
  return { api, value, props, view, user: userEvent.setup(), item }
}

describe('A16 — topo e informações do item (R16, R18)', () => {
  it('feito: "Feito em", categoria, nome, endereço e cidade; sem distância fora de "juntos" (I11)', () => {
    setup()
    const sheet = screen.getByRole('dialog', { name: 'Casa Amarela Bistrô' })
    expect(sheet).toHaveTextContent('Feito em 18 jul 2026')
    expect(sheet).toHaveTextContent('Restaurante')
    expect(sheet).toHaveTextContent('Rua Paraibuna, 318')
    expect(sheet).toHaveTextContent('São José dos Campos, SP')
    expect(sheet).not.toHaveTextContent(/km|menos de 100 m/)
  })

  it('juntos: a distância aparece, medida da cidade de hoje', () => {
    setup({ where: TOGETHER_SJC })
    expect(screen.getByRole('dialog')).toHaveTextContent(/São José dos Campos, SP · \d+,\d km/)
  })

  it('separados também não mostram distância (nunca da cidade-casa)', () => {
    setup({ where: { kind: 'apart' } })
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/ km/)
  })

  it('mídia: plataforma e temporadas', () => {
    setup({ item: listItems().find((i) => i.id === 'i-severance') })
    const sheet = screen.getByRole('dialog', { name: 'Severance' })
    expect(sheet).toHaveTextContent('Apple TV+')
    expect(sheet).toHaveTextContent('2 temporadas')
  })

  it('link em nova aba com rel, nota, e "Adicionado · nome · data local"', () => {
    setup()
    const link = screen.getByRole('link', { name: 'instagram.com/casaamarelabistro' })
    expect(link).toHaveAttribute('href', 'https://instagram.com/casaamarelabistro')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText('Pedir o risoto de cogumelos')).toBeInTheDocument()
    expect(screen.getByText('Adicionado · Gabriel · 12 mar 2026')).toBeInTheDocument()
  })

  it('"Agendar de novo" e "Ver no globo" não existem', () => {
    setup({ where: TOGETHER_SJC })
    expect(screen.queryByText(/Agendar de novo/)).toBeNull()
    expect(screen.queryByText(/Ver no globo/)).toBeNull()
  })

  it('rodapé: a fazer → Marcar como feito (primário); feito → selo Feito; Editar nos dois', async () => {
    const want = setup({ item: WANT })
    await want.user.click(screen.getByRole('button', { name: 'Marcar como feito' }))
    expect(want.props.onMarkDone).toHaveBeenCalledWith(WANT)
    await want.user.click(screen.getByRole('button', { name: 'Editar' }))
    expect(want.props.onEdit).toHaveBeenCalledWith(WANT)
    expect(screen.queryByRole('group', { name: 'Nota de vocês' })).toBeNull()
    want.view.unmount()

    setup()
    expect(screen.queryByRole('button', { name: 'Marcar como feito' })).toBeNull()
    expect(screen.getByText('Feito', { selector: '.ls-sheet-done' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
  })

  it('item que sumiu na releitura: "Este item não existe mais" com Fechar', async () => {
    const { user, props, value, view } = setup()
    view.rerenderWith({ ...value, items: listItems() })
    expect(screen.getByText('Este item não existe mais')).toBeInTheDocument()
    // O "Fechar" do corpo (o X do cabeçalho também se chama Fechar).
    await user.click(screen.getByText('Fechar', { selector: 'button.ls-btn' }))
    expect(props.onClose).toHaveBeenCalled()
  })
})

describe('A16 — corações gravam no gesto (R16, R28)', () => {
  it('ok: grava a nota tocada e só então mostra; releitura depois', async () => {
    let resolve!: (v: Awaited<ReturnType<ListApi['setRating']>>) => void
    const setRating = vi.fn<ListApi['setRating']>(() => new Promise((r) => (resolve = r)))
    const { user, value } = setup({ api: { setRating } })
    const hearts = screen.getByRole('group', { name: 'Nota de vocês' })
    expect(within(hearts).getByRole('button', { name: '4 de 5' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(within(hearts).getByRole('button', { name: '2 de 5' }))
    expect(setRating).toHaveBeenCalledWith(DONE.id, 2)
    // Ainda gravando: o valor mostrado é o anterior, e os corações travam.
    expect(within(hearts).getByRole('button', { name: '4 de 5' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(hearts).getByRole('button', { name: '1 de 5' })).toBeDisabled()

    resolve({ status: 'ok', value: { ...DONE, rating: 2 } })
    await waitFor(() =>
      expect(within(hearts).getByRole('button', { name: '2 de 5' })).toHaveAttribute('aria-pressed', 'true'),
    )
    expect(value.reload).toHaveBeenCalled()
  })

  it('falha: volta ao valor anterior e mostra a causa', async () => {
    const setRating = vi.fn<ListApi['setRating']>(async () => ({ status: 'error', cause: 'rede fora' }))
    const { user } = setup({ api: { setRating } })
    const hearts = screen.getByRole('group', { name: 'Nota de vocês' })
    await user.click(within(hearts).getByRole('button', { name: '5 de 5' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('rede fora')
    expect(within(hearts).getByRole('button', { name: '4 de 5' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(hearts).getByRole('button', { name: '5 de 5' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('tocar a nota atual limpa (null)', async () => {
    const setRating = vi.fn<ListApi['setRating']>(async () => ({ status: 'ok', value: { ...DONE, rating: null } }))
    const { user } = setup({ api: { setRating } })
    await user.click(screen.getByRole('button', { name: '4 de 5' }))
    expect(setRating).toHaveBeenCalledWith(DONE.id, null)
    await waitFor(() => expect(screen.getByRole('button', { name: '1 de 5' })).toHaveAttribute('aria-pressed', 'false'))
    expect(screen.getByRole('button', { name: '4 de 5' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('A16 — A nossa memória (R17, I5)', () => {
  it('só no item feito', () => {
    setup({ item: WANT })
    expect(screen.queryByRole('region', { name: 'A nossa memória' })).toBeNull()
  })

  it('a da outra pessoa só se lê; a própria é editável no lugar', async () => {
    const saveMemory = vi.fn<ListApi['saveMemory']>(async () => ({ status: 'ok', value: MY_MEMORY }))
    const { user, value } = setup({ memories: [MY_MEMORY, LANA_MEMORY], api: { saveMemory } })
    const section = screen.getByRole('region', { name: 'A nossa memória' })
    expect(section).toHaveTextContent('Sáb, 18 jul 2026')

    const lana = within(section).getByRole('article', { name: 'Memória de Lana' })
    expect(lana).toHaveTextContent('Primeiro jantar depois de 40 dias longe.')
    expect(within(lana).queryByRole('button')).toBeNull()
    expect(within(section).queryByText('Escrever a minha')).toBeNull()

    const mine = within(section).getByRole('article', { name: 'Memória de Gabriel' })
    await user.click(within(mine).getByRole('button', { name: 'Editar a minha memória' }))
    const box = within(section).getByRole('textbox', { name: 'Gabriel' })
    expect(box).toHaveValue('O risoto era tudo isso mesmo.')
    expect(box).toHaveAttribute('maxLength', '500')
    await user.clear(box)
    await user.type(box, 'Voltaria amanhã')
    expect(within(section).getByText('15/500')).toBeInTheDocument()
    await user.click(within(section).getByRole('button', { name: 'Salvar' }))
    expect(saveMemory).toHaveBeenCalledWith(DONE.id, 'couple-1', 'Voltaria amanhã')
    await waitFor(() => expect(value.reload).toHaveBeenCalled())
    expect(within(section).queryByRole('textbox')).toBeNull()
  })

  it('"Escrever a minha" só para quem não escreveu; a outra pessoa sem memória não aparece', () => {
    setup({ memories: [] })
    const section = screen.getByRole('region', { name: 'A nossa memória' })
    expect(within(section).getByRole('button', { name: 'Escrever a minha' })).toBeInTheDocument()
    expect(within(section).queryByRole('article', { name: 'Memória de Lana' })).toBeNull()
    expect(within(section).queryByText('Lana')).toBeNull()
  })

  it('salvar vazia apaga a própria memória', async () => {
    const deleteMemory = vi.fn<ListApi['deleteMemory']>(async () => ({ status: 'ok', value: null }))
    const { user } = setup({ memories: [MY_MEMORY], api: { deleteMemory } })
    await user.click(screen.getByRole('button', { name: 'Editar a minha memória' }))
    await user.clear(screen.getByRole('textbox', { name: 'Gabriel' }))
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(deleteMemory).toHaveBeenCalledWith(DONE.id)
  })

  it('falha ao salvar: continua editando com o texto e a causa', async () => {
    const saveMemory = vi.fn<ListApi['saveMemory']>(async () => ({ status: 'error', cause: 'rede fora' }))
    const { user } = setup({ api: { saveMemory } })
    await user.click(screen.getByRole('button', { name: 'Escrever a minha' }))
    await user.type(screen.getByRole('textbox', { name: 'Gabriel' }), 'Foi lindo')
    await user.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('rede fora')
    expect(screen.getByRole('textbox', { name: 'Gabriel' })).toHaveValue('Foi lindo')
  })
})

describe('A16 — fotos do feito (R17, seção 7)', () => {
  it('3 miniaturas e "+{n} fotos", que abre a galeria com anterior/próxima e Esc', async () => {
    const { user, props } = setup({ photos: PHOTOS })
    const section = screen.getByRole('region', { name: 'A nossa memória' })
    expect(within(section).getAllByRole('button', { name: /^(Abrir foto \d|\+\d+ fotos)$/ })).toHaveLength(3)
    await user.click(within(section).getByRole('button', { name: '+2 fotos' }))

    const gallery = screen.getByRole('dialog', { name: 'Fotos' })
    expect(within(gallery).getByRole('img')).toHaveAttribute('src', 'https://example.test/p3.webp')
    await user.click(within(gallery).getByRole('button', { name: 'Próxima foto' }))
    expect(within(gallery).getByRole('img')).toHaveAttribute('src', 'https://example.test/p4.webp')
    await user.click(within(gallery).getByRole('button', { name: 'Foto anterior' }))
    await user.click(within(gallery).getByRole('button', { name: 'Foto anterior' }))
    expect(within(gallery).getByRole('img')).toHaveAttribute('src', 'https://example.test/p2.webp')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Fotos' })).toBeNull()
    // O Esc fechou só a galeria, não o detalhe.
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('remover só aparece em foto de quem subiu, com confirmação', async () => {
    const removePhoto = vi.fn<ListApi['removePhoto']>(async () => ({ status: 'ok', value: null }))
    const { user, value } = setup({ photos: PHOTOS, api: { removePhoto } })
    await user.click(screen.getByRole('button', { name: 'Abrir foto 2' }))
    const gallery = screen.getByRole('dialog', { name: 'Fotos' })
    // p2 é da Lana.
    expect(within(gallery).queryByRole('button', { name: 'Remover foto' })).toBeNull()
    await user.click(within(gallery).getByRole('button', { name: 'Foto anterior' }))
    await user.click(within(gallery).getByRole('button', { name: 'Remover foto' }))
    expect(removePhoto).not.toHaveBeenCalled()
    expect(within(gallery).getByText('Remover esta foto?')).toBeInTheDocument()
    await user.click(within(gallery).getByRole('button', { name: 'Sim, remover' }))
    expect(removePhoto).toHaveBeenCalledWith(PHOTOS[0])
    await waitFor(() => expect(value.reload).toHaveBeenCalled())
  })

  it('Adicionar fotos: uma de cada vez; desabilitado com 10', async () => {
    const addPhoto = vi.fn<ListApi['addPhoto']>(async () => ({ status: 'ok', value: photo(9) }))
    const { user, value, view } = setup({ photos: PHOTOS, api: { addPhoto } })
    const files = [new File(['a'], 'a.jpg', { type: 'image/jpeg' }), new File(['b'], 'b.jpg', { type: 'image/jpeg' })]
    await user.upload(screen.getByLabelText('Escolher fotos'), files)
    await waitFor(() => expect(value.reload).toHaveBeenCalled())
    expect(addPhoto.mock.calls.map((c) => c[2].name)).toEqual(['a.jpg', 'b.jpg'])
    expect(addPhoto).toHaveBeenCalledWith('couple-1', DONE.id, files[0])
    view.unmount()

    const ten = Array.from({ length: 10 }, (_, i) => photo(i))
    setup({ photos: ten })
    expect(screen.getByRole('button', { name: 'Adicionar fotos' })).toBeDisabled()
    expect(screen.getByText('10 de 10')).toBeInTheDocument()
  })

  it('photo_limit (a outra pessoa encheu no meio): a mensagem e releitura', async () => {
    const addPhoto = vi.fn<ListApi['addPhoto']>(async () => ({ status: 'photo_limit' }))
    const { user, value } = setup({ photos: PHOTOS, api: { addPhoto } })
    await user.upload(screen.getByLabelText('Escolher fotos'), [
      new File(['a'], 'a.jpg', { type: 'image/jpeg' }),
      new File(['b'], 'b.jpg', { type: 'image/jpeg' }),
    ])
    expect(await screen.findByRole('alert')).toHaveTextContent('Esse item já tem 10 fotos')
    expect(addPhoto).toHaveBeenCalledTimes(1)
    expect(value.reload).toHaveBeenCalled()
  })
})

describe('A16 — Apagar (R19, seção 7)', () => {
  it('feito: confirmação com memória e fotos; chama deleteItem com as fotos DO item; ok → onDeleted', async () => {
    const deleteItem = vi.fn<ListApi['deleteItem']>(async () => ({ status: 'ok' }))
    const other: ListPhoto = { ...photo(7), itemId: 'i-outro' }
    const { user, props } = setup({ photos: [...PHOTOS, other], api: { deleteItem } })
    await user.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(deleteItem).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Apagar Casa Amarela Bistrô? A memória e as fotos vão junto.')
    await user.click(screen.getByRole('button', { name: 'Sim, apagar' }))
    expect(deleteItem).toHaveBeenCalledTimes(1)
    const [item, photos] = deleteItem.mock.calls[0]
    expect(item.id).toBe(DONE.id)
    expect(photos.map((p) => p.path)).toEqual(PHOTOS.map((p) => p.path))
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalled())
  })

  it('a fazer: "Apagar {nome} da lista?"; Cancelar não apaga', async () => {
    const { user, api } = setup({ item: WANT })
    await user.click(screen.getByRole('button', { name: 'Apagar' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Apagar Parque da Cidade da lista?')
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(api.deleteItem).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('files_deleted_row_failed: a mensagem das fotos, e o detalhe fica aberto', async () => {
    const deleteItem = vi.fn<ListApi['deleteItem']>(async () => ({ status: 'files_deleted_row_failed', cause: 'x' }))
    const { user, props } = setup({ photos: PHOTOS, api: { deleteItem } })
    await user.click(screen.getByRole('button', { name: 'Apagar' }))
    await user.click(screen.getByRole('button', { name: 'Sim, apagar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'As fotos de Casa Amarela Bistrô foram apagadas, mas o item não. Tente de novo.',
    )
    expect(props.onDeleted).not.toHaveBeenCalled()
  })

  it('not_found (a outra pessoa já apagou) → onDeleted, sem erro', async () => {
    const deleteItem = vi.fn<ListApi['deleteItem']>(async () => ({ status: 'not_found' }))
    const { user, props } = setup({ api: { deleteItem } })
    await user.click(screen.getByRole('button', { name: 'Apagar' }))
    await user.click(screen.getByRole('button', { name: 'Sim, apagar' }))
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('A22 — Agendar (Fase 5, R23)', () => {
  /** O Calendário com os itens desta tela no vínculo, e `createEvent` que responde `ok`. */
  function calendarWith(item: ListItem, overrides: Partial<CalendarApi> = {}): CalendarApi {
    return seededCalendarApi(
      {},
      {
        loadCalendar: vi.fn<CalendarApi['loadCalendar']>(async () => ({
          status: 'ok',
          rows: { events: SEPTEMBER_EVENTS, listItems: [...LIST_REFS, { id: item.id, name: item.name, category: item.category }] },
        })),
        createEvent: vi.fn<CalendarApi['createEvent']>(async () => ({ status: 'ok', value: { id: 'e-new' } })),
        ...overrides,
      },
    )
  }

  it('a fazer e feito: Agendar abre o Novo evento do tipo Date, com o título e o vínculo do item', async () => {
    for (const item of [WANT, DONE]) {
      const calendar = calendarWith(item)
      const { user, view } = setup({ item, api: { calendar } })
      await user.click(screen.getByRole('button', { name: 'Agendar' }))
      const modal = await screen.findByRole('dialog', { name: 'Novo evento' })
      expect(within(modal).getByRole('button', { name: 'Date' })).toHaveAttribute('aria-pressed', 'true')
      expect(within(modal).getByLabelText('Título')).toHaveValue(item.name)
      expect(within(modal).getByText(item.name, { selector: '.cal-mf-chosen' })).toBeInTheDocument()
      // O modal entra no lugar do detalhe, não por cima (um Esc não fecha os dois).
      expect(screen.queryByRole('dialog', { name: item.name })).toBeNull()
      view.unmount()
    }
  })

  it('salvar: createEvent com o vínculo, fecha o modal e mostra "Agendado para {d mmm}" no detalhe', async () => {
    const calendar = calendarWith(WANT)
    const { user, props } = setup({ item: WANT, api: { calendar } })
    await user.click(screen.getByRole('button', { name: 'Agendar' }))
    await screen.findByRole('dialog', { name: 'Novo evento' })
    await user.click(screen.getByRole('button', { name: 'Salvar evento' }))
    expect(calendar.createEvent).toHaveBeenCalledWith(
      'couple-1',
      expect.objectContaining({ kind: 'date', title: 'Parque da Cidade', listItemId: 'i-want', startsOn: '2026-09-25' }),
      false,
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo evento' })).toBeNull())
    const sheet = screen.getByRole('dialog', { name: 'Parque da Cidade' })
    expect(within(sheet).getByRole('status')).toHaveTextContent('Agendado para 25 set')
    // A pessoa continua na Lista, com o detalhe aberto.
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('fechar o modal volta ao detalhe, sem aviso', async () => {
    const { user } = setup({ item: WANT, api: { calendar: calendarWith(WANT) } })
    await user.click(screen.getByRole('button', { name: 'Agendar' }))
    const modal = await screen.findByRole('dialog', { name: 'Novo evento' })
    await user.click(within(modal).getByRole('button', { name: 'Fechar' }))
    expect(await screen.findByRole('dialog', { name: 'Parque da Cidade' })).toBeInTheDocument()
    expect(screen.queryByText(/Agendado para/)).toBeNull()
  })

  it('leitura do Calendário que falha: a causa no detalhe, e modal nenhum', async () => {
    const calendar = fakeCalendarApi({
      loadCalendar: vi.fn<CalendarApi['loadCalendar']>(async () => ({ status: 'error', cause: 'projeto pausado' })),
    })
    const { user } = setup({ item: WANT, api: { calendar } })
    await user.click(screen.getByRole('button', { name: 'Agendar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não deu pra abrir o agendamento: projeto pausado')
    expect(screen.queryByRole('dialog', { name: 'Novo evento' })).toBeNull()
  })
})
