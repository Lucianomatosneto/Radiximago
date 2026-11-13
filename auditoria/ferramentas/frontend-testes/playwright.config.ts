// Playwright = "robô" que abre um navegador de verdade e usa o site como uma pessoa.
// Este teste só olha telas públicas e NÃO usa dados reais.
//
// Como rodar (a partir desta pasta):
//   1) deixe o frontend ligado (docker compose up, ou "npm run dev" na pasta frontend)
//   2) RADIX_URL=http://localhost:3000 npx playwright test
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../relatorios/playwright-html' }]],
  use: {
    baseURL: process.env.RADIX_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // video da falha: so no GitHub (o workflow instala o Chromium com o ffmpeg)
    video: process.env.CI ? 'retain-on-failure' : 'off',
    // No GitHub Actions o Chromium é instalado pelo workflow. Localmente, pode-se
    // usar o Chrome já instalado: PLAYWRIGHT_CHROME_DO_SISTEMA=/caminho/do/chrome
    launchOptions: process.env.PLAYWRIGHT_CHROME_DO_SISTEMA
      ? { executablePath: process.env.PLAYWRIGHT_CHROME_DO_SISTEMA }
      : {},
  },
})
