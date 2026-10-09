'use client'

import { useTranslations } from 'next-intl'
import { FORMAS_MARCACAO, rotularAchadoMarcacao, type Marcacao } from './marcacoes'

// Texto da curadoria de uma imagem, montado num so lugar para ser igual em
// todo o sistema: na caixinha que abre ao passar o mouse no visualizador e
// na impressao "com descricao".

export interface ItemDescritivel {
  numero?: number
  tipo_radiografia?: string | null
  qualidade_tecnica?: string | null
  dentes?: number[] | null
  achado_principal?: string | null
  alteracoes_observadas?: string[] | null
  achados_detalhe?: string | null
  descricao_didatica?: string | null
  marcacoes?: Marcacao[]
}

export interface LinhaDescricao {
  rotulo: string
  valor: string
}

const CHAVE_ACHADO: Record<string, string> = {
  normal: 'normal',
  carie: 'carie',
  lesao_periapical: 'lesaoPeriapical',
  perda_ossea: 'perdaOssea',
  dente_incluso: 'denteIncluso',
  tratamento_endodontico: 'tratamentoEndodontico',
  erro_tecnico: 'erroTecnico',
  outro: 'outro',
}
const TIPOS = ['periapical', 'panoramica', 'interproximal', 'oclusal']
const QUALIDADES = ['otima', 'boa', 'regular', 'insatisfatoria']

export function textoMarcacao(m: Marcacao): string {
  const achado = m.achado === 'outro' && m.achado_descricao ? m.achado_descricao : rotularAchadoMarcacao(m.achado)
  const forma = FORMAS_MARCACAO.find((f) => f.tipo === m.tipo)?.rotulo
  return [achado || '—', forma].filter(Boolean).join(' · ')
}

/** Devolve uma funcao que transforma um item em linhas "rotulo: valor" (so as preenchidas). */
export function useDescricaoCuradoria() {
  const t = useTranslations('DescricaoCuradoria')
  const tOpcoes = useTranslations('Pesquisa.opcoes')
  const tAlteracoes = useTranslations('AlteracoesObservadas.itens')

  return function descrever(item: ItemDescritivel): LinhaDescricao[] {
    const linhas: LinhaDescricao[] = []
    const add = (rotulo: string, valor: string | null | undefined) => {
      if (valor && valor.trim()) linhas.push({ rotulo, valor: valor.trim() })
    }
    const tipo = item.tipo_radiografia
    add(t('tipo'), tipo && TIPOS.includes(tipo) ? tOpcoes(`tipoRadiografia.${tipo}`) : tipo)
    const q = item.qualidade_tecnica
    add(t('qualidade'), q && QUALIDADES.includes(q) ? tOpcoes(`qualidadeTecnica.${q}`) : q)
    add(t('dentes'), item.dentes && item.dentes.length ? item.dentes.join(', ') : null)
    const a = item.achado_principal
    add(t('achadoPrincipal'), a && CHAVE_ACHADO[a] ? tOpcoes(`achadoPrincipal.${CHAVE_ACHADO[a]}`) : a)
    add(
      t('alteracoes'),
      (item.alteracoes_observadas ?? [])
        .map((v) => {
          try {
            return tAlteracoes(v)
          } catch {
            return v
          }
        })
        .join(', ')
    )
    add(t('achadosDetalhados'), item.achados_detalhe)
    add(t('descricao'), item.descricao_didatica)
    add(t('marcacoes'), (item.marcacoes ?? []).map(textoMarcacao).join('; '))
    return linhas
  }
}
