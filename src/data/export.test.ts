// A21 — o export: formato, cidades resolvidas, e nada de arquivo parcial.

import { describe, expect, it } from 'vitest'
import { EXPORT_VERSION, buildExport } from './export'
import { MARAU, SJC, settingsData } from '../settings/test/fixtures'

describe('buildExport', () => {
  it('version 1, cidades resolvidas por nome e coordenada, slot de cada estadia', () => {
    const result = buildExport(settingsData(), new Map([[SJC.id, SJC], [MARAU.id, MARAU]]), '2026-09-25T15:00:00.000Z')
    expect(result.status).toBe('ok')
    const doc = JSON.parse((result as { json: string }).json)
    expect(doc.version).toBe(EXPORT_VERSION)
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
    const result = buildExport(settingsData(), new Map([[SJC.id, SJC]]), '2026-09-25T15:00:00.000Z')
    expect(result).toEqual({ status: 'error', cause: 'cidade c-marau de uma estadia não foi lida' })
  })

  it('estadia de quem saiu do casal vai com slot nulo', () => {
    const data = settingsData()
    data.stays.push({ id: 's9', profileId: 'u-ex', cityId: SJC.id, startsOn: '2025-01-01', endsOn: '2025-01-02' })
    const result = buildExport(data, new Map([[SJC.id, SJC], [MARAU.id, MARAU]]), 'x')
    expect(JSON.parse((result as { json: string }).json).stays[3].person_slot).toBeNull()
  })
})
