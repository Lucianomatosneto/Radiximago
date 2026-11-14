// @vitest-environment jsdom
//
// COMPONENTE "Visualizador" das imagens selecionadas (Fase 2, 13/11/2026):
// frontend/src/components/VisualizadorSequencial.tsx - abre por cima da
// Pesquisa, de Minhas imagens e das Compartilhadas. Confere: andar entre as
// imagens (botoes e setas do teclado), grade lado a lado, series de um
// estudo, marcacoes do curador (tecla K, holofote), girar (tecla R) com e
// sem gravar, baixar, salvar em Minhas imagens, enviar por e-mail, tela
// cheia, o quadro ampliado ao lado da imagem e a conversa com o OHIF.
//
// SIMULADO:
// - o OHIF (visualizador DICOM) roda num iframe de OUTRO endereco: o
//   navegador de teste nao o carrega. Aqui o iframe recebe uma "janela"
//   falsa que anota as mensagens enviadas a ele, e as mensagens que o OHIF
//   mandaria de volta sao disparadas pelo teste (window "message");
// - medidas da tela (getBoundingClientRect): tudo mede 1000 x 600 px;
// - partes com teste proprio (etiqueta "i", menu de impressao, anexos,
//   anotacoes, miniatura e imagem marcada, seletor de layout) viram
//   versoes simples que mostram o que receberam.
// FICA DE FORA (Playwright/e2e): o OHIF de verdade desenhando as marcacoes,
// girando e mudando de serie; o modo tela cheia real do navegador.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VisualizadorSequencial, { type ItemSequencia } from '../../../../frontend/src/components/VisualizadorSequencial'
import { girarMarcacoes } from '../../../../frontend/src/lib/orientacao'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const roteador = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => roteador, usePathname: () => '/pesquisa' }))
const sessao = vi.hoisted(() => ({ perfil: 'estudante' as string | null }))
vi.mock('../../../../frontend/src/lib/sessao', () => ({
  obterSessaoAtual: async () => (sessao.perfil ? { perfil: sessao.perfil } : null),
}))

// ---------- partes com teste proprio: versoes simples ----------
type Area = () => { left: number; top: number; width: number; height: number } | null
const etiquetas = vi.hoisted(() => ({} as Record<number, { areaAmpliada?: Area; areaPropria?: Area; ampliado?: boolean; marcacoes?: { x: number; y: number }[] }>))
vi.mock('../../../../frontend/src/components/visualizador/EtiquetaMarcacoes', () => ({
  default: (p: {
    item: { curation_id: number; numero: number; marcacoes?: { x: number; y: number }[] }
    ampliado?: boolean
    onAmpliar?: (v: boolean) => void
    onFocoMarcacao?: (i: number | null) => void
    onIsolarMarcacao?: (i: number) => void
    areaAmpliada?: Area
    areaPropria?: Area
  }) => {
    etiquetas[p.item.curation_id] = { areaAmpliada: p.areaAmpliada, areaPropria: p.areaPropria, ampliado: p.ampliado, marcacoes: p.item.marcacoes }
    return (
      <span>
        <button type="button" aria-pressed={!!p.ampliado} onClick={() => p.onAmpliar?.(!p.ampliado)}>
          ampliar #{p.item.numero}
        </button>
        <button type="button" onClick={() => p.onFocoMarcacao?.(0)}>
          focar #{p.item.numero}
        </button>
        <button type="button" onClick={() => p.onFocoMarcacao?.(null)}>
          desfocar #{p.item.numero}
        </button>
        <button type="button" onClick={() => p.onIsolarMarcacao?.(0)}>
          isolar #{p.item.numero}
        </button>
      </span>
    )
  },
}))
vi.mock('../../../../frontend/src/components/visualizador/SeletorLayout', () => ({
  default: ({ onEscolher, onAbrir }: { onEscolher: (g: { linhas: number; colunas: number }) => void; onAbrir?: () => void }) => (
    <span>
      <button type="button" onClick={() => onAbrir?.()}>
        abrir layouts
      </button>
      <button type="button" onClick={() => onEscolher({ linhas: 1, colunas: 1 })}>
        layout 1x1
      </button>
      <button type="button" onClick={() => onEscolher({ linhas: 2, colunas: 2 })}>
        layout 2x2
      </button>
    </span>
  ),
}))
vi.mock('../../../../frontend/src/components/MiniaturaImagem', () => ({
  default: ({ alt }: { alt: string }) => <img alt={alt} data-tipo="miniatura" />,
}))
vi.mock('../../../../frontend/src/components/detalhe/ImagemPrincipalMarcada', () => ({
  default: ({ alt, srcPreCarregado }: { alt: string; srcPreCarregado?: string }) => (
    <img alt={alt} data-tipo="marcada" data-src={srcPreCarregado ?? ''} />
  ),
}))
vi.mock('../../../../frontend/src/components/detalhe/AnotacoesImagem', () => ({ default: () => <span>anotações</span> }))
vi.mock('../../../../frontend/src/components/Logo', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/fundo/FundoMapaMundi', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/ThemeToggle', () => ({ default: () => null }))
vi.mock('../../../../frontend/src/components/anexos/AnexosCuradoria', () => ({ BotaoAnexosImagem: () => <span>anexos</span> }))
vi.mock('../../../../frontend/src/components/impressao/MenuImpressao', () => ({
  default: ({ grupos }: { grupos: { rotulo: string; itens: unknown[] }[] }) => (
    <span data-testid="grupos-prancha">{grupos.map((g) => `${g.rotulo}: ${g.itens.length}`).join(' | ')}</span>
  ),
}))
vi.mock('../../../../frontend/src/components/impressao/MenuPrancha', () => ({
  BotaoComPrancha: (p: { rotulo: string; rotuloAcao: string; onAcao: () => void; semAcao?: boolean; desativado?: boolean }) => (
    <span>
      <button type="button" disabled={p.desativado}>
        {p.rotulo}
      </button>
      {!p.semAcao && (
        <button type="button" onClick={p.onAcao}>
          {p.rotuloAcao}
        </button>
      )}
    </span>
  ),
}))

// ---------- OHIF simulado ----------
const OHIF = 'http://ohif.teste'
const janelaOhif = { postMessage: vi.fn() }
const descritorOriginal = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow')
function doOhif(data: unknown, origem = OHIF) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { origin: origem, data }))
  })
}
const enviadas = (tipo: string) => janelaOhif.postMessage.mock.calls.map((c) => c[0]).filter((m) => m.tipo === tipo)

const MARCA = { id: 'a', tipo: 'oval', x: 0.2, y: 0.3, largura: 0.1, altura: 0.2, achado: 'lesao_periapical' }
function item(id: number, comOhif = false, extra: Partial<ItemSequencia> = {}): ItemSequencia {
  return {
    curation_id: id,
    numero: id + 4,
    descricao_didatica: id === 2 ? null : `Imagem de teste ${id}`,
    tipo_radiografia: 'periapical',
    viewer_url: comOhif ? `${OHIF}/viewer?StudyInstanceUIDs=1.${id}` : null,
    marcacoes: id === 1 ? [MARCA as never] : [],
    ...extra,
  }
}
const TRES = [item(1), item(2), item(3)]

function servidor(extras: Record<string, Rota> = {}) {
  return servidorFalso({
    'GET /search/*': { status: 404 },
    'GET /search/1/preview': { corpo: {} },
    ...extras,
  })
}
function abrir(itens: ItemSequencia[], opcoes: { indice?: number; descricaoAoLado?: boolean } = {}) {
  const fechar = vi.fn()
  const tela = montarTela(
    <VisualizadorSequencial itens={itens} indiceInicial={opcoes.indice ?? 0} onFechar={fechar} descricaoAoLado={opcoes.descricaoAoLado} />
  )
  return { fechar, tela }
}
const cabecalho = () => screen.getByText('Imagem', { exact: false, selector: 'div.text-sm' }).textContent
const botao = (nome: string | RegExp) => screen.getByRole('button', { name: nome })

let baixados: string[] = []
beforeEach(() => {
  sessao.perfil = 'estudante'
  for (const k of Object.keys(etiquetas)) delete etiquetas[Number(k)]
  janelaOhif.postMessage.mockClear()
  roteador.push.mockClear()
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get: () => janelaOhif, configurable: true })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 1000, bottom: 600, width: 1000, height: 600, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
  window.innerWidth = 1024
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
  baixados = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    baixados.push(this.download)
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (descritorOriginal) Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', descritorOriginal)
  Reflect.deleteProperty(document, 'fullscreenElement')
})

describe('uma imagem por vez', () => {
  beforeEach(() => {
    window.innerWidth = 500 // tela estreita: comeca com 1 imagem
  })

  it('cabecalho, setas « » e do teclado, Esc e "Fechar"', async () => {
    const usuario = userEvent.setup()
    const s = servidor()
    const { fechar } = abrir(TRES)
    expect(cabecalho()).toContain('#5')
    expect(cabecalho()).toContain('(1 de 3 selecionadas)')
    expect(screen.getByRole('img', { name: 'Imagem de teste 1' })).toBeTruthy()
    expect((botao(/Estudo anterior/) as HTMLButtonElement).disabled).toBe(true)
    await waitFor(() => expect(s.pedidos.map((p) => p.caminho)).toEqual(expect.arrayContaining(['/search/1/serie-info', '/search/1/preview'])))
    await usuario.click(botao(/Próximo estudo/))
    expect(cabecalho()).toContain('(2 de 3 selecionadas)')
    expect(screen.getByRole('img', { name: 'Imagem #6' })).toBeTruthy() // sem descricao: "Imagem #N"
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'ArrowRight' }) // ja na ultima: fica
    expect(cabecalho()).toContain('(3 de 3 selecionadas)')
    expect((botao(/Próximo estudo/) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(cabecalho()).toContain('(2 de 3 selecionadas)')
    await usuario.click(botao(/Estudo anterior/))
    fireEvent.keyDown(document, { key: 'ArrowLeft' }) // ja na primeira: fica
    expect(cabecalho()).toContain('(1 de 3 selecionadas)')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(fechar).toHaveBeenCalledTimes(1)
    await usuario.click(botao('Fechar'))
    expect(fechar).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('grupos-prancha').textContent).toBe('Todas desta sequência: 3 | As que estão na tela: 1')
  })

  it('tecla K liga as marcacoes (imagem marcada com a previa ja baixada), o selo e o holofote', async () => {
    const usuario = userEvent.setup()
    servidor()
    abrir(TRES)
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled())
    fireEvent.keyDown(document, { key: 'k' })
    const marcada = screen.getByRole('img', { name: 'Imagem de teste 1' })
    expect(marcada.getAttribute('data-tipo')).toBe('marcada')
    expect(marcada.getAttribute('data-src')).toBe('blob:previa')
    const selo = screen.getByTitle('Ocultar as marcações do curador desta imagem')
    expect(selo.getAttribute('aria-pressed')).toBe('true')
    const holofote = botao('Holofote: escurecer a imagem fora da marcação em destaque')
    await usuario.click(holofote)
    expect(botao('Desligar o holofote').getAttribute('aria-pressed')).toBe('true')
    await usuario.click(selo)
    expect(screen.getByRole('img', { name: 'Imagem de teste 1' }).getAttribute('data-tipo')).toBe('miniatura')
    expect(screen.queryByRole('button', { name: 'Desligar o holofote' })).toBeNull()
    // K com Ctrl, ou digitando num campo, nao mexe
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    const campo = document.createElement('input')
    document.body.appendChild(campo)
    fireEvent.keyDown(campo, { key: 'K' })
    campo.remove()
    expect(screen.getByRole('img', { name: 'Imagem de teste 1' }).getAttribute('data-tipo')).toBe('miniatura')
    await usuario.click(screen.getByTitle('Mostrar as marcações do curador nesta imagem'))
    expect(screen.getByRole('img', { name: 'Imagem de teste 1' }).getAttribute('data-tipo')).toBe('marcada')
  })

  it('tela cheia: entra ao abrir, o botao alterna e acompanha o navegador', async () => {
    const usuario = userEvent.setup()
    servidor()
    const entrar = vi.fn(async () => {})
    HTMLElement.prototype.requestFullscreen = entrar
    const sair = vi.fn(async () => {})
    document.exitFullscreen = sair
    abrir(TRES)
    expect(entrar).toHaveBeenCalledTimes(1) // ja abre em tela cheia
    await usuario.click(botao('Tela cheia'))
    expect(entrar).toHaveBeenCalledTimes(2)
    Object.defineProperty(document, 'fullscreenElement', { value: document.body, configurable: true })
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    await usuario.click(botao('Sair da tela cheia'))
    expect(sair).toHaveBeenCalled()
  })

  it('"Ampliar" a descricao: quadro na metade direita e moldura em volta de imagem + quadro', async () => {
    const usuario = userEvent.setup()
    servidor()
    abrir(TRES)
    await usuario.click(botao('ampliar #5'))
    expect(etiquetas[1].ampliado).toBe(true)
    expect(etiquetas[1].areaAmpliada?.()).toEqual({ left: 504, top: 8, width: 488, height: 584 })
    expect(etiquetas[1].areaPropria?.()).toEqual({ left: 8, top: 8, width: 984, height: 584 })
    // sem OHIF nao ha medida da imagem: a moldura conjunta nao aparece
    expect(document.querySelector('.border-amber-300.fixed')).toBeNull()
    await usuario.click(botao('ampliar #5'))
    expect(etiquetas[1].ampliado).toBe(false)
  })
})

describe('baixar, salvar e enviar por e-mail', () => {
  beforeEach(() => {
    window.innerWidth = 500
  })

  it('baixar esta imagem: com as marcacoes ligadas pede a versao marcada', async () => {
    const usuario = userEvent.setup()
    const s = servidor({ 'GET /search/1/preview?com_marcacao=true': { corpo: {} } })
    abrir(TRES)
    await usuario.click(botao('⬇ Esta imagem'))
    await waitFor(() => expect(baixados).toEqual(['radix-imago-1.png']))
    fireEvent.keyDown(document, { key: 'k' })
    await usuario.click(botao('⬇ Esta imagem'))
    await waitFor(() => expect(baixados).toHaveLength(2))
    expect(s.pedidos.map((p) => p.caminho)).toContain('/search/1/preview?com_marcacao=true')
  })

  it('arquivo inexistente: avisa sem "Tentar de novo"; servidor em pane: avisa e permite repetir', async () => {
    const usuario = userEvent.setup()
    let resposta: Rota = { status: 404 }
    servidor({ 'GET /search/2/preview': () => resposta as never })
    abrir(TRES, { indice: 1 })
    await usuario.click(botao('⬇ Esta imagem'))
    expect(await screen.findByText('Não foi possível baixar o arquivo.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
    resposta = { status: 500 }
    await usuario.click(botao('⬇ Esta imagem'))
    expect(await screen.findByText(/o servidor não respondeu/)).toBeTruthy()
    resposta = { corpo: {} }
    await usuario.click(botao('Tentar de novo'))
    await waitFor(() => expect(baixados).toEqual(['radix-imago-2.png']))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('servidor fora do ar: tenta 3 vezes e depois oferece "Tentar de novo"', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    const s = servidor({ 'GET /search/2/preview': 'SEM_CONEXAO' })
    abrir(TRES, { indice: 1 })
    fireEvent.click(botao('⬇ Esta imagem'))
    await vi.advanceTimersByTimeAsync(3000)
    vi.useRealTimers()
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(s.pedidos.filter((p) => p.caminho === '/search/2/preview')).toHaveLength(3)
  })

  it('serie (tomografia): botoes de ZIP das imagens e do DICOM; e-mail so pela prancha', async () => {
    const usuario = userEvent.setup()
    servidor({
      'GET /search/1/serie-info': { corpo: { eh_serie: true, total_cortes: 12 } },
      'GET /search/1/download/imagens.zip': { corpo: {} },
      'GET /search/1/download/dicom.zip': { corpo: {} },
    })
    abrir(TRES)
    await usuario.click(await screen.findByRole('button', { name: '⬇ Baixar imagens (ZIP, 12 cortes)' }))
    await usuario.click(botao('⬇ Baixar DICOM (ZIP)'))
    await waitFor(() => expect(baixados).toEqual(['radix-imago-1-imagens.zip', 'radix-imago-1-dicom.zip']))
    expect(screen.queryByRole('button', { name: '✉ Esta imagem para o meu e-mail' })).toBeNull()
  })

  it('salvar em Minhas imagens: confirma e trava o botao; erros explicam', async () => {
    const usuario = userEvent.setup()
    let resposta: Rota = { status: 409, corpo: { detail: 'Imagem já está salva.' } }
    servidor({ 'POST /saved-images/1': () => resposta as never })
    abrir(TRES)
    await usuario.click(botao('★ Minhas imagens'))
    expect(await screen.findByText('Imagem já está salva.')).toBeTruthy()
    resposta = 'SEM_CONEXAO'
    await usuario.click(botao('★ Minhas imagens'))
    expect(await screen.findByText('Não foi possível salvar a imagem.')).toBeTruthy()
    resposta = { corpo: {} }
    await usuario.click(botao('★ Minhas imagens'))
    expect(await screen.findByText('Imagem salva em "Minhas imagens".')).toBeTruthy()
    expect((botao('✓ Salva') as HTMLButtonElement).disabled).toBe(true)
  })

  it('salvar ou enviar com a sessao vencida leva ao login', async () => {
    const usuario = userEvent.setup()
    servidor({ 'POST /saved-images/1': { status: 401 }, 'POST /search/1/send-email': { status: 401 } })
    abrir(TRES)
    await usuario.click(botao('★ Minhas imagens'))
    await waitFor(() => expect(roteador.push).toHaveBeenCalledWith('/login'))
    await usuario.click(botao('✉ Esta imagem para o meu e-mail'))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, enviar' }))
    await waitFor(() => expect(roteador.push).toHaveBeenCalledTimes(2))
  })

  it('enviar por e-mail: pergunta antes; cancelar nao envia; confirmar envia e mostra a resposta', async () => {
    const usuario = userEvent.setup()
    let resposta: Rota = { corpo: { mensagem: 'Enviada para o seu e-mail.' } }
    const s = servidor({ 'POST /search/1/send-email*': () => resposta as never })
    abrir(TRES)
    await usuario.click(botao('✉ Esta imagem para o meu e-mail'))
    const pergunta = screen.getByRole('alertdialog')
    expect(pergunta.textContent).toContain('Esta imagem vai para o e-mail cadastrado na sua conta.')
    await usuario.click(within(pergunta).getByText('Cancelar', { selector: 'button[data-acao="cancelar"]' }))
    expect(s.alteracoes()).toHaveLength(0)

    await usuario.click(botao('✉ Esta imagem para o meu e-mail'))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, enviar' }))
    expect(await screen.findByText('Enviada para o seu e-mail.')).toBeTruthy()

    resposta = { corpo: {} } // sem mensagem do servidor: texto padrao
    await usuario.click(botao('✉ Esta imagem para o meu e-mail'))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, enviar' }))
    expect(await screen.findByText('Imagem enviada por e-mail.')).toBeTruthy()

    resposta = { status: 502, corpo: { detail: 'SMTP fora do ar' } }
    await usuario.click(botao('✉ Esta imagem para o meu e-mail'))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, enviar' }))
    expect(await screen.findByText('SMTP fora do ar')).toBeTruthy()

    resposta = 'SEM_CONEXAO'
    fireEvent.keyDown(document, { key: 'k' }) // com marcacao: pede a versao marcada
    await usuario.click(botao('✉ Esta imagem para o meu e-mail'))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Sim, enviar' }))
    expect(await screen.findByText('Não foi possível enviar por e-mail.')).toBeTruthy()
    expect(s.alteracoes().at(-1)?.caminho).toBe('/search/1/send-email?com_marcacao=true')
  })
})

describe('girar a imagem (tecla R)', () => {
  beforeEach(() => {
    window.innerWidth = 500
  })
  const giro = () => (document.querySelector('[style*="rotate"]') as HTMLElement | null)?.style.transform ?? ''

  it('estudante: gira so na tela, sem gravar', async () => {
    const s = servidor()
    abrir(TRES)
    await act(async () => {}) // le a sessao
    fireEvent.keyDown(window, { key: 'r' })
    expect(giro()).toBe('rotate(90deg)')
    expect(botao('Gira a imagem 90° só nesta tela (atalho R)')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'R', ctrlKey: true }) // Ctrl+R e do navegador
    expect(giro()).toBe('rotate(90deg)')
    await new Promise((r) => setTimeout(r, 800))
    expect(s.alteracoes()).toHaveLength(0)
  })

  it('curador: dois cliques em "R" viram um pedido de 180°; deu certo, a imagem volta a 0° (arquivo ja girado)', async () => {
    sessao.perfil = 'curador'
    const s = servidor({ 'POST /curation/ficha/1/girar': { corpo: {} } })
    abrir(TRES)
    const r = await screen.findByRole('button', { name: /Grava o giro na imagem/ })
    fireEvent.click(r)
    fireEvent.click(r)
    expect(giro()).toBe('rotate(180deg)')
    await waitFor(() => expect(s.alteracoes()).toEqual([{ metodo: 'POST', caminho: '/curation/ficha/1/girar', corpo: { graus: 180 } }]))
    await waitFor(() => expect(giro()).toBe(''))
  })

  it('curador: o servidor recusa, a imagem volta e o motivo aparece', async () => {
    sessao.perfil = 'administrador'
    let resposta: Rota = { status: 422, corpo: { detail: 'Imagem bloqueada.' } }
    servidor({ 'POST /curation/ficha/1/girar': () => resposta as never })
    abrir(TRES)
    await screen.findByRole('button', { name: /Grava o giro na imagem/ })
    fireEvent.keyDown(window, { key: 'r' })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Imagem bloqueada.')
    expect(giro()).toBe('') // volta a posicao original
    resposta = 'SEM_CONEXAO'
    fireEvent.keyDown(window, { key: 'r' })
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Não foi possível girar a imagem.'))
  })

  it('digitando num campo, "r" nao gira', async () => {
    servidor()
    abrir(TRES)
    const campo = document.createElement('textarea')
    document.body.appendChild(campo)
    fireEvent.keyDown(campo, { key: 'r' })
    campo.remove()
    expect(giro()).toBe('')
  })
})

describe('grade: varias imagens lado a lado (sem OHIF)', () => {
  it('celulas clicaveis, paginas com « », clique duplo abre so a imagem', async () => {
    const usuario = userEvent.setup()
    servidor()
    abrir(TRES)
    expect(cabecalho()).toContain('(imagens 1–2 de 3 selecionadas)')
    const c6 = botao('Ir para imagem #6')
    expect(botao('Ir para imagem #5').getAttribute('aria-pressed')).toBe('true')
    await usuario.click(c6)
    expect(c6.getAttribute('aria-pressed')).toBe('true')
    expect(cabecalho()).toContain('#6')
    fireEvent.keyDown(botao('Ir para imagem #5'), { key: 'Enter' })
    expect(botao('Ir para imagem #5').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('grupos-prancha').textContent).toBe('Todas desta sequência: 3 | As que estão na tela: 2')
    expect(screen.queryByText('anexos')).toBeNull() // anexos so com uma imagem
    await usuario.click(botao(/Próximo estudo/))
    expect(cabecalho()).toContain('(imagens 3–3 de 3 selecionadas)')
    expect(document.querySelectorAll('[data-celula]')).toHaveLength(2) // a segunda fica vazia
    expect((botao(/Próximo estudo/) as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(botao(/Estudo anterior/))
    expect(cabecalho()).toContain('(imagens 1–2 de 3 selecionadas)')
    fireEvent.doubleClick(botao('Ir para imagem #6'))
    expect(cabecalho()).toContain('(2 de 3 selecionadas)')
    expect(screen.getByText('anexos')).toBeTruthy()
  })

  it('layout 2x2 e girar na celula; marcacao ligada mostra a imagem marcada na celula', async () => {
    const usuario = userEvent.setup()
    servidor()
    abrir(TRES, { indice: 2 })
    await usuario.click(botao('layout 2x2'))
    expect(cabecalho()).toContain('(imagens 1–3 de 3 selecionadas)')
    expect(cabecalho()).toContain('#5') // volta ao inicio da pagina
    await usuario.click(screen.getAllByRole('button', { name: 'Gira a imagem 90° só nesta tela (atalho R)' })[1])
    expect(cabecalho()).toContain('#6')
    expect((document.querySelector('[data-celula="1"] [style*="rotate"]') as HTMLElement).style.transform).toBe('rotate(90deg)')
    fireEvent.keyDown(document, { key: 'K' })
    expect(within(document.querySelector('[data-celula="0"]') as HTMLElement).getByRole('img').getAttribute('data-tipo')).toBe('marcada')
  })

  it('ampliar a descricao da imagem da esquerda: o quadro ocupa a celula da direita', async () => {
    const usuario = userEvent.setup()
    servidor()
    abrir(TRES)
    await usuario.click(botao('ampliar #5'))
    expect(etiquetas[1].areaAmpliada?.()).toEqual({ left: 0, top: 0, width: 1000, height: 600 }) // celula vizinha (medida simulada)
    await usuario.click(botao('abrir layouts')) // abrir o seletor de layout fecha o quadro ampliado
    expect(etiquetas[1].ampliado).toBe(false)
    await usuario.click(botao('ampliar #6'))
    expect(etiquetas[2].ampliado).toBe(true)
    // moldura em volta da imagem e do quadro
    await waitFor(() => expect(document.querySelector('div.fixed.border-amber-300')).not.toBeNull())
  })
})

describe('com o OHIF (estudos DICOM)', () => {
  const COM_OHIF = [item(1, true), item(2, true), item(3, true)]

  it('grade no OHIF: um iframe com os estudos da pagina; o OHIF avisa qual estudo esta ativo', async () => {
    servidor()
    abrir(COM_OHIF)
    const quadro = screen.getByTitle('Visualizador com 2 imagens lado a lado') as HTMLIFrameElement
    const url = new URL(quadro.src)
    expect(url.origin).toBe(OHIF)
    expect(url.searchParams.get('StudyInstanceUIDs')).toBe('1.1,1.2')
    expect(url.searchParams.get('radixGrade')).toBe('1x2')
    expect(quadro.src).toContain('StudyInstanceUIDs=1.1,1.2') // virgula sem codificar
    doOhif({ tipo: 'radix-estudo-ativo', estudo: '1.2' })
    expect(cabecalho()).toContain('#6')
    doOhif({ tipo: 'radix-estudo-ativo', estudo: '1.1' }, 'http://outro.site') // outro endereco: ignorado
    doOhif({ tipo: 'outra-coisa', estudo: '1.1' })
    doOhif({ tipo: 'radix-estudo-ativo', estudo: '9.9' }) // estudo que nao esta na lista
    expect(cabecalho()).toContain('#6')
  })

  it('manda as marcacoes ao OHIF: com o texto de cada uma, quais estao visiveis, foco e holofote', async () => {
    const usuario = userEvent.setup()
    servidor()
    abrir(COM_OHIF)
    const ultima = () => enviadas('radix-marcacoes').at(-1)
    expect(ultima().estudos['1.1'][0].texto).toMatch(/^Marcação 1: /)
    expect(ultima().estudos['1.2']).toEqual([])
    expect(ultima().visiveis).toEqual([])
    fireEvent.keyDown(document, { key: 'k' })
    expect(ultima().visiveis).toEqual(['1.1'])
    await usuario.click(botao('focar #5'))
    expect(ultima().foco).toEqual({ uid: '1.1', indice: 0 })
    await usuario.click(botao('desfocar #5'))
    expect(ultima().foco).toBeNull()
    janelaOhif.postMessage.mockClear()
    doOhif({ tipo: 'radix-ohif-pronto' }) // o OHIF acabou de abrir: reenvia
    expect(enviadas('radix-marcacoes')).toHaveLength(1)
    janelaOhif.postMessage.mockClear()
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(enviadas('radix-marcacoes')).toHaveLength(1)
  })

  it('isolar uma marcacao: liga as marcacoes da imagem e pede ao OHIF para isolar', async () => {
    const usuario = userEvent.setup()
    servidor()
    abrir(COM_OHIF)
    await usuario.click(botao('isolar #5'))
    expect(enviadas('radix-isolar')).toEqual([{ tipo: 'radix-isolar', uid: '1.1', indice: 0 }])
    expect(enviadas('radix-marcacoes').at(-1).visiveis).toEqual(['1.1'])
  })

  it('o OHIF informa onde cada imagem esta: o "i" usa essas medidas (ate 25, so numeros validos)', async () => {
    servidor()
    abrir(COM_OHIF)
    doOhif({
      tipo: 'radix-quadros',
      quadros: [{ x: 510, y: 60, w: 480, h: 500 }, { x: 10, y: 60, w: 480, h: 500 }, { x: 'x' }, null],
    })
    // ordenados pela posicao: o primeiro da esquerda e a celula 0
    expect(etiquetas[1].areaPropria?.()).toEqual({ left: 10, top: 60, width: 480, height: 500 })
    expect(etiquetas[2].areaPropria?.()).toEqual({ left: 510, top: 60, width: 480, height: 500 })
    // quadro ampliado da celula da direita fica sobre a celula da esquerda
    expect(etiquetas[2].areaAmpliada?.()).toEqual({ left: 10, top: 60, width: 480, height: 500 })
  })

  it('uma imagem no OHIF: series da pasta (‹ ›), dica do OHIF e quadro ampliado ao lado da imagem', async () => {
    const usuario = userEvent.setup()
    window.innerWidth = 500
    servidor({
      'GET /search/1/series': {
        corpo: {
          series: [
            { series_instance_uid: 's1', series_number: '1', modality: 'CT', total_instancias: 10 },
            { series_instance_uid: 's2', series_number: '2', modality: 'CT', total_instancias: 0 },
          ],
        },
      },
    })
    abrir(COM_OHIF, { descricaoAoLado: true })
    expect(await screen.findByText(/Série 1 de 2/)).toBeTruthy()
    expect(cabecalho()).toContain('(10 cortes)')
    const quadro = () => screen.getByTitle('Visualizador OHIF - Imagem #5') as HTMLIFrameElement
    expect(quadro().src).toBe(`${OHIF}/viewer?StudyInstanceUIDs=1.1&SeriesInstanceUIDs=s1&radixRecolherEstudos=1&radixTeclaR=1`)
    expect((botao('Série (pasta) anterior deste estudo') as HTMLButtonElement).disabled).toBe(true)
    await usuario.click(botao('Próxima série (pasta) deste estudo'))
    expect(quadro().src).toContain('SeriesInstanceUIDs=s2')
    expect(cabecalho()).not.toContain('cortes')
    await usuario.click(botao('Próxima série (pasta) deste estudo')) // ja na ultima
    await usuario.click(botao('Série (pasta) anterior deste estudo'))
    expect(quadro().src).toContain('SeriesInstanceUIDs=s1')
    await usuario.click(botao('Série (pasta) anterior deste estudo'))

    // "Expandir" de Minhas imagens: o quadro da descricao ja abre ampliado
    expect(etiquetas[1].ampliado).toBe(true)
    // sem as medidas do OHIF: metade direita, abaixo da barra do OHIF
    expect(etiquetas[1].areaAmpliada?.()).toEqual({ left: 504, top: 64, width: 488, height: 528 })
    expect(etiquetas[1].areaPropria?.()).toEqual({ left: 8, top: 64, width: 984, height: 528 })
    doOhif({ tipo: 'radix-quadros', quadros: [{ x: 10, y: 20, w: 300, h: 200 }] })
    expect(etiquetas[1].areaAmpliada?.()).toEqual({ left: 318, top: 20, width: 672, height: 200 })
    // espaco reservado a direita para o OHIF centralizar a imagem
    janelaOhif.postMessage.mockClear()
    doOhif({ tipo: 'radix-ohif-pronto' })
    expect(enviadas('radix-marcacoes')[0].espacoDireita).toBe(500)
    await waitFor(() => expect(document.querySelector('div.fixed.border-amber-300')).not.toBeNull())
  })

  it('girar no OHIF (curador): manda o comando ao OHIF e grava; gravou, as marcacoes passam a ser as giradas', async () => {
    window.innerWidth = 500
    sessao.perfil = 'curador'
    const s = servidor({ 'POST /curation/ficha/1/girar': { corpo: {} } })
    abrir(COM_OHIF)
    await screen.findByRole('button', { name: /Grava o giro na imagem/ })
    doOhif({ tipo: 'radix-tecla-girar' }) // tecla R apertada dentro do OHIF
    expect(enviadas('radix-comando')).toEqual([{ tipo: 'radix-comando', comando: 'rotateViewportCW', uid: '1.1' }])
    await waitFor(() => expect(s.alteracoes()).toHaveLength(1))
    // gravou: a ficha passa a ter as marcacoes giradas 90 graus
    const girada = girarMarcacoes([MARCA as never], 90)[0] as unknown as { x: number; y: number }
    await waitFor(() => expect(etiquetas[1].marcacoes?.[0]).toMatchObject({ x: girada.x, y: girada.y }))
    expect([girada.x, girada.y]).not.toEqual([MARCA.x, MARCA.y])
    // o OHIF ja mostra a imagem girada: as marcacoes vao "desgiradas" para casar com o arquivo carregado
    const ultima = enviadas('radix-marcacoes').at(-1).estudos['1.1'][0]
    expect([ultima.x, ultima.y]).toEqual([MARCA.x, MARCA.y].map((v) => expect.closeTo(v, 6)))
  })

  it('girar no OHIF e o servidor recusa: desfaz o giro no OHIF', async () => {
    window.innerWidth = 500
    sessao.perfil = 'suporte'
    servidor({ 'POST /curation/ficha/1/girar': { status: 500 } })
    abrir(COM_OHIF)
    await screen.findByRole('button', { name: /Grava o giro na imagem/ })
    fireEvent.keyDown(window, { key: 'r' })
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Não foi possível girar a imagem.')
    expect(enviadas('radix-comando').map((m) => m.comando)).toEqual(['rotateViewportCW', 'rotateViewportCCW'])
  })
})
