'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import MiniaturaImagem from './MiniaturaImagem'
import ImagemPrincipalMarcada from './detalhe/ImagemPrincipalMarcada'
import AnotacoesImagem from './detalhe/AnotacoesImagem'
import Logo from './Logo'
import FundoMapaMundi from './fundo/FundoMapaMundi'
import ThemeToggle from './ThemeToggle'
import SeletorLayout, { type Grade } from './visualizador/SeletorLayout'
import EtiquetaMarcacoes from './visualizador/EtiquetaMarcacoes'
import MenuImpressao from './impressao/MenuImpressao'
import type { Marcacao } from '../lib/marcacoes'
import type { InfoCompartilhamento } from './compartilhar/AnotacoesCompartilhadas'
import { textoMarcacao } from '../lib/descricaoCuradoria'
import { girarMarcacoes } from '../lib/orientacao'
import { obterSessaoAtual } from '../lib/sessao'

// Os campos de classificacao sao opcionais porque nem toda tela que abre
// este visualizador tem todos disponiveis (Minhas imagens hoje nao manda
// dentes, por exemplo) - quando faltar, a secao correspondente mostra "-"
// em vez de quebrar.
export interface ItemSequencia {
  curation_id: number
  numero: number
  descricao_didatica: string | null
  erros_tecnicos?: string[]
  tipo_radiografia: string | null
  viewer_url: string | null
  achados_detalhe?: string | null
  alteracoes_observadas?: string[] | null
  marcacoes?: Marcacao[]
  qualidade_tecnica?: string | null
  dentes?: number[] | null
  achado_principal?: string | null
  /** imagem recebida em "Compartilhadas comigo" */
  compartilhamento?: InfoCompartilhamento
}

const CLASSE_BOTAO_COMPACTO =
  'rounded-md border border-base-border bg-base-surface/80 px-3 py-1 text-xs text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-60'

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
    // abre sem a coluna "Studies" do OHIF (ver ohif/app-config.template.js)
    url.searchParams.set('radixRecolherEstudos', '1')
    // tecla R: quem decide e o Radix (ver girarImagem)
    url.searchParams.set('radixTeclaR', '1')
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
  /** "Expandir" de Minhas imagens: imagem na METADE ESQUERDA e a descricao
   *  da imagem (quadro ampliado) na metade direita; a coluna "Studies" do
   *  OHIF (miniaturas a esquerda) fica recolhida */
  descricaoAoLado?: boolean
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

export default function VisualizadorSequencial({ itens: itensRecebidos, indiceInicial, onFechar, descricaoAoLado = false }: Props) {
  const router = useRouter()
  // GIRAR NO VISUALIZADOR (pedido de 20/10/2026):
  // - "R" (todos): gira so na tela, como o atalho do proprio OHIF;
  // - "Salvar em pe" (curadoria): grava o giro no arquivo (sem perda) - a
  //   imagem passa a abrir na posicao certa para todos. As marcacoes giram
  //   junto: aqui guardamos a versao girada para desenhar no lugar certo.
  const [marcacoesGiradas, setMarcacoesGiradas] = useState<Record<number, Marcacao[]>>({})
  const [versaoArquivo, setVersaoArquivo] = useState<Record<number, number>>({})
  const [podeSalvarGiro, setPodeSalvarGiro] = useState(false)
  const [salvandoGiro, setSalvandoGiro] = useState(false)
  const [erroGiro, setErroGiro] = useState('')
  useEffect(() => {
    obterSessaoAtual().then((s) => setPodeSalvarGiro(!!s && ['administrador', 'suporte', 'curador'].includes(s.perfil)))
  }, [])
  const itens = useMemo(
    () =>
      itensRecebidos.map((item) =>
        marcacoesGiradas[item.curation_id] ? { ...item, marcacoes: marcacoesGiradas[item.curation_id] } : item
      ),
    [itensRecebidos, marcacoesGiradas]
  )
  const t = useTranslations('Visualizador')
  const tDescricao = useTranslations('DescricaoCuradoria')
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
  // painel "Detalhes" (classificacao completa + marcacao), fechado por padrao
  // MARCACOES DO CURADOR: quais imagens (curation_id) estao com a marcacao
  // ligada. Cada imagem liga/desliga pelo seu proprio selo; o botao do topo
  // (ou a tecla K) liga/desliga todas. A escolha de cada imagem continua
  // valendo ao navegar entre elas.
  const [marcacoesLigadas, setMarcacoesLigadas] = useState<number[]>([])
  // Marcacao destacada pela DESCRICAO (mouse sobre a linha "Marcação N")
  // e o "holofote" (escurece a imagem fora da marcacao em foco).
  const [focoMarcacao, setFocoMarcacao] = useState<{ uid: string; indice: number } | null>(null)
  const [holofote, setHolofote] = useState(false)
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

  // Envia ao OHIF as marcacoes das imagens que estao nele e quais estao
  // ligadas - ele mesmo desenha as formas por cima da imagem.
  const ohifRef = useRef<HTMLIFrameElement>(null)
  const enviarMarcacoesRef = useRef<() => void>(() => {})
  enviarMarcacoesRef.current = () => {
    const janela = ohifRef.current?.contentWindow
    if (!janela || !origemOhif) return
    // cada marcacao leva o texto ja traduzido ("Marcação 1: Cárie"),
    // que o OHIF mostra ao passar o mouse sobre o numero ou a forma
    const estudos: Record<string, (Marcacao & { texto: string })[]> = {}
    const visiveis: string[] = []
    for (const item of emGrade ? itensPagina : [itens[indice]]) {
      const uid = estudoDe(item?.viewer_url ?? null)
      if (!uid) continue
      estudos[uid] = (item.marcacoes ?? []).map((m, i) => ({
        ...m,
        texto: `${tDescricao('marcacaoN', { numero: i + 1 })}: ${textoMarcacao(m)}`,
      }))
      if (marcacoesLigadas.includes(item.curation_id)) visiveis.push(uid)
    }
    // quadro de informacoes na metade direita: o OHIF deixa esse espaco livre
    // so na area das imagens (a barra de ferramentas continua inteira)
    const largura = areaRef.current?.getBoundingClientRect().width ?? 0
    const espacoDireita = encolherArea && ohifUnico && largura ? Math.round(largura / 2) : 0
    janela.postMessage({ tipo: 'radix-marcacoes', estudos, visiveis, foco: focoMarcacao, holofote, espacoDireita }, origemOhif)
  }
  useEffect(() => {
    enviarMarcacoesRef.current()
  })
  // Botao "R ⟳" de cada imagem e a tecla R: a CURADORIA grava o giro na
  // imagem (sem perda; passa a abrir assim para todos); os demais giram so
  // na tela (o mesmo giro do OHIF, ou da propria imagem fora dele).
  const [rotacaoTela, setRotacaoTela] = useState<Record<number, number>>({})
  async function girarImagem(item: ItemSequencia | undefined) {
    if (!item) return
    if (!podeSalvarGiro) {
      const uid = estudoDe(item.viewer_url ?? null)
      const janela = ohifRef.current?.contentWindow
      if (uid && janela && origemOhif && (emGrade ? !!urlGrade : !!urlComSerie)) {
        janela.postMessage({ tipo: 'radix-comando', comando: 'rotateViewportCW', uid }, origemOhif)
      } else {
        setRotacaoTela((atual) => ({ ...atual, [item.curation_id]: ((atual[item.curation_id] ?? 0) + 90) % 360 }))
      }
      return
    }
    if (salvandoGiro) return
    setSalvandoGiro(true)
    setErroGiro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/ficha/${item.curation_id}/girar`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ graus: 90 }),
      })
      if (!resposta.ok) {
        setErroGiro(await extrairErro(resposta, t('girar.erro')))
        return
      }
      setMarcacoesGiradas((atual) => ({ ...atual, [item.curation_id]: girarMarcacoes(item.marcacoes ?? [], 90) }))
      setVersaoArquivo((atual) => ({ ...atual, [item.curation_id]: (atual[item.curation_id] ?? 0) + 1 }))
    } catch {
      setErroGiro(t('girar.erro'))
    } finally {
      setSalvandoGiro(false)
    }
  }
  const girarImagemRef = useRef<() => void>(() => {})
  girarImagemRef.current = () => girarImagem(itens[indice])
  useEffect(() => {
    // tecla R com o foco fora do OHIF (dentro dele, o OHIF avisa)
    function aoTeclar(ev: KeyboardEvent) {
      if ((ev.key !== 'r' && ev.key !== 'R') || ev.ctrlKey || ev.metaKey || ev.altKey) return
      const alvo = ev.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return
      ev.preventDefault()
      girarImagemRef.current()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])
  useEffect(() => {
    // janela redimensionada: o espaco do quadro de informacoes muda junto
    const reenviar = () => enviarMarcacoesRef.current()
    window.addEventListener('resize', reenviar)
    return () => window.removeEventListener('resize', reenviar)
  }, [])
  useEffect(() => {
    if (!origemOhif) return
    function aoProntoOhif(evento: MessageEvent) {
      if (evento.origin !== origemOhif) return
      const dados = evento.data as { tipo?: unknown } | null
      if (dados && dados.tipo === 'radix-ohif-pronto') enviarMarcacoesRef.current()
      if (dados && dados.tipo === 'radix-tecla-girar') girarImagemRef.current()
      const quadros = (dados as { quadros?: unknown } | null)?.quadros
      if (dados && dados.tipo === 'radix-quadros' && Array.isArray(quadros)) {
        setQuadrosOhif(
          quadros
            .filter((q): q is { x: number; y: number; w: number; h: number } =>
              !!q && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite((q as Record<string, unknown>)[k]))
            )
            .slice(0, 25)
        )
      }
    }
    window.addEventListener('message', aoProntoOhif)
    return () => window.removeEventListener('message', aoProntoOhif)
  }, [origemOhif])

  const atual = itens[indice]
  const seriesValidas = seriesDoItem === atual.curation_id ? series : []
  const serieAtual = seriesValidas[indiceSerie] ?? null
  const urlBase =
    atual.viewer_url && serieAtual
      ? `${atual.viewer_url}&SeriesInstanceUIDs=${serieAtual.series_instance_uid}`
      : atual.viewer_url
  // Sempre abre sem a coluna "Studies" do OHIF (ver ohif/app-config.template.js):
  // a radiografia fica com a largura toda (o botao do OHIF reabre a coluna)
  const urlComSerie = urlBase
    ? `${urlBase}${urlBase.includes('?') ? '&' : '?'}radixRecolherEstudos=1&radixTeclaR=1`
    : urlBase
  const marcacoes = atual.marcacoes ?? []
  const marcacaoDisponivel = marcacoes.length > 0
  const temMarcacao = (item: ItemSequencia) => (item.marcacoes ?? []).length > 0
  const mostraMarcacaoDe = (item: ItemSequencia) => temMarcacao(item) && marcacoesLigadas.includes(item.curation_id)
  const itensComMarcacao = itens.filter(temMarcacao)
  const todasMarcacoesLigadas =
    itensComMarcacao.length > 0 && itensComMarcacao.every((item) => marcacoesLigadas.includes(item.curation_id))
  const mostrarMarcacao = marcacoesLigadas.includes(atual.curation_id)
  const mostrarMarcacaoEfetivo = mostrarMarcacao && marcacaoDisponivel
  function alternarMarcacaoDe(curationId: number, ligar?: boolean) {
    setMarcacoesLigadas((lista) => {
      const ligada = lista.includes(curationId)
      const novo = ligar ?? !ligada
      if (novo === ligada) return lista
      return novo ? [...lista, curationId] : lista.filter((id) => id !== curationId)
    })
  }
  function alternarTodasMarcacoes(ligar?: boolean) {
    const novo = ligar ?? !todasMarcacoesLigadas
    setMarcacoesLigadas(novo ? itensComMarcacao.map((item) => item.curation_id) : [])
  }
  const selecaoTemMarcacao = itens.some((item) => (item.marcacoes ?? []).length > 0)

  // Descricao ligada a imagem: mouse sobre "Marcação N" destaca a marcacao
  // dentro do OHIF; clique isola (so ela aparece) - e liga as marcacoes
  // daquela imagem, se estavam desligadas.
  function focarMarcacaoDe(item: ItemSequencia, indiceMarcacao: number | null) {
    const uid = estudoDe(item.viewer_url ?? null)
    setFocoMarcacao(uid && indiceMarcacao !== null ? { uid, indice: indiceMarcacao } : null)
  }
  function isolarMarcacaoDe(item: ItemSequencia, indiceMarcacao: number) {
    const uid = estudoDe(item.viewer_url ?? null)
    alternarMarcacaoDe(item.curation_id, true)
    const janela = ohifRef.current?.contentWindow
    if (uid && janela && origemOhif) janela.postMessage({ tipo: 'radix-isolar', uid, indice: indiceMarcacao }, origemOhif)
  }
  // QUADRO DE INFORMACOES AMPLIADO: ocupa metade da area de imagens, do lado
  // que nao cobre a imagem descrita. Com uma coluna so (imagem unica ou uma
  // coluna de imagens) a area de imagens encolhe para a metade esquerda e o
  // quadro fica na direita - imagem de um lado, informacoes do outro.
  const areaRef = useRef<HTMLDivElement>(null)
  const [quadroAmpliado, setQuadroAmpliado] = useState<number | null>(null)
  const itensNaTela = emGrade ? itensPagina : [atual]
  const itemAmpliado = itensNaTela.find((item) => item.curation_id === quadroAmpliado) ?? null
  function ladoQuadro(item: ItemSequencia): 'direita' | 'esquerda' | 'encolher' {
    if (!emGrade || grade.colunas === 1) return 'encolher'
    const coluna = itensPagina.indexOf(item) % grade.colunas
    return coluna < grade.colunas / 2 ? 'direita' : 'esquerda'
  }
  const encolherArea = itemAmpliado !== null && ladoQuadro(itemAmpliado) === 'encolher'
  // OHIF de uma imagem so (fora da grade): a barra dele (altura 52 px) fica
  // livre e o quadro ampliado comeca logo abaixo dela
  const ohifUnico = !emGrade && !!urlComSerie
  const ALTURA_BARRA_OHIF = 56
  // Posicao de cada quadro de imagem DENTRO do OHIF (ele avisa; ver
  // ohif/app-config.template.js): o quadro de informacoes fica exatamente
  // alinhado com eles - mesma linha de cima e de baixo, mesmo tamanho do
  // quadro da imagem do lado oposto (pedido de 20/10/2026).
  const [quadrosOhif, setQuadrosOhif] = useState<{ x: number; y: number; w: number; h: number }[]>([])
  function quadroAlinhadoAoOhif(item: ItemSequencia, area: DOMRect) {
    const janela = ohifRef.current?.getBoundingClientRect()
    if (!janela || quadrosOhif.length === 0 || !(ohifUnico || (emGrade && urlGrade))) return null
    const quadros = quadrosOhif
      .map((q) => ({ left: janela.left + q.x, top: janela.top + q.y, right: janela.left + q.x + q.w, bottom: janela.top + q.y + q.h }))
      .sort((a, b) => a.top - b.top || a.left - b.left)
    const topo = Math.min(...quadros.map((q) => q.top))
    const base = Math.max(...quadros.map((q) => q.bottom))
    const VAO = 8
    if (ladoQuadro(item) === 'encolher') {
      // uma imagem (ou uma coluna): o quadro ocupa o espaco a direita dela,
      // com a mesma margem que ela tem a esquerda
      const direita = Math.max(...quadros.map((q) => q.right))
      const margem = Math.max(0, Math.min(...quadros.map((q) => q.left)) - area.left)
      return { left: direita + VAO, top: topo, width: Math.max(200, area.right - margem - direita - VAO), height: base - topo }
    }
    // varias lado a lado: cobre exatamente os quadros da metade oposta
    const colunas = grade.colunas
    const ladoDireito = ladoQuadro(item) === 'direita'
    const opostos = quadros.filter((_, i) => (ladoDireito ? i % colunas >= colunas / 2 : i % colunas < colunas / 2))
    if (opostos.length === 0) return null
    const esq = Math.min(...opostos.map((q) => q.left))
    const dir = Math.max(...opostos.map((q) => q.right))
    return { left: esq, top: topo, width: dir - esq, height: base - topo }
  }
  // "Expandir" de Minhas imagens: a descricao ja abre ampliada ao lado
  useEffect(() => {
    if (descricaoAoLado && !emGrade) setQuadroAmpliado(atual.curation_id)
  }, [descricaoAoLado, emGrade, atual.curation_id])
  useEffect(() => {
    // trocou de pagina/imagem/layout e a imagem ampliada saiu da tela
    if (quadroAmpliado !== null && !itemAmpliado) setQuadroAmpliado(null)
  }, [quadroAmpliado, itemAmpliado])
  function areaAmpliadaDe(item: ItemSequencia) {
    return () => {
      const r = areaRef.current?.getBoundingClientRect()
      if (!r) return null
      const alinhado = quadroAlinhadoAoOhif(item, r)
      if (alinhado) return alinhado
      const metade = r.width / 2
      const esquerda = ladoQuadro(item) === 'esquerda'
      // com o OHIF na tela (uma imagem ou varias lado a lado), o quadro comeca
      // ABAIXO da barra de ferramentas dele - a barra fica sempre inteira
      const abaixoDaBarra = ohifUnico || (emGrade && !!urlGrade) ? ALTURA_BARRA_OHIF : 0
      return {
        left: Math.round(esquerda ? r.left + 8 : r.left + metade + 4),
        top: Math.round(r.top + 8 + abaixoDaBarra),
        width: Math.round(metade - 12),
        height: Math.round(r.height - 16 - abaixoDaBarra),
      }
    }
  }

  function propsSelos(item: ItemSequencia) {
    return {
      ampliado: quadroAmpliado === item.curation_id,
      onAmpliar: (v: boolean) => setQuadroAmpliado(v ? item.curation_id : null),
      areaAmpliada: areaAmpliadaDe(item),
      item,
      ligada: mostraMarcacaoDe(item),
      onAlternar: () => alternarMarcacaoDe(item.curation_id),
      onFocoMarcacao: (i: number | null) => focarMarcacaoDe(item, i),
      onIsolarMarcacao: (i: number) => isolarMarcacaoDe(item, i),
      holofote,
      onAlternarHolofote: () => setHolofote((v) => !v),
      onGirar: () => {
        setIndice(itens.indexOf(item))
        girarImagem(item)
      },
      girando: salvandoGiro,
      dicaGirar: podeSalvarGiro ? t('girar.salvarDica') : t('girar.dicaR'),
    }
  }

  useEffect(() => {
    setMensagem('')
    setErro('')
    setJaSalvo(false)
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
        alternarTodasMarcacoes()
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
            onClick={() => alternarTodasMarcacoes()}
            disabled={!selecaoTemMarcacao}
            aria-pressed={todasMarcacoesLigadas}
            title={selecaoTemMarcacao ? t('marcacoes.botaoTitulo') : t('marcacoes.semMarcacao')}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
              todasMarcacoesLigadas
                ? 'border-amber-300/80 bg-amber-300/15 text-amber-200'
                : 'border-base-border text-slate-300 hover:border-amber-300/60 hover:text-amber-200'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <ellipse cx="12" cy="12" rx="9" ry="6.5" />
              <path d="M4 20l4-4" />
            </svg>
            <span>{t('marcacoes.botao')}</span>
            <kbd className="hidden rounded-sm border border-current/40 px-1 text-[10px] opacity-70 md:inline">K</kbd>
          </button>
          {itens.length > 1 && <SeletorLayout grade={grade} onEscolher={escolherGrade} onAbrir={() => setQuadroAmpliado(null)} />}
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

      <div
        ref={areaRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden transition-[padding] duration-200"
        // Quadro de informacoes na metade direita: com o OHIF, o visualizador
        // continua com a largura toda (barra de ferramentas de ponta a ponta)
        // e o proprio OHIF encolhe so a area das imagens (espacoDireita); sem
        // o OHIF, a area encolhe para a metade esquerda.
        style={encolherArea && !ohifUnico ? { paddingRight: '50%' } : undefined}
      >
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

        {emGrade && urlGrade ? (
          // UMA tela, um visualizador: o OHIF divide a propria area de
          // imagens na grade escolhida (ver montarUrlGrade). A "key" faz o
          // OHIF recarregar so quando muda a pagina ou o layout.
          <div className="relative h-full w-full px-14 sm:px-16">
            <iframe
              ref={ohifRef}
              key={`${urlGrade}|${itensPagina.map((i) => versaoArquivo[i.curation_id] ?? 0).join(',')}`}
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
                  <SelosImagem {...propsSelos(item)} className="right-9 top-2" />
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
                    <div
                      className="flex h-full w-full items-center justify-center transition-transform duration-200"
                      style={rotacaoTela[item.curation_id] ? { transform: `rotate(${rotacaoTela[item.curation_id]}deg)` } : undefined}
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
                    </div>
                    {/* etiqueta discreta no canto, como nos PACS */}
                    <span className="pointer-events-none absolute left-2 top-2 rounded-sm bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-teal-200">
                      #{item.numero}
                    </span>
                    <SelosImagem {...propsSelos(item)} className="right-2 top-2" />
                  </div>
                )
              })}
            </div>
          </div>
        ) : urlComSerie ? (
          // As marcacoes do curador sao desenhadas DENTRO do OHIF (ver
          // ohif/app-config.template.js): a imagem e a mesma com ou sem
          // marcacao, so as formas aparecem/somem.
          <iframe
            ref={ohifRef}
            key={`${atual.curation_id}|${versaoArquivo[atual.curation_id] ?? 0}`}
            src={urlComSerie}
            referrerPolicy="origin"
            title={t('visualizadorOhifTitulo', { numero: atual.numero })}
            className="h-full w-full flex-1 border-0"
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center transition-transform duration-200"
            style={rotacaoTela[atual.curation_id] ? { transform: `rotate(${rotacaoTela[atual.curation_id]}deg)` } : undefined}
          >
            {mostrarMarcacaoEfetivo ? (
              <ImagemPrincipalMarcada
                curationId={atual.curation_id}
                alt={atual.descricao_didatica ?? t('imagemNumero', { numero: atual.numero })}
                marcacoes={marcacoes}
                srcPreCarregado={marcacaoPreviewUrl}
              />
            ) : (
              <MiniaturaImagem
                curationId={atual.curation_id}
                alt={atual.descricao_didatica ?? t('imagemNumero', { numero: atual.numero })}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
            )}
          </div>
        )}

        {/* Selo das marcacoes do curador no canto da imagem (layout de 1) */}
        {!emGrade && (
          <SelosImagem
            {...propsSelos(atual)}
            className={
              encolherArea
                ? urlComSerie
                  ? 'right-[calc(50%+6rem)] top-[60px]'
                  : 'right-[calc(50%+5rem)] top-3'
                : urlComSerie
                  ? 'right-24 top-[60px]'
                  : 'right-20 top-3'
            }
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

      {/* Barra de acoes compacta (uma linha). O antigo botao "Detalhes" saiu:
          as informacoes da imagem ja aparecem no "i" sobre a propria imagem. */}
      <div className="relative z-40 border-t border-base-border bg-base/80 px-4 py-1.5 backdrop-blur-md sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-3">
            {mensagem && <span className="truncate text-xs text-emerald-400">{mensagem}</span>}
            {erroGiro && (
              <span className="truncate text-xs text-red-400" role="alert">
                {erroGiro}
              </span>
            )}
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

// Os dois selos do canto de cada imagem: o de MARCACAO (so aparece se o
// curador marcou algo na imagem; clique liga/desliga as formas desenhadas)
// e o "i" da DESCRICAO da curadoria (passar o mouse abre; clique fixa).
function SelosImagem({
  item,
  ligada,
  onAlternar,
  onFocoMarcacao,
  onIsolarMarcacao,
  holofote,
  onAlternarHolofote,
  ampliado,
  onAmpliar,
  areaAmpliada,
  onGirar,
  girando = false,
  dicaGirar,
  className = '',
}: {
  item: ItemSequencia
  ligada: boolean
  onAlternar: () => void
  onFocoMarcacao?: (indice: number | null) => void
  onIsolarMarcacao?: (indice: number) => void
  holofote?: boolean
  onAlternarHolofote?: () => void
  ampliado?: boolean
  onAmpliar?: (valor: boolean) => void
  areaAmpliada?: () => { left: number; top: number; width: number; height: number } | null
  onGirar?: () => void
  girando?: boolean
  dicaGirar?: string
  className?: string
}) {
  const t = useTranslations('Visualizador.marcacoes')
  const total = (item.marcacoes ?? []).length
  return (
    <div className={`pointer-events-none absolute z-20 flex items-start gap-1.5 ${className}`}>
      {onGirar && (
        // "R ⟳": gira esta imagem 90 graus (tecla R tambem)
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onGirar()
          }}
          disabled={girando}
          title={dicaGirar}
          aria-label={dicaGirar}
          className="pointer-events-auto flex items-center gap-0.5 rounded-full border border-amber-300/60 bg-black/70 px-2 py-0.5 text-[11px] font-bold text-amber-200 backdrop-blur-sm transition hover:border-amber-300 disabled:cursor-wait disabled:opacity-50"
        >
          R <span aria-hidden="true" className="text-[13px] leading-none">⟳</span>
        </button>
      )}
      {total > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAlternar()
          }}
          aria-pressed={ligada}
          title={ligada ? t('ocultarDaImagem') : t('mostrarDaImagem')}
          className={`pointer-events-auto flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold backdrop-blur-sm transition ${
            ligada
              ? 'border-amber-300 bg-amber-300/25 text-amber-100'
              : 'border-amber-300/60 bg-black/70 text-amber-200 hover:border-amber-300'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <ellipse cx="12" cy="12" rx="9" ry="6.5" />
            <path d="M4 20l4-4" />
          </svg>
          {total}
        </button>
      )}
      {total > 0 && ligada && onAlternarHolofote && (
        // "Holofote": escurece a imagem fora da marcacao em foco (mouse
        // sobre ela ou sobre a linha dela na descricao).
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAlternarHolofote()
          }}
          aria-pressed={!!holofote}
          title={holofote ? t('holofoteDesligar') : t('holofoteLigar')}
          aria-label={holofote ? t('holofoteDesligar') : t('holofoteLigar')}
          className={`pointer-events-auto flex items-center rounded-full border px-1.5 py-0.5 backdrop-blur-sm transition ${
            holofote
              ? 'border-amber-300 bg-amber-300/25 text-amber-100'
              : 'border-amber-300/60 bg-black/70 text-amber-200 hover:border-amber-300'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" strokeLinecap="round" />
          </svg>
        </button>
      )}
      <EtiquetaMarcacoes
        item={item}
        embutido
        mostrarContagem={false}
        onFocoMarcacao={onFocoMarcacao}
        onIsolarMarcacao={onIsolarMarcacao}
        curationId={item.curation_id}
        compartilhamento={item.compartilhamento}
        ampliado={ampliado}
        onAmpliar={onAmpliar}
        areaAmpliada={areaAmpliada}
      />
    </div>
  )
}
