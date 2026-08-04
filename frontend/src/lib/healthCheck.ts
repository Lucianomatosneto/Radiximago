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

// `traduzir` (opcional): quando informado, as descricoes usam o namespace
// de traducao Integracoes.healthCheck (chamador ja traduzido, ex.
// integracoes/page.tsx) em vez do texto fixo em portugues abaixo. Quando
// omitido, o comportamento e EXATAMENTE o mesmo de antes - assim telas
// ainda nao traduzidas (ex. painel-admin/page.tsx) continuam funcionando
// sem nenhuma mudanca.
export async function checarHealthEndpoint(
  url: string,
  campoStatus: string,
  traduzir?: (chave: string, params?: Record<string, string | number | Date>) => string
): Promise<ResultadoChecagem> {
  try {
    const resposta = await fetch(url, { cache: 'no-store' })
    if (!resposta.ok) {
      return {
        status: 'offline',
        descricao: traduzir
          ? traduzir('endpointHttpStatus', { status: resposta.status })
          : `Endpoint respondeu com HTTP ${resposta.status}.`,
      }
    }
    const dados = await resposta.json()
    if (dados?.status === 'ok') {
      return { status: 'online', descricao: traduzir ? traduzir('verificadoAgora') : 'Verificado agora.' }
    }
    if (dados?.status === 'erro') {
      const detalhe = dados[campoStatus] ?? 'erro'
      return {
        status: 'erro',
        descricao: traduzir
          ? traduzir('erroBackend', { detalhe })
          : `Verificado agora — backend reportou "${detalhe}".`,
      }
    }
    return {
      status: 'offline',
      descricao: traduzir ? traduzir('formatoInesperado') : 'Resposta em formato inesperado.',
    }
  } catch {
    return { status: 'offline', descricao: traduzir ? traduzir('falhaRede') : 'Falha de rede ao verificar.' }
  }
}
