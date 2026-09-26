import { describe, expect, it } from 'vitest'
// `?raw` em vez de `node:fs`: este arquivo vive sob `src`, que é tipado como
// código de navegador (`types: ["vite/client"]`). Trazer os tipos do Node para
// cá só por causa de um teste poluiria o tsconfig da aplicação.
import generated from './database.types.ts?raw'

/**
 * I1 — nenhuma coluna armazena estado ou período de casal.
 *
 * O arquivo é GERADO do schema (`npm run types:gen`), então afirmar sobre ele é
 * afirmar sobre o banco, e sem precisar de banco de pé. A tentativa anterior
 * neste mesmo projeto tinha `calendar_events.location_type` com seis rótulos de
 * casal e RS/SP chumbados no CHECK — ver
 * `.agent/Decisions/0002-estadia-por-pessoa-estado-derivado.md`.
 */
const FORBIDDEN = [
  'location_type',
  'couple_state',
  'together_from',
  'together_until',
  'is_together',
  'period_state',
]

/**
 * Um campo `nome` no arquivo gerado, com ou sem aspas e com ou sem `?`. O
 * gerador local escreve `"ends_on": string | null,` numa linha só; o do projeto
 * online (`--linked`), `ends_on: string | null` em linhas separadas. Afirmar
 * sobre o texto exato de um dos dois tornaria o teste de coluna proibida
 * VAZIO no outro formato — ele nunca acharia `"location_type"` sem aspas.
 */
function field(name: string, type: string): RegExp {
  const escaped = type.replace(/[|]/g, '\\|')
  return new RegExp(`"?\\b${name}\\b"?\\??:\\s*${escaped}(?=\\s*[,\\n}])`)
}

describe('tipos gerados do schema', () => {
  it.each(FORBIDDEN)('não existe coluna `%s` em nenhuma tabela', (column) => {
    expect(generated).not.toMatch(new RegExp(`"?\\b${column}\\b"?\\??:`))
  })

  it('`stays.ends_on` é anulável — em aberto é um estado do tipo, não convenção', () => {
    expect(generated).toMatch(field('ends_on', 'string | null'))
  })

  it('`profiles.home_city_id` NÃO é anulável — sem ela a derivação mente', () => {
    expect(generated).toMatch(field('home_city_id', 'string'))
    expect(generated).not.toMatch(field('home_city_id', 'string | null'))
  })

  it('o detector de campo funciona nos DOIS formatos do gerador', () => {
    for (const text of ['"ends_on": string | null,', 'ends_on: string | null\n']) {
      expect(text).toMatch(field('ends_on', 'string | null'))
    }
    expect('home_city_id: string | null\n').not.toMatch(field('home_city_id', 'string'))
    expect('"location_type": string').toMatch(/"?\blocation_type\b"?\??:/)
    expect('location_type?: string').toMatch(/"?\blocation_type\b"?\??:/)
  })
})
