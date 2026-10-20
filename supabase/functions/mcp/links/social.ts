// Instagram e TikTok pelo Apify (API síncrona), com o caminho sem chave: as
// meta tags da página (Instagram) e o oEmbed público (TikTok, YouTube).
// ADR 0032. O formato dos actors muda sem aviso: tudo aqui é lido com
// desconfiança, e campo ausente vira nulo.

const APIFY = 'https://api.apify.com/v2/acts'
const APIFY_TIMEOUT_S = 50

export interface SocialPost {
  caption: string | null
  author: string | null
  authorName: string | null
  /** A localização marcada no post, quando há. */
  location: string | null
  hashtags: string[]
  mentions: string[]
  postedAt: string | null
  /** Vídeo para o Gemini (URL do CDN ou do armazenamento do Apify). */
  videoUrl: string | null
  /** Capa ou imagens do post (carrossel). */
  images: string[]
  isVideo: boolean
}

export type SocialOutcome = { status: 'ok'; post: SocialPost } | { status: 'timeout' } | { status: 'error'; cause: string }

async function runActor(fetchFn: typeof fetch, token: string, actor: string, input: unknown): Promise<SocialOutcome | unknown[]> {
  let response: Response
  try {
    response = await fetchFn(`${APIFY}/${actor}/run-sync-get-dataset-items?timeout=${APIFY_TIMEOUT_S}&clean=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((APIFY_TIMEOUT_S + 5) * 1000),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return { status: 'timeout' }
    return { status: 'error', cause: error instanceof Error ? error.message : String(error) }
  }
  // 408: o actor não terminou dentro do `timeout`.
  if (response.status === 408) return { status: 'timeout' }
  if (!response.ok) return { status: 'error', cause: `Apify respondeu ${response.status}` }
  const items = (await response.json()) as unknown
  return Array.isArray(items) ? items : { status: 'error', cause: 'Apify devolveu um formato inesperado.' }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : str((x as { name?: unknown })?.name))).filter((x): x is string => !!x) : []

// deno-lint-ignore no-explicit-any
export function instagramItemToPost(item: any): SocialPost | null {
  if (!item || typeof item !== 'object' || item.error) return null
  const isVideo = item.type === 'Video' || !!item.videoUrl
  const images = [
    ...strings(item.images),
    // deno-lint-ignore no-explicit-any
    ...(Array.isArray(item.childPosts) ? item.childPosts.map((c: any) => str(c?.displayUrl)).filter(Boolean) : []),
  ]
  const display = str(item.displayUrl)
  if (display && !images.includes(display)) images.unshift(display)
  return {
    caption: str(item.caption),
    author: str(item.ownerUsername),
    authorName: str(item.ownerFullName),
    location: str(item.locationName),
    hashtags: strings(item.hashtags),
    mentions: strings(item.mentions),
    postedAt: str(item.timestamp),
    videoUrl: str(item.videoUrl),
    images: images.slice(0, 10) as string[],
    isVideo,
  }
}

// deno-lint-ignore no-explicit-any
export function tiktokItemToPost(item: any): SocialPost | null {
  if (!item || typeof item !== 'object' || item.error || item.errorCode) return null
  const poi = item.poi ?? item.locationMeta ?? null
  const location = str(poi?.name) ?? str(poi?.address) ?? null
  const slides = Array.isArray(item.slideshowImageLinks)
    ? // deno-lint-ignore no-explicit-any
      item.slideshowImageLinks.map((s: any) => str(s?.downloadLink)).filter(Boolean)
    : []
  const cover = str(item.videoMeta?.coverUrl) ?? str(item.videoMeta?.originalCoverUrl)
  return {
    caption: str(item.text),
    author: str(item.authorMeta?.name),
    authorName: str(item.authorMeta?.nickName),
    location,
    hashtags: strings(item.hashtags),
    mentions: strings(item.mentions),
    postedAt: str(item.createTimeISO),
    videoUrl: item.isSlideshow ? null : (strings(item.mediaUrls)[0] ?? null),
    images: [...slides, ...(cover ? [cover] : [])].slice(0, 10) as string[],
    isVideo: !item.isSlideshow,
  }
}

export async function instagramViaApify(fetchFn: typeof fetch, token: string, postUrl: string): Promise<SocialOutcome> {
  const result = await runActor(fetchFn, token, 'apify~instagram-scraper', {
    directUrls: [postUrl],
    resultsType: 'posts',
    resultsLimit: 1,
    addParentData: false,
  })
  if (!Array.isArray(result)) return result as SocialOutcome
  const post = result.map(instagramItemToPost).find((p) => p !== null)
  return post ? { status: 'ok', post } : { status: 'error', cause: 'O Apify não achou o post (privado, apagado ou link errado).' }
}

export async function tiktokViaApify(fetchFn: typeof fetch, token: string, url: string): Promise<SocialOutcome> {
  const result = await runActor(fetchFn, token, 'clockworks~tiktok-scraper', {
    postURLs: [url],
    resultsPerPage: 1,
    shouldDownloadVideos: true,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: true,
  })
  if (!Array.isArray(result)) return result as SocialOutcome
  const post = result.map(tiktokItemToPost).find((p) => p !== null)
  return post ? { status: 'ok', post } : { status: 'error', cause: 'O Apify não achou o vídeo (privado, apagado ou link errado).' }
}

export interface OEmbed {
  title: string | null
  author: string | null
  thumbnail: string | null
}

/** oEmbed público (TikTok, YouTube): título (no TikTok, a legenda) e autor, sem chave. */
export async function oEmbed(fetchFn: typeof fetch, endpoint: string, url: string): Promise<OEmbed | null> {
  try {
    const response = await fetchFn(`${endpoint}?format=json&url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) return null
    // deno-lint-ignore no-explicit-any
    const json = (await response.json()) as any
    return { title: str(json?.title), author: str(json?.author_name), thumbnail: str(json?.thumbnail_url) }
  } catch {
    return null
  }
}

export const TIKTOK_OEMBED = 'https://www.tiktok.com/oembed'
export const YOUTUBE_OEMBED = 'https://www.youtube.com/oembed'

/**
 * A legenda do Instagram sem Apify: o robô do Facebook recebe as meta tags, e
 * o `og:description` vem como `123 likes, 4 comments - autor em 1 de maio de
 * 2026: "legenda"`. Tira o prefixo quando reconhece.
 */
export function captionFromInstagramMeta(description: string | null): { caption: string | null; author: string | null } {
  if (!description) return { caption: null, author: null }
  const match = /^[\d.,\s\w]*?-\s*([A-Za-z0-9._]+)\s+(?:on|em)\s+[^:]+:\s*["“]?([\s\S]*?)["”]?\s*$/.exec(description)
  if (match) return { caption: match[2].trim() || null, author: match[1] }
  return { caption: description.trim() || null, author: null }
}
