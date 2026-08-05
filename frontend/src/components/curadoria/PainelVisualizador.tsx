'use client'

import { forwardRef } from 'react'
import { useTranslations } from 'next-intl'
import SegundaOpiniaoBanner, { ReviewInfo } from './SegundaOpiniaoBanner'
import StatusBadge from '../StatusBadge'
import PainelDadosSobrepostos from './PainelDadosSobrepostos'
import Logo from '../Logo'
import type { FormularioFicha } from './FichaCuradoriaForm'

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
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
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
    form,
    onChange,
  },
  ref
) {
  const t = useTranslations('Curadoria.visualizador')
  const viewerPronto = !!(viewerInfo?.abrivel && viewerInfo.viewer_url)

  return (
    <section
      ref={ref}
      className="relative flex h-full min-h-[160px] flex-[2] flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface"
    >
      {fichaAtiva && (
        <>
          <SegundaOpiniaoBanner review={segundaOpiniaoReview} />
          <div className="flex items-center justify-between border-b border-base-border px-4 py-3">
            <div className="flex items-center gap-3">
              {/* A Curadoria esconde a Topbar da pagina (que normalmente
                  mostra a logo) quando telaCheia e true - ver
                  curadoria/page.tsx. Por isso a logo (so o icone, pra nao
                  brigar de espaco com o StatusBadge e os botoes) e
                  repetida aqui. */}
              <Logo variante="icone" />
              <StatusBadge status={statusFicha} />
            </div>

            {viewerPronto && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCentralizar}
                  aria-label={t('centralizarImagem')}
                  title={t('centralizarImagem')}
                  className="flex items-center gap-1.5 rounded-full border border-base-border bg-base-surface2 px-3 py-1.5 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                >
                  <span aria-hidden="true">⊙</span> {t('centralizar')}
                </button>
                <button
                  type="button"
                  onClick={onAlternarAjustar}
                  aria-label={modoAjustado ? t('restaurarLayout') : t('ajustarATela')}
                  title={modoAjustado ? t('restaurarLayout') : t('ajustarATela')}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    modoAjustado
                      ? 'border-brand bg-brand/10 text-brand-300'
                      : 'border-base-border bg-base-surface2 text-slate-300 hover:border-brand hover:text-brand-300'
                  }`}
                >
                  <span aria-hidden="true">⤢</span> {t('ajustarATela')}
                </button>
                <button
                  type="button"
                  onClick={onAlternarTelaCheia}
                  aria-label={telaCheia ? t('sairTelaCheia') : t('abrirTelaCheia')}
                  title={telaCheia ? t('sairTelaCheia') : t('abrirTelaCheia')}
                  className="flex items-center gap-1.5 rounded-full border border-base-border bg-base-surface2 px-3 py-1.5 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                >
                  {telaCheia ? (
                    <>
                      <span aria-hidden="true">⤡</span> {t('voltar')}
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">⛶</span> {t('telaCheia')}
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}

      <div className="relative min-h-0 flex-1">
        {!fichaAtiva ? (
          <div className="flex h-full items-center justify-center p-8 text-center text-slate-500">
            {t('selecioneImagem')}
          </div>
        ) : carregandoViewer ? (
          <div className="flex h-full items-center justify-center text-slate-400">
            {t('carregandoVisualizador')}
          </div>
        ) : viewerPronto ? (
          <iframe
            key={iframeReloadKey}
            src={viewerInfo!.viewer_url!}
            title={t('ohifTitulo')}
            className="h-full w-full border-0"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center text-slate-500">
            {viewerInfo?.motivo ?? t('naoDisponivel')}
          </div>
        )}

        {/* Caixa sobreposta por cima do canto superior esquerdo do iframe do
            OHIF: ocupa visualmente a area onde o OHIF normalmente mostra o
            painel "Studies" (lista de estudos). Nao da pra remover esse
            painel de dentro do OHIF sem tocar na configuracao dele (o
            iframe e cross-origin - o Radix nao enxerga nem altera o que
            esta la dentro), entao a solucao fica inteiramente do lado de
            fora: uma caixa da propria pagina do Radix, com fundo solido e
            z-index acima do iframe, cobrindo aquele canto. A largura
            (300px, no maximo 46% da largura do painel) subiu de 260px/42%
            porque o conteudo cresceu (textos maiores + campo de Dentes) -
            ajustar aqui se, na pratica, sobrar ou faltar espaco pra cobrir
            o painel real do OHIF, ou se a caixa ficar apertada demais. */}
        {fichaAtiva && (
          <div className="absolute bottom-2 left-2 top-2 z-10 w-[300px] max-w-[46%]">
            <PainelDadosSobrepostos form={form} onChange={onChange} statusFicha={statusFicha} />
          </div>
        )}
      </div>
    </section>
  )
})

export default PainelVisualizador
