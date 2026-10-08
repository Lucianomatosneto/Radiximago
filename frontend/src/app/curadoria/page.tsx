'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Logo from '../../components/Logo'
import FilaCuradoriaHorizontal, { ImagemPendente } from '../../components/curadoria/FilaCuradoriaHorizontal'
import PainelVisualizador, { ViewerInfo } from '../../components/curadoria/PainelVisualizador'
import MarcadorAchado from '../../components/curadoria/MarcadorAchado'
import PainelAchadosRadiografia from '../../components/curadoria/PainelAchadosRadiografia'
import PainelAchadosEstruturados from '../../components/curadoria/PainelAchadosEstruturados'
import PainelErroTecnico from '../../components/curadoria/PainelErroTecnico'
import FichaCuradoriaForm, { FormularioFicha, FORM_VAZIO } from '../../components/curadoria/FichaCuradoriaForm'
import BarraSuperiorCuradoria from '../../components/curadoria/BarraSuperiorCuradoria'
import ModalMotivo from '../../components/curadoria/ModalMotivo'
import { ReviewInfo } from '../../components/curadoria/SegundaOpiniaoBanner'
import { obterSessaoAtual } from '../../lib/sessao'

const PERFIS_PERMITIDOS = ['administrador', 'suporte', 'curador']

// Usados so pra rotular tipo_radiografia/achado_principal nos cards de
// "Aguardando sua decisao" (mesmos rotulos usados em toda a Curadoria e em
// Pesquisa avancada) - mesmo padrao ja usado em segunda-opiniao/page.tsx.
const OPCOES_TIPO_RADIOGRAFIA = ['periapical', 'panoramica', 'interproximal', 'oclusal']
const CHAVE_ACHADO: Record<string, string> = {
  normal: 'normal',
  carie: 'carie',
  lesao_periapical: 'lesaoPeriapical',
  perda_ossea: 'perdaOssea',
  dente_incluso: 'denteIncluso',
  tratamento_endodontico: 'tratamentoEndodontico',
  erro_tecnico: 'erroTecnico',
  outro: 'outro',
}

interface FichaAtiva {
  curationId: number
  orthancReferenceId: number
}

// Ordem unica das 5 "telas" do carrossel do painel lateral (setas ‹ › +
// teclado) - marcacao (desenho) -> achados1/achados2 (checklist legado,
// alteracoes_observadas) -> achadosEstruturados/erroTecnico (Fase 3, API
// da Fase 2). Usar um array em vez de ternarios encadeados deixa a
// navegacao (proxima/anterior) trivial: so andar +1/-1 no indice.
type PaginaPainelLateral = 'marcacao' | 'achados1' | 'achados2' | 'achadosEstruturados' | 'erroTecnico'
const PAGINAS_PAINEL_LATERAL: PaginaPainelLateral[] = [
  'marcacao',
  'achados1',
  'achados2',
  'achadosEstruturados',
  'erroTecnico',
]
// O carrossel (setas e teclado) percorre so os ACHADOS: a imagem para
// marcacao nao faz mais parte dele - ela so abre pelo botao "Marcar imagem"
// da caixa de dados (e entao ocupa o lugar grande do visualizador).
const PAGINAS_CARROSSEL: PaginaPainelLateral[] = PAGINAS_PAINEL_LATERAL.filter((p) => p !== 'marcacao')
const PAGINA_INICIAL: PaginaPainelLateral = 'achados1'

// Item de /curation/reviews/answered (mesmo formato de /reviews/pending)
// + o parecer do revisor, que vem de uma segunda chamada a
// GET /curation/{id}/reviews (ver carregarReviewsRespondidas).
interface ReviewRespondidaItem {
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
  concordancia: string | null
  parecer_revisor: string | null
  decisao_final: string | null
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

function construirPayloadEdicao(form: FormularioFicha): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tipo_radiografia: form.tipo_radiografia,
    dentes: form.dentes,
    achados_detalhe: form.achados_detalhe,
    alteracoes_observadas: form.alteracoes_observadas,
    descricao_didatica: form.descricao_didatica,
    observacoes_internas: form.observacoes_internas,
    anonimizacao_validada: form.anonimizacao_validada,
  }
  if (form.idade_min !== '') payload.idade_min = Number(form.idade_min)
  if (form.idade_max !== '') payload.idade_max = Number(form.idade_max)
  if (form.genero !== '') payload.genero = form.genero
  payload.marcacoes = form.marcacoes
  if (form.qualidade_tecnica !== '') payload.qualidade_tecnica = form.qualidade_tecnica
  return payload
}

export default function CuradoriaPage() {
  const router = useRouter()
  const t = useTranslations('Curadoria')
  const tComum = useTranslations('Comum')
  const tOpcoes = useTranslations('Pesquisa.opcoes')

  function rotularTipoRadiografia(valor: string | null): string {
    if (!valor || !OPCOES_TIPO_RADIOGRAFIA.includes(valor)) return valor ?? '—'
    return tOpcoes(`tipoRadiografia.${valor}`)
  }

  function traduzirAchado(valor: string | null): string {
    if (!valor) return '—'
    const chave = CHAVE_ACHADO[valor]
    if (!chave) return valor
    return tOpcoes(`achadoPrincipal.${chave}`)
  }

  const [autenticado, setAutenticado] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const [fila, setFila] = useState<ImagemPendente[]>([])
  const [ordemInicial, setOrdemInicial] = useState<ImagemPendente[]>([])
  const [totalPendentes, setTotalPendentes] = useState(0)
  const filaRef = useRef<ImagemPendente[]>([])
  const ordemInicialRef = useRef<ImagemPendente[]>([])

  const [carregandoFila, setCarregandoFila] = useState(false)
  const [erroFila, setErroFila] = useState('')
  const [criandoId, setCriandoId] = useState<number | null>(null)
  const [indiceAtual, setIndiceAtual] = useState<number | null>(null)
  // So dispara uma vez, na entrada na tela - depois disso, trocar de item
  // pendente ja e coberto por irParaProxima (avanco automatico apos
  // salvar/aprovar/descartar) e pelos cliques manuais na fila.
  const autoAbriuPrimeiraRef = useRef(false)

  const [fichaAtiva, setFichaAtiva] = useState<FichaAtiva | null>(null)
  const [statusFicha, setStatusFicha] = useState('em_analise')
  const [segundaOpiniaoReview, setSegundaOpiniaoReview] = useState<ReviewInfo | null>(null)
  const [viewerInfo, setViewerInfo] = useState<ViewerInfo | null>(null)
  const [carregandoViewer, setCarregandoViewer] = useState(false)
  // Sinais de "a imagem principal terminou de carregar" - usados so pra
  // liberar o carregamento das miniaturas da fila (permitirCarregarMiniaturas
  // logo abaixo, no JSX). Resetados pra false no INICIO de abrirImagem
  // (toda vez que uma imagem nova comeca a abrir, nao so a primeira -
  // antes, permitirCarregarMiniaturas so olhava pra `!!fichaAtiva`, que
  // vira true e fica true pra sempre a partir da 1a imagem, entao a
  // partir da 2a imagem em diante a fila nunca mais era travada de novo).
  // ohifCarregado vira true no evento "load" do iframe do OHIF (o sinal
  // mais proximo de "terminou" que da pra observar de fora, ja que o OHIF
  // e cross-origin - nao mede se ele ja RENDERIZOU a imagem por dentro).
  // marcadorPronto vira true quando a imagem do painel "Imagem para
  // marcacao" (MarcadorAchado) termina de carregar - esse painel e 100%
  // nosso, entao aqui o sinal e exato.
  const [ohifCarregado, setOhifCarregado] = useState(false)
  const [marcadorPronto, setMarcadorPronto] = useState(false)
  // Nao e o alvo da Fullscreen API (ver comentario grande no efeito que
  // arma o clique da Curadoria no Sidebar, mais abaixo) - continua
  // existindo so pra aplicar o padding condicional
  // (`${telaCheia ? 'p-4' : ''}`) no proprio elemento, no JSX.
  const visualizadorRef = useRef<HTMLDivElement | null>(null)
  // Reflete o que a Fullscreen API relata de fato (ver fullscreenchange
  // abaixo) - usado tanto pra esconder Topbar/cabecalho e ajustar o
  // padding, quanto pelo botao manual "Tela cheia" (ver alternarTelaCheia
  // mais abaixo) pra saber o rotulo/estado certo pra mostrar.
  const [telaCheia, setTelaCheia] = useState(false)
  // Trava contra 2 chamadas de alternarTelaCheia quase simultaneas pro
  // mesmo clique - ver comentario dentro de alternarTelaCheia.
  const telaCheiaEmAndamentoRef = useRef(false)
  const [modoAjustado, setModoAjustado] = useState(false)
  // Painel ao lado do OHIF alterna entre 3 "telas" num carrossel de setas
  // (marcacao -> achados1 -> achados2 -> ...): a imagem de marcacao, e os
  // achados em radiografia divididos em 2 paginas (as 5 categorias + o
  // campo "Outros achados" nao cabiam sem rolagem interna nesse painel
  // estreito - ver comentario grande em PainelAchadosRadiografia.tsx sobre
  // a divisao). O curador marca a lesao primeiro (imagem), depois vira pra
  // achados, que ganham a mesma altura grande do visualizador em vez de
  // ficarem espremidos na faixa baixa da ficha la embaixo. Reseta pra
  // "marcacao" sempre que uma imagem nova abre (ver
  // carregarFichaCompleta/finalizarFichaAtiva) - cada imagem comeca do
  // zero, sem herdar a pagina de achados da imagem anterior.
  // Fase 3: carrossel ganhou mais 2 paginas (achadosEstruturados, novo
  // painel via API da Fase 2; erroTecnico, dimensao independente) - ver
  // PAGINAS_PAINEL_LATERAL logo abaixo, unica fonte da ordem das 5 paginas.
  const [painelLateral, setPainelLateral] = useState<PaginaPainelLateral>(PAGINA_INICIAL)
  // MODO FOCO (so em tela cheia, com o painel "Imagem para marcacao"):
  // a imagem do visualizador ocupa quase a tela toda e a imagem de
  // marcacao vira uma miniatura ao lado. Passar o mouse na miniatura a
  // amplia temporariamente (previa); clicar nela a FIXA em tamanho grande,
  // trocando de lugar com o visualizador (que vira a miniatura). Clicar na
  // miniatura do visualizador destroca. Nada e desmontado na troca (so
  // muda o tamanho por CSS) - assim o iframe do OHIF nao recarrega.
  const [marcacaoEmDestaque, setMarcacaoEmDestaque] = useState(false)
  // Pagina de achados que estava aberta antes de "Marcar imagem" - ao
  // fechar a marcacao, o painel lateral volta para ela.
  const paginaAntesDaMarcacaoRef = useRef<PaginaPainelLateral>('achados1')
  const [previaMarcacao, setPreviaMarcacao] = useState(false)
  const tempoPreviaRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Em tela cheia o "Registro de curadoria" (faixa de baixo) comeca
  // recolhido, devolvendo essa altura para as imagens.
  const [registroAberto, setRegistroAberto] = useState(false)
  // Janela do navegador ja em tela cheia (F11, ou aberta pelo atalho
  // "Abrir Radix Curadoria em tela cheia") - nesse caso o botao de tela
  // cheia nao precisa aparecer.
  const [janelaCheia, setJanelaCheia] = useState(false)
  useEffect(() => {
    const consulta = window.matchMedia('(display-mode: fullscreen)')
    const verificar = () =>
      setJanelaCheia(consulta.matches || (window.innerHeight >= screen.height - 2 && window.innerWidth >= screen.width - 2))
    verificar()
    window.addEventListener('resize', verificar)
    consulta.addEventListener?.('change', verificar)
    return () => {
      window.removeEventListener('resize', verificar)
      consulta.removeEventListener?.('change', verificar)
    }
  }, [])

  const [form, setForm] = useState<FormularioFicha>(FORM_VAZIO)

  const [salvandoRascunho, setSalvandoRascunho] = useState(false)
  const [rascunhoSalvo, setRascunhoSalvo] = useState(false)
  const [aprovando, setAprovando] = useState(false)
  const [erroFormulario, setErroFormulario] = useState('')

  const [modalMotivo, setModalMotivo] = useState<'descartar' | 'segunda_opiniao' | null>(null)
  const [motivoTexto, setMotivoTexto] = useState('')
  const [enviandoMotivo, setEnviandoMotivo] = useState(false)
  const [erroMotivo, setErroMotivo] = useState('')

  // "Aguardando sua decisao": segundas opinioes que ESTE curador solicitou
  // e que ja foram respondidas pelo revisor - falta so aplicar a decisao
  // final (aprovar/descartar) via POST /apply-review-decision. Fica num
  // badge/dropdown separado da fila principal porque a ficha em si nao
  // volta pra /curation/pending nesse estado (ver comentario em
  // carregarReviewSegundaOpiniao acima).
  const [reviewsRespondidas, setReviewsRespondidas] = useState<ReviewRespondidaItem[]>([])
  const [erroReviewsRespondidas, setErroReviewsRespondidas] = useState('')
  const [painelReviewsAberto, setPainelReviewsAberto] = useState(false)

  // Aprovar exige reconfirmar a anonimizacao (mesma regra de /approve) -
  // um checkbox por review, guardado por id porque varias podem estar
  // visiveis ao mesmo tempo no dropdown.
  const [anonimizacaoConfirmada, setAnonimizacaoConfirmada] = useState<Record<number, boolean>>({})
  const [aplicandoDecisaoId, setAplicandoDecisaoId] = useState<number | null>(null)
  const [errosDecisaoFinal, setErrosDecisaoFinal] = useState<Record<number, string>>({})

  // Descartar via decisao final reaproveita o ModalMotivo (mesmo padrao de
  // justificativa obrigatoria de /discard), mas com seu proprio estado -
  // opera numa ficha diferente da fichaAtiva em edicao.
  const [descarteFinalAlvo, setDescarteFinalAlvo] = useState<{ curationId: number; reviewId: number } | null>(null)
  const [motivoDescarteFinal, setMotivoDescarteFinal] = useState('')
  const [enviandoDescarteFinal, setEnviandoDescarteFinal] = useState(false)
  const [erroDescarteFinal, setErroDescarteFinal] = useState('')

  useEffect(() => {
    obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }
      if (!PERFIS_PERMITIDOS.includes(sessao.perfil)) {
        router.push('/acesso-negado')
        return
      }
      setAutenticado(true)
      carregarFila()
      carregarReviewsRespondidas()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  // Abre a primeira imagem pendente automaticamente assim que a fila
  // carrega, pra quem cura ja cair direto trabalhando (visualizador grande
  // + ficha logo abaixo), em vez de ver a tela vazia "Selecione uma imagem
  // na fila ao lado" e precisar clicar no primeiro item manualmente.
  useEffect(() => {
    if (autoAbriuPrimeiraRef.current) return
    if (carregando || carregandoFila) return
    if (fichaAtiva || criandoId !== null) return
    if (!autenticado || fila.length === 0) return
    autoAbriuPrimeiraRef.current = true
    abrirImagem(fila[0], 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregando, carregandoFila, fila, fichaAtiva, criandoId, autenticado])

  // Sai da tela cheia quando o curador DEIXA a Curadoria (navega pra
  // outra tela) - necessario porque o alvo da Fullscreen API e
  // document.documentElement (o <html> inteiro, ver comentario grande no
  // Sidebar.tsx), que NUNCA e desmontado por uma navegacao client-side do
  // Next.js (diferente do antigo alvo, visualizadorRef, que era destruido
  // ao sair da pagina e por isso saia de tela cheia sozinho, de graca).
  // Sem isso, a tela cheia "vazaria"
  // pra qualquer outra tela que o curador abrisse em seguida. So dispara
  // no unmount (dependencia vazia) - trocar de imagem dentro da propria
  // Curadoria (Proxima/Anterior/clique na fila) nao desmonta este
  // componente, entao nao aciona isso.
  useEffect(() => {
    return () => {
      if (document.fullscreenElement === document.documentElement) {
        document.exitFullscreen().catch(() => {})
      }
    }
  }, [])

  // Rede de seguranca (SEM botao visivel) pro caso do clique no Sidebar
  // (aoClicarCuradoria) nao ter conseguido entrar em tela cheia - por
  // exemplo, se a "ativacao" daquele clique especifico nao foi aceita
  // pelo navegador por algum motivo (varia entre navegadores/SOs). Em vez
  // de reintroduzir um botao manual (pedido explicito pra NAO ter um),
  // este efeito escuta a PROXIMA interacao real do curador DENTRO da
  // propria Curadoria (primeiro clique ou tecla, em qualquer lugar da
  // pagina - clicar numa miniatura, apertar uma tecla, o que for) e
  // aproveita essa ativacao de usuario pra tentar de novo, silenciosamente
  // - sem interceptar/atrapalhar o que quer que essa interacao ja fosse
  // fazer (nao chama preventDefault nem stopPropagation). So arma UMA vez
  // por entrada na tela (se ja esta em tela cheia quando o efeito monta,
  // nem escuta) e se desarma sozinho assim que telaCheia vira true (nao
  // fica escutando pra sempre nem tenta de novo depois de ja ter dado
  // certo).
  useEffect(() => {
    if (telaCheia || document.fullscreenElement) return

    function tentarDeNovo() {
      document.removeEventListener('pointerdown', tentarDeNovo)
      document.removeEventListener('keydown', tentarDeNovo)
      if (document.fullscreenElement) return
      document.documentElement.requestFullscreen().catch(() => {
        // Se negar de novo, desiste silenciosamente - sem botao manual
        // pra insistir, a Curadoria so continua funcionando em modo
        // normal.
      })
    }

    document.addEventListener('pointerdown', tentarDeNovo)
    document.addEventListener('keydown', tentarDeNovo)
    return () => {
      document.removeEventListener('pointerdown', tentarDeNovo)
      document.removeEventListener('keydown', tentarDeNovo)
    }
  }, [telaCheia])

  function aplicarFila(itens: ImagemPendente[], total: number, opcoes?: { append?: boolean }) {
    const novaFila = opcoes?.append ? [...filaRef.current, ...itens] : itens
    const novaOrdem = opcoes?.append ? [...ordemInicialRef.current, ...itens] : itens
    filaRef.current = novaFila
    ordemInicialRef.current = novaOrdem
    setFila(novaFila)
    setOrdemInicial(novaOrdem)
    setTotalPendentes(total)
  }

  async function carregarFila(opcoes?: { skip?: number; append?: boolean }) {
    setCarregandoFila(true)
    setErroFila('')
    try {
      const skip = opcoes?.skip ?? 0
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/pending?skip=${skip}&limit=50`,
        { credentials: 'include' }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        // So 401 e problema de sessao de verdade - qualquer outro erro
        // (permissao, erro no servidor, etc.) e mostrado na fila em vez de
        // mandar pro login, que antes fazia parecer que a conta tinha
        // "perdido o acesso" mesmo com a sessao certa.
        setErroFila(await extrairErro(resposta, t('ficha.erroCarregarFila')))
        return
      }
      const dados = await resposta.json()
      aplicarFila(dados.itens ?? [], dados.total_pendentes ?? 0, { append: opcoes?.append })
    } catch {
      setErroFila(t('ficha.erroConexao'))
    } finally {
      setCarregandoFila(false)
      setCarregando(false)
    }
  }

  useEffect(() => {
    function aoMudarTelaCheia() {
      setTelaCheia(document.fullscreenElement === document.documentElement)
    }
    document.addEventListener('fullscreenchange', aoMudarTelaCheia)
    return () => document.removeEventListener('fullscreenchange', aoMudarTelaCheia)
  }, [])

  // Seta do teclado (ALEM do clique nas setas ‹ › do proprio painel) pra
  // trocar entre "Imagem para marcacao" e as 2 paginas de "Achados em
  // radiografia" - mesmo carrossel de 3 telas (marcacao -> achados1 ->
  // achados2), so que tambem acionavel sem tirar a mao do teclado.
  //
  // So dispara quando o painel lateral esta de fato visivel (mesma conta
  // de fichaVisivel mais abaixo no render - nao da pra usar a variavel em
  // si aqui porque ela so existe DEPOIS do "if (carregando) return", e
  // hooks tem que ficar todos ANTES de qualquer return condicional).
  //
  // Guarda contra roubar ArrowLeft/ArrowRight de QUALQUER campo de texto
  // focado (inputs, textarea, select, contenteditable) - sem isso, mover
  // o cursor dentro de "Observações internas"/"Outros achados"/etc com as
  // setas trocaria de painel por acidente a cada tecla, em vez de mover o
  // cursor no texto.
  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return
      if (!fichaAtiva || modoAjustado) return

      const alvo = document.activeElement
      const dentroDeCampo =
        alvo instanceof HTMLElement &&
        (alvo.tagName === 'INPUT' ||
          alvo.tagName === 'TEXTAREA' ||
          alvo.tagName === 'SELECT' ||
          alvo.isContentEditable)
      if (dentroDeCampo) return

      setPainelLateral((atual) => {
        const indice = PAGINAS_CARROSSEL.indexOf(atual)
        if (indice < 0) return atual // marcacao aberta: setas nao trocam de pagina
        const proximoIndice = evento.key === 'ArrowRight' ? indice + 1 : indice - 1
        return PAGINAS_CARROSSEL[proximoIndice] ?? atual
      })
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [fichaAtiva, modoAjustado])

  // Botao manual "Tela cheia" (voltou por pedido explicito - a tentativa
  // automatica no clique do Sidebar, mais a rede de seguranca no primeiro
  // clique/tecla dentro da Curadoria, nem sempre engatam de fato,
  // dependendo do navegador). Alvo e document.documentElement (o <html>
  // inteiro), NAO um elemento especifico da Curadoria - precisa ser o
  // MESMO alvo usado pelo clique automatico do Sidebar (aoClicarCuradoria)
  // e pela rede de seguranca acima, senao os tres brigariam pelo
  // "elemento de tela cheia atual" (so um pode estar em tela cheia por
  // vez - pedir fullscreen num elemento diferente troca o alvo, nao
  // "empilha").
  async function alternarTelaCheia() {
    // Trava contra chamadas concorrentes pro MESMO clique (ex.: usuario
    // clica duas vezes rapido no botao manual) - sem isso, a 2a chamada
    // via de regra ainda pega document.fullscreenElement vazio (a
    // transicao do navegador nao terminou) e entra em tela cheia de novo
    // - ou, se ja tiver terminado, LE fullscreenElement preenchido e SAI
    // dela, cancelando a 1a chamada (resultado: parece que nada
    // aconteceu). Enquanto uma chamada esta em andamento, as demais sao
    // ignoradas.
    if (telaCheiaEmAndamentoRef.current) return
    telaCheiaEmAndamentoRef.current = true
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
      }
    } catch {
      // navegador pode negar (raro, considerando que isso roda dentro do
      // proprio clique do usuario no botao) - ignora
    } finally {
      telaCheiaEmAndamentoRef.current = false
    }
  }


  async function carregarViewerUrl(orthancReferenceId: number) {
    setCarregandoViewer(true)
    setViewerInfo(null)
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${orthancReferenceId}/viewer-url`,
        { credentials: 'include' }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) return
      const dados: ViewerInfo = await resposta.json()
      setViewerInfo(dados)
    } catch {
      // coluna central so mostra a mensagem de indisponibilidade
    } finally {
      setCarregandoViewer(false)
    }
  }

  // So e usado quando a ficha em edicao esta com status "segunda_opiniao" -
  // no fluxo atual da Curadoria isso nunca acontece de fato (itens em
  // segunda opiniao ja saem de /curation/pending), mas o dado ja existe na
  // API (GET /curation/{id}/reviews) e o sprint pede pra so exibi-lo se
  // existir - fica pronto sem custo extra.
  async function carregarReviewSegundaOpiniao(curationId: number) {
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/reviews`, {
        credentials: 'include',
      })
      if (!resposta.ok) return
      const dados = await resposta.json()
      const itens: ReviewInfo[] = dados.itens ?? []
      setSegundaOpiniaoReview(itens.length > 0 ? itens[itens.length - 1] : null)
    } catch {
      // banner so aparece se o dado existir
    }
  }

  // Fila de "Aguardando sua decisao" (badge no cabecalho) - reviews que
  // ESTE curador solicitou e que ja foram respondidas. GET
  // /curation/reviews/answered devolve o mesmo formato enxuto de
  // /reviews/pending (sem o parecer do revisor); por isso, pra cada item,
  // busca o parecer completo (concordancia/parecer_revisor/decisao_final)
  // em GET /curation/{id}/reviews - o mesmo endpoint que
  // carregarReviewSegundaOpiniao ja usa acima.
  async function carregarReviewsRespondidas() {
    setErroReviewsRespondidas('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/reviews/answered`, {
        credentials: 'include',
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErroReviewsRespondidas(await extrairErro(resposta, t('reviewsRespondidas.erroCarregar')))
        return
      }
      const dados = await resposta.json()
      const base: Array<Omit<ReviewRespondidaItem, 'concordancia' | 'parecer_revisor' | 'decisao_final'>> =
        dados.itens ?? []

      const completos = await Promise.all(
        base.map(async (item): Promise<ReviewRespondidaItem> => {
          try {
            const respReviews = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL}/curation/${item.curation.id}/reviews`,
              { credentials: 'include' }
            )
            if (!respReviews.ok) return { ...item, concordancia: null, parecer_revisor: null, decisao_final: null }
            const dadosReviews = await respReviews.json()
            const itensReviews: Array<{
              id: number
              concordancia: string | null
              parecer_revisor: string | null
              decisao_final: string | null
            }> = dadosReviews.itens ?? []
            const desta = itensReviews.find((r) => r.id === item.id)
            return {
              ...item,
              concordancia: desta?.concordancia ?? null,
              parecer_revisor: desta?.parecer_revisor ?? null,
              decisao_final: desta?.decisao_final ?? null,
            }
          } catch {
            return { ...item, concordancia: null, parecer_revisor: null, decisao_final: null }
          }
        })
      )
      setReviewsRespondidas(completos)
    } catch {
      setErroReviewsRespondidas(t('reviewsRespondidas.erroCarregar'))
    }
  }

  async function aprovarDecisaoFinal(item: ReviewRespondidaItem) {
    if (!autenticado || !anonimizacaoConfirmada[item.id]) return
    setAplicandoDecisaoId(item.id)
    setErrosDecisaoFinal((prev) => ({ ...prev, [item.id]: '' }))
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${item.curation.id}/apply-review-decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ decisao: 'aprovar', anonimizacao_validada: true }),
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        const mensagem = await extrairErro(resposta, t('reviewsRespondidas.erroAprovar'))
        setErrosDecisaoFinal((prev) => ({ ...prev, [item.id]: mensagem }))
        return
      }
      setReviewsRespondidas((prev) => prev.filter((r) => r.id !== item.id))
    } catch {
      setErrosDecisaoFinal((prev) => ({ ...prev, [item.id]: t('reviewsRespondidas.erroAprovar') }))
    } finally {
      setAplicandoDecisaoId(null)
    }
  }

  function abrirDescarteFinal(item: ReviewRespondidaItem) {
    setDescarteFinalAlvo({ curationId: item.curation.id, reviewId: item.id })
    setMotivoDescarteFinal('')
    setErroDescarteFinal('')
  }

  async function confirmarDescarteFinal() {
    if (!descarteFinalAlvo || !autenticado) return
    const motivo = motivoDescarteFinal.trim()
    if (!motivo) {
      setErroDescarteFinal(t('modalMotivo.erroMotivoObrigatorio'))
      return
    }

    setEnviandoDescarteFinal(true)
    setErroDescarteFinal('')
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${descarteFinalAlvo.curationId}/apply-review-decision`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ decisao: 'descartar', motivo }),
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErroDescarteFinal(await extrairErro(resposta, t('modalMotivo.erroConcluirAcao')))
        return
      }
      setReviewsRespondidas((prev) => prev.filter((r) => r.id !== descarteFinalAlvo.reviewId))
      setDescarteFinalAlvo(null)
      setMotivoDescarteFinal('')
    } catch {
      setErroDescarteFinal(t('modalMotivo.erroConcluirAcao'))
    } finally {
      setEnviandoDescarteFinal(false)
    }
  }

  async function carregarFichaCompleta(
    curationId: number,
    orthancReferenceId: number
  ) {
    const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}`, {
      credentials: 'include',
    })
    if (resposta.status === 401) {
      router.push('/login')
      return
    }
    if (!resposta.ok) {
      setErroFila(t('ficha.erroCarregarFichaCriada'))
      return
    }
    const ficha = await resposta.json()
    setFichaAtiva({ curationId: ficha.id, orthancReferenceId })
    setStatusFicha(ficha.status ?? 'em_analise')
    setSegundaOpiniaoReview(null)
    setPainelLateral(PAGINA_INICIAL)
    if (ficha.status === 'segunda_opiniao') {
      carregarReviewSegundaOpiniao(curationId)
    }
    setForm({
      tipo_radiografia: ficha.tipo_radiografia ?? 'periapical',
      dentes: ficha.dentes ?? [],
      idade_min: ficha.idade_min !== null && ficha.idade_min !== undefined ? String(ficha.idade_min) : '',
      idade_max: ficha.idade_max !== null && ficha.idade_max !== undefined ? String(ficha.idade_max) : '',
      genero: ficha.genero ?? '',
      marcacoes: ficha.marcacoes ?? [],
      achados_detalhe: ficha.achados_detalhe ?? '',
      alteracoes_observadas: ficha.alteracoes_observadas ?? [],
      qualidade_tecnica: ficha.qualidade_tecnica ?? '',
      descricao_didatica: ficha.descricao_didatica ?? '',
      observacoes_internas: ficha.observacoes_internas ?? '',
      anonimizacao_validada: ficha.anonimizacao_validada ?? false,
    })
  }

  async function abrirImagem(imagem: ImagemPendente, indiceNavegacao?: number) {
    if (!autenticado || criandoId !== null) return
    setCriandoId(imagem.orthanc_reference_id)
    setErroFila('')
    // Toda imagem nova comeca sem nenhum dos dois sinais de "carregou" -
    // ve-lo comentario grande onde ohifCarregado/marcadorPronto sao
    // declarados. Precisa ser aqui (INICIO de abrirImagem, antes de
    // qualquer fetch), nao dentro de carregarFichaCompleta - senao ficaria
    // tarde demais: a fila so seria travada de novo DEPOIS que a ficha ja
    // tivesse carregado, deixando escapar a mesma corrida que este ajuste
    // existe pra fechar.
    setOhifCarregado(false)
    setMarcadorPronto(false)
    try {
      // Viewer-url so precisa do orthanc_reference_id, que ja temos aqui -
      // disparamos em paralelo com a criacao da ficha, em vez de esperar a
      // ficha carregar primeiro (essa espera sequencial era uma das causas
      // da demora ao abrir uma imagem).
      carregarViewerUrl(imagem.orthanc_reference_id)

      const respostaCriacao = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${imagem.orthanc_reference_id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ tipo_radiografia: 'periapical' }),
        }
      )
      if (respostaCriacao.status === 401) {
        router.push('/login')
        return
      }
      if (!respostaCriacao.ok) {
        setErroFila(await extrairErro(respostaCriacao, t('ficha.erroAbrirImagem')))
        return
      }
      const criada = await respostaCriacao.json()
      const novaFila = filaRef.current.filter(
        (item) => item.orthanc_reference_id !== imagem.orthanc_reference_id
      )
      filaRef.current = novaFila
      setFila(novaFila)
      const indice =
        indiceNavegacao ?? ordemInicialRef.current.findIndex((i) => i.orthanc_reference_id === imagem.orthanc_reference_id)
      setIndiceAtual(indice >= 0 ? indice : null)
      await carregarFichaCompleta(criada.curation_id, imagem.orthanc_reference_id)
    } catch {
      setErroFila(t('ficha.erroAbrirImagem'))
    } finally {
      setCriandoId(null)
    }
  }

  // Procura, a partir da posicao atual, o proximo/anterior item que ainda
  // esteja pendente (ainda em `fila`) - itens ja abertos saem da fila
  // assim que a ficha e criada, entao "Anterior" so alcanca algo se o
  // usuario tiver pulado itens sem processa-los.
  function indiceDisponivel(direcao: 1 | -1): number | null {
    if (indiceAtual === null) return null
    let i = indiceAtual + direcao
    while (i >= 0 && i < ordemInicialRef.current.length) {
      const alvo = ordemInicialRef.current[i]
      if (filaRef.current.some((f) => f.orthanc_reference_id === alvo.orthanc_reference_id)) return i
      i += direcao
    }
    return null
  }

  const podeAnterior = indiceDisponivel(-1) !== null
  const podeProxima = indiceDisponivel(1) !== null || ordemInicial.length < totalPendentes

  async function irParaAnterior() {
    const i = indiceDisponivel(-1)
    if (i === null) return
    await abrirImagem(ordemInicialRef.current[i], i)
  }

  // Usada tanto pelo botao "Proxima" (so fica habilitado quando ha um
  // proximo disponivel) quanto pelo avanco automatico apos
  // aprovar/salvar/descartar/segunda opiniao - nesse segundo caso pode nao
  // haver mais nada pendente, entao cai de volta pra tela de selecao.
  async function irParaProxima() {
    let i = indiceDisponivel(1)
    if (i === null && ordemInicialRef.current.length < totalPendentes && autenticado) {
      await carregarFila({ skip: ordemInicialRef.current.length, append: true })
      i = indiceDisponivel(1)
    }
    if (i === null) {
      finalizarFichaAtiva()
      return
    }
    await abrirImagem(ordemInicialRef.current[i], i)
  }

  function finalizarFichaAtiva() {
    setFichaAtiva(null)
    setViewerInfo(null)
    setForm(FORM_VAZIO)
    setModoAjustado(false)
    setIndiceAtual(null)
    setSegundaOpiniaoReview(null)
    setPainelLateral(PAGINA_INICIAL)
    if (autenticado) carregarFila()
  }

  async function salvarRascunho(opcoes?: { silencioso?: boolean }): Promise<boolean> {
    if (!fichaAtiva || !autenticado) return false
    setSalvandoRascunho(true)
    setErroFormulario('')
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${fichaAtiva.curationId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(construirPayloadEdicao(form)),
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return false
      }
      if (!resposta.ok) {
        setErroFormulario(await extrairErro(resposta, t('ficha.erroSalvarRascunho')))
        return false
      }
      if (!opcoes?.silencioso) {
        setRascunhoSalvo(true)
        setTimeout(() => setRascunhoSalvo(false), 2000)
      }
      return true
    } catch {
      setErroFormulario(t('ficha.erroSalvarRascunho'))
      return false
    } finally {
      setSalvandoRascunho(false)
    }
  }

  // Salvar/Aprovar/Descartar/Segunda opiniao agora avancam sozinhos pro
  // proximo estudo pendente (irParaProxima ja cai de volta pra tela de
  // selecao quando nao ha mais nada na fila) - o curador nao precisa
  // clicar em nada extra entre um estudo e o proximo.
  async function aoClicarSalvar() {
    const ok = await salvarRascunho({ silencioso: true })
    if (ok) irParaProxima()
  }

  async function aprovar() {
    if (!fichaAtiva || !autenticado) return
    const salvou = await salvarRascunho({ silencioso: true })
    if (!salvou) return

    setAprovando(true)
    setErroFormulario('')
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${fichaAtiva.curationId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ anonimizacao_validada: form.anonimizacao_validada }),
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErroFormulario(await extrairErro(resposta, t('ficha.erroAprovar')))
        return
      }
      await irParaProxima()
    } catch {
      setErroFormulario(t('ficha.erroAprovar'))
    } finally {
      setAprovando(false)
    }
  }

  async function confirmarMotivo() {
    if (!fichaAtiva || !autenticado || !modalMotivo) return
    const motivo = motivoTexto.trim()
    if (!motivo) {
      setErroMotivo(t('modalMotivo.erroMotivoObrigatorio'))
      return
    }

    setEnviandoMotivo(true)
    setErroMotivo('')
    const caminho = modalMotivo === 'descartar' ? 'discard' : 'request-review'
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${fichaAtiva.curationId}/${caminho}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ motivo }),
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErroMotivo(await extrairErro(resposta, t('modalMotivo.erroConcluirAcao')))
        return
      }
      setModalMotivo(null)
      setMotivoTexto('')
      await irParaProxima()
    } catch {
      setErroMotivo(t('modalMotivo.erroConcluirAcao'))
    } finally {
      setEnviandoMotivo(false)
    }
  }

  function abrirModalMotivo(tipo: 'descartar' | 'segunda_opiniao') {
    setModalMotivo(tipo)
    setMotivoTexto('')
    setErroMotivo('')
  }

  // Sai do modo foco (volta o layout normal) ao sair da tela cheia ou ao
  // trocar o painel lateral para os achados.
  useEffect(() => {
    if (painelLateral !== 'marcacao') {
      setMarcacaoEmDestaque(false)
      setPreviaMarcacao(false)
    }
  }, [painelLateral])

  function abrirPreviaMarcacao() {
    if (tempoPreviaRef.current) clearTimeout(tempoPreviaRef.current)
    // pequeno atraso: so amplia se o mouse "parar" na miniatura, nao ao
    // simplesmente passar por cima a caminho de outro botao
    tempoPreviaRef.current = setTimeout(() => setPreviaMarcacao(true), 140)
  }
  function fecharPreviaMarcacao() {
    if (tempoPreviaRef.current) clearTimeout(tempoPreviaRef.current)
    setPreviaMarcacao(false)
  }

  // Tecla M abre/fecha a imagem de marcacao (fora de campos de texto).
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (e.key !== 'm' && e.key !== 'M') return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const alvo = document.activeElement
      if (alvo instanceof HTMLElement && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return
      if (!fichaAtiva || modoAjustado) return
      e.preventDefault()
      alternarMarcacao()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  })

  // "Marcar imagem": a imagem para marcacao abre GRANDE no lugar do
  // visualizador (que vira miniatura); fechar volta aos achados.
  function alternarMarcacao() {
    if (painelLateral === 'marcacao') {
      fecharMarcacao()
      return
    }
    paginaAntesDaMarcacaoRef.current = painelLateral
    setPainelLateral('marcacao')
    setMarcacaoEmDestaque(true)
  }
  function fecharMarcacao() {
    setPainelLateral(paginaAntesDaMarcacaoRef.current === 'marcacao' ? PAGINA_INICIAL : paginaAntesDaMarcacaoRef.current)
    setMarcacaoEmDestaque(false)
    setPreviaMarcacao(false)
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  const fichaVisivel = !!fichaAtiva && !modoAjustado
  // A Curadoria abre SEMPRE no layout de tela cheia (sem barra do topo,
  // imagens em destaque), mesmo quando o navegador nao entra em tela cheia
  // de verdade - a Fullscreen API so e aceita depois de um clique do
  // usuario, entao o layout nao pode depender dela. O botao "Tela cheia"
  // do visualizador continua existindo para esconder tambem as barras do
  // proprio navegador.
  const modoFoco = fichaVisivel && painelLateral === 'marcacao'
  const marcacaoGrande = modoFoco && marcacaoEmDestaque
  const marcacaoMiniatura = modoFoco && !marcacaoEmDestaque
  const registroVisivel = registroAberto || !!erroFormulario

  // "Imagem principal terminou de carregar" = os dois sinais resolvidos,
  // cada um com um fallback pra quando o sinal correspondente NUNCA vai
  // disparar (senao a fila ficaria travada pra sempre nesses casos):
  // - OHIF: so espera o iframe carregar (ohifCarregado) SE houver de fato
  //   um iframe pra carregar (viewerPronto) - imagens sem StudyInstanceUID
  //   (viewerInfo.abrivel === false) nunca renderizam iframe nenhum.
  // - Marcador: so espera o painel "Imagem para marcacao" carregar
  //   (marcadorPronto) SE ele estiver de fato visivel (fichaVisivel) -
  //   no modo "Ajustar a tela" (modoAjustado) esse painel nem monta.
  const viewerPronto = !!(viewerInfo?.abrivel && viewerInfo.viewer_url)
  const ohifResolvido = !carregandoViewer && (!viewerPronto || ohifCarregado)
  const marcadorResolvido = !fichaVisivel || marcadorPronto
  const imagemPrincipalPronta = ohifResolvido && marcadorResolvido

  // Badge + dropdown "Aguardando sua decisao" - ao lado dos botoes de acao
  // (Salvar/Aprovar/Solicitar segunda opiniao/Descartar) na barra superior,
  // por pedido - antes ficava no cabecalho da pagina. So aparece quando ha
  // algo pra decidir. O dropdown fica sobreposto (absolute) em vez de
  // empurrar o layout.
  const badgeReviewsRespondidas = reviewsRespondidas.length === 0 ? null : (
    <div className="relative">
      <button
        type="button"
        onClick={() => setPainelReviewsAberto((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-purple-700/50 bg-purple-950/30 px-3 py-1 text-xs font-medium text-purple-300 hover:border-purple-500"
      >
        <span aria-hidden="true">🔔</span>
        {t('reviewsRespondidas.botaoComContagem', { contagem: reviewsRespondidas.length })}
      </button>

      {painelReviewsAberto && (
        <div className="absolute right-0 top-full z-30 mt-2 max-h-[70vh] w-[380px] overflow-y-auto rounded-2xl border border-base-border bg-base-surface p-3 shadow-2xl">
          <h2 className="mb-2 text-sm font-semibold text-ink">{t('reviewsRespondidas.titulo')}</h2>
          {reviewsRespondidas.map((item) => (
            <div
              key={item.id}
              className="mb-2 rounded-xl border border-base-border bg-base-surface2/70 p-3 text-sm last:mb-0"
            >
              <p className="text-xs text-slate-400">
                {rotularTipoRadiografia(item.curation.tipo_radiografia)} · {traduzirAchado(item.curation.achado_principal)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                <span className="font-medium text-slate-400">{t('reviewsRespondidas.motivoOriginal')}: </span>
                {item.motivo}
              </p>

              <div className="mt-2 rounded-lg border border-purple-800/40 bg-purple-950/30 p-2 text-xs text-purple-200/80">
                <p className="font-semibold text-purple-300">
                  {t(item.concordancia === 'concorda' ? 'reviewsRespondidas.concorda' : 'reviewsRespondidas.discorda')}
                </p>
                <p className="mt-1">{item.parecer_revisor || t('reviewsRespondidas.semParecerEscrito')}</p>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={!!anonimizacaoConfirmada[item.id]}
                  onChange={(e) =>
                    setAnonimizacaoConfirmada((prev) => ({ ...prev, [item.id]: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-base-border bg-base-surface2 text-brand"
                />
                {t('reviewsRespondidas.confirmarAnonimizacao')}
              </label>

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => aprovarDecisaoFinal(item)}
                  disabled={!anonimizacaoConfirmada[item.id] || aplicandoDecisaoId === item.id}
                  className="flex-1 rounded-lg border-2 border-emerald-600/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:border-emerald-500 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {aplicandoDecisaoId === item.id
                    ? t('reviewsRespondidas.aprovando')
                    : t('reviewsRespondidas.aprovar')}
                </button>
                <button
                  type="button"
                  onClick={() => abrirDescarteFinal(item)}
                  disabled={aplicandoDecisaoId === item.id}
                  className="flex-1 rounded-lg border-2 border-red-600/40 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:border-red-500 hover:bg-red-500/20 disabled:opacity-50"
                >
                  {t('reviewsRespondidas.descartar')}
                </button>
              </div>

              {errosDecisaoFinal[item.id] && (
                <p className="mt-2 text-xs text-red-400" role="alert">
                  {errosDecisaoFinal[item.id]}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="flex h-screen flex-col bg-base">
      {/* Topbar e o cabecalho abaixo somem em tela cheia - o alvo da
          Fullscreen API e document.documentElement (o <html> inteiro),
          entao a pagina inteira fica visivel automaticamente; se o alvo
          fosse um elemento especifico (ex.: visualizadorRef), a propria
          API ja esconderia tudo fora dele "de graca" - com o <html> como
          alvo, precisa ser explicito. */}
      {/* Sem Topbar: a Curadoria e sempre "tela cheia" (ver modoFoco). */}

      {/* Sem overflow-y-auto aqui de proposito: a linha de trabalho ocupa
          100% da altura disponivel - nunca sobra conteudo pra "vazar" e
          forcar rolagem da pagina inteira. */}
      <main className="flex h-full min-h-0 flex-1 flex-col gap-3 p-4">
        {(
          /* Cabecalho compacto, uma linha so (o espaco vertical e das
             imagens), no mesmo padrao visual das demais telas: logo,
             titulo no estilo titulo-pagina e o atalho para o inicio. */
          <div className="flex shrink-0 items-center gap-3">
            <Logo variante="icone" />
            <h1 className="titulo-pagina !text-xl">{t('titulo')}</h1>
            <Link
              href="/dashboard"
              className="ml-1 rounded-full border border-base-border bg-base-surface px-3 py-1 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
            >
              ← {t('inicio')}
            </Link>

            {/* Atalho visivel para a tela cheia "de verdade" (sem abas e
                barra de endereco): o navegador so deixa entrar nela com um
                clique ou tecla da pessoa - e cliques DENTRO do visualizador
                (iframe do OHIF) nao chegam a esta pagina, entao o
                "primeiro clique" automatico nem sempre consegue. Some
                assim que a tela cheia esta ativa. */}
            {!telaCheia && !janelaCheia && (
              <button
                type="button"
                onClick={alternarTelaCheia}
                className="ml-auto flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-400/10 px-3.5 py-1.5 text-xs font-medium text-teal-200 hover:bg-teal-400/20"
              >
                <span aria-hidden="true">⛶</span> {t('foco.entrarTelaCheia')}
              </button>
            )}
            {erroReviewsRespondidas && (
              <p className="text-xs text-red-400" role="alert">
                {erroReviewsRespondidas}
              </p>
            )}
          </div>
        )}

        {/* AREA DE TRABALHO - barra superior + fila horizontal + visualizador
            + ficha. Nao e o elemento que vira tela cheia (o alvo e o
            <html> inteiro) - o padding condicional
            (${telaCheia ? 'p-4' : ''}) continua aqui, pra dar uma
            respiro ao redor do conteudo quando o cabecalho/Topbar somem
            e a pagina inteira fica em tela cheia. */}
        <div
          ref={visualizadorRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
        >
          {/* Barra superior + fila horizontal agrupadas SEM gap entre elas
              (flex-col padrao, sem "gap-*") - pedido explicito pra que o
              topo das miniaturas da fila encoste na borda inferior da
              barra ("Imagem X de Y"). O gap-3 do container pai (acima)
              continua valendo em relacao aos outros irmaos (linha de
              imagens, ficha), so esse par aqui fica colado. */}
          <div className="flex shrink-0 flex-col">
            {fichaAtiva && (
              <BarraSuperiorCuradoria
                posicaoAtual={indiceAtual !== null ? indiceAtual + 1 : null}
                totalFila={totalPendentes}
                podeAnterior={podeAnterior}
                podeProxima={podeProxima}
                onAnterior={irParaAnterior}
                onProxima={irParaProxima}
                onSalvar={aoClicarSalvar}
                onAprovar={aprovar}
                onDescartar={() => abrirModalMotivo('descartar')}
                onSolicitarSegundaOpiniao={() => abrirModalMotivo('segunda_opiniao')}
                salvando={salvandoRascunho}
                aprovando={aprovando}
                extra={badgeReviewsRespondidas}
              />
            )}

            {/* Fila horizontal - entre a barra de acoes (Salvar/Aprovar/etc)
                e o visualizador, por pedido explicito. Sempre visivel (nao
                so quando fichaAtiva existe) - e o mecanismo de selecionar a
                primeira imagem em primeiro lugar (a LISTA em si e leve, so
                texto - o que e pesado sao os fetches de preview de cada
                miniatura, represados por permitirCarregarMiniaturas). */}
            <FilaCuradoriaHorizontal
              fila={fila}
              carregando={carregandoFila}
              erro={erroFila}
              criandoId={criandoId}
              ativoOrthancReferenceId={fichaAtiva?.orthancReferenceId}
              // So libera os fetches de preview das miniaturas depois que a
              // imagem principal (OHIF) E o painel de marcacao terminam de
              // carregar de verdade - ver imagemPrincipalPronta acima. O
              // `!!fichaAtiva` continua aqui porque imagemPrincipalPronta
              // sozinho comeca TRUE antes de qualquer ficha existir (nenhum
              // dos dois sinais tem nada pendente pra esperar ainda) - sem
              // essa parte, as miniaturas ficariam livres pra carregar antes
              // ate da 1a imagem abrir automaticamente. So usar `!!fichaAtiva`
              // sozinho (como antes) tambem nao bastava: isso so mede se a
              // FICHA (metadado) chegou, nao se as IMAGENS ja carregaram - e
              // como fichaAtiva fica true pra sempre a partir da 1a imagem, a
              // fila so ficava protegida nessa primeira vez; a partir da 2a
              // imagem (Proxima/Anterior/clique na fila) ela nunca mais era
              // travada de novo.
              permitirCarregarMiniaturas={!!fichaAtiva && imagemPrincipalPronta}
              onSelecionar={(imagem) => abrirImagem(imagem)}
            />
          </div>

          {/* LINHA DE IMAGENS - visualizador principal (OHIF, imagem
              atual do estudo) + painel lateral, lado a lado. O
              visualizador usa flex-[2] (definido dentro do proprio
              PainelVisualizador) contra o flex-1 do painel lateral: a
              marcacao/achados fica exatamente na metade do tamanho do
              visualizador, mas com a MESMA ALTURA (bem maior que a faixa
              baixa da ficha). O painel lateral some junto com a ficha no
              modo "ajustar a tela", devolvendo toda a largura ao
              visualizador.

              Esse painel lateral alterna entre 2 conteudos, com uma
              seta (estilo carrossel, igual a ficha): "Imagem para
              marcacao" (MarcadorAchado, onde o curador desenha
              oval/retangulo/seta pra indicar a lesao) e "Achados em
              radiografia" (checklist completo). A ideia e que o curador
              marca a lesao primeiro, depois vira pra achados - que
              assim ganham a altura toda do visualizador em vez de
              ficarem espremidos na faixa baixa da ficha (por isso
              achados saiu da ficha de baixo, que agora tem so 1 pagina -
              ver FichaCuradoriaForm.tsx e PainelAchadosRadiografia.tsx). */}
          <div className="relative flex min-h-0 flex-[4] gap-3">
            <div
              className={`relative flex min-h-0 min-w-0 ${
                marcacaoGrande ? 'h-[240px] w-[300px] flex-none self-start' : modoFoco ? 'flex-1' : 'flex-[2]'
              }`}
            >
            <PainelVisualizador
              fichaAtiva={!!fichaAtiva}
              carregandoViewer={carregandoViewer}
              viewerInfo={viewerInfo}
              telaCheia={telaCheia}
              onAlternarTelaCheia={alternarTelaCheia}
              modoAjustado={modoAjustado}
              onAlternarAjustar={() => setModoAjustado((v) => !v)}
              statusFicha={statusFicha}
              segundaOpiniaoReview={segundaOpiniaoReview}
              form={form}
              onChange={setForm}
              onIframeCarregado={() => setOhifCarregado(true)}
              miniatura={marcacaoGrande}
              marcacaoAtiva={painelLateral === 'marcacao'}
              onAlternarMarcacao={alternarMarcacao}
            />
            {/* Visualizador reduzido a miniatura (marcacao em destaque):
                uma camada transparente por cima captura o clique e
                destroca - o iframe continua montado, so menor. */}
            {marcacaoGrande && (
              <button
                type="button"
                onClick={fecharMarcacao}
                className="group absolute inset-0 z-20 flex items-end justify-center rounded-2xl bg-black/10 p-3 transition hover:bg-black/0"
                aria-label={t('foco.voltarVisualizador')}
                title={t('foco.voltarVisualizador')}
              >
                <span className="rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/15 transition group-hover:bg-brand">
                  ⇄ {t('foco.voltarVisualizador')}
                </span>
              </button>
            )}
            </div>

            {fichaVisivel && fichaAtiva && (() => {
              // Titulos/rotulos das 5 telas do carrossel, montados aqui (nao
              // como constante de modulo) porque dependem de `t()`. Ver
              // PAGINAS_PAINEL_LATERAL (topo do arquivo) pra ordem/indices.
              const indicePainel = PAGINAS_CARROSSEL.indexOf(painelLateral)
              const titulos: Record<PaginaPainelLateral, string> = {
                marcacao: t('painelLateral.imagemParaMarcacao'),
                achados1: t('painelLateral.achadosEmRadiografiaPagina', { pagina: 1, total: 2 }),
                achados2: t('painelLateral.achadosEmRadiografiaPagina', { pagina: 2, total: 2 }),
                achadosEstruturados: t('painelLateral.achadosEstruturadosTitulo'),
                erroTecnico: t('painelLateral.erroTecnicoTitulo'),
              }
              const rotulosProximo: Partial<Record<PaginaPainelLateral, string>> = {
                marcacao: t('painelLateral.verAchados'),
                achados1: t('painelLateral.verMaisAchados'),
                achados2: t('painelLateral.verAchadosEstruturados'),
                achadosEstruturados: t('painelLateral.verErroTecnico'),
              }
              const rotulosAnterior: Partial<Record<PaginaPainelLateral, string>> = {
                achados1: t('painelLateral.voltarParaMarcacao'),
                achados2: t('painelLateral.voltarAchadosAnteriores'),
                achadosEstruturados: t('painelLateral.voltarAchadosEstruturados'),
                erroTecnico: t('painelLateral.voltarErroTecnicoAnterior'),
              }

              // Tamanho do painel lateral conforme o modo:
              // - miniatura (modo foco): coluna estreita; com o mouse em
              //   cima, o painel "salta" para fora em tamanho grande (previa)
              //   sem empurrar o resto do layout;
              // - marcacao em destaque: ocupa o lugar grande do visualizador;
              // - achados/erro tecnico: coluna de largura fixa, para a
              //   imagem do visualizador continuar sendo o maior elemento.
              const classeColuna = marcacaoMiniatura
                ? 'relative w-[300px] flex-none'
                : marcacaoGrande
                  ? 'relative flex min-w-0 flex-1'
                  : 'relative flex w-[440px] flex-none'
              const classeSecao = marcacaoMiniatura
                ? previaMarcacao
                  ? 'absolute right-0 top-0 z-30 h-full w-[min(64vw,1100px)] shadow-[0_30px_90px_-20px_rgba(0,0,0,.95)] ring-1 ring-teal-400/50'
                  : 'relative h-[300px] w-full'
                : 'relative h-full w-full flex-1'
              const compacto = marcacaoMiniatura

              return (
                <div
                  className={classeColuna}
                  onMouseEnter={marcacaoMiniatura ? abrirPreviaMarcacao : undefined}
                  onMouseLeave={marcacaoMiniatura ? fecharPreviaMarcacao : undefined}
                >
                <section className={`flex min-h-[160px] flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface p-3 transition-[width,box-shadow] duration-200 ${classeSecao}`}>
                  <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-ink">{titulos[painelLateral]}</h2>
                    {marcacaoGrande && (
                      <button
                        type="button"
                        onClick={fecharMarcacao}
                        className="rounded-full border border-base-border bg-base-surface2 px-3 py-1 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                      >
                        ⇄ {t('foco.voltarVisualizador')}
                      </button>
                    )}
                  </div>
                  <div className={`min-h-0 flex-1 ${compacto ? 'px-0' : 'px-6'}`}>
                    {/* Sempre montado (mesmo escondido) para a imagem de
                        marcacao ja ir carregando junto com a principal -
                        assim ela aparece na hora ao clicar "Marcar imagem"
                        e a ordem de carregamento da fila continua a mesma. */}
                    <div className={painelLateral === 'marcacao' ? 'h-full' : 'hidden'}>
                      <MarcadorAchado
                        orthancReferenceId={fichaAtiva.orthancReferenceId}
                        marcacoes={form.marcacoes}
                        onMarcar={(marcacoes) => setForm({ ...form, marcacoes })}
                        onCarregou={() => setMarcadorPronto(true)}
                        compacto={compacto}
                      />
                    </div>
                    {(painelLateral === 'achados1' || painelLateral === 'achados2') && (
                      <PainelAchadosRadiografia form={form} onChange={setForm} pagina={painelLateral === 'achados1' ? 1 : 2} />
                    )}
                    {painelLateral === 'achadosEstruturados' && (
                      <PainelAchadosEstruturados
                        curationId={fichaAtiva.curationId}
                        statusFicha={statusFicha}
                        dentesDaFicha={form.dentes}
                        marcacoesDaFicha={form.marcacoes}
                      />
                    )}
                    {painelLateral === 'erroTecnico' && (
                      <PainelErroTecnico curationId={fichaAtiva.curationId} statusFicha={statusFicha} />
                    )}
                  </div>

                  {/* Setas do carrossel de 5 telas (marcacao -> achados1 ->
                      achados2 -> achadosEstruturados -> erroTecnico): a de
                      avancar so aparece quando ha uma proxima tela, a de
                      voltar so quando ha uma anterior. */}
                  {indicePainel >= 0 && indicePainel < PAGINAS_CARROSSEL.length - 1 && (
                    <button
                      type="button"
                      onClick={() => setPainelLateral(PAGINAS_CARROSSEL[indicePainel + 1])}
                      aria-label={rotulosProximo[painelLateral]}
                      title={rotulosProximo[painelLateral]}
                      className="absolute right-1.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-lg text-slate-300 shadow hover:border-brand hover:text-brand-300"
                    >
                      ›
                    </button>
                  )}
                  {indicePainel > 0 && (
                    <button
                      type="button"
                      onClick={() => setPainelLateral(PAGINAS_CARROSSEL[indicePainel - 1])}
                      aria-label={rotulosAnterior[painelLateral]}
                      title={rotulosAnterior[painelLateral]}
                      className="absolute left-1.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-lg text-slate-300 shadow hover:border-brand hover:text-brand-300"
                    >
                      ‹
                    </button>
                  )}

                  {/* Miniatura/previa: o clique FIXA a imagem de marcacao em
                      tamanho grande (no lugar do visualizador). Fica abaixo
                      das setas do carrossel (z-10 x z-20), entao elas
                      continuam clicaveis. */}
                  {compacto && (
                    <button
                      type="button"
                      onClick={() => {
                        fecharPreviaMarcacao()
                        setMarcacaoEmDestaque(true)
                      }}
                      className="absolute inset-0 z-[5] flex items-end justify-center p-4"
                      aria-label={t('foco.fixarGrande')}
                      title={t('foco.fixarGrande')}
                    >
                      <span className="rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/15">
                        {previaMarcacao ? t('foco.cliqueParaFixar') : t('foco.passeMouse')}
                      </span>
                    </button>
                  )}
                </section>
                </div>
              )
            })()}
          </div>

          {/* Ficha de curadoria - escondida temporariamente no modo
              "ajustar a tela" (as acoes continuam na barra superior).
              Proporcao 4:1 (80% da altura pro visualizador, 20% pra
              ficha) - so foi possivel encolher tanto a ficha porque
              "Achados em radiografia" (a secao mais alta, com a lista
              inteira de checkboxes) saiu daqui de vez: agora mora no
              painel lateral, ao lado do OHIF (ver comentario acima e
              PainelAchadosRadiografia.tsx). O que resta aqui embaixo
              (so "Regiao anatomica", sem mais paginacao - ver
              FichaCuradoriaForm.tsx) e bem mais curto. As duas linhas
              sempre somam exatamente a altura disponivel dentro da area
              de trabalho - e, por estar aqui dentro, continua acessivel
              em tela cheia. */}
          {fichaVisivel && fichaAtiva && (
            <button
              type="button"
              onClick={() => setRegistroAberto((v) => !v)}
              aria-expanded={registroVisivel}
              className="flex shrink-0 items-center justify-between rounded-xl border border-base-border bg-base-surface px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
            >
              <span>{t('foco.registro')}</span>
              <span className="text-xs font-normal text-slate-400">
                {registroVisivel ? t('foco.ocultarRegistro') : t('foco.mostrarRegistro')} {registroVisivel ? '▾' : '▸'}
              </span>
            </button>
          )}
          {fichaVisivel && fichaAtiva && registroVisivel && (
            <div className="min-h-0 flex-1">
              <FichaCuradoriaForm
                form={form}
                onChange={setForm}
                statusFicha={statusFicha}
                erro={erroFormulario}
                rascunhoSalvo={rascunhoSalvo}
              />
            </div>
          )}
        </div>
      </main>

      {modalMotivo && (
        <ModalMotivo
          tipo={modalMotivo}
          motivoTexto={motivoTexto}
          onMotivoChange={setMotivoTexto}
          erro={erroMotivo}
          enviando={enviandoMotivo}
          onCancelar={() => setModalMotivo(null)}
          onConfirmar={confirmarMotivo}
        />
      )}

      {/* Descarte da decisao final (segunda opiniao) - mesmo ModalMotivo,
          tipo "descartar" (mesma justificativa obrigatoria de /discard),
          so que confirma chamando apply-review-decision numa ficha que
          pode nao ser a fichaAtiva em edicao. */}
      {descarteFinalAlvo && (
        <ModalMotivo
          tipo="descartar"
          motivoTexto={motivoDescarteFinal}
          onMotivoChange={setMotivoDescarteFinal}
          erro={erroDescarteFinal}
          enviando={enviandoDescarteFinal}
          onCancelar={() => setDescarteFinalAlvo(null)}
          onConfirmar={confirmarDescarteFinal}
        />
      )}
    </div>
  )
}
