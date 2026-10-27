'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ERROS_TECNICOS, type GrupoErro } from '../../lib/errosTecnicos'
import { normalizarBusca } from '../../lib/catalogoTermos'

/**
 * ERRO TECNICO na Pesquisa avancada (26/10/2026): TODOS os erros que a
 * Curadoria permite marcar, para assinalar (varios ao mesmo tempo - basta a
 * imagem ter qualquer um). Digitar as iniciais filtra a lista ("sub" ->
 * Subexposição; "cab" -> Rotação/Inclinação da cabeça).
 */
export default function FiltroErrosTecnicos({
  selecionados,
  onChange,
  estilo,
}: {
  selecionados: string[]
  onChange: (valores: string[]) => void
  estilo?: React.CSSProperties
}) {
  const t = useTranslations('Pesquisa')
  const [filtro, setFiltro] = useState('')
  const q = normalizarBusca(filtro)
  const visiveis = ERROS_TECNICOS.filter((e) => {
    if (!q) return true
    const chaves = [e.rotulo, ...e.formas].map(normalizarBusca)
    return q.split(' ').every((p) => chaves.some((c) => c.split(' ').some((w) => w.startsWith(p)) || c.includes(p)))
  })
  const grupos: GrupoErro[] = ['geral', 'panoramica', 'tomografia']

  function alternar(valor: string) {
    onChange(selecionados.includes(valor) ? selecionados.filter((v) => v !== valor) : [...selecionados, valor])
  }

  return (
    <div className="rounded-lg border p-2" style={estilo}>
      <div className="mb-1.5 flex items-center gap-2">
        <input
          type="search"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder={t('errosDigite')}
          aria-label={t('errosDigite')}
          maxLength={60}
          className="min-w-0 flex-1 rounded-md border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink outline-hidden focus:border-brand"
        />
        {selecionados.length > 0 && (
          <button type="button" onClick={() => onChange([])} className="text-[11px] text-slate-500 hover:text-red-500">
            {t('errosLimpar', { total: selecionados.length })}
          </button>
        )}
      </div>
      <div className="max-h-44 space-y-1.5 overflow-y-auto pr-1">
        {grupos.map((g) => {
          const itens = visiveis.filter((e) => e.grupo === g)
          if (!itens.length) return null
          return (
            <div key={g}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{t(`errosGrupo.${g}`)}</p>
              <div className="mt-0.5 grid grid-cols-1 gap-x-2 sm:grid-cols-2">
                {itens.map((e) => (
                  <label key={e.valor} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs text-ink hover:bg-brand/10">
                    <input type="checkbox" checked={selecionados.includes(e.valor)} onChange={() => alternar(e.valor)} className="accent-teal-600" />
                    {e.rotulo}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
        {!visiveis.length && <p className="text-xs text-slate-500">{t('errosNenhum')}</p>}
      </div>
    </div>
  )
}
