// Fronteira de banco da Lista (Fase 4). snake_case não passa daqui — o
// mapeamento mora em `listRow.ts`.
//
// Spec: .agent/Tasks/fase-4-lista.md, seções 5 ("Cliente — fronteira de
//       dados"), 7 (as cascatas) e 8
// ADR:  .agent/Decisions/0003-lista-tabela-unica-com-check-por-categoria.md
//       .agent/Decisions/0012-midia-do-casal-em-bucket-por-casal.md
//
// Nenhuma query filtra por `couple_id` (ADR 0001). Onde há `.eq('id' |
// 'item_id' | 'profile_id', …)`, é IDENTIDADE — qual linha das que a pessoa
// pode ver —, não autorização. No INSERT o `couple_id` vai como DADO da linha
// nova (a coluna não tem default), e a policy `with check` recusa outro casal.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { ItemDraft, ListItem, ListMemory, ListPhoto, Rating } from '../domain/list'
import { prepareItemPhoto, prepareMemoryPhoto } from './avatar'
import type { PrepareResult } from './avatar'
import { draftToInsert, draftToUpdate, rowToItem, rowToMemory, rowToPhoto } from './listRow'
import {
  MEDIA_BUCKET,
  SIGNED_URL_SECONDS as MEDIA_SIGNED_URL_SECONDS,
  UPLOAD_CONCURRENCY as MEDIA_UPLOAD_CONCURRENCY,
  mediaPath,
  removeMediaQuietly,
  signedMediaUrls,
  uploadMedia,
} from './media'
import type { PreparedImage } from './media'
import { selectAll } from './paginate'
import type { DataResult } from './result'

type Db = SupabaseClient<Database>

// O Storage da Lista é o de `media.ts` (compartilhado com as Viagens, Fase 6).
export const LIST_BUCKET = MEDIA_BUCKET
/** Validade das URLs assinadas das fotos — refeitas a cada releitura (seção 7). */
export const SIGNED_URL_SECONDS = MEDIA_SIGNED_URL_SECONDS
/** Uploads simultâneos no "Marcar como feito" (seção 8). */
export const UPLOAD_CONCURRENCY = MEDIA_UPLOAD_CONCURRENCY

// ---------------------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------------------

/**
 * O que qualquer escrita da Lista pode devolver além do `ok`.
 * - `invalid`: CHECK ou trigger recusou; `constraint` é o nome da regra
 *   (`list_items_format`, `list_items_done_on_future`…) — a tela aponta o campo.
 * - `photo_limit`: o item já tem 10 fotos (trigger `list_photos_limit`).
 * - `not_found`: o item não existe mais (a outra pessoa apagou) ou não é visível.
 */
export type ListFailure =
  | { status: 'invalid'; constraint: string; cause: string }
  | { status: 'photo_limit' }
  | { status: 'not_found' }
  | { status: 'unauthenticated' }
  | { status: 'error'; cause: string }

export type ListWrite<T> = { status: 'ok'; value: T } | ListFailure

/** Arquivo recusado ANTES de subir (não é imagem, ou grande demais mesmo reduzido). */
export type PhotoRejected = { status: 'photo_rejected'; index: number; reason: 'not_image' | 'too_large' }
/** O upload de uma foto falhou; `index` é a posição dela no que a pessoa escolheu. */
export type UploadFailed = { status: 'upload_failed'; index: number; cause: string }

interface PgError {
  code?: string
  message: string
  hint?: string | null
  details?: string | null
}

const CONSTRAINT_IN_MESSAGE = /constraint "([a-z0-9_]+)"/i

/**
 * Erro do PostgREST → caso nomeado. O trigger põe o nome da regra no `hint`
 * (a opção `constraint` do RAISE não chega ao cliente); o CHECK declarado o
 * põe na mensagem (`violates check constraint "list_items_format"`).
 */
export function translateError(error: PgError): ListFailure {
  const constraint = error.hint || CONSTRAINT_IN_MESSAGE.exec(error.message)?.[1] || null
  if (constraint === 'list_photos_limit' || error.message.includes('list_photos_limit')) return { status: 'photo_limit' }
  // RLS com sessão presente: a pessoa saiu do casal em outro aparelho (seção 7).
  if (error.code === '42501') return { status: 'error', cause: 'este espaço mudou, recarregue a página' }
  if (error.code === 'PGRST301' || error.code === '401') return { status: 'unauthenticated' }
  // FK composta das filhas: o item sumiu entre a leitura e a escrita.
  if (error.code === '23503') return { status: 'not_found' }
  if (error.code?.startsWith('23')) {
    return { status: 'invalid', constraint: constraint ?? error.code, cause: error.message }
  }
  return { status: 'error', cause: error.message }
}

async function sessionUid(db: Db): Promise<string | null> {
  const { data } = await db.auth.getSession()
  return data.session?.user.id ?? null
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export interface ListData {
  items: ListItem[]
  memories: ListMemory[]
  photos: ListPhoto[]
}

/**
 * Três leituras em paralelo, sem filtro de casal (a policy corta), cada uma
 * paginada até o fim (`selectAll`: o PostgREST corta em 1000 sem erro, e
 * `list_photos` passa disso com ~100 itens feitos). O `order` termina numa
 * coluna única para as páginas não repetirem nem pularem linha. Qualquer uma
 * que falhe derruba o todo — a tela não mostra lista sem memórias como se
 * ninguém tivesse escrito nada.
 */
export async function loadList(db: Db): Promise<DataResult<ListData>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const [items, memories, photos] = await Promise.all([
    selectAll((from, to) =>
      db.from('list_items').select('*').order('created_at', { ascending: false }).order('id').range(from, to),
    ),
    selectAll((from, to) =>
      db.from('list_memories').select('*').order('created_at').order('item_id').order('profile_id').range(from, to),
    ),
    selectAll((from, to) => db.from('list_photos').select('*').order('created_at').order('id').range(from, to)),
  ])
  if (items.status !== 'ok') return items
  if (memories.status !== 'ok') return memories
  if (photos.status !== 'ok') return photos
  return {
    status: 'ok',
    rows: {
      items: items.rows.map(rowToItem),
      memories: memories.rows.map(rowToMemory),
      photos: photos.rows.map(rowToPhoto),
    },
  }
}

/**
 * URLs assinadas num lote só (`createSignedUrls`, seção 8). Caminho que não
 * assinou fica fora do mapa — o card mostra o fundo da categoria (seção 7).
 */
export function signedUrls(db: Db, paths: readonly (string | null)[]): Promise<DataResult<Map<string, string>>> {
  return signedMediaUrls(db, paths)
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

export async function createItem(db: Db, coupleId: string, draft: ItemDraft): Promise<ListWrite<ListItem>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const { data, error } = await db.from('list_items').insert(draftToInsert(draft, coupleId)).select('*').single()
  if (error) return translateError(error)
  return { status: 'ok', value: rowToItem(data) }
}

/** Grava as colunas de um patch e devolve a linha como ficou. Zero linhas = `not_found`. */
async function updateColumns(db: Db, id: string, columns: Database['public']['Tables']['list_items']['Update']): Promise<ListWrite<ListItem>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const { data, error } = await db.from('list_items').update(columns).eq('id', id).select('*')
  if (error) return translateError(error)
  const rows = data ?? []
  if (rows.length !== 1) return { status: 'not_found' }
  return { status: 'ok', value: rowToItem(rows[0]) }
}

/** Editar (R14): tudo menos a categoria — `draftToUpdate` nem a leva. */
export function updateItem(db: Db, id: string, draft: ItemDraft): Promise<ListWrite<ListItem>> {
  return updateColumns(db, id, { ...draftToUpdate(draft) })
}

/** Corações no detalhe (R16). Em item não feito o CHECK `list_items_done` recusa → `invalid`. */
export function setRating(db: Db, id: string, rating: Rating | null): Promise<ListWrite<ListItem>> {
  return updateColumns(db, id, { rating })
}

export function setFeatured(db: Db, id: string, featured: boolean): Promise<ListWrite<ListItem>> {
  return updateColumns(db, id, { featured })
}

export type DeleteItemResult =
  | { status: 'ok' }
  /** Os arquivos saíram e a linha não: "As fotos de {nome} foram apagadas, mas o item não." */
  | { status: 'files_deleted_row_failed'; cause: string }
  | ListFailure

/**
 * Seção 7, "Apagar item — cascata": (1) os arquivos (`photo_path` + todas as
 * fotos do item); (2) a linha, que leva memórias e fotos por cascade.
 *
 * As fotos do item são RELIDAS do banco antes de apagar: `photos` é o que a
 * tela tinha, e a outra pessoa pode ter acrescentado uma depois da última
 * leitura — o cascade levaria a linha e o arquivo ficaria órfão, sem
 * registro. Apaga-se a união (o que veio + o que o banco diz). A releitura
 * falhou → `error`, nada apagado.
 *
 * Arquivos primeiro porque, depois da linha, os caminhos só existiriam na
 * memória da tela — uma falha ali deixaria órfãos sem registro. (1) falhou →
 * nada foi apagado (`error`). (2) falhou depois de (1) → status próprio, e a
 * tela diz a verdade. Zero linhas em (2) = a outra pessoa já apagou → `ok`.
 */
export async function deleteItem(
  db: Db,
  item: Pick<ListItem, 'id' | 'photoPath'>,
  photos: readonly Pick<ListPhoto, 'itemId' | 'path'>[],
): Promise<DeleteItemResult> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const stored = await selectAll((from, to) =>
    db.from('list_photos').select('path').eq('item_id', item.id).order('id').range(from, to),
  )
  if (stored.status !== 'ok') return stored
  const paths = [
    ...new Set(
      [item.photoPath, ...photos.filter((p) => p.itemId === item.id).map((p) => p.path), ...stored.rows.map((r) => r.path)].filter(
        (p): p is string => !!p,
      ),
    ),
  ]
  if (paths.length > 0) {
    const { error } = await db.storage.from(LIST_BUCKET).remove(paths)
    if (error) return { status: 'error', cause: error.message }
  }
  const { error } = await db.from('list_items').delete().eq('id', item.id).select('id')
  if (error) {
    if (paths.length > 0) return { status: 'files_deleted_row_failed', cause: error.message }
    return translateError(error)
  }
  return { status: 'ok' }
}

// ---------------------------------------------------------------------------
// Fotos (Storage)
// ---------------------------------------------------------------------------

export type Prepare = (file: File) => Promise<PrepareResult>

type Prepared = PreparedImage

const upload = uploadMedia
const removeQuietly = removeMediaQuietly

function newPath(coupleId: string, folder: 'item' | 'memory', extension: 'webp' | 'jpg'): string {
  // Um uuid novo por upload (ADR 0009): o cache nunca serve a foto antiga.
  return mediaPath(coupleId, folder, extension)
}

/** Reduz todas antes de subir qualquer uma: arquivo ruim não custa upload nenhum. */
async function prepareAll(files: readonly File[], prepare: Prepare): Promise<Prepared[] | PhotoRejected> {
  const prepared: Prepared[] = []
  for (const [index, file] of files.entries()) {
    const result = await prepare(file)
    if (result.status !== 'ok') return { status: 'photo_rejected', index, reason: result.status }
    prepared.push({ blob: result.blob, extension: result.extension })
  }
  return prepared
}

/**
 * Sobe até `UPLOAD_CONCURRENCY` por vez. Na primeira falha para de começar
 * novas, espera as que estão no ar e apaga TODAS as que subiram: ou sobem
 * todas, ou nenhuma fica.
 */
async function uploadAll(
  db: Db,
  coupleId: string,
  images: readonly Prepared[],
): Promise<{ status: 'ok'; paths: string[] } | UploadFailed> {
  const paths: string[] = new Array(images.length)
  const uploaded: string[] = []
  // Num objeto: o TS não acompanha atribuição feita dentro do `worker`.
  const state: { failure: UploadFailed | null; next: number } = { failure: null, next: 0 }

  async function worker() {
    while (state.failure === null && state.next < images.length) {
      const index = state.next++
      const path = newPath(coupleId, 'memory', images[index].extension)
      const { error } = await upload(db, path, images[index])
      if (error) {
        state.failure ??= { status: 'upload_failed', index, cause: error }
        return
      }
      paths[index] = path
      uploaded.push(path)
    }
  }

  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, images.length) }, worker))
  if (state.failure) {
    await removeQuietly(db, uploaded)
    return state.failure
  }
  return { status: 'ok', paths }
}

// ---------------------------------------------------------------------------
// Marcar como feito
// ---------------------------------------------------------------------------

export interface MarkDoneInput {
  item: Pick<ListItem, 'id'>
  /** ISO `YYYY-MM-DD`, não futuro (o trigger confere com um dia de folga). */
  doneOn: string
  doneWith: 'both' | 'solo'
  /** Obrigatório com `solo`, nulo com `both`. */
  soloBy: string | null
  rating: Rating | null
  /** A memória de quem marca; vazia = nenhuma. */
  memory: string
  files: readonly File[]
}

export type MarkDoneResult =
  | { status: 'ok'; photoPaths: string[] }
  /** A outra pessoa marcou antes: "A {nome} já marcou este item como feito". */
  | { status: 'already_done' }
  | PhotoRejected
  | UploadFailed
  | ListFailure

/** Falha de transporte na RPC: não se sabe se gravou. */
export const CONNECTION_DROPPED = 'A conexão caiu. Confira se o item ficou marcado antes de tentar de novo'

/**
 * O erro veio do banco (SQLSTATE) ou do PostgREST (`PGRST…`)? Então a
 * transação da RPC não comitou. Sem `code` (o `postgrest-js` devolve `''`
 * quando o `fetch` rejeita, e só a mensagem quando o corpo não é JSON), a
 * resposta se perdeu no caminho e o commit pode ter acontecido.
 */
function provesNothingWritten(error: PgError): boolean {
  return typeof error.code === 'string' && error.code.trim() !== ''
}

/**
 * Seção 7, "Marcar como feito — cascata": (1) reduz e sobe as fotos, até 3 por
 * vez, para `couple-media/{casal}/memory/{uuid}.webp`; (2) a RPC
 * `mark_item_done`, que grava tudo numa transação (I7). Falha em (1) → a RPC
 * não é chamada e as que subiram são apagadas. Em (2), as subidas só são
 * apagadas quando a resposta PROVA que nada foi gravado: `already_done`,
 * `not_found`, ou erro com `code` (SQLSTATE do Postgres ou `PGRST…` — a
 * transação voltou). Erro sem `code` é de transporte (`Failed to fetch`,
 * gateway): a RPC pode ter gravado as linhas apontando para essas fotos, e
 * apagá-las deixaria a galeria quebrada. Aí os arquivos ficam e a pessoa é
 * avisada para conferir antes de tentar de novo.
 */
export async function markDone(
  db: Db,
  coupleId: string,
  input: MarkDoneInput,
  prepare: Prepare = prepareMemoryPhoto,
): Promise<MarkDoneResult> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }

  const prepared = await prepareAll(input.files, prepare)
  if (!Array.isArray(prepared)) return prepared
  const uploaded = await uploadAll(db, coupleId, prepared)
  if (uploaded.status !== 'ok') return uploaded
  const paths = uploaded.paths

  let response: { data: unknown; error: PgError | null }
  try {
    response = await db.rpc('mark_item_done', {
      p_item: input.item.id,
      p_done_on: input.doneOn,
      p_done_with: input.doneWith,
      p_solo_by: input.doneWith === 'solo' ? input.soloBy : null,
      p_rating: input.rating,
      p_memory: input.memory.trim() === '' ? null : input.memory,
      p_photo_paths: paths,
      // O gerador de tipos não marca argumento de função como anulável; no SQL
      // todos aceitam null (`p_solo_by` fora do `solo`, nota e memória vazias).
    } as unknown as Database['public']['Functions']['mark_item_done']['Args'])
  } catch {
    return { status: 'error', cause: CONNECTION_DROPPED }
  }
  const { data, error } = response

  if (error) {
    if (!provesNothingWritten(error)) return { status: 'error', cause: CONNECTION_DROPPED }
    await removeQuietly(db, paths)
    return translateError(error)
  }
  const status = (data as { status?: unknown } | null)?.status
  if (status === 'done') return { status: 'ok', photoPaths: paths }
  await removeQuietly(db, paths)
  if (status === 'already_done') return { status: 'already_done' }
  if (status === 'not_found') return { status: 'not_found' }
  return { status: 'error', cause: `mark_item_done: status inesperado ${String(status)}` }
}

// ---------------------------------------------------------------------------
// Memória (uma por pessoa por item, I5)
// ---------------------------------------------------------------------------

/**
 * Upsert da PRÓPRIA memória. `profile_id` vai explícito como identidade — a
 * policy recusa qualquer outro. `couple_id` é o do item (FK composta confere).
 */
export async function saveMemory(db: Db, itemId: string, coupleId: string, body: string): Promise<ListWrite<ListMemory>> {
  const uid = await sessionUid(db)
  if (!uid) return { status: 'unauthenticated' }
  const { data, error } = await db
    .from('list_memories')
    .upsert({ item_id: itemId, couple_id: coupleId, profile_id: uid, body: body.trim() }, { onConflict: 'item_id,profile_id' })
    .select('*')
    .single()
  if (error) return translateError(error)
  return { status: 'ok', value: rowToMemory(data) }
}

export async function deleteMemory(db: Db, itemId: string): Promise<ListWrite<null>> {
  const uid = await sessionUid(db)
  if (!uid) return { status: 'unauthenticated' }
  const { error } = await db.from('list_memories').delete().eq('item_id', itemId).eq('profile_id', uid)
  if (error) return translateError(error)
  return { status: 'ok', value: null }
}

// ---------------------------------------------------------------------------
// Foto avulsa no detalhe (R17) e foto do item (R15)
// ---------------------------------------------------------------------------

/**
 * Seção 7, "Adicionar fotos no detalhe": upload → `insert` em `list_photos`.
 * O `insert` falhou → o arquivo recém-subido é apagado. A outra pessoa encheu
 * as 10 no meio do caminho → `photo_limit`.
 */
export async function addPhoto(
  db: Db,
  coupleId: string,
  itemId: string,
  file: File,
  prepare: Prepare = prepareMemoryPhoto,
): Promise<ListWrite<ListPhoto> | PhotoRejected> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const prepared = await prepare(file)
  if (prepared.status !== 'ok') return { status: 'photo_rejected', index: 0, reason: prepared.status }

  const path = newPath(coupleId, 'memory', prepared.extension)
  const { error: uploadError } = await upload(db, path, prepared)
  if (uploadError) return { status: 'error', cause: uploadError }

  const { data, error } = await db
    .from('list_photos')
    .insert({ item_id: itemId, couple_id: coupleId, path })
    .select('*')
    .single()
  if (error) {
    await removeQuietly(db, [path])
    return translateError(error)
  }
  return { status: 'ok', value: rowToPhoto(data) }
}

/**
 * LINHA primeiro, arquivo depois. Na ordem inversa, uma falha no `delete` da
 * linha deixaria a galeria apontando para um arquivo que não existe (foto
 * quebrada para os dois). Nesta ordem a pior falha é um arquivo órfão, que
 * ninguém vê — o mesmo trade-off da capa (Fase 3). Zero linhas = a outra
 * pessoa já removeu: o arquivo sai do mesmo jeito (idempotente) e é `ok`.
 */
export async function removePhoto(db: Db, photo: Pick<ListPhoto, 'id' | 'path'>): Promise<ListWrite<null>> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const { error } = await db.from('list_photos').delete().eq('id', photo.id).select('id')
  if (error) return translateError(error)
  await removeQuietly(db, [photo.path])
  return { status: 'ok', value: null }
}

/**
 * Seção 7, "Foto do item": sobe a nova → grava `photo_path` → apaga a antiga,
 * como `replaceCover`. Upload falhou → nada muda. `update` falhou → apaga a
 * recém-subida. Apagar a antiga falhou → órfã aceita.
 */
export async function replaceItemPhoto(
  db: Db,
  coupleId: string,
  item: Pick<ListItem, 'id' | 'photoPath'>,
  file: File,
  prepare: Prepare = prepareItemPhoto,
): Promise<ListWrite<ListItem> | PhotoRejected> {
  if (!(await sessionUid(db))) return { status: 'unauthenticated' }
  const prepared = await prepare(file)
  if (prepared.status !== 'ok') return { status: 'photo_rejected', index: 0, reason: prepared.status }

  const path = newPath(coupleId, 'item', prepared.extension)
  const { error: uploadError } = await upload(db, path, prepared)
  if (uploadError) return { status: 'error', cause: uploadError }

  const saved = await updateColumns(db, item.id, { photo_path: path })
  if (saved.status !== 'ok') {
    await removeQuietly(db, [path])
    return saved
  }
  if (item.photoPath) await removeQuietly(db, [item.photoPath])
  return saved
}
