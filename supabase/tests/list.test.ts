// Critérios A1, A2 (lado do banco), A5–A10 — .agent/Tasks/fase-4-lista.md, seção 10.
// ADR: .agent/Decisions/0003-lista-tabela-unica-com-check-por-categoria.md (revisão)
//
// Contra o projeto online (ADR 0014). Dois casais `@test.local` e as duas
// direções. As fotos daqui são só LINHAS em `list_photos`: nenhum arquivo sobe
// (o lado do Storage está em storage.test.ts).

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { LIST_CATEGORIES, LIST_LIMITS } from '../../src/domain/list'
import type { GeoPlace, ItemDraft } from '../../src/domain/list'
import { VALIDATION_CASES } from '../../src/domain/listValidationCases'
import { draftToInsert } from '../../src/data/listRow'
import { admin, anonClient, buildScenario, deleteUserAndCouple, signIn, sql } from './harness'
import type { Db, Scenario } from './harness'

// Cliente sem tipo de propósito: estes testes GRAVAM linhas que o tipo gerado
// recusaria (nota em item não feito, colunas de outro formato, argumento nulo
// na RPC) — é o banco, não o TypeScript, que tem de recusá-las.
function raw(db: Db): SupabaseClient {
  return db as unknown as SupabaseClient
}

let scene: Scenario
let asGabriel: SupabaseClient
let asLana: SupabaseClient
let asOutsider: SupabaseClient
const root = raw(admin)

beforeAll(async () => {
  scene = await buildScenario('lst')
  asGabriel = raw(await signIn(scene.gabriel.email))
  asLana = raw(await signIn(scene.lana.email))
  asOutsider = raw(await signIn(scene.outsider.email))
}, 120_000)

// Os itens (e com eles memórias e fotos) caem em cascata com o casal.
afterAll(async () => {
  for (const user of [scene.gabriel, scene.lana, scene.outsider]) await deleteUserAndCouple(user.id)
}, 120_000)

const SP: GeoPlace = {
  address: 'Av. Nossa Senhora do Loreto, 1100',
  city: 'São Paulo',
  state: 'São Paulo',
  country: 'Brasil',
  countryCode: 'BR',
  lat: -23.4867214,
  lng: -46.5815741,
}
const JAPAN: GeoPlace = { ...SP, address: null, city: null, state: null, country: 'Japão', countryCode: 'JP', lat: 36.57, lng: 139.24 }

const geo: ItemDraft = {
  category: 'restaurante',
  name: 'Mocotó',
  note: null,
  link: null,
  featured: false,
  place: SP,
  region: null,
  venue: null,
  highlights: [],
  platform: null,
  seasons: null,
}
const media: ItemDraft = { ...geo, category: 'filme', name: 'Past Lives', place: null, platform: 'MUBI' }

/** Cria um item pelo cliente dado, no casal dado. Lança se o banco recusar. */
async function newItem(db: SupabaseClient, coupleId: string, draft: ItemDraft = media): Promise<string> {
  const { data, error } = await db.from('list_items').insert(draftToInsert(draft, coupleId)).select('id').single()
  if (error) throw new Error(`criar item: ${error.message}`)
  return (data as { id: string }).id
}

/** `ok` se o banco aceitou (e desfaz), ou o SQLSTATE da recusa. */
async function tryInsert(draft: ItemDraft): Promise<string> {
  const { data, error } = await asGabriel
    .from('list_items')
    .insert(draftToInsert(draft, scene.coupleA))
    .select('id')
    .single()
  if (error) return error.code
  await root.from('list_items').delete().eq('id', (data as { id: string }).id)
  return 'ok'
}

function memoryPath(coupleId: string) {
  return `${coupleId}/memory/${crypto.randomUUID()}.webp`
}

/** O nome da regra: o PostgREST devolve o HINT, não o `constraint` do RAISE. */
function rule(error: PostgrestError | null): string {
  return `${error?.message ?? ''} ${error?.hint ?? ''}`
}

/** As listas de um CHECK, na ordem em que aparecem (como em settings.test.ts). */
function checkLists(constraint: string): string[][] {
  const def = sql(`select pg_get_constraintdef(oid) as def from pg_constraint where conname = '${constraint}'`)
  return [...def.matchAll(/ARRAY\[([^\]]+)\]/g)].map((m) => [...m[1]!.matchAll(/'([^']+)'/g)].map((x) => x[1]!))
}

describe('A1 — paridade entre src/domain/list.ts e os CHECK', () => {
  it('categorias: as de LIST_CATEGORIES, e as mesmas de hidden_categories', () => {
    expect(checkLists('list_items_category')).toEqual([[...LIST_CATEGORIES]])
    expect(checkLists('couple_settings_hidden_categories')).toEqual(checkLists('list_items_category'))
  })

  // Ler o tamanho de dentro de `pg_get_constraintdef` seria frágil (o
  // Postgres reescreve a expressão). A prova é o banco aceitar no limite e
  // recusar no limite + 1.
  const probes: [string, number, (n: number) => ItemDraft][] = [
    ['name', LIST_LIMITS.name, (n) => ({ ...geo, name: 'x'.repeat(n) })],
    ['note', LIST_LIMITS.note, (n) => ({ ...geo, note: 'x'.repeat(n) })],
    ['link', LIST_LIMITS.link, (n) => ({ ...geo, link: 'https://' + 'x'.repeat(n - 'https://'.length) })],
    ['region', LIST_LIMITS.region, (n) => ({ ...geo, category: 'cidade', region: 'x'.repeat(n) })],
    ['venue', LIST_LIMITS.venue, (n) => ({ ...geo, category: 'comida', venue: 'x'.repeat(n) })],
    ['address', LIST_LIMITS.address, (n) => ({ ...geo, place: { ...SP, address: 'x'.repeat(n) } })],
    ['platform', LIST_LIMITS.platform, (n) => ({ ...media, platform: 'x'.repeat(n) })],
    [
      'highlights',
      LIST_LIMITS.highlights,
      (n) => ({ ...geo, category: 'pais', place: JAPAN, highlights: Array.from({ length: n }, (_, i) => `C${i}`) }),
    ],
    ['highlight', LIST_LIMITS.highlight, (n) => ({ ...geo, category: 'pais', place: JAPAN, highlights: ['x'.repeat(n)] })],
    ['seasonsMax', LIST_LIMITS.seasonsMax, (n) => ({ ...media, category: 'serie', seasons: n })],
  ]

  for (const [label, limit, draftOf] of probes) {
    it(`${label}: aceita ${limit}, recusa ${limit + 1}`, async () => {
      expect(await tryInsert(draftOf(limit))).toBe('ok')
      expect(await tryInsert(draftOf(limit + 1))).toBe('23514')
    })
  }

  it(`seasonsMin: aceita ${LIST_LIMITS.seasonsMin}, recusa ${LIST_LIMITS.seasonsMin - 1}`, async () => {
    expect(await tryInsert({ ...media, category: 'serie', seasons: LIST_LIMITS.seasonsMin })).toBe('ok')
    expect(await tryInsert({ ...media, category: 'serie', seasons: LIST_LIMITS.seasonsMin - 1 })).toBe('23514')
  })

  it(`memória: aceita ${LIST_LIMITS.memory}, recusa ${LIST_LIMITS.memory + 1}, recusa só espaço`, async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const write = (body: string) =>
      asGabriel.from('list_memories').insert({ item_id: item, couple_id: scene.coupleA, body })

    expect((await write('x'.repeat(LIST_LIMITS.memory + 1))).error?.code).toBe('23514')
    expect((await write('   ')).error?.code).toBe('23514')
    expect((await write('x'.repeat(LIST_LIMITS.memory))).error).toBeNull()
  })
})

describe('A2 — os VALIDATION_CASES, do lado do banco', () => {
  // A MESMA fixture que roda contra `validateItem` (src/domain/list.test.ts),
  // convertida pelo MESMO mapeador que a fronteira de dados usa.
  for (const c of VALIDATION_CASES) {
    const expected = c.failsOn === null ? 'aceita' : `recusa (${c.failsOn})`
    it(`${c.name} → ${expected}`, async () => {
      expect(await tryInsert(c.draft)).toBe(c.failsOn === null ? 'ok' : '23514')
    })
  }
})

describe('A5 — isolamento por casal, nas duas direções', () => {
  let itemA: string
  let itemB: string

  beforeAll(async () => {
    itemA = await newItem(asGabriel, scene.coupleA)
    itemB = await newItem(asOutsider, scene.coupleB)
    await asGabriel.from('list_memories').insert({ item_id: itemA, couple_id: scene.coupleA, body: 'nossa' })
    await asGabriel
      .from('list_photos')
      .insert({ item_id: itemA, couple_id: scene.coupleA, path: memoryPath(scene.coupleA) })
    await asOutsider.from('list_memories').insert({ item_id: itemB, couple_id: scene.coupleB, body: 'deles' })
  })

  it('cada um lê só o próprio casal — item, memória e foto', async () => {
    for (const [db, mine, theirs] of [
      [asGabriel, itemA, itemB],
      [asOutsider, itemB, itemA],
    ] as const) {
      const items = await db.from('list_items').select('id')
      expect(items.error).toBeNull()
      const ids = (items.data ?? []).map((r: { id: string }) => r.id)
      expect(ids).toContain(mine)
      expect(ids).not.toContain(theirs)

      const memories = await db.from('list_memories').select('item_id').eq('item_id', theirs)
      expect(memories.data).toEqual([])
      const photos = await db.from('list_photos').select('id').eq('item_id', theirs)
      expect(photos.data).toEqual([])
    }
  })

  it('o de fora não atualiza nem apaga item, memória ou foto do casal A', async () => {
    const upd = await asOutsider.from('list_items').update({ name: 'hack' }).eq('id', itemA).select()
    expect(upd.data).toEqual([])
    const delMem = await asOutsider.from('list_memories').delete().eq('item_id', itemA).select()
    expect(delMem.data).toEqual([])
    const updMem = await asOutsider.from('list_memories').update({ body: 'hack' }).eq('item_id', itemA).select()
    expect(updMem.data).toEqual([])
    const delPhoto = await asOutsider.from('list_photos').delete().eq('item_id', itemA).select()
    expect(delPhoto.data).toEqual([])
    const delItem = await asOutsider.from('list_items').delete().eq('id', itemA).select()
    expect(delItem.data).toEqual([])

    // E nada mudou de verdade (lido sem RLS).
    const item = await root.from('list_items').select('name').eq('id', itemA).single()
    expect((item.data as { name: string }).name).toBe(media.name)
    const counts = await Promise.all([
      root.from('list_memories').select('*', { count: 'exact', head: true }).eq('item_id', itemA),
      root.from('list_photos').select('*', { count: 'exact', head: true }).eq('item_id', itemA),
    ])
    expect(counts.map((c) => c.count)).toEqual([1, 1])
  })

  it('o de fora não cria nada no casal A', async () => {
    const item = await asOutsider.from('list_items').insert(draftToInsert(media, scene.coupleA))
    expect(item.error).not.toBeNull()
    const memory = await asOutsider.from('list_memories').insert({ item_id: itemA, couple_id: scene.coupleA, body: 'x' })
    expect(memory.error).not.toBeNull()
    const photo = await asOutsider
      .from('list_photos')
      .insert({ item_id: itemA, couple_id: scene.coupleA, path: memoryPath(scene.coupleA) })
    expect(photo.error).not.toBeNull()
  })

  it('o Gabriel não cria item com o couple_id do casal B', async () => {
    const { error } = await asGabriel.from('list_items').insert(draftToInsert(media, scene.coupleB))
    expect(error).not.toBeNull()
  })

  it('ninguém cria item em nome da outra pessoa (added_by)', async () => {
    const { error } = await asGabriel
      .from('list_items')
      .insert({ ...draftToInsert(media, scene.coupleA), added_by: scene.lana.id })
    expect(error).not.toBeNull()
  })

  it('a filha não aponta para o item de outro casal (FK composta)', async () => {
    // couple_id do próprio casal, item do outro: a policy passa, a FK não.
    const { error } = await asOutsider
      .from('list_memories')
      .insert({ item_id: itemA, couple_id: scene.coupleB, body: 'x' })
    expect(error).not.toBeNull()
  })
})

describe('A6 — memória: cada um a sua', () => {
  let item: string
  let other: string

  beforeAll(async () => {
    item = await newItem(asGabriel, scene.coupleA)
    other = await newItem(asGabriel, scene.coupleA)
    const { error } = await asGabriel.from('list_memories').insert({ item_id: item, couple_id: scene.coupleA, body: 'a minha' })
    if (error) throw new Error(error.message)
  })

  it('a Lana lê a memória do Gabriel', async () => {
    const { data } = await asLana.from('list_memories').select('profile_id, body').eq('item_id', item)
    expect(data).toEqual([{ profile_id: scene.gabriel.id, body: 'a minha' }])
  })

  it('a Lana não edita nem apaga a memória do Gabriel', async () => {
    const upd = await asLana.from('list_memories').update({ body: 'hack' }).eq('item_id', item).select()
    expect(upd.data).toEqual([])
    const del = await asLana.from('list_memories').delete().eq('item_id', item).select()
    expect(del.data).toEqual([])
    const after = await root.from('list_memories').select('body').eq('item_id', item).single()
    expect((after.data as { body: string }).body).toBe('a minha')
  })

  it('a Lana não cria memória com o profile_id do Gabriel', async () => {
    // Em `other`, onde o Gabriel não tem memória: a recusa é a policy, não a PK.
    const { error } = await asLana
      .from('list_memories')
      .insert({ item_id: other, couple_id: scene.coupleA, profile_id: scene.gabriel.id, body: 'por ele' })
    expect(error).not.toBeNull()
  })

  it('a Lana escreve a dela, e a do Gabriel continua intocada', async () => {
    const { error } = await asLana.from('list_memories').insert({ item_id: item, couple_id: scene.coupleA, body: 'a dela' })
    expect(error).toBeNull()
    const { data } = await asGabriel.from('list_memories').select('profile_id, body').eq('item_id', item).order('body')
    expect(data).toEqual([
      { profile_id: scene.lana.id, body: 'a dela' },
      { profile_id: scene.gabriel.id, body: 'a minha' },
    ])
  })
})

describe('A7 — fotos: no máximo 10 por item, na pasta do próprio casal', () => {
  it('a 11ª foto é recusada com 23514 / list_photos_limit', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const ten = Array.from({ length: LIST_LIMITS.photosPerItem }, () => ({
      item_id: item,
      couple_id: scene.coupleA,
      path: memoryPath(scene.coupleA),
    }))
    expect((await asGabriel.from('list_photos').insert(ten)).error).toBeNull()

    // A outra pessoa do casal também bate no limite: é por item, não por autor.
    const { error } = await asLana
      .from('list_photos')
      .insert({ item_id: item, couple_id: scene.coupleA, path: memoryPath(scene.coupleA) })
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('list_photos_limit')
  })

  it('onze numa inserção só também param na 11ª', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const eleven = Array.from({ length: LIST_LIMITS.photosPerItem + 1 }, () => ({
      item_id: item,
      couple_id: scene.coupleA,
      path: memoryPath(scene.coupleA),
    }))
    const { error } = await asGabriel.from('list_photos').insert(eleven)
    expect(error?.code).toBe('23514')
    const { count } = await root.from('list_photos').select('*', { count: 'exact', head: true }).eq('item_id', item)
    expect(count).toBe(0)
  })

  it('foto com caminho de outro casal é recusada pelo CHECK', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { error } = await asGabriel
      .from('list_photos')
      .insert({ item_id: item, couple_id: scene.coupleA, path: memoryPath(scene.coupleB) })
    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('list_photos_path')
  })

  it('foto fora da pasta memory/ é recusada pelo CHECK', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { error } = await asGabriel
      .from('list_photos')
      .insert({ item_id: item, couple_id: scene.coupleA, path: `${scene.coupleA}/item/x.webp` })
    expect(error?.code).toBe('23514')
  })

  it('photo_path do item: só a pasta item/ do próprio casal', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const foreign = await asGabriel
      .from('list_items')
      .update({ photo_path: `${scene.coupleB}/item/x.webp` })
      .eq('id', item)
    expect(foreign.error?.code).toBe('23514')
    expect(foreign.error?.message).toContain('list_items_photo')

    const own = await asGabriel.from('list_items').update({ photo_path: `${scene.coupleA}/item/x.webp` }).eq('id', item)
    expect(own.error).toBeNull()
  })

  it('ninguém registra foto em nome da outra pessoa (added_by)', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { error } = await asGabriel
      .from('list_photos')
      .insert({ item_id: item, couple_id: scene.coupleA, path: memoryPath(scene.coupleA), added_by: scene.lana.id })
    expect(error).not.toBeNull()
  })
})

describe('A8 — mark_item_done', () => {
  const PAST = '2026-09-20'

  function markDone(db: SupabaseClient, item: string, over: Record<string, unknown> = {}) {
    return db.rpc('mark_item_done', {
      p_item: item,
      p_done_on: PAST,
      p_done_with: 'both',
      p_solo_by: null,
      p_rating: null,
      p_memory: null,
      p_photo_paths: [],
      ...over,
    })
  }

  async function state(item: string) {
    const [row, memories, photos] = await Promise.all([
      root.from('list_items').select('status, done_on, done_with, done_solo_by, rating').eq('id', item).single(),
      root.from('list_memories').select('profile_id, body').eq('item_id', item),
      root.from('list_photos').select('path, added_by, couple_id').eq('item_id', item),
    ])
    return { row: row.data, memories: memories.data, photos: photos.data }
  }

  it('feliz: status, data, quem estava, nota, a memória de quem chamou e as fotos', async () => {
    const item = await newItem(asGabriel, scene.coupleA, geo)
    const paths = [memoryPath(scene.coupleA), memoryPath(scene.coupleA)]
    const { data, error } = await markDone(asGabriel, item, {
      p_rating: 4,
      p_memory: '  Pedimos o torresmo  ',
      p_photo_paths: paths,
    })
    expect(error).toBeNull()
    expect(data).toEqual({ status: 'done' })

    const after = await state(item)
    expect(after.row).toEqual({ status: 'done', done_on: PAST, done_with: 'both', done_solo_by: null, rating: 4 })
    expect(after.memories).toEqual([{ profile_id: scene.gabriel.id, body: 'Pedimos o torresmo' }])
    expect(after.photos?.map((p) => p.path).sort()).toEqual([...paths].sort())
    for (const p of after.photos ?? []) expect(p).toMatchObject({ added_by: scene.gabriel.id, couple_id: scene.coupleA })
  })

  it('já feito → already_done, sem mexer em nada', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    await markDone(asGabriel, item, { p_rating: 5 })
    const { data, error } = await markDone(asLana, item, { p_rating: 1, p_memory: 'tarde demais' })
    expect(error).toBeNull()
    expect(data).toEqual({ status: 'already_done' })
    const after = await state(item)
    expect(after.row?.rating).toBe(5)
    expect(after.memories).toEqual([])
  })

  it('item de outro casal → not_found', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { data } = await markDone(asOutsider, item)
    expect(data).toEqual({ status: 'not_found' })
    expect((await state(item)).row?.status).toBe('want')
  })

  it('uma foto de caminho inválido no meio: NADA muda (I7)', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { error } = await markDone(asGabriel, item, {
      p_rating: 3,
      p_memory: 'não devia ficar',
      p_photo_paths: [memoryPath(scene.coupleA), memoryPath(scene.coupleB)],
    })
    expect(error?.code).toBe('23514')
    const after = await state(item)
    expect(after.row).toEqual({ status: 'want', done_on: null, done_with: null, done_solo_by: null, rating: null })
    expect(after.memories).toEqual([])
    expect(after.photos).toEqual([])
  })

  it('data futura → recusa', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { error } = await markDone(asGabriel, item, { p_done_on: '2099-01-01' })
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('list_items_done_on_future')
    expect((await state(item)).row?.status).toBe('want')
  })

  it('solo sem p_solo_by → recusa (list_items_done)', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { error } = await markDone(asGabriel, item, { p_done_with: 'solo' })
    expect(error?.code).toBe('23514')
    expect(error?.message).toContain('list_items_done')
  })

  it('solo com p_solo_by de fora do casal → recusa (list_items_member)', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { error } = await markDone(asGabriel, item, { p_done_with: 'solo', p_solo_by: scene.outsider.id })
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('list_items_member')
  })

  it('solo com a outra pessoa do casal → feito', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { data } = await markDone(asGabriel, item, { p_done_with: 'solo', p_solo_by: scene.lana.id })
    expect(data).toEqual({ status: 'done' })
    expect((await state(item)).row).toMatchObject({ done_with: 'solo', done_solo_by: scene.lana.id })
  })

  it('both com p_solo_by → recusa', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { error } = await markDone(asGabriel, item, { p_solo_by: scene.lana.id })
    expect(error?.code).toBe('23514')
  })

  it('sem sessão → 42501', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { error } = await markDone(raw(anonClient()), item)
    expect(error?.code).toBe('42501')
  })

  it('rating num item não feito é recusado (I3)', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    const { error } = await asGabriel.from('list_items').update({ rating: 4 }).eq('id', item)
    expect(error?.code).toBe('23514')
  })
})

describe('A9 — o casal do item não muda; apagar leva memórias e fotos', () => {
  it('mudar couple_id é recusado — até pelo service_role', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    // Pelo cliente a RLS já recusaria; o service_role mostra que é o trigger.
    const { error } = await root.from('list_items').update({ couple_id: scene.coupleB }).eq('id', item)
    expect(error?.code).toBe('23514')
    expect(rule(error)).toContain('list_items_couple_immutable')

    const byMember = await asGabriel.from('list_items').update({ couple_id: scene.coupleB }).eq('id', item)
    expect(byMember.error).not.toBeNull()
  })

  it('apagar o item apaga as memórias e as fotos (cascade)', async () => {
    const item = await newItem(asGabriel, scene.coupleA)
    await asGabriel.from('list_memories').insert({ item_id: item, couple_id: scene.coupleA, body: 'minha' })
    await asLana.from('list_memories').insert({ item_id: item, couple_id: scene.coupleA, body: 'dela' })
    await asLana.from('list_photos').insert({ item_id: item, couple_id: scene.coupleA, path: memoryPath(scene.coupleA) })

    const del = await asLana.from('list_items').delete().eq('id', item).select('id')
    expect(del.data).toHaveLength(1)

    const counts = await Promise.all([
      root.from('list_memories').select('*', { count: 'exact', head: true }).eq('item_id', item),
      root.from('list_photos').select('*', { count: 'exact', head: true }).eq('item_id', item),
    ])
    expect(counts.map((c) => c.count)).toEqual([0, 0])
  })
})

describe('A10 — nenhum security definer novo; mark_item_done é invoker', () => {
  it('public continua com as doze da Fase 3', () => {
    // A lista nominal está em onboarding.test.ts (A20). Aqui, que a Lista não
    // mudou a conta e nenhuma das dela entrou.
    const rows = sql(`
      select p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
      order by p.proname`).split('\n')
    expect(rows).toHaveLength(12)
    expect(rows).not.toContain('mark_item_done')
  })

  it('mark_item_done: invoker, EXECUTE para authenticated e não para anon', () => {
    const row = sql(`
      select p.prosecdef as definer,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'mark_item_done'`)
    expect(row).toBe('f|t|f')
  })

  it('RLS ligada nas três tabelas', () => {
    const rows = sql(`
      select c.relname as name, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname in ('list_items', 'list_memories', 'list_photos')
      order by c.relname`)
    expect(rows.split('\n')).toEqual(['list_items|t', 'list_memories|t', 'list_photos|t'])
  })
})
