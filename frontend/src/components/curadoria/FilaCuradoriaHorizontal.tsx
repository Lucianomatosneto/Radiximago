'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import MiniaturaFila from '../MiniaturaFila'

export interface ImagemPendente {
  orthanc_reference_id: number
  orthanc_id: string
  resource_type: string
  dicomweb_url: string | null
}

interface EmFoco {
  imagem: ImagemPendente
  rect: DOMRect
}

function truncarOrthancId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 14)}...` : id
}

// Tamanho de cada miniatura (80px) - "um pouco maior" que a versao
// anterior (56px), por pedido. A faixa inteira (secao + setas) usa essa
// mesma altura, entao a miniatura ocupa 100% da altura disponivel ali,
// sem sobra de espaco vazio.
const TAMANHO_MINIATURA_PX = 80
// Distancia que cada clique nas setas rola a faixa - equivalente a mais ou
// menos 3 miniaturas (o "grupo" visivel de cada vez, mesmo a lista inteira
// estando renderizada e rolavel continuamente, nao paginada em blocos).
const PASSO_SCROLL_PX = 3 * (TAMANHO_MINIATURA_PX + 8)

// Fila de curadoria em faixa horizontal, no topo da area de trabalho -
// entre a barra de acoes (Salvar/Aprovar/etc) e o visualizador - por
// pedido explicito, substituindo a antiga coluna vertical lateral. Por
// ficar DENTRO do elemento que vira tela cheia (visualizadorRef, em
// curadoria/page.tsx), o curador agora consegue trocar de imagem sem
// precisar sair da tela cheia (antes a fila ficava deliberadamente FORA
// dela).
//
// Mostra a fila COMPLETA (nao so 3 por vez) num carrossel com scroll
// horizontal nativo - as setas ‹ › so dao um empurrao (scrollBy) na
// direcao certa, pra continuar dando a sensacao de "passar pro proximo
// grupo" mesmo sem paginacao rigida em blocos fixos. Passar o mouse numa
// miniatura abre um popover ("lupa") com a MESMA imagem ampliada (o
// preview do Orthanc ja vem em resolucao completa - ver MiniaturaFila.tsx
// - entao ampliar so troca o tamanho do container, sem perda de nitidez)
// mais os dados basicos ja disponiveis pra uma imagem AINDA PENDENTE
// (numero de referencia, id no Orthanc, tipo de recurso) - uma
// "descricao" completa (tipo de radiografia, achado etc.) so existe
// depois que a ficha e criada, entao nao ha isso pra mostrar aqui ainda.
export default function FilaCuradoriaHorizontal({
  fila,
  carregando,
  erro,
  criandoId,
  ativoOrthancReferenceId,
  onSelecionar,
  permitirCarregarMiniaturas = true,
}: {
  fila: ImagemPendente[]
  carregando: boolean
  erro: string
  criandoId: number | null
  ativoOrthancReferenceId?: number | null
  onSelecionar: (imagem: ImagemPendente) => void
  /** Default true (nenhum outro uso desta fileira e afetado). A Curadoria
   * passa false ate a imagem principal + painel de marcacao da primeira
   * ficha estarem prontos - ver comentario em MiniaturaFila.tsx sobre o
   * motivo (as miniaturas, todas visiveis de uma vez, competiam pelas
   * mesmas conexoes das chamadas criticas da ficha). A fileira em si
   * (lista, cliques, setas) continua funcionando normalmente mesmo com
   * isso desligado - so as miniaturas ficam com o "pulso" de carregando
   * ate liberar. */
  permitirCarregarMiniaturas?: boolean
}) {
  const t = useTranslations('Curadoria.fila')
  // Posicao capturada no mouseenter (getBoundingClientRect da miniatura) -
  // o popover em si e renderizado via portal (ver render abaixo), fixed
  // e posicionado com esses numeros, NAO como filho posicionado
  // (absolute) dentro da faixa. Motivo: a faixa e horizontalmente
  // rolavel (overflow-x-auto) e, por uma regra da propria spec do CSS,
  // "overflow-x: auto" + "overflow-y: visible" no MESMO elemento faz o
  // navegador tratar o eixo Y tambem como clipado (nao da pra ter um eixo
  // rolavel e o outro "visible" ao mesmo tempo) - entao um popover
  // posicionado como filho absolute (ultrapassando a faixa por baixo,
  // via top-full) ficava CORTADO/invisivel mesmo com o codigo certo. Via
  // portal (renderizado direto no body, position:fixed), o popover escapa
  // desse corte de vez.
  const [emFoco, setEmFoco] = useState<EmFoco | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [podeVoltar, setPodeVoltar] = useState(false)
  const [podeAvancar, setPodeAvancar] = useState(false)

  function atualizarLimites() {
    const el = scrollRef.current
    if (!el) return
    setPodeVoltar(el.scrollLeft > 4)
    setPodeAvancar(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }

  // Recalcula quando a fila muda de tamanho (itens abertos saem dela) -
  // sem isso, uma seta podia continuar "acesa" mesmo sem mais nada pra
  // rolar naquela direcao depois que a lista encolheu.
  useEffect(() => {
    atualizarLimites()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fila.length])

  function rolar(direcao: 1 | -1) {
    scrollRef.current?.scrollBy({ left: direcao * PASSO_SCROLL_PX, behavior: 'smooth' })
  }

  function aoEntrarMouse(imagem: ImagemPendente, evento: React.MouseEvent<HTMLDivElement>) {
    setEmFoco({ imagem, rect: evento.currentTarget.getBoundingClientRect() })
  }

  function aoSairMouse(orthancReferenceId: number) {
    setEmFoco((atual) => (atual?.imagem.orthanc_reference_id === orthancReferenceId ? null : atual))
  }

  return (
    <section
      aria-label={t('titulo')}
      // pt-0 (nao mais p-2 uniforme) - pedido explicito pra a margem
      // superior das miniaturas encostar na margem inferior da caixa
      // "Imagem X de Y" logo acima (ver o wrapper sem gap em
      // curadoria/page.tsx). So o padding de CIMA foi zerado aqui e no
      // scroll interno logo abaixo (py-1 -> pb-1) - direita/esquerda/baixo
      // continuam com respiro normal.
      className="flex shrink-0 items-center gap-1.5 px-2 pb-2 pt-0"
    >
      <button
        type="button"
        onClick={() => rolar(-1)}
        disabled={!podeVoltar}
        aria-label={t('anteriores')}
        title={t('anteriores')}
        style={{ height: TAMANHO_MINIATURA_PX }}
        className="flex w-7 shrink-0 items-center justify-center rounded-lg border border-base-border bg-transparent text-slate-300 hover:border-brand hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-30"
      >
        ‹
      </button>

      {erro ? (
        <p className="flex-1 px-1 text-xs text-red-400" role="alert">
          {erro}
        </p>
      ) : carregando ? (
        <p className="flex-1 px-1 text-sm text-slate-500">{t('carregandoFila')}</p>
      ) : fila.length === 0 ? (
        <p className="flex-1 px-1 text-sm text-slate-500">{t('nenhumaPendente')}</p>
      ) : (
        <div
          ref={scrollRef}
          onScroll={atualizarLimites}
          className="flex flex-1 gap-2 overflow-x-auto scroll-smooth pb-1 pt-0"
        >
          {fila.map((imagem) => {
            const ativo = ativoOrthancReferenceId === imagem.orthanc_reference_id
            return (
              <div
                key={imagem.orthanc_reference_id}
                className="relative shrink-0"
                onMouseEnter={(e) => aoEntrarMouse(imagem, e)}
                onMouseLeave={() => aoSairMouse(imagem.orthanc_reference_id)}
              >
                <button
                  type="button"
                  disabled={criandoId !== null}
                  onClick={() => onSelecionar(imagem)}
                  style={{ height: TAMANHO_MINIATURA_PX, width: TAMANHO_MINIATURA_PX }}
                  // p-0 + bg-transparent: sem isso, o padding e o
                  // background padrao do navegador pra <button> (nao
                  // zerados por nenhum reset global do projeto) sobravam
                  // como uma faixa clara visivel ao redor da miniatura.
                  // rounded-lg AQUI TEM QUE BATER com o rounded-lg da
                  // MiniaturaFila logo abaixo (antes era rounded-md, 6px,
                  // contra o rounded-lg do botao, 8px) - com raios
                  // diferentes, sobravam frestas triangulares bem finas
                  // nos 4 cantos onde o fundo do botao aparecia por baixo
                  // da miniatura arredondada. Em modo claro esse fundo
                  // (bg-transparent deixando o bg-base-surface da secao
                  // por tras) e claro/esbranquicado - exatamente o
                  // "quadro branco" contornando as imagens.
                  //
                  // hover:scale-110 + hover:z-10: efeito "lupa" de destaque
                  // na propria miniatura (cresce ligeiramente ao passar o
                  // mouse, alem do popover com a imagem grande + dados que
                  // ja existe) - "relative" e obrigatorio aqui pro z-index
                  // ter efeito (nao funciona em elemento com position
                  // estatica); z-10 evita que a miniatura ampliada fique
                  // por baixo da vizinha ao crescer.
                  className={`relative flex items-center justify-center overflow-hidden rounded-lg border-2 bg-transparent p-0 transition-all duration-150 hover:z-10 hover:scale-110 disabled:cursor-not-allowed disabled:opacity-50 ${
                    ativo ? 'border-brand' : 'border-transparent hover:border-brand/50'
                  }`}
                >
                  <MiniaturaFila
                    orthancReferenceId={imagem.orthanc_reference_id}
                    alt={imagem.orthanc_id}
                    className="h-full w-full overflow-hidden rounded-lg bg-base-surface2"
                    habilitado={permitirCarregarMiniaturas}
                  />
                </button>

                {criandoId === imagem.orthanc_reference_id && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-black/60 text-center text-[9px] leading-tight text-white">
                    {t('abrindo')}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => rolar(1)}
        disabled={!podeAvancar}
        aria-label={t('proximas')}
        title={t('proximas')}
        style={{ height: TAMANHO_MINIATURA_PX }}
        className="flex w-7 shrink-0 items-center justify-center rounded-lg border border-base-border bg-transparent text-slate-300 hover:border-brand hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-30"
      >
        ›
      </button>

      {/* "Lupa": mesma imagem ampliada + dados basicos. Via portal direto
          no body (position: fixed, coordenadas de getBoundingClientRect
          capturadas no mouseenter) - ver comentario grande acima sobre
          por que nao da pra ser um filho absolute normal aqui dentro. */}
      {emFoco &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50 w-48 -translate-x-1/2 rounded-xl border border-base-border bg-base-surface p-2 shadow-2xl"
            style={{ left: emFoco.rect.left + emFoco.rect.width / 2, top: emFoco.rect.bottom + 8 }}
          >
            <MiniaturaFila
              orthancReferenceId={emFoco.imagem.orthanc_reference_id}
              alt={emFoco.imagem.orthanc_id}
              className="h-40 w-full overflow-hidden rounded-lg bg-base-surface2"
            />
            <p className="mt-1.5 truncate font-mono text-[11px] text-slate-300">
              #{emFoco.imagem.orthanc_reference_id} · {truncarOrthancId(emFoco.imagem.orthanc_id)}
            </p>
            <p className="text-[11px] text-slate-500">{emFoco.imagem.resource_type}</p>
          </div>,
          document.body
        )}
    </section>
  )
}
