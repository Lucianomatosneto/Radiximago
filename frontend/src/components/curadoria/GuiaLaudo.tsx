'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { SECOES_FICHA } from '../../lib/secoesCuradoria'

// GUIA "COMO LAUDAR" (passo a passo da curadoria), aberto pelo botao 📘 na
// coluna da ficha. Abre sozinho na primeira vez que o curador usa a tela
// neste navegador (lembrado em localStorage - so uma preferencia de
// exibicao, nenhum dado da ficha). Textos em Curadoria.guia.

const PASSOS = ['inicio', ...SECOES_FICHA, 'aprovar'] as const
const CHAVE_VISTO = 'radix-guia-laudo-visto'

export function guiaJaVisto(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_VISTO) === '1'
  } catch {
    return true // sem acesso ao armazenamento: nao insiste em abrir
  }
}

function marcarVisto() {
  try {
    window.localStorage.setItem(CHAVE_VISTO, '1')
  } catch {
    // sem armazenamento: tudo bem
  }
}

export default function GuiaLaudo({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const t = useTranslations('Curadoria.guia')
  const [passo, setPasso] = useState(0)

  useEffect(() => {
    if (!aberto) return
    setPasso(0)
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') fechar()
      if (e.key === 'ArrowRight') setPasso((p) => Math.min(PASSOS.length - 1, p + 1))
      if (e.key === 'ArrowLeft') setPasso((p) => Math.max(0, p - 1))
    }
    document.addEventListener('keydown', tecla, true)
    return () => document.removeEventListener('keydown', tecla, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  function fechar() {
    marcarVisto()
    onFechar()
  }

  if (!aberto) return null
  const id = PASSOS[passo]
  const falar: string[] = []
  for (let i = 1; i <= 4; i++) if (t.has(`passos.${id}.falar${i}`)) falar.push(t(`passos.${id}.falar${i}`))
  const fazer: string[] = []
  for (let i = 1; i <= 5; i++) if (t.has(`passos.${id}.fazer${i}`)) fazer.push(t(`passos.${id}.fazer${i}`))

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/65 p-4" role="dialog" aria-modal="true" aria-labelledby="titulo-guia">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-teal-300/40 bg-base-surface shadow-2xl">
        <header className="flex items-center gap-3 border-b border-white/10 px-5 py-3">
          <span className="text-xl" aria-hidden="true">📘</span>
          <h2 id="titulo-guia" className="text-base font-bold text-ink">{t('titulo')}</h2>
          <button type="button" onClick={fechar} className="ml-auto rounded-full px-2 text-lg text-slate-400 hover:text-ink" aria-label={t('fechar')}>
            ×
          </button>
        </header>

        {/* trilha de passos */}
        <nav className="flex flex-wrap gap-1 border-b border-white/10 px-5 py-2" aria-label={t('titulo')}>
          {PASSOS.map((p, i) => (
            <button
              key={p}
              type="button"
              onClick={() => setPasso(i)}
              aria-current={i === passo ? 'step' : undefined}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                i === passo ? 'bg-teal-400 text-slate-900' : i < passo ? 'bg-teal-400/20 text-teal-100' : 'bg-white/5 text-slate-400 hover:text-ink'
              }`}
            >
              {i === 0 ? '★' : i === PASSOS.length - 1 ? '✓' : i}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              {t('passoDe', { atual: passo + 1, total: PASSOS.length })}
            </p>
            <h3 className="text-lg font-semibold text-teal-100">{t(`passos.${id}.titulo`)}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{t(`passos.${id}.texto`)}</p>
          </div>
          {fazer.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-200">🖱️ {t('oQueFazer')}</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-300">
                {fazer.map((f) => <li key={f}>{f}</li>)}
              </ol>
            </div>
          )}
          {falar.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-200">🎤 {t('oQueFalar')}</p>
              <ul className="space-y-1">
                {falar.map((f) => (
                  <li key={f} className="rounded-md bg-black/25 px-2.5 py-1 font-mono text-xs text-ink">{f}</li>
                ))}
              </ul>
            </div>
          )}
          {t.has(`passos.${id}.dica`) && (
            <p className="rounded-lg border border-amber-300/30 bg-amber-300/5 p-2.5 text-xs leading-relaxed text-amber-50">💡 {t(`passos.${id}.dica`)}</p>
          )}
        </div>

        <footer className="flex items-center gap-2 border-t border-white/10 px-5 py-3">
          <span className="text-[11px] text-slate-500">{t('teclas')}</span>
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={() => setPasso((p) => Math.max(0, p - 1))} disabled={passo === 0} className="rounded-lg border border-base-border px-3 py-1.5 text-sm text-slate-200 disabled:opacity-30">
              ← {t('anterior')}
            </button>
            {passo < PASSOS.length - 1 ? (
              <button type="button" autoFocus onClick={() => setPasso((p) => p + 1)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
                {t('proximo')} →
              </button>
            ) : (
              <button type="button" onClick={fechar} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white">
                {t('comecar')}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  )
}
