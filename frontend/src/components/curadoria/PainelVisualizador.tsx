'use client'

import { forwardRef } from 'react'
import SegundaOpiniaoBanner, { ReviewInfo } from './SegundaOpiniaoBanner'
import StatusBadge from '../StatusBadge'

export interface ViewerInfo {
  abrivel: boolean
  motivo?: string
  viewer_url: string | null
}

// Painel central: mantem o OHIF exatamente como estava (iframe puro,
// mesmo src, sem postMessage nem nenhuma outra integracao) e adiciona
// controles que so afetam o CONTAINER por fora do iframe:
// - Tela cheia: Fullscreen API do navegador (ja existia antes deste sprint).
// - Ajustar a tela: reaproveita o mesmo mecanismo de colapso da fila (e
//   tambem recolhe a coluna da ficha), dando mais largura ao visualizador
//   sem sair da pagina - diferente da tela cheia nativa.
// - Centralizar: como nao ha ponte (postMessage) com o OHIF cross-origin
//   para pedir "recentralizar" por dentro, a unica forma segura de nao
//   mexer no funcionamento interno dele e forcar o iframe a recarregar a
//   mesma URL - o que devolve o visualizador ao estado inicial (centrado).
const PainelVisualizador = forwardRef<HTMLElement, {
  fichaAtiva: boolean
  carregandoViewer: boolean
  viewerInfo: ViewerInfo | null
  telaCheia: boolean
  onAlternarTelaCheia: () => void
  modoAjustado: boolean
  onAlternarAjustar: () => void
  onCentralizar: () => void
  iframeReloadKey: number
  statusFicha: string
  segundaOpiniaoReview: ReviewInfo | null
}>(function PainelVisualizador(
  {
    fichaAtiva,
    carregandoViewer,
    viewerInfo,
    telaCheia,
    onAlternarTelaCheia,
    modoAjustado,
    onAlternarAjustar,
    onCentralizar,
    iframeReloadKey,
    statusFicha,
    segundaOpiniaoReview,
  },
  ref
) {
  const viewerPronto = !!(viewerInfo?.abrivel && viewerInfo.viewer_url)

  return (
    <section
      ref={ref}
      className="relative flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface"
    >
      {fichaAtiva && (
        <>
          <SegundaOpiniaoBanner review={segundaOpiniaoReview} />
          <div className="flex items-center justify-between border-b border-base-border px-4 py-3">
            <StatusBadge status={statusFicha} />

            {viewerPronto && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCentralizar}
                  aria-label="Centralizar imagem"
                  title="Centralizar imagem"
                  className="flex items-center gap-1.5 rounded-full border border-base-border bg-base-surface2 px-3 py-1.5 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                >
                  <span aria-hidden="true">⊙</span> Centralizar
                </button>
                <button
                  type="button"
                  onClick={onAlternarAjustar}
                  aria-label={modoAjustado ? 'Restaurar layout padrão' : 'Ajustar à tela'}
                  title={modoAjustado ? 'Restaurar layout padrão' : 'Ajustar à tela'}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    modoAjustado
                      ? 'border-brand bg-brand/10 text-brand-300'
                      : 'border-base-border bg-base-surface2 text-slate-300 hover:border-brand hover:text-brand-300'
                  }`}
                >
                  <span aria-hidden="true">⤢</span> Ajustar à tela
                </button>
                <button
                  type="button"
                  onClick={onAlternarTelaCheia}
                  aria-label={telaCheia ? 'Sair da tela cheia' : 'Abrir em tela cheia'}
                  title={telaCheia ? 'Sair da tela cheia' : 'Abrir em tela cheia'}
                  className="flex items-center gap-1.5 rounded-full border border-base-border bg-base-surface2 px-3 py-1.5 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                >
                  {telaCheia ? (
                    <>
                      <span aria-hidden="true">⤡</span> Voltar
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">⛶</span> Tela cheia
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {!fichaAtiva ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
          Selecione uma imagem na fila abaixo
        </div>
      ) : carregandoViewer ? (
        <div className="flex flex-1 items-center justify-center text-slate-400">
          Carregando visualizador...
        </div>
      ) : viewerPronto ? (
        <iframe
          key={iframeReloadKey}
          src={viewerInfo!.viewer_url!}
          title="Visualizador OHIF"
          className="h-full min-h-[70vh] w-full flex-1 border-0"
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
          {viewerInfo?.motivo ?? 'Não foi possível carregar o visualizador para esta imagem.'}
        </div>
      )}
    </section>
  )
})

export default PainelVisualizador
