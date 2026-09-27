// A mesma tabela de casos roda contra `validateItem` (src/domain/list.test.ts) e
// contra os CHECK do banco (supabase/tests/list.test.ts). É assim que "a regra
// mora num lugar só" se prova em vez de ser afirmada (A2).

import type { DraftField, GeoPlace, ItemDraft } from './list'

export interface ValidationCase {
  name: string
  draft: ItemDraft
  /** `null` = válido. O banco só confere aceita/recusa; o domínio confere o campo. */
  failsOn: DraftField | null
}

const SP: GeoPlace = {
  address: 'Av. Nossa Senhora do Loreto, 1100',
  city: 'São Paulo',
  state: 'São Paulo',
  country: 'Brasil',
  countryCode: 'BR',
  lat: -23.4867214,
  lng: -46.5815741,
}

const JAPAN: GeoPlace = {
  address: null,
  city: null,
  state: null,
  country: 'Japão',
  countryCode: 'JP',
  lat: 36.5748441,
  lng: 139.2394179,
}

const GOREME: GeoPlace = {
  address: null,
  city: 'Göreme',
  state: 'Nevşehir',
  country: 'Turquia',
  countryCode: 'TR',
  lat: 38.642089,
  lng: 34.8296234,
}

const base: ItemDraft = {
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

const media: ItemDraft = { ...base, category: 'filme', name: 'Past Lives', place: null, platform: 'MUBI' }

function c(name: string, draft: Partial<ItemDraft>, failsOn: DraftField | null, from: ItemDraft = base): ValidationCase {
  return { name, draft: { ...from, ...draft }, failsOn }
}

export const VALIDATION_CASES: readonly ValidationCase[] = [
  // válidos — um por categoria, mais as variações opcionais
  c('restaurante completo', { note: 'Pedir o torresmo', link: 'https://instagram.com/mocoto', featured: true }, null),
  c('parque', { category: 'parque', name: 'Parque Vicentina Aranha' }, null),
  c('experiência fora do Brasil', { category: 'experiencia', name: 'Balão na Capadócia', place: GOREME }, null),
  c('país com cidades de interesse', { category: 'pais', name: 'Japão', place: JAPAN, highlights: ['Tóquio', 'Kyoto', 'Osaka'] }, null),
  c('país sem cidades de interesse', { category: 'pais', name: 'Japão', place: JAPAN }, null),
  c('cidade com região', { category: 'cidade', name: 'Gramado no Natal', region: 'Serra Gaúcha' }, null),
  c('comida com onde comer', { category: 'comida', name: 'Acarajé da Dinha', venue: 'Largo de Santana' }, null),
  c('comida sem onde comer', { category: 'comida', name: 'Acarajé' }, null),
  c('filme', {}, null, media),
  c('série com temporadas', { category: 'serie', name: 'The Bear', platform: 'Disney+', seasons: 4 }, null, media),
  c('série sem temporadas', { category: 'serie', name: 'Severance', platform: 'Apple TV+' }, null, media),
  c('plataforma fora das sugestões', { platform: 'Globoplay' }, null, media),
  c('link http', { link: 'http://example.com' }, null),
  c('nome no limite', { name: 'x'.repeat(80) }, null),
  c('12 cidades de interesse', { category: 'pais', place: JAPAN, highlights: Array.from({ length: 12 }, (_, i) => `C${i}`) }, null),

  // inválidos — formato
  c('filme com lugar', { place: SP }, 'place', media),
  c('série sem plataforma', { category: 'serie', platform: null }, 'platform', media),
  c('filme com plataforma vazia', { platform: '   ' }, 'platform', media),
  c('restaurante sem lugar', { place: null }, 'place'),
  c('restaurante com plataforma', { platform: 'Netflix' }, 'platform'),
  c('restaurante sem cidade', { place: { ...SP, city: null } }, 'place.city'),
  c('país com cidade', { category: 'pais', place: { ...JAPAN, city: 'Tóquio' } }, 'place.city'),
  c('código de país minúsculo', { place: { ...SP, countryCode: 'br' } }, 'place.countryCode'),
  c('latitude fora do intervalo', { place: { ...SP, lat: 91 } }, 'place.lat'),
  c('longitude fora do intervalo', { place: { ...SP, lng: -181 } }, 'place.lng'),
  c('endereço longo demais', { place: { ...SP, address: 'x'.repeat(161) } }, 'place.address'),

  // inválidos — campo exclusivo de outra categoria
  c('temporadas em filme', { seasons: 2 }, 'seasons', media),
  c('região em parque', { category: 'parque', region: 'Centro' }, 'region'),
  c('onde comer em restaurante', { venue: 'Balcão' }, 'venue'),
  c('cidades de interesse em cidade', { category: 'cidade', highlights: ['Canela'] }, 'highlights'),

  // inválidos — limites
  c('nome vazio', { name: '   ' }, 'name'),
  c('nome longo demais', { name: 'x'.repeat(81) }, 'name'),
  c('nota longa demais', { note: 'x'.repeat(281) }, 'note'),
  c('link javascript', { link: 'javascript:alert(1)' }, 'link'),
  c('link sem esquema', { link: 'instagram.com/mocoto' }, 'link'),
  c('link longo demais', { link: 'https://x.com/' + 'a'.repeat(290) }, 'link'),
  c('região longa demais', { category: 'cidade', region: 'x'.repeat(61) }, 'region'),
  c('onde comer longo demais', { category: 'comida', venue: 'x'.repeat(81) }, 'venue'),
  c('13 cidades de interesse', { category: 'pais', place: JAPAN, highlights: Array.from({ length: 13 }, (_, i) => `C${i}`) }, 'highlights'),
  c('cidade de interesse longa demais', { category: 'pais', place: JAPAN, highlights: ['x'.repeat(41)] }, 'highlights'),
  c('plataforma longa demais', { platform: 'x'.repeat(31) }, 'platform', media),
  c('temporadas zero', { category: 'serie', seasons: 0 }, 'seasons', media),
  c('temporadas 100', { category: 'serie', seasons: 100 }, 'seasons', media),
]
