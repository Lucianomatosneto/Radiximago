// Testes de funções essenciais da Curadoria: a posição da radiografia (arcada dentária, notação FDI).
// Dados 100% sintéticos (números de dentes), sem nenhuma imagem ou paciente.
import { describe, expect, it } from 'vitest'
import { arcadaDosDentes, chaveSugestao, girarPonto } from '../../../../frontend/src/lib/orientacao'

describe('arcadaDosDentes (FDI)', () => {
  it('dentes 11-28 são arcada superior', () => {
    expect(arcadaDosDentes([11, 21, 28])).toBe('superior')
  })
  it('dentes 31-48 são arcada inferior', () => {
    expect(arcadaDosDentes([31, 41, 48])).toBe('inferior')
  })
  it('decíduos: quadrantes 5 e 6 superior, 7 e 8 inferior', () => {
    expect(arcadaDosDentes([51, 61])).toBe('superior')
    expect(arcadaDosDentes([71, 81])).toBe('inferior')
  })
  it('superior + inferior = ambas', () => {
    expect(arcadaDosDentes([16, 36])).toBe('ambas')
  })
  it('sem dentes = nulo (lista vazia, null e undefined)', () => {
    expect(arcadaDosDentes([])).toBeNull()
    expect(arcadaDosDentes(null)).toBeNull()
    expect(arcadaDosDentes(undefined)).toBeNull()
  })
})

describe('chaveSugestao', () => {
  it('panorâmica tem prioridade sobre a arcada', () => {
    expect(chaveSugestao('superior', 'panoramica')).toBe('panoramica')
  })
  it('sem arcada = semDentes', () => {
    expect(chaveSugestao(null, 'periapical')).toBe('semDentes')
  })
  it('ambas + interproximal', () => {
    expect(chaveSugestao('ambas', 'interproximal')).toBe('interproximal')
    expect(chaveSugestao('ambas', 'periapical')).toBe('ambas')
  })
})

describe('girarPonto (giro das marcações do curador)', () => {
  it('quatro giros de 90° devolvem o ponto ao lugar original (nada "sai do lugar")', () => {
    let p: [number, number] = [0.25, 0.7]
    for (let i = 0; i < 4; i++) p = girarPonto(p[0], p[1], 90)
    expect(p[0]).toBeCloseTo(0.25)
    expect(p[1]).toBeCloseTo(0.7)
  })
  it('180° = dois giros de 90°', () => {
    const a = girarPonto(0.2, 0.4, 180)
    const [x, y] = girarPonto(...girarPonto(0.2, 0.4, 90), 90)
    expect(a[0]).toBeCloseTo(x)
    expect(a[1]).toBeCloseTo(y)
  })
  it('o ponto continua dentro da imagem (0 a 1)', () => {
    for (const g of [90, 180, 270] as const) {
      const [x, y] = girarPonto(0.1, 0.9, g)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(1)
    }
  })
})
