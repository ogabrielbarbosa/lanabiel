// A16 — .agent/Tasks/fase-6-viagens.md, seção 10: a Galeria em tela cheia
// (`pUXaX`, R22) — ← → circular, F favorita, Esc fecha e devolve o foco,
// _Definir como capa_, a legenda editável, _Apagar foto_ — e o mosaico de 9
// com "+{resto}" do detalhe (R18). ADR 0005.

import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { okWrite, seededTripsApi } from '../test/fakeApi'
import { TRIP_ILHABELA, TRIP_ILHABELA_ID, photo, signedUrlOf } from '../test/fixtures'
import { renderInTrips, tripsValue } from '../test/renderInTrips'
import { TripDetail } from './TripDetail'

// Ordem do R22 (taken_on, nulos no fim, depois created_at): 01, 09, 02, 10, 03, …, 12.
const ORDER = ['p-ilh-01', 'p-ilh-09', 'p-ilh-02', 'p-ilh-10', 'p-ilh-03', 'p-ilh-11', 'p-ilh-04', 'p-ilh-05', 'p-ilh-06', 'p-ilh-07', 'p-ilh-08', 'p-ilh-12']
const pathOf = (id: string) => TRIP_ILHABELA.photos.find((p) => p.id === id)!.path

async function openFull(value = tripsValue()) {
  renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />, value)
  const opener = within(screen.getByRole('region', { name: 'Galeria · 12 fotos' })).getByRole('button', { name: 'Abrir a galeria em tela cheia' })
  await userEvent.click(opener)
  return { dialog: screen.getByRole('dialog', { name: 'Ilhabela, SP' }), opener, value }
}

const shownPhoto = (dialog: HTMLElement) => dialog.querySelector('.td-full-photo img')?.getAttribute('src')

describe('R18 — o mosaico', () => {
  it('as 9 primeiras na ordem do R22, a última com "+{resto}"; tocar abre naquela', async () => {
    const { container } = renderInTrips(<TripDetail id={TRIP_ILHABELA_ID} />)
    const gallery = within(screen.getByRole('region', { name: 'Galeria · 12 fotos' }))
    expect(gallery.getAllByRole('button', { name: /^(Abrir foto|Ver mais)/ })).toHaveLength(9)
    expect(gallery.getByRole('button', { name: 'Ver mais 3 fotos' })).toHaveTextContent('+3')
    const srcs = [...container.querySelectorAll('.td-mosaic-col')].flatMap((col, c) =>
      [...col.querySelectorAll('img')].map((img, r) => ({ i: r * 3 + c, src: img.getAttribute('src') })),
    )
    expect(srcs.sort((a, b) => a.i - b.i).map((s) => s.src)).toEqual(ORDER.slice(0, 9).map((id) => signedUrlOf(pathOf(id))))

    await userEvent.click(gallery.getByRole('button', { name: 'Abrir foto 5 de 12' }))
    expect(within(screen.getByRole('dialog')).getByText('5 / 12')).toBeInTheDocument()
  })
})

describe('A16 — tela cheia', () => {
  it('título, datas e contagem; ← → circular', async () => {
    const { dialog } = await openFull()
    const d = within(dialog)
    expect(d.getByText('12–19 jul 2026 · 12 fotos')).toBeInTheDocument()
    expect(d.getByText('1 / 12')).toBeInTheDocument()
    expect(shownPhoto(dialog)).toBe(signedUrlOf(pathOf(ORDER[0])))

    await userEvent.keyboard('{ArrowRight}')
    expect(d.getByText('2 / 12')).toBeInTheDocument()
    expect(shownPhoto(dialog)).toBe(signedUrlOf(pathOf(ORDER[1])))
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(d.getByText('12 / 12')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}')
    expect(d.getByText('1 / 12')).toBeInTheDocument()
    await userEvent.click(d.getByRole('button', { name: 'Anterior' }))
    expect(d.getByText('12 / 12')).toBeInTheDocument()
    await userEvent.click(d.getByRole('button', { name: 'Próxima' }))
    expect(d.getByText('1 / 12')).toBeInTheDocument()
  })

  it('a legenda: "{legenda ou destino}" e "{data} · foto {do/da} · Dia {k}"', async () => {
    const { dialog } = await openFull()
    const d = within(dialog)
    expect(d.getByRole('button', { name: /Editar a legenda/ })).toHaveTextContent('Ilhabela, SP')
    expect(d.getByText('Dom, 12 jul · foto do Gabriel · Dia 1')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}')
    expect(d.getByRole('button', { name: /Editar a legenda/ })).toHaveTextContent('Pôr do sol no Bonete')
    expect(d.getByText('Ter, 14 jul · foto do Gabriel · Dia 3')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    // A última: sem data — só "foto da Lana".
    expect(d.getByText('foto da Lana')).toBeInTheDocument()
  })

  it('F alterna o favorito da foto atual e relê', async () => {
    const api = seededTripsApi({}, { setFavorite: vi.fn(async () => okWrite(TRIP_ILHABELA.photos[0])) })
    const { dialog, value } = await openFull(tripsValue({ api }))
    expect(within(dialog).getByRole('button', { name: 'Favoritar' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.keyboard('f')
    expect(api.setFavorite).toHaveBeenCalledWith('p-ilh-01', true)
    expect(value.reload).toHaveBeenCalled()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(within(dialog).getByRole('button', { name: 'Favoritar' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.keyboard('F')
    expect(api.setFavorite).toHaveBeenLastCalledWith('p-ilh-02', false)
  })

  it('_Definir como capa_ grava cover_photo_id; na capa atual vira "Capa da viagem"', async () => {
    const api = seededTripsApi({}, { updateTrip: vi.fn(async () => okWrite()) })
    const { dialog, value } = await openFull(tripsValue({ api }))
    const d = within(dialog)
    expect(d.getByRole('button', { name: 'Capa da viagem' })).toBeDisabled()
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.click(d.getByRole('button', { name: 'Definir como capa' }))
    expect(api.updateTrip).toHaveBeenCalledWith(TRIP_ILHABELA_ID, { coverPhotoId: 'p-ilh-09' })
    expect(value.reload).toHaveBeenCalled()
  })

  it('falha numa escrita: a causa aparece e a galeria continua', async () => {
    const api = seededTripsApi({}, { updateTrip: vi.fn(async () => ({ status: 'invalid' as const, constraint: 'trips_cover_same_trip', cause: 'x' })) })
    const { dialog } = await openFull(tripsValue({ api }))
    await userEvent.keyboard('{ArrowRight}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Definir como capa' }))
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Não deu pra trocar a capa: essa foto não é desta viagem, recarregue a página')
  })

  it('Esc fecha e devolve o foco a quem abriu', async () => {
    const { opener } = await openFull()
    expect(opener).not.toHaveFocus()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('tocar na legenda edita (Enter grava; Esc desiste sem fechar a galeria)', async () => {
    const api = seededTripsApi({}, { setCaption: vi.fn(async () => okWrite(TRIP_ILHABELA.photos[0])) })
    const { dialog } = await openFull(tripsValue({ api }))
    const d = within(dialog)
    await userEvent.click(d.getByRole('button', { name: /Editar a legenda/ }))
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(api.setCaption).not.toHaveBeenCalled()

    await userEvent.click(d.getByRole('button', { name: /Editar a legenda/ }))
    const input = d.getByLabelText('Legenda')
    expect(input).toHaveAttribute('maxLength', '80')
    await userEvent.type(input, 'Chegando na ilha{Enter}')
    expect(api.setCaption).toHaveBeenCalledWith('p-ilh-01', 'Chegando na ilha')
    // Digitar "f" na legenda não favorita.
    expect(api.setFavorite).not.toHaveBeenCalled()
  })

  it('_Apagar foto_ fica no menu da foto, pede confirmação e apaga a atual', async () => {
    const api = seededTripsApi({}, { deletePhoto: vi.fn(async () => okWrite()) })
    const { dialog } = await openFull(tripsValue({ api }))
    const d = within(dialog)
    await userEvent.click(d.getByRole('button', { name: 'Mais opções da foto' }))
    await userEvent.click(d.getByRole('menuitem', { name: 'Apagar foto' }))
    await userEvent.click(within(d.getByRole('group', { name: 'Apagar foto' })).getByRole('button', { name: 'Apagar' }))
    expect(api.deletePhoto).toHaveBeenCalledWith(expect.objectContaining({ id: 'p-ilh-01', path: pathOf('p-ilh-01') }))
  })

  it('apagar a única foto fecha a galeria', async () => {
    const t = { ...TRIP_ILHABELA, coverPhotoId: null, photos: [photo('p-only', { takenOn: '2026-07-13' })] }
    const api = seededTripsApi({}, { deletePhoto: vi.fn(async () => okWrite()) })
    renderInTrips(<TripDetail id={t.id} />, tripsValue({ api, trips: [t] }))
    await userEvent.click(screen.getByRole('button', { name: 'Galeria em tela cheia' }))
    const d = within(screen.getByRole('dialog'))
    expect(d.getByText('1 / 1')).toBeInTheDocument()
    await userEvent.click(d.getByRole('button', { name: 'Mais opções da foto' }))
    await userEvent.click(d.getByRole('menuitem', { name: 'Apagar foto' }))
    await userEvent.click(within(d.getByRole('group', { name: 'Apagar foto' })).getByRole('button', { name: 'Apagar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
