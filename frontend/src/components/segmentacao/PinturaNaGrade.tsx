'use client'

import { useCallback, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { listarSegmentacoes, type Segmentacao } from '../../lib/segmentacoes'

/**
 * Pintura das estruturas nas GRADES (Pesquisa avancada e Compartilhadas
 * comigo): o botao do pincel liga/desliga a pintura daquela imagem. As
 * mascaras so sao buscadas no primeiro clique (a lista da pesquisa traz so
 * a quantidade - total_segmentacoes), e ficam guardadas enquanto a tela
 * estiver aberta.
 */
export function usePinturaNaGrade() {
  const [visiveis, setVisiveis] = useState<number[]>([])
  const [dados, setDados] = useState<Record<number, Segmentacao[]>>({})
  const buscando = useRef(new Set<number>())

  const alternar = useCallback((curationId: number) => {
    setVisiveis((lista) => (lista.includes(curationId) ? lista.filter((x) => x !== curationId) : [...lista, curationId]))
    if (buscando.current.has(curationId)) return
    buscando.current.add(curationId)
    listarSegmentacoes(curationId)
      .then((itens) => setDados((d) => ({ ...d, [curationId]: itens })))
      .catch(() => buscando.current.delete(curationId))
  }, [])

  return {
    alternar,
    visivel: (curationId: number) => visiveis.includes(curationId),
    dados: (curationId: number) => dados[curationId] ?? [],
  }
}

export function BotaoPintura({ total, ligado, onAlternar }: { total: number; ligado: boolean; onAlternar: () => void }) {
  const t = useTranslations('Segmentacao')
  const rotulo = ligado ? t('esconderPintura', { total }) : t('mostrarPintura', { total })
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
      className={`flex items-center gap-0.5 rounded-full border bg-white/90 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm dark:bg-black/70 ${
        ligado
          ? 'border-sky-500 text-sky-800 ring-2 ring-sky-300/70 dark:border-sky-300 dark:text-sky-100'
          : 'border-sky-500/70 text-sky-800 hover:border-sky-500 dark:border-sky-300/60 dark:text-sky-200'
      }`}
    >
      {/* pincel */}
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18.4 3.6a2 2 0 0 1 2.8 2.8L12 15.6 9 13z" />
        <path d="M9 13c-2 0-4 1.5-4 4 0 1.5-1 2.5-2 3 3 1 7 0 8-3z" />
      </svg>
      {total}
    </button>
  )
}
