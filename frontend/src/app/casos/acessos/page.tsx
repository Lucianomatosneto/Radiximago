'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import LayoutCasos from '../../../components/casos/LayoutCasos'
import { apiJson, dataHora } from '../../../lib/casos'

// REGISTRO DE ACESSOS das pastas de pacientes (administrador, curador e
// professor): quem abriu qual pasta, quando e o que fez. Sem o nome do
// paciente - a pasta e identificada pelo numero e pelo aluno autor.
interface Acesso {
  quando: string | null
  quem: string | null
  perfil: string | null
  acao: string
  resultado: string
  caso_id: number | null
  aluno_autor: string | null
  ip: string | null
}

function Tabela() {
  const t = useTranslations('Casos')
  const busca = useSearchParams()
  const [caso, setCaso] = useState(busca.get('caso') || '')
  const [linhas, setLinhas] = useState<Acesso[] | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    const q = /^\d+$/.test(caso) ? `?caso_id=${caso}` : ''
    apiJson<{ acessos: Acesso[] }>(`/casos/registro-acessos${q}`).then((d) => setLinhas(d.acessos)).catch((e) => setErro((e as Error).message))
  }, [caso])
  return (
    <>
      <input value={caso} onChange={(e) => setCaso(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder={t('acessos.filtrarPasta')} aria-label={t('acessos.filtrarPasta')} className="w-56 rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink" />
      {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-600" role="alert">{erro}</p>}
      <div className="overflow-x-auto rounded-2xl border border-base-border bg-base-surface">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-base-border text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">{t('acessos.quando')}</th>
              <th className="px-3 py-2">{t('acessos.quem')}</th>
              <th className="px-3 py-2">{t('acessos.oque')}</th>
              <th className="px-3 py-2">{t('acessos.pasta')}</th>
              <th className="px-3 py-2">{t('acessos.endereco')}</th>
            </tr>
          </thead>
          <tbody>
            {(linhas ?? []).map((a, i) => (
              <tr key={i} className={`border-b border-base-border/60 ${a.resultado === 'negado' ? 'bg-red-500/5' : ''}`}>
                <td className="whitespace-nowrap px-3 py-1.5 text-slate-500">{dataHora(a.quando)}</td>
                <td className="px-3 py-1.5 text-ink">{a.quem} <span className="text-xs text-slate-500">({a.perfil ? t(`perfis.${a.perfil}`) : '—'})</span></td>
                <td className="px-3 py-1.5 text-ink">{t(`acessos.acoes.${a.acao}`)}</td>
                <td className="px-3 py-1.5 text-ink">#{a.caso_id} · {a.aluno_autor}</td>
                <td className="px-3 py-1.5 text-xs text-slate-500">{a.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {linhas && linhas.length === 0 && <p className="p-6 text-center text-sm text-slate-500">{t('acessos.vazio')}</p>}
      </div>
    </>
  )
}

export default function AcessosPage() {
  const t = useTranslations('Casos')
  return (
    <LayoutCasos perfis={['administrador', 'curador', 'professor']} titulo={t('acessos.titulo')} subtitulo={t('acessos.subtitulo')} aviso={false}>
      {() => (
        <Suspense fallback={null}>
          <Tabela />
        </Suspense>
      )}
    </LayoutCasos>
  )
}
