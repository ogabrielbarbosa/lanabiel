// A borda HTTP do MCP, sem Deno: o documento de recurso protegido (RFC 9728),
// o 401 que ensina o cliente a achar o OAuth, o token do cabeçalho e o CORS.
//
// ADR: .agent/Decisions/0031-mcp-remoto-em-edge-function-com-oauth-do-supabase.md

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, accept, mcp-session-id, mcp-protocol-version, last-event-id, x-client-info, apikey',
  'Access-Control-Expose-Headers': 'www-authenticate, mcp-session-id, mcp-protocol-version',
}

export const PRM_PATH = '/.well-known/oauth-protected-resource'

/** `https://<ref>.supabase.co` → a URL do recurso (a função, sem barra final). */
export function resourceUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/mcp`
}

/** Onde o cliente conectou: o recurso e o documento que o descreve. */
export type Endpoint = { resource: string; metadata: string }

/** Marca que a Vercel põe no destino do rewrite (`vercel.json`). */
export const VIA_PUBLIC = 'via=public'

/**
 * O endereço que a função anuncia. Pela URL do Supabase, ela mesma; pelo
 * rewrite da Vercel (`?via=public`), o endereço público — o cliente MCP confere
 * se o `resource` do documento bate com a URL em que conectou. O documento
 * público segue a RFC 9728 (`/.well-known/oauth-protected-resource/mcp`).
 */
export function endpointFor(requestUrl: URL, supabaseUrl: string, publicUrl: string | null): Endpoint {
  if (publicUrl && requestUrl.searchParams.get('via') === 'public') {
    const pub = new URL(publicUrl.replace(/\/+$/, ''))
    return { resource: pub.href, metadata: `${pub.origin}${PRM_PATH}${pub.pathname}` }
  }
  const resource = resourceUrl(supabaseUrl)
  return { resource, metadata: `${resource}${PRM_PATH}` }
}

export function protectedResourceMetadata(supabaseUrl: string, resource = resourceUrl(supabaseUrl)) {
  const base = supabaseUrl.replace(/\/+$/, '')
  return {
    resource,
    authorization_servers: [`${base}/auth/v1`],
    bearer_methods_supported: ['header'],
    resource_name: 'lanabiel',
    resource_documentation: 'https://github.com/ogabrielbarbosa/lanabiel/blob/main/.agent/Tasks/mcp-server.md',
  }
}

/**
 * O caminho dentro da função. O runtime entrega `/mcp/...` (prefixo com o
 * nome da função); atrás do gateway pode vir `/functions/v1/mcp/...`.
 */
export function innerPath(pathname: string): string {
  const match = /^(?:\/functions\/v1)?\/mcp(\/.*)?$/.exec(pathname)
  return (match ? (match[1] ?? '/') : pathname).replace(/\/+$/, '') || '/'
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? '')
  return match ? match[1] : null
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', ...headers },
  })
}

/** 401 com `resource_metadata`: é por ele que o cliente MCP descobre o servidor de autorização. */
export function unauthorized(
  supabaseUrl: string,
  reason: 'missing' | 'invalid',
  { metadata }: Endpoint = endpointFor(new URL(supabaseUrl), supabaseUrl, null),
): Response {
  const challenge =
    reason === 'missing'
      ? `Bearer resource_metadata="${metadata}"`
      : `Bearer error="invalid_token", error_description="token inválido ou expirado", resource_metadata="${metadata}"`
  return json({ error: reason === 'missing' ? 'unauthorized' : 'invalid_token' }, 401, { 'WWW-Authenticate': challenge })
}

export function metadataResponse(supabaseUrl: string, { resource }: Endpoint = endpointFor(new URL(supabaseUrl), supabaseUrl, null)): Response {
  return json(protectedResourceMetadata(supabaseUrl, resource), 200, { 'Cache-Control': 'public, max-age=3600' })
}

export function withCors(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
