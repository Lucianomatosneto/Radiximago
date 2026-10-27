'use client'

import { useRouter } from 'next/navigation'

/**
 * Botao "Inicio" das telas de trabalho sem barra lateral (Curadoria,
 * Segunda opiniao). Pedido de 27/10/2026: em TELA CHEIA o clique nao levava
 * a lugar nenhum - agora sai da tela cheia antes de ir para o inicio (a
 * tela inicial de cada perfil e decidida em /dashboard).
 */
export default function BotaoInicio({ rotulo }: { rotulo: string }) {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          if (document.fullscreenElement) await document.exitFullscreen()
        } catch {
          // segue mesmo assim
        }
        router.push('/dashboard')
      }}
      className="ml-1 inline-flex items-center gap-1.5 rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1.5 text-xs font-semibold text-teal-800 shadow-sm transition hover:border-teal-400 hover:bg-teal-500/20 dark:text-teal-100"
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 11l9-7 9 7" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </svg>
      {rotulo}
    </button>
  )
}
