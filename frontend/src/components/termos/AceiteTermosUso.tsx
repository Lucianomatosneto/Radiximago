'use client'

// ACEITE DOS TERMOS DE USO E DA POLITICA DE PRIVACIDADE (10/11/2026)
// Primeiro acesso, nova versao ou novo perfil: a pessoa le os Termos de Uso,
// o anexo do SEU perfil e a Politica de Privacidade, rola ate o fim e marca
// "Li e concordo". "Nao aceito" encerra a sessao (o servidor tambem barra
// tudo sem o aceite). A versao, o perfil e um resumo do texto aceito ficam
// guardados no servidor.

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ExternalLink, FileText } from 'lucide-react'
import TextoTermos from './TextoTermos'

const API = process.env.NEXT_PUBLIC_API_URL

export type MeusTermos = {
  versao: string
  vigencia: string
  mudancas: string
  perfil: string
  pendente: boolean
  primeiro_aceite: boolean
  documentos: { termos_uso: string; anexo_perfil: string; privacidade: string }
}

export default function AceiteTermosUso({ termos, onAceito }: { termos: MeusTermos; onAceito: () => void }) {
  const t = useTranslations('Termos')
  const area = useRef<HTMLDivElement>(null)
  const [leuAteOFim, setLeuAteOFim] = useState(false)
  const [concordo, setConcordo] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  function aoRolar() {
    const e = area.current
    if (e && e.scrollTop + e.clientHeight >= e.scrollHeight - 24) setLeuAteOFim(true)
  }

  async function aceitar() {
    if (!concordo) {
      setErro(t('marqueConcordo'))
      return
    }
    setEnviando(true)
    setErro('')
    try {
      const r = await fetch(`${API}/termos/aceitar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versao: termos.versao, anexo: termos.perfil, li_e_concordo: true }),
      })
      if (r.ok) onAceito()
      else if (r.status === 409) {
        setErro(t('atualizados'))
        onAceito() // busca a versao nova
      } else setErro(t('erroAceite'))
    } catch {
      setErro(t('erroAceite'))
    } finally {
      setEnviando(false)
    }
  }

  async function recusar() {
    setEnviando(true)
    try {
      await fetch(`${API}/termos/recusar`, { method: 'POST', credentials: 'include' })
    } finally {
      window.location.href = '/login?termos=recusados'
    }
  }

  const perfil = t(`perfis.${termos.perfil}`)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="termos-titulo"
        data-teste="aceite-termos"
        className="flex h-[96vh] w-full max-w-3xl flex-col sm:h-auto sm:max-h-[96vh] rounded-2xl border border-base-border bg-base-surface shadow-2xl"
      >
        <div className="border-b border-base-border p-3 sm:p-5">
          <div className="flex items-center gap-3">
            <FileText aria-hidden="true" className="h-6 w-6 shrink-0 text-brand" />
            <h2 id="termos-titulo" className="text-base font-semibold text-ink sm:text-lg">
              {termos.primeiro_aceite ? t('tituloPrimeiro') : t('tituloNovaVersao')}
            </h2>
          </div>
          <p className="mt-1 text-xs text-ink-3">{t('versao', { versao: termos.versao, vigencia: termos.vigencia })}</p>
          {!termos.primeiro_aceite && (
            <p className="mt-2 rounded-lg bg-amber-500/10 p-2 text-sm text-amber-900 dark:text-amber-100">
              <strong>{t('oQueMudou')}</strong> {termos.mudancas}
            </p>
          )}
          <p className="mt-2 hidden text-sm text-ink-2 sm:block">{t('leiaAntes', { perfil })}</p>
        </div>

        <div
          ref={area}
          onScroll={aoRolar}
          tabIndex={0}
          aria-label={t('textosParaLer')}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-2 sm:px-6"
          data-teste="area-termos"
        >
          <TextoTermos markdown={termos.documentos.termos_uso} prefixo="t-" />
          <hr className="my-6 border-base-border" />
          <TextoTermos markdown={termos.documentos.anexo_perfil} prefixo="a-" />
          <hr className="my-6 border-base-border" />
          <TextoTermos markdown={termos.documentos.privacidade} prefixo="p-" />
        </div>

        <div className="border-t border-base-border p-3 sm:p-5">
          <label className={`flex items-start gap-3 rounded-lg border p-2 sm:p-3 ${leuAteOFim ? 'cursor-pointer border-brand/40 bg-brand/5' : 'border-base-border opacity-60'}`}>
            <input
              type="checkbox"
              checked={concordo}
              disabled={!leuAteOFim}
              onChange={(e) => setConcordo(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0"
              data-teste="termos-concordo"
            />
            <span className="text-sm font-medium text-ink">{t('concordo', { perfil, versao: termos.versao })}</span>
          </label>
          {!leuAteOFim && <p className="mt-2 text-xs text-ink-3">{t('roleAteOFim')}</p>}
          {erro && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-300">{erro}</p>}
          <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <a href="/termos" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-brand underline">
              <ExternalLink aria-hidden="true" className="h-4 w-4" /> {t('abrirPagina')}
            </a>
            <div className="flex gap-2">
              <button type="button" onClick={recusar} disabled={enviando}
                      className="min-h-11 flex-1 rounded-lg border border-base-border px-4 text-sm text-ink hover:border-red-400 disabled:opacity-50 sm:flex-none"
                      data-teste="termos-recusar">
                {t('naoAceito')}
              </button>
              <button type="button" onClick={aceitar} disabled={enviando || !concordo}
                      className="min-h-11 flex-[2] rounded-lg bg-brand px-5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50 sm:flex-none"
                      data-teste="termos-aceitar">
                {t('aceitar')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
