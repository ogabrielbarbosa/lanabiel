import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import type { UserConfig } from 'vite'

// Versão e build reais para o "Sobre o app" das Configurações (R5): a versão do
// package.json e o SHA curto do commit. Fora de um repositório git, "dev".
function buildId(): string {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'dev'
  }
}

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// Toda `VITE_*` é copiada para o bundle público. Um token SECRETO do Mapbox
// (`sk.`) ali vazaria no primeiro deploy — o build para antes (ADR 0022).
// Em `serve` só avisa: o adaptador já recusa o token, e o resto do app segue.
export default defineConfig(({ command, mode }) => {
  const token = loadEnv(mode, process.cwd(), 'VITE_').VITE_MAPBOX_TOKEN
  if (token && !token.startsWith('pk.')) {
    const message = 'VITE_MAPBOX_TOKEN precisa ser um token PÚBLICO do Mapbox (pk.…), nunca o secreto (sk.…) — ele vai para o bundle.'
    if (command === 'build') throw new Error(message)
    console.warn(`\n⚠ ${message}\n`)
  }
  return config
})

const config: UserConfig = {
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(buildId()),
  },
}
