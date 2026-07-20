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
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex flex-1 flex-col overflow-y-auto p-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-4 w-fit rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500"
          >
            ← Voltar
          </button>

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
                <section className="flex min-h-[65vh] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
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

                <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
                  <h2 className="mb-4 text-sm font-semibold text-slate-200">
                    Contexto didático
                  </h2>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">Tipo de radiografia</dt>
                      <dd className="text-slate-200">
                        {rotular(OPCOES_TIPO_RADIOGRAFIA, imagem.tipo_radiografia)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Achado principal</dt>
                      <dd className="text-slate-200">
                        {rotular(OPCOES_ACHADO_PRINCIPAL, imagem.achado_principal)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Qualidade técnica</dt>
                      <dd className="text-slate-200">
                        {rotular(OPCOES_QUALIDADE_TECNICA, imagem.qualidade_tecnica)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Dificuldade</dt>
                      <dd className="text-slate-200">
                        {rotular(OPCOES_DIFICULDADE, imagem.dificuldade)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Finalidade</dt>
                      <dd className="text-slate-200">
                        {rotular(OPCOES_FINALIDADE, imagem.finalidade)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">Descrição didática</dt>
                      <dd className="whitespace-pre-wrap text-slate-200">
                        {imagem.descricao_didatica || '—'}
                      </dd>
                    </div>
                  </dl>
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
