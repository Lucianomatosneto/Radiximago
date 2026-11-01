'use client'

import { TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

// Aviso fixo em todas as telas das pastas de pacientes (especificacao,
// Etapa 2): o Radix organiza, nao diagnostica - validacao no filme fisico.
export default function AvisoNaoDiagnostico() {
  const t = useTranslations('Casos')
  return (
    <p role="note" className="rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-800 dark:text-amber-100">
      <TriangleAlert aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" /> {t('aviso')}
    </p>
  )
}
