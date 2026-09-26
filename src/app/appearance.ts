// Aparência: preferência do APARELHO, não da pessoa nem do casal (ADR 0011).
// Mora no localStorage e nunca no banco — o frame diz "Vale só pra este
// aparelho", e é o que se espera de tema num celular escuro e num notebook
// claro da mesma pessoa.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, R18 e seção 5 ("Aparelho")

export type ThemeChoice = 'dark' | 'light' | 'system'
export type Density = 'comfortable' | 'compact'

export interface Appearance {
  theme: ThemeChoice
  density: Density
  reduceMotion: boolean
}

export const APPEARANCE_KEY = 'lanabiel:appearance'

export function defaultAppearance(prefersReducedMotion: boolean): Appearance {
  return { theme: 'dark', density: 'comfortable', reduceMotion: prefersReducedMotion }
}

/**
 * Lê e valida. Ausente, JSON inválido, campo desconhecido: cai no padrão
 * campo a campo — um valor ruim não derruba os outros dois.
 */
export function parseAppearance(raw: string | null, fallback: Appearance): Appearance {
  if (!raw) return fallback
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return fallback
  }
  if (typeof data !== 'object' || data === null) return fallback
  const d = data as Record<string, unknown>
  return {
    theme: d.theme === 'dark' || d.theme === 'light' || d.theme === 'system' ? d.theme : fallback.theme,
    density: d.density === 'comfortable' || d.density === 'compact' ? d.density : fallback.density,
    reduceMotion: typeof d.reduceMotion === 'boolean' ? d.reduceMotion : fallback.reduceMotion,
  }
}

export type LoadResult = { appearance: Appearance; storable: boolean }

/**
 * `storable: false` quando o `localStorage` lança (modo privado, bloqueio de
 * site): a aparência vale só nesta sessão, e a aba diz isso.
 */
export function loadAppearance(storage: Storage | null, prefersReducedMotion: boolean): LoadResult {
  const fallback = defaultAppearance(prefersReducedMotion)
  if (!storage) return { appearance: fallback, storable: false }
  try {
    return { appearance: parseAppearance(storage.getItem(APPEARANCE_KEY), fallback), storable: true }
  } catch {
    return { appearance: fallback, storable: false }
  }
}

/** `true` se gravou. */
export function saveAppearance(storage: Storage | null, appearance: Appearance): boolean {
  if (!storage) return false
  try {
    storage.setItem(APPEARANCE_KEY, JSON.stringify(appearance))
    return true
  } catch {
    return false
  }
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): 'dark' | 'light' {
  if (choice === 'system') return systemPrefersDark ? 'dark' : 'light'
  return choice
}

/** Os três atributos no `<html>`. O CSS lê só eles. */
export function applyAppearance(root: HTMLElement, appearance: Appearance, systemPrefersDark: boolean): void {
  root.dataset.theme = resolveTheme(appearance.theme, systemPrefersDark)
  root.dataset.density = appearance.density
  root.dataset.reduceMotion = appearance.reduceMotion ? 'true' : 'false'
}

/** `localStorage`, ou `null` se até acessá-lo lança. */
export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}
