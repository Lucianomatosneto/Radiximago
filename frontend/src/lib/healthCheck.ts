export type StatusServico = 'online' | 'erro' | 'instavel' | 'offline' | 'aguardando'

export const CORES_STATUS: Record<StatusServico, string> = {
  online: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40',
  erro: 'bg-red-500/15 text-red-300 border-red-600/40',
  instavel: 'bg-orange-500/15 text-orange-300 border-orange-600/40',
  offline: 'bg-slate-500/15 text-slate-300 border-slate-600/40',
  aguardando: 'bg-slate-500/15 text-slate-300 border-slate-600/40',
}

export const LABELS_STATUS: Record<StatusServico, string> = {
  online: 'Online',
  erro: 'Erro',
  instavel: 'Instável',
  offline: 'Offline',
  aguardando: 'Aguardando configuração',
}

export interface ResultadoChecagem {
  status: StatusServico
  descricao: string
}

export async function checarHealthEndpoint(
  url: string,
  campoStatus: string
): Promise<ResultadoChecagem> {
  try {
    const resposta = await fetch(url, { cache: 'no-store' })
    if (!resposta.ok) {
      return { status: 'offline', descricao: `Endpoint respondeu com HTTP ${resposta.status}.` }
    }
    const dados = await resposta.json()
    if (dados?.status === 'ok') {
      return { status: 'online', descricao: 'Verificado agora.' }
    }
    if (dados?.status === 'erro') {
      return {
        status: 'erro',
        descricao: `Verificado agora — backend reportou "${dados[campoStatus] ?? 'erro'}".`,
      }
    }
    return { status: 'offline', descricao: 'Resposta em formato inesperado.' }
  } catch {
    return { status: 'offline', descricao: 'Falha de rede ao verificar.' }
  }
}
