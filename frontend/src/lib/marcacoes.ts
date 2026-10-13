export type TipoMarcacao = 'oval' | 'retangulo' | 'seta'

// Coordenadas sempre relativas (0.0-1.0) a largura/altura da imagem, pra
// funcionar em qualquer resolucao/zoom.
// oval/retangulo: x,y = canto superior esquerdo; largura/altura = tamanho.
// seta: x1,y1 = cauda; x2,y2 = ponta.
export interface Marcacao {
  id: string
  tipo: TipoMarcacao
  x?: number
  y?: number
  largura?: number
  altura?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  // Tipo de lesao indicada por essa forma - mesmos valores do enum
  // AchadoPrincipal do backend. Preenchido pelo curador logo apos
  // desenhar; o estudante ve o rotulo ao passar o mouse em cima.
  achado?: string | null
  // Texto livre usado quando achado === "outro" - so faz sentido nesse
  // caso (a lista de achados e fechada, entao nao ha como descrever algo
  // fora dela so com `achado`). O estudante ve esse texto no tooltip no
  // lugar do rotulo generico "Outro", quando preenchido.
  achado_descricao?: string | null
}

export const FORMAS_MARCACAO: { tipo: TipoMarcacao; rotulo: string; icone: string }[] = [
  { tipo: 'oval', rotulo: 'Oval', icone: '◯' },
  { tipo: 'retangulo', rotulo: 'Retângulo', icone: '▭' },
  { tipo: 'seta', rotulo: 'Seta', icone: '↗' },
]

// Mesmos valores do enum AchadoPrincipal no backend - reaproveitado aqui
// pra rotular cada marcacao individual (nao so o achado principal da
// imagem inteira).
export const OPCOES_ACHADO_MARCACAO: { valor: string; label: string }[] = [
  { valor: 'normal', label: 'Normal' },
  { valor: 'carie', label: 'Cárie' },
  { valor: 'lesao_periapical', label: 'Lesão periapical' },
  { valor: 'perda_ossea', label: 'Perda óssea' },
  { valor: 'dente_incluso', label: 'Dente incluso' },
  { valor: 'tratamento_endodontico', label: 'Tratamento endodôntico' },
  { valor: 'erro_tecnico', label: 'Erro técnico' },
  { valor: 'outro', label: 'Outro' },
]

export function rotularAchadoMarcacao(valor: string | null | undefined): string {
  if (!valor) return ''
  return OPCOES_ACHADO_MARCACAO.find((o) => o.valor === valor)?.label ?? valor
}

export function gerarIdMarcacao(): string {
  return Math.random().toString(36).slice(2, 10)
}

// NUMERACAO DAS MARCACOES: cada marcacao recebe o numero da ordem em que o
// curador a fez (1, 2, 3...). O mesmo numero aparece no selo desenhado na
// imagem e na descricao ("Marcação 1: Cárie"), para quem estuda
// ligar facilmente o texto a forma. Este e o ponto (0-1, relativo a
// imagem) onde o numero fica: no canto de cima/esquerda da forma (para nao
// cobrir a lesao) ou, na seta, na cauda (a ponta indica a lesao).
export function pontoNumeroMarcacao(m: Marcacao): { x: number; y: number } {
  if (m.tipo === 'seta') return { x: m.x1 ?? 0, y: m.y1 ?? 0 }
  const x = m.x ?? 0
  const y = m.y ?? 0
  if (m.tipo === 'oval') {
    const rx = (m.largura ?? 0) / 2
    const ry = (m.altura ?? 0) / 2
    return { x: x + rx - rx * Math.SQRT1_2, y: y + ry - ry * Math.SQRT1_2 }
  }
  return { x, y }
}

// ---------------------------------------------------------------------------
// ESTILO DOS MARCADORES (cor por achado, contorno com halo, numero com
// linha-guia, foco/isolar/holofote)
//
// Cores: paleta de Okabe & Ito (2008), a mais usada em publicacoes
// cientificas por continuar distinguivel para pessoas com daltonismo. O
// azul-escuro e o preto da paleta original foram trocados por tons claros
// porque somem sobre as areas escuras da radiografia. A MESMA tabela existe
// no OHIF (ohif/app-config.template.js) e no backend
// (backend/app/modules/marcacoes_imagem.py) - mudar nos tres lugares.
// ---------------------------------------------------------------------------
export const CORES_ACHADO: Record<string, string> = {
  carie: '#E69F00',
  lesao_periapical: '#CC79A7',
  perda_ossea: '#56B4E9',
  dente_incluso: '#009E73',
  tratamento_endodontico: '#F0E442',
  erro_tecnico: '#D55E00',
  normal: '#FFFFFF',
  outro: '#C3CEDD',
}
export const COR_SEM_ACHADO = '#FFFFFF'

export function corMarcacao(m: Pick<Marcacao, 'achado'>): string {
  return (m.achado && CORES_ACHADO[m.achado]) || COR_SEM_ACHADO
}

type Ponto = [number, number]

export interface GeometriaMarcacao {
  tipo: TipoMarcacao
  /** contorno da forma em pixels (oval/retangulo: poligono fechado) */
  pontos: Ponto[]
  /** caminho SVG da forma (pixels) */
  caminho: string
  /** seta: cauda (a) e ponta (b) */
  seta?: { a: Ponto; b: Ponto; ponta: string }
  /** onde a linha-guia encosta na forma */
  ancora: Ponto
  /** centro do selo com o numero (fora da forma) */
  selo: Ponto
  area: number
}

const DIST_SELO_PX = 24

/**
 * Calcula a forma em PIXELS de tela. `paraTela` converte a coordenada
 * relativa (0-1) da imagem no pixel correspondente - assim a mesma conta
 * serve para qualquer tamanho, recorte ou zoom, sem a forma deformar.
 */
export function geometriaMarcacao(m: Marcacao, paraTela: (rx: number, ry: number) => Ponto): GeometriaMarcacao {
  if (m.tipo === 'seta') {
    const a = paraTela(m.x1 ?? 0, m.y1 ?? 0)
    const b = paraTela(m.x2 ?? 0, m.y2 ?? 0)
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0])
    const tam = 13
    const abertura = (28 * Math.PI) / 180
    const p1: Ponto = [b[0] - tam * Math.cos(ang - abertura), b[1] - tam * Math.sin(ang - abertura)]
    const p2: Ponto = [b[0] - tam * Math.cos(ang + abertura), b[1] - tam * Math.sin(ang + abertura)]
    let dx = a[0] - b[0]
    let dy = a[1] - b[1]
    const len = Math.hypot(dx, dy) || 1
    dx /= len
    dy /= len
    return {
      tipo: 'seta',
      pontos: [a, b],
      caminho: `M${a[0]},${a[1]} L${b[0]},${b[1]}`,
      seta: { a, b, ponta: `M${p1[0]},${p1[1]} L${b[0]},${b[1]} L${p2[0]},${p2[1]}` },
      ancora: a,
      selo: [a[0] + dx * (DIST_SELO_PX - 6), a[1] + dy * (DIST_SELO_PX - 6)],
      area: len * 10,
    }
  }
  const x = m.x ?? 0
  const y = m.y ?? 0
  const w = m.largura ?? 0
  const h = m.altura ?? 0
  let pontos: Ponto[]
  if (m.tipo === 'oval') {
    pontos = []
    for (let k = 0; k < 72; k++) {
      const t = (k / 72) * Math.PI * 2
      pontos.push(paraTela(x + w / 2 + (w / 2) * Math.cos(t), y + h / 2 + (h / 2) * Math.sin(t)))
    }
  } else {
    pontos = [paraTela(x, y), paraTela(x + w, y), paraTela(x + w, y + h), paraTela(x, y + h)]
  }
  const rel = pontoNumeroMarcacao(m)
  const ancora = paraTela(rel.x, rel.y)
  const centro = paraTela(x + w / 2, y + h / 2)
  let dx = ancora[0] - centro[0]
  let dy = ancora[1] - centro[1]
  const len = Math.hypot(dx, dy)
  if (len < 0.5) {
    dx = -Math.SQRT1_2
    dy = -Math.SQRT1_2
  } else {
    dx /= len
    dy /= len
  }
  let area = 0
  for (let i = 0, j = pontos.length - 1; i < pontos.length; j = i++) {
    area += (pontos[j][0] + pontos[i][0]) * (pontos[j][1] - pontos[i][1])
  }
  return {
    tipo: m.tipo,
    pontos,
    caminho: 'M' + pontos.map((p) => `${p[0]},${p[1]}`).join(' L') + ' Z',
    ancora,
    selo: [ancora[0] + dx * DIST_SELO_PX, ancora[1] + dy * DIST_SELO_PX],
    area: Math.abs(area / 2),
  }
}

function dentroPoligono(px: number, py: number, pts: Ponto[]): boolean {
  let dentro = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]
    const [xj, yj] = pts[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-9) + xi) dentro = !dentro
  }
  return dentro
}

function distSegmento(px: number, py: number, a: Ponto, b: Ponto): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))
}

/**
 * Qual marcacao esta sob o mouse (indice) ou null. Ordem de prioridade: o
 * selo com o numero; depois a seta (perto da linha); depois, entre as
 * formas que contem o ponto, a MENOR - assim, com formas sobrepostas, a
 * de dentro continua alcancavel.
 */
export function marcacaoSobPonto(geos: (GeometriaMarcacao | null)[], px: number, py: number): number | null {
  for (let i = geos.length - 1; i >= 0; i--) {
    const g = geos[i]
    if (g && Math.hypot(px - g.selo[0], py - g.selo[1]) <= 13) return i
  }
  for (let i = 0; i < geos.length; i++) {
    const g = geos[i]
    if (g?.seta && distSegmento(px, py, g.seta.a, g.seta.b) <= 7) return i
  }
  let achado: number | null = null
  let menor = Infinity
  geos.forEach((g, i) => {
    if (g && !g.seta && g.area < menor && dentroPoligono(px, py, g.pontos)) {
      achado = i
      menor = g.area
    }
  })
  return achado
}

/** Buraco do "holofote": a regiao da marcacao que fica clara. */
export function caminhoHolofote(g: GeometriaMarcacao, largura: number, altura: number): string {
  const fora = `M0,0 H${largura} V${altura} H0 Z`
  if (!g.seta) return `${fora} ${g.caminho}`
  const { a, b } = g.seta
  const cx = (a[0] + b[0]) / 2
  const cy = (a[1] + b[1]) / 2
  const r = Math.hypot(b[0] - a[0], b[1] - a[1]) / 2 + 30
  const pts: string[] = []
  for (let k = 0; k < 48; k++) {
    const t = (k / 48) * Math.PI * 2
    pts.push(`${cx + r * Math.cos(t)},${cy + r * Math.sin(t)}`)
  }
  return `${fora} M${pts.join(' L')} Z`
}
