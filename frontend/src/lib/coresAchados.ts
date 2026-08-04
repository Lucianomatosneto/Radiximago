// Cores por achado principal - o MESMO padrao de cores ja usado nos cards
// do "Banco de imagens" (componente GradeCategoriasImagens.tsx), pra
// manter a identidade visual consistente em qualquer lugar do sistema que
// mostre o achado principal de uma imagem (ex.: os titulos dos resultados
// da Pesquisa avançada).
//
// Cada achado tem tres variantes:
// - `texto`: so a cor do texto (light + dark) - usada onde o achado
//   aparece como um rotulo simples, sem fundo proprio (ex.: o titulo de
//   cada card nos resultados da pesquisa, os titulos da faixa de
//   classificacao).
// - `cartao`: a versao completa (fundo em gradiente + borda + texto) -
//   usada nos cards grandes do Banco de imagens.
// - `barra`: cor solida (sem gradiente) - usada em barras de progresso e
//   indicadores pequenos, como o grafico "Fichas por achado principal" em
//   Relatorios.
//
// Se um dia o Banco de imagens ganhar uma categoria nova (ou mudar uma
// cor), atualize aqui - GradeCategoriasImagens.tsx e todo lugar que
// importa deste arquivo leem da mesma fonte, entao continuam batendo
// automaticamente.
export interface CorAchado {
  texto: string
  cartao: string
  barra: string
}

export const CORES_ACHADO_PRINCIPAL: Record<string, CorAchado> = {
  normal: {
    texto: 'text-emerald-700 dark:text-emerald-300',
    cartao:
      'from-emerald-100 to-emerald-50 border-emerald-300 text-emerald-700 dark:from-emerald-600/30 dark:to-emerald-900/10 dark:border-emerald-700/40 dark:text-emerald-300',
    barra: 'bg-emerald-500',
  },
  carie: {
    texto: 'text-red-700 dark:text-red-300',
    cartao:
      'from-red-100 to-red-50 border-red-300 text-red-700 dark:from-red-600/30 dark:to-red-900/10 dark:border-red-700/40 dark:text-red-300',
    barra: 'bg-red-500',
  },
  lesao_periapical: {
    texto: 'text-orange-700 dark:text-orange-300',
    cartao:
      'from-orange-100 to-orange-50 border-orange-300 text-orange-700 dark:from-orange-600/30 dark:to-orange-900/10 dark:border-orange-700/40 dark:text-orange-300',
    barra: 'bg-orange-500',
  },
  perda_ossea: {
    texto: 'text-amber-700 dark:text-amber-300',
    cartao:
      'from-amber-100 to-amber-50 border-amber-300 text-amber-700 dark:from-amber-600/30 dark:to-amber-900/10 dark:border-amber-700/40 dark:text-amber-300',
    barra: 'bg-amber-500',
  },
  dente_incluso: {
    texto: 'text-purple-700 dark:text-purple-300',
    cartao:
      'from-purple-100 to-purple-50 border-purple-300 text-purple-700 dark:from-purple-600/30 dark:to-purple-900/10 dark:border-purple-700/40 dark:text-purple-300',
    barra: 'bg-purple-500',
  },
  tratamento_endodontico: {
    texto: 'text-blue-700 dark:text-blue-300',
    cartao:
      'from-blue-100 to-blue-50 border-blue-300 text-blue-700 dark:from-blue-600/30 dark:to-blue-900/10 dark:border-blue-700/40 dark:text-blue-300',
    barra: 'bg-blue-500',
  },
  erro_tecnico: {
    texto: 'text-ink-2 dark:text-slate-300',
    cartao:
      'from-slate-100 to-slate-50 border-slate-300 text-ink-2 dark:from-slate-600/30 dark:to-slate-900/10 dark:border-slate-700/40 dark:text-slate-300',
    barra: 'bg-slate-500',
  },
}

// Fallback pra achado_principal vazio ou nao mapeado (ex.: "outro") - as
// mesmas cores neutras que os rotulos ja usavam antes dessa mudanca.
export const COR_ACHADO_PADRAO_TEXTO = 'text-slate-400'
export const COR_ACHADO_PADRAO_BARRA = 'bg-brand'

// Cores dos OUTROS dois grupos de card do Banco de imagens (fora do achado
// principal) - "Tipo de radiografia" (sempre azul-petroleo/teal) e
// "Qualidade tecnica" (sempre amarelo). Usadas pra colorir campos que se
// referem a esses grupos fora do Banco de imagens (ex.: os titulos "Tipo:"
// e "Qualidade:" na faixa de classificacao), com a MESMA cor da categoria -
// nao a cor do achado principal, que e um grupo diferente.
export const COR_TEXTO_TIPO_RADIOGRAFIA = 'text-teal-700 dark:text-teal-300'
export const COR_TEXTO_QUALIDADE_TECNICA = 'text-yellow-700 dark:text-yellow-300'
// Versao "cartao" (fundo em gradiente + borda + texto) de CADA tipo de
// radiografia - usada nos botoes de "Acesso rapido por tipo de exame" na
// Pesquisa avançada. Por pedido, cada tipo tem sua PROPRIA cor (diferente
// dos cards do Banco de imagens, onde os 4 tipos dividem a mesma cor teal -
// ver GradeCategoriasImagens.tsx, que continua assim, sem alteracao).
export const CORES_CARTAO_TIPO_RADIOGRAFIA: Record<string, string> = {
  periapical: 'from-teal-100 to-teal-50 border-teal-300 text-teal-700 dark:from-teal-600/30 dark:to-teal-900/10 dark:border-teal-700/40 dark:text-teal-300',
  panoramica: 'from-cyan-100 to-cyan-50 border-cyan-300 text-cyan-700 dark:from-cyan-600/30 dark:to-cyan-900/10 dark:border-cyan-700/40 dark:text-cyan-300',
  interproximal: 'from-sky-100 to-sky-50 border-sky-300 text-sky-700 dark:from-sky-600/30 dark:to-sky-900/10 dark:border-sky-700/40 dark:text-sky-300',
  oclusal: 'from-indigo-100 to-indigo-50 border-indigo-300 text-indigo-700 dark:from-indigo-600/30 dark:to-indigo-900/10 dark:border-indigo-700/40 dark:text-indigo-300',
}
// Fallback pra um tipo nao mapeado - a mesma cor teal usada em Banco de
// imagens/nas outras cores fixas de "Tipo:" deste arquivo.
export const COR_CARTAO_TIPO_RADIOGRAFIA_PADRAO = CORES_CARTAO_TIPO_RADIOGRAFIA.periapical

export function corCartaoTipoRadiografia(valor: string | null | undefined): string {
  if (!valor) return COR_CARTAO_TIPO_RADIOGRAFIA_PADRAO
  return CORES_CARTAO_TIPO_RADIOGRAFIA[valor] ?? COR_CARTAO_TIPO_RADIOGRAFIA_PADRAO
}
// "Dentes" nao e um grupo de card do Banco de imagens (e um numero, nao uma
// categoria) - por pedido, ganhou uma cor propria e fixa (azul), em vez de
// herdar a cor do achado principal como os outros campos sem card.
export const COR_TEXTO_DENTES = 'text-blue-700 dark:text-blue-300'

export function corTextoAchado(valor: string | null | undefined): string {
  if (!valor) return COR_ACHADO_PADRAO_TEXTO
  return CORES_ACHADO_PRINCIPAL[valor]?.texto ?? COR_ACHADO_PADRAO_TEXTO
}

export function corBarraAchado(valor: string | null | undefined): string {
  if (!valor) return COR_ACHADO_PADRAO_BARRA
  return CORES_ACHADO_PRINCIPAL[valor]?.barra ?? COR_ACHADO_PADRAO_BARRA
}
