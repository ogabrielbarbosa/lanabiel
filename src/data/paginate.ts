// Leitura paginada do PostgREST — o único lugar que sabe do corte de 1000.
//
// O PostgREST corta cada resposta em `max-rows` (1000 no Supabase) SEM erro:
// a primeira página vem com status 200 e parece a tabela inteira. Contar ou
// mostrar sobre ela seria afirmar um acervo menor que o real (`list_photos`
// passa de 1000 com ~100 itens feitos). Toda leitura que pode crescer passa
// por aqui, com ordem ESTÁVEL (uma coluna única no fim do `order`) — sem ela
// duas páginas podem repetir ou pular linhas.

import type { DataResult } from './result'

/** O `max-rows` do projeto. Uma página menor que isso é a última. */
export const PAGE_SIZE = 1000

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * Pede `page(from, to)` de `PAGE_SIZE` em `PAGE_SIZE` até vir uma página
 * incompleta. `to` é inclusivo, como no `.range()` do PostgREST. Qualquer
 * página com erro derruba o todo: metade da tabela não é resultado.
 */
export async function selectAll<T>(page: (from: number, to: number) => Page<T>): Promise<DataResult<T[]>> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) return { status: 'error', cause: error.message }
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < PAGE_SIZE) return { status: 'ok', rows }
  }
}
