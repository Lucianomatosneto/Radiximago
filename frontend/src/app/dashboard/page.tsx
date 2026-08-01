'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import DashboardCard from '../../components/DashboardCard'
import StatusBadge from '../../components/StatusBadge'

interface AtividadeRecente {
  id: number
  tipo_radiografia: string | null
  curador_nome: string | null
  status: string
  data: string | null
}

interface StatsResponse {
  total_imagens_orthanc: number
  total_fichas_curadoria: number
  usuarios_ativos: number
  usuarios_bloqueados: number
  alunos_ativos: number
  aguardando_laudo: number
  divergencias_abertas: number
  atividade_recente: AtividadeRecente[]
  por_status: Record<string, number>
}

// Rotulos amigaveis - mesmos valores usados no restante do app
// (ver relatorios/page.tsx) para o tipo de radiografia da ficha.
const ROTULO_TIPO_RADIOGRAFIA: Record<string, string> = {
  periapical: 'Periapical',
  panoramica: 'Panorâmica',
  interproximal: 'Interproximal',
  oclusal: 'Oclusal',
}

function formatarData(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [nome, setNome] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      router.push('/login')
      return
    }

    // O dashboard com indicadores e exclusivo de administrador - os demais
    // perfis tem o banco de imagens como tela inicial (ver login/page.tsx).
    // Esse redirect cobre quem cai aqui por outro caminho (ex.: link
    // "Início" da barra lateral, ou o botao "voltar ao início" de telas
    // de erro/acesso negado).
    const perfil = localStorage.getItem('perfil')
    if (perfil !== 'administrador') {
      router.push('/banco-imagens')
      return
    }

    setNome(localStorage.getItem('nome') ?? '')

    async function buscarStats(tokenAtual: string) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/stats`, {
          headers: { Authorization: `Bearer ${tokenAtual}` },
        })

        if (!response.ok) {
          router.push('/login')
          return
        }

        const dados: StatsResponse = await response.json()
        setStats(dados)
        setCarregando(false)
      } catch {
        router.push('/login')
      }
    }

    buscarStats(token)
  }, [router])

  if (carregando || !stats) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">Carregando...</p>
      </main>
    )
  }

  const dataDeHoje = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-8">
          <h1 className="text-xl font-semibold text-slate-100">Visão geral</h1>
          <p className="mt-1 text-sm text-slate-400">
            {nome ? `Bem-vindo de volta, ${nome.split(' ')[0]}. ` : ''}
            Aqui está o resumo de hoje, {dataDeHoje}.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <DashboardCard label="Total de imagens" valor={stats.total_imagens_orthanc} cor="teal" />
            <DashboardCard label="Aguardando curadoria" valor={stats.aguardando_laudo} cor="amber" />
            <DashboardCard label="Aprovadas" valor={stats.por_status.aprovada ?? 0} cor="green" />
            <DashboardCard label="Aguardando segunda opinião" valor={stats.divergencias_abertas} cor="purple" />
            <DashboardCard label="Descartadas" valor={stats.por_status.descartada ?? 0} cor="red" />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <DashboardCard label="Usuários ativos" valor={stats.usuarios_ativos} cor="blue" />
          </div>

          {stats.aguardando_laudo > 0 && (
            <div className="mt-6 rounded-xl border border-amber-600/40 bg-amber-500/10 px-5 py-3.5 text-sm text-amber-200">
              <span className="font-semibold">{stats.aguardando_laudo}</span>{' '}
              {stats.aguardando_laudo === 1 ? 'imagem está aguardando' : 'imagens estão aguardando'} curadoria.{' '}
              <a href="/curadoria" className="font-medium underline underline-offset-2 hover:text-amber-100">
                Revisar agora
              </a>
            </div>
          )}

          <div className="mt-10 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-100">Atividade recente</h2>
            <a href="/curadoria" className="text-sm font-medium text-brand-300 hover:text-brand-hover">
              Ver tudo →
            </a>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-base-border bg-base-surface">
            {stats.atividade_recente.length === 0 ? (
              <p className="p-6 text-sm text-slate-400">Nenhuma atividade registrada ainda.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-base-border text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-medium">Exame</th>
                    <th className="px-5 py-3 font-medium">Curador</th>
                    <th className="px-5 py-3 font-medium">Data</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.atividade_recente.map((item) => (
                    <tr key={item.id} className="border-b border-base-border last:border-0">
                      <td className="px-5 py-3 text-slate-200">
                        {item.tipo_radiografia ? ROTULO_TIPO_RADIOGRAFIA[item.tipo_radiografia] ?? item.tipo_radiografia : '—'}
                      </td>
                      <td className="px-5 py-3 text-slate-400">{item.curador_nome ?? '—'}</td>
                      <td className="px-5 py-3 text-slate-400">{formatarData(item.data)}</td>
                      <td className="px-5 py-3">
                        <StatusBadge status={item.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <h2 className="mb-4 mt-10 text-lg font-semibold text-slate-100">Fichas por status</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(stats.por_status).map(([status, total]) => (
              <div
                key={status}
                className="rounded-xl border border-base-border bg-base-surface p-5 shadow-sm"
              >
                <StatusBadge status={status} />
                <p className="mt-3 text-3xl font-bold text-slate-100">{total}</p>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
