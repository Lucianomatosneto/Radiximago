// @vitest-environment jsdom
//
// TELA "Pranchas recebidas" (frontend/src/app/pranchas-recebidas/page.tsx) - Fase 3c.
// Pranchas que outras pessoas mandaram para mim (o e-mail traz so o link).
// Confere: sem sessao vai ao login e volta para a mesma prancha (so aceita
// numero no "?abrir="), lista (de quem, quantas imagens, recado, "nova"),
// destaque da prancha do link, vazio/erro/sem conexao, baixar PDF ou PNG (o
// nome do arquivo, ZIP quando vem compactado), botoes travados enquanto
// gera e os erros ao baixar. Simulados: menu e topo. Dados inventados.
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PranchasRecebidasPage from '../../../../frontend/src/app/pranchas-recebidas/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/pranchas-recebidas' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const sessao = { id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil: 'estudante', foto_perfil_url: null }
const PRANCHAS = [
  { id: 7, de: 'Prof. Teste', imagens: 4, por_folha: 2, recado: 'Para a aula\nde quinta.', criado_em: '2026-11-13T12:00:00Z', visto: false },
  { id: 9, de: 'Colega Teste', imagens: 1, por_folha: 1, recado: '', criado_em: null, visto: true },
]
async function abrir(extra: Record<string, Rota> = {}) {
  const servidor = servidorFalso({ 'GET /auth/me': { corpo: sessao }, 'GET /prancha/recebidas': { corpo: { pranchas: PRANCHAS } }, ...extra })
  montarTela(<PranchasRecebidasPage />)
  await screen.findByRole('heading', { name: 'Pranchas recebidas' })
  return servidor
}
const cartao = (de: string) => screen.getByRole('heading', { name: `De ${de}` }).closest('li') as HTMLElement
let baixados: { href: string; download: string }[]

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/pranchas-recebidas')
  baixados = []
  URL.createObjectURL = vi.fn(() => 'blob:prancha')
  URL.revokeObjectURL = vi.fn()
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    baixados.push({ href: this.getAttribute('href') ?? '', download: this.download })
  })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('entrar', () => {
  it.each([
    ['/pranchas-recebidas?abrir=7', '/login?volta=%2Fpranchas-recebidas%3Fabrir%3D7'],
    ['/pranchas-recebidas', '/login?volta=%2Fpranchas-recebidas'],
    ['/pranchas-recebidas?abrir=//site-estranho', '/login?volta=%2Fpranchas-recebidas'], // so numero volta no link
  ])('sem sessao (%s): vai ao login e volta para a mesma prancha', async (endereco, destino) => {
    window.history.replaceState(null, '', endereco)
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<PranchasRecebidasPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith(destino))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it('lista: de quem, quantas imagens, data, recado e "nova"; aviso de uso em ensino', async () => {
    await abrir()
    const primeira = await waitFor(() => cartao('Prof. Teste'))
    expect(within(primeira).getByText('nova')).toBeTruthy()
    const data = new Date('2026-11-13T12:00:00Z').toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
    expect(within(primeira).getByText(`4 imagens, 2 por folha · ${data}`)).toBeTruthy()
    expect(within(primeira).getByText(/Para a aula/).textContent).toBe('Para a aula\nde quinta.')
    const segunda = cartao('Colega Teste')
    expect(within(segunda).queryByText('nova')).toBeNull()
    expect(within(segunda).getByText('1 imagem, 1 por folha ·', { exact: false })).toBeTruthy()
    expect(screen.getByText('Material de ensino e pesquisa. Imagens anonimizadas. Não destinado a diagnóstico.')).toBeTruthy()
  })

  it('link do e-mail (?abrir=9): destaca e rola ate essa prancha', async () => {
    window.history.replaceState(null, '', '/pranchas-recebidas?abrir=9')
    await abrir()
    await waitFor(() => expect(cartao('Colega Teste').className).toContain('ring-2'))
    expect(cartao('Prof. Teste').className).not.toContain('ring-2')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it.each([
    ['nenhuma', { corpo: { pranchas: [] } } as Rota],
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: "Você ainda não recebeu nenhuma prancha."', async (_n, rota) => {
    await abrir({ 'GET /prancha/recebidas': rota })
    expect(await screen.findByText('Você ainda não recebeu nenhuma prancha.')).toBeTruthy()
  })
})

describe('baixar', () => {
  it.each([
    ['PDF', 'Baixar PDF', 'pdf', 'application/pdf', 'radix-imago-prancha-recebida-7.pdf'],
    ['PNG', 'Baixar imagem (PNG)', 'png', 'image/png', 'radix-imago-prancha-recebida-7.png'],
    ['PNG de varias folhas (ZIP)', 'Baixar imagem (PNG)', 'png', 'application/zip', 'radix-imago-prancha-recebida-7.zip'],
  ])('%s: pede o formato, baixa com o nome certo e recarrega a lista (marca como vista)', async (_n, rotulo, formato, tipo, nome) => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ [`GET /prancha/recebidas/7/arquivo?formato=${formato}`]: { corpo: 'conteudo', cabecalhos: { 'Content-Type': tipo } } })
    await usuario.click(within(await waitFor(() => cartao('Prof. Teste'))).getByRole('button', { name: rotulo }))
    await waitFor(() => expect(baixados).toEqual([{ href: 'blob:prancha', download: nome }]))
    await waitFor(() => expect(servidor.pedidos.filter((p) => p.caminho === '/prancha/recebidas')).toHaveLength(2))
  })

  it('enquanto gera: "Gerando…" no botao clicado e todos travados', async () => {
    const usuario = userEvent.setup()
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    await abrir({ 'GET /prancha/recebidas/7/arquivo?formato=pdf': { corpo: 'x', cabecalhos: { 'Content-Type': 'application/pdf' } } })
    const fetchBase = globalThis.fetch
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/arquivo')) await espera
      return fetchBase(url, init)
    })
    await usuario.click(within(await waitFor(() => cartao('Prof. Teste'))).getByRole('button', { name: 'Baixar PDF' }))
    expect(within(cartao('Prof. Teste')).getByRole('button', { name: 'Gerando…' })).toBeTruthy()
    const botoes = screen.getAllByRole('button') as HTMLButtonElement[]
    expect(botoes.every((b) => b.disabled)).toBe(true)
    await act(async () => liberar())
    await waitFor(() => expect(baixados).toHaveLength(1))
    expect((screen.getAllByRole('button') as HTMLButtonElement[]).every((b) => !b.disabled)).toBe(true)
  })

  it.each([
    ['motivo do servidor', { status: 410, corpo: { detail: 'As imagens desta prancha não estão mais disponíveis.' } } as Rota, 'As imagens desta prancha não estão mais disponíveis.'],
    ['sem motivo', { status: 500 } as Rota, 'Não foi possível abrir a prancha. Tente de novo.'],
    ['resposta sem texto', { status: 502, corpo: 'x', cabecalhos: { 'Content-Type': 'text/plain' } } as Rota, 'Não foi possível abrir a prancha. Tente de novo.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível abrir a prancha. Tente de novo.'],
  ])('falha ao baixar (%s): avisa e nada e baixado', async (_n, rota, mensagem) => {
    const usuario = userEvent.setup()
    await abrir({ 'GET /prancha/recebidas/9/arquivo?formato=pdf': rota })
    await usuario.click(within(await waitFor(() => cartao('Colega Teste'))).getByRole('button', { name: 'Baixar PDF' }))
    expect((await screen.findByRole('alert')).textContent).toBe(mensagem)
    expect(baixados).toEqual([])
  })
})
