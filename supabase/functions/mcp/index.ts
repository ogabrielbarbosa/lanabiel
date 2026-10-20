// Edge function `mcp` — Deno. Só liga o servidor MCP (`server.ts`) e a borda
// HTTP (`http.ts`) ao mundo.
//
// Spec: .agent/Tasks/mcp-server.md
// ADR:  .agent/Decisions/0031-mcp-remoto-em-edge-function-com-oauth-do-supabase.md
//       .agent/Decisions/0032-leitura-de-link-por-apify-gemini-e-pagina.md
//
// `verify_jwt = false` no config: o 401 do gateway não traz o
// `WWW-Authenticate` que o cliente MCP precisa. O token é conferido aqui
// (`getClaims`) e vai junto em toda query, para a RLS decidir (ADR 0001).
//
// Segredos: MCP_PUBLIC_URL, APIFY_TOKEN, GEMINI_API_KEY, GEMINI_MODEL, FIRECRAWL_API_KEY,
// OPEN_PLACES_API_KEY. Ausentes, a ferramenta correspondente degrada.

import { createClient } from '@supabase/supabase-js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { DEFAULT_GEMINI_MODEL, todayBr } from './context.ts'
import type { Ctx } from './context.ts'
import { PRM_PATH, bearerToken, endpointFor, innerPath, metadataResponse, preflight, unauthorized, withCors } from './http.ts'
import { createServer } from './server.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const env = (name: string) => Deno.env.get(name)?.trim() || null
// O endereço dedicado (rewrite da Vercel), ex. https://lanabiel.vercel.app/mcp.
const PUBLIC_URL = env('MCP_PUBLIC_URL')

// Só confere tokens. Fica no módulo para o JWKS ficar em cache entre pedidos
// do mesmo worker; um cliente por pedido buscaria as chaves a cada chamada.
const verifier = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return preflight()

  const url = new URL(request.url)
  const endpoint = endpointFor(url, SUPABASE_URL, PUBLIC_URL)
  const path = innerPath(url.pathname)
  if (path === PRM_PATH && request.method === 'GET') return metadataResponse(SUPABASE_URL, endpoint)
  if (path !== '/') return withCors(new Response('Not found', { status: 404 }))

  const token = bearerToken(request.headers.get('Authorization'))
  if (!token) return unauthorized(SUPABASE_URL, 'missing', endpoint)

  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await verifier.auth.getClaims(token)
  const userId = data?.claims?.sub
  if (error || !userId || data.claims.role !== 'authenticated') {
    console.warn('mcp: token recusado', error?.message ?? `role=${data?.claims?.role ?? '?'}`)
    return unauthorized(SUPABASE_URL, 'invalid', endpoint)
  }

  const ctx: Ctx = {
    db,
    userId,
    fetch,
    today: () => todayBr(),
    keys: {
      apifyToken: env('APIFY_TOKEN'),
      geminiKey: env('GEMINI_API_KEY'),
      geminiModel: env('GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL,
      firecrawlKey: env('FIRECRAWL_API_KEY'),
      openPlacesKey: env('OPEN_PLACES_API_KEY'),
    },
  }

  // Sem estado: um servidor e um transporte por pedido, resposta em JSON.
  const server = createServer(ctx)
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
  try {
    await server.connect(transport)
    return withCors(await transport.handleRequest(request))
  } catch (e) {
    console.error('mcp', e)
    return withCors(
      new Response(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Erro interno.' }, id: null }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }
})
