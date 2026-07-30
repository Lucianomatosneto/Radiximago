'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import DashboardCard from '../../components/DashboardCard'
import StatusBadge from '../../components/StatusBadge'

interface StatsResponse {
  total_imagens_orthanc: number
  total_fichas_curadoria: number
  usuarios_ativos: number
  usuarios_bloqueados: number
  por_status: Record<string, number>
}

export default function DashboardPage() {
  const router = useRouter()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [carregando, setCarregando] = useState(true)

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

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-8">
          <h1 className="mb-6 text-xl font-semibold text-slate-100">Início</h1>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardCard label="Total de imagens" valor={stats.total_imagens_orthanc} cor="teal" />
            <DashboardCard label="Total de fichas" valor={stats.total_fichas_curadoria} cor="blue" />
            <DashboardCard label="Usuários ativos" valor={stats.usuarios_ativos} cor="green" />
            <DashboardCard label="Usuários bloqueados" valor={stats.usuarios_bloqueados} cor="red" />
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
