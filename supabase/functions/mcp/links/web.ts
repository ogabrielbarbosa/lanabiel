// Página web → texto e pistas. Sem DOM: o HTML é lido com expressões, o que
// basta para meta tags, JSON-LD e texto corrido. Com `FIRECRAWL_API_KEY`, o
// Firecrawl entra no lugar do `fetch` para página que só monta com JavaScript
// (ADR 0032).

import { BROWSER_HEADERS, safeFetch } from './safeFetch.ts'

export const PAGE_MAX_BYTES = 2 * 1_048_576
export const TEXT_MAX_CHARS = 15_000
const PAGE_TIMEOUT_MS = 20_000

/** Um lugar, filme ou série que a própria página declara (schema.org). */
export interface StructuredHint {
  type: string
  name: string
  address: string | null
  city: string | null
  region: string | null
  country: string | null
  lat: number | null
  lng: number | null
  cuisine: string | null
  url: string | null
}

export interface PageRead {
  finalUrl: string
  title: string | null
  description: string | null
  siteName: string | null
  image: string | null
  text: string
  structured: StructuredHint[]
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

/** `<meta property|name="x" content="…">`, em qualquer ordem de atributo. */
export function metaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>()
  for (const match of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = match[0]
    const key = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase()
    const content = /content\s*=\s*"([^"]*)"|content\s*=\s*'([^']*)'/i.exec(tag)
    const value = content?.[1] ?? content?.[2]
    if (key && value !== undefined && !tags.has(key)) tags.set(key, decodeEntities(value).trim())
  }
  return tags
}

const INTERESTING = /^(Restaurant|FoodEstablishment|CafeOrCoffeeShop|BarOrPub|Bakery|LocalBusiness|Place|TouristAttraction|Park|LandmarksOrHistoricalBuildings|Museum|Hotel|LodgingBusiness|Event|Movie|TVSeries|CreativeWork|City|Country|AdministrativeArea|EntertainmentBusiness|NightClub|Winery|Brewery)$/

function asArray<T>(value: T | T[] | null | undefined): T[] {
  return value === null || value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function str(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number') return String(value)
  return null
}

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

// deno-lint-ignore no-explicit-any
function toHint(node: any): StructuredHint | null {
  const types = asArray<string>(node?.['@type']).filter((t) => typeof t === 'string')
  const type = types.find((t) => INTERESTING.test(t))
  const name = str(node?.name)
  if (!type || !name) return null
  const address = asArray(node.address)[0]
  const location = asArray(node.location)[0]
  const addr = typeof address === 'string' ? null : (address ?? location?.address ?? null)
  const geo = asArray(node.geo)[0] ?? location?.geo ?? null
  const country = addr?.addressCountry
  return {
    type,
    name: decodeEntities(name),
    address: typeof address === 'string' ? address : str(addr?.streetAddress),
    city: str(addr?.addressLocality),
    region: str(addr?.addressRegion),
    country: typeof country === 'object' && country !== null ? str(country.name) : str(country),
    lat: num(geo?.latitude),
    lng: num(geo?.longitude),
    cuisine: asArray(node.servesCuisine).filter((c) => typeof c === 'string').join(', ') || null,
    url: str(node.url),
  }
}

/** Os blocos `application/ld+json`, achatando `@graph` e listas. JSON quebrado é pulado. */
export function jsonLdHints(html: string): StructuredHint[] {
  const hints: StructuredHint[] = []
  for (const match of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let parsed: unknown
    try {
      parsed = JSON.parse(match[1].trim())
    } catch {
      continue
    }
    const stack: unknown[] = [parsed]
    while (stack.length > 0 && hints.length < 10) {
      const node = stack.pop()
      if (Array.isArray(node)) {
        stack.push(...node)
        continue
      }
      if (typeof node !== 'object' || node === null) continue
      const graph = (node as { '@graph'?: unknown })['@graph']
      if (graph) stack.push(graph)
      const hint = toHint(node)
      if (hint && !hints.some((h) => h.name === hint.name && h.type === hint.type)) hints.push(hint)
    }
  }
  return hints
}

/** O texto que uma pessoa leria: sem script, estilo, navegação nem marcação. */
export function htmlToText(html: string, maxChars = TEXT_MAX_CHARS): string {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html
  const text = body
    .replace(/<(script|style|noscript|svg|template|iframe|nav|footer|header)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|p|div|li|h[1-6]|tr|section|article)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  return decodeEntities(text)
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxChars)
}

export function parsePage(html: string, finalUrl: string): PageRead {
  const meta = metaTags(html)
  const title = meta.get('og:title') ?? decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '') ?? null
  return {
    finalUrl,
    title: title || null,
    description: meta.get('og:description') ?? meta.get('description') ?? null,
    siteName: meta.get('og:site_name') ?? null,
    image: meta.get('og:image') ?? meta.get('og:image:secure_url') ?? null,
    text: htmlToText(html),
    structured: jsonLdHints(html),
  }
}

export type PageOutcome = { status: 'ok'; page: PageRead; via: 'fetch' | 'firecrawl' } | { status: 'unreadable'; cause: string }

/** Baixa e lê. `userAgent` troca o navegador por outro (o Instagram dá a legenda ao robô do Facebook). */
export async function readPage(fetchFn: typeof fetch, url: string, userAgent?: string): Promise<PageOutcome> {
  try {
    const response = await safeFetch(fetchFn, url, {
      maxBytes: PAGE_MAX_BYTES,
      timeoutMs: PAGE_TIMEOUT_MS,
      truncate: true,
      headers: { ...BROWSER_HEADERS, ...(userAgent ? { 'User-Agent': userAgent } : {}), Accept: 'text/html,application/xhtml+xml' },
    })
    if (response.status >= 400) return { status: 'unreadable', cause: `A página respondeu ${response.status}.` }
    const type = response.headers.get('content-type') ?? ''
    if (type && !/html|xml|text\/plain/i.test(type)) return { status: 'unreadable', cause: `Não é uma página (${type.split(';')[0]}).` }
    const html = new TextDecoder().decode(response.body)
    return { status: 'ok', page: parsePage(html, response.url), via: 'fetch' }
  } catch (error) {
    return { status: 'unreadable', cause: error instanceof Error ? error.message : String(error) }
  }
}

/** Firecrawl `/v2/scrape`: a página já renderizada, em markdown, com metadados. */
export async function readPageFirecrawl(fetchFn: typeof fetch, url: string, apiKey: string): Promise<PageOutcome> {
  try {
    const response = await fetchFn('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, formats: ['markdown', 'rawHtml'], onlyMainContent: true }),
      signal: AbortSignal.timeout(45_000),
    })
    if (!response.ok) return { status: 'unreadable', cause: `Firecrawl respondeu ${response.status}.` }
    // deno-lint-ignore no-explicit-any
    const json = (await response.json()) as any
    const data = json?.data ?? {}
    const metadata = data.metadata ?? {}
    const raw = typeof data.rawHtml === 'string' ? data.rawHtml : ''
    return {
      status: 'ok',
      via: 'firecrawl',
      page: {
        finalUrl: str(metadata.sourceURL) ?? str(metadata.url) ?? url,
        title: str(metadata.ogTitle) ?? str(metadata.title),
        description: str(metadata.ogDescription) ?? str(metadata.description),
        siteName: str(metadata.ogSiteName),
        image: str(metadata.ogImage),
        text: String(data.markdown ?? '').slice(0, TEXT_MAX_CHARS),
        structured: raw ? jsonLdHints(raw) : [],
      },
    }
  } catch (error) {
    return { status: 'unreadable', cause: error instanceof Error ? error.message : String(error) }
  }
}
