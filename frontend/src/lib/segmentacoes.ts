// SEGMENTACAO (pintura de estruturas) - pedido de 22/10/2026.
// O curador pinta uma estrutura (ex.: dente 36) pixel a pixel. Cada
// estrutura tem nome, dente FDI opcional, cor e uma MASCARA: imagem PNG
// cobrindo a radiografia INTEIRA (pintado = opaco, resto = transparente).
// Backend: app/modules/segmentacoes.py e segmentacoes_router.py.

import { dentesDoQuadrante } from './dentesFdi'

export interface Segmentacao {
  id: number
  curation_id: number
  nome: string
  dente: number | null
  cor: string
  largura: number
  altura: number
  /** data URL PNG: branco opaco onde foi pintado */
  mascara: string
  atualizado_em: string | null
}

const API = process.env.NEXT_PUBLIC_API_URL

/** Paleta das estruturas (Okabe-Ito + extras): legivel para daltonicos. */
export const CORES_ESTRUTURA = [
  '#56b4e9',
  '#e69f00',
  '#009e73',
  '#cc79a7',
  '#f0e442',
  '#d55e00',
  '#0072b2',
  '#b8e986',
  '#ff8fa3',
  '#c3cedd',
]

export function proximaCor(usadas: string[]): string {
  return CORES_ESTRUTURA.find((c) => !usadas.includes(c)) ?? CORES_ESTRUTURA[usadas.length % CORES_ESTRUTURA.length]
}

/** Tipos de estrutura sugeridos ao criar (o nome pode ser editado). */
export const TIPOS_ESTRUTURA = ['dente', 'canal', 'lesao', 'restauracao', 'osso', 'outra'] as const
export type TipoEstrutura = (typeof TIPOS_ESTRUTURA)[number]

/** Todos os dentes permanentes, na ordem dos quadrantes 1, 2, 3, 4. */
export const TODOS_OS_DENTES: number[] = ([1, 2, 3, 4] as const).flatMap((q) => dentesDoQuadrante(q))

async function erroDaResposta(r: Response, padrao: string): Promise<Error> {
  try {
    const dados = await r.json()
    if (typeof dados?.detail === 'string') return new Error(dados.detail)
  } catch {
    // sem corpo legivel
  }
  return new Error(padrao)
}

export async function listarSegmentacoes(curationId: number): Promise<Segmentacao[]> {
  const r = await fetch(`${API}/segmentacoes/ficha/${curationId}`, { credentials: 'include', cache: 'no-store' })
  if (!r.ok) throw await erroDaResposta(r, 'Não foi possível carregar a pintura.')
  return (await r.json()).itens as Segmentacao[]
}

export async function criarSegmentacao(
  curationId: number,
  dados: { nome: string; dente: number | null; cor: string; mascara: string }
): Promise<Segmentacao> {
  const r = await fetch(`${API}/segmentacoes/ficha/${curationId}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  })
  if (!r.ok) throw await erroDaResposta(r, 'Não foi possível criar a estrutura.')
  return r.json()
}

export async function alterarSegmentacao(
  id: number,
  dados: Partial<{ nome: string; dente: number; sem_dente: boolean; cor: string; mascara: string }>
): Promise<Segmentacao> {
  const r = await fetch(`${API}/segmentacoes/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  })
  if (!r.ok) throw await erroDaResposta(r, 'Não foi possível salvar a pintura.')
  return r.json()
}

export async function apagarSegmentacao(id: number): Promise<void> {
  const r = await fetch(`${API}/segmentacoes/${id}`, { method: 'DELETE', credentials: 'include' })
  if (!r.ok) throw await erroDaResposta(r, 'Não foi possível apagar a estrutura.')
}

/** Resolucao da mascara: a da imagem, limitada a 1024 px no lado maior. */
export function tamanhoDaMascara(largura: number, altura: number): { largura: number; altura: number } {
  const escala = Math.min(1, 1024 / Math.max(largura, altura))
  return {
    largura: Math.max(8, Math.round(largura * escala)),
    altura: Math.max(8, Math.round(altura * escala)),
  }
}
