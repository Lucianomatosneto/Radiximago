'use client'

import { useEffect, useRef, useState, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Topbar from '../../components/Topbar'

const PERFIS_PERMITIDOS = ['administrador', 'suporte', 'curador']

const DENTES_PERMANENTES = [
  ...Array.from({ length: 8 }, (_, i) => 11 + i),
  ...Array.from({ length: 8 }, (_, i) => 21 + i),
  ...Array.from({ length: 8 }, (_, i) => 31 + i),
  ...Array.from({ length: 8 }, (_, i) => 41 + i),
]

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

// Valores reais do enum AchadoPrincipal no backend (nao aceita texto livre).
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

// Valores reais do enum AlteracaoObservada no backend, agrupados por
// categoria so pra organizar a exibicao - o backend guarda como lista
// plana de strings.
const CATEGORIAS_ALTERACOES: { categoria: string; itens: { valor: string; label: string }[] }[] = [
  {
    categoria: 'Cárie',
    itens: [
      { valor: 'carie_esmalte', label: 'Cárie em esmalte' },
      { valor: 'carie_dentina', label: 'Cárie em dentina' },
      { valor: 'carie_proxima_polpa', label: 'Cárie próxima à polpa' },
      { valor: 'carie_secundaria', label: 'Cárie secundária (sob restauração)' },
    ],
  },
  {
    categoria: 'Periodontal',
    itens: [
      { valor: 'perda_ossea_horizontal', label: 'Perda óssea horizontal' },
      { valor: 'perda_ossea_vertical', label: 'Perda óssea vertical' },
      { valor: 'calculo_dentario', label: 'Cálculo dentário (tártaro)' },
      { valor: 'alargamento_ligamento_periodontal', label: 'Alargamento do ligamento periodontal' },
    ],
  },
  {
    categoria: 'Periapical / Endodôntico',
    itens: [
      { valor: 'lesao_periapical', label: 'Lesão periapical' },
      { valor: 'reabsorcao_radicular_externa', label: 'Reabsorção radicular externa' },
      { valor: 'reabsorcao_radicular_interna', label: 'Reabsorção radicular interna' },
      { valor: 'tratamento_endodontico_presente', label: 'Tratamento endodôntico presente' },
      { valor: 'tratamento_endodontico_inadequado', label: 'Tratamento endodôntico inadequado' },
      { valor: 'fratura_radicular', label: 'Fratura radicular' },
    ],
  },
  {
    categoria: 'Restaurador / Protético',
    itens: [
      { valor: 'restauracao_presente', label: 'Restauração presente' },
      { valor: 'restauracao_com_infiltracao', label: 'Restauração com infiltração' },
      { valor: 'coroa_protetica', label: 'Coroa protética' },
      { valor: 'nucleo_pino', label: 'Núcleo/pino intrarradicular' },
    ],
  },
  {
    categoria: 'Ósseo / Anatômico',
    itens: [
      { valor: 'cisto', label: 'Cisto' },
      { valor: 'lesao_radiopaca', label: 'Lesão radiopaca' },
      { valor: 'lesao_radiolucida_inespecifica', label: 'Lesão radiolúcida inespecífica' },
      { valor: 'dente_incluso', label: 'Dente incluso/impactado' },
      { valor: 'dente_supranumerario', label: 'Dente supranumerário' },
      { valor: 'agenesia_dentaria', label: 'Agenesia dentária' },
      { valor: 'alteracao_seio_maxilar', label: 'Alteração no seio maxilar' },
      { valor: 'corpo_estranho', label: 'Corpo estranho' },
    ],
  },
]

// Valores reais do enum QualidadeTecnica no backend.
const OPCOES_QUALIDADE_TECNICA = [
  { valor: 'otima', label: 'Ótima' },
  { valor: 'boa', label: 'Boa' },
  { valor: 'regular', label: 'Regular' },
  { valor: 'insatisfatoria', label: 'Insatisfatória' },
]

const OPCOES_DIFICULDADE = [
  { valor: 'basico', label: 'Básico' },
  { valor: 'intermediario', label: 'Intermediário' },
  { valor: 'avancado', label: 'Avançado' },
]

// Valores reais do enum Finalidade no backend.
const OPCOES_FINALIDADE = [
  { valor: 'ensino', label: 'Ensino' },
  { valor: 'pesquisa', label: 'Pesquisa' },
  { valor: 'ambos', label: 'Ambos' },
]

interface ImagemPendente {
  orthanc_reference_id: number
  orthanc_id: string
  resource_type: string
  dicomweb_url: string | null
}

interface FichaAtiva {
  curationId: number
  orthancReferenceId: number
}

interface ViewerInfo {
  abrivel: boolean
  motivo?: string
  viewer_url: string | null
}

interface FormularioFicha {
  tipo_radiografia: string
  dentes: number[]
  idade_min: string
  idade_max: string
  genero: string
  achado_principal: string
  achados_detalhe: string
  alteracoes_observadas: string[]
  qualidade_tecnica: string
  dificuldade: string
  descricao_didatica: string
  observacoes_internas: string
  finalidade: string
  anonimizacao_validada: boolean
}

const FORM_VAZIO: FormularioFicha = {
  tipo_radiografia: 'periapical',
  dentes: [],
  idade_min: '',
  idade_max: '',
  genero: '',
  achado_principal: '',
  achados_detalhe: '',
  alteracoes_observadas: [],
  qualidade_tecnica: '',
  dificuldade: '',
  descricao_didatica: '',
  observacoes_internas: '',
  finalidade: '',
  anonimizacao_validada: false,
}

function truncarOrthancId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 12)}...` : id
}

// A fila colapsa pra 56px (so um botao pra reabrir) quando ha uma imagem
// aberta, pra dar o maximo de largura possivel pro visualizador. A coluna
// da ficha (380px) so existe na grade quando ha uma ficha ativa.
function colunaGridClasse(temFichaAtiva: boolean, filaColapsada: boolean): string {
  if (temFichaAtiva) {
    return filaColapsada ? 'lg:grid-cols-[56px_1fr_380px]' : 'lg:grid-cols-[320px_1fr_380px]'
  }
  return filaColapsada ? 'lg:grid-cols-[56px_1fr]' : 'lg:grid-cols-[320px_1fr]'
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
  if (form.achado_principal !== '') payload.achado_principal = form.achado_principal
  if (form.qualidade_tecnica !== '') payload.qualidade_tecnica = form.qualidade_tecnica
  if (form.dificuldade !== '') payload.dificuldade = form.dificuldade
  if (form.finalidade !== '') payload.finalidade = form.finalidade
  return payload
}

export default function CuradoriaPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  const [fila, setFila] = useState<ImagemPendente[]>([])
  const [carregandoFila, setCarregandoFila] = useState(false)
  const [erroFila, setErroFila] = useState('')
  const [criandoId, setCriandoId] = useState<number | null>(null)
  const [filaColapsada, setFilaColapsada] = useState(false)

  const [fichaAtiva, setFichaAtiva] = useState<FichaAtiva | null>(null)
  const [viewerInfo, setViewerInfo] = useState<ViewerInfo | null>(null)
  const [carregandoViewer, setCarregandoViewer] = useState(false)
  const visualizadorRef = useRef<HTMLElement | null>(null)
  const [telaCheia, setTelaCheia] = useState(false)

  const [form, setForm] = useState<FormularioFicha>(FORM_VAZIO)
  const [denteInput, setDenteInput] = useState('')
  const [erroDente, setErroDente] = useState('')

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

  async function carregarFila(tokenAtual: string) {
    setCarregandoFila(true)
    setErroFila('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/curation/pending`, {
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
      setFila(dados.itens ?? [])
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
    setForm({
      tipo_radiografia: ficha.tipo_radiografia ?? 'periapical',
      dentes: ficha.dentes ?? [],
      idade_min: ficha.idade_min !== null && ficha.idade_min !== undefined ? String(ficha.idade_min) : '',
      idade_max: ficha.idade_max !== null && ficha.idade_max !== undefined ? String(ficha.idade_max) : '',
      genero: ficha.genero ?? '',
      achado_principal: ficha.achado_principal ?? '',
      achados_detalhe: ficha.achados_detalhe ?? '',
      alteracoes_observadas: ficha.alteracoes_observadas ?? [],
      qualidade_tecnica: ficha.qualidade_tecnica ?? '',
      dificuldade: ficha.dificuldade ?? '',
      descricao_didatica: ficha.descricao_didatica ?? '',
      observacoes_internas: ficha.observacoes_internas ?? '',
      finalidade: ficha.finalidade ?? '',
      anonimizacao_validada: ficha.anonimizacao_validada ?? false,
    })
    carregarViewerUrl(tokenAtual, orthancReferenceId)
  }

  async function abrirImagem(imagem: ImagemPendente) {
    if (!token || criandoId !== null) return
    setCriandoId(imagem.orthanc_reference_id)
    setErroFila('')
    try {
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
      setFila((prev) => prev.filter((item) => item.orthanc_reference_id !== imagem.orthanc_reference_id))
      await carregarFichaCompleta(token, criada.curation_id, imagem.orthanc_reference_id)
      setFilaColapsada(true)
    } catch {
      setErroFila('Não foi possível abrir esta imagem para curadoria.')
    } finally {
      setCriandoId(null)
    }
  }

  function finalizarFichaAtiva() {
    setFichaAtiva(null)
    setViewerInfo(null)
    setForm(FORM_VAZIO)
    setFilaColapsada(false)
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
      finalizarFichaAtiva()
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
      finalizarFichaAtiva()
    } catch {
      setErroMotivo('Não foi possível concluir a ação.')
    } finally {
      setEnviandoMotivo(false)
    }
  }

  function adicionarDente(event?: KeyboardEvent<HTMLInputElement>) {
    if (event) event.preventDefault()
    const numero = Number(denteInput)
    if (!DENTES_PERMANENTES.includes(numero)) {
      setErroDente('Use um número FDI válido (11-18, 21-28, 31-38, 41-48).')
      return
    }
    setErroDente('')
    setDenteInput('')
    if (form.dentes.includes(numero)) return
    setForm({ ...form, dentes: [...form.dentes, numero].sort((a, b) => a - b) })
  }

  function removerDente(numero: number) {
    setForm({ ...form, dentes: form.dentes.filter((d) => d !== numero) })
  }

  function alternarAlteracao(valor: string) {
    setForm((atual) => ({
      ...atual,
      alteracoes_observadas: atual.alteracoes_observadas.includes(valor)
        ? atual.alteracoes_observadas.filter((v) => v !== valor)
        : [...atual.alteracoes_observadas, valor],
    }))
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

  const campoLabel = 'mb-1.5 block text-xs font-medium text-slate-400'
  const campoInput =
    'w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-none focus:border-brand'

  return (
    <div className="flex min-h-screen flex-col bg-base">
      <Topbar />

      <main className="flex-1 overflow-y-auto p-6">
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
            <h1 className="text-2xl font-bold text-white">
              Curadoria<span className="text-brand-300">.</span>
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Analise a imagem e preencha a ficha de curadoria correspondente.
            </p>
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-4 ${colunaGridClasse(!!fichaAtiva, filaColapsada)}`}>
          {/* COLUNA ESQUERDA - Fila de curadoria (colapsavel: some quando ha
              uma imagem aberta, pra dar o maximo de espaco ao visualizador) */}
          <section className="rounded-2xl border border-base-border bg-base-surface">
            {filaColapsada ? (
              <button
                type="button"
                onClick={() => setFilaColapsada(false)}
                aria-label="Expandir fila de curadoria"
                title="Expandir fila de curadoria"
                className="flex h-full min-h-[70vh] w-full flex-col items-center gap-3 py-4 text-slate-400 hover:text-brand-300"
              >
                <span aria-hidden="true">»</span>
                <span className="text-xs font-semibold tracking-wide [writing-mode:vertical-rl]">
                  Fila{fila.length > 0 ? ` (${fila.length})` : ''}
                </span>
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-base-border px-4 py-3.5">
                  <h2 className="text-sm font-semibold text-white">Fila de curadoria</h2>
                  <button
                    type="button"
                    onClick={() => setFilaColapsada(true)}
                    aria-label="Recolher fila de curadoria"
                    title="Recolher fila de curadoria"
                    className="text-slate-400 hover:text-brand-300"
                  >
                    «
                  </button>
                </div>

                {erroFila && (
                  <p className="px-4 py-2 text-xs text-red-400" role="alert">
                    {erroFila}
                  </p>
                )}

                <div className="max-h-[70vh] overflow-y-auto p-2">
                  {carregandoFila ? (
                    <p className="p-3 text-sm text-slate-500">Carregando fila...</p>
                  ) : fila.length === 0 ? (
                    <p className="p-3 text-sm text-slate-500">Nenhuma imagem pendente.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {fila.map((imagem) => (
                        <li key={imagem.orthanc_reference_id}>
                          <button
                            type="button"
                            disabled={criandoId !== null}
                            onClick={() => abrirImagem(imagem)}
                            className="w-full rounded-xl border border-transparent px-3 py-2.5 text-left text-sm hover:border-brand/40 hover:bg-brand/5 disabled:opacity-50"
                          >
                            <p className="font-mono text-xs text-slate-300">
                              {truncarOrthancId(imagem.orthanc_id)}
                            </p>
                            <p className="mt-1 text-slate-400">{imagem.resource_type}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              {criandoId === imagem.orthanc_reference_id ? 'Abrindo...' : 'status de anonimização: — · data: —'}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>

          {/* COLUNA CENTRAL - Visualizador */}
          <section
            ref={visualizadorRef}
            className="relative flex min-h-[70vh] flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface"
          >
            {fichaAtiva && (
              <div className="flex items-center justify-between border-b border-base-border px-4 py-3">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-300" aria-hidden="true" />
                  Em análise
                </span>
                {viewerInfo?.abrivel && viewerInfo.viewer_url && (
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
                )}
              </div>
            )}

            {!fichaAtiva ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
                Selecione uma imagem na fila ao lado
              </div>
            ) : carregandoViewer ? (
              <div className="flex flex-1 items-center justify-center text-slate-400">
                Carregando visualizador...
              </div>
            ) : viewerInfo?.abrivel && viewerInfo.viewer_url ? (
              <iframe
                src={viewerInfo.viewer_url}
                title="Visualizador OHIF"
                className="h-full min-h-[70vh] w-full flex-1 border-0"
              />
            ) : (
              <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
                {viewerInfo?.motivo ?? 'Não foi possível carregar o visualizador para esta imagem.'}
              </div>
            )}
          </section>

          {/* COLUNA DIREITA - Formulario de curadoria */}
          {fichaAtiva && (
            <section className="max-h-[70vh] overflow-y-auto rounded-2xl border border-base-border bg-base-surface p-5">
              <h2 className="mb-5 text-base font-bold text-white">Ficha de curadoria</h2>

              <div className="space-y-6">
                <div>
                  <p className="mb-2.5 text-sm font-semibold text-white">1. Tipo de exame</p>
                  <div className="flex flex-wrap gap-2">
                    {OPCOES_TIPO_RADIOGRAFIA.map((opcao) => (
                      <button
                        key={opcao.valor}
                        type="button"
                        onClick={() => setForm({ ...form, tipo_radiografia: opcao.valor })}
                        className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                          form.tipo_radiografia === opcao.valor
                            ? 'border-brand bg-brand text-white'
                            : 'border-base-border text-slate-300 hover:border-brand/50'
                        }`}
                      >
                        {opcao.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="mb-2.5 text-sm font-semibold text-white">2. Dentes e paciente</p>
                  <div className="space-y-3">
                    <div>
                      <label className={campoLabel}>Dentes (notação FDI)</label>
                      <div className="flex flex-wrap gap-1.5 rounded-lg border border-base-border bg-base-surface2 p-2">
                        {form.dentes.map((numero) => (
                          <span
                            key={numero}
                            className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand-300"
                          >
                            {numero}
                            <button
                              type="button"
                              onClick={() => removerDente(numero)}
                              aria-label={`Remover dente ${numero}`}
                              className="text-brand-300 hover:text-brand-hover"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <input
                          type="text"
                          value={denteInput}
                          onChange={(e) => setDenteInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') adicionarDente(e)
                          }}
                          placeholder="ex: 16"
                          className="w-16 flex-1 bg-transparent text-sm text-slate-100 outline-none"
                        />
                      </div>
                      {erroDente && <p className="mt-1 text-xs text-red-400">{erroDente}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={campoLabel}>Idade mín.</label>
                        <input
                          type="number"
                          value={form.idade_min}
                          onChange={(e) => setForm({ ...form, idade_min: e.target.value })}
                          className={campoInput}
                        />
                      </div>
                      <div>
                        <label className={campoLabel}>Idade máx.</label>
                        <input
                          type="number"
                          value={form.idade_max}
                          onChange={(e) => setForm({ ...form, idade_max: e.target.value })}
                          className={campoInput}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={campoLabel}>Gênero (opcional)</label>
                      <div className="flex flex-wrap gap-2">
                        {[{ valor: '', label: 'Não informado' }, ...OPCOES_GENERO].map((opcao) => (
                          <button
                            key={opcao.valor || 'nao-informado'}
                            type="button"
                            onClick={() => setForm({ ...form, genero: opcao.valor })}
                            className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                              form.genero === opcao.valor
                                ? 'border-brand bg-brand text-white'
                                : 'border-base-border text-slate-300 hover:border-brand/50'
                            }`}
                          >
                            {opcao.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2.5 text-sm font-semibold text-white">3. Achados</p>
                  <div className="space-y-3">
                    <div>
                      <label className={campoLabel}>Achado principal</label>
                      <select
                        value={form.achado_principal}
                        onChange={(e) => setForm({ ...form, achado_principal: e.target.value })}
                        className={campoInput}
                      >
                        <option value="">Selecione</option>
                        {OPCOES_ACHADO_PRINCIPAL.map((opcao) => (
                          <option key={opcao.valor} value={opcao.valor}>
                            {opcao.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={campoLabel}>
                        Alterações observadas
                        {form.alteracoes_observadas.length > 0 && (
                          <span className="ml-1 text-brand-300">({form.alteracoes_observadas.length})</span>
                        )}
                      </label>
                      <div className="space-y-3 rounded-lg border border-base-border bg-base-surface2 p-3">
                        {CATEGORIAS_ALTERACOES.map((grupo) => (
                          <div key={grupo.categoria}>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                              {grupo.categoria}
                            </p>
                            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                              {grupo.itens.map((item) => (
                                <label
                                  key={item.valor}
                                  className="flex items-start gap-2 rounded-md px-1.5 py-1 text-sm text-slate-300 hover:bg-white/5"
                                >
                                  <input
                                    type="checkbox"
                                    checked={form.alteracoes_observadas.includes(item.valor)}
                                    onChange={() => alternarAlteracao(item.valor)}
                                    className="mt-0.5 h-3.5 w-3.5 flex-none rounded border-base-border bg-base-surface2 text-brand"
                                  />
                                  {item.label}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className={campoLabel}>Detalhes do achado</label>
                      <textarea
                        value={form.achados_detalhe}
                        onChange={(e) => setForm({ ...form, achados_detalhe: e.target.value })}
                        rows={3}
                        className={campoInput}
                      />
                    </div>

                    <div>
                      <label className={campoLabel}>Qualidade técnica</label>
                      <select
                        value={form.qualidade_tecnica}
                        onChange={(e) => setForm({ ...form, qualidade_tecnica: e.target.value })}
                        className={campoInput}
                      >
                        <option value="">Selecione</option>
                        {OPCOES_QUALIDADE_TECNICA.map((opcao) => (
                          <option key={opcao.valor} value={opcao.valor}>
                            {opcao.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className={campoLabel}>Dificuldade</label>
                      <select
                        value={form.dificuldade}
                        onChange={(e) => setForm({ ...form, dificuldade: e.target.value })}
                        className={campoInput}
                      >
                        <option value="">Selecione</option>
                        {OPCOES_DIFICULDADE.map((opcao) => (
                          <option key={opcao.valor} value={opcao.valor}>
                            {opcao.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2.5 text-sm font-semibold text-white">4. Descrição e finalidade</p>
                  <div className="space-y-3">
                    <div>
                      <label className={campoLabel}>Descrição didática</label>
                      <textarea
                        value={form.descricao_didatica}
                        onChange={(e) => setForm({ ...form, descricao_didatica: e.target.value })}
                        rows={3}
                        className={campoInput}
                      />
                    </div>

                    <div>
                      <label className={campoLabel}>Observações internas</label>
                      <textarea
                        value={form.observacoes_internas}
                        onChange={(e) => setForm({ ...form, observacoes_internas: e.target.value })}
                        rows={3}
                        className={campoInput}
                      />
                    </div>

                    <div>
                      <label className={campoLabel}>Finalidade</label>
                      <select
                        value={form.finalidade}
                        onChange={(e) => setForm({ ...form, finalidade: e.target.value })}
                        className={campoInput}
                      >
                        <option value="">Selecione</option>
                        {OPCOES_FINALIDADE.map((opcao) => (
                          <option key={opcao.valor} value={opcao.valor}>
                            {opcao.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2.5 text-sm font-semibold text-white">5. Anonimização</p>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={form.anonimizacao_validada}
                      onChange={(e) => setForm({ ...form, anonimizacao_validada: e.target.checked })}
                      className="h-4 w-4 rounded border-base-border bg-base-surface2 text-brand"
                    />
                    Anonimização validada por mim
                  </label>
                </div>

                {erroFormulario && (
                  <p className="text-sm text-red-400" role="alert">
                    {erroFormulario}
                  </p>
                )}
                {rascunhoSalvo && <p className="text-sm text-emerald-400">Rascunho salvo.</p>}

                <div className="flex flex-col gap-2 border-t border-base-border pt-4">
                  <button
                    type="button"
                    onClick={aprovar}
                    disabled={aprovando || salvandoRascunho}
                    className="flex items-center justify-center gap-2 rounded-lg bg-brand hover:bg-brand-hover px-4 py-2.5 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {aprovando ? 'Aprovando...' : '✓ Aprovar'}
                  </button>
                  <button
                    type="button"
                    onClick={() => salvarRascunho()}
                    disabled={salvandoRascunho || aprovando}
                    className="rounded-lg border border-base-border px-4 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-50"
                  >
                    {salvandoRascunho ? 'Salvando...' : 'Salvar rascunho'}
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirModalMotivo('descartar')}
                    className="rounded-lg border border-red-800/60 px-4 py-2 text-sm text-red-300 hover:bg-red-950/40"
                  >
                    Descartar
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirModalMotivo('segunda_opiniao')}
                    className="rounded-lg border border-purple-800/60 px-4 py-2 text-sm text-purple-300 hover:bg-purple-950/40"
                  >
                    Solicitar segunda opinião
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {modalMotivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-base-border bg-base-surface p-6 shadow-2xl">
            <h2 className="mb-4 text-lg font-semibold text-white">
              {modalMotivo === 'descartar' ? 'Descartar ficha' : 'Solicitar segunda opinião'}
            </h2>
            <label className={campoLabel}>Motivo</label>
            <textarea
              value={motivoTexto}
              onChange={(e) => setMotivoTexto(e.target.value)}
              rows={4}
              className={campoInput}
            />
            {erroMotivo && (
              <p className="mt-2 text-sm text-red-400" role="alert">
                {erroMotivo}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalMotivo(null)}
                className="rounded-lg border border-base-border px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarMotivo}
                disabled={enviandoMotivo}
                className="rounded-lg bg-brand hover:bg-brand-hover px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {enviandoMotivo ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setModalMotivo(null)}
            className="fixed inset-0 -z-10"
          />
        </div>
      )}
    </div>
  )
}
