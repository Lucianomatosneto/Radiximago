// Vitest = executor de testes de funções do frontend (rápido, sem navegador).
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['vitest/**/*.test.ts'], environment: 'node' },
})
