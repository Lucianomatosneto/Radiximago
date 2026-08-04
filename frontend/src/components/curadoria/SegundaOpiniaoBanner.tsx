'use client'

import { useLocale, useTranslations } from 'next-intl'

export interface ReviewInfo {
  solicitante_id: number
  motivo: string
  observacoes: string | null
  criado_em: string | null
}

const TAG_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US' }

function formatarData(valor: string | null, tagLocale: string): string {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleString(tagLocale)
}

// So aparece quando a ficha em edicao esta com status "segunda_opiniao" -
// hoje isso nao acontece dentro do fluxo da Curadoria (a fila de
// /curation/pending so lista imagens sem ficha, e uma ficha em segunda
// opiniao ja tem ficha), mas o componente fica pronto caso a Curadoria 2.0
// unifique as filas. Os dados (quem solicitou, data, observacoes) vem do
// endpoint ja existente GET /curation/{id}/reviews.
export default function SegundaOpiniaoBanner({ review }: { review: ReviewInfo | null }) {
  const t = useTranslations('Curadoria.segundaOpiniaoBanner')
  const locale = useLocale()
  const tagLocale = TAG_LOCALE[locale] ?? 'pt-BR'

  if (!review) return null

  return (
    <div className="border-b border-purple-800/40 bg-purple-950/30 px-4 py-3 text-sm">
      <p className="font-semibold text-purple-300">{t('titulo')}</p>
      <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-purple-200/80 sm:grid-cols-3">
        <div>
          <dt className="text-purple-300/60">{t('solicitadoPor')}</dt>
          <dd>{t('usuarioNumero', { id: review.solicitante_id })}</dd>
        </div>
        <div>
          <dt className="text-purple-300/60">{t('data')}</dt>
          <dd>{formatarData(review.criado_em, tagLocale)}</dd>
        </div>
        <div className="sm:col-span-1">
          <dt className="text-purple-300/60">{t('observacoes')}</dt>
          <dd>{review.observacoes || review.motivo || '—'}</dd>
        </div>
      </dl>
    </div>
  )
}
