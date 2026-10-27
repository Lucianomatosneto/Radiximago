'use client'

import { useLocale, useTranslations } from 'next-intl'
import { formatarData, iniciais, type Pessoa } from './tipos'

const TAG_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US' }

/** Quem pediu a segunda opiniao, quando, por que e o que achava (primeiro parecer). */
export default function CartaoPedido({
  solicitante,
  curadorDaFicha,
  criadoEm,
  motivo,
  primeiroParecer,
  fichaId,
}: {
  solicitante: Pessoa | null | undefined
  curadorDaFicha?: Pessoa | null
  criadoEm: string | null
  motivo: string
  primeiroParecer: string | null
  fichaId: number
}) {
  const t = useTranslations('SegundaOpiniao.pedido')
  const tagLocale = TAG_LOCALE[useLocale()] ?? 'pt-BR'
  return (
    <section className="rounded-xl border border-violet-400/30 bg-violet-500/5 p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/20 text-sm font-bold text-violet-700 dark:text-violet-200 ring-1 ring-violet-400/40"
        >
          {iniciais(solicitante?.nome)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">{t('titulo')}</p>
          <p className="truncate text-sm font-semibold text-ink">{solicitante?.nome ?? t('semNome')}</p>
          <p className="text-xs text-slate-400">
            {t('quando', { data: formatarData(criadoEm, tagLocale) })} · {t('ficha', { id: fichaId })}
            {curadorDaFicha && curadorDaFicha.id !== solicitante?.id && <> · {t('curadorDaFicha', { nome: curadorDaFicha.nome ?? '—' })}</>}
          </p>
        </div>
      </div>
      <dl className="mt-3 space-y-2 text-sm">
        <div>
          <dt className="text-xs font-medium text-slate-400">{t('motivo')}</dt>
          <dd className="mt-0.5 border-l-2 border-violet-400/50 pl-2.5 text-slate-200">{motivo}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-slate-400">{t('primeiroParecer')}</dt>
          <dd className={`mt-0.5 border-l-2 border-slate-500/50 pl-2.5 ${primeiroParecer ? 'text-slate-200' : 'italic text-slate-500'}`}>
            {primeiroParecer || t('semPrimeiroParecer')}
          </dd>
        </div>
      </dl>
    </section>
  )
}
