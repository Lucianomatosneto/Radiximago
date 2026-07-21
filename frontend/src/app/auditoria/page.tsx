'use client'

import { Fragment, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'

const PERFIS_PERMITIDOS = ['administrador']

const LIMIT = 50

// Os 19 valores de "acao" que de fato existem na tabela audit_logs, agrupados
// por categoria (confirmado em auth.py, users_router.py, images_router.py e
// curation_router.py). "edicao" foi excluida de proposito: so existe em
// curation_history, nunca em audit_logs.
const CATEGORIAS_ACAO: { categoria: string; itens: { valor: string; label: string }[] }[] = [
  {
    categoria: 'Acesso',
    itens: [
      { valor: 'login', label: 'Login' },
      { valor: 'falha_login', label: 'Falha no login' },
      { valor: 'logout', label: 'Logout' },
      { valor: 'troca_senha', label: 'Troca de senha' },
      { valor: 'falha_troca_senha', label: 'Falha na troca de senha' },
    ],
  },
  {
    categoria: 'Usuários',
    itens: [
      { valor: 'criacao_usuario', label: 'Criação de usuário' },
      { valor: 'edicao_usuario', label: 'Edição de usuário' },
      { valor: 'bloqueio_usuario', label: 'Bloqueio/desbloqueio de usuário' },
    ],
  },
  {
    categoria: 'Imagens',
    itens: [
      { valor: 'importacao_orthanc', label: 'Importação do Orthanc' },
      { valor: 'upload_imagem', label: 'Upload de imagem' },
      { valor: 'upload_sem_preambulo_dicom', label: 'Upload sem preâmbulo DICOM' },
    ],
  },
  {
    categoria: 'Curadoria',
    itens: [
      { valor: 'criacao', label: 'Criação de ficha' },
      { valor: 'edicao_curadoria', label: 'Edição de ficha' },
      { valor: 'aprovacao', label: 'Aprovação' },
      { valor: 'aprovacao_pos_segunda_opiniao', label: 'Aprovação pós segunda opinião' },
      { valor: 'descarte', label: 'Descarte' },
      { valor: 'descarte_pos_segunda_opiniao', label: 'Descarte pós segunda opinião' },
      { valor: 'solicitacao_segunda_opiniao', label: 'Solicitação de segunda opinião' },
      { valor: 'resposta_segunda_opiniao', label: 'Resposta de segunda opinião' },
    ],
  },
]

const TODAS_ACOES = CATEGORIAS_ACAO.flatMap((c) => c.itens)

const OPCOES_RESULTADO = [
  { valor: 'sucesso', label: 'Sucesso' },
  { valor: 'negado', label: 'Negado' },
  { valor: 'erro', label: 'Erro' },
]

const CORES_RESULTADO: Record<string, string> = {
  sucesso: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40',
  negado: 'bg-red-500/15 text-red-300 border-red-600/40',
  erro: 'bg-orange-500/15 text-orange-300 border-orange-600/40',
}

interface AuditLogItem {
  id: number
  usuario_id: number | null
  acao: string
  entidade: string
  entidade_id: number | null
  resultado: string
  detalhes: string | null
  criado_em: string | null
}

interface Usuario {
  id: number
  nome: string
}

function rotularAcao(valor: string): string {
  return TODAS_ACOES.find((a) => a.valor === valor)?.label ?? valor
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

export default function AuditoriaPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const [filtroAcao, setFiltroAcao] = useState('')
  const [filtroResultado, setFiltroResultado] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')

  const [itens, setItens] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')

  const [mapaUsuarios, setMapaUsuarios] = useState<Record<number, string>>({})
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())

  useEffect(() => {
    const tokenAtual = localStorage.getItem('access_token')
    if (!tokenAtual) {
      router.push('/login')
      return
    }

    const perfil = localStorage.getItem('perfil')
    if (!perfil || !PERFIS_PERMITIDOS.includes(perfil)) {
      router.push('/acesso-negado')
      return
    }

    setToken(tokenAtual)
    carregarUsuarios(tokenAtual)
    buscarLogs(tokenAtual, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregarUsuarios(tokenAtual: string) {
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/`, {
        headers: { Authorization: `Bearer ${tokenAtual}` },
      })
      if (!resposta.ok) return
      const usuarios: Usuario[] = await resposta.json()
      const mapa: Record<number, string> = {}
      for (const usuario of usuarios) mapa[usuario.id] = usuario.nome
      setMapaUsuarios(mapa)
    } catch {
      // resolucao de nome e so um extra - segue com o id se falhar
    }
  }

  async function buscarLogs(tokenAtual: string, skipAtual: number) {
    setBuscando(true)
    setErro('')

    const params = new URLSearchParams()
    if (filtroAcao) params.set('acao', filtroAcao)
    if (filtroResultado) params.set('resultado', filtroResultado)
    if (dataDe) params.set('data_de', `${dataDe}T00:00:00`)
    if (dataAte) params.set('data_ate', `${dataAte}T23:59:59`)
    params.set('skip', String(skipAtual))
    params.set('limit', String(LIMIT))

    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/audit-logs?${params.toString()}`,
        { headers: { Authorization: `Bearer ${tokenAtual}` } }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, 'Não foi possível carregar a auditoria.'))
        return
      }
      const dados = await resposta.json()
      setItens(dados.itens ?? [])
      setTotal(dados.total ?? 0)
      setSkip(skipAtual)
      setExpandidos(new Set())
    } catch {
      setErro('Não foi possível carregar a auditoria.')
    } finally {
      setBuscando(false)
      setCarregando(false)
    }
  }

  function pesquisar() {
    if (token) buscarLogs(token, 0)
  }

  function paginaAnterior() {
    if (token && skip > 0) buscarLogs(token, Math.max(0, skip - LIMIT))
  }

  function proximaPagina() {
    if (token && skip + LIMIT < total) buscarLogs(token, skip + LIMIT)
  }

  function alternarDetalhes(id: number) {
    setExpandidos((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) {
        novo.delete(id)
      } else {
        novo.add(id)
      }
      return novo
    })
  }

  function nomeUsuario(usuarioId: number | null): string {
    if (usuarioId === null) return '—'
    return mapaUsuarios[usuarioId] ?? `Usuário #${usuarioId}`
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
          <h1 className="mb-6 text-xl font-semibold text-slate-100">Auditoria e segurança</h1>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Ação</label>
                <select
                  value={filtroAcao}
                  onChange={(e) => setFiltroAcao(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                >
                  <option value="">Todas</option>
                  {CATEGORIAS_ACAO.map((grupo) => (
                    <optgroup key={grupo.categoria} label={grupo.categoria}>
                      {grupo.itens.map((item) => (
                        <option key={item.valor} value={item.valor}>
                          {item.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Resultado</label>
                <select
                  value={filtroResultado}
                  onChange={(e) => setFiltroResultado(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                >
                  <option value="">Todos</option>
                  {OPCOES_RESULTADO.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>
                      {opcao.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Data inicial</label>
                <input
                  type="date"
                  value={dataDe}
                  onChange={(e) => setDataDe(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Data final</label>
                <input
                  type="date"
                  value={dataAte}
                  onChange={(e) => setDataAte(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={pesquisar}
                disabled={buscando}
                className="rounded-md bg-teal-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500 disabled:opacity-50"
              >
                {buscando ? 'Buscando...' : 'Filtrar'}
              </button>
              {erro && (
                <p className="text-sm text-red-400" role="alert">
                  {erro}
                </p>
              )}
            </div>
          </section>

          <div className="mt-6 overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Data/hora</th>
                  <th className="px-4 py-3 font-medium">Usuário</th>
                  <th className="px-4 py-3 font-medium">Ação</th>
                  <th className="px-4 py-3 font-medium">Entidade</th>
                  <th className="px-4 py-3 font-medium">Resultado</th>
                  <th className="px-4 py-3 font-medium">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-950">
                {itens.map((item) => (
                  <Fragment key={item.id}>
                    <tr className="text-slate-200">
                      <td className="px-4 py-3 text-slate-400">{formatarData(item.criado_em)}</td>
                      <td className="px-4 py-3">{nomeUsuario(item.usuario_id)}</td>
                      <td className="px-4 py-3">{rotularAcao(item.acao)}</td>
                      <td className="px-4 py-3 text-slate-400">
                        {item.entidade}
                        {item.entidade_id !== null ? ` #${item.entidade_id}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            CORES_RESULTADO[item.resultado] ??
                            'bg-slate-500/15 text-slate-300 border-slate-600/40'
                          }`}
                        >
                          {item.resultado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => alternarDetalhes(item.id)}
                          className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-teal-500 hover:text-teal-300"
                        >
                          {expandidos.has(item.id) ? 'Ocultar' : 'Detalhes'}
                        </button>
                      </td>
                    </tr>
                    {expandidos.has(item.id) && (
                      <tr className="bg-slate-900/60">
                        <td colSpan={6} className="px-4 py-3 text-xs text-slate-400">
                          {item.detalhes || 'Sem detalhes registrados.'}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}

                {itens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Nenhum registro encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <span>
              {total > 0
                ? `Mostrando ${skip + 1}–${Math.min(skip + LIMIT, total)} de ${total} registros`
                : '0 registros'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={paginaAnterior}
                disabled={skip === 0 || buscando}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={proximaPagina}
                disabled={skip + LIMIT >= total || buscando}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Próximo
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
