'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import StatusBadge from '../../components/StatusBadge'

const OPCOES_ANONIMIZACAO = [
  { valor: 'aguardando', label: 'Aguardando' },
  { valor: 'validada', label: 'Validada' },
  { valor: 'falha', label: 'Falha' },
]

const OPCOES_CURADORIA = [
  { valor: 'pendente', label: 'Pendente' },
  { valor: 'em_analise', label: 'Em análise' },
  { valor: 'aprovada', label: 'Aprovada' },
  { valor: 'segunda_opiniao', label: 'Segunda opinião' },
  { valor: 'baixa_qualidade', label: 'Baixa qualidade' },
  { valor: 'descartada', label: 'Descartada' },
  { valor: 'sem_ficha', label: 'Sem ficha' },
]

const CLASSES_ANONIMIZACAO: Record<string, string> = {
  aguardando: 'bg-slate-500/15 text-slate-300 border-slate-600/40',
  validada: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40',
  falha: 'bg-red-500/15 text-red-300 border-red-600/40',
}

const CLASSE_SEM_FICHA = 'bg-slate-500/15 text-slate-300 border-slate-600/40'

interface Imagem {
  id: number
  orthanc_id: string
  resource_type: string
  anonimizacao_status: string
  criado_em?: string
  status_curadoria: string | null
}

function truncarOrthancId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}...` : id
}

function formatarData(valor: string | undefined): string {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleDateString('pt-BR')
}

export default function ImagensPage() {
  const router = useRouter()
  const [imagens, setImagens] = useState<Imagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroAnonimizacao, setFiltroAnonimizacao] = useState('')
  const [filtroCuradoria, setFiltroCuradoria] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      router.push('/login')
      return
    }

    async function buscarImagens(tokenAtual: string) {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/images/`, {
          headers: { Authorization: `Bearer ${tokenAtual}` },
        })

        if (!response.ok) {
          router.push('/login')
          return
        }

        const dados: Imagem[] = await response.json()
        setImagens(dados)
        setCarregando(false)
      } catch {
        router.push('/login')
      }
    }

    buscarImagens(token)
  }, [router])

  const imagensFiltradas = imagens.filter((imagem) => {
    const bateAnonimizacao =
      filtroAnonimizacao === '' || imagem.anonimizacao_status === filtroAnonimizacao

    const bateCuradoria =
      filtroCuradoria === '' ||
      (filtroCuradoria === 'sem_ficha'
        ? imagem.status_curadoria === null
        : imagem.status_curadoria === filtroCuradoria)

    return bateAnonimizacao && bateCuradoria
  })

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

        <main className="flex-1 overflow-y-auto p-8">
          <h1 className="mb-6 text-xl font-semibold text-slate-100">Imagens recebidas</h1>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={filtroAnonimizacao}
              onChange={(e) => setFiltroAnonimizacao(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            >
              <option value="">Todos os status de anonimização</option>
              {OPCOES_ANONIMIZACAO.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.label}
                </option>
              ))}
            </select>

            <select
              value={filtroCuradoria}
              onChange={(e) => setFiltroCuradoria(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            >
              <option value="">Todos os status de curadoria</option>
              {OPCOES_CURADORIA.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.label}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">ID Orthanc</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Status de anonimização</th>
                  <th className="px-4 py-3 font-medium">Status de curadoria</th>
                  <th className="px-4 py-3 font-medium">Data de entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950">
                {imagensFiltradas.map((imagem) => {
                  const classeAnonimizacao =
                    CLASSES_ANONIMIZACAO[imagem.anonimizacao_status] ??
                    'bg-slate-500/15 text-slate-300 border-slate-600/40'

                  return (
                    <tr key={imagem.id} className="text-slate-200">
                      <td className="px-4 py-3 font-mono text-xs text-slate-300">
                        {truncarOrthancId(imagem.orthanc_id)}
                      </td>
                      <td className="px-4 py-3">{imagem.resource_type}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${classeAnonimizacao}`}
                        >
                          {imagem.anonimizacao_status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {imagem.status_curadoria ? (
                          <StatusBadge status={imagem.status_curadoria} />
                        ) : (
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${CLASSE_SEM_FICHA}`}
                          >
                            Sem ficha
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{formatarData(imagem.criado_em)}</td>
                    </tr>
                  )
                })}

                {imagensFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                      Nenhuma imagem encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    </div>
  )
}
