// CURADORIA POR VOZ - interpretador por REGRAS FIXAS (sem inteligencia
// artificial): transforma o texto ditado (vindo do Whisper local) em
// alteracoes nos campos da ficha. Previsivel e auditavel: cada palavra
// reconhecida vem de uma lista abaixo ou do vocabulario controlado.
//
// Como o curador fala (ver tambem a ajuda na tela):
// - valores soltos: "periapical", "masculino", "lesão periapical"...
// - palavras-guia: "qualidade boa", "dente 36 e 37", "idade de 30 a 40",
//   "alteração perda óssea vertical", "marcação dois cárie",
//   "marcação dois outro: calcificação pulpar"
// - "Outro": "achado outro: reabsorção cervical" -> o texto vai para
//   Achados detalhados (termina na proxima palavra-guia, num ponto ou "fim")
// - texto corrido: "descrição: ..." / "achados detalhados: ..." /
//   "observações internas: ..." -> vai ate "fim" ou ate o fim do trecho
//   gravado; "continuar descrição: ..." acrescenta
// - comandos: "desfazer", "salvar", "corrigir dente 36 para 46",
//   "apagar descrição"
// - navegacao: "próxima seção", "seção anterior"
// - SECAO ATIVA (a que esta em destaque na coluna da direita): com
//   Descrição, Achados detalhados ou Observações em destaque, a fala SEM
//   palavra-guia vira texto daquele campo (acrescentado ao que ja existe);
//   com Marcações em destaque, "dois cárie" = "marcação dois cárie".
// - macros: "macro periapical normal" aplica a frase pronta cadastrada
// SEGURANCA (como nos sistemas de laudo profissionais): nada entra na
// ficha por adivinhacao. Palavra PARECIDA com um item da lista nao e
// preenchida sozinha: vira uma duvida ("Você quis dizer…?") que o curador
// aceita com um clique - e pode "ensinar" (frasesAprendidas) para a
// proxima vez. O que nao for entendido vai para "Não reconhecido".

import type { Marcacao } from './marcacoes'
import { CATEGORIAS_ALTERACOES } from './alteracoesObservadas'
import { SECAO_DA_ETAPA, SECOES_TEXTO, type EtapaFicha, type SecaoFicha } from './secoesCuradoria'
import { adicionarAchado, comAchados, type AchadoFicha } from './achadosFicha'
import { errosParaTipo, rotuloErro } from './errosTecnicos'

export interface FichaVoz {
  tipo_radiografia: string
  dentes: number[]
  idade_min: string
  idade_max: string
  genero: string
  marcacoes: Marcacao[]
  achados_detalhe: string
  alteracoes_observadas: string[]
  qualidade_tecnica: string
  descricao_didatica: string
  observacoes_internas: string
  termos: number[]
  /** secao unica "Achados" (lib/achadosFicha.ts) */
  achados?: AchadoFicha[]
  sem_alteracoes?: boolean
  anonimizacao_validada?: boolean
  erros_tecnicos?: string[]
}

export interface TermoVoz {
  id: number
  termo: string
  sinonimos: { sinonimo: string }[]
}

export type CampoVoz =
  | 'tipo_radiografia'
  | 'dentes'
  | 'idade'
  | 'genero'
  | 'qualidade_tecnica'
  | 'alteracoes_observadas'
  | 'achados_detalhe'
  | 'descricao_didatica'
  | 'observacoes_internas'
  | 'marcacoes'
  | 'termos'
  | 'anonimizacao'
  | 'erros_tecnicos'

export interface Sugestao {
  rotulo: string
  aplicar: (ficha: FichaVoz) => FichaVoz
  /** o que a sugestao preenche - usado para "ensinar" a frase ouvida */
  destino?: { tipo: 'alteracao' | 'termo' | 'tipo' | 'macro'; valor: string }
  /** campo da ficha que a sugestao preenche (destaque na coluna) */
  campo?: CampoVoz
}

export interface NaoReconhecido {
  texto: string
  sugestoes: Sugestao[]
  /** true = havia uma palavra parecida (erro provavel de transcricao) */
  parecido?: boolean
}

export interface Alteracao {
  campo: CampoVoz
  descricao: string
  /** reconhecida por semelhanca (palavra parecida) - conferir com atencao */
  aproximada?: boolean
}

export interface ResultadoVoz {
  ficha: FichaVoz
  alteracoes: Alteracao[]
  naoReconhecidos: NaoReconhecido[]
  comandos: ComandoVoz[]
}

export type ComandoVoz = 'desfazer' | 'salvar' | 'proxima_secao' | 'secao_anterior' | 'nada_a_registrar'

export interface OpcoesInterpretar {
  /** secao em destaque na coluna da ficha (destino da fala sem palavra-guia) */
  secaoAtiva?: SecaoFicha
  /** item em destaque (holofote): a fala sem palavra-guia vai para ele -
   * com "Idade" em destaque, "35" vira "idade 35" */
  etapa?: EtapaFicha
  /** frases que o curador ensinou a valer como uma alteracao da lista */
  frasesAprendidas?: { frase: string; alteracao: string }[]
  /** macros (frases prontas) da equipe */
  macros?: MacroVoz[]
}

export interface ConteudoMacro {
  descricao_didatica?: string
  achados_detalhe?: string
  observacoes_internas?: string
  alteracoes_observadas?: string[]
  tipo_radiografia?: string
  qualidade_tecnica?: string
}

export interface MacroVoz {
  id: number
  nome: string
  conteudo: ConteudoMacro
}

const NOMES_CAMPO_TEXTO = {
  descricao_didatica: 'Descrição',
  achados_detalhe: 'Achados detalhados',
  observacoes_internas: 'Observações internas',
} as const

/** Aplica uma macro: texto vazio recebe o texto; texto ja escrito recebe o
 * texto acrescentado no fim; alteracoes sao somadas; tipo e qualidade
 * passam a ser os da macro. Devolve a ficha nova e o que mudou. */
export function aplicarMacro<F extends FichaVoz>(ficha: F, macro: MacroVoz): { ficha: F; alteracoes: Alteracao[] } {
  const c = macro.conteudo || {}
  const novo: F = { ...ficha, alteracoes_observadas: [...ficha.alteracoes_observadas] }
  const alteracoes: Alteracao[] = []
  const rotulo = `Macro “${macro.nome}”`
  for (const campo of ['descricao_didatica', 'achados_detalhe', 'observacoes_internas'] as const) {
    const texto = (c[campo] || '').trim()
    if (!texto) continue
    novo[campo] = juntarTexto(ficha[campo], texto) as F[typeof campo]
    alteracoes.push({ campo, descricao: `${rotulo}: ${NOMES_CAMPO_TEXTO[campo]}` })
  }
  const novas = (c.alteracoes_observadas || []).filter((a) => !novo.alteracoes_observadas.includes(a))
  if (novas.length) {
    let comNovas: F = novo
    for (const tipo of novas) comNovas = adicionarAchado(comNovas, { tipo })
    Object.assign(novo, comNovas)
    alteracoes.push({ campo: 'alteracoes_observadas', descricao: `${rotulo}: ${novas.length} achado(s)` })
  }
  if (c.tipo_radiografia) {
    novo.tipo_radiografia = c.tipo_radiografia
    alteracoes.push({ campo: 'tipo_radiografia', descricao: `${rotulo}: tipo` })
  }
  if (c.qualidade_tecnica) {
    novo.qualidade_tecnica = c.qualidade_tecnica
    alteracoes.push({ campo: 'qualidade_tecnica', descricao: `${rotulo}: qualidade` })
  }
  return { ficha: novo, alteracoes }
}

function formaFalada(texto: string): string {
  return normalizar(texto).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// ---------------------------------------------------------------- texto
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
}

interface Token {
  bruto: string
  n: string
  inicio: number
  fim: number
  pontuacao: boolean
}

function tokenizar(texto: string): Token[] {
  const tokens: Token[] = []
  const re = /[\p{L}\p{N}]+|[.,;:!?]/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    const pont = /^[.,;:!?]$/.test(m[0])
    tokens.push({ bruto: m[0], n: normalizar(m[0]), inicio: m.index, fim: m.index + m[0].length, pontuacao: pont })
  }
  return tokens
}

const PALAVRAS_VAZIAS = new Set([
  'e', 'de', 'da', 'do', 'das', 'dos', 'o', 'a', 'os', 'as', 'com', 'na', 'no', 'em', 'tem', 'ha', 'um', 'uma',
  'ponto', 'virgula', 'entao', 'bom', 'certo', 'ok', 'eh', 'ah', 'hum', 'tipo', 'radiografia', 'imagem', 'e', 'presenca',
  'presente', 'apresenta', 'mostra', 'observa', 'se', 'nota',
])

// ------------------------------------------------------------ numeros
const UNIDADES: Record<string, number> = {
  zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9,
}
const ESPECIAIS: Record<string, number> = {
  dez: 10, onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16,
  dezessete: 17, dezoito: 18, dezenove: 19,
}
const DEZENAS: Record<string, number> = {
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90,
}

/** le um numero a partir de tokens[i]; devolve [valor, quantos tokens usou] */
function lerNumero(tokens: Token[], i: number): [number, number] | null {
  const t = tokens[i]
  if (!t || t.pontuacao) return null
  if (/^\d+$/.test(t.n)) return [parseInt(t.n, 10), 1]
  if (t.n in ESPECIAIS) return [ESPECIAIS[t.n], 1]
  if (t.n in DEZENAS) {
    if (tokens[i + 1]?.n === 'e' && tokens[i + 2] && tokens[i + 2].n in UNIDADES) {
      return [DEZENAS[t.n] + UNIDADES[tokens[i + 2].n], 3]
    }
    return [DEZENAS[t.n], 1]
  }
  if (t.n in UNIDADES) return [UNIDADES[t.n], 1]
  return null
}

const DENTE_VALIDO = (d: number) => {
  const q = Math.floor(d / 10)
  const u = d % 10
  return q >= 1 && q <= 4 && u >= 1 && u <= 8
}

// ---------------------------------------------------- vocabulario fixo
type Opcao = { valor: string; rotulo: string; formas: string[] }

const TIPOS: Opcao[] = [
  { valor: 'periapical', rotulo: 'Periapical', formas: ['periapical'] },
  { valor: 'panoramica', rotulo: 'Panorâmica', formas: ['panoramica', 'panorama', 'panoramico', 'pan', 'pano'] },
  { valor: 'interproximal', rotulo: 'Interproximal', formas: ['interproximal', 'bitewing', 'bite wing', 'interproximais'] },
  { valor: 'oclusal', rotulo: 'Oclusal', formas: ['oclusal'] },
  { valor: 'tomografia', rotulo: 'Tomografia (TCFC)', formas: ['tomografia', 'tomografia computadorizada', 'tcfc', 'cone beam', 'cbct', 'tomo'] },
]
// atalhos curtos (so depois de "tipo" ou como fala inteira): pan, in, pe, o
const TIPOS_CURTOS: Opcao[] = [
  { valor: 'panoramica', rotulo: 'Panorâmica', formas: ['pan', 'pano'] },
  { valor: 'interproximal', rotulo: 'Interproximal', formas: ['in', 'im', 'inter'] },
  { valor: 'periapical', rotulo: 'Periapical', formas: ['pe', 'peri'] },
  { valor: 'oclusal', rotulo: 'Oclusal', formas: ['o', 'oh'] },
  { valor: 'tomografia', rotulo: 'Tomografia (TCFC)', formas: ['tc', 'tomo'] },
]
const QUALIDADES: Opcao[] = [
  { valor: 'otima', rotulo: 'Ótima', formas: ['otima', 'excelente'] },
  { valor: 'boa', rotulo: 'Boa', formas: ['boa'] },
  { valor: 'regular', rotulo: 'Regular', formas: ['regular', 'media'] },
  { valor: 'insatisfatoria', rotulo: 'Insatisfatória', formas: ['insatisfatoria', 'ruim', 'inadequada'] },
]
const GENEROS: Opcao[] = [
  { valor: 'masculino', rotulo: 'Masculino', formas: ['masculino', 'homem'] },
  { valor: 'feminino', rotulo: 'Feminino', formas: ['feminino', 'mulher'] },
]
// atalhos de sexo (so depois de "sexo" ou como fala inteira): m / f
const GENEROS_CURTOS: Opcao[] = [
  { valor: 'masculino', rotulo: 'Masculino', formas: ['m', 'eme'] },
  { valor: 'feminino', rotulo: 'Feminino', formas: ['f', 'efe'] },
]
// erros tecnicos como opcoes faladas (lib/errosTecnicos.ts)
const opcoesErros = (tipo: string): Opcao[] =>
  errosParaTipo(tipo).map((e) => ({ valor: e.valor, rotulo: e.rotulo, formas: e.formas }))
// achados das marcacoes (mesmos valores de AchadoPrincipal no backend)
const ACHADOS_MARCACAO: Opcao[] = [
  { valor: 'normal', rotulo: 'Normal', formas: ['normal'] },
  { valor: 'carie', rotulo: 'Cárie', formas: ['carie'] },
  { valor: 'lesao_periapical', rotulo: 'Lesão periapical', formas: ['lesao periapical', 'rarefacao periapical'] },
  { valor: 'perda_ossea', rotulo: 'Perda óssea', formas: ['perda ossea'] },
  { valor: 'dente_incluso', rotulo: 'Dente incluso', formas: ['dente incluso', 'incluso', 'impactado'] },
  { valor: 'tratamento_endodontico', rotulo: 'Tratamento endodôntico', formas: ['tratamento endodontico', 'tratamento de canal', 'endodontia'] },
  { valor: 'erro_tecnico', rotulo: 'Erro técnico', formas: ['erro tecnico'] },
]
// formas faladas extras de cada alteracao (alem do proprio rotulo)
const FORMAS_ALTERACAO: Record<string, string[]> = {
  carie_esmalte: ['carie de esmalte', 'carie em esmalte', 'carie no esmalte'],
  carie_dentina: ['carie de dentina', 'carie em dentina', 'carie na dentina'],
  carie_proxima_polpa: ['carie proxima a polpa', 'carie proxima da polpa', 'carie profunda'],
  carie_secundaria: ['carie secundaria', 'carie recorrente'],
  perda_ossea_horizontal: ['perda ossea horizontal'],
  perda_ossea_vertical: ['perda ossea vertical', 'defeito angular'],
  calculo_dentario: ['calculo dentario', 'calculo', 'tartaro'],
  alargamento_ligamento_periodontal: [
    'alargamento do ligamento periodontal', 'espessamento do ligamento periodontal', 'alargamento do ligamento',
    'espessamento do ligamento',
  ],
  lesao_periapical: ['lesao periapical', 'rarefacao periapical', 'periapicopatia'],
  reabsorcao_radicular_externa: ['reabsorcao radicular externa', 'reabsorcao externa'],
  reabsorcao_radicular_interna: ['reabsorcao radicular interna', 'reabsorcao interna'],
  tratamento_endodontico_presente: ['tratamento endodontico', 'tratamento de canal', 'canal tratado', 'endodontia'],
  tratamento_endodontico_inadequado: ['tratamento endodontico inadequado', 'canal inadequado', 'obturacao inadequada'],
  fratura_radicular: ['fratura radicular', 'fratura de raiz', 'raiz fraturada'],
  restauracao_presente: ['restauracao'],
  restauracao_com_infiltracao: ['restauracao com infiltracao', 'restauracao infiltrada', 'infiltracao'],
  coroa_protetica: ['coroa protetica', 'coroa'],
  nucleo_pino: ['nucleo e pino', 'pino intrarradicular', 'nucleo', 'pino'],
  cisto: ['cisto'],
  lesao_radiopaca: ['lesao radiopaca', 'radiopacidade'],
  lesao_radiolucida_inespecifica: ['lesao radiolucida inespecifica', 'lesao radiolucida', 'radiolucidez'],
  dente_incluso: ['dente incluso', 'dente impactado', 'incluso', 'impactado'],
  dente_supranumerario: ['dente supranumerario', 'supranumerario'],
  agenesia_dentaria: ['agenesia dentaria', 'agenesia', 'ausencia congenita'],
  alteracao_seio_maxilar: ['alteracao do seio maxilar', 'seio maxilar', 'velamento do seio'],
  corpo_estranho: ['corpo estranho'],
}
export const ALTERACOES: Opcao[] = CATEGORIAS_ALTERACOES.flatMap((c) =>
  c.itens.map((i) => ({
    valor: i.valor,
    rotulo: i.label,
    formas: Array.from(new Set([normalizar(i.label).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(), ...(FORMAS_ALTERACAO[i.valor] ?? [])])),
  }))
)

// regioes anatomicas faladas -> valor do backend (RegiaoAnatomica) e rotulo
const REGIOES_FALADAS: [string, string, string][] = [
  ['regiao periapical', 'regiao_periapical', 'região periapical'],
  ['regiao apical', 'regiao_periapical', 'região periapical'],
  ['periapice', 'regiao_periapical', 'região periapical'],
  ['coroa', 'coroa', 'coroa'],
  ['regiao coronaria', 'coroa', 'coroa'],
  ['raiz', 'raiz', 'raiz'],
  ['regiao radicular', 'raiz', 'raiz'],
  ['periodonto', 'periodonto', 'periodonto'],
  ['osso alveolar', 'osso_alveolar', 'osso alveolar'],
  ['crista alveolar', 'osso_alveolar', 'osso alveolar'],
  ['canal mandibular', 'canal_mandibular', 'canal mandibular'],
  ['seio maxilar', 'seio_maxilar', 'seio maxilar'],
  ['atm', 'atm', 'ATM'],
  ['articulacao temporomandibular', 'atm', 'ATM'],
  ['maxila', 'maxila', 'maxila'],
  ['mandibula', 'mandibula', 'mandíbula'],
  ['palato', 'palato', 'palato'],
].map(([f, v, r]) => [f, v, r] as [string, string, string])

// palavras-guia (formas normalizadas, a mais longa primeiro)
type Guia =
  | 'descricao' | 'continuar_descricao' | 'achados' | 'observacoes'
  | 'dentes' | 'qualidade' | 'idade' | 'sexo' | 'alteracao' | 'achado' | 'outro' | 'marcacao' | 'tipo'
  | 'fim' | 'desfazer' | 'salvar' | 'corrigir' | 'apagar' | 'proxima_secao' | 'secao_anterior' | 'macro' | 'nada_a_registrar' | 'anonimizacao' | 'erro'
const GUIAS: [string, Guia][] = ([
  ['anonimizacao', 'anonimizacao'],
  ['anonimizada', 'anonimizacao'],
  ['anonimizado', 'anonimizacao'],
  ['erros tecnicos', 'erro'],
  ['erro tecnico', 'erro'],
  ['nada a registrar', 'nada_a_registrar'],
  ['nada para registrar', 'nada_a_registrar'],
  ['macro', 'macro'],
  ['proxima secao', 'proxima_secao'],
  ['secao seguinte', 'proxima_secao'],
  ['proximo campo', 'proxima_secao'],
  ['secao anterior', 'secao_anterior'],
  ['campo anterior', 'secao_anterior'],
  ['continuar descricao', 'continuar_descricao'],
  ['continua descricao', 'continuar_descricao'],
  ['descricao didatica', 'descricao'],
  ['descricao', 'descricao'],
  ['achados detalhados', 'achados'],
  ['achado detalhado', 'achados'],
  ['observacoes internas', 'observacoes'],
  ['observacao interna', 'observacoes'],
  ['observacoes', 'observacoes'],
  ['dentes', 'dentes'],
  ['dente', 'dentes'],
  ['qualidade tecnica', 'qualidade'],
  ['qualidade', 'qualidade'],
  ['faixa etaria', 'idade'],
  ['idade', 'idade'],
  ['sexo', 'sexo'],
  ['genero', 'sexo'],
  ['alteracoes', 'alteracao'],
  ['alteracao', 'alteracao'],
  ['achado principal', 'achado'],
  ['achado', 'achado'],
  ['outro', 'outro'],
  ['outra', 'outro'],
  ['marcacao', 'marcacao'],
  ['tipo de radiografia', 'tipo'],
  ['tipo de exame', 'tipo'],
  ['tipo', 'tipo'],
  ['fim da descricao', 'fim'],
  ['fim do texto', 'fim'],
  ['fim', 'fim'],
  ['desfazer', 'desfazer'],
  ['salvar', 'salvar'],
  ['corrigir', 'corrigir'],
  ['apagar', 'apagar'],
] as [string, Guia][]).sort((a, b) => b[0].split(' ').length - a[0].split(' ').length)

// "dente incluso" nao e a palavra-guia "dente": checa antes
function ehValor(tokens: Token[], i: number, opcoes: Opcao[]): boolean {
  return casarOpcao(tokens, i, opcoes) !== null
}

function casarFrase(tokens: Token[], i: number, frase: string): number {
  const partes = frase.split(' ')
  for (let k = 0; k < partes.length; k++) {
    const t = tokens[i + k]
    if (!t || t.pontuacao || t.n !== partes[k]) return 0
  }
  return partes.length
}

function casarGuia(tokens: Token[], i: number): [Guia, number] | null {
  for (const [frase, guia] of GUIAS) {
    const n = casarFrase(tokens, i, frase)
    if (n) {
      if (guia === 'dentes' && ehValor(tokens, i, ALTERACOES)) return null
      return [guia, n]
    }
  }
  return null
}

/** casa a opcao mais longa a partir de tokens[i] */
function casarOpcao(tokens: Token[], i: number, opcoes: Opcao[]): { op: Opcao; n: number } | null {
  let melhor: { op: Opcao; n: number } | null = null
  for (const op of opcoes) {
    for (const forma of op.formas) {
      const n = casarFrase(tokens, i, forma)
      if (n && (!melhor || n > melhor.n)) melhor = { op, n }
    }
  }
  return melhor
}

// ------------------------------------------------------ semelhanca
function distancia(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
  for (let j = 1; j <= n; j++) d[0][j] = j
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[m][n]
}
function semelhanca(a: string, b: string): number {
  if (!a || !b) return 0
  return 1 - distancia(a, b) / Math.max(a.length, b.length)
}

const LIMIAR_AUTOMATICO = 0.88
const LIMIAR_SUGESTAO = 0.65

// ----------------------------------------------------------- aplicar
function juntarTexto(atual: string, novo: string): string {
  const a = atual.trim()
  const b = novo.trim()
  if (!b) return a
  if (!a) return b
  return /[.!?;,]$/.test(a) ? `${a} ${b}` : `${a}; ${b}`
}

function capitalizar(texto: string): string {
  const t = texto.trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

function limparLivre(texto: string): string {
  return texto.replace(/^[\s:,.;-]+|[\s:,;-]+$/g, '').trim()
}

const CONFIRMA_ANONIMIZACAO = ['ok', 'sim', 'anonimizada', 'anonimizado', 'validada', 'validado', 'confirmada', 'confirmado', 'conferida', 'conferido']
/** palavra-guia acrescentada a fala quando o item esta em destaque */
const GUIA_DA_ETAPA: Partial<Record<EtapaFicha, string>> = {
  tipo: 'tipo',
  idade: 'idade',
  genero: 'sexo',
  dentes: 'dentes',
  qualidade: 'qualidade',
}

export function interpretar(
  textoFalado: string,
  fichaInicial: FichaVoz,
  vocabulario: TermoVoz[] = [],
  opcoes: OpcoesInterpretar = {}
): ResultadoVoz {
  let ficha: FichaVoz = {
    ...fichaInicial,
    dentes: [...fichaInicial.dentes],
    alteracoes_observadas: [...fichaInicial.alteracoes_observadas],
    marcacoes: fichaInicial.marcacoes.map((m) => ({ ...m })),
    termos: [...fichaInicial.termos],
  }
  const alteracoes: Alteracao[] = []
  const naoReconhecidos: NaoReconhecido[] = []
  const comandos: ResultadoVoz['comandos'] = []
  let texto = textoFalado
  let tokens = tokenizar(texto)

  // "sem alterações" / "imagem normal" (a fala inteira): imagem normal
  const falaInteira = tokens.filter((t) => !t.pontuacao).map((t) => t.n).join(' ')
  // holofote num item: a secao dele vale como secao ativa
  const etapa = opcoes.etapa
  if (etapa && !opcoes.secaoAtiva) opcoes = { ...opcoes, secaoAtiva: SECAO_DA_ETAPA[etapa] }
  // "Anonimização" em destaque: "ok" / "anonimizada" / "sim" confirma
  if (etapa === 'anonimizacao' && CONFIRMA_ANONIMIZACAO.includes(falaInteira)) {
    ficha = { ...ficha, anonimizacao_validada: true }
    alteracoes.push({ campo: 'anonimizacao', descricao: 'Anonimização validada' })
    return { ficha, alteracoes, naoReconhecidos, comandos }
  }
  // atalhos de uma palavra (fala inteira), validos com "Dados" em destaque
  // ou sem secao: "ok" (anonimizacao), "m"/"f" (sexo), "pan"/"in"/"pe"/"o"
  if (!opcoes.secaoAtiva || opcoes.secaoAtiva === 'dados') {
    if (['ok', 'anonimizada', 'anonimizado'].includes(falaInteira) && (!etapa || etapa === 'anonimizacao')) {
      ficha = { ...ficha, anonimizacao_validada: true }
      alteracoes.push({ campo: 'anonimizacao', descricao: 'Anonimização validada' })
      return { ficha, alteracoes, naoReconhecidos, comandos }
    }
    const g = GENEROS_CURTOS.find((o) => o.formas.includes(falaInteira))
    if (g) {
      ficha = { ...ficha, genero: g.valor }
      alteracoes.push({ campo: 'genero', descricao: `Sexo: ${g.rotulo}` })
      return { ficha, alteracoes, naoReconhecidos, comandos }
    }
    const tc = TIPOS_CURTOS.find((o) => o.formas.includes(falaInteira))
    if (tc) {
      ficha = { ...ficha, tipo_radiografia: tc.valor }
      alteracoes.push({ campo: 'tipo_radiografia', descricao: `Tipo: ${tc.rotulo}` })
      return { ficha, alteracoes, naoReconhecidos, comandos }
    }
  }
  // item de "Dados" em destaque: a fala sem palavra-guia ganha a palavra-guia
  // do item ("35" -> "idade 35", "36 e 37" -> "dentes 36 e 37")
  const guiaEtapa = etapa ? GUIA_DA_ETAPA[etapa] : undefined
  if (guiaEtapa && tokens.length && !casarGuia(tokens, 0)) {
    texto = `${guiaEtapa} ${texto}`
    tokens = tokenizar(texto)
  }
  // "sem erro técnico" (fala inteira) = nada a registrar no erro tecnico
  if (['sem erro tecnico', 'sem erros tecnicos', 'nenhum erro tecnico', 'nenhum erro', 'sem erro'].includes(falaInteira)) {
    comandos.push('nada_a_registrar')
    return { ficha, alteracoes, naoReconhecidos, comandos }
  }
  if (['sem alteracoes', 'sem alteracao', 'imagem sem alteracoes', 'imagem normal', 'radiografia normal', 'radiografia sem alteracoes'].includes(falaInteira)) {
    if ((ficha.achados ?? []).length) {
      naoReconhecidos.push({ texto: textoFalado, sugestoes: [] })
    } else {
      ficha = { ...ficha, sem_alteracoes: true }
      alteracoes.push({ campo: 'alteracoes_observadas', descricao: 'Imagem sem alterações' })
    }
    return { ficha, alteracoes, naoReconhecidos, comandos }
  }

  // Marcações em destaque: "dois cárie" vale como "marcação dois cárie"
  // "Achados" em destaque: numero no comeco de cada frase = numero da
  // marcacao ("um lesão periapical. dois cárie em dentina")
  if (opcoes.secaoAtiva === 'achados' && tokens.length) {
    let novo = ''
    let ultimo = 0
    tokens.forEach((t, k) => {
      const inicioFrase = k === 0 || tokens[k - 1].pontuacao
      const num = inicioFrase && !casarGuia(tokens, k) ? lerNumero(tokens, k) : null
      if (num && num[0] >= 1 && num[0] <= 20) {
        novo += texto.slice(ultimo, t.inicio) + 'marcação '
        ultimo = t.inicio
      }
    })
    if (ultimo > 0 || novo) {
      texto = novo + texto.slice(ultimo)
      tokens = tokenizar(texto)
    }
  }

  // alteracoes da lista + frases que o curador ensinou
  const aprendidas = opcoes.frasesAprendidas ?? []
  const listaAlteracoes: Opcao[] = aprendidas.length
    ? ALTERACOES.map((op) => {
        const extras = aprendidas.filter((f) => f.alteracao === op.valor).map((f) => formaFalada(f.frase))
        return extras.length ? { ...op, formas: Array.from(new Set([...op.formas, ...extras])) } : op
      })
    : ALTERACOES
  const macros = (opcoes.macros ?? []).map((m) => ({ ...m, forma: formaFalada(m.nome) }))

  // termos do vocabulario controlado como opcoes (nome + sinonimos)
  const opcoesTermos: (Opcao & { id: number })[] = vocabulario.map((t) => ({
    id: t.id,
    valor: String(t.id),
    rotulo: t.termo,
    formas: [t.termo, ...t.sinonimos.map((s) => s.sinonimo)].map((f) =>
      normalizar(f).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    ),
  }))

  const anotar = (campo: CampoVoz, descricao: string, aproximada = false) =>
    alteracoes.push({ campo, descricao, aproximada })

  const aplicarErro = (valor: string) => {
    const atuais = ficha.erros_tecnicos ?? []
    if (!atuais.includes(valor)) ficha = { ...ficha, erros_tecnicos: [...atuais, valor] }
    anotar('erros_tecnicos', `Erro técnico: ${rotuloErro(valor)}`)
  }

  // Achado falado + ONDE (logo em seguida, na mesma frase):
  // "lesão periapical no dente 36, região periapical, marcação um".
  // Devolve quantas palavras de "onde" foram lidas.
  const aplicarAlteracao = (op: Opcao, inicioContexto = -1): number => {
    const ctx = inicioContexto >= 0 ? lerContexto(inicioContexto) : { dentes: [] as number[], regiao: '', marcacoes: [] as string[], marcacoesNum: [] as number[], n: 0 }
    // sem "marcação N": vai para a proxima marcacao que ainda nao tem
    // achado (o curador fala na sequencia das marcacoes)
    if (!ctx.marcacoes.length) {
      const ligadas = new Set((ficha.achados ?? []).flatMap((a) => a.marcacoes))
      const livre = ficha.marcacoes.findIndex((m) => !ligadas.has(m.id))
      if (livre >= 0) {
        ctx.marcacoes = [ficha.marcacoes[livre].id]
        ctx.marcacoesNum = [livre + 1]
      }
    }
    ficha = adicionarAchado(ficha as FichaVoz & { marcacoes: Marcacao[] }, { tipo: op.valor, dentes: ctx.dentes, regiao: ctx.regiao, marcacoes: ctx.marcacoes })
    const onde = [
      ctx.dentes.length ? `dente ${ctx.dentes.join(', ')}` : '',
      ctx.regiao ? (REGIOES_FALADAS.find((r) => r[1] === ctx.regiao)?.[2] ?? ctx.regiao) : '',
      ctx.marcacoes.length ? `marcação ${ctx.marcacoesNum.join(', ')}` : '',
    ].filter(Boolean).join(' • ')
    anotar('alteracoes_observadas', `Achado: ${op.rotulo}${onde ? ` (${onde})` : ''}`)
    return ctx.n
  }
  // "onde" de um achado: dentes, regiao e marcacao (em qualquer ordem)
  const lerContexto = (inicio: number) => {
    const res = { dentes: [] as number[], regiao: '', marcacoes: [] as string[], marcacoesNum: [] as number[], n: 0 }
    let k = inicio
    let ultimoUtil = inicio
    const LIGA = new Set(['no', 'na', 'nos', 'nas', 'em', 'do', 'da', 'de', 'dos', 'das', 'e', ','])
    while (k < tokens.length) {
      const t = tokens[k]
      if (t.pontuacao && t.n !== ',') break
      if (LIGA.has(t.n)) {
        k++
        continue
      }
      const g = casarGuia(tokens, k)
      if (g && g[0] === 'dentes') {
        const [ds, prox] = lerDentes(pularPontuacaoEVazias(k + g[1]))
        if (!ds.length) break
        res.dentes.push(...ds)
        k = ultimoUtil = prox
        continue
      }
      if (g && g[0] === 'marcacao') {
        const num = lerNumero(tokens, pularPontuacaoEVazias(k + g[1]))
        const alvo = num ? ficha.marcacoes[num[0] - 1] : undefined
        if (!num || !alvo) break
        res.marcacoes.push(alvo.id)
        res.marcacoesNum.push(num[0])
        k = ultimoUtil = pularPontuacaoEVazias(k + g[1]) + num[1]
        continue
      }
      // "no 36" (numero FDI direto depois de no/na)
      const anterior = tokens[k - 1]?.n
      if (anterior && ['no', 'na', 'nos', 'nas'].includes(anterior) && lerNumero(tokens, k)) {
        const [ds, prox] = lerDentes(k)
        if (ds.length) {
          res.dentes.push(...ds)
          k = ultimoUtil = prox
          continue
        }
      }
      const r = REGIOES_FALADAS.map(([forma, valor]) => ({ n: casarFrase(tokens, k, forma), valor }))
        .filter((x) => x.n)
        .sort((a, b) => b.n - a.n)[0]
      if (r) {
        res.regiao = r.valor
        k = ultimoUtil = k + r.n
        continue
      }
      break
    }
    res.dentes = Array.from(new Set(res.dentes)).sort((a, b) => a - b)
    res.n = ultimoUtil - inicio
    return res
  }
  const aplicarTermo = (op: Opcao & { id?: number }, aproximada = false) => {
    const id = Number(op.valor)
    if (!ficha.termos.includes(id)) ficha.termos = [...ficha.termos, id]
    if (!normalizar(ficha.achados_detalhe).includes(normalizar(op.rotulo))) {
      ficha.achados_detalhe = juntarTexto(ficha.achados_detalhe, op.rotulo)
    }
    anotar('termos', `Termo: ${op.rotulo}`, aproximada)
  }
  const aplicarOutroTexto = (livre: string) => {
    const valor = capitalizar(limparLivre(livre))
    if (!valor) return
    // se o texto do "Outro" ja e um termo oficial, liga o termo
    const nv = normalizar(valor).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    const termo = opcoesTermos.find((o) => o.formas.includes(nv))
    if (termo) {
      aplicarTermo(termo)
      return
    }
    ficha.achados_detalhe = juntarTexto(ficha.achados_detalhe, valor)
    anotar('achados_detalhe', `Outro: ${valor}`)
  }

  // pedacos nao entendidos: acumula tokens e fecha no proximo reconhecido
  let pendente: Token[] = []
  const fecharPendente = () => {
    const uteis = pendente.filter((t) => !t.pontuacao)
    if (uteis.length && uteis.some((t) => !PALAVRAS_VAZIAS.has(t.n))) {
      const original = texto.slice(pendente[0].inicio, pendente[pendente.length - 1].fim)
      const limpo = limparLivre(original)
      const n = uteis.map((t) => t.n).join(' ')
      naoReconhecidos.push({ texto: limpo, sugestoes: sugerir(n) })
    }
    pendente = []
  }

  // procura palavra parecida em todas as listas
  const sugerir = (n: string): Sugestao[] => {
    const candidatos: { s: number; sug: Sugestao }[] = []
    const avaliar = (op: Opcao, sug: Omit<Sugestao, 'rotulo'> & { rotulo: string }) => {
      const s = Math.max(...op.formas.map((f) => semelhanca(n, f)))
      if (s >= LIMIAR_SUGESTAO) candidatos.push({ s, sug })
    }
    for (const op of listaAlteracoes) avaliar(op, sugestaoAlteracao(op))
    for (const op of TIPOS)
      avaliar(op, { rotulo: `Tipo: ${op.rotulo}`, aplicar: (f) => ({ ...f, tipo_radiografia: op.valor }), destino: { tipo: 'tipo', valor: op.valor }, campo: 'tipo_radiografia' })
    for (const op of opcoesTermos) avaliar(op, sugestaoTermo(op))
    // "carie" sozinha: perguntar qual tipo
    if (n === 'carie' || n === 'caries') {
      for (const op of listaAlteracoes.filter((a) => a.valor.startsWith('carie'))) candidatos.push({ s: 0.9, sug: sugestaoAlteracao(op) })
    }
    const vistos = new Set<string>()
    return candidatos
      .sort((a, b) => b.s - a.s)
      .filter((c) => !vistos.has(c.sug.rotulo) && vistos.add(c.sug.rotulo))
      .slice(0, 4)
      .map((c) => c.sug)
  }
  const sugestaoAlteracao = (op: Opcao): Sugestao => ({
    rotulo: `Achado: ${op.rotulo}`,
    aplicar: (f) => adicionarAchado(f, { tipo: op.valor }),
    destino: { tipo: 'alteracao', valor: op.valor },
    campo: 'alteracoes_observadas',
  })
  const sugestaoTermo = (op: Opcao & { id: number }): Sugestao => ({
    rotulo: `Termo: ${op.rotulo}`,
    aplicar: (f) => ({
      ...f,
      termos: f.termos.includes(op.id) ? f.termos : [...f.termos, op.id],
      achados_detalhe: normalizar(f.achados_detalhe).includes(normalizar(op.rotulo)) ? f.achados_detalhe : juntarTexto(f.achados_detalhe, op.rotulo),
    }),
    destino: { tipo: 'termo', valor: String(op.id) },
    campo: 'termos',
  })

  // trecho solto (ate 5 palavras) PARECIDO com um item da lista: NAO
  // preenche - vira duvida com a sugestao no topo (o curador confirma com
  // um clique e pode ensinar a frase). Palavra unica curta nao entra (gera
  // falsos alarmes). Devolve quantas palavras consumiu (0 = nada parecido).
  const duvidaAproximada = (i: number): number => {
    let melhor: { s: number; n: number; sug: Sugestao } | null = null
    for (let tam = Math.min(5, tokens.length - i); tam >= 1; tam--) {
      const pedaco = tokens.slice(i, i + tam)
      if (pedaco.some((t) => t.pontuacao)) continue
      const n = pedaco.map((t) => t.n).join(' ')
      if (n.length < (tam === 1 ? 7 : 6)) continue
      const testar = (op: Opcao, sug: Sugestao) => {
        for (const f of op.formas) {
          if (f.split(' ').length !== tam) continue
          const sc = semelhanca(n, f)
          if (sc >= LIMIAR_AUTOMATICO && (!melhor || sc > melhor.s)) melhor = { s: sc, n: tam, sug }
        }
      }
      for (const op of listaAlteracoes) testar(op, sugestaoAlteracao(op))
      for (const op of opcoesTermos) testar(op, sugestaoTermo(op))
    }
    if (!melhor) return 0
    const m = melhor as { s: number; n: number; sug: Sugestao }
    const original = texto.slice(tokens[i].inicio, tokens[i + m.n - 1].fim)
    const n = tokens.slice(i, i + m.n).map((t) => t.n).join(' ')
    const outras = sugerir(n).filter((x) => x.rotulo !== m.sug.rotulo).slice(0, 3)
    naoReconhecidos.push({ texto: original, sugestoes: [m.sug, ...outras], parecido: true })
    return m.n
  }

  // texto livre ate "fim" (ou fim do trecho)
  const lerLivreAteFim = (i: number): [string, number] => {
    let j = i
    while (j < tokens.length) {
      const g = casarGuia(tokens, j)
      if (g && g[0] === 'fim') break
      j++
    }
    const livre = j > i ? texto.slice(tokens[i].inicio, tokens[j - 1].fim) : ''
    const fimN = j < tokens.length ? (casarGuia(tokens, j)?.[1] ?? 0) : 0
    return [limparLivre(livre), j + fimN]
  }

  // texto do "Outro": ate ponto, "fim" ou proxima palavra-guia
  const lerLivreCurto = (i: number): [string, number] => {
    let j = i
    while (j < tokens.length) {
      const t = tokens[j]
      if (t.pontuacao && (t.n === '.' || t.n === ';' || t.n === '!' || t.n === '?')) break
      if (j > i && casarGuia(tokens, j)) break
      j++
    }
    const livre = j > i ? texto.slice(tokens[i].inicio, tokens[j - 1].fim) : ''
    let prox = j
    if (j < tokens.length && casarGuia(tokens, j)?.[0] === 'fim') prox += casarGuia(tokens, j)![1]
    return [limparLivre(livre), prox]
  }

  const pularPontuacaoEVazias = (i: number) => {
    while (i < tokens.length && (tokens[i].pontuacao || ['de', 'da', 'do', 'e', 'a', 'o', 'entre'].includes(tokens[i].n))) i++
    return i
  }

  const lerDentes = (i: number): [number[], number] => {
    const dentes: number[] = []
    let j = i
    while (j < tokens.length) {
      const t = tokens[j]
      if (t.pontuacao && t.n !== ',') break
      if (t.n === 'e' || t.n === ',' || t.n === 'o' || t.n === 'os') {
        j++
        continue
      }
      const num = lerNumero(tokens, j)
      if (!num) break
      let [valor, usados] = num
      // "tres seis" (digito a digito) -> 36
      if (valor >= 1 && valor <= 4) {
        const prox = lerNumero(tokens, j + usados)
        if (prox && prox[0] >= 1 && prox[0] <= 8 && prox[1] === 1) {
          valor = valor * 10 + prox[0]
          usados += 1
        }
      }
      if (DENTE_VALIDO(valor)) dentes.push(valor)
      else break
      j += usados
    }
    return [dentes, j]
  }

  let i = 0

  // Secao de texto em destaque: o que for falado SEM palavra-guia no
  // comeco vai para esse campo (acrescentado), ate "fim" ou o fim do
  // trecho. Depois de "fim" as regras normais voltam a valer.
  const campoAtivo = opcoes.secaoAtiva ? SECOES_TEXTO[opcoes.secaoAtiva] : undefined
  if (campoAtivo && tokens.length && !casarGuia(tokens, 0)) {
    const [livre, prox] = lerLivreAteFim(0)
    if (livre) {
      const valor = capitalizar(livre)
      ficha = { ...ficha, [campoAtivo]: juntarTexto(ficha[campoAtivo], valor) }
      const nomes = { descricao_didatica: 'Descrição', achados_detalhe: 'Achados detalhados', observacoes_internas: 'Observações internas' }
      anotar(campoAtivo, `${nomes[campoAtivo]}: ${valor}`)
    }
    i = prox
  }

  while (i < tokens.length) {
    const tok = tokens[i]
    const guia = casarGuia(tokens, i)

    if (guia) {
      fecharPendente()
      const [g, n] = guia
      let j = pularPontuacaoEVazias(i + n)

      if (g === 'descricao' || g === 'continuar_descricao' || g === 'achados' || g === 'observacoes') {
        const campo = g === 'achados' ? 'achados_detalhe' : g === 'observacoes' ? 'observacoes_internas' : 'descricao_didatica'
        const [livre, prox] = lerLivreAteFim(i + n)
        if (livre) {
          const valor = capitalizar(livre)
          ficha = { ...ficha, [campo]: g === 'descricao' ? valor : juntarTexto(ficha[campo], valor) }
          const nomes = { descricao_didatica: 'Descrição', achados_detalhe: 'Achados detalhados', observacoes_internas: 'Observações internas' }
          anotar(campo, `${nomes[campo]}${g === 'continuar_descricao' ? ' (continuação)' : ''}: ${valor}`)
        }
        i = prox
        continue
      }

      if (g === 'dentes') {
        const [dentes, prox] = lerDentes(j)
        if (dentes.length) {
          ficha.dentes = Array.from(new Set([...ficha.dentes, ...dentes])).sort((a, b) => a - b)
          anotar('dentes', `Dentes: ${dentes.join(', ')}`)
          i = prox
        } else {
          pendente.push(...tokens.slice(i, j + 1))
          i = j + 1
        }
        continue
      }

      if (g === 'qualidade') {
        const c = casarOpcao(tokens, j, QUALIDADES)
        if (c) {
          ficha.qualidade_tecnica = c.op.valor
          anotar('qualidade_tecnica', `Qualidade: ${c.op.rotulo}`)
          i = j + c.n
        } else {
          pendente.push(...tokens.slice(i, j + 1))
          i = j + 1
        }
        continue
      }

      if (g === 'sexo') {
        const c = casarOpcao(tokens, j, [...GENEROS, ...GENEROS_CURTOS])
        if (c) {
          ficha.genero = c.op.valor
          anotar('genero', `Sexo: ${c.op.rotulo}`)
          i = j + c.n
        } else {
          pendente.push(...tokens.slice(i, j + 1))
          i = j + 1
        }
        continue
      }

      if (g === 'idade') {
        const a = lerNumero(tokens, j)
        if (a) {
          let k = pularPontuacaoEVazias(j + a[1])
          if (tokens[k]?.n === 'ate' || tokens[k]?.n === 'a') k++
          const b = lerNumero(tokens, k)
          const min = a[0]
          const max = b ? b[0] : a[0]
          ficha.idade_min = String(Math.min(min, max))
          ficha.idade_max = String(Math.max(min, max))
          anotar('idade', `Idade: ${ficha.idade_min} a ${ficha.idade_max} anos`)
          i = b ? k + b[1] : j + a[1]
          if (tokens[i]?.n === 'anos') i++
        } else {
          pendente.push(...tokens.slice(i, j + 1))
          i = j + 1
        }
        continue
      }

      if (g === 'tipo') {
        const c = casarOpcao(tokens, j, [...TIPOS, ...TIPOS_CURTOS])
        if (c) {
          ficha.tipo_radiografia = c.op.valor
          anotar('tipo_radiografia', `Tipo: ${c.op.rotulo}`)
          i = j + c.n
        } else i = j
        continue
      }

      if (g === 'alteracao') {
        // lista: "alteração perda óssea vertical e cálculo"
        let k = j
        let algum = false
        while (k < tokens.length) {
          k = pularPontuacaoEVazias(k)
          if (k >= tokens.length || casarGuia(tokens, k)) break
          const c = casarOpcao(tokens, k, listaAlteracoes)
          const ct = casarOpcao(tokens, k, opcoesTermos)
          if (ct && (!c || ct.n >= c.n)) {
            aplicarTermo(ct.op as Opcao & { id: number })
            k += ct.n
            algum = true
            continue
          }
          if (c) {
            k += c.n
            k += aplicarAlteracao(c.op, k)
            algum = true
            continue
          }
          const aprox = duvidaAproximada(k)
          if (aprox) {
            k += aprox
            algum = true
            continue
          }
          break
        }
        if (!algum) pendente.push(tokens[i])
        i = algum ? k : i + n
        continue
      }

      if (g === 'achado' || g === 'outro') {
        // "achado outro: texto" / "outro: texto" / "achado <termo>"
        let k = j
        if (g === 'achado') {
          const proximo = casarGuia(tokens, k)
          if (proximo && proximo[0] === 'outro') {
            k = pularPontuacaoEVazias(k + proximo[1])
          } else {
            const ct = casarOpcao(tokens, k, opcoesTermos)
            const ca = casarOpcao(tokens, k, listaAlteracoes)
            if (ct) {
              aplicarTermo(ct.op as Opcao & { id: number })
              i = k + ct.n
              continue
            }
            if (ca) {
              i = k + ca.n
              i += aplicarAlteracao(ca.op, i)
              continue
            }
          }
        }
        const [livre, prox] = lerLivreCurto(k)
        if (livre) aplicarOutroTexto(livre)
        i = prox
        continue
      }

      if (g === 'anonimizacao') {
        // "anonimização ok" / "anonimizada": confirma a anonimizacao
        let k = j
        while (k < tokens.length && ['ok', 'validada', 'confirmada', 'sim', 'conferida'].includes(tokens[k].n)) k++
        ficha = { ...ficha, anonimizacao_validada: true }
        anotar('anonimizacao', 'Anonimização validada')
        i = k
        continue
      }

      if (g === 'erro') {
        // "erro técnico corte de cone e subexposição"
        let k = j
        let algum = false
        while (k < tokens.length) {
          k = pularPontuacaoEVazias(k)
          if (k >= tokens.length || casarGuia(tokens, k)) break
          const c = casarOpcao(tokens, k, opcoesErros(ficha.tipo_radiografia))
          if (!c) break
          aplicarErro(c.op.valor)
          k += c.n
          algum = true
        }
        if (!algum) pendente.push(...tokens.slice(i, j + 1))
        i = algum ? k : j
        continue
      }

      if (g === 'marcacao') {
        const num = lerNumero(tokens, j)
        if (!num) {
          pendente.push(...tokens.slice(i, j + 1))
          i = j + 1
          continue
        }
        const indice = num[0] - 1
        let k = pularPontuacaoEVazias(j + num[1])
        const alvo = ficha.marcacoes[indice]
        if (!alvo) {
          naoReconhecidos.push({ texto: `Marcação ${num[0]} (não existe na imagem)`, sugestoes: [] })
          i = k
          continue
        }
        const guiaOutro = casarGuia(tokens, k)
        if (guiaOutro && guiaOutro[0] === 'outro') {
          const [livre, prox] = lerLivreCurto(pularPontuacaoEVazias(k + guiaOutro[1]))
          ficha.marcacoes = ficha.marcacoes.map((m, x) =>
            x === indice ? { ...m, achado: 'outro', achado_descricao: capitalizar(livre) || null } : m
          )
          anotar('marcacoes', `Marcação ${num[0]}: Outro${livre ? ` — ${capitalizar(livre)}` : ''}`)
          // o texto e um termo oficial? liga o termo a ficha tambem
          const nv = normalizar(livre).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
          const termo = opcoesTermos.find((o) => o.formas.includes(nv))
          if (termo && !ficha.termos.includes(termo.id)) {
            ficha.termos = [...ficha.termos, termo.id]
            anotar('termos', `Termo: ${termo.rotulo}`)
          }
          i = prox
          continue
        }
        // achado da lista padronizada (26) ligado a esta marcacao + onde
        const ca = casarOpcao(tokens, k, listaAlteracoes)
        if (ca) {
          const ctx = lerContexto(k + ca.n)
          const outros = (ficha.achados ?? []).filter((a) => !a.marcacoes.includes(alvo.id))
          ficha = comAchados(ficha as FichaVoz & { marcacoes: Marcacao[] }, [
            ...outros,
            { tipo: ca.op.valor, dentes: ctx.dentes, regiao: ctx.regiao, marcacoes: [alvo.id] },
          ])
          const onde = [ctx.dentes.length ? `dente ${ctx.dentes.join(', ')}` : '', ctx.regiao].filter(Boolean).join(' • ')
          anotar('alteracoes_observadas', `Marcação ${num[0]}: ${ca.op.rotulo}${onde ? ` (${onde})` : ''}`)
          i = k + ca.n + ctx.n
          continue
        }
        const c = casarOpcao(tokens, k, ACHADOS_MARCACAO)
        if (c) {
          ficha.marcacoes = ficha.marcacoes.map((m, x) => (x === indice ? { ...m, achado: c.op.valor, achado_descricao: null } : m))
          anotar('marcacoes', `Marcação ${num[0]}: ${c.op.rotulo}`)
          i = k + c.n
        } else {
          pendente.push(...tokens.slice(i, k + 1))
          i = k + 1
        }
        continue
      }

      if (g === 'macro') {
        // nome da macro: a mais longa que casar exatamente; se nenhuma,
        // a mais parecida vira DUVIDA (nunca aplica sozinha)
        let melhor: { m: (typeof macros)[number]; n: number } | null = null
        for (const m of macros) {
          const n2 = m.forma ? casarFrase(tokens, j, m.forma) : 0
          if (n2 && (!melhor || n2 > melhor.n)) melhor = { m, n: n2 }
        }
        if (melhor) {
          const r = aplicarMacro(ficha, melhor.m)
          ficha = r.ficha
          alteracoes.push(...r.alteracoes)
          i = j + melhor.n
          continue
        }
        const [nome, prox] = lerLivreCurto(j)
        const nn = formaFalada(nome)
        const parecidas = macros
          .map((m) => ({ m, s: semelhanca(nn, m.forma) }))
          .filter((x) => nn && x.s >= LIMIAR_SUGESTAO)
          .sort((a, b) => b.s - a.s)
          .slice(0, 3)
        naoReconhecidos.push({
          texto: `Macro ${nome || '(sem nome)'}`,
          parecido: parecidas.length > 0,
          sugestoes: parecidas.map(({ m }) => ({
            rotulo: `Macro: ${m.nome}`,
            aplicar: (f) => aplicarMacro(f, m).ficha,
            destino: { tipo: 'macro', valor: String(m.id) },
          })),
        })
        i = prox
        continue
      }

      if (g === 'desfazer' || g === 'salvar' || g === 'proxima_secao' || g === 'secao_anterior' || g === 'nada_a_registrar') {
        comandos.push(g)
        i += n
        continue
      }

      if (g === 'corrigir') {
        // "corrigir dente 36 para 46"
        const gd = casarGuia(tokens, j)
        if (gd && gd[0] === 'dentes') {
          const a = lerDentes(pularPontuacaoEVazias(j + gd[1]))
          let k = a[1]
          if (tokens[k]?.n === 'para' || tokens[k]?.n === 'por') k++
          const b = lerDentes(pularPontuacaoEVazias(k))
          if (a[0].length === 1 && b[0].length === 1) {
            ficha.dentes = Array.from(new Set(ficha.dentes.filter((d) => d !== a[0][0]).concat(b[0][0]))).sort((x, y) => x - y)
            anotar('dentes', `Dente ${a[0][0]} corrigido para ${b[0][0]}`)
            i = b[1]
            continue
          }
        }
        pendente.push(tokens[i])
        i += n
        continue
      }

      if (g === 'apagar') {
        const ga = casarGuia(tokens, j)
        const campos: Partial<Record<Guia, keyof FichaVoz>> = {
          descricao: 'descricao_didatica', achados: 'achados_detalhe', observacoes: 'observacoes_internas',
        }
        if (ga && campos[ga[0]]) {
          const campo = campos[ga[0]]!
          ficha = { ...ficha, [campo]: '' }
          anotar(campo as CampoVoz, `Apagado: ${ga[0] === 'descricao' ? 'Descrição' : ga[0] === 'achados' ? 'Achados detalhados' : 'Observações internas'}`)
          i = j + ga[1]
        } else if (ga && ga[0] === 'dentes') {
          const [dentes, prox] = lerDentes(pularPontuacaoEVazias(j + ga[1]))
          if (dentes.length) {
            ficha.dentes = ficha.dentes.filter((d) => !dentes.includes(d))
            anotar('dentes', `Dentes removidos: ${dentes.join(', ')}`)
            i = prox
          } else i = j + ga[1]
        } else {
          pendente.push(tokens[i])
          i += n
        }
        continue
      }

      // 'fim' solto
      i += n
      continue
    }

    if (tok.pontuacao) {
      fecharPendente()
      i++
      continue
    }

    // "Dados" em destaque: "ok" confirma a anonimizacao
    if (opcoes.secaoAtiva === 'dados' && (!etapa || etapa === 'anonimizacao') && tok.n === 'ok') {
      fecharPendente()
      ficha = { ...ficha, anonimizacao_validada: true }
      anotar('anonimizacao', 'Anonimização validada')
      i++
      continue
    }

    // "Erro técnico" em destaque: nomes de erro soltos
    if (opcoes.secaoAtiva === 'erro_tecnico') {
      const ce = casarOpcao(tokens, i, opcoesErros(ficha.tipo_radiografia))
      if (ce) {
        fecharPendente()
        aplicarErro(ce.op.valor)
        i += ce.n
        continue
      }
    }

    // valores soltos (sem palavra-guia)
    const ct = casarOpcao(tokens, i, opcoesTermos)
    const ca = casarOpcao(tokens, i, listaAlteracoes)
    const ctp = casarOpcao(tokens, i, TIPOS)
    const cg = casarOpcao(tokens, i, GENEROS)
    const maior = [ct && { k: 't', n: ct.n }, ca && { k: 'a', n: ca.n }, ctp && { k: 'p', n: ctp.n }, cg && { k: 'g', n: cg.n }]
      .filter(Boolean)
      .sort((x, y) => y!.n - x!.n)[0]
    if (maior) {
      fecharPendente()
      if (maior.k === 't') aplicarTermo(ct!.op as Opcao & { id: number })
      else if (maior.k === 'a') i += aplicarAlteracao(ca!.op, i + maior.n)
      else if (maior.k === 'p') {
        ficha.tipo_radiografia = ctp!.op.valor
        anotar('tipo_radiografia', `Tipo: ${ctp!.op.rotulo}`)
      } else {
        ficha.genero = cg!.op.valor
        anotar('genero', `Sexo: ${cg!.op.rotulo}`)
      }
      i += maior.n
      continue
    }

    if (!PALAVRAS_VAZIAS.has(tok.n)) {
      const aprox = duvidaAproximada(i)
      if (aprox) {
        fecharPendente()
        i += aprox
        continue
      }
    }
    pendente.push(tok)
    i++
  }
  fecharPendente()

  return { ficha, alteracoes, naoReconhecidos, comandos }
}
