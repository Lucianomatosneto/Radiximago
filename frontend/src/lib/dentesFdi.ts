// Fonte unica do agrupamento por quadrante (notacao FDI) - compartilhada
// entre a Curadoria (selecao de dentes da ficha e de cada Achado) e,
// futuramente, a Busca Avancada (Fase 4), pra nao repetir esta mesma
// tabela em mais de um lugar (risco de manutencao ja identificado nas
// investigacoes anteriores: o backend ja tem sua propria copia das faixas
// em search_router.py, sem jeito de compartilhar codigo entre as duas
// linguagens - mas pelo menos o FRONTEND passa a ter uma unica fonte).
export interface Quadrante {
  numero: 1 | 2 | 3 | 4
  inicio: number
  fim: number
}

export const QUADRANTES: Quadrante[] = [
  { numero: 1, inicio: 11, fim: 18 },
  { numero: 2, inicio: 21, fim: 28 },
  { numero: 3, inicio: 31, fim: 38 },
  { numero: 4, inicio: 41, fim: 48 },
]

export function dentesDoQuadrante(numero: 1 | 2 | 3 | 4): number[] {
  const quadrante = QUADRANTES.find((q) => q.numero === numero)
  if (!quadrante) return []
  const dentes: number[] = []
  for (let d = quadrante.inicio; d <= quadrante.fim; d++) dentes.push(d)
  return dentes
}

// Derivado do numero FDI (digito da dezena) - nunca armazenado, mesmo
// principio ja usado no backend pra arcada/lado (search_router.py).
export function quadranteDoDente(fdi: number): 1 | 2 | 3 | 4 | null {
  const q = Math.floor(fdi / 10)
  return q === 1 || q === 2 || q === 3 || q === 4 ? q : null
}
