'use client'

import { Clock } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { apiJson, data } from '../../lib/casos'

// AVISO PREVIO da eliminacao (02/11/2026, LGPD art. 15/16): a pasta e uma copia
// de trabalho e e apagada depois do prazo. Professor e curador veem aqui as que
// vencem nos proximos dias, para aproveitar antes (por exemplo, virar um caso
// didatico anonimizado). Some sozinho quando nao ha nenhuma.
type Resposta = {
  aviso_dias: number
  pastas: { id: number; paciente: string; vence_em: string; dias_restantes: number }[]
}

export default function AvisoPastasAVencer() {
  const t = useTranslations('Casos')
  const [info, setInfo] = useState<Resposta | null>(null)

  useEffect(() => {
    apiJson<Resposta>('/casos/a-vencer').then(setInfo).catch(() => setInfo(null))
  }, [])

  if (!info || info.pastas.length === 0) return null
  return (
    <section role="note" className="space-y-1 rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2.5 text-[14px] text-amber-900 dark:text-amber-100">
      <p className="flex items-start gap-2 font-semibold">
        <Clock aria-hidden="true" className="mt-0.5 h-[18px] w-[18px] shrink-0" />
        {t('aVencerTitulo', { n: info.pastas.length, dias: info.aviso_dias })}
      </p>
      <ul className="ml-7 list-disc space-y-0.5">
        {info.pastas.map((p) => (
          <li key={p.id}>
            <Link href={`/casos/${p.id}`} className="underline">{t('aVencerItem', { id: p.id, paciente: p.paciente })}</Link>
            {' · '}{data(p.vence_em)} ({t('aVencerDias', { n: p.dias_restantes })})
          </li>
        ))}
      </ul>
    </section>
  )
}
