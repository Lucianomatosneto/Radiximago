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
import { useFichaCompacta } from './FichaCompacta'
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
  // no cartao da panoramica (altura fixa, sem rolar) a explicacao e a
  // legenda viram dica do titulo (aparecem no mouse)
  const compacta = useFichaCompacta()
  const legenda = SITUACOES.map((s) => `${s.sigla} = ${t(`situacoes.${s.valor}`)}`).join(' · ')
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
        className={`flex items-center justify-center rounded font-semibold transition-colors ${compacta ? 'gap-px py-0 leading-4' : 'flex-col py-0.5'} ${pequeno ? 'text-[9px]' : 'text-[10px]'} ${
          denteAberto === d ? 'ring-2 ring-amber-300' : ''
        } ${situacoes.length ? 'bg-teal-600 text-white' : 'bg-white/5 text-slate-300 hover:bg-white/15'}`}
      >
        <span>{d}</span>
        <span className={`text-[9px] text-amber-100 ${compacta ? 'leading-4' : 'min-h-3 leading-3'}`}>{situacoes.map((s) => SIGLA[s]).join('')}</span>
      </button>
    )
  }

  const linha = (lista: number[], pequeno = false) => (
    <div className={pequeno ? 'mx-auto grid w-[62.5%] grid-cols-10 gap-0.5' : 'grid grid-cols-16 gap-0.5'}>
      {lista.map((d) => dente(d, pequeno))}
    </div>
  )

  // situacoes do dente aberto: no cartao baixo ficam na linha do titulo, so
  // com a SIGLA (o nome inteiro fica na dica e no leitor de tela)
  const painelSituacao = denteAberto !== null && (
    <div
      role="group"
      aria-label={t('situacaoDoDente', { numero: denteAberto })}
      className={compacta ? 'flex flex-nowrap items-center gap-0.5' : 'mt-2 flex flex-wrap gap-1'}
    >
      {compacta && <span className="mr-1 text-[11px] text-amber-200">{t('dente', { numero: denteAberto })}:</span>}
      {SITUACOES.map(({ valor, sigla }) => {
        const marcada = (form.situacao_dentes[String(denteAberto)] ?? []).includes(valor)
        const nome = t(`situacoes.${valor}`)
        return (
          <button
            key={valor}
            type="button"
            aria-pressed={marcada}
            aria-label={compacta ? nome : undefined}
            title={compacta ? nome : undefined}
            onClick={() => onChange({ ...form, situacao_dentes: alternarSituacao(form.situacao_dentes, denteAberto, valor) })}
            className={`rounded-full border ${compacta ? 'px-1.5 py-0 font-mono text-[10px] leading-4' : 'px-2 py-0.5 text-[11px]'} ${
              marcada ? 'border-brand bg-brand text-white' : 'border-base-border text-slate-300 hover:border-brand/50'
            }`}
          >
            {compacta ? (
              sigla
            ) : (
              <>
                <span aria-hidden="true" className="mr-1 font-mono text-amber-200">{sigla}</span>
                {nome}
              </>
            )}
          </button>
        )
      })}
    </div>
  )

  return (
    <section aria-labelledby="titulo-odontograma" className={`rounded-xl border border-base-border bg-base-surface/60 ${compacta ? 'h-full px-2 py-1' : 'p-2.5'}`}>
      <div className={`flex items-center gap-2 ${compacta ? 'mb-0.5' : 'mb-1'}`}>
        <h3 id="titulo-odontograma" className={`shrink-0 font-semibold text-slate-300 ${compacta ? 'text-xs' : 'text-sm'}`} title={compacta ? `${t('odontogramaExplica')} ${legenda}` : undefined}>
          {t('odontograma')}
        </h3>
        {compacta && painelSituacao}
      </div>
      {!compacta && <p className="mb-1.5 text-[11px] text-slate-400">{t('odontogramaExplica')}</p>}
      <div className={`rounded-lg border border-teal-500/30 bg-teal-600/10 ${compacta ? 'space-y-px p-0.5' : 'space-y-1 p-1.5'}`}>
        {linha(PERMANENTES_SUPERIOR)}
        {deciduos && linha(DECIDUOS_SUPERIOR, true)}
        <div className="border-t border-white/10" />
        {deciduos && linha(DECIDUOS_INFERIOR, true)}
        {linha(PERMANENTES_INFERIOR)}
      </div>

      {!compacta && painelSituacao}

      {/* legenda das siglas */}
      {!compacta && (
        <p className="mt-1.5 text-[10px] leading-4 text-slate-400" aria-hidden="true">
          {legenda}
        </p>
      )}
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
  const compacta = useFichaCompacta()
  function alternar(valor: string) {
    const lista = form.estruturas_extradentais
    onChange({
      ...form,
      estruturas_extradentais: lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor],
    })
  }
  return (
    <fieldset className={`rounded-xl border border-base-border bg-base-surface/60 ${compacta ? 'h-full px-2 pb-1' : 'p-2.5'}`}>
      <legend className={`px-1 font-semibold text-slate-300 ${compacta ? 'text-xs' : 'text-sm'}`}>{t('estruturasTitulo')}</legend>
      <div className={compacta ? 'grid grid-cols-4 gap-x-2 gap-y-0' : 'grid grid-cols-1 gap-1 sm:grid-cols-2'}>
        {estruturas.map((valor) => (
          <label key={valor} className={`flex items-center gap-1.5 text-slate-300 ${compacta ? 'text-[11px] leading-4' : 'text-xs'}`}>
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
