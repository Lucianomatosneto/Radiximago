'use client'

import { useEffect, useState, FormEvent, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'

const PERFIS = ['administrador', 'curador', 'professor', 'estudante', 'pesquisador', 'suporte'] as const

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
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
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

    buscarUsuarios()
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
          <h1 className="mb-6 text-xl font-semibold text-slate-100">Usuários</h1>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou e-mail..."
              className="w-64 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            />

            <select
              value={filtroPerfil}
              onChange={(e) => setFiltroPerfil(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
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
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
            >
              <option value="">Todos os status</option>
              <option value="ativo">Ativo</option>
              <option value="bloqueado">Bloqueado</option>
            </select>

            <button
              type="button"
              onClick={abrirCriacao}
              className="ml-auto rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500"
            >
              Novo usuário
            </button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900 text-slate-400">
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
              <tbody className="divide-y divide-slate-800 bg-slate-950">
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
                            className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-teal-500 hover:text-teal-300"
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
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Instituição</label>
              <input
                type="text"
                value={edicao.instituicao}
                onChange={(e) => setEdicao({ ...edicao, instituicao: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
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
                className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500 disabled:opacity-60"
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
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">E-mail</label>
              <input
                type="email"
                required
                value={formCriacao.email}
                onChange={(e) => setFormCriacao({ ...formCriacao, email: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
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
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Perfil</label>
              <select
                value={formCriacao.perfil}
                onChange={(e) => setFormCriacao({ ...formCriacao, perfil: e.target.value })}
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
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
                className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
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
                className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500 disabled:opacity-60"
              >
                {criando ? 'Criando...' : 'Criar usuário'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
