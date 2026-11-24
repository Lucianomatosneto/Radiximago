// @vitest-environment jsdom
//
// MARCAR LESAO NA TOMOGRAFIA - NO CORTE (pedido do Luciano, 23/11/2026,
// "opcao 1"). frontend/src/components/curadoria/MarcadorTomografia.tsx
// - o curador escolhe o PLANO (Axial, Sagital, Coronal) e passa os CORTES
//   (barra, roda do mouse ou setas); a imagem do corte vem de
//   GET /reconstrucao/{ref}/plano.png;
// - desenha como nas radiografias (o MarcadorAchado de sempre); cada
//   marcacao nova leva o plano e o numero do corte;
// - so aparecem as marcacoes do corte aberto; a lista "Marcações do exame"
//   mostra todas e o botao "Ir" abre o corte de cada uma.
// O MarcadorAchado e trocado por um falso (ele ja tem testes proprios).
import type { ReactNode } from 'react'
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import MarcadorTomografia from '../../../../frontend/src/components/curadoria/MarcadorTomografia'
import { marcacoesSobreAImagem, type Marcacao } from '../../../../frontend/src/lib/marcacoes'
import { montarTela, servidorFalso } from './apoio/montar'

vi.mock('../../../../frontend/src/components/curadoria/MarcadorAchado', () => ({
  default: (p: { urlImagem?: string; marcacoes: Marcacao[]; onMarcar: (m: Marcacao[]) => void; transformacao?: string; filtroImagem?: string; sobreposicao?: ReactNode }) => (
    <div data-testid="marcador" data-url={p.urlImagem} data-transform={p.transformacao ?? ''} data-filtro={p.filtroImagem ?? ''}>
      {p.sobreposicao}
      <span>{p.marcacoes.length} marcações neste corte</span>
      <button type="button" onClick={() => p.onMarcar([...p.marcacoes, { id: 'nova', tipo: 'oval', x: 0.1, y: 0.1, largura: 0.2, altura: 0.2 }])}>
        desenhar
      </button>
    </div>
  ),
}))

const GEOMETRIA = {
  cortes: 200, linhas: 400, colunas: 500, espacamento_mm: [0.3, 0.3, 0.3], altura_mm: 59.7,
  limites: { espessura_mm: [0.5, 40], intervalo_mm: [0.2, 10], largura_mm: [5, 80] },
}
const JA_MARCADA: Marcacao = { id: 'm1', tipo: 'seta', x1: 0.1, y1: 0.1, x2: 0.3, y2: 0.3, plano: 'sagital', corte: 120 }

async function abrir(marcacoes: Marcacao[] = []) {
  servidorFalso({ 'GET /reconstrucao/55/geometria': { corpo: GEOMETRIA } })
  const onMarcar = vi.fn()
  montarTela(<MarcadorTomografia orthancReferenceId={55} marcacoes={marcacoes} onMarcar={onMarcar} />)
  await screen.findByTestId('marcador')
  return onMarcar
}
const url = () => screen.getByTestId('marcador').getAttribute('data-url') ?? ''

beforeEach(() => vi.clearAllMocks())
afterEach(() => cleanup())

describe('plano e corte', () => {
  it('abre no axial, no corte do meio', async () => {
    await abrir()
    expect(url()).toContain('/reconstrucao/55/plano.png?plano=axial&indice=100')
    expect(screen.getByText('Corte 101 de 200')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Axial' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('miniatura localizadora: sagital no axial, axial nos outros planos; clicar leva ao corte', async () => {
    await abrir()
    expect(screen.getByRole('img', { name: /Localizador: sagital/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sagital' }))
    expect(screen.getByRole('img', { name: /Localizador: axial/ })).toBeTruthy()
    const alvo = screen.getByRole('button', { name: /Ir para o ponto clicado/ })
    alvo.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.click(alvo, { clientX: 10, clientY: 50 })
    expect(url()).toContain('plano=sagital&indice=50')
  })

  it('trocar o plano: sagital vai pelas colunas, coronal pelas linhas', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Sagital' }))
    expect(url()).toContain('plano=sagital&indice=250')
    expect(screen.getByText('Corte 251 de 500')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Coronal' }))
    expect(url()).toContain('plano=coronal&indice=200')
  })

  it('roda do mouse e setas passam os cortes, sem sair do exame', async () => {
    await abrir()
    const area = screen.getByTestId('area-tomografia')
    fireEvent.wheel(area, { deltaY: -100 })
    expect(url()).toContain('indice=101')
    fireEvent.keyDown(area, { key: 'ArrowDown' })
    fireEvent.keyDown(area, { key: 'ArrowDown' })
    expect(url()).toContain('indice=99')
    fireEvent.change(screen.getByRole('slider', { name: 'Corte' }), { target: { value: '0' } })
    fireEvent.wheel(area, { deltaY: 100 })
    expect(url()).toContain('indice=0')
  })
})

describe('marcacoes', () => {
  it('a marcacao nova leva o plano e o corte; as de outros cortes continuam', async () => {
    const onMarcar = await abrir([JA_MARCADA])
    expect(screen.getByText('0 marcações neste corte')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'desenhar' }))
    expect(onMarcar).toHaveBeenCalledWith([
      JA_MARCADA,
      { id: 'nova', tipo: 'oval', x: 0.1, y: 0.1, largura: 0.2, altura: 0.2, plano: 'axial', corte: 100 },
    ])
  })

  it('a lista mostra as marcacoes do exame e "Ir" abre o corte de cada uma', async () => {
    await abrir([JA_MARCADA])
    const lista = screen.getByRole('list', { name: 'Marcações do exame' })
    expect(within(lista).getByText(/Sagital · corte 121/)).toBeTruthy()
    fireEvent.click(within(lista).getByRole('button', { name: 'Ir' }))
    expect(url()).toContain('plano=sagital&indice=120')
    expect(screen.getByText('1 marcações neste corte')).toBeTruthy()
  })
})

// RECURSOS DOS GRANDES SISTEMAS (24/11/2026, pedido do Luciano: "como os
// melhores sistemas mundiais, praticidade, ensino, pesquisa e pronto para a
// IA"): navegacao rapida, ver melhor o corte, medir em mm e exportar.
const transform = () => screen.getByTestId('marcador').getAttribute('data-transform') ?? ''
const filtro = () => screen.getByTestId('marcador').getAttribute('data-filtro') ?? ''
const caixa100 = (el: Element) => {
  el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
}

describe('navegacao rapida', () => {
  it('PageUp/PageDown passam 10 cortes; Home e End vao ao primeiro e ao ultimo', async () => {
    await abrir()
    const area = screen.getByTestId('area-tomografia')
    fireEvent.keyDown(area, { key: 'PageUp' })
    expect(url()).toContain('indice=110')
    fireEvent.keyDown(area, { key: 'PageDown' })
    fireEvent.keyDown(area, { key: 'PageDown' })
    expect(url()).toContain('indice=90')
    fireEvent.keyDown(area, { key: 'End' })
    expect(url()).toContain('indice=199')
    fireEvent.keyDown(area, { key: 'Home' })
    expect(url()).toContain('indice=0')
  })

  it('cada botao de plano mostra quantas marcacoes tem', async () => {
    await abrir([JA_MARCADA, { ...JA_MARCADA, id: 'm2', corte: 10 }])
    expect(screen.getByTestId('contagem-sagital').textContent).toBe('2')
    expect(screen.queryByTestId('contagem-axial')).toBeNull()
    expect(screen.getByRole('button', { name: 'Sagital' })).toBeTruthy()
  })
})

describe('ver melhor o corte', () => {
  it('aproximar, afastar e ajustar; o zoom aparece em %', async () => {
    await abrir()
    expect(transform()).toBe('translate(0px, 0px) scale(1)')
    fireEvent.click(screen.getByRole('button', { name: 'Aproximar' }))
    expect(transform()).toContain('scale(1.25)')
    expect(screen.getByText('125%')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Afastar' }))
    expect(transform()).toContain('scale(1)')
    fireEvent.click(screen.getByRole('button', { name: 'Aproximar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar' }))
    expect(transform()).toBe('translate(0px, 0px) scale(1)')
  })

  it('Ctrl + roda aproxima sem passar o corte', async () => {
    await abrir()
    const area = screen.getByTestId('area-tomografia')
    caixa100(area)
    fireEvent.wheel(area, { deltaY: -100, ctrlKey: true, clientX: 50, clientY: 50 })
    expect(transform()).toContain('scale(1.25)')
    expect(url()).toContain('indice=100')
  })

  it('arrastar com o botao do meio desloca a imagem', async () => {
    await abrir()
    const area = screen.getByTestId('area-tomografia')
    fireEvent.mouseDown(area, { button: 1, clientX: 10, clientY: 10 })
    fireEvent.mouseMove(area, { clientX: 40, clientY: 30 })
    fireEvent.mouseUp(area)
    expect(transform()).toBe('translate(30px, 20px) scale(1)')
  })

  it('botao direito arrastado muda brilho e contraste; inverter; restaurar', async () => {
    await abrir()
    const area = screen.getByTestId('area-tomografia')
    expect(filtro()).toBe('brightness(1) contrast(1)')
    fireEvent.mouseDown(area, { button: 2, clientX: 50, clientY: 50 })
    fireEvent.mouseMove(area, { clientX: 150, clientY: 0 })
    fireEvent.mouseUp(area)
    const [, brilho, contraste] = /brightness\(([\d.]+)\) contrast\(([\d.]+)\)/.exec(filtro()) ?? []
    expect(Number(brilho)).toBeGreaterThan(1)
    expect(Number(contraste)).toBeGreaterThan(1)
    fireEvent.click(screen.getByRole('button', { name: 'Inverter' }))
    expect(filtro()).toContain('invert(1)')
    expect(screen.getByRole('button', { name: 'Inverter' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar brilho' }))
    expect(filtro()).toBe('brightness(1) contrast(1)')
  })
})

describe('medidas em mm', () => {
  // GEOMETRIA: espacamento 0,3 mm -> o axial tem 500 x 0,3 = 150 mm de largura
  // e 400 x 0,3 = 120 mm de altura
  it('regua: dois cliques medem em mm; sai com Esc', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Régua' }))
    const camada = screen.getByTestId('camada-medida')
    caixa100(camada)
    fireEvent.click(camada, { clientX: 0, clientY: 50 })
    fireEvent.click(camada, { clientX: 50, clientY: 50 })
    const lista = screen.getByRole('list', { name: 'Medidas neste corte' })
    expect(within(lista).getByText('Régua: 75,0 mm')).toBeTruthy()
    expect(within(camada).getByText('75,0 mm')).toBeTruthy()
    fireEvent.keyDown(screen.getByTestId('area-tomografia'), { key: 'Escape' })
    expect(screen.queryByTestId('camada-medida')).toBeNull()
    expect(screen.getByRole('button', { name: 'Régua' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('angulo: tres cliques (o do meio e o vertice)', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Ângulo' }))
    const camada = screen.getByTestId('camada-medida')
    caixa100(camada)
    fireEvent.click(camada, { clientX: 60, clientY: 40 })
    fireEvent.click(camada, { clientX: 50, clientY: 40 })
    fireEvent.click(camada, { clientX: 50, clientY: 60 })
    expect(within(screen.getByRole('list', { name: 'Medidas neste corte' })).getByText('Ângulo: 90,0°')).toBeTruthy()
  })

  it('as medidas ficam no corte delas; "Limpar medidas" apaga as do corte', async () => {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Régua' }))
    const camada = screen.getByTestId('camada-medida')
    caixa100(camada)
    fireEvent.click(camada, { clientX: 0, clientY: 50 })
    fireEvent.click(camada, { clientX: 50, clientY: 50 })
    fireEvent.keyDown(screen.getByTestId('area-tomografia'), { key: 'ArrowUp' })
    expect(screen.queryByRole('list', { name: 'Medidas neste corte' })).toBeNull()
    fireEvent.keyDown(screen.getByTestId('area-tomografia'), { key: 'ArrowDown' })
    expect(screen.getByRole('list', { name: 'Medidas neste corte' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar medidas' }))
    expect(screen.queryByRole('list', { name: 'Medidas neste corte' })).toBeNull()
  })
})

describe('exportar para pesquisa e IA', () => {
  it('baixa um JSON com as marcacoes do exame em mm', async () => {
    const blobs: Blob[] = []
    URL.createObjectURL = vi.fn((b: Blob) => {
      blobs.push(b)
      return 'blob:marcacoes'
    })
    URL.revokeObjectURL = vi.fn()
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await abrir([JA_MARCADA])
    fireEvent.click(screen.getByRole('button', { name: 'Exportar marcações (JSON)' }))
    expect(clique).toHaveBeenCalled()
    const doc = JSON.parse(await blobs[0].text())
    expect(doc.formato).toBe('radix-imago/marcacoes-tomografia')
    expect(doc.exame.referencia).toBe(55)
    expect(doc.marcacoes).toHaveLength(1)
    expect(doc.marcacoes[0]).toMatchObject({ id: 'm1', plano: 'sagital', corte: 120 })
    clique.mockRestore()
  })

  it('sem marcacoes no exame, o botao fica desativado', async () => {
    await abrir()
    expect((screen.getByRole('button', { name: 'Exportar marcações (JSON)' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

// nas telas que desenham as marcacoes SOBRE A MINIATURA (Pesquisa, Minhas
// imagens, Compartilhadas, segunda opiniao), as marcacoes da tomografia nao
// entram: elas ficam num corte, nao na miniatura (sairiam no lugar errado)
describe('telas de leitura', () => {
  it('so as marcacoes sem corte vao para a miniatura', () => {
    const rx: Marcacao = { id: 'r', tipo: 'oval', x: 0.1, y: 0.1, largura: 0.1, altura: 0.1 }
    expect(marcacoesSobreAImagem([rx, JA_MARCADA])).toEqual([rx])
  })
})
