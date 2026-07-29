'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import MiniaturaImagem from '../../components/MiniaturaImagem'
import VisualizadorSequencial from '../../components/VisualizadorSequencial'

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
  const [totalResultados, setTotalResultados] = useState(0)
  const [totalDisponivel, setTotalDisponivel] = useState<number | null>(null)
  const [jaPesquisou, setJaPesquisou] = useState(false)
  const [pesquisando, setPesquisando] = useState(false)
  const [erro, setErro] = useState('')
  const [selecionados, setSelecionados] = useState<number[]>([])
  const [indiceVisualizador, setIndiceVisualizador] = useState<number | null>(null)

  useEffect(() => {
    const tokenAtual = localStorage.getItem('access_token')
    if (!tokenAtual) {
      router.push('/login')
      return
    }
    setToken(tokenAtual)
    setCarregandoPagina(false)

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/counts`, {
      headers: { Authorization: `Bearer ${tokenAtual}` },
    })
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((dados) => {
        if (dados) setTotalDisponivel(dados.total)
      })
      .catch(() => {
        // sem o total geral, a tela continua funcionando normalmente
      })
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
      setTotalResultados(dados.total ?? (dados.itens ?? []).length)
      setSelecionados([])
    } catch {
      setErro('Não foi possível realizar a pesquisa.')
    } finally {
      setPesquisando(false)
    }
  }

  function alternarSelecao(curationId: number) {
    setSelecionados((atual) =>
      atual.includes(curationId) ? atual.filter((id) => id !== curationId) : [...atual, curationId]
    )
  }

  const itensSelecionados = resultados
    .map((imagem, indice) => ({ imagem, numero: indice + 1 }))
    .filter(({ imagem }) => selecionados.includes(imagem.curation_id))
    .map(({ imagem, numero }) => ({
      curation_id: imagem.curation_id,
      numero,
      descricao_didatica: imagem.descricao_didatica,
      tipo_radiografia: imagem.tipo_radiografia,
      viewer_url: imagem.viewer_url,
    }))

  if (carregandoPagina) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">Carregando...</p>
      </main>
    )
  }

  const campoLabel = 'mb-1.5 block text-xs font-medium text-slate-400'
  const campoInput =
    'w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500'

  function pillClasse(ativo: boolean): string {
    return `rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
      ativo
        ? 'border-blue-500 bg-blue-500 text-white'
        : 'border-base-border text-slate-300 hover:border-blue-500/50'
    }`
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-6">
          <h1 className="text-2xl font-bold text-white">
            Pesquisa <span className="text-blue-400">avançada</span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Encontre imagens radiográficas para apoiar estudos e pesquisas.
            {totalDisponivel !== null && (
              <>
                {' '}
                <span className="font-semibold text-slate-200">{totalDisponivel}</span>{' '}
                {totalDisponivel === 1 ? 'imagem disponível no total' : 'imagens disponíveis no total'}.
              </>
            )}
          </p>

          <div className="mt-6">
            <p className="mb-3 text-sm font-medium text-slate-300">Acesso rápido por tipo de exame</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {OPCOES_TIPO_RADIOGRAFIA.map((o) => (
                <button
                  key={o.valor}
                  type="button"
                  onClick={() => {
                    const novos = { ...filtros, tipo_radiografia: o.valor }
                    setFiltros(novos)
                    pesquisar(novos)
                  }}
                  className={`flex flex-col items-center gap-2 rounded-2xl border p-5 text-sm font-medium transition-colors ${
                    filtros.tipo_radiografia === o.valor
                      ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                      : 'border-base-border bg-base-surface text-slate-300 hover:border-blue-500/40'
                  }`}
                >
                  <span className="text-2xl" aria-hidden="true">
                    🦷
                  </span>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <section className="mt-6 rounded-2xl border border-base-border bg-base-surface p-5">
            <p className="text-sm font-semibold text-white">🔎 Busca avançada</p>
            <p className="mb-4 mt-0.5 text-xs text-slate-400">Refine sua pesquisa utilizando os filtros abaixo.</p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <div>
                <label className={campoLabel}>Gênero</label>
                <div className="flex flex-wrap gap-2">
                  {[{ valor: '', label: 'Todos' }, ...OPCOES_GENERO].map((o) => (
                    <button
                      key={o.valor || 'todos'}
                      type="button"
                      onClick={() => atualizarFiltro('genero', o.valor)}
                      className={pillClasse(filtros.genero === o.valor)}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={campoLabel}>Dente (FDI)</label>
                <input
                  type="number"
                  min={11}
                  max={48}
                  value={filtros.dente}
                  onChange={(e) => atualizarFiltro('dente', e.target.value)}
                  placeholder="ex: 16"
                  className={campoInput}
                />
              </div>

              <div>
                <label className={campoLabel}>Arcada</label>
                <select
                  value={filtros.arcada}
                  onChange={(e) => atualizarFiltro('arcada', e.target.value)}
                  className={campoInput}
                >
                  <option value="">Todas</option>
                  {OPCOES_ARCADA.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={campoLabel}>Lado</label>
                <select
                  value={filtros.lado}
                  onChange={(e) => atualizarFiltro('lado', e.target.value)}
                  className={campoInput}
                >
                  <option value="">Ambos</option>
                  {OPCOES_LADO.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={campoLabel}>Tipo de exame</label>
                <select
                  value={filtros.tipo_radiografia}
                  onChange={(e) => atualizarFiltro('tipo_radiografia', e.target.value)}
                  className={campoInput}
                >
                  <option value="">Todos</option>
                  {OPCOES_TIPO_RADIOGRAFIA.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={campoLabel}>Patologia / alteração</label>
                <select
                  value={filtros.achado_principal}
                  onChange={(e) => atualizarFiltro('achado_principal', e.target.value)}
                  className={campoInput}
                >
                  <option value="">Todos</option>
                  {OPCOES_ACHADO_PRINCIPAL.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={campoLabel}>Qualidade técnica</label>
                <select
                  value={filtros.qualidade_tecnica}
                  onChange={(e) => atualizarFiltro('qualidade_tecnica', e.target.value)}
                  className={campoInput}
                >
                  <option value="">Todas</option>
                  {OPCOES_QUALIDADE_TECNICA.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={campoLabel}>Dificuldade</label>
                <select
                  value={filtros.dificuldade}
                  onChange={(e) => atualizarFiltro('dificuldade', e.target.value)}
                  className={campoInput}
                >
                  <option value="">Todas</option>
                  {OPCOES_DIFICULDADE.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={campoLabel}>Finalidade</label>
                <select
                  value={filtros.finalidade}
                  onChange={(e) => atualizarFiltro('finalidade', e.target.value)}
                  className={campoInput}
                >
                  <option value="">Todas</option>
                  {OPCOES_FINALIDADE.map((o) => (
                    <option key={o.valor} value={o.valor}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={campoLabel}>Idade mín.</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={filtros.idade_min}
                  onChange={(e) => atualizarFiltro('idade_min', e.target.value)}
                  className={campoInput}
                />
              </div>

              <div>
                <label className={campoLabel}>Idade máx.</label>
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={filtros.idade_max}
                  onChange={(e) => atualizarFiltro('idade_max', e.target.value)}
                  className={campoInput}
                />
              </div>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => pesquisar()}
                disabled={pesquisando}
                className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-5 py-2.5 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                🔍 {pesquisando ? 'Pesquisando...' : 'Pesquisar'}
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
            ) : totalResultados === 0 ? (
              <p className="py-12 text-center text-slate-500">
                Nenhuma imagem encontrada com esses filtros
              </p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-slate-400">
                    <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-blue-300">
                      {totalResultados} {totalResultados === 1 ? 'imagem encontrada' : 'imagens encontradas'}
                    </span>
                    {resultados.length < totalResultados && (
                      <span className="ml-2 text-slate-500">(mostrando as primeiras {resultados.length})</span>
                    )}
                  </p>
                  {selecionados.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIndiceVisualizador(0)}
                      className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90"
                    >
                      ▶ Ver {selecionados.length} selecionada{selecionados.length > 1 ? 's' : ''} em sequência
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {resultados.map((imagem, indice) => (
                    <div
                      key={imagem.curation_id}
                      className="flex flex-col rounded-2xl border border-base-border bg-base-surface p-4"
                    >
                      <div className="relative mb-3 overflow-hidden rounded-lg">
                        <MiniaturaImagem
                          curationId={imagem.curation_id}
                          alt={imagem.descricao_didatica ?? `Imagem #${indice + 1}`}
                          className="h-36 w-full bg-base-surface2 object-cover"
                        />
                        <span className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs font-semibold text-white">
                          {indice + 1}
                        </span>
                        <label className="absolute right-2 top-2 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-black/70">
                          <input
                            type="checkbox"
                            checked={selecionados.includes(imagem.curation_id)}
                            onChange={() => alternarSelecao(imagem.curation_id)}
                            aria-label={`Selecionar imagem #${indice + 1}`}
                            className="h-4 w-4 accent-blue-500"
                          />
                        </label>
                      </div>
                      <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" />
                        {rotular(OPCOES_TIPO_RADIOGRAFIA, imagem.tipo_radiografia)}
                      </span>
                      <dl className="mt-1 space-y-1 text-xs text-slate-400">
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

                      <Link
                        href={`/visualizar/${imagem.curation_id}`}
                        className="mt-4 block rounded-lg border border-base-border px-3 py-2 text-center text-sm text-slate-200 hover:border-blue-500 hover:text-blue-300"
                      >
                        Visualizar
                      </Link>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>

      {indiceVisualizador !== null && itensSelecionados.length > 0 && (
        <VisualizadorSequencial
          itens={itensSelecionados}
          indiceInicial={indiceVisualizador}
          onFechar={() => setIndiceVisualizador(null)}
        />
      )}
    </div>
  )
}

export default function PesquisaPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-base">
          <p className="text-slate-300">Carregando...</p>
        </main>
      }
    >
      <PesquisaConteudo />
    </Suspense>
  )
}
