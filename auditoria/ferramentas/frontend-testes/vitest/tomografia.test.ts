// MEDIDAS E EXPORTACAO NA CURADORIA DE TOMOGRAFIA (24/11/2026, pedido do
// Luciano: "recursos como os melhores sistemas mundiais, prontos para a IA").
// frontend/src/lib/tomografia.ts - contas puras, sem tela:
// - tamanho em mm da imagem de cada plano (a mesma de GET /reconstrucao/{ref}/plano.png:
//   axial = colunas x linhas; sagital = linhas x cortes; coronal = colunas x cortes);
// - distancia (regua) e angulo entre pontos dados em fracao da imagem;
// - exportacao das marcacoes em mm (formato aberto, para pesquisa e para
//   treinar/avaliar IA no futuro; sem dados do paciente, sem diagnostico).
import { describe, expect, it } from 'vitest'
import {
  anguloGraus,
  distanciaMm,
  exportarMarcacoesTc,
  tamanhoDoPlanoMm,
} from '../../../../frontend/src/lib/tomografia'

// 200 cortes a cada 0,5 mm; 400 linhas de 0,3 mm; 500 colunas de 0,25 mm
const GEO = { cortes: 200, linhas: 400, colunas: 500, espacamento_mm: [0.5, 0.3, 0.25] as [number, number, number] }

describe('tamanho da imagem de cada plano, em mm', () => {
  it('axial = colunas x linhas; sagital = linhas x cortes; coronal = colunas x cortes', () => {
    expect(tamanhoDoPlanoMm(GEO, 'axial')).toEqual({ largura: 125, altura: 120 })
    expect(tamanhoDoPlanoMm(GEO, 'sagital')).toEqual({ largura: 120, altura: 100 })
    expect(tamanhoDoPlanoMm(GEO, 'coronal')).toEqual({ largura: 125, altura: 100 })
  })
})

describe('regua e angulo', () => {
  const tam = { largura: 100, altura: 50 }

  it('distancia em mm respeita largura e altura diferentes', () => {
    expect(distanciaMm({ x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, tam)).toBeCloseTo(50)
    expect(distanciaMm({ x: 0.5, y: 0 }, { x: 0.5, y: 1 }, tam)).toBeCloseTo(50)
    // 3-4-5: 30 mm na horizontal e 40 mm na vertical
    expect(distanciaMm({ x: 0, y: 0 }, { x: 0.3, y: 0.8 }, tam)).toBeCloseTo(50)
  })

  it('angulo no vertice, em mm (a imagem nao quadrada nao deforma o angulo)', () => {
    // 10 mm para a direita e 10 mm para baixo: 90 graus
    expect(anguloGraus({ x: 0.6, y: 0.4 }, { x: 0.5, y: 0.4 }, { x: 0.5, y: 0.6 }, tam)).toBeCloseTo(90)
    // 10 mm para a direita e 10 mm na diagonal: 45 graus
    expect(anguloGraus({ x: 0.6, y: 0.4 }, { x: 0.5, y: 0.4 }, { x: 0.6, y: 0.6 }, tam)).toBeCloseTo(45)
    // pontos repetidos: 0, sem dividir por zero
    expect(anguloGraus({ x: 0.5, y: 0.4 }, { x: 0.5, y: 0.4 }, { x: 0.6, y: 0.6 }, tam)).toBe(0)
  })
})

describe('exportar as marcacoes da tomografia', () => {
  const oval = { id: 'm1', tipo: 'oval' as const, x: 0.2, y: 0.4, largura: 0.2, altura: 0.1, plano: 'axial' as const, corte: 10, achado: 'cisto', achado_descricao: null, angulo: 15 }
  const seta = { id: 'm2', tipo: 'seta' as const, x1: 0, y1: 0, x2: 0.5, y2: 0.5, plano: 'sagital' as const, corte: 100 }
  const radiografia = { id: 'r', tipo: 'oval' as const, x: 0.1, y: 0.1, largura: 0.1, altura: 0.1 }

  it('formato aberto, com finalidade, geometria e so as marcacoes com corte', () => {
    const doc = exportarMarcacoesTc(55, GEO, [oval, seta, radiografia])
    expect(doc.formato).toBe('radix-imago/marcacoes-tomografia')
    expect(doc.versao).toBe(1)
    expect(doc.finalidade).toMatch(/ensino e pesquisa/)
    expect(doc.finalidade).toMatch(/não é laudo/)
    expect(doc.exame).toEqual({ referencia: 55, cortes: 200, linhas: 400, colunas: 500, espacamento_mm: [0.5, 0.3, 0.25] })
    expect(doc.marcacoes.map((m) => m.id)).toEqual(['m1', 'm2'])
  })

  it('oval/retangulo: centro, largura e altura em mm, inclinacao, corte e posicao do corte', () => {
    const [m] = exportarMarcacoesTc(55, GEO, [oval]).marcacoes
    expect(m).toMatchObject({ tipo: 'oval', plano: 'axial', corte: 10, posicao_do_corte_mm: 5, achado: 'cisto', angulo_graus: 15 })
    expect(m.centro_mm?.[0]).toBeCloseTo(37.5)
    expect(m.centro_mm?.[1]).toBeCloseTo(54)
    expect(m.largura_mm).toBeCloseTo(25)
    expect(m.altura_mm).toBeCloseTo(12)
  })

  it('seta: inicio e fim em mm e o comprimento', () => {
    const [m] = exportarMarcacoesTc(55, GEO, [seta]).marcacoes
    // sagital: 120 x 100 mm; o corte 100 fica a 100 x 0,25 = 25 mm
    expect(m).toMatchObject({ tipo: 'seta', plano: 'sagital', corte: 100, posicao_do_corte_mm: 25, inicio_mm: [0, 0], fim_mm: [60, 50] })
    expect(m.comprimento_mm).toBeCloseTo(Math.hypot(60, 50))
  })
})
