'use client'

import { ReactNode, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import DashboardCard from '../../components/DashboardCard'
import StatusBadge from '../../components/StatusBadge'

const PERFIS_PERMITIDOS = ['administrador', 'curador']

const OPCOES_TIPO_RADIOGRAFIA = [
  { valor: 'periapical', label: 'Periapical' },
  { valor: 'panoramica', label: 'Panorâmica' },
  { valor: 'interproximal', label: 'Interproximal' },
  { valor: 'oclusal', label: 'Oclusal' },
]

const OPCOES_ACHADO_PRINCIPAL = [
  { valor: 'normal', label: 'Normal' },
  { valor: 'carie', label: 'Cárie' },
  { valor: 'lesao_periapical', label: 'Lesão periapical' },
  { valor: 'perda_ossea', label: 'Perda óssea' },
  { valor: 'dente_incluso', label: 'Dente incluso' },
  { valor: 'tratamento_endodontico', label: 'Tratamento endodôntico' },
  { valor: 'erro_tecnico', label: 'Erro técnico' },
  { valor: 'outro', label: 'Outro' },
]

const OPCOES_DIFICULDADE = [
  { valor: 'basico', label: 'Básico' },
  { valor: 'intermediario', label: 'Intermediário' },
  { valor: 'avancado', label: 'Avançado' },
]

const OPCOES_QUALIDADE_TECNICA = [
  { valor: 'otima', label: 'Ótima' },
  { valor: 'boa', label: 'Boa' },
  { valor: 'regular', label: 'Regular' },
  { valor: 'insatisfatoria', label: 'Insatisfatória' },
]

interface StatsResponse {
  total_imagens_orthanc: number
  total_fichas_curadoria: number
  usuarios_ativos: number
  usuarios_bloqueados: number
  por_status: Record<string, number>
  por_tipo_radiografia: Record<string, number>
  por_achado_principal: Record<string, number>
  por_dificuldade: Record<string, number>
  por_qualidade_tecnica: Record<string, number>
  por_curador: Record<string, number>
}

interface Usuario {
  id: number
  nome: string
}

function rotular(opcoes: { valor: string; label: string }[], chave: string): string {
  if (chave === 'nao_informado') return 'Não informado'
  return opcoes.find((o) => o.valor === chave)?.label ?? chave
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

function TabelaProporcao({
  titulo,
  dados,
  renderRotulo,
}: {
  titulo: string
  dados: Record<string, number>
  renderRotulo: (chave: string) => ReactNode
}) {
  const entradas = Object.entries(dados).sort((a, b) => b[1] - a[1])
  const total = entradas.reduce((soma, [, valor]) => soma + valor, 0)

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-200">{titulo}</h2>
      {entradas.length === 0 ? (
        <p className="text-sm text-slate-500">Sem dados.</p>
      ) : (
        <div className="space-y-3">
          {entradas.map(([chave, valor]) => {
            const porcentagem = total > 0 ? Math.round((valor / total) * 100) : 0
            return (
              <div key={chave}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-400">
                  <span>{renderRotulo(chave)}</span>
                  <span>
                    {valor} ({porcentagem}%)
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-teal-500"
                    style={{ width: `${porcentagem}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function RelatoriosPage() {
  const router = useRouter()
  const [carregando, setCarregando] = useState(true)

  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [mapaCuradores, setMapaCuradores] = useState<Record<number, string>>({})
  const [erro, setErro] = useState('')

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
      const [respostaStats, respostaUsuarios] = await Promise.all([
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      if (respostaStats.status === 401 || respostaUsuarios.status === 401) {
        router.push('/login')
        return
      }

      if (!respostaStats.ok) {
        setErro(await extrairErro(respostaStats, 'Não foi possível carregar os indicadores.'))
        return
      }
      const dadosStats: StatsResponse = await respostaStats.json()
      setStats(dadosStats)

      if (respostaUsuarios.ok) {
        const usuarios: Usuario[] = await respostaUsuarios.json()
        const mapa: Record<number, string> = {}
        for (const usuario of usuarios) mapa[usuario.id] = usuario.nome
        setMapaCuradores(mapa)
      }
      // Se /users/ falhar por qualquer motivo, os relatorios continuam de pe -
      // so o nome do curador cai no fallback "Usuario #<id>" abaixo.
    } catch {
      setErro('Não foi possível carregar os indicadores.')
    } finally {
      setCarregando(false)
    }
  }

  function rotularCurador(chave: string): string {
    if (chave === 'nao_informado') return 'Sem curador atribuído'
    const id = Number(chave)
    return mapaCuradores[id] ?? `Usuário #${chave}`
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
          <h1 className="mb-6 text-xl font-semibold text-slate-100">Relatórios e indicadores</h1>

          {erro && (
            <p className="mb-4 text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          {stats && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <DashboardCard label="Total de imagens" valor={stats.total_imagens_orthanc} cor="teal" />
                <DashboardCard label="Total de fichas" valor={stats.total_fichas_curadoria} cor="blue" />
                <DashboardCard label="Usuários ativos" valor={stats.usuarios_ativos} cor="green" />
                <DashboardCard label="Usuários bloqueados" valor={stats.usuarios_bloqueados} cor="red" />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <TabelaProporcao
                  titulo="Fichas por status"
                  dados={stats.por_status}
                  renderRotulo={(chave) => <StatusBadge status={chave} />}
                />
                <TabelaProporcao
                  titulo="Fichas por tipo de radiografia"
                  dados={stats.por_tipo_radiografia}
                  renderRotulo={(chave) => rotular(OPCOES_TIPO_RADIOGRAFIA, chave)}
                />
                <TabelaProporcao
                  titulo="Fichas por achado principal"
                  dados={stats.por_achado_principal}
                  renderRotulo={(chave) => rotular(OPCOES_ACHADO_PRINCIPAL, chave)}
                />
                <TabelaProporcao
                  titulo="Fichas por dificuldade"
                  dados={stats.por_dificuldade}
                  renderRotulo={(chave) => rotular(OPCOES_DIFICULDADE, chave)}
                />
                <TabelaProporcao
                  titulo="Fichas por qualidade técnica"
                  dados={stats.por_qualidade_tecnica}
                  renderRotulo={(chave) => rotular(OPCOES_QUALIDADE_TECNICA, chave)}
                />
                <TabelaProporcao
                  titulo="Fichas por curador"
                  dados={stats.por_curador}
                  renderRotulo={rotularCurador}
                />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  )
}
