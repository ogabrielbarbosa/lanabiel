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
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup.ts'],
        },
      },
      {
        // Integração: RLS, restrições e auth. DORMENTE — não há banco de teste
        // (ADR 0010). O harness recusa rodar contra o projeto de produção.
        test: {
          name: 'db',
          environment: 'node',
          include: ['supabase/tests/**/*.test.ts'],
        },
      },
    ],
  },
})
