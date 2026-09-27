// Constantes e rótulos do Detalhe da viagem que não são componente: as cores
// e ícones de cada tipo do roteiro, a estação do ícone da nota, plurais,
// dinheiro e o rótulo da tira _No calendário_.
//
// Spec: .agent/Tasks/fase-6-viagens.md — R15–R22

import type { CSSProperties } from 'react'
import { Building2, Bus, House, MapPin, PlaneLanding, Soup, Sparkles, Trees, Utensils } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { bandLabel } from '../../domain/calendar'
import type { CityMap, MembersBySlot, NamesBySlot, Run } from '../../domain/calendar'
import { dayOfTrip } from '../../domain/tripDerive'
import type { ItineraryKind, Trip } from '../../domain/trips'
import { weekdayShortDayMonth } from '../../lib/date'

/** A cor de cada tipo: um token `--td-*` (claro e escuro em trip-detail.css). */
export const ITINERARY_VISUAL: Record<ItineraryKind, { icon: LucideIcon; tone: string }> = {
  voo: { icon: PlaneLanding, tone: 'lime' },
  hospedagem: { icon: House, tone: 'peach' },
  transporte: { icon: Bus, tone: 'sky' },
  restaurante: { icon: Utensils, tone: 'coral' },
  comida: { icon: Soup, tone: 'sand' },
  parque: { icon: Trees, tone: 'aqua' },
  cidade: { icon: Building2, tone: 'peach' },
  experiencia: { icon: Sparkles, tone: 'lime' },
  outro: { icon: MapPin, tone: 'lilac' },
}

/** `style` que liga `--tone` ao token do tipo. */
export function toneStyle(tone: string): CSSProperties {
  return { '--tone': `var(--td-${tone})` } as CSSProperties
}

export type Season = 'inverno' | 'primavera' | 'verao' | 'outono'

/**
 * A estação do mês da ida NO DESTINO — o hemisfério vem da latitude: o ícone
 * da nota no herói (❄ _Férias de inverno_ em Ilhabela, julho; 🍃 _Outono
 * europeu_ em Lisboa, outubro). É derivação visual, não dado: a nota é texto livre.
 */
export function seasonOf(startsOn: string, lat: number | undefined): Season {
  const month = Number(startsOn.slice(5, 7))
  const north = (lat ?? 0) >= 0
  const quarter = month === 12 || month <= 2 ? 0 : month <= 5 ? 1 : month <= 8 ? 2 : 3 // dez–fev, mar–mai, jun–ago, set–nov
  const northern: Season[] = ['inverno', 'primavera', 'verao', 'outono']
  const southern: Season[] = ['verao', 'outono', 'inverno', 'primavera']
  return (north ? northern : southern)[quarter]
}

/** "{n} cidades" (e "1 cidade"). */
export function citiesLabel(n: number): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? 'cidade' : 'cidades'}`
}

/** "{n} lugares" (e "1 lugar"). */
export function placesLabel(n: number): string {
  return `${n.toLocaleString('pt-BR')} ${n === 1 ? 'lugar' : 'lugares'}`
}

/** R22 "foto {do Gabriel | da Lana}": sem gênero no perfil, o artigo sai da última letra do nome. */
export function photoOf(name: string): string {
  return `foto ${/a$/i.test(name.trim()) ? 'da' : 'do'} ${name}`
}

/** "Dia {k} · {Sáb, 12 jul}"; um dia fora da viagem (item antigo) diz isso. */
export function dayOptionLabel(trip: Pick<Trip, 'startsOn' | 'endsOn'>, day: string): string {
  const k = dayOfTrip(trip, day)
  return k === null ? `Fora das datas · ${weekdayShortDayMonth(day)}` : `Dia ${k} · ${weekdayShortDayMonth(day)}`
}

/** "9.800" · "9800" · "9.800,50" · "R$ 42" → centavos; vazio → `null`; lixo → `NaN`. */
export function parseBRL(text: string): number | null {
  const s = text.replace(/R\$|\s/g, '')
  if (s === '') return null
  let normalized: string
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, '')
  else normalized = s
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN
  return Math.round(Number(normalized) * 100)
}

/** Centavos → o texto do campo ("9.800" / "9.800,50"). */
export function centsText(cents: number | null): string {
  if (cents === null) return ''
  const whole = cents % 100 === 0
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })
}

/** R18: "{Viajando juntos | Juntos em … | Separados} · {destino}", do trecho que domina a viagem. */
export function calendarStripLabel(
  run: Run | null,
  destName: string,
  ctx: { names: NamesBySlot; cities: CityMap; members: MembersBySlot },
): string {
  if (run === null || run.band === 'unknown') return `Sem período no calendário · ${destName}`
  if (run.band === 'away') return `Viajando juntos · ${destName}`
  if (run.band === 'apart') return `Separados · ${destName}`
  const main = bandLabel(run, ctx.names, ctx.cities, ctx.members)
  return main.includes(destName) ? main : `${main} · ${destName}`
}
