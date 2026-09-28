// Fronteira de dados da Lista — as cascatas da seção 7 e a tradução de erro do
// PostgREST, com um `db` falso mínimo (só o que as funções usam). O que o
// banco REALMENTE responde está em supabase/tests/list.test.ts.
// Spec: .agent/Tasks/fase-4-lista.md, seções 5 e 7 (A15/A16, lado da fronteira)

import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { ItemDraft } from '../domain/list'
import type { PrepareResult } from './avatar'
import {
  addPhoto,
  createItem,
  deleteItem,
  loadList,
  markDone,
  removePhoto,
  replaceItemPhoto,
  signedUrls,
  translateError,
  updateItem,
} from './list'
import type { MarkDoneInput } from './list'
import type { ListItemRow } from './listRow'
import { loadListExport } from './listSummary'

type Response = { data: unknown; error: { code?: string; message: string; hint?: string | null } | null }

interface FakeOptions {
  session?: boolean
  /**
   * `"tabela.op"` → resposta, ou função do `.range(from, to)` pedido (para
   * paginar). Padrão: `{ data: [], error: null }`.
   */
  responses?: Record<string, Response | ((range: [number, number] | null) => Response)>
  /** Upload n (0-based, na ordem das chamadas) falha? */
  uploadFails?: (n: number) => boolean
  removeError?: string
  rpc?: Response
  /** A RPC rejeita (o `fetch` caiu antes de haver resposta). */
  rpcThrows?: Error
}

/** Um cliente falso que registra, em ordem, cada operação que chega ao "banco". */
function fakeDb(options: FakeOptions = {}) {
  const log: string[] = []
  const payloads: Record<string, unknown> = {}
  let uploads = 0

  function from(table: string) {
    let op = 'select'
    let range: [number, number] | null = null
    const builder = {
      select: () => builder,
      insert: (v: unknown) => ((op = 'insert'), (payloads[`${table}.insert`] = v), builder),
      update: (v: unknown) => ((op = 'update'), (payloads[`${table}.update`] = v), builder),
      upsert: (v: unknown) => ((op = 'upsert'), (payloads[`${table}.upsert`] = v), builder),
      delete: () => ((op = 'delete'), builder),
      eq: () => builder,
      order: () => builder,
      range: (from: number, to: number) => ((range = [from, to]), builder),
      single: () => builder,
      then(resolve: (r: Response) => unknown, reject: (e: unknown) => unknown) {
        log.push(range ? `${table}.${op}[${range[0]}-${range[1]}]` : `${table}.${op}`)
        const response = options.responses?.[`${table}.${op}`]
        const value = typeof response === 'function' ? response(range) : response
        return Promise.resolve(value ?? { data: [], error: null }).then(resolve, reject)
      },
    }
    return builder
  }

  const bucket = {
    upload: vi.fn(async (path: string) => {
      const n = uploads++
      // Um tique: deixa as três primeiras em voo ao mesmo tempo.
      await new Promise((r) => setTimeout(r, 1))
      if (options.uploadFails?.(n)) {
        log.push(`upload-failed:${path}`)
        return { data: null, error: { message: `upload ${n} falhou` } }
      }
      log.push(`upload:${path}`)
      return { data: { path }, error: null }
    }),
    remove: vi.fn(async (paths: string[]) => {
      log.push(`remove:${paths.join(',')}`)
      return options.removeError ? { data: null, error: { message: options.removeError } } : { data: [], error: null }
    }),
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({ path, signedUrl: path.includes('bad') ? '' : `https://signed/${path}`, error: path.includes('bad') ? 'x' : null })),
      error: null,
    })),
  }

  const db = {
    auth: {
      getSession: async () => ({
        data: { session: options.session === false ? null : { user: { id: 'u-gabriel' } } },
      }),
    },
    from,
    storage: { from: () => bucket },
    rpc: vi.fn(async (fn: string, args: unknown) => {
      log.push(`rpc:${fn}`)
      payloads[`rpc:${fn}`] = args
      if (options.rpcThrows) throw options.rpcThrows
      return options.rpc ?? { data: { status: 'done' }, error: null }
    }),
  }
  return { db: db as unknown as SupabaseClient<Database>, log, payloads, bucket }
}

const okPrepare = vi.fn(async (): Promise<PrepareResult> => ({ status: 'ok', blob: new Blob(['x']), extension: 'webp' }))
const files = (n: number) => Array.from({ length: n }, (_, i) => new File([String(i)], `f${i}.jpg`, { type: 'image/jpeg' }))

function input(overrides: Partial<MarkDoneInput> = {}): MarkDoneInput {
  return {
    item: { id: 'item-1' },
    doneOn: '2026-09-26',
    doneWith: 'both',
    soloBy: 'u-lana',
    rating: 4,
    memory: 'Pedimos o torresmo.',
    files: files(3),
    ...overrides,
  }
}

const row: ListItemRow = {
  id: 'item-1',
  couple_id: 'couple-1',
  category: 'filme',
  name: 'Past Lives',
  note: null,
  link: null,
  photo_path: null,
  featured: false,
  status: 'want',
  rating: null,
  added_by: 'u-gabriel',
  created_at: '2026-09-20T12:00:00Z',
  updated_at: '2026-09-20T12:00:00Z',
  done_on: null,
  done_with: null,
  done_solo_by: null,
  address: null,
  city: null,
  state: null,
  country: null,
  country_code: null,
  lat: null,
  lng: null,
  region: null,
  venue: null,
  highlights: [],
  platform: 'MUBI',
  seasons: null,
}

const draft: ItemDraft = {
  category: 'filme',
  name: 'Past Lives',
  note: null,
  link: null,
  featured: false,
  place: null,
  region: null,
  venue: null,
  highlights: [],
  platform: 'MUBI',
  seasons: null,
}

describe('leitura', () => {
  it('sem sessão → unauthenticated, sem tocar nas tabelas', async () => {
    const { db, log } = fakeDb({ session: false })
    expect(await loadList(db)).toEqual({ status: 'unauthenticated' })
    expect(log).toEqual([])
  })

  it('três selects; qualquer um com erro derruba o todo', async () => {
    const { db, log } = fakeDb({ responses: { 'list_photos.select': { data: null, error: { message: 'pausado' } } } })
    expect(await loadList(db)).toEqual({ status: 'error', cause: 'pausado' })
    expect(log.sort()).toEqual(['list_items.select[0-999]', 'list_memories.select[0-999]', 'list_photos.select[0-999]'])
  })

  it('pagina de 1000 em 1000 até a página incompleta: 1000 + 5 fotos → 1005, nas duas páginas', async () => {
    const photo = (n: number) => ({
      id: `p-${n}`,
      item_id: 'item-1',
      couple_id: 'couple-1',
      path: `couple-1/memory/${n}.webp`,
      created_at: '2026-09-20T12:00:00Z',
    })
    const { db, log } = fakeDb({
      responses: {
        'list_photos.select': (range) => {
          const [from, to] = range!
          const rows = Array.from({ length: 1005 }, (_, n) => photo(n)).slice(from, to + 1)
          return { data: rows, error: null }
        },
      },
    })
    const result = await loadList(db)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rows.photos).toHaveLength(1005)
    expect(result.rows.photos.at(-1)).toMatchObject({ id: 'p-1004', path: 'couple-1/memory/1004.webp' })
    expect(log.filter((l) => l.startsWith('list_photos'))).toEqual(['list_photos.select[0-999]', 'list_photos.select[1000-1999]'])
  })

  it('erro na segunda página derruba o todo — metade da tabela não é resultado', async () => {
    const { db } = fakeDb({
      responses: {
        'list_items.select': (range) =>
          range![0] === 0
            ? { data: Array.from({ length: 1000 }, (_, n) => ({ ...row, id: `i-${n}` })), error: null }
            : { data: null, error: { message: 'caiu na página 2' } },
      },
    })
    expect(await loadList(db)).toEqual({ status: 'error', cause: 'caiu na página 2' })
  })

  it('ok mapeia para o domínio (camelCase)', async () => {
    const { db } = fakeDb({ responses: { 'list_items.select': { data: [row], error: null } } })
    const result = await loadList(db)
    expect(result.status === 'ok' && result.rows.items[0]).toMatchObject({ id: 'item-1', category: 'filme', platform: 'MUBI', photoPath: null, place: null })
  })

  it('signedUrls: um lote só, sem repetidos nem nulos; o que não assinou fica fora', async () => {
    const { db, bucket } = fakeDb()
    const result = await signedUrls(db, ['c/item/a.webp', null, 'c/item/a.webp', 'c/memory/bad.webp'])
    expect(bucket.createSignedUrls).toHaveBeenCalledTimes(1)
    expect(bucket.createSignedUrls).toHaveBeenCalledWith(['c/item/a.webp', 'c/memory/bad.webp'], 3600)
    expect(result.status === 'ok' && [...result.rows.keys()]).toEqual(['c/item/a.webp'])
  })
})

describe('export (R27) sobre loadList', () => {
  it('pagina como a Lista, conta as fotos por item e nunca devolve caminho; itens em ordem de criação', async () => {
    const photos = Array.from({ length: 1003 }, (_, n) => ({
      id: `p-${n}`,
      item_id: n < 1000 ? 'item-1' : 'item-2',
      couple_id: 'couple-1',
      path: `couple-1/memory/${n}.webp`,
      created_at: '2026-09-20T12:00:00Z',
    }))
    const { db } = fakeDb({
      responses: {
        // `loadList` pede do mais novo ao mais velho.
        'list_items.select': {
          data: [
            { ...row, id: 'item-2', created_at: '2026-09-21T12:00:00Z', photo_path: 'couple-1/item/capa.webp' },
            { ...row, id: 'item-1' },
          ],
          error: null,
        },
        'list_photos.select': (range) => ({ data: photos.slice(range![0], range![1] + 1), error: null }),
      },
    })
    const result = await loadListExport(db)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rows.items.map((i) => i.id)).toEqual(['item-1', 'item-2'])
    expect([...result.rows.photoCounts]).toEqual([
      ['item-1', 1000],
      ['item-2', 3],
    ])
    expect(Object.keys(result.rows)).toEqual(['items', 'memories', 'photoCounts'])
  })

  it('sem sessão → unauthenticated; erro numa tabela derruba o todo', async () => {
    expect(await loadListExport(fakeDb({ session: false }).db)).toEqual({ status: 'unauthenticated' })
    const { db } = fakeDb({ responses: { 'list_memories.select': { data: null, error: { message: 'pausado' } } } })
    expect(await loadListExport(db)).toEqual({ status: 'error', cause: 'pausado' })
  })
})

describe('tradução de erro do PostgREST', () => {
  it('HINT list_photos_limit → photo_limit', () => {
    expect(translateError({ code: '23514', message: 'o item já tem 10 fotos', hint: 'list_photos_limit' })).toEqual({
      status: 'photo_limit',
    })
  })

  it('CHECK list_items_format → invalid com a constraint (lida da mensagem)', () => {
    const error = {
      code: '23514',
      message: 'new row for relation "list_items" violates check constraint "list_items_format"',
      hint: null,
    }
    expect(translateError(error)).toEqual({ status: 'invalid', constraint: 'list_items_format', cause: error.message })
  })

  it('HINT de trigger (data futura) → invalid com a constraint do HINT', () => {
    expect(
      translateError({ code: '23514', message: 'done_on no futuro: 2026-12-01', hint: 'list_items_done_on_future' }),
    ).toMatchObject({ status: 'invalid', constraint: 'list_items_done_on_future' })
  })

  it('FK (item sumiu) → not_found; RLS com sessão → "este espaço mudou"', () => {
    expect(translateError({ code: '23503', message: 'fk' })).toEqual({ status: 'not_found' })
    expect(translateError({ code: '42501', message: 'rls' })).toEqual({
      status: 'error',
      cause: 'este espaço mudou, recarregue a página',
    })
  })

  it('createItem devolve o invalid do CHECK; updateItem com zero linhas → not_found', async () => {
    const { db, payloads } = fakeDb({
      responses: {
        'list_items.insert': {
          data: null,
          error: { code: '23514', message: 'violates check constraint "list_items_format"' },
        },
      },
    })
    expect(await createItem(db, 'couple-1', draft)).toMatchObject({ status: 'invalid', constraint: 'list_items_format' })
    expect(payloads['list_items.insert']).toMatchObject({ couple_id: 'couple-1', category: 'filme', platform: 'MUBI' })
    const updated = await updateItem(db, 'item-1', draft)
    expect(updated).toEqual({ status: 'not_found' })
    // Editar nunca manda categoria nem casal (R14, I1).
    expect(payloads['list_items.update']).not.toHaveProperty('category')
    expect(payloads['list_items.update']).not.toHaveProperty('couple_id')
  })
})

describe('Marcar como feito — cascata (seção 7)', () => {
  it('ordem: todas as fotos sobem ANTES da RPC, na pasta memory do casal, e os caminhos vão na RPC', async () => {
    const { db, log, payloads } = fakeDb()
    const result = await markDone(db, 'couple-1', input(), okPrepare)
    expect(result.status).toBe('ok')
    const rpcAt = log.indexOf('rpc:mark_item_done')
    expect(log.filter((l) => l.startsWith('upload:'))).toHaveLength(3)
    expect(log.slice(0, rpcAt).every((l) => l.startsWith('upload:'))).toBe(true)
    const args = payloads['rpc:mark_item_done'] as Record<string, unknown>
    expect(args.p_photo_paths).toHaveLength(3)
    for (const path of args.p_photo_paths as string[]) expect(path).toMatch(/^couple-1\/memory\/[0-9a-f-]{36}\.webp$/)
    // `both` nunca manda quem fez sozinho.
    expect(args).toMatchObject({ p_item: 'item-1', p_done_with: 'both', p_solo_by: null, p_rating: 4 })
    expect(result.status === 'ok' && result.photoPaths).toEqual(args.p_photo_paths)
  })

  it('até 3 uploads por vez', async () => {
    const { db, bucket } = fakeDb()
    let inFlight = 0
    let peak = 0
    const original = bucket.upload.getMockImplementation()!
    bucket.upload.mockImplementation(async (path: string) => {
      peak = Math.max(peak, ++inFlight)
      const r = await original(path)
      inFlight--
      return r
    })
    await markDone(db, 'couple-1', input({ files: files(7) }), okPrepare)
    expect(peak).toBe(3)
  })

  it('falha num upload: a RPC não é chamada e as que subiram são apagadas', async () => {
    const { db, log } = fakeDb({ uploadFails: (n) => n === 1 })
    const result = await markDone(db, 'couple-1', input(), okPrepare)
    expect(result).toMatchObject({ status: 'upload_failed', index: 1 })
    expect(log).not.toContain('rpc:mark_item_done')
    const up = log.filter((l) => l.startsWith('upload:')).map((l) => l.slice('upload:'.length))
    expect(up.length).toBeGreaterThan(0)
    const removed = log.filter((l) => l.startsWith('remove:')).flatMap((l) => l.slice('remove:'.length).split(','))
    expect(removed.sort()).toEqual(up.sort())
  })

  it('foto recusada na redução: nada sobe, nada é gravado', async () => {
    const { db, log } = fakeDb()
    const prepare = vi
      .fn<(f: File) => Promise<PrepareResult>>()
      .mockResolvedValueOnce({ status: 'ok', blob: new Blob(['x']), extension: 'webp' })
      .mockResolvedValueOnce({ status: 'not_image' })
    expect(await markDone(db, 'couple-1', input(), prepare)).toEqual({
      status: 'photo_rejected',
      index: 1,
      reason: 'not_image',
    })
    expect(log).toEqual([])
  })

  it('already_done: as fotos subidas são apagadas e o status volta', async () => {
    const { db, log } = fakeDb({ rpc: { data: { status: 'already_done' }, error: null } })
    expect(await markDone(db, 'couple-1', input(), okPrepare)).toEqual({ status: 'already_done' })
    const rpcAt = log.indexOf('rpc:mark_item_done')
    const removed = log.slice(rpcAt + 1).find((l) => l.startsWith('remove:'))!
    expect(removed.slice('remove:'.length).split(',')).toHaveLength(3)
  })

  it('not_found e erro da RPC (ex.: 11ª foto) também apagam as subidas', async () => {
    const notFound = fakeDb({ rpc: { data: { status: 'not_found' }, error: null } })
    expect(await markDone(notFound.db, 'couple-1', input(), okPrepare)).toEqual({ status: 'not_found' })
    expect(notFound.log.at(-1)).toMatch(/^remove:/)

    const limit = fakeDb({ rpc: { data: null, error: { code: '23514', message: 'x', hint: 'list_photos_limit' } } })
    expect(await markDone(limit.db, 'couple-1', input(), okPrepare)).toEqual({ status: 'photo_limit' })
    expect(limit.log.at(-1)).toMatch(/^remove:/)
  })

  it('erro de transporte (fetch rejeitou) → NÃO apaga as fotos e pede para conferir', async () => {
    const { db, log } = fakeDb({ rpcThrows: new TypeError('Failed to fetch') })
    expect(await markDone(db, 'couple-1', input(), okPrepare)).toEqual({
      status: 'error',
      cause: 'A conexão caiu. Confira se o item ficou marcado antes de tentar de novo',
    })
    expect(log.filter((l) => l.startsWith('upload:'))).toHaveLength(3)
    expect(log.some((l) => l.startsWith('remove:'))).toBe(false)
  })

  it('erro sem code (o postgrest-js devolve code "" quando o fetch cai) → NÃO apaga', async () => {
    const { db, log } = fakeDb({ rpc: { data: null, error: { code: '', message: 'TypeError: Failed to fetch' } } })
    expect(await markDone(db, 'couple-1', input(), okPrepare)).toEqual({
      status: 'error',
      cause: 'A conexão caiu. Confira se o item ficou marcado antes de tentar de novo',
    })
    expect(log.some((l) => l.startsWith('remove:'))).toBe(false)

    const gateway = fakeDb({ rpc: { data: null, error: { message: '<html>502 Bad Gateway</html>' } } })
    expect((await markDone(gateway.db, 'couple-1', input(), okPrepare)).status).toBe('error')
    expect(gateway.log.some((l) => l.startsWith('remove:'))).toBe(false)
  })

  it('erro com code do PostgREST (PGRST…) prova que nada gravou → apaga as subidas', async () => {
    const { db, log } = fakeDb({ rpc: { data: null, error: { code: 'PGRST202', message: 'função não encontrada' } } })
    expect(await markDone(db, 'couple-1', input(), okPrepare)).toEqual({ status: 'error', cause: 'função não encontrada' })
    expect(log.at(-1)).toMatch(/^remove:/)
  })

  it('solo manda quem fez; memória vazia vai nula; sem fotos não sobe nada', async () => {
    const { db, payloads, log } = fakeDb()
    await markDone(db, 'couple-1', input({ doneWith: 'solo', memory: '   ', files: [] }), okPrepare)
    expect(payloads['rpc:mark_item_done']).toMatchObject({ p_solo_by: 'u-lana', p_memory: null, p_photo_paths: [] })
    expect(log).toEqual(['rpc:mark_item_done'])
  })

  it('sem sessão: nada sobe', async () => {
    const { db, log } = fakeDb({ session: false })
    expect(await markDone(db, 'couple-1', input(), okPrepare)).toEqual({ status: 'unauthenticated' })
    expect(log).toEqual([])
  })
})

describe('Apagar item — cascata (seção 7)', () => {
  const item = { id: 'item-1', photoPath: 'couple-1/item/capa.webp' }
  const photos = [
    { itemId: 'item-1', path: 'couple-1/memory/a.webp' },
    { itemId: 'outro', path: 'couple-1/memory/nao.webp' },
    { itemId: 'item-1', path: 'couple-1/memory/b.webp' },
  ]

  it('relê as fotos do item, apaga os arquivos (foto do item + fotos DELE), e só então a linha', async () => {
    const { db, log } = fakeDb()
    expect(await deleteItem(db, item, photos)).toEqual({ status: 'ok' })
    expect(log).toEqual([
      'list_photos.select[0-999]',
      'remove:couple-1/item/capa.webp,couple-1/memory/a.webp,couple-1/memory/b.webp',
      'list_items.delete',
    ])
  })

  it('foto que só existe no banco (a outra pessoa pôs depois da leitura) também sai — a união, sem repetir', async () => {
    const { db, log } = fakeDb({
      responses: {
        'list_photos.select': { data: [{ path: 'couple-1/memory/a.webp' }, { path: 'couple-1/memory/nova.webp' }], error: null },
      },
    })
    expect(await deleteItem(db, item, photos)).toEqual({ status: 'ok' })
    const removed = log.find((l) => l.startsWith('remove:'))!.slice('remove:'.length).split(',')
    expect(removed.sort()).toEqual(
      ['couple-1/item/capa.webp', 'couple-1/memory/a.webp', 'couple-1/memory/b.webp', 'couple-1/memory/nova.webp'].sort(),
    )
    expect(log.at(-1)).toBe('list_items.delete')
  })

  it('a releitura das fotos falhou → error, nenhum arquivo nem linha apagados', async () => {
    const { db, log } = fakeDb({ responses: { 'list_photos.select': { data: null, error: { message: 'rede' } } } })
    expect(await deleteItem(db, item, photos)).toEqual({ status: 'error', cause: 'rede' })
    expect(log).toEqual(['list_photos.select[0-999]'])
  })

  it('arquivos falharam → nada foi apagado, a linha nem é tentada', async () => {
    const { db, log } = fakeDb({ removeError: 'storage fora' })
    expect(await deleteItem(db, item, photos)).toEqual({ status: 'error', cause: 'storage fora' })
    expect(log).not.toContain('list_items.delete')
  })

  it('arquivos saíram e a linha não → files_deleted_row_failed', async () => {
    const { db } = fakeDb({ responses: { 'list_items.delete': { data: null, error: { message: 'rede' } } } })
    expect(await deleteItem(db, item, photos)).toEqual({ status: 'files_deleted_row_failed', cause: 'rede' })
  })

  it('item sem arquivo: só a linha; zero linhas (a outra pessoa já apagou) é ok', async () => {
    const { db, log } = fakeDb()
    expect(await deleteItem(db, { id: 'item-2', photoPath: null }, [])).toEqual({ status: 'ok' })
    expect(log).toEqual(['list_photos.select[0-999]', 'list_items.delete'])
  })
})

describe('fotos avulsas e foto do item', () => {
  const file = files(1)[0]

  it('addPhoto: insert falhou por photo_limit → apaga o arquivo recém-subido', async () => {
    const { db, log } = fakeDb({
      responses: { 'list_photos.insert': { data: null, error: { code: '23514', message: 'x', hint: 'list_photos_limit' } } },
    })
    expect(await addPhoto(db, 'couple-1', 'item-1', file, okPrepare)).toEqual({ status: 'photo_limit' })
    const uploaded = log[0].slice('upload:'.length)
    expect(uploaded).toMatch(/^couple-1\/memory\//)
    expect(log).toEqual([`upload:${uploaded}`, 'list_photos.insert', `remove:${uploaded}`])
  })

  it('removePhoto: linha primeiro, arquivo depois', async () => {
    const { db, log } = fakeDb()
    expect(await removePhoto(db, { id: 'p1', path: 'couple-1/memory/a.webp' })).toEqual({ status: 'ok', value: null })
    expect(log).toEqual(['list_photos.delete', 'remove:couple-1/memory/a.webp'])
  })

  it('removePhoto: a linha falhou → o arquivo fica', async () => {
    const { db, log } = fakeDb({ responses: { 'list_photos.delete': { data: null, error: { message: 'rede' } } } })
    expect((await removePhoto(db, { id: 'p1', path: 'couple-1/memory/a.webp' })).status).toBe('error')
    expect(log).toEqual(['list_photos.delete'])
  })

  it('replaceItemPhoto: sobe a nova em item/ → grava photo_path → apaga a antiga', async () => {
    const { db, log, payloads } = fakeDb({
      responses: { 'list_items.update': { data: [{ ...row, photo_path: 'couple-1/item/nova.webp' }], error: null } },
    })
    const result = await replaceItemPhoto(db, 'couple-1', { id: 'item-1', photoPath: 'couple-1/item/velha.webp' }, file, okPrepare)
    expect(result.status).toBe('ok')
    const uploaded = log[0].slice('upload:'.length)
    expect(uploaded).toMatch(/^couple-1\/item\/[0-9a-f-]{36}\.webp$/)
    expect(payloads['list_items.update']).toEqual({ photo_path: uploaded })
    expect(log).toEqual([`upload:${uploaded}`, 'list_items.update', 'remove:couple-1/item/velha.webp'])
  })

  it('replaceItemPhoto: update falhou → apaga a recém-subida e mantém a antiga', async () => {
    const { db, log } = fakeDb({ responses: { 'list_items.update': { data: null, error: { message: 'rede' } } } })
    const result = await replaceItemPhoto(db, 'couple-1', { id: 'item-1', photoPath: 'couple-1/item/velha.webp' }, file, okPrepare)
    expect(result.status).toBe('error')
    const uploaded = log[0].slice('upload:'.length)
    expect(log).toEqual([`upload:${uploaded}`, 'list_items.update', `remove:${uploaded}`])
  })

  it('replaceItemPhoto: upload falhou → nada muda', async () => {
    const { db, log } = fakeDb({ uploadFails: () => true })
    expect((await replaceItemPhoto(db, 'couple-1', { id: 'item-1', photoPath: null }, file, okPrepare)).status).toBe('error')
    expect(log.some((l) => l.startsWith('list_items'))).toBe(false)
  })
})
