// SECOES DA FICHA DE CURADORIA (coluna da direita da tela de Curadoria).
//
// Ordem unica usada:
// - pela coluna (ColunaFichaCuradoria.tsx), que mostra as secoes de cima
//   para baixo e destaca a "secao ativa";
// - pelas setas ↑/↓ do teclado e pelos botoes ▲/▼ (vao para a secao
//   anterior/seguinte);
// - pela curadoria por voz (vozCuradoria.ts): a fala SEM palavra-guia vai
//   para a secao ativa, e depois de preencher a coluna rola ate a secao que
//   recebeu o dado.

export type SecaoFicha =
  | 'dados'
  | 'marcacoes'
  | 'achados'
  | 'achados_detalhados'
  | 'erro_tecnico'
  | 'descricao'
  | 'observacoes'

export const SECOES_FICHA: SecaoFicha[] = [
  'dados',
  'marcacoes',
  // secao unica "Achados": substitui "Alterações observadas" + "Achados por
  // dente/região" (um achado = um registro - ver lib/achadosFicha.ts)
  'achados',
  'achados_detalhados',
  'erro_tecnico',
  'descricao',
  'observacoes',
]

/** Secoes de TEXTO CORRIDO: com uma delas ativa, a fala sem palavra-guia
 * vira texto daquele campo (em vez de ir para "Não reconhecido"). */
export const SECOES_TEXTO: Partial<Record<SecaoFicha, 'achados_detalhe' | 'descricao_didatica' | 'observacoes_internas'>> = {
  achados_detalhados: 'achados_detalhe',
  descricao: 'descricao_didatica',
  observacoes: 'observacoes_internas',
}

/** Campo preenchido pela voz -> secao da coluna onde ele aparece. */
export const SECAO_DO_CAMPO: Record<string, SecaoFicha> = {
  tipo_radiografia: 'dados',
  dentes: 'dados',
  idade: 'dados',
  genero: 'dados',
  qualidade_tecnica: 'dados',
  marcacoes: 'marcacoes',
  alteracoes_observadas: 'achados',
  achados_detalhe: 'achados_detalhados',
  termos: 'achados_detalhados',
  descricao_didatica: 'descricao',
  observacoes_internas: 'observacoes',
}

export function secaoVizinha(atual: SecaoFicha, passo: 1 | -1): SecaoFicha {
  const i = SECOES_FICHA.indexOf(atual)
  const j = Math.min(SECOES_FICHA.length - 1, Math.max(0, i + passo))
  return SECOES_FICHA[j]
}
