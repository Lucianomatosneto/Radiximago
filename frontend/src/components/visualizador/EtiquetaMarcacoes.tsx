'use client'

import { useState } from 'react'
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
export default function EtiquetaMarcacoes({
  item,
  className = '',
}: {
  item: ItemDescritivel
  className?: string
}) {
  const t = useTranslations('Visualizador.marcacoes')
  const descrever = useDescricaoCuradoria()
  const [aberta, setAberta] = useState(false)
  const totalMarcacoes = (item.marcacoes ?? []).length
  const linhas = descrever(item)

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
        aria-label={t('etiquetaAria', { total: totalMarcacoes })}
        className={`flex items-center gap-1 rounded-full border bg-black/70 px-2 py-0.5 text-[11px] font-semibold backdrop-blur ${
          totalMarcacoes > 0
            ? 'border-amber-300/60 text-amber-200 hover:border-amber-300'
            : 'border-teal-300/50 text-teal-100 hover:border-teal-300'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7.5v.5" strokeLinecap="round" />
        </svg>
        {totalMarcacoes > 0 && <span>{totalMarcacoes}</span>}
      </button>

      {aberta && (
        <div
          role="tooltip"
          className="absolute right-0 top-full mt-1 max-h-[60vh] w-80 overflow-y-auto rounded-lg border border-teal-300/40 bg-base-surface/95 p-3 text-left shadow-2xl backdrop-blur-md"
        >
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-teal-200">
            {item.numero ? t('tituloImagem', { numero: item.numero }) : t('tituloCuradoria')}
          </p>
          {linhas.length === 0 ? (
            <p className="text-xs italic text-slate-400">{t('semDescricao')}</p>
          ) : (
            <dl className="space-y-1.5 text-xs">
              {linhas.map((l) => (
                <div key={l.rotulo}>
                  <dt className="font-semibold text-slate-400">{l.rotulo}</dt>
                  <dd className="whitespace-pre-line text-ink">{l.valor}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}
    </div>
  )
}
