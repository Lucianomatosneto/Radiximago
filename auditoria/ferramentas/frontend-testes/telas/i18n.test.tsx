// IDIOMA DA PAGINA (Fase 3b): frontend/src/i18n/config.ts e request.ts.
// Ordem de escolha: 1) o idioma que a pessoa escolheu no seletor (cookie);
// 2) o idioma do navegador (cabecalho Accept-Language); 3) portugues.
// Cada caso confere o idioma escolhido e que as mensagens carregadas sao as
// desse idioma. Simulados: os cookies e cabecalhos da visita (next/headers).
import { afterEach, describe, expect, it, vi } from 'vitest'
import pt from '../../../../frontend/messages/pt.json'
import en from '../../../../frontend/messages/en.json'
import { COOKIE_IDIOMA, IDIOMAS_SUPORTADOS, IDIOMA_PADRAO, ehIdiomaSuportado } from '../../../../frontend/src/i18n/config'

const visita = vi.hoisted(() => ({ cookie: undefined as string | undefined, aceita: null as string | null }))
// getRequestConfig so embrulha a funcao para o Next; aqui devolve a propria funcao.
// (caminhos do pacote do frontend: e de la que request.ts os importa)
vi.mock('../../../../frontend/node_modules/next-intl/dist/esm/development/server.react-client.js', () => ({ getRequestConfig: (f: unknown) => f }))
vi.mock('../../../../frontend/node_modules/next-intl/dist/esm/production/server.react-client.js', () => ({ getRequestConfig: (f: unknown) => f }))
vi.mock('../../../../frontend/node_modules/next/headers.js', () => ({
  cookies: async () => ({ get: (nome: string) => (nome === 'idioma' && visita.cookie !== undefined ? { value: visita.cookie } : undefined) }),
  headers: async () => ({ get: (nome: string) => (nome === 'accept-language' ? visita.aceita : null) }),
}))

async function idiomaDaVisita(cookie: string | undefined, aceita: string | null) {
  visita.cookie = cookie
  visita.aceita = aceita
  const { default: configurar } = await import('../../../../frontend/src/i18n/request')
  return (configurar as unknown as () => Promise<{ locale: string; messages: { Login: { entrar: string } } }>)()
}

afterEach(() => vi.resetModules())

describe('idiomas oferecidos', () => {
  it('portugues e ingles; padrao portugues; nome do cookie', () => {
    expect([...IDIOMAS_SUPORTADOS]).toEqual(['pt', 'en'])
    expect(IDIOMA_PADRAO).toBe('pt')
    expect(COOKIE_IDIOMA).toBe('idioma')
  })

  it.each([
    ['pt', true],
    ['en', true],
    ['es', false],
    ['', false],
    [undefined, false],
    [null, false],
  ])('"%s" e suportado? %s', (valor, esperado) => {
    expect(ehIdiomaSuportado(valor as string)).toBe(esperado)
  })
})

describe('qual idioma a pagina usa', () => {
  it.each([
    ['escolha no seletor vale mais que o navegador', 'en', 'pt-BR,pt;q=0.9', 'en'],
    ['cookie com idioma que nao existe: segue o navegador', 'fr', 'en-US,en;q=0.9', 'en'],
    ['navegador em ingles', undefined, 'en-GB', 'en'],
    ['navegador em portugues do Brasil', undefined, 'pt-BR;q=1', 'pt'],
    ['primeiro idioma do navegador nao existe: usa o seguinte', undefined, 'es-ES, EN;q=0.8', 'en'],
    ['nenhum idioma do navegador existe: portugues', undefined, 'de-DE,fr;q=0.5', 'pt'],
    ['navegador sem preferencia: portugues', undefined, null, 'pt'],
  ])('%s', async (_caso, cookie, aceita, esperado) => {
    const config = await idiomaDaVisita(cookie, aceita)
    expect(config.locale).toBe(esperado)
    expect(config.messages.Login.entrar).toBe(esperado === 'pt' ? pt.Login.entrar : en.Login.entrar)
  })
})
