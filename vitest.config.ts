import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Três projetos, dois ambientes. O recorte é por PADRÃO DE ARQUIVO, não global
// — ADR 0005: só `.test.tsx` paga o custo de DOM. Ambiente jsdom global
// deixaria a suíte de domínio (que roda no gate a cada Stop) mais lenta sem
// ganhar nada, e gate lento é gate que alguém desliga.
//
// `test.projects` e não `environmentMatchGlobs`: o segundo foi removido no
// Vitest 4, que é o que este projeto usa.
export default defineConfig({
  test: {
    projects: [
      {
        // Domínio puro. Sem DOM, sem rede, sem plugin de React.
        test: {
          name: 'domain',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        // Comportamento de tela. Precisa do plugin de React para o JSX.
        plugins: [react()],
        // As constantes que o vite.config.ts injeta no build (versão e commit).
        define: {
          __APP_VERSION__: JSON.stringify('0.0.0-test'),
          __APP_BUILD__: JSON.stringify('test'),
        },
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        // Integração: RLS, restrições e auth, contra o projeto ONLINE (ADR
        // 0014) — só com `npm run test:db`, que põe a flag que o harness exige.
        // Fora do `npm run test` e do hook Stop: rede e usuários reais.
        test: {
          name: 'db',
          environment: 'node',
          include: ['supabase/tests/**/*.test.ts'],
          // Um arquivo por vez, e tempo para esperar o limite de login do Auth
          // online (30 a cada 5 min por IP) — ver `anonClient` no harness.
          fileParallelism: false,
          testTimeout: 600_000,
          hookTimeout: 600_000,
        },
      },
    ],
  },
})
