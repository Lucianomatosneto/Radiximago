'use client'

// FILTRO POR TIPO DE RADIOGRAFIA (pedido do video, 22/11/2026): botoes
// Todos / Periapical / Interproximal / Oclusal / Panoramica / Tomografia,
// usados em Minhas imagens e em Compartilhadas comigo para as imagens nao
// ficarem todas misturadas. So escolhe; quem filtra e a tela.

import { useTranslations } from 'next-intl'

export const TIPOS_RADIOGRAFIA = ['periapical', 'interproximal', 'oclusal', 'panoramica', 'tomografia'] as const

export default function FiltroTipoRadiografia({ valor, aoMudar }: { valor: string | null; aoMudar: (tipo: string | null) => void }) {
  const t = useTranslations('FiltroTipo')
  const tTipos = useTranslations('Pesquisa.opcoes.tipoRadiografia')
  return (
    <div role="group" aria-label={t('rotulo')} className="mt-4 flex flex-wrap items-center gap-1.5">
      {[null, ...TIPOS_RADIOGRAFIA].map((tipo) => (
        <button
          key={tipo ?? 'todos'}
          type="button"
          aria-pressed={valor === tipo}
          onClick={() => aoMudar(tipo)}
          className={`rounded-full border px-3 py-1 text-xs transition ${
            valor === tipo ? 'border-brand bg-brand/15 font-semibold text-brand' : 'border-base-border text-ink-2 hover:border-brand hover:text-brand'
          }`}
        >
          {tipo ? tTipos(tipo) : t('todos')}
        </button>
      ))}
    </div>
  )
}
