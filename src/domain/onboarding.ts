// Spec: .agent/Tasks/fase-2-onboarding.md, seções 5 e 6
// ADR:  .agent/Decisions/0008-convite-portador-e-um-casal-por-pessoa.md
//
// Puro: sem rede, sem DOM. A tela valida daqui para dar resposta na hora; o
// banco valida com `CHECK` e nas RPCs, e é a autoridade. Os dois lados têm os
// mesmos números — `supabase/tests/onboarding.test.ts` importa `LIMITS` e prova
// que o `CHECK` recusa `limite + 1` (I11). Mudou aqui, muda a migration.

import { parseISODate } from '../lib/date'

/** Tamanho máximo, em caracteres, depois de `trim`. Mínimo é sempre 1. */
export const LIMITS = {
  fullName: 80,
  displayName: 30,
  coupleName: 40,
  inviteeName: 30,
} as const

export const INVITE_TTL_DAYS = 7

/**
 * Crockford base32: sem I, L, O e U. A confusão entre O e 0 que o design
 * avisava some por construção — e a normalização abaixo aceita quem digitar a
 * letra mesmo assim.
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const CODE_LENGTH = 6

const CODE_PATTERN = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`)

/**
 * Espelha `couple_invites_email_format`. Não é validação de RFC — é a mesma
 * régua frouxa do banco, para a tela não aceitar o que o servidor recusa.
 */
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** `'7k4-q92'` → `'7K4Q92'`. Devolve `null` se não sobrar um código válido. */
export function normalizeInviteCode(raw: string): string | null {
  const code = raw
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  return CODE_PATTERN.test(code) ? code : null
}

/**
 * Acha o código num texto colado — a mensagem inteira do WhatsApp, não só o
 * código. Prefere o formato que o app mostra (`7K4-Q92`), depois um bloco com
 * algum dígito, e só por último um bloco só de letras: "codigo", sem acento,
 * normaliza para `C0D1G0` e é um código válido, então palavra comum não pode
 * ganhar de um código de verdade na mesma mensagem.
 */
export function extractInviteCode(pasted: string): string | null {
  const candidates = [...pasted.matchAll(/(?<![0-9A-Za-z])([0-9A-Za-z]{3})([-\s]?)([0-9A-Za-z]{3})(?![0-9A-Za-z])/g)]
    .map((m) => ({ code: normalizeInviteCode(m[1] + m[3]), hyphen: m[2] === '-', digit: /\d/.test(m[0]) }))
    .filter((c): c is { code: string; hyphen: boolean; digit: boolean } => c.code !== null)

  const pick =
    candidates.find((c) => c.hyphen) ?? candidates.find((c) => c.digit) ?? candidates[0]
  return pick?.code ?? null
}

/** `'7K4Q92'` → `'7K4-Q92'`. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`
}

export function isValidEmail(raw: string): boolean {
  return EMAIL_PATTERN.test(raw.trim())
}

/** Tamanho aceito pelo `CHECK`: entre 1 e `max` depois de `trim`. */
export function fitsLimit(value: string, max: number): boolean {
  const length = value.trim().length
  return length >= 1 && length <= max
}

/**
 * `'juntos há 2 anos e 8 dias'`. Conta anos de calendário (aniversário a
 * aniversário) e depois os dias desde o último — que é como uma pessoa conta,
 * e não `dias / 365`.
 */
export function togetherFor(startedOn: string, today: string): string {
  const start = parseISODate(startedOn)
  const end = parseISODate(today)
  if (end <= start) return 'juntos desde hoje'

  let years = end.getFullYear() - start.getFullYear()
  const anniversary = (y: number) => new Date(y, start.getMonth(), start.getDate())
  if (anniversary(start.getFullYear() + years) > end) years -= 1
  const lastAnniversary = anniversary(start.getFullYear() + years)
  const days = Math.round((end.getTime() - lastAnniversary.getTime()) / 86_400_000)

  const y = years === 1 ? '1 ano' : `${years} anos`
  const d = days === 1 ? '1 dia' : `${days} dias`
  if (years === 0) return `juntos há ${d}`
  if (days === 0) return `juntos há ${y}`
  return `juntos há ${y} e ${d}`
}

export interface LatLng {
  lat: number
  lng: number
}

/**
 * Linha reta (haversine), em km inteiros. É a distância que a tela _Tudo
 * pronto_ mostra. Não é rodoviária — a Fase 3 decide se o número das
 * Configurações vira rodoviário.
 */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)))
}
