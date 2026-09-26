// Foto de perfil — bucket privado, pasta = auth.uid() (ADR 0009).
//
// Spec: .agent/Tasks/fase-2-onboarding.md, seção 5 (migration 5) e seção 8
//
// A redução acontece no navegador: 512×512, recorte central, WebP. O Storage
// transformaria a imagem no servidor, mas só no plano pago.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { Failure } from './rpc'

type Db = SupabaseClient<Database>

export const AVATAR_SIZE = 512
export const MAX_INPUT_BYTES = 10 * 1024 * 1024
/** O bucket recusa acima disso (`file_size_limit`). */
export const MAX_STORED_BYTES = 1024 * 1024
const SIGNED_URL_SECONDS = 3600

export type PrepareResult =
  | { status: 'ok'; blob: Blob; extension: 'webp' | 'jpg' }
  | { status: 'too_large' }
  | { status: 'not_image' }

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/** Recorta ao centro, reduz e reencoda. Nada sai do aparelho aqui. */
export async function prepareAvatar(file: File): Promise<PrepareResult> {
  if (!file.type.startsWith('image/')) return { status: 'not_image' }
  if (file.size > MAX_INPUT_BYTES) return { status: 'too_large' }

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return { status: 'not_image' }
  }

  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = AVATAR_SIZE
  canvas.height = AVATAR_SIZE
  const context = canvas.getContext('2d')
  if (!context) return { status: 'not_image' }
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  )
  bitmap.close()

  // Navegador que não codifica WebP devolve PNG em silêncio — que o bucket
  // recusaria. Nesse caso, JPEG.
  const webp = await canvasToBlob(canvas, 'image/webp', 0.85)
  if (webp && webp.type === 'image/webp' && webp.size <= MAX_STORED_BYTES) {
    return { status: 'ok', blob: webp, extension: 'webp' }
  }
  const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.85)
  if (jpeg && jpeg.size <= MAX_STORED_BYTES) return { status: 'ok', blob: jpeg, extension: 'jpg' }
  return { status: 'too_large' }
}

export type UploadResult = { status: 'ok'; path: string } | Failure

/**
 * Sobe para `<uid>/<uuid>.<ext>`. O nome aleatório impede o cache de servir a
 * foto antiga depois de uma troca.
 */
export async function uploadAvatar(
  db: Db,
  image: { blob: Blob; extension: 'webp' | 'jpg' },
): Promise<UploadResult> {
  const { data: session } = await db.auth.getSession()
  const userId = session.session?.user.id
  if (!userId) return { status: 'unauthenticated' }

  const path = `${userId}/${crypto.randomUUID()}.${image.extension}`
  const { error } = await db.storage.from('avatars').upload(path, image.blob, {
    contentType: image.extension === 'webp' ? 'image/webp' : 'image/jpeg',
    upsert: false,
  })
  if (error) return { status: 'error', cause: error.message }
  return { status: 'ok', path }
}

/** URL assinada de 1 hora. `null` quando não há foto ou não deu para assinar. */
export async function avatarUrl(db: Db, path: string | null): Promise<string | null> {
  if (!path) return null
  const { data } = await db.storage.from('avatars').createSignedUrl(path, SIGNED_URL_SECONDS)
  return data?.signedUrl ?? null
}
