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
// O que nao for entendido NAO entra em campo nenhum: vai para a lista
// "Não reconhecido", com sugestao quando ha uma palavra parecida.

import type { Marcacao } from './marcacoes'
import { CATEGORIAS_ALTERACOES } from './alteracoesObservadas'
import { SECOES_TEXTO, type SecaoFicha } from './secoesCuradoria'

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

export interface Sugestao {
  rotulo: string
  aplicar: (ficha: FichaVoz) => FichaVoz
}

export interface NaoReconhecido {
  texto: string
  sugestoes: Sugestao[]
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

export type ComandoVoz = 'desfazer' | 'salvar' | 'proxima_secao' | 'secao_anterior'

export interface OpcoesInterpretar {
  /** secao em destaque na coluna da ficha (destino da fala sem palavra-guia) */
  secaoAtiva?: SecaoFicha
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
  { valor: 'panoramica', rotulo: 'Panorâmica', formas: ['panoramica', 'panorama', 'panoramico'] },
  { valor: 'interproximal', rotulo: 'Interproximal', formas: ['interproximal', 'bitewing', 'bite wing', 'interproximais'] },
  { valor: 'oclusal', rotulo: 'Oclusal', formas: ['oclusal'] },
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

// palavras-guia (formas normalizadas, a mais longa primeiro)
type Guia =
  | 'descricao' | 'continuar_descricao' | 'achados' | 'observacoes'
  | 'dentes' | 'qualidade' | 'idade' | 'sexo' | 'alteracao' | 'achado' | 'outro' | 'marcacao' | 'tipo'
  | 'fim' | 'desfazer' | 'salvar' | 'corrigir' | 'apagar' | 'proxima_secao' | 'secao_anterior'
const GUIAS: [string, Guia][] = ([
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

  // Marcações em destaque: "dois cárie" vale como "marcação dois cárie"
  if (opcoes.secaoAtiva === 'marcacoes' && tokens.length && !casarGuia(tokens, 0) && lerNumero(tokens, 0)) {
    texto = `marcação ${texto}`
    tokens = tokenizar(texto)
  }

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

  const aplicarAlteracao = (op: Opcao, aproximada = false) => {
    if (!ficha.alteracoes_observadas.includes(op.valor)) {
      ficha.alteracoes_observadas = [...ficha.alteracoes_observadas, op.valor]
    }
    anotar('alteracoes_observadas', `Alteração: ${op.rotulo}`, aproximada)
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
    const avaliar = (op: Opcao, fazer: (f: FichaVoz) => FichaVoz, rotulo: string) => {
      const s = Math.max(...op.formas.map((f) => semelhanca(n, f)))
      if (s >= LIMIAR_SUGESTAO) candidatos.push({ s, sug: { rotulo, aplicar: fazer } })
    }
    for (const op of ALTERACOES)
      avaliar(op, (f) => ({ ...f, alteracoes_observadas: f.alteracoes_observadas.includes(op.valor) ? f.alteracoes_observadas : [...f.alteracoes_observadas, op.valor] }), `Alteração: ${op.rotulo}`)
    for (const op of TIPOS) avaliar(op, (f) => ({ ...f, tipo_radiografia: op.valor }), `Tipo: ${op.rotulo}`)
    for (const op of opcoesTermos)
      avaliar(op, (f) => ({ ...f, termos: f.termos.includes(op.id) ? f.termos : [...f.termos, op.id], achados_detalhe: juntarTexto(f.achados_detalhe, op.rotulo) }), `Termo: ${op.rotulo}`)
    // "carie" sozinha: perguntar qual tipo
    if (n === 'carie' || n === 'caries') {
      for (const op of ALTERACOES.filter((a) => a.valor.startsWith('carie')))
        candidatos.push({ s: 0.9, sug: { rotulo: `Alteração: ${op.rotulo}`, aplicar: (f) => ({ ...f, alteracoes_observadas: f.alteracoes_observadas.includes(op.valor) ? f.alteracoes_observadas : [...f.alteracoes_observadas, op.valor] }) } })
    }
    return candidatos.sort((a, b) => b.s - a.s).slice(0, 4).map((c) => c.sug)
  }

  // tenta reconhecer por semelhanca um trecho solto (ate 5 palavras)
  const reconhecerAproximado = (i: number): number => {
    let melhor: { s: number; n: number; fazer: () => void } | null = null
    for (let tam = Math.min(5, tokens.length - i); tam >= 1; tam--) {
      const pedaco = tokens.slice(i, i + tam)
      if (pedaco.some((t) => t.pontuacao)) continue
      const n = pedaco.map((t) => t.n).join(' ')
      if (n.length < 5) continue
      const testar = (op: Opcao, fazer: () => void) => {
        for (const f of op.formas) {
          if (f.split(' ').length !== tam) continue
          const s = semelhanca(n, f)
          if (s >= LIMIAR_AUTOMATICO && (!melhor || s > melhor.s)) melhor = { s, n: tam, fazer }
        }
      }
      for (const op of ALTERACOES) testar(op, () => aplicarAlteracao(op, true))
      for (const op of TIPOS) testar(op, () => { ficha.tipo_radiografia = op.valor; anotar('tipo_radiografia', `Tipo: ${op.rotulo}`, true) })
      for (const op of opcoesTermos) testar(op, () => aplicarTermo(op, true))
    }
    if (melhor) {
      ;(melhor as { fazer: () => void }).fazer()
      return (melhor as { n: number }).n
    }
    return 0
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
        const c = casarOpcao(tokens, j, GENEROS)
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
        const c = casarOpcao(tokens, j, TIPOS)
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
          const c = casarOpcao(tokens, k, ALTERACOES)
          const ct = casarOpcao(tokens, k, opcoesTermos)
          if (ct && (!c || ct.n >= c.n)) {
            aplicarTermo(ct.op as Opcao & { id: number })
            k += ct.n
            algum = true
            continue
          }
          if (c) {
            aplicarAlteracao(c.op)
            k += c.n
            algum = true
            continue
          }
          const aprox = reconhecerAproximado(k)
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
            const ca = casarOpcao(tokens, k, ALTERACOES)
            if (ct) {
              aplicarTermo(ct.op as Opcao & { id: number })
              i = k + ct.n
              continue
            }
            if (ca) {
              aplicarAlteracao(ca.op)
              i = k + ca.n
              continue
            }
          }
        }
        const [livre, prox] = lerLivreCurto(k)
        if (livre) aplicarOutroTexto(livre)
        i = prox
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

      if (g === 'desfazer' || g === 'salvar' || g === 'proxima_secao' || g === 'secao_anterior') {
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

    // valores soltos (sem palavra-guia)
    const ct = casarOpcao(tokens, i, opcoesTermos)
    const ca = casarOpcao(tokens, i, ALTERACOES)
    const ctp = casarOpcao(tokens, i, TIPOS)
    const cg = casarOpcao(tokens, i, GENEROS)
    const maior = [ct && { k: 't', n: ct.n }, ca && { k: 'a', n: ca.n }, ctp && { k: 'p', n: ctp.n }, cg && { k: 'g', n: cg.n }]
      .filter(Boolean)
      .sort((x, y) => y!.n - x!.n)[0]
    if (maior) {
      fecharPendente()
      if (maior.k === 't') aplicarTermo(ct!.op as Opcao & { id: number })
      else if (maior.k === 'a') aplicarAlteracao(ca!.op)
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
      const aprox = reconhecerAproximado(i)
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
