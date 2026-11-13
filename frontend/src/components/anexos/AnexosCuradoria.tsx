'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

// INFORMACOES ADICIONAIS E ANEXOS DA CURADORIA (08/11/2026, pedido do Luciano)
// - Na caixa "Achados" o curador liga "Informações adicionais": abre um
//   texto livre e, no canto, um clipe para anexar imagens.
// - Nada disso entra na Pesquisa avançada: so aparece para quem ABRE a
//   imagem curada (icone de clipe no visualizador).
// - As imagens vem do servidor com login (fetch com credenciais) e viram
//   um endereco "blob:" local so para mostrar na tela.

const API = process.env.NEXT_PUBLIC_API_URL

export interface AnexoApi {
  id: number
  nome: string
  tipo: string
  tamanho: number
  largura: number | null
  altura: number | null
}

function ImagemAnexo({ url, nome, className, onClick }: { url: string; nome: string; className: string; onClick?: () => void }) {
  const [src, setSrc] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => {
    let urlObjeto: string | null = null
    let ativo = true
    fetch(url, { credentials: 'include' })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`anexo: HTTP ${r.status}`))))
      .then((b) => {
        if (!ativo) return
        urlObjeto = URL.createObjectURL(b)
        setSrc(urlObjeto)
      })
      .catch(() => ativo && setFalhou(true))
    return () => {
      ativo = false
      if (urlObjeto) URL.revokeObjectURL(urlObjeto)
    }
  }, [url])
  if (falhou) return <div className={`${className} flex items-center justify-center text-[10px] text-ink-3`}>✕</div>
  if (!src) return <div className={`${className} animate-pulse bg-white/5`} />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={nome} title={nome} className={`${className} object-cover`} onClick={onClick} />
}

function Ampliada({ url, nome, onFechar }: { url: string; nome: string; onFechar: () => void }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onFechar])
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-6" onClick={onFechar} role="dialog" aria-label={nome}>
      <ImagemAnexo url={url} nome={nome} className="max-h-full max-w-full !object-contain" />
    </div>
  )
}

/** Editor da curadoria: caixa "Informações adicionais" + clipe de anexos. */
export function InformacoesAdicionaisFicha({
  curationId,
  texto,
  onTexto,
}: {
  curationId: number
  texto: string
  onTexto: (texto: string) => void
}) {
  const t = useTranslations('Anexos')
  const [anexos, setAnexos] = useState<AnexoApi[]>([])
  const [maximo, setMaximo] = useState(10)
  const [aberta, setAberta] = useState(!!texto.trim())
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [ampliado, setAmpliado] = useState<AnexoApi | null>(null)
  const entrada = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setErro('')
    fetch(`${API}/curation/${curationId}/anexos`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return
        setAnexos(d.anexos ?? [])
        setMaximo(d.maximo ?? 10)
        if ((d.anexos ?? []).length) setAberta(true)
      })
      .catch(() => {
        // sem a lista, o texto continua funcionando
      })
  }, [curationId])

  useEffect(() => {
    if (texto.trim()) setAberta(true)
  }, [texto])

  async function enviar(arquivos: FileList | null) {
    if (!arquivos?.length) return
    setEnviando(true)
    setErro('')
    for (const arquivo of Array.from(arquivos)) {
      const corpo = new FormData()
      corpo.append('arquivo', arquivo)
      try {
        const r = await fetch(`${API}/curation/${curationId}/anexos`, { method: 'POST', credentials: 'include', body: corpo })
        const d = await r.json().catch(() => null)
        if (!r.ok) {
          setErro(`${arquivo.name}: ${typeof d?.detail === 'string' ? d.detail : t('erroEnvio')}`)
          break
        }
        setAnexos((lista) => [...lista, d as AnexoApi])
      } catch {
        setErro(t('erroEnvio'))
        break
      }
    }
    setEnviando(false)
    if (entrada.current) entrada.current.value = ''
  }

  async function remover(a: AnexoApi) {
    setErro('')
    const r = await fetch(`${API}/curation/${curationId}/anexos/${a.id}`, { method: 'DELETE', credentials: 'include' }).catch(() => null)
    if (r?.ok) setAnexos((lista) => lista.filter((x) => x.id !== a.id))
    else setErro(t('erroRemover'))
  }

  const temConteudo = !!texto.trim() || anexos.length > 0

  return (
    <div className="rounded-lg border border-base-border p-2" data-teste="informacoes-adicionais">
      <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={aberta}
          disabled={temConteudo}
          title={temConteudo ? t('naoDesligar') : undefined}
          onChange={(e) => setAberta(e.target.checked)}
          className="h-4 w-4 accent-teal-400"
        />
        <span className="font-semibold">{t('titulo')}</span>
        {anexos.length > 0 && <span className="text-xs text-ink-3">📎 {anexos.length}</span>}
      </label>

      {aberta && (
        <div className="mt-2 space-y-2">
          <p className="rounded-md border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-900 dark:text-amber-100" data-teste="aviso-informacoes">
            {t('avisoBusca')}
          </p>
          <div className="relative">
            <textarea
              value={texto}
              maxLength={8000}
              rows={3}
              onChange={(e) => onTexto(e.target.value)}
              placeholder={t('placeholder')}
              aria-label={t('titulo')}
              className="w-full rounded-lg border border-base-border bg-white/5 px-2.5 py-1.5 pr-10 text-sm text-ink outline-hidden focus:border-brand"
            />
            <button
              type="button"
              data-teste="clipe-anexar"
              onClick={() => entrada.current?.click()}
              disabled={enviando || anexos.length >= maximo}
              title={anexos.length >= maximo ? t('limite', { maximo }) : t('anexar')}
              aria-label={t('anexar')}
              className="absolute bottom-2 right-2 rounded-md border border-base-border bg-base-surface px-1.5 py-0.5 text-base leading-none hover:border-brand disabled:opacity-40"
            >
              {enviando ? '…' : '📎'}
            </button>
            <input
              ref={entrada}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => enviar(e.target.files)}
            />
          </div>
          <p className="text-[11px] text-ink-3">{t('avisoPaciente')}</p>
          {erro && <p role="alert" className="text-xs text-red-600 dark:text-red-300">{erro}</p>}
          {anexos.length > 0 && (
            <ul className="flex flex-wrap gap-2" data-teste="lista-anexos">
              {anexos.map((a) => (
                <li key={a.id} className="relative">
                  <ImagemAnexo
                    url={`${API}/curation/${curationId}/anexos/${a.id}/arquivo`}
                    nome={a.nome}
                    className="h-16 w-16 cursor-zoom-in rounded-md border border-base-border"
                    onClick={() => setAmpliado(a)}
                  />
                  <button
                    type="button"
                    onClick={() => remover(a)}
                    aria-label={t('remover', { nome: a.nome })}
                    className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-red-600 text-xs leading-none text-white shadow"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {ampliado && (
        <Ampliada
          url={`${API}/curation/${curationId}/anexos/${ampliado.id}/arquivo`}
          nome={ampliado.nome}
          onFechar={() => setAmpliado(null)}
        />
      )}
    </div>
  )
}

/** Icone de clipe na imagem curada: so aparece se houver texto ou anexos. */
export function BotaoAnexosImagem({ curationId, className = '' }: { curationId: number; className?: string }) {
  const t = useTranslations('Anexos')
  const [dados, setDados] = useState<{ informacoes_adicionais: string; anexos: AnexoApi[] } | null>(null)
  const [aberto, setAberto] = useState(false)
  const [ampliado, setAmpliado] = useState<AnexoApi | null>(null)

  useEffect(() => {
    setDados(null)
    setAberto(false)
    fetch(`${API}/search/${curationId}/anexos`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setDados(d))
      .catch(() => {
        // sem resposta, o icone simplesmente nao aparece
      })
  }, [curationId])

  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && !ampliado && setAberto(false)
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aberto, ampliado])

  if (!dados || (!dados.informacoes_adicionais.trim() && dados.anexos.length === 0)) return null

  return (
    <>
      <button
        type="button"
        data-teste="botao-anexos-imagem"
        onClick={() => setAberto(true)}
        title={t('verAnexos')}
        className={`inline-flex items-center gap-1 rounded-md border border-base-border px-2 py-0.5 text-xs text-ink hover:border-brand ${className}`}
      >
        📎 {dados.anexos.length > 0 ? dados.anexos.length : ''} <span>{t('verAnexosCurto')}</span>
      </button>
      {aberto && (
        // fundo escuro: clicar fora fecha (atalho de mouse); no teclado, Esc fecha
        <div role="presentation" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" onClick={() => setAberto(false)}>
          <div
            role="dialog"
            aria-label={t('titulo')}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-base-border bg-base-surface p-4 shadow-2xl"
            data-teste="janela-anexos"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">📎 {t('titulo')}</h2>
              <button type="button" onClick={() => setAberto(false)} aria-label={t('fechar')} className="rounded-sm px-2 text-lg text-ink-3 hover:text-ink">
                ×
              </button>
            </div>
            {dados.informacoes_adicionais.trim() && (
              <p className="mb-3 whitespace-pre-wrap text-sm text-ink">{dados.informacoes_adicionais}</p>
            )}
            {dados.anexos.length > 0 && (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {dados.anexos.map((a) => (
                  <li key={a.id}>
                    <ImagemAnexo
                      url={`${API}/search/${curationId}/anexos/${a.id}/arquivo`}
                      nome={a.nome}
                      className="aspect-square w-full cursor-zoom-in rounded-lg border border-base-border"
                      onClick={() => setAmpliado(a)}
                    />
                    <p className="mt-1 truncate text-[11px] text-ink-3">{a.nome}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {ampliado && (
        <Ampliada url={`${API}/search/${curationId}/anexos/${ampliado.id}/arquivo`} nome={ampliado.nome} onFechar={() => setAmpliado(null)} />
      )}
    </>
  )
}
