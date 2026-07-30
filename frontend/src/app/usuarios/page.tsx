'use client'

import { useEffect, useState, FormEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import DashboardCard from '../../components/DashboardCard'

const PERFIS = ['administrador', 'curador', 'professor', 'estudante', 'pesquisador', 'suporte'] as const

// Perfis que o admin pode conceder ao aprovar uma solicitacao de acesso -
// os mesmos autosolicitaveis pelo formulario publico (nao inclui
// administrador/suporte, que exigem criacao manual via "Novo usuário").
const PERFIS_CONCEDIVEIS = ['curador', 'professor', 'estudante', 'pesquisador'] as const

// A intencao declarada pelo solicitante mapeia direto pra um dos perfis
// concediveis - so serve de sugestao inicial, o admin sempre confirma ou
// troca o perfil antes de aprovar.
function perfilSugeridoParaIntencao(intencao: string): string {
  return (PERFIS_CONCEDIVEIS as readonly string[]).includes(intencao) ? intencao : 'estudante'
}

interface Usuario {
  id: number
  nome: string
  email: string
  perfil: string
  instituicao: string | null
  ativo: boolean
  bloqueado: boolean
  criado_em?: string
}

interface UsuarioExcluido {
  id: number
  nome: string
  email: string
  perfil: string
  instituicao: string | null
  excluido_em?: string
  excluido_por?: string | null
}

interface SolicitacaoAcesso {
  id: number
  nome: string
  email: string
  instituicao: string | null
  perfil_solicitado: string
  motivo: string | null
  status: string
  motivo_rejeicao: string | null
  criado_em?: string
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function formatarData(valor: string | undefined): string {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleDateString('pt-BR')
}

function statusDoUsuario(usuario: Usuario): { label: string; classe: string } {
  if (usuario.bloqueado) {
    return { label: 'Bloqueado', classe: 'bg-red-500/15 text-red-300 border-red-600/40' }
  }
  if (!usuario.ativo) {
    return { label: 'Inativo', classe: 'bg-slate-500/15 text-slate-300 border-slate-600/40' }
  }
  return { label: 'Ativo', classe: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40' }
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

function Modal({ children, onFechar }: { children: ReactNode; onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-base-border bg-base-surface p-6 shadow-2xl">
        {children}
      </div>
      <button
        type="button"
        aria-label="Fechar"
        onClick={onFechar}
        className="fixed inset-0 -z-10"
      />
    </div>
  )
}

export default function UsuariosPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)

  const [busca, setBusca] = useState('')
  const [filtroPerfil, setFiltroPerfil] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')

  const [edicao, setEdicao] = useState<{ usuario: Usuario; nome: string; instituicao: string } | null>(null)
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [erroEdicao, setErroEdicao] = useState('')

  const [modalCriacaoAberto, setModalCriacaoAberto] = useState(false)
  const [criando, setCriando] = useState(false)
  const [erroCriacao, setErroCriacao] = useState('')
  const [formCriacao, setFormCriacao] = useState({
    nome: '',
    email: '',
    senha: '',
    perfil: 'estudante',
    instituicao: '',
  })

  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoAcesso[]>([])
  const [carregandoSolicitacoes, setCarregandoSolicitacoes] = useState(true)
  const [processandoSolicitacaoId, setProcessandoSolicitacaoId] = useState<number | null>(null)
  const [rejeicao, setRejeicao] = useState<{ solicitacao: SolicitacaoAcesso; motivo: string } | null>(null)
  const [erroRejeicao, setErroRejeicao] = useState('')
  const [aprovacao, setAprovacao] = useState<{ solicitacao: SolicitacaoAcesso; perfil: string } | null>(null)
  const [erroAprovacao, setErroAprovacao] = useState('')

  const [exclusao, setExclusao] = useState<Usuario | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [erroExclusao, setErroExclusao] = useState('')

  const [mostrarExcluidos, setMostrarExcluidos] = useState(false)
  const [usuariosExcluidos, setUsuariosExcluidos] = useState<UsuarioExcluido[]>([])
  const [carregandoExcluidos, setCarregandoExcluidos] = useState(false)
  const [erroExcluidos, setErroExcluidos] = useState('')

  useEffect(() => {
    const tokenAtual = localStorage.getItem('access_token')
    if (!tokenAtual) {
      router.push('/login')
      return
    }
    setToken(tokenAtual)

    async function buscarUsuarios() {
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/`, {
          headers: { Authorization: `Bearer ${tokenAtual}` },
        })
        if (!response.ok) {
          router.push('/login')
          return
        }
        const dados: Usuario[] = await response.json()
        setUsuarios(dados)
        setCarregando(false)
      } catch {
        router.push('/login')
      }
    }

    async function buscarSolicitacoes() {
      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/users/access-requests?status_filtro=pendente`,
          { headers: { Authorization: `Bearer ${tokenAtual}` } }
        )
        if (!response.ok) return
        const dados: SolicitacaoAcesso[] = await response.json()
        setSolicitacoes(dados)
      } finally {
        setCarregandoSolicitacoes(false)
      }
    }

    buscarUsuarios()
    buscarSolicitacoes()
  }, [router])

  const usuariosFiltrados = usuarios.filter((usuario) => {
    const termo = busca.trim().toLowerCase()
    const bateBusca =
      termo === '' ||
      usuario.nome.toLowerCase().includes(termo) ||
      usuario.email.toLowerCase().includes(termo)

    const batePerfil = filtroPerfil === '' || usuario.perfil === filtroPerfil

    const bateStatus =
      filtroStatus === '' ||
      (filtroStatus === 'bloqueado' && usuario.bloqueado) ||
      (filtroStatus === 'ativo' && usuario.ativo && !usuario.bloqueado)

    return bateBusca && batePerfil && bateStatus
  })

  async function alternarBloqueio(usuario: Usuario) {
    if (!token) return
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${usuario.id}/block`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    })

    if (response.status === 401) {
      router.push('/login')
      return
    }
    if (!response.ok) return

    setUsuarios((prev) =>
      prev.map((u) => (u.id === usuario.id ? { ...u, bloqueado: !u.bloqueado } : u))
    )
  }

  function abrirExclusao(usuario: Usuario) {
    setErroExclusao('')
    setExclusao(usuario)
  }

  async function confirmarExclusao() {
    if (!exclusao || !token) return
    setExcluindo(true)
    setErroExclusao('')

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/${exclusao.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }
      if (!response.ok) {
        setErroExclusao(await extrairErro(response, 'Não foi possível excluir o usuário.'))
        return
      }

      setUsuarios((prev) => prev.filter((u) => u.id !== exclusao.id))
      setExclusao(null)
    } finally {
      setExcluindo(false)
    }
  }

  async function alternarListaExcluidos() {
    if (mostrarExcluidos) {
      setMostrarExcluidos(false)
      return
    }
    setMostrarExcluidos(true)
    if (!token || usuariosExcluidos.length > 0) return

    setCarregandoExcluidos(true)
    setErroExcluidos('')
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/deleted`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.status === 401) {
        router.push('/login')
        return
      }
      if (!response.ok) {
        setErroExcluidos('Não foi possível carregar os usuários excluídos.')
        return
      }
      const dados: UsuarioExcluido[] = await response.json()
      setUsuariosExcluidos(dados)
    } finally {
      setCarregandoExcluidos(false)
    }
  }

  function abrirAprovacao(solicitacao: SolicitacaoAcesso) {
    setErroAprovacao('')
    setAprovacao({ solicitacao, perfil: perfilSugeridoParaIntencao(solicitacao.perfil_solicitado) })
  }

  async function confirmarAprovacao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!aprovacao || !token) return

    setProcessandoSolicitacaoId(aprovacao.solicitacao.id)
    setErroAprovacao('')

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/users/access-requests/${aprovacao.solicitacao.id}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ perfil_concedido: aprovacao.perfil }),
        }
      )

      if (response.status === 401) {
        router.push('/login')
        return
      }
      if (!response.ok) {
        setErroAprovacao(await extrairErro(response, 'Não foi possível aprovar a solicitação.'))
        return
      }

      const novoUsuario: Usuario = await response.json()
      setUsuarios((prev) => [...prev, novoUsuario])
      setSolicitacoes((prev) => prev.filter((s) => s.id !== aprovacao.solicitacao.id))
      setAprovacao(null)
    } finally {
      setProcessandoSolicitacaoId(null)
    }
  }

  function abrirRejeicao(solicitacao: SolicitacaoAcesso) {
    setErroRejeicao('')
    setRejeicao({ solicitacao, motivo: '' })
  }

  async function confirmarRejeicao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!rejeicao || !token) return

    if (!rejeicao.motivo.trim()) {
      setErroRejeicao('Informe o motivo da rejeição.')
      return
    }

    setProcessandoSolicitacaoId(rejeicao.solicitacao.id)
    setErroRejeicao('')

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/users/access-requests/${rejeicao.solicitacao.id}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ motivo: rejeicao.motivo }),
        }
      )

      if (response.status === 401) {
        router.push('/login')
        return
      }
      if (!response.ok) {
        setErroRejeicao(await extrairErro(response, 'Não foi possível rejeitar a solicitação.'))
        return
      }

      setSolicitacoes((prev) => prev.filter((s) => s.id !== rejeicao.solicitacao.id))
      setRejeicao(null)
    } finally {
      setProcessandoSolicitacaoId(null)
    }
  }

  function abrirEdicao(usuario: Usuario) {
    setErroEdicao('')
    setEdicao({ usuario, nome: usuario.nome, instituicao: usuario.instituicao ?? '' })
  }

  async function salvarEdicao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!edicao || !token) return

    setSalvandoEdicao(true)
    setErroEdicao('')

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/users/${edicao.usuario.id}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            nome: edicao.nome,
            instituicao: edicao.instituicao.trim() || null,
          }),
        }
      )

      if (response.status === 401) {
        router.push('/login')
        return
      }
      if (!response.ok) {
        setErroEdicao(await extrairErro(response, 'Não foi possível salvar as alterações.'))
        return
      }

      const atualizado: Usuario = await response.json()
      setUsuarios((prev) => prev.map((u) => (u.id === atualizado.id ? atualizado : u)))
      setEdicao(null)
    } catch {
      setErroEdicao('Não foi possível salvar as alterações.')
    } finally {
      setSalvandoEdicao(false)
    }
  }

  function abrirCriacao() {
    setErroCriacao('')
    setFormCriacao({ nome: '', email: '', senha: '', perfil: 'estudante', instituicao: '' })
    setModalCriacaoAberto(true)
  }

  async function criarUsuario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return

    if (formCriacao.senha.length < 8) {
      setErroCriacao('A senha deve ter ao menos 8 caracteres.')
      return
    }

    setCriando(true)
    setErroCriacao('')

    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          nome: formCriacao.nome,
          email: formCriacao.email,
          senha: formCriacao.senha,
          perfil: formCriacao.perfil,
          instituicao: formCriacao.instituicao.trim() || null,
        }),
      })

      if (response.status === 401) {
        router.push('/login')
        return
      }
      if (!response.ok) {
        setErroCriacao(await extrairErro(response, 'Não foi possível criar o usuário.'))
        return
      }

      const novo: Usuario = await response.json()
      setUsuarios((prev) => [...prev, novo])
      setModalCriacaoAberto(false)
    } catch {
      setErroCriacao('Não foi possível criar o usuário.')
    } finally {
      setCriando(false)
    }
  }

  if (carregando) {
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
          <h1 className="mb-1 text-xl font-semibold text-slate-100">Usuários</h1>
          <p className="mb-6 text-sm text-slate-500">
            Gerencie docentes, estudantes e administradores da plataforma.
          </p>

          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardCard label="Total de usuários" valor={usuarios.length} cor="blue" />
            <DashboardCard
              label="Docentes"
              valor={usuarios.filter((u) => u.perfil === 'professor').length}
              cor="teal"
            />
            <DashboardCard
              label="Estudantes"
              valor={usuarios.filter((u) => u.perfil === 'estudante').length}
              cor="green"
            />
            <DashboardCard label="Convites pendentes" valor={solicitacoes.length} cor="amber" />
          </div>

          {!carregandoSolicitacoes && solicitacoes.length > 0 && (
            <div className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Solicitações de acesso pendentes ({solicitacoes.length})
              </h2>
              <div className="overflow-x-auto rounded-xl border border-base-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-base-surface text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Nome</th>
                      <th className="px-4 py-3 font-medium">E-mail</th>
                      <th className="px-4 py-3 font-medium">Perfil solicitado</th>
                      <th className="px-4 py-3 font-medium">Instituição</th>
                      <th className="px-4 py-3 font-medium">Motivo</th>
                      <th className="px-4 py-3 font-medium">Recebida em</th>
                      <th className="px-4 py-3 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-base">
                    {solicitacoes.map((solicitacao) => (
                      <tr key={solicitacao.id} className="text-slate-200">
                        <td className="px-4 py-3">{solicitacao.nome}</td>
                        <td className="px-4 py-3 text-slate-400">{solicitacao.email}</td>
                        <td className="px-4 py-3">{capitalizar(solicitacao.perfil_solicitado)}</td>
                        <td className="px-4 py-3 text-slate-400">{solicitacao.instituicao || '—'}</td>
                        <td className="px-4 py-3 max-w-xs truncate text-slate-400" title={solicitacao.motivo || ''}>
                          {solicitacao.motivo || '—'}
                        </td>
                        <td className="px-4 py-3 text-slate-400">{formatarData(solicitacao.criado_em)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => abrirAprovacao(solicitacao)}
                              disabled={processandoSolicitacaoId === solicitacao.id}
                              className="rounded-md border border-emerald-700 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-60"
                            >
                              Aprovar
                            </button>
                            <button
                              type="button"
                              onClick={() => abrirRejeicao(solicitacao)}
                              disabled={processandoSolicitacaoId === solicitacao.id}
                              className="rounded-md border border-red-700 px-3 py-1 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-60"
                            >
                              Rejeitar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="w-64 rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            />

            <select
              value={filtroPerfil}
              onChange={(e) => setFiltroPerfil(e.target.value)}
              className="rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">Todos os perfis</option>
              {PERFIS.map((perfil) => (
                <option key={perfil} value={perfil}>
                  {capitalizar(perfil)}
                </option>
              ))}
            </select>

            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">Todos os status</option>
              <option value="ativo">Ativo</option>
              <option value="bloqueado">Bloqueado</option>
            </select>

            <button
              type="button"
              onClick={alternarListaExcluidos}
              className="ml-auto rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
            >
              {mostrarExcluidos ? 'Ocultar excluídos' : 'Ver usuários excluídos'}
            </button>

            <button
              type="button"
              onClick={abrirCriacao}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover"
            >
              Novo usuário
            </button>
          </div>

          {mostrarExcluidos && (
            <div className="mb-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Usuários excluídos{usuariosExcluidos.length > 0 ? ` (${usuariosExcluidos.length})` : ''}
              </h2>

              {erroExcluidos && (
                <p className="mb-2 text-xs text-red-400" role="alert">
                  {erroExcluidos}
                </p>
              )}

              <div className="overflow-x-auto rounded-xl border border-base-border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-base-surface text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Nome</th>
                      <th className="px-4 py-3 font-medium">E-mail</th>
                      <th className="px-4 py-3 font-medium">Perfil</th>
                      <th className="px-4 py-3 font-medium">Instituição</th>
                      <th className="px-4 py-3 font-medium">Excluído em</th>
                      <th className="px-4 py-3 font-medium">Excluído por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-base">
                    {carregandoExcluidos ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          Carregando...
                        </td>
                      </tr>
                    ) : usuariosExcluidos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                          Nenhum usuário excluído.
                        </td>
                      </tr>
                    ) : (
                      usuariosExcluidos.map((usuario) => (
                        <tr key={usuario.id} className="text-slate-400">
                          <td className="px-4 py-3 text-slate-300">{usuario.nome}</td>
                          <td className="px-4 py-3">{usuario.email}</td>
                          <td className="px-4 py-3">{capitalizar(usuario.perfil)}</td>
                          <td className="px-4 py-3">{usuario.instituicao || '—'}</td>
                          <td className="px-4 py-3">{formatarData(usuario.excluido_em)}</td>
                          <td className="px-4 py-3">{usuario.excluido_por || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-base-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-surface text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">E-mail</th>
                  <th className="px-4 py-3 font-medium">Perfil</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Instituição</th>
                  <th className="px-4 py-3 font-medium">Cadastrado em</th>
                  <th className="px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-base">
                {usuariosFiltrados.map((usuario) => {
                  const status = statusDoUsuario(usuario)
                  return (
                    <tr key={usuario.id} className="text-slate-200">
                      <td className="px-4 py-3">{usuario.nome}</td>
                      <td className="px-4 py-3 text-slate-400">{usuario.email}</td>
                      <td className="px-4 py-3">{capitalizar(usuario.perfil)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.classe}`}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">{usuario.instituicao || '—'}</td>
                      <td className="px-4 py-3 text-slate-400">{formatarData(usuario.criado_em)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEdicao(usuario)}
                            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => alternarBloqueio(usuario)}
                            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-red-500 hover:text-red-300"
                          >
                            {usuario.bloqueado ? 'Ativar' : 'Bloquear'}
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirExclusao(usuario)}
                            className="rounded-md border border-red-800/60 px-3 py-1 text-xs text-red-300 hover:bg-red-950/40"
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}

                {usuariosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {edicao && (
        <Modal onFechar={() => setEdicao(null)}>
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Editar usuário</h2>
          <form onSubmit={salvarEdicao} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Nome</label>
              <input
                type="text"
                required
                value={edicao.nome}
                onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Instituição</label>
              <input
                type="text"
                value={edicao.instituicao}
                onChange={(e) => setEdicao({ ...edicao, instituicao: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            {erroEdicao && (
              <p className="text-sm text-red-400" role="alert">
                {erroEdicao}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEdicao(null)}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={salvandoEdicao}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
              >
                {salvandoEdicao ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modalCriacaoAberto && (
        <Modal onFechar={() => setModalCriacaoAberto(false)}>
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Novo usuário</h2>
          <form onSubmit={criarUsuario} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Nome</label>
              <input
                type="text"
                required
                value={formCriacao.nome}
                onChange={(e) => setFormCriacao({ ...formCriacao, nome: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">E-mail</label>
              <input
                type="email"
                required
                value={formCriacao.email}
                onChange={(e) => setFormCriacao({ ...formCriacao, email: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Senha</label>
              <input
                type="password"
                required
                value={formCriacao.senha}
                onChange={(e) => setFormCriacao({ ...formCriacao, senha: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Perfil</label>
              <select
                value={formCriacao.perfil}
                onChange={(e) => setFormCriacao({ ...formCriacao, perfil: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              >
                {PERFIS.map((perfil) => (
                  <option key={perfil} value={perfil}>
                    {capitalizar(perfil)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                Instituição (opcional)
              </label>
              <input
                type="text"
                value={formCriacao.instituicao}
                onChange={(e) => setFormCriacao({ ...formCriacao, instituicao: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
              />
            </div>

            {erroCriacao && (
              <p className="text-sm text-red-400" role="alert">
                {erroCriacao}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalCriacaoAberto(false)}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={criando}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-60"
              >
                {criando ? 'Criando...' : 'Criar usuário'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {exclusao && (
        <Modal onFechar={() => setExclusao(null)}>
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Excluir usuário</h2>
          <p className="mb-4 text-sm text-slate-400">
            Tem certeza que deseja excluir{' '}
            <span className="text-slate-200">{exclusao.nome}</span> ({exclusao.email})? O usuário deixa de poder
            entrar e sai da lista de usuários, mas o histórico é mantido e aparece em &quot;Usuários excluídos&quot;.
            O e-mail fica livre para um novo cadastro.
          </p>

          {erroExclusao && (
            <p className="mb-3 text-sm text-red-400" role="alert">
              {erroExclusao}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setExclusao(null)}
              className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarExclusao}
              disabled={excluindo}
              className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-60"
            >
              {excluindo ? 'Excluindo...' : 'Excluir usuário'}
            </button>
          </div>
        </Modal>
      )}

      {aprovacao && (
        <Modal onFechar={() => setAprovacao(null)}>
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Aprovar solicitação</h2>
          <p className="mb-4 text-sm text-slate-400">
            Aprovando o pedido de <span className="text-slate-200">{aprovacao.solicitacao.nome}</span> (
            {aprovacao.solicitacao.email}). Intenção declarada:{' '}
            <span className="text-slate-200">{capitalizar(aprovacao.solicitacao.perfil_solicitado)}</span>.
          </p>
          <form onSubmit={confirmarAprovacao} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                Perfil a conceder <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {PERFIS_CONCEDIVEIS.map((perfil) => (
                  <button
                    key={perfil}
                    type="button"
                    onClick={() => setAprovacao({ ...aprovacao, perfil })}
                    className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                      aprovacao.perfil === perfil
                        ? 'border-brand bg-brand text-white'
                        : 'border-slate-700 text-slate-300 hover:border-brand/50'
                    }`}
                  >
                    {capitalizar(perfil)}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Você pode honrar a intenção do solicitante ou restringir a um perfil diferente (ex.: Estudante).
              </p>
            </div>

            {erroAprovacao && (
              <p className="text-sm text-red-400" role="alert">
                {erroAprovacao}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAprovacao(null)}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={processandoSolicitacaoId === aprovacao.solicitacao.id}
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
              >
                {processandoSolicitacaoId === aprovacao.solicitacao.id ? 'Aprovando...' : 'Aprovar solicitação'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {rejeicao && (
        <Modal onFechar={() => setRejeicao(null)}>
          <h2 className="mb-4 text-lg font-semibold text-slate-100">Rejeitar solicitação</h2>
          <p className="mb-4 text-sm text-slate-400">
            Rejeitando o pedido de <span className="text-slate-200">{rejeicao.solicitacao.nome}</span> ({rejeicao.solicitacao.email}).
          </p>
          <form onSubmit={confirmarRejeicao} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Motivo da rejeição</label>
              <textarea
                required
                rows={3}
                value={rejeicao.motivo}
                onChange={(e) => setRejeicao({ ...rejeicao, motivo: e.target.value })}
                className="w-full resize-none rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
                placeholder="Explique por que o pedido está sendo rejeitado"
              />
            </div>

            {erroRejeicao && (
              <p className="text-sm text-red-400" role="alert">
                {erroRejeicao}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejeicao(null)}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={processandoSolicitacaoId === rejeicao.solicitacao.id}
                className="rounded-md bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-60"
              >
                {processandoSolicitacaoId === rejeicao.solicitacao.id ? 'Rejeitando...' : 'Rejeitar solicitação'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
