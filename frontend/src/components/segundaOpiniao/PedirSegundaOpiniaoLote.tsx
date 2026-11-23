'use client'

// "PEDIR SEGUNDA OPINIAO" DAS IMAGENS SELECIONADAS (pedido do video,
// 22/11/2026), na barra de acoes de Minhas imagens - so curador e
// administrador. As imagens salvas vem da Pesquisa, entao as fichas ja estao
// aprovadas: elas CONTINUAM aprovadas (e na Pesquisa) ate a revisao terminar
// (backend/app/modules/curation/segunda_opiniao.py). Um pedido por ficha, na
// mesma rota da Curadoria; se uma ficha ja tem pedido em aberto (ou saiu do
// banco), o servidor recusa so aquela e as outras seguem.

import { useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { fetchOuNulo } from '../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL

export default function PedirSegundaOpiniaoLote({
  curationIds,
  soIcone = false,
  className,
  onConcluido,
}: {
  curationIds: number[]
  /** barra rolada: so o icone */
  soIcone?: boolean
  className: string
  /** chamado depois de pedir (a tela limpa a selecao) */
  onConcluido: () => void
}) {
  const t = useTranslations('SegundaOpiniao.lote')
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [resultado, setResultado] = useState<{ feitas: number; recusadas: number } | null>(null)
  const [erro, setErro] = useState('')
  const total = curationIds.length

  async function pedir() {
    const texto = motivo.trim()
    if (!texto) return
    setOcupado(true)
    setErro('')
    let feitas = 0
    let recusadas = 0
    try {
      for (const id of curationIds) {
        const r = await fetchOuNulo(`${API}/curation/${id}/request-review`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo: texto }),
        })
        if (!r) {
          setErro(t('semConexao'))
          break
        }
        if (r.ok) feitas += 1
        else recusadas += 1
      }
    } finally {
      setOcupado(false)
    }
    if (feitas || recusadas) {
      setResultado({ feitas, recusadas })
      setAberto(false)
      setMotivo('')
      onConcluido()
    }
  }

  return (
    <>
      {total > 0 && (
        <button
          type="button"
          onClick={() => {
            setAberto((v) => !v)
            setResultado(null)
          }}
          aria-expanded={aberto}
          aria-label={t('botao', { n: total })}
          title={t('botao', { n: total })}
          className={className}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="9" cy="8" r="3" />
            <circle cx="17" cy="10" r="2.5" />
            <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M14 20c0-2.2 1.3-4 3-4s3 1.8 3 4" />
          </svg>
          {!soIcone && <span>{t('botao', { n: total })}</span>}
        </button>
      )}
      {aberto && total > 0 && (
        <div
          role="dialog"
          aria-label={t('titulo', { n: total })}
          className="absolute right-6 top-full z-50 mt-1 w-[min(92vw,380px)] space-y-2 rounded-xl border border-base-border bg-base-surface p-3 shadow-2xl"
        >
          <p className="text-sm font-semibold text-ink">{t('titulo', { n: total })}</p>
          <p className="text-xs text-slate-400">{t('explica')}</p>
          <label className="block text-xs text-slate-400">
            {t('motivo')}
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-base-border bg-base-surface2 px-2 py-1.5 text-sm text-ink outline-hidden focus:border-brand"
            />
          </label>
          {erro && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{erro}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-base-border px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
              {t('cancelar')}
            </button>
            <button
              type="button"
              disabled={!motivo.trim() || ocupado}
              onClick={() => void pedir()}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-hover disabled:opacity-40"
            >
              {ocupado ? t('pedindo') : t('pedir')}
            </button>
          </div>
        </div>
      )}
      {resultado && (
        <p role="status" className="basis-full rounded-lg bg-emerald-500/10 px-2 py-1 text-xs text-emerald-800 dark:text-emerald-300">
          <span>
            {t('feito', { n: resultado.feitas })}
            {resultado.recusadas > 0 && ` ${t('recusadas', { n: resultado.recusadas })}`}
          </span>{' '}
          {resultado.feitas > 0 && (
            <Link href="/segunda-opiniao" className="font-semibold underline hover:no-underline">
              {t('acompanhar')}
            </Link>
          )}
        </p>
      )}
    </>
  )
}
