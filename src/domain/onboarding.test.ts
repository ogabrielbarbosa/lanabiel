import { describe, expect, it } from 'vitest'
import {
  CODE_ALPHABET,
  distanceKm,
  extractInviteCode,
  fitsLimit,
  formatInviteCode,
  isValidEmail,
  normalizeInviteCode,
  togetherFor,
} from './onboarding'

describe('normalizeInviteCode', () => {
  it('aceita minúsculas, hífen e espaço', () => {
    expect(normalizeInviteCode('7k4-q92')).toBe('7K4Q92')
    expect(normalizeInviteCode(' 7K4 Q92 ')).toBe('7K4Q92')
  })

  it('lê O como zero e I/L como um (A6)', () => {
    expect(normalizeInviteCode('7K4-QO2')).toBe('7K4Q02')
    expect(normalizeInviteCode('ILAB2C')).toBe('11AB2C')
  })

  it('recusa tamanho errado e letra fora do alfabeto', () => {
    expect(normalizeInviteCode('7K4Q9')).toBeNull()
    expect(normalizeInviteCode('7K4Q921')).toBeNull()
    expect(normalizeInviteCode('7K4QU2')).toBeNull() // U não existe em Crockford
    expect(normalizeInviteCode('7K4Q9!')).toBeNull()
  })

  it('o alfabeto não tem as letras que confundem', () => {
    expect(CODE_ALPHABET).toHaveLength(32)
    for (const letter of 'ILOU') expect(CODE_ALPHABET).not.toContain(letter)
  })
})

describe('extractInviteCode (A28)', () => {
  it('acha o código numa mensagem do WhatsApp', () => {
    expect(extractInviteCode('entra aí: 7K4-Q92 ❤️')).toBe('7K4Q92')
  })

  it('não confunde palavra comum com o código', () => {
    // "codigo" normaliza para C0D1G0, que é válido — o formato com hífen ganha.
    expect(extractInviteCode('o codigo eh 7K4-Q92')).toBe('7K4Q92')
    // Sem hífen, ganha o bloco que tem dígito.
    expect(extractInviteCode('codigo 7k4q92')).toBe('7K4Q92')
  })

  it('devolve null quando não há código', () => {
    expect(extractInviteCode('oi amor, tudo bem?')).toBeNull()
  })
})

describe('formatInviteCode', () => {
  it('quebra no meio, como a tela mostra', () => {
    expect(formatInviteCode('7K4Q92')).toBe('7K4-Q92')
  })
})

describe('validação de campo', () => {
  it('conta depois de trim', () => {
    expect(fitsLimit('   ', 30)).toBe(false)
    expect(fitsLimit(' Rafa ', 4)).toBe(true)
    expect(fitsLimit('Rafa!', 4)).toBe(false)
  })

  it('e-mail com a mesma régua do banco', () => {
    expect(isValidEmail('duda@exemplo.com')).toBe(true)
    expect(isValidEmail('duda@exemplo')).toBe(false)
    expect(isValidEmail('du da@exemplo.com')).toBe(false)
  })
})

describe('togetherFor', () => {
  it('o exemplo do design', () => {
    expect(togetherFor('2024-09-17', '2026-09-25')).toBe('juntos há 2 anos e 8 dias')
  })

  it('singular, ano exato e menos de um ano', () => {
    expect(togetherFor('2025-09-24', '2026-09-25')).toBe('juntos há 1 ano e 1 dia')
    expect(togetherFor('2024-09-25', '2026-09-25')).toBe('juntos há 2 anos')
    expect(togetherFor('2026-08-11', '2026-09-25')).toBe('juntos há 45 dias')
    expect(togetherFor('2026-09-25', '2026-09-25')).toBe('juntos desde hoje')
  })

  it('não chama de ano completo o que ainda não fez aniversário', () => {
    expect(togetherFor('2023-03-03', '2026-09-26')).toBe('juntos há 3 anos e 207 dias')
    expect(togetherFor('2024-12-01', '2026-09-25')).toMatch(/^juntos há 1 ano e/)
  })
})

describe('distanceKm', () => {
  it('SJC a Marau em linha reta', () => {
    const sjc = { lat: -23.1791, lng: -45.8872 }
    const marau = { lat: -28.4497, lng: -52.1986 }
    expect(distanceKm(sjc, marau)).toBe(861)
  })

  it('mesma cidade é zero', () => {
    const p = { lat: -23.1791, lng: -45.8872 }
    expect(distanceKm(p, p)).toBe(0)
  })
})
