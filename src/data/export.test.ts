// A21 (Fase 3), A20 (Fase 4) e A23 (Fase 5) — o export: formato, cidades
// resolvidas, a Lista e o Calendário por slot, e nada de arquivo parcial.

import { describe, expect, it } from 'vitest'
import { EXPORT_VERSION, buildExport } from './export'
import {
  CAL_MARAU,
  CAL_SJC,
  COUPLE_UUID,
  EVENT_LISBOA,
  EVENT_PARATY,
  EX_UUID,
  GABRIEL_UUID,
  ITEM_FILME,
  ITEM_PARATY,
  LANA_UUID,
  LISBOA,
  SJC,
  calendarExportData,
  listExportData,
  settingsData,
  settingsDataWithUuids,
} from '../settings/test/fixtures'
import type { CalendarExportData } from './calendar'
import type { ListExportData } from './listSummary'

const emptyList = (): ListExportData => ({ items: [], memories: [], photoCounts: new Map() })
const emptyCalendar = (): CalendarExportData => ({ events: [], kisses: [] })
const HOMES = new Map([CAL_SJC, CAL_MARAU].map((c) => [c.id, c]))
const ALL = new Map([CAL_SJC, CAL_MARAU, LISBOA].map((c) => [c.id, c]))
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

describe('buildExport', () => {
  it('version 3, cidades resolvidas por nome, coordenada, região e país, slot de cada estadia', () => {
    const result = buildExport(settingsData(), emptyList(), emptyCalendar(), HOMES, '2026-09-25T15:00:00.000Z')
    expect(result.status).toBe('ok')
    const doc = JSON.parse((result as { json: string }).json)
    expect(doc.version).toBe(EXPORT_VERSION)
    expect(EXPORT_VERSION).toBe(3)
    expect(doc.stays).toHaveLength(3)
    expect(doc.stays[0]).toEqual({
      person_slot: 1,
      city: { name: 'São José dos Campos', state_code: 'SP', lat: SJC.lat, lng: SJC.lng, region: null, country_code: 'BR' },
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
    const result = buildExport(settingsData(), emptyList(), emptyCalendar(), new Map([[CAL_SJC.id, CAL_SJC]]), '2026-09-25T15:00:00.000Z')
    expect(result).toEqual({ status: 'error', cause: 'cidade c-marau de uma estadia não foi lida' })
  })

  it('estadia de quem saiu do casal vai com slot nulo', () => {
    const data = settingsData()
    data.stays.push({ id: 's9', profileId: 'u-ex', cityId: SJC.id, startsOn: '2025-01-01', endsOn: '2025-01-02' })
    const result = buildExport(data, emptyList(), emptyCalendar(), HOMES, 'x')
    expect(JSON.parse((result as { json: string }).json).stays[3].person_slot).toBeNull()
  })

  it('Lista: itens, memórias e contagem de fotos, com quem por slot', () => {
    const result = buildExport(settingsDataWithUuids(), listExportData(), emptyCalendar(), HOMES, 'x')
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

  it('Calendário: eventos por slot, cidade resolvida, o item pelo nome, 💋 agregado por dia', () => {
    const result = buildExport(settingsDataWithUuids(), listExportData(), calendarExportData(), ALL, 'x')
    expect(result.status).toBe('ok')
    const doc = JSON.parse((result as { json: string }).json)
    expect(doc.calendar_events).toEqual([
      {
        kind: 'viagem',
        title: 'Lisboa',
        starts_on: '2026-10-01',
        ends_on: '2026-10-08',
        all_day: false,
        starts_at: '22:10',
        ends_at: '14:30',
        travelers: 'solo',
        traveler_slot: 2,
        city: { name: 'Lisboa', state_code: null, lat: LISBOA.lat, lng: LISBOA.lng, region: 'Lisboa', country_code: 'PT' },
        place: null,
        repeats_yearly: false,
        note: null,
        list_item: null,
        created_by_slot: 1,
      },
      {
        kind: 'date',
        title: 'Fim de semana em Paraty',
        starts_on: '2026-11-14',
        ends_on: null,
        all_day: true,
        starts_at: null,
        ends_at: null,
        travelers: null,
        traveler_slot: null,
        city: null,
        place: 'Pousada do Sandi',
        repeats_yearly: false,
        note: null,
        // O NOME do item, não o id.
        list_item: 'Paraty',
        // Quem criou já saiu do casal.
        created_by_slot: null,
      },
    ])
    expect(doc.day_kisses).toEqual([
      { day: '2026-09-20', count: 2 },
      { day: '2026-09-21', count: 1 },
    ])
  })

  it('estadia em Lisboa sai com country_code PT e a região', () => {
    const data = settingsDataWithUuids()
    data.stays.push({ id: 's-lx', profileId: LANA_UUID, cityId: LISBOA.id, startsOn: '2026-10-01', endsOn: '2026-10-08' })
    const result = buildExport(data, emptyList(), emptyCalendar(), ALL, 'x')
    const doc = JSON.parse((result as { json: string }).json)
    expect(doc.stays.at(-1)).toEqual({
      person_slot: 2,
      city: { name: 'Lisboa', state_code: null, lat: LISBOA.lat, lng: LISBOA.lng, region: 'Lisboa', country_code: 'PT' },
      starts_on: '2026-10-01',
      ends_on: '2026-10-08',
    })
  })

  it('cidade ou item de evento que não resolve é erro', () => {
    const noLisboa = buildExport(settingsData(), listExportData(), calendarExportData(), HOMES, 'x')
    expect(noLisboa).toEqual({ status: 'error', cause: 'cidade c-lisboa de um evento não foi lida' })
    const noItem = buildExport(settingsData(), emptyList(), calendarExportData(), ALL, 'x')
    expect(noItem).toEqual({ status: 'error', cause: `item ${ITEM_PARATY} de um evento não foi lido` })
  })

  it('nenhum UUID de perfil nem de casal, e nenhum caminho de foto, no arquivo', () => {
    const result = buildExport(settingsDataWithUuids(), listExportData(), calendarExportData(), ALL, 'x')
    const json = (result as { json: string }).json
    // Varre o arquivo inteiro por qualquer coisa com formato de UUID: o que
    // sobrar tem de ser id de item — nunca perfil, casal ou alguém que saiu.
    const found = new Set(json.match(UUID) ?? [])
    expect([...found].sort()).toEqual([ITEM_FILME, ITEM_PARATY].sort())
    // O id do evento também não sai: ele não liga nada dentro do arquivo.
    for (const id of [GABRIEL_UUID, LANA_UUID, EX_UUID, COUPLE_UUID, EVENT_LISBOA, EVENT_PARATY]) {
      expect(json).not.toContain(id)
    }
    expect(JSON.parse(json).calendar_events).toHaveLength(2)
    expect(json).not.toContain('couple_id')
    expect(json).not.toContain('.webp')
  })
})
