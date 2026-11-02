'use client'

import { Phone } from 'lucide-react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import AvisoNaoDiagnostico from './AvisoNaoDiagnostico'
import { useTranslations } from 'next-intl'
import { COR_ETAPA, data, urlFoto, type ResumoCaso } from '../../lib/casos'

// Lista de pacientes (fila de tratamento e "meus pacientes em tratamento"):
// miniatura, dados importantes do paciente, CONTATO e tratamento.
export default function ListaPacientes({ casos, vazio }: { casos: ResumoCaso[]; vazio: ReactNode }) {
  const t = useTranslations('Casos')
  if (!casos.length) return <>{vazio}</>
  return (
    <>
    <AvisoNaoDiagnostico />
    <ul className="space-y-2">
      {casos.map((c) => {
        // supervisao do administrador: o servidor ja manda sem dados do paciente (idade nula)
        const supervisao = c.paciente.idade === null
        return (
        <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-base-border bg-base-surface p-3 sm:flex-row sm:items-center">
          <div className="flex gap-1">
            {c.imagens.slice(0, 3).map((img) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={img.id} src={urlFoto(c.id, img.id, { miniatura: true })} alt="" className="h-20 w-20 rounded-lg bg-black object-cover" loading="lazy" />
            ))}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-ink">{c.paciente.nome}</p>
            {!supervisao && (
              <p className="text-slate-500">
                {c.paciente.idade} {t('anos')} · {t(`generos.${c.paciente.genero}`)} · <Phone aria-hidden="true" className="inline h-3.5 w-3.5 align-[-2px]" /> <span className="text-ink">{c.paciente.contato}</span>
              </p>
            )}
            <p className="text-slate-500">
              {t(`modalidades.${c.modalidade}`)} · {t('alunoX', { aluno: c.aluno ?? '' })}
              {c.na_fila_desde && ` · ${t('naFilaDesde', { data: data(c.na_fila_desde) })}`}
            </p>
            {c.tratamentos.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-1">
                {c.tratamentos.map((x) => <span key={x} className="rounded-full border border-violet-400/50 bg-violet-500/10 px-2 text-xs text-violet-700 dark:text-violet-200">{t(`tratamentos.${x}`)}</span>)}
              </p>
            )}
            {c.tratamento_escolhido && <p className="text-xs text-ink">{t('tratamentoEscolhido')}: {t(`tratamentos.${c.tratamento_escolhido}`)}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${COR_ETAPA[c.etapa]}`}>{t(`etapas.${c.etapa}`)}</span>
            <Link href={`/casos/${c.id}`} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white print:hidden">{supervisao ? t('abrirComMotivo') : t('abrir')}</Link>
          </div>
        </li>
        )
      })}
    </ul>
    </>
  )
}
