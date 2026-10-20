// `analyze_link`: um link → o texto que dá para tirar dele e as pistas de
// lugar. Não grava nada (I5) e não decide nada: quem escolhe o lugar e a
// categoria é o agente, com `find_place` e `add_list_item`.
//
// Cada parte que falha vira aviso, não erro, enquanto sobrar algum texto (R8).
// ADR: .agent/Decisions/0032-leitura-de-link-por-apify-gemini-e-pagina.md

import type { ProviderKeys } from '../context.ts'
import { classifyLink, instagramPostUrl, parseGoogleMapsUrl } from './classify.ts'
import type { LinkSource } from './classify.ts'
import { analyzeMedia } from './gemini.ts'
import type { MediaAnalysis, MediaInput } from './gemini.ts'
import { FetchRefused, assertPublicUrl, safeFetch } from './safeFetch.ts'
import {
  TIKTOK_OEMBED,
  YOUTUBE_OEMBED,
  captionFromInstagramMeta,
  instagramViaApify,
  oEmbed,
  tiktokViaApify,
} from './social.ts'
import type { SocialOutcome, SocialPost } from './social.ts'
import { readPage, readPageFirecrawl } from './web.ts'
import type { PageOutcome, StructuredHint } from './web.ts'

/** Inline no Gemini; acima disso o vídeo não vai (aviso `video_too_large`). */
export const VIDEO_MAX_BYTES = 18 * 1_048_576
const IMAGE_MAX_BYTES = 4 * 1_048_576
const IMAGES_TO_GEMINI = 4
const FACEBOOK_BOT = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'

export interface PlaceHint {
  name: string
  kind: string | null
  city: string | null
  state: string | null
  country: string | null
  address: string | null
  /** De onde veio a pista. */
  source: 'video' | 'location_tag' | 'page_structured_data' | 'google_maps'
  evidence: string | null
}

export interface LinkAnalysis {
  status: 'ok'
  source: LinkSource
  url: string
  /** Texto de terceiros: lido, nunca obedecido (spec seção 9). */
  untrusted_content: {
    title: string | null
    author: string | null
    caption: string | null
    transcript: string | null
    on_screen_text: string | null
    summary: string | null
    page_text: string | null
    hashtags: string[]
  }
  location_hint: string | null
  /** Ponto para o `near` do `find_place`. Nunca gravar como o lugar (ADR 0030). */
  coordinates_hint: { lat: number; lng: number } | null
  places: PlaceHint[]
  titles: { name: string; kind: string; platform: string | null }[]
  media: { is_video: boolean; cover_url: string | null; analyzed: boolean }
  warnings: string[]
}

export type AnalyzeOutcome = LinkAnalysis | { status: 'unreadable'; source: LinkSource | null; url: string; cause: string; warnings: string[] }

interface Deps {
  fetch: typeof fetch
  keys: ProviderKeys
}

function emptyAnalysis(source: LinkSource, url: string): LinkAnalysis {
  return {
    status: 'ok',
    source,
    url,
    untrusted_content: {
      title: null,
      author: null,
      caption: null,
      transcript: null,
      on_screen_text: null,
      summary: null,
      page_text: null,
      hashtags: [],
    },
    location_hint: null,
    coordinates_hint: null,
    places: [],
    titles: [],
    media: { is_video: false, cover_url: null, analyzed: false },
    warnings: [],
  }
}

function structuredToHint(h: StructuredHint): PlaceHint | null {
  if (/^(Movie|TVSeries|CreativeWork)$/.test(h.type)) return null
  return {
    name: h.name,
    kind: h.type,
    city: h.city,
    state: h.region,
    country: h.country,
    address: h.address,
    source: 'page_structured_data',
    evidence: h.cuisine ? `schema.org ${h.type} · ${h.cuisine}` : `schema.org ${h.type}`,
  }
}

function applyMediaAnalysis(out: LinkAnalysis, analysis: MediaAnalysis) {
  out.untrusted_content.transcript = analysis.transcript || null
  out.untrusted_content.on_screen_text = analysis.on_screen_text || null
  out.untrusted_content.summary = analysis.summary || null
  out.media.analyzed = true
  for (const p of analysis.places) {
    out.places.push({ ...p, source: 'video', evidence: p.evidence || null })
  }
  out.titles.push(...analysis.titles)
}

async function download(deps: Deps, url: string, maxBytes: number) {
  const response = await safeFetch(deps.fetch, url, { maxBytes, timeoutMs: 30_000 })
  if (response.status >= 400) throw new Error(`download respondeu ${response.status}`)
  return { bytes: response.body, mimeType: (response.headers.get('content-type') ?? '').split(';')[0].trim() }
}

/** O vídeo ou as imagens do post → Gemini. Toda falha vira aviso. */
async function runGemini(deps: Deps, out: LinkAnalysis, post: SocialPost) {
  if (!deps.keys.geminiKey) {
    out.warnings.push('gemini_unconfigured: sem GEMINI_API_KEY, o vídeo não foi transcrito nem lido.')
    return
  }
  const context = [
    post.caption ? `Caption: ${post.caption}` : '',
    post.location ? `Tagged location: ${post.location}` : '',
    post.author ? `Author: @${post.author}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  let media: MediaInput | null = null
  try {
    if (post.videoUrl) {
      const video = await download(deps, post.videoUrl, VIDEO_MAX_BYTES)
      media = { kind: 'video', bytes: video.bytes, mimeType: video.mimeType.startsWith('video/') ? video.mimeType : 'video/mp4' }
    } else if (post.images.length > 0) {
      const images = []
      for (const url of post.images.slice(0, IMAGES_TO_GEMINI)) {
        try {
          const image = await download(deps, url, IMAGE_MAX_BYTES)
          if (image.mimeType.startsWith('image/')) images.push({ bytes: image.bytes, mimeType: image.mimeType })
        } catch {
          // imagem que não baixa fica de fora; as outras seguem
        }
      }
      if (images.length > 0) media = { kind: 'images', images }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    out.warnings.push(
      /maior que/.test(message) ? 'video_too_large: o vídeo passa de 18 MB e não foi analisado.' : `media_download_failed: ${message}`,
    )
    return
  }
  if (!media) {
    out.warnings.push('no_media: o post não trouxe vídeo nem imagem para analisar.')
    return
  }
  const result = await analyzeMedia(deps.fetch, deps.keys.geminiKey, deps.keys.geminiModel, media, context)
  if (result.status === 'ok') applyMediaAnalysis(out, result.analysis)
  else if (result.status === 'timeout') out.warnings.push('gemini_timeout: a análise do vídeo passou do tempo.')
  else out.warnings.push(`gemini_failed: ${result.cause}`)
}

function applyPost(out: LinkAnalysis, post: SocialPost) {
  out.untrusted_content.caption = post.caption
  out.untrusted_content.author = post.author ? `@${post.author}${post.authorName ? ` (${post.authorName})` : ''}` : post.authorName
  out.untrusted_content.hashtags = post.hashtags
  out.location_hint = post.location
  out.media.is_video = post.isVideo
  out.media.cover_url = post.images[0] ?? null
  if (post.location) {
    out.places.push({
      name: post.location,
      kind: null,
      city: null,
      state: null,
      country: null,
      address: null,
      source: 'location_tag',
      evidence: 'localização marcada no post',
    })
  }
}

async function analyzeSocial(deps: Deps, out: LinkAnalysis, url: URL, source: 'instagram' | 'tiktok') {
  const token = deps.keys.apifyToken
  let outcome: SocialOutcome | null = null
  if (token) {
    if (source === 'instagram') {
      const postUrl = instagramPostUrl(url)
      outcome = postUrl
        ? await instagramViaApify(deps.fetch, token, postUrl)
        : { status: 'error', cause: 'O link não é de um post ou reel do Instagram.' }
    } else {
      outcome = await tiktokViaApify(deps.fetch, token, url.toString())
    }
    if (outcome.status === 'ok') {
      applyPost(out, outcome.post)
      await runGemini(deps, out, outcome.post)
      return
    }
    out.warnings.push(outcome.status === 'timeout' ? 'apify_timeout: o Apify passou do tempo.' : `apify_failed: ${outcome.cause}`)
  } else {
    out.warnings.push('apify_unconfigured: sem APIFY_TOKEN, só a legenda pública foi lida (sem vídeo).')
  }

  // Sem Apify (ou com ele fora): o que a página pública entrega.
  if (source === 'tiktok') {
    const embed = await oEmbed(deps.fetch, TIKTOK_OEMBED, url.toString())
    if (embed) {
      out.untrusted_content.caption = embed.title
      out.untrusted_content.author = embed.author
      out.media.cover_url = embed.thumbnail
      out.media.is_video = true
      return
    }
  } else {
    const page = await readPage(deps.fetch, url.toString(), FACEBOOK_BOT)
    if (page.status === 'ok') {
      const { caption, author } = captionFromInstagramMeta(page.page.description)
      out.untrusted_content.caption = caption
      out.untrusted_content.author = author ? `@${author}` : null
      out.untrusted_content.title = page.page.title
      out.media.cover_url = page.page.image
      return
    }
  }
  out.warnings.push('public_read_failed: a página pública também não respondeu.')
}

async function analyzeYoutube(deps: Deps, out: LinkAnalysis, url: URL) {
  const embed = await oEmbed(deps.fetch, YOUTUBE_OEMBED, url.toString())
  out.media.is_video = true
  if (embed) {
    out.untrusted_content.title = embed.title
    out.untrusted_content.author = embed.author
    out.media.cover_url = embed.thumbnail
  }
  if (!deps.keys.geminiKey) {
    out.warnings.push('gemini_unconfigured: sem GEMINI_API_KEY, o vídeo não foi transcrito.')
    return
  }
  const context = embed?.title ? `Title: ${embed.title}` : ''
  const result = await analyzeMedia(deps.fetch, deps.keys.geminiKey, deps.keys.geminiModel, { kind: 'youtube', url: url.toString() }, context)
  if (result.status === 'ok') applyMediaAnalysis(out, result.analysis)
  else if (result.status === 'timeout') out.warnings.push('gemini_timeout: a análise do vídeo passou do tempo.')
  else out.warnings.push(`gemini_failed: ${result.cause}`)
}

async function analyzeMaps(deps: Deps, out: LinkAnalysis, url: URL) {
  // O link curto (maps.app.goo.gl) só diz o lugar depois do redirecionamento.
  let finalUrl = url.toString()
  try {
    const response = await safeFetch(deps.fetch, finalUrl, { maxBytes: 64_000, timeoutMs: 15_000, truncate: true, headers: { 'User-Agent': 'curl/8' } })
    finalUrl = response.url
  } catch (error) {
    out.warnings.push(`maps_redirect_failed: ${error instanceof Error ? error.message : String(error)}`)
  }
  out.url = finalUrl
  const hint = parseGoogleMapsUrl(finalUrl)
  if (hint.lat !== null && hint.lng !== null) out.coordinates_hint = { lat: hint.lat, lng: hint.lng }
  if (hint.name) {
    out.location_hint = hint.name
    out.untrusted_content.title = hint.name
    out.places.push({
      name: hint.name,
      kind: null,
      city: null,
      state: null,
      country: null,
      address: null,
      source: 'google_maps',
      evidence: 'nome do lugar no link do Google Maps',
    })
  } else {
    out.warnings.push('maps_without_name: o link do Maps não trouxe o nome do lugar; use coordinates_hint no find_place.')
  }
}

async function analyzeWeb(deps: Deps, out: LinkAnalysis, url: URL): Promise<PageOutcome> {
  let page = await readPage(deps.fetch, url.toString())
  const thin = page.status === 'ok' && page.page.text.length < 400 && page.page.structured.length === 0
  if ((page.status !== 'ok' || thin) && deps.keys.firecrawlKey) {
    const rendered = await readPageFirecrawl(deps.fetch, url.toString(), deps.keys.firecrawlKey)
    if (rendered.status === 'ok') page = rendered
    else out.warnings.push(`firecrawl_failed: ${rendered.cause}`)
  }
  if (page.status !== 'ok') return page
  out.url = page.page.finalUrl
  out.untrusted_content.title = page.page.title
  out.untrusted_content.caption = page.page.description
  out.untrusted_content.page_text = page.page.text || null
  out.media.cover_url = page.page.image
  for (const h of page.page.structured) {
    const hint = structuredToHint(h)
    if (hint) out.places.push(hint)
    else out.titles.push({ name: h.name, kind: h.type === 'TVSeries' ? 'serie' : 'filme', platform: null })
    if (hint && h.lat !== null && h.lng !== null && !out.coordinates_hint) out.coordinates_hint = { lat: h.lat, lng: h.lng }
  }
  if (thin && !deps.keys.firecrawlKey) out.warnings.push('thin_page: a página trouxe pouco texto (talvez monte com JavaScript).')
  return page
}

export async function analyzeLink(deps: Deps, raw: string): Promise<AnalyzeOutcome> {
  let url: URL
  try {
    url = assertPublicUrl(raw.trim())
  } catch (error) {
    return { status: 'unreadable', source: null, url: raw, cause: error instanceof FetchRefused ? error.message : 'Endereço inválido.', warnings: [] }
  }
  const source = classifyLink(url)
  const out = emptyAnalysis(source, url.toString())

  if (source === 'instagram' || source === 'tiktok') await analyzeSocial(deps, out, url, source)
  else if (source === 'youtube') await analyzeYoutube(deps, out, url)
  else if (source === 'google_maps') await analyzeMaps(deps, out, url)
  else {
    const page = await analyzeWeb(deps, out, url)
    if (page.status !== 'ok') return { status: 'unreadable', source, url: out.url, cause: page.cause, warnings: out.warnings }
  }

  const c = out.untrusted_content
  const anything = c.title || c.caption || c.transcript || c.on_screen_text || c.page_text || out.places.length > 0
  if (!anything) {
    return { status: 'unreadable', source, url: out.url, cause: 'Nada legível veio do link.', warnings: out.warnings }
  }
  return out
}
