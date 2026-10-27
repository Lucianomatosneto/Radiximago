// SEGUNDA OPINIAO ITEM POR ITEM (out/2026) - tipos e o "catalogo" de itens
// da ficha que o revisor avalia. As chaves sao as MESMAS do servidor
// (backend/app/modules/curation/segunda_opiniao.py, ITENS_REVISAVEIS).

import type { Marcacao } from '../../lib/marcacoes'

export type Avaliacao = 'concordo' | 'ajustar' | 'discordo'
export type Classificacao = 'concordo' | 'discordancia_menor' | 'discordancia_importante'
export type Situacao = 'pendente' | 'incorporada' | 'dispensada'
/** valor: lista de opcoes | dentes: numeros FDI | texto: junta ao texto | nota: vai para as observacoes */
export type TipoItem = 'valor' | 'dentes' | 'texto' | 'nota'

export interface Pessoa {
  id: number
  nome: string | null
}

export interface ItemFila {
  id: number
  motivo: string
  primeiro_parecer: string | null
  criado_em: string | null
  respondido_em?: string | null
  solicitante?: Pessoa
  revisor?: Pessoa | null
  pode_responder?: boolean
  classificacao?: Classificacao | null
  concordancia?: string | null
  anotacoes_pendentes?: number
  curation: { id: number; achado_principal: string | null; tipo_radiografia: string | null }
  orthanc_reference: { id: number; orthanc_id: string }
}

export interface AnotacaoServidor {
  id: number
  item: string
  rotulo: string
  tipo_item: TipoItem
  avaliacao: Avaliacao
  nota: string | null
  valor_sugerido: string | number[] | null
  situacao: Situacao
  resolvido_em: string | null
}

export interface DetalheRevisao {
  id: number
  curation_id: number
  orthanc_reference_id: number | null
  status: 'solicitada' | 'respondida' | 'finalizada'
  status_ficha: string | null
  motivo: string
  primeiro_parecer: string | null
  criado_em: string | null
  respondido_em: string | null
  solicitante: Pessoa | null
  curador_da_ficha: Pessoa | null
  revisor: Pessoa | null
  classificacao: Classificacao | null
  concordancia: string | null
  parecer_revisor: string | null
  anotacoes: AnotacaoServidor[]
  pode_responder: boolean
  pode_incorporar: boolean
}

export interface AchadoDaFicha {
  tipo: string
  regiao_anatomica: string | null
  dentes: number[]
  descricao: string | null
}

export interface Ficha {
  id: number
  tipo_radiografia: string | null
  dentes: number[] | null
  idade_min: number | null
  idade_max: number | null
  genero: string | null
  achado_principal: string | null
  marcacoes: Marcacao[]
  achados_detalhe: string | null
  alteracoes_observadas: string[] | null
  qualidade_tecnica: string | null
  descricao_didatica: string | null
  observacoes_internas: string | null
  status: string
  achados?: AchadoDaFicha[]
  erros_tecnicos?: string[]
}

export interface ViewerInfo {
  abrivel: boolean
  motivo?: string
  viewer_url: string | null
}

/** Um item da ficha como aparece na tela (rotulo + o que o curador registrou) */
export interface ItemFicha {
  chave: string
  rotulo: string
  valor: string
  tipo: TipoItem
  grupo: 'dados' | 'achados' | 'textos'
  /** itens com lista de valores: as opcoes (valor cru) */
  opcoes?: string[]
}

export interface AnotacaoRascunho {
  avaliacao: Avaliacao
  nota: string
  valor: string
}

export const OPCOES_TIPO = ['periapical', 'panoramica', 'interproximal', 'oclusal', 'tomografia']
export const OPCOES_QUALIDADE = ['otima', 'boa', 'regular', 'insatisfatoria']
export const OPCOES_GENERO = ['masculino', 'feminino']
export const OPCOES_ACHADO = [
  'normal', 'carie', 'lesao_periapical', 'perda_ossea', 'dente_incluso', 'tratamento_endodontico', 'erro_tecnico', 'outro',
]
export const CHAVE_ACHADO: Record<string, string> = {
  normal: 'normal',
  carie: 'carie',
  lesao_periapical: 'lesaoPeriapical',
  perda_ossea: 'perdaOssea',
  dente_incluso: 'denteIncluso',
  tratamento_endodontico: 'tratamentoEndodontico',
  erro_tecnico: 'erroTecnico',
  outro: 'outro',
}

/** "11, 21 e 36" -> [11, 21, 36] (so numeros FDI validos; null se algo nao for numero) */
export function lerDentes(texto: string): number[] | null {
  const partes = texto.split(/[\s,;e]+/).filter(Boolean)
  if (partes.length === 0) return []
  const numeros = partes.map((p) => Number(p))
  if (numeros.some((n) => !Number.isInteger(n) || n < 11 || n > 48 || n % 10 === 0 || n % 10 === 9)) return null
  return Array.from(new Set(numeros)).sort((a, b) => a - b)
}

export function formatarData(valor: string | null | undefined, tagLocale: string): string {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleString(tagLocale, { dateStyle: 'short', timeStyle: 'short' })
}

export function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?'
  const partes = nome.trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p))
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

export async function extrairErro(resposta: Response, generica: string): Promise<string> {
  try {
    const dados = await resposta.json()
    if (typeof dados?.detail === 'string') return dados.detail
  } catch {
    // sem corpo JSON
  }
  return generica
}

export const API = process.env.NEXT_PUBLIC_API_URL
