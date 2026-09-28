// O CSS de produção passa pelo lightningcss (minificador do `vite build`); o
// dev não. Duas vezes ele apagou em silêncio o que o dev mostrava:
//
// - `backdrop-filter` seguido de `-webkit-backdrop-filter`: fica só o último,
//   que o Chrome ignora — nenhum vidro desfocava em produção.
// - `mask: … exclude` + `-webkit-mask-composite`: perde o `exclude` e o anel
//   do `.lg` vira um véu sobre o vidro inteiro.
//
// Aqui cada arquivo passa pelo mesmo minificador, com alvos que incluem um
// Safari que ainda pede prefixo, e o que o Chrome lê precisa sobreviver.

import { transform } from 'lightningcss'
import { describe, expect, it } from 'vitest'

// `?raw` em vez de `node:fs`: `src` é tipado como browser, sem os tipos do Node.
const FILES = import.meta.glob<string>('/src/**/*.css', { query: '?raw', import: 'default', eager: true })

// Mesma forma do `baseline-widely-available` do Vite: Safari 16 ainda pede
// `-webkit-backdrop-filter`, que é o que liga a fusão dos dois.
const TARGETS = { chrome: 107 << 16, edge: 107 << 16, firefox: 104 << 16, safari: 16 << 16 }

function count(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0
}

describe('CSS depois do minificador de produção', () => {
  it('encontra os arquivos', () => expect(Object.keys(FILES).length).toBeGreaterThan(5))

  for (const [file, raw] of Object.entries(FILES)) {
    it(file, () => {
      const source = raw.replace(/\/\*[\s\S]*?\*\//g, '')
      const { code } = transform({ filename: file, code: new TextEncoder().encode(source), minify: true, targets: TARGETS })
      const out = new TextDecoder().decode(code)

      expect(count(out, /(?<!-webkit-)backdrop-filter:/g)).toBe(
        count(source, /(?<!-webkit-)backdrop-filter\s*:/g),
      )
      expect(count(out, /mask-composite:exclude/g)).toBeGreaterThanOrEqual(
        count(source, /mask-composite\s*:\s*exclude/g),
      )
    })
  }
})
