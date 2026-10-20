// O servidor MCP montado no Node, com um cliente em memória: as ferramentas,
// o prompt, as anotações e a borda HTTP (401, metadados). Sem rede e sem banco.
// `npx vitest run --project db supabase/tests/mcp-server.test.ts`.

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { yearlyOccurrences, tripState, validateEvent } from '../functions/mcp/calendarTools'
import { todayBr } from '../functions/mcp/context'
import type { Ctx } from '../functions/mcp/context'
import { PRM_PATH, bearerToken, endpointFor, innerPath, metadataResponse, protectedResourceMetadata, unauthorized } from '../functions/mcp/http'
import { createServer } from '../functions/mcp/server'

/** Um `db` que responde a qualquer cadeia do PostgREST com `result`. */
function chain(result: unknown) {
  const handler: ProxyHandler<object> = {
    get(_t, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve(result)
      return () => proxy
    },
  }
  const proxy: object = new Proxy({}, handler)
  return proxy
}

function ctx(members: unknown[] = []): Ctx {
  return {
    db: { from: () => chain({ data: members, error: null }) } as never,
    userId: 'u1',
    fetch: (async () => new Response('', { status: 500 })) as unknown as typeof fetch,
    today: () => '2026-10-19',
    keys: { apifyToken: null, geminiKey: null, geminiModel: 'm', firecrawlKey: null, openPlacesKey: null },
  }
}

async function connect(c: Ctx) {
  const server = createServer(c)
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'teste', version: '1' })
  await Promise.all([server.connect(serverSide), client.connect(clientSide)])
  return client
}

const TOOLS = [
  'add_list_item',
  'analyze_link',
  'create_event',
  'delete_list_item',
  'find_place',
  'get_context',
  'get_list_item',
  'list_events',
  'list_trips',
  'mark_list_item_done',
  'save_list_memory',
  'search_list',
  'update_list_item',
]

describe('servidor MCP', () => {
  it('lista as treze ferramentas, com instruções (A2, R9)', async () => {
    const client = await connect(ctx())
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS)
    expect(client.getInstructions()).toContain('untrusted_content')
  })

  it('leitura é readOnly e apagar é destrutivo (R10)', async () => {
    const { tools } = await (await connect(ctx())).listTools()
    const byName = new Map(tools.map((t) => [t.name, t]))
    for (const name of ['get_context', 'search_list', 'get_list_item', 'find_place', 'analyze_link', 'list_events', 'list_trips']) {
      expect(byName.get(name)?.annotations?.readOnlyHint).toBe(true)
    }
    expect(byName.get('delete_list_item')?.annotations?.destructiveHint).toBe(true)
    expect(byName.get('add_list_item')?.annotations?.readOnlyHint).toBe(false)
  })

  it('add_list_item exige categoria do conjunto e nome', async () => {
    const { tools } = await (await connect(ctx())).listTools()
    const schema = tools.find((t) => t.name === 'add_list_item')!.inputSchema as { properties: Record<string, { enum?: string[] }>; required: string[] }
    expect(schema.required).toEqual(expect.arrayContaining(['category', 'name']))
    expect(schema.properties.category.enum).toEqual(['pais', 'cidade', 'restaurante', 'parque', 'comida', 'experiencia', 'filme', 'serie'])
  })

  it('quem não é de um casal recebe not_member (R5)', async () => {
    const client = await connect(ctx([]))
    const result = await client.callTool({ name: 'get_context', arguments: {} })
    expect(result.isError).toBe(true)
    const body = JSON.parse((result.content as { text: string }[])[0].text)
    expect(body).toMatchObject({ status: 'not_member', message: 'Esta conta ainda não está num espaço do lanabiel.' })
  })

  it('entrada inválida é recusada pelo esquema antes de tocar o banco', async () => {
    const client = await connect(ctx())
    const result = await client.callTool({ name: 'add_list_item', arguments: { category: 'bar', name: 'x' } })
    expect(result.isError).toBe(true)
  })

  it('o prompt importar_link leva o link e o roteiro', async () => {
    const client = await connect(ctx())
    const { prompts } = await client.listPrompts()
    expect(prompts.map((p) => p.name)).toEqual(['importar_link'])
    const prompt = await client.getPrompt({ name: 'importar_link', arguments: { url: 'https://www.instagram.com/reel/X/' } })
    const text = (prompt.messages[0].content as { text: string }).text
    expect(text).toContain('https://www.instagram.com/reel/X/')
    expect(text).toContain('find_place')
  })
})

describe('borda HTTP (A1)', () => {
  const URL = 'https://ref.supabase.co'

  it('401 traz resource_metadata apontando para o documento da função', async () => {
    const response = unauthorized(URL, 'missing')
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="https://ref.supabase.co/functions/v1/mcp/.well-known/oauth-protected-resource"',
    )
    expect(unauthorized(URL, 'invalid').headers.get('WWW-Authenticate')).toContain('error="invalid_token"')
  })

  it('o documento aponta o Supabase Auth como servidor de autorização', () => {
    expect(protectedResourceMetadata(`${URL}/`)).toMatchObject({
      resource: 'https://ref.supabase.co/functions/v1/mcp',
      authorization_servers: ['https://ref.supabase.co/auth/v1'],
    })
  })

  it('pelo rewrite da Vercel, anuncia o endereço público (RFC 9728)', async () => {
    const PUBLIC = 'https://lanabiel.vercel.app/mcp'
    const viaVercel = endpointFor(new globalThis.URL(`${URL}/functions/v1/mcp?via=public`), URL, PUBLIC)
    expect(viaVercel).toEqual({
      resource: PUBLIC,
      metadata: 'https://lanabiel.vercel.app/.well-known/oauth-protected-resource/mcp',
    })
    expect(unauthorized(URL, 'missing', viaVercel).headers.get('WWW-Authenticate')).toBe(
      'Bearer resource_metadata="https://lanabiel.vercel.app/.well-known/oauth-protected-resource/mcp"',
    )
    expect(await metadataResponse(URL, viaVercel).json()).toMatchObject({
      resource: PUBLIC,
      authorization_servers: ['https://ref.supabase.co/auth/v1'],
    })
  })

  it('sem a marca ou sem MCP_PUBLIC_URL, fica o endereço do Supabase', () => {
    const direct = { resource: 'https://ref.supabase.co/functions/v1/mcp', metadata: `https://ref.supabase.co/functions/v1/mcp${PRM_PATH}` }
    expect(endpointFor(new globalThis.URL(`${URL}/functions/v1/mcp`), URL, 'https://lanabiel.vercel.app/mcp')).toEqual(direct)
    expect(endpointFor(new globalThis.URL(`${URL}/functions/v1/mcp?via=public`), URL, null)).toEqual(direct)
  })

  it('innerPath entende os dois prefixos', () => {
    expect(innerPath('/mcp')).toBe('/')
    expect(innerPath('/mcp/')).toBe('/')
    expect(innerPath(`/mcp${PRM_PATH}`)).toBe(PRM_PATH)
    expect(innerPath(`/functions/v1/mcp${PRM_PATH}`)).toBe(PRM_PATH)
  })

  it('bearerToken', () => {
    expect(bearerToken('Bearer abc.def')).toBe('abc.def')
    expect(bearerToken('bearer  xyz ')).toBe('xyz')
    expect(bearerToken('Basic abc')).toBeNull()
    expect(bearerToken(null)).toBeNull()
  })
})

describe('agenda', () => {
  it('evento anual cai em cada ano do intervalo; 29/02 vira 28/02', () => {
    expect(yearlyOccurrences('2024-11-17', '2026-01-01', '2027-12-31')).toEqual(['2026-11-17', '2027-11-17'])
    expect(yearlyOccurrences('2024-02-29', '2025-01-01', '2025-12-31')).toEqual(['2025-02-28'])
    expect(yearlyOccurrences('2027-03-01', '2026-01-01', '2026-12-31')).toEqual([])
  })

  it('validateEvent espelha o calendar_events_format dos quatro tipos', () => {
    const base = { kind: 'date' as const, title: 'Jantar', starts_on: '2026-11-01' }
    expect(validateEvent(base)).toBeNull()
    expect(validateEvent({ ...base, kind: 'viagem' as never })?.field).toBe('kind')
    expect(validateEvent({ ...base, ends_on: '2026-11-02' })?.field).toBe('ends_on')
    expect(validateEvent({ ...base, kind: 'compromisso', ends_on: '2026-10-31' })?.field).toBe('ends_on')
    expect(validateEvent({ ...base, repeats_yearly: true })?.field).toBe('repeats_yearly')
    expect(validateEvent({ ...base, kind: 'lembrete', place: 'Mocotó' })?.field).toBe('place')
    expect(validateEvent({ ...base, starts_at: '25:00' })?.field).toBe('starts_at')
    expect(validateEvent({ ...base, title: '  ' })?.field).toBe('title')
  })

  it('tripState deriva de hoje', () => {
    expect(tripState('2026-11-01', '2026-11-05', '2026-10-19')).toBe('planned')
    expect(tripState('2026-10-18', '2026-10-20', '2026-10-19')).toBe('ongoing')
    expect(tripState('2026-10-01', '2026-10-05', '2026-10-19')).toBe('done')
  })

  it('todayBr usa o fuso de São Paulo', () => {
    // 02:00 UTC de 20/10 ainda é 19/10 em São Paulo (UTC−3).
    expect(todayBr(new Date('2026-10-20T02:00:00Z'))).toBe('2026-10-19')
  })
})
