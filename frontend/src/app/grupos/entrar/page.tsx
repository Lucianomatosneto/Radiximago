'use client'

// ENTRAR NO GRUPO PELO LINK DE CONVITE (pedido do video, 22/11/2026).
// Endereco: /grupos/entrar?c=<codigo>. O dono do grupo gera o link na aba
// "Grupos que criei" e manda para a turma. Aqui:
// - sem login: vai ao login e VOLTA para este mesmo link (login?volta=...);
// - com login: mostra so o nome do grupo e quem o criou (D2) e a pessoa so
//   entra se clicar em "Entrar no grupo" (consentimento, D1);
// - ja participa, e o dono ou o link venceu: aviso claro, sem botao.
// Quem decide de verdade e o servidor (POST /grupos/link-convite/ver e /entrar).

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Users } from 'lucide-react'
import Sidebar from '../../../components/Sidebar'
import Topbar from '../../../components/Topbar'
import AvisoSemConexao from '../../../components/AvisoSemConexao'
import { useVerificarSessao } from '../../../lib/useVerificarSessao'
import { fetchOuNulo } from '../../../lib/fetchSeguro'

const API = process.env.NEXT_PUBLIC_API_URL
type Visto = { grupo: { id: number; nome: string }; criador: string | null; situacao: 'participa' | 'dono' | null }

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
  } catch {
    // sem corpo
  }
  return padrao
}

export default function EntrarPorLinkPage() {
  const t = useTranslations('LinkConvite.entrar')
  const tComum = useTranslations('Comum')
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [visto, setVisto] = useState<Visto | null>(null)
  const [entrou, setEntrou] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)

  const { semConexao, verificando, tentarDeNovo } = useVerificarSessao(
    () => {
      const c = new URLSearchParams(window.location.search).get('c') ?? ''
      setCodigo(c)
      setPronto(true)
      if (!c) {
        setErro(t('semCodigo'))
        return
      }
      void fetchOuNulo(`${API}/grupos/link-convite/ver`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: c }),
      }).then(async (r) => {
        if (!r) setErro(tComum('semConexao'))
        else if (!r.ok) setErro(await lerErro(r, t('invalido')))
        else setVisto(await r.json())
      })
    },
    {
      // sem login: entra e volta para este mesmo link
      aoInvalida: () => router.push(`/login?volta=${encodeURIComponent(window.location.pathname + window.location.search)}`),
    },
  )

  async function entrar() {
    setOcupado(true)
    setErro('')
    const r = await fetchOuNulo(`${API}/grupos/link-convite/entrar`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo }),
    })
    setOcupado(false)
    if (!r) return setErro(tComum('semConexao'))
    if (!r.ok) return setErro(await lerErro(r, t('invalido')))
    setEntrou(true)
    window.dispatchEvent(new Event('radix-grupos-mudou'))
  }

  if (semConexao) return <AvisoSemConexao aoTentar={tentarDeNovo} ocupado={verificando} />
  if (!pronto) {
    return <main className="flex min-h-screen items-center justify-center bg-base"><p className="text-sm text-slate-400">{tComum('carregando')}</p></main>
  }

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-base-border bg-base-surface p-6">
            <h1 className="flex items-center gap-2 text-lg font-semibold text-ink"><Users aria-hidden="true" className="h-5 w-5" /> {t('titulo')}</h1>
            {erro && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{erro}</p>}
            {visto && (
              <>
                <div className="rounded-lg border border-base-border p-3">
                  <p className="text-base font-semibold text-ink">{visto.grupo.nome}</p>
                  {visto.criador && <p className="text-sm text-ink-2">{t('criadoPor', { quem: visto.criador })}</p>}
                </div>
                {entrou ? (
                  <p role="status" className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-300">{t('entrou')}</p>
                ) : visto.situacao === 'participa' ? (
                  <p className="text-sm text-ink-2">{t('jaParticipa')}</p>
                ) : visto.situacao === 'dono' ? (
                  <p className="text-sm text-ink-2">{t('dono')}</p>
                ) : (
                  <>
                    <p className="text-sm text-ink-2">{t('explica')}</p>
                    <div className="flex gap-2">
                      <button type="button" disabled={ocupado} onClick={() => void entrar()}
                              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50">
                        {t('botao')}
                      </button>
                      <Link href="/grupos?aba=participo" className="rounded-lg border border-base-border px-4 py-2 text-sm text-ink">{t('agoraNao')}</Link>
                    </div>
                  </>
                )}
                {(entrou || visto.situacao === 'participa') && (
                  <Link href="/grupos?aba=participo" className="inline-block text-sm text-brand underline">{t('verGrupos')}</Link>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
