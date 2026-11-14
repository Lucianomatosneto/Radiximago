// @vitest-environment jsdom
//
// TELA "Detalhes da imagem" (frontend/src/app/visualizar/[id]/page.tsx) - Fase 3b.
// Abre uma imagem aprovada: sem sessao vai ao login; carregando; erros
// (servidor, sem conexao, imagem que nao esta entre as aprovadas, sessao
// vencida); navegacao entre os casos (anterior/proximo/voltar e a coluna
// de estudos); series do estudo (troca a serie no endereco do OHIF);
// imagem sem visualizador; classificacao com rotulos traduzidos; tela cheia.
// Simulados: colunas de estudos e series, marcacao e botoes de editar/anexos
// (testes proprios); o OHIF real nao carrega (iframe de outro endereco).
import { act, cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VisualizarImagemPage from '../../../../frontend/src/app/visualizar/[id]/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/visualizar/2' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
vi.mock('../../../../frontend/src/components/Logo', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/curadoria/BotaoEditarCuradoria', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/anexos/AnexosCuradoria', () => ({ BotaoAnexosImagem: () => null }))
vi.mock('../../../../frontend/src/components/detalhe/MarcacaoAchado', () => ({
  default: ({ marcacoes }: { marcacoes: unknown[] }) => <p>marcações: {marcacoes.length}</p>,
}))
vi.mock('../../../../frontend/src/components/detalhe/ColunaEstudos', () => ({
  default: ({ itens, indiceAtual, onSelecionar }: { itens: { curation_id: number }[]; indiceAtual: number; onSelecionar: (i: number) => void }) => (
    <ul aria-label="estudos">
      {itens.map((i, n) => (
        <li key={i.curation_id}>
          <button type="button" aria-pressed={n === indiceAtual} onClick={() => onSelecionar(n)}>
            estudo {i.curation_id}
          </button>
        </li>
      ))}
    </ul>
  ),
}))
vi.mock('../../../../frontend/src/components/visualizador/ColunaSeries', () => ({
  default: ({ series, onSelecionar, carregando }: { series: { series_instance_uid: string }[]; onSelecionar: (i: number) => void; carregando: boolean }) => (
    <ul aria-label="séries" aria-busy={carregando}>
      {series.map((s, n) => (
        <li key={s.series_instance_uid}>
          <button type="button" onClick={() => onSelecionar(n)}>
            série {s.series_instance_uid}
          </button>
        </li>
      ))}
    </ul>
  ),
}))

const OHIF = 'http://ohif.teste/viewer?StudyInstanceUIDs=1.2'
const img = (id: number, extra: object = {}) => ({
  curation_id: id,
  tipo_radiografia: 'panoramica',
  achado_principal: 'carie',
  dentes: [36],
  achados_detalhe: 'Detalhe de teste',
  alteracoes_observadas: [],
  marcacoes: [{ tipo: 'oval' }],
  qualidade_tecnica: 'boa',
  descricao_didatica: `Descrição de teste ${id}`,
  viewer_url: OHIF,
  ...extra,
})
const LISTA = [img(1), img(2), img(3, { viewer_url: null, tipo_radiografia: 'tomografia', qualidade_tecnica: null })]
const SESSAO = { id: 1, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil: 'estudante', foto_perfil_url: null }
function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: SESSAO },
    'GET /search?limit=200': { corpo: { itens: LISTA } },
    'GET /search/*': { corpo: { series: [] } },
    ...extra,
  }
}
async function abrir(id: number, rotas: Record<string, Rota>) {
  const servidor = servidorFalso(rotas)
  const params = Promise.resolve({ id: String(id) })
  await act(async () => {
    montarTela(
      <Suspense fallback={<p>suspenso</p>}>
        <VisualizarImagemPage params={params} />
      </Suspense>
    )
  })
  await waitFor(() => expect(screen.queryByText('Carregando...')).toBeNull())
  return servidor
}
const ABRIR_TELA_CHEIA = 'Abrir em tela cheia'
const ohif = () => screen.queryByTitle('Visualizador OHIF') as HTMLIFrameElement | null

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(document, 'fullscreenElement')
})

describe('abrir', () => {
  it('sem sessao vai ao login sem pedir a imagem', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401 } })
    await act(async () => {
      montarTela(
        <Suspense fallback={null}>
          <VisualizarImagemPage params={Promise.resolve({ id: '2' })} />
        </Suspense>
      )
    })
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it('imagem do meio: caso 2 de 3, visualizador OHIF, classificacao traduzida e aviso de uso', async () => {
    await abrir(2, rotasPadrao())
    expect(screen.getByText('Caso 2 de 3')).toBeTruthy()
    expect(ohif()?.src).toBe(OHIF)
    expect(screen.getAllByText('Panorâmica').length).toBeGreaterThan(0)
    expect(screen.getByText('Boa')).toBeTruthy()
    expect(screen.getByText('marcações: 1')).toBeTruthy()
    expect(screen.getByText(/exclusivamente para fins de ensino e pesquisa/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'estudo 2' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('imagem sem visualizador: avisa; tipo e qualidade fora da lista aparecem como vieram', async () => {
    await abrir(3, rotasPadrao())
    expect(ohif()).toBeNull()
    expect(screen.getByText('Imagem não disponível para visualização')).toBeTruthy()
    expect(screen.getAllByText('tomografia').length).toBeGreaterThan(0)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota, 'Não foi possível carregar esta imagem.'],
    ['sem conexao', 'SEM_CONEXAO' as Rota, 'Não foi possível carregar esta imagem.'],
    ['imagem nao aprovada', { corpo: { itens: LISTA } } as Rota, 'Imagem não encontrada entre as imagens aprovadas.'],
  ])('%s: mostra o motivo, sem visualizador nem navegacao', async (_n, rota, mensagem) => {
    await abrir(99, rotasPadrao({ 'GET /search?limit=200': rota }))
    expect(screen.getByText(mensagem)).toBeTruthy()
    expect(ohif()).toBeNull()
    expect(screen.queryByText(/Caso \d de/)).toBeNull()
  })

  it('sessao vencida na busca: vai ao login', async () => {
    await abrir(2, rotasPadrao({ 'GET /search?limit=200': { status: 401 } }))
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })
})

describe('navegar', () => {
  it('anterior, proximo, voltar e a coluna de estudos', async () => {
    const usuario = userEvent.setup()
    await abrir(2, rotasPadrao())
    await usuario.click(screen.getByRole('button', { name: '← Caso anterior' }))
    expect(roteador.push).toHaveBeenLastCalledWith('/visualizar/1')
    await usuario.click(screen.getByRole('button', { name: 'Próximo caso →' }))
    expect(roteador.push).toHaveBeenLastCalledWith('/visualizar/3')
    await usuario.click(screen.getByRole('button', { name: 'estudo 3' }))
    expect(roteador.push).toHaveBeenLastCalledWith('/visualizar/3')
    await usuario.click(screen.getByRole('button', { name: '← Voltar para pesquisa' }))
    expect(roteador.back).toHaveBeenCalled()
  })

  it('na primeira e na ultima, o botao do lado sem caso fica desligado', async () => {
    await abrir(1, rotasPadrao())
    expect((screen.getByRole('button', { name: '← Caso anterior' }) as HTMLButtonElement).disabled).toBe(true)
    cleanup()
    await abrir(3, rotasPadrao())
    expect((screen.getByRole('button', { name: 'Próximo caso →' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('series e tela cheia', () => {
  it('series do estudo: a 1a entra no endereco do OHIF; escolher outra troca', async () => {
    const usuario = userEvent.setup()
    await abrir(2, rotasPadrao({ 'GET /search/2/series': { corpo: { series: [{ series_instance_uid: 's-a' }, { series_instance_uid: 's-b' }] } } }))
    await waitFor(() => expect(ohif()?.src).toBe(`${OHIF}&SeriesInstanceUIDs=s-a`))
    await usuario.click(screen.getByRole('button', { name: 'série s-b' }))
    expect(ohif()?.src).toBe(`${OHIF}&SeriesInstanceUIDs=s-b`)
  })

  it.each([
    ['erro', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('series que falham (%s): fica o estudo inteiro', async (_n, rota) => {
    await abrir(2, rotasPadrao({ 'GET /search/2/series': rota }))
    await waitFor(() => expect(screen.getByRole('list', { name: 'séries' }).getAttribute('aria-busy')).toBe('false'))
    expect(ohif()?.src).toBe(OHIF)
  })

  it('tela cheia: entra, acompanha o navegador e sai', async () => {
    const usuario = userEvent.setup()
    const entrar = vi.fn(async () => {})
    HTMLElement.prototype.requestFullscreen = entrar
    const sair = vi.fn(async () => {})
    document.exitFullscreen = sair
    await abrir(2, rotasPadrao())
    await usuario.click(screen.getByRole('button', { name: ABRIR_TELA_CHEIA }))
    expect(entrar).toHaveBeenCalled()
    const coluna = entrar.mock.contexts[0] as HTMLElement
    Object.defineProperty(document, 'fullscreenElement', { value: coluna, configurable: true })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    await usuario.click(screen.getByRole('button', { name: /Sair da tela cheia/ }))
    expect(sair).toHaveBeenCalled()
  })

  it('navegador que recusa a tela cheia: nada quebra', async () => {
    const usuario = userEvent.setup()
    HTMLElement.prototype.requestFullscreen = vi.fn(async () => Promise.reject(new Error('negado')))
    await abrir(2, rotasPadrao())
    await usuario.click(screen.getByRole('button', { name: ABRIR_TELA_CHEIA }))
    expect(screen.getByRole('button', { name: ABRIR_TELA_CHEIA })).toBeTruthy()
  })
})
