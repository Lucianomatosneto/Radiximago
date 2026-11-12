// Vitest = executor de testes de funções do frontend (rápido, sem navegador).
// "npm run cobertura" mede quanto do código do frontend (frontend/src) os
// testes exercitam e grava frontend/coverage/lcov.info para o SonarCloud.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // o frontend usa jsx "preserve" (o Next.js transforma); aqui o JSX vira codigo comum
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['vitest/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // todo o codigo do frontend entra na conta, inclusive o que nenhum teste toca
      include: ['../../../frontend/src/**/*.{ts,tsx}'],
      exclude: ['**/*.d.ts'],
      allowExternal: true,
      reporter: ['lcov', 'text-summary'],
      reportsDirectory: '../../../frontend/coverage',
    },
  },
})
