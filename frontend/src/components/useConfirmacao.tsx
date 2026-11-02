'use client'

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'

/**
 * CONFIRMACAO DENTRO DA PAGINA (extra da auditoria do administrador,
 * 01/11/2026). Substitui o window.confirm do navegador, que algumas
 * ferramentas aceitam sozinhas. Uso:
 *
 *   const { pedirConfirmacao, quadroConfirmacao } = useConfirmacao()
 *   if (!(await pedirConfirmacao({ titulo, texto, botao, cancelar }))) return
 *   ...
 *   return <>{...}{quadroConfirmacao}</>
 *
 * Cancelar, Esc e clique fora so FECHAM (resposta "nao"). O foco comeca em
 * Cancelar, para Enter nao confirmar sem querer. Fica dentro do componente
 * (e nao no fim da pagina) para aparecer tambem com o Visualizador em tela
 * cheia.
 */
export interface PedidoConfirmacao {
  titulo: string
  texto: ReactNode
  botao: string
  cancelar: string
}

export function useConfirmacao() {
  const [pedido, setPedido] = useState<(PedidoConfirmacao & { responder: (sim: boolean) => void }) | null>(null)
  const travado = useRef(false)

  const pedirConfirmacao = useCallback(
    (dados: PedidoConfirmacao) =>
      new Promise<boolean>((responder) => {
        travado.current = false
        setPedido({ ...dados, responder })
      }),
    []
  )

  const responder = useCallback(
    (sim: boolean) => {
      if (!pedido || travado.current) return
      travado.current = true // um clique duplo nao responde duas vezes
      pedido.responder(sim)
      setPedido(null)
    },
    [pedido]
  )

  useEffect(() => {
    if (!pedido) return
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        responder(false)
      }
    }
    document.addEventListener('keydown', aoTeclar, true)
    return () => document.removeEventListener('keydown', aoTeclar, true)
  }, [pedido, responder])

  const quadroConfirmacao = pedido ? (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 px-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmacao-titulo"
    >
      <button type="button" aria-label={pedido.cancelar} onClick={() => responder(false)} className="absolute inset-0" />
      <div className="relative w-full max-w-md rounded-xl border border-base-border bg-base-surface p-6 shadow-2xl">
        <h2 id="confirmacao-titulo" className="mb-3 text-lg font-semibold text-ink">
          {pedido.titulo}
        </h2>
        <div className="mb-4 text-sm text-slate-400">{pedido.texto}</div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            data-acao="cancelar"
            autoFocus
            onClick={() => responder(false)}
            className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            {pedido.cancelar}
          </button>
          <button
            type="button"
            data-acao="confirmar"
            onClick={() => responder(true)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover"
          >
            {pedido.botao}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { pedirConfirmacao, quadroConfirmacao }
}
