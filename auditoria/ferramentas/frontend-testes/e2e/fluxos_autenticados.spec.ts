// Testes no navegador COM LOGIN (13/11/2026). O "robo" usa o sistema como
// uma pessoa: entra com senha, com o codigo das 2 etapas, aceita os Termos,
// pesquisa e abre o painel do administrador.
//
// As contas sao DESCARTAVEIS: criadas pelo backend/scripts/semear_usuarios_teste.py
// (so roda com ENVIRONMENT=test), com senhas e segredos sorteados na hora e
// recebidos aqui por variaveis de ambiente (E2E_*). Nenhum dado real.
//
// O login tem limite de 5 tentativas por minuto por endereco (protecao contra
// adivinhacao de senha, ASVS 6.3.1). Por isso este arquivo faz so 4 logins,
// reaproveita a sessao entre os passos de cada perfil e NAO repete teste
// que falhou (retries 0): uma repeticao gastaria o limite e esconderia a causa.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { codigoTotp, segundosRestantes } from './apoio/totp'

test.use({ locale: 'pt-BR' })
test.describe.configure({ retries: 0 })

function variavel(nome: string): string {
  const valor = process.env[nome]
  if (!valor) throw new Error(`Falta a variavel ${nome}: rode backend/scripts/semear_usuarios_teste.py antes (ver testes-e2e.yml).`)
  return valor
}

async function entrarComSenha(page: Page, email: string, senha: string) {
  await page.goto('/login')
  await page.locator('#email').fill(email)
  await page.locator('#senha').fill(senha)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
}

async function aceitarTermoDeCiencia(page: Page) {
  const dialogo = page.locator('[data-teste=termo-ciencia]')
  await expect(dialogo).toBeVisible()
  await expect(page.locator('[data-teste=termo-aceitar]')).toBeDisabled()
  await page.locator('[data-teste=termo-caixa]').check()
  await page.locator('[data-teste=termo-aceitar]').click()
  await expect(dialogo).toBeHidden()
}

async function novaPaginaCom(browser: Browser, estado: Awaited<ReturnType<BrowserContext['storageState']>>) {
  const contexto = await browser.newContext({ storageState: estado, locale: 'pt-BR' })
  return { contexto, page: await contexto.newPage() }
}

// ---------------------------------------------------------------- sem login

test.describe('rotas protegidas e tela de login', () => {
  for (const rota of ['/painel-admin', '/usuarios', '/curadoria', '/pesquisa']) {
    test(`sem login, ${rota} manda para o login`, async ({ page }) => {
      await page.goto(rota)
      await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 20_000 })
      await expect(page.locator('#senha')).toBeVisible()
    })
  }

  test('acessibilidade: campos do login com rotulo e nenhum campo com foco automatico', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByLabel('E-mail')).toHaveAttribute('id', 'email')
    await expect(page.getByLabel('Senha', { exact: true })).toHaveAttribute('id', 'senha')
    await page.waitForLoadState('networkidle')
    expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BODY')
  })

  test('acessibilidade: o cadastro (solicitar acesso) abre sem foco automatico', async ({ page }) => {
    await page.goto('/solicitar-acesso')
    await page.waitForLoadState('networkidle')
    expect(await page.evaluate(() => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? ''))).toBe(false)
  })

  test('acessibilidade: ao navegar com Tab o campo com foco muda de aparencia', async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
    // aparencia que indica foco: contorno, sombra, borda ou fundo
    const aparencia = (id: string) =>
      page.locator(`#${id}`).evaluate((e) => {
        const s = getComputedStyle(e)
        return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.borderBottomColor, s.backgroundColor].join('|')
      })
    for (const id of ['email', 'senha']) {
      const semFoco = await aparencia(id)
      // chega ao campo pelo TECLADO (Tab), como quem nao usa mouse
      await page.locator(`#${id}`).focus()
      await page.keyboard.press('Shift+Tab')
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => document.activeElement?.id)).toBe(id)
      expect(await aparencia(id), `campo #${id} nao muda de aparencia ao receber o foco`).not.toBe(semFoco)
      await page.locator(`#${id}`).blur()
    }
  })

  test('senha errada e e-mail inexistente recebem a MESMA mensagem generica', async ({ page }) => {
    const aviso = page.locator('p[role=alert]')
    // guarda o que o SERVIDOR respondeu a cada tentativa (sem gastar logins a mais)
    const respostas: { status: number; corpo: string }[] = []
    await page.route('**/auth/login', async (rota) => {
      if (rota.request().method() !== 'POST') return rota.continue()
      const r = await rota.fetch()
      respostas.push({ status: r.status(), corpo: await r.text() })
      await rota.fulfill({ response: r })
    })
    await entrarComSenha(page, variavel('E2E_ESTUDANTE_EMAIL'), 'senha-errada-de-proposito')
    await expect(aviso).toBeVisible()
    const comConta = (await aviso.innerText()).trim()
    await entrarComSenha(page, 'ninguem-com-este-email@e2e.radix.test', 'senha-errada-de-proposito')
    await expect(aviso).toBeVisible()
    const semConta = (await aviso.innerText()).trim()
    expect(comConta).toBe('E-mail ou senha incorretos')
    expect(semConta).toBe(comConta)
    expect(respostas).toHaveLength(2)
    expect(respostas[0].status).toBe(401)
    expect(respostas[1], 'o servidor nao pode revelar se o e-mail existe').toEqual(respostas[0])
    await expect(page).toHaveURL(/\/login/)
  })
})

// ---------------------------------------------------------------- estudante

test.describe('estudante', () => {
  test.describe.configure({ mode: 'serial' })
  let sessao: Awaited<ReturnType<BrowserContext['storageState']>>

  test('primeiro login: Termos v1.1 exigem leitura e aceite, depois o termo de ciencia', async ({ page, context }) => {
    await entrarComSenha(page, variavel('E2E_ESTUDANTE_EMAIL'), variavel('E2E_ESTUDANTE_SENHA'))
    await expect(page).toHaveURL(/\/banco-imagens/)
    const aceite = page.locator('[data-teste=aceite-termos]')
    await expect(aceite).toBeVisible()
    await expect(aceite).toContainText('1.1')
    // so da para marcar "Li e concordo" depois de rolar o texto ate o fim
    await expect(page.locator('[data-teste=termos-concordo]')).toBeDisabled()
    await expect(page.locator('[data-teste=termos-aceitar]')).toBeDisabled()
    await page.locator('[data-teste=area-termos]').evaluate((e) => {
      e.scrollTop = e.scrollHeight
      e.dispatchEvent(new Event('scroll'))
    })
    await page.locator('[data-teste=termos-concordo]').check()
    await page.locator('[data-teste=termos-aceitar]').click()
    await expect(aceite).toBeHidden()
    await aceitarTermoDeCiencia(page)
    await expect(page.getByRole('heading', { name: 'Banco de imagens', level: 1 })).toBeVisible()
    sessao = await context.storageState()
  })

  test('pesquisa lista as fichas aprovadas e o filtro por dente funciona', async ({ browser }) => {
    const { contexto, page } = await novaPaginaCom(browser, sessao)
    try {
      await page.goto('/pesquisa')
      await expect(page.getByRole('heading', { name: /Pesquisa/, level: 1 })).toBeVisible()
      await expect(page.getByText(/2\s+imagens disponíveis no total/)).toBeVisible()
      await page.getByRole('button', { name: /^\W*Pesquisar$/u }).click()
      await expect(page.getByText(/2\s+imagens encontradas/)).toBeVisible()
      // os filtros recolhem depois da busca: volta a eles e escolhe so o dente 36
      // (a outra ficha e dos dentes 16 e 17)
      await page.getByRole('button', { name: 'Voltar à busca avançada' }).click()
      await page.getByRole('button', { name: '36', exact: true }).first().click()
      await page.getByRole('button', { name: /^\W*Pesquisar$/u }).click()
      await expect(page.getByText(/1\s+imagem encontrada/)).toBeVisible()
    } finally {
      await contexto.close()
    }
  })
})

// ---------------------------------------------------------------- administrador

test.describe('administrador', () => {
  test.describe.configure({ mode: 'serial' })
  let sessao: Awaited<ReturnType<BrowserContext['storageState']>>

  test('login em duas etapas: a senha certa ainda nao basta, o codigo do aplicativo completa', async ({ page, context }) => {
    await entrarComSenha(page, variavel('E2E_ADMIN_EMAIL'), variavel('E2E_ADMIN_SENHA'))
    const campoCodigo = page.locator('#codigo-segundo-fator')
    await expect(campoCodigo).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
    // codigo errado: recusado, continua na tela do codigo
    await campoCodigo.fill('000000')
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
    await expect(page.locator('p[role=alert]')).toBeVisible()
    // codigo certo, gerado aqui a partir do segredo (longe da virada dos 30 s)
    if (segundosRestantes() < 5) await page.waitForTimeout(segundosRestantes() * 1000 + 500)
    await campoCodigo.fill(codigoTotp(variavel('E2E_ADMIN_TOTP')))
    await page.getByRole('button', { name: 'Confirmar', exact: true }).click()
    await expect(page).toHaveURL(/\/dashboard/)
    await aceitarTermoDeCiencia(page)
    // defeito achado por este teste (13/11/2026): antes do aceite o Painel
    // recebia 403 "termo pendente" e mandava o administrador para o login
    await expect(page.getByRole('heading', { level: 1, name: 'Visão geral' })).toBeVisible()
    await expect(page).toHaveURL(/\/dashboard/)
    sessao = await context.storageState()
  })

  test('redefinir 2 etapas exige dois meios de conferencia e a confirmacao (e o teste cancela)', async ({ browser }) => {
    const { contexto, page } = await novaPaginaCom(browser, sessao)
    const pedidosDeRedefinicao: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/redefinir-segundo-fator')) pedidosDeRedefinicao.push(r.method())
    })
    try {
      await page.goto('/usuarios')
      const linha = page.getByRole('row').filter({ hasText: variavel('E2E_CURADOR_EMAIL') })
      await linha.getByRole('button', { name: 'Redefinir 2 etapas' }).click()
      const modal = page.getByRole('dialog').filter({ hasText: 'Redefinir as 2 etapas' })
      await expect(modal).toBeVisible()
      const confirmar = modal.getByRole('button', { name: 'Sim, redefinir' })
      const meios = modal.getByRole('group').getByRole('checkbox')
      await expect(meios).toHaveCount(4)
      await expect(confirmar).toBeDisabled()
      await meios.nth(0).check()
      await modal.getByLabel(/segui o procedimento/).check()
      await expect(confirmar, 'um meio so nao pode bastar').toBeDisabled()
      await meios.nth(1).check()
      await expect(confirmar).toBeEnabled()
      await modal.getByLabel(/segui o procedimento/).uncheck()
      await expect(confirmar, 'sem a confirmacao do procedimento nao pode').toBeDisabled()
      await modal.getByRole('button', { name: 'Cancelar' }).click()
      await expect(modal).toBeHidden()
      expect(pedidosDeRedefinicao, 'o teste nunca pode redefinir de verdade').toEqual([])
    } finally {
      await contexto.close()
    }
  })
})
