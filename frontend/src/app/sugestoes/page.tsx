'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Lightbulb } from 'lucide-react'
import AvisoEmail from '../../components/AvisoEmail'
import EstadoVazio from '../../components/EstadoVazio'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { obterSessaoAtual, type SessaoUsuario } from '../../lib/sessao'

// SUGESTOES DE MELHORIA (30/10/2026) - qualquer usuario logado envia; o
// nome e o perfil de quem enviou sao gravados pelo servidor, a partir do
// login. Cada um ve so as proprias e o andamento; o ADMINISTRADOR ve a
// lista completa, em ordem de chegada, e muda o andamento.
// Backend: backend/app/modules/sugestoes.py

const API = process.env.NEXT_PUBLIC_API_URL
const ANDAMENTOS = ['recebida', 'em_analise', 'feita', 'nao_sera_feita'] as const
type Andamento = (typeof ANDAMENTOS)[number]

interface Sugestao {
  id: number
  texto: string
  andamento: Andamento
  motivo: string | null
  criado_em: string | null
  atualizado_em: string | null
  perfil?: string
  nome?: string | null
  contato?: string | null
}

const COR_ANDAMENTO: Record<Andamento, string> = {
  recebida: 'border-sky-400/50 bg-sky-500/10 text-sky-700 dark:text-sky-200',
  em_analise: 'border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-200',
  feita: 'border-emerald-400/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
  nao_sera_feita: 'border-slate-400/50 bg-slate-500/10 text-slate-600 dark:text-slate-300',
}

const campo =
  'w-full rounded-lg border border-base-border bg-base-surface2 px-3 py-2 text-sm text-ink outline-hidden focus:border-brand'

async function lerErro(r: Response, padrao: string) {
  try {
    const d = await r.json()
    if (typeof d?.detail === 'string') return d.detail
    if (Array.isArray(d?.detail) && d.detail[0]?.msg) return String(d.detail[0].msg).replace(/^Value error, /, '')
  } catch {
    // sem corpo legivel
  }
  return padrao
}

function dataHora(iso: string | null) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

export default function SugestoesPage() {
  const router = useRouter()
  const t = useTranslations('Sugestoes')
  const tPerfil = useTranslations('Sugestoes.perfis')
  const [sessao, setSessao] = useState<SessaoUsuario | null>(null)
  const [texto, setTexto] = useState('')
  const [contato, setContato] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [minhas, setMinhas] = useState<Sugestao[]>([])
  const [todas, setTodas] = useState<Sugestao[]>([])
  const [filtro, setFiltro] = useState<'' | Andamento>('')
  const [motivos, setMotivos] = useState<Record<number, string>>({})
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

  const ehAdmin = sessao?.perfil === 'administrador'

  useEffect(() => {
    void obterSessaoAtual().then((s) => {
      if (!s) {
        router.push('/login')
        return
      }
      setSessao(s)
      setContato(s.email || '')
      void carregar(s.perfil === 'administrador')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregar(admin: boolean) {
    try {
      const r = await fetch(`${API}/sugestoes/minhas`, { credentials: 'include' })
      if (r.ok) setMinhas((await r.json()).sugestoes)
      if (admin) {
        const ra = await fetch(`${API}/sugestoes`, { credentials: 'include' })
        if (ra.ok) setTodas((await ra.json()).sugestoes)
      }
    } catch {
      setErro(t('erroCarregar'))
    }
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setAviso('')
    setEnviando(true)
    try {
      const r = await fetch(`${API}/sugestoes`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, contato }),
      })
      if (!r.ok) {
        setErro(await lerErro(r, t('erroEnviar')))
        return
      }
      setTexto('')
      setAviso(t('enviada'))
      void carregar(ehAdmin)
    } catch {
      setErro(t('erroEnviar'))
    } finally {
      setEnviando(false)
    }
  }

  async function mudarAndamento(s: Sugestao, andamento: Andamento) {
    setErro('')
    const motivo = (motivos[s.id] ?? s.motivo ?? '').trim()
    if (andamento === 'nao_sera_feita' && !motivo) {
      setErro(t('motivoObrigatorio'))
      return
    }
    const r = await fetch(`${API}/sugestoes/${s.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ andamento, motivo: motivo || null }),
    })
    if (!r.ok) {
      setErro(await lerErro(r, t('erroAndamento')))
      return
    }
    void carregar(true)
  }

  if (!sessao) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-sm text-slate-400">{t('carregando')}</p>
      </main>
    )
  }

  const visiveis = filtro ? todas.filter((s) => s.andamento === filtro) : todas

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <div>
            <h1 className="titulo-pagina tela-entra">{t('titulo')}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{t('subtitulo')}</p>
          </div>

          {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-500 dark:text-red-300" role="alert">{erro}</p>}
          {aviso && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300" role="status">{aviso}</p>}

          <form method="post" onSubmit={enviar} className="max-w-3xl space-y-3 rounded-2xl border border-base-border bg-base-surface p-4">
            <div>
              <label htmlFor="sug-texto" className="mb-1 block text-sm font-medium text-ink">{t('suaSugestao')}</label>
              <textarea id="sug-texto" required minLength={5} maxLength={4000} rows={5} value={texto} onChange={(e) => setTexto(e.target.value)} className={campo} placeholder={t('exemplo')} />
            </div>
            <div>
              <label htmlFor="sug-contato" className="mb-1 block text-sm font-medium text-ink">{t('contato')}</label>
              <input id="sug-contato" maxLength={200} value={contato} onChange={(e) => setContato(e.target.value)} className={campo} placeholder={t('contatoExemplo')} />
              {/* B1 (01/11/2026): mesmo aviso de digitacao do cadastro */}
              {contato.includes('@') && <AvisoEmail email={contato} />}
              <p className="mt-1 text-xs text-slate-500">{t('contatoAjuda')}</p>
            </div>
            <p className="text-xs text-slate-500">{t('identificacao', { nome: sessao.nome, perfil: tPerfil(sessao.perfil) })}</p>
            <button type="submit" disabled={enviando || texto.trim().length < 5} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {enviando ? t('enviando') : t('enviar')}
            </button>
          </form>

          <section className="max-w-3xl rounded-2xl border border-base-border bg-base-surface p-4">
            <h2 className="mb-3 text-base font-semibold text-ink">{t('minhas')}</h2>
            {minhas.length === 0 && (
              <EstadoVazio icone={Lightbulb} titulo={t('nenhumaMinha')} texto={t('vazioTexto')} />
            )}
            <ul className="space-y-2">
              {minhas.map((s) => (
                <li key={s.id} className="rounded-xl border border-base-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">{dataHora(s.criado_em)}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${COR_ANDAMENTO[s.andamento]}`}>{t(`andamentos.${s.andamento}`)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{s.texto}</p>
                  {s.motivo && <p className="mt-1 text-xs text-slate-500">{t('motivo')}: {s.motivo}</p>}
                </li>
              ))}
            </ul>
          </section>

          {ehAdmin && (
            <section className="rounded-2xl border border-base-border bg-base-surface p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-ink">{t('todas', { quantidade: todas.length })}</h2>
                <select value={filtro} onChange={(e) => setFiltro(e.target.value as '' | Andamento)} className="rounded-lg border border-base-border bg-base-surface2 px-2 py-1 text-sm text-ink" aria-label={t('filtrar')}>
                  <option value="">{t('todosAndamentos')}</option>
                  {ANDAMENTOS.map((a) => <option key={a} value={a}>{t(`andamentos.${a}`)}</option>)}
                </select>
              </div>
              <p className="mb-3 text-xs text-slate-500">{t('ordemChegada')}</p>
              {visiveis.length === 0 && <p className="text-sm text-slate-500">{t('nenhuma')}</p>}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-base-border text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">#</th>
                      <th className="px-2 py-2">{t('colData')}</th>
                      <th className="px-2 py-2">{t('colQuem')}</th>
                      <th className="px-2 py-2">{t('colSugestao')}</th>
                      <th className="px-2 py-2">{t('colAndamento')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((s, i) => (
                      <tr key={s.id} className="border-b border-base-border/60 align-top">
                        <td className="px-2 py-2 text-slate-500">{i + 1}</td>
                        <td className="whitespace-nowrap px-2 py-2 text-slate-500">{dataHora(s.criado_em)}</td>
                        <td className="px-2 py-2">
                          <div className="font-medium text-ink">{s.nome}</div>
                          <div className="text-xs font-semibold text-brand">{tPerfil(s.perfil || 'estudante')}</div>
                          {s.contato && (
                            <div className="text-xs text-slate-500">
                              {s.contato}
                              {s.contato.includes('@') && <AvisoEmail email={s.contato} />}
                            </div>
                          )}
                        </td>
                        <td className="max-w-md whitespace-pre-wrap px-2 py-2 text-ink">{s.texto}</td>
                        <td className="w-56 px-2 py-2">
                          <select
                            value={s.andamento}
                            onChange={(e) => mudarAndamento(s, e.target.value as Andamento)}
                            className={`w-full rounded-lg border px-2 py-1 text-xs font-semibold ${COR_ANDAMENTO[s.andamento]}`}
                            aria-label={t('colAndamento')}
                          >
                            {ANDAMENTOS.map((a) => <option key={a} value={a}>{t(`andamentos.${a}`)}</option>)}
                          </select>
                          <input
                            value={motivos[s.id] ?? s.motivo ?? ''}
                            onChange={(e) => setMotivos({ ...motivos, [s.id]: e.target.value })}
                            maxLength={2000}
                            placeholder={t('motivoPlaceholder')}
                            className="mt-1 w-full rounded-lg border border-base-border bg-base-surface2 px-2 py-1 text-xs text-ink"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}
