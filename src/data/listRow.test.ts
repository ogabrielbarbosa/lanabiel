// A fronteira da Lista: ida e volta entre `ItemDraft` e as colunas, para os
// dois formatos (spec da Fase 4, seção 5). O lado do banco é provado por
// supabase/tests/list.test.ts, que usa este mesmo mapeador (A2).

import { describe, expect, it } from 'vitest'
import type { ItemDraft } from '../domain/list'
import { draftToInsert, draftToUpdate, rowToItem, rowToMemory, rowToPhoto } from './listRow'
import type { ListItemInsert, ListItemRow } from './listRow'

const COUPLE = '11111111-1111-4111-8111-111111111111'

const restaurant: ItemDraft = {
  category: 'restaurante',
  name: 'Mocotó',
  note: 'Pedir o torresmo',
  link: 'https://instagram.com/mocoto',
  featured: true,
  place: {
    address: 'Av. Nossa Senhora do Loreto, 1100',
    city: 'São Paulo',
    state: 'São Paulo',
    country: 'Brasil',
    countryCode: 'BR',
    lat: -23.4867214,
    lng: -46.5815741,
  },
  region: null,
  venue: null,
  highlights: [],
  platform: null,
  seasons: null,
}

const series: ItemDraft = {
  category: 'serie',
  name: 'The Bear',
  note: null,
  link: null,
  featured: false,
  place: null,
  region: null,
  venue: null,
  highlights: [],
  platform: 'Disney+',
  seasons: 4,
}

/** O que o banco devolveria para o insert: as colunas geradas preenchidas. */
function asRow(insert: ListItemInsert, extra: Partial<ListItemRow> = {}): ListItemRow {
  return {
    ...insert,
    id: 'item-1',
    photo_path: null,
    status: 'want',
    rating: null,
    added_by: 'u-gabriel',
    created_at: '2026-09-26T12:00:00+00:00',
    updated_at: '2026-09-26T12:00:00+00:00',
    done_on: null,
    done_with: null,
    done_solo_by: null,
    ...extra,
  }
}

describe('draftToInsert / rowToItem', () => {
  it('item geográfico: o lugar vira colunas e volta igual', () => {
    const insert = draftToInsert(restaurant, COUPLE)
    expect(insert).toEqual({
      couple_id: COUPLE,
      category: 'restaurante',
      name: 'Mocotó',
      note: 'Pedir o torresmo',
      link: 'https://instagram.com/mocoto',
      featured: true,
      address: 'Av. Nossa Senhora do Loreto, 1100',
      city: 'São Paulo',
      state: 'São Paulo',
      country: 'Brasil',
      country_code: 'BR',
      lat: -23.4867214,
      lng: -46.5815741,
      region: null,
      venue: null,
      highlights: [],
      platform: null,
      seasons: null,
    })
    expect(insert).not.toHaveProperty('added_by')

    const item = rowToItem(asRow(insert))
    const { id, photoPath, status, rating, addedBy, createdAt, doneOn, doneWith, doneSoloBy, ...draft } = item
    expect(draft).toEqual(restaurant)
    expect({ id, photoPath, status, rating, addedBy, createdAt, doneOn, doneWith, doneSoloBy }).toEqual({
      id: 'item-1',
      photoPath: null,
      status: 'want',
      rating: null,
      addedBy: 'u-gabriel',
      createdAt: '2026-09-26T12:00:00+00:00',
      doneOn: null,
      doneWith: null,
      doneSoloBy: null,
    })
  })

  it('item de mídia: todas as colunas geográficas nulas, e volta sem lugar', () => {
    const insert = draftToInsert(series, COUPLE)
    expect(insert).toMatchObject({
      category: 'serie',
      platform: 'Disney+',
      seasons: 4,
      address: null,
      city: null,
      state: null,
      country: null,
      country_code: null,
      lat: null,
      lng: null,
      highlights: [],
    })

    const done = rowToItem(
      asRow(insert, { status: 'done', rating: 4, done_on: '2026-09-20', done_with: 'solo', done_solo_by: 'u-lana' }),
    )
    const { id: _id, photoPath: _p, status, rating, addedBy: _a, createdAt: _c, doneOn, doneWith, doneSoloBy, ...draft } = done
    expect(draft).toEqual(series)
    expect({ status, rating, doneOn, doneWith, doneSoloBy }).toEqual({
      status: 'done',
      rating: 4,
      doneOn: '2026-09-20',
      doneWith: 'solo',
      doneSoloBy: 'u-lana',
    })
  })

  it('highlights é uma cópia, não o array do rascunho', () => {
    const pais: ItemDraft = { ...restaurant, category: 'pais', highlights: ['Tóquio'] }
    const insert = draftToInsert(pais, COUPLE)
    expect(insert.highlights).toEqual(['Tóquio'])
    expect(insert.highlights).not.toBe(pais.highlights)
  })
})

describe('draftToUpdate', () => {
  it('não leva categoria nem casal (R14, I1)', () => {
    const update = draftToUpdate(restaurant)
    expect(update).not.toHaveProperty('category')
    expect(update).not.toHaveProperty('couple_id')
    expect(update).toMatchObject({ name: 'Mocotó', lat: -23.4867214, highlights: [] })
  })
})

describe('rowToMemory / rowToPhoto', () => {
  it('camelCase, sem o couple_id', () => {
    expect(
      rowToMemory({
        item_id: 'i',
        couple_id: COUPLE,
        profile_id: 'p',
        body: 'Que dia',
        created_at: 'c',
        updated_at: 'u',
      }),
    ).toEqual({ itemId: 'i', profileId: 'p', body: 'Que dia', createdAt: 'c', updatedAt: 'u' })

    expect(
      rowToPhoto({ id: 'f', item_id: 'i', couple_id: COUPLE, path: `${COUPLE}/memory/x.webp`, added_by: null, created_at: 'c' }),
    ).toEqual({ id: 'f', itemId: 'i', path: `${COUPLE}/memory/x.webp`, addedBy: null, createdAt: 'c' })
  })
})
