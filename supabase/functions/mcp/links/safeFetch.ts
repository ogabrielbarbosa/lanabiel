// `fetch` para endereço que veio de fora (link colado, URL de foto): só
// http(s), nunca rede interna (SSRF), redirecionamento conferido a cada salto e
// corpo com teto. Spec seção 9.

const MAX_REDIRECTS = 5

export class FetchRefused extends Error {}

/** IPv4/IPv6 literal, `localhost` e nomes internos são recusados. Nomes públicos passam. */
export function assertPublicUrl(raw: string): URL {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new FetchRefused('Endereço inválido.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new FetchRefused('Só links http:// ou https://.')
  if (url.username || url.password) throw new FetchRefused('Link com usuário e senha não é aceito.')
  if (url.port && url.port !== '80' && url.port !== '443') throw new FetchRefused('Porta não aceita.')
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host.includes('.')) throw new FetchRefused('Endereço interno não é aceito.')
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new FetchRefused('Endereço interno não é aceito.')
  }
  // IP literal: v6 vem entre colchetes; v4 é só dígitos e pontos. Nenhum lugar
  // legítimo do produto é um IP.
  if (host.startsWith('[') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) throw new FetchRefused('Endereço por IP não é aceito.')
  return url
}

export interface SafeResponse {
  url: string
  status: number
  headers: Headers
  body: Uint8Array
  /** O corpo passou do teto e foi cortado. */
  truncated: boolean
}

export interface SafeFetchOptions {
  maxBytes: number
  timeoutMs: number
  headers?: Record<string, string>
  /** Passou do teto: corta (`true`) ou recusa (`false`). */
  truncate?: boolean
}

/** Segue até `MAX_REDIRECTS` saltos, conferindo cada destino. */
export async function safeFetch(fetchFn: typeof fetch, raw: string, options: SafeFetchOptions): Promise<SafeResponse> {
  let url = assertPublicUrl(raw)
  const signal = AbortSignal.timeout(options.timeoutMs)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetchFn(url.toString(), { redirect: 'manual', headers: options.headers, signal })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      await response.body?.cancel()
      if (!location) throw new FetchRefused(`Redirecionamento sem destino (${response.status}).`)
      url = assertPublicUrl(new URL(location, url).toString())
      continue
    }
    const { body, truncated } = await readCapped(response, options.maxBytes)
    if (truncated && !options.truncate) throw new FetchRefused(`Arquivo maior que ${Math.round(options.maxBytes / 1_048_576)} MB.`)
    return { url: url.toString(), status: response.status, headers: response.headers, body, truncated }
  }
  throw new FetchRefused('Redirecionamentos demais.')
}

async function readCapped(response: Response, maxBytes: number): Promise<{ body: Uint8Array; truncated: boolean }> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes && !response.body) return { body: new Uint8Array(), truncated: true }
  if (!response.body) {
    const buffer = new Uint8Array(await response.arrayBuffer())
    return buffer.length > maxBytes ? { body: buffer.slice(0, maxBytes), truncated: true } : { body: buffer, truncated: false }
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  let truncated = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (size + value.length > maxBytes) {
      chunks.push(value.slice(0, maxBytes - size))
      size = maxBytes
      truncated = true
      await reader.cancel()
      break
    }
    chunks.push(value)
    size += value.length
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.length
  }
  return { body, truncated }
}

/** Bytes → base64, em pedaços (um `String.fromCharCode(...bytes)` de 15 MB estoura a pilha). */
export function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
}
