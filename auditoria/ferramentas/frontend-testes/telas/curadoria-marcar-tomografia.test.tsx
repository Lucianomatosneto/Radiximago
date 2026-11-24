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

vi.mock('../../../../frontend/src/components/segmentacao/PintorSegmentacao', () => ({
  default: (p: { urlImagem?: string; corteTc?: { plano: string; corte: number }; curationId: number }) => (
    <div data-testid="pintor" data-url={p.urlImagem} data-corte={p.corteTc ? `${p.corteTc.plano}:${p.corteTc.corte}` : ''} data-ficha={p.curationId} />
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

// atalhos (24/11/2026, pedido do Luciano): A, S e C trocam o plano; R liga
// a regua e G o angulo (de novo desliga). So com a area da imagem em foco,
// para nao atrapalhar quem digita na ficha; clicar na imagem da o foco.
describe('atalhos de teclado', () => {
  it('A, S e C trocam o plano; R e G ligam e desligam a regua e o angulo', async () => {
    await abrir()
    const area = screen.getByTestId('area-tomografia')
    fireEvent.keyDown(area, { key: 's' })
    expect(url()).toContain('plano=sagital&indice=250')
    fireEvent.keyDown(area, { key: 'C' })
    expect(url()).toContain('plano=coronal')
    fireEvent.keyDown(area, { key: 'a' })
    expect(url()).toContain('plano=axial')
    fireEvent.keyDown(area, { key: 'r' })
    expect(screen.getByRole('button', { name: 'Régua' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.keyDown(area, { key: 'g' })
    expect(screen.getByRole('button', { name: 'Ângulo' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Régua' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.keyDown(area, { key: 'g' })
    expect(screen.getByRole('button', { name: 'Ângulo' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('com Ctrl (copiar, colar...) os atalhos nao agem', async () => {
    await abrir()
    fireEvent.keyDown(screen.getByTestId('area-tomografia'), { key: 'c', ctrlKey: true })
    expect(url()).toContain('plano=axial')
  })

  it('clicar na imagem da o foco a area (para os atalhos)', async () => {
    await abrir()
    const area = screen.getByTestId('area-tomografia')
    fireEvent.mouseDown(screen.getByTestId('marcador'), { button: 0 })
    expect(document.activeElement).toBe(area)
  })

  it('a dica mostra os atalhos', async () => {
    await abrir()
    expect(screen.getByText(/A, S, C trocam o plano/)).toBeTruthy()
  })
})

// TRES PLANOS (24/11/2026, recurso 7): o botao "Três planos" (ou T) mostra
// axial, sagital e coronal juntos, sincronizados com o corte aberto.
describe('tres planos', () => {
  it('liga e desliga; o corte aberto e o cursor andam juntos', async () => {
    await abrir()
    expect(screen.queryByRole('group', { name: 'Três planos' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Três planos' }))
    const grupo = screen.getByRole('group', { name: 'Três planos' })
    const src = (nome: string) => within(grupo).getByRole('img', { name: new RegExp(`^${nome}`) }).getAttribute('src') ?? ''
    // abre no meio do exame: corte 100, coluna 250, linha 200
    expect(src('Axial')).toContain('plano=axial&indice=100')
    expect(src('Sagital')).toContain('plano=sagital&indice=250')
    expect(src('Coronal')).toContain('plano=coronal&indice=200')
    // passar o corte axial move o cursor
    fireEvent.keyDown(screen.getByTestId('area-tomografia'), { key: 'ArrowUp' })
    expect(src('Axial')).toContain('indice=101')
    // clicar no sagital leva o corte principal (axial) ao mesmo lugar
    const sagital = within(grupo).getByRole('button', { name: /^Sagital/ })
    caixa100(sagital)
    fireEvent.click(sagital, { clientX: 50, clientY: 25 })
    expect(url()).toContain('plano=axial&indice=150')
    // duplo clique no coronal: o coronal vira o plano principal, no mesmo ponto
    fireEvent.doubleClick(within(grupo).getByRole('button', { name: /^Coronal/ }))
    expect(url()).toContain('plano=coronal&indice=200')
    fireEvent.keyDown(screen.getByTestId('area-tomografia'), { key: 't' })
    expect(screen.queryByRole('group', { name: 'Três planos' })).toBeNull()
  })
})

// PINTAR A LESAO NOS CORTES (24/11/2026, recurso 8): com a ficha ligada
// (curationId), a aba "Pintura" troca as formas pelo pincel das radiografias
// sobre a imagem do corte aberto; passar o corte troca a pintura.
describe('pintura no corte', () => {
  async function abrirComFicha() {
    servidorFalso({ 'GET /reconstrucao/55/geometria': { corpo: GEOMETRIA } })
    montarTela(<MarcadorTomografia orthancReferenceId={55} marcacoes={[]} onMarcar={vi.fn()} curationId={9} dentesFicha={[36]} />)
    await screen.findByTestId('marcador')
  }

  it('sem a ficha nao ha aba de pintura', async () => {
    await abrir()
    expect(screen.queryByRole('tab', { name: 'Pintura' })).toBeNull()
  })

  it('aba Pintura: pincel no corte aberto; trocar o corte troca a pintura; Formas volta', async () => {
    await abrirComFicha()
    expect(screen.getByRole('tab', { name: 'Formas' }).getAttribute('aria-selected')).toBe('true')
    fireEvent.click(screen.getByRole('tab', { name: 'Pintura' }))
    const pintor = screen.getByTestId('pintor')
    expect(pintor.getAttribute('data-url')).toContain('/reconstrucao/55/plano.png?plano=axial&indice=100')
    expect(pintor.getAttribute('data-corte')).toBe('axial:100')
    expect(pintor.getAttribute('data-ficha')).toBe('9')
    expect(screen.queryByTestId('marcador')).toBeNull()
    fireEvent.keyDown(screen.getByTestId('area-tomografia'), { key: 'ArrowUp' })
    expect(screen.getByTestId('pintor').getAttribute('data-corte')).toBe('axial:101')
    fireEvent.click(screen.getByRole('tab', { name: 'Formas' }))
    expect(screen.getByTestId('marcador')).toBeTruthy()
  })

  it('na pintura, a roda do mouse fica com o pincel (zoom), sem passar o corte', async () => {
    await abrirComFicha()
    fireEvent.click(screen.getByRole('tab', { name: 'Pintura' }))
    fireEvent.wheel(screen.getByTestId('area-tomografia'), { deltaY: -100 })
    expect(screen.getByTestId('pintor').getAttribute('data-corte')).toBe('axial:100')
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

describe('medida duvidosa (24/11/2026, decisao do Luciano: opcao A)', () => {
  it('exame com campo de 51 cm: aviso na tela de marcacao', async () => {
    servidorFalso({ 'GET /reconstrucao/55/geometria': { corpo: { ...GEOMETRIA, cortes: 400, linhas: 512, colunas: 512, espacamento_mm: [1, 1, 1] } } })
    montarTela(<MarcadorTomografia orthancReferenceId={55} marcacoes={[]} onMarcar={vi.fn()} />)
    await screen.findByTestId('marcador')
    const aviso = screen.getByRole('note', { name: 'Medida duvidosa' })
    expect(aviso.textContent).toMatch(/51 cm/)
    expect(aviso.textContent).toMatch(/comparar/)
  })

  it('exame com medida normal: sem aviso', async () => {
    await abrir()
    expect(screen.queryByRole('note', { name: 'Medida duvidosa' })).toBeNull()
  })
})

// MEDIDAS NA FICHA (24/11/2026, pedido do Luciano, recurso 6): com a ficha
// ligada (onMedir), a regua e o angulo viram dado da ficha: cada medida nova
// vai para onMedir no formato do servidor (tipo, plano, corte, pontos), e as
// medidas ja gravadas aparecem no corte delas, com o valor calculado pela
// geometria do exame.
describe('medidas na ficha', () => {
  const GRAVADA = { id: 'g1', tipo: 'regua' as const, plano: 'axial' as const, corte: 100, pontos: [{ x: 0, y: 0.5 }, { x: 0.2, y: 0.5 }] }

  async function abrirComFicha(medidas = [GRAVADA]) {
    servidorFalso({ 'GET /reconstrucao/55/geometria': { corpo: GEOMETRIA } })
    const onMedir = vi.fn()
    montarTela(<MarcadorTomografia orthancReferenceId={55} marcacoes={[]} onMarcar={vi.fn()} medidas={medidas} onMedir={onMedir} />)
    await screen.findByTestId('marcador')
    return onMedir
  }

  it('a medida gravada aparece no corte dela, com o valor calculado (0,2 x 150 mm = 30 mm)', async () => {
    await abrirComFicha()
    expect(within(screen.getByRole('list', { name: 'Medidas neste corte' })).getByText('Régua: 30,0 mm')).toBeTruthy()
    expect(screen.getByText('As medidas entram na ficha quando ela é salva.')).toBeTruthy()
    fireEvent.keyDown(screen.getByTestId('area-tomografia'), { key: 'ArrowUp' })
    expect(screen.queryByRole('list', { name: 'Medidas neste corte' })).toBeNull()
  })

  it('medida nova vai para a ficha no formato do servidor', async () => {
    const onMedir = await abrirComFicha()
    fireEvent.click(screen.getByRole('button', { name: 'Régua' }))
    const camada = screen.getByTestId('camada-medida')
    caixa100(camada)
    fireEvent.click(camada, { clientX: 0, clientY: 50 })
    fireEvent.click(camada, { clientX: 50, clientY: 50 })
    const [lista] = onMedir.mock.calls.at(-1) ?? []
    expect(lista).toHaveLength(2)
    expect(lista[0]).toEqual(GRAVADA)
    expect(lista[1]).toMatchObject({ tipo: 'regua', plano: 'axial', corte: 100, pontos: [{ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }] })
    expect(lista[1]).not.toHaveProperty('valor')
  })

  it('"Limpar medidas" tira da ficha so as do corte aberto', async () => {
    const outra = { ...GRAVADA, id: 'g2', corte: 3 }
    const onMedir = await abrirComFicha([GRAVADA, outra])
    fireEvent.click(screen.getByRole('button', { name: 'Limpar medidas' }))
    expect(onMedir).toHaveBeenLastCalledWith([outra])
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
    // sem medidas na ficha: lista vazia
    expect(doc.medidas).toEqual([])
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
