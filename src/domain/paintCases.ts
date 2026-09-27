// A mesma tabela de casos roda contra `paintStays` (src/domain/calendar.test.ts)
// e contra `paint_stays` no banco (supabase/tests/calendar.test.ts). É assim
// que "a pintura mora num lugar só" se prova em vez de ser afirmada (A2).
//
// ADR: .agent/Decisions/0018-periodo-se-grava-pintando-estadias.md
//
// Pessoas e cidades são SIMBÓLICAS: cada lado troca `g`/`l` pelos perfis e
// `sjc`/`marau`/`paraty` pelas cidades dele. A comparação ignora `id`, e
// ordena por pessoa e depois por `from`.

export type CasePerson = 'g' | 'l'
export type CaseCity = 'sjc' | 'marau' | 'paraty'

export interface CaseStay {
  person: CasePerson
  city: CaseCity
  from: string
  /** `null` = em aberto. */
  to: string | null
}

export interface PaintCase {
  name: string
  before: CaseStay[]
  /** Aplicadas em ordem, numa chamada só. */
  entries: CaseStay[]
  after: CaseStay[]
}

const g = (city: CaseCity, from: string, to: string | null): CaseStay => ({ person: 'g', city, from, to })
const l = (city: CaseCity, from: string, to: string | null): CaseStay => ({ person: 'l', city, from, to })

export const PAINT_CASES: PaintCase[] = [
  {
    name: 'pessoa sem estadia nenhuma',
    before: [],
    entries: [g('sjc', '2026-10-01', '2026-10-05')],
    after: [g('sjc', '2026-10-01', '2026-10-05')],
  },
  {
    name: 'visita no meio de uma estadia em aberto parte em duas, e o fim continua aberto',
    before: [g('sjc', '2026-09-01', null)],
    entries: [g('marau', '2026-10-30', '2026-11-03')],
    after: [g('sjc', '2026-09-01', '2026-10-29'), g('marau', '2026-10-30', '2026-11-03'), g('sjc', '2026-11-04', null)],
  },
  {
    name: 'no meio de uma estadia fechada',
    before: [g('sjc', '2026-09-01', '2026-09-30')],
    entries: [g('marau', '2026-09-10', '2026-09-12')],
    after: [g('sjc', '2026-09-01', '2026-09-09'), g('marau', '2026-09-10', '2026-09-12'), g('sjc', '2026-09-13', '2026-09-30')],
  },
  {
    name: 'um dia só (intervalo inclusivo)',
    before: [g('sjc', '2026-09-01', '2026-09-30')],
    entries: [g('marau', '2026-09-15', '2026-09-15')],
    after: [g('sjc', '2026-09-01', '2026-09-14'), g('marau', '2026-09-15', '2026-09-15'), g('sjc', '2026-09-16', '2026-09-30')],
  },
  {
    name: 'cobrindo várias: corta as duas pontas e apaga a do meio',
    before: [g('sjc', '2026-09-01', '2026-09-10'), g('marau', '2026-09-11', '2026-09-20'), g('sjc', '2026-09-21', '2026-09-30')],
    entries: [g('paraty', '2026-09-05', '2026-09-25')],
    after: [g('sjc', '2026-09-01', '2026-09-04'), g('paraty', '2026-09-05', '2026-09-25'), g('sjc', '2026-09-26', '2026-09-30')],
  },
  {
    name: 'estadia inteira dentro do intervalo é apagada',
    before: [g('marau', '2026-09-10', '2026-09-12')],
    entries: [g('sjc', '2026-09-01', '2026-09-30')],
    after: [g('sjc', '2026-09-01', '2026-09-30')],
  },
  {
    name: 'começa no mesmo dia e termina depois: só a ponta de trás sobra',
    before: [g('sjc', '2026-09-10', '2026-09-20')],
    entries: [g('marau', '2026-09-10', '2026-09-15')],
    after: [g('marau', '2026-09-10', '2026-09-15'), g('sjc', '2026-09-16', '2026-09-20')],
  },
  {
    name: 'encostando na borda, mesma cidade: funde',
    before: [g('sjc', '2026-09-01', '2026-09-10')],
    entries: [g('sjc', '2026-09-11', '2026-09-15')],
    after: [g('sjc', '2026-09-01', '2026-09-15')],
  },
  {
    name: 'encostando na borda, cidade diferente: não mexe na vizinha',
    before: [g('sjc', '2026-09-01', '2026-09-10')],
    entries: [g('marau', '2026-09-11', '2026-09-15')],
    after: [g('sjc', '2026-09-01', '2026-09-10'), g('marau', '2026-09-11', '2026-09-15')],
  },
  {
    name: 'fusão dos dois lados: devolver a mesma cidade tapa o buraco',
    before: [g('sjc', '2026-09-01', '2026-09-10'), g('marau', '2026-09-11', '2026-09-13'), g('sjc', '2026-09-14', '2026-09-30')],
    entries: [g('sjc', '2026-09-11', '2026-09-13')],
    after: [g('sjc', '2026-09-01', '2026-09-30')],
  },
  {
    name: 'mesma cidade dentro da estadia aberta é idempotente',
    before: [g('sjc', '2026-09-01', null)],
    entries: [g('sjc', '2026-10-01', '2026-10-05')],
    after: [g('sjc', '2026-09-01', null)],
  },
  {
    name: 'pintar em aberto apaga o futuro e funde com o pedaço de antes',
    before: [g('sjc', '2026-09-01', '2026-09-10'), g('marau', '2026-09-11', '2026-09-20'), g('sjc', '2026-09-21', null)],
    entries: [g('marau', '2026-09-15', null)],
    after: [g('sjc', '2026-09-01', '2026-09-10'), g('marau', '2026-09-11', null)],
  },
  {
    name: 'duas entradas da mesma pessoa, em ordem: a segunda sobrescreve a primeira',
    before: [],
    entries: [g('sjc', '2026-09-01', '2026-09-30'), g('marau', '2026-09-10', '2026-09-12')],
    after: [g('sjc', '2026-09-01', '2026-09-09'), g('marau', '2026-09-10', '2026-09-12'), g('sjc', '2026-09-13', '2026-09-30')],
  },
  {
    name: 'duas pessoas na mesma chamada não se afetam',
    before: [g('sjc', '2026-09-01', null), l('marau', '2026-09-01', null)],
    entries: [g('marau', '2026-09-10', '2026-09-12'), l('marau', '2026-09-10', '2026-09-12')],
    after: [
      g('sjc', '2026-09-01', '2026-09-09'),
      g('marau', '2026-09-10', '2026-09-12'),
      g('sjc', '2026-09-13', null),
      l('marau', '2026-09-01', null),
    ],
  },
  {
    name: 'editar período: casas nos dias tirados, depois o intervalo novo',
    before: [g('sjc', '2026-09-01', null), l('sjc', '2026-09-21', '2026-09-30'), l('marau', '2026-10-01', null)],
    entries: [l('marau', '2026-09-28', '2026-09-30'), l('sjc', '2026-09-21', '2026-09-27')],
    after: [g('sjc', '2026-09-01', null), l('sjc', '2026-09-21', '2026-09-27'), l('marau', '2026-09-28', null)],
  },
]
