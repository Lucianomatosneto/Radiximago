// PASTAS DE PACIENTES (31/10/2026) - tipos e chamadas comuns as telas.
// Backend: backend/app/modules/casos_router.py. Dados IDENTIFICADOS:
// nada daqui vai para o banco geral nem para pesquisadores.
import type { Marcacao } from './marcacoes'

export const API = process.env.NEXT_PUBLIC_API_URL

export interface ImagemCaso {
  id: number
  ordem: number
  tipo: 'radiografia' | 'termo'
  dentes: number[]
  observacao: string | null
  largura: number
  altura: number
}

export interface AnotacaoCaso {
  texto: string | null
  marcacoes: Marcacao[]
}

export interface RevisaoCaso {
  versao: number
  autor: string | null
  autor_perfil: string
  comentario: string | null
  anotacoes: Record<string, AnotacaoCaso>
  criado_em: string | null
}

export interface ResumoCaso {
  id: number
  paciente: { nome: string; idade: number | null; genero: string | null; contato: string | null; nascimento?: string; prontuario?: string | null; observacoes?: string | null }
  aluno: string | null
  professor: string | null
  modalidade: string
  descricao: string | null
  etapa: 'enviado' | 'aguardando_classificacao' | 'na_fila' | 'em_tratamento' | 'concluido'
  tratamentos: string[]
  tratamento_escolhido: string | null
  aluno_tratamento: string | null
  imagens: ImagemCaso[]
  versoes: number
  corrigida: boolean
  criado_em: string | null
  na_fila_desde: string | null
  encaminhado_tratamento_em: string | null
  nova?: boolean
}

export interface DetalheCaso extends ResumoCaso {
  termo: ImagemCaso[]
  revisao: RevisaoCaso | null
  historico: { quando: string | null; quem: string | null; acao: string; detalhes: string | null }[]
  compartilhado_com: string[]
  /** com quem esta compartilhada e se EU posso desfazer (quem compartilhou, quem recebeu ou curador) */
  compartilhamentos?: { para_id: number; nome: string | null; pode_remover: boolean }[]
  nota_encaminhamento: string | null
  pode: {
    revisar: boolean
    compartilhar: boolean
    encaminhar_curador: boolean
    classificar: boolean
    encaminhar_aluno: boolean
    concluir: boolean
    reabrir_tratamento?: boolean
    editar_paciente: boolean
    editar_dados_completos: boolean
    /** so o professor elimina a pasta a pedido (02/11/2026) */
    eliminar?: boolean
  }
  /** data da eliminacao automatica (so equipe; null se desligada) */
  eliminacao_prevista_em?: string | null
}

export const urlFoto = (casoId: number, imagemId: number, opcoes: { miniatura?: boolean; baixar?: boolean } = {}) => {
  const q = new URLSearchParams()
  if (opcoes.miniatura) q.set('miniatura', '1')
  if (opcoes.baixar) q.set('baixar', '1')
  const qs = q.toString()
  return `${API}/casos/${casoId}/imagens/${imagemId}${qs ? `?${qs}` : ''}`
}

export async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
    if (Array.isArray(d?.detail) && d.detail[0]?.msg) return String(d.detail[0].msg).replace(/^Value error, /, '')
  } catch {
    // sem corpo legivel
  }
  return padrao
}

export async function apiJson<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${caminho}`, {
    credentials: 'include',
    ...init,
    headers: init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json', ...(init.headers || {}) } : init.headers,
  })
  if (!r.ok) throw new Error(await lerErro(r, 'Não foi possível concluir a operação.'))
  return r.json()
}

export const dataHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
export const data = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString('pt-BR') : ''

export const COR_ETAPA: Record<string, string> = {
  enviado: 'border-sky-400/50 bg-sky-500/10 text-sky-700 dark:text-sky-200',
  aguardando_classificacao: 'border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-200',
  na_fila: 'border-violet-400/50 bg-violet-500/10 text-violet-700 dark:text-violet-200',
  em_tratamento: 'border-teal-400/50 bg-teal-500/10 text-teal-700 dark:text-teal-200',
  concluido: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
}

export const PERFIS_EQUIPE = ['professor', 'curador']
export const PERFIS_CADASTRO = ['estudante', 'professor', 'curador']
