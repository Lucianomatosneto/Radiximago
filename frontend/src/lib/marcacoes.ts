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
