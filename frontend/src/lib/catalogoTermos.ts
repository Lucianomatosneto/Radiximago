// CATALOGO DA "BUSCA POR TERMOS" (Pesquisa avancada, 26/10/2026).
//
// Junta, numa lista so, tudo o que o curador marca na Curadoria e que pode
// ser pesquisado - e procura nela enquanto a pessoa digita:
//   - GRUPOS de achados (ex.: "Cárie - todos os tipos"), os mesmos cartoes
//     do Banco de imagens;
//   - ACHADOS da ficha (ex.: "Cárie em dentina");
//   - REGIOES anatomicas dos achados;
//   - TERMOS do vocabulario controlado (com os sinonimos);
//   - e, sempre por ultimo, "procurar as palavras nos textos".
// Cada item escolhido vira um "token" (tipo:valor) enviado a API
// (backend: app/modules/busca_termos.py). Os termos se somam (E).

export type TipoTermo = 'grupo' | 'achado' | 'regiao' | 'vocab' | 'dentes' | 'dente' | 'texto' | 'novo'

export interface TermoBusca {
  tipo: TipoTermo
  valor: string
  rotulo: string
}

export interface ItemCatalogo extends TermoBusca {
  /** textos usados na procura (rotulo, sinonimos...) ja normalizados */
  chaves: string[]
  /** linha de apoio (ex.: "sinônimo: pedra pulpar") */
  detalhe?: string
}

/** Grupos (mesmos valores de GRUPOS_ACHADO no backend). */
export const GRUPOS_TERMOS = [
  'carie',
  'periodontal',
  'perda_ossea',
  'lesao_periapical',
  'tratamento_endodontico',
  'reabsorcao',
  'restaurador',
  'lesoes_osseas',
  'anomalias',
  'dente_incluso',
  'normal',
  'erro_tecnico',
] as const

/** Grupos de dentes (mesmos valores de GRUPOS_DENTES no backend). */
export const GRUPOS_DENTES = [
  'incisivos',
  'incisivos_centrais',
  'incisivos_laterais',
  'caninos',
  'pre_molares',
  'molares',
  'primeiros_molares',
  'segundos_molares',
  'terceiros_molares',
  'anteriores',
  'posteriores',
  'superiores',
  'inferiores',
  'deciduos',
  'permanentes',
] as const

/** Numeros FDI: 11-48 (permanentes) e 51-85 (deciduos). */
export const DENTES_FDI: number[] = [
  ...[1, 2, 3, 4].flatMap((q) => [1, 2, 3, 4, 5, 6, 7, 8].map((p) => q * 10 + p)),
  ...[5, 6, 7, 8].flatMap((q) => [1, 2, 3, 4, 5].map((p) => q * 10 + p)),
]

export function token(t: TermoBusca): string {
  return `${t.tipo}:${t.valor}`
}

/** minusculas, sem acentos e com espacos simples (para comparar). */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Procura no catalogo como os buscadores modernos: ignora acentos e
 * maiusculas, aceita as INICIAIS de qualquer palavra ("car den" acha "Cárie
 * em dentina") e ordena por relevancia (comeco do nome > comeco de palavra
 * > meio da palavra; o nome vale mais que o sinonimo).
 */
export function procurarNoCatalogo(catalogo: ItemCatalogo[], consulta: string, limite = 12): ItemCatalogo[] {
  const q = normalizarBusca(consulta)
  if (!q) return []
  const pedacos = q.split(' ')
  // dentes um a um so aparecem quando a pessoa digita um numero ("36",
  // "dente 3"), senao os 52 dentes tomariam a lista em "de", "den"...
  const temNumero = /\d/.test(q)
  const pontuados: { item: ItemCatalogo; pontos: number }[] = []
  for (const item of catalogo) {
    if (item.tipo === 'dente' && !temNumero) continue
    let melhor = 0
    item.chaves.forEach((chave, indice) => {
      const palavras = chave.split(' ')
      // todos os pedacos digitados precisam aparecer (comeco de alguma palavra, ou dentro dela)
      let pontos = 0
      for (const p of pedacos) {
        if (palavras.some((w) => w.startsWith(p))) pontos += 3
        else if (chave.includes(p)) pontos += 1
        else return
      }
      if (chave.startsWith(q)) pontos += 6
      if (chave === q) pontos += 4
      if (indice > 0) pontos -= 1 // sinonimo vale um pouco menos que o nome
      melhor = Math.max(melhor, pontos)
    })
    if (melhor > 0) pontuados.push({ item, pontos: melhor + (item.tipo === 'grupo' ? 1 : 0) })
  }
  return pontuados
    .sort((a, b) => b.pontos - a.pontos || a.item.rotulo.localeCompare(b.item.rotulo, 'pt-BR'))
    .slice(0, limite)
    .map((p) => p.item)
}

export interface TermoVocabularioApi {
  id: number
  termo: string
  categoria: string
  sinonimos?: { id: number; sinonimo: string }[]
}

export function itensDoVocabulario(termos: TermoVocabularioApi[], rotuloSinonimo: (s: string) => string): ItemCatalogo[] {
  return termos.map((t) => {
    const sinonimos = (t.sinonimos ?? []).map((s) => s.sinonimo)
    return {
      tipo: 'vocab' as const,
      valor: String(t.id),
      rotulo: t.termo,
      chaves: [t.termo, ...sinonimos].map(normalizarBusca),
      detalhe: sinonimos.length ? rotuloSinonimo(sinonimos.join(', ')) : undefined,
    }
  })
}
