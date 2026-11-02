import type { StatusServico } from './healthCheck'

/**
 * Checagens de servicos usadas IGUAIS no Painel e em Integracoes (B2 da
 * auditoria do administrador, 01/11/2026). Antes o Painel mostrava so banco
 * e Orthanc, e o OHIF aparecia "Instavel" quando o NAVEGADOR nao conseguia
 * testar (falso alarme). Agora quem confere o OHIF e o servidor; o navegador
 * so testa quando o servidor nao tem o endereco interno configurado.
 */

export interface StatusIntegracoes {
  ohif_url: string | null
  ohif?: { status: 'online' | 'offline' | 'nao_verificado'; codigo: number | null }
  armazenamento: { status: StatusServico; alertas: string[] } | null
}

export interface ResultadoOhif {
  status: StatusServico
  /** chave de texto em Integracoes.* */
  motivo: 'ohifServidorOk' | 'ohifServidorFalhou' | 'ohifRespondeu' | 'ohifNaoRespondeu' | 'ohifSemEndereco'
  url?: string
  codigo?: number | null
}

export async function lerStatusIntegracoes(): Promise<StatusIntegracoes | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/integracoes/status`, {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!r.ok) return null
    return (await r.json()) as StatusIntegracoes
  } catch {
    return null
  }
}

export async function avaliarOhif(dados: StatusIntegracoes | null): Promise<ResultadoOhif> {
  const servidor = dados?.ohif
  if (servidor?.status === 'online') return { status: 'online', motivo: 'ohifServidorOk' }
  if (servidor?.status === 'offline') {
    return { status: 'offline', motivo: 'ohifServidorFalhou', codigo: servidor.codigo }
  }
  // servidor sem endereco interno: o navegador testa o MESMO endereco que as
  // telas de imagem abrem
  const url = process.env.NEXT_PUBLIC_OHIF_URL || dados?.ohif_url || null
  if (!url) return { status: 'aguardando', motivo: 'ohifSemEndereco' }
  try {
    // no-cors: a resposta vem "opaca" (sem conteudo), mas so falha de verdade
    // (endereco inalcancavel) cai no catch
    await fetch(url, { mode: 'no-cors', cache: 'no-store' })
    return { status: 'online', motivo: 'ohifRespondeu', url }
  } catch {
    return { status: 'instavel', motivo: 'ohifNaoRespondeu', url }
  }
}

/** Docker: checagem INDIRETA - se o que roda nele responde, ele funciona. */
export function avaliarDocker(...servicos: StatusServico[]): StatusServico {
  if (servicos.every((s) => s === 'online')) return 'online'
  if (servicos.some((s) => s === 'online')) return 'instavel'
  return 'offline'
}

export async function lerStatusEmail(): Promise<{ status: StatusServico; etapa: string; erro: string | null; servidor?: string; detalhe?: string }> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/integracoes/email`, { credentials: 'include', cache: 'no-store' })
    if (!r.ok) throw new Error()
    return await r.json()
  } catch {
    return { status: 'instavel', etapa: 'consulta', erro: 'consulta' }
  }
}
