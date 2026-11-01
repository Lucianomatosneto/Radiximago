'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import GradePastas, { type Selecao } from './GradePastas'
import { API, PERFIS_CADASTRO, PERFIS_EQUIPE, type ResumoCaso } from '../../lib/casos'
import { obterSessaoAtual } from '../../lib/sessao'

// Bloco "Pastas de pacientes" dentro de telas existentes:
// - modo "recebidas" (Compartilhadas comigo do professor/curador): pastas
//   enviadas a mim ou compartilhadas comigo, com selecao e "Ver estudos";
// - modo "minhas" (Minhas imagens do aluno): as pastas que eu enviei, com
//   o aviso "corrigida" quando o professor anotou.
// Some sozinho para quem nao tem pastas nem pode cadastrar.
export default function SecaoPastas({ modo }: { modo: 'recebidas' | 'minhas' }) {
  const t = useTranslations('Casos')
  const router = useRouter()
  const [casos, setCasos] = useState<ResumoCaso[] | null>(null)
  const [podeCadastrar, setPodeCadastrar] = useState(false)
  const [selecao, setSelecao] = useState<Selecao>(new Set())

  useEffect(() => {
    obterSessaoAtual().then(async (s) => {
      if (!s) return
      if (modo === 'recebidas' && !PERFIS_EQUIPE.includes(s.perfil)) return
      setPodeCadastrar(PERFIS_CADASTRO.includes(s.perfil))
      const r = await fetch(`${API}/casos/${modo === 'recebidas' ? 'recebidos' : 'minhas'}`, { credentials: 'include' })
      if (r.ok) setCasos((await r.json()).casos)
    })
  }, [modo])

  if (!casos || (casos.length === 0 && !(modo === 'minhas' && podeCadastrar))) return null

  return (
    <section className="mb-5 space-y-3 rounded-2xl border border-base-border bg-base-surface/60 p-3" aria-labelledby={`pastas-${modo}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`pastas-${modo}`} className="text-base font-semibold text-ink">
          {modo === 'recebidas' ? t('grade.recebidasTitulo', { n: casos.length }) : t('grade.minhasTitulo', { n: casos.length })}
        </h2>
        <div className="flex flex-wrap gap-2">
          {modo === 'recebidas' && (
            <button
              type="button"
              disabled={selecao.size === 0}
              onClick={() => router.push(`/casos/estudo?sel=${Array.from(selecao).join(',')}`)}
              className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {t('grade.verEstudos', { n: selecao.size })}
            </button>
          )}
          {modo === 'minhas' && podeCadastrar && (
            <Link href="/casos/novo" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">📷 {t('grade.novaPasta')}</Link>
          )}
        </div>
      </div>
      {modo === 'recebidas' && <p className="text-xs text-slate-500">{t('grade.ajudaRecebidas')}</p>}
      {casos.length === 0 ? (
        <p className="text-sm text-slate-500">{t('grade.nenhumaMinha')}</p>
      ) : (
        <GradePastas casos={casos} selecao={modo === 'recebidas' ? selecao : undefined} onSelecao={setSelecao} mostrarPaciente />
      )}
    </section>
  )
}
