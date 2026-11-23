// @vitest-environment jsdom
//
// TAMANHO REAL NOS VISUALIZADORES (pedido do Luciano, 23/11/2026). Todos os
// visualizadores usam o OHIF com ohif/app-config.template.js, entao os
// botoes entram por ele, no canto de cima da area das imagens:
//  - "1:1": um pixel da imagem = um pixel da tela (qualquer imagem);
//  - "Tamanho real": milimetros de verdade - exige a medida do pixel no
//    DICOM (PixelSpacing ou ImagerPixelSpacing) e a CALIBRACAO da tela,
//    feita uma vez (barra do tamanho de um cartao, 85,6 mm). Foto
//    convertida (sem a medida) so tem o 1:1.
// Matematica (cornerstone3D): a altura visivel do quadro, em unidades do
// "mundo", e 2 x parallelScale.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const SCRIPT = readFileSync(resolve(__dirname, '../../../../ohif/app-config.template.js'), 'utf8')
const CARTAO_MM = 85.6

interface Instancia {
  PixelSpacing?: number[]
  ImagerPixelSpacing?: number[]
}

function montar(instancia: Instancia, espacoMundo: number) {
  document.body.innerHTML = `
    <div data-cy="viewport-grid">
      <div data-viewport-uid="vp1" id="quadro"><canvas></canvas></div>
    </div>`
  const quadro = document.getElementById('quadro') as HTMLElement
  quadro.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
  const cameras: Array<{ parallelScale: number }> = []
  const vp = {
    getImageIds: () => ['a'],
    getImageData: () => ({ spacing: [espacoMundo, espacoMundo, 1] }),
    getCamera: () => ({ parallelScale: 100, focalPoint: [0, 0, 0], position: [0, 0, 10] }),
    setCamera: (c: { parallelScale: number }) => cameras.push(c),
    render: () => undefined,
  }
  ;(window as unknown as { services: unknown }).services = {
    viewportGridService: { getState: () => ({ activeViewportId: 'vp1', viewports: new Map([['vp1', { displaySetInstanceUIDs: ['ds1'] }]]) }) },
    displaySetService: { getDisplaySetByUID: () => ({ instances: [instancia] }) },
    cornerstoneViewportService: { getCornerstoneViewport: () => vp },
    toolGroupService: { getToolGroupIds: () => [] },
  }
  vi.useFakeTimers()
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT)()
  vi.advanceTimersByTime(2000)
  return cameras
}

afterEach(() => {
  vi.useRealTimers()
  window.localStorage.clear()
  document.body.innerHTML = ''
  delete (window as unknown as { services?: unknown }).services
})

describe('botoes', () => {
  it('aparecem sobre a area das imagens', () => {
    montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    const grupo = screen.getByRole('group', { name: 'Tamanho da imagem' })
    expect(within(grupo).getAllByRole('button').map((b) => b.textContent)).toEqual(['1:1', 'Tamanho real', 'Calibrar tela'])
  })

  it('"1:1": um pixel da imagem = um pixel da tela', () => {
    const cameras = montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    fireEvent.click(screen.getByRole('button', { name: '1:1' }))
    // 300 px de altura x 0,1 (mundo por pixel da imagem) / 2
    expect(cameras.at(-1)?.parallelScale).toBeCloseTo(15)
  })
})

describe('tamanho real (milimetros)', () => {
  it('sem calibrar: abre a calibracao; depois de salvar, mostra em milimetros', () => {
    const cameras = montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    fireEvent.click(screen.getByRole('button', { name: 'Tamanho real' }))
    const janela = screen.getByRole('dialog', { name: 'Calibrar a tela' })
    expect(janela.textContent).toContain('cartão')
    fireEvent.input(within(janela).getByRole('slider', { name: 'Largura da barra' }), { target: { value: '340' } })
    fireEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(Number(window.localStorage.getItem('radix-px-por-mm'))).toBeCloseTo(340 / CARTAO_MM)
    fireEvent.click(screen.getByRole('button', { name: 'Tamanho real' }))
    expect(cameras.at(-1)?.parallelScale).toBeCloseTo(300 / (2 * (340 / CARTAO_MM)))
  })

  it('so ImagerPixelSpacing (o OHIF usou 1 por pixel): corrige pela medida do detector', () => {
    window.localStorage.setItem('radix-px-por-mm', '4')
    const cameras = montar({ ImagerPixelSpacing: [0.05, 0.05] }, 1)
    fireEvent.click(screen.getByRole('button', { name: 'Tamanho real' }))
    // 300/(2*4) mm visiveis; 1 unidade do mundo = 0,05 mm -> x 20
    expect(cameras.at(-1)?.parallelScale).toBeCloseTo((300 / 8) * 20)
  })

  it('imagem sem a medida do pixel (foto): "Tamanho real" desligado e explica; 1:1 funciona', () => {
    window.localStorage.setItem('radix-px-por-mm', '4')
    const cameras = montar({}, 1)
    const real = screen.getByRole('button', { name: 'Tamanho real' }) as HTMLButtonElement
    expect(real.disabled).toBe(true)
    expect(real.title).toContain('não tem a medida do pixel')
    fireEvent.click(screen.getByRole('button', { name: '1:1' }))
    expect(cameras.at(-1)?.parallelScale).toBeCloseTo(150)
  })

  it('"Calibrar tela" abre a calibracao a qualquer momento; Cancelar fecha sem salvar', () => {
    montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrar tela' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Calibrar a tela' })).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.localStorage.getItem('radix-px-por-mm')).toBeNull()
  })
})
