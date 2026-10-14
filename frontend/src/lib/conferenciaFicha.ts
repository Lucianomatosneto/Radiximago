// CONFERENCIA DA FICHA ANTES DE APROVAR (garantia de qualidade).
//
// Inspirada nas verificacoes automaticas dos sistemas de laudo
// profissionais (campos obrigatorios, lateralidade/dente citado e nao
// registrado, achados contraditorios): roda no navegador, na hora, sem
// inteligencia artificial - so regras fixas e explicaveis.
//
// - BLOQUEIO: impede aprovar (o backend tambem recusa).
// - AVISO: o curador pode aprovar mesmo assim, mas ve o que pode estar
//   faltando ou incoerente, com um botao para ir direto a secao.

import { SECOES_FICHA, type SecaoFicha } from './secoesCuradoria'
import { normalizar } from './vozCuradoria'

export interface ItemConferencia {
  nivel: 'bloqueio' | 'aviso'
  /** chave de traducao em Curadoria.conferencia.itens */
  chave: string
  secao: SecaoFicha
  parametros?: Record<string, string | number>
}

export interface FichaConferencia {
  tipo_radiografia: string
  dentes: number[]
  genero: string
  qualidade_tecnica: string
  anonimizacao_validada: boolean
  alteracoes_observadas: string[]
  achados_detalhe: string
  descricao_didatica: string
  marcacoes: { achado?: string | null; achado_descricao?: string | null }[]
}

const DENTE_VALIDO = (d: number) => d >= 11 && d <= 48 && d % 10 >= 1 && d % 10 <= 8

/** dentes (FDI) citados no texto depois de "dente"/"dentes"/"elemento(s)" */
export function dentesCitados(texto: string): number[] {
  const n = normalizar(texto)
  const achados = new Set<number>()
  const re = /\b(?:dentes?|elementos?)\s+((?:\d{2}(?:\s*(?:,|e|a|ao)\s*)?)+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(n))) {
    for (const num of m[1].match(/\d{2}/g) ?? []) {
      const d = parseInt(num, 10)
      if (DENTE_VALIDO(d)) achados.add(d)
    }
  }
  return Array.from(achados).sort((a, b) => a - b)
}

const FRASES_NORMAL = ['sem alteracoes', 'sem alteracao', 'dentro da normalidade', 'nada digno de nota', 'aspecto normal', 'normal']

export function conferirFicha(ficha: FichaConferencia, duvidasVoz = 0, secoesPendentes: SecaoFicha[] = []): ItemConferencia[] {
  const itens: ItemConferencia[] = []
  const add = (nivel: ItemConferencia['nivel'], chave: string, secao: SecaoFicha, parametros?: ItemConferencia['parametros']) =>
    itens.push({ nivel, chave, secao, parametros })

  // obrigatorios
  if (!ficha.anonimizacao_validada) add('bloqueio', 'anonimizacao', 'dados')
  if (!ficha.tipo_radiografia) add('bloqueio', 'tipo', 'dados')
  if (!ficha.genero) add('aviso', 'sexo', 'dados')
  if (!ficha.qualidade_tecnica) add('aviso', 'qualidade', 'dados')

  // dentes
  const temAchado = ficha.alteracoes_observadas.length > 0 || ficha.marcacoes.length > 0
  if (temAchado && ficha.dentes.length === 0 && ficha.tipo_radiografia !== 'panoramica') add('aviso', 'semDentes', 'dados')
  const citados = dentesCitados(`${ficha.descricao_didatica} ${ficha.achados_detalhe}`)
  const faltando = citados.filter((d) => !ficha.dentes.includes(d))
  if (faltando.length) add('aviso', 'denteNoTexto', 'dados', { dentes: faltando.join(', ') })

  // marcacoes
  const semAchado = ficha.marcacoes.map((m, i) => (!m.achado ? i + 1 : 0)).filter(Boolean)
  if (semAchado.length) add('aviso', 'marcacaoSemAchado', 'marcacoes', { numeros: semAchado.join(', ') })
  const outroVazio = ficha.marcacoes.map((m, i) => (m.achado === 'outro' && !(m.achado_descricao || '').trim() ? i + 1 : 0)).filter(Boolean)
  if (outroVazio.length) add('aviso', 'outroSemTexto', 'marcacoes', { numeros: outroVazio.join(', ') })

  // coerencia
  const descricao = normalizar(ficha.descricao_didatica)
  const dizNormal = FRASES_NORMAL.some((f) => descricao.includes(f))
  if (dizNormal && ficha.alteracoes_observadas.length > 0) add('aviso', 'contradicao', 'descricao')
  if (!temAchado && !ficha.achados_detalhe.trim() && !dizNormal) add('aviso', 'semAchados', 'alteracoes')
  if (!ficha.descricao_didatica.trim()) add('aviso', 'descricaoVazia', 'descricao')

  if (duvidasVoz > 0) add('aviso', 'duvidasVoz', 'dados', { quantidade: duvidasVoz })

  // roteiro: secoes opcionais que ninguem olhou (nem "Nada a registrar")
  for (const secao of secoesPendentes) {
    if (secao === 'dados' || secao === 'descricao') continue // ja cobertas acima
    add('aviso', 'secaoPendente', secao, { numero: SECOES_FICHA.indexOf(secao) + 1 })
  }

  return itens.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'bloqueio' ? -1 : 1))
}
