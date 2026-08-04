'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import StatusBadge from '../../components/StatusBadge'

// Quem pode ver esta pagina e enviar imagens novas - tem que bater com
// PERFIS_ENVIO_IMAGENS do backend (auth.py) e com o item de menu
// correspondente em Sidebar.tsx. Sem essa checagem, um usuario sem
// permissao que abrisse esta URL direto veria a tela carregar e so depois
// falhar ao buscar os dados (pior experiencia) - com a checagem, e mandado
// direto pra pagina de acesso negado, como as demais telas restritas.
const PERFIS_PERMITIDOS = ['administrador', 'suporte', 'curador', 'professor']

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

function formatarData(valor: string | undefined): string {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleDateString('pt-BR')
}

export default function ImagensPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [imagens, setImagens] = useState<Imagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [filtroAnonimizacao, setFiltroAnonimizacao] = useState('')
  const [filtroCuradoria, setFiltroCuradoria] = useState('')

  // Envio de imagem nova (professor/curador/admin/suporte).
  const inputArquivoRef = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const [mensagemEnvio, setMensagemEnvio] = useState('')
  const [erroEnvio, setErroEnvio] = useState('')
  // Erro ao CARREGAR a lista (diferente de erroEnvio, que e so do formulario
  // de upload). So existe pra mostrar mensagem na tela - nunca desloga o
  // usuario, ver comentario abaixo sobre o motivo dessa mudanca.
  const [erroLista, setErroLista] = useState('')

  const buscarImagens = useCallback(
    async (tokenAtual: string) => {
      setErroLista('')
      try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/images/`, {
          headers: { Authorization: `Bearer ${tokenAtual}` },
        })

        if (!response.ok) {
          // So 401 (token invalido/expirado) e problema de sessao de
          // verdade - so nesse caso manda pro login. Qualquer outro erro
          // (403 de permissao, 500 do servidor, etc.) e mostrado na tela
          // em vez de "deslogar" o usuario - antes QUALQUER erro aqui
          // (inclusive um erro interno do servidor) mandava direto pro
          // login, o que parecia "perder o acesso a conta" mesmo com a
          // conta e a sessao certas.
          if (response.status === 401) {
            router.push('/login')
            return
          }
          const dadosErro = await response.json().catch(() => null)
          setErroLista(
            (typeof dadosErro?.detail === 'string' && dadosErro.detail) ||
              `Não foi possível carregar as imagens (erro ${response.status}). Tente novamente em instantes.`
          )
          setCarregando(false)
          return
        }

        const dados: Imagem[] = await response.json()
        setImagens(dados)
        setCarregando(false)
      } catch {
        // Falha de rede/conexao - tambem nao e problema de sessao.
        setErroLista('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.')
        setCarregando(false)
      }
    },
    [router]
  )

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
    buscarImagens(tokenAtual)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, buscarImagens])

  async function enviarImagem(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const arquivo = inputArquivoRef.current?.files?.[0]
    if (!token || !arquivo) return

    setEnviando(true)
    setMensagemEnvio('')
    setErroEnvio('')

    try {
      const corpo = new FormData()
      corpo.append('arquivo', arquivo)

      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/images/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: corpo,
      })

      const dados = await resposta.json().catch(() => null)

      if (!resposta.ok) {
        setErroEnvio(
          (typeof dados?.detail === 'string' && dados.detail) ||
            'Não foi possível enviar o arquivo. Verifique se é um DICOM válido.'
        )
        return
      }

      setMensagemEnvio(
        dados?.status === 'ja_existente'
          ? 'Este arquivo já estava registrado (imagem existente) - nenhuma duplicata foi criada.'
          : 'Imagem enviada e anonimizada com sucesso.'
      )
      if (inputArquivoRef.current) inputArquivoRef.current.value = ''
      buscarImagens(token) // atualiza a lista na hora, sem precisar recarregar a pagina
    } catch {
      setErroEnvio('Não foi possível enviar o arquivo. Verifique sua conexão e tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

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
          <h1 className="mb-6 text-xl font-semibold text-slate-100">Imagens recebidas</h1>

          {erroLista && (
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-700/40 bg-red-950/30 p-4">
              <p className="text-sm text-red-300">{erroLista}</p>
              <button
                type="button"
                onClick={() => token && buscarImagens(token)}
                className="rounded-md border border-red-700/50 px-3 py-1.5 text-xs font-medium text-red-300 transition-colors hover:bg-red-900/40"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Envio de imagem nova: liberado pra administrador, suporte,
              curador e professor (PERFIS_ENVIO_IMAGENS no backend). O
              arquivo enviado e anonimizado no Orthanc IMEDIATAMENTE - o
              original identificavel e apagado assim que a versao anonima e
              confirmada (ver _anonimizar_e_excluir_original em
              images_router.py, backend) - e fica registrado na Auditoria
              (tela "Auditoria", visivel so pro administrador) com quem
              enviou e qual imagem. */}
          {/* Degrade horizontal comecando verde (esquerda) e terminando azul
              (direita), por pedido - usa o mesmo caminho de tons do
              Sidebar.tsx (blue -> sky -> cyan -> teal -> emerald), so que
              em ordem invertida da esquerda pra direita. */}
          <section className="mb-6 rounded-xl border border-teal-700/40 bg-gradient-to-r from-emerald-950/50 via-teal-950/40 to-blue-950/50 p-4">
            <h2 className="mb-1 text-sm font-semibold text-teal-300">Enviar imagem DICOM</h2>
            <p className="mb-3 text-xs text-slate-500">
              O arquivo é enviado ao Orthanc e anonimizado automaticamente antes de ficar disponível
              - nenhum dado identificável do paciente é mantido. O envio fica registrado na auditoria.
            </p>
            <form onSubmit={enviarImagem} className="flex flex-wrap items-center gap-3">
              <input
                ref={inputArquivoRef}
                type="file"
                accept=".dcm,application/dicom"
                required
                className="text-sm text-slate-300 file:mr-3 file:cursor-pointer file:rounded-md file:border-0 file:bg-brand file:px-3 file:py-2 file:text-sm file:font-medium file:text-white file:transition-colors file:hover:bg-brand-hover"
              />
              <button
                type="submit"
                disabled={enviando}
                className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {enviando ? 'Enviando...' : 'Enviar imagem'}
              </button>
            </form>
            {mensagemEnvio && <p className="mt-3 text-sm text-emerald-400">{mensagemEnvio}</p>}
            {erroEnvio && (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {erroEnvio}
              </p>
            )}
          </section>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={filtroAnonimizacao}
              onChange={(e) => setFiltroAnonimizacao(e.target.value)}
              className="rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
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
              className="rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand focus:ring-1 focus:ring-brand"
            >
              <option value="">Todos os status de curadoria</option>
              {OPCOES_CURADORIA.map((opcao) => (
                <option key={opcao.valor} value={opcao.valor}>
                  {opcao.label}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-base-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-surface text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">ID Orthanc</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Status de anonimização</th>
                  <th className="px-4 py-3 font-medium">Status de curadoria</th>
                  <th className="px-4 py-3 font-medium">Data de entrada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-base">
                {imagensFiltradas.map((imagem) => {
                  const classeAnonimizacao =
                    CLASSES_ANONIMIZACAO[imagem.anonimizacao_status] ??
                    'bg-slate-500/15 text-slate-300 border-slate-600/40'

                  return (
                    <tr key={imagem.id} className="text-slate-200">
                      <td className="max-w-[220px] break-all px-4 py-3 font-mono text-xs text-slate-300">
                        {imagem.orthanc_id}
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
