'use client'

import { useTranslations } from 'next-intl'

/**
 * Icone do HOLOFOTE nos cartoes das grades (Pesquisa e Compartilhadas
 * comigo), ao lado dos icones de marcacoes, "i" e lupa. Ligado, escurece a
 * imagem fora das marcacoes do curador (e fora da marcacao sob o mouse).
 * So aparece quando as marcacoes estao a mostra na imagem.
 */
export default function BotaoHolofote({ ligado, onAlternar }: { ligado: boolean; onAlternar: () => void }) {
  const t = useTranslations('Visualizador.marcacoes')
  const rotulo = ligado ? t('holofoteDesligar') : t('holofoteLigar')
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onAlternar()
      }}
      aria-pressed={ligado}
      title={rotulo}
      aria-label={rotulo}
      className={`flex items-center rounded-full border bg-white/90 px-1.5 py-0.5 backdrop-blur-sm dark:bg-black/70 ${
        ligado
          ? 'border-amber-500 text-amber-800 ring-2 ring-amber-300/70 dark:border-amber-300 dark:text-amber-100'
          : 'border-amber-500/70 text-amber-800 hover:border-amber-500 dark:border-amber-300/60 dark:text-amber-200 dark:hover:border-amber-300'
      }`}
    >
      {/* lanterna com facho de luz */}
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill={ligado ? 'currentColor' : 'none'} />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
      </svg>
    </button>
  )
}
