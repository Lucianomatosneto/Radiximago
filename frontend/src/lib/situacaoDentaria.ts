// DENTICAO, DENTES DECIDUOS, ODONTOGRAMA DE SITUACAO E ESTRUTURAS FORA DOS
// DENTES (pedido do Luciano, 23/11/2026). Mesmas listas do servidor
// (backend/app/modules/curations.py: Denticao, SituacaoDente,
// EstruturaExtradental, DENTES_DECIDUOS).
// - denticao e deciduos: todos os tipos de exame;
// - odontograma de situacao e estruturas: so na panoramica.

export const DENTICOES = ['decidua', 'mista', 'permanente'] as const

// deciduos na ordem do odontograma (como o paciente e visto de frente)
export const DECIDUOS_SUPERIOR = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
export const DECIDUOS_INFERIOR = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]
export const PERMANENTES_SUPERIOR = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
export const PERMANENTES_INFERIOR = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]

/** situacoes do odontograma, com a sigla mostrada no dente */
export const SITUACOES: { valor: string; sigla: string }[] = [
  { valor: 'ausente', sigla: 'X' },
  { valor: 'incluso', sigla: 'In' },
  { valor: 'carie', sigla: 'C' },
  { valor: 'restaurado', sigla: 'R' },
  { valor: 'endodontia', sigla: 'E' },
  { valor: 'implante', sigla: 'Im' },
  { valor: 'protese', sigla: 'P' },
  { valor: 'supranumerario', sigla: 'S' },
]

export const ESTRUTURAS = [
  'seio_maxilar',
  'atm_condilo',
  'canal_mandibular',
  'perda_ossea_generalizada',
  'ateroma_carotideo',
  'sialolito',
  'tonsilolito',
  'processo_estiloide_alongado',
  'lesao_ossea_radiolucida',
  'lesao_ossea_radiopaca',
] as const

export const TIPOS_COM_ODONTOGRAMA = ['panoramica']

export function eDeciduo(dente: number): boolean {
  const q = Math.floor(dente / 10)
  return q >= 5 && q <= 8
}

/** deciduos aparecem com denticao mista ou decidua */
export function mostraDeciduos(denticao: string): boolean {
  return denticao === 'mista' || denticao === 'decidua'
}

/** liga/desliga uma situacao de um dente; dente sem situacao sai da lista */
export function alternarSituacao(atual: Record<string, string[]>, dente: number, situacao: string): Record<string, string[]> {
  const chave = String(dente)
  const lista = atual[chave] ?? []
  const nova = lista.includes(situacao) ? lista.filter((s) => s !== situacao) : [...lista, situacao]
  const resultado = { ...atual }
  if (nova.length) resultado[chave] = nova
  else delete resultado[chave]
  return resultado
}

/** trocar a denticao: com "permanente" os deciduos saem dos dentes e do odontograma
 *  (o servidor recusa deciduo com denticao permanente) */
export function trocarDenticao<T extends { denticao: string; dentes: number[]; situacao_dentes: Record<string, string[]> }>(
  form: T,
  denticao: string,
): T {
  if (mostraDeciduos(denticao)) return { ...form, denticao }
  return {
    ...form,
    denticao,
    dentes: form.dentes.filter((d) => !eDeciduo(d)),
    situacao_dentes: Object.fromEntries(Object.entries(form.situacao_dentes).filter(([d]) => !eDeciduo(Number(d)))),
  }
}
