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
  Modality?: string
  Rows?: number
  Columns?: number
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

  // 24/11/2026 (pedido do Luciano: "tamanho real nao esta funcionando",
  // imagem enorme, OHIF mostrando 3,86x): as tomografias do acervo (base
  // publica) declaram pixel de 1,0 mm em 512 x 512 = campo de 51 cm, maior
  // que uma cabeca. A conta esta certa; o dado nao. Tomografia com campo
  // acima de 35 cm: "Tamanho real" desligado, explicando o motivo.
  it('tomografia com medida do pixel duvidosa (campo de 51 cm): desligado e explica', () => {
    window.localStorage.setItem('radix-px-por-mm', '4')
    const cameras = montar({ PixelSpacing: [1, 1], Modality: 'CT', Rows: 512, Columns: 512 }, 1)
    const real = screen.getByRole('button', { name: 'Tamanho real' }) as HTMLButtonElement
    expect(real.disabled).toBe(true)
    expect(real.title).toContain('51 cm')
    expect(real.title).toContain('medida do pixel')
    fireEvent.click(real)
    expect(cameras).toHaveLength(0)
    // o 1:1 continua funcionando
    fireEvent.click(screen.getByRole('button', { name: '1:1' }))
    expect(cameras).toHaveLength(1)
  })

  it('tomografia odontologica normal (0,3 mm x 512 = 15 cm): tamanho real funciona', () => {
    window.localStorage.setItem('radix-px-por-mm', '4')
    const cameras = montar({ PixelSpacing: [0.3, 0.3], Modality: 'CT', Rows: 512, Columns: 512 }, 0.3)
    const real = screen.getByRole('button', { name: 'Tamanho real' }) as HTMLButtonElement
    expect(real.disabled).toBe(false)
    fireEvent.click(real)
    // 300 px de altura / 4 px por mm = 75 mm visiveis -> parallelScale 37,5
    expect(cameras.at(-1)?.parallelScale).toBeCloseTo(37.5)
  })

  // jeito mais pratico (pedido do Luciano, 23/11/2026): escolher as
  // POLEGADAS do monitor; o Radix calcula pela resolucao da tela
  it('calibrar pelas polegadas do monitor: 24" em 1920 x 1080', () => {
    Object.defineProperty(window.screen, 'width', { value: 1920, configurable: true })
    Object.defineProperty(window.screen, 'height', { value: 1080, configurable: true })
    montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrar tela' }))
    const janela = screen.getByRole('dialog', { name: 'Calibrar a tela' })
    fireEvent.click(within(janela).getByRole('button', { name: 'Tamanho da tela' }))
    fireEvent.change(within(janela).getByRole('combobox', { name: 'Tamanho da tela (polegadas)' }), { target: { value: '24' } })
    fireEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    // diagonal 2202,9 px / (24 x 25,4 mm) = 3,614 px por mm
    expect(Number(window.localStorage.getItem('radix-px-por-mm'))).toBeCloseTo(Math.hypot(1920, 1080) / (24 * 25.4), 3)
  })

  it('"Calibrar tela" abre a calibracao a qualquer momento; Cancelar fecha sem salvar', () => {
    montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    fireEvent.click(screen.getByRole('button', { name: 'Calibrar tela' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Calibrar a tela' })).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.localStorage.getItem('radix-px-por-mm')).toBeNull()
  })
})

// CALIBRACAO APRIMORADA (especificacao do Luciano, 23/11/2026): tres
// metodos (tamanho da tela, cartao guiado, regua), calibracao salva por
// navegador com a situacao visivel, apagar e recalibrar.
describe('calibracao aprimorada', () => {
  const abrirJanela = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Calibrar tela' }))
    return screen.getByRole('dialog', { name: 'Calibrar a tela' })
  }
  const salvo = () => JSON.parse(window.localStorage.getItem('radix-calibracao-tela') || 'null')
  const tela = (w: number, h: number) => {
    Object.defineProperty(window.screen, 'width', { value: w, configurable: true })
    Object.defineProperty(window.screen, 'height', { value: h, configurable: true })
  }

  it('tamanhos de 11,6" a 49" em ordem crescente, mais "Outro tamanho"', () => {
    montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    const janela = abrirJanela()
    fireEvent.click(within(janela).getByRole('button', { name: 'Tamanho da tela' }))
    const opcoes = within(janela).getAllByRole('option').map((o) => (o as HTMLOptionElement).value).filter((v) => v && v !== 'outro')
    expect(opcoes[0]).toBe('11.6')
    expect(opcoes.at(-1)).toBe('49')
    expect(opcoes).toHaveLength(22)
    expect([...opcoes].map(Number)).toEqual([...opcoes].map(Number).sort((x, y) => x - y))
    expect(within(janela).getByRole('option', { name: 'Outro tamanho' })).toBeTruthy()
  })

  it('"Outro tamanho": valida o valor digitado', () => {
    tela(1920, 1080)
    montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    const janela = abrirJanela()
    fireEvent.click(within(janela).getByRole('button', { name: 'Tamanho da tela' }))
    fireEvent.change(within(janela).getByRole('combobox', { name: 'Tamanho da tela (polegadas)' }), { target: { value: 'outro' } })
    const campo = within(janela).getByRole('spinbutton', { name: 'Diagonal (polegadas)' })
    const salvar = within(janela).getByRole('button', { name: 'Salvar' }) as HTMLButtonElement
    fireEvent.input(campo, { target: { value: '-3' } })
    expect(within(janela).getByRole('alert').textContent).toContain('entre 5 e 120')
    expect(salvar.disabled).toBe(true)
    fireEvent.input(campo, { target: { value: '25' } })
    expect(salvar.disabled).toBe(false)
    fireEvent.click(salvar)
    expect(salvo().pxPorMm).toBeCloseTo(Math.hypot(1920, 1080) / (25 * 25.4), 3)
    expect(salvo().metodo).toBe('tamanho')
  })

  it('cartao guiado: passos, ajuste fino de 1 px, recomecar e salvar', () => {
    montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    const janela = abrirJanela()
    expect(within(janela).getByRole('list', { name: 'Passos com o cartão' })).toBeTruthy()
    const faixa = within(janela).getByRole('slider', { name: 'Largura da barra' }) as HTMLInputElement
    fireEvent.input(faixa, { target: { value: '320' } })
    fireEvent.click(within(janela).getByRole('button', { name: 'Aumentar 1 px' }))
    fireEvent.click(within(janela).getByRole('button', { name: 'Aumentar 1 px' }))
    fireEvent.click(within(janela).getByRole('button', { name: 'Diminuir 1 px' }))
    expect(within(janela).getByText('Barra: 321 px = 85,6 mm')).toBeTruthy()
    fireEvent.click(within(janela).getByRole('button', { name: 'Recomeçar' }))
    expect(faixa.value).toBe('324')
    fireEvent.input(faixa, { target: { value: '340' } })
    fireEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(salvo()).toMatchObject({ metodo: 'cartao' })
    expect(salvo().pxPorMm).toBeCloseTo(340 / CARTAO_MM)
  })

  it('regua: comprimento escolhido em mm, ajuste com + e -, salvar', () => {
    montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    const janela = abrirJanela()
    fireEvent.click(within(janela).getByRole('button', { name: 'Régua' }))
    fireEvent.change(within(janela).getByRole('combobox', { name: 'Comprimento na régua (mm)' }), { target: { value: '50' } })
    fireEvent.input(within(janela).getByRole('slider', { name: 'Comprimento da barra' }), { target: { value: '200' } })
    fireEvent.click(within(janela).getByRole('button', { name: 'Aumentar 1 px' }))
    expect(within(janela).getByText('Barra: 201 px = 50 mm')).toBeTruthy()
    fireEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    expect(salvo()).toMatchObject({ metodo: 'regua' })
    expect(salvo().pxPorMm).toBeCloseTo(201 / 50)
  })

  it('cancelar nao mexe na calibracao anterior', () => {
    window.localStorage.setItem('radix-px-por-mm', '4')
    montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    const janela = abrirJanela()
    fireEvent.input(within(janela).getByRole('slider', { name: 'Largura da barra' }), { target: { value: '500' } })
    fireEvent.click(within(janela).getByRole('button', { name: 'Cancelar' }))
    expect(window.localStorage.getItem('radix-px-por-mm')).toBe('4')
  })

  it('situacao visivel: nao calibrada -> calibrada -> recomendada (outra tela); apagar', () => {
    tela(1920, 1080)
    montar({ PixelSpacing: [0.1, 0.1] }, 0.1)
    const situacao = () => screen.getByTestId('situacao-calibracao').textContent
    expect(situacao()).toBe('Não calibrada')
    const janela = abrirJanela()
    fireEvent.input(within(janela).getByRole('slider', { name: 'Largura da barra' }), { target: { value: '330' } })
    fireEvent.click(within(janela).getByRole('button', { name: 'Salvar' }))
    vi.advanceTimersByTime(800)
    expect(situacao()).toBe('Calibrada')
    expect(screen.getByRole('status').textContent).toContain('Calibração concluída')
    // outro monitor (outra resolucao): recomenda calibrar de novo
    tela(2560, 1440)
    vi.advanceTimersByTime(800)
    expect(situacao()).toBe('Calibração recomendada')
    // apagar a calibracao salva
    const j2 = abrirJanela()
    expect(within(j2).getByText(/Situação: Calibração recomendada/)).toBeTruthy()
    fireEvent.click(within(j2).getByRole('button', { name: 'Apagar calibração salva' }))
    vi.advanceTimersByTime(800)
    expect(window.localStorage.getItem('radix-px-por-mm')).toBeNull()
    expect(salvo()).toBeNull()
    expect(situacao()).toBe('Não calibrada')
  })
})
