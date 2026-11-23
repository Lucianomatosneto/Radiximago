// @vitest-environment jsdom
//
// VISUALIZADOR DA TOMOGRAFIA (pedido do Luciano, 23/11/2026): "manter o
// padrao Radix mas com todos os recursos para manipular a imagem, gerando
// um 3D, podendo mudar para filtro osso e partes moles". O OHIF ja tem esses
// recursos (cornerstone3D); o Radix os poe num painel proprio, "Tomografia",
// que so aparece quando a serie aberta e uma tomografia (varios cortes):
//  - Visualizacao: Axial, 3 planos (MPR), 4 quadros (3 planos + 3D) e 3D;
//    abre sozinho em 4 quadros;
//  - Filtro (janela): Osso, Partes moles, Dentes e Original;
//  - 3D: Osso, Partes moles e MIP (predefinicoes do volume 3D);
//  - Espessura: Fina, MIP 5, 10 e 20 mm (corte grosso, projecao de maxima
//    intensidade) nos 3 planos.
// No quadro 3D o botao esquerdo GIRA o volume (o "mouse pratico" de
// arrastar/mover nao vale para ele).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const SCRIPT = readFileSync(resolve(__dirname, '../../../../ohif/app-config.template.js'), 'utf8')

interface VpFalso {
  type: string
  setProperties: ReturnType<typeof vi.fn>
  setBlendMode: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn>
  getImageIds: () => string[]
  getImageData: () => unknown
}

function vpFalso(type: string): VpFalso {
  return {
    type,
    setProperties: vi.fn(),
    setBlendMode: vi.fn(),
    render: vi.fn(),
    getImageIds: () => Array.from({ length: 120 }, (_, i) => `c${i}`),
    getImageData: () => ({ spacing: [0.2, 0.2, 0.2] }),
  }
}

function montar(modalidade: string, cortes: number) {
  document.body.innerHTML = `
    <div data-cy="viewport-grid">
      <div data-viewport-uid="ax"><canvas></canvas></div>
      <div data-viewport-uid="d3"><canvas></canvas></div>
    </div>`
  const vps: Record<string, VpFalso> = { ax: vpFalso('orthographic'), d3: vpFalso('volume3d') }
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
  }
  ;(window as unknown as { commandsManager: unknown }).commandsManager = { runCommand: comandos }
  vi.useFakeTimers()
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)()
  vi.advanceTimersByTime(5000)
  return { vps, comandos, grupos }
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

describe('quando aparece', () => {
  it('tomografia: painel "Tomografia" e abre sozinha em 4 quadros (3 planos + 3D)', () => {
    const { comandos } = montar('CT', 120)
    expect(painel()).toBeTruthy()
    expect(document.body.classList.contains('radix-tc')).toBe(true)
    const protocolos = comandos.mock.calls.filter((c) => c[0] === 'setHangingProtocol')
    expect(protocolos).toEqual([['setHangingProtocol', { protocolId: 'fourUp' }]])
  })

  it('radiografia (um corte so): sem painel e nada muda', () => {
    const { comandos } = montar('DX', 1)
    expect(screen.queryByRole('toolbar', { name: 'Tomografia' })).toBeNull()
    expect(document.body.classList.contains('radix-tc')).toBe(false)
    expect(comandos.mock.calls.filter((c) => c[0] === 'setHangingProtocol')).toEqual([])
  })
})

describe('recursos', () => {
  it.each([
    ['Axial', 'default'],
    ['3 planos', 'mpr'],
    ['4 quadros', 'fourUp'],
    ['3D', 'only3D'],
  ])('visualizacao "%s" usa o protocolo %s do OHIF', (nome, protocolo) => {
    const { comandos } = montar('CT', 120)
    comandos.mockClear()
    fireEvent.click(botao(nome))
    expect(comandos).toHaveBeenCalledWith('setHangingProtocol', { protocolId: protocolo })
    expect(botao(nome).getAttribute('aria-pressed')).toBe('true')
  })

  it('filtro "Osso" muda a janela dos planos (nao do 3D)', () => {
    const { vps } = montar('CT', 120)
    fireEvent.click(botao('Osso'))
    // janela 1800 / nivel 400 -> de -500 a 1300
    expect(vps.ax.setProperties).toHaveBeenCalledWith({ voiRange: { lower: -500, upper: 1300 } })
    expect(vps.ax.render).toHaveBeenCalled()
    expect(vps.d3.setProperties).not.toHaveBeenCalledWith(expect.objectContaining({ voiRange: expect.anything() }))
  })

  it('filtro "Partes moles": janela 400 / nivel 40', () => {
    const { vps } = montar('CT', 120)
    fireEvent.click(botao('Partes moles'))
    expect(vps.ax.setProperties).toHaveBeenCalledWith({ voiRange: { lower: -160, upper: 240 } })
  })

  it.each([
    ['3D osso', 'CT-Bone'],
    ['3D partes moles', 'CT-Soft-Tissue'],
    ['3D MIP', 'CT-MIP'],
  ])('"%s" aplica a predefinicao %s no quadro 3D', (nome, preset) => {
    const { vps } = montar('CT', 120)
    fireEvent.click(botao(nome))
    expect(vps.d3.setProperties).toHaveBeenCalledWith({ preset })
    expect(vps.ax.setProperties).not.toHaveBeenCalledWith({ preset })
  })

  it('espessura "MIP 10 mm" nos planos; "Fina" volta ao corte normal', () => {
    const { vps } = montar('CT', 120)
    fireEvent.click(botao('MIP 10 mm'))
    expect(vps.ax.setBlendMode).toHaveBeenLastCalledWith(1)
    expect(vps.ax.setProperties).toHaveBeenCalledWith({ slabThickness: 10 })
    expect(vps.d3.setBlendMode).not.toHaveBeenCalled()
    fireEvent.click(botao('Fina'))
    expect(vps.ax.setBlendMode).toHaveBeenLastCalledWith(0)
  })

  it('o painel recolhe e abre (para liberar a imagem)', () => {
    montar('CT', 120)
    const recolher = screen.getByRole('button', { name: 'Recolher painel da tomografia' })
    fireEvent.click(recolher)
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
  })

  it('com a panoramica aberta (serie OT) o painel continua, porque o estudo tem a tomografia', () => {
    const { s, pano } = montarComReconstrucao()
    s.displaySetService.getDisplaySetByUID = () => pano
    vi.advanceTimersByTime(1500)
    expect(painel()).toBeTruthy()
    expect(botao('4 quadros')).toBeTruthy()
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
