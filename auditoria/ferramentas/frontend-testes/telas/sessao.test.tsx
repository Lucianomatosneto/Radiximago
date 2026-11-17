// @vitest-environment jsdom
//
// SESSAO x FALTA DE CONEXAO (Fase 3e, 16/11/2026): a peca central.
// - obterSessaoAtual (lib/sessao.ts): tres resultados. So o SERVIDOR desloga:
//   401 (ou outra recusa 4xx, como hoje) = "invalida"; o pedido que nem chega
//   ao servidor, ou um erro 5xx dele, = "sem_conexao" (nao e motivo para sair).
// - useVerificarSessao (telas): invalida -> login (como hoje); sem conexao ->
//   aviso + "Tentar de novo", sem ir ao login e sem nada restrito na tela;
//   quando a internet volta (evento "online"), confere de novo sozinha.
// - useSessaoAtual (menu, barra do topo, botoes): so devolve a sessao quando
//   o servidor confirma; sem conexao, nada restrito, e confere de novo no "online".
// - AvisoSemConexao: o aviso padrao (role="alert") e o botao.
// Dados inventados.
import { useState as useEstado } from 'react'
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { obterSessaoAtual } from '../../../../frontend/src/lib/sessao'
import { useSessaoAtual, useVerificarSessao } from '../../../../frontend/src/lib/useVerificarSessao'
import AvisoSemConexao from '../../../../frontend/src/components/AvisoSemConexao'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/teste' }))

const SESSAO = { id: 7, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil: 'curador', foto_perfil_url: null }
const pedidosDeSessao = (servidor: ReturnType<typeof servidorFalso>) => servidor.pedidos.filter((p) => p.caminho === '/auth/me').length
const ficarOnline = () => act(() => void window.dispatchEvent(new Event('online')))

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('obterSessaoAtual: tres resultados', () => {
  it('200: sessao valida, com os dados de quem entrou', async () => {
    servidorFalso({ 'GET /auth/me': { corpo: SESSAO } })
    expect(await obterSessaoAtual()).toEqual({ estado: 'valida', sessao: SESSAO })
  })

  it.each([401, 403, 404])('%s: o servidor recusou -> "invalida" (vai ao login, como hoje)', async (status) => {
    servidorFalso({ 'GET /auth/me': { status } })
    expect(await obterSessaoAtual()).toEqual({ estado: 'invalida' })
  })

  it.each([
    ['sem conexao (o pedido nem chega)', 'SEM_CONEXAO' as Rota],
    ['500', { status: 500 } as Rota],
    ['502', { status: 502 } as Rota],
    ['503', { status: 503 } as Rota],
    ['200 com resposta quebrada', { corpo: 'x', cabecalhos: { 'Content-Type': 'text/plain' } } as Rota],
  ])('%s -> "sem_conexao" (nao e motivo para deslogar)', async (_n, rota) => {
    servidorFalso({ 'GET /auth/me': rota })
    const r = await obterSessaoAtual()
    expect(r.estado).toBe('sem_conexao')
    expect('sessao' in r).toBe(false) // nada da sessao vaza num resultado que nao e "valida"
  })

  it('pergunta ao servidor levando o cookie (credentials: include)', async () => {
    servidorFalso({ 'GET /auth/me': { corpo: SESSAO } })
    await obterSessaoAtual()
    expect((globalThis.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1]).toEqual({ credentials: 'include' })
  })
})

describe('AvisoSemConexao', () => {
  it('aviso padrao anunciado (role="alert") e botao "Tentar de novo"', async () => {
    const usuario = userEvent.setup()
    const tentar = vi.fn()
    montarTela(<AvisoSemConexao aoTentar={tentar} />)
    expect(screen.getByRole('alert').textContent).toBe('Sem conexão com o servidor. Tente de novo.')
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(tentar).toHaveBeenCalledTimes(1)
  })

  it('enquanto confere, o botao fica travado (sem clique duplo)', () => {
    montarTela(<AvisoSemConexao aoTentar={() => {}} ocupado />)
    expect((screen.getByRole('button', { name: 'Tentar de novo' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

// Tela de mentira que usa o mesmo caminho das telas de verdade
function TelaProtegida({ aoInvalida, comFalhaNosDados }: { aoInvalida?: () => void; comFalhaNosDados?: boolean }) {
  const { semConexao, verificando, tentarDeNovo, sessao } = useTelaTeste(aoInvalida, comFalhaNosDados)
  if (semConexao) return <AvisoSemConexao aoTentar={tentarDeNovo} ocupado={verificando} />
  if (!sessao) return <p>Carregando...</p>
  return <h1>conteúdo restrito de {sessao.nome}</h1>
}
function useTelaTeste(aoInvalida?: () => void, comFalhaNosDados?: boolean) {
  const [sessao, setSessao] = useEstado<typeof SESSAO | null>(null)
  const verificacao = useVerificarSessao(
    (s, { semConexao }) => {
      // tela que, alem da sessao, busca dados e o servidor nao responde
      if (comFalhaNosDados) return semConexao()
      setSessao(s as typeof SESSAO)
    },
    aoInvalida ? { aoInvalida } : undefined
  )
  return { ...verificacao, sessao }
}


describe('useVerificarSessao (telas)', () => {
  it('200: mostra o conteudo; nao vai ao login', async () => {
    servidorFalso({ 'GET /auth/me': { corpo: SESSAO } })
    montarTela(<TelaProtegida />)
    expect(await screen.findByRole('heading', { name: 'conteúdo restrito de Pessoa Teste' })).toBeTruthy()
    expect(roteador.push).not.toHaveBeenCalled()
  })

  it('401: vai ao login (como hoje) e nada restrito aparece', async () => {
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<TelaProtegida />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('401 com destino proprio (ex.: login que volta para a mesma tela)', async () => {
    const aoInvalida = vi.fn()
    servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<TelaProtegida aoInvalida={aoInvalida} />)
    await waitFor(() => expect(aoInvalida).toHaveBeenCalledTimes(1))
    expect(roteador.push).not.toHaveBeenCalled()
  })

  it.each([
    ['sem conexao', 'SEM_CONEXAO' as Rota],
    ['erro 503 do servidor', { status: 503 } as Rota],
  ])('%s: aviso + "Tentar de novo", SEM ir ao login e sem nada restrito', async (_n, rota) => {
    servidorFalso({ 'GET /auth/me': rota })
    montarTela(<TelaProtegida />)
    expect((await screen.findByRole('alert')).textContent).toBe('Sem conexão com o servidor. Tente de novo.')
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
    expect(roteador.push).not.toHaveBeenCalled()
  })

  it('"Tentar de novo" confere outra vez; com a conexao de volta, mostra o conteudo', async () => {
    const usuario = userEvent.setup()
    let rota: Rota = 'SEM_CONEXAO'
    const servidor = servidorFalso({ 'GET /auth/me': () => rota })
    montarTela(<TelaProtegida />)
    await screen.findByRole('alert')
    rota = { corpo: SESSAO }
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'conteúdo restrito de Pessoa Teste' })).toBeTruthy()
    expect(pedidosDeSessao(servidor)).toBe(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('"Tentar de novo" e o servidor recusa (401): agora sim vai ao login', async () => {
    const usuario = userEvent.setup()
    let rota: Rota = 'SEM_CONEXAO'
    servidorFalso({ 'GET /auth/me': () => rota })
    montarTela(<TelaProtegida />)
    await screen.findByRole('alert')
    rota = { status: 401 }
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })

  it('a internet voltou (evento "online"): confere sozinha, sem clique', async () => {
    let rota: Rota = 'SEM_CONEXAO'
    const servidor = servidorFalso({ 'GET /auth/me': () => rota })
    montarTela(<TelaProtegida />)
    await screen.findByRole('alert')
    rota = { corpo: SESSAO }
    ficarOnline()
    expect(await screen.findByRole('heading', { name: 'conteúdo restrito de Pessoa Teste' })).toBeTruthy()
    expect(pedidosDeSessao(servidor)).toBe(2)
  })

  it('com a sessao confirmada, o "online" nao refaz nada (nao recarrega a tela a toa)', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { corpo: SESSAO } })
    montarTela(<TelaProtegida />)
    await screen.findByRole('heading')
    ficarOnline()
    await new Promise((r) => setTimeout(r, 20))
    expect(pedidosDeSessao(servidor)).toBe(1)
  })

  it('tela fechada: o ouvinte do "online" sai junto (nao fica perguntando ao servidor)', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': 'SEM_CONEXAO' })
    const { unmount } = montarTela(<TelaProtegida />)
    await screen.findByRole('alert')
    unmount()
    ficarOnline()
    await new Promise((r) => setTimeout(r, 20))
    expect(pedidosDeSessao(servidor)).toBe(1)
  })

  it('enquanto confere de novo, o botao fica travado', async () => {
    const usuario = userEvent.setup()
    let liberar: () => void = () => {}
    const servidor = servidorFalso({ 'GET /auth/me': 'SEM_CONEXAO' })
    montarTela(<TelaProtegida />)
    await screen.findByRole('alert')
    const fetchBase = globalThis.fetch
    const espera = new Promise<void>((r) => (liberar = r))
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      await espera
      return fetchBase(url, init)
    })
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect((screen.getByRole('button', { name: 'Tentar de novo' }) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await act(async () => liberar())
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tentar de novo' }) as HTMLButtonElement).disabled).toBe(false))
    expect(pedidosDeSessao(servidor)).toBe(2)
  })

  it('clique em "Tentar de novo" e a internet volta ao mesmo tempo: uma pergunta so ao servidor', async () => {
    const usuario = userEvent.setup()
    let liberar: () => void = () => {}
    const servidor = servidorFalso({ 'GET /auth/me': 'SEM_CONEXAO' })
    montarTela(<TelaProtegida />)
    await screen.findByRole('alert')
    const fetchBase = globalThis.fetch
    const espera = new Promise<void>((r) => (liberar = r))
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      await espera
      return fetchBase(url, init)
    })
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    ficarOnline() // chega enquanto a primeira pergunta ainda esta no ar
    await act(async () => liberar())
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tentar de novo' }) as HTMLButtonElement).disabled).toBe(false))
    expect(pedidosDeSessao(servidor)).toBe(2) // a do inicio + uma so
  })

  it('sessao valida, mas os dados da tela nao chegam: a tela pode pedir o mesmo aviso', async () => {
    servidorFalso({ 'GET /auth/me': { corpo: SESSAO } })
    montarTela(<TelaProtegida comFalhaNosDados />)
    expect((await screen.findByRole('alert')).textContent).toBe('Sem conexão com o servidor. Tente de novo.')
    expect(roteador.push).not.toHaveBeenCalled()
  })
})

function Perfil() {
  const sessao = useSessaoAtual()
  return <p>perfil: {sessao?.perfil ?? 'nenhum'}</p>
}

describe('useSessaoAtual (menu, barra do topo, botoes)', () => {
  it('200: devolve a sessao', async () => {
    servidorFalso({ 'GET /auth/me': { corpo: SESSAO } })
    montarTela(<Perfil />)
    expect(await screen.findByText('perfil: curador')).toBeTruthy()
  })

  it.each([
    ['401', { status: 401 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
    ['503', { status: 503 } as Rota],
  ])('%s: nada (nada restrito) e nao vai ao login (quem decide e a tela)', async (_n, rota) => {
    const servidor = servidorFalso({ 'GET /auth/me': rota })
    montarTela(<Perfil />)
    await waitFor(() => expect(pedidosDeSessao(servidor)).toBe(1))
    expect(screen.getByText('perfil: nenhum')).toBeTruthy()
    expect(roteador.push).not.toHaveBeenCalled()
  })

  it('sem conexao e depois "online": confere de novo e passa a mostrar', async () => {
    let rota: Rota = 'SEM_CONEXAO'
    const servidor = servidorFalso({ 'GET /auth/me': () => rota })
    montarTela(<Perfil />)
    await waitFor(() => expect(pedidosDeSessao(servidor)).toBe(1))
    rota = { corpo: SESSAO }
    ficarOnline()
    expect(await screen.findByText('perfil: curador')).toBeTruthy()
  })

  it('401 e depois "online": nao fica perguntando (sessao invalida nao volta sozinha)', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<Perfil />)
    await waitFor(() => expect(pedidosDeSessao(servidor)).toBe(1))
    ficarOnline()
    await new Promise((r) => setTimeout(r, 20))
    expect(pedidosDeSessao(servidor)).toBe(1)
  })
})
