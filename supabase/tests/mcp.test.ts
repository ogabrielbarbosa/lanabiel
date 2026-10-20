// A função `mcp` PUBLICADA, contra o projeto online (ADR 0014), com o
// cliente MCP oficial e o token de sessão de usuários `…@test.local`. Prova o
// que o teste em memória não alcança: o token vira RLS, e o que o MCP grava é
// o que o app lê. `npm run test:db -- supabase/tests/mcp.test.ts`.
//
// Spec: .agent/Tasks/mcp-server.md, A1–A3, A5, A6, A10

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createHash, randomBytes } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { consentApi } from '../../src/auth/consentApi'
import { ANON_KEY, URL as SUPABASE_URL, admin, coupleOfTwo, userFactory } from './harness'
import type { SignedUser } from './harness'

const MCP_URL = `${SUPABASE_URL}/functions/v1/mcp`
const factory = userFactory('mcp')

let a: SignedUser
let b: SignedUser
let outsider: SignedUser
let clientA: Client
let clientOutsider: Client

async function connect(user: SignedUser): Promise<Client> {
  const { data } = await user.db.auth.getSession()
  const token = data.session!.access_token
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  const client = new Client({ name: 'lanabiel-teste', version: '1' })
  await client.connect(transport)
  return client
}

/** Chama e devolve o JSON da resposta, com `isError` junto. */
async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as { type: string; text: string }[])[0]?.text ?? '{}'
  return { isError: result.isError === true, body: JSON.parse(text) }
}

const MOCOTO = {
  address: 'Avenida Nossa Senhora do Loreto, 1100',
  city: 'São Paulo',
  state: 'São Paulo',
  country: 'Brasil',
  countryCode: 'BR',
  lat: -23.4867214,
  lng: -46.5815741,
  label: 'Mocotó',
  source: 'photon',
}

beforeAll(async () => {
  await factory.sweep()
  ;({ a, b } = await coupleOfTwo(factory, 'mcp'))
  const other = await coupleOfTwo(factory, 'mcpout')
  outsider = other.a
  clientA = await connect(a)
  clientOutsider = await connect(outsider)
})

afterAll(async () => {
  await clientA?.close()
  await clientOutsider?.close()
  await factory.cleanup()
})

describe('MCP publicado', () => {
  it('A1: sem token responde 401 com o caminho do OAuth', async () => {
    const response = await fetch(MCP_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=')
    const bad = await fetch(MCP_URL, { method: 'POST', headers: { authorization: 'Bearer nao.e.token' }, body: '{}' })
    expect(bad.status).toBe(401)
  })

  it('A2: tools/list traz as treze ferramentas', async () => {
    const { tools } = await clientA.listTools()
    expect(tools).toHaveLength(13)
  })

  it('get_context diz quem é quem', async () => {
    const { isError, body } = await call(clientA, 'get_context')
    expect(isError).toBe(false)
    expect(body.me.name).toBe('mcp-a')
    expect(body.partner.name).toBe('mcp-b')
    expect(body.list.categories).toHaveLength(8)
  })

  let itemId = ''

  it('A3: add_list_item grava; a outra pessoa vê pelo app; outro casal não', async () => {
    const { isError, body } = await call(clientA, 'add_list_item', {
      category: 'restaurante',
      name: 'Mocotó',
      note: 'Pedir o baião de dois.',
      link: 'https://www.instagram.com/reel/DAbc123/',
      place: MOCOTO,
    })
    expect(isError).toBe(false)
    expect(body.item).toMatchObject({ name: 'Mocotó', category: 'restaurante', added_by: 'mcp-a', status: 'want' })
    itemId = body.item.id

    const { data: seenByB } = await b.db.from('list_items').select('name, added_by, city').eq('id', itemId)
    expect(seenByB).toEqual([{ name: 'Mocotó', added_by: a.id, city: 'São Paulo' }])

    const { data: seenByOutsider } = await outsider.db.from('list_items').select('id').eq('id', itemId)
    expect(seenByOutsider).toEqual([])
    const viaMcp = await call(clientOutsider, 'get_list_item', { id: itemId })
    expect(viaMcp.body.status).toBe('not_found')
  })

  it('A5: duplicata é recusada sem allow_duplicate e aceita com ele', async () => {
    const refused = await call(clientA, 'add_list_item', { category: 'restaurante', name: 'Restaurante Mocotó', place: MOCOTO })
    expect(refused.isError).toBe(true)
    expect(refused.body.status).toBe('possible_duplicate')
    expect(refused.body.matches[0].id).toBe(itemId)

    const forced = await call(clientA, 'add_list_item', { category: 'restaurante', name: 'Restaurante Mocotó', place: MOCOTO, allow_duplicate: true })
    expect(forced.isError).toBe(false)
    const deleted = await call(clientA, 'delete_list_item', { id: forced.body.item.id })
    expect(deleted.body).toMatchObject({ status: 'ok', deleted: { name: 'Restaurante Mocotó' } })
  })

  it('validação do espelho volta com o campo', async () => {
    const { isError, body } = await call(clientA, 'add_list_item', { category: 'restaurante', name: 'Sem lugar' })
    expect(isError).toBe(true)
    expect(body).toMatchObject({ status: 'invalid', field: 'place' })
  })

  it('search_list acha sem acento e filtra por proximidade', async () => {
    const byText = await call(clientA, 'search_list', { query: 'mocoto' })
    expect(byText.body.items.map((i: { id: string }) => i.id)).toContain(itemId)
    const near = await call(clientA, 'search_list', { near: { lat: -23.49, lng: -46.58, radius_km: 5 } })
    expect(near.body.items[0]).toMatchObject({ id: itemId })
    const far = await call(clientA, 'search_list', { near: { lat: -28.45, lng: -52.2, radius_km: 5 } })
    expect(far.body.total).toBe(0)
  })

  it('update_list_item e save_list_memory', async () => {
    const updated = await call(clientA, 'update_list_item', { id: itemId, featured: true, note: 'Baião de dois e torresmo.' })
    expect(updated.body.item).toMatchObject({ featured: true, note: 'Baião de dois e torresmo.', name: 'Mocotó' })
    const memory = await call(clientA, 'save_list_memory', { id: itemId, body: 'Fila de uma hora, valeu.' })
    expect(memory.isError).toBe(false)
    const detail = await call(clientA, 'get_list_item', { id: itemId })
    expect(detail.body.memories).toEqual([expect.objectContaining({ by: 'mcp-a', mine: true, body: 'Fila de uma hora, valeu.' })])
  })

  it('A6: mark_list_item_done solo pela outra pessoa grava done_solo_by = ela', async () => {
    const { isError, body } = await call(clientA, 'mark_list_item_done', { id: itemId, with: 'solo', solo_by: 'partner', rating: 4, done_on: '2026-10-01' })
    expect(isError).toBe(false)
    expect(body.item).toMatchObject({ status: 'done', done_with: 'solo', done_solo_by: 'mcp-b', rating: 4, rating_label: 'Amamos' })
    const { data } = await b.db.from('list_items').select('done_solo_by').eq('id', itemId).single()
    expect(data!.done_solo_by).toBe(b.id)
    const again = await call(clientA, 'mark_list_item_done', { id: itemId, with: 'both' })
    expect(again.body.status).toBe('already_done')
  })

  it('A10: create_event de um date com list_item_id grava o vínculo e aparece em list_events', async () => {
    const created = await call(clientA, 'create_event', { kind: 'date', title: 'Jantar no Mocotó', starts_on: '2026-12-12', starts_at: '20:30', place: 'Mocotó', list_item_id: itemId })
    expect(created.isError).toBe(false)
    const { data } = await b.db.from('calendar_events').select('list_item_id, all_day, starts_at').eq('id', created.body.id).single()
    expect(data).toEqual({ list_item_id: itemId, all_day: false, starts_at: '20:30:00' })
    const events = await call(clientA, 'list_events', { from: '2026-12-01', to: '2026-12-31' })
    expect(events.body.events).toEqual([expect.objectContaining({ title: 'Jantar no Mocotó', time: '20:30', list_item_id: itemId })])
    // Viagem não está no enum: o esquema recusa antes da ferramenta (texto, não JSON).
    const trip = await clientA.callTool({ name: 'create_event', arguments: { kind: 'viagem', title: 'x', starts_on: '2026-12-01' } })
    expect(trip.isError).toBe(true)
  })

  it('photo_url vira a foto do item na pasta do casal; apagar leva o arquivo', async () => {
    // picsum redireciona para o CDN: prova o redirecionamento conferido também.
    const { isError, body } = await call(clientA, 'add_list_item', {
      category: 'parque',
      name: 'Parque de teste com foto',
      place: { ...MOCOTO, label: 'Parque', lat: -23.5874, lng: -46.6576 },
      photo_url: 'https://picsum.photos/id/10/400/300.jpg',
    })
    expect(isError).toBe(false)
    expect(body).toMatchObject({ photo: 'saved', item: { has_photo: true } })
    const { data } = await b.db.from('list_items').select('photo_path, couple_id').eq('id', body.item.id).single()
    expect(data!.photo_path).toMatch(new RegExp(`^${data!.couple_id}/item/[0-9a-f-]+\\.(jpg|webp)$`))
    const folder = data!.photo_path!.split('/').slice(0, 2).join('/')
    const name = data!.photo_path!.split('/')[2]
    const { data: files } = await b.db.storage.from('couple-media').list(folder, { search: name })
    expect(files).toHaveLength(1)

    const deleted = await call(clientA, 'delete_list_item', { id: body.item.id })
    expect(deleted.body.deleted.files_removed).toBe(1)
    const { data: after } = await b.db.storage.from('couple-media').list(folder, { search: name })
    expect(after).toHaveLength(0)
  })

  it('foto que não é jpeg/webp é pulada e o item fica', async () => {
    const { isError, body } = await call(clientA, 'add_list_item', {
      category: 'parque',
      name: 'Parque sem foto',
      place: { ...MOCOTO, label: 'Parque', lat: -23.6, lng: -46.7 },
      photo_url: 'https://www.google.com/robots.txt',
    })
    expect(isError).toBe(false)
    expect(body).toMatchObject({ photo: 'skipped', item: { has_photo: false } })
    await call(clientA, 'delete_list_item', { id: body.item.id })
  })

  it('find_place no ar resolve uma cidade', async () => {
    const { isError, body } = await call(clientA, 'find_place', { query: 'Gramado', mode: 'city' })
    expect(isError).toBe(false)
    expect(body.candidates[0]).toMatchObject({ countryCode: 'BR', city: expect.stringMatching(/Gramado/) })
  })

  it('OAuth 2.1 de ponta a ponta: registro dinâmico, consentimento, código → token → MCP', async () => {
    const AUTH = `${SUPABASE_URL}/auth/v1`
    const apikey = { apikey: ANON_KEY }
    const redirectUri = 'http://localhost:9876/callback'

    // 1. O cliente se registra sozinho, como o Claude faz.
    const registered = await fetch(`${AUTH}/oauth/clients/register`, {
      method: 'POST',
      headers: { ...apikey, 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Cliente de teste do MCP',
        redirect_uris: [redirectUri],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      }),
    })
    expect(registered.status).toBeLessThan(300)
    const client = (await registered.json()) as { client_id: string }

    try {
      // 2. /authorize com PKCE manda ao consentimento do app.
      const verifier = randomBytes(32).toString('base64url')
      const challenge = createHash('sha256').update(verifier).digest('base64url')
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: client.client_id,
        redirect_uri: redirectUri,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: 'xyz',
      })
      const authorize = await fetch(`${AUTH}/oauth/authorize?${params}`, { headers: apikey, redirect: 'manual' })
      const consentUrl = new globalThis.URL(authorize.headers.get('location')!)
      expect(consentUrl.pathname).toBe('/oauth/consent')
      const authorizationId = consentUrl.searchParams.get('authorization_id')!

      // 3. O que a tela faz: lê o pedido e aprova, com a sessão da pessoa.
      const consent = consentApi(a.db)
      const details = await consent.details(authorizationId)
      expect(details).toMatchObject({ status: 'ask', request: { clientName: 'Cliente de teste do MCP', redirectUri } })
      const approved = await consent.approve(authorizationId)
      expect(approved.status).toBe('redirect')
      const back = new globalThis.URL((approved as { url: string }).url)
      expect(back.searchParams.get('state')).toBe('xyz')

      // 4. Código → token.
      const token = await fetch(`${AUTH}/oauth/token`, {
        method: 'POST',
        headers: { ...apikey, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: back.searchParams.get('code')!,
          redirect_uri: redirectUri,
          client_id: client.client_id,
          code_verifier: verifier,
        }),
      })
      expect(token.status).toBe(200)
      const { access_token } = (await token.json()) as { access_token: string }

      // 5. O token do OAuth abre o MCP como a pessoa.
      const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
        requestInit: { headers: { Authorization: `Bearer ${access_token}` } },
      })
      const oauthClient = new Client({ name: 'oauth-teste', version: '1' })
      await oauthClient.connect(transport)
      const { body } = await call(oauthClient, 'get_context')
      expect(body.me.name).toBe('mcp-a')
      await oauthClient.close()
    } finally {
      await admin.auth.admin.oauth.deleteClient(client.client_id)
    }
  })

  it('delete_list_item apaga para os dois', async () => {
    const { body } = await call(clientA, 'delete_list_item', { id: itemId })
    expect(body.status).toBe('ok')
    const { data } = await b.db.from('list_items').select('id').eq('id', itemId)
    expect(data).toEqual([])
  })
})
