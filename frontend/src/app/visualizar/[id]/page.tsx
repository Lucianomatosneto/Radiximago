'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import Topbar from '../../../components/Topbar'
import { ChipList } from '../../../components/detalhe/Chip'
import NavegacaoCasos from '../../../components/detalhe/NavegacaoCasos'
import ColunaEstudos from '../../../components/detalhe/ColunaEstudos'
import ColunaSeries, { SerieEstudo } from '../../../components/visualizador/ColunaSeries'
import BarraClassificacao from '../../../components/detalhe/BarraClassificacao'
import MarcacaoAchado from '../../../components/detalhe/MarcacaoAchado'
import Logo from '../../../components/Logo'
import type { Marcacao } from '../../../lib/marcacoes'

const OPCOES_TIPO_RADIOGRAFIA = [
  { valor: 'periapical', label: 'Periapical' },
  { valor: 'panoramica', label: 'Panorâmica' },
  { valor: 'interproximal', label: 'Interproximal' },
  { valor: 'oclusal', label: 'Oclusal' },
]

const OPCOES_QUALIDADE_TECNICA = [
  { valor: 'otima', label: 'Ótima' },
  { valor: 'boa', label: 'Boa' },
  { valor: 'regular', label: 'Regular' },
  { valor: 'insatisfatoria', label: 'Insatisfatória' },
]

// Somente os campos que /search realmente devolve. genero, idade_min/max,
// curador e data da curadoria NAO fazem parte dessa resposta hoje (esse
// endpoint e o unico acessivel pra quem nao e curador/administrador, e
// nao pode ser trocado nem alterado neste sprint) - por isso essas secoes
// mostram "-" onde o dado ainda nao esta disponivel, em vez de inventar
// informacao.
interface ImagemDidatica {
  curation_id: number
  tipo_radiografia: string | null
  achado_principal: string | null
  dentes: number[] | null
  achados_detalhe: string | null
  alteracoes_observadas: string[] | null
  marcacoes: Marcacao[]
  qualidade_tecnica: string | null
  descricao_didatica: string | null
  viewer_url: string | null
}

function rotular(opcoes: { valor: string; label: string }[], valor: string | null): string {
  if (!valor) return '—'
  return opcoes.find((o) => o.valor === valor)?.label ?? valor
}

export default function VisualizarImagemPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const curationId = Number(params.id)

  const [lista, setLista] = useState<ImagemDidatica[]>([])
  const [imagem, setImagem] = useState<ImagemDidatica | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [series, setSeries] = useState<SerieEstudo[]>([])
  const [carregandoSeries, setCarregandoSeries] = useState(false)
  const [indiceSerie, setIndiceSerie] = useState(0)
  // Tela cheia: esta pagina nao tinha essa opcao (diferente do
  // VisualizadorSequencial, que ja tinha) - pedido explicito pra criar.
  // Aplica na COLUNA PRINCIPAL inteira (visualizador + classificacao +
  // marcacao), nao so no iframe, seguindo o mesmo principio ja usado na
  // Curadoria: em tela cheia continua dando pra ver as informacoes da
  // imagem, nao so o OHIF sozinho.
  const colunaPrincipalRef = useRef<HTMLDivElement>(null)
  const [telaCheia, setTelaCheia] = useState(false)

  useEffect(() => {
    function aoMudarTelaCheia() {
      setTelaCheia(document.fullscreenElement === colunaPrincipalRef.current)
    }
    document.addEventListener('fullscreenchange', aoMudarTelaCheia)
    return () => document.removeEventListener('fullscreenchange', aoMudarTelaCheia)
  }, [])

  async function alternarTelaCheia() {
    if (!colunaPrincipalRef.current) return
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await colunaPrincipalRef.current.requestFullscreen()
      }
    } catch {
      // navegador pode negar (ex.: sem interacao do usuario) - ignora
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      router.push('/login')
      return
    }
    buscarImagem(token)
    buscarSeries(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, curationId])

  async function buscarSeries(token: string) {
    setCarregandoSeries(true)
    setSeries([])
    setIndiceSerie(0)
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${curationId}/series`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resposta.ok) return
      const dados = await resposta.json()
      setSeries(dados.series ?? [])
    } catch {
      // coluna de series so fica vazia
    } finally {
      setCarregandoSeries(false)
    }
  }

  async function buscarImagem(token: string) {
    setCarregando(true)
    setErro('')
    try {
      // Nao existe endpoint de busca por id unico neste conjunto publico -
      // reaproveitamos /search (sem filtros, limite maximo permitido) e
      // localizamos o item pelo curation_id na resposta. A mesma lista
      // tambem alimenta a navegacao "Caso anterior / Proximo caso".
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search?limit=200`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro('Não foi possível carregar esta imagem.')
        return
      }
      const dados = await resposta.json()
      const itens: ImagemDidatica[] = dados.itens ?? []
      setLista(itens)
      const encontrada = itens.find((item) => item.curation_id === curationId)
      if (!encontrada) {
        setErro('Imagem não encontrada entre as imagens aprovadas.')
        return
      }
      setImagem(encontrada)
    } catch {
      setErro('Não foi possível carregar esta imagem.')
    } finally {
      setCarregando(false)
    }
  }

  const indiceAtual = lista.findIndex((item) => item.curation_id === curationId)
  const posicaoAtual = indiceAtual >= 0 ? indiceAtual + 1 : null
  const podeAnterior = indiceAtual > 0
  const podeProxima = indiceAtual >= 0 && indiceAtual < lista.length - 1

  function irPara(indice: number) {
    const alvo = lista[indice]
    if (alvo) router.push(`/visualizar/${alvo.curation_id}`)
  }

  // Anexa o SeriesInstanceUID da serie selecionada na coluna de series ao
  // link do OHIF - mesmo padrao ja usado no VisualizadorSequencial e na
  // Curadoria.
  const serieSelecionada = series[indiceSerie] ?? null
  const viewerUrlComSerie =
    imagem?.viewer_url && serieSelecionada
      ? `${imagem.viewer_url}&SeriesInstanceUIDs=${serieSelecionada.series_instance_uid}`
      : imagem?.viewer_url ?? null

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex flex-1 flex-col overflow-y-auto p-6">
          <div className="mb-4">
            <h1 className="text-2xl font-bold text-ink">
              Detalhes <span className="text-brand-300">da imagem</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Consulta científica dos dados analisados pelo curador especialista.
            </p>
          </div>

          {!carregando && !erro && imagem && (
            <NavegacaoCasos
              posicaoAtual={posicaoAtual}
              total={lista.length}
              podeAnterior={podeAnterior}
              podeProxima={podeProxima}
              onAnterior={() => irPara(indiceAtual - 1)}
              onProxima={() => irPara(indiceAtual + 1)}
              onVoltar={() => router.back()}
            />
          )}

          {carregando ? (
            <div className="flex flex-1 items-center justify-center text-slate-400">
              Carregando...
            </div>
          ) : erro ? (
            <div className="flex flex-1 items-center justify-center text-center text-slate-500">
              {erro}
            </div>
          ) : imagem ? (
            <>
              {/* overflow-x-auto: com as duas colunas de navegacao + o
                  painel de informacoes, o visualizador precisa de uma
                  largura minima garantida pra imagem nao ficar pequena -
                  em telas mais estreitas a linha toda rola na horizontal
                  em vez de espremer o visualizador. */}
              <div className="flex flex-1 flex-col gap-4 overflow-x-auto lg:flex-row lg:items-start">
                {/* COLUNA - Exames encontrados na pesquisa (clicar abre
                    outro exame, alem dos botoes Caso anterior/Proximo). */}
                <ColunaEstudos
                  itens={lista}
                  indiceAtual={indiceAtual}
                  onSelecionar={irPara}
                  carregando={carregando}
                />

                {/* COLUNA - Series do estudo aberto. */}
                <ColunaSeries
                  series={series}
                  indiceAtual={indiceSerie}
                  onSelecionar={setIndiceSerie}
                  carregando={carregandoSeries}
                />

                {/* COLUNA PRINCIPAL - visualizador ocupando o maximo de
                    espaco possivel, com uma faixa compacta (no maximo 3
                    linhas) de classificacao logo abaixo. Tambem e o
                    elemento que vira tela cheia (Fullscreen API so mostra
                    o elemento pedido, escondendo tudo fora dele) - assim
                    da pra ver a imagem grande E a classificacao/marcacao
                    sem sair do modo tela cheia. */}
                <div
                  ref={colunaPrincipalRef}
                  className={`flex w-full min-w-[480px] flex-1 flex-col bg-base ${telaCheia ? 'p-4' : ''}`}
                >
                  <section className="flex min-h-[78vh] flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface">
                    <div className="flex items-center justify-between border-b border-base-border px-4 py-3">
                      <div className="flex items-center gap-3">
                        {/* Em tela cheia, so esta coluna fica visivel (Fullscreen
                            API esconde a Topbar, onde a logo normalmente aparece) -
                            por isso ela e repetida aqui, so o icone, pra nao brigar
                            de espaco com o chip de tipo de radiografia. */}
                        <Logo variante="icone" />
                        <ChipList itens={[rotular(OPCOES_TIPO_RADIOGRAFIA, imagem.tipo_radiografia)]} tom="marca" />
                      </div>
                      <button
                        type="button"
                        onClick={alternarTelaCheia}
                        aria-label={telaCheia ? 'Sair da tela cheia' : 'Abrir em tela cheia'}
                        title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
                        className="flex items-center gap-1.5 rounded-full border border-base-border bg-base-surface2 px-3 py-1.5 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                      >
                        {telaCheia ? (
                          <>
                            <span aria-hidden="true">⤡</span> Sair da tela cheia
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true">⛶</span> Tela cheia
                          </>
                        )}
                      </button>
                    </div>
                    {viewerUrlComSerie ? (
                      <iframe
                        key={imagem.curation_id}
                        src={viewerUrlComSerie}
                        title="Visualizador OHIF"
                        className="h-full min-h-[78vh] w-full flex-1 border-0"
                      />
                    ) : (
                      <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
                        Imagem não disponível para visualização
                      </div>
                    )}
                  </section>

                  <BarraClassificacao
                    tipo={rotular(OPCOES_TIPO_RADIOGRAFIA, imagem.tipo_radiografia)}
                    qualidade={rotular(OPCOES_QUALIDADE_TECNICA, imagem.qualidade_tecnica)}
                    dentes={imagem.dentes}
                    alteracoesObservadas={imagem.alteracoes_observadas}
                    achadosDetalhe={imagem.achados_detalhe}
                    descricaoDidatica={imagem.descricao_didatica}
                    achadoPrincipal={imagem.achado_principal}
                  />

                  <MarcacaoAchado
                    curationId={imagem.curation_id}
                    marcacoes={imagem.marcacoes}
                  />
                </div>
              </div>

              <footer className="mt-4 rounded-lg border border-amber-700/40 bg-amber-500/10 px-4 py-3 text-center text-xs text-amber-300">
                Imagem disponibilizada exclusivamente para fins de ensino e pesquisa. Uso
                para diagnóstico clínico não é permitido.
              </footer>
            </>
          ) : null}
        </main>
      </div>
    </div>
  )
}
