// O código de convite que ainda não virou entrada no casal.
//
// Spec: .agent/Tasks/fase-2-onboarding.md, R6 e seção 5 ("O código pendente")
//
// Mora em sessionStorage, não em localStorage: sobrevive à ida e volta do
// OAuth (mesma aba) e ao login por senha, e morre quando a aba fecha — num
// computador compartilhado, o código de outra pessoa não fica esperando a
// próxima.
//
// Toda leitura e escrita é protegida: aba privada, armazenamento bloqueado ou
// cota estourada fazem `sessionStorage` lançar. Nesse caso o código continua
// valendo na memória do portão; só não sobrevive a um redirecionamento.

import { normalizeInviteCode } from '../domain/onboarding'

export const STORAGE_KEY = 'lanabiel.pendingInvite'
const FRAGMENT_KEY = 'convite'

export function getPendingInvite(): string | null {
  try {
    return normalizeInviteCode(window.sessionStorage.getItem(STORAGE_KEY) ?? '')
  } catch {
    return null
  }
}

export function setPendingInvite(code: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, code)
  } catch {
    // Sem armazenamento: o portão guarda em memória.
  }
}

export function clearPendingInvite(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nada a limpar.
  }
}

/**
 * Lê `#convite=<código>` da URL, guarda, e APAGA o fragmento da barra de
 * endereços. Devolve o código normalizado, ou o que já estava guardado.
 *
 * O fragmento — e não a query — porque não vai ao servidor em requisição
 * nenhuma, não entra em log de acesso e não vaza em `Referer` (seção 9).
 */
export function consumeInviteFromUrl(url: URL, replaceUrl: (href: string) => void): string | null {
  const params = new URLSearchParams(url.hash.replace(/^#/, ''))
  const raw = params.get(FRAGMENT_KEY)
  if (raw === null) return getPendingInvite()

  params.delete(FRAGMENT_KEY)
  const rest = params.toString()
  replaceUrl(`${url.pathname}${url.search}${rest ? `#${rest}` : ''}`)

  const code = normalizeInviteCode(raw)
  // Fragmento com lixo não apaga um código bom que já estava guardado.
  if (code === null) return getPendingInvite()
  setPendingInvite(code)
  return code
}
