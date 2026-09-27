// As derivações do painel da Home que não são de domínio compartilhado: a
// copy com dado de cada bloco (R16, R19, R20). Puro: `Date` só via `lib/date`.

import { isMediaCategory } from '../../domain/list'
import type { ListItem } from '../../domain/list'
import { cityCode } from '../../domain/map'
import { countryLabel } from '../../domain/tripDerive'
import type { Trip } from '../../domain/trips'
import { dayMonthLong, longDateBR } from '../../lib/date'
import type { HomePerson } from '../context'

/**
 * R16: a origem é o `origin_code` da saída de quem vê; sem ele, o `cityCode`
 * da casa dele (_GRU_, _SJC_). Não é o `originOf` das Viagens, que cai no
 * nome curto da casa (_Marau_): o chip da Home é sempre um código.
 */
export function routeChip(trip: Pick<Trip, 'departures'>, me: Pick<HomePerson, 'profileId' | 'homeCity'>, destName: string): string {
  const code = trip.departures.find((d) => d.profileId === me.profileId)?.originCode?.trim()
  return `${code || cityCode(me.homeCity.name)} → ${cityCode(destName)}`
}

/** Os destaques a fazer, do mais recente ao mais antigo. */
export function featuredItems(items: readonly ListItem[], hidden: readonly string[], limit = 3): ListItem[] {
  return items
    .filter((i) => i.featured && i.status === 'want' && !hidden.includes(i.category))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

/** _"Rio de Janeiro, RJ"_ · _"Göreme, Turquia"_ · o país sozinho · a plataforma na mídia. */
export function featuredPlace(item: ListItem): string {
  if (isMediaCategory(item.category)) return item.platform ?? ''
  const p = item.place
  if (!p) return ''
  const code = p.countryCode.toUpperCase()
  const tail = code === 'BR' ? p.state : countryLabel(code)
  if (!p.city || item.category === 'pais') return countryLabel(code)
  return tail ? `${p.city}, ${tail}` : p.city
}

/** _"12 a 19 de julho de 2026"_ · _"28 de setembro a 3 de outubro de 2026"_ · _"28 de dezembro de 2026 a 3 de janeiro de 2027"_. */
export function longRangeLabel(from: string, to: string): string {
  if (from === to) return longDateBR(to)
  if (from.slice(0, 7) === to.slice(0, 7)) return `${Number(from.slice(8))} a ${longDateBR(to)}`
  if (from.slice(0, 4) === to.slice(0, 4)) return `${dayMonthLong(from)} a ${longDateBR(to)}`
  return `${longDateBR(from)} a ${longDateBR(to)}`
}
