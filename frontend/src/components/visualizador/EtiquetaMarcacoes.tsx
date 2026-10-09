'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'
import { useDescricaoCuradoria, type ItemDescritivel } from '../../lib/descricaoCuradoria'

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
}: {
  item: ItemDescritivel
  className?: string
  flutuante?: boolean
  /** dentro de outro grupo posicionado (nao usa position:absolute proprio) */
  embutido?: boolean
  /** mostra o numero de marcacoes ao lado do "i" */
  mostrarContagem?: boolean
}) {
  const t = useTranslations('Visualizador.marcacoes')
  const descrever = useDescricaoCuradoria()
  // Passar o mouse (ou focar com Tab) abre; um CLIQUE deixa a caixa fixa
  // aberta ate clicar de novo no selo.
  const [passando, setPassando] = useState(false)
  const [fixada, setFixada] = useState(false)
  const aberta = passando || fixada
  const botaoRef = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
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
          {linhas.map((l) => (
            <div key={l.rotulo}>
              <dt className="inline font-semibold text-slate-400">{l.rotulo}: </dt>
              <dd className="inline whitespace-pre-line text-ink">{l.valor}</dd>
            </div>
          ))}
        </dl>
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
        title={fixada ? t('soltarDescricao') : t('fixarDescricao')}
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
          role="tooltip"
          className="absolute right-0 top-full mt-1 max-h-[60vh] w-80 overflow-y-auto rounded-lg border border-teal-300/40 bg-base-surface/95 p-3 text-left shadow-2xl backdrop-blur-md"
        >
          {conteudo}
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
