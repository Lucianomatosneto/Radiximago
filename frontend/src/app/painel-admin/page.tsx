'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import DashboardCard from '../../components/DashboardCard'
import {
  CORES_STATUS,
  LABELS_STATUS,
  ResultadoChecagem,
  checarHealthEndpoint,
} from '../../lib/healthCheck'

const PERFIS_PERMITIDOS = ['administrador']

const ATALHOS_GESTAO = [
  { label: 'Usuários', href: '/usuarios' },
  { label: 'Imagens recebidas', href: '/imagens' },
  { label: 'Curadoria', href: '/curadoria' },
  { label: 'Relatórios', href: '/relatorios' },
  { label: 'Auditoria', href: '/auditoria' },
  { label: 'Integrações', href: '/integracoes' },
]

interface StatsResponse {
  total_imagens_orthanc: number
  usuarios_ativos: number
  por_status: Record<string, number>
}

interface AlertaLogin {
  id: number
  criado_em: string | null
  detalhes: string | null
}

function formatarData(valor: string | null): string {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleString('pt-BR')
}

async function extrairErro(response: Response, generica: string): Promise<string> {
  try {
    const dados = await response.json()
    if (typeof dados?.detail === 'string') return dados.detail
  } catch {
    // resposta sem corpo JSON legivel
  }
  return generica
}

export default function PainelAdminPage() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [banco, setBanco] = useState<ResultadoChecagem>({
    status: 'offline',
    descricao: 'Verificando...',
  })
  const [orthanc, setOrthanc] = useState<ResultadoChecagem>({
    status: 'offline',
    descricao: 'Verificando...',
  })

  const [totalAlertas, setTotalAlertas] = useState(0)
  const [alertas, setAlertas] = useState<AlertaLogin[]>([])

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      router.push('/login')
      return
    }

    const perfil = localStorage.getItem('perfil')
    if (!perfil || !PERFIS_PERMITIDOS.includes(perfil)) {
      router.push('/acesso-negado')
      return
    }

    carregarDados(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregarDados(token: string) {
    setCarregando(true)
    setErro('')
    try {
      const [respostaStats, resultadoBanco, resultadoOrthanc, respostaAlertas] =
        await Promise.all([
          fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/stats`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          checarHealthEndpoint(`${process.env.NEXT_PUBLIC_API_URL}/health/database`, 'database'),
          checarHealthEndpoint(`${process.env.NEXT_PUBLIC_API_URL}/health/orthanc`, 'orthanc'),
          fetch(
            `${process.env.NEXT_PUBLIC_API_URL}/admin/audit-logs?acao=falha_login&resultado=negado&limit=5`,
            { headers: { Authorization: `Bearer ${token}` } }
          ),
        ])

      if (respostaStats.status === 401 || respostaAlertas.status === 401) {
        router.push('/login')
        return
      }

      if (!respostaStats.ok) {
        setErro(await extrairErro(respostaStats, 'Não foi possível carregar os indicadores.'))
        return
      }
      const dadosStats: StatsResponse = await respostaStats.json()
      setStats(dadosStats)

      setBanco(resultadoBanco)
      setOrthanc(resultadoOrthanc)

      if (respostaAlertas.ok) {
        const dadosAlertas = await respostaAlertas.json()
        setTotalAlertas(dadosAlertas.total ?? 0)
        setAlertas(dadosAlertas.itens ?? [])
      }
    } catch {
      setErro('Não foi possível carregar o painel.')
    } finally {
      setCarregando(false)
    }
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-300">Carregando...</p>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="mb-6 text-xl font-semibold text-slate-100">Painel administrativo</h1>

          {erro && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          {stats && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              <DashboardCard
                label="Total de imagens"
                valor={stats.total_imagens_orthanc}
                cor="teal"
              />
              <DashboardCard
                label="Aguardando curadoria"
                valor={stats.por_status.pendente ?? 0}
                cor="amber"
              />
              <DashboardCard
                label="Em análise"
                valor={stats.por_status.em_analise ?? 0}
                cor="blue"
              />
              <DashboardCard
                label="Curadas e liberadas"
                valor={stats.por_status.aprovada ?? 0}
                cor="green"
              />
              <DashboardCard
                label="Descartadas"
                valor={stats.por_status.descartada ?? 0}
                cor="red"
              />
              <DashboardCard label="Usuários ativos" valor={stats.usuarios_ativos} cor="purple" />
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-200">Atalhos de gestão</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {ATALHOS_GESTAO.map((atalho) => (
                  <Link
                    key={atalho.href}
                    href={atalho.href}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-4 text-center text-sm font-medium text-slate-200 transition-colors hover:border-teal-500 hover:text-teal-300"
                  >
                    {atalho.label}
                  </Link>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-4 text-sm font-semibold text-slate-200">Status dos serviços</h2>
              <div className="space-y-2">
                <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2">
                  <span className="text-sm text-slate-300">PostgreSQL</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CORES_STATUS[banco.status]}`}
                  >
                    {LABELS_STATUS[banco.status]}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2">
                  <span className="text-sm text-slate-300">Orthanc</span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CORES_STATUS[orthanc.status]}`}
                  >
                    {LABELS_STATUS[orthanc.status]}
                  </span>
                </div>
              </div>
              <Link
                href="/integracoes"
                className="mt-4 inline-block text-sm text-teal-400 hover:text-teal-300"
              >
                Ver todos os serviços →
              </Link>
            </section>
          </div>

          <section className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="mb-4 text-sm font-semibold text-slate-200">Alertas de segurança</h2>

            {totalAlertas === 0 ? (
              <p className="text-sm text-emerald-400">Nenhum alerta de segurança recente</p>
            ) : (
              <>
                <p className="text-sm text-slate-300">
                  {totalAlertas} {totalAlertas === 1 ? 'tentativa' : 'tentativas'} de login{' '}
                  {totalAlertas === 1 ? 'falha' : 'falhas'} recente
                  {totalAlertas === 1 ? '' : 's'}
                </p>
                <ul className="mt-3 space-y-1.5">
                  {alertas.map((alerta) => (
                    <li key={alerta.id} className="text-xs text-slate-500">
                      {formatarData(alerta.criado_em)} — {alerta.detalhes || 'Sem detalhes.'}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <Link
              href="/auditoria"
              className="mt-4 inline-block text-sm text-teal-400 hover:text-teal-300"
            >
              Ver auditoria completa →
            </Link>
          </section>
        </main>
      </div>
    </div>
  )
}
