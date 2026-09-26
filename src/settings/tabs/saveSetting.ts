// Gravar uma preferência do casal a partir de qualquer aba: patch de uma
// coluna, e a tela passa a mostrar a linha que o banco devolveu (R24).

import type { CoupleSettings } from '../../data/settings'
import { failureMessage } from '../context'
import type { TabContext } from '../context'

export function saveCoupleSetting<K extends keyof CoupleSettings>(
  ctx: TabContext,
  key: K,
  value: CoupleSettings[K],
): Promise<boolean> {
  return ctx.writes.run(key, async () => {
    const result = await ctx.api.updateCoupleSettings({ [key]: value } as Partial<CoupleSettings>)
    if (result.status === 'ok') {
      ctx.update((d) => ({ ...d, coupleSettings: result.value }))
      return null
    }
    return result.status === 'invalid' ? `O valor não foi aceito: ${result.cause}` : failureMessage(result)
  })
}
