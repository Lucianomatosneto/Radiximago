'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import BarraClassificacao from '../../components/detalhe/BarraClassificacao'
import MarcacaoAchado from '../../components/detalhe/MarcacaoAchado'
import type { Marcacao } from '../../lib/marcacoes'

const PERFIS_PERMITIDOS = ['administrador', 'suporte', 'curador']

// Mesmos valores (mesmos usados na tela de Curadoria e no restante do
// sistema) - o pedido foi pra segunda opiniao mostrar "as mesmas opcoes da
// tela do curador", entao os rotulos precisam bater exatamente.
const OPCOES_TIPO_RADIOGRAFIA = [
  { valor: 'periapical', label: 'Periapical' },
  { valor: 'panoramica', label: 'Panorâmica' },
  { valor: 'interproximal', label: 'Interproximal' },
  { valor: 'oclusal', label: 'Oclusal' },
]

const OPCOES_GENERO = [
  { valor: 'masculino', label: 'Masculino' },
  { valor: 'feminino', label: 'Feminino' },
]

const OPCOES_QUALIDADE_TECNICA = [
  { valor: 'otima', label: 'Ótima' },
  { valor: 'boa', label: 'Boa' },
  { valor: 'regular', label: 'Regular' },
  { valor: 'insatisfatoria', label: 'Insatisfatória' },
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

function rotular(opcoes: { valor: string; label: string }[], valor: string | null): string {
  if (!valor) return '—'
  return opcoes.find((o) => o.valor === valor)?.label ?? valor
}

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

// Ficha completa (GET /curation/{id}) - os MESMOS campos que a tela de
// Curadoria usa pra montar a ficha (ver FichaCuradoriaForm.tsx,
// PainelDadosSobrepostos.tsx e PainelAchadosRadiografia.tsx), pra dar ao
// revisor exatamente a mesma informação que o curador registrou.
interface FichaCompleta {
  id: number
  tipo_radiografia: string | null
  dentes: number[] | null
  idade_min: number | null
  idade_max: number | null
  genero: string | null
  achado_principal: string | null
  marcacoes: Marcacao[]
  achados_detalhe: string | null
  alteracoes_observadas: string[] | null
  qualidade_tecnica: string | null
  dificuldade: string | null
  descricao_didatica: string | null
  observacoes_internas: string | null
  status: string
  anonimizacao_validada: boolean
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

  const [reviews, setReviews] = useState<ReviewPendente[]>([])
  const [carregandoFila, setCarregandoFila] = useState(false)
  const [erroFila, setErroFila] = useState('')

  const [reviewAtiva, setReviewAtiva] = useState<ReviewPendente | null>(null)
  const [viewerInfo, setViewerInfo] = useState<ViewerInfo | null>(null)
  const [carregandoViewer, setCarregandoViewer] = useState(false)
  const [telaCheia, setTelaCheia] = useState(false)
  const visualizadorRef = useRef<HTMLDivElement | null>(null)

  const [fichaCompleta, setFichaCompleta] = useState<FichaCompleta | null>(null)
  const [carregandoFicha, setCarregandoFicha] = useState(false)

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
      router.push('/acesso-negado')
      return
    }

    setToken(tokenAtual)
    carregarFila(tokenAtual)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  useEffect(() => {
    function aoMudarTelaCheia() {
      setTelaCheia(document.fullscreenElement === visualizadorRef.current)
    }
    document.addEventListener('fullscreenchange', aoMudarTelaCheia)
    return () => document.removeEventListener('fullscreenchange', aoMudarTelaCheia)
  }, [])

  async function alternarTelaCheia() {
    if (!visualizadorRef.current) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await visualizadorRef.current.requestFullscreen()
      }
    } catch {
      // navegador pode negar (ex.: sem interacao do usuario) - ignora
    }
  }

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

  // Busca a ficha COMPLETA (mesmo endpoint que a Curadoria usa pra
  // reabrir uma ficha em edicao) - e o que da ao revisor acesso a TUDO que
  // o curador preencheu (nao so achado principal e tipo de radiografia,
  // que era tudo que a fila resumida ja trazia).
  async function carregarFichaCompleta(tokenAtual: string, curationId: number) {
    setCarregandoFicha(true)
    setFichaCompleta(null)
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}`, {
        headers: { Authorization: `Bearer ${tokenAtual}` },
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) return
      const dados: FichaCompleta = await resposta.json()
      setFichaCompleta(dados)
    } catch {
      // secao so mostra o aviso de que nao deu pra carregar
    } finally {
      setCarregandoFicha(false)
    }
  }

  function selecionarReview(review: ReviewPendente) {
    setReviewAtiva(review)
    setErroFormulario('')
    if (token) {
      carregarViewerUrl(token, review.orthanc_reference.id)
      carregarFichaCompleta(token, review.curation.id)
    }
  }

  function limparSelecao() {
    setReviewAtiva(null)
    setViewerInfo(null)
    setFichaCompleta(null)
  }

  // Um clique = a decisao inteira. Sem parecer escrito nem campos extras -
  // pedido explicito pra tela ter APENAS os dois botoes (Concordar /
  // Discordar). O parecer escrito continua existindo na API (agora
  // opcional; ver schemas.py) pra nao fechar a porta pra uma versao futura
  // que volte a coletar um comentario, mas hoje esta tela nao envia nada
  // alem da concordancia.
  async function responderReview(concordancia: 'concorda' | 'discorda') {
    if (!reviewAtiva || !token) return

    setEnviando(true)
    setErroFormulario('')

    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/reviews/${reviewAtiva.id}/respond`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ concordancia }),
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErroFormulario(await extrairErro(resposta, 'Não foi possível enviar sua avaliação.'))
        return
      }

      setReviews((prev) => prev.filter((r) => r.id !== reviewAtiva.id))
      limparSelecao()
      carregarFila(token)
    } catch {
      setErroFormulario('Não foi possível enviar sua avaliação.')
    } finally {
      setEnviando(false)
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

        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="mb-4 text-xl font-semibold text-slate-100">Segunda opinião</h1>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
            {/* LISTA - reviews pendentes */}
            <section className="rounded-xl border border-base-border bg-base-surface">
              <h2 className="border-b border-base-border px-4 py-3 text-sm font-semibold text-slate-200">
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
                          className={`w-full px-4 py-3 text-left text-sm hover:bg-base-surface2/60 ${
                            reviewAtiva?.id === review.id ? 'bg-base-surface2/60' : ''
                          }`}
                        >
                          <p className="text-slate-200">
                            {rotular(OPCOES_ACHADO_PRINCIPAL, review.curation.achado_principal)}
                          </p>
                          <p className="mt-1 text-slate-400">
                            {rotular(OPCOES_TIPO_RADIOGRAFIA, review.curation.tipo_radiografia)}
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

            {/* PAINEL - imagem + ficha completa do curador + decisao do revisor */}
            {!reviewAtiva ? (
              <section className="flex min-h-[75vh] items-center justify-center rounded-xl border border-base-border bg-base-surface p-8 text-center text-slate-500">
                Selecione uma solicitação na lista ao lado
              </section>
            ) : (
              // Igual a tela de Curadoria: TUDO (imagem, o que o curador
              // registrou e os botoes de Concordar/Discordar) fica dentro do
              // elemento que vira tela cheia (Fullscreen API so mostra o
              // elemento pedido, escondendo tudo fora dele) - assim o revisor
              // consegue ver a imagem grande E analisar/decidir sem sair do
              // modo tela cheia. So a lista da fila (coluna da esquerda) fica
              // de fora, igual la.
              <div
                ref={visualizadorRef}
                className={`flex flex-col gap-4 overflow-y-auto bg-base ${telaCheia ? 'p-4' : ''}`}
              >
                <section className="relative flex min-h-[45vh] flex-col overflow-hidden rounded-xl border border-base-border bg-base-surface">
                  {viewerInfo?.abrivel && viewerInfo.viewer_url && (
                    <div className="flex items-center justify-end border-b border-base-border px-3 py-2">
                      <button
                        type="button"
                        onClick={alternarTelaCheia}
                        aria-label={telaCheia ? 'Sair da tela cheia' : 'Abrir em tela cheia'}
                        title={telaCheia ? 'Sair da tela cheia' : 'Abrir em tela cheia'}
                        className="flex items-center gap-1.5 rounded-full border border-base-border bg-base-surface2 px-3 py-1.5 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                      >
                        {telaCheia ? (
                          <>
                            <span aria-hidden="true">⤡</span> Voltar
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true">⛶</span> Tela cheia
                          </>
                        )}
                      </button>
                    </div>
                  )}

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

                {/* Tudo que o curador registrou - MESMOS campos e MESMO
                    componente de classificacao (BarraClassificacao) usado nas
                    telas de visualizacao de imagem, pra dar ao revisor a
                    informacao completa (nao so achado principal e tipo). */}
                <section className="rounded-xl border border-base-border bg-base-surface p-4">
                  <h2 className="mb-3 text-sm font-semibold text-slate-200">
                    O que o curador registrou (somente leitura)
                  </h2>

                  <dl className="mb-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500">Motivo da solicitação de segunda opinião</dt>
                      <dd className="text-slate-300">{reviewAtiva.motivo}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Primeiro parecer do curador (ao solicitar)</dt>
                      <dd className="text-slate-300">{reviewAtiva.primeiro_parecer || '—'}</dd>
                    </div>
                  </dl>

                  {carregandoFicha ? (
                    <p className="text-sm text-slate-500">Carregando ficha completa...</p>
                  ) : !fichaCompleta ? (
                    <p className="text-sm text-slate-500">Não foi possível carregar os dados completos da ficha.</p>
                  ) : (
                    <>
                      <BarraClassificacao
                        tipo={rotular(OPCOES_TIPO_RADIOGRAFIA, fichaCompleta.tipo_radiografia)}
                        qualidade={rotular(OPCOES_QUALIDADE_TECNICA, fichaCompleta.qualidade_tecnica)}
                        dentes={fichaCompleta.dentes}
                        alteracoesObservadas={fichaCompleta.alteracoes_observadas}
                        achadosDetalhe={fichaCompleta.achados_detalhe}
                        descricaoDidatica={fichaCompleta.descricao_didatica}
                        achadoPrincipal={fichaCompleta.achado_principal}
                      />

                      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-base-border pt-4 text-sm sm:grid-cols-4">
                        <div>
                          <dt className="text-xs text-slate-500">Faixa etária</dt>
                          <dd className="text-slate-300">
                            {fichaCompleta.idade_min || fichaCompleta.idade_max
                              ? `${fichaCompleta.idade_min ?? '?'} a ${fichaCompleta.idade_max ?? '?'}`
                              : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Sexo</dt>
                          <dd className="text-slate-300">{rotular(OPCOES_GENERO, fichaCompleta.genero)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-slate-500">Anonimização validada</dt>
                          <dd className={fichaCompleta.anonimizacao_validada ? 'text-emerald-400' : 'text-red-400'}>
                            {fichaCompleta.anonimizacao_validada ? 'Sim' : 'Não'}
                          </dd>
                        </div>
                      </dl>

                      {fichaCompleta.observacoes_internas && (
                        <div className="mt-3 rounded-lg border border-base-border bg-base-surface2/70 p-3">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Observações internas do curador
                          </p>
                          <p className="text-sm text-slate-300">{fichaCompleta.observacoes_internas}</p>
                        </div>
                      )}

                      <div className="mt-4 border-t border-base-border pt-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Marcações feitas pelo curador na imagem
                        </p>
                        <MarcacaoAchado curationId={fichaCompleta.id} marcacoes={fichaCompleta.marcacoes} />
                      </div>
                    </>
                  )}
                </section>

                {/* Decisao do revisor: so os dois botoes, por pedido - sem
                    parecer escrito obrigatorio, sem decisao final sugerida,
                    sem observacoes. Clicar em um dos dois JA envia a
                    resposta. */}
                <section className="rounded-xl border border-base-border bg-base-surface p-4">
                  <h2 className="mb-1 text-sm font-semibold text-slate-200">Sua avaliação</h2>
                  <p className="mb-4 text-xs text-slate-500">
                    Depois de analisar o que o curador registrou acima, você concorda com essa avaliação ou discorda dela?
                  </p>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => responderReview('concorda')}
                      disabled={enviando}
                      className="flex flex-col items-center gap-1 rounded-xl border-2 border-emerald-600/40 bg-emerald-500/10 px-4 py-6 text-emerald-300 transition-colors hover:border-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                    >
                      <span className="text-3xl" aria-hidden="true">
                        ✓
                      </span>
                      <span className="text-base font-semibold">Concordar com o curador</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => responderReview('discorda')}
                      disabled={enviando}
                      className="flex flex-col items-center gap-1 rounded-xl border-2 border-red-600/40 bg-red-500/10 px-4 py-6 text-red-300 transition-colors hover:border-red-500 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <span className="text-3xl" aria-hidden="true">
                        ✕
                      </span>
                      <span className="text-base font-semibold">Discordar</span>
                    </button>
                  </div>

                  {erroFormulario && (
                    <p className="mt-3 text-sm text-red-400" role="alert">
                      {erroFormulario}
                    </p>
                  )}

                  <div className="mt-4 flex justify-end border-t border-base-border pt-4">
                    <button
                      type="button"
                      onClick={limparSelecao}
                      disabled={enviando}
                      className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
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
