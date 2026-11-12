// Testes de fumaça (smoke): o essencial está de pé? Só telas públicas, sem login, sem dados reais.
import { expect, test } from '@playwright/test'

test('a tela de login abre e mostra os campos de e-mail e senha', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('h1').first()).toBeVisible()
  await expect(page.locator('#email')).toBeVisible()
  await expect(page.locator('#senha')).toBeVisible()
})

test('o campo de senha esconde o que é digitado', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('#senha')).toHaveAttribute('type', 'password')
})

test('a tela de login não gera erros de JavaScript no navegador', async ({ page }) => {
  const erros: string[] = []
  page.on('pageerror', (e) => erros.push(e.message))
  await page.goto('/login')
  await page.waitForLoadState('networkidle')
  expect(erros).toEqual([])
})

test('área restrita sem login não mostra conteúdo (redireciona ou nega)', async ({ page }) => {
  await page.goto('/curadoria')
  // espera a tela decidir: o sistema confere a sessão na API e então redireciona/nega
  await expect
    .poll(async () => /login|acesso-negado|entrar/.test(page.url()) || (await page.locator('#senha').count()) > 0, {
      timeout: 20_000,
      message: 'a área restrita não redirecionou nem exibiu o login',
    })
    .toBeTruthy()
})
