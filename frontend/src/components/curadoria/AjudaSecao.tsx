'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { SecaoFicha } from '../../lib/secoesCuradoria'

// "?" ao lado de cada secao da ficha: abre um balao curto com O QUE FALAR
// no microfone para preencher aquela secao (exemplos prontos) e uma dica.
// Textos em Curadoria.ajudaSecoes.<secao> (falar1..falar4, dica).

const QUANTOS_EXEMPLOS = 4

export default function AjudaSecao({ secao }: { secao: SecaoFicha }) {
  const t = useTranslations('Curadoria.ajudaSecoes')
  const tSecoes = useTranslations('Curadoria.secoes')
  const [aberto, setAberto] = useState(false)
  const caixaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    function fora(e: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false)
    }
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  const exemplos: string[] = []
  for (let i = 1; i <= QUANTOS_EXEMPLOS; i++) {
    const chave = `${secao}.falar${i}`
    if (t.has(chave)) exemplos.push(t(chave))
  }

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setAberto((v) => !v)
        }}
        aria-expanded={aberto}
        aria-label={t('rotulo', { secao: tSecoes(secao) })}
        title={t('rotulo', { secao: tSecoes(secao) })}
        className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold transition-colors ${
          aberto ? 'border-teal-300 bg-teal-400 text-slate-900' : 'border-slate-500 text-slate-300 hover:border-teal-300 hover:text-teal-200'
        }`}
      >
        ?
      </button>
      {aberto && (
        <div
          role="dialog"
          className="absolute left-0 top-full z-40 mt-1 w-72 rounded-xl border border-teal-300/40 bg-base-surface p-3 text-left shadow-2xl"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <p className="mb-1 text-xs font-semibold text-teal-200">🎤 {t('comoFalar')}</p>
          {exemplos.length ? (
            <ul className="space-y-1">
              {exemplos.map((ex) => (
                <li key={ex} className="rounded-md bg-black/20 px-2 py-1 font-mono text-[11px] text-ink">
                  {ex}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{t(`${secao}.dica`)}</p>
          <p className="mt-2 border-t border-white/10 pt-1.5 text-[10px] text-slate-500">{t('comum')}</p>
        </div>
      )}
    </div>
  )
}
