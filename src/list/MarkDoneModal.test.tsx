// Critério A15 — .agent/Tasks/fase-4-lista.md, seção 10 (R20, R28, I3, I7,
// seção 7 "Marcar como feito — cascata"). A ordem upload → RPC e a limpeza
// das fotos subidas estão em src/data/list.test.ts; aqui, o que a tela faz
// com cada resposta de `markDone`.

import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ListApi } from './api'
import type { ListPhoto } from '../domain/list'
import { MarkDoneModal } from './MarkDoneModal'
import { LANA, fakeListApi, listItems } from './test/fixtures'
import { MEMBER_LANA, itemById, listValue, renderInList } from './test/renderInList'

const MOCOTO = itemById('i-mocoto')

function images(n: number, prefix = 'f'): File[] {
  return Array.from({ length: n }, (_, i) => new File([String(i)], `${prefix}${i + 1}.jpg`, { type: 'image/jpeg' }))
}

function setup(api: Partial<ListApi> = {}, extra: { photos?: ListPhoto[]; me?: typeof MEMBER_LANA } = {}) {
  const fake = fakeListApi(api)
  const value = listValue({ api: fake, items: listItems(), photos: extra.photos ?? [], ...(extra.me ? { me: extra.me } : {}) })
  const props = { onClose: vi.fn(), onDone: vi.fn() }
  renderInList(<MarkDoneModal item={MOCOTO} {...props} />, value)
  return { api: fake, props, user: userEvent.setup() }
}

const submit = () => screen.getByRole('button', { name: 'Marcar como feito' })

describe('A15 — o formulário (R20)', () => {
  it('subtítulo "{nome} · {Categoria} · {cidade}", data de hoje, Os dois, e a legenda da Home (Fase 7 R23)', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Marcar como feito' })
    expect(dialog).toHaveTextContent('Mocotó · Restaurante · São Paulo')
    const date = screen.getByLabelText('Quando')
    expect(date).toHaveValue('2026-09-26')
    expect(date).toHaveAttribute('max', '2026-09-26')
    const who = screen.getByRole('group', { name: 'Quem estava' })
    expect(within(who).getByRole('button', { name: 'Os dois' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(who).getByRole('button', { name: 'Gabriel' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(who).getByRole('button', { name: 'Lana' })).toHaveAttribute('aria-pressed', 'false')
    expect(dialog).toHaveTextContent('Vira a “Última memória” da Home')
    expect(dialog).toHaveTextContent('Gabriel escrevendo · Lana pode completar')
    expect(dialog).toHaveTextContent('0 de 10')
  })

  it('data futura é bloqueada', async () => {
    const { user, api } = setup()
    fireEvent.change(screen.getByLabelText('Quando'), { target: { value: '2026-09-27' } })
    expect(screen.getByRole('alert')).toHaveTextContent('A data não pode ser no futuro.')
    expect(submit()).toBeDisabled()
    await user.click(submit())
    expect(api.markDone).not.toHaveBeenCalled()
  })

  it('o contador de fotos para em 10, e Adicionar desabilita', async () => {
    const { user } = setup()
    await user.upload(screen.getByLabelText('Escolher fotos'), images(7))
    expect(screen.getByText('7 de 10')).toBeInTheDocument()
    await user.upload(screen.getByLabelText('Escolher fotos'), images(6, 'g'))
    expect(screen.getByText('10 de 10')).toBeInTheDocument()
    expect(screen.getByText(/Cabem 10 fotos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeDisabled()
    // Tirar uma antes de enviar libera o lugar.
    await user.click(screen.getByRole('button', { name: 'Tirar a foto 1' }))
    expect(screen.getByText('9 de 10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeEnabled()
  })

  it('conta as fotos que o item já tem', () => {
    const existing: ListPhoto[] = Array.from({ length: 10 }, (_, i) => ({
      id: `p${i}`, itemId: MOCOTO.id, path: `couple-1/memory/p${i}.webp`, addedBy: LANA, createdAt: '2026-09-20T10:00:00Z',
    }))
    setup({}, { photos: existing })
    expect(screen.getByText('10 de 10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Adicionar' })).toBeDisabled()
  })

  it('a memória para em 500, com o contador', async () => {
    const { user } = setup()
    const box = screen.getByLabelText('Memória')
    expect(box).toHaveAttribute('maxLength', '500')
    fireEvent.change(box, { target: { value: 'x'.repeat(520) } })
    expect(box).toHaveValue('x'.repeat(500))
    expect(screen.getByText('500/500')).toBeInTheDocument()
    await user.clear(box)
    await user.type(box, 'Fila')
    expect(screen.getByText('4/500')).toBeInTheDocument()
  })

  it('a nota é opcional, com o rótulo "{n} de 5 · {rótulo}"; tocar de novo limpa', async () => {
    const { user } = setup()
    await user.click(screen.getByRole('button', { name: '4 de 5' }))
    expect(screen.getByText('4 de 5 · Amamos')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '4 de 5' }))
    expect(screen.queryByText('4 de 5 · Amamos')).toBeNull()
  })
})

describe('A15 — gravar (seção 7)', () => {
  it('chama markDone com o input certo e, no ok, onDone', async () => {
    const markDone = vi.fn<ListApi['markDone']>(async () => ({ status: 'ok', photoPaths: [] }))
    const { user, props } = setup({ markDone })
    fireEvent.change(screen.getByLabelText('Quando'), { target: { value: '2026-09-19' } })
    await user.click(screen.getByRole('button', { name: 'Lana' }))
    const files = images(2)
    await user.upload(screen.getByLabelText('Escolher fotos'), files)
    await user.type(screen.getByLabelText('Memória'), 'O torresmo é absurdo')
    await user.click(screen.getByRole('button', { name: '5 de 5' }))
    await user.click(submit())

    expect(markDone).toHaveBeenCalledTimes(1)
    const [coupleId, input] = markDone.mock.calls[0]
    expect(coupleId).toBe('couple-1')
    expect(input).toEqual({
      item: MOCOTO,
      doneOn: '2026-09-19',
      doneWith: 'solo',
      soloBy: LANA,
      rating: 5,
      memory: 'O torresmo é absurdo',
      files,
    })
    await waitFor(() => expect(props.onDone).toHaveBeenCalled())
  })

  it('Os dois, sem nota nem memória: both, soloBy null, rating null', async () => {
    const markDone = vi.fn<ListApi['markDone']>(async () => ({ status: 'ok', photoPaths: [] }))
    const { user } = setup({ markDone })
    await user.click(submit())
    expect(markDone.mock.calls[0][1]).toMatchObject({
      doneOn: '2026-09-26', doneWith: 'both', soloBy: null, rating: null, memory: '', files: [],
    })
  })

  it('enquanto grava, tudo desabilitado', async () => {
    let resolve!: (v: Awaited<ReturnType<ListApi['markDone']>>) => void
    const markDone = vi.fn<ListApi['markDone']>(() => new Promise((r) => (resolve = r)))
    const { user, props } = setup({ markDone })
    await user.click(submit())
    expect(screen.getByRole('button', { name: 'Gravando…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
    expect(screen.getByLabelText('Quando')).toBeDisabled()
    expect(screen.getByLabelText('Memória')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Os dois' })).toBeDisabled()
    resolve({ status: 'ok', photoPaths: [] })
    await waitFor(() => expect(props.onDone).toHaveBeenCalled())
  })

  it('already_done: avisa com o nome da outra pessoa e fecha via onDone', async () => {
    const markDone = vi.fn<ListApi['markDone']>(async () => ({ status: 'already_done' }))
    const { user, props } = setup({ markDone })
    await user.click(submit())
    expect(await screen.findByText('Lana já marcou este item como feito')).toBeInTheDocument()
    expect(props.onDone).not.toHaveBeenCalled()
    await user.click(screen.getByText('Fechar', { selector: 'button.ls-btn' }))
    expect(props.onDone).toHaveBeenCalledTimes(1)
    expect(props.onClose).not.toHaveBeenCalled()
  })

  it('already_done visto pela Lana diz o nome do Gabriel', async () => {
    const markDone = vi.fn<ListApi['markDone']>(async () => ({ status: 'already_done' }))
    const { user } = setup({ markDone }, { me: MEMBER_LANA })
    await user.click(submit())
    expect(await screen.findByText('Gabriel já marcou este item como feito')).toBeInTheDocument()
  })

  it('upload_failed: diz qual foto e mantém tudo preenchido', async () => {
    const markDone = vi.fn<ListApi['markDone']>(async () => ({ status: 'upload_failed', index: 1, cause: 'timeout' }))
    const { user, props } = setup({ markDone })
    await user.upload(screen.getByLabelText('Escolher fotos'), images(3))
    await user.type(screen.getByLabelText('Memória'), 'Valeu cada minuto')
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent('A foto 2 não subiu (timeout). Nada foi gravado')
    expect(screen.getByLabelText('Memória')).toHaveValue('Valeu cada minuto')
    expect(screen.getByText('3 de 10')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tirar a foto 2' }).closest('.ls-done-photo')).toHaveClass('ls-done-photo--bad')
    expect(props.onDone).not.toHaveBeenCalled()
    expect(submit()).toBeEnabled()
  })

  it('photo_rejected: aponta a foto recusada', async () => {
    const markDone = vi.fn<ListApi['markDone']>(async () => ({ status: 'photo_rejected', index: 0, reason: 'not_image' }))
    const { user } = setup({ markDone })
    await user.upload(screen.getByLabelText('Escolher fotos'), images(2))
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent('A foto 1 não é uma imagem')
  })

  it('photo_limit: "Esse item já tem 10 fotos"', async () => {
    const markDone = vi.fn<ListApi['markDone']>(async () => ({ status: 'photo_limit' }))
    const { user, props } = setup({ markDone })
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent('Esse item já tem 10 fotos')
    expect(props.onDone).not.toHaveBeenCalled()
  })

  it('Cancelar fecha sem gravar', async () => {
    const { user, api, props } = setup()
    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(props.onClose).toHaveBeenCalled()
    expect(api.markDone).not.toHaveBeenCalled()
  })
})
