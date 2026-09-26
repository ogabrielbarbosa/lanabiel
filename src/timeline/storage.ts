import type { Stay } from './types'
import { SEED_STAYS } from './seedStays'

const STORAGE_KEY = 'lanabiel:stays:v1'

export function loadEntries(): Stay[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const stored: Stay[] = raw ? JSON.parse(raw) : []
    const parsed = Array.isArray(stored) ? stored : []

    // Se nenhum registro do histórico inicial está presente, mescla — cobre
    // tanto a primeira vez que o app abre quanto um navegador que já tinha
    // salvo uma lista vazia antes do histórico existir.
    const hasSeed = parsed.some((entry) => SEED_STAYS.some((seed) => seed.id === entry.id))
    return hasSeed ? parsed : [...SEED_STAYS, ...parsed]
  } catch {
    return SEED_STAYS
  }
}

export function saveEntries(entries: Stay[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // localStorage indisponível (aba anônima, quota cheia) — segue sem persistir
  }
}
