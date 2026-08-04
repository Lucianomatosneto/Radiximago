'use client'

import { useTranslations } from 'next-intl'
import MiniaturaImagem from '../MiniaturaImagem'

export interface ItemEstudo {
  curation_id: number
  descricao_didatica: string | null
  tipo_radiografia: string | null
}

// Coluna com os exames encontrados na pesquisa, um abaixo do outro, com
// miniatura e rolagem propria - clicar num item abre aquele exame sem
// precisar voltar pra Pesquisa. Complementa (nao substitui) os botoes
// "Caso anterior / Proximo caso" que ja existiam.
export default function ColunaEstudos({
  itens,
  indiceAtual,
  onSelecionar,
  carregando,
}: {
  itens: ItemEstudo[]
  indiceAtual: number
  onSelecionar: (indice: number) => void
  carregando: boolean
}) {
  const t = useTranslations('ColunaEstudos')
  const tVisualizador = useTranslations('Visualizador')
  return (
    <section className="flex w-full flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface lg:w-[220px] lg:shrink-0">
      <div className="border-b border-base-border px-3 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink">{t('titulo')}</h2>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-2">
        {carregando ? (
          <p className="p-2 text-xs text-slate-500">{t('carregando')}</p>
        ) : itens.length === 0 ? (
          <p className="p-2 text-xs text-slate-500">{t('nenhumEncontrado')}</p>
        ) : (
          <ul className="space-y-1.5">
            {itens.map((item, indice) => (
              <li key={item.curation_id}>
                <button
                  type="button"
                  onClick={() => onSelecionar(indice)}
                  className={`flex w-full items-center gap-2.5 rounded-xl border px-2 py-2 text-left text-xs transition-colors ${
                    indice === indiceAtual
                      ? 'border-brand/60 bg-brand/10'
                      : 'border-transparent hover:border-brand/40 hover:bg-brand/5'
                  }`}
                >
                  <MiniaturaImagem
                    curationId={item.curation_id}
                    alt={item.descricao_didatica ?? tVisualizador('imagemNumero', { numero: indice + 1 })}
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-base-surface2"
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-200">#{indice + 1}</p>
                    <p className="truncate text-slate-500">{item.tipo_radiografia ?? '—'}</p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
