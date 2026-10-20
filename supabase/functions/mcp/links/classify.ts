// De onde é o link. Decide qual leitor entra (ADR 0032).

export type LinkSource = 'instagram' | 'tiktok' | 'youtube' | 'google_maps' | 'web'

function hostOf(url: URL): string {
  return url.hostname.toLowerCase().replace(/^www\.|^m\./, '')
}

export function classifyLink(url: URL): LinkSource {
  const host = hostOf(url)
  if (host === 'instagram.com' || host === 'instagr.am') return 'instagram'
  if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return 'tiktok'
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') return 'youtube'
  if (host === 'maps.app.goo.gl' || (host === 'goo.gl' && url.pathname.startsWith('/maps'))) return 'google_maps'
  if ((host === 'google.com' || host.startsWith('google.')) && url.pathname.startsWith('/maps')) return 'google_maps'
  if (host === 'maps.google.com' || host.startsWith('maps.google.')) return 'google_maps'
  return 'web'
}

/**
 * `/reel/CODE`, `/reels/CODE`, `/tv/CODE` e `/p/CODE` são o mesmo post para o
 * scraper; ele aceita melhor `/p/`. Fora disso (perfil, story), `null`.
 */
export function instagramPostUrl(url: URL): string | null {
  const match = /^\/(?:[A-Za-z0-9._]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/.exec(url.pathname)
  return match ? `https://www.instagram.com/p/${match[1]}/` : null
}

export interface MapsHint {
  name: string | null
  lat: number | null
  lng: number | null
}

/**
 * Nome e coordenada de uma URL do Google Maps (a final, depois do link curto).
 * `!3d…!4d…` é o ponto do lugar; `@lat,lng` é o centro da tela, usado só sem o
 * primeiro. Servem de pista para `find_place`, nunca de dado gravado (ADR 0030).
 */
export function parseGoogleMapsUrl(raw: string): MapsHint {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { name: null, lat: null, lng: null }
  }
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s.replace(/\+/g, ' ')).trim()
    } catch {
      return s.replace(/\+/g, ' ').trim()
    }
  }
  const place = /\/maps\/place\/([^/]+)/.exec(url.pathname)
  const query = url.searchParams.get('q') ?? url.searchParams.get('query')
  let name = place ? decode(place[1]) : query ? decode(query) : null
  // `?q=-23.1,-45.9`: a busca é a própria coordenada.
  const queryPoint = name ? /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(name) : null
  if (queryPoint) name = null

  const full = decodeURIComponent(url.pathname + url.search)
  const pin = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(full)
  const view = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(full)
  const coords = pin ?? queryPoint ?? view
  return {
    name: name || null,
    lat: coords ? Number(coords[1]) : null,
    lng: coords ? Number(coords[2]) : null,
  }
}
