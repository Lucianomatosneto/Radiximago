'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Topbar from '../../components/Topbar'
import FilaCuradoriaHorizontal, { ImagemPendente } from '../../components/curadoria/FilaCuradoriaHorizontal'
import PainelVisualizador, { ViewerInfo } from '../../components/curadoria/PainelVisualizador'
import MarcadorAchado from '../../components/curadoria/MarcadorAchado'
import PainelAchadosRadiografia from '../../components/curadoria/PainelAchadosRadiografia'
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
  const visualizadorRef = useRef<HTMLDivElement | null>(null)
  const [telaCheia, setTelaCheia] = useState(false)
  // So dispara uma vez, na entrada na tela - mesmo padrao ja usado em
  // segunda-opiniao/page.tsx (autoTelaCheiaRef). Depois desse primeiro
  // disparo, trocar de imagem (proxima/anterior/clique na fila) nao forca
  // tela cheia de novo, entao um curador que saiu do modo tela cheia
  // continua fora dele ao avancar pra proxima imagem.
  const autoTelaCheiaRef = useRef(false)
  // Trava contra 2 chamadas de alternarTelaCheia quase simultaneas pro
  // mesmo clique - ver comentario dentro de alternarTelaCheia.
  const telaCheiaEmAndamentoRef = useRef(false)
  // Espelham fichaAtiva/viewerInfo em refs (mantidos por 2 useEffect logo
  // abaixo) - servem so pro listener de fallback de tela cheia ler o
  // estado mais atual sem precisar que o PROPRIO efeito que arma o
  // listener dependa de fichaAtiva/viewerInfo. Ver o comentario grande no
  // useEffect do fallback (mais abaixo) pro motivo disso.
  const fichaAtivaRef = useRef<FichaAtiva | null>(null)
  const viewerInfoRef = useRef<ViewerInfo | null>(null)
  const [modoAjustado, setModoAjustado] = useState(false)
  const [iframeReloadKey, setIframeReloadKey] = useState(0)
  // Painel ao lado do OHIF alterna entre a imagem de marcacao e os achados
  // em radiografia (setas no proprio painel) - o curador marca a lesao
  // primeiro (imagem), depois vira pra achados, que ganham a mesma altura
  // grande do visualizador em vez de ficarem espremidos na faixa baixa da
  // ficha la embaixo. Reseta pra "marcacao" sempre que uma imagem nova
  // abre (ver carregarFichaCompleta/finalizarFichaAtiva) - cada imagem
  // comeca do zero, sem herdar o "achados" da imagem anterior.
  const [painelLateral, setPainelLateral] = useState<'marcacao' | 'achados'>('marcacao')

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

  // Mantem fichaAtivaRef/viewerInfoRef sincronizados com o estado real -
  // usados pelo listener de fallback abaixo pra ler o valor mais recente
  // sem precisar que o efeito que arma o listener dependa deles.
  useEffect(() => {
    fichaAtivaRef.current = fichaAtiva
  }, [fichaAtiva])
  useEffect(() => {
    viewerInfoRef.current = viewerInfo
  }, [viewerInfo])

  // Entra em tela cheia automaticamente assim que a PRIMEIRA imagem fica
  // pronta (so uma vez) - reaproveita a mesma alternarTelaCheia usada pelo
  // botao manual. Mesmo padrao ja usado em segunda-opiniao/page.tsx, com
  // uma diferenca importante: aqui exige tambem `fichaAtiva`, nao so
  // `viewerInfo`. Na Segunda Opiniao a review ja existe, entao
  // `reviewAtiva` e setado de forma sincrona antes dos fetches; aqui,
  // abrir uma imagem PRIMEIRO cria a ficha no backend (await) pra so
  // depois setar fichaAtiva - e carregarViewerUrl roda em paralelo com
  // essa criacao, entao viewerInfo costuma ficar pronto ANTES de
  // fichaAtiva. Disparar so com viewerInfo (sem fichaAtiva) entrava em
  // tela cheia ainda no estado vazio "Selecione uma imagem na fila ao
  // lado" (PainelVisualizador so mostra o iframe quando fichaAtiva E
  // viewerInfo estao prontos - ver viewerPronto em PainelVisualizador.tsx).
  useEffect(() => {
    if (autoTelaCheiaRef.current) return
    if (!fichaAtiva) return
    if (!viewerInfo?.abrivel || !viewerInfo.viewer_url) return
    autoTelaCheiaRef.current = true
    alternarTelaCheia()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fichaAtiva, viewerInfo])

  // Fallback pra quando a tentativa direta acima e negada pelo navegador:
  // navegadores so aceitam a Fullscreen API dentro de uma janela curta
  // depois de uma interacao real do usuario ("ativacao" do clique), e
  // essa janela e mais apertada aqui do que na Segunda Opiniao - abrir a
  // primeira imagem exige 2 idas ao backend em sequencia (criar a ficha,
  // so depois buscar a ficha completa) antes de fichaAtiva ficar pronto,
  // entao a ativacao do clique que trouxe o curador ate aqui (no menu)
  // pode ja ter expirado quando o efeito acima dispara - o pedido e
  // negado em silencio (alternarTelaCheia so ignora o erro).
  //
  // ESSENCIAL: este efeito roda com dependencia VAZIA (arma o listener
  // uma unica vez, na montagem da pagina) - NAO com [fichaAtiva,
  // viewerInfo] como estava antes. Antes, o listener vivia dentro do
  // MESMO efeito que a tentativa direta: toda vez que fichaAtiva ou
  // viewerInfo mudavam de referencia (ex.: ao trocar de imagem pela fila,
  // mesmo que o curador ainda nao tivesse clicado em lugar nenhum), o
  // cleanup do efeito removia os listeners de pointerdown/keydown - mas
  // como autoTelaCheiaRef.current ja estava true (setado na 1a vez que o
  // efeito rodou de verdade), o efeito nunca os recriava, deixando a
  // pagina sem NENHUM listener de fallback pelo resto da sessao (o botao
  // manual continuava funcionando normalmente, por ter handler proprio,
  // direto, sem depender desse listener). Com dependencia vazia, o
  // listener e armado uma vez so e sobrevive ate realmente disparar -
  // le o estado mais atual via fichaAtivaRef/viewerInfoRef (nao via
  // closure), entao funciona independente de quantas imagens ja tenham
  // trocado antes da primeira interacao real do curador.
  useEffect(() => {
    let consumido = false

    function aoInteragir() {
      if (consumido) return
      if (document.fullscreenElement) {
        // A tentativa direta (efeito acima) ja funcionou - nada a fazer
        // aqui, so para de escutar (chamar alternarTelaCheia de novo
        // SAIRIA da tela cheia, por ser um alternador).
        consumido = true
        document.removeEventListener('pointerdown', aoInteragir)
        document.removeEventListener('keydown', aoInteragir)
        return
      }
      const ficha = fichaAtivaRef.current
      const viewer = viewerInfoRef.current
      if (!ficha || !viewer?.abrivel || !viewer.viewer_url) return // continua escutando a proxima interacao
      consumido = true
      document.removeEventListener('pointerdown', aoInteragir)
      document.removeEventListener('keydown', aoInteragir)
      alternarTelaCheia()
    }

    document.addEventListener('pointerdown', aoInteragir)
    document.addEventListener('keydown', aoInteragir)
    return () => {
      document.removeEventListener('pointerdown', aoInteragir)
      document.removeEventListener('keydown', aoInteragir)
    }
  }, [])

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
      setTelaCheia(document.fullscreenElement === visualizadorRef.current)
    }
    document.addEventListener('fullscreenchange', aoMudarTelaCheia)
    return () => document.removeEventListener('fullscreenchange', aoMudarTelaCheia)
  }, [])

  async function alternarTelaCheia() {
    if (!visualizadorRef.current) return
    // Trava contra chamadas concorrentes pro MESMO clique: o listener de
    // fallback (useEffect logo acima) e o proprio botao "Tela cheia" podem
    // disparar quase juntos quando a primeira interacao do curador cai
    // bem em cima do botao (pointerdown aciona o fallback, o click do
    // botao aciona de novo alguns ms depois). Sem essa trava, a 2a chamada
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
        await visualizadorRef.current.requestFullscreen()
      }
    } catch {
      // navegador pode negar (ex.: sem interacao do usuario) - ignora
    } finally {
      telaCheiaEmAndamentoRef.current = false
    }
  }

  function centralizarImagem() {
    // Sem ponte (postMessage) com o OHIF, que roda em outra origem - a
    // forma segura de "recentralizar" sem tocar no funcionamento interno
    // dele e recarregar o mesmo iframe, que volta ao estado inicial.
    setIframeReloadKey((k) => k + 1)
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
    setPainelLateral('marcacao')
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
    setPainelLateral('marcacao')
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

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  const fichaVisivel = !!fichaAtiva && !modoAjustado

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
      <Topbar />

      {/* Sem overflow-y-auto aqui de proposito: a linha de trabalho ocupa
          100% da altura disponivel - nunca sobra conteudo pra "vazar" e
          forcar rolagem da pagina inteira. */}
      <main className="flex h-full min-h-0 flex-1 flex-col gap-3 p-4">
        {/* Cabecalho compacto, uma linha so - o espaco vertical aqui e
            precioso (a imagem e a ficha e que importam pro curador no dia
            a dia, nao o titulo da tela). */}
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-full border border-base-border px-2.5 py-1 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
          >
            ← {t('inicio')}
          </Link>
          <h1 className="text-sm font-semibold text-ink">
            {t('titulo')}<span className="text-brand-300">.</span>
          </h1>

          {erroReviewsRespondidas && (
            <p className="text-xs text-red-400" role="alert">
              {erroReviewsRespondidas}
            </p>
          )}
        </div>

        {/* AREA DE TRABALHO - barra superior + fila horizontal + visualizador
            + ficha, tudo dentro do MESMO elemento que vira tela cheia
            (Fullscreen API so mostra o elemento pedido, escondendo tudo
            fora dele) - assim o curador consegue curar (ver a imagem
            grande, trocar de imagem na fila E preencher a ficha) sem sair
            do modo tela cheia. Antes a fila (coluna lateral vertical)
            ficava deliberadamente FORA da tela cheia; agora, como faixa
            horizontal compacta no topo, ela entrou pra dentro - por
            pedido explicito, pra dar pra trocar de imagem sem sair da
            tela cheia. */}
        <div
          ref={visualizadorRef}
          className={`flex min-h-0 min-w-0 flex-1 flex-col gap-3 bg-base ${telaCheia ? 'p-4' : ''}`}
        >
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
            // ficha ativa (imagem principal + painel de marcacao)
            // terminou de carregar - antes disso, dezenas de miniaturas
            // ficando visiveis de uma vez disputariam as mesmas conexoes
            // das chamadas criticas (criar ficha, buscar viewer-url,
            // buscar ficha completa), atrasando a imagem principal (ver
            // comentario em MiniaturaFila.tsx).
            permitirCarregarMiniaturas={!!fichaAtiva}
            onSelecionar={(imagem) => abrirImagem(imagem)}
          />

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
          <div className="flex min-h-0 flex-[4] gap-3">
            <PainelVisualizador
              fichaAtiva={!!fichaAtiva}
              carregandoViewer={carregandoViewer}
              viewerInfo={viewerInfo}
              telaCheia={telaCheia}
              onAlternarTelaCheia={alternarTelaCheia}
              modoAjustado={modoAjustado}
              onAlternarAjustar={() => setModoAjustado((v) => !v)}
              onCentralizar={centralizarImagem}
              iframeReloadKey={iframeReloadKey}
              statusFicha={statusFicha}
              segundaOpiniaoReview={segundaOpiniaoReview}
              form={form}
              onChange={setForm}
            />

            {fichaVisivel && fichaAtiva && (
              <section className="relative flex h-full min-h-[160px] flex-1 flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface p-3">
                <h2 className="mb-2 shrink-0 text-sm font-semibold text-ink">
                  {painelLateral === 'marcacao' ? t('painelLateral.imagemParaMarcacao') : t('painelLateral.achadosEmRadiografia')}
                </h2>
                <div className="min-h-0 flex-1 px-6">
                  {painelLateral === 'marcacao' ? (
                    <MarcadorAchado
                      orthancReferenceId={fichaAtiva.orthancReferenceId}
                      marcacoes={form.marcacoes}
                      onMarcar={(marcacoes) => setForm({ ...form, marcacoes })}
                    />
                  ) : (
                    <PainelAchadosRadiografia form={form} onChange={setForm} />
                  )}
                </div>

                {/* Setas do carrossel: so a de avancar (achados) aparece
                    em cima da marcacao, so a de voltar aparece em cima
                    dos achados - mesmo padrao visual da ficha de baixo. */}
                {painelLateral === 'marcacao' && (
                  <button
                    type="button"
                    onClick={() => setPainelLateral('achados')}
                    aria-label={t('painelLateral.verAchados')}
                    title={t('painelLateral.verAchados')}
                    className="absolute right-1.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-lg text-slate-300 shadow hover:border-brand hover:text-brand-300"
                  >
                    ›
                  </button>
                )}
                {painelLateral === 'achados' && (
                  <button
                    type="button"
                    onClick={() => setPainelLateral('marcacao')}
                    aria-label={t('painelLateral.voltarParaMarcacao')}
                    title={t('painelLateral.voltarParaMarcacao')}
                    className="absolute left-1.5 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-base-border bg-base-surface2 text-lg text-slate-300 shadow hover:border-brand hover:text-brand-300"
                  >
                    ‹
                  </button>
                )}
              </section>
            )}
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
