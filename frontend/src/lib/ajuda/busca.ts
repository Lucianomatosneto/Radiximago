// BUSCA DA CENTRAL DE AJUDA - simples e previsivel (sem inteligencia
// artificial, sem servidor): roda no navegador, sobre os topicos de
// lib/ajuda/conteudo.ts.
//
// Como funciona:
// 1. "normalizar": tudo minusculo e sem acento ("Anotações" = "anotacoes").
// 2. a pergunta vira palavras; palavras curtas e comuns ("como", "de", "o")
//    sao ignoradas.
// 3. a maioria das palavras (60%) precisa aparecer no topico (titulo,
//    palavras-chave ou texto). Vale o comeco da palavra ("anot" acha
//    "anotacao"), o singular ("imagens" acha "imagem") e o radical do
//    verbo ("apago" acha "apagar").
// 4. o topico ganha pontos por onde a palavra apareceu (titulo vale mais)
//    e os resultados saem do mais para o menos relevante.

import type { IdiomaAjuda, TopicoAjuda } from './conteudo'

const PALAVRAS_VAZIAS = new Set([
  // pt
  'a', 'o', 'as', 'os', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos',
  'para', 'pra', 'por', 'com', 'que', 'como', 'eu', 'meu', 'minha', 'se', 'ao', 'onde', 'qual', 'quero',
  'posso', 'fazer', 'faco', 'consigo', 'ou',
  // en
  'the', 'an', 'of', 'to', 'in', 'on', 'how', 'do', 'i', 'my', 'can', 'is', 'and', 'or', 'for', 'with', 'where',
])

export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** reduz plural simples: "imagens" -> "imagem", "anotacoes" -> "anotacao" */
function raiz(palavra: string): string {
  if (palavra.length <= 3) return palavra
  if (palavra.endsWith('oes')) return palavra.slice(0, -3) + 'ao'
  if (palavra.endsWith('ens')) return palavra.slice(0, -3) + 'em'
  if (palavra.endsWith('s')) return palavra.slice(0, -1)
  return palavra
}

export function palavrasDaConsulta(consulta: string): string[] {
  return normalizar(consulta)
    .split(' ')
    .filter((p) => p && !PALAVRAS_VAZIAS.has(p))
    .map(raiz)
}

/** a palavra da pergunta aparece no texto? Vale o comeco da palavra
 * ("anot" -> "anotacao"), o singular e o mesmo RADICAL do verbo
 * ("apago" -> "apagar", "imprimo" -> "imprimir"). */
function contem(textoNormalizado: string[], palavra: string): boolean {
  const radical = palavra.length >= 5 ? palavra.slice(0, Math.max(4, palavra.length - 2)) : null
  return textoNormalizado.some((t) => t.startsWith(palavra) || raiz(t) === palavra || (radical !== null && t.startsWith(radical)))
}

export function visiveisPara(topicos: TopicoAjuda[], perfil: string | null): TopicoAjuda[] {
  return topicos.filter((t) => !t.perfis || (perfil !== null && t.perfis.includes(perfil)))
}

export function buscarAjuda(topicos: TopicoAjuda[], consulta: string, idioma: IdiomaAjuda): TopicoAjuda[] {
  const palavras = palavrasDaConsulta(consulta)
  if (palavras.length === 0) return []
  const pontuados: { topico: TopicoAjuda; pontos: number }[] = []
  for (const topico of topicos) {
    const texto = topico[idioma]
    const titulo = normalizar(texto.titulo).split(' ')
    const chaves = normalizar(texto.palavras).split(' ')
    const corpo = normalizar([texto.resumo, ...texto.passos, texto.dica ?? ''].join(' ')).split(' ')
    // nem toda palavra precisa aparecer (a pessoa escreve do seu jeito:
    // "como apago a anotacao que fiz"), mas a maioria sim
    let pontos = 0
    let achadas = 0
    for (const p of palavras) {
      const noTitulo = contem(titulo, p)
      const nasChaves = contem(chaves, p)
      const noCorpo = contem(corpo, p)
      if (noTitulo || nasChaves || noCorpo) achadas++
      pontos += (noTitulo ? 5 : 0) + (nasChaves ? 3 : 0) + (noCorpo ? 1 : 0)
    }
    if (achadas >= Math.max(1, Math.ceil(palavras.length * 0.6))) pontuados.push({ topico, pontos: achadas * 10 + pontos })
  }
  return pontuados.sort((a, b) => b.pontos - a.pontos).map((p) => p.topico)
}

/** topicos ligados a tela aberta agora (ex.: /minhas-imagens) */
export function topicosDaTela(topicos: TopicoAjuda[], caminho: string | null): TopicoAjuda[] {
  if (!caminho) return []
  return topicos.filter((t) => t.rotas?.some((r) => caminho === r || caminho.startsWith(r + '/')))
}
