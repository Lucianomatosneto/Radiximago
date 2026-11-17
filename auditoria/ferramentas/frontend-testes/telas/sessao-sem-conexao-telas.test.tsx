// @vitest-environment jsdom
//
// SEM CONEXAO EM CADA TELA (Fase 3e, 16/11/2026). O mesmo roteiro para as 23
// telas que conferem a sessao ao abrir:
// - sem conexao (ou erro 5xx do servidor) -> aviso "Sem conexão" + botao
//   "Tentar de novo", a pessoa FICA na tela, e nada restrito aparece nem e
//   pedido ao servidor (so a pergunta da sessao);
// - "Tentar de novo" e a volta da internet (evento "online") conferem de novo;
// - 401 do servidor -> login, exatamente como antes (seguranca intocada).
// E os componentes que so mostram/escondem opcoes (barra do topo, menu,
// "Editar depois do envio", grupos no seletor de pessoas): sem conexao, nada
// restrito; quando a internet volta, conferem de novo.
// Simulados: menu, barra do topo e pecas pesadas de desenho (testes proprios).
// Dados inventados.
import { Suspense, type ReactElement } from 'react'
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AcessoNegadoPage from '../../../../frontend/src/app/acesso-negado/page'
import AparelhosPage from '../../../../frontend/src/app/aparelhos/page'
import AuditoriaPage from '../../../../frontend/src/app/auditoria/page'
import BancoImagensPage from '../../../../frontend/src/app/banco-imagens/page'
import CompartilhadasPage from '../../../../frontend/src/app/compartilhadas-comigo/page'
import ConfiguracoesPage from '../../../../frontend/src/app/configuracoes/page'
import CuradoriaPage from '../../../../frontend/src/app/curadoria/page'
import DashboardPage from '../../../../frontend/src/app/dashboard/page'
import EnviarImagemPage from '../../../../frontend/src/app/enviar-imagem/page'
import GruposPage from '../../../../frontend/src/app/grupos/page'
import ImagensPage from '../../../../frontend/src/app/imagens/page'
import IntegracoesPage from '../../../../frontend/src/app/integracoes/page'
import MacrosPage from '../../../../frontend/src/app/macros/page'
import MeusAcessosPage from '../../../../frontend/src/app/meus-acessos/page'
import MinhasImagensPage from '../../../../frontend/src/app/minhas-imagens/page'
import PainelAdminPage from '../../../../frontend/src/app/painel-admin/page'
import PesquisaPage from '../../../../frontend/src/app/pesquisa/page'
import PranchasRecebidasPage from '../../../../frontend/src/app/pranchas-recebidas/page'
import RelatoriosPage from '../../../../frontend/src/app/relatorios/page'
import SegundaOpiniaoPage from '../../../../frontend/src/app/segunda-opiniao/page'
import SugestoesPage from '../../../../frontend/src/app/sugestoes/page'
import UsuariosPage from '../../../../frontend/src/app/usuarios/page'
import VisualizarPage from '../../../../frontend/src/app/visualizar/[id]/page'
import VocabularioPage from '../../../../frontend/src/app/vocabulario/page'
import Topbar from '../../../../frontend/src/components/Topbar'
import Sidebar from '../../../../frontend/src/components/Sidebar'
import BotaoEditarCuradoria from '../../../../frontend/src/components/curadoria/BotaoEditarCuradoria'
import SeletorPessoasGrupos from '../../../../frontend/src/components/envios/SeletorPessoasGrupos'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/teste', useSearchParams: () => new URLSearchParams() }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
const D = '../../../../frontend/src/components'
vi.mock('../../../../frontend/src/components/curadoria/PainelVisualizador', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/curadoria/MarcadorAchado', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/segmentacao/PintorSegmentacao', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/curadoria/ControleOrientacao', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/curadoria/PainelVoz', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/segundaOpiniao/VisualizadorRevisao', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/VisualizadorSequencial', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/fundo/FundoAplicacao', () => ({ default: () => null }))

// Os componentes de verdade (barra do topo e menu) para o bloco final
const reais = vi.hoisted(() => ({ Topbar: null as unknown, Sidebar: null as unknown }))

const ADMIN = { id: 1, nome: 'Admin Teste', email: 'admin@exemplo.test', perfil: 'administrador', foto_perfil_url: null }

type Tela = { nome: string; montar: () => ReactElement; login?: string }
const TELAS: Tela[] = [
  { nome: 'Acesso negado', montar: () => <AcessoNegadoPage /> },
  { nome: 'Aparelhos da rede', montar: () => <AparelhosPage /> },
  { nome: 'Auditoria', montar: () => <AuditoriaPage /> },
  { nome: 'Banco de imagens', montar: () => <BancoImagensPage /> },
  { nome: 'Compartilhadas comigo', montar: () => <CompartilhadasPage /> },
  { nome: 'Configurações', montar: () => <ConfiguracoesPage /> },
  { nome: 'Curadoria', montar: () => <CuradoriaPage /> },
  { nome: 'Início (dashboard)', montar: () => <DashboardPage /> },
  { nome: 'Enviar imagem', montar: () => <EnviarImagemPage /> },
  { nome: 'Grupos', montar: () => <GruposPage /> },
  { nome: 'Imagens recebidas', montar: () => <ImagensPage /> },
  { nome: 'Integrações', montar: () => <IntegracoesPage /> },
  { nome: 'Macros', montar: () => <MacrosPage /> },
  { nome: 'Meus acessos', montar: () => <MeusAcessosPage /> },
  { nome: 'Minhas imagens', montar: () => <MinhasImagensPage /> },
  { nome: 'Painel administrativo', montar: () => <PainelAdminPage /> },
  { nome: 'Pesquisa', montar: () => <PesquisaPage /> },
  { nome: 'Pranchas recebidas', montar: () => <PranchasRecebidasPage />, login: '/login?volta=%2Fpranchas-recebidas' },
  { nome: 'Relatórios', montar: () => <RelatoriosPage /> },
  { nome: 'Segunda opinião', montar: () => <SegundaOpiniaoPage /> },
  { nome: 'Sugestões', montar: () => <SugestoesPage /> },
  { nome: 'Usuários', montar: () => <UsuariosPage /> },
  {
    nome: 'Detalhes da imagem',
    montar: () => (
      <Suspense fallback={null}>
        <VisualizarPage params={Promise.resolve({ id: '5' })} />
      </Suspense>
    ),
  },
  { nome: 'Vocabulário', montar: () => <VocabularioPage /> },
]

async function abrir(tela: Tela, sessao: Rota | (() => Rota)) {
  const servidor = servidorFalso({ 'GET /auth/me': typeof sessao === 'function' ? () => sessao() : sessao })
  await act(async () => {
    montarTela(tela.montar())
  })
  return servidor
}
const pedidosDeSessao = (servidor: ReturnType<typeof servidorFalso>) => servidor.pedidos.filter((p) => p.caminho === '/auth/me').length
const AVISO = 'Sem conexão com o servidor. Tente de novo.'

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/teste')
})
afterEach(() => cleanup())

describe.each(TELAS)('$nome', (tela) => {
  it.each([
    ['sem conexao', 'SEM_CONEXAO' as Rota],
    ['erro 503 do servidor', { status: 503 } as Rota],
  ])('%s: aviso + "Tentar de novo", fica na tela, nada restrito aparece nem e pedido', async (_n, rota) => {
    const servidor = await abrir(tela, rota)
    expect((await screen.findByRole('alert')).textContent).toBe(AVISO)
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(roteador.push).not.toHaveBeenCalled()
    expect(screen.queryByRole('navigation', { name: 'menu lateral' })).toBeNull()
    expect(screen.queryByRole('banner', { name: 'barra do topo' })).toBeNull()
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it('"Tentar de novo" confere de novo; com a sessao confirmada, sai do aviso sem ir ao login', async () => {
    const usuario = userEvent.setup()
    let rota: Rota = 'SEM_CONEXAO'
    const servidor = await abrir(tela, () => rota)
    await screen.findByRole('alert')
    rota = { corpo: ADMIN }
    await usuario.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull())
    expect(pedidosDeSessao(servidor)).toBe(2)
    expect(roteador.push).not.toHaveBeenCalledWith('/login')
  })

  it('a internet voltou (evento "online"): confere sozinha', async () => {
    let rota: Rota = 'SEM_CONEXAO'
    const servidor = await abrir(tela, () => rota)
    await screen.findByRole('alert')
    rota = { corpo: ADMIN }
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(pedidosDeSessao(servidor)).toBe(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull())
  })

  it('401 do servidor: login, como antes (e sem aviso de conexao)', async () => {
    await abrir(tela, { status: 401 })
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith(tela.login ?? '/login'))
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
  })
})

// Falhas que as proprias telas tinham, alem da pergunta da sessao
describe('telas que mandavam ao login por conta propria quando a rede falhava', () => {
  it.each([
    ['Início (dashboard): numeros', TELAS[7], 'GET /admin/stats'],
    ['Usuários: lista', TELAS[21], 'GET /users/'],
  ])('%s sem conexao: aviso, sem ir ao login', async (_n, tela, rota) => {
    servidorFalso({ 'GET /auth/me': { corpo: ADMIN }, [rota]: 'SEM_CONEXAO' })
    await act(async () => {
      montarTela(tela.montar())
    })
    expect((await screen.findByRole('alert')).textContent).toBe(AVISO)
    expect(roteador.push).not.toHaveBeenCalledWith('/login')
  })

  it('Início (dashboard): erro 500 nos numeros tambem nao desloga', async () => {
    servidorFalso({ 'GET /auth/me': { corpo: ADMIN }, 'GET /admin/stats': { status: 500 } })
    await act(async () => {
      montarTela(<DashboardPage />)
    })
    expect((await screen.findByRole('alert')).textContent).toBe(AVISO)
    expect(roteador.push).not.toHaveBeenCalledWith('/login')
  })

  it('Início (dashboard): 401 nos numeros continua indo ao login', async () => {
    servidorFalso({ 'GET /auth/me': { corpo: ADMIN }, 'GET /admin/stats': { status: 401 } })
    await act(async () => {
      montarTela(<DashboardPage />)
    })
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })
})

describe('componentes que so mostram ou escondem opcoes', () => {
  beforeEach(async () => {
    reais.Topbar = (await vi.importActual<{ default: unknown }>(`${D}/Topbar`)).default
    reais.Sidebar = (await vi.importActual<{ default: unknown }>(`${D}/Sidebar`)).default
  })
  const online = () => act(() => void window.dispatchEvent(new Event('online')))

  it('barra do topo: sem conexao mostra "Visitante"; a internet volta e mostra quem entrou', async () => {
    const TopbarReal = reais.Topbar as typeof Topbar
    let rota: Rota = 'SEM_CONEXAO'
    servidorFalso({ 'GET /auth/me': () => rota })
    montarTela(<TopbarReal />)
    expect(await screen.findByText('Visitante')).toBeTruthy()
    rota = { corpo: ADMIN }
    online()
    expect(await screen.findByText('Admin Teste')).toBeTruthy()
    expect(roteador.push).not.toHaveBeenCalled()
  })

  it('menu: sem conexao so os itens de todos; a internet volta e aparecem os do perfil', async () => {
    const SidebarReal = reais.Sidebar as typeof Sidebar
    let rota: Rota = 'SEM_CONEXAO'
    servidorFalso({ 'GET /auth/me': () => rota, 'GET /shares/recebidas/novas': { corpo: { quantidade: 0 } } })
    montarTela(<SidebarReal />)
    await waitFor(() => expect(screen.getByRole('link', { name: 'Banco de imagens' })).toBeTruthy())
    expect(screen.queryByRole('link', { name: 'Usuários' })).toBeNull()
    rota = { corpo: ADMIN }
    online()
    expect(await screen.findByRole('link', { name: 'Usuários' })).toBeTruthy()
  })

  it('"Editar depois do envio": escondido sem conexao; a internet volta e aparece para o curador', async () => {
    let rota: Rota = 'SEM_CONEXAO'
    servidorFalso({ 'GET /auth/me': () => rota })
    montarTela(<BotaoEditarCuradoria curationId={3} />)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('button')).toBeNull()
    rota = { corpo: { ...ADMIN, perfil: 'curador' } }
    online()
    expect(await screen.findByRole('button', { name: /Editar/ })).toBeTruthy()
  })

  it('seletor de pessoas: sem conexao nao pede os grupos; a internet volta e pede', async () => {
    let rota: Rota = 'SEM_CONEXAO'
    const servidor = servidorFalso({ 'GET /auth/me': () => rota, 'GET /grupos': { corpo: { grupos: [{ id: 1, nome: 'Turma A', membros: [] }] } } })
    montarTela(<SeletorPessoasGrupos pessoas={[]} grupos={[]} aoMudar={() => {}} />)
    await waitFor(() => expect(pedidosDeSessao(servidor)).toBe(1))
    expect(servidor.pedidos.some((p) => p.caminho === '/grupos')).toBe(false)
    rota = { corpo: { ...ADMIN, perfil: 'professor' } }
    online()
    await waitFor(() => expect(servidor.pedidos.some((p) => p.caminho === '/grupos')).toBe(true))
  })
})
