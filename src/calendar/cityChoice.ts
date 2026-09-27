// O que o seletor de cidade (R17) devolve, e como quem salva resolve isso num
// `city_id`. Sem JSX: fica fora de `CityPicker.tsx` para o fast refresh
// (oxlint `only-export-components`).
//
// Spec: .agent/Tasks/fase-5-calendario.md — R17, I2, seção 7 ("Evento de viagem — cascata")
// ADR:  .agent/Decisions/0017-cidades-do-mundo-por-casal.md
//
// Uma cidade estrangeira escolhida no Photon NÃO é gravada na hora da escolha:
// o seletor devolve um `WorldPick`, e só quem salva chama `ensureWorldCity`,
// logo antes da escrita. Escolher Lisboa e cancelar não deixa linha em `cities`.

import type { CalCity } from '../domain/calendar'
import { countryNamePt } from '../data/places'
import type { CalendarApi, WorldCityCandidate } from './api'
import { writeFailureMessage } from './context'

/** Um resultado do Photon escolhido, ainda não gravado em `cities`. */
export interface WorldPick {
  kind: 'world'
  candidate: WorldCityCandidate
}

/**
 * O valor do seletor: uma cidade que já tem `id` (IBGE, casa, ou do mundo já
 * gravada pelo casal) ou um `WorldPick`. `CalCity` entra sem embrulho, para o
 * contrato antigo (`onChange(CalCity | null)`) continuar valendo.
 */
export type CityChoice = CalCity | WorldPick

export function isWorldPick(choice: CityChoice): choice is WorldPick {
  return (choice as WorldPick).kind === 'world'
}

export interface CityPickerProps {
  value: CityChoice | null
  onChange: (city: CityChoice | null) => void
  /** Nome acessível do campo. */
  label: string
}

/**
 * O id que a PRÉVIA usa (`paintStays`, `previewImpact`). Um `WorldPick` ainda
 * não tem id: ganha um provisório, que nunca vai para o banco e que não é casa
 * de ninguém — a prévia mostra "viajando", que é o que vai acontecer.
 */
export function previewCityId(choice: CityChoice): string {
  return isWorldPick(choice) ? `world:${choice.candidate.osmRef}` : choice.id
}

/** "Lisboa · Portugal" (mundo) · "Pelotas, RS" (IBGE). */
export function cityChoiceLabel(choice: CityChoice): string {
  if (isWorldPick(choice)) return `${choice.candidate.name} · ${choice.candidate.country}`
  if (choice.countryCode === 'BR') return choice.stateCode ? `${choice.name}, ${choice.stateCode}` : choice.name
  return `${choice.name} · ${countryNamePt(choice.countryCode)}`
}

export const CITY_DEBOUNCE_MS = 350
export const IBGE_MIN_QUERY = 2
export const WORLD_MIN_QUERY = 3

export interface CityHome {
  city: CalCity
  /** "Lana" — vira "casa de Lana" (sem artigo: "da/do" presumiria o gênero pelo nome). */
  owner: string
}

/** "Marau, RS · casa de Lana"; `null` se a cidade não é casa de ninguém. */
export function homeLabel(homes: readonly CityHome[], city: CalCity): string | null {
  const owners = homes.filter((h) => h.city.id === city.id).map((h) => h.owner)
  if (owners.length === 0) return null
  return `${cityChoiceLabel(city)} · ${owners.length > 1 ? 'casa de vocês' : `casa de ${owners[0]}`}`
}

/** O texto de um valor escolhido — a casa ganha o "· casa de {nome}". */
export function pickedLabel(choice: CityChoice, homes: readonly CityHome[]): string {
  if (!isWorldPick(choice)) return homeLabel(homes, choice) ?? cityChoiceLabel(choice)
  return cityChoiceLabel(choice)
}

export type ResolvedCity = { ok: true; city: CalCity } | { ok: false; message: string }

/**
 * O passo (1) da cascata da seção 7: cidade com id passa direto; `WorldPick`
 * vira linha do casal por `ensureWorldCity` (que reaproveita a mesma
 * `osm_ref`). Falhou → nada foi gravado, e quem chamou não escreve mais nada.
 */
export async function resolveCity(api: Pick<CalendarApi, 'ensureWorldCity'>, coupleId: string, choice: CityChoice): Promise<ResolvedCity> {
  if (!isWorldPick(choice)) return { ok: true, city: choice }
  const result = await api.ensureWorldCity(coupleId, choice.candidate)
  if (result.status !== 'ok') return { ok: false, message: `não deu pra guardar a cidade: ${writeFailureMessage(result)}` }
  return { ok: true, city: result.value }
}
