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
}) {
  const t = useTranslations('Visualizador.marcacoes')
  const descrever = useDescricaoCuradoria()
  // Visualizador: UM CLIQUE no selo abre o quadro e outro clique fecha
  // (passar o mouse nao abre mais - o quadro nao aparece sem querer por
  // cima da imagem). Modo flutuante (cartoes da Pesquisa, so leitura):
  // continua abrindo ao passar o mouse.
  const [passando, setPassando] = useState(false)
  const [fixada, setFixada] = useState(false)
  const aberta = fixada || (flutuante && passando)
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

      {aberta && !flutuante && (
        <div
          ref={caixaRef}
          role="tooltip"
          style={{ transform: `translate(${desloc.x}px, ${desloc.y}px)` }}
          className="absolute right-0 top-full mt-1 flex max-h-[60vh] w-80 flex-col overflow-hidden rounded-lg border border-teal-300/40 bg-base-surface/95 text-left shadow-2xl backdrop-blur-md"
        >
          {/* alca para arrastar o quadro */}
          <div
            onPointerDown={iniciarArraste}
            onPointerMove={moverArraste}
            onPointerUp={terminarArraste}
            onPointerCancel={terminarArraste}
            onDoubleClick={() => setDesloc({ x: 0, y: 0 })}
            title={t('arrastarQuadro')}
            aria-label={t('arrastarQuadro')}
            className="flex shrink-0 cursor-grab touch-none select-none items-center justify-center border-b border-white/10 py-1 text-slate-400 hover:bg-white/5 hover:text-teal-200 active:cursor-grabbing"
          >
            <svg viewBox="0 0 24 8" className="h-2 w-6" fill="currentColor" aria-hidden="true">
              {[3, 9, 15, 21].map((cx) => (
                <g key={cx}>
                  <circle cx={cx} cy={2} r={1.3} />
                  <circle cx={cx} cy={6} r={1.3} />
                </g>
              ))}
            </svg>
          </div>
          <div className="overflow-y-auto p-3">{conteudo}</div>
        </div>
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
