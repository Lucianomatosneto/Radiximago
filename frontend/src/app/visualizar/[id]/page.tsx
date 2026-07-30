'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import Topbar from '../../../components/Topbar'

const OPCOES_TIPO_RADIOGRAFIA = [
  { valor: 'periapical', label: 'Periapical' },
  { valor: 'panoramica', label: 'Panorâmica' },
  { valor: 'interproximal', label: 'Interproximal' },
  { valor: 'oclusal', label: 'Oclusal' },
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

const OPCOES_FINALIDADE = [
  { valor: 'ensino', label: 'Ensino' },
  { valor: 'pesquisa', label: 'Pesquisa' },
  { valor: 'ambos', label: 'Ambos' },
]

// Somente os campos didaticos/publicos usados nesta tela. Mesmo que a
// resposta de /search traga outros campos (ex.: orthanc_id), esta interface
// nao os declara e a tela nao os renderiza.
interface ImagemDidatica {
  curation_id: number
  tipo_radiografia: string | null
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

export default function VisualizarImagemPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const curationId = Number(params.id)

  const [imagem, setImagem] = useState<ImagemDidatica | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    if (!token) {
      router.push('/login')
      return
    }
    buscarImagem(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function buscarImagem(token: string) {
    setCarregando(true)
    setErro('')
    try {
      // Nao existe endpoint de busca por id unico neste conjunto publico -
      // reaproveitamos /search (sem filtros, limite maximo permitido) e
      // localizamos o item pelo curation_id na resposta.
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
      const encontrada = (dados.itens ?? []).find(
        (item: ImagemDidatica) => item.curation_id === curationId
      )
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

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex flex-1 flex-col overflow-y-auto p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-ink">
                Detalhes <span className="text-brand-300">da imagem</span>
              </h1>
              <p className="mt-1 text-sm text-slate-400">
                Visualize a imagem e as classificações realizadas pelo curador.
              </p>
            </div>
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-full border border-base-border px-4 py-1.5 text-sm text-slate-300 hover:border-brand hover:text-brand-300"
            >
              ← Voltar aos resultados
            </button>
          </div>

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
              <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
                <section className="flex min-h-[65vh] flex-col overflow-hidden rounded-2xl border border-base-border bg-base-surface">
                  <div className="flex items-center justify-between border-b border-base-border px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-300" aria-hidden="true" />
                      {rotular(OPCOES_TIPO_RADIOGRAFIA, imagem.tipo_radiografia)}
                    </span>
                  </div>
                  {imagem.viewer_url ? (
                    <iframe
                      src={imagem.viewer_url}
                      title="Visualizador OHIF"
                      className="h-full min-h-[65vh] w-full flex-1 border-0"
                    />
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
                      Imagem não disponível para visualização
                    </div>
                  )}
                </section>

                <section className="rounded-2xl border border-base-border bg-base-surface p-5">
                  <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-ink">
                    <span className="text-brand-300" aria-hidden="true">✓</span> Classificações do curador
                  </h2>
                  <p className="mb-4 text-xs text-slate-400">
                    Informações analisadas e classificadas pelo curador especialista.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        1. Tipo de exame
                      </p>
                      <p className="rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100">
                        {rotular(OPCOES_TIPO_RADIOGRAFIA, imagem.tipo_radiografia)}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        2. Achados
                      </p>
                      <div className="space-y-1.5">
                        <p className="rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100">
                          {rotular(OPCOES_ACHADO_PRINCIPAL, imagem.achado_principal)}
                        </p>
                        <p className="rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100">
                          Qualidade técnica: {rotular(OPCOES_QUALIDADE_TECNICA, imagem.qualidade_tecnica)}
                        </p>
                        <p className="rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100">
                          Dificuldade: {rotular(OPCOES_DIFICULDADE, imagem.dificuldade)}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        3. Finalidade
                      </p>
                      <p className="rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100">
                        {rotular(OPCOES_FINALIDADE, imagem.finalidade)}
                      </p>
                    </div>

                    <div>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        4. Descrição didática
                      </p>
                      <p className="whitespace-pre-wrap rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-slate-100">
                        {imagem.descricao_didatica || '—'}
                      </p>
                    </div>
                  </div>
                </section>
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
