'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import MiniaturaImagem from '../../components/MiniaturaImagem'
import VisualizadorSequencial from '../../components/VisualizadorSequencial'
import type { Marcacao } from '../../lib/marcacoes'
import { corTextoAchado, corCartaoTipoRadiografia } from '../../lib/coresAchados'
import { obterSessaoAtual } from '../../lib/sessao'

interface ImagemSalva {
  curation_id: number
  tipo_radiografia: string | null
  achado_principal: string | null
  achados_detalhe?: string | null
  alteracoes_observadas?: string[] | null
  marcacoes?: Marcacao[]
  descricao_didatica: string | null
  salvo_em: string | null
  viewer_url: string | null
  qualidade_tecnica?: string | null
  dentes?: number[] | null
}

// Rotulos vem do namespace compartilhado Pesquisa.opcoes (mesmo texto
// usado em Pesquisa avançada, Curadoria e Segunda opinião), pra nao
// duplicar a mesma traducao mais uma vez. tipoRadiografia usa o proprio
// valor cru como chave; achadoPrincipal precisa do mapa abaixo porque as
// chaves de traducao nao batem 1:1 com o valor cru salvo pelo curador.
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

// Quanto mais imagens salvas o usuario tiver, mais colunas a grade ganha -
// assim cada caixa vai ficando menor conforme a quantidade cresce, em vez
// de manter sempre o mesmo tamanho e a pagina ficar cada vez mais comprida
// de rolar. As classes precisam estar escritas por extenso aqui (nao
// montadas por concatenacao) porque o Tailwind so gera o CSS de classes que
// consegue "ler" direto no codigo-fonte.
function colunasGrade(quantidade: number): string {
  if (quantidade <= 4) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  if (quantidade <= 8) return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
  if (quantidade <= 16) return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6'
  if (quantidade <= 24) return 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7'
  return 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8'
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
  const t = useTranslations('MinhasImagens')
  const tComum = useTranslations('Comum')
  const tOpcoes = useTranslations('Pesquisa.opcoes')
  const tPesquisa = useTranslations('Pesquisa')
  const tVisualizador = useTranslations('Visualizador')

  const CHAVES_TIPO_RADIOGRAFIA = ['periapical', 'panoramica', 'interproximal', 'oclusal']

  function rotularTipo(valor: string | null): string {
    if (!valor) return '—'
    if (!CHAVES_TIPO_RADIOGRAFIA.includes(valor)) return valor
    return tOpcoes(`tipoRadiografia.${valor}`)
  }

  function rotularAchado(valor: string | null): string {
    if (!valor) return '—'
    const chave = CHAVE_ACHADO[valor]
    if (!chave) return valor
    return tOpcoes(`achadoPrincipal.${chave}`)
  }

  const [autenticado, setAutenticado] = useState(false)
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
    obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }
      setAutenticado(true)
      carregar()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/saved-images/`, {
        credentials: 'include',
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, t('erroCarregar')))
        return
      }
      const dados = await resposta.json()
      setItens(dados.itens ?? [])
    } catch {
      setErro(t('erroCarregar'))
    } finally {
      setCarregando(false)
    }
  }

  async function remover(curationId: number) {
    if (!autenticado) return
    setRemovendo(curationId)
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/saved-images/${curationId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, t('erroRemover')))
        return
      }
      setItens((atual) => atual.filter((item) => item.curation_id !== curationId))
      setSelecionados((atual) => atual.filter((id) => id !== curationId))
    } catch {
      setErro(t('erroRemover'))
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
    if (!autenticado) return
    const faltando = selecionados.filter((id) => infoSeries[id] === undefined)
    if (faltando.length === 0) return

    faltando.forEach((curationId) => {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${curationId}/serie-info`, {
        credentials: 'include',
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
  }, [selecionados, autenticado])

  async function enviarSelecionadasPorEmail() {
    if (!autenticado || selecionados.length === 0) return
    setEnviandoLote(true)
    setMensagemLote('')
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/send-email-lote`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ curation_ids: selecionados }),
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, t('erroEnviarEmail')))
        return
      }
      const dados = await resposta.json()
      setMensagemLote(dados.mensagem ?? t('mensagemLotePadrao'))
    } catch {
      setErro(t('erroEnviarEmail'))
    } finally {
      setEnviandoLote(false)
    }
  }

  const algumaSelecionadaEhSerie = selecionados.some((id) => infoSeries[id] === true)
  const permiteEnviarLote =
    selecionados.length > 0 && selecionados.every((id) => infoSeries[id] === false)

  // "Selecionar todas": marca (ou desmarca, se ja estiverem todas marcadas)
  // a caixinha de selecao de cada imagem da tela de uma vez so, sem precisar
  // clicar imagem por imagem.
  const todasSelecionadas = itens.length > 0 && selecionados.length === itens.length

  function alternarSelecionarTodas() {
    setSelecionados(todasSelecionadas ? [] : itens.map((imagem) => imagem.curation_id))
  }

  const itensSelecionados = itens
    .map((imagem, indice) => ({ imagem, numero: indice + 1 }))
    .filter(({ imagem }) => selecionados.includes(imagem.curation_id))
    .map(({ imagem, numero }) => ({
      curation_id: imagem.curation_id,
      numero,
      descricao_didatica: imagem.descricao_didatica,
      tipo_radiografia: imagem.tipo_radiografia,
      viewer_url: imagem.viewer_url,
      achados_detalhe: imagem.achados_detalhe,
      alteracoes_observadas: imagem.alteracoes_observadas,
      marcacoes: imagem.marcacoes,
      qualidade_tecnica: imagem.qualidade_tecnica,
      dentes: imagem.dentes,
      achado_principal: imagem.achado_principal,
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
        <p className="text-slate-300">{tComum('carregando')}</p>
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
                {t('tituloPrefixo')} <span className="text-brand-300">{t('tituloDestaque')}</span>
              </h1>
              <p className="mt-1 text-sm text-slate-400">{t('subtitulo')}</p>
            </div>

            {itens.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={alternarSelecionarTodas}
                  className="flex items-center gap-2 rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300"
                >
                  <input
                    type="checkbox"
                    checked={todasSelecionadas}
                    readOnly
                    aria-hidden="true"
                    tabIndex={-1}
                    className="h-4 w-4 accent-brand"
                  />
                  {todasSelecionadas ? t('desmarcarTodas') : tPesquisa('selecionarTodas', { quantidade: itens.length })}
                </button>

                {selecionados.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={verSelecionadasEmSequencia}
                      className="flex items-center gap-2 rounded-lg bg-brand hover:bg-brand-hover px-4 py-2 text-sm font-medium text-white shadow-glow transition-opacity hover:opacity-90"
                    >
                      ▶{' '}
                      {selecionados.length > 1
                        ? tPesquisa('verSelecionadasPlural', { quantidade: selecionados.length })
                        : tPesquisa('verSelecionadasSingular', { quantidade: selecionados.length })}
                    </button>
                    {permiteEnviarLote && (
                      <button
                        type="button"
                        onClick={enviarSelecionadasPorEmail}
                        disabled={enviandoLote}
                        className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-brand hover:text-brand-300 disabled:opacity-60"
                      >
                        {enviandoLote
                          ? t('enviando')
                          : selecionados.length > 1
                            ? t('enviarPorEmailPlural', { quantidade: selecionados.length })
                            : t('enviarPorEmailSingular', { quantidade: selecionados.length })}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {algumaSelecionadaEhSerie && (
            <p className="mt-3 text-xs text-slate-500">
              {t('avisoSerie')}
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
                {t('semImagensPrefixo')}{' '}
                <Link href="/pesquisa" className="text-brand-300 hover:underline">
                  {t('linkPesquisaAvancada')}
                </Link>
                .
              </p>
            ) : (
              <div className={`grid gap-4 ${colunasGrade(itens.length)}`}>
                {itens.map((imagem, indice) => (
                  <div
                    key={imagem.curation_id}
                    className={`flex flex-col rounded-2xl border bg-gradient-to-br p-4 ${corCartaoTipoRadiografia(imagem.tipo_radiografia)}`}
                  >
                    <div className="relative mb-3 overflow-hidden rounded-lg">
                      <MiniaturaImagem
                        curationId={imagem.curation_id}
                        alt={imagem.descricao_didatica ?? tVisualizador('imagemNumero', { numero: indice + 1 })}
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
                          aria-label={tPesquisa('selecionarImagem', { numero: indice + 1 })}
                          className="h-4 w-4 accent-brand"
                        />
                      </label>
                    </div>

                    <span className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-300" aria-hidden="true" />
                      {rotularTipo(imagem.tipo_radiografia)}
                    </span>

                    {/* Achado principal com a MESMA cor usada no card correspondente
                        do Banco de imagens (../../lib/coresAchados) - mesmo tratamento
                        ja aplicado nos resultados da Pesquisa avançada. */}
                    <span className={`mb-2 truncate text-xs font-medium ${corTextoAchado(imagem.achado_principal)}`}>
                      {rotularAchado(imagem.achado_principal)}
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
                        {t('expandir')}
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(imagem.curation_id)}
                        disabled={removendo === imagem.curation_id}
                        className="rounded-lg border border-base-border px-3 py-2 text-sm text-red-400 hover:border-red-500 disabled:opacity-50"
                      >
                        {removendo === imagem.curation_id ? '...' : t('remover')}
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
