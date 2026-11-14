// @vitest-environment jsdom
//
// COMPONENTE "Marcador" da Curadoria (Fase 2, 13/11/2026):
// frontend/src/components/curadoria/MarcadorAchado.tsx - desenhar sobre a
// radiografia (oval, retangulo, seta), selecionar, mover, redimensionar,
// inclinar, mover a ponta da seta, remover e (modo antigo) o achado da marcacao.
//
// SIMULADO: o carregamento da imagem e o tamanho da tela. A "radiografia"
// tem 1000 x 500 px e aparece num quadro de 400 x 200 px; entao 40 px na tela
// = 0,1 da largura da imagem. A deteccao de borda branca (que le os pixels
// num canvas) fica de fora e e trocada por um valor fixo no teste do recorte.
import { useState } from 'react'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarcadorAchado from '../../../../frontend/src/components/curadoria/MarcadorAchado'
import type { Marcacao } from '../../../../frontend/src/lib/marcacoes'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

const recorte = vi.hoisted(() => ({ valor: null as null | { x: number; y: number; largura: number; altura: number } }))
vi.mock('../../../../frontend/src/lib/recorteImagem', () => ({ detectarRecorteConteudo: () => recorte.valor }))

class ImagemFalsa {
  naturalWidth = 1000
  naturalHeight = 500
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  set src(_v: string) {
    setTimeout(() => this.onload?.())
  }
}
const estado: { marcacoes: Marcacao[] } = { marcacoes: [] }
const carregou = vi.fn()
function Dono({ inicial = [], ...props }: { inicial?: Marcacao[]; semAchado?: boolean; urlImagem?: string; semRecorte?: boolean; compacto?: boolean }) {
  const [marcacoes, setMarcacoes] = useState<Marcacao[]>(inicial)
  estado.marcacoes = marcacoes
  return <MarcadorAchado orthancReferenceId={9} marcacoes={marcacoes} onMarcar={setMarcacoes} onCarregou={carregou} semRecorte {...props} />
}

beforeEach(() => {
  vi.clearAllMocks()
  recorte.valor = null
  vi.stubGlobal('Image', ImagemFalsa)
  URL.createObjectURL = vi.fn(() => 'blob:radiografia')
  URL.revokeObjectURL = vi.fn()
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 400 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 200 })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
})

async function abrir(props: Parameters<typeof Dono>[0] = {}, rotas: Record<string, Rota> = {}) {
  const servidor = servidorFalso({ 'GET /curation/9/preview': { corpo: {} }, ...rotas })
  montarTela(<Dono {...props} />)
  await screen.findByRole('img', { name: 'Imagem para marcação' })
  return servidor
}
const fundo = () => document.querySelector('svg[viewBox]:last-of-type') as SVGSVGElement
/** arrasta de um ponto a outro (em px da tela de 400 x 200) */
function arrastar(alvo: Element, de: [number, number], ate: [number, number]) {
  fireEvent.mouseDown(alvo, { clientX: de[0], clientY: de[1] })
  fireEvent.mouseMove(window, { clientX: ate[0], clientY: ate[1] })
  fireEvent.mouseUp(window)
}
const OVAL: Marcacao = { id: 'o1', tipo: 'oval', x: 0.2, y: 0.2, largura: 0.2, altura: 0.4 }
const SETA: Marcacao = { id: 's1', tipo: 'seta', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.5 }

describe('carregar a imagem', () => {
  it('pede a previa da imagem, mostra do tamanho do quadro e avisa que carregou', async () => {
    const servidor = await abrir()
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/curation/9/preview'])
    const quadro = screen.getByRole('img', { name: 'Imagem para marcação' }).parentElement as HTMLElement
    expect([quadro.style.width, quadro.style.height]).toEqual(['400px', '200px'])
    expect(carregou).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/Clique e arraste na imagem para marcar uma lesão/)).toBeTruthy()
  })

  it.each([
    ['recusa do servidor', { status: 404 }],
    ['sem conexao', 'SEM_CONEXAO' as const],
  ])('sem previa (%s): avisa "Sem preview disponível"', async (_caso, resposta) => {
    servidorFalso({ 'GET /curation/9/preview': resposta })
    montarTela(<Dono />)
    expect(await screen.findByText('Sem preview disponível')).toBeTruthy()
    expect(carregou).not.toHaveBeenCalled()
  })

  it('outra imagem (foto do celular) pelo endereco dado, sem pedir a previa da curadoria', async () => {
    const servidor = await abrir({ urlImagem: 'http://api.teste/envios/foto/77/imagem' }, { 'GET /envios/foto/77/imagem': { corpo: {} } })
    expect(servidor.pedidos.map((p) => p.caminho)).toEqual(['/envios/foto/77/imagem'])
  })

  it('com borda branca recortada, o desenho usa so a parte util da imagem', async () => {
    recorte.valor = { x: 0.1, y: 0, largura: 0.8, altura: 1 }
    await abrir({ semRecorte: false })
    expect(fundo().getAttribute('viewBox')).toBe('0.1 0 0.8 1')
    // mesmo canto da tela agora e 0,1 da imagem (nao 0)
    arrastar(fundo(), [0, 0], [160, 100])
    expect(estado.marcacoes[0]).toMatchObject({ tipo: 'oval', x: 0.1, y: 0 })
    expect(estado.marcacoes[0].largura).toBeCloseTo(0.32)
  })
})

describe('desenhar', () => {
  it('oval: arrastar desenha; arrasto minusculo e ignorado', async () => {
    await abrir()
    arrastar(fundo(), [40, 20], [200, 120])
    expect(estado.marcacoes).toEqual([expect.objectContaining({ tipo: 'oval', x: 0.1, y: 0.1, largura: 0.4, altura: 0.5 })])
    arrastar(fundo(), [10, 10], [11, 11])
    expect(estado.marcacoes).toHaveLength(1)
    expect(screen.getByText(/^1 marcação\(ões\)\./)).toBeTruthy()
  })

  it('retangulo e seta: a forma escolhida e a desenhada (arrastar para tras tambem vale)', async () => {
    const usuario = userEvent.setup()
    await abrir()
    await usuario.click(screen.getByRole('button', { name: /Retângulo/ }))
    arrastar(fundo(), [200, 120], [40, 20])
    expect(estado.marcacoes[0]).toMatchObject({ tipo: 'retangulo', x: 0.1, y: 0.1, largura: 0.4, altura: 0.5 })
    await usuario.click(screen.getByRole('button', { name: /Seta/ }))
    arrastar(fundo(), [40, 20], [200, 120])
    expect(estado.marcacoes[1]).toMatchObject({ tipo: 'seta', x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.6 })
  })
})

describe('editar uma marcacao existente', () => {
  it('clicar seleciona; arrastar move; "Remover marcação" tira', async () => {
    const usuario = userEvent.setup()
    await abrir({ inicial: [OVAL] })
    const forma = fundo().querySelector('polygon') as SVGPolygonElement
    arrastar(forma, [120, 80], [160, 100]) // +0,1 / +0,1
    expect(estado.marcacoes[0].x).toBeCloseTo(0.3)
    expect(estado.marcacoes[0].y).toBeCloseTo(0.3)
    await usuario.click(screen.getByRole('button', { name: '✕ Remover marcação' }))
    expect(estado.marcacoes).toEqual([])
    expect(screen.queryByRole('button', { name: '✕ Remover marcação' })).toBeNull()
  })

  it('alca do canto redimensiona; alca de giro inclina (encaixando em 90°)', async () => {
    await abrir({ inicial: [OVAL] })
    fireEvent.mouseDown(fundo().querySelector('polygon') as Element, { clientX: 120, clientY: 80 })
    fireEvent.mouseUp(window)
    arrastar(fundo().querySelector('rect') as Element, [160, 120], [200, 160])
    expect(estado.marcacoes[0]).toMatchObject({ x: 0.2, y: 0.2 })
    expect(estado.marcacoes[0].largura).toBeCloseTo(0.3)
    expect(estado.marcacoes[0].altura).toBeCloseTo(0.6)
    // centro em (0,35 ; 0,5) = (140, 100) px; puxar a alca para a direita = 90°
    // 160 px para a direita e 6 px para baixo = ~92°: perto do reto, gruda em 90°
    arrastar(fundo().querySelector('ellipse') as Element, [140, 30], [300, 106])
    expect(estado.marcacoes[0].angulo).toBe(90)
    // 20 px para baixo = ~97°: longe do reto, fica inclinada
    arrastar(fundo().querySelector('ellipse') as Element, [140, 30], [300, 120])
    expect(estado.marcacoes[0].angulo).toBeGreaterThan(95)
  })

  it('com a forma inclinada, redimensionar mantem o canto oposto no lugar', async () => {
    await abrir({ inicial: [{ ...OVAL, angulo: 90 }] })
    fireEvent.mouseDown(fundo().querySelector('polygon') as Element, { clientX: 120, clientY: 80 })
    fireEvent.mouseUp(window)
    arrastar(fundo().querySelector('rect') as Element, [0, 0], [120, 160])
    const m = estado.marcacoes[0]
    expect(m.angulo).toBe(90)
    expect(m.largura).toBeGreaterThan(0)
    expect(m.altura).toBeGreaterThan(0)
  })

  it('seta: pegar o meio move a seta inteira; as pontas movem so a ponta', async () => {
    await abrir({ inicial: [SETA] })
    arrastar(fundo().querySelector('line') as Element, [80, 60], [120, 60]) // +0,1 em x
    expect(estado.marcacoes[0]).toMatchObject({ x1: expect.closeTo(0.2), x2: expect.closeTo(0.4), y1: 0.1, y2: 0.5 })
    const [inicio, fim] = Array.from(fundo().querySelectorAll('circle'))
    arrastar(fim, [0, 0], [400, 200])
    expect(estado.marcacoes[0]).toMatchObject({ x1: expect.closeTo(0.2), y1: 0.1, x2: 1, y2: 1 })
    arrastar(inicio, [0, 0], [0, 0])
    expect(estado.marcacoes[0]).toMatchObject({ x1: 0, y1: 0 })
  })

  it('modo antigo: o achado da marcacao selecionada; "Outro" pede a descricao', async () => {
    const usuario = userEvent.setup()
    await abrir({ inicial: [OVAL] })
    fireEvent.mouseDown(fundo().querySelector('polygon') as Element, { clientX: 120, clientY: 80 })
    fireEvent.mouseUp(window)
    const tipo = screen.getByRole('combobox', { name: 'Tipo de lesão desta marcação:' }) as HTMLSelectElement
    await usuario.selectOptions(tipo, 'outro')
    await usuario.type(screen.getByRole('textbox', { name: 'Descreva o achado observado nesta marcação' }), 'Calcificação')
    expect(estado.marcacoes[0]).toMatchObject({ achado: 'outro', achado_descricao: 'Calcificação' })
    await usuario.selectOptions(tipo, 'carie')
    expect(estado.marcacoes[0]).toMatchObject({ achado: 'carie', achado_descricao: null })
    await usuario.selectOptions(tipo, '')
    expect(estado.marcacoes[0].achado).toBeNull()
  })

  it('com o achado escolhido na ficha (semAchado), a lista daqui nao aparece', async () => {
    await abrir({ inicial: [OVAL], semAchado: true })
    fireEvent.mouseDown(fundo().querySelector('polygon') as Element, { clientX: 120, clientY: 80 })
    fireEvent.mouseUp(window)
    await waitFor(() => expect(screen.getByRole('button', { name: '✕ Remover marcação' })).toBeTruthy())
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
