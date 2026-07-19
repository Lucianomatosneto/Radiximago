'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'

const PERFIS_PERMITIDOS = ['administrador', 'suporte', 'curador']

const OPCOES_DECISAO_FINAL = [
  { valor: 'aprovar', label: 'Aprovar' },
  { valor: 'descartar', label: 'Descartar' },
  { valor: 'manter', label: 'Manter em análise' },
]

interface ReviewPendente {
  id: number
  motivo: string
  primeiro_parecer: string | null
  criado_em: string | null
  curation: {
    id: number
    achado_principal: string | null
    tipo_radiografia: string | null
  }
  orthanc_reference: {
    id: number
    orthanc_id: string
  }
}

interface ViewerInfo {
  abrivel: boolean
  motivo?: string
  viewer_url: string | null
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

export default function SegundaOpiniaoPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [acessoNegado, setAcessoNegado] = useState(false)

  const [reviews, setReviews] = useState<ReviewPendente[]>([])
  const [carregandoFila, setCarregandoFila] = useState(false)
  const [erroFila, setErroFila] = useState('')

  const [reviewAtiva, setReviewAtiva] = useState<ReviewPendente | null>(null)
  const [viewerInfo, setViewerInfo] = useState<ViewerInfo | null>(null)
  const [carregandoViewer, setCarregandoViewer] = useState(false)

  const [parecerRevisor, setParecerRevisor] = useState('')
  const [concordancia, setConcordancia] = useState<'concorda' | 'discorda' | null>(null)
  const [decisaoFinal, setDecisaoFinal] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [erroFormulario, setErroFormulario] = useState('')

  useEffect(() => {
    const tokenAtual = localStorage.getItem('access_token')
    if (!tokenAtual) {
      router.push('/login')
      return
    }

    const perfil = localStorage.getItem('perfil')
    if (!perfil || !PERFIS_PERMITIDOS.includes(perfil)) {
      setAcessoNegado(true)
      setCarregando(false)
      return
    }

    setToken(tokenAtual)
    carregarFila(tokenAtual)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregarFila(tokenAtual: string) {
    setCarregandoFila(true)
    setErroFila('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/reviews/pending`, {
        headers: { Authorization: `Bearer ${tokenAtual}` },
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        router.push('/login')
        return
      }
      const dados = await resposta.json()
      setReviews(dados.itens ?? [])
    } catch {
      router.push('/login')
    } finally {
      setCarregandoFila(false)
      setCarregando(false)
    }
  }

  async function carregarViewerUrl(tokenAtual: string, orthancReferenceId: number) {
    setCarregandoViewer(true)
    setViewerInfo(null)
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${orthancReferenceId}/viewer-url`,
        { headers: { Authorization: `Bearer ${tokenAtual}` } }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) return
      const dados: ViewerInfo = await resposta.json()
      setViewerInfo(dados)
    } catch {
      // painel so mostra a mensagem de indisponibilidade
    } finally {
      setCarregandoViewer(false)
    }
  }

  function selecionarReview(review: ReviewPendente) {
    setReviewAtiva(review)
    setParecerRevisor('')
    setConcordancia(null)
    setDecisaoFinal('')
    setObservacoes('')
    setErroFormulario('')
    if (token) carregarViewerUrl(token, review.orthanc_reference.id)
  }

  function limparSelecao() {
    setReviewAtiva(null)
    setViewerInfo(null)
  }

  async function enviarParecer() {
    if (!reviewAtiva || !token) return

    const parecer = parecerRevisor.trim()
    if (!parecer) {
      setErroFormulario('O parecer do revisor é obrigatório.')
      return
    }
    if (!concordancia) {
      setErroFormulario('Selecione "Concordo" ou "Discordo".')
      return
    }

    setEnviando(true)
    setErroFormulario('')

    const payload: Record<string, unknown> = {
      parecer_revisor: parecer,
      concordancia,
    }
    if (decisaoFinal !== '') payload.decisao_final = decisaoFinal
    if (observacoes.trim() !== '') payload.observacoes = observacoes.trim()

    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/reviews/${reviewAtiva.id}/respond`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErroFormulario(await extrairErro(resposta, 'Não foi possível enviar o parecer.'))
        return
      }

      setReviews((prev) => prev.filter((r) => r.id !== reviewAtiva.id))
      limparSelecao()
      carregarFila(token)
    } catch {
      setErroFormulario('Não foi possível enviar o parecer.')
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-300">Carregando...</p>
      </main>
    )
  }

  if (acessoNegado) {
    return (
      <div className="flex min-h-screen bg-slate-950">
        <Sidebar />
        <div className="flex flex-1 flex-col">
          <Topbar />
          <main className="flex flex-1 items-center justify-center">
            <p className="text-slate-300">Acesso restrito</p>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="mb-4 text-xl font-semibold text-slate-100">Segunda opinião</h1>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            {/* LISTA - reviews pendentes */}
            <section className="rounded-xl border border-slate-800 bg-slate-900">
              <h2 className="border-b border-slate-800 px-4 py-3 text-sm font-semibold text-slate-200">
                Aguardando parecer
              </h2>

              {erroFila && (
                <p className="px-4 py-2 text-xs text-red-400" role="alert">
                  {erroFila}
                </p>
              )}

              <div className="max-h-[75vh] overflow-y-auto">
                {carregandoFila ? (
                  <p className="p-4 text-sm text-slate-500">Carregando fila...</p>
                ) : reviews.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">Nenhuma solicitação pendente.</p>
                ) : (
                  <ul className="divide-y divide-slate-800">
                    {reviews.map((review) => (
                      <li key={review.id}>
                        <button
                          type="button"
                          onClick={() => selecionarReview(review)}
                          className={`w-full px-4 py-3 text-left text-sm hover:bg-slate-800/60 ${
                            reviewAtiva?.id === review.id ? 'bg-slate-800/60' : ''
                          }`}
                        >
                          <p className="text-slate-200">
                            {review.curation.achado_principal ?? 'Achado não informado'}
                          </p>
                          <p className="mt-1 text-slate-400">
                            {review.curation.tipo_radiografia ?? '—'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 line-clamp-2">{review.motivo}</p>
                          <p className="mt-1 text-xs text-slate-600">
                            {formatarData(review.criado_em)}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {/* PAINEL - imagem + avaliacao original + formulario do revisor */}
            {!reviewAtiva ? (
              <section className="flex min-h-[75vh] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-500">
                Selecione uma solicitação na lista ao lado
              </section>
            ) : (
              <div className="space-y-4">
                <section className="flex min-h-[45vh] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                  {carregandoViewer ? (
                    <div className="flex flex-1 items-center justify-center text-slate-400">
                      Carregando visualizador...
                    </div>
                  ) : viewerInfo?.abrivel && viewerInfo.viewer_url ? (
                    <iframe
                      src={viewerInfo.viewer_url}
                      title="Visualizador OHIF"
                      className="h-full min-h-[45vh] w-full flex-1 border-0"
                    />
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
                      {viewerInfo?.motivo ?? 'Não foi possível carregar o visualizador para esta imagem.'}
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <h2 className="mb-3 text-sm font-semibold text-slate-200">
                    Primeira avaliação (somente leitura)
                  </h2>
                  <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Motivo da solicitação</dt>
                      <dd className="text-slate-300">{reviewAtiva.motivo}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Primeiro parecer</dt>
                      <dd className="text-slate-300">
                        {reviewAtiva.primeiro_parecer || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Achado principal</dt>
                      <dd className="text-slate-300">
                        {reviewAtiva.curation.achado_principal ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Tipo de radiografia</dt>
                      <dd className="text-slate-300">
                        {reviewAtiva.curation.tipo_radiografia ?? '—'}
                      </dd>
                    </div>
                  </dl>
                </section>

                <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                  <h2 className="mb-3 text-sm font-semibold text-slate-200">Parecer do revisor</h2>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Parecer do revisor
                      </label>
                      <textarea
                        value={parecerRevisor}
                        onChange={(e) => setParecerRevisor(e.target.value)}
                        rows={4}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Concordância
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setConcordancia('concorda')}
                          className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                            concordancia === 'concorda'
                              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                              : 'border-slate-700 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          Concordo
                        </button>
                        <button
                          type="button"
                          onClick={() => setConcordancia('discorda')}
                          className={`flex-1 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                            concordancia === 'discorda'
                              ? 'border-red-500 bg-red-500/15 text-red-300'
                              : 'border-slate-700 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          Discordo
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Decisão final sugerida (opcional)
                      </label>
                      <select
                        value={decisaoFinal}
                        onChange={(e) => setDecisaoFinal(e.target.value)}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                      >
                        <option value="">Não sugerir</option>
                        {OPCOES_DECISAO_FINAL.map((opcao) => (
                          <option key={opcao.valor} value={opcao.valor}>
                            {opcao.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-400">
                        Observações (opcional)
                      </label>
                      <textarea
                        value={observacoes}
                        onChange={(e) => setObservacoes(e.target.value)}
                        rows={3}
                        className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                      />
                    </div>

                    {erroFormulario && (
                      <p className="text-sm text-red-400" role="alert">
                        {erroFormulario}
                      </p>
                    )}

                    <div className="flex justify-end gap-2 border-t border-slate-800 pt-4">
                      <button
                        type="button"
                        onClick={limparSelecao}
                        className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={enviarParecer}
                        disabled={enviando}
                        className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500 disabled:opacity-50"
                      >
                        {enviando ? 'Enviando...' : 'Enviar parecer'}
                      </button>
                    </div>
                  </div>
                </section>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
