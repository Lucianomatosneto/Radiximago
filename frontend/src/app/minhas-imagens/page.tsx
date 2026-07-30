'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import MiniaturaImagem from '../../components/MiniaturaImagem'
import VisualizadorSequencial from '../../components/VisualizadorSequencial'

interface ImagemSalva {
  curation_id: number
  tipo_radiografia: string | null
  achado_principal: string | null
  descricao_didatica: string | null
  salvo_em: string | null
  viewer_url: string | null
}

const ROTULOS_TIPO_RADIOGRAFIA: Record<string, string> = {
  periapical: 'Periapical',
  panoramica: 'Panorâmica',
  interproximal: 'Interproximal',
  oclusal: 'Oclusal',
}

function rotularTipo(valor: string | null): string {
  if (!valor) return '—'
  return ROTULOS_TIPO_RADIOGRAFIA[valor] ?? valor
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

export default function MinhasImagensPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [itens, setItens] = useState<ImagemSalva[]>([])
  const [erro, setErro] = useState('')
  const [removendo, setRemovendo] = useState<number | null>(null)
  const [selecionados, setSelecionados] = useState<number[]>([])
  const [indiceVisualizador, setIndiceVisualizador] = useState<number | null>(null)
  const [itemExpandido, setItemExpandido] = useState<ImagemSalva | null>(null)
  const [enviandoLote, setEnviandoLote] = useState(false)
  const [mensagemLote, setMensagemLote] = useState('')
  const [infoSeries, setInfoSeries] = useState<Record<number, boolean>>({})

  useEffect(() => {
    const tokenAtual = localStorage.getItem('access_token')
    if (!tokenAtual) {
      router.push('/login')
      return
    }
    setToken(tokenAtual)
    carregar(tokenAtual)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregar(tokenAtual: string) {
    setCarregando(true)
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/saved-images/`, {
        headers: { Authorization: `Bearer ${tokenAtual}` },
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, 'Não foi possível carregar suas imagens salvas.'))
        return
      }
      const dados = await resposta.json()
      setItens(dados.itens ?? [])
    } catch {
      setErro('Não foi possível carregar suas imagens salvas.')
    } finally {
      setCarregando(false)
    }
  }

  async function remover(curationId: number) {
    if (!token) return
    setRemovendo(curationId)
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/saved-images/${curationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, 'Não foi possível remover a imagem.'))
        return
      }
      setItens((atual) => atual.filter((item) => item.curation_id !== curationId))
      setSelecionados((atual) => atual.filter((id) => id !== curationId))
    } catch {
      setErro('Não foi possível remover a imagem.')
    } finally {
      setRemovendo(null)
    }
  }

  function alternarSelecao(curationId: number) {
    setSelecionados((atual) =>
      atual.includes(curationId) ? atual.filter((id) => id !== curationId) : [...atual, curationId]
    )
  }

  function expandirImagem(imagem: ImagemSalva) {
    setIndiceVisualizador(null)
    setItemExpandido(imagem)
  }

  function verSelecionadasEmSequencia() {
    setItemExpandido(null)
    setIndiceVisualizador(0)
  }

  useEffect(() => {
    if (!token) return
    const faltando = selecionados.filter((id) => infoSeries[id] === undefined)
    if (faltando.length === 0) return

    faltando.forEach((curationId) => {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${curationId}/serie-info`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((resposta) => (resposta.ok ? resposta.json() : null))
        .then((dados) => {
          if (dados) setInfoSeries((atual) => ({ ...atual, [curationId]: dados.eh_serie }))
        })
        .catch(() => {
          // sem essa informacao, o botao de envio em lote fica escondido por seguranca
        })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionados, token])

  async function enviarSelecionadasPorEmail() {
    if (!token || selecionados.length === 0) return
    setEnviandoLote(true)
    setMensagemLote('')
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/send-email-lote`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ curation_ids: selecionados }),
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, 'Não foi possível enviar as imagens por e-mail.'))
        return
      }
      const dados = await resposta.json()
      setMensagemLote(dados.mensagem ?? 'Imagens enviadas por e-mail.')
    } catch {
      setErro('Não foi possível enviar as imagens por e-mail.')
    } finally {
      setEnviandoLote(false)
    }
  }

  const algumaSelecionadaEhSerie = selecionados.some((id) => infoSeries[id] === true)
  const permiteEnviarLote =
    selecionados.length > 0 && selecionados.every((id) => infoSeries[id] === false)

  const itensSelecionados = itens
    .map((imagem, indice) => ({ imagem, numero: indice + 1 }))
    .filter(({ imagem }) => selecionados.includes(imagem.curation_id))
    .map(({ imagem, numero }) => ({
      curation_id: imagem.curation_id,
      numero,
      descricao_didatica: imagem.descricao_didatica,
      tipo_radiografia: imagem.tipo_radiografia,
      viewer_url: imagem.viewer_url,
    }))

  const itensExpandido = itemExpandido
    ? [
        {
          curation_id: itemExpandido.curation_id,
          numero: itens.findIndex((i) => i.curation_id === itemExpandido.curation_id) + 1,
          descricao_didatica: itemExpandido.descricao_didatica,
          tipo_radiografia: itemExpandido.tipo_radiografia,
          viewer_url: itemExpandido.viewer_url,
        },
      ]
    : []

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">Carregando...</p>
      </main>
    )
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />

      <div className="flex flex-1 flex-col">
        <Topbar />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-ink">
                Minhas <span className="text-brand-300">imagens</span>
              </h1>
              <p className="mt-1 text-sm text-slate-400">Imagens que você salvou a partir da Pesquisa avançada.</p>
            </div>

            {selecionados.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={verSelecionadasEmSequencia}
                  className="flex items-center gap-2 rounded-lg bg-brand hover:bg-brand-hover px-4 py-2 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90"
                >
                  ▶ Ver {selecionados.length} selecionada{selecionados.length > 1 ? 's' : ''} em sequência
                </button>
                {permiteEnviarLote && (
                  <button
                    type="button"
                    onClick={enviarSelecionadasPorEmail}
                    disabled={enviandoLote}
                    className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-60"
                  >
                    {enviandoLote
                      ? 'Enviando...'
                      : `✉ Enviar ${selecionados.length} selecionada${selecionados.length > 1 ? 's' : ''} por e-mail`}
                  </button>
                )}
              </div>
            )}
          </div>

          {algumaSelecionadaEhSerie && (
            <p className="mt-3 text-xs text-slate-500">
              Uma ou mais imagens selecionadas fazem parte de uma série com vários cortes (tomografia) e não
              podem ser enviadas por e-mail — use os botões de download (ZIP) dentro do visualizador em
              sequência.
            </p>
          )}

          {mensagemLote && <p className="mt-3 text-sm text-emerald-400">{mensagemLote}</p>}
          {erro && (
            <p className="mt-4 text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}

          <div className="mt-6">
            {itens.length === 0 ? (
              <p className="py-12 text-center text-slate-500">
                Você ainda não salvou nenhuma imagem. Salve imagens na tela de{' '}
                <Link href="/pesquisa" className="text-brand-300 hover:underline">
                  Pesquisa avançada
                </Link>
                .
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {itens.map((imagem, indice) => (
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
                          className="h-4 w-4 accent-brand"
                        />
                      </label>
                    </div>

                    <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-300" aria-hidden="true" />
                      {rotularTipo(imagem.tipo_radiografia)}
                    </span>

                    {imagem.descricao_didatica && (
                      <p className="line-clamp-2 text-xs text-slate-400">{imagem.descricao_didatica}</p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => expandirImagem(imagem)}
                        className="flex-1 rounded-lg border border-base-border px-3 py-2 text-center text-sm text-slate-200 hover:border-brand hover:text-brand-300"
                      >
                        ⛶ Expandir
                      </button>
                      <Link
                        href={`/visualizar/${imagem.curation_id}`}
                        className="flex-1 rounded-lg border border-base-border px-3 py-2 text-center text-sm text-slate-200 hover:border-brand hover:text-brand-300"
                      >
                        Detalhes
                      </Link>
                      <button
                        type="button"
                        onClick={() => remover(imagem.curation_id)}
                        disabled={removendo === imagem.curation_id}
                        className="rounded-lg border border-base-border px-3 py-2 text-sm text-red-400 hover:border-red-500 disabled:opacity-50"
                      >
                        {removendo === imagem.curation_id ? '...' : 'Remover'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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

      {itemExpandido && itensExpandido.length > 0 && (
        <VisualizadorSequencial
          itens={itensExpandido}
          indiceInicial={0}
          onFechar={() => setItemExpandido(null)}
        />
      )}
    </div>
  )
}
