'use client'

// PRANCHAS RECEBIDAS (etapa E, 08/11/2026): pranchas que outras pessoas
// mandaram para mim. O e-mail traz so o link para esta tela (exige login);
// a prancha e montada na hora, so com as imagens que continuam aprovadas.
// Link do e-mail: /pranchas-recebidas?abrir=<n> (destaca aquela prancha).

import { useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { FileImage } from 'lucide-react'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { obterSessaoAtual } from '../../lib/sessao'

const API = process.env.NEXT_PUBLIC_API_URL

type Recebida = {
  id: number
  de: string
  imagens: number
  por_folha: number
  recado: string
  criado_em: string | null
  visto: boolean
}

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
  } catch {
    // sem corpo
  }
  return padrao
}

export default function PranchasRecebidasPage() {
  const router = useRouter()
  const t = useTranslations('PranchasRecebidas')
  const locale = useLocale()
  const [pronto, setPronto] = useState(false)
  const [lista, setLista] = useState<Recebida[]>([])
  const [destaque, setDestaque] = useState<number | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState('')

  async function carregar() {
    const r = await fetch(`${API}/prancha/recebidas`, { credentials: 'include' })
    setLista(r.ok ? (await r.json()).pranchas : [])
  }

  useEffect(() => {
    const abrir = Number(new URLSearchParams(window.location.search).get('abrir')) || null
    void obterSessaoAtual().then((s) => {
      if (!s) {
        // depois do login, volta para esta mesma prancha
        router.push(`/login?volta=${encodeURIComponent(`/pranchas-recebidas${abrir ? `?abrir=${abrir}` : ''}`)}`)
        return
      }
      setDestaque(abrir)
      setPronto(true)
      void carregar()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  useEffect(() => {
    if (destaque && lista.length) document.getElementById(`prancha-${destaque}`)?.scrollIntoView({ block: 'center' })
  }, [destaque, lista.length])

  async function abrir(p: Recebida, formato: 'pdf' | 'png') {
    const chave = `${p.id}-${formato}`
    if (ocupado) return
    setOcupado(chave)
    setErro('')
    try {
      const r = await fetch(`${API}/prancha/recebidas/${p.id}/arquivo?formato=${formato}`, { credentials: 'include' })
      if (!r.ok) {
        setErro(await lerErro(r, t('erro')))
        return
      }
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `radix-imago-prancha-recebida-${p.id}.${blob.type.includes('zip') ? 'zip' : formato}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      void carregar()
    } catch {
      setErro(t('erro'))
    } finally {
      setOcupado(null)
    }
  }

  const data = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale === 'en' ? 'en-US' : 'pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''

  if (!pronto) {
    return <main className="flex min-h-screen items-center justify-center bg-base"><p className="text-sm text-ink-3">{t('carregando')}</p></main>
  }

  const botao = 'rounded-lg border border-base-border px-3 py-1.5 text-xs text-ink hover:border-brand disabled:opacity-50'

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <div>
            <h1 className="titulo-pagina tela-entra">{t('titulo')}</h1>
            <p className="mt-1 max-w-3xl text-sm text-ink-2">{t('subtitulo')}</p>
          </div>
          {erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{erro}</p>}
          {lista.length === 0 ? (
            <p className="text-sm text-ink-3">{t('vazio')}</p>
          ) : (
            <ul className="grid max-w-5xl grid-cols-1 gap-3 md:grid-cols-2" data-teste="lista-pranchas-recebidas">
              {lista.map((p) => (
                <li key={p.id} id={`prancha-${p.id}`}
                    className={`min-w-0 rounded-xl border bg-base-surface p-4 ${p.id === destaque ? 'border-brand ring-2 ring-brand/40' : 'border-base-border'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="flex min-w-0 items-center gap-2 text-base font-semibold text-ink">
                      <FileImage aria-hidden="true" className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('de', { nome: p.de })}</span>
                    </h2>
                    {!p.visto && <span className="shrink-0 rounded-full bg-brand/15 px-2 py-0.5 text-xs font-medium text-brand">{t('nova')}</span>}
                  </div>
                  <p className="mt-1 text-xs text-ink-3">{t('resumo', { imagens: p.imagens, porFolha: p.por_folha })} · {data(p.criado_em)}</p>
                  {p.recado && <p className="mt-2 whitespace-pre-line rounded-lg bg-base-surface2 p-2 text-sm text-ink-2">{p.recado}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={botao} disabled={!!ocupado} onClick={() => abrir(p, 'pdf')}>
                      {ocupado === `${p.id}-pdf` ? t('gerando') : t('abrirPdf')}
                    </button>
                    <button type="button" className={botao} disabled={!!ocupado} onClick={() => abrir(p, 'png')}>
                      {ocupado === `${p.id}-png` ? t('gerando') : t('abrirPng')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-3">{t('aviso')}</p>
        </main>
      </div>
    </div>
  )
}
