import { defineConfig } from 'vitest/config'

// Testes de domínio (`src`) são puros e rodam no gate a cada Stop.
// Testes de integração (`supabase/tests`) exigem a stack local de pé e rodam
// no Gate 3 — ver `.devkit/profile.sh`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
  },
})
