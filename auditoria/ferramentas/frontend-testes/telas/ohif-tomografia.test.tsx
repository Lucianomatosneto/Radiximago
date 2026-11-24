// @vitest-environment jsdom
//
// VISUALIZADOR DA TOMOGRAFIA (pedido do Luciano, 23/11/2026, revisto no
// mesmo dia depois de testar no PC). Painel proprio, "Tomografia", que so
// aparece quando a serie aberta e uma tomografia (varios cortes), com os
// controles EM COLUNA A DIREITA da imagem:
//  - Planos: Axial, Sagital, Coronal e 3D, marcados ou desmarcados com um
//    clique. A tela mostra so os planos marcados (1 = um quadro; 2 = lado a
//    lado; 3 = tres lado a lado; 4 = 2 x 2). Desmarcar um plano tira ele da
//    tela. "3 planos" e "4 quadros" deixam de existir. Abre com os 4;
//  - Janela: Osso, Partes moles, Dentes e Original. A tomografia
//    odontologica (TCFC) nem sempre vem em unidades Hounsfield (HU): quando
//    os numeros nao sao HU, o Radix acha o ar e o pico das partes moles no
//    proprio exame e converte as janelas padrao (em HU) para a escala dele;
//  - 3D e SO OSSO: ao abrir, o volume ja mostra so o osso (sem opcoes de
//    partes moles ou MIP), tambem convertido para a escala do exame;
//  - Espessura: 0,625 mm (corte fino), 2, 5 e 10 mm (corte grosso pela
//    MEDIA, como nos programas de TCFC).
// No quadro 3D o botao esquerdo GIRA o volume (o "mouse pratico" de
// arrastar/mover nao vale para ele).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const SCRIPT = readFileSync(resolve(__dirname, '../../../../ohif/app-config.template.js'), 'utf8')

interface FuncaoFalsa {
  pontos: number[][]
  getSize: () => number
  getNodeValue: (i: number, v: number[]) => number
  removeAllPoints: () => void
  addPointLong: (...a: number[]) => void
  addRGBPointLong: (...a: number[]) => void
}

// imita as funcoes de cor e de opacidade do vtk.js (pontos do CT-Bone em HU)
function funcaoFalsa(pontos: number[][]): FuncaoFalsa {
  const f: FuncaoFalsa = {
    pontos: pontos.map((p) => [...p]),
    getSize: () => f.pontos.length,
    getNodeValue: (i, v) => { f.pontos[i].forEach((x, k) => { v[k] = x }); return 1 },
    removeAllPoints: () => { f.pontos = [] },
    addPointLong: (...a) => { f.pontos.push(a) },
    addRGBPointLong: (...a) => { f.pontos.push(a) },
  }
  return f
}

interface VpFalso {
  foco: number[]
  getCamera: () => { focalPoint: number[] }
  type: string
  opacidade: FuncaoFalsa
  cor: FuncaoFalsa
  getActors: () => unknown[]
  setProperties: ReturnType<typeof vi.fn>
  setBlendMode: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
  getImageIds: () => string[]
  getImageData: () => unknown
}

function vpFalso(type: string, dados: Float32Array, voxel = false): VpFalso {
  const opacidade = funcaoFalsa([[-1000, 0, 0.5, 0], [150, 0, 0.5, 0], [300, 0.6, 0.5, 0], [2000, 0.9, 0.5, 0]])
  const cor = funcaoFalsa([[-1000, 0, 0, 0, 0.5, 0], [300, 0.9, 0.8, 0.6, 0.5, 0], [2000, 1, 1, 1, 0.5, 0]])
  const propriedade = { getScalarOpacity: () => opacidade, getRGBTransferFunction: () => cor }
  return {
    type,
    opacidade,
    cor,
    getActors: () => [{ actor: { getProperty: () => propriedade } }],
    setProperties: vi.fn(),
    setBlendMode: vi.fn(),
    render: vi.fn(),
    getImageIds: () => Array.from({ length: 120 }, (_, i) => `c${i}`),
    // volume falso: 20 x 20 x 50 (colunas x linhas x cortes) = 20000 valores
    // cornerstone3D 2.x (o do OHIF 3.9): sem scalarData; os valores vem do
    // voxelManager, um voxel por vez
    getImageData: () => {
      const d: Record<string, unknown> = {
        spacing: [0.2, 0.2, 0.2],
        dimensions: [20, 20, 50],
        imageData: { worldToIndex: (p: number[]) => p },
      }
      if (!voxel) d.scalarData = dados
      else {
        d.voxelManager = { getAtIndex: vi.fn((i: number) => dados[i]), getAtIJK: vi.fn((i: number, j: number, k: number) => dados[i + j * 20 + k * 400]) }
        // igual ao cornerstone3D 2.2: o campo antigo DA ERRO num volume de cortes
        Object.defineProperty(d, 'scalarData', { get: () => { throw new Error('No scalar data available') } })
      }
      return d
    },
    // foco da camera (mundo = indice no volume falso): [coluna, linha, corte]
    foco: [5, 6, 30],
    getCamera() { return { focalPoint: this.foco } },
  } as VpFalso
}

function montar(modalidade: string, cortes: number, dados: Float32Array = exameHu(), voxel = false) {
  document.body.innerHTML = `
    <div data-cy="viewport-grid">
      <div data-viewport-uid="ax"><canvas></canvas></div>
      <div data-viewport-uid="d3"><canvas></canvas></div>
    </div>`
  const vps: Record<string, VpFalso> = { ax: vpFalso('orthographic', dados, voxel), d3: vpFalso('volume3d', dados, voxel) }
  const protocolos = new Map<string, any>() // eslint-disable-line @typescript-eslint/no-explicit-any
  const ds = { displaySetInstanceUID: 'ds1', StudyInstanceUID: 'e1', Modality: modalidade, instances: Array.from({ length: cortes }, () => ({})) }
  const comandos = vi.fn()
  type Grupo = {
    hasTool: (n: string) => boolean
    setToolActive: ReturnType<typeof vi.fn>
    setToolPassive: ReturnType<typeof vi.fn>
    setToolEnabled: ReturnType<typeof vi.fn>
    setToolDisabled: ReturnType<typeof vi.fn>
  }
  const grupo = (): Grupo => ({ hasTool: () => true, setToolActive: vi.fn(), setToolPassive: vi.fn(), setToolEnabled: vi.fn(), setToolDisabled: vi.fn() })
  // "mpr" = grupo dos quadros de plano no OHIF 3.9 (tem a ferramenta ReferenceLines)
  const grupos: Record<string, Grupo> = { default: grupo(), volume3d: grupo(), mpr: grupo() }
  ;(window as unknown as { services: unknown }).services = {
    viewportGridService: {
      getState: () => ({ activeViewportId: 'ax', viewports: new Map([['ax', { displaySetInstanceUIDs: ['ds1'] }], ['d3', { displaySetInstanceUIDs: ['ds1'] }]]) }),
    },
    displaySetService: { getActiveDisplaySets: () => [ds], getDisplaySetByUID: () => ds },
    cornerstoneViewportService: { getCornerstoneViewport: (id: string) => vps[id] },
    toolGroupService: { getToolGroupIds: () => Object.keys(grupos), getToolGroup: (id: string) => grupos[id] },
    hangingProtocolService: {
      addProtocol: (id: string, p: unknown) => { protocolos.set(id, p) },
      // igual ao OHIF 3.9: protocolo nao registrado DA ERRO ("No protocol X found")
      getProtocolById: (id: string) => {
        if (!protocolos.has(id)) throw new Error(`No protocol ${id} found`)
        return protocolos.get(id)
      },
    },
  }
  ;(window as unknown as { commandsManager: unknown }).commandsManager = { runCommand: comandos }
  vi.useFakeTimers()
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)()
  vi.advanceTimersByTime(5000)
  return { vps, comandos, grupos, protocolos }
}

const painel = () => screen.getByRole('toolbar', { name: 'Tomografia' })
const botao = (nome: string) => within(painel()).getByRole('button', { name: nome })

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  document.body.className = ''
  delete (window as unknown as { services?: unknown }).services
  delete (window as unknown as { commandsManager?: unknown }).commandsManager
  delete (window as unknown as { __radixMouseOuvindo?: unknown }).__radixMouseOuvindo
})

// exame em escala 0-4095 (nao HU): metade ar (0), partes moles ~1000 e osso 1800-3000
function exameNaoHu(): Float32Array {
  const v = new Float32Array(20000)
  for (let k = 0; k < v.length; k++) {
    const r = k % 20
    v[k] = r < 10 ? 0 : r < 17 ? 960 + (r - 10) * 15 : 1800 + (r - 17) * 400
  }
  return v
}
// exame em HU: ar -1000, partes moles ~40, osso 700-1500
function exameHu(): Float32Array {
  const v = new Float32Array(20000)
  for (let k = 0; k < v.length; k++) {
    const r = k % 20
    v[k] = r < 10 ? -1000 : r < 17 ? 0 + (r - 10) * 15 : 700 + (r - 17) * 400
  }
  return v
}

describe('quando aparece', () => {
  it('tomografia: painel "Tomografia" a direita, abre com os 4 planos (2 x 2)', () => {
    const { comandos, protocolos } = montar('CT', 120)
    expect(painel()).toBeTruthy()
    expect(painel().style.right).toBe('10px')
    expect(painel().style.flexDirection).toBe('column')
    expect(document.body.classList.contains('radix-tc')).toBe(true)
    expect(comandos.mock.calls.filter((c) => c[0] === 'setHangingProtocol')).toEqual([['setHangingProtocol', { protocolId: 'radix-planos-asc3' }]])
    const p = protocolos.get('radix-planos-asc3')
    expect(p.stages[0].viewportStructure.properties).toEqual({ rows: 2, columns: 2 })
    expect(p.stages[0].viewports.map((v: { viewportOptions: { orientation: string; viewportType: string } }) => [v.viewportOptions.viewportType, v.viewportOptions.orientation]))
      .toEqual([['volume', 'axial'], ['volume', 'sagittal'], ['volume', 'coronal'], ['volume3d', 'coronal']])
    for (const nome of ['Axial', 'Sagital', 'Coronal', '3D']) expect(botao(nome).getAttribute('aria-pressed')).toBe('true')
    expect(within(painel()).queryByRole('button', { name: '3 planos' })).toBeNull()
    expect(within(painel()).queryByRole('button', { name: '4 quadros' })).toBeNull()
  })

  it('radiografia (um corte so): sem painel e nada muda', () => {
    const { comandos } = montar('DX', 1)
    expect(screen.queryByRole('toolbar', { name: 'Tomografia' })).toBeNull()
    expect(document.body.classList.contains('radix-tc')).toBe(false)
    expect(comandos.mock.calls.filter((c) => c[0] === 'setHangingProtocol')).toEqual([])
  })
})

describe('planos marcados = quadros na tela', () => {
  it('desmarcar tira o plano da tela; marcar de novo traz de volta', () => {
    const { comandos, protocolos } = montar('CT', 120)
    fireEvent.click(botao('3D'))
    expect(comandos).toHaveBeenLastCalledWith('setHangingProtocol', { protocolId: 'radix-planos-asc' })
    expect(protocolos.get('radix-planos-asc').stages[0].viewportStructure.properties).toEqual({ rows: 1, columns: 3 })
    expect(botao('3D').getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(botao('Coronal'))
    expect(comandos).toHaveBeenLastCalledWith('setHangingProtocol', { protocolId: 'radix-planos-as' })
    expect(protocolos.get('radix-planos-as').stages[0].viewportStructure.properties).toEqual({ rows: 1, columns: 2 })
    fireEvent.click(botao('Sagital'))
    expect(comandos).toHaveBeenLastCalledWith('setHangingProtocol', { protocolId: 'radix-planos-a' })
    expect(protocolos.get('radix-planos-a').stages[0].viewports).toHaveLength(1)
    fireEvent.click(botao('3D'))
    expect(comandos).toHaveBeenLastCalledWith('setHangingProtocol', { protocolId: 'radix-planos-a3' })
  })

  it('o ultimo plano marcado nao desmarca (a tela nunca fica vazia)', () => {
    const { comandos } = montar('CT', 120)
    for (const nome of ['Sagital', 'Coronal', '3D']) fireEvent.click(botao(nome))
    comandos.mockClear()
    fireEvent.click(botao('Axial'))
    expect(comandos).not.toHaveBeenCalled()
    expect(botao('Axial').getAttribute('aria-pressed')).toBe('true')
  })

  it('o 3D vem so com osso (CT-Bone), sem opcoes de partes moles ou MIP', () => {
    const { protocolos } = montar('CT', 120)
    const v3d = protocolos.get('radix-planos-asc3').stages[0].viewports[3]
    expect(v3d.displaySets[0].options.displayPreset.CT).toBe('CT-Bone')
    expect(within(painel()).queryByRole('button', { name: '3D partes moles' })).toBeNull()
    expect(within(painel()).queryByRole('button', { name: '3D MIP' })).toBeNull()
  })
})

describe('janelas', () => {
  // 23/11/2026 (escolha do Luciano, comparando no TC01 do acervo): Osso
  // largura 3000 / nivel 900 e Partes moles largura 1000 / nivel 150 - as
  // janelas antigas (2000/500 e 400/40) ficavam estouradas na TCFC
  it('exame em HU: Osso 3000/900 e Partes moles 1000/150', () => {
    const { vps } = montar('CT', 120, exameHu())
    fireEvent.click(botao('Osso'))
    expect(vps.ax.setProperties).toHaveBeenLastCalledWith({ voiRange: { lower: -600, upper: 2400 } })
    fireEvent.click(botao('Partes moles'))
    expect(vps.ax.setProperties).toHaveBeenLastCalledWith({ voiRange: { lower: -350, upper: 650 } })
    expect(vps.d3.setProperties).not.toHaveBeenCalledWith(expect.objectContaining({ voiRange: expect.anything() }))
  })

  it('exame fora de HU (0-4095): as janelas sao convertidas para a escala do exame', () => {
    const { vps } = montar('CT', 120, exameNaoHu())
    fireEvent.click(botao('Partes moles'))
    const moles = vps.ax.setProperties.mock.calls.at(-1)?.[0].voiRange
    // ar = 0 e partes moles ~1000 (escala ~ HU + 1000): -350/650 HU viram
    // ~650/1650
    expect(moles.lower).toBeGreaterThan(550)
    expect(moles.lower).toBeLessThan(750)
    expect(moles.upper).toBeGreaterThan(1550)
    expect(moles.upper).toBeLessThan(1750)
    fireEvent.click(botao('Osso'))
    const osso = vps.ax.setProperties.mock.calls.at(-1)?.[0].voiRange
    // -600/2400 HU viram ~400/3400
    expect(osso.lower).toBeGreaterThan(300)
    expect(osso.lower).toBeLessThan(500)
    expect(osso.upper).toBeGreaterThan(3200)
    expect(osso.upper).toBeLessThan(3600)
  })

  it('3D so osso: no exame fora de HU, o volume e ajustado para a escala do exame', () => {
    const { vps } = montar('CT', 120, exameNaoHu())
    const opacidade = vps.d3.opacidade
    // os pontos do CT-Bone (em HU) foram levados para a escala do exame (+~1000)
    expect(opacidade.pontos.length).toBeGreaterThan(0)
    expect(Math.min(...opacidade.pontos.map((p) => p[0]))).toBeGreaterThan(-100)
  })
})

// LINHAS DE REFERENCIA (23/11/2026, pedido do Luciano): em cada quadro de
// plano aparece a linha do corte que esta no quadro ATIVO (o que o curador
// esta passando). Ferramenta ReferenceLines do OHIF, ligada no grupo "mpr".
describe('linhas de referencia', () => {
  it('ligadas ao abrir, com o quadro ativo como origem', () => {
    const { grupos, comandos } = montar('CT', 120)
    expect(grupos.mpr.setToolEnabled).toHaveBeenCalledWith('ReferenceLines')
    expect(comandos).toHaveBeenCalledWith('setSourceViewportForReferenceLinesTool', { viewportId: 'ax' })
    expect(botao('Linhas de referência').getAttribute('aria-pressed')).toBe('true')
  })

  it('trocar o quadro ativo troca a origem das linhas', () => {
    const { comandos } = montar('CT', 120)
    const s = (window as unknown as { services: { viewportGridService: { getState: () => unknown } } }).services
    const antigo = s.viewportGridService.getState as () => { viewports: Map<string, unknown> }
    const viewports = antigo().viewports
    s.viewportGridService.getState = () => ({ activeViewportId: 'd3', viewports })
    comandos.mockClear()
    vi.advanceTimersByTime(1000)
    expect(comandos).toHaveBeenCalledWith('setSourceViewportForReferenceLinesTool', { viewportId: 'd3' })
  })

  it('o botao desliga e liga de novo', () => {
    const { grupos } = montar('CT', 120)
    fireEvent.click(botao('Linhas de referência'))
    expect(grupos.mpr.setToolDisabled).toHaveBeenCalledWith('ReferenceLines')
    expect(botao('Linhas de referência').getAttribute('aria-pressed')).toBe('false')
    grupos.mpr.setToolEnabled.mockClear()
    fireEvent.click(botao('Linhas de referência'))
    expect(grupos.mpr.setToolEnabled).toHaveBeenCalledWith('ReferenceLines')
  })
})

// MINIATURA LOCALIZADORA NO VISUALIZADOR (23/11/2026, pedido do Luciano):
// com UM plano so na tela, abaixo da data (canto de cima, a esquerda) aparece
// uma miniatura com a linha de referencia do corte aberto:
// axial -> sagital (linha horizontal); coronal -> sagital (linha vertical);
// sagital -> coronal (linha vertical). Com mais de um plano na tela nao
// aparece (as linhas de referencia ficam nas imagens grandes).
describe('miniatura com um plano so', () => {
  const mini = () => document.querySelector('[data-viewport-uid="ax"] [aria-label^="Localizador"]') as HTMLElement | null
  const linhaMini = () => document.querySelector('[data-testid="radix-linha-localizador"]') as HTMLElement
  function soUm(nome: string) {
    const r = montar('CT', 120)
    for (const outro of ['Axial', 'Sagital', 'Coronal', '3D'].filter((n) => n !== nome)) fireEvent.click(botao(outro))
    vi.advanceTimersByTime(1000)
    return r
  }

  it('com os 4 planos na tela: sem miniatura', () => {
    montar('CT', 120)
    expect(mini()).toBeNull()
  })

  it('so o axial: miniatura sagital abaixo da data, linha na altura do corte', () => {
    const { vps } = soUm('Axial')
    expect(mini()?.getAttribute('aria-label')).toBe('Localizador: sagital')
    // corte 30 de 50, contado de baixo: (1 - 30,5/50) = 39%
    expect(linhaMini().style.top).toBe('39%')
    vps.ax.foco = [5, 6, 10]
    vi.advanceTimersByTime(500)
    expect(linhaMini().style.top).toBe('79%')
  })

  it('so o coronal: miniatura sagital, linha vertical na linha do corte', () => {
    soUm('Coronal')
    expect(mini()?.getAttribute('aria-label')).toBe('Localizador: sagital')
    // linha 6 de 20: 32,5%
    expect(linhaMini().style.left).toBe('32.5%')
  })

  it('so o sagital: miniatura coronal, linha vertical na coluna do corte', () => {
    soUm('Sagital')
    expect(mini()?.getAttribute('aria-label')).toBe('Localizador: coronal')
    expect(linhaMini().style.left).toBe('27.5%')
  })

  it('marcar outro plano tira a miniatura', () => {
    soUm('Axial')
    expect(mini()).not.toBeNull()
    fireEvent.click(botao('Sagital'))
    vi.advanceTimersByTime(500)
    expect(mini()).toBeNull()
  })
})

// OHIF 3.9 usa o cornerstone3D 2.x: o volume nao traz mais "scalarData";
// os valores vem do voxelManager. Visto no PC do Luciano (23/11/2026): a
// miniatura saia preta e as janelas nao eram convertidas.
describe('cornerstone3D 2.x (voxelManager)', () => {
  it('janelas convertidas para a escala do exame lendo os voxels', () => {
    const { vps } = montar('CT', 120, exameNaoHu(), true)
    fireEvent.click(botao('Partes moles'))
    const moles = vps.ax.setProperties.mock.calls.at(-1)?.[0].voiRange
    expect(moles.lower).toBeGreaterThan(550)
    expect(moles.upper).toBeLessThan(1750)
  })

  it('a miniatura le o corte sagital do meio voxel a voxel', () => {
    const { vps } = montar('CT', 120, exameNaoHu(), true)
    for (const outro of ['Sagital', 'Coronal', '3D']) fireEvent.click(botao(outro))
    vi.advanceTimersByTime(2000)
    const leitor = (vps.ax.getImageData() as { voxelManager: { getAtIJK: ReturnType<typeof vi.fn> } }).voxelManager
    expect(leitor).toBeTruthy()
    // getImageData devolve um leitor novo a cada chamada: confere pelo desenho
    expect(document.querySelector('[aria-label="Localizador: sagital"]')).toBeTruthy()
    expect((window as unknown as { __radixMiniaturaLida?: number }).__radixMiniaturaLida).toBeGreaterThan(0)
  })

  it('escala nao fica guardada enquanto o volume ainda esta vazio', () => {
    const vazio = new Float32Array(20000)
    const { vps } = montar('CT', 120, vazio, true)
    fireEvent.click(botao('Osso'))
    expect(vps.ax.setProperties).toHaveBeenLastCalledWith({ voiRange: { lower: -600, upper: 2400 } })
    // o volume chegou: a proxima conta usa os valores de verdade
    vazio.set(exameNaoHu())
    fireEvent.click(botao('Partes moles'))
    expect(vps.ax.setProperties.mock.calls.at(-1)?.[0].voiRange.lower).toBeGreaterThan(550)
  })
})

describe('espessura', () => {
  it.each([['2 mm', 2], ['5 mm', 5], ['10 mm', 10]])('"%s": corte grosso pela media nos planos', (nome, mm) => {
    const { vps } = montar('CT', 120)
    fireEvent.click(botao(nome))
    expect(vps.ax.setBlendMode).toHaveBeenLastCalledWith(3)
    expect(vps.ax.setProperties).toHaveBeenCalledWith({ slabThickness: mm })
    expect(vps.d3.setBlendMode).not.toHaveBeenCalled()
  })

  it('"0,625 mm" volta ao corte fino', () => {
    const { vps } = montar('CT', 120)
    fireEvent.click(botao('5 mm'))
    fireEvent.click(botao('0,625 mm'))
    expect(vps.ax.setBlendMode).toHaveBeenLastCalledWith(0)
    expect(vps.ax.setProperties).toHaveBeenLastCalledWith({ slabThickness: 0.625 })
  })

  it('o painel recolhe e abre (para liberar a imagem)', () => {
    montar('CT', 120)
    fireEvent.click(screen.getByRole('button', { name: 'Recolher painel da tomografia' }))
    expect(screen.queryByRole('button', { name: 'Osso' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Abrir painel da tomografia' }))
    expect(botao('Osso')).toBeTruthy()
  })
})

describe('mouse no 3D', () => {
  it('o grupo do 3D (volume3d) fica com o girar do OHIF; os outros ganham o mouse pratico', () => {
    const { grupos } = montar('CT', 120)
    expect(grupos.default.setToolActive).toHaveBeenCalledWith('Pan', { bindings: [{ mouseButton: 1 }] })
    expect(grupos.volume3d.setToolActive).not.toHaveBeenCalledWith('Pan', expect.anything())
  })
})

// RECONSTRUCAO PANORAMICA (etapa 3, 23/11/2026): series que o Radix gerou no
// mesmo estudo (SeriesDescription "RADIX - Panorâmica reconstruída (TC)" e
// "RADIX - Cortes transversais (TC)") ganham botoes no painel.
describe('reconstrucao no painel', () => {
  function montarComReconstrucao() {
    const r = montar('CT', 120)
    const s = (window as unknown as { services: Record<string, Record<string, unknown>> }).services
    const ct = { displaySetInstanceUID: 'ds1', StudyInstanceUID: 'e1', Modality: 'CT', instances: Array.from({ length: 120 }, () => ({})) }
    const pano = { displaySetInstanceUID: 'pano2', StudyInstanceUID: 'e1', Modality: 'OT', SeriesDescription: 'RADIX - Panorâmica reconstruída (TC)', SeriesNumber: 9003, instances: [{}] }
    const panoVelha = { displaySetInstanceUID: 'pano1', StudyInstanceUID: 'e1', Modality: 'OT', SeriesDescription: 'RADIX - Panorâmica reconstruída (TC)', SeriesNumber: 9001, instances: [{}] }
    const cortes = { displaySetInstanceUID: 'cortes2', StudyInstanceUID: 'e1', Modality: 'OT', SeriesDescription: 'RADIX - Cortes transversais (TC)', SeriesNumber: 9004, instances: Array.from({ length: 80 }, () => ({})) }
    s.displaySetService.getActiveDisplaySets = () => [ct, panoVelha, pano, cortes]
    const definir = vi.fn()
    s.viewportGridService.setDisplaySetsForViewport = definir
    vi.advanceTimersByTime(1000)
    return { ...r, definir, s, pano }
  }

  it('botoes "Panorâmica reconstruída" e "Cortes transversais" abrem a reconstrucao mais nova num quadro so', () => {
    const { comandos, definir } = montarComReconstrucao()
    comandos.mockClear()
    fireEvent.click(botao('Panorâmica reconstruída'))
    expect(comandos).toHaveBeenCalledWith('setHangingProtocol', { protocolId: 'default' })
    vi.advanceTimersByTime(600)
    expect(definir).toHaveBeenLastCalledWith({ viewportId: 'ax', displaySetInstanceUIDs: ['pano2'] })
    fireEvent.click(botao('Cortes transversais'))
    vi.advanceTimersByTime(600)
    expect(definir).toHaveBeenLastCalledWith({ viewportId: 'ax', displaySetInstanceUIDs: ['cortes2'] })
    // de volta a tomografia: o plano clicado abre sozinho
    fireEvent.click(botao('Coronal'))
    expect(comandos).toHaveBeenLastCalledWith('setHangingProtocol', { protocolId: 'radix-planos-c' })
  })

  it('com a panoramica aberta (serie OT) o painel continua, porque o estudo tem a tomografia', () => {
    const { s, pano } = montarComReconstrucao()
    s.displaySetService.getDisplaySetByUID = () => pano
    vi.advanceTimersByTime(1500)
    expect(painel()).toBeTruthy()
    expect(botao('Axial')).toBeTruthy()
  })

  // CANAL MANDIBULAR (23/11/2026): series "RADIX - Panorâmica com canal (TC)"
  // e "RADIX - Cortes com canal (TC)" ganham botoes proprios (a mais nova)
  it('botoes "Panorâmica com canal" e "Cortes com canal" abrem as series desenhadas', () => {
    const r = montar('CT', 120)
    const s = (window as unknown as { services: Record<string, Record<string, unknown>> }).services
    const ct = { displaySetInstanceUID: 'ds1', StudyInstanceUID: 'e1', Modality: 'CT', instances: Array.from({ length: 120 }, () => ({})) }
    const pano = { displaySetInstanceUID: 'pano1', StudyInstanceUID: 'e1', Modality: 'OT', SeriesDescription: 'RADIX - Panorâmica reconstruída (TC)', SeriesNumber: 9001, instances: [{}] }
    const comCanal = { displaySetInstanceUID: 'canal-pano', StudyInstanceUID: 'e1', Modality: 'OT', SeriesDescription: 'RADIX - Panorâmica com canal (TC)', SeriesNumber: 9501, instances: [{}] }
    const cortesCanal = { displaySetInstanceUID: 'canal-cortes', StudyInstanceUID: 'e1', Modality: 'OT', SeriesDescription: 'RADIX - Cortes com canal (TC)', SeriesNumber: 9502, instances: [{}, {}] }
    s.displaySetService.getActiveDisplaySets = () => [ct, pano, comCanal, cortesCanal]
    const definir = vi.fn()
    s.viewportGridService.setDisplaySetsForViewport = definir
    vi.advanceTimersByTime(1000)
    fireEvent.click(botao('Panorâmica com canal'))
    vi.advanceTimersByTime(600)
    expect(definir).toHaveBeenLastCalledWith({ viewportId: 'ax', displaySetInstanceUIDs: ['canal-pano'] })
    fireEvent.click(botao('Cortes com canal'))
    vi.advanceTimersByTime(600)
    expect(definir).toHaveBeenLastCalledWith({ viewportId: 'ax', displaySetInstanceUIDs: ['canal-cortes'] })
    // a panoramica sem canal continua com o botao dela
    fireEvent.click(botao('Panorâmica reconstruída'))
    vi.advanceTimersByTime(600)
    expect(definir).toHaveBeenLastCalledWith({ viewportId: 'ax', displaySetInstanceUIDs: ['pano1'] })
    // com a serie desenhada aberta, o painel continua
    s.displaySetService.getDisplaySetByUID = () => comCanal
    vi.advanceTimersByTime(1500)
    expect(painel()).toBeTruthy()
    expect(r).toBeTruthy()
  })

  it('sem reconstrucao no estudo: sem os botoes', () => {
    montar('CT', 120)
    expect(within(painel()).queryByRole('button', { name: 'Panorâmica reconstruída' })).toBeNull()
  })
})
