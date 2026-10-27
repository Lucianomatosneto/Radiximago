'use client'

import { useTranslations } from 'next-intl'
import { rotuloTipo } from '../../lib/achadosFicha'
import { rotularAlteracaoObservada } from '../../lib/alteracoesObservadas'
import { rotuloErro } from '../../lib/errosTecnicos'
import { textoMarcacao } from '../../lib/descricaoCuradoria'
import {
  CHAVE_ACHADO,
  OPCOES_ACHADO,
  OPCOES_GENERO,
  OPCOES_QUALIDADE,
  OPCOES_TIPO,
  type Ficha,
  type ItemFicha,
} from './tipos'

/** Rotulos dos valores crus (tipo, qualidade, genero, achado) - mesmos textos das outras telas */
export function useRotularValor() {
  const tOpcoes = useTranslations('Pesquisa.opcoes')
  return function rotularValor(chave: string, valor: string | null | undefined): string {
    if (!valor) return '—'
    try {
      if (chave === 'tipo_radiografia') return tOpcoes(`tipoRadiografia.${valor}`)
      if (chave === 'qualidade_tecnica') return tOpcoes(`qualidadeTecnica.${valor}`)
      if (chave === 'genero') return tOpcoes(`genero.${valor}`)
      if (chave === 'achado_principal') return CHAVE_ACHADO[valor] ? tOpcoes(`achadoPrincipal.${CHAVE_ACHADO[valor]}`) : valor
    } catch {
      return valor
    }
    return valor
  }
}

/** A ficha do curador, item por item, na ordem em que aparece na Curadoria */
export function useItensFicha() {
  const t = useTranslations('SegundaOpiniao.itens')
  const rotularValor = useRotularValor()

  return function itensDaFicha(ficha: Ficha): ItemFicha[] {
    const vazio = '—'
    const lista = (v: string[]) => (v.length ? v.join(', ') : vazio)
    const itens: ItemFicha[] = [
      { chave: 'tipo_radiografia', rotulo: t('tipo_radiografia'), tipo: 'valor', grupo: 'dados', opcoes: OPCOES_TIPO,
        valor: rotularValor('tipo_radiografia', ficha.tipo_radiografia) },
      { chave: 'qualidade_tecnica', rotulo: t('qualidade_tecnica'), tipo: 'valor', grupo: 'dados', opcoes: OPCOES_QUALIDADE,
        valor: rotularValor('qualidade_tecnica', ficha.qualidade_tecnica) },
      { chave: 'dentes', rotulo: t('dentes'), tipo: 'dentes', grupo: 'dados', valor: lista((ficha.dentes ?? []).map(String)) },
      { chave: 'faixa_etaria', rotulo: t('faixa_etaria'), tipo: 'nota', grupo: 'dados',
        valor: ficha.idade_min || ficha.idade_max ? t('faixaValor', { min: ficha.idade_min ?? '?', max: ficha.idade_max ?? '?' }) : vazio },
      { chave: 'genero', rotulo: t('genero'), tipo: 'valor', grupo: 'dados', opcoes: OPCOES_GENERO,
        valor: rotularValor('genero', ficha.genero) },
      { chave: 'achado_principal', rotulo: t('achado_principal'), tipo: 'valor', grupo: 'achados', opcoes: OPCOES_ACHADO,
        valor: rotularValor('achado_principal', ficha.achado_principal) },
    ]
    ;(ficha.achados ?? []).forEach((a, i) => {
      const partes = [rotuloTipo(a.tipo)]
      if (a.dentes?.length) partes.push(t('dentesDoAchado', { dentes: a.dentes.join(', ') }))
      if (a.descricao) partes.push(a.descricao)
      itens.push({ chave: `achado_${i + 1}`, rotulo: t('achadoN', { numero: i + 1 }), tipo: 'nota', grupo: 'achados', valor: partes.join(' · ') })
    })
    itens.push(
      { chave: 'alteracoes_observadas', rotulo: t('alteracoes_observadas'), tipo: 'nota', grupo: 'achados',
        valor: lista((ficha.alteracoes_observadas ?? []).map(rotularAlteracaoObservada)) },
      { chave: 'erros_tecnicos', rotulo: t('erros_tecnicos'), tipo: 'nota', grupo: 'achados',
        valor: lista((ficha.erros_tecnicos ?? []).map(rotuloErro)) },
      { chave: 'marcacoes', rotulo: t('marcacoes'), tipo: 'nota', grupo: 'achados',
        valor: (ficha.marcacoes ?? []).length
          ? (ficha.marcacoes ?? []).map((m, i) => `${i + 1}. ${textoMarcacao(m)}`).join(' · ')
          : vazio },
      { chave: 'achados_detalhe', rotulo: t('achados_detalhe'), tipo: 'texto', grupo: 'textos', valor: ficha.achados_detalhe || vazio },
      { chave: 'descricao_didatica', rotulo: t('descricao_didatica'), tipo: 'texto', grupo: 'textos', valor: ficha.descricao_didatica || vazio },
      { chave: 'observacoes_internas', rotulo: t('observacoes_internas'), tipo: 'texto', grupo: 'textos', valor: ficha.observacoes_internas || vazio },
    )
    return itens
  }
}
