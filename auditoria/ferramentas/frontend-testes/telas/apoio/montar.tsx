// APOIO DOS TESTES DE TELAS (13/11/2026). Guia: frontend/testes/LEIA-ME.md.
//
// - montarTela(<Pagina />): monta a tela com as traducoes REAIS em portugues
//   (frontend/messages/pt.json), como o usuario ve;
// - servidorFalso({...}): troca o servidor por respostas inventadas e anota
//   cada pedido que a tela fez (metodo, endereco e corpo), para o teste conferir.
import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { vi } from 'vitest'
import mensagens from '../../../../../frontend/messages/pt.json'

export const API = 'http://api.teste' // o mesmo do vitest.config.ts (env)

export function montarTela(tela: ReactElement) {
  return render(
    <NextIntlClientProvider locale="pt" messages={mensagens} timeZone="America/Sao_Paulo">
      {tela}
    </NextIntlClientProvider>
  )
}

/** Resposta inventada: corpo (JSON) e codigo HTTP (200 se nao disser). */
export interface RespostaFalsa {
  status?: number
  corpo?: unknown
}
/** "SEM_CONEXAO" simula o servidor fora do ar (o fetch da erro). */
export type Rota = RespostaFalsa | 'SEM_CONEXAO' | ((pedido: PedidoFeito) => RespostaFalsa | 'SEM_CONEXAO')

export interface PedidoFeito {
  metodo: string
  caminho: string // sem o endereco do servidor: "/vocabulario?x=1"
  corpo: unknown
}

/**
 * Rotas no formato "METODO /caminho" (o caminho inclui o "?..." quando houver).
 * Terminada em "*", a rota vale para todo caminho que comeca igual.
 * Pedido sem rota cadastrada responde 404 e fica anotado, para o teste perceber.
 */
export function servidorFalso(rotas: Record<string, Rota>) {
  const pedidos: PedidoFeito[] = []
  const fetchFalso = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    const caminho = url.startsWith(API) ? url.slice(API.length) : url
    const metodo = (init?.method ?? 'GET').toUpperCase()
    let corpo: unknown = undefined
    if (typeof init?.body === 'string') {
      try {
        corpo = JSON.parse(init.body)
      } catch {
        corpo = init.body
      }
    }
    const pedido = { metodo, caminho, corpo }
    pedidos.push(pedido)
    // rota exata; senao, a rota "com asterisco" cujo comeco bate
    // ("GET /search?*" atende qualquer pesquisa; o teste confere o endereco nos pedidos)
    const chave = `${metodo} ${caminho}`
    const curinga = Object.keys(rotas).find((k) => k.endsWith('*') && chave.startsWith(k.slice(0, -1)))
    const rota = rotas[chave] ?? (curinga ? rotas[curinga] : undefined)
    const resposta = typeof rota === 'function' ? rota(pedido) : rota
    if (resposta === 'SEM_CONEXAO') throw new TypeError('Failed to fetch')
    const { status = 200, corpo: dados = {} } = resposta ?? { status: 404, corpo: { detail: 'rota nao cadastrada no teste' } }
    // 204 ("deu certo, sem conteudo") nao pode ter corpo
    const texto = status === 204 ? null : JSON.stringify(dados)
    return new Response(texto, { status, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchFalso)
  return {
    pedidos,
    /** pedidos que mudam algo no servidor (tudo menos GET) */
    alteracoes: () => pedidos.filter((p) => p.metodo !== 'GET'),
  }
}
