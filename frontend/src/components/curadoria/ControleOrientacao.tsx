'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { arcadaDosDentes, chaveSugestao, type Giro } from '../../lib/orientacao'

/**
 * GIRAR A IMAGEM na Curadoria (pedido de 20/10/2026): uma pilula pequena e
 * discreta no canto da imagem, com dois icones - girar para a esquerda e
 * para a direita (90°). Fica semitransparente e acende ao passar o mouse.
 * Quando a imagem ja foi girada, aparece um terceiro icone para voltar a
 * posicao em que ela chegou.
 *
 * RAPIDO, SEM APAGAR A TELA: o clique gira a imagem NA HORA dentro do OHIF
 * (`onGirarNaTela`) e a gravacao no arquivo acontece por tras, sem perda
 * (backend: POST /curation/imagem/{id}/girar). Cliques seguidos viram UMA
 * gravacao so (ex.: dois cliques = 180°). A imagem passa a aparecer assim
 * para todos os usuarios, em todas as telas, e as marcacoes giram junto
 * (`onGirou`). Se a gravacao falhar, a imagem volta na tela.
 * A sugestao de posicao pelos dentes marcados aparece ao parar o mouse.
 *
 * TECLA R (pedido de 22/10/2026): R gira 90° para a direita e Shift+R para
 * a esquerda - com o foco na tela do Radix OU dentro do OHIF (o OHIF avisa
 * por mensagem, ver ohif/app-config.template.js). Ignorada enquanto se
 * digita num campo. Um selo "R" na pilula lembra o atalho.
 */
export default function ControleOrientacao({
  orthancReferenceId,
  dentes,
  tipoRadiografia,
  giroAtual,
  onGirarNaTela,
  onGirou,
  iframeOhifRef,
}: {
  orthancReferenceId: number
  dentes: number[]
  tipoRadiografia: string | null
  /** quanto a imagem ja foi girada desde que chegou (0, 90, 180, 270) */
  giroAtual: number | null
  /** gira so na tela, na hora; devolve false se o OHIF nao estiver aberto */
  onGirarNaTela: (graus: Giro) => boolean
  /** giro gravado no arquivo (mostradoNaTela: o OHIF ja mostra girado) */
  onGirou: (graus: Giro, mostradoNaTela: boolean) => void
  /** o OHIF da Curadoria: so aceita o aviso de tecla R vindo DELE */
  iframeOhifRef?: React.RefObject<HTMLIFrameElement | null>
}) {
  const t = useTranslations('Curadoria.orientacao')
  const [girando, setGirando] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erro, setErro] = useState('')
  const [giro, setGiro] = useState(giroAtual ?? 0)
  // so quando o servidor informa um giro novo (a imagem nao recarrega ao girar)
  useEffect(() => {
    if (giroAtual !== null) setGiro(giroAtual)
  }, [giroAtual])
  useEffect(() => {
    if (!salvo) return
    const id = setTimeout(() => setSalvo(false), 1800)
    return () => clearTimeout(id)
  }, [salvo])

  const arcada = arcadaDosDentes(dentes)
  const sugestao = t(`sugestao.${chaveSugestao(arcada, tipoRadiografia)}`, {
    dentes: [...dentes].sort((a, b) => a - b).join(', '),
  })

  // cliques ainda nao gravados (graus somados) e se a tela ja mostra o giro
  const pendente = useRef(0)
  const naTela = useRef(true)
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gravando = useRef(false)
  useEffect(() => () => {
    if (relogio.current) clearTimeout(relogio.current)
  }, [])

  // tecla R (aqui ou dentro do OHIF): sempre chama o girar mais recente
  const girarRef = useRef<(graus: Giro) => void>(() => {})
  useEffect(() => {
    function aoTeclar(ev: KeyboardEvent) {
      if ((ev.key !== 'r' && ev.key !== 'R') || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return
      const alvo = ev.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return
      ev.preventDefault()
      girarRef.current(ev.shiftKey ? 270 : 90)
    }
    function aoReceber(ev: MessageEvent) {
      const janela = iframeOhifRef?.current?.contentWindow
      if (!janela || ev.source !== janela) return
      const dados = ev.data as { tipo?: unknown; sentido?: unknown } | null
      if (dados && dados.tipo === 'radix-tecla-girar') girarRef.current(dados.sentido === 'anti' ? 270 : 90)
    }
    window.addEventListener('keydown', aoTeclar)
    window.addEventListener('message', aoReceber)
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      window.removeEventListener('message', aoReceber)
    }
  }, [iframeOhifRef])

  function girar(graus: Giro) {
    setErro('')
    setSalvo(false)
    const mostrou = onGirarNaTela(graus)
    naTela.current = naTela.current && mostrou
    setGiro((g) => (g + graus) % 360)
    pendente.current = (pendente.current + graus) % 360
    setGirando(true)
    if (relogio.current) clearTimeout(relogio.current)
    relogio.current = setTimeout(gravar, mostrou ? 600 : 0)
  }

  async function gravar() {
    if (gravando.current) return // termina a atual e depois grava o resto
    const graus = pendente.current as Giro | 0
    const mostrou = naTela.current
    pendente.current = 0
    naTela.current = true
    if (!graus) {
      setGirando(false)
      return
    }
    gravando.current = true
    let ok = false
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/imagem/${orthancReferenceId}/girar`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ graus }),
        }
      )
      if (resposta.ok) ok = true
      else {
        let detalhe = t('erro')
        try {
          const dados = await resposta.json()
          if (typeof dados?.detail === 'string') detalhe = dados.detail
        } catch {
          // sem corpo legivel
        }
        setErro(detalhe)
      }
    } catch {
      setErro(t('erro'))
    } finally {
      gravando.current = false
    }
    if (ok) {
      setSalvo(true)
      onGirou(graus, mostrou)
    } else {
      // nao gravou: desfaz o giro mostrado na tela
      const volta = ((360 - graus) % 360) as Giro
      if (mostrou) onGirarNaTela(volta)
      setGiro((g) => (g + volta) % 360)
    }
    if (pendente.current) gravar()
    else setGirando(false)
  }

  girarRef.current = girar

  const botao =
    'flex h-8 w-8 items-center justify-center rounded-full text-slate-100 transition hover:bg-white/15 hover:text-teal-200 disabled:cursor-wait disabled:opacity-40'

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
      {erro && (
        <p role="alert" className="max-w-60 rounded-lg bg-black/80 px-2.5 py-1 text-[11px] text-red-300 backdrop-blur-sm">
          {erro}
        </p>
      )}
      <div
        role="group"
        aria-label={t('titulo')}
        title={`${t('sugestaoRotulo')} ${sugestao}`}
        className="group flex items-center gap-0.5 rounded-full border border-white/15 bg-black/55 p-1 opacity-80 shadow-lg backdrop-blur-md transition-opacity hover:opacity-100 focus-within:opacity-100"
      >
        {/* atalho: tecla R (clique tambem gira para a direita) */}
        <button
          type="button"
          onClick={() => girar(90)}
          title={t('teclaDica')}
          aria-label={t('teclaDica')}
          className="ml-0.5 flex h-6 min-w-6 items-center justify-center rounded-md border border-teal-300/60 bg-white/10 px-1 font-mono text-[11px] font-bold text-teal-100 shadow-[inset_0_-1px_0_rgba(255,255,255,0.15)] transition hover:bg-teal-400/25"
        >
          R
        </button>
        <button type="button" className={botao} onClick={() => girar(270)} title={t('esquerdaDica')} aria-label={t('esquerdaDica')}>
          <IconeGirar sentido="anti" />
        </button>
        <span aria-live="polite" className={`flex justify-center text-[11px] text-teal-200 transition-all ${girando || salvo ? 'w-5' : 'w-0'}`}>
          {girando ? (
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-teal-300 border-t-transparent" aria-label={t('girando')} />
          ) : salvo ? (
            <span aria-label={t('salvo')}>✓</span>
          ) : null}
        </span>
        <button type="button" className={botao} onClick={() => girar(90)} title={t('direitaDica')} aria-label={t('direitaDica')}>
          <IconeGirar sentido="horario" />
        </button>
        {giro !== 0 && <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-white/20" />}
        {giro !== 0 && (
          <button
            type="button"
            className={botao}
            onClick={() => girar(((360 - giro) % 360) as Giro)}
            title={t('originalDica')}
            aria-label={t('originalDica')}
          >
            <span className="text-[11px] font-semibold tabular-nums">0°</span>
          </button>
        )}
      </div>
    </div>
  )
}

function IconeGirar({ sentido }: { sentido: 'horario' | 'anti' }) {
  // seta circular (mesmo desenho dos editores de foto)
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-[18px] w-[18px] ${sentido === 'anti' ? '-scale-x-100' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}
