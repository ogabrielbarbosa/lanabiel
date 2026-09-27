// A Lista vista pelas Configurações (Fase 4, R26 e R27): a contagem que o
// resumo mostra e o que o export leva. A contagem é uma leitura própria (só
// `category`); o export reaproveita `loadList` da fronteira da Lista — as
// mesmas três tabelas, paginadas do mesmo jeito — e reduz as fotos à contagem
// por item: o caminho no Storage é lido, mas não sai daqui.
//
// Spec: .agent/Tasks/fase-4-lista.md, R26, R27 e seção 5 ("Compatibilidade")
//
// Nenhuma query filtra por `couple_id`: a policy decide (ADR 0001).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import { LIST_CATEGORIES } from '../domain/settings'
import type { ListCategory } from '../domain/settings'
import type { ListItem, ListMemory } from '../domain/list'
import { loadList } from './list'
import { selectAll } from './paginate'
import type { DataResult } from './result'

type Db = SupabaseClient<Database>

/** Com RLS, sessão ausente devolve zero linhas — que aqui viraria "0 itens". */
async function hasSession(db: Db): Promise<boolean> {
  const { data } = await db.auth.getSession()
  return data.session !== null
}

export interface ListCounts {
  total: number
  /** Todas as oito chaves, inclusive as ocultas e as zeradas. */
  byCategory: Record<ListCategory, number>
}

/**
 * R26. Um `select('category')` só dá o total e a contagem por chip de uma vez;
 * `count` com `head: true` daria o total, mas pediria oito viagens para os
 * chips.
 */
export async function loadListCounts(db: Db): Promise<DataResult<ListCounts>> {
  if (!(await hasSession(db))) return { status: 'unauthenticated' }
  const read = await selectAll((from, to) => db.from('list_items').select('category').order('id').range(from, to))
  if (read.status !== 'ok') return read
  const byCategory = Object.fromEntries(LIST_CATEGORIES.map((c) => [c, 0])) as Record<ListCategory, number>
  for (const { category } of read.rows) {
    // Os literais são garantidos pelo CHECK `list_items_category`.
    if (category in byCategory) byCategory[category as ListCategory] += 1
  }
  return { status: 'ok', rows: { total: read.rows.length, byCategory } }
}

export interface ListExportData {
  items: ListItem[]
  memories: ListMemory[]
  /** Fotos do feito por item. Só a contagem: o export nunca leva imagem nem caminho. */
  photoCounts: Map<string, number>
}

/**
 * R27. `loadList` (três leituras paginadas; qualquer uma não-`ok` derruba o
 * todo), em ordem de criação — o arquivo lê de cima para baixo como a
 * história foi escrita. Das fotos só sai a contagem por item.
 */
export async function loadListExport(db: Db): Promise<DataResult<ListExportData>> {
  const read = await loadList(db)
  if (read.status !== 'ok') return read
  const { items, memories, photos } = read.rows
  const photoCounts = new Map<string, number>()
  for (const { itemId } of photos) photoCounts.set(itemId, (photoCounts.get(itemId) ?? 0) + 1)
  const byCreation = (a: { createdAt: string }, b: { createdAt: string }) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
  return {
    status: 'ok',
    rows: {
      // `sort` é estável: no empate, a ordem de `loadList` (por id) decide.
      items: [...items].sort((a, b) => byCreation(a, b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      memories,
      photoCounts,
    },
  }
}
