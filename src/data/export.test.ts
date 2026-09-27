// A21 (Fase 3) e A20 (Fase 4) — o export: formato, cidades resolvidas, a
// Lista por slot, e nada de arquivo parcial.

import { describe, expect, it } from 'vitest'
import { EXPORT_VERSION, buildExport } from './export'
import {
  COUPLE_UUID,
  EX_UUID,
  GABRIEL_UUID,
  ITEM_FILME,
  ITEM_PARATY,
  LANA_UUID,
  MARAU,
  SJC,
  listExportData,
  settingsData,
  settingsDataWithUuids,
} from '../settings/test/fixtures'
import type { ListExportData } from './listSummary'

const emptyList = (): ListExportData => ({ items: [], memories: [], photoCounts: new Map() })
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

describe('buildExport', () => {
  it('version 2, cidades resolvidas por nome e coordenada, slot de cada estadia', () => {
    const result = buildExport(settingsData(), emptyList(), new Map([[SJC.id, SJC], [MARAU.id, MARAU]]), '2026-09-25T15:00:00.000Z')
    expect(result.status).toBe('ok')
    const doc = JSON.parse((result as { json: string }).json)
    expect(doc.version).toBe(EXPORT_VERSION)
    expect(EXPORT_VERSION).toBe(2)
    expect(doc.stays).toHaveLength(3)
    expect(doc.stays[0]).toEqual({
      person_slot: 1,
      city: { name: 'São José dos Campos', state_code: 'SP', lat: SJC.lat, lng: SJC.lng },
      starts_on: '2026-09-20',
      ends_on: null,
    })
    expect(doc.members.map((m: { home_city: { name: string } }) => m.home_city.name)).toEqual([
      'São José dos Campos',
      'Marau',
    ])
    expect(doc.couple.saved_cities[0]).toMatchObject({ name: 'Paraty', country_code: 'BR' })
    // Nenhum UUID de cidade no arquivo: ele precisa fazer sentido fora do banco.
    expect((result as { json: string }).json).not.toContain('c-sjc')
  })

  it('cidade que não resolve é erro, não buraco no arquivo', () => {
    const result = buildExport(settingsData(), emptyList(), new Map([[SJC.id, SJC]]), '2026-09-25T15:00:00.000Z')
    expect(result).toEqual({ status: 'error', cause: 'cidade c-marau de uma estadia não foi lida' })
  })

  it('estadia de quem saiu do casal vai com slot nulo', () => {
    const data = settingsData()
    data.stays.push({ id: 's9', profileId: 'u-ex', cityId: SJC.id, startsOn: '2025-01-01', endsOn: '2025-01-02' })
    const result = buildExport(data, emptyList(), new Map([[SJC.id, SJC], [MARAU.id, MARAU]]), 'x')
    expect(JSON.parse((result as { json: string }).json).stays[3].person_slot).toBeNull()
  })

  it('Lista: itens, memórias e contagem de fotos, com quem por slot', () => {
    const result = buildExport(settingsDataWithUuids(), listExportData(), new Map([[SJC.id, SJC], [MARAU.id, MARAU]]), 'x')
    expect(result.status).toBe('ok')
    const doc = JSON.parse((result as { json: string }).json)
    expect(doc.list_items).toHaveLength(2)
    expect(doc.list_items[0]).toEqual({
      id: ITEM_PARATY,
      category: 'cidade',
      name: 'Paraty',
      note: null,
      link: null,
      featured: false,
      place: { address: null, city: 'Paraty', state: 'RJ', country: 'Brasil', country_code: 'BR', lat: -23.2178, lng: -44.7131 },
      region: 'Costa Verde',
      venue: null,
      highlights: [],
      platform: null,
      seasons: null,
      has_photo: true,
      status: 'done',
      rating: 5,
      added_by_slot: 1,
      created_at: '2026-09-01T12:00:00Z',
      done_on: '2026-09-10',
      done_with: 'solo',
      done_solo_by_slot: 2,
    })
    // Quem adicionou já saiu do casal: slot nulo, não o id.
    expect(doc.list_items[1]).toMatchObject({ id: ITEM_FILME, place: null, platform: 'MUBI', added_by_slot: null, done_solo_by_slot: null })
    expect(doc.list_memories).toEqual([
      { item: ITEM_PARATY, slot: 2, body: 'Chuva o dia todo', created_at: '2026-09-11T10:00:00Z', updated_at: '2026-09-11T10:00:00Z' },
      { item: ITEM_PARATY, slot: null, body: 'Não fui', created_at: '2026-09-12T10:00:00Z', updated_at: '2026-09-12T10:00:00Z' },
    ])
    // Só a contagem, e só de quem tem foto.
    expect(doc.list_photos).toEqual([{ item: ITEM_PARATY, count: 3 }])
  })

  it('nenhum UUID de perfil nem de casal, e nenhum caminho de foto, no arquivo', () => {
    const result = buildExport(settingsDataWithUuids(), listExportData(), new Map([[SJC.id, SJC], [MARAU.id, MARAU]]), 'x')
    const json = (result as { json: string }).json
    // Varre o arquivo inteiro por qualquer coisa com formato de UUID: o que
    // sobrar tem de ser id de item — nunca perfil, casal ou alguém que saiu.
    const found = new Set(json.match(UUID) ?? [])
    expect([...found].sort()).toEqual([ITEM_FILME, ITEM_PARATY].sort())
    for (const id of [GABRIEL_UUID, LANA_UUID, EX_UUID, COUPLE_UUID]) expect(json).not.toContain(id)
    expect(json).not.toContain('couple_id')
    expect(json).not.toContain('.webp')
  })
})
