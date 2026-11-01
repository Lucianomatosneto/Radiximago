'use client'

import { TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

// AVISO DE SEGURANCA das pastas de pacientes (01/11/2026): fonte minima de
// 14px; fica perto das imagens/listas. `compacto` = versao menor e mais
// discreta (telas vazias), com a mesma fonte minima.
export default function AvisoNaoDiagnostico({ compacto = false }: { compacto?: boolean }) {
  const t = useTranslations('Casos')
  if (compacto) {
    return (
      <p role="note" className="flex items-start gap-1.5 text-[14px] leading-snug text-slate-500">
        <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
        {t('aviso')}
      </p>
    )
  }
  return (
    <p role="note" className="flex items-start gap-2 rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2.5 text-[14px] leading-relaxed text-amber-900 dark:text-amber-100">
      <TriangleAlert aria-hidden="true" className="mt-0.5 h-[18px] w-[18px] shrink-0" />
      {t('aviso')}
    </p>
  )
}
