// A mesma tabela de casos roda contra as validações de `tripValidation.ts`
// (src/domain/tripValidation.test.ts) e contra os CHECK de
// `20260927120000_trips.sql` no banco (supabase/tests/trips.test.ts) — A2.
//
// Só entram aqui os casos que o banco julga por CHECK (23514). O que o banco
// recusa pelo TIPO da coluna (nota 2,5 num `smallint`, centavo quebrado num
// `integer`, data e hora malformadas num `timestamp`) sai com outro SQLSTATE e
// fica só no teste de domínio.
//
// `PERSON` é SIMBÓLICO: o lado do banco o troca por um integrante do casal. Os
// dias caem dentro de `CASE_TRIP`, a viagem que o lado do banco cria para
// rodar os casos (o dia fora da viagem é trigger, testado à parte no A6).

import type { BudgetDraft, ItineraryDraft, Lodging, MemoryDraft, PrepDraft, TripDeparture } from './trips'
import { EMPTY_LODGING, TRIP_LIMITS } from './trips'
import type {
  BudgetField,
  DayTitleField,
  DepartureField,
  ItineraryField,
  LodgingField,
  MemoryField,
  PrepField,
} from './tripValidation'

export const PERSON = '$person'

/** A viagem dos casos, do lado do banco: todos os `day` daqui caem dentro. */
export const CASE_TRIP = { startsOn: '2027-01-08', endsOn: '2027-01-14' } as const

/** `null` = válido. O banco só confere aceita/recusa; o domínio confere o campo. */
export type TripValidationCase =
  | { target: 'itinerary'; name: string; draft: ItineraryDraft; failsOn: ItineraryField | null }
  | { target: 'prep'; name: string; draft: PrepDraft; failsOn: PrepField | null }
  | { target: 'budget'; name: string; draft: BudgetDraft; failsOn: BudgetField | null }
  | { target: 'memory'; name: string; draft: MemoryDraft; failsOn: MemoryField | null }
  | { target: 'lodging'; name: string; draft: Lodging; failsOn: LodgingField | null }
  | { target: 'departure'; name: string; draft: TripDeparture; failsOn: DepartureField | null }
  | { target: 'dayTitle'; name: string; draft: string; failsOn: DayTitleField | null }
  | { target: 'caption'; name: string; draft: string | null; failsOn: 'caption' | null }

const x = (n: number) => 'x'.repeat(n)
const L = TRIP_LIMITS

const item: ItineraryDraft = {
  day: '2027-01-10',
  at: '09:30',
  title: 'Castelo de São Jorge',
  kind: 'cidade',
  note: 'chegar cedo',
  listItemId: null,
}
const prep: PrepDraft = { kind: 'passagens', label: 'Passagens', detail: 'TAP · GRU → LIS', done: false }
const budget: BudgetDraft = { label: 'Hospedagem', plannedCents: 320_000, spentCents: 0 }
const memory: MemoryDraft = { rating: 5, body: 'O pôr do sol no Miradouro.' }
const lodging: Lodging = {
  name: 'Casa do Largo',
  address: 'Largo do Chafariz de Dentro, 1',
  checkIn: '2027-01-08T15:00',
  checkOut: '2027-01-14T11:00',
  url: 'https://casadolargo.pt',
  code: 'HX4K2',
  cents: 320_000,
  paid: true,
}
const departure: TripDeparture = { profileId: PERSON, originCode: 'GRU', note: 'voo GRU → LIS · 10h' }

export const TRIP_VALIDATION_CASES: TripValidationCase[] = [
  // --- Roteiro --------------------------------------------------------------
  { target: 'itinerary', name: 'item completo', draft: item, failsOn: null },
  { target: 'itinerary', name: 'item sem hora e sem nota', draft: { ...item, at: null, note: null }, failsOn: null },
  { target: 'itinerary', name: `título com ${L.itineraryTitle}`, draft: { ...item, title: x(L.itineraryTitle) }, failsOn: null },
  { target: 'itinerary', name: `nota com ${L.itineraryNote}`, draft: { ...item, note: x(L.itineraryNote) }, failsOn: null },
  // Os espaços das pontas não contam: é o `btrim` que o CHECK mede.
  { target: 'itinerary', name: 'título no limite com espaço em volta', draft: { ...item, title: `  ${x(L.itineraryTitle)}  ` }, failsOn: null },
  // Pontos de código, não unidades UTF-16: 80 emojis são 80 caracteres.
  { target: 'itinerary', name: `título com ${L.itineraryTitle} emojis`, draft: { ...item, title: '\u{1F30A}'.repeat(L.itineraryTitle) }, failsOn: null },
  ...(['voo', 'hospedagem', 'transporte', 'restaurante', 'comida', 'parque', 'experiencia', 'outro'] as const).map(
    (kind): TripValidationCase => ({ target: 'itinerary', name: `tipo ${kind}`, draft: { ...item, kind }, failsOn: null }),
  ),
  { target: 'itinerary', name: 'título vazio', draft: { ...item, title: '   ' }, failsOn: 'title' },
  { target: 'itinerary', name: `título com ${L.itineraryTitle + 1}`, draft: { ...item, title: x(L.itineraryTitle + 1) }, failsOn: 'title' },
  { target: 'itinerary', name: `nota com ${L.itineraryNote + 1}`, draft: { ...item, note: x(L.itineraryNote + 1) }, failsOn: 'note' },
  { target: 'itinerary', name: 'nota só de espaço', draft: { ...item, note: '  ' }, failsOn: 'note' },
  { target: 'itinerary', name: 'tipo desconhecido', draft: { ...item, kind: 'praia' as ItineraryDraft['kind'] }, failsOn: 'kind' },

  // --- Preparação -----------------------------------------------------------
  { target: 'prep', name: 'item com detalhe', draft: prep, failsOn: null },
  { target: 'prep', name: 'item sem detalhe, feito', draft: { ...prep, kind: 'outro', label: 'Vacina', detail: null, done: true }, failsOn: null },
  { target: 'prep', name: `rótulo com ${L.prepLabel}`, draft: { ...prep, label: x(L.prepLabel) }, failsOn: null },
  { target: 'prep', name: `detalhe com ${L.prepDetail}`, draft: { ...prep, detail: x(L.prepDetail) }, failsOn: null },
  { target: 'prep', name: 'rótulo vazio', draft: { ...prep, label: ' ' }, failsOn: 'label' },
  { target: 'prep', name: `rótulo com ${L.prepLabel + 1}`, draft: { ...prep, label: x(L.prepLabel + 1) }, failsOn: 'label' },
  { target: 'prep', name: `detalhe com ${L.prepDetail + 1}`, draft: { ...prep, detail: x(L.prepDetail + 1) }, failsOn: 'detail' },
  { target: 'prep', name: 'detalhe só de espaço', draft: { ...prep, detail: '   ' }, failsOn: 'detail' },
  { target: 'prep', name: 'tipo desconhecido', draft: { ...prep, kind: 'vacina' as PrepDraft['kind'] }, failsOn: 'kind' },

  // --- Orçamento ------------------------------------------------------------
  { target: 'budget', name: 'linha planejada', draft: budget, failsOn: null },
  { target: 'budget', name: 'zeros', draft: { ...budget, plannedCents: 0, spentCents: 0 }, failsOn: null },
  { target: 'budget', name: `valores no teto (${L.centsMax})`, draft: { ...budget, plannedCents: L.centsMax, spentCents: L.centsMax }, failsOn: null },
  { target: 'budget', name: `rótulo com ${L.budgetLabel}`, draft: { ...budget, label: x(L.budgetLabel) }, failsOn: null },
  { target: 'budget', name: 'rótulo vazio', draft: { ...budget, label: '' }, failsOn: 'label' },
  { target: 'budget', name: `rótulo com ${L.budgetLabel + 1}`, draft: { ...budget, label: x(L.budgetLabel + 1) }, failsOn: 'label' },
  { target: 'budget', name: 'planejado negativo', draft: { ...budget, plannedCents: -1 }, failsOn: 'plannedCents' },
  { target: 'budget', name: 'planejado acima do teto', draft: { ...budget, plannedCents: L.centsMax + 1 }, failsOn: 'plannedCents' },
  { target: 'budget', name: 'gasto negativo', draft: { ...budget, spentCents: -1 }, failsOn: 'spentCents' },
  { target: 'budget', name: 'gasto acima do teto', draft: { ...budget, spentCents: L.centsMax + 1 }, failsOn: 'spentCents' },

  // --- Memória --------------------------------------------------------------
  { target: 'memory', name: 'memória com nota 5', draft: memory, failsOn: null },
  { target: 'memory', name: `nota ${L.ratingMin}`, draft: { ...memory, rating: L.ratingMin }, failsOn: null },
  { target: 'memory', name: `texto com ${L.memoryBody}`, draft: { ...memory, body: x(L.memoryBody) }, failsOn: null },
  { target: 'memory', name: 'texto com quebra de linha', draft: { ...memory, body: 'Dia 1.\nDia 2.' }, failsOn: null },
  { target: 'memory', name: `nota ${L.ratingMin - 1}`, draft: { ...memory, rating: L.ratingMin - 1 }, failsOn: 'rating' },
  { target: 'memory', name: `nota ${L.ratingMax + 1}`, draft: { ...memory, rating: L.ratingMax + 1 }, failsOn: 'rating' },
  { target: 'memory', name: 'texto vazio', draft: { ...memory, body: '   ' }, failsOn: 'body' },
  { target: 'memory', name: `texto com ${L.memoryBody + 1}`, draft: { ...memory, body: x(L.memoryBody + 1) }, failsOn: 'body' },

  // --- Hospedagem -----------------------------------------------------------
  { target: 'lodging', name: 'hospedagem completa', draft: lodging, failsOn: null },
  { target: 'lodging', name: 'hospedagem vazia', draft: EMPTY_LODGING, failsOn: null },
  { target: 'lodging', name: 'link http://', draft: { ...lodging, url: 'http://casadolargo.pt' }, failsOn: null },
  { target: 'lodging', name: 'link em caixa alta', draft: { ...lodging, url: 'HTTPS://CASADOLARGO.PT' }, failsOn: null },
  { target: 'lodging', name: `nome com ${L.lodgingName}`, draft: { ...lodging, name: x(L.lodgingName) }, failsOn: null },
  { target: 'lodging', name: `endereço com ${L.lodgingAddress}`, draft: { ...lodging, address: x(L.lodgingAddress) }, failsOn: null },
  {
    target: 'lodging',
    name: `link com ${L.lodgingUrl}`,
    draft: { ...lodging, url: 'https://' + x(L.lodgingUrl - 'https://'.length) },
    failsOn: null,
  },
  { target: 'lodging', name: `código com ${L.lodgingCode}`, draft: { ...lodging, code: x(L.lodgingCode) }, failsOn: null },
  { target: 'lodging', name: 'valor zero', draft: { ...lodging, cents: 0 }, failsOn: null },
  { target: 'lodging', name: `valor no teto (${L.centsMax})`, draft: { ...lodging, cents: L.centsMax }, failsOn: null },
  { target: 'lodging', name: 'nome só de espaço', draft: { ...lodging, name: '  ' }, failsOn: 'name' },
  { target: 'lodging', name: `nome com ${L.lodgingName + 1}`, draft: { ...lodging, name: x(L.lodgingName + 1) }, failsOn: 'name' },
  { target: 'lodging', name: `endereço com ${L.lodgingAddress + 1}`, draft: { ...lodging, address: x(L.lodgingAddress + 1) }, failsOn: 'address' },
  { target: 'lodging', name: 'link sem esquema', draft: { ...lodging, url: 'casadolargo.pt' }, failsOn: 'url' },
  { target: 'lodging', name: 'link javascript:', draft: { ...lodging, url: 'javascript:alert(1)' }, failsOn: 'url' },
  {
    target: 'lodging',
    name: `link com ${L.lodgingUrl + 1}`,
    draft: { ...lodging, url: 'https://' + x(L.lodgingUrl + 1 - 'https://'.length) },
    failsOn: 'url',
  },
  { target: 'lodging', name: `código com ${L.lodgingCode + 1}`, draft: { ...lodging, code: x(L.lodgingCode + 1) }, failsOn: 'code' },
  { target: 'lodging', name: 'valor negativo', draft: { ...lodging, cents: -1 }, failsOn: 'cents' },
  { target: 'lodging', name: 'valor acima do teto', draft: { ...lodging, cents: L.centsMax + 1 }, failsOn: 'cents' },

  // --- Saída ----------------------------------------------------------------
  { target: 'departure', name: 'saída com código e nota', draft: departure, failsOn: null },
  { target: 'departure', name: 'saída só com a pessoa (a casa abreviada)', draft: { ...departure, originCode: null, note: null }, failsOn: null },
  { target: 'departure', name: `código com ${L.originCode}`, draft: { ...departure, originCode: x(L.originCode) }, failsOn: null },
  { target: 'departure', name: `nota com ${L.departureNote}`, draft: { ...departure, note: x(L.departureNote) }, failsOn: null },
  { target: 'departure', name: 'código vazio', draft: { ...departure, originCode: '' }, failsOn: 'originCode' },
  { target: 'departure', name: `código com ${L.originCode + 1}`, draft: { ...departure, originCode: x(L.originCode + 1) }, failsOn: 'originCode' },
  { target: 'departure', name: `nota com ${L.departureNote + 1}`, draft: { ...departure, note: x(L.departureNote + 1) }, failsOn: 'note' },

  // --- Título do dia --------------------------------------------------------
  { target: 'dayTitle', name: 'título do dia', draft: 'Chegada e Alfama', failsOn: null },
  { target: 'dayTitle', name: `título do dia com ${L.dayTitle}`, draft: x(L.dayTitle), failsOn: null },
  { target: 'dayTitle', name: 'título do dia vazio', draft: ' ', failsOn: 'title' },
  { target: 'dayTitle', name: `título do dia com ${L.dayTitle + 1}`, draft: x(L.dayTitle + 1), failsOn: 'title' },

  // --- Legenda da foto ------------------------------------------------------
  { target: 'caption', name: 'sem legenda', draft: null, failsOn: null },
  { target: 'caption', name: `legenda com ${L.caption}`, draft: x(L.caption), failsOn: null },
  { target: 'caption', name: 'legenda só de espaço', draft: '  ', failsOn: 'caption' },
  { target: 'caption', name: `legenda com ${L.caption + 1}`, draft: x(L.caption + 1), failsOn: 'caption' },
]
