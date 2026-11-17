// @vitest-environment jsdom
//
// TELA "Meus acessos" (frontend/src/app/meus-acessos/page.tsx) - Fase 3c.
// Onde a conta da pessoa esta aberta agora (aparelho, endereco de rede,
// quando entrou, ultimo uso) e encerrar o que ela nao reconhece.
// Confere: sem sessao vai ao login, lista (este aparelho sem "Encerrar"),
// dados ausentes viram "—", encerrar um e encerrar os outros (o que vai ao
// servidor, aviso e recarga), erros (carregar, encerrar, sem conexao, 401) e
// botoes travados durante o pedido. Simulados: menu, topo e a secao de
// login em duas etapas (testes proprios). Dados inventados.
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MeusAcessosPage from '../../../../frontend/src/app/meus-acessos/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/meus-acessos' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
vi.mock('../../../../frontend/src/components/segundoFator/SecaoSegundoFator', () => ({ default: () => <section aria-label="login em duas etapas" /> }))

const sessao = { id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil: 'estudante', foto_perfil_url: null }
const ACESSOS = [
  { id: 'resumo-atual', aparelho: 'Firefox · Linux', ip: '10.0.0.1', criada_em: '2026-11-14T10:00:00Z', ultimo_uso: '2026-11-14T11:00:00Z', atual: true },
  { id: 'resumo/clinica', aparelho: 'Chrome · Windows', ip: '10.0.0.2', criada_em: '2026-11-10T08:00:00Z', ultimo_uso: '2026-11-12T09:30:00Z', atual: false },
  { id: 'resumo-3', aparelho: null, ip: null, criada_em: null, ultimo_uso: null, atual: false },
]
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
async function abrir(extra: Record<string, Rota> = {}) {
  const servidor = servidorFalso({ 'GET /auth/me': { corpo: sessao }, 'GET /auth/sessoes': { corpo: ACESSOS }, ...extra })
  montarTela(<MeusAcessosPage />)
  await screen.findByRole('heading', { name: 'Meus acessos' })
  return servidor
}
const linha = (texto: string) => screen.getByText(texto, { exact: false }).closest('li') as HTMLElement

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('carregar', () => {
  it('sem sessao vai ao login (antes mostra "Carregando...") e nao pede a lista', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<MeusAcessosPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it('lista os acessos: este aparelho marcado e sem "Encerrar"; dados que faltam viram "—"', async () => {
    await abrir()
    const atual = linha('Firefox · Linux')
    expect(within(atual).getByText('este aparelho')).toBeTruthy()
    expect(within(atual).queryByRole('button')).toBeNull()
    expect(within(atual).getByText(`Endereço de rede 10.0.0.1 · entrou em ${quando(ACESSOS[0].criada_em as string)} · último uso ${quando(ACESSOS[0].ultimo_uso as string)}`)).toBeTruthy()
    const desconhecido = linha('Aparelho desconhecido')
    expect(within(desconhecido).getByText('Endereço de rede — · entrou em — · último uso —')).toBeTruthy()
    expect(within(linha('Chrome · Windows')).getByRole('button', { name: 'Encerrar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Encerrar os outros 2 acessos' })).toBeTruthy()
    expect(screen.getByRole('region', { name: 'login em duas etapas' })).toBeTruthy()
  })

  it('so este aparelho: nenhum botao de encerrar', async () => {
    await abrir({ 'GET /auth/sessoes': { corpo: [ACESSOS[0]] } })
    expect(screen.queryByRole('button', { name: /Encerrar/ })).toBeNull()
  })

  it('um outro so: texto no singular', async () => {
    await abrir({ 'GET /auth/sessoes': { corpo: ACESSOS.slice(0, 2) } })
    expect(screen.getByRole('button', { name: 'Encerrar o outro acesso' })).toBeTruthy()
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s ao carregar: avisa', async (_n, rota) => {
    await abrir({ 'GET /auth/sessoes': rota })
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível carregar os acessos.')
  })

  it('sessao vencida ao carregar: vai ao login', async () => {
    servidorFalso({ 'GET /auth/me': { corpo: sessao }, 'GET /auth/sessoes': { status: 401 } })
    montarTela(<MeusAcessosPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })
})

describe('encerrar', () => {
  it('um acesso: manda o resumo (codificado no endereco), avisa e recarrega a lista', async () => {
    const usuario = userEvent.setup()
    let lista = ACESSOS
    const servidor = await abrir({
      'GET /auth/sessoes': () => ({ corpo: lista }),
      'POST /auth/sessoes/resumo%2Fclinica/encerrar': () => {
        lista = [ACESSOS[0], ACESSOS[2]]
        return { corpo: {} }
      },
    })
    await usuario.click(within(linha('Chrome · Windows')).getByRole('button', { name: 'Encerrar' }))
    expect((await screen.findByRole('status')).textContent).toBe('Acesso encerrado.')
    await waitFor(() => expect(screen.queryByText('Chrome · Windows')).toBeNull())
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/auth/sessoes/resumo%2Fclinica/encerrar', corpo: undefined }])
  })

  it('os outros: um pedido so; avisa e recarrega', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir({ 'POST /auth/sessoes/encerrar-outras': { corpo: {} } })
    await usuario.click(screen.getByRole('button', { name: 'Encerrar os outros 2 acessos' }))
    expect((await screen.findByRole('status')).textContent).toBe('Os outros acessos foram encerrados.')
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/auth/sessoes/encerrar-outras', corpo: undefined }])
    expect(servidor.pedidos.filter((p) => p.caminho === '/auth/sessoes')).toHaveLength(2)
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s ao encerrar: avisa e a lista continua', async (_n, rota) => {
    const usuario = userEvent.setup()
    await abrir({ 'POST /auth/sessoes/encerrar-outras': rota })
    await usuario.click(screen.getByRole('button', { name: 'Encerrar os outros 2 acessos' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Não foi possível encerrar. Tente de novo.')
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByText('Chrome · Windows')).toBeTruthy()
  })

  it('sessao vencida ao encerrar: vai ao login', async () => {
    const usuario = userEvent.setup()
    await abrir({ 'POST /auth/sessoes/encerrar-outras': { status: 401 } })
    await usuario.click(screen.getByRole('button', { name: 'Encerrar os outros 2 acessos' }))
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it('durante o pedido: todos os botoes de encerrar ficam travados (sem pedido duplo)', async () => {
    const usuario = userEvent.setup()
    let liberar: () => void = () => {}
    const espera = new Promise<void>((r) => (liberar = r))
    const servidor = await abrir({ 'POST /auth/sessoes/encerrar-outras': { corpo: {} } })
    const fetchBase = globalThis.fetch
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') await espera
      return fetchBase(url, init)
    })
    await usuario.click(screen.getByRole('button', { name: 'Encerrar os outros 2 acessos' }))
    for (const botao of screen.getAllByRole('button', { name: /Encerrar/ })) expect((botao as HTMLButtonElement).disabled).toBe(true)
    await act(async () => liberar())
    await screen.findByRole('status')
    expect(servidor.alteracoes()).toHaveLength(1)
  })
})
