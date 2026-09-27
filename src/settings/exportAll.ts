// "Exportar tudo": lê as cidades das estadias, monta o documento e o entrega.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, R19 e seção 7 ("Export")
//       .agent/Tasks/fase-4-lista.md, R27 (a Lista entra no arquivo)

import { buildExport } from '../data/export'
import { failureMessage } from './context'
import type { TabContext } from './context'

/** Monta o JSON no navegador e o entrega (R19). Dados e privacidade e Zona sensível usam. */
export async function exportAll(ctx: TabContext): Promise<{ status: 'ok'; bytes: number } | { status: 'error'; cause: string }> {
  // Leitura nova, não o que a tela carregou ao abrir: o outro pode ter
  // mudado algo desde então, e o arquivo diz "tudo".
  const [fresh, list] = await Promise.all([ctx.api.loadSettings(), ctx.api.loadListExport()])
  if (fresh.status !== 'ok') return { status: 'error', cause: `os dados: ${failureMessage(fresh)}` }
  if (list.status !== 'ok') return { status: 'error', cause: `a lista: ${failureMessage(list)}` }
  const cities = await ctx.api.loadCitiesByIds(fresh.rows.stays.map((s) => s.cityId))
  if (cities.status !== 'ok') return { status: 'error', cause: `as cidades: ${failureMessage(cities)}` }
  const built = buildExport(fresh.rows, list.rows, cities.rows, new Date(ctx.api.now()).toISOString())
  if (built.status !== 'ok') return built
  ctx.api.download(`lanabiel-${ctx.today}.json`, built.json)
  return { status: 'ok', bytes: new Blob([built.json]).size }
}
