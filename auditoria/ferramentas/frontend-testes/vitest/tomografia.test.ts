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
  avaliarDesafio,
  campoDuvidosoCm,
  pontoEm3dMm,
  valorDaMedida,
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
    expect(doc.exame).toEqual({ referencia: 55, cortes: 200, linhas: 400, colunas: 500, espacamento_mm: [0.5, 0.3, 0.25], medida_duvidosa: false })
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

// 24/11/2026 (decisao do Luciano, opcao A): as 2 tomografias do acervo
// (base publica) declaram pixel de 1 mm em 512 x 512 = campo de 51 cm, maior
// que uma cabeca. A medida em mm desses exames nao e confiavel: a tela avisa
// e a exportacao marca "medida_duvidosa" (mesmo limite do visualizador: 35 cm).
describe('medida duvidosa', () => {
  const ACERVO = { cortes: 400, linhas: 512, colunas: 512, espacamento_mm: [1, 1, 1] as [number, number, number] }

  it('campo acima de 35 cm: devolve o campo em cm; normal: 0', () => {
    expect(campoDuvidosoCm(ACERVO)).toBe(51)
    expect(campoDuvidosoCm(GEO)).toBe(0)
    expect(campoDuvidosoCm({ ...ACERVO, espacamento_mm: [0.3, 0.3, 0.3] })).toBe(0)
  })

  it('a exportacao avisa quando a medida e duvidosa', () => {
    expect(exportarMarcacoesTc(1, ACERVO, []).exame.medida_duvidosa).toBe(true)
    expect(exportarMarcacoesTc(1, GEO, []).exame.medida_duvidosa).toBe(false)
  })
})

// MEDIDAS NA FICHA (24/11/2026, recurso 6): o valor sai dos pontos e da
// geometria (nao e guardado); a exportacao leva as medidas com o valor.
describe('medidas da ficha', () => {
  const REGUA = { id: 'r', tipo: 'regua' as const, plano: 'axial' as const, corte: 4, pontos: [{ x: 0, y: 0.5 }, { x: 0.4, y: 0.5 }] }
  const ANGULO = { id: 'a', tipo: 'angulo' as const, plano: 'coronal' as const, corte: 9, pontos: [{ x: 0.6, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.7 }] }

  it('valor: regua em mm (axial 125 mm de largura) e angulo em graus', () => {
    expect(valorDaMedida(GEO, REGUA)).toBeCloseTo(50)
    expect(valorDaMedida(GEO, ANGULO)).toBeCloseTo(90)
  })

  it('a exportacao leva as medidas com o valor e a unidade', () => {
    const doc = exportarMarcacoesTc(55, GEO, [], [REGUA, ANGULO])
    expect(doc.medidas).toHaveLength(2)
    expect(doc.medidas[0]).toMatchObject({ id: 'r', tipo: 'regua', plano: 'axial', corte: 4, unidade: 'mm' })
    expect(doc.medidas[0].valor).toBeCloseTo(50)
    expect(doc.medidas[1]).toMatchObject({ tipo: 'angulo', unidade: 'graus' })
    expect(doc.medidas[0].pontos_mm[1][0]).toBeCloseTo(50)
  })
})

// MODO DESAFIO (24/11/2026, pedido do Luciano): o estudante clica onde acha
// que esta a lesao, em qualquer plano; o Radix leva o clique e a marcacao do
// curador para o MESMO espaco 3D (mm) e confere a distancia. Acerta quem
// cai dentro da lesao (metade do maior lado da marcacao) ou a ate 5 mm.
describe('modo desafio: pontos em 3D', () => {
  // 100 cortes de 0,5 mm; 200 linhas de 0,25 mm; 300 colunas de 0,2 mm
  const G = { cortes: 100, linhas: 200, colunas: 300, espacamento_mm: [0.5, 0.25, 0.2] as [number, number, number] }

  it('o mesmo ponto visto nos tres planos da a mesma posicao em mm', () => {
    // voxel: coluna 150, linha 50, corte 80 -> x 30 mm, y 12,5 mm, z 40 mm
    const axial = pontoEm3dMm(G, 'axial', 80, { x: 150 / 300, y: 50 / 200 })
    // sagital: corte = coluna; x = linha; y de cima para baixo = cortes de cima para baixo
    const sagital = pontoEm3dMm(G, 'sagital', 150, { x: 50 / 200, y: 1 - 80 / 100 })
    // coronal: corte = linha; x = coluna
    const coronal = pontoEm3dMm(G, 'coronal', 50, { x: 150 / 300, y: 1 - 80 / 100 })
    for (const p of [axial, sagital, coronal]) {
      expect(p[0]).toBeCloseTo(30)
      expect(p[1]).toBeCloseTo(12.5)
      expect(p[2]).toBeCloseTo(40)
    }
  })

  it('avalia os palpites: acerto em outro plano, erro longe, cada lesao conta uma vez', () => {
    // lesao oval no sagital, centrada no ponto acima, com 4 mm de lado
    const lesao = { id: 'l1', tipo: 'oval' as const, plano: 'sagital' as const, corte: 150, x: 50 / 200 - 0.01, y: 0.2 - 0.02, largura: 0.02, altura: 0.04 }
    const seta = { id: 'l2', tipo: 'seta' as const, plano: 'axial' as const, corte: 10, x1: 0, y1: 0, x2: 0.9, y2: 0.9 }
    const perto = { plano: 'axial' as const, corte: 81, ponto: { x: 151 / 300, y: 51 / 200 } }
    const longe = { plano: 'axial' as const, corte: 20, ponto: { x: 0.1, y: 0.1 } }
    const r = avaliarDesafio(G, [lesao, seta], [perto, perto, longe])
    expect(r.encontradas).toBe(1)
    expect(r.total).toBe(2)
    expect(r.porLesao).toEqual([
      { id: 'l1', encontrada: true },
      { id: 'l2', encontrada: false },
    ])
    expect(r.palpitesCertos).toEqual([true, true, false])
  })
})
