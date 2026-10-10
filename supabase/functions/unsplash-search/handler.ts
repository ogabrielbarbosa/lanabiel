// A regra da `unsplash-search`, sem Deno: valida o pedido, chama o Unsplash
// pelo `fetch` injetado e devolve só o que a tela usa.
//
// ADR: .agent/Decisions/0025-viagem-solo-e-capa-do-unsplash.md
//
// As regras da API do Unsplash (https://unsplash.com/documentation) que pesam
// aqui: a chave não vai ao navegador; a imagem é usada pela URL deles (nada de
// copiar para o bucket); o crédito ao fotógrafo e ao Unsplash aparece na tela,
// com `utm_source`; e escolher uma foto dispara o `download_location`.

export const APP_NAME = 'lanabiel'
const API = 'https://api.unsplash.com'
const PER_PAGE = 8
const QUERY_MAX = 120

export interface StockPhoto {
  id: string
  /** `urls.regular` (1080 px de largura): a capa. */
  url: string
  /** `urls.small` (400 px): a miniatura do seletor. */
  thumb: string
  author: string
  /** O perfil do fotógrafo, com o `utm` que a licença pede. */
  authorUrl: string
  /** Chamado (pela função) quando a foto é escolhida. */
  downloadLocation: string
  alt: string | null
  color: string | null
}

export type StockResult =
  | { status: 'ok'; photos: StockPhoto[] }
  | { status: 'tracked' }
  | { status: 'unconfigured' }
  | { status: 'invalid_request' }
  | { status: 'error'; cause: string }

export interface StockDeps {
  /** `UNSPLASH_ACCESS_KEY`; ausente → `unconfigured`, e a tela some com a sugestão. */
  accessKey: string | null
  fetch: typeof fetch
}

const withUtm = (url: string) => `${url}${url.includes('?') ? '&' : '?'}utm_source=${APP_NAME}&utm_medium=referral`

interface ApiPhoto {
  id?: unknown
  urls?: { regular?: unknown; small?: unknown }
  user?: { name?: unknown; links?: { html?: unknown } }
  links?: { download_location?: unknown }
  alt_description?: unknown
  color?: unknown
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** Foto sem URL do domínio esperado ou sem crédito fica de fora (o CHECK recusaria). */
export function toStockPhoto(p: ApiPhoto): StockPhoto | null {
  const id = str(p.id)
  const url = str(p.urls?.regular)
  const thumb = str(p.urls?.small)
  const author = str(p.user?.name)?.trim() ?? null
  const profile = str(p.user?.links?.html)
  const download = str(p.links?.download_location)
  if (!id || !url || !thumb || !author || !profile || !download) return null
  if (!url.startsWith('https://images.unsplash.com/') || !thumb.startsWith('https://images.unsplash.com/')) return null
  if (!profile.startsWith('https://unsplash.com/') || !download.startsWith(`${API}/`)) return null
  return {
    id,
    url,
    thumb,
    author: [...author].slice(0, 120).join(''),
    authorUrl: withUtm(profile),
    downloadLocation: download,
    alt: str(p.alt_description),
    color: str(p.color),
  }
}

export async function handleStock(body: unknown, deps: StockDeps): Promise<StockResult> {
  if (typeof body !== 'object' || body === null) return { status: 'invalid_request' }
  const { action, query, downloadLocation } = body as Record<string, unknown>
  if (!deps.accessKey) return { status: 'unconfigured' }
  const headers = { Authorization: `Client-ID ${deps.accessKey}`, 'Accept-Version': 'v1' }

  if (action === 'search') {
    if (typeof query !== 'string' || query.trim() === '' || query.length > QUERY_MAX) return { status: 'invalid_request' }
    const params = new URLSearchParams({
      query: query.trim(),
      per_page: String(PER_PAGE),
      orientation: 'landscape',
      content_filter: 'high',
    })
    const response = await deps.fetch(`${API}/search/photos?${params}`, { headers })
    if (!response.ok) return { status: 'error', cause: `Unsplash ${response.status}` }
    const json = (await response.json()) as { results?: unknown }
    const results = Array.isArray(json.results) ? (json.results as ApiPhoto[]) : []
    return { status: 'ok', photos: results.map(toStockPhoto).filter((p): p is StockPhoto => p !== null) }
  }

  if (action === 'download') {
    // Só o endpoint do próprio Unsplash: a função não vira proxy de URL qualquer.
    if (typeof downloadLocation !== 'string' || !downloadLocation.startsWith(`${API}/photos/`)) {
      return { status: 'invalid_request' }
    }
    const response = await deps.fetch(downloadLocation, { headers })
    if (!response.ok) return { status: 'error', cause: `Unsplash ${response.status}` }
    return { status: 'tracked' }
  }

  return { status: 'invalid_request' }
}
