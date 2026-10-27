'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

// RESPONDER a quem compartilhou a imagem, sem digitar e-mail: a mesma imagem
// volta para quem enviou, com a resposta como recado (e as anotacoes de quem
// responde). Quem enviou recebe em "Compartilhadas comigo", marcada como
// nova. Ver POST /shares/recebidas/{id}/responder no backend.
//
// `icone`: so o botao redondo (cartao); sem ele, botao com texto (janela).
// No cartao, a linha de botoes precisa ser "relative" (o formulario abre
// logo acima dela, na largura do cartao).

const API = process.env.NEXT_PUBLIC_API_URL

export default function ResponderCompartilhamento({
  compartilhamentoId,
  remetenteNome,
  icone = false,
  compacto = false,
}: {
  compartilhamentoId: number
  remetenteNome: string
  icone?: boolean
  /** botao pequeno, no padrao dos icones da grade de imagens (Pesquisa) */
  compacto?: boolean
}) {
  const t = useTranslations('Compartilhar')
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [enviado, setEnviado] = useState(false)
  const campoRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (aberto) campoRef.current?.focus()
  }, [aberto])

  // "Resposta enviada" some sozinho depois de alguns segundos
  useEffect(() => {
    if (!enviado) return
    const id = setTimeout(() => setEnviado(false), 4000)
    return () => clearTimeout(id)
  }, [enviado])

  async function enviar() {
    const mensagem = texto.trim()
    if (!mensagem) {
      setErro(t('erroRespostaVazia'))
      return
    }
    setEnviando(true)
    setErro('')
    try {
      const r = await fetch(`${API}/shares/recebidas/${compartilhamentoId}/responder`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem }),
      })
      if (r.status === 429) {
        setErro(t('erroMuitas'))
        return
      }
      if (!r.ok) {
        setErro(t('erroResponder'))
        return
      }
      setTexto('')
      setAberto(false)
      setEnviado(true)
    } catch {
      setErro(t('erroResponder'))
    } finally {
      setEnviando(false)
    }
  }

  const rotulo = t('responderA', { nome: remetenteNome })

  const formulario = (
    <div
      className={
        compacto
          ? 'absolute bottom-full right-0 z-30 mb-2 w-64 rounded-lg border border-sky-400/40 bg-base-surface p-2 text-left shadow-2xl'
          : icone
            ? 'absolute bottom-full left-0 right-0 z-30 mb-2 rounded-lg border border-sky-400/40 bg-base-surface p-2 shadow-2xl'
            : 'mt-2'
      }
      // teclas digitadas aqui nao acionam atalhos da tela
      onKeyDown={(e) => e.stopPropagation()}
    >
      {(icone || compacto) && <p className="mb-1 text-[11px] font-semibold text-sky-700 dark:text-sky-200">{rotulo}</p>}
      <textarea
        ref={campoRef}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviar()
          if (e.key === 'Escape') setAberto(false)
        }}
        maxLength={500}
        rows={3}
        placeholder={t('placeholderResposta')}
        aria-label={t('placeholderResposta')}
        className="w-full resize-y rounded-md border border-sky-500/40 bg-black/30 px-2 py-1.5 text-xs leading-snug text-ink outline-hidden placeholder:text-slate-500 focus:border-sky-300"
      />
      {erro && <p className="mt-1 text-xs text-red-400">{erro}</p>}
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-[10px] text-slate-500">{t('respostaExplicacao')}</span>
        <div className="flex shrink-0 gap-1.5">
          <button type="button" onClick={() => setAberto(false)} className="rounded-md px-2 py-0.5 text-xs text-slate-300 hover:bg-white/10">
            {t('cancelar')}
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={enviando}
            className="rounded-md bg-sky-500/80 px-2 py-0.5 text-xs font-semibold text-black hover:bg-sky-400 disabled:opacity-50"
          >
            {enviando ? t('enviando') : t('enviarResposta')}
          </button>
        </div>
      </div>
    </div>
  )

  if (compacto) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setErro('')
            setAberto((v) => !v)
          }}
          title={rotulo}
          aria-label={rotulo}
          aria-expanded={aberto}
          className={`flex items-center rounded-full border bg-white/90 px-1.5 py-0.5 backdrop-blur-sm dark:bg-black/70 ${
            enviado
              ? 'border-emerald-500 text-emerald-700 dark:border-emerald-300 dark:text-emerald-200'
              : 'border-sky-600/50 text-sky-800 hover:border-sky-600 dark:border-sky-300/50 dark:text-sky-100 dark:hover:border-sky-300'
          }`}
        >
          {enviado ? <span className="text-[11px] leading-none">✓</span> : <span className="[&_svg]:h-3.5 [&_svg]:w-3.5"><IconeResponder /></span>}
        </button>
        {aberto && formulario}
      </div>
    )
  }

  if (icone) {
    return (
      // sem "relative" aqui: o formulario se posiciona pela linha de botoes
      // do cartao (que e "relative") e ocupa a largura do cartao
      <div>
        <button
          type="button"
          onClick={() => {
            setErro('')
            setAberto((v) => !v)
          }}
          title={rotulo}
          aria-label={rotulo}
          aria-expanded={aberto}
          className={`flex h-8 w-8 items-center justify-center rounded-full border bg-base-surface/30 hover:border-sky-400 hover:text-sky-300 ${
            enviado ? 'border-emerald-400 text-emerald-300' : 'border-base-border text-slate-200'
          }`}
        >
          {enviado ? '✓' : <IconeResponder />}
        </button>
        {aberto && formulario}
      </div>
    )
  }

  return (
    <div>
      {!aberto && (
        <button
          type="button"
          onClick={() => {
            setErro('')
            setAberto(true)
          }}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-sky-400/40 px-2 py-1 text-xs font-semibold text-sky-200 hover:bg-sky-400/15"
        >
          <IconeResponder />
          {rotulo}
        </button>
      )}
      {enviado && !aberto && <p className="mt-1 text-xs text-emerald-300">✓ {t('respostaEnviada', { nome: remetenteNome })}</p>}
      {aberto && formulario}
    </div>
  )
}

function IconeResponder() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 5 5v6" />
    </svg>
  )
}
