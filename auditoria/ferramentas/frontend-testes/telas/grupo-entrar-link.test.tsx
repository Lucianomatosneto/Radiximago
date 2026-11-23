// @vitest-environment jsdom
//
// TELA "Entrar no grupo pelo link" (frontend/src/app/grupos/entrar/page.tsx)
// - pedido do video, 22/11/2026. O dono manda o link; quem abre:
// - sem login: vai ao login e VOLTA para o link depois de entrar;
// - com login: ve so o nome do grupo e quem o criou, e entra so se clicar
//   em "Entrar no grupo" (consentimento);
// - ja participa / e o dono / link vencido: aviso claro, sem botao de entrar.
// Quem decide de verdade e o servidor (backend/tests/test_grupo_link_convite.py).
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import EntrarPorLinkPage from '../../../../frontend/src/app/grupos/entrar/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/grupos/entrar' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))

const CODIGO = 'codigo-de-teste-com-mais-de-vinte-letras_abc'
const ESTUDANTE = { id: 9, nome: 'Estudante Teste', email: 'e@exemplo.test', perfil: 'estudante', foto_perfil_url: null }
const VER = { grupo: { id: 3, nome: 'Turma A' }, criador: 'Prof. Silva', situacao: null }
function abrir(rotas: Record<string, Rota>, busca = `?c=${CODIGO}`) {
  window.history.replaceState(null, '', `/grupos/entrar${busca}`)
  const servidor = servidorFalso({ 'GET /auth/me': { corpo: ESTUDANTE }, 'POST /grupos/link-convite/ver': { corpo: VER }, ...rotas })
  montarTela(<EntrarPorLinkPage />)
  return servidor
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('entrar no grupo pelo link', () => {
  it('sem login: vai ao login e volta para o link', async () => {
    abrir({ 'GET /auth/me': { status: 401 } })
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith(`/login?volta=${encodeURIComponent(`/grupos/entrar?c=${CODIGO}`)}`))
  })

  it('mostra o grupo e quem criou; so entra ao clicar em "Entrar no grupo"', async () => {
    const usuario = userEvent.setup()
    const servidor = abrir({ 'POST /grupos/link-convite/entrar': { corpo: { situacao: 'participa', grupo: { id: 3, nome: 'Turma A' } } } })
    expect(await screen.findByText('Turma A')).toBeTruthy()
    expect(screen.getByText(/Prof\. Silva/)).toBeTruthy()
    expect(servidor.alteracoes().filter((a) => a.caminho === '/grupos/link-convite/entrar')).toEqual([])
    await usuario.click(screen.getByRole('button', { name: 'Entrar no grupo' }))
    expect(await screen.findByText(/Você entrou no grupo/)).toBeTruthy()
    expect(servidor.alteracoes()).toContainEqual({ metodo: 'POST', caminho: '/grupos/link-convite/entrar', corpo: { codigo: CODIGO } })
    expect(screen.getByRole('link', { name: 'Ver meus grupos' }).getAttribute('href')).toBe('/grupos?aba=participo')
  })

  it.each([
    ['participa', /Você já participa deste grupo/],
    ['dono', /Você criou este grupo/],
  ])('situacao %s: avisa e nao oferece entrar', async (situacao, texto) => {
    abrir({ 'POST /grupos/link-convite/ver': { corpo: { ...VER, situacao } } })
    expect(await screen.findByText(texto)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Entrar no grupo' })).toBeNull()
  })

  it('link vencido ou invalido: mostra o motivo do servidor', async () => {
    abrir({ 'POST /grupos/link-convite/ver': { status: 404, corpo: { detail: 'Link de convite invalido ou vencido.' } } })
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Link de convite invalido ou vencido.')
  })

  it('endereco sem codigo: avisa sem perguntar ao servidor', async () => {
    const servidor = abrir({}, '')
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(servidor.pedidos.some((p) => p.caminho === '/grupos/link-convite/ver')).toBe(false)
  })
})
