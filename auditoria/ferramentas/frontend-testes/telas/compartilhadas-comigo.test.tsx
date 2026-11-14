// @vitest-environment jsdom
//
// TELA "Compartilhadas comigo" (frontend/src/app/compartilhadas-comigo/page.tsx) - Fase 3b.
// Imagens que outras pessoas compartilharam: carregar, vazio, erros, quem
// enviou e o selo "Nova" (marca como vistas no servidor), secoes de envios
// por perfil, selecao, ver em sequencia, "i" com a descricao, marcacoes,
// lupa e a contagem de anotacoes atualizada quando o visualizador avisa.
// Simulados: menus, miniaturas (imagem real do servidor), visualizador em
// sequencia (OHIF) e a secao de envios (teste proprio). Dados inventados.
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CompartilhadasComigoPage from '../../../../frontend/src/app/compartilhadas-comigo/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/compartilhadas-comigo' }))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
vi.mock('../../../../frontend/src/components/envios/SecaoEnvios', () => ({
  default: ({ modo }: { modo: string }) => <section aria-label={`envios ${modo}`} />,
}))
vi.mock('../../../../frontend/src/components/MiniaturaImagem', () => ({
  default: ({ alt, onProporcao }: { alt: string; onProporcao?: (r: number) => void }) => {
    onProporcao?.(1.5)
    return <img alt={alt} />
  },
}))
vi.mock('../../../../frontend/src/components/compartilhar/ResponderCompartilhamento', () => ({
  default: ({ remetenteNome }: { remetenteNome: string }) => <span>responder a {remetenteNome}</span>,
}))
vi.mock('../../../../frontend/src/components/impressao/MenuImpressao', () => ({
  default: ({ grupos }: { grupos: { rotulo: string; itens: unknown[] }[] }) => (
    <span data-testid="grupos">{grupos.map((g) => `${g.rotulo}: ${g.itens.length}`).join(' | ')}</span>
  ),
}))
vi.mock('../../../../frontend/src/components/impressao/MenuSalvar', () => ({ MenuSalvarComo: () => null, MenuSalvarMinhasImagens: () => null }))
vi.mock('../../../../frontend/src/components/VisualizadorSequencial', () => ({
  default: ({ itens, onFechar }: { itens: { numero: number; compartilhamento?: { remetente_nome: string } }[]; onFechar: () => void }) => (
    <div role="dialog" aria-label="visualizador em sequência">
      imagens {itens.map((i) => `${i.numero} de ${i.compartilhamento?.remetente_nome}`).join(', ')}
      <button type="button" onClick={onFechar}>
        fechar visualizador
      </button>
    </div>
  ),
}))

const MARCACAO = { tipo: 'oval', x: 0.5, y: 0.5, largura: 0.2, altura: 0.2 }
function recebida(id: number, extra: object = {}) {
  return {
    id,
    curation_id: 100 + id,
    remetente_nome: `Professora ${id}`,
    mensagem: null,
    compartilhado_em: '2026-11-10T12:00:00Z',
    novo: false,
    quantidade_anotacoes: 0,
    tipo_radiografia: 'periapical',
    achado_principal: 'carie',
    descricao_didatica: `Descrição de teste ${id}`,
    viewer_url: null,
    marcacoes: [],
    ...extra,
  }
}
const ITENS = [recebida(1, { novo: true, marcacoes: [MARCACAO], quantidade_anotacoes: 2 }), recebida(2), recebida(3)]
const sessao = (perfil: string) => ({ id: 5, nome: 'Pessoa Teste', email: 'pessoa@exemplo.test', perfil, foto_perfil_url: null })

function rotasPadrao(extra: Record<string, Rota> = {}, perfil = 'estudante'): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: sessao(perfil) },
    'GET /shares/recebidas': { corpo: { itens: ITENS } },
    'POST /shares/recebidas/vistas': { status: 204 },
    ...extra,
  }
}
async function abrir(rotas: Record<string, Rota>) {
  const servidor = servidorFalso(rotas)
  montarTela(<CompartilhadasComigoPage />)
  await waitFor(() => expect(screen.queryByText('Carregando...')).toBeNull())
  return servidor
}
const cartao = (n: number) => screen.getByRole('checkbox', { name: `Selecionar imagem #${n}` }).closest('[data-cartao-imagem]') as HTMLElement

beforeEach(() => {
  vi.clearAllMocks()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => cleanup())

describe('carregar', () => {
  it('sem sessao vai para o login, sem pedir a lista', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<CompartilhadasComigoPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
    expect(servidor.pedidos.some((p) => p.caminho === '/shares/recebidas')).toBe(false)
  })

  it('mostra "Carregando..." enquanto espera e depois a lista vazia', async () => {
    servidorFalso(rotasPadrao({ 'GET /shares/recebidas': { corpo: { itens: [] } } }))
    montarTela(<CompartilhadasComigoPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    expect(await screen.findByText('Nenhuma imagem foi compartilhada com você ainda.')).toBeTruthy()
  })

  it.each([
    ['erro do servidor', { status: 500 } as Rota],
    ['sem conexao', 'SEM_CONEXAO' as Rota],
  ])('%s: avisa que nao carregou', async (_n, rota) => {
    await abrir(rotasPadrao({ 'GET /shares/recebidas': rota }))
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível carregar as imagens compartilhadas.')
  })

  it('sessao expirada na lista: vai para o login', async () => {
    servidorFalso(rotasPadrao({ 'GET /shares/recebidas': { status: 401 } }))
    montarTela(<CompartilhadasComigoPage />)
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
  })
})

describe('com imagens', () => {
  it('mostra quem enviou, o selo "Nova" e marca as novas como vistas (avisa o menu)', async () => {
    const vistas = vi.fn()
    window.addEventListener('radix-compartilhadas-vistas', vistas)
    const servidor = await abrir(rotasPadrao())
    expect(screen.getByText('3 imagens compartilhadas')).toBeTruthy()
    expect(within(cartao(1)).getByText('Nova')).toBeTruthy()
    expect(within(cartao(2)).queryByText('Nova')).toBeNull()
    expect(within(cartao(2)).getByText('responder a Professora 2')).toBeTruthy()
    await waitFor(() => expect(vistas).toHaveBeenCalled())
    expect(servidor.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/shares/recebidas/vistas', corpo: undefined }])
    window.removeEventListener('radix-compartilhadas-vistas', vistas)
  })

  it('sem nenhuma nova: nao manda "vistas"', async () => {
    const servidor = await abrir(rotasPadrao({ 'GET /shares/recebidas': { corpo: { itens: [recebida(2)] } } }))
    expect(screen.getByText('1 imagem compartilhada')).toBeTruthy()
    expect(servidor.alteracoes()).toEqual([])
  })

  it.each([
    ['estudante', ['envios recebidas']],
    ['professor', ['envios analisar', 'envios recebidas']],
    ['curador', ['envios analisar', 'envios recebidas']],
  ])('perfil %s ve as secoes de envio %j', async (perfil, secoes) => {
    await abrir(rotasPadrao({}, perfil))
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(secoes)
  })
})

describe('selecao e ver em sequencia', () => {
  it('selecionar todas, limpar, +10 e "Selecionar mais"; ver as escolhidas em sequencia', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await usuario.click(screen.getByRole('button', { name: 'Selecionar todas (3)' }))
    expect(screen.getByTestId('grupos').textContent).toBe('Todas as compartilhadas: 3 | Somente as selecionadas: 3')
    await usuario.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    expect(screen.queryByRole('button', { name: /Ver .* em sequência/ })).toBeNull()

    const quantos = screen.getByRole('spinbutton', { name: 'Selecionar mais' })
    await usuario.clear(quantos)
    await usuario.type(quantos, '1')
    await usuario.click(screen.getByRole('button', { name: 'Selecionar mais' }))
    expect(screen.getByRole('button', { name: /Ver 1 selecionada em sequência/ })).toBeTruthy()
    await usuario.clear(quantos)
    await usuario.type(quantos, '0') // quantidade invalida: nada muda
    await usuario.click(screen.getByRole('button', { name: 'Selecionar mais' }))
    await usuario.click(screen.getByRole('checkbox', { name: 'Selecionar imagem #3' }))
    await usuario.click(screen.getByRole('button', { name: /Ver 2 selecionadas em sequência/ }))
    expect(screen.getByRole('dialog', { name: 'visualizador em sequência' }).textContent).toContain('imagens 1 de Professora 1, 3 de Professora 3')
    await usuario.click(screen.getByRole('button', { name: 'fechar visualizador' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    await usuario.click(screen.getByRole('button', { name: '+10' }))
    expect(screen.getByRole('button', { name: /Ver 3 selecionadas/ })).toBeTruthy()
  })
})

describe('icones de cada quadrado', () => {
  it('"i" fixa a descricao com data e anotacoes; clicar de novo fecha', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const info = within(cartao(1)).getByRole('button', { name: 'Clique para abrir as informações da imagem' })
    await usuario.click(info)
    const quadro = within(cartao(1)).getByRole('tooltip')
    expect(quadro.textContent).toContain('Curadoria da imagem #1')
    expect(quadro.textContent).toContain('2 anotações · abra com ▶ Ver para ler')
    expect(quadro.textContent).toContain(new Date('2026-11-10T12:00:00Z').toLocaleDateString('pt-BR'))
    await usuario.click(within(cartao(1)).getByRole('button', { name: 'Clique para fechar as informações da imagem' }))
    await usuario.unhover(within(cartao(1)).getByRole('button', { name: 'Clique para abrir as informações da imagem' }))
    expect(within(cartao(1)).queryByRole('tooltip')).toBeNull()
  })

  it('passar o mouse no "i" mostra a descricao e sair esconde', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const info = within(cartao(2)).getByRole('button', { name: 'Clique para abrir as informações da imagem' })
    await usuario.hover(info)
    expect(within(cartao(2)).getByRole('tooltip').textContent).toContain('Sem anotações')
    await usuario.unhover(info)
    expect(within(cartao(2)).queryByRole('tooltip')).toBeNull()
  })

  it('marcacoes do curador: so liga quando ha marcacao; com elas aparece o holofote', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    expect((within(cartao(2)).getByTitle(/0 marcaç|marcações do curador/) as HTMLButtonElement).disabled).toBe(true)
    const botao = within(cartao(1)).getByTitle('Mostrar a marcação do curador na imagem')
    await usuario.click(botao)
    expect(botao.getAttribute('aria-pressed')).toBe('true')
    const holofote = within(cartao(1)).getByRole('button', { name: /holofote/i })
    await usuario.click(holofote)
    expect(holofote.getAttribute('aria-pressed')).toBe('true')
    await usuario.click(within(cartao(1)).getByTitle('Esconder as marcações do curador'))
    expect(within(cartao(1)).queryByRole('button', { name: /holofote/i })).toBeNull()
  })

  it('lupa: passar o mouse amplia; clique alterna; sair do quadrado volta ao normal', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const lupa = within(cartao(2)).getByRole('button', { name: 'Passe o mouse para ampliar a imagem' })
    await usuario.hover(lupa)
    expect(lupa.getAttribute('aria-pressed')).toBe('true')
    expect(within(cartao(2)).getAllByRole('img')).toHaveLength(2) // carrega a versao ampliada
    await usuario.click(lupa) // ja ampliada: o clique desfaz
    expect(lupa.getAttribute('aria-pressed')).toBe('false')
    await usuario.click(lupa) // de novo: amplia
    expect(lupa.getAttribute('aria-pressed')).toBe('true')
    await usuario.unhover(cartao(2))
    expect(lupa.getAttribute('aria-pressed')).toBe('false')
  })
})

describe('anotacoes mudadas no visualizador', () => {
  it('o aviso do visualizador busca a contagem nova e atualiza o quadrado', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({ 'GET /shares/recebidas/2/anotacoes': { corpo: { itens: [{}, {}, {}], mensagem: 'Olhe o 36' } } }))
    act(() => {
      window.dispatchEvent(new CustomEvent('radix-anotacoes-compartilhadas', { detail: { id: 2 } }))
      window.dispatchEvent(new CustomEvent('radix-anotacoes-compartilhadas', { detail: {} })) // sem id: ignora
    })
    await waitFor(() => expect(servidor.pedidos.map((p) => p.caminho)).toContain('/shares/recebidas/2/anotacoes'))
    await usuario.click(within(cartao(2)).getByRole('button', { name: 'Clique para abrir as informações da imagem' }))
    await waitFor(() => expect(within(cartao(2)).getByRole('tooltip').textContent).toContain('3 anotações'))
  })

  it('se a contagem nova falhar, o quadrado fica como estava', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ 'GET /shares/recebidas/1/anotacoes': { status: 500 } }))
    act(() => {
      window.dispatchEvent(new CustomEvent('radix-anotacoes-compartilhadas', { detail: { id: 1 } }))
    })
    await usuario.click(within(cartao(1)).getByRole('button', { name: 'Clique para abrir as informações da imagem' }))
    await new Promise((r) => setTimeout(r, 20))
    expect(within(cartao(1)).getByRole('tooltip').textContent).toContain('2 anotações')
  })
})
