import { describe, expect, it } from 'vitest'
import type { Member, Stay } from './coupleState'
import {
  BAND_COLORS,
  DEFAULT_COLOR_BY_SLOT,
  LIST_CATEGORIES,
  PERSON_COLORS,
  SETTINGS_TABS,
  coupleLabel,
  daysTogetherInYear,
  formatBytes,
  formatCoord,
  formatThousands,
  isCreator,
  isSettingsTab,
  notifyColumn,
  parseUserAgent,
} from './settings'
import { dayOfMonth, longDateBR, weekdayDayMonthLabel } from '../lib/date'

describe('paletas e vocabulário (lado cliente de A1)', () => {
  it('as cores padrão por slot estão na paleta pessoal, e são diferentes', () => {
    expect(PERSON_COLORS).toContain(DEFAULT_COLOR_BY_SLOT[1])
    expect(PERSON_COLORS).toContain(DEFAULT_COLOR_BY_SLOT[2])
    expect(DEFAULT_COLOR_BY_SLOT[1]).not.toBe(DEFAULT_COLOR_BY_SLOT[2])
  })

  it('a paleta de faixas contém a pessoal e mais uma', () => {
    expect(BAND_COLORS).toHaveLength(PERSON_COLORS.length + 1)
    for (const c of PERSON_COLORS) expect(BAND_COLORS).toContain(c)
  })

  it('oito categorias e nove abas, sem repetição', () => {
    expect(new Set(LIST_CATEGORIES).size).toBe(8)
    expect(new Set(SETTINGS_TABS).size).toBe(9)
    expect(isSettingsTab('cidades')).toBe(true)
    expect(isSettingsTab('cidade')).toBe(false)
  })

  it('coluna de aviso', () => {
    expect(notifyColumn('trip_eve', 'push')).toBe('notify_trip_eve_push')
  })
})

describe('coupleLabel', () => {
  const members = [
    { slot: 2 as const, displayName: 'Lana' },
    { slot: 1 as const, displayName: 'Gabriel' },
  ]
  it('usa o nome gravado', () => expect(coupleLabel('Gabi & Lana', members)).toBe('Gabi & Lana'))
  it('sem nome, junta os dois na ordem dos slots', () => {
    expect(coupleLabel(null, members)).toBe('Gabriel & Lana')
    expect(coupleLabel('   ', members)).toBe('Gabriel & Lana')
  })
  it('com um integrante só, o nome dele', () => expect(coupleLabel(null, [members[0]])).toBe('Lana'))
})

describe('formatCoord', () => {
  it('sul e oeste', () => expect(formatCoord(-23.1791, -45.8872)).toBe('23,18° S · 45,89° O'))
  it('norte e oeste (Lisboa)', () => expect(formatCoord(38.7223, -9.1393)).toBe('38,72° N · 9,14° O'))
  it('norte e leste', () => expect(formatCoord(48.8566, 2.3522)).toBe('48,86° N · 2,35° L'))
  it('sul e leste', () => expect(formatCoord(-33.8688, 151.2093)).toBe('33,87° S · 151,21° L'))
})

describe('formatThousands e formatBytes', () => {
  it('milhar com ponto', () => {
    expect(formatThousands(861)).toBe('861')
    expect(formatThousands(1080)).toBe('1.080')
    expect(formatThousands(1248000)).toBe('1.248.000')
  })
  it('GB com uma casa; MB abaixo de 0,1 GB', () => {
    expect(formatBytes(3.6 * 1_073_741_824)).toEqual({ value: '3,6', unit: 'GB' })
    expect(formatBytes(2.5 * 1_048_576)).toEqual({ value: '2,5', unit: 'MB' })
    expect(formatBytes(40 * 1_048_576)).toEqual({ value: '40', unit: 'MB' })
    expect(formatBytes(0)).toEqual({ value: '0,0', unit: 'MB' })
  })
})

describe('daysTogetherInYear', () => {
  const members: [Member, Member] = [
    { profileId: 'g', homeCityId: 'sjc' },
    { profileId: 'l', homeCityId: 'marau' },
  ]
  const stays: Stay[] = [
    { id: '1', profileId: 'g', cityId: 'sjc', startsOn: '2025-12-20', endsOn: '2026-01-10' },
    { id: '2', profileId: 'l', cityId: 'sjc', startsOn: '2025-12-20', endsOn: '2026-01-05' },
    { id: '3', profileId: 'l', cityId: 'marau', startsOn: '2026-01-06', endsOn: null },
  ]

  it('conta só dias juntos dentro do ano', () => {
    expect(daysTogetherInYear(stays, members, 2026, '2026-09-25')).toBe(5)
  })
  it('não conta futuro: em 3 de janeiro, são 3', () => {
    expect(daysTogetherInYear(stays, members, 2026, '2026-01-03')).toBe(3)
  })
  it('lacuna (unknown) não vira juntos', () => {
    expect(daysTogetherInYear([], members, 2026, '2026-09-25')).toBe(0)
  })
  it('ano que ainda não começou dá 0', () => {
    expect(daysTogetherInYear(stays, members, 2027, '2026-09-25')).toBe(0)
  })
})

describe('parseUserAgent', () => {
  const cases: [string, string, string][] = [
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36', 'Mac', 'Chrome'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'iPhone', 'Safari'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0', 'Windows', 'Edge'],
    ['Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0', 'Android', 'Firefox'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1', 'iPhone', 'Chrome'],
  ]
  it.each(cases)('%s', (ua, device, browser) => {
    expect(parseUserAgent(ua)).toEqual({ device, browser })
  })
  it('nulo', () => {
    expect(parseUserAgent(null)).toEqual({ device: 'Aparelho desconhecido', browser: 'navegador desconhecido' })
  })
})

describe('rótulos de data', () => {
  it('cabeçalho do painel', () => expect(weekdayDayMonthLabel('2026-09-25')).toBe('Sexta, 25 de setembro'))
  it('dia do mês', () => expect(dayOfMonth('2024-09-17')).toBe(17))
  it('data por extenso', () => expect(longDateBR('2024-09-17')).toBe('17 de setembro de 2024'))
})

describe('isCreator', () => {
  const couple = { createdAt: '2024-09-17T12:00:00.123+00:00' }
  it('entrou no instante em que o casal nasceu', () => {
    expect(isCreator({ joinedAt: '2024-09-17T12:00:00.123Z' }, couple)).toBe(true)
  })
  it('entrou depois (convite, ou a vaga 1 depois de alguém sair)', () => {
    expect(isCreator({ joinedAt: '2024-09-18T08:00:00Z' }, couple)).toBe(false)
  })
})
