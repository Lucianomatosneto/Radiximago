// MEDIDAS E EXPORTACAO NA CURADORIA DE TOMOGRAFIA (24/11/2026, pedido do
// Luciano: recursos dos melhores sistemas, praticos para o ensino e a
// pesquisa e prontos para a IA).
//
// A imagem de cada corte vem de GET /reconstrucao/{ref}/plano.png com
// pixels QUADRADOS em mm; o seu tamanho em mm sai da geometria do exame:
// - axial:   largura = colunas x dx, altura = linhas x dy
// - sagital: largura = linhas x dy,  altura = cortes x dz
// - coronal: largura = colunas x dx, altura = cortes x dz
// (espacamento_mm = [dz, dy, dx], como em GET /reconstrucao/{ref}/geometria).
// Os pontos das medidas e das marcacoes estao em FRACAO da imagem (0 a 1);
// multiplicar pela largura/altura em mm da a medida de verdade.
//
// A medida so e tao certa quanto o espacamento que o exame declara.

import type { Marcacao } from './marcacoes'

export type PlanoTomografia = 'axial' | 'sagital' | 'coronal'

export interface GeometriaTomografia {
  cortes: number
  linhas: number
  colunas: number
  /** [entre cortes, entre linhas, entre colunas], em mm */
  espacamento_mm: [number, number, number]
}

export interface TamanhoMm {
  largura: number
  altura: number
}

export interface Ponto {
  x: number
  y: number
}

export function tamanhoDoPlanoMm(g: GeometriaTomografia, plano: PlanoTomografia): TamanhoMm {
  const [dz, dy, dx] = g.espacamento_mm
  if (plano === 'axial') return { largura: g.colunas * dx, altura: g.linhas * dy }
  if (plano === 'sagital') return { largura: g.linhas * dy, altura: g.cortes * dz }
  return { largura: g.colunas * dx, altura: g.cortes * dz }
}

// 24/11/2026 (decisao do Luciano, opcao A): o exame que declara um campo
// maior que uma cabeca (as 2 tomografias da base publica: pixel de 1 mm em
// 512 x 512 = 51 cm) tem medida DUVIDOSA. Mesmo limite do "Tamanho real" do
// visualizador (ohif/app-config.template.js): 35 cm.
export const CAMPO_MAXIMO_TC_MM = 350

/** campo do exame em cm, quando a medida e duvidosa; 0 quando e normal */
export function campoDuvidosoCm(g: GeometriaTomografia): number {
  const [, dy, dx] = g.espacamento_mm
  const campo = Math.max(g.colunas * dx, g.linhas * dy)
  return campo > CAMPO_MAXIMO_TC_MM ? Math.round(campo / 10) : 0
}

/** distancia do corte a partir do primeiro, em mm, na direcao do plano */
function posicaoDoCorteMm(g: GeometriaTomografia, plano: PlanoTomografia, corte: number): number {
  const [dz, dy, dx] = g.espacamento_mm
  const passo = plano === 'axial' ? dz : plano === 'sagital' ? dx : dy
  return corte * passo
}

const emMm = (p: Ponto, t: TamanhoMm): [number, number] => [p.x * t.largura, p.y * t.altura]

export function distanciaMm(a: Ponto, b: Ponto, t: TamanhoMm): number {
  const [ax, ay] = emMm(a, t)
  const [bx, by] = emMm(b, t)
  return Math.hypot(bx - ax, by - ay)
}

/** angulo em graus no VERTICE, entre os bracos vertice->a e vertice->c */
export function anguloGraus(a: Ponto, vertice: Ponto, c: Ponto, t: TamanhoMm): number {
  const [vx, vy] = emMm(vertice, t)
  const [ax, ay] = emMm(a, t)
  const [cx, cy] = emMm(c, t)
  const u = [ax - vx, ay - vy]
  const w = [cx - vx, cy - vy]
  const nu = Math.hypot(u[0], u[1])
  const nw = Math.hypot(w[0], w[1])
  if (nu === 0 || nw === 0) return 0
  const cos = Math.min(1, Math.max(-1, (u[0] * w[0] + u[1] * w[1]) / (nu * nw)))
  return (Math.acos(cos) * 180) / Math.PI
}

// MEDIDAS NA FICHA (24/11/2026, pedido do Luciano, recurso 6): o formato
// gravado no servidor (curations.medidas). O valor nao e guardado: sai dos
// pontos e da geometria do exame (valorDaMedida).
export interface MedidaFicha {
  id: string
  tipo: 'regua' | 'angulo'
  plano: PlanoTomografia
  corte: number
  pontos: Ponto[]
}

/** mm (regua) ou graus (angulo) */
export function valorDaMedida(g: GeometriaTomografia, m: MedidaFicha): number {
  const t = tamanhoDoPlanoMm(g, m.plano)
  if (m.tipo === 'regua') return m.pontos.length >= 2 ? distanciaMm(m.pontos[0], m.pontos[1], t) : 0
  return m.pontos.length >= 3 ? anguloGraus(m.pontos[0], m.pontos[1], m.pontos[2], t) : 0
}

export interface MedidaExportada {
  id: string
  tipo: 'regua' | 'angulo'
  plano: PlanoTomografia
  corte: number
  posicao_do_corte_mm: number
  pontos_mm: [number, number][]
  valor: number
  unidade: 'mm' | 'graus'
}

export interface MarcacaoExportada {
  id: string
  tipo: Marcacao['tipo']
  plano: PlanoTomografia
  corte: number
  posicao_do_corte_mm: number
  achado: string | null
  achado_descricao: string | null
  centro_mm?: [number, number]
  largura_mm?: number
  altura_mm?: number
  angulo_graus?: number
  inicio_mm?: [number, number]
  fim_mm?: [number, number]
  comprimento_mm?: number
}

export interface ExportacaoTomografia {
  formato: 'radix-imago/marcacoes-tomografia'
  versao: 1
  finalidade: string
  sistema_de_coordenadas: string
  exame: {
    referencia: number
    cortes: number
    linhas: number
    colunas: number
    espacamento_mm: [number, number, number]
    /** o exame declara um campo maior que uma cabeca: mm nao confiaveis */
    medida_duvidosa: boolean
  }
  marcacoes: MarcacaoExportada[]
  /** medidas do curador (regua e angulo), com o valor calculado */
  medidas: MedidaExportada[]
}

const arred = (v: number) => Math.round(v * 1000) / 1000

/**
 * Marcacoes da tomografia em mm, num formato aberto (JSON) para ensino,
 * pesquisa e, no futuro, treinar e avaliar modelos de IA. So entram as
 * marcacoes com plano e corte; nao leva dado do paciente (so a referencia
 * interna do exame anonimizado) e nao e laudo.
 */
export function exportarMarcacoesTc(
  referencia: number,
  g: GeometriaTomografia,
  marcacoes: Marcacao[],
  medidas: MedidaFicha[] = [],
): ExportacaoTomografia {
  const saida: MarcacaoExportada[] = []
  for (const m of marcacoes) {
    if (!m.plano || typeof m.corte !== 'number') continue
    const t = tamanhoDoPlanoMm(g, m.plano)
    const base: MarcacaoExportada = {
      id: m.id,
      tipo: m.tipo,
      plano: m.plano,
      corte: m.corte,
      posicao_do_corte_mm: arred(posicaoDoCorteMm(g, m.plano, m.corte)),
      achado: m.achado ?? null,
      achado_descricao: m.achado_descricao ?? null,
    }
    if (m.tipo === 'seta') {
      const a = { x: m.x1 ?? 0, y: m.y1 ?? 0 }
      const b = { x: m.x2 ?? 0, y: m.y2 ?? 0 }
      const [ix, iy] = emMm(a, t)
      const [fx, fy] = emMm(b, t)
      saida.push({ ...base, inicio_mm: [arred(ix), arred(iy)], fim_mm: [arred(fx), arred(fy)], comprimento_mm: arred(distanciaMm(a, b, t)) })
    } else {
      const x = m.x ?? 0
      const y = m.y ?? 0
      const l = m.largura ?? 0
      const h = m.altura ?? 0
      saida.push({
        ...base,
        centro_mm: [arred((x + l / 2) * t.largura), arred((y + h / 2) * t.altura)],
        largura_mm: arred(l * t.largura),
        altura_mm: arred(h * t.altura),
        angulo_graus: m.angulo ?? 0,
      })
    }
  }
  return {
    formato: 'radix-imago/marcacoes-tomografia',
    versao: 1,
    finalidade: 'Material de ensino e pesquisa do Rádix Imago (imagens anonimizadas); não é laudo nem diagnóstico.',
    sistema_de_coordenadas:
      'mm a partir do canto superior esquerdo da imagem do corte (GET /reconstrucao/{ref}/plano.png); x para a direita, y para baixo; nos planos sagital e coronal o alto da cabeça fica em cima. A medida depende do espaçamento declarado pelo exame.',
    exame: {
      referencia,
      cortes: g.cortes,
      linhas: g.linhas,
      colunas: g.colunas,
      espacamento_mm: g.espacamento_mm,
      medida_duvidosa: campoDuvidosoCm(g) > 0,
    },
    marcacoes: saida,
    medidas: medidas.map((m) => {
      const t = tamanhoDoPlanoMm(g, m.plano)
      return {
        id: m.id,
        tipo: m.tipo,
        plano: m.plano,
        corte: m.corte,
        posicao_do_corte_mm: arred(posicaoDoCorteMm(g, m.plano, m.corte)),
        pontos_mm: m.pontos.map((p) => [arred(p.x * t.largura), arred(p.y * t.altura)] as [number, number]),
        valor: arred(valorDaMedida(g, m)),
        unidade: m.tipo === 'regua' ? ('mm' as const) : ('graus' as const),
      }
    }),
  }
}
