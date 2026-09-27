import { afterEach, describe, expect, it, vi } from 'vitest'
import { localDateOf, shortDayMonth } from './date'

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
