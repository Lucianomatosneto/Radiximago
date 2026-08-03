'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Topbar from '../../components/Topbar'
import FilaCuradoria, { ImagemPendente } from '../../components/curadoria/FilaCuradoria'
import PainelVisualizador, { ViewerInfo } from '../../components/curadoria/PainelVisualizador'
import FichaCuradoriaForm, { FormularioFicha, FORM_VAZIO } from '../../components/curadoria/FichaCuradoriaForm'
import BarraSuperiorCuradoria from '../../components/curadoria/BarraSuperiorCuradoria'
import ModalMotivo from '../../components/curadoria/ModalMotivo'
import { ReviewInfo } from '../../components/curadoria/SegundaOpiniaoBanner'

const PERFIS_PERMITIDOS = ['administrador', 'suporte', 'curador']

interface FichaAtiva {
  curationId: number
  orthancReferenceId: number
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
  const [token, setToken] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const [fila, setFila] = useState<ImagemPendente[]>([])
  const [ordemInicial, setOrdemInicial] = useState<ImagemPendente[]>([])
  const [totalPendentes, setTotalPendentes] = useState(0)
  const filaRef = useRef<ImagemPendente[]>([])
  const ordemInicialRef = useRef<ImagemPendente[]>([])

  const [carregandoFila, setCarregandoFila] = useState(false)
  const [erroFila, setErroFila] = useState('')
  const [criandoId, setCriandoId] = useState<number | null>(null)
  const [filaColapsada, setFilaColapsada] = useState(false)
  const [indiceAtual, setIndiceAtual] = useState<number | null>(null)

  const [fichaAtiva, setFichaAtiva] = useState<FichaAtiva | null>(null)
  const [statusFicha, setStatusFicha] = useState('em_analise')
  const [segundaOpiniaoReview, setSegundaOpiniaoReview] = useState<ReviewInfo | null>(null)
  const [viewerInfo, setViewerInfo] = useState<ViewerInfo | null>(null)
  const [carregandoViewer, setCarregandoViewer] = useState(false)
  const visualizadorRef = useRef<HTMLDivElement | null>(null)
  const [telaCheia, setTelaCheia] = useState(false)
  const [modoAjustado, setModoAjustado] = useState(false)
  const [iframeReloadKey, setIframeReloadKey] = useState(0)

  const [form, setForm] = useState<FormularioFicha>(FORM_VAZIO)

  const [salvandoRascunho, setSalvandoRascunho] = useState(false)
  const [rascunhoSalvo, setRascunhoSalvo] = useState(false)
  const [aprovando, setAprovando] = useState(false)
  const [erroFormulario, setErroFormulario] = useState('')

  const [modalMotivo, setModalMotivo] = useState<'descartar' | 'segunda_opiniao' | null>(null)
  const [motivoTexto, setMotivoTexto] = useState('')
  const [enviandoMotivo, setEnviandoMotivo] = useState(false)
  const [erroMotivo, setErroMotivo] = useState('')

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

  function aplicarFila(itens: ImagemPendente[], total: number, opcoes?: { append?: boolean }) {
    const novaFila = opcoes?.append ? [...filaRef.current, ...itens] : itens
    const novaOrdem = opcoes?.append ? [...ordemInicialRef.current, ...itens] : itens
    filaRef.current = novaFila
    ordemInicialRef.current = novaOrdem
    setFila(novaFila)
    setOrdemInicial(novaOrdem)
    setTotalPendentes(total)
  }

  async function carregarFila(tokenAtual: string, opcoes?: { skip?: number; append?: boolean }) {
    setCarregandoFila(true)
    setErroFila('')
    try {
      const skip = opcoes?.skip ?? 0
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/pending?skip=${skip}&limit=50`,
        { headers: { Authorization: `Bearer ${tokenAtual}` } }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        router.push('/login')
        return
      }
      const dados = await resposta.json()
      aplicarFila(dados.itens ?? [], dados.total_pendentes ?? 0, { append: opcoes?.append })
    } catch {
      router.push('/login')
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

  function centralizarImagem() {
    // Sem ponte (postMessage) com o OHIF, que roda em outra origem - a
    // forma segura de "recentralizar" sem tocar no funcionamento interno
    // dele e recarregar o mesmo iframe, que volta ao estado inicial.
    setIframeReloadKey((k) => k + 1)
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
  async function carregarReviewSegundaOpiniao(tokenAtual: string, curationId: number) {
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}/reviews`, {
        headers: { Authorization: `Bearer ${tokenAtual}` },
      })
      if (!resposta.ok) return
      const dados = await resposta.json()
      const itens: ReviewInfo[] = dados.itens ?? []
      setSegundaOpiniaoReview(itens.length > 0 ? itens[itens.length - 1] : null)
    } catch {
      // banner so aparece se o dado existir
    }
  }

  async function carregarFichaCompleta(
    tokenAtual: string,
    curationId: number,
    orthancReferenceId: number
  ) {
    const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/${curationId}`, {
      headers: { Authorization: `Bearer ${tokenAtual}` },
    })
    if (resposta.status === 401) {
      router.push('/login')
      return
    }
    if (!resposta.ok) {
      setErroFila('Não foi possível carregar a ficha criada.')
      return
    }
    const ficha = await resposta.json()
    setFichaAtiva({ curationId: ficha.id, orthancReferenceId })
    setStatusFicha(ficha.status ?? 'em_analise')
    setSegundaOpiniaoReview(null)
    if (ficha.status === 'segunda_opiniao') {
      carregarReviewSegundaOpiniao(tokenAtual, curationId)
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
    if (!token || criandoId !== null) return
    setCriandoId(imagem.orthanc_reference_id)
    setErroFila('')
    try {
      // Viewer-url so precisa do orthanc_reference_id, que ja temos aqui -
      // disparamos em paralelo com a criacao da ficha, em vez de esperar a
      // ficha carregar primeiro (essa espera sequencial era uma das causas
      // da demora ao abrir uma imagem).
      carregarViewerUrl(token, imagem.orthanc_reference_id)

      const respostaCriacao = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${imagem.orthanc_reference_id}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ tipo_radiografia: 'periapical' }),
        }
      )
      if (respostaCriacao.status === 401) {
        router.push('/login')
        return
      }
      if (!respostaCriacao.ok) {
        setErroFila(await extrairErro(respostaCriacao, 'Não foi possível abrir esta imagem para curadoria.'))
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
      await carregarFichaCompleta(token, criada.curation_id, imagem.orthanc_reference_id)
    } catch {
      setErroFila('Não foi possível abrir esta imagem para curadoria.')
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
    if (i === null && ordemInicialRef.current.length < totalPendentes && token) {
      await carregarFila(token, { skip: ordemInicialRef.current.length, append: true })
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
    setFilaColapsada(false)
    setModoAjustado(false)
    setIndiceAtual(null)
    setSegundaOpiniaoReview(null)
    if (token) carregarFila(token)
  }

  async function salvarRascunho(opcoes?: { silencioso?: boolean }): Promise<boolean> {
    if (!fichaAtiva || !token) return false
    setSalvandoRascunho(true)
    setErroFormulario('')
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${fichaAtiva.curationId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(construirPayloadEdicao(form)),
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return false
      }
      if (!resposta.ok) {
        setErroFormulario(await extrairErro(resposta, 'Não foi possível salvar o rascunho.'))
        return false
      }
      if (!opcoes?.silencioso) {
        setRascunhoSalvo(true)
        setTimeout(() => setRascunhoSalvo(false), 2000)
      }
      return true
    } catch {
      setErroFormulario('Não foi possível salvar o rascunho.')
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
    if (!fichaAtiva || !token) return
    const salvou = await salvarRascunho({ silencioso: true })
    if (!salvou) return

    setAprovando(true)
    setErroFormulario('')
    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/curation/${fichaAtiva.curationId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ anonimizacao_validada: form.anonimizacao_validada }),
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErroFormulario(await extrairErro(resposta, 'Não foi possível aprovar a ficha.'))
        return
      }
      await irParaProxima()
    } catch {
      setErroFormulario('Não foi possível aprovar a ficha.')
    } finally {
      setAprovando(false)
    }
  }

  async function confirmarMotivo() {
    if (!fichaAtiva || !token || !modalMotivo) return
    const motivo = motivoTexto.trim()
    if (!motivo) {
      setErroMotivo('Informe um motivo.')
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
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ motivo }),
        }
      )
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErroMotivo(await extrairErro(resposta, 'Não foi possível concluir a ação.'))
        return
      }
      setModalMotivo(null)
      setMotivoTexto('')
      await irParaProxima()
    } catch {
      setErroMotivo('Não foi possível concluir a ação.')
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
        <p className="text-slate-300">Carregando...</p>
      </main>
    )
  }

  const fichaVisivel = !!fichaAtiva && !modoAjustado

  return (
    <div className="flex h-screen flex-col bg-base">
      <Topbar />

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <Link
                href="/dashboard"
                className="rounded-full border border-base-border px-3 py-1 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
              >
                ← Início
              </Link>
            </div>
            <h1 className="text-2xl font-bold text-ink">
              Curadoria<span className="text-brand-300">.</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Analise a imagem e preencha a ficha de curadoria correspondente.
            </p>
          </div>
        </div>

        {/* AREA DE TRABALHO - barra superior + visualizador + ficha, tudo
            dentro do mesmo elemento que vira tela cheia. Antes so o
            visualizador entrava em tela cheia (Fullscreen API so mostra o
            elemento que foi pedido, escondendo tudo fora dele) e a coluna
            da ficha - e os botoes de Salvar/Aprovar/Descartar - sumiam.
            Agora os dois ficam dentro do mesmo container, entao continuam
            visiveis em tela cheia. A fila (fora deste ref, ver abaixo) fica
            de fora de proposito, pra dar o maximo de espaco pro trabalho
            na imagem ativa mesmo em tela cheia. */}
        <div ref={visualizadorRef} className={`flex min-w-0 flex-1 flex-col gap-4 bg-base ${telaCheia ? 'p-4' : ''}`}>
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
            />
          )}

          <div className={`grid flex-1 grid-cols-1 gap-4 ${fichaVisivel ? 'lg:grid-cols-[minmax(480px,1fr)_380px]' : ''}`}>
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
            />

            {/* Formulario de curadoria (escondido temporariamente no modo
                "ajustar a tela" - as acoes continuam na barra superior) */}
            {fichaVisivel && fichaAtiva && (
              <FichaCuradoriaForm
                form={form}
                onChange={setForm}
                statusFicha={statusFicha}
                erro={erroFormulario}
                rascunhoSalvo={rascunhoSalvo}
                orthancReferenceId={fichaAtiva.orthancReferenceId}
              />
            )}
          </div>
        </div>
      </main>

      {/* FAIXA - fila de curadoria, fixa na parte inferior da tela (fora do
          <main> que rola) - assim fica sempre visivel, sem precisar rolar
          a pagina pra ver ou trocar de item. Fora do visualizadorRef de
          proposito: some em tela cheia, igual antes. */}
      <section className="shrink-0 border-t border-base-border bg-base-surface">
        <FilaCuradoria
          fila={fila}
          carregando={carregandoFila}
          erro={erroFila}
          criandoId={criandoId}
          ativoOrthancReferenceId={fichaAtiva?.orthancReferenceId}
          colapsada={filaColapsada}
          onSelecionar={(imagem) => abrirImagem(imagem)}
          onColapsar={() => setFilaColapsada(true)}
          onExpandir={() => setFilaColapsada(false)}
        />
      </section>

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
    </div>
  )
}
