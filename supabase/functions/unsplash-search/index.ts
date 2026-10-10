// Edge function `unsplash-search` — Deno. Só liga o `handler.ts` ao mundo.
//
// ADR: .agent/Decisions/0025-viagem-solo-e-capa-do-unsplash.md
//
// Existe para a chave do Unsplash não ir ao navegador. Exige sessão (o
// `verify_jwt` do config aceita a anon key; o `getUser` não), para a cota da
// API não ser gasta por quem não é do app.
//
// Segredo: UNSPLASH_ACCESS_KEY. Sem ele a função responde `unconfigured` e a
// Nova viagem fica só com o _Enviar_.

import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleStock } from './handler.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

  if (request.method !== 'POST') return reply({ status: 'invalid_request' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return reply({ status: 'unauthenticated' }, 401)
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await db.auth.getUser()
  if (error || !data.user) return reply({ status: 'unauthenticated' }, 401)

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    return reply({ status: 'invalid_request' }, 400)
  }

  try {
    const result = await handleStock(body, { accessKey: Deno.env.get('UNSPLASH_ACCESS_KEY') ?? null, fetch })
    return reply(result, result.status === 'invalid_request' ? 400 : 200)
  } catch (e) {
    return reply({ status: 'error', cause: e instanceof Error ? e.message : String(e) }, 500)
  }
})
