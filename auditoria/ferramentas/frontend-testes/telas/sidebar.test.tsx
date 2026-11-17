// @vitest-environment jsdom
//
// MENU LATERAL (Fase 3c): frontend/src/components/Sidebar.tsx.
// Confere: o que cada perfil ve no menu (e que nada restrito aparece antes de
// saber o perfil), a tela atual marcada, o numero de "Compartilhadas comigo"
// novas (e quando e recontado), o menu recolhido (pedido pela tela ou em tela
// estreita), "Curadoria" pedindo tela cheia e "Sair" (mesmo sem conexao).
// O menu so ESCONDE atalhos: quem barra o acesso de verdade e o servidor e a
// propria tela (testes de cada tela). Dados inventados.
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../../../../frontend/src/components/Sidebar'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const nav = vi.hoisted(() => ({ caminho: '/banco-imagens' }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => nav.caminho }))

const sessao = (perfil: string) => ({ id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })
function abrir(perfil: string | null, novas: Rota = { corpo: { quantidade: 0 } }, extra: Record<string, Rota> = {}, recolhivel = false) {
  const servidor = servidorFalso({
    'GET /auth/me': perfil ? { corpo: sessao(perfil) } : { status: 401 },
    'GET /shares/recebidas/novas': novas,
    ...extra,
  })
  montarTela(<Sidebar recolhivel={recolhivel} />)
  return servidor
}
const itens = () => screen.getAllByRole('link').map((l) => l.getAttribute('aria-label') ?? l.textContent?.replace(/\d+$/, '').trim())

const TODOS = ['Banco de imagens', 'Meus grupos', 'Minhas imagens', 'Compartilhadas comigo', 'Pranchas recebidas', 'Sugestões']
const ESPERADO: Record<string, string[]> = {
  estudante: ['Banco de imagens', 'Enviar imagem', 'Meus grupos', 'Minhas imagens', 'Compartilhadas comigo', 'Pranchas recebidas', 'Sugestões'],
  pesquisador: ['Banco de imagens', 'Grupos', 'Meus grupos', 'Minhas imagens', 'Compartilhadas comigo', 'Pranchas recebidas', 'Sugestões'],
  suporte: ['Banco de imagens', 'Meus grupos', 'Minhas imagens', 'Compartilhadas comigo', 'Pranchas recebidas', 'Aparelhos da rede', 'Sugestões'],
  professor: ['Imagens recebidas', 'Curadoria', 'Banco de imagens', 'Enviar imagem', 'Grupos', 'Meus grupos', 'Minhas imagens', 'Compartilhadas comigo', 'Pranchas recebidas', 'Sugestões'],
  curador: [
    'Imagens recebidas', 'Curadoria', 'Segunda opinião', 'Banco de imagens', 'Enviar imagem', 'Grupos', 'Meus grupos', 'Minhas imagens',
    'Compartilhadas comigo', 'Pranchas recebidas', 'Vocabulário', 'Macros', 'Relatórios', 'Sugestões',
  ],
  administrador: [
    'Início', 'Painel administrativo', 'Usuários', 'Imagens recebidas', 'Curadoria', 'Segunda opinião', 'Banco de imagens',
    'Enviar imagem', 'Grupos', 'Meus grupos', 'Minhas imagens', 'Compartilhadas comigo', 'Pranchas recebidas', 'Vocabulário', 'Macros',
    'Relatórios', 'Auditoria', 'Integrações', 'Aparelhos da rede', 'Configurações', 'Sugestões',
  ],
}

beforeEach(() => {
  nav.caminho = '/banco-imagens'
  vi.useRealTimers()
})
afterEach(() => cleanup())

describe('o que cada perfil ve', () => {
  it.each(Object.entries(ESPERADO))('%s', async (perfil, esperado) => {
    abrir(perfil)
    await waitFor(() => expect(itens()).toEqual(esperado))
  })

  it('antes de saber o perfil (ou sem sessao), so os itens de todos', async () => {
    const servidor = abrir(null)
    expect(itens()).toEqual(TODOS) // primeira pintura, antes da resposta
    await waitFor(() => expect(servidor.pedidos.map((p) => p.caminho)).toContain('/auth/me'))
    expect(itens()).toEqual(TODOS)
  })

  it('a tela atual (ou uma tela "dentro" dela) fica marcada', async () => {
    nav.caminho = '/minhas-imagens/12'
    abrir('estudante')
    await screen.findByRole('link', { name: 'Enviar imagem' })
    expect(screen.getByRole('link', { name: 'Minhas imagens' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Banco de imagens' }).getAttribute('aria-current')).toBeNull()
  })
})

describe('grupos: convites e pedidos esperando resposta (17/11/2026)', () => {
  it('"Meus grupos" soma convites e imagens novas; "Grupos" mostra os pedidos; com texto para o leitor de tela', async () => {
    abrir('professor', undefined, { 'GET /grupos/pendencias': { corpo: { convites: 2, pedidos: 1, imagens_novas: 3 } } })
    const meus = await screen.findByLabelText('2 convites e 3 imagens novas')
    expect(within(screen.getByRole('link', { name: /Meus grupos/ })).getByText('5')).toBe(meus)
    // "Grupos" so aparece depois que o perfil e confirmado
    const grupos = await screen.findByRole('link', { name: /^Grupos/ })
    expect(within(grupos).getByText('1')).toBe(screen.getByLabelText('1 esperando resposta'))
  })

  it.each([
    [{ convites: 1, pedidos: 0 }, '1 convite', '1'],
    [{ convites: 0, pedidos: 0, imagens_novas: 1 }, '1 imagem nova', '1'],
    [{ convites: 3, pedidos: 0, imagens_novas: 0 }, '3 convites', '3'],
  ])('"Meus grupos" com %o: "%s"', async (corpo, rotulo, numero) => {
    abrir('estudante', undefined, { 'GET /grupos/pendencias': { corpo } })
    expect((await screen.findByLabelText(rotulo)).textContent).toBe(numero)
  })

  it('sem pendencias (ou resposta estranha, erro, sem conexao): nenhum numero', async () => {
    for (const rota of [{ corpo: { convites: 0, pedidos: 0 } }, { corpo: { convites: 'x' } }, { status: 500 }, 'SEM_CONEXAO'] as Rota[]) {
      const servidor = abrir('professor', undefined, { 'GET /grupos/pendencias': rota })
      await waitFor(() => expect(servidor.pedidos.map((p) => p.caminho)).toContain('/grupos/pendencias'))
      await screen.findByRole('link', { name: 'Grupos' })
      expect(screen.queryByLabelText(/esperando resposta|convite|imagens? nova/)).toBeNull()
      cleanup()
    }
  })

  it('reconta quando uma tela de grupos avisa que algo mudou', async () => {
    const servidor = abrir('estudante', undefined, { 'GET /grupos/pendencias': { corpo: { convites: 1, pedidos: 0 } } })
    await screen.findByLabelText('1 convite')
    const contagens = () => servidor.pedidos.filter((p) => p.caminho === '/grupos/pendencias').length
    const antes = contagens()
    act(() => void window.dispatchEvent(new Event('radix-grupos-mudou')))
    await waitFor(() => expect(contagens()).toBe(antes + 1))
  })

  it('menu recolhido: um ponto no icone de "Meus grupos"', async () => {
    abrir('estudante', undefined, { 'GET /grupos/pendencias': { corpo: { convites: 1, pedidos: 0 } } }, true)
    const link = await screen.findByRole('link', { name: 'Meus grupos' })
    await waitFor(() => expect(link.querySelector('span.bg-amber-400')).not.toBeNull())
  })
})

describe('compartilhadas novas', () => {
  it('mostra quantas chegaram, com texto para o leitor de tela', async () => {
    abrir('estudante', { corpo: { quantidade: 3 } })
    const marca = await screen.findByLabelText('3 novas')
    expect(within(screen.getByRole('link', { name: /Compartilhadas comigo/ })).getByText('3')).toBe(marca)
  })

  it.each([
    ['zero', { corpo: { quantidade: 0 } } as Rota],
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: nenhum numero', async (_n, rota) => {
    const servidor = abrir('estudante', rota)
    await waitFor(() => expect(servidor.pedidos.map((p) => p.caminho)).toContain('/shares/recebidas/novas'))
    await screen.findByRole('link', { name: 'Enviar imagem' })
    expect(screen.queryByLabelText(/novas$/)).toBeNull()
  })

  it('reconta quando a pessoa ve as compartilhadas, a cada 2 minutos e ao voltar para a aba; com a aba escondida, nao pergunta', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let quantidade = 1
    const servidor = abrir('estudante', () => ({ corpo: { quantidade } }))
    expect(await screen.findByLabelText('1 novas')).toBeTruthy()
    const contagens = () => servidor.pedidos.filter((p) => p.caminho === '/shares/recebidas/novas').length
    quantidade = 0
    act(() => void window.dispatchEvent(new Event('radix-compartilhadas-vistas')))
    await waitFor(() => expect(screen.queryByLabelText(/novas$/)).toBeNull())
    const antes = contagens()
    await act(async () => void vi.advanceTimersByTime(120000))
    expect(contagens()).toBe(antes + 1)
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    try {
      act(() => void document.dispatchEvent(new Event('visibilitychange')))
      await act(async () => void vi.advanceTimersByTime(120000))
      expect(contagens()).toBe(antes + 1)
    } finally {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    }
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(contagens()).toBe(antes + 2)
  })
})

describe('menu recolhido', () => {
  it('a tela pede o menu recolhido: so icones com o nome; abre e recolhe de novo', async () => {
    const usuario = userEvent.setup()
    nav.caminho = '/compartilhadas-comigo'
    abrir('estudante', { corpo: { quantidade: 2 } }, {}, true)
    const menu = screen.getByRole('complementary', { name: 'Navegação' })
    await within(menu).findByRole('link', { name: 'Enviar imagem' })
    expect(within(menu).getByRole('link', { name: 'Compartilhadas comigo' }).getAttribute('aria-current')).toBe('page')
    expect(within(menu).getByRole('link', { name: 'Compartilhadas comigo' }).querySelector('span[aria-hidden="true"]')).toBeTruthy() // bolinha das novas
    const abrirMenu = screen.getByRole('button', { name: 'Abrir o menu de navegação' })
    expect(abrirMenu.getAttribute('aria-expanded')).toBe('false')
    await usuario.click(abrirMenu)
    expect(screen.getByText('Navegação')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Recolher o menu de navegação' }).getAttribute('aria-expanded')).toBe('true')
    await usuario.click(screen.getByRole('button', { name: 'Recolher o menu de navegação' }))
    expect(screen.getByRole('button', { name: 'Abrir o menu de navegação' })).toBeTruthy()
  })

  it('tela estreita (celular): comeca recolhido em qualquer tela', async () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn((consulta: string) => ({
      matches: true, media: consulta, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia
    try {
      abrir('estudante')
      expect(await screen.findByRole('button', { name: 'Abrir o menu de navegação' })).toBeTruthy()
    } finally {
      window.matchMedia = original
    }
  })

  it('menu largo comum: sem botao de recolher', async () => {
    abrir('estudante')
    await screen.findByRole('link', { name: 'Enviar imagem' })
    expect(screen.queryByRole('button', { name: /menu de navegação/ })).toBeNull()
  })
})

describe('acoes', () => {
  it.each([false, true])('"Curadoria" pede tela cheia no proprio clique (recolhido: %s); recusa do navegador nao quebra', async (recolhivel) => {
    const usuario = userEvent.setup()
    const pedir = vi.fn(() => Promise.reject(new Error('negado')))
    document.documentElement.requestFullscreen = pedir as unknown as typeof document.documentElement.requestFullscreen
    abrir('curador', undefined, {}, recolhivel)
    await usuario.click(await screen.findByRole('link', { name: 'Curadoria' }))
    expect(pedir).toHaveBeenCalledTimes(1)
    await usuario.click(screen.getByRole('link', { name: 'Banco de imagens' }))
    expect(pedir).toHaveBeenCalledTimes(1) // outros itens nao pedem
  })

  it.each([
    ['menu aberto, servidor responde', false, { status: 204 } as Rota],
    ['menu recolhido, sem conexao', true, 'SEM_CONEXAO' as Rota],
  ])('"Sair" (%s): avisa o servidor e recarrega no login', async (_n, recolhivel, rota) => {
    const usuario = userEvent.setup()
    const recarregar = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, replace: recarregar } })
    try {
      const servidor = abrir('estudante', undefined, { 'POST /auth/logout': rota }, recolhivel)
      await screen.findByRole('link', { name: 'Enviar imagem' })
      await usuario.click(screen.getByRole('button', { name: 'Sair' }))
      await waitFor(() => expect(recarregar).toHaveBeenCalledWith('/login'))
      expect(servidor.pedidos.some((p) => p.metodo === 'POST' && p.caminho === '/auth/logout')).toBe(true)
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })
})

// Fase 3d (16/11/2026), itens 7 e 8.
describe('Fase 3d: nome do menu e traducoes', () => {
  // item 7: o menu aberto nao tinha nome acessivel (o recolhido tinha)
  it('menu aberto tambem se chama "Navegação"', async () => {
    abrir('estudante')
    await screen.findByRole('link', { name: 'Enviar imagem' })
    expect(screen.getByRole('complementary', { name: 'Navegação' })).toBeTruthy()
  })

  // item 8: havia traducoes do menu que nenhum codigo usava
  it('toda traducao do menu e usada: cada item aparece para o administrador, e cada texto solto esta no codigo', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const raiz = path.resolve(process.cwd(), '../../../frontend')
    const ler = (arquivo: string) => fs.readFileSync(path.join(raiz, arquivo), 'utf-8')
    const codigo = ler('src/components/Sidebar.tsx')
    for (const idioma of ['pt', 'en']) {
      const textos = JSON.parse(ler(`messages/${idioma}.json`)).Sidebar
      const { itens: itensDoMenu, ...soltos } = textos
      const chavesDoMenu = [...codigo.matchAll(/chave: '(\w+)'/g)].map((m) => m[1]).sort()
      expect(Object.keys(itensDoMenu).sort()).toEqual(chavesDoMenu)
      for (const chave of Object.keys(soltos)) expect(codigo).toContain(`t('${chave}'`)
    }
    abrir('administrador')
    await screen.findByRole('link', { name: 'Configurações' })
    expect(itens()).toHaveLength(Object.keys(JSON.parse(ler('messages/pt.json')).Sidebar.itens).length)
  })
})
