'use client'

import { GraduationCap, Printer } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import AvisoNaoDiagnostico from '../../../components/casos/AvisoNaoDiagnostico'
import LayoutCasos from '../../../components/casos/LayoutCasos'
import { apiJson, dataHora } from '../../../lib/casos'

// ALUNOS E PACIENTES EM TRATAMENTO (professor e curador): quem esta tratando
// quem, com busca pelo nome do ALUNO ou do PACIENTE para rastrear o caso.
interface Linha {
  id: number
  aluno: string | null
  paciente: string
  contato: string
  tratamento: string | null
  encaminhado_por: string | null
  encaminhado_em: string | null
  situacao: string
  concluido_em: string | null
}

function Tabela() {
  const t = useTranslations('Casos')
  const [busca, setBusca] = useState('')
  const [situacao, setSituacao] = useState('')
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    const q = new URLSearchParams()
    if (busca.trim()) q.set('busca', busca.trim())
    if (situacao) q.set('situacao', situacao)
    try {
      setLinhas((await apiJson<{ tratamentos: Linha[] }>(`/casos/tratamentos?${q}`)).tratamentos)
    } catch (e) {
      setErro((e as Error).message)
    }
  }, [busca, situacao])

  useEffect(() => {
    const id = setTimeout(carregar, 250)
    return () => clearTimeout(id)
  }, [carregar])

  const porAluno = new Map<string, Linha[]>()
  for (const l of linhas ?? []) porAluno.set(l.aluno ?? '—', [...(porAluno.get(l.aluno ?? '—') ?? []), l])

  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} maxLength={100} placeholder={t('tratamentosLista.buscar')} aria-label={t('tratamentosLista.buscar')} className="min-w-[260px] flex-1 rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink" />
        <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className="rounded-lg border border-base-border bg-base-surface2 px-2 py-2 text-sm text-ink" aria-label={t('tratamentosLista.situacao')}>
          <option value="">{t('tratamentosLista.todas')}</option>
          <option value="em_tratamento">{t('etapas.em_tratamento')}</option>
          <option value="concluido">{t('etapas.concluido')}</option>
        </select>
        <button type="button" onClick={() => window.print()} className="rounded-lg border border-base-border px-3 py-2 text-sm text-ink"><Printer aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{t('acoes.imprimir')}</button>
      </div>
      {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">{erro}</p>}
      {linhas && linhas.length > 0 && <AvisoNaoDiagnostico />}
      {linhas && linhas.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{t('tratamentosLista.vazio')}</p>}
      {Array.from(porAluno.entries()).map(([aluno, lista]) => (
        <section key={aluno} className="rounded-2xl border border-base-border bg-base-surface p-3">
          <h2 className="mb-2 text-sm font-semibold text-ink"><GraduationCap aria-hidden="true" className="mr-1 inline h-4 w-4 align-[-2px]" />{aluno} <span className="font-normal text-slate-500">({lista.length})</span></h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-base-border text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-1.5">{t('tratamentosLista.paciente')}</th>
                  <th className="px-2 py-1.5">{t('novo.contato')}</th>
                  <th className="px-2 py-1.5">{t('tratamentosLista.tratamento')}</th>
                  <th className="px-2 py-1.5">{t('tratamentosLista.encaminhadoPor')}</th>
                  <th className="px-2 py-1.5">{t('tratamentosLista.situacao')}</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((l) => (
                  <tr key={l.id} className="border-b border-base-border/60">
                    <td className="px-2 py-1.5"><Link href={`/casos/${l.id}`} className="font-medium text-brand hover:underline">{l.paciente}</Link></td>
                    <td className="px-2 py-1.5 text-ink">{l.contato}</td>
                    <td className="px-2 py-1.5 text-ink">{l.tratamento ? t(`tratamentos.${l.tratamento}`) : '—'}</td>
                    <td className="px-2 py-1.5 text-slate-500">{l.encaminhado_por} · {dataHora(l.encaminhado_em)}</td>
                    <td className="px-2 py-1.5 text-ink">{t(`etapas.${l.situacao}`)}{l.concluido_em ? ` · ${dataHora(l.concluido_em)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  )
}

export default function TratamentosPage() {
  const t = useTranslations('Casos')
  return (
    <LayoutCasos perfis={['professor', 'curador']} titulo={t('tratamentosLista.titulo')} subtitulo={t('tratamentosLista.subtitulo')}>
      {() => <Tabela />}
    </LayoutCasos>
  )
}
