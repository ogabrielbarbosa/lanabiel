// Mídia do casal no Storage (`couple-media`, ADR 0012): o que a Lista (Fase 4)
// e as Viagens (Fase 6) fazem igual — caminho, upload, remoção silenciosa e
// URL assinada em lote. Extraído de `list.ts` sem mudar comportamento.
//
// Caminho: `<couple_id>/<pasta>/<uuid>.<ext>`. A policy do bucket autoriza pela
// primeira pasta; um uuid novo por upload (ADR 0009) impede o cache de servir
// foto velha.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { DataResult } from './result'

type Db = SupabaseClient<Database>

export const MEDIA_BUCKET = 'couple-media'
/** Validade das URLs assinadas das fotos — refeitas a cada releitura. */
export const SIGNED_URL_SECONDS = 3600
/** Uploads simultâneos (Lista seção 8, Viagens seção 8). */
export const UPLOAD_CONCURRENCY = 3

export type MediaFolder = 'item' | 'memory' | 'trip'

/** Uma imagem já reduzida (`prepare*` de `avatar.ts`). */
export type PreparedImage = { blob: Blob; extension: 'webp' | 'jpg' }

export function mediaPath(coupleId: string, folder: MediaFolder, extension: 'webp' | 'jpg'): string {
  return `${coupleId}/${folder}/${crypto.randomUUID()}.${extension}`
}

export async function uploadMedia(db: Db, path: string, image: PreparedImage): Promise<{ error: string | null }> {
  const { error } = await db.storage.from(MEDIA_BUCKET).upload(path, image.blob, {
    contentType: image.extension === 'webp' ? 'image/webp' : 'image/jpeg',
    upsert: false,
  })
  return { error: error ? error.message : null }
}

/** Melhor esforço: a falha deixa um órfão, aceito como na Fase 3. */
export async function removeMediaQuietly(db: Db, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  try {
    await db.storage.from(MEDIA_BUCKET).remove([...paths])
  } catch {
    // órfão aceito
  }
}

/**
 * URLs assinadas num lote só (`createSignedUrls`). Caminho que não assinou
 * fica fora do mapa — a tela mostra o fundo sem foto.
 */
export async function signedMediaUrls(db: Db, paths: readonly (string | null)[]): Promise<DataResult<Map<string, string>>> {
  const unique = [...new Set(paths.filter((p): p is string => !!p))]
  if (unique.length === 0) return { status: 'ok', rows: new Map() }
  const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS)
  if (error) return { status: 'error', cause: error.message }
  const urls = new Map<string, string>()
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl)
  }
  return { status: 'ok', rows: urls }
}
