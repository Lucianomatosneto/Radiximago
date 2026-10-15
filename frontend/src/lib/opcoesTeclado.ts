// SETAS ← / → NO ITEM ACESO PELO HOLOFOTE (curadoria so pelo teclado).
//
// - Itens de UMA escolha (tipo, genero, qualidade): ←/→ trocam a opcao
//   marcada (anda para a anterior/proxima da lista, dando a volta).
// - Anonimizacao: ←/→ marcam/desmarcam a caixa.
// - Itens de VARIAS escolhas (dentes, erros tecnicos): ←/→ andam um
//   "cursor" pelas opcoes e a BARRA DE ESPACO marca/desmarca a do cursor.
// - ENTER confirma e o holofote JA VAI para o proximo item (ver
//   confirmarComEnter); nos itens de varias escolhas, Enter marca/desmarca.
// ↑/↓ e Tab continuam passando de um item para outro.

import type { FormularioFicha } from '../components/curadoria/FichaCuradoriaForm'
import type { EtapaFicha } from './secoesCuradoria'
import { errosParaTipo } from './errosTecnicos'

export const OPCOES_TIPO = ['periapical', 'interproximal', 'oclusal', 'panoramica', 'tomografia']
export const OPCOES_GENERO = ['masculino', 'feminino']
export const OPCOES_QUALIDADE = ['otima', 'boa', 'regular', 'insatisfatoria']
/** dentes na ordem em que aparecem na tela (arcada superior, depois inferior) */
export const DENTES_EM_ORDEM = [
  18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
  48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38,
]

function girar<T>(lista: T[], atual: T | '', passo: 1 | -1): T {
  const i = lista.indexOf(atual as T)
  if (i < 0) return passo === 1 ? lista[0] : lista[lista.length - 1]
  return lista[(i + passo + lista.length) % lista.length]
}

/** item com cursor (varias escolhas): quantas opcoes ele tem */
export function tamanhoCursor(etapa: EtapaFicha, form: FormularioFicha): number {
  if (etapa === 'dentes') return DENTES_EM_ORDEM.length
  if (etapa === 'erro_tecnico') return errosParaTipo(form.tipo_radiografia).length
  return 0
}

/** ←/→ num item de uma escolha: devolve o formulario com a nova opcao
 * (ou null se o item nao e de uma escolha) */
export function trocarOpcao(etapa: EtapaFicha, form: FormularioFicha, passo: 1 | -1): FormularioFicha | null {
  switch (etapa) {
    case 'anonimizacao':
      return { ...form, anonimizacao_validada: !form.anonimizacao_validada }
    case 'tipo':
      return { ...form, tipo_radiografia: girar(OPCOES_TIPO, form.tipo_radiografia, passo) }
    case 'genero':
      return { ...form, genero: girar(OPCOES_GENERO, form.genero, passo) }
    case 'qualidade':
      return { ...form, qualidade_tecnica: girar(OPCOES_QUALIDADE, form.qualidade_tecnica, passo) }
    default:
      return null
  }
}

/** barra de espaco num item com cursor: marca/desmarca a opcao do cursor */
export function alternarNoCursor(etapa: EtapaFicha, form: FormularioFicha, cursor: number): FormularioFicha | null {
  if (etapa === 'dentes') {
    const d = DENTES_EM_ORDEM[cursor]
    if (d === undefined) return null
    const dentes = form.dentes.includes(d) ? form.dentes.filter((x) => x !== d) : [...form.dentes, d].sort((a, b) => a - b)
    return { ...form, dentes }
  }
  if (etapa === 'erro_tecnico') {
    const e = errosParaTipo(form.tipo_radiografia)[cursor]
    if (!e) return null
    const marcados = form.erros_tecnicos
    return {
      ...form,
      erros_tecnicos: marcados.includes(e.valor) ? marcados.filter((v) => v !== e.valor) : [...marcados, e.valor],
    }
  }
  return null
}

/** ENTER no item aceso (curadoria so pelo teclado, sem audio):
 * - Anonimizacao: valida (se ainda nao estiver) e ja passa ao proximo item.
 * - Tipo, sexo, qualidade: confirma a opcao escolhida com ←/→ e passa ao
 *   proximo item (sem opcao escolhida, Enter nao faz nada).
 * - Idade: confirma o numero digitado e passa ao proximo item.
 * - Dentes, erros tecnicos (varias escolhas): marca/desmarca a opcao do
 *   cursor e FICA no item (para marcar outras); ↓ ou Tab passam adiante.
 * Devolve o formulario alterado (ou null se nada muda) e se o holofote
 * deve andar; null = Enter nao faz nada neste item. */
export function confirmarComEnter(
  etapa: EtapaFicha,
  form: FormularioFicha,
  cursor: number
): { form: FormularioFicha | null; avancar: boolean } | null {
  switch (etapa) {
    case 'anonimizacao':
      return { form: form.anonimizacao_validada ? null : { ...form, anonimizacao_validada: true }, avancar: true }
    case 'tipo':
      return form.tipo_radiografia ? { form: null, avancar: true } : null
    case 'genero':
      return form.genero ? { form: null, avancar: true } : null
    case 'qualidade':
      return form.qualidade_tecnica ? { form: null, avancar: true } : null
    case 'idade':
      return { form: null, avancar: true }
    case 'dentes':
    case 'erro_tecnico': {
      const novo = alternarNoCursor(etapa, form, cursor)
      return novo ? { form: novo, avancar: false } : null
    }
    default:
      return null
  }
}
