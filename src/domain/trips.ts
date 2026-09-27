// O contrato das Viagens (Fase 6): tipos, tipos de item e limites.
//
// Spec: .agent/Tasks/fase-6-viagens.md (seções 4 e 5) · ADR 0019.
//
// A viagem É o evento `viagem` dos dois (`calendar_events`): datas, destino,
// título e nota moram lá e só lá. Aqui ficam os tipos do que `trips` e as
// tabelas-filhas acrescentam. Os limites e as listas são os dos CHECK da
// migration `20260927120000_trips.sql`, com paridade provada em
// `supabase/tests/trips.test.ts` (A1). Mudou aqui, muda lá.
//
// As derivações (estado, números, recordes, roteiro) moram em
// `tripDerive.ts`, e as validações em `tripValidation.ts`.

export const ITINERARY_KINDS = [
  'voo',
  'hospedagem',
  'transporte',
  'restaurante',
  'comida',
  'parque',
  'cidade',
  'experiencia',
  'outro',
] as const
export type ItineraryKind = (typeof ITINERARY_KINDS)[number]

export const ITINERARY_KIND_LABEL: Record<ItineraryKind, string> = {
  voo: 'Voo',
  hospedagem: 'Hospedagem',
  transporte: 'Transporte',
  restaurante: 'Restaurante',
  comida: 'Comida',
  parque: 'Parque',
  cidade: 'Cidade',
  experiencia: 'Experiência',
  outro: 'Outro',
}

export const PREP_KINDS = ['passagens', 'hospedagem', 'documentos', 'seguro', 'malas', 'outro'] as const
export type PrepKind = (typeof PREP_KINDS)[number]

/** Os itens que o trigger `calendar_events_trip` insere com a viagem, nesta ordem (`position` 0..4). */
export const DEFAULT_PREP: readonly { kind: PrepKind; label: string }[] = [
  { kind: 'passagens', label: 'Passagens' },
  { kind: 'hospedagem', label: 'Hospedagem' },
  { kind: 'documentos', label: 'Documentos' },
  { kind: 'seguro', label: 'Seguro viagem' },
  { kind: 'malas', label: 'Malas' },
]

/** I13. Tamanhos em caracteres (`char_length`), valores em centavos. */
export const TRIP_LIMITS = {
  dayTitle: 60,
  itineraryTitle: 80,
  itineraryNote: 120,
  itineraryPerTrip: 200,
  prepLabel: 40,
  prepDetail: 80,
  prepPerTrip: 20,
  budgetLabel: 30,
  budgetPerTrip: 12,
  centsMax: 1_000_000_000,
  memoryBody: 2000,
  ratingMin: 1,
  ratingMax: 5,
  lodgingName: 80,
  lodgingAddress: 160,
  lodgingUrl: 500,
  lodgingCode: 40,
  originCode: 8,
  departureNote: 80,
  caption: 80,
  photosPerTrip: 500,
  /** Fotos escolhidas de uma vez no _Adicionar fotos_ (R21); não é CHECK. */
  photosPerUpload: 50,
} as const

/** Estado derivado de hoje (I4), nunca gravado. */
export type TripStatus = 'planned' | 'ongoing' | 'done'

export interface Lodging {
  name: string | null
  address: string | null
  /** `YYYY-MM-DDTHH:MM`, hora local do lugar (coluna `timestamp` sem fuso). */
  checkIn: string | null
  checkOut: string | null
  url: string | null
  code: string | null
  cents: number | null
  paid: boolean
}

export const EMPTY_LODGING: Lodging = {
  name: null,
  address: null,
  checkIn: null,
  checkOut: null,
  url: null,
  code: null,
  cents: null,
  paid: false,
}

export interface TripDeparture {
  profileId: string
  /** "GRU", "POA"; nulo = a casa abreviada (I8). */
  originCode: string | null
  /** "voo GRU → FLN · 1h05". */
  note: string | null
}

export interface TripDayTitle {
  day: string
  title: string
}

export interface ItineraryItem {
  id: string
  day: string
  /** `HH:MM`; nulo = sem hora (vai para o fim do dia). */
  at: string | null
  title: string
  kind: ItineraryKind
  note: string | null
  listItemId: string | null
  position: number
}

export interface PrepItem {
  id: string
  kind: PrepKind
  label: string
  detail: string | null
  done: boolean
  position: number
}

export interface BudgetLine {
  id: string
  label: string
  plannedCents: number
  spentCents: number
  position: number
}

export interface TripMemory {
  profileId: string
  rating: number
  body: string
  writtenOn: string
}

export interface TripPhoto {
  id: string
  /** Caminho no bucket `couple-media`: `<couple_id>/trip/<uuid>.webp`. */
  path: string
  takenOn: string | null
  caption: string | null
  favorite: boolean
  addedBy: string | null
  createdAt: string
}

/** Um evento `viagem` dos dois + o que é dele (I1). */
export interface Trip {
  /** = `calendar_events.id` = `trips.event_id`. */
  id: string
  title: string
  cityId: string
  startsOn: string
  endsOn: string
  note: string | null
  coverPhotoId: string | null
  lodging: Lodging
  departures: TripDeparture[]
  days: TripDayTitle[]
  itinerary: ItineraryItem[]
  prep: PrepItem[]
  budget: BudgetLine[]
  memories: TripMemory[]
  photos: TripPhoto[]
}

// ---------------------------------------------------------------------------
// Rascunhos — o que as telas mandam gravar. Validados em `tripValidation.ts`
// com a MESMA tabela de casos que o banco (`tripValidationCases.ts`, A2).
// ---------------------------------------------------------------------------

export interface NewTripDraft {
  title: string
  cityId: string
  startsOn: string
  endsOn: string
  note: string | null
  lodgingName: string | null
  departures: TripDeparture[]
}

export type ItineraryDraft = Omit<ItineraryItem, 'id' | 'position'>
export type PrepDraft = Omit<PrepItem, 'id' | 'position'>
export type BudgetDraft = Omit<BudgetLine, 'id' | 'position'>
export type MemoryDraft = Pick<TripMemory, 'rating' | 'body'>
