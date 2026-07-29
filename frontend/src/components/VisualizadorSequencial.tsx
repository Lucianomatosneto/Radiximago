'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import MiniaturaImagem from './MiniaturaImagem'

export interface ItemSequencia {
  curation_id: number
  numero: number
  descricao_didatica: string | null
  tipo_radiografia: string | null
  viewer_url: string | null
}

interface Props {
  itens: ItemSequencia[]
  indiceInicial: number
  onFechar: () => void
}

interface InfoSerie {
  eh_serie: boolean
  total_cortes: number
}

interface SerieEstudo {
  series_instance_uid: string
  series_number: string | null
  modality: string | null
  total_instancias: number
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

export default function VisualizadorSequencial({ itens, indiceInicial, onFechar }: Props) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const [indice, setIndice] = useState(indiceInicial)
  const [enviando, setEnviando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [jaSalvo, setJaSalvo] = useState(false)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState('')
  const [telaCheia, setTelaCheia] = useState(false)
  const [infoSerie, setInfoSerie] = useState<InfoSerie | null>(null)
  const [baixandoImagens, setBaixandoImagens] = useState(false)
  const [baixandoDicom, setBaixandoDicom] = useState(false)
  const [baixandoUnico, setBaixandoUnico] = useState(false)
  const [series, setSeries] = useState<SerieEstudo[]>([])
  // curation_id a que a lista em `series` pertence de fato - so aplicamos
  // o SeriesInstanceUID quando esse valor bate com a imagem atual. Sem
  // essa guarda, ao trocar de estudo (seta dupla) a serie da imagem
  // ANTERIOR ficava aplicada por uma fração de segundo na URL do estudo
  // NOVO (o `series`/`indiceSerie` só zeram de forma assíncrona, depois
  // do primeiro render com o `indice` já atualizado) - o OHIF recebia um
  // SeriesInstanceUID que não existe naquele estudo e dava erro.
  const [seriesDoItem, setSeriesDoItem] = useState<number | null>(null)
  const [indiceSerie, setIndiceSerie] = useState(0)

  const atual = itens[indice]
  const seriesValidas = seriesDoItem === atual.curation_id ? series : []
  const serieAtual = seriesValidas[indiceSerie] ?? null
  const urlComSerie =
    atual.viewer_url && serieAtual
      ? `${atual.viewer_url}&SeriesInstanceUIDs=${serieAtual.series_instance_uid}`
      : atual.viewer_url

  useEffect(() => {
    setMensagem('')
    setErro('')
    setJaSalvo(false)
    setInfoSerie(null)
    setIndiceSerie(0)

    const token = localStorage.getItem('access_token')
    if (!token) return
    let cancelado = false
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${atual.curation_id}/serie-info`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((resposta) => (resposta.ok ? resposta.json() : null))
      .then((dados) => {
        if (dados && !cancelado) setInfoSerie(dados)
      })
      .catch(() => {
        // sem essa informacao, a tela continua mostrando o download simples
      })

    if (atual.viewer_url) {
      const curationIdDaBusca = atual.curation_id
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${curationIdDaBusca}/series`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((resposta) => (resposta.ok ? resposta.json() : null))
        .then((dados) => {
          if (dados?.series && !cancelado) {
            setSeries(dados.series)
            setSeriesDoItem(curationIdDaBusca)
          }
        })
        .catch(() => {
          // sem essa informacao, a navegacao entre series fica indisponivel
        })
    }

    return () => {
      cancelado = true
    }
  }, [indice])

  useEffect(() => {
    function aoMudarTelaCheia() {
      setTelaCheia(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', aoMudarTelaCheia)
    return () => document.removeEventListener('fullscreenchange', aoMudarTelaCheia)
  }, [])

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent) {
      if (evento.key === 'ArrowRight') irParaProxima()
      else if (evento.key === 'ArrowLeft') irParaAnterior()
      else if (evento.key === 'Escape' && !document.fullscreenElement) onFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice])

  async function alternarTelaCheia() {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  }

  function irParaAnterior() {
    setIndice((i) => (i > 0 ? i - 1 : i))
  }

  function irParaProxima() {
    setIndice((i) => (i < itens.length - 1 ? i + 1 : i))
  }

  function irParaSerieAnterior() {
    setIndiceSerie((i) => (i > 0 ? i - 1 : i))
  }

  function irParaProximaSerie() {
    setIndiceSerie((i) => (i < seriesValidas.length - 1 ? i + 1 : i))
  }

  async function baixarArquivo(
    caminho: string,
    nomeArquivo: string,
    setCarregando: (valor: boolean) => void
  ) {
    const token = localStorage.getItem('access_token')
    if (!token) return
    setCarregando(true)
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${caminho}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!resposta.ok) {
        setErro('Não foi possível baixar o arquivo.')
        return
      }
      const blob = await resposta.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = nomeArquivo
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch {
      setErro('Não foi possível baixar o arquivo.')
    } finally {
      setCarregando(false)
    }
  }

  function baixarUnico() {
    baixarArquivo(
      `/search/${atual.curation_id}/preview`,
      `radix-imago-${atual.curation_id}.png`,
      setBaixandoUnico
    )
  }

  function baixarZipImagens() {
    baixarArquivo(
      `/search/${atual.curation_id}/download/imagens.zip`,
      `radix-imago-${atual.curation_id}-imagens.zip`,
      setBaixandoImagens
    )
  }

  function baixarZipDicom() {
    baixarArquivo(
      `/search/${atual.curation_id}/download/dicom.zip`,
      `radix-imago-${atual.curation_id}-dicom.zip`,
      setBaixandoDicom
    )
  }

  async function salvarNoUsuario() {
    const token = localStorage.getItem('access_token')
    if (!token) return
    setSalvando(true)
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/saved-images/${atual.curation_id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, 'Não foi possível salvar a imagem.'))
        return
      }
      setJaSalvo(true)
      setMensagem('Imagem salva em "Minhas imagens".')
    } catch {
      setErro('Não foi possível salvar a imagem.')
    } finally {
      setSalvando(false)
    }
  }

  async function enviarPorEmail() {
    const token = localStorage.getItem('access_token')
    if (!token) return
    setEnviando(true)
    setErro('')
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/search/${atual.curation_id}/send-email`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (resposta.status === 401) {
        router.push('/login')
        return
      }
      if (!resposta.ok) {
        setErro(await extrairErro(resposta, 'Não foi possível enviar por e-mail.'))
        return
      }
      const dados = await resposta.json()
      setMensagem(dados.mensagem ?? 'Imagem enviada por e-mail.')
    } catch {
      setErro('Não foi possível enviar por e-mail.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div ref={containerRef} className="fixed inset-0 z-50 flex flex-col bg-black/90">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
        <div className="text-sm text-slate-300">
          Imagem <span className="font-semibold text-white">#{atual.numero}</span>{' '}
          <span className="text-slate-500">
            ({indice + 1} de {itens.length} selecionadas)
          </span>
          {seriesValidas.length > 1 && (
            <span className="text-slate-500">
              {' '}
              · Série {indiceSerie + 1} de {seriesValidas.length}
              {serieAtual?.total_instancias ? ` (${serieAtual.total_instancias} cortes)` : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={alternarTelaCheia}
            aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-white/30 hover:text-white"
          >
            {telaCheia ? '⛶ Sair da tela cheia' : '⛶ Tela cheia'}
          </button>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar"
            className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:border-white/30 hover:text-white"
          >
            ✕ Fechar
          </button>
        </div>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        <div className="absolute left-2 z-10 flex items-center gap-1.5 sm:left-6">
          <button
            type="button"
            onClick={irParaAnterior}
            disabled={indice === 0}
            aria-label="Estudo anterior (imagem selecionada anterior)"
            title="Estudo anterior"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 disabled:opacity-30"
          >
            «
          </button>
          {seriesValidas.length > 1 && (
            <button
              type="button"
              onClick={irParaSerieAnterior}
              disabled={indiceSerie === 0}
              aria-label="Série (pasta) anterior deste estudo"
              title="Série anterior"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 disabled:opacity-30"
            >
              ‹
            </button>
          )}
        </div>

        {urlComSerie ? (
          <iframe
            key={atual.curation_id}
            src={urlComSerie}
            title={`Visualizador OHIF - Imagem #${atual.numero}`}
            className="h-full w-full flex-1 border-0"
          />
        ) : (
          <MiniaturaImagem
            curationId={atual.curation_id}
            alt={atual.descricao_didatica ?? `Imagem #${atual.numero}`}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        )}

        <div className="absolute right-2 z-10 flex items-center gap-1.5 sm:right-6">
          {seriesValidas.length > 1 && (
            <button
              type="button"
              onClick={irParaProximaSerie}
              disabled={indiceSerie === seriesValidas.length - 1}
              aria-label="Próxima série (pasta) deste estudo"
              title="Próxima série"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20 disabled:opacity-30"
            >
              ›
            </button>
          )}
          <button
            type="button"
            onClick={irParaProxima}
            disabled={indice === itens.length - 1}
            aria-label="Próximo estudo (próxima imagem selecionada)"
            title="Próximo estudo"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-xl text-white hover:bg-white/20 disabled:opacity-30"
          >
            »
          </button>
        </div>
      </div>

      {atual.viewer_url && (
        <p className="border-t border-white/10 bg-black/40 px-4 py-1.5 text-center text-xs text-slate-400">
          Use a rolagem do mouse ou Page Up / Page Down dentro do visualizador para percorrer todos os cortes desta
          imagem.
          {seriesValidas.length > 1 && ' Use a seta simples (‹ ›) para trocar de série e a seta dupla (« ») para trocar de estudo.'}
        </p>
      )}

      <div className="border-t border-white/10 px-4 py-4 sm:px-6">
        {atual.descricao_didatica && (
          <p className="mb-3 text-center text-sm text-slate-300">{atual.descricao_didatica}</p>
        )}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {infoSerie?.eh_serie ? (
            <>
              <button
                type="button"
                onClick={baixarZipImagens}
                disabled={baixandoImagens}
                className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-blue-500 hover:text-blue-300 disabled:opacity-60"
              >
                {baixandoImagens
                  ? 'Baixando...'
                  : `⬇ Baixar imagens (ZIP, ${infoSerie.total_cortes} cortes)`}
              </button>
              <button
                type="button"
                onClick={baixarZipDicom}
                disabled={baixandoDicom}
                className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-blue-500 hover:text-blue-300 disabled:opacity-60"
              >
                {baixandoDicom ? 'Baixando...' : '⬇ Baixar DICOM (ZIP)'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={baixarUnico}
              disabled={baixandoUnico}
              className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-blue-500 hover:text-blue-300 disabled:opacity-60"
            >
              {baixandoUnico ? 'Baixando...' : '⬇ Baixar'}
            </button>
          )}
          <button
            type="button"
            onClick={salvarNoUsuario}
            disabled={salvando || jaSalvo}
            className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-blue-500 hover:text-blue-300 disabled:opacity-60"
          >
            {jaSalvo ? '✓ Salva' : salvando ? 'Salvando...' : '★ Salvar no meu usuário'}
          </button>
          {!infoSerie?.eh_serie && (
            <button
              type="button"
              onClick={enviarPorEmail}
              disabled={enviando}
              className="rounded-lg border border-base-border bg-base-surface px-4 py-2 text-sm text-slate-200 hover:border-blue-500 hover:text-blue-300 disabled:opacity-60"
            >
              {enviando ? 'Enviando...' : '✉ Enviar por e-mail'}
            </button>
          )}
        </div>

        {mensagem && <p className="mt-3 text-center text-sm text-emerald-400">{mensagem}</p>}
        {erro && (
          <p className="mt-3 text-center text-sm text-red-400" role="alert">
            {erro}
          </p>
        )}
      </div>
    </div>
  )
}
