// SECAO UNICA "ACHADOS" (um achado = um registro).
//
// Cada achado da ficha tem: TIPO (lista padronizada de 26 itens), DENTES,
// REGIAO anatomica e as MARCACOES da imagem ligadas a ele. Substitui o
// antigo checklist "Alterações observadas" + a secao separada "Achados por
// dente/região". O resumo legado `alteracoes_observadas` (usado pela
// Pesquisa e pelas telas de estudo) passa a ser DERIVADO daqui - o
// backend refaz a mesma derivacao ao salvar (curation/ficha.py).
//
// Base: laudo estruturado (RSNA RadReport / DICOM SR TID 1500) - cada
// achado registrado uma unica vez, com o que e + onde (dente/regiao) +
// onde na imagem (marcacao).

import { CATEGORIAS_ALTERACOES } from './alteracoesObservadas'
import type { Marcacao } from './marcacoes'

export interface AchadoFicha {
  tipo: string
  dentes: number[]
  regiao: string
  /** ids das marcacoes (form.marcacoes) ligadas a este achado */
  marcacoes: string[]
}

export interface FichaComAchados {
  achados?: AchadoFicha[]
  sem_alteracoes?: boolean
  alteracoes_observadas: string[]
  dentes: number[]
  marcacoes: Marcacao[]
}

/** os 26 tipos da lista padronizada, com rotulo e categoria */
export const TIPOS_ACHADO_FICHA = CATEGORIAS_ALTERACOES.flatMap((c) =>
  c.itens.map((i) => ({ valor: i.valor, label: i.label, categoria: c.categoria, categoriaChave: c.categoriaChave }))
)

export const REGIOES = [
  'coroa',
  'raiz',
  'regiao_periapical',
  'periodonto',
  'osso_alveolar',
  'canal_mandibular',
  'seio_maxilar',
  'atm',
  'maxila',
  'mandibula',
  'palato',
  'outras_estruturas',
]

/** resumo legado: tipos dos achados, sem repetir, na ordem em que entraram */
export function resumoAlteracoes(achados: AchadoFicha[]): string[] {
  return Array.from(new Set(achados.map((a) => a.tipo)))
}

/** aplica uma lista nova de achados e refaz os campos derivados */
export function comAchados<F extends FichaComAchados>(f: F, achados: AchadoFicha[]): F {
  const dentes = Array.from(new Set([...f.dentes, ...achados.flatMap((a) => a.dentes)])).sort((a, b) => a - b)
  return {
    ...f,
    achados,
    alteracoes_observadas: resumoAlteracoes(achados),
    // marcacao ligada a um achado mostra o achado dele (cor e rotulo)
    marcacoes: marcacoesSincronizadas(f.marcacoes, achados),
    dentes,
    sem_alteracoes: achados.length ? false : f.sem_alteracoes,
  }
}

/**
 * Acrescenta um achado sem duplicar: se ja existe o mesmo tipo SEM dente,
 * os dentes/regiao novos completam esse registro; se ja existe igual,
 * nada muda; senao entra uma linha nova.
 */
export function adicionarAchado<F extends FichaComAchados>(f: F, novo: Partial<AchadoFicha> & { tipo: string }): F {
  const atual = f.achados ?? []
  const item: AchadoFicha = { dentes: [], regiao: '', marcacoes: [], ...novo }
  const igual = atual.findIndex(
    (a) => a.tipo === item.tipo && a.dentes.join() === item.dentes.join() && (a.regiao === item.regiao || !item.regiao)
  )
  if (igual >= 0) {
    if (!item.marcacoes.length && !item.regiao) return comAchados(f, atual)
    const lista = atual.map((a, i) =>
      i === igual
        ? { ...a, regiao: item.regiao || a.regiao, marcacoes: Array.from(new Set([...a.marcacoes, ...item.marcacoes])) }
        : a
    )
    return comAchados(f, lista)
  }
  const semLocal = atual.findIndex((a) => a.tipo === item.tipo && a.dentes.length === 0 && !a.regiao)
  if (semLocal >= 0 && (item.dentes.length || item.regiao)) {
    return comAchados(
      f,
      atual.map((a, i) => (i === semLocal ? { ...a, dentes: item.dentes, regiao: item.regiao, marcacoes: [...a.marcacoes, ...item.marcacoes] } : a))
    )
  }
  return comAchados(f, [...atual, item])
}

// ACHADO DAS MARCACOES (lista antiga AchadoPrincipal: cores e balao do
// estudante no visualizador). Ao ligar uma marcacao a um achado, a
// marcacao recebe o equivalente mais proximo; o que nao tem equivalente
// vira "outro" com o nome do achado como descricao.
const EQUIVALENTE_MARCACAO: Record<string, string> = {
  carie_esmalte: 'carie',
  carie_dentina: 'carie',
  carie_proxima_polpa: 'carie',
  carie_secundaria: 'carie',
  lesao_periapical: 'lesao_periapical',
  perda_ossea_horizontal: 'perda_ossea',
  perda_ossea_vertical: 'perda_ossea',
  dente_incluso: 'dente_incluso',
  tratamento_endodontico_presente: 'tratamento_endodontico',
  tratamento_endodontico_inadequado: 'tratamento_endodontico',
}

export function rotuloTipo(tipo: string): string {
  return TIPOS_ACHADO_FICHA.find((t) => t.valor === tipo)?.label ?? tipo
}

/** marcacoes da ficha com o achado de cada uma atualizado pelos achados */
export function marcacoesSincronizadas(marcacoes: Marcacao[], achados: AchadoFicha[]): Marcacao[] {
  return marcacoes.map((m) => {
    const dono = achados.find((a) => a.marcacoes.includes(m.id))
    if (!dono) return m
    const equivalente = EQUIVALENTE_MARCACAO[dono.tipo]
    return equivalente
      ? { ...m, achado: equivalente, achado_descricao: null }
      : { ...m, achado: 'outro', achado_descricao: rotuloTipo(dono.tipo) }
  })
}

/** achados no formato da API (PATCH /curation/{id} -> achados) */
export function achadosParaApi(achados: AchadoFicha[], marcacoes: Marcacao[]) {
  return achados.map((a) => ({
    tipo: a.tipo,
    dentes: a.dentes,
    regiao_anatomica: a.regiao || null,
    marcacoes: marcacoes.filter((m) => a.marcacoes.includes(m.id)),
  }))
}

interface AchadoApi {
  tipo: string
  dentes?: number[] | null
  regiao_anatomica?: string | null
  marcacoes?: { id?: string }[] | null
}

/**
 * achados vindos da API -> formulario. Ficha antiga (so com o checklist
 * legado, sem achados estruturados): cada alteracao marcada vira um achado
 * sem dente/regiao, para nada se perder ao salvar de novo.
 */
export function achadosDaApi(api: AchadoApi[] | undefined, legado: string[] | undefined): AchadoFicha[] {
  const tiposValidos = new Set(TIPOS_ACHADO_FICHA.map((t) => t.valor))
  const lista = (api ?? [])
    .filter((a) => tiposValidos.has(a.tipo))
    .map((a) => ({
      tipo: a.tipo,
      dentes: a.dentes ?? [],
      regiao: a.regiao_anatomica ?? '',
      marcacoes: (a.marcacoes ?? []).map((m) => m.id).filter((id): id is string => !!id),
    }))
  if (lista.length) return lista
  return (legado ?? []).filter((t) => tiposValidos.has(t)).map((tipo) => ({ tipo, dentes: [], regiao: '', marcacoes: [] }))
}
