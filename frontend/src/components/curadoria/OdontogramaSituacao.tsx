'use client'

// ODONTOGRAMA DE SITUACAO (pedido do Luciano, 23/11/2026 - so panoramica):
// o curador clica no dente e escolhe como ele esta na imagem (ausente,
// incluso/impactado, carie, restaurado, tratamento endodontico, implante,
// protese, supranumerario). Um dente pode ter mais de uma situacao; a sigla
// aparece no proprio dente. Os deciduos (51-85) aparecem com denticao mista
// ou decidua. Gravado em situacao_dentes ({"16": ["restaurado"]}).

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FormularioFicha } from './FichaCuradoriaForm'
import {
  DECIDUOS_INFERIOR, DECIDUOS_SUPERIOR, PERMANENTES_INFERIOR, PERMANENTES_SUPERIOR, SITUACOES,
  alternarSituacao, mostraDeciduos,
} from '../../lib/situacaoDentaria'

const SIGLA = Object.fromEntries(SITUACOES.map((s) => [s.valor, s.sigla]))

export default function OdontogramaSituacao({
  form,
  onChange,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
}) {
  const t = useTranslations('SituacaoDentaria')
  const [aberto, setAberto] = useState<number | null>(null)
  const deciduos = mostraDeciduos(form.denticao)
  // dente aberto que deixou de aparecer (troca de denticao) fecha o painel
  const denteAberto = aberto !== null && (deciduos || aberto < 50) ? aberto : null

  const dente = (d: number, pequeno = false) => {
    const situacoes = form.situacao_dentes[String(d)] ?? []
    const nomes = situacoes.map((s) => t(`situacoes.${s}`)).join(', ')
    return (
      <button
        key={d}
        type="button"
        aria-label={situacoes.length ? `${t('dente', { numero: d })}: ${nomes}` : t('dente', { numero: d })}
        aria-expanded={denteAberto === d}
        title={nomes || undefined}
        onClick={() => setAberto(denteAberto === d ? null : d)}
        className={`flex flex-col items-center rounded py-0.5 font-semibold transition-colors ${pequeno ? 'text-[9px]' : 'text-[10px]'} ${
          denteAberto === d ? 'ring-2 ring-amber-300' : ''
        } ${situacoes.length ? 'bg-teal-600 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/15'}`}
      >
        <span>{d}</span>
        <span className="min-h-3 text-[9px] leading-3 text-amber-100">{situacoes.map((s) => SIGLA[s]).join('')}</span>
      </button>
    )
  }

  const linha = (lista: number[], pequeno = false) => (
    <div className={pequeno ? 'mx-auto grid w-[62.5%] grid-cols-10 gap-0.5' : 'grid grid-cols-16 gap-0.5'}>
      {lista.map((d) => dente(d, pequeno))}
    </div>
  )

  return (
    <section aria-labelledby="titulo-odontograma" className="rounded-xl border border-base-border bg-base-surface/60 p-2.5">
      <h3 id="titulo-odontograma" className="mb-1 text-sm font-semibold text-slate-300">
        {t('odontograma')}
      </h3>
      <p className="mb-1.5 text-[11px] text-slate-400">{t('odontogramaExplica')}</p>
      <div className="space-y-1 rounded-lg border border-teal-500/30 bg-teal-600/10 p-1.5">
        {linha(PERMANENTES_SUPERIOR)}
        {deciduos && linha(DECIDUOS_SUPERIOR, true)}
        <div className="border-t border-white/10" />
        {deciduos && linha(DECIDUOS_INFERIOR, true)}
        {linha(PERMANENTES_INFERIOR)}
      </div>

      {denteAberto !== null && (
        <div role="group" aria-label={t('situacaoDoDente', { numero: denteAberto })} className="mt-2 flex flex-wrap gap-1">
          {SITUACOES.map(({ valor, sigla }) => {
            const marcada = (form.situacao_dentes[String(denteAberto)] ?? []).includes(valor)
            return (
              <button
                key={valor}
                type="button"
                aria-pressed={marcada}
                onClick={() => onChange({ ...form, situacao_dentes: alternarSituacao(form.situacao_dentes, denteAberto, valor) })}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  marcada ? 'border-brand bg-brand text-white' : 'border-base-border text-slate-300 hover:border-brand/50'
                }`}
              >
                <span aria-hidden="true" className="mr-1 font-mono text-amber-200">{sigla}</span>
                {t(`situacoes.${valor}`)}
              </button>
            )
          })}
        </div>
      )}

      {/* legenda das siglas */}
      <p className="mt-1.5 text-[10px] leading-4 text-slate-400" aria-hidden="true">
        {SITUACOES.map((s) => `${s.sigla} = ${t(`situacoes.${s.valor}`)}`).join(' · ')}
      </p>
    </section>
  )
}

/** ESTRUTURAS E ACHADOS FORA DOS DENTES (so panoramica) - caixas de marcar. */
export function EstruturasExtradentais({
  form,
  onChange,
  estruturas,
}: {
  form: FormularioFicha
  onChange: (form: FormularioFicha) => void
  estruturas: readonly string[]
}) {
  const t = useTranslations('SituacaoDentaria')
  function alternar(valor: string) {
    const lista = form.estruturas_extradentais
    onChange({
      ...form,
      estruturas_extradentais: lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor],
    })
  }
  return (
    <fieldset className="rounded-xl border border-base-border bg-base-surface/60 p-2.5">
      <legend className="px-1 text-sm font-semibold text-slate-300">{t('estruturasTitulo')}</legend>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {estruturas.map((valor) => (
          <label key={valor} className="flex items-center gap-1.5 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={form.estruturas_extradentais.includes(valor)}
              onChange={() => alternar(valor)}
              className="h-4 w-4 rounded-sm border-base-border bg-base-surface2 text-brand"
            />
            {t(`estruturas.${valor}`)}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
