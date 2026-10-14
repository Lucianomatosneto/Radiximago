// ROTEIRO DA CURADORIA: estado de cada secao da ficha (concluida ou
// pendente), para guiar o curador pela sequencia sem pular nada.
//
// Regra de "nada em branco" (inspirada nas listas de verificacao dos laudos
// estruturados): uma secao so conta como concluida quando
// - tem o conteudo obrigatorio preenchido (Dados da imagem, Descricao), ou
// - tem conteudo, ou o curador declarou "Nada a registrar" nela
//   (secoes opcionais - fica registrado que ela FOI olhada, e nao esquecida).
// As declaracoes valem para a ficha aberta (sao zeradas ao trocar de imagem).

import { SECOES_FICHA, type SecaoFicha } from './secoesCuradoria'

export type EstadoSecao = 'concluida' | 'pendente'

export interface FichaProgresso {
  tipo_radiografia: string
  dentes: number[]
  genero: string
  qualidade_tecnica: string
  anonimizacao_validada: boolean
  alteracoes_observadas: string[]
  achados_detalhe: string
  descricao_didatica: string
  observacoes_internas: string
  marcacoes: { achado?: string | null; achado_descricao?: string | null }[]
}

/** secoes que aceitam "Nada a registrar" */
export const SECOES_OPCIONAIS: SecaoFicha[] = [
  'marcacoes',
  'alteracoes',
  'achados_detalhados',
  'achados_dente',
  'erro_tecnico',
  'observacoes',
]

export function temConteudo(secao: SecaoFicha, f: FichaProgresso): boolean {
  switch (secao) {
    case 'dados':
      return (
        f.anonimizacao_validada &&
        !!f.tipo_radiografia &&
        !!f.genero &&
        !!f.qualidade_tecnica &&
        (f.tipo_radiografia === 'panoramica' || f.dentes.length > 0)
      )
    case 'marcacoes':
      return (
        f.marcacoes.length > 0 &&
        f.marcacoes.every((m) => !!m.achado && (m.achado !== 'outro' || !!(m.achado_descricao || '').trim()))
      )
    case 'alteracoes':
      return f.alteracoes_observadas.length > 0
    case 'achados_detalhados':
      return !!f.achados_detalhe.trim()
    case 'descricao':
      return !!f.descricao_didatica.trim()
    case 'observacoes':
      return !!f.observacoes_internas.trim()
    default:
      // achados por dente e erro tecnico ficam em paineis proprios (API
      // separada): contam como concluidos quando declarados revisados
      return false
  }
}

export function estadoSecoes(f: FichaProgresso, revisadas: SecaoFicha[]): Record<SecaoFicha, EstadoSecao> {
  const estado = {} as Record<SecaoFicha, EstadoSecao>
  for (const s of SECOES_FICHA) {
    const ok = temConteudo(s, f) || (SECOES_OPCIONAIS.includes(s) && revisadas.includes(s))
    estado[s] = ok ? 'concluida' : 'pendente'
  }
  return estado
}

/** proxima secao pendente depois da atual (volta ao inicio se preciso) */
export function proximaPendente(estado: Record<SecaoFicha, EstadoSecao>, atual: SecaoFicha): SecaoFicha | null {
  const i = SECOES_FICHA.indexOf(atual)
  const ordem = [...SECOES_FICHA.slice(i + 1), ...SECOES_FICHA.slice(0, i + 1)]
  return ordem.find((s) => estado[s] === 'pendente') ?? null
}
