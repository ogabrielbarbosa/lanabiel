// Capa de banco de imagens (ADR 0025): a busca no Unsplash pela edge function
// `unsplash-search`, que guarda a chave. O formato é o do `handler.ts` dela.
//
// A imagem é usada pela URL do Unsplash e o crédito vai junto para `trips`
// (`StockCover`); nada é copiado para o bucket. Escolher uma foto avisa o
// Unsplash (`trackStockDownload`), como a licença da API pede.

import { FunctionsHttpError } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { StockCover } from '../domain/trips'
import type { Database } from '../lib/database.types'

type Db = SupabaseClient<Database>

export interface StockPhoto {
  id: string
  url: string
  thumb: string
  author: string
  authorUrl: string
  downloadLocation: string
  alt: string | null
  color: string | null
}

export type StockSearchResult =
  | { status: 'ok'; photos: StockPhoto[] }
  /** Sem `UNSPLASH_ACCESS_KEY` no projeto: a tela fica só com o _Enviar_. */
  | { status: 'unconfigured' }
  | { status: 'error'; cause: string }

/** O link do Unsplash que acompanha o crédito, com o `utm` da licença. */
export const UNSPLASH_URL = 'https://unsplash.com/?utm_source=lanabiel&utm_medium=referral'

export const stockCoverOf = (p: StockPhoto): StockCover => ({ url: p.url, author: p.author, authorUrl: p.authorUrl })

async function invoke(db: Db, body: object): Promise<Record<string, unknown>> {
  const { data, error } = await db.functions.invoke('unsplash-search', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const raw = (await (error.context as Response).json().catch(() => null)) as Record<string, unknown> | null
      if (raw && typeof raw.status === 'string') return raw
    }
    return { status: 'error', cause: error.message }
  }
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : { status: 'error', cause: 'unsplash-search: resposta vazia' }
}

export async function searchStockPhotos(db: Db, query: string): Promise<StockSearchResult> {
  const raw = await invoke(db, { action: 'search', query })
  if (raw.status === 'ok' && Array.isArray(raw.photos)) return { status: 'ok', photos: raw.photos as StockPhoto[] }
  if (raw.status === 'unconfigured') return { status: 'unconfigured' }
  return { status: 'error', cause: typeof raw.cause === 'string' ? raw.cause : `unsplash-search: ${String(raw.status)}` }
}

/** Falhar aqui não desfaz nada: é o aviso de uso ao Unsplash, não a capa. */
export async function trackStockDownload(db: Db, photo: Pick<StockPhoto, 'downloadLocation'>): Promise<void> {
  await invoke(db, { action: 'download', downloadLocation: photo.downloadLocation })
}
