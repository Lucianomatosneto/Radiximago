'use client'

import { useLocale, useTranslations } from 'next-intl'
import MiniaturaFila from '../MiniaturaFila'
import { useRotularValor } from './useItensFicha'
import { formatarData, type ItemFila } from './tipos'

const TAG_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US' }

/** Fila lateral: cada pedido com miniatura, achado, tipo, quem pediu e quando. */
export default function FilaSegundaOpiniao({
  itens,
  ativo,
  carregando,
  modo,
  onEscolher,
}: {
  itens: ItemFila[]
  ativo: number | null
  carregando: boolean
  modo: 'revisar' | 'devolvidas'
  onEscolher: (item: ItemFila) => void
}) {
  const t = useTranslations('SegundaOpiniao.fila')
  const tagLocale = TAG_LOCALE[useLocale()] ?? 'pt-BR'
  const rotular = useRotularValor()

  if (carregando) return <p className="p-4 text-sm text-slate-400">{t('carregando')}</p>
  if (itens.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 p-6 text-center">
        <span aria-hidden="true" className="text-3xl">
          {modo === 'revisar' ? '🗂️' : '📬'}
        </span>
        <p className="text-sm text-slate-400">{modo === 'revisar' ? t('vaziaRevisar') : t('vaziaDevolvidas')}</p>
      </div>
    )
  }
  return (
    <ul className="space-y-2 p-2">
      {itens.map((item) => {
        const escolhido = item.id === ativo
        const propria = modo === 'revisar' && item.pode_responder === false
        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onEscolher(item)}
              aria-current={escolhido}
              className={`flex w-full gap-3 rounded-xl border p-2 text-left transition ${
                escolhido
                  ? 'border-teal-400/70 bg-teal-400/10 ring-1 ring-teal-400/40'
                  : 'border-base-border bg-base-surface/60 hover:border-teal-400/40'
              }`}
            >
              <MiniaturaFila
                orthancReferenceId={item.orthanc_reference.id}
                alt={t('miniatura', { id: item.curation.id })}
                className="h-16 w-16 shrink-0 rounded-lg bg-black object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{rotular('achado_principal', item.curation.achado_principal)}</p>
                <p className="truncate text-xs text-slate-400">
                  {rotular('tipo_radiografia', item.curation.tipo_radiografia)} · #{item.curation.id}
                </p>
                {modo === 'revisar' ? (
                  <p className="mt-0.5 truncate text-xs text-violet-700 dark:text-violet-300">
                    {propria ? t('vocePediu') : t('pedidoPor', { nome: item.solicitante?.nome ?? '—' })}
                  </p>
                ) : (
                  <p className="mt-0.5 truncate text-xs text-violet-700 dark:text-violet-300">{t('revisadoPor', { nome: item.revisor?.nome ?? '—' })}</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                  <span>{formatarData(modo === 'revisar' ? item.criado_em : item.respondido_em, tagLocale)}</span>
                  {modo === 'devolvidas' && (item.anotacoes_pendentes ?? 0) > 0 && (
                    <span className="rounded-full bg-amber-400/15 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-200">
                      {t('anotacoesPendentes', { total: item.anotacoes_pendentes ?? 0 })}
                    </span>
                  )}
                  {propria && <span className="rounded-full bg-slate-500/20 px-1.5 py-0.5 text-slate-300">{t('soLeitura')}</span>}
                </div>
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
