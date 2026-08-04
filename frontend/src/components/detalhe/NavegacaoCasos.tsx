'use client'

import { useTranslations } from 'next-intl'

// Navegacao entre casos, reaproveitando a MESMA lista que a pagina ja
// busca em /search pra localizar a imagem atual - nao dispara nenhuma
// chamada nova. "Anterior"/"Proximo" andam pelo indice dessa lista; se
// no futuro os casos passarem a ser agrupados (ex.: "casos clinicos
// relacionados", mencionado no Sprint 7), a mesma logica de indice serve
// de base, so trocando a lista de origem.
export default function NavegacaoCasos({
  posicaoAtual,
  total,
  podeAnterior,
  podeProxima,
  onAnterior,
  onProxima,
  onVoltar,
}: {
  posicaoAtual: number | null
  total: number
  podeAnterior: boolean
  podeProxima: boolean
  onAnterior: () => void
  onProxima: () => void
  onVoltar: () => void
}) {
  const t = useTranslations('NavegacaoCasos')
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <button
        type="button"
        onClick={onVoltar}
        className="rounded-full border border-base-border px-4 py-1.5 text-sm text-slate-300 hover:border-brand hover:text-brand-300"
      >
        {t('voltarParaPesquisa')}
      </button>

      <div className="flex items-center gap-3">
        {posicaoAtual !== null && (
          <span className="text-sm text-slate-400">
            {t('casoXdeY', { atual: posicaoAtual, total })}
          </span>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onAnterior}
            disabled={!podeAnterior}
            className="rounded-full border border-base-border px-3.5 py-1.5 text-sm text-slate-300 hover:border-brand hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t('casoAnterior')}
          </button>
          <button
            type="button"
            onClick={onProxima}
            disabled={!podeProxima}
            className="rounded-full border border-base-border px-3.5 py-1.5 text-sm text-slate-300 hover:border-brand hover:text-brand-300 disabled:cursor-not-allowed disabled:opacity-30"
          >
            {t('proximoCaso')}
          </button>
        </div>
      </div>
    </div>
  )
}
