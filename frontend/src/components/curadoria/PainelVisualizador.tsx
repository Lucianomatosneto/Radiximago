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
// - Tela cheia: Fullscreen API do navegador. Chegou a ser removido daqui
//   (a Curadoria passou a entrar em tela cheia automaticamente ao clicar
//   no item do menu, ver Sidebar.tsx/aoClicarCuradoria), mas o automatico
//   nem sempre engata (varia por navegador) - o botao manual VOLTOU por
//   pedido explicito, como garantia sempre disponivel independente do
//   automatico funcionar ou nao.
// - Ampliar imagem: reaproveita o mesmo mecanismo de colapso da fila (e
//   tambem recolhe a coluna da ficha), dando mais largura ao visualizador
//   sem sair da pagina. Chamava-se "Ajustar a tela" antes - mesma funcao,
//   so o rotulo mudou (pedido explicito).
//
// NAO tem mais "Centralizar" aqui (removido por pedido explicito) - era
// um recarregamento forcado do iframe do OHIF (mesma URL), ja que nao ha
// ponte (postMessage) com ele pra pedir "recentralizar" por dentro.
const PainelVisualizador = forwardRef<HTMLElement, {
  fichaAtiva: boolean
  carregandoViewer: boolean
  viewerInfo: ViewerInfo | null
  telaCheia: boolean
  onAlternarTelaCheia: () => void
  modoAjustado: boolean
  onAlternarAjustar: () => void
  statusFicha: string
  segundaOpiniaoReview: ReviewInfo | null
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  /** Chamado quando o <iframe> do OHIF termina de carregar (evento nativo
   * "load") - a Curadoria usa isso, junto com onCarregou do
   * MarcadorAchado, pra saber quando pode liberar o carregamento das
   * miniaturas da fila. Nao mede se o OHIF ja terminou de RENDERIZAR a
   * imagem (isso e interno, cross-origin, fora do nosso alcance) - so
   * quando o documento do iframe carregou, que e o sinal mais proximo
   * disso que da pra observar de fora. Opcional pra nao quebrar nenhum
   * outro uso deste componente. */
  onIframeCarregado?: () => void
  /** Modo miniatura (tela cheia da Curadoria, com a imagem de marcacao em
   * destaque): esconde o cabecalho e a caixa de dados sobreposta, deixando
   * so a imagem do OHIF. Nada e desmontado - o iframe nao recarrega. */
  miniatura?: boolean
  /** Botao "Marcar imagem" (no fim da caixa de dados): abre/fecha o painel
   * da imagem para marcacao. */
  marcacaoAtiva?: boolean
  onAlternarMarcacao?: () => void
}>(function PainelVisualizador(
  {
    fichaAtiva,
    carregandoViewer,
    viewerInfo,
    telaCheia,
    onAlternarTelaCheia,
    modoAjustado,
    onAlternarAjustar,
    statusFicha,
    segundaOpiniaoReview,
    form,
    onChange,
    onIframeCarregado,
    miniatura = false,
    marcacaoAtiva = false,
    onAlternarMarcacao,
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
          <div className={`items-center justify-between border-b border-base-border px-4 py-3 ${miniatura ? 'hidden' : 'flex'}`}>
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
                {/* Atalho sempre visivel para a imagem de marcacao (tambem
                    pela tecla M e pelo botao no fim da caixa de dados). */}
                {onAlternarMarcacao && (
                  <button
                    type="button"
                    onClick={onAlternarMarcacao}
                    aria-pressed={marcacaoAtiva}
                    title={t('atalhoMarcar')}
                    className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      marcacaoAtiva
                        ? 'border-teal-400 bg-teal-500 text-white'
                        : 'border-teal-400/60 bg-teal-400/15 text-teal-200 hover:bg-teal-400/25'
                    }`}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true">
                      <ellipse cx="12" cy="12" rx="8" ry="6" strokeDasharray="3 2.5" />
                      <path d="M17.5 17.5 21 21" />
                    </svg>
                    {marcacaoAtiva ? t('fecharMarcacao') : t('marcarImagem')}
                    <kbd className="ml-0.5 rounded border border-current/40 px-1 font-mono text-[10px] opacity-80">M</kbd>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onAlternarAjustar}
                  aria-label={modoAjustado ? t('restaurarLayout') : t('ampliarImagem')}
                  title={modoAjustado ? t('restaurarLayout') : t('ampliarImagem')}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    modoAjustado
                      ? 'border-brand bg-brand/10 text-brand-300'
                      : 'border-base-border bg-base-surface2 text-slate-300 hover:border-brand hover:text-brand-300'
                  }`}
                >
                  <span aria-hidden="true">⤢</span> {t('ampliarImagem')}
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
            src={viewerInfo!.viewer_url!}
            title={t('ohifTitulo')}
            className="h-full w-full border-0"
            onLoad={onIframeCarregado}
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
            esta la dentro, entao nao ha como medir o painel real do OHIF
            e acompanhar o limite dele com precisao - isso e sempre uma
            aproximacao), entao a solucao fica inteiramente do lado de
            fora: uma caixa da propria pagina do Radix, com fundo solido e
            z-index acima do iframe, cobrindo aquele canto.

            Largura FIXA em px (280px) - historico dos ajustes: 300px fixo
            ficava largo demais em janela normal (passava do limite do
            OHIF e invadia a imagem); depois, clamp() com preferencial em
            % recuou demais (a % de um painel normal fica bem abaixo do
            que o OHIF realmente usa). 280px fixo e o meio-termo atual.
            Ajustar aqui (em px) se, na pratica, ainda sobrar ou faltar
            espaco.

            left-6 (24px, antes left-2/8px): recuo pedido na borda
            ESQUERDA pra deixar um icone do proprio OHIF (que fica
            visualmente atras desta caixa, mais pra esquerda que o resto
            do painel "Studies" que ela cobre) espiando pra fora - so a
            borda esquerda mudou, largura/altura continuam as mesmas.
            Valor de partida escolhido sem poder confirmar visualmente
            (limitacao do ambiente onde este ajuste foi feito) - se ainda
            cobrir o icone ou recuar demais/de menos, so mudar o valor
            aqui (ex.: left-4 = 16px, left-8 = 32px). */}
        {fichaAtiva && (
          <div className={`absolute bottom-2 left-6 top-2 z-10 w-[280px] ${miniatura ? 'hidden' : ''}`}>
            <PainelDadosSobrepostos
              form={form}
              onChange={onChange}
              statusFicha={statusFicha}
              marcacaoAtiva={marcacaoAtiva}
              onAlternarMarcacao={onAlternarMarcacao}
            />
          </div>
        )}
      </div>
    </section>
  )
})

export default PainelVisualizador
