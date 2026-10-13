'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useDescricaoCuradoria, type ItemDescritivel } from '../../lib/descricaoCuradoria'
import NotasVisualizador from './NotasVisualizador'

// Selo no canto de cada imagem do visualizador. Aparece SEMPRE (mesmo sem
// marcacao): um "i" de informacao e, se houver, o numero de marcacoes do
// curador. Ao passar o mouse (ou focar com o Tab / tocar), abre uma caixa
// com a DESCRICAO DA CURADORIA daquela imagem - tipo, qualidade, dentes,
// achado, alteracoes, achados detalhados, descricao didatica e o texto de
// cada marcacao.
//
// Por que um selo e nao "passar o mouse na imagem inteira": a imagem roda
// dentro do OHIF (outra origem, num iframe) e o navegador nao avisa a tela
// do Radix quando o mouse esta la dentro.
// `flutuante`: para lugares pequenos que cortam o que passa da borda (ex.:
// os cartoes da Pesquisa, que tambem crescem 70% ao passar o mouse). Nesse
// modo a caixa de descricao e desenhada solta na tela (portal), sempre por
// cima de tudo, e acompanha o selo se o cartao crescer ou mudar de lugar.
export default function EtiquetaMarcacoes({
  item,
  className = '',
  flutuante = false,
  embutido = false,
  mostrarContagem = true,
  onFocoMarcacao,
  onIsolarMarcacao,
  curationId,
  ampliado = false,
  onAmpliar,
  areaAmpliada,
}: {
  item: ItemDescritivel
  className?: string
  flutuante?: boolean
  /** dentro de outro grupo posicionado (nao usa position:absolute proprio) */
  embutido?: boolean
  /** mostra o numero de marcacoes ao lado do "i" */
  mostrarContagem?: boolean
  /** mouse sobre a linha "Marcação N" (destaca a marcacao na imagem) */
  onFocoMarcacao?: (indice: number | null) => void
  /** clique na linha "Marcação N" (isola a marcacao na imagem) */
  onIsolarMarcacao?: (indice: number) => void
  /** com o id da imagem, o quadro ganha as anotacoes pessoais de quem ve */
  curationId?: number
  /** quadro AMPLIADO: ocupa metade da area de imagens, do lado oposto ao
   *  da imagem descrita (quem chama decide o lado e o retangulo) */
  ampliado?: boolean
  onAmpliar?: (valor: boolean) => void
  areaAmpliada?: () => { left: number; top: number; width: number; height: number } | null
}) {
  const t = useTranslations('Visualizador.marcacoes')
  const descrever = useDescricaoCuradoria()
  // Visualizador: UM CLIQUE no selo abre o quadro e outro clique fecha
  // (passar o mouse nao abre mais - o quadro nao aparece sem querer por
  // cima da imagem). Modo flutuante (cartoes da Pesquisa, so leitura):
  // continua abrindo ao passar o mouse.
  const [passando, setPassando] = useState(false)
  const [fixada, setFixada] = useState(false)
  const aberta = fixada || (flutuante && passando) || ampliado
  const botaoRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  // Deslocamento do quadro arrastado pela pessoa (para tirar de cima da
  // imagem). Arrastar deixa o quadro fixo aberto; clique duplo na alca
  // devolve o quadro ao lugar original.
  const [desloc, setDesloc] = useState({ x: 0, y: 0 })
  const caixaRef = useRef<HTMLDivElement>(null)
  const arrasteRef = useRef<{ px: number; py: number; dx: number; dy: number; base: DOMRect } | null>(null)

  function iniciarArraste(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !caixaRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const r = caixaRef.current.getBoundingClientRect()
    // retangulo do quadro SEM o deslocamento atual (posicao original)
    const base = new DOMRect(r.left - desloc.x, r.top - desloc.y, r.width, r.height)
    arrasteRef.current = { px: e.clientX, py: e.clientY, dx: desloc.x, dy: desloc.y, base }
    // captura o ponteiro: o arraste continua mesmo passando por cima do
    // visualizador OHIF (que roda num iframe)
    e.currentTarget.setPointerCapture(e.pointerId)
    setFixada(true)
  }
  function moverArraste(e: React.PointerEvent<HTMLDivElement>) {
    const a = arrasteRef.current
    if (!a) return
    const margem = 8
    let x = a.dx + (e.clientX - a.px)
    let y = a.dy + (e.clientY - a.py)
    // nao deixa o quadro sair da tela
    x = Math.min(Math.max(x, margem - a.base.left), window.innerWidth - margem - a.base.right)
    y = Math.min(Math.max(y, margem - a.base.top), window.innerHeight - margem - 40 - a.base.top)
    setDesloc({ x, y })
  }
  function terminarArraste(e: React.PointerEvent<HTMLDivElement>) {
    if (!arrasteRef.current) return
    arrasteRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ponteiro ja liberado
    }
  }

  // TAMANHO do quadro: a pessoa pode aumentar pelo canto de baixo/esquerda
  // (o quadro fica preso a direita do selo, entao cresce para a esquerda e
  // para baixo) ate no maximo METADE DA LARGURA da tela; a altura vai ate
  // 85% da tela. null = tamanho automatico (o de sempre).
  const [tamanho, setTamanho] = useState<{ w: number; h: number } | null>(null)
  const redimRef = useRef<{ px: number; py: number; w: number; h: number } | null>(null)
  const LARG_MIN = 288
  const ALT_MIN = 160
  const largMax = () => Math.max(LARG_MIN, Math.floor(window.innerWidth * 0.5))
  const altMax = () => Math.max(ALT_MIN, Math.floor(window.innerHeight * 0.85))

  function iniciarRedim(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || !caixaRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const r = caixaRef.current.getBoundingClientRect()
    redimRef.current = { px: e.clientX, py: e.clientY, w: r.width, h: r.height }
    e.currentTarget.setPointerCapture(e.pointerId)
    setFixada(true)
  }
  function moverRedim(e: React.PointerEvent<HTMLDivElement>) {
    const a = redimRef.current
    if (!a) return
    // puxar para a esquerda aumenta a largura; para baixo, a altura
    const w = Math.min(Math.max(a.w - (e.clientX - a.px), LARG_MIN), largMax())
    const h = Math.min(Math.max(a.h + (e.clientY - a.py), ALT_MIN), altMax())
    setTamanho({ w, h })
  }
  function terminarRedim(e: React.PointerEvent<HTMLDivElement>) {
    if (!redimRef.current) return
    redimRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ponteiro ja liberado
    }
  }
  // Ampliar: o quadro passa a ocupar METADE da area de imagens, do lado
  // que nao cobre a imagem descrita, com a mesma altura da area de imagens.
  const podeAmpliar = !!onAmpliar && !!areaAmpliada
  const maximizado = podeAmpliar && ampliado
  const [retAmp, setRetAmp] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useEffect(() => {
    if (!maximizado || !areaAmpliada) {
      setRetAmp(null)
      return
    }
    function medir() {
      const r = areaAmpliada!()
      setRetAmp((atual) =>
        r && (!atual || atual.left !== r.left || atual.top !== r.top || atual.width !== r.width || atual.height !== r.height) ? r : atual
      )
    }
    medir()
    // acompanha mudancas de tamanho da tela/area (e a animacao do layout)
    const id = setInterval(medir, 150)
    window.addEventListener('resize', medir)
    return () => {
      clearInterval(id)
      window.removeEventListener('resize', medir)
    }
  }, [maximizado, areaAmpliada])
  function alternarMaximizar() {
    onAmpliar?.(!ampliado)
    setFixada(true)
  }

  const totalMarcacoes = (item.marcacoes ?? []).length
  const linhas = descrever(item)

  // Modo flutuante: recalcula a posicao enquanto a caixa esta aberta
  // (o cartao pode estar crescendo por causa do zoom de 70%).
  useEffect(() => {
    if (!flutuante || !aberta) return
    const LARGURA = 320
    function posicionar() {
      const r = botaoRef.current?.getBoundingClientRect()
      if (!r) return
      const left = Math.min(Math.max(8, r.right - LARGURA), window.innerWidth - LARGURA - 8)
      const abaixo = r.bottom + 6
      const top = abaixo + 360 > window.innerHeight ? Math.max(8, r.top - 6 - 360) : abaixo
      setPos({ left, top })
    }
    posicionar()
    const id = setInterval(posicionar, 80)
    return () => clearInterval(id)
  }, [flutuante, aberta])

  const conteudo = (
    <>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-teal-200">
        {item.numero ? t('tituloImagem', { numero: item.numero }) : t('tituloCuradoria')}
      </p>
      {linhas.length === 0 ? (
        <p className="text-xs italic text-slate-400">{t('semDescricao')}</p>
      ) : (
        <dl className="space-y-1 text-xs leading-snug">
          {linhas.map((l) =>
            l.marcacao === undefined ? (
              <div key={l.rotulo}>
                <dt className="inline font-semibold text-slate-400">{l.rotulo}: </dt>
                <dd className="inline whitespace-pre-line text-ink">{l.valor}</dd>
              </div>
            ) : (
              // Linha de uma marcacao: com a cor dela e ligada a imagem -
              // passar o mouse destaca a marcacao; clicar isola.
              <div
                key={l.rotulo}
                className={`-mx-1 flex items-center gap-1.5 rounded px-1 py-0.5 ${
                  onFocoMarcacao ? 'cursor-pointer hover:bg-white/10' : ''
                }`}
                onMouseEnter={() => onFocoMarcacao?.(l.marcacao!)}
                onMouseLeave={() => onFocoMarcacao?.(null)}
                onClick={(e) => {
                  if (!onIsolarMarcacao) return
                  e.preventDefault()
                  e.stopPropagation()
                  onIsolarMarcacao(l.marcacao!)
                }}
              >
                <span
                  className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-black"
                  style={{ background: l.cor }}
                  aria-hidden="true"
                >
                  {l.marcacao + 1}
                </span>
                <dt className="inline font-semibold text-slate-400">{l.rotulo}: </dt>
                <dd className="inline whitespace-pre-line text-ink">{l.valor}</dd>
              </div>
            )
          )}
        </dl>
      )}
      {/* anotacoes pessoais (so no quadro que recebe clique; o modo
          flutuante e so leitura) - escrever deixa o quadro fixo aberto */}
      {curationId !== undefined && !flutuante && (
        <NotasVisualizador curationId={curationId} onAbrir={() => setFixada(true)} />
      )}
    </>
  )

  const botaoAmpliar = (
    <button
      type="button"
      onClick={alternarMaximizar}
      title={maximizado ? t('restaurarQuadro') : t('ampliarQuadro')}
      aria-label={maximizado ? t('restaurarQuadro') : t('ampliarQuadro')}
      className="flex shrink-0 items-center border-l border-teal-300/25 px-2 text-teal-100/80 hover:bg-teal-400/15 hover:text-teal-100"
    >
      {maximizado ? (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      )}
    </button>
  )

  return (
    <div
      className={`pointer-events-auto z-20 ${embutido ? 'relative' : 'absolute'} ${className}`}
      onMouseEnter={() => setPassando(true)}
      onMouseLeave={() => setPassando(false)}
    >
      <button
        ref={botaoRef}
        type="button"
        onFocus={() => setPassando(true)}
        onBlur={() => setPassando(false)}
        onClick={(e) => {
          // dentro de um link (cartao da Pesquisa): nao abrir a imagem
          e.preventDefault()
          e.stopPropagation()
          if (ampliado) {
            // fechar o quadro ampliado tambem desfaz a ampliacao
            onAmpliar?.(false)
            setFixada(false)
            return
          }
          setFixada((v) => !v)
        }}
        aria-pressed={fixada}
        title={fixada ? t('fecharDescricao') : t('abrirDescricao')}
        aria-expanded={aberta}
        aria-label={t('etiquetaAria', { total: totalMarcacoes })}
        className={`flex items-center gap-1 rounded-full border bg-black/70 px-2 py-0.5 text-[11px] font-semibold backdrop-blur ${
          fixada ? 'ring-2 ring-teal-300/70 ' : ''
        }${
          mostrarContagem && totalMarcacoes > 0
            ? 'border-amber-300/60 text-amber-200 hover:border-amber-300'
            : 'border-teal-300/50 text-teal-100 hover:border-teal-300'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
        </svg>
        {mostrarContagem && totalMarcacoes > 0 && <span>{totalMarcacoes}</span>}
      </button>

      {aberta && !flutuante && !maximizado && (
        <div
          ref={caixaRef}
          role="tooltip"
          style={{
            transform: `translate(${desloc.x}px, ${desloc.y}px)`,
            ...(tamanho ? { width: tamanho.w, height: tamanho.h, maxHeight: 'none' } : {}),
          }}
          className="absolute right-0 top-full mt-1 flex max-h-[60vh] w-80 flex-col overflow-hidden rounded-lg border border-teal-300/40 bg-base-surface/95 text-left shadow-2xl backdrop-blur-md"
        >
          {/* barra superior: alca para arrastar o quadro inteiro + ampliar */}
          <div className="flex shrink-0 items-stretch border-b border-teal-300/25 bg-teal-400/10">
            <div
              onPointerDown={iniciarArraste}
              onPointerMove={moverArraste}
              onPointerUp={terminarArraste}
              onPointerCancel={terminarArraste}
              onDoubleClick={() => setDesloc({ x: 0, y: 0 })}
              title={t('arrastarQuadro')}
              aria-label={t('arrastarQuadro')}
              className="flex flex-1 cursor-grab touch-none select-none items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-teal-100/80 hover:bg-teal-400/10 hover:text-teal-100 active:cursor-grabbing"
            >
              {/* icone de "mover" (setas nas quatro direcoes) */}
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
              </svg>
              <span className="truncate">{t('barraArrastar')}</span>
              <svg viewBox="0 0 24 8" className="ml-auto h-2 w-6 shrink-0 opacity-70" fill="currentColor" aria-hidden="true">
                {[3, 9, 15, 21].map((cx) => (
                  <g key={cx}>
                    <circle cx={cx} cy={2} r={1.3} />
                    <circle cx={cx} cy={6} r={1.3} />
                  </g>
                ))}
              </svg>
            </div>
            {podeAmpliar && botaoAmpliar}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{conteudo}</div>
          {/* canto para aumentar/diminuir o quadro (baixo, a esquerda) */}
          <div
            onPointerDown={iniciarRedim}
            onPointerMove={moverRedim}
            onPointerUp={terminarRedim}
            onPointerCancel={terminarRedim}
            onDoubleClick={() => setTamanho(null)}
            title={t('redimensionarQuadro')}
            aria-label={t('redimensionarQuadro')}
            className="absolute bottom-0 left-0 flex h-4 w-4 cursor-nesw-resize touch-none items-end justify-start p-0.5 text-teal-200/60 hover:text-teal-100"
          >
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" aria-hidden="true">
              <path d="M1 1v8h8M1 5l4 4" />
            </svg>
          </div>
        </div>
      )}
      {/* QUADRO AMPLIADO: metade da area de imagens, do lado oposto ao da
          imagem descrita, com a mesma altura da area de imagens. Vai para
          o elemento em tela cheia (ou o body), por cima do visualizador. */}
      {aberta &&
        !flutuante &&
        maximizado &&
        retAmp &&
        createPortal(
          <div
            role="dialog"
            aria-label={item.numero ? t('tituloImagem', { numero: item.numero }) : t('tituloCuradoria')}
            style={{ left: retAmp.left, top: retAmp.top, width: retAmp.width, height: retAmp.height }}
            className="fixed z-[250] flex flex-col overflow-hidden rounded-lg border border-teal-300/40 bg-base-surface/95 text-left shadow-2xl backdrop-blur-md"
          >
            <div className="flex shrink-0 items-stretch border-b border-teal-300/25 bg-teal-400/10">
              <div className="flex flex-1 select-none items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-teal-100/80">
                <span className="truncate">{t('barraAmpliado')}</span>
              </div>
              {botaoAmpliar}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 text-[13px]">{conteudo}</div>
          </div>,
          (typeof document !== 'undefined' && document.fullscreenElement) || document.body
        )}
      {aberta &&
        flutuante &&
        pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ left: pos.left, top: pos.top }}
            className="pointer-events-none fixed z-[300] max-h-[360px] w-80 overflow-hidden rounded-lg border border-teal-300/40 bg-base-surface/95 p-3 text-left shadow-2xl backdrop-blur-md"
          >
            {conteudo}
          </div>,
          document.body
        )}
    </div>
  )
}
