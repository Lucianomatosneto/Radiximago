// Posicao (orientacao) da radiografia na Curadoria - pedido de 20/10/2026.
//
// O giro e feito no servidor, no proprio arquivo DICOM e sem perda
// (backend: app/modules/geometria_imagem.py). Aqui ficam:
// - a SUGESTAO de posicao pelos dentes marcados (notacao FDI);
// - o giro das marcacoes que estao no formulario (ainda nao salvas), com a
//   MESMA conta do servidor (girar_ponto) - assim nada sai do lugar.
import type { Marcacao } from './marcacoes'

export type Giro = 90 | 180 | 270

/** Arcada pelos dentes FDI: quadrantes 1, 2 (e 5, 6 deciduos) = superiores;
 *  3, 4 (e 7, 8) = inferiores. */
export type Arcada = 'superior' | 'inferior' | 'ambas'

export function arcadaDosDentes(dentes: number[] | null | undefined): Arcada | null {
  let superiores = false
  let inferiores = false
  for (const dente of dentes ?? []) {
    const quadrante = Math.floor(dente / 10)
    if ([1, 2, 5, 6].includes(quadrante)) superiores = true
    else if ([3, 4, 7, 8].includes(quadrante)) inferiores = true
  }
  if (superiores && inferiores) return 'ambas'
  if (superiores) return 'superior'
  if (inferiores) return 'inferior'
  return null
}

/** Chave da mensagem de sugestao (Curadoria.orientacao.sugestao.*). */
export function chaveSugestao(arcada: Arcada | null, tipoRadiografia: string | null | undefined): string {
  if (tipoRadiografia === 'panoramica') return 'panoramica'
  if (!arcada) return 'semDentes'
  if (arcada === 'ambas') return tipoRadiografia === 'interproximal' ? 'interproximal' : 'ambas'
  return arcada
}

/** Onde o ponto (x, y), relativo de 0 a 1, vai parar depois do giro horario. */
export function girarPonto(x: number, y: number, graus: Giro): [number, number] {
  if (graus === 90) return [1 - y, x]
  if (graus === 180) return [1 - x, 1 - y]
  return [y, 1 - x]
}

const falta = (v: number | undefined) => v === undefined || v === null

export function girarMarcacoes(marcacoes: Marcacao[], graus: Giro): Marcacao[] {
  return marcacoes.map((m) => {
    if (m.tipo === 'seta') {
      if (falta(m.x1) || falta(m.y1) || falta(m.x2) || falta(m.y2)) return m
      const [x1, y1] = girarPonto(m.x1!, m.y1!, graus)
      const [x2, y2] = girarPonto(m.x2!, m.y2!, graus)
      return { ...m, x1, y1, x2, y2 }
    }
    if (falta(m.x) || falta(m.y) || falta(m.largura) || falta(m.altura)) return m
    const [ax, ay] = girarPonto(m.x!, m.y!, graus)
    const [bx, by] = girarPonto(m.x! + m.largura!, m.y! + m.altura!, graus)
    return { ...m, x: Math.min(ax, bx), y: Math.min(ay, by), largura: Math.abs(bx - ax), altura: Math.abs(by - ay) }
  })
}
