// @vitest-environment jsdom
//
// TELA "Pesquisa avancada" (frontend/src/app/pesquisa/page.tsx) - Fase 1.
// Qualquer pessoa LOGADA pesquisa (estudante, professor, curador, admin).
// Confere: os filtros viram o endereco certo da pesquisa, o resumo
// "Pesquisando por", a grade de resultados, a selecao, "Salvar em Minhas
// imagens", os erros (servidor ocupado repete sozinho; sem conexao) e os
// filtros vindos no endereco (links do Banco de imagens).
// Ficam de fora (teste proprio / navegador): miniaturas (imagem real),
// visualizador em sequencia (OHIF), menus de imprimir e salvar arquivo.
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PesquisaPage from '../../../../frontend/src/app/pesquisa/page'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const nav = vi.hoisted(() => ({
  roteador: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() },
  endereco: new URLSearchParams(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => nav.roteador,
  usePathname: () => '/pesquisa',
  useSearchParams: () => nav.endereco,
}))
vi.mock('../../../../frontend/src/components/Sidebar', () => ({ default: () => <nav aria-label="menu lateral" /> }))
vi.mock('../../../../frontend/src/components/Topbar', () => ({ default: () => <header aria-label="barra do topo" /> }))
vi.mock('../../../../frontend/src/components/MiniaturaImagem', () => ({
  default: ({ alt, onProporcao }: { alt: string; onProporcao?: (r: number) => void }) => {
    onProporcao?.(1.5)
    return <img alt={alt} />
  },
}))
vi.mock('../../../../frontend/src/components/VisualizadorSequencial', () => ({
  default: ({ itens }: { itens: { numero: number }[] }) => <div role="dialog" aria-label="visualizador em sequência">imagens {itens.map((i) => i.numero).join(',')}</div>,
}))
vi.mock('../../../../frontend/src/components/impressao/MenuImpressao', () => ({ default: () => null }))

// ---- dados inventados ----
const ESTUDANTE = { id: 9, nome: 'Estudante Teste', email: 'estudante@exemplo.test', perfil: 'estudante', foto_perfil_url: null }
function resultado(id: number, extra: object = {}) {
  return {
    curation_id: id,
    orthanc_reference_id: id + 1000,
    orthanc_id: `sintetico-${id}`,
    modalidade: 'IO',
    tipo_radiografia: 'periapical',
    dentes: [36],
    achado_principal: 'carie',
    achados_detalhe: null,
    alteracoes_observadas: [],
    marcacoes: [],
    qualidade_tecnica: 'boa',
    dificuldade: null,
    origem: 'externa',
    descricao_didatica: `Ficha ${id} de teste.`,
    viewer_url: null,
    ...extra,
  }
}
const ACHADOS = [resultado(11), resultado(12, { marcacoes_exibicao: [{ tipo: 'circulo', x: 0.5, y: 0.5, raio: 0.1 }], total_marcacoes: 1 }), resultado(13)]
const PESQUISA = 'GET /search?*'

function rotasPadrao(extra: Record<string, Rota> = {}): Record<string, Rota> {
  return {
    'GET /auth/me': { corpo: ESTUDANTE },
    'GET /vocabulario': { corpo: { termos: [{ id: 5, termo: 'Nódulo pulpar', categoria: 'achado', sinonimos: [{ id: 51, sinonimo: 'pedra pulpar' }] }] } },
    'GET /search/counts': { corpo: { total: 42 } },
    [PESQUISA]: { corpo: { itens: ACHADOS, total: 3 } },
    ...extra,
  }
}
async function abrir(rotas: Record<string, Rota>) {
  const servidor = servidorFalso(rotas)
  montarTela(<PesquisaPage />)
  await screen.findByRole('heading', { level: 1, name: /Pesquisa\s+avançada/ })
  return servidor
}
/** os parametros da ULTIMA pesquisa enviada ao servidor */
function ultimaPesquisa(servidor: { pedidos: { caminho: string }[] }) {
  const pedidos = servidor.pedidos.filter((p) => p.caminho.startsWith('/search?'))
  return new URLSearchParams(pedidos[pedidos.length - 1].caminho.split('?')[1])
}

beforeEach(() => {
  vi.clearAllMocks()
  nav.endereco = new URLSearchParams()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('permissao por perfil e abertura', () => {
  it('sem login: vai para o login e nao pesquisa nada', async () => {
    const servidor = servidorFalso({ 'GET /auth/me': { status: 401 } })
    montarTela(<PesquisaPage />)
    expect(screen.getByText('Carregando...')).toBeTruthy()
    await waitFor(() => expect(nav.roteador.push).toHaveBeenCalledWith('/login'))
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/auth/me'])
  })

  it.each(['estudante', 'professor', 'curador', 'administrador'])('%s: entra, ve o total disponivel e o convite para filtrar', async (perfil) => {
    await abrir(rotasPadrao({ 'GET /auth/me': { corpo: { ...ESTUDANTE, perfil } } }))
    expect(nav.roteador.push).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.getByText(/imagens disponíveis no total/).textContent).toMatch(/\b42 imagens disponíveis no total\./))
    expect(screen.getByText('Use os filtros acima para buscar imagens')).toBeTruthy()
    expect(screen.getByRole('search', { name: 'Busca avançada' })).toBeTruthy()
  })

  it('sem o total e sem o vocabulario (servidor falhou) a tela continua funcionando', async () => {
    const servidor = await abrir(rotasPadrao({ 'GET /search/counts': 'SEM_CONEXAO', 'GET /vocabulario': { status: 500 } }))
    expect(screen.queryByText(/disponíveis no total/)).toBeNull()
    await userEvent.setup().click(screen.getByRole('button', { name: /Pesquisar/ }))
    expect(await screen.findByText(/^3 imagens encontradas/)).toBeTruthy()
    expect(servidor.pedidos.some((p) => p.caminho.startsWith('/search?'))).toBe(true)
  })
})

describe('filtros e pesquisa', () => {
  it('Fase 3b: o rotulo "Erro técnico" esta ligado a caixa de busca do filtro', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const campo = screen.getByLabelText('Erro técnico')
    expect(campo).toBe(screen.getByRole('combobox', { name: 'Erro técnico' }))
    await usuario.type(campo, 'sub')
    await usuario.click(await screen.findByRole('option', { name: /Subexposição/ }))
    expect(screen.getByRole('button', { name: '✕ Subexposição' })).toBeTruthy()
  })

  it('filtros escolhidos viram o endereco da pesquisa e o resumo "Pesquisando por"', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao())
    await usuario.click(within(screen.getByRole('toolbar', { name: 'Gênero' })).getByRole('button', { name: 'Feminino' }))
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Tipo de exame' }), 'Panorâmica')
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Qualidade técnica' }), 'Boa')
    await usuario.type(screen.getByRole('spinbutton', { name: 'Idade mín.' }), '18')
    await usuario.type(screen.getByRole('spinbutton', { name: 'Idade máx.' }), '60')
    const dentes = screen.getByRole('toolbar', { name: 'Dentes ou grupos de dentes (FDI)' })
    await usuario.click(within(dentes).getByRole('button', { name: '36' }))
    await usuario.click(within(dentes).getByRole('button', { name: '46' }))
    await usuario.click(screen.getByRole('radio', { name: 'Todos' }))
    expect(screen.getByText('Pesquisando por:')).toBeTruthy()
    expect(screen.getByText('Tipo de exame: Panorâmica')).toBeTruthy()
    expect(screen.getByText('Dentes 36, 46')).toBeTruthy()
    expect(screen.getByText('(Todos)')).toBeTruthy()

    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    expect(await screen.findByText(/^3 imagens encontradas/)).toBeTruthy()
    const p = ultimaPesquisa(servidor)
    expect(Object.fromEntries([...p.keys()].map((k) => [k, p.getAll(k).join(',')]))).toEqual({
      tipo_radiografia: 'panoramica',
      genero: 'feminino',
      qualidade_tecnica: 'boa',
      idade_min: '18',
      idade_max: '60',
      dentes: '36,46',
      modo_dentes: 'todos',
      limit: '200',
    })
    // a busca se recolhe para dar espaco as imagens
    expect(screen.queryByRole('search')).toBeNull()
    expect(screen.getByText('6 filtros em uso')).toBeTruthy()
  })

  it('um dente so: nao pergunta "qualquer um / todos" nem manda o modo', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao())
    await usuario.click(within(screen.getByRole('toolbar', { name: 'Dentes ou grupos de dentes (FDI)' })).getByRole('button', { name: '11' }))
    expect(screen.queryByRole('radio', { name: 'Todos' })).toBeNull()
    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    await screen.findByText(/^3 imagens encontradas/)
    expect(ultimaPesquisa(servidor).getAll('dentes')).toEqual(['11'])
    expect(ultimaPesquisa(servidor).has('modo_dentes')).toBe(false)
  })

  it('busca por termos: sugere pelo comeco da palavra (inclusive sinonimo do vocabulario) e envia o termo', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao())
    const campo = screen.getByRole('combobox', { name: 'Buscar por termos' })
    await usuario.type(campo, 'pedra pul')
    const opcao = await screen.findByRole('option', { name: /Nódulo pulpar/ })
    await usuario.click(opcao)
    expect(screen.getByText('Termos: Nódulo pulpar')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    await screen.findByText(/^3 imagens encontradas/)
    expect(ultimaPesquisa(servidor).getAll('termos')).toEqual(['vocab:5'])
  })

  it('"Limpar filtros" zera tudo e a pesquisa vai sem filtro', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao())
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Tipo de exame' }), 'Oclusal')
    await usuario.click(within(screen.getByRole('toolbar', { name: 'Dentes ou grupos de dentes (FDI)' })).getByRole('button', { name: '21' }))
    await usuario.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(screen.queryByText('Pesquisando por:')).toBeNull()
    expect((screen.getByRole('combobox', { name: 'Tipo de exame' }) as HTMLSelectElement).value).toBe('')
    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    await screen.findByText(/^3 imagens encontradas/)
    expect([...ultimaPesquisa(servidor).keys()]).toEqual(['limit'])
  })

  it('setas ← → trocam a opcao de uma lista da busca (teclado)', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    const tipo = screen.getByRole('combobox', { name: 'Tipo de exame' }) as HTMLSelectElement
    tipo.focus()
    await usuario.keyboard('{ArrowRight}')
    expect(tipo.value).toBe('periapical')
    await usuario.keyboard('{ArrowLeft}{ArrowLeft}')
    expect(tipo.value).toBe('tomografia') // volta pelo fim da lista
  })

  it('nenhum resultado: avisa; "Voltar a busca avancada" mostra os filtros de novo', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ [PESQUISA]: { corpo: { itens: [], total: 0 } } }))
    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    expect(await screen.findByText('Nenhuma imagem encontrada com esses filtros')).toBeTruthy()
    await usuario.click(screen.getByRole('button', { name: /Voltar à busca avançada/ }))
    expect(screen.getByRole('search', { name: 'Busca avançada' })).toBeTruthy()
  })

  it('com resultados: conta, mostra a grade e avisa quando so as primeiras vieram', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ [PESQUISA]: { corpo: { itens: ACHADOS, total: 250 } } }))
    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    expect((await screen.findByText(/^250 imagens encontradas/)).textContent).toContain('(mostrando as primeiras 3)')
    expect(screen.getAllByRole('img', { name: /^Imagem/ }).length).toBeGreaterThanOrEqual(3)
    expect(screen.getByAltText('Ficha 13 de teste.')).toBeTruthy()
  })
})

describe('erros da pesquisa', () => {
  it('servidor ocupado (503): a tela repete sozinha 2 vezes, avisa e oferece "Tentar de novo"', async () => {
    const usuario = userEvent.setup()
    let vezes = 0
    const servidor = await abrir(rotasPadrao({ [PESQUISA]: () => (++vezes <= 3 ? { status: 503, corpo: {} } : { corpo: { itens: ACHADOS, total: 3 } }) }))
    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    const alerta = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(alerta.textContent).toContain('O servidor está ocupado ou reiniciando. Já tentamos de novo automaticamente.')
    expect(servidor.pedidos.filter((p) => p.caminho.startsWith('/search?'))).toHaveLength(3)
    await usuario.click(within(alerta).getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText(/^3 imagens encontradas/)).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  }, 10000)

  it('recusa com motivo (400): mostra o motivo, sem "Tentar de novo"', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ [PESQUISA]: { status: 400, corpo: { detail: 'Idade mínima maior que a máxima.' } } }))
    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    const alerta = await screen.findByRole('alert')
    expect(alerta.textContent).toBe('Idade mínima maior que a máxima.')
    expect(within(alerta).queryByRole('button')).toBeNull()
  })

  it('sem conexao: avisa (depois de tentar 3 vezes) e oferece "Tentar de novo"', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ [PESQUISA]: 'SEM_CONEXAO' }))
    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    const alerta = await screen.findByRole('alert', {}, { timeout: 5000 })
    expect(alerta.textContent).toContain('Sem conexão com o servidor. Verifique a internet e tente de novo.')
    expect(within(alerta).getByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
  }, 10000)

  it('sessao expirada (401) na pesquisa: vai para o login', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao({ [PESQUISA]: { status: 401 } }))
    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    await waitFor(() => expect(nav.roteador.push).toHaveBeenCalledWith('/login'))
  })
})

describe('filtros vindos no endereco (links do Banco de imagens)', () => {
  it('?tipo_radiografia=...&termos=grupo:carie pesquisa sozinha com esses filtros', async () => {
    nav.endereco = new URLSearchParams('tipo_radiografia=interproximal&termos=grupo:carie&erros_tecnicos=corte_de_cone')
    const servidor = await abrir(rotasPadrao())
    expect(await screen.findByText(/^3 imagens encontradas/)).toBeTruthy()
    const p = ultimaPesquisa(servidor)
    expect(p.get('tipo_radiografia')).toBe('interproximal')
    expect(p.getAll('termos')).toEqual(['grupo:carie'])
    expect(p.getAll('erros_tecnicos')).toEqual(['corte_de_cone'])
  })

  it('parametros antigos (achado_principal, achado, termo_id, texto) viram termos', async () => {
    nav.endereco = new URLSearchParams('achado_principal=carie&achado=nodulo_pulpar&termo_id=5&texto=furca&termos=invalido:x')
    const servidor = await abrir(rotasPadrao())
    await screen.findByText(/^3 imagens encontradas/)
    expect(ultimaPesquisa(servidor).getAll('termos')).toEqual(['grupo:carie', 'achado:nodulo_pulpar', 'vocab:5', 'texto:furca'])
  })
})

describe('resultados: selecao e acoes', () => {
  async function pesquisarTudo(usuario: ReturnType<typeof userEvent.setup>) {
    await usuario.click(screen.getByRole('button', { name: /Pesquisar/ }))
    await screen.findByText(/^3 imagens encontradas/)
  }

  it('selecionar, "Selecionar todas", "+10", "Selecionar mais" e "Limpar selecao"', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await pesquisarTudo(usuario)
    const caixas = () => screen.getAllByRole('checkbox', { name: /^Selecionar imagem #/ }) as HTMLInputElement[]
    const marcadas = () => caixas().flatMap((c, n) => (c.checked ? [n + 1] : []))
    await usuario.click(caixas()[1])
    expect(marcadas()).toEqual([2])
    await usuario.click(screen.getByRole('button', { name: 'Selecionar todas (3)' }))
    expect(marcadas()).toEqual([1, 2, 3])
    await usuario.click(screen.getByRole('button', { name: 'Limpar seleção' }))
    expect(marcadas()).toEqual([])
    const campo = screen.getByRole('spinbutton', { name: 'Selecionar mais' })
    await usuario.clear(campo)
    await usuario.type(campo, '2')
    await usuario.click(screen.getByRole('button', { name: 'Selecionar mais' }))
    expect(marcadas()).toEqual([1, 2])
    await usuario.click(screen.getByRole('button', { name: '+10' }))
    expect(marcadas()).toEqual([1, 2, 3])
    await usuario.click(caixas()[0])
    expect(marcadas()).toEqual([2, 3])
  })

  it('"Ver selecionadas" abre o visualizador com as escolhidas', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await pesquisarTudo(usuario)
    await usuario.click(screen.getAllByRole('checkbox', { name: /^Selecionar imagem #/ })[2])
    await usuario.click(screen.getByRole('button', { name: /Ver 1 selecionada em sequência/ }))
    expect(screen.getByRole('dialog', { name: 'visualizador em sequência' }).textContent).toContain('imagens 3')
  })

  it('"Salvar em Minhas imagens" salva as selecionadas e informa; falha parcial e avisada', async () => {
    const usuario = userEvent.setup()
    const servidor = await abrir(rotasPadrao({
      'POST /saved-images/11': { status: 201, corpo: {} },
      'POST /saved-images/13': { status: 500, corpo: {} },
    }))
    await pesquisarTudo(usuario)
    const caixas = screen.getAllByRole('checkbox', { name: /^Selecionar imagem #/ })
    await usuario.click(caixas[0])
    await usuario.click(caixas[2])
    await usuario.click(screen.getByTitle(/Salva 2 imagens em Minhas imagens/))
    expect(await screen.findByText('1 imagem está em Minhas imagens.')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toBe('1 imagem não pôde ser salva.')
    expect(servidor.alteracoes().map((p) => p.caminho).sort()).toEqual(['/saved-images/11', '/saved-images/13'])
  })

  it('icones do quadrado: marcacoes (so na que tem), "i" com a descricao e lupa', async () => {
    const usuario = userEvent.setup()
    await abrir(rotasPadrao())
    await pesquisarTudo(usuario)
    const marcacao = screen.getByTitle('Mostrar a marcação do curador na imagem')
    await usuario.click(marcacao)
    expect(marcacao.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /^Holofote/ })).toBeTruthy()
    await usuario.click(screen.getAllByRole('button', { name: 'Clique para abrir as informações da imagem' })[0])
    expect((await screen.findByRole('tooltip')).textContent).toContain('Ficha 11 de teste.')
    const [lupa] = screen.getAllByRole('button', { name: 'Passe o mouse para ampliar a imagem' })
    await usuario.hover(lupa)
    expect(lupa.getAttribute('aria-pressed')).toBe('true')
  })
})
