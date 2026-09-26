// A19 (parte de domínio) — aparência do aparelho.

import { describe, expect, it } from 'vitest'
import {
  APPEARANCE_KEY,
  defaultAppearance,
  loadAppearance,
  parseAppearance,
  resolveTheme,
  saveAppearance,
} from './appearance'

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}

const throwing: Storage = {
  length: 0,
  clear() {},
  key: () => null,
  removeItem() {},
  getItem() {
    throw new Error('SecurityError')
  },
  setItem() {
    throw new Error('QuotaExceededError')
  },
}

describe('parseAppearance', () => {
  const fallback = defaultAppearance(false)
  it('ausente e JSON inválido caem no padrão', () => {
    expect(parseAppearance(null, fallback)).toEqual(fallback)
    expect(parseAppearance('{oi', fallback)).toEqual(fallback)
    expect(parseAppearance('42', fallback)).toEqual(fallback)
  })
  it('campo ruim não derruba os outros', () => {
    expect(parseAppearance('{"theme":"sepia","density":"compact","reduceMotion":true}', fallback)).toEqual({
      theme: 'dark',
      density: 'compact',
      reduceMotion: true,
    })
  })
})

describe('loadAppearance e saveAppearance', () => {
  it('o padrão de "reduzir animações" vem do sistema', () => {
    expect(loadAppearance(memoryStorage(), true).appearance.reduceMotion).toBe(true)
  })
  it('grava e relê', () => {
    const storage = memoryStorage()
    expect(saveAppearance(storage, { theme: 'light', density: 'comfortable', reduceMotion: false })).toBe(true)
    expect(JSON.parse(storage.getItem(APPEARANCE_KEY)!)).toMatchObject({ theme: 'light' })
    expect(loadAppearance(storage, false).appearance.theme).toBe('light')
  })
  it('storage que lança: padrão, e marcado como não guardável', () => {
    expect(loadAppearance(throwing, false)).toEqual({ appearance: defaultAppearance(false), storable: false })
    expect(saveAppearance(throwing, defaultAppearance(false))).toBe(false)
    expect(loadAppearance(null, false).storable).toBe(false)
  })
})

it('resolveTheme', () => {
  expect(resolveTheme('system', true)).toBe('dark')
  expect(resolveTheme('system', false)).toBe('light')
  expect(resolveTheme('light', true)).toBe('light')
})
