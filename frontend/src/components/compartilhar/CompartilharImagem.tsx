'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

// Compartilhar a imagem (com as MINHAS anotacoes) com outro usuario do
// sistema, digitando o e-mail do cadastro dele. A resposta do servidor e
// sempre a mesma, exista ou nao um usuario com aquele e-mail (privacidade:
// o formulario nao serve para descobrir quem tem conta). Lista abaixo com
// quem a imagem ja foi compartilhada, com opcao de desfazer.

const API = process.env.NEXT_PUBLIC_API_URL

interface Enviado {
  id: number
  destinatario_nome: string
  destinatario_email: string
}

export default function CompartilharImagem({ curationId, onAbrir }: { curationId: number; onAbrir?: () => void }) {
  const t = useTranslations('Compartilhar')
  const [aberto, setAberto] = useState(false)
  const [email, setEmail] = useState('')
  const [mensagem, setMensagem] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
  // convite para cadastro (vem na resposta neutra): quem compartilha
  // repassa o link para a pessoa, caso ela ainda nao tenha conta
  const [convite, setConvite] = useState<{ texto: string; link: string } | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')
  const [enviados, setEnviados] = useState<Enviado[]>([])

  async function carregarEnviados() {
    try {
      const r = await fetch(`${API}/shares/enviadas?curation_id=${curationId}`, { credentials: 'include' })
      if (!r.ok) return
      const dados: { itens: Enviado[] } = await r.json()
      setEnviados(dados.itens)
    } catch {
      // sem a lista, so nao mostra com quem ja foi compartilhada
    }
  }

  useEffect(() => {
    setAberto(false)
    setEmail('')
    setMensagem('')
    setAviso('')
    setConvite(null)
    setErro('')
    setEnviados([])
    carregarEnviados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curationId])

  async function enviar() {
    const valor = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)) {
      setErro(t('erroEmail'))
      return
    }
    setEnviando(true)
    setErro('')
    setAviso('')
    setConvite(null)
    setCopiado(false)
    try {
      const r = await fetch(`${API}/shares/${curationId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: valor, mensagem: mensagem.trim() || null }),
      })
      if (!r.ok) {
        let detalhe = t('erroEnviar')
        try {
          const dados = await r.json()
          if (typeof dados?.detail === 'string') detalhe = dados.detail
        } catch {
          // sem corpo legivel
        }
        setErro(r.status === 429 ? t('erroMuitas') : detalhe)
        return
      }
      const dados = await r.json()
      setAviso(dados.mensagem ?? t('enviado'))
      const link = typeof dados.link_cadastro === 'string' ? dados.link_cadastro : `${window.location.origin}/solicitar-acesso`
      setConvite({ texto: dados.aviso_cadastro ?? t('avisoCadastro'), link })
      setEmail('')
      setMensagem('')
      setAberto(false)
      carregarEnviados()
    } catch {
      setErro(t('erroEnviar'))
    } finally {
      setEnviando(false)
    }
  }

  async function desfazer(id: number) {
    setErro('')
    try {
      const r = await fetch(`${API}/shares/enviadas/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!r.ok) {
        setErro(t('erroDesfazer'))
        return
      }
      setEnviados((atual) => atual.filter((e) => e.id !== id))
    } catch {
      setErro(t('erroDesfazer'))
    }
  }

  return (
    <div className="mt-3 border-t border-white/10 pt-2" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-200">{t('titulo')}</p>
        {!aberto && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setAberto(true)
              onAbrir?.()
            }}
            title={t('abrir')}
            aria-label={t('abrir')}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-teal-300/50 text-teal-100 hover:border-teal-300 hover:bg-teal-300/10"
          >
            {/* icone de compartilhar (tres pontos ligados) */}
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <circle cx="18" cy="5" r="2.5" />
              <circle cx="6" cy="12" r="2.5" />
              <circle cx="18" cy="19" r="2.5" />
              <path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" />
            </svg>
          </button>
        )}
      </div>

      {aberto && (
        <div className="mt-2 space-y-1.5">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') enviar()
              if (e.key === 'Escape') setAberto(false)
            }}
            placeholder={t('placeholderEmail')}
            aria-label={t('placeholderEmail')}
            autoComplete="off"
            maxLength={150}
            className="w-full rounded-md border border-teal-500/40 bg-black/40 px-2 py-1.5 text-xs text-ink outline-none placeholder:text-slate-500 focus:border-teal-300"
            autoFocus
          />
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            placeholder={t('placeholderMensagem')}
            aria-label={t('placeholderMensagem')}
            maxLength={500}
            rows={2}
            className="w-full resize-y rounded-md border border-teal-500/40 bg-black/40 px-2 py-1.5 text-xs text-ink outline-none placeholder:text-slate-500 focus:border-teal-300"
          />
          <p className="text-[10px] leading-snug text-slate-500">{t('explicacao')}</p>
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setAberto(false)} className="rounded-md px-2 py-0.5 text-xs text-slate-300 hover:bg-white/10">
              {t('cancelar')}
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={enviando}
              className="rounded-md bg-teal-500/80 px-2 py-0.5 text-xs font-semibold text-black hover:bg-teal-400 disabled:opacity-50"
            >
              {enviando ? t('enviando') : t('enviar')}
            </button>
          </div>
        </div>
      )}
      {aviso && <p className="mt-1.5 text-xs text-emerald-300">{aviso}</p>}
      {convite && (
        <div className="mt-1.5 rounded-md border border-amber-300/30 bg-amber-300/5 p-2">
          <p className="text-[11px] leading-snug text-amber-100/90">{convite.texto}</p>
          <div className="mt-1 flex items-center gap-1.5">
            <a
              href={convite.link}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate text-[11px] text-teal-200 underline hover:text-teal-100"
            >
              {convite.link}
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(convite.link)
                  setCopiado(true)
                } catch {
                  // sem acesso a area de transferencia: o link continua visivel para copiar
                }
              }}
              className="shrink-0 rounded border border-teal-300/40 px-1.5 py-0.5 text-[10px] text-teal-100 hover:bg-teal-300/10"
            >
              {copiado ? t('linkCopiado') : t('copiarLink')}
            </button>
          </div>
        </div>
      )}
      {erro && <p className="mt-1.5 text-xs text-red-400">{erro}</p>}

      {enviados.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] text-slate-500">{t('jaCompartilhada')}</p>
          <ul className="mt-0.5 space-y-0.5">
            {enviados.map((e) => (
              <li key={e.id} className="group flex items-center gap-1.5 text-xs text-ink">
                <span className="min-w-0 flex-1 truncate" title={e.destinatario_email}>
                  {e.destinatario_nome} <span className="text-slate-500">({e.destinatario_email})</span>
                </span>
                <button
                  type="button"
                  onClick={() => desfazer(e.id)}
                  title={t('desfazer')}
                  aria-label={t('desfazer')}
                  className="shrink-0 text-[11px] text-slate-500 hover:text-red-400"
                >
                  {t('desfazerCurto')}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
