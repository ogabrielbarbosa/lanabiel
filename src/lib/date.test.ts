import { afterEach, describe, expect, it, vi } from 'vitest'
import { addYears, localDateOf, localDateOfEpoch, shortDayMonth, shortMonth, shortMonthYear, weekdayShortLower } from './date'

describe('localDateOf', () => {
  // O Node relê `TZ` a cada `Date` criado depois da troca.
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('usa o fuso local, não o UTC: 22h30 em SJC ainda é o mesmo dia', () => {
    vi.stubEnv('TZ', 'America/Sao_Paulo')
    expect(localDateOf('2026-09-26T01:30:00Z')).toBe('2026-09-25')
    expect(localDateOf('2026-09-26T03:00:00Z')).toBe('2026-09-26')
  })

  it('entende o deslocamento explícito do Postgres', () => {
    vi.stubEnv('TZ', 'America/Sao_Paulo')
    expect(localDateOf('2026-09-25T23:59:00-03:00')).toBe('2026-09-25')
    expect(localDateOf('2026-09-26 02:59:00+00')).toBe('2026-09-25')
  })
})

describe('shortDayMonth', () => {
  it('dia sem zero e mês curto em minúsculas', () => {
    expect(shortDayMonth('2026-07-18')).toBe('18 jul')
    expect(shortDayMonth('2026-09-05')).toBe('5 set')
    expect(shortDayMonth('2026-12-31')).toBe('31 dez')
  })
})

describe('shortMonth / shortMonthYear / weekdayShortLower', () => {
  it('mês curto em minúsculas, com e sem ano', () => {
    expect(shortMonth('2026-01-08')).toBe('jan')
    expect(shortMonthYear('2025-07-12')).toBe('jul 2025')
  })

  it('dia da semana curto em minúsculas', () => {
    expect(weekdayShortLower('2026-10-02')).toBe('sex')
    expect(weekdayShortLower('2026-10-03')).toBe('sáb')
  })
})

describe('addYears', () => {
  it('mesmo dia e mês, outro ano', () => {
    expect(addYears('2026-09-27', -1)).toBe('2025-09-27')
    expect(addYears('2026-12-31', 1)).toBe('2027-12-31')
  })

  it('29 de fevereiro num ano comum vira 28', () => {
    expect(addYears('2028-02-29', -1)).toBe('2027-02-28')
    expect(addYears('2028-02-29', -4)).toBe('2024-02-29')
  })
})

describe('localDateOfEpoch', () => {
  it('o dia local do instante (lastModified de uma foto)', () => {
    const ms = new Date(2026, 6, 14, 23, 50).getTime()
    expect(localDateOfEpoch(ms)).toBe('2026-07-14')
  })
})
