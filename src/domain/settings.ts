// Contrato das Configurações (Fase 3). Puro: sem Supabase, sem DOM.
//
// As listas daqui são as MESMAS dos `CHECK` no SQL (migration
// `…_settings.sql`), e `supabase/tests/settings.test.ts` prova a paridade
// (I5, I6). Mudou aqui, muda lá — e vice-versa.
//
// Spec: .agent/Tasks/fase-3-configuracoes.md, seção 5
// ADR:  .agent/Decisions/0011-preferencias-em-tres-escopos.md

import { countStates } from './coupleState'
import type { Member, Stay } from './coupleState'

/** Paleta pessoal: a cor da faixa de cada um no calendário. */
export const PERSON_COLORS = [
  '#7FD8C4',
  '#9CCBF2',
  '#C3B3F2',
  '#F4A3B4',
  '#EDA88A',
  '#F6E3A1',
  '#CBE68E',
] as const

/** Paleta das faixas de estado do casal: a pessoal mais o azul-ardósia de "Separados". */
export const BAND_COLORS = [...PERSON_COLORS, '#8E97BD'] as const

export type PersonColor = (typeof PERSON_COLORS)[number]
export type BandColor = (typeof BAND_COLORS)[number]

/** Cor de quem nasce em cada slot, e a que `accept_invite` dá quando as duas coincidem (I4). */
export const DEFAULT_COLOR_BY_SLOT = { 1: '#7FD8C4', 2: '#F4A3B4' } as const

/**
 * As oito categorias da Lista (ADR 0003). É O vocabulário: `hidden_categories`
 * só aceita estas chaves, e `list_items.category` (Fase 4) usa as mesmas (I6).
 */
export const LIST_CATEGORIES = [
  'pais',
  'cidade',
  'restaurante',
  'parque',
  'comida',
  'experiencia',
  'filme',
  'serie',
] as const
export type ListCategory = (typeof LIST_CATEGORIES)[number]

export const LIST_CATEGORY_LABEL: Record<ListCategory, string> = {
  pais: 'Países',
  cidade: 'Cidades',
  restaurante: 'Restaurantes',
  parque: 'Parques',
  comida: 'Comidas',
  experiencia: 'Experiências',
  filme: 'Filmes',
  serie: 'Séries',
}

export const NOTIFY_EVENTS = [
  'partner_list_item',
  'partner_done',
  'partner_event',
  'anniversary',
  'trip_eve',
  'own_reminders',
] as const
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number]

export const NOTIFY_CHANNELS = ['app', 'email', 'push'] as const
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number]

/** Nome da coluna em `profile_settings`: `notify_<evento>_<canal>`. */
export type NotifyColumn = `notify_${NotifyEvent}_${NotifyChannel}`

export function notifyColumn(event: NotifyEvent, channel: NotifyChannel): NotifyColumn {
  return `notify_${event}_${channel}`
}

/** Slugs das abas. São URL — e outras telas vão linkar direto para elas. */
export const SETTINGS_TABS = [
  'perfil-do-casal',
  'meu-perfil',
  'cidades',
  'calendario',
  'lista',
  'notificacoes',
  'aparencia',
  'dados-e-privacidade',
  'zona-sensivel',
] as const
export type SettingsTab = (typeof SETTINGS_TABS)[number]

export function isSettingsTab(value: string): value is SettingsTab {
  return (SETTINGS_TABS as readonly string[]).includes(value)
}

/**
 * Cota do Storage mostrada em _Dados e privacidade_: a do plano grátis do
 * Supabase. Mudou o plano — ou o Storage foi para R2/S3 — muda aqui.
 */
export const STORAGE_QUOTA_BYTES = 1_073_741_824

/**
 * O nome do casal como a interface mostra, e o que a Zona sensível pede para
 * confirmar: o nome gravado, ou `'Gabriel & Lana'` na ordem dos slots.
 */
export function coupleLabel(
  name: string | null,
  members: readonly { slot: 1 | 2; displayName: string }[],
): string {
  const trimmed = name?.trim()
  if (trimmed) return trimmed
  return [...members]
    .sort((a, b) => a.slot - b.slot)
    .map((m) => m.displayName)
    .join(' & ')
}

/**
 * Quem criou o espaço. Não é "slot 1": depois que alguém sai, quem entra fica
 * com a vaga livre, que pode ser a 1. `create_couple` insere o casal e o
 * primeiro membro na mesma transação, então `joined_at` = `created_at` (o
 * `now()` do Postgres é o do início da transação).
 */
export function isCreator(member: { joinedAt: string }, couple: { createdAt: string }): boolean {
  return Date.parse(member.joinedAt) === Date.parse(couple.createdAt)
}

/** `'23,18° S · 45,88° O'` — duas casas, vírgula decimal, hemisfério em português. */
export function formatCoord(lat: number, lng: number): string {
  const part = (value: number, positive: string, negative: string) =>
    `${Math.abs(value).toFixed(2).replace('.', ',')}° ${value < 0 ? negative : positive}`
  return `${part(lat, 'N', 'S')} · ${part(lng, 'L', 'O')}`
}

/** `1080` → `'1.080'`. Separador de milhar sem depender do ICU do ambiente. */
export function formatThousands(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/**
 * Dias juntos no ano, de 1º de janeiro até hoje (nunca futuro). `unknown` não
 * conta — lacuna não é "juntos" (ADR 0002). Ano que ainda não começou dá 0.
 */
export function daysTogetherInYear(
  stays: readonly Stay[],
  members: readonly [Member, Member],
  year: number,
  today: string,
): number {
  const from = `${year}-01-01`
  if (today < from) return 0
  return countStates(from, `${year}-12-31`, today, stays, members).together
}

/** `3_865_470_566` → `'3,6 GB'`; abaixo de 0,1 GB, em MB. */
export function formatBytes(bytes: number): { value: string; unit: 'GB' | 'MB' } {
  const gb = bytes / 1_073_741_824
  if (gb >= 0.1) return { value: gb.toFixed(1).replace('.', ','), unit: 'GB' }
  const mb = bytes / 1_048_576
  return { value: (mb < 10 ? mb.toFixed(1) : String(Math.round(mb))).replace('.', ','), unit: 'MB' }
}

/**
 * `'MacBook · Chrome'`, `'iPhone · Safari'`. Só o que o `user_agent` diz com
 * segurança — o modelo exato do aparelho ele não diz, e inventar é pior que
 * dizer "Mac".
 */
export function parseUserAgent(ua: string | null): { device: string; browser: string } {
  if (!ua) return { device: 'Aparelho desconhecido', browser: 'navegador desconhecido' }

  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Aparelho desconhecido'

  // A ordem importa: o UA do Edge contém "Chrome" e o do Chrome contém "Safari".
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\/|FxiOS\//.test(ua)
      ? 'Firefox'
      : /Chrome\/|CriOS\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'navegador desconhecido'

  return { device, browser }
}
