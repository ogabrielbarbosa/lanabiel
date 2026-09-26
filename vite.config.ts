import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_BUILD__: JSON.stringify(buildId()),
  },
})
