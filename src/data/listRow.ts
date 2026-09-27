// Lista (Fase 4): a fronteira entre o domínio (camelCase, `ItemDraft`,
// `ListItem`) e as colunas de `list_items`, `list_memories` e `list_photos`.
// O snake_case não passa daqui. Puro, sem rede: o mesmo mapeador serve à
// fronteira de dados e ao teste de banco que roda `VALIDATION_CASES` (A2) —
// um bug de mapeamento aparece nos dois lados, em vez de ser mascarado.
//
// Spec: .agent/Tasks/fase-4-lista.md, seção 5 · migration 20260926140000_list.sql

import type { DoneWith, GeoPlace, ItemDraft, ListCategory, ListItem, ListMemory, ListPhoto, Rating } from '../domain/list'

import type { Database } from '../lib/database.types'

type Tables = Database['public']['Tables']

// Tipos gerados (`npm run types:gen`): renomear coluna quebra o typecheck aqui.
export type ListItemRow = Tables['list_items']['Row']
export type ListMemoryRow = Tables['list_memories']['Row']
export type ListPhotoRow = Tables['list_photos']['Row']

/** O que o cliente escreve ao criar. `added_by` nasce do default (`auth.uid()`). */
export type ListItemInsert = Required<
  Pick<
    Tables['list_items']['Insert'],
    | 'couple_id' | 'category' | 'name' | 'note' | 'link' | 'featured'
    | 'address' | 'city' | 'state' | 'country' | 'country_code' | 'lat' | 'lng'
    | 'region' | 'venue' | 'highlights' | 'platform' | 'seasons'
  >
>

/** Editar: sem categoria (R14) nem casal (I1). */
export type ListItemUpdate = Omit<ListItemInsert, 'couple_id' | 'category'>

function placeColumns(place: GeoPlace | null) {
  return {
    address: place?.address ?? null,
    city: place?.city ?? null,
    state: place?.state ?? null,
    country: place?.country ?? null,
    country_code: place?.countryCode ?? null,
    lat: place?.lat ?? null,
    lng: place?.lng ?? null,
  }
}

export function draftToUpdate(draft: ItemDraft): ListItemUpdate {
  return {
    name: draft.name,
    note: draft.note,
    link: draft.link,
    featured: draft.featured,
    ...placeColumns(draft.place),
    region: draft.region,
    venue: draft.venue,
    // Sempre array: a coluna é `not null default '{}'`, e nulo seria recusado.
    highlights: [...draft.highlights],
    platform: draft.platform,
    seasons: draft.seasons,
  }
}

export function draftToInsert(draft: ItemDraft, coupleId: string): ListItemInsert {
  return { couple_id: coupleId, category: draft.category, ...draftToUpdate(draft) }
}

/**
 * O lugar existe quando o formato geográfico existe: coordenada e código do
 * país (o CHECK `list_items_format` os exige juntos). `country` só é nulo numa
 * linha escrita fora do app; aí o código ISO fica no lugar do nome.
 */
function rowToPlace(row: ListItemRow): GeoPlace | null {
  if (row.lat === null || row.lng === null || row.country_code === null) return null
  return {
    address: row.address,
    city: row.city,
    state: row.state,
    country: row.country ?? row.country_code,
    countryCode: row.country_code,
    lat: row.lat,
    lng: row.lng,
  }
}

export function rowToItem(row: ListItemRow): ListItem {
  return {
    id: row.id,
    // Os literais são garantidos pelos CHECK (`list_items_category`,
    // `list_items_status`, `list_items_rating`, `list_items_done_with`).
    category: row.category as ListCategory,
    name: row.name,
    note: row.note,
    link: row.link,
    featured: row.featured,
    place: rowToPlace(row),
    region: row.region,
    venue: row.venue,
    highlights: row.highlights ?? [],
    platform: row.platform,
    seasons: row.seasons,
    photoPath: row.photo_path,
    status: row.status as ListItem['status'],
    rating: row.rating as Rating | null,
    addedBy: row.added_by,
    createdAt: row.created_at,
    doneOn: row.done_on,
    doneWith: row.done_with as DoneWith | null,
    doneSoloBy: row.done_solo_by,
  }
}

export function rowToMemory(row: ListMemoryRow): ListMemory {
  return {
    itemId: row.item_id,
    profileId: row.profile_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function rowToPhoto(row: ListPhotoRow): ListPhoto {
  return {
    id: row.id,
    itemId: row.item_id,
    path: row.path,
    addedBy: row.added_by,
    createdAt: row.created_at,
  }
}
