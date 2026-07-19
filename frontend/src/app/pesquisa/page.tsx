'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'

const OPCOES_TIPO_RADIOGRAFIA = [
  { valor: 'periapical', label: 'Periapical' },
  { valor: 'panoramica', label: 'Panorâmica' },
  { valor: 'interproximal', label: 'Interproximal' },
  { valor: 'oclusal', label: 'Oclusal' },
]

const OPCOES_ARCADA = [
  { valor: 'superior', label: 'Superior' },
  { valor: 'inferior', label: 'Inferior' },
]

const OPCOES_LADO = [
  { valor: 'direito', label: 'Direito' },
  { valor: 'esquerdo', label: 'Esquerdo' },
]

const OPCOES_GENERO = [
  { valor: 'masculino', label: 'Masculino' },
  { valor: 'feminino', label: 'Feminino' },
]

// Valores reais do enum AchadoPrincipal (backend/app/modules/curations.py) -
// confirmado no arquivo antes de montar esta lista.
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

// Valores reais do enum QualidadeTecnica.
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

// Valores reais do enum Finalidade (as mesmas 3 ja usadas na tela de Curadoria).
const OPCOES_FINALIDADE = [
  { valor: 'ensino', label: 'Ensino' },
  { valor: 'pesquisa', label: 'Pesquisa' },
  { valor: 'ambos', label: 'Ambos' },
]

interface Filtros {
  tipo_radiografia: string
  dente: string
  arcada: string
  lado: string
  achado_principal: string
  genero: string
  qualidade_tecnica: string
  dificuldade: string
  finalidade: string
  idade_min: string
  idade_max: string
}

const FILTROS_VAZIOS: Filtros = {
  tipo_radiografia: '',
  dente: '',
  arcada: '',
  lado: '',
  achado_principal: '',
  genero: '',
  qualidade_tecnica: '',
  dificuldade: '',
  finalidade: '',
  idade_min: '',
  idade_max: '',
}

const CHAVES_FILTRO: (keyof Filtros)[] = [
  'tipo_radiografia',
  'dente',
  'arcada',
  'lado',
  'achado_principal',
  'genero',
  'qualidade_tecnica',
  'dificuldade',
  'finalidade',
  'idade_min',
  'idade_max',
]

interface ResultadoImagem {
  curation_id: number
  orthanc_reference_id: number
  orthanc_id: string
  modalidade: string
  tipo_radiografia: string | null
  dentes: number[] | null
  achado_principal: string | null
  qualidade_tecnica: string | null
  dificuldade: string | null
  finalidade: string | null
  descricao_didatica: string | null
  viewer_url: string | null
}

function rotular(opcoes: { valor: string; label: string }[], valor: string | null): string {
  if (!valor) return '—'
  return opcoes.find((o) => o.valor === valor)?.label ?? valor
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

function PesquisaConteudo() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [token, setToken] = useState<string | null>(null)
  const [carregandoPagina, setCarregandoPagina] = useState(true)

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [resultados, setResultados] = useState<ResultadoImagem[]>([])
  const [jaPesquisou, setJaPesquisou] = useState(false)
  const [pesquisando, setPesquisando] = useState(false)
  const [erro, setErro] = useState('')

  const [viewerUrlModal, setViewerUrlModal] = useState<string | null>(null)

  useEffect(() => {
    const tokenAtual = localStorage.getItem('access_token')
    if (!tokenAtual) {
      router.push('/login')
      return
    }
    setToken(tokenAtual)
    setCarregandoPagina(false)
  }, [router])

  // Se a URL veio com filtros (ex: vindo do Banco de imagens), preenche o
  // formulario com eles e ja dispara a busca automaticamente.
  useEffect(() => {
    if (!token) return

    const filtrosDaUrl: Filtros = { ...FILTROS_VAZIOS }
    let temFiltroNaUrl = false
    for (const chave of CHAVES_FILTRO) {
      const valor = searchParams.get(chave)
      if (valor) {
        filtrosDaUrl[chave] = valor
        temFiltroNaUrl = true
      }
    }

    if (temFiltroNaUrl) {
      setFiltros(filtrosDaUrl)
      pesquisar(filtrosDaUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  function atualizarFiltro(campo: keyof Filtros, valor: string) {
    setFiltros({ ...filtros, [campo]: valor })
  }

  async function pesquisar(filtrosParaUsar: Filtros = filtros) {
    if (!token) return
    setPesquisando(true)
    setErro('')
    setJaPesquisou(true)

    const params = new URLSearchParams()
    if (filtrosParaUsar.tipo_radiografia) params.set('tipo_radiografia', filtrosParaUsar.tipo_radiografia)
    if (filtrosParaUsar.dente) params.set('dente', filtrosParaUsar.dente)
    if (filtrosParaUsar.arcada) params.set('arcada', filtrosParaUsar.arcada)
    if (filtrosParaUsar.lado) params.set('lado', filtrosParaUsar.lado)
    if (filtrosParaUsar.achado_principal) params.set('achado_principal', filtrosParaUsar.achado_principal)
    if (filtrosParaUsar.genero) params.set('genero', filtrosParaUsar.genero)
    if (filtrosParaUsar.qualidade_tecnica) params.set('qualidade_tecnica', filtrosParaUsar.qualidade_tecnica)
    if (filtrosParaUsar.dificuldade) params.set('dificuldade', filtrosParaUsar.dificuldade)
    if (filtrosParaUsar.finalidade) params.set('finalidade', filtrosParaUsar.finalidade)
    if (filtrosParaUsar.idade_min) params.set('idade_min', filtrosParaUsar.idade_min)
    if (filtrosParaUsar.idade_max) params.set('idade_max', filtrosParaUsar.idade_max)

    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, 'Não foi possível realizar a pesquisa.'))
        return
      }
      const dados = await resposta.json()
      setResultados(dados.itens ?? [])
    } catch {
      setErro('Não foi possível realizar a pesquisa.')
    } finally {
      setPesquisando(false)
    }
  }

  if (carregandoPagina) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-slate-300">Carregando...</p>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="mb-4 text-xl font-semibold text-slate-100">Pesquisa avançada</h1>

          <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Tipo de radiografia</label>
                <select
                  value={filtros.tipo_radiografia}
                  onChange={(e) => atualizarFiltro('tipo_radiografia', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                >
                  <option value="">Todos</option>
                  {OPCOES_TIPO_RADIOGRAFIA.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Dente (FDI)</label>
                <input
                  type="number"
                  min={11}
                  max={48}
                  value={filtros.dente}
                  onChange={(e) => atualizarFiltro('dente', e.target.value)}
                  placeholder="ex: 16"
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Arcada</label>
                <select
                  value={filtros.arcada}
                  onChange={(e) => atualizarFiltro('arcada', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                >
                  <option value="">Todas</option>
                  {OPCOES_ARCADA.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Lado</label>
                <select
                  value={filtros.lado}
                  onChange={(e) => atualizarFiltro('lado', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                >
                  <option value="">Ambos</option>
                  {OPCOES_LADO.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Achado principal</label>
                <select
                  value={filtros.achado_principal}
                  onChange={(e) => atualizarFiltro('achado_principal', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                >
                  <option value="">Todos</option>
                  {OPCOES_ACHADO_PRINCIPAL.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Gênero (opcional)</label>
                <select
                  value={filtros.genero}
                  onChange={(e) => atualizarFiltro('genero', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                >
                  <option value="">Não informado</option>
                  {OPCOES_GENERO.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Qualidade técnica</label>
                <select
                  value={filtros.qualidade_tecnica}
                  onChange={(e) => atualizarFiltro('qualidade_tecnica', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                >
                  <option value="">Todas</option>
                  {OPCOES_QUALIDADE_TECNICA.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Dificuldade</label>
                <select
                  value={filtros.dificuldade}
                  onChange={(e) => atualizarFiltro('dificuldade', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                >
                  <option value="">Todas</option>
                  {OPCOES_DIFICULDADE.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Finalidade</label>
                <select
                  value={filtros.finalidade}
                  onChange={(e) => atualizarFiltro('finalidade', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                >
                  <option value="">Todas</option>
                  {OPCOES_FINALIDADE.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Idade mín.</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={filtros.idade_min}
                  onChange={(e) => atualizarFiltro('idade_min', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">Idade máx.</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={filtros.idade_max}
                  onChange={(e) => atualizarFiltro('idade_max', e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                onClick={() => pesquisar()}
                disabled={pesquisando}
                className="rounded-md bg-teal-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500 disabled:opacity-50"
              >
                {pesquisando ? 'Pesquisando...' : 'Pesquisar'}
              </button>
              {erro && (
                <p className="text-sm text-red-400" role="alert">
                  {erro}
                </p>
              )}
            </div>
          </section>

          <div className="mt-6">
            {!jaPesquisou ? (
              <p className="py-12 text-center text-slate-500">
                Use os filtros acima para buscar imagens
              </p>
            ) : pesquisando ? (
              <p className="py-12 text-center text-slate-500">Pesquisando...</p>
            ) : resultados.length === 0 ? (
              <p className="py-12 text-center text-slate-500">
                Nenhuma imagem encontrada com esses filtros
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {resultados.map((imagem) => (
                  <div
                    key={imagem.curation_id}
                    className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-4"
                  >
                    <p className="text-sm font-medium text-slate-100">
                      {rotular(OPCOES_TIPO_RADIOGRAFIA, imagem.tipo_radiografia)}
                    </p>
                    <dl className="mt-2 space-y-1 text-xs text-slate-400">
                      <div>
                        <dt className="inline text-slate-500">Achado: </dt>
                        <dd className="inline">{rotular(OPCOES_ACHADO_PRINCIPAL, imagem.achado_principal)}</dd>
                      </div>
                      <div>
                        <dt className="inline text-slate-500">Qualidade: </dt>
                        <dd className="inline">{rotular(OPCOES_QUALIDADE_TECNICA, imagem.qualidade_tecnica)}</dd>
                      </div>
                      <div>
                        <dt className="inline text-slate-500">Dificuldade: </dt>
                        <dd className="inline">{rotular(OPCOES_DIFICULDADE, imagem.dificuldade)}</dd>
                      </div>
                      <div>
                        <dt className="inline text-slate-500">Finalidade: </dt>
                        <dd className="inline">{rotular(OPCOES_FINALIDADE, imagem.finalidade)}</dd>
                      </div>
                    </dl>

                    <button
                      type="button"
                      disabled={!imagem.viewer_url}
                      onClick={() => imagem.viewer_url && setViewerUrlModal(imagem.viewer_url)}
                      className="mt-4 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-teal-500 hover:text-teal-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {imagem.viewer_url ? 'Visualizar' : 'Imagem não disponível para visualização'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>

      {viewerUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
          <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-200">Visualizador</h2>
              <button
                type="button"
                onClick={() => setViewerUrlModal(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                Fechar
              </button>
            </div>
            <iframe src={viewerUrlModal} title="Visualizador OHIF" className="h-full w-full flex-1 border-0" />
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setViewerUrlModal(null)}
            className="fixed inset-0 -z-10"
          />
        </div>
      )}
    </div>
  )
}

export default function PesquisaPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950">
          <p className="text-slate-300">Carregando...</p>
        </main>
      }
    >
      <PesquisaConteudo />
    </Suspense>
  )
}
