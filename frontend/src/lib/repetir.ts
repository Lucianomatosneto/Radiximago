/**
 * CONSULTA COM REPETICAO AUTOMATICA (01/11/2026 - auditoria do
 * administrador, A2). So para LEITURAS (GET): se o servidor estiver
 * reiniciando ou ocupado (502, 503, 504) ou a conexao cair, tenta de novo
 * mais 2 vezes (0,8 s e 2 s depois) antes de desistir. Gravacoes (POST,
 * PATCH...) NAO passam por aqui - repetir poderia gravar duas vezes.
 */
const PASSAGEIROS = new Set([502, 503, 504])
const ESPERAS_MS = [800, 2000]

export async function lerComRepeticao(url: string, init: RequestInit = {}): Promise<Response> {
  let ultimoErro: unknown = null
  for (let tentativa = 0; tentativa <= ESPERAS_MS.length; tentativa++) {
    try {
      const resposta = await fetch(url, { ...init, method: 'GET' })
      if (!PASSAGEIROS.has(resposta.status) || tentativa === ESPERAS_MS.length) return resposta
    } catch (erro) {
      ultimoErro = erro
      if (tentativa === ESPERAS_MS.length) throw erro
    }
    await new Promise((r) => setTimeout(r, ESPERAS_MS[tentativa]))
  }
  throw ultimoErro ?? new Error('falha')
}

/** erro do servidor que merece "tente de novo" (nao e culpa do pedido) */
export const errouServidor = (status: number) => status >= 500
