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
  | 'achados'
  | 'erro_tecnico'
  | 'descricao'
  | 'observacoes'

export const SECOES_FICHA: SecaoFicha[] = [
  'dados',
  // secao unica "Achados" = as MARCACOES da imagem: cada marcacao e um
  // achado (tipo + dente + regiao). Substitui "Marcações", "Alterações
  // observadas", "Achados por dente/região" e "Achados detalhados".
  'achados',
  'erro_tecnico',
  'descricao',
  'observacoes',
]

/** Secoes de TEXTO CORRIDO: com uma delas ativa, a fala sem palavra-guia
 * vira texto daquele campo (em vez de ir para "Não reconhecido"). */
export const SECOES_TEXTO: Partial<Record<SecaoFicha, 'achados_detalhe' | 'descricao_didatica' | 'observacoes_internas'>> = {
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
  anonimizacao: 'dados',
  marcacoes: 'achados',
  alteracoes_observadas: 'achados',
  achados_detalhe: 'achados',
  termos: 'achados',
  erros_tecnicos: 'erro_tecnico',
  descricao_didatica: 'descricao',
  observacoes_internas: 'observacoes',
}

export function secaoVizinha(atual: SecaoFicha, passo: 1 | -1): SecaoFicha {
  const i = SECOES_FICHA.indexOf(atual)
  const j = Math.min(SECOES_FICHA.length - 1, Math.max(0, i + passo))
  return SECOES_FICHA[j]
}

// ETAPAS DO HOLOFOTE (um item da ficha por vez).
//
// Dentro das secoes, o holofote anda ITEM POR ITEM: a "Dados da imagem" se
// divide em 6 itens (anonimizacao, tipo, idade, genero, dentes, qualidade)
// e cada outra secao e um item so. O holofote:
// - comeca SEMPRE em "Anonimização validada" a cada imagem nova;
// - muda com Tab ou ↓ (proximo) / Shift+Tab ou ↑ (anterior);
// - ENTER (ou clicar a opcao) confirma o item e ja passa ao proximo (ver
//   confirmarComEnter em opcoesTeclado.ts); na voz, a fala que resolve o
//   item tambem passa adiante (PainelVoz);
// - diz a voz onde a fala entra: com "Idade" em destaque, falar "35"
//   preenche a idade (ver `etapa` em vozCuradoria.ts).
// Os demais itens ficam quase apagados, para o curador nao se confundir.
export type EtapaFicha =
  | 'anonimizacao'
  | 'tipo'
  | 'idade'
  | 'genero'
  | 'dentes'
  | 'qualidade'
  | 'achados'
  | 'erro_tecnico'
  | 'descricao'
  | 'observacoes'
  // ultimo passo: o holofote vai para o botao APROVAR da barra superior; o
  // microfone fecha e Enter faz a aprovacao final
  | 'aprovar'

export const ETAPAS_FICHA: EtapaFicha[] = [
  'anonimizacao',
  'tipo',
  'idade',
  'genero',
  'dentes',
  'qualidade',
  'achados',
  'erro_tecnico',
  'descricao',
  'observacoes',
  'aprovar',
]

export const ETAPA_INICIAL: EtapaFicha = 'anonimizacao'

/** Secao da coluna onde cada item fica. */
export const SECAO_DA_ETAPA: Record<EtapaFicha, SecaoFicha> = {
  anonimizacao: 'dados',
  tipo: 'dados',
  idade: 'dados',
  genero: 'dados',
  dentes: 'dados',
  qualidade: 'dados',
  achados: 'achados',
  erro_tecnico: 'erro_tecnico',
  descricao: 'descricao',
  observacoes: 'observacoes',
  // nao e uma secao da ficha: a coluna nao destaca nada (ver ColunaFicha)
  aprovar: 'observacoes',
}

/** Primeiro item de uma secao (ex.: "ir para a secao" da conferencia). */
export function primeiraEtapa(secao: SecaoFicha): EtapaFicha {
  return ETAPAS_FICHA.find((e) => SECAO_DA_ETAPA[e] === secao) ?? ETAPA_INICIAL
}

export function etapaVizinha(atual: EtapaFicha, passo: 1 | -1): EtapaFicha {
  const i = ETAPAS_FICHA.indexOf(atual)
  const j = Math.min(ETAPAS_FICHA.length - 1, Math.max(0, i + passo))
  return ETAPAS_FICHA[j]
}
