'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import MiniaturaImagem from './MiniaturaImagem'
import BarraClassificacao from './detalhe/BarraClassificacao'
import MarcacaoAchado from './detalhe/MarcacaoAchado'
import ImagemPrincipalMarcada from './detalhe/ImagemPrincipalMarcada'
import AnotacoesImagem from './detalhe/AnotacoesImagem'
import Logo from './Logo'
import FundoMapaMundi from './fundo/FundoMapaMundi'
import ThemeToggle from './ThemeToggle'
import SeletorLayout, { type Grade } from './visualizador/SeletorLayout'
import LegendaImagem from './visualizador/LegendaImagem'
import EtiquetaMarcacoes from './visualizador/EtiquetaMarcacoes'
import MenuImpressao from './impressao/MenuImpressao'
import type { Marcacao } from '../lib/marcacoes'

// Os campos de classificacao sao opcionais porque nem toda tela que abre
// este visualizador tem todos disponiveis (Minhas imagens hoje nao manda
// dentes, por exemplo) - quando faltar, a secao correspondente mostra "-"
// em vez de quebrar.
export interface ItemSequencia {
  curation_id: number
  numero: number
  descricao_didatica: string | null
  tipo_radiografia: string | null
  viewer_url: string | null
  achados_detalhe?: string | null
  alteracoes_observadas?: string[] | null
  marcacoes?: Marcacao[]
  qualidade_tecnica?: string | null
  dentes?: number[] | null
  achado_principal?: string | null
}

// `chave` referencia o namespace Pesquisa.opcoes (ja usado na tela de
// Pesquisa avancada) - reaproveitado aqui pra nao duplicar os mesmos
// rotulos numa segunda lista.
const OPCOES_TIPO_RADIOGRAFIA = [
  { valor: 'periapical', chave: 'periapical' },
  { valor: 'panoramica', chave: 'panoramica' },
  { valor: 'interproximal', chave: 'interproximal' },
  { valor: 'oclusal', chave: 'oclusal' },
]

const OPCOES_QUALIDADE_TECNICA = [
  { valor: 'otima', chave: 'otima' },
  { valor: 'boa', chave: 'boa' },
  { valor: 'regular', chave: 'regular' },
  { valor: 'insatisfatoria', chave: 'insatisfatoria' },
]

// Usado na fila de imagens selecionadas (coluna do modo tela cheia) pra
// mostrar o achado principal de cada imagem com o rotulo correto.
const OPCOES_ACHADO_PRINCIPAL = [
  { valor: 'normal', chave: 'normal' },
  { valor: 'carie', chave: 'carie' },
  { valor: 'lesao_periapical', chave: 'lesaoPeriapical' },
  { valor: 'perda_ossea', chave: 'perdaOssea' },
  { valor: 'dente_incluso', chave: 'denteIncluso' },
  { valor: 'tratamento_endodontico', chave: 'tratamentoEndodontico' },
  { valor: 'erro_tecnico', chave: 'erroTecnico' },
  { valor: 'outro', chave: 'outro' },
]

const CLASSE_BOTAO_COMPACTO =
  'rounded-md border border-base-border bg-base-surface/80 px-3 py-1 text-xs text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-60'

function rotular(
  opcoes: { valor: string; chave: string }[],
  valor: string | null | undefined,
  traduzir: (chave: string) => string
): string {
  if (!valor) return '—'
  const opcao = opcoes.find((o) => o.valor === valor)
  return opcao ? traduzir(opcao.chave) : valor
}

// StudyInstanceUID dentro do viewer_url (".../viewer?StudyInstanceUIDs=<uid>")
function estudoDe(viewerUrl: string | null): string | null {
  if (!viewerUrl) return null
  try {
    return new URL(viewerUrl).searchParams.get('StudyInstanceUIDs')
  } catch {
    return null
  }
}

function origemDe(viewerUrl: string | null): string | null {
  if (!viewerUrl) return null
  try {
    return new URL(viewerUrl).origin
  } catch {
    return null
  }
}

// Um endereco do OHIF com todos os estudos da pagina, na ordem, e a grade.
// Retorna null se algum item nao tiver estudo no OHIF.
function montarUrlGrade(itensPagina: ItemSequencia[], grade: Grade): string | null {
  if (itensPagina.length < 2) return null
  const estudos = itensPagina.map((item) => estudoDe(item.viewer_url))
  if (estudos.some((e) => !e)) return null
  try {
    const url = new URL(itensPagina[0].viewer_url as string)
    url.search = ''
    url.searchParams.set('StudyInstanceUIDs', estudos.join(','))
    url.searchParams.set('radixGrade', `${grade.linhas}x${grade.colunas}`)
    // URLSearchParams codifica a virgula como %2C; o OHIF aceita os dois,
    // mas deixamos a virgula legivel como no endereco original
    return url.toString().replace(/%2C/g, ',')
  } catch {
    return null
  }
}

interface Props {
  itens: ItemSequencia[]
  indiceInicial: number
  onFechar: () => void
}

interface InfoSerie {
  eh_serie: boolean
  total_cortes: number
}

interface SerieEstudo {
  series_instance_uid: string
  series_number: string | null
  modality: string | null
  total_instancias: number
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

export default function VisualizadorSequencial({ itens, indiceInicial, onFechar }: Props) {
  const router = useRouter()
  const t = useTranslations('Visualizador')
  const tOpcoes = useTranslations('Pesquisa.opcoes')
  const traduzirTipoRadiografia = (chave: string) => tOpcoes(`tipoRadiografia.${chave}`)
  const traduzirQualidadeTecnica = (chave: string) => tOpcoes(`qualidadeTecnica.${chave}`)
  const traduzirAchadoPrincipal = (chave: string) => tOpcoes(`achadoPrincipal.${chave}`)
  const containerRef = useRef<HTMLDivElement>(null)
  const [indice, setIndice] = useState(indiceInicial)
  const [enviando, setEnviando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [jaSalvo, setJaSalvo] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [telaCheia, setTelaCheia] = useState(false)
  const [infoSerie, setInfoSerie] = useState<InfoSerie | null>(null)
  const [baixandoImagens, setBaixandoImagens] = useState(false)
  const [baixandoDicom, setBaixandoDicom] = useState(false)
  const [baixandoUnico, setBaixandoUnico] = useState(false)
  const [series, setSeries] = useState<SerieEstudo[]>([])
  // curation_id a que a lista em `series` pertence de fato - so aplicamos
  // o SeriesInstanceUID quando esse valor bate com a imagem atual. Sem
  // essa guarda, ao trocar de estudo (seta dupla) a serie da imagem
  // ANTERIOR ficava aplicada por uma fração de segundo na URL do estudo
  // NOVO (o `series`/`indiceSerie` só zeram de forma assíncrona, depois
  // do primeiro render com o `indice` já atualizado) - o OHIF recebia um
  // SeriesInstanceUID que não existe naquele estudo e dava erro.
  const [seriesDoItem, setSeriesDoItem] = useState<number | null>(null)
  const [indiceSerie, setIndiceSerie] = useState(0)
  const [mostrarMarcacao, setMostrarMarcacao] = useState(false)
  // painel "Detalhes" (classificacao completa + marcacao), fechado por padrao
  const [detalhesAbertos, setDetalhesAbertos] = useState(false)
  // "para todas as imagens": ao contrario de mostrarMarcacao, NAO e
  // resetado no efeito abaixo (que roda a cada troca de [indice]) - o
  // pedido explicito foi ligar uma vez e continuar mostrando a marcacao
  // de cada imagem da sequencia automaticamente, sem marcar o checkbox de
  // novo a cada troca.
  const [mostrarMarcacaoTodas, setMostrarMarcacaoTodas] = useState(false)
  const [marcacaoPreviewUrl, setMarcacaoPreviewUrl] = useState('')

  // LAYOUT DA AREA DE IMAGENS (quantas imagens lado a lado). Padrao: 2
  // imagens (1 linha x 2 colunas). Toda vez que o visualizador abre, ele
  // comeca em 1x2 (pedido: sempre abrir assim); trocar o layout vale so
  // enquanto esta tela estiver aberta.
  const [grade, setGrade] = useState<Grade>({ linhas: 1, colunas: 2 })
  function escolherGrade(nova: Grade) {
    setGrade(nova)
  }
  // Com uma imagem so na selecao, nao faz sentido dividir a tela.
  const celulas = Math.min(grade.linhas * grade.colunas, Math.max(1, itens.length))
  const emGrade = celulas > 1
  // "Pagina" de imagens visivel: as celulas mostram itens[inicio .. inicio+celulas-1]
  const inicioPagina = Math.floor(indice / celulas) * celulas
  const itensPagina = itens.slice(inicioPagina, inicioPagina + celulas)
  // Ao trocar de layout, o OHIF recarrega com o 1o quadro ativo - os dados
  // embaixo voltam para a 1a imagem da pagina, para os dois combinarem.
  useEffect(() => {
    if (celulas > 1) setIndice((i) => Math.floor(i / celulas) * celulas)
  }, [celulas])
  // UMA tela so com todas as imagens da pagina: um unico visualizador OHIF
  // recebe todos os estudos da pagina e o parametro radixGrade
  // (LINHASxCOLUNAS). O script do Radix dentro do OHIF (ohif/app-config)
  // divide a area de imagens do proprio OHIF nessa grade - uma barra de
  // ferramentas so, imagens lado a lado, como nos PACS. Se alguma imagem
  // da pagina nao tiver estudo no OHIF, cai na grade de imagens simples.
  const urlGrade = emGrade ? montarUrlGrade(itensPagina, grade) : null
  const origemOhif = origemDe(itens.find((i) => i.viewer_url)?.viewer_url ?? null)

  // Ao clicar numa imagem dentro do OHIF, ele avisa qual estudo ficou
  // ativo - os dados embaixo (classificacao, downloads...) passam a ser os
  // dessa imagem. So aceita mensagens vindas da origem do OHIF.
  useEffect(() => {
    if (!emGrade || !origemOhif) return
    function aoReceber(evento: MessageEvent) {
      if (evento.origin !== origemOhif) return
      const dados = evento.data as { tipo?: unknown; estudo?: unknown } | null
      if (!dados || dados.tipo !== 'radix-estudo-ativo' || typeof dados.estudo !== 'string') return
      const posicao = itens.findIndex((item) => estudoDe(item.viewer_url) === dados.estudo)
      if (posicao >= 0) setIndice(posicao)
    }
    window.addEventListener('message', aoReceber)
    return () => window.removeEventListener('message', aoReceber)
  }, [emGrade, origemOhif, itens])

  const atual = itens[indice]
  const seriesValidas = seriesDoItem === atual.curation_id ? series : []
  const serieAtual = seriesValidas[indiceSerie] ?? null
  const urlComSerie =
    atual.viewer_url && serieAtual
      ? `${atual.viewer_url}&SeriesInstanceUIDs=${serieAtual.series_instance_uid}`
      : atual.viewer_url
  const marcacoes = atual.marcacoes ?? []
  const marcacaoDisponivel = marcacoes.length > 0
  // Junta os dois toggles num unico flag de exibicao: mostra se "esta
  // imagem" estiver ligado (o de sempre, reseta a cada troca) OU se
  // "todas as imagens" estiver ligado (persiste) - sempre condicionado a
  // ter marcacao disponivel na imagem atual.
  const mostrarMarcacaoEfetivo = (mostrarMarcacao || mostrarMarcacaoTodas) && marcacaoDisponivel
  // Quais imagens mostram a marcacao do curador desenhada: todas que tiverem
  // marcacao, se o icone "Marcações do curador" estiver ligado; ou so a
  // imagem escolhida, se a marcacao dela foi ligada em "Detalhes".
  const mostraMarcacaoDe = (item: ItemSequencia) =>
    (item.marcacoes ?? []).length > 0 &&
    (mostrarMarcacaoTodas || (mostrarMarcacao && item.curation_id === atual.curation_id))
  const selecaoTemMarcacao = itens.some((item) => (item.marcacoes ?? []).length > 0)

  useEffect(() => {
    setMensagem('')
    setErro('')
    setJaSalvo(false)
    setMostrarMarcacao(false)
    setInfoSerie(null)
    setIndiceSerie(0)
    setMarcacaoPreviewUrl('')

    let cancelado = false
    let urlObjetoMarcacao = ''
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${atual.curation_id}/serie-info`, {
      credentials: 'include',
    })
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((dados) => {
        if (dados && !cancelado) setInfoSerie(dados)
      })
      .catch(() => {
        // sem essa informacao, a tela continua mostrando o download simples
      })

    if (atual.viewer_url) {
      const curationIdDaBusca = atual.curation_id
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${curationIdDaBusca}/series`, {
        credentials: 'include',
      })
        .then((resposta) => (resposta.ok ? resposta.json() : null))
        .then((dados) => {
          if (dados?.series && !cancelado) {
            setSeries(dados.series)
            setSeriesDoItem(curationIdDaBusca)
          }
        })
        .catch(() => {
          // sem essa informacao, a navegacao entre series fica indisponivel
        })
    }

    // Baixa a imagem da marcacao ANTECIPADAMENTE, assim que o estudo abre -
    // antes, esse download (varios MB) so comecava no instante em que o
    // usuario ligava "Mostrar marcação", o que deixava a troca visivelmente
    // lenta. Com isso, quando o checkbox e marcado a imagem geralmente ja
    // esta pronta.
    if ((atual.marcacoes ?? []).length > 0) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${atual.curation_id}/preview`, {
        credentials: 'include',
      })
        .then((resposta) => (resposta.ok ? resposta.blob() : null))
        .then((blob) => {
          if (blob && !cancelado) {
            urlObjetoMarcacao = URL.createObjectURL(blob)
            setMarcacaoPreviewUrl(urlObjetoMarcacao)
          }
        })
        .catch(() => {
          // sem pre-carregamento, o componente busca a imagem na hora de mostrar
        })
    }

    return () => {
      cancelado = true
      if (urlObjetoMarcacao) URL.revokeObjectURL(urlObjetoMarcacao)
    }
  }, [indice])

  useEffect(() => {
    function aoMudarTelaCheia() {
      setTelaCheia(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', aoMudarTelaCheia)
    aoMudarTelaCheia()
    // Abre JA em tela cheia. O navegador so permite isso logo depois de um
    // clique da pessoa - como o visualizador abre a partir de um clique
    // ("Ver imagens selecionadas", miniatura...), o pedido feito aqui, na
    // abertura, normalmente e aceito. Se o navegador recusar, a tela abre
    // normal e o botao "Tela cheia" continua disponivel.
    const painel = containerRef.current
    if (painel && document.fullscreenElement !== painel && painel.requestFullscreen) {
      painel.requestFullscreen().catch(() => {
        // recusado pelo navegador: segue fora da tela cheia
      })
    }
    return () => document.removeEventListener('fullscreenchange', aoMudarTelaCheia)
  }, [])

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'ArrowRight') irParaProxima()
      else if (evento.key === 'ArrowLeft') irParaAnterior()
      else if ((evento.key === 'k' || evento.key === 'K') && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
        const alvo = evento.target as HTMLElement | null
        if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return
        setMostrarMarcacaoTodas((v) => !v)
      }
      else if (evento.key === 'Escape' && !document.fullscreenElement) onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice])

  async function alternarTelaCheia() {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  }

  // Em grade, as setas avancam/voltam uma "pagina" inteira de imagens.
  function irParaAnterior() {
    if (emGrade) {
      setIndice((i) => Math.max(0, Math.floor(i / celulas) * celulas - celulas))
      return
    }
    setIndice((i) => (i > 0 ? i - 1 : i))
  }

  function irParaProxima() {
    if (emGrade) {
      setIndice((i) => {
        const proxima = Math.floor(i / celulas) * celulas + celulas
        return proxima < itens.length ? proxima : i
      })
      return
    }
    setIndice((i) => (i < itens.length - 1 ? i + 1 : i))
  }

  function irParaSerieAnterior() {
    setIndiceSerie((i) => (i > 0 ? i - 1 : i))
  }

  function irParaProximaSerie() {
    setIndiceSerie((i) => (i < seriesValidas.length - 1 ? i + 1 : i))
  }

  async function baixarArquivo(
    caminho: string,
    nomeArquivo: string,
    setCarregando: (valor: boolean) => void
  ) {
    setCarregando(true)
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
        credentials: 'include',
      })
      if (!resposta.ok) {
        setErro(t('erroBaixar'))
        return
      }
      const blob = await resposta.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = nomeArquivo
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setErro(t('erroBaixar'))
    } finally {
      setCarregando(false)
    }
  }

  function baixarUnico() {
    // Se "Mostrar marcação" (esta imagem ou todas) estiver ligado e a
    // imagem atual tiver marcacao, o arquivo baixado ja vem com a
    // marcacao do curador desenhada nele (com_marcacao=true) - assim o
    // arquivo salvo no computador mostra a mesma coisa que estava na tela,
    // em vez da imagem crua.
    const sufixo = mostrarMarcacaoEfetivo ? '?com_marcacao=true' : ''
    baixarArquivo(
      `/search/${atual.curation_id}/preview${sufixo}`,
      `radix-imago-${atual.curation_id}.png`,
      setBaixandoUnico
    )
  }

  function baixarZipImagens() {
    // Sem com_marcacao aqui de proposito: a marcacao do curador e um
    // desenho relativo a UMA imagem representativa do caso, nao a cada
    // corte da serie - aplicar a mesma marcacao em todos os cortes do ZIP
    // ficaria no lugar errado na maioria deles.
    baixarArquivo(
      `/search/${atual.curation_id}/download/imagens.zip`,
      `radix-imago-${atual.curation_id}-imagens.zip`,
      setBaixandoImagens
    )
  }

  function baixarZipDicom() {
    baixarArquivo(
      `/search/${atual.curation_id}/download/dicom.zip`,
      `radix-imago-${atual.curation_id}-dicom.zip`,
      setBaixandoDicom
    )
  }

  async function salvarNoUsuario() {
    setSalvando(true)
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/saved-images/${atual.curation_id}`, {
        method: 'POST',
        credentials: 'include',
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, t('erroSalvar')))
        return
      }
      setJaSalvo(true)
      setMensagem(t('imagemSalva'))
    } catch {
      setErro(t('erroSalvar'))
    } finally {
      setSalvando(false)
    }
  }

  async function enviarPorEmail() {
    setEnviando(true)
    setErro('')
    try {
      // Mesma regra do download: se a marcacao estiver sendo mostrada na
      // tela, o e-mail sai com a marcacao ja desenhada na imagem.
      const sufixo = mostrarMarcacaoEfetivo ? '?com_marcacao=true' : ''
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/search/${atual.curation_id}/send-email${sufixo}`,
        {
          method: 'POST',
          credentials: 'include',
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, t('erroEnviarEmail')))
        return
      }
      const dados = await resposta.json()
      setMensagem(dados.mensagem ?? t('emailEnviado'))
    } catch {
      setErro(t('erroEnviarEmail'))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 isolate flex flex-col bg-base">
      {/* Mesmo padrao visual das demais telas: mapa-mundi discreto (modo
          leitura) ao fundo. Fica DENTRO deste painel (que cobre a tela e
          tambem e o elemento que entra em tela cheia), atras de tudo. As
          areas das imagens continuam pretas, para a leitura. */}
      <FundoMapaMundi intensidade="leitura" />
      <div className="relative z-40 flex items-center justify-between border-b border-base-border bg-base/60 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-4">
          {/* Este visualizador cobre a tela inteira (fixed inset-0), inclusive
              a Topbar (onde a logo normalmente aparece) - por isso ela e
              repetida aqui, na variante "escuro". Esta tela acompanha o
              alternador de tema claro/escuro (botao <ThemeToggle> abaixo),
              igual as outras telas do sistema - por isso o fundo (bg-base) e
              os textos usam as variaveis de tema, em vez de cores fixas. */}
          <Logo variante="escuro" />
          <div className="text-sm text-slate-300">
            {t('imagemPrefixo')} <span className="font-semibold text-ink">#{atual.numero}</span>{' '}
            <span className="text-slate-500">
              {emGrade
                ? t('paginaDeSelecionadas', {
                    de: inicioPagina + 1,
                    ate: inicioPagina + itensPagina.length,
                    total: itens.length,
                  })
                : t('deSelecionadas', { indice: indice + 1, total: itens.length })}
            </span>
            {seriesValidas.length > 1 && (
              <span className="text-slate-500">
                {' '}
                {t('serieDe', { indice: indiceSerie + 1, total: seriesValidas.length })}
                {serieAtual?.total_instancias ? ` ${t('cortes', { total: serieAtual.total_instancias })}` : ''}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Liga/desliga as marcacoes do curador desenhadas em TODAS as
              imagens que tiverem marcacao (atalho: tecla K). */}
          <button
            type="button"
            onClick={() => setMostrarMarcacaoTodas((v) => !v)}
            disabled={!selecaoTemMarcacao}
            aria-pressed={mostrarMarcacaoTodas}
            title={selecaoTemMarcacao ? t('marcacoes.botaoTitulo') : t('marcacoes.semMarcacao')}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
              mostrarMarcacaoTodas
                ? 'border-amber-300/80 bg-amber-300/15 text-amber-200'
                : 'border-base-border text-slate-300 hover:border-amber-300/60 hover:text-amber-200'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <ellipse cx="12" cy="12" rx="9" ry="6.5" />
              <path d="M4 20l4-4" />
            </svg>
            <span>{t('marcacoes.botao')}</span>
            <kbd className="hidden rounded border border-current/40 px-1 text-[10px] opacity-70 md:inline">K</kbd>
          </button>
          {itens.length > 1 && <SeletorLayout grade={grade} onEscolher={escolherGrade} />}
          <ThemeToggle />
          <button
            type="button"
            onClick={alternarTelaCheia}
            aria-label={telaCheia ? t('sairTelaCheia') : t('telaCheia')}
            className="rounded-full border border-base-border px-3 py-1.5 text-sm text-slate-300 hover:border-brand hover:text-brand-300"
          >
            {telaCheia ? `⛶ ${t('sairTelaCheia')}` : `⛶ ${t('telaCheia')}`}
          </button>
          <button
            type="button"
            onClick={onFechar}
            aria-label={t('fechar')}
            className="rounded-full border border-base-border px-3 py-1.5 text-sm text-slate-300 hover:border-brand hover:text-brand-300"
          >
            ✕ {t('fechar')}
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {/* Seta de voltar (pagina/imagem anterior), colada na borda esquerda. */}
        <div
          className={"absolute left-2 z-30 flex items-center gap-1.5 sm:left-6"}
        >
          <button
            type="button"
            onClick={irParaAnterior}
            disabled={emGrade ? inicioPagina === 0 : indice === 0}
            aria-label={t('estudoAnteriorAria')}
            title={t('estudoAnterior')}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 disabled:opacity-30"
          >
            «
          </button>
          {seriesValidas.length > 1 && (
            <button
              type="button"
              onClick={irParaSerieAnterior}
              disabled={indiceSerie === 0}
              aria-label={t('serieAnterior')}
              title={t('serieAnteriorTitulo')}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 disabled:opacity-30"
            >
              ‹
            </button>
          )}
        </div>

        {emGrade && urlGrade && !itensPagina.some(mostraMarcacaoDe) ? (
          // UMA tela, um visualizador: o OHIF divide a propria area de
          // imagens na grade escolhida (ver montarUrlGrade). A "key" faz o
          // OHIF recarregar so quando muda a pagina ou o layout.
          <div className="relative h-full w-full px-14 sm:px-16">
            <iframe
              key={urlGrade}
              src={urlGrade}
              referrerPolicy="origin"
              title={t('layout.visualizadorGradeTitulo', { total: itensPagina.length })}
              className="h-full w-full border-0 bg-black"
            />
            {/* Selos de marcacao no canto de cada quadro do OHIF. O OHIF
                roda em outra origem e nao deixa colocar nada DENTRO dele,
                entao esta camada transparente repete a mesma grade por
                cima, descontando a barra de ferramentas do OHIF (topo) e
                as faixas laterais estreitas. So os selos recebem clique. */}
            <div
              className="pointer-events-none absolute inset-y-0 left-14 right-14 grid pb-1 pl-10 pr-10 pt-[52px] sm:left-16 sm:right-16"
              style={{ gridTemplateColumns: `repeat(${grade.colunas}, minmax(0,1fr))`, gridTemplateRows: `repeat(${grade.linhas}, minmax(0,1fr))` }}
            >
              {itensPagina.map((item) => (
                <div key={item.curation_id} className="relative">
                  <EtiquetaMarcacoes item={item} className="right-9 top-2" />
                </div>
              ))}
            </div>
          </div>
        ) : emGrade ? (
          // Sem OHIF (ou com a marcacao do curador ligada): as imagens da
          // pagina numa UNICA area preta, separadas so por linhas finas -
          // sem molduras nem barras por imagem. Clique escolhe a imagem
          // (dados embaixo); clique duplo abre so ela (layout de 1).
          <div className="h-full w-full px-14 sm:px-16">
            <div
              className="grid h-full w-full gap-px overflow-hidden bg-white/10"
              style={{ gridTemplateColumns: `repeat(${grade.colunas}, minmax(0,1fr))`, gridTemplateRows: `repeat(${grade.linhas}, minmax(0,1fr))` }}
            >
              {Array.from({ length: celulas }, (_, k) => {
                const idx = inicioPagina + k
                const item = itens[idx]
                if (!item) return <div key={`vazio-${k}`} className="bg-black" />
                const ativa = idx === indice
                return (
                  <div
                    key={item.curation_id}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setIndice(idx)
                    }}
                    onClick={() => setIndice(idx)}
                    onDoubleClick={() => {
                      setIndice(idx)
                      escolherGrade({ linhas: 1, colunas: 1 })
                    }}
                    title={t('layout.celulaDica')}
                    aria-label={t('irParaImagem', { numero: item.numero })}
                    aria-pressed={ativa}
                    className={`relative flex min-h-0 min-w-0 items-center justify-center bg-black ${ativa ? 'ring-2 ring-inset ring-teal-400/80' : ''}`}
                  >
                    {mostraMarcacaoDe(item) ? (
                      <ImagemPrincipalMarcada
                        curationId={item.curation_id}
                        alt={item.descricao_didatica ?? t('imagemNumero', { numero: item.numero })}
                        marcacoes={item.marcacoes ?? []}
                        srcPreCarregado={ativa ? marcacaoPreviewUrl : undefined}
                      />
                    ) : (
                      <MiniaturaImagem
                        curationId={item.curation_id}
                        alt={item.descricao_didatica ?? t('imagemNumero', { numero: item.numero })}
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                    {/* etiqueta discreta no canto, como nos PACS */}
                    <span className="pointer-events-none absolute left-2 top-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-teal-200">
                      #{item.numero}
                    </span>
                    <EtiquetaMarcacoes item={item} className="right-2 top-2" />
                  </div>
                )
              })}
            </div>
          </div>
        ) : mostrarMarcacaoEfetivo ? (
          // Mesma caixa (h-full w-full) que o iframe ocupa logo abaixo -
          // a imagem nao muda de tamanho nem de posicao ao ligar/desligar
          // a marcacao, so as formas aparecem/somem.
          <ImagemPrincipalMarcada
            curationId={atual.curation_id}
            alt={atual.descricao_didatica ?? t('imagemNumero', { numero: atual.numero })}
            marcacoes={marcacoes}
            srcPreCarregado={marcacaoPreviewUrl}
          />
        ) : urlComSerie ? (
          <iframe
            key={atual.curation_id}
            src={urlComSerie}
            title={t('visualizadorOhifTitulo', { numero: atual.numero })}
            className="h-full w-full flex-1 border-0"
          />
        ) : (
          <MiniaturaImagem
            curationId={atual.curation_id}
            alt={atual.descricao_didatica ?? t('imagemNumero', { numero: atual.numero })}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        )}

        {/* Selo das marcacoes do curador no canto da imagem (layout de 1) */}
        {!emGrade && (
          <EtiquetaMarcacoes
            item={atual}
            className={urlComSerie && !mostrarMarcacaoEfetivo ? 'right-24 top-[60px]' : 'right-20 top-3'}
          />
        )}

        {/* Lembrete dos atalhos de teclado do proprio visualizador OHIF
            (nao e algo que a gente controla - sao atalhos que ja existem
            dentro dele) - so aparece quando o OHIF esta de fato na tela
            (nao faz sentido com a imagem com marcacao ou sem estudo). "R"
            gira a imagem 90 graus e "I" inverte a janela (troca claro por
            escuro, como um negativo de raio-x) - cada atalho numa linha,
            com a letra dentro de um "selo" solido colorido (como uma tecla
            de teclado) em vez de so texto colorido - mais facil de ver, e
            resolve a letra "R" não aparecendo direito antes. Do lado
            esquerdo da imagem - quando a fila estiver visivel, empurrado
            pra depois dela (mesma logica da seta « de voltar), senao fica
            colado na borda. */}
        {urlComSerie && !mostrarMarcacaoEfetivo && !emGrade && (
          <div
            className={`pointer-events-none absolute bottom-3 z-10 flex flex-col gap-1.5 rounded-lg bg-black/60 px-3 py-2 text-xs text-white/90 backdrop-blur ${
              'left-3 sm:left-6'
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-400 text-sm font-bold text-black">
                R
              </span>
              {t('giraImagem')}
            </span>
            <span className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-cyan-400 text-sm font-bold text-black">
                I
              </span>
              {t('inverteJanela')}
            </span>
          </div>
        )}

        <div className="absolute right-2 z-10 flex items-center gap-1.5 sm:right-6">
          {seriesValidas.length > 1 && (
            <button
              type="button"
              onClick={irParaProximaSerie}
              disabled={indiceSerie === seriesValidas.length - 1}
              aria-label={t('proximaSerie')}
              title={t('proximaSerieTitulo')}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 disabled:opacity-30"
            >
              ›
            </button>
          )}
          <button
            type="button"
            onClick={irParaProxima}
            disabled={emGrade ? inicioPagina + celulas >= itens.length : indice === itens.length - 1}
            aria-label={t('proximoEstudo')}
            title={t('proximoEstudoTitulo')}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 disabled:opacity-30"
          >
            »
          </button>
        </div>

        {/* Anotacoes pessoais de estudo - qualquer usuario pode clicar em
            "+ Anotação" e marcar um ponto na imagem com uma nota colorida.
            Fica por cima de tudo (inclusive do visualizador OHIF, que roda
            num iframe) sem atrapalhar a navegacao normal - ver comentario
            dentro do proprio componente pra entender por que precisa desse
            botao em vez de so botao direito do mouse. */}
        {/* Anotacoes pessoais: so no layout de 1 imagem (a anotacao e
            presa a posicao da imagem na tela). */}
        {!emGrade && (
          <AnotacoesImagem
            curationId={atual.curation_id}
            filaVisivel={false}
          />
        )}
      </div>

      {/* LEGENDAS: o texto de cada imagem fica logo abaixo dela, em ate
          duas linhas pequenas - o foco da tela e a imagem. Em grade, cada
          legenda fica na mesma coluna da sua imagem. Clicar numa legenda
          escolhe aquela imagem (os botoes e os detalhes passam a ser dela). */}
      <div
        className="relative z-10 grid gap-x-2 gap-y-1 border-t border-base-border bg-base/70 px-14 py-1.5 backdrop-blur-md sm:px-16"
        style={{ gridTemplateColumns: `repeat(${emGrade ? grade.colunas : 1}, minmax(0,1fr))` }}
      >
        {(emGrade ? itensPagina : [atual]).map((item) => {
          const posicao = itens.indexOf(item)
          return (
            <LegendaImagem
              key={item.curation_id}
              item={item}
              ativa={emGrade && posicao === indice}
              onEscolher={() => setIndice(posicao)}
              tipo={rotular(OPCOES_TIPO_RADIOGRAFIA, item.tipo_radiografia, traduzirTipoRadiografia)}
              qualidade={item.qualidade_tecnica ? rotular(OPCOES_QUALIDADE_TECNICA, item.qualidade_tecnica, traduzirQualidadeTecnica) : null}
              achado={item.achado_principal ? rotular(OPCOES_ACHADO_PRINCIPAL, item.achado_principal, traduzirAchadoPrincipal) : null}
            />
          )
        })}
      </div>

      {/* Barra de acoes compacta (uma linha). A classificacao completa e a
          marcacao do curador ficam em "Detalhes", que abre por cima da
          imagem so quando a pessoa pede. */}
      <div className="relative z-40 border-t border-base-border bg-base/80 px-4 py-1.5 backdrop-blur-md sm:px-6">
        {detalhesAbertos && (
          <div className="absolute inset-x-0 bottom-full max-h-[60vh] overflow-y-auto border-t border-base-border bg-base-surface/95 px-4 pb-4 pt-2 shadow-2xl backdrop-blur-md sm:px-6">
            <div className="mx-auto max-w-4xl">
              <p className="text-xs font-semibold text-teal-200">
                {t('imagemNumero', { numero: atual.numero })}
              </p>
              <BarraClassificacao
                tipo={rotular(OPCOES_TIPO_RADIOGRAFIA, atual.tipo_radiografia, traduzirTipoRadiografia)}
                qualidade={rotular(OPCOES_QUALIDADE_TECNICA, atual.qualidade_tecnica, traduzirQualidadeTecnica)}
                dentes={atual.dentes}
                alteracoesObservadas={atual.alteracoes_observadas}
                achadosDetalhe={atual.achados_detalhe}
                descricaoDidatica={atual.descricao_didatica}
                achadoPrincipal={atual.achado_principal}
              />
              <MarcacaoAchado
                curationId={atual.curation_id}
                marcacoes={marcacoes}
                comImagem={false}
                mostrar={mostrarMarcacao}
                onMostrarChange={setMostrarMarcacao}
                mostrarTodas={mostrarMarcacaoTodas}
                onMostrarTodasChange={setMostrarMarcacaoTodas}
              />
              {atual.viewer_url && (
                <p className="mt-3 text-xs text-slate-400">
                  {t('instrucaoRolagem')}
                  {seriesValidas.length > 1 && t('instrucaoSeries')}
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setDetalhesAbertos((v) => !v)}
              aria-expanded={detalhesAbertos}
              className={`${CLASSE_BOTAO_COMPACTO} ${detalhesAbertos ? 'border-teal-400/70 text-teal-200' : ''}`}
            >
              {detalhesAbertos ? `▾ ${t('ocultarDetalhes')}` : `▴ ${t('detalhes')}`}
              {marcacaoDisponivel && (
                <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle" title={t('temMarcacao')} />
              )}
            </button>
            {mensagem && <span className="truncate text-xs text-emerald-400">{mensagem}</span>}
            {erro && (
              <span className="truncate text-xs text-red-400" role="alert">
                {erro}
              </span>
            )}
          </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <MenuImpressao
                compacto
                grupos={[
                  { chave: 'todas', rotulo: t('impressao.todas'), itens: itens },
                  { chave: 'tela', rotulo: t('impressao.daTela'), itens: emGrade ? itensPagina : [atual] },
                ]}
              />
            {infoSerie?.eh_serie ? (
              <>
                <button
                  type="button"
                  onClick={baixarZipImagens}
                  disabled={baixandoImagens}
                  className={CLASSE_BOTAO_COMPACTO}
                >
                  {baixandoImagens
                    ? t('baixando')
                    : t('baixarImagensZip', { total: infoSerie.total_cortes })}
                </button>
                <button
                  type="button"
                  onClick={baixarZipDicom}
                  disabled={baixandoDicom}
                  className={CLASSE_BOTAO_COMPACTO}
                >
                  {baixandoDicom ? t('baixando') : t('baixarDicomZip')}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={baixarUnico}
                disabled={baixandoUnico}
                className={CLASSE_BOTAO_COMPACTO}
              >
                {baixandoUnico ? t('baixando') : t('baixar')}
              </button>
            )}
            <button
              type="button"
              onClick={salvarNoUsuario}
              disabled={salvando || jaSalvo}
              className={CLASSE_BOTAO_COMPACTO}
            >
              {jaSalvo ? t('salva') : salvando ? t('salvando') : t('salvarNoUsuario')}
            </button>
            {!infoSerie?.eh_serie && (
              <button
                type="button"
                onClick={enviarPorEmail}
                disabled={enviando}
                className={CLASSE_BOTAO_COMPACTO}
              >
                {enviando ? t('enviando') : t('enviarPorEmail')}
              </button>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
