'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { FORMAS_MARCACAO, rotularAchadoMarcacao, type Marcacao } from '../../lib/marcacoes'

// Selo no canto da imagem com o numero de marcacoes do curador. Ao passar
// o mouse (ou focar com o Tab), abre uma caixinha com o TEXTO de cada
// marcacao daquela imagem: a forma usada (oval, retangulo, seta) e o
// achado indicado. Nao aparece se a imagem nao tiver marcacao.
export default function EtiquetaMarcacoes({
  marcacoes,
  className = '',
}: {
  marcacoes: Marcacao[] | undefined
  className?: string
}) {
  const t = useTranslations('Visualizador.marcacoes')
  const [aberta, setAberta] = useState(false)
  const lista = marcacoes ?? []
  if (lista.length === 0) return null

  return (
    <div
      className={`pointer-events-auto absolute z-20 ${className}`}
      onMouseEnter={() => setAberta(true)}
      onMouseLeave={() => setAberta(false)}
    >
      <button
        type="button"
        onFocus={() => setAberta(true)}
        onBlur={() => setAberta(false)}
        onClick={(e) => {
          e.stopPropagation()
          setAberta((v) => !v)
        }}
        aria-expanded={aberta}
        aria-label={t('etiquetaAria', { total: lista.length })}
        className="flex items-center gap-1 rounded-full border border-amber-300/60 bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-amber-200 backdrop-blur hover:border-amber-300"
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <ellipse cx="12" cy="12" rx="8" ry="6" />
          <path d="M12 9v3l2 2" />
        </svg>
        {lista.length}
      </button>

      {aberta && (
        <div
          role="tooltip"
          className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-amber-300/40 bg-base-surface/95 p-2.5 text-left shadow-2xl backdrop-blur-md"
        >
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
            {t('titulo', { total: lista.length })}
          </p>
          <ul className="space-y-1">
            {lista.map((m, i) => {
              const forma = FORMAS_MARCACAO.find((f) => f.tipo === m.tipo)
              const texto =
                m.achado === 'outro' && m.achado_descricao
                  ? m.achado_descricao
                  : rotularAchadoMarcacao(m.achado) || t('semRotulo')
              return (
                <li key={m.id ?? i} className="flex items-start gap-2 text-xs text-ink">
                  <span className="w-4 shrink-0 text-center text-amber-200" aria-hidden="true">
                    {forma?.icone ?? '•'}
                  </span>
                  <span className="min-w-0">
                    <span className="font-medium">{texto}</span>
                    {forma && <span className="text-slate-400"> · {forma.rotulo}</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
