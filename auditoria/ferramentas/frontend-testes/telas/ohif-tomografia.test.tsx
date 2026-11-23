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

function vpFalso(type: string, dados: Float32Array): VpFalso {
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
    getImageData: () => ({ spacing: [0.2, 0.2, 0.2], scalarData: dados }),
  }
}

function montar(modalidade: string, cortes: number, dados: Float32Array = exameHu()) {
  document.body.innerHTML = `
    <div data-cy="viewport-grid">
      <div data-viewport-uid="ax"><canvas></canvas></div>
      <div data-viewport-uid="d3"><canvas></canvas></div>
    </div>`
  const vps: Record<string, VpFalso> = { ax: vpFalso('orthographic', dados), d3: vpFalso('volume3d', dados) }
  const protocolos = new Map<string, any>() // eslint-disable-line @typescript-eslint/no-explicit-any
  const ds = { displaySetInstanceUID: 'ds1', StudyInstanceUID: 'e1', Modality: modalidade, instances: Array.from({ length: cortes }, () => ({})) }
  const comandos = vi.fn()
  const grupos: Record<string, { hasTool: (n: string) => boolean; setToolActive: ReturnType<typeof vi.fn>; setToolPassive: ReturnType<typeof vi.fn> }> = {
    default: { hasTool: () => true, setToolActive: vi.fn(), setToolPassive: vi.fn() },
    volume3d: { hasTool: () => true, setToolActive: vi.fn(), setToolPassive: vi.fn() },
  }
  ;(window as unknown as { services: unknown }).services = {
    viewportGridService: {
      getState: () => ({ activeViewportId: 'ax', viewports: new Map([['ax', { displaySetInstanceUIDs: ['ds1'] }], ['d3', { displaySetInstanceUIDs: ['ds1'] }]]) }),
    },
    displaySetService: { getActiveDisplaySets: () => [ds], getDisplaySetByUID: () => ds },
    cornerstoneViewportService: { getCornerstoneViewport: (id: string) => vps[id] },
    toolGroupService: { getToolGroupIds: () => Object.keys(grupos), getToolGroup: (id: string) => grupos[id] },
    hangingProtocolService: {
      addProtocol: (id: string, p: unknown) => { protocolos.set(id, p) },
      getProtocolById: (id: string) => protocolos.get(id),
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
    expect(v3d.displaySets[0].options.displayPreset).toBe('CT-Bone')
    expect(within(painel()).queryByRole('button', { name: '3D partes moles' })).toBeNull()
    expect(within(painel()).queryByRole('button', { name: '3D MIP' })).toBeNull()
  })
})

describe('janelas', () => {
  it('exame em HU: Osso 2000/500 e Partes moles 400/40, como no padrao', () => {
    const { vps } = montar('CT', 120, exameHu())
    fireEvent.click(botao('Osso'))
    expect(vps.ax.setProperties).toHaveBeenLastCalledWith({ voiRange: { lower: -500, upper: 1500 } })
    fireEvent.click(botao('Partes moles'))
    expect(vps.ax.setProperties).toHaveBeenLastCalledWith({ voiRange: { lower: -160, upper: 240 } })
    expect(vps.d3.setProperties).not.toHaveBeenCalledWith(expect.objectContaining({ voiRange: expect.anything() }))
  })

  it('exame fora de HU (0-4095): as janelas sao convertidas para a escala do exame', () => {
    const { vps } = montar('CT', 120, exameNaoHu())
    fireEvent.click(botao('Partes moles'))
    const moles = vps.ax.setProperties.mock.calls.at(-1)?.[0].voiRange
    // ar = 0 e partes moles ~1000: a janela fica em volta das partes moles
    expect(moles.lower).toBeGreaterThan(700)
    expect(moles.upper).toBeLessThan(1300)
    expect(moles.lower).toBeLessThan(1000)
    expect(moles.upper).toBeGreaterThan(1000)
    fireEvent.click(botao('Osso'))
    const osso = vps.ax.setProperties.mock.calls.at(-1)?.[0].voiRange
    expect(osso.lower).toBeGreaterThan(300)
    expect(osso.upper).toBeGreaterThan(2000)
    expect(osso.upper).toBeLessThan(3200)
  })

  it('3D so osso: no exame fora de HU, o volume e ajustado para a escala do exame', () => {
    const { vps } = montar('CT', 120, exameNaoHu())
    const opacidade = vps.d3.opacidade
    // os pontos do CT-Bone (em HU) foram levados para a escala do exame (+~1000)
    expect(opacidade.pontos.length).toBeGreaterThan(0)
    expect(Math.min(...opacidade.pontos.map((p) => p[0]))).toBeGreaterThan(-100)
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
