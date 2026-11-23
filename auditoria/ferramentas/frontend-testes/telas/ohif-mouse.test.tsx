// @vitest-environment jsdom
//
// MOUSE PRATICO NO VISUALIZADOR (pedido do Luciano, 23/11/2026): zoom e
// deslocamento sem ir aos icones do OHIF, em TODOS os visualizadores (todos
// usam o OHIF com este ohif/app-config.template.js).
//  - roda do mouse = zoom no ponto do cursor;
//  - arrastar com o botao esquerdo = mover a imagem;
//  - arrastar com o direito = brilho/contraste; com o do meio = zoom;
//  - duplo clique = a imagem volta a caber na tela;
//  - tomografia (varios cortes): a roda continua passando os cortes; o
//    zoom e Ctrl + roda.
// Roda o script de verdade numa pagina falsa, com servicos do OHIF falsos.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const SCRIPT = readFileSync(resolve(__dirname, '../../../../ohif/app-config.template.js'), 'utf8')

type Chamada = [string, string, unknown?]

function grupoFalso(ferramentas: string[]) {
  const chamadas: Chamada[] = []
  return {
    chamadas,
    hasTool: (n: string) => ferramentas.includes(n),
    setToolPassive: (n: string, o?: unknown) => chamadas.push(['passiva', n, o]),
    setToolActive: (n: string, o?: unknown) => chamadas.push(['ativa', n, o]),
  }
}

function viewportFalso(cortes: number) {
  let zoom = 1
  const v = {
    zooms: [] as number[],
    cameras: [] as unknown[],
    resetadas: 0,
    renders: 0,
    getImageIds: () => Array.from({ length: cortes }, (_, i) => `img${i}`),
    getZoom: () => zoom,
    setZoom: (z: number) => {
      zoom = z
      v.zooms.push(z)
    },
    // mundo = canvas / zoom (o ponto sob o cursor "anda" quando o zoom muda)
    canvasToWorld: (p: number[]) => [p[0] / zoom, p[1] / zoom, 0],
    getCamera: () => ({ focalPoint: [0, 0, 0], position: [0, 0, 10] }),
    setCamera: (c: unknown) => v.cameras.push(c),
    resetCamera: () => {
      v.resetadas++
    },
    render: () => {
      v.renders++
    },
  }
  return v
}

let grupo: ReturnType<typeof grupoFalso>
let vp: ReturnType<typeof viewportFalso>

function montar(cortes = 1) {
  document.body.innerHTML = `
    <div data-cy="viewport-grid">
      <div data-viewport-uid="vp1" id="quadro"><canvas id="tela"></canvas></div>
    </div>`
  const quadro = document.getElementById('quadro') as HTMLElement
  quadro.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
  grupo = grupoFalso(['Pan', 'Zoom', 'WindowLevel', 'StackScroll'])
  vp = viewportFalso(cortes)
  ;(window as unknown as { services: unknown }).services = {
    toolGroupService: { getToolGroupIds: () => ['default'], getToolGroup: () => grupo },
    cornerstoneViewportService: { getCornerstoneViewport: (id: string) => (id === 'vp1' ? vp : null) },
  }
  vi.useFakeTimers()
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)()
  vi.advanceTimersByTime(3000)
}

function rodar(alvo: Element, opcoes: WheelEventInit) {
  const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, clientX: 100, clientY: 50, ...opcoes })
  alvo.dispatchEvent(ev)
  return ev
}

beforeEach(() => {
  window.history.replaceState(null, '', '/viewer')
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  delete (window as unknown as { services?: unknown }).services
})

describe('botoes do mouse', () => {
  it('esquerdo = mover, direito = brilho/contraste, meio = zoom (limpa as ligacoes antigas antes)', () => {
    montar()
    const ativas = grupo.chamadas.filter((c) => c[0] === 'ativa').map((c) => [c[1], c[2]])
    expect(ativas).toEqual([
      ['Pan', { bindings: [{ mouseButton: 1 }] }],
      ['WindowLevel', { bindings: [{ mouseButton: 2 }] }],
      ['Zoom', { bindings: [{ mouseButton: 4 }] }],
    ])
    const passivas = grupo.chamadas.filter((c) => c[0] === 'passiva')
    expect(passivas.map((c) => c[1]).sort()).toEqual(['Pan', 'WindowLevel', 'Zoom'])
    expect(passivas.every((c) => (c[2] as { removeAllBindings: boolean }).removeAllBindings === true)).toBe(true)
    // as ligacoes antigas saem ANTES das novas
    const primeiraAtiva = grupo.chamadas.findIndex((c) => c[0] === 'ativa')
    expect(grupo.chamadas.slice(0, primeiraAtiva).every((c) => c[0] === 'passiva')).toBe(true)
  })

  it('aplica uma vez so por grupo (nao fica trocando a ferramenta que a pessoa escolheu depois)', () => {
    montar()
    const antes = grupo.chamadas.length
    vi.advanceTimersByTime(10000)
    expect(grupo.chamadas.length).toBe(antes)
  })
})

describe('roda do mouse', () => {
  it('radiografia (1 imagem): roda para cima amplia, para baixo reduz, no ponto do cursor', () => {
    montar(1)
    const tela = document.getElementById('tela') as HTMLElement
    const ev = rodar(tela, { deltaY: -100 })
    expect(ev.defaultPrevented).toBe(true)
    expect(vp.zooms[0]).toBeGreaterThan(1)
    // o ponto sob o cursor fica no lugar: a camera anda
    expect(vp.cameras).toHaveLength(1)
    expect(vp.renders).toBeGreaterThan(0)
    rodar(tela, { deltaY: 100 })
    expect(vp.zooms[1]).toBeLessThan(vp.zooms[0])
  })

  it('tomografia (varios cortes): a roda passa os cortes (nao mexe no zoom); Ctrl + roda amplia', () => {
    montar(40)
    const tela = document.getElementById('tela') as HTMLElement
    const ev = rodar(tela, { deltaY: -100 })
    expect(ev.defaultPrevented).toBe(false)
    expect(vp.zooms).toEqual([])
    const comCtrl = rodar(tela, { deltaY: -100, ctrlKey: true })
    expect(comCtrl.defaultPrevented).toBe(true)
    expect(vp.zooms).toHaveLength(1)
  })

  it('o zoom tem limites (nao some nem explode)', () => {
    montar(1)
    const tela = document.getElementById('tela') as HTMLElement
    for (let i = 0; i < 200; i++) rodar(tela, { deltaY: -100 })
    expect(vp.getZoom()).toBeLessThanOrEqual(40)
    for (let i = 0; i < 400; i++) rodar(tela, { deltaY: 100 })
    expect(vp.getZoom()).toBeGreaterThanOrEqual(0.1)
  })

  it('fora de uma imagem, a roda nao e interceptada', () => {
    montar(1)
    const ev = rodar(document.body, { deltaY: -100 })
    expect(ev.defaultPrevented).toBe(false)
    expect(vp.zooms).toEqual([])
  })
})

describe('duplo clique', () => {
  it('volta a imagem a caber na tela', () => {
    montar(1)
    ;(document.getElementById('tela') as HTMLElement).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(vp.resetadas).toBe(1)
  })
})
