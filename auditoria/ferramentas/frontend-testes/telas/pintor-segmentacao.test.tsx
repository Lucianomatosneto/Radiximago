// @vitest-environment jsdom
//
// COMPONENTE "Pintura de estruturas" da Curadoria (Fase 2, 13/11/2026):
// frontend/src/components/segmentacao/PintorSegmentacao.tsx - pintar dentes,
// canais, lesoes... sobre a radiografia (mascaras para IA). Confere: criar,
// listar, apagar e trocar a cor das estruturas; as ferramentas (pontos,
// pincel, pincel inteligente, varinha, laco, apagar); preencher buracos e
// suavizar; desfazer/refazer; zoom e arrastar a imagem; atalhos de teclado;
// e o que vai para o servidor em cada acao.
//
// SIMULADO (o navegador de teste nao desenha):
// - a "radiografia" tem 100 x 50 px: fundo claro (230), um "dente" escuro
//   (60) de 20 x 20 px em x 20..39, y 10..29, e em volta dele uma aureola
//   cinza (120) ate 30 x 30 px. Ela aparece num quadro de 400 x 200 px:
//   4 px na tela = 1 px da imagem;
// - o canvas guarda os pixels numa memoria simples; a mascara enviada ao
//   servidor vira "data:image/png;pixels=N" (N = pixels pintados), para o
//   teste conferir o conteudo sem um PNG de verdade;
// - os algoritmos de pintura (lib/pinturaAlgoritmos.ts) sao os REAIS.
// FICA DE FORA (Playwright/a mao): a aparencia da pintura na tela, o PNG
// real e o desempenho com radiografias grandes.
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PintorSegmentacao from '../../../../frontend/src/components/segmentacao/PintorSegmentacao'
import { montarTela, servidorFalso, type Rota } from './apoio/montar'

// ---------- radiografia e canvas simulados ----------
const L = 100
const A = 50
const noDente = (x: number, y: number) => x >= 20 && x < 40 && y >= 10 && y < 30
const naAureola = (x: number, y: number) => x >= 15 && x < 45 && y >= 5 && y < 35 // em volta do dente
interface Folha {
  pixels: Uint8ClampedArray
  fonte: string
}
const folhas = new WeakMap<HTMLCanvasElement, Folha>()
function folha(c: HTMLCanvasElement): Folha {
  let f = folhas.get(c)
  if (!f || f.pixels.length !== c.width * c.height * 4) {
    f = { pixels: new Uint8ClampedArray(c.width * c.height * 4), fonte: f?.fonte ?? '' }
    folhas.set(c, f)
  }
  return f
}
const pintados = (c: HTMLCanvasElement) => {
  const p = folha(c).pixels
  let n = 0
  for (let i = 3; i < p.length; i += 4) if (p[i] > 0) n++
  return n
}
function contexto(this: HTMLCanvasElement) {
  const c = this
  return {
    drawImage: (img: { src: string }) => {
      folha(c).fonte = img.src
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => {
      const d = new Uint8ClampedArray(w * h * 4)
      const fonte = folha(c).fonte
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const o = (y * w + x) * 4
          if (fonte.startsWith('blob:')) {
            const g = noDente(x, y) ? 60 : naAureola(x, y) ? 120 : 230
            d[o] = d[o + 1] = d[o + 2] = g
            d[o + 3] = 255
          } else if (fonte === 'data:mascara;bloco' && x < 10 && y < 10) {
            d[o + 3] = 255 // estrutura salva: um quadrado de 10 x 10 no canto
          }
        }
      return { data: d, width: w, height: h }
    },
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: (img: { width: number; height: number; data: Uint8ClampedArray }, x0: number, y0: number) => {
      const f = folha(c)
      for (let y = 0; y < img.height; y++)
        for (let x = 0; x < img.width; x++) {
          const de = (y * img.width + x) * 4
          const para = ((y0 + y) * c.width + (x0 + x)) * 4
          f.pixels.set(img.data.subarray(de, de + 4), para)
        }
    },
  }
}
class ImagemFalsa {
  naturalWidth = L
  naturalHeight = A
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private _src = ''
  get src() {
    return this._src
  }
  set src(v: string) {
    this._src = v
    setTimeout(() => (v.includes('quebrada') ? this.onerror?.() : this.onload?.()))
  }
}

// ---------- servidor ----------
const SEG = { id: 7, curation_id: 1, nome: 'Dente 36', dente: 36, cor: '#56b4e9', largura: L, altura: A, mascara: 'data:mascara;bloco', atualizado_em: null }
function servidor(itens: unknown[] = [], extras: Record<string, Rota> = {}) {
  return servidorFalso({
    'GET /curation/55/preview': { corpo: {} },
    'GET /segmentacoes/ficha/1': { corpo: { itens } },
    'POST /segmentacoes/ficha/1': (p) => ({ corpo: { ...SEG, id: 8, ...(p.corpo as object), mascara: 'data:vazia' } }),
    'PATCH /segmentacoes/*': { corpo: {} },
    'DELETE /segmentacoes/*': { status: 204 },
    ...extras,
  })
}
async function montar(itens: unknown[] = [SEG], extras: Record<string, Rota> = {}, dentesFicha = [36, 37]) {
  const s = servidor(itens, extras)
  const tela = montarTela(<PintorSegmentacao curationId={1} orthancReferenceId={55} dentesFicha={dentesFicha} />)
  await screen.findByRole('img', { name: 'Radiografia para pintar estruturas' })
  await waitFor(() => expect(screen.queryByText('Carregando…')).toBeNull())
  const camada = document.querySelector('[data-pintura]') as HTMLElement
  fireEvent.pointerEnter(camada) // atalhos so valem com o mouse sobre a imagem
  return { s, tela, camada }
}
/** ponto da IMAGEM (0..100, 0..50) -> posicao na tela */
const tela = (x: number, y: number) => ({ clientX: x * 4 + 2, clientY: y * 4 + 2 })
function arrastar(camada: HTMLElement, pontos: [number, number][], botao = 0) {
  fireEvent.pointerDown(camada, { button: botao, pointerId: 1, ...tela(...pontos[0]) })
  for (const p of pontos.slice(1)) fireEvent.pointerMove(camada, { pointerId: 1, ...tela(...p) })
  fireEvent.pointerUp(camada, { pointerId: 1 })
}
const clicar = (camada: HTMLElement, x: number, y: number) => arrastar(camada, [[x, y]])
const tecla = (key: string, extra: object = {}) => fireEvent.keyDown(window, { key, ...extra })
const contagem = () => screen.getByText(/pixels pintados/).textContent
const ultimaMascara = (s: ReturnType<typeof servidor>) =>
  (s.alteracoes().filter((p) => p.metodo === 'PATCH' && (p.corpo as { mascara?: string }).mascara).at(-1)?.corpo as { mascara: string }).mascara
const ferramenta = (nome: string) => screen.getByRole('button', { name: new RegExp(`^${nome}\\s*[A-Z]$`) })
/** espera a gravacao anterior terminar (a contagem na tela so se atualiza quando o estado muda) */
const gravou = () =>
  waitFor(() => {
    expect(screen.queryByText('…')).toBeNull()
    expect(screen.getByText('✓')).toBeTruthy()
  })

beforeEach(() => {
  vi.stubGlobal('Image', ImagemFalsa)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(contexto as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    return `data:image/png;pixels=${pintados(this)}`
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200)
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
  HTMLElement.prototype.setPointerCapture = vi.fn()
  URL.createObjectURL = vi.fn(() => 'blob:radiografia')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('carregar a imagem e as estruturas', () => {
  it('radiografia nao encontrada: avisa', async () => {
    servidorFalso({ 'GET /curation/55/preview': { status: 404 }, 'GET /segmentacoes/ficha/1': { corpo: { itens: [] } } })
    montarTela(<PintorSegmentacao curationId={1} orthancReferenceId={55} dentesFicha={[]} />)
    expect(await screen.findByText('Não foi possível carregar a imagem.')).toBeTruthy()
  })

  it('arquivo da radiografia corrompido: avisa', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:quebrada')
    servidor()
    montarTela(<PintorSegmentacao curationId={1} orthancReferenceId={55} dentesFicha={[]} />)
    expect(await screen.findByText('Não foi possível carregar a imagem.')).toBeTruthy()
  })

  it('sem estruturas: convida a criar; a lista diz "Nenhuma"', async () => {
    await montar([])
    expect(screen.getByText('Crie uma estrutura ao lado para começar a pintar.')).toBeTruthy()
    expect(screen.getByText('Nenhuma estrutura ainda.')).toBeTruthy()
    expect(screen.getByText('Estruturas pintadas (0)')).toBeTruthy()
  })

  it('estrutura salva: aparece na lista, ja selecionada, com os pixels da mascara; mascara ilegivel vira vazia', async () => {
    await montar([SEG, { ...SEG, id: 9, nome: 'Canal radicular', mascara: 'data:quebrada' }])
    expect(screen.getByText('Estruturas pintadas (2)')).toBeTruthy()
    expect(contagem()).toBe('Canal radicular: 0 pixels pintados') // a ultima fica ativa
    tecla('1') // tecla 1 escolhe a primeira
    expect(contagem()).toBe('Dente 36: 100 pixels pintados')
  })

  it('erro ao listar: mostra o motivo do servidor', async () => {
    servidor([], { 'GET /segmentacoes/ficha/1': { status: 500, corpo: { detail: 'Banco indisponível.' } } })
    montarTela(<PintorSegmentacao curationId={1} orthancReferenceId={55} dentesFicha={[]} />)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Banco indisponível.')
  })
})

describe('criar, trocar a cor e apagar estruturas', () => {
  it('dentes da ficha vem primeiro; criar manda nome, dente, proxima cor livre e mascara vazia', async () => {
    const usuario = userEvent.setup()
    const { s } = await montar()
    const dente = screen.getByRole('combobox', { name: 'Dente (FDI)' }) as HTMLSelectElement
    expect([...dente.options].slice(0, 3).map((o) => o.textContent)).toEqual(['—', '36', '37'])
    await usuario.click(screen.getByRole('button', { name: '+ Criar "Dente 36"' }))
    await waitFor(() => expect(contagem()).toBe('Dente 36: 0 pixels pintados'))
    expect(s.alteracoes()[0]).toEqual({
      metodo: 'POST',
      caminho: '/segmentacoes/ficha/1',
      corpo: { nome: 'Dente 36', dente: 36, cor: '#e69f00', mascara: 'data:image/png;pixels=0' },
    })
    await usuario.selectOptions(screen.getByRole('combobox', { name: 'Tipo de estrutura' }), 'lesao')
    await usuario.selectOptions(dente, '')
    await usuario.click(screen.getByRole('button', { name: '+ Criar "Lesão"' }))
    await waitFor(() => expect(s.alteracoes()).toHaveLength(2))
    expect(s.alteracoes()[1].corpo).toMatchObject({ nome: 'Lesão', dente: null })
  })

  it('criar falha: explica; servidor fora do ar: "Sem conexão"', async () => {
    const usuario = userEvent.setup()
    await montar([], { 'POST /segmentacoes/ficha/1': { status: 403, corpo: { detail: 'Só o curador pinta.' } } }, [])
    await usuario.click(screen.getByRole('button', { name: '+ Criar "Dente"' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Só o curador pinta.')
    servidorFalso({ 'POST /segmentacoes/ficha/1': 'SEM_CONEXAO' })
    await usuario.click(screen.getByRole('button', { name: '+ Criar "Dente"' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Sem conexão com o servidor. Tente de novo.'))
  })

  it('cor: muda na hora e grava ao sair do campo; erro ao gravar aparece', async () => {
    const { s } = await montar([SEG], { 'PATCH /segmentacoes/7': { status: 500 } })
    const cor = screen.getByLabelText('Cor da estrutura') as HTMLInputElement
    fireEvent.change(cor, { target: { value: '#ff0000' } })
    expect(cor.value).toBe('#ff0000')
    fireEvent.blur(cor)
    await waitFor(() => expect(s.alteracoes()).toEqual([{ metodo: 'PATCH', caminho: '/segmentacoes/7', corpo: { cor: '#ff0000' } }]))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Não foi possível salvar a pintura.')
  })

  it('apagar pede confirmacao ("Apagar?"); erro mantem a estrutura', async () => {
    const usuario = userEvent.setup()
    let resposta: Rota = { status: 500, corpo: { detail: 'Não deu.' } }
    const { s } = await montar([SEG], { 'DELETE /segmentacoes/7': () => resposta as never })
    await usuario.click(screen.getByRole('button', { name: 'Apagar estrutura' }))
    await usuario.click(screen.getByRole('button', { name: 'Apagar?' }))
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Não deu.')
    expect(screen.getByText('Estruturas pintadas (1)')).toBeTruthy()
    resposta = { status: 204 }
    await usuario.click(screen.getByRole('button', { name: 'Apagar estrutura' }))
    await usuario.click(screen.getByRole('button', { name: 'Apagar?' }))
    await waitFor(() => expect(screen.getByText('Estruturas pintadas (0)')).toBeTruthy())
    expect(s.alteracoes().filter((p) => p.metodo === 'DELETE')).toHaveLength(2)
    expect(screen.queryByText(/pixels pintados/)).toBeNull()
  })

  it('esconder e mostrar a pintura; opacidade e contorno mudam o desenho', async () => {
    const usuario = userEvent.setup()
    await montar()
    const folhaCor = document.querySelector('canvas') as HTMLCanvasElement
    expect(folhaCor.style.opacity).toBe('0.45')
    expect(pintados(folhaCor)).toBe(100) // quadrado 10 x 10 cheio
    fireEvent.change(screen.getByRole('slider'), { target: { value: '70' } })
    expect(folhaCor.style.opacity).toBe('0.7')
    expect(screen.getByText('Opacidade da pintura: 70%')).toBeTruthy()
    tecla('c') // contorno: so a borda do quadrado
    await waitFor(() => expect(folhaCor.style.opacity).toBe('1'))
    expect(screen.getByRole('button', { name: /Contorno/ }).className).toContain('border-teal-500')
    await usuario.click(screen.getByRole('button', { name: 'Preenchido' }))
    await usuario.click(screen.getByRole('button', { name: /^Contorno/ }))
    await usuario.click(screen.getByRole('button', { name: 'Esconder' }))
    expect(folhaCor.style.opacity).toBe('0')
    await usuario.click(screen.getByRole('button', { name: 'Mostrar' }))
    expect(folhaCor.style.opacity).toBe('1')
  })
})

describe('ferramentas de pintura', () => {
  it('varinha (W): um clique pinta o dente inteiro (400 px) e grava; no fundo, avisa que ficou grande demais', async () => {
    const { s, camada } = await montar([SEG])
    tecla('w')
    expect(ferramenta('Varinha').getAttribute('aria-pressed')).toBe('true')
    clicar(camada, 30, 20)
    expect(contagem()).toBe('Dente 36: 500 pixels pintados') // 100 que ja tinha + 400 do dente
    await waitFor(() => expect(ultimaMascara(s)).toBe('data:image/png;pixels=500'))
    await waitFor(() => expect(screen.getByText('✓')).toBeTruthy())
    clicar(camada, 80, 40)
    expect(screen.getByRole('status').textContent).toMatch(/A região ficou grande demais/)
    expect(contagem()).toBe('Dente 36: 500 pixels pintados')
  })

  it('varinha: mexer na tolerancia depois do clique refaz a regiao (pega a aureola) e grava de novo', async () => {
    const { s, camada } = await montar([SEG])
    tecla('w')
    clicar(camada, 30, 20)
    await gravou()
    const tolerancia = () => screen.getByText(/Tolerância de densidade/).querySelector('input') as HTMLInputElement
    fireEvent.change(tolerancia(), { target: { value: '70' } }) // 60 -> 120 cabe: entra a aureola
    expect(screen.getByText('Tolerância de densidade: 70')).toBeTruthy()
    await waitFor(() => expect(ultimaMascara(s)).toBe('data:image/png;pixels=1000'), { timeout: 2000 }) // 100 + 30 x 30
    expect(contagem()).toBe('Dente 36: 1.000 pixels pintados') // numero no formato brasileiro
    fireEvent.change(tolerancia(), { target: { value: '20' } }) // volta a so o dente
    await waitFor(() => expect(ultimaMascara(s)).toBe('data:image/png;pixels=500'), { timeout: 2000 })
  })

  it('apagar (E) com a varinha tira o que estava pintado; Ctrl+Z desfaz e Ctrl+Shift+Z refaz', async () => {
    const { s, camada } = await montar([SEG])
    tecla('w')
    clicar(camada, 30, 20)
    await gravou()
    tecla('e')
    expect(screen.getByRole('button', { name: /Apagando/ }).getAttribute('aria-pressed')).toBe('true')
    clicar(camada, 30, 20)
    expect(contagem()).toBe('Dente 36: 100 pixels pintados')
    await gravou()
    tecla('z', { ctrlKey: true })
    expect(contagem()).toBe('Dente 36: 500 pixels pintados')
    await gravou()
    tecla('Z', { ctrlKey: true, shiftKey: true })
    expect(contagem()).toBe('Dente 36: 100 pixels pintados')
    await gravou()
    tecla('z', { metaKey: true }) // Cmd+Z no Mac
    await gravou()
    tecla('y', { ctrlKey: true })
    expect(contagem()).toBe('Dente 36: 100 pixels pintados')
    await gravou()
    // desfazer e depois pintar outra coisa: o "refazer" antigo se perde
    tecla('z', { ctrlKey: true })
    await gravou()
    tecla('e')
    tecla('b')
    arrastar(camada, [[80, 40], [85, 40]])
    await gravou()
    const aposNovaPincelada = contagem()
    tecla('y', { ctrlKey: true })
    expect(contagem()).toBe(aposNovaPincelada)
    expect(ultimaMascara(s)).toBe(`data:image/png;pixels=${aposNovaPincelada?.match(/: (\d+)/)?.[1]}`)
  })

  it('pincel (B): pinta por onde passa e mostra o contorno do pincel; botoes ↶ ↷', async () => {
    const usuario = userEvent.setup()
    const { s, camada } = await montar([SEG])
    tecla('b')
    expect(screen.getByText(/Tamanho do pincel: 22 px/)).toBeTruthy()
    tecla(']')
    tecla('[')
    tecla('[')
    expect(screen.getByText(/Tamanho do pincel: 18 px/)).toBeTruthy()
    fireEvent.pointerMove(camada, tela(60, 40))
    expect(document.querySelector('.rounded-full.pointer-events-none[style*="18px"]')).not.toBeNull() // contorno do pincel
    arrastar(camada, [[60, 40], [70, 40], [80, 40]])
    const depois = Number(contagem()?.match(/: (\d+)/)?.[1])
    expect(depois).toBeGreaterThan(100)
    await waitFor(() => expect(ultimaMascara(s)).toBe(`data:image/png;pixels=${depois}`))
    await usuario.click(screen.getByRole('button', { name: 'Desfazer a última pincelada (Ctrl+Z)' }))
    expect(contagem()).toBe('Dente 36: 100 pixels pintados')
    await usuario.click(screen.getByRole('button', { name: 'Refazer (Ctrl+Shift+Z)' }))
    expect(contagem()).toBe(`Dente 36: ${depois} pixels pintados`)
    fireEvent.pointerLeave(camada)
    expect(document.querySelector('.rounded-full.pointer-events-none[style*="18px"]')).toBeNull()
  })

  it('pincel inteligente (S): mesmo passando pelo fundo, so pinta o que e parecido com o dente', async () => {
    const { camada } = await montar([{ ...SEG, mascara: 'data:vazia' }])
    tecla('s')
    expect(document.querySelector('.rounded-full .bg-white')).toBeNull() // ainda sem cursor
    for (let i = 0; i < 8; i++) tecla(']') // pincel bem grande: 54 px na tela
    arrastar(camada, [[30, 20], [45, 20], [60, 20], [90, 20]])
    const n = Number(contagem()?.match(/: (\d+)/)?.[1])
    expect(n).toBeGreaterThan(50)
    expect(n).toBeLessThanOrEqual(400) // nao passou do dente
    // o mesmo traco com o pincel comum invade o fundo
    tecla('z', { ctrlKey: true })
    tecla('b')
    arrastar(camada, [[30, 20], [45, 20], [60, 20], [90, 20]])
    expect(Number(contagem()?.match(/: (\d+)/)?.[1])).toBeGreaterThan(n)
  })

  it('laco (L): contorna e preenche o interior; com 2 pontos so nao pinta', async () => {
    const { s, camada } = await montar([{ ...SEG, mascara: 'data:vazia' }])
    tecla('l')
    arrastar(camada, [[50, 5], [60, 5]])
    expect(contagem()).toBe('Dente 36: 0 pixels pintados')
    arrastar(camada, [[50, 5], [50.1, 5], [70, 5], [70, 25], [50, 25]])
    const n = Number(contagem()?.match(/: (\d+)/)?.[1])
    expect(n).toBeGreaterThan(300) // ~20 x 20
    expect(n).toBeLessThan(500)
    await waitFor(() => expect(ultimaMascara(s)).toBe(`data:image/png;pixels=${n}`))
  })

  it('pontos (P): marca, avisa com menos de 3, preenche, arrasta um ponto e refaz, Backspace e Esc', async () => {
    const usuario = userEvent.setup()
    const { s, camada } = await montar([{ ...SEG, mascara: 'data:vazia' }])
    tecla('p')
    expect(screen.getByText('Clique na borda da estrutura para marcar os pontos')).toBeTruthy()
    clicar(camada, 20, 10)
    clicar(camada, 39, 10)
    expect(screen.getByText('2 pontos')).toBeTruthy()
    tecla('Enter')
    expect(screen.getByRole('status').textContent).toBe('Marque pelo menos 3 pontos na borda da estrutura.')
    clicar(camada, 39, 29)
    clicar(camada, 20, 29)
    expect(screen.getByText('4 pontos')).toBeTruthy()
    expect(document.querySelectorAll('svg circle')).toHaveLength(4)
    expect(document.querySelector('svg polygon')).not.toBeNull()
    await usuario.click(screen.getByRole('button', { name: /^Preencher Enter/ }))
    const n = Number(contagem()?.match(/: (\d+)/)?.[1])
    expect(n).toBeGreaterThan(200)
    expect(screen.getByRole('button', { name: /Preencher de novo/ })).toBeTruthy()
    // arrastar o ultimo ponto para fora (perto de um ponto existente: pega ele)
    arrastar(camada, [[20, 29], [10, 45]])
    const m = Number(contagem()?.match(/: (\d+)/)?.[1])
    expect(m).not.toBe(n)
    // sem "ajustar a densidade", a pintura segue so a curva dos pontos
    await usuario.click(screen.getByRole('checkbox', { name: /Ajustar à densidade/ }))
    await waitFor(() => expect(ultimaMascara(s)).toBe(`data:image/png;pixels=${Number(contagem()?.match(/: (\d+)/)?.[1])}`))
    tecla('Backspace')
    expect(screen.getByText('3 pontos')).toBeTruthy()
    tecla('Escape')
    expect(screen.getByText('Clique na borda da estrutura para marcar os pontos')).toBeTruthy()
    expect(contagem()).not.toBe('Dente 36: 0 pixels pintados') // a pintura fica
    clicar(camada, 20, 10)
    await usuario.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(screen.getByText('Clique na borda da estrutura para marcar os pontos')).toBeTruthy()
  })

  it('preencher buracos e suavizar bordas: cada um grava e pode ser desfeito', async () => {
    const usuario = userEvent.setup()
    const { s } = await montar([SEG])
    await usuario.click(screen.getByRole('button', { name: 'Preencher buracos' }))
    await waitFor(() => expect(ultimaMascara(s)).toBe('data:image/png;pixels=100')) // quadrado cheio: nada muda
    await usuario.click(screen.getByRole('button', { name: 'Suavizar bordas' }))
    await waitFor(() => expect(s.alteracoes().filter((p) => p.metodo === 'PATCH')).toHaveLength(2))
    const suavizado = Number(contagem()?.match(/: (\d+)/)?.[1])
    expect(suavizado).toBeLessThan(100) // os cantos do quadrado arredondam
    tecla('z', { ctrlKey: true })
    expect(contagem()).toBe('Dente 36: 100 pixels pintados')
  })

  it('sem estrutura escolhida, clicar na imagem nao pinta nada; ferramentas pelos botoes', async () => {
    const usuario = userEvent.setup()
    const { s, camada } = await montar([])
    for (const nome of ['Inteligente', 'Pincel', 'Varinha', 'Laço', 'Pontos']) {
      await usuario.click(ferramenta(nome))
      expect(ferramenta(nome).getAttribute('aria-pressed')).toBe('true')
    }
    clicar(camada, 30, 20)
    expect(s.alteracoes()).toHaveLength(0)
    expect((screen.getByRole('button', { name: 'Preencher buracos' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('gravar falha: marca "!" na estrutura e mostra o motivo', async () => {
    const { camada } = await montar([SEG], { 'PATCH /segmentacoes/7': { status: 500, corpo: { detail: 'Disco cheio.' } } })
    tecla('w')
    clicar(camada, 30, 20)
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Disco cheio.')
    expect(screen.getByText('!')).toBeTruthy()
  })

  it('duas acoes enquanto a primeira ainda grava: grava de novo no fim, com a versao mais nova', async () => {
    let liberar: () => void = () => {}
    const gravacoes: string[] = []
    const { camada } = await montar([SEG], {
      'PATCH /segmentacoes/7': (p) => {
        gravacoes.push((p.corpo as { mascara: string }).mascara)
        return { corpo: {} }
      },
    })
    const fetchFalso = globalThis.fetch
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH' && gravacoes.length === 0) await new Promise<void>((r) => (liberar = r))
      return fetchFalso(url, init)
    })
    tecla('w')
    clicar(camada, 30, 20) // primeira gravacao fica presa
    await waitFor(() => expect(screen.getByText('…')).toBeTruthy())
    tecla('e')
    clicar(camada, 30, 20) // segunda acao: espera a primeira
    liberar()
    await waitFor(() => expect(gravacoes).toEqual(['data:image/png;pixels=500', 'data:image/png;pixels=100']))
  })
})

describe('zoom, mover a imagem e atalhos', () => {
  const caixa = () => screen.getByRole('img', { name: 'Radiografia para pintar estruturas' }).parentElement as HTMLElement

  it('botoes + e −, teclas + - = e 0; roda do mouse aproxima no ponto do cursor', async () => {
    const usuario = userEvent.setup()
    const { camada } = await montar()
    await usuario.click(screen.getByRole('button', { name: 'Aumentar zoom' }))
    expect(screen.getByTitle('Voltar a ver a imagem inteira (0)').textContent).toBe('125%')
    tecla('+')
    tecla('=')
    expect(screen.getByTitle('Voltar a ver a imagem inteira (0)').textContent).toBe('195%')
    tecla('-')
    expect(screen.getByTitle('Voltar a ver a imagem inteira (0)').textContent).toBe('156%')
    await usuario.click(screen.getByRole('button', { name: 'Diminuir zoom' }))
    await usuario.click(screen.getByRole('button', { name: 'Diminuir zoom' })) // nao passa de 100%
    expect(screen.getByTitle('Voltar a ver a imagem inteira (0)').textContent).toBe('100%')
    expect(caixa().style.transform).toBe('translate(0px, 0px) scale(1)')
    fireEvent.wheel(camada.parentElement as HTMLElement, { deltaY: -100, clientX: 0, clientY: 0 })
    expect(screen.getByTitle('Voltar a ver a imagem inteira (0)').textContent).toBe('120%')
    expect(caixa().style.transform).toBe('translate(0px, 0px) scale(1.2)') // aproximou no canto: nada se desloca
    for (let i = 0; i < 15; i++) fireEvent.wheel(camada.parentElement as HTMLElement, { deltaY: -100, clientX: 200, clientY: 100 })
    expect(screen.getByTitle('Voltar a ver a imagem inteira (0)').textContent).toBe('800%') // maximo
    expect(screen.getByRole('img', { name: 'Radiografia para pintar estruturas' }).style.imageRendering).toBe('pixelated') // pixels nitidos de perto
    tecla('0')
    expect(screen.getByTitle('Voltar a ver a imagem inteira (0)').textContent).toBe('100%')
    tecla('+')
    await usuario.click(screen.getByTitle('Voltar a ver a imagem inteira (0)'))
    expect(caixa().style.transform).toBe('translate(0px, 0px) scale(1)')
  })

  it('arrastar com o botao direito ou segurando Espaco move a imagem (sem pintar)', async () => {
    const { s, camada } = await montar([SEG])
    tecla('b')
    arrastar(camada, [[10, 10], [20, 15]], 2)
    expect(caixa().style.transform).toBe('translate(40px, 20px) scale(1)')
    tecla(' ')
    arrastar(camada, [[20, 15], [10, 15]])
    fireEvent.keyUp(window, { key: ' ' })
    expect(caixa().style.transform).toBe('translate(0px, 20px) scale(1)')
    expect(contagem()).toBe('Dente 36: 100 pixels pintados')
    expect(s.alteracoes()).toHaveLength(0)
  })

  it('atalhos nao valem com o mouse fora da imagem, digitando num campo, ou com Alt/Ctrl', async () => {
    const { camada } = await montar([SEG])
    tecla('b', { altKey: true })
    tecla('b', { ctrlKey: true })
    expect(ferramenta('Pontos').getAttribute('aria-pressed')).toBe('true')
    within(document.body).getByRole('combobox', { name: 'Tipo de estrutura' }).focus()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Tipo de estrutura' }), { key: 'b' })
    expect(ferramenta('Pontos').getAttribute('aria-pressed')).toBe('true')
    fireEvent.pointerLeave(camada)
    tecla('b')
    expect(ferramenta('Pontos').getAttribute('aria-pressed')).toBe('true')
    fireEvent.pointerEnter(camada)
    tecla('9') // nao ha estrutura 9
    tecla('x') // tecla sem acao
    tecla('b')
    expect(ferramenta('Pincel').getAttribute('aria-pressed')).toBe('true')
  })
})
