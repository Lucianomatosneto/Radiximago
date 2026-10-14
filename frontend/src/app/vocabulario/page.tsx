'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { obterSessaoAtual } from '../../lib/sessao'

// VOCABULARIO CONTROLADO (evolutivo, sempre com uma pessoa aprovando):
// 1. "Termos livres mais usados": textos do "Outro" que se repetem;
// 2. "Promover a termo oficial" (com codigo DeCS opcional e sinonimos);
// 3. conferir as fichas antigas que tem o texto e ligar ao termo;
// 4. o termo vira filtro na Pesquisa avancada e e reconhecido na curadoria
//    por voz. Ver backend/app/modules/vocabulario_router.py.

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS_PERMITIDOS = ['administrador', 'curador', 'suporte']
const CATEGORIAS = ['achado', 'alteracao', 'outro'] as const

interface TermoLivre {
  texto: string
  normalizado: string
  quantidade_fichas: number
}
interface Termo {
  id: number
  termo: string
  categoria: string
  codigo_decs: string | null
  ativo: boolean
  sinonimos: { id: number; sinonimo: string }[]
  quantidade_fichas: number
}
interface Candidata {
  curation_id: number
  status: string
  tipo_radiografia: string | null
  trecho: string
}

async function lerErro(r: Response, padrao: string) {
  try {
    const dados = await r.json()
    if (typeof dados?.detail === 'string') return dados.detail
  } catch {
    // sem corpo legivel
  }
  return padrao
}

export default function VocabularioPage() {
  const router = useRouter()
  const t = useTranslations('Vocabulario')
  const tComum = useTranslations('Comum')
  const [carregando, setCarregando] = useState(true)
  const [livres, setLivres] = useState<TermoLivre[]>([])
  const [termos, setTermos] = useState<Termo[]>([])
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  // formulario de promover (aberto para um texto livre ou "novo termo")
  const [promovendo, setPromovendo] = useState<{ termo: string; categoria: string; decs: string; sinonimos: string } | null>(null)
  const [novoSinonimo, setNovoSinonimo] = useState<Record<number, string>>({})
  const [conferindo, setConferindo] = useState<{ termo: Termo; itens: Candidata[]; marcadas: number[] } | null>(null)

  useEffect(() => {
    obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }
      if (!PERFIS_PERMITIDOS.includes(sessao.perfil)) {
        router.push('/acesso-negado')
        return
      }
      carregar()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregar() {
    setCarregando(true)
    setErro('')
    try {
      const [rLivres, rTermos] = await Promise.all([
        fetch(`${API}/vocabulario/termos-livres`, { credentials: 'include' }),
        fetch(`${API}/vocabulario?incluir_inativos=true`, { credentials: 'include' }),
      ])
      if (!rLivres.ok || !rTermos.ok) {
        setErro(t('erroCarregar'))
        return
      }
      setLivres((await rLivres.json()).itens ?? [])
      setTermos((await rTermos.json()).termos ?? [])
    } catch {
      setErro(t('erroCarregar'))
    } finally {
      setCarregando(false)
    }
  }

  function mostrarAviso(texto: string) {
    setAviso(texto)
    setTimeout(() => setAviso(''), 4000)
  }

  async function promover() {
    if (!promovendo) return
    setErro('')
    const r = await fetch(`${API}/vocabulario/termos`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        termo: promovendo.termo,
        categoria: promovendo.categoria,
        codigo_decs: promovendo.decs || null,
        sinonimos: promovendo.sinonimos
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      }),
    })
    if (!r.ok) {
      setErro(await lerErro(r, t('erroSalvar')))
      return
    }
    const termo: Termo = await r.json()
    setPromovendo(null)
    mostrarAviso(t('termoCriado', { termo: termo.termo }))
    await carregar()
    abrirConferencia(termo)
  }

  async function editar(termo: Termo, dados: Partial<{ ativo: boolean; categoria: string; codigo_decs: string }>) {
    const r = await fetch(`${API}/vocabulario/termos/${termo.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dados),
    })
    if (!r.ok) {
      setErro(await lerErro(r, t('erroSalvar')))
      return
    }
    const atualizado: Termo = await r.json()
    setTermos((lista) => lista.map((x) => (x.id === atualizado.id ? atualizado : x)))
  }

  async function adicionarSinonimo(termo: Termo) {
    const valor = (novoSinonimo[termo.id] ?? '').trim()
    if (!valor) return
    const r = await fetch(`${API}/vocabulario/termos/${termo.id}/sinonimos`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sinonimo: valor }),
    })
    if (!r.ok) {
      setErro(await lerErro(r, t('erroSalvar')))
      return
    }
    const atualizado: Termo = await r.json()
    setTermos((lista) => lista.map((x) => (x.id === atualizado.id ? atualizado : x)))
    setNovoSinonimo((m) => ({ ...m, [termo.id]: '' }))
    // o sinonimo pode ter saido da lista de termos livres
    fetch(`${API}/vocabulario/termos-livres`, { credentials: 'include' })
      .then((x) => (x.ok ? x.json() : null))
      .then((d) => d && setLivres(d.itens ?? []))
      .catch(() => {})
  }

  async function removerSinonimo(termo: Termo, sinonimoId: number) {
    const r = await fetch(`${API}/vocabulario/sinonimos/${sinonimoId}`, { method: 'DELETE', credentials: 'include' })
    if (!r.ok) {
      setErro(await lerErro(r, t('erroSalvar')))
      return
    }
    setTermos((lista) =>
      lista.map((x) => (x.id === termo.id ? { ...x, sinonimos: x.sinonimos.filter((s) => s.id !== sinonimoId) } : x))
    )
  }

  async function abrirConferencia(termo: Termo) {
    setErro('')
    const r = await fetch(`${API}/vocabulario/termos/${termo.id}/candidatas`, { credentials: 'include' })
    if (!r.ok) {
      setErro(await lerErro(r, t('erroCarregar')))
      return
    }
    const dados = await r.json()
    const itens: Candidata[] = dados.itens ?? []
    setConferindo({ termo, itens, marcadas: itens.map((i) => i.curation_id) })
  }

  async function vincular() {
    if (!conferindo || conferindo.marcadas.length === 0) return
    const r = await fetch(`${API}/vocabulario/termos/${conferindo.termo.id}/vincular`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ curation_ids: conferindo.marcadas }),
    })
    if (!r.ok) {
      setErro(await lerErro(r, t('erroSalvar')))
      return
    }
    const dados = await r.json()
    mostrarAviso(dados.mensagem ?? '')
    setConferindo(null)
    carregar()
  }

  const caixa = 'rounded-2xl border border-base-border bg-base-surface p-5'
  const entrada =
    'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand dark:bg-teal-600/20'
  const botao = 'rounded-lg border border-base-border px-3 py-1.5 text-sm text-slate-200 hover:border-brand hover:text-brand-300'
  const botaoPrincipal = 'rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-50'

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
        <main className="flex-1 space-y-6 overflow-y-auto p-6">
          <div>
            <h1 className="titulo-pagina tela-entra">
              {t('tituloPrefixo')} <span className="text-teal-600 dark:text-teal-300">{t('tituloDestaque')}</span>
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{t('subtitulo')}</p>
          </div>

          {erro && (
            <p className="text-sm text-red-400" role="alert">
              {erro}
            </p>
          )}
          {aviso && <p className="text-sm text-emerald-400">{aviso}</p>}

          {/* FORMULARIO: promover a termo oficial */}
          {promovendo && (
            <section className={`${caixa} border-teal-400/50`}>
              <h2 className="mb-3 text-sm font-semibold text-ink">{t('promoverTitulo')}</h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <label className="text-xs text-slate-400">
                  {t('campoTermo')}
                  <input className={`${entrada} mt-1`} value={promovendo.termo} maxLength={150} onChange={(e) => setPromovendo({ ...promovendo, termo: e.target.value })} />
                </label>
                <label className="text-xs text-slate-400">
                  {t('campoCategoria')}
                  <select className={`${entrada} mt-1`} value={promovendo.categoria} onChange={(e) => setPromovendo({ ...promovendo, categoria: e.target.value })}>
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c} className="bg-white text-slate-900">
                        {t(`categorias.${c}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-400">
                  {t('campoDecs')}{' '}
                  <a href="https://decs.bvsalud.org/" target="_blank" rel="noopener noreferrer" className="text-teal-300 underline">
                    DeCS
                  </a>
                  <input className={`${entrada} mt-1`} value={promovendo.decs} maxLength={30} placeholder="D000000" onChange={(e) => setPromovendo({ ...promovendo, decs: e.target.value })} />
                </label>
                <label className="text-xs text-slate-400">
                  {t('campoSinonimos')}
                  <input className={`${entrada} mt-1`} value={promovendo.sinonimos} placeholder={t('placeholderSinonimos')} onChange={(e) => setPromovendo({ ...promovendo, sinonimos: e.target.value })} />
                </label>
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" className={botaoPrincipal} disabled={promovendo.termo.trim().length < 2} onClick={promover}>
                  {t('promoverConfirmar')}
                </button>
                <button type="button" className={botao} onClick={() => setPromovendo(null)}>
                  {t('cancelar')}
                </button>
              </div>
            </section>
          )}

          {/* CONFERENCIA: fichas candidatas a ligar ao termo */}
          {conferindo && (
            <section className={`${caixa} border-amber-300/50`}>
              <h2 className="text-sm font-semibold text-ink">{t('conferirTitulo', { termo: conferindo.termo.termo })}</h2>
              <p className="mb-3 mt-0.5 text-xs text-slate-400">{t('conferirAjuda')}</p>
              {conferindo.itens.length === 0 ? (
                <p className="text-sm text-slate-400">{t('semCandidatas')}</p>
              ) : (
                <ul className="max-h-80 space-y-1 overflow-y-auto">
                  {conferindo.itens.map((c) => (
                    <li key={c.curation_id} className="flex items-start gap-2 rounded px-2 py-1 hover:bg-white/5">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-brand"
                        checked={conferindo.marcadas.includes(c.curation_id)}
                        onChange={() =>
                          setConferindo({
                            ...conferindo,
                            marcadas: conferindo.marcadas.includes(c.curation_id)
                              ? conferindo.marcadas.filter((x) => x !== c.curation_id)
                              : [...conferindo.marcadas, c.curation_id],
                          })
                        }
                        aria-label={t('fichaN', { numero: c.curation_id })}
                      />
                      <span className="text-sm text-ink">
                        <span className="font-semibold">{t('fichaN', { numero: c.curation_id })}</span>
                        <span className="text-slate-500"> · {c.status}</span>
                        <span className="block text-xs text-slate-400">“{c.trecho}”</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" className={botaoPrincipal} disabled={conferindo.marcadas.length === 0} onClick={vincular}>
                  {t('vincularSelecionadas', { quantidade: conferindo.marcadas.length })}
                </button>
                <button type="button" className={botao} onClick={() => setConferindo(null)}>
                  {t('fechar')}
                </button>
              </div>
            </section>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* TERMOS LIVRES */}
            <section className={caixa}>
              <h2 className="text-sm font-semibold text-ink">{t('livresTitulo')}</h2>
              <p className="mb-3 mt-0.5 text-xs text-slate-400">{t('livresAjuda')}</p>
              {livres.length === 0 ? (
                <p className="text-sm text-slate-500">{t('livresVazio')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="pb-1 font-medium">{t('colunaTexto')}</th>
                      <th className="pb-1 text-right font-medium">{t('colunaFichas')}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {livres.map((l) => (
                      <tr key={l.normalizado} className="border-t border-white/5">
                        <td className="py-1.5 text-ink">{l.texto}</td>
                        <td className="py-1.5 text-right tabular-nums text-slate-300">{l.quantidade_fichas}</td>
                        <td className="py-1.5 pl-3 text-right">
                          <button
                            type="button"
                            className="whitespace-nowrap rounded-md border border-teal-400/40 px-2 py-0.5 text-xs text-teal-200 hover:bg-teal-400/10"
                            onClick={() => {
                              setPromovendo({ termo: l.texto, categoria: 'achado', decs: '', sinonimos: '' })
                              window.scrollTo({ top: 0, behavior: 'smooth' })
                            }}
                          >
                            {t('promover')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* TERMOS OFICIAIS */}
            <section className={caixa}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-ink">{t('oficiaisTitulo')}</h2>
                  <p className="mb-3 mt-0.5 text-xs text-slate-400">{t('oficiaisAjuda')}</p>
                </div>
                <button
                  type="button"
                  className={botao}
                  onClick={() => {
                    setPromovendo({ termo: '', categoria: 'achado', decs: '', sinonimos: '' })
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  + {t('novoTermo')}
                </button>
              </div>
              {termos.length === 0 ? (
                <p className="text-sm text-slate-500">{t('oficiaisVazio')}</p>
              ) : (
                <ul className="space-y-3">
                  {termos.map((termo) => (
                    <li key={termo.id} className={`rounded-xl border border-white/10 p-3 ${termo.ativo ? '' : 'opacity-60'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{termo.termo}</span>
                        <span className="rounded-full bg-teal-400/10 px-2 py-0.5 text-[11px] text-teal-200">{t(`categorias.${termo.categoria}`)}</span>
                        {termo.codigo_decs && <span className="text-[11px] text-slate-400">DeCS {termo.codigo_decs}</span>}
                        <span className="ml-auto text-xs text-slate-400">{t('fichasLigadas', { quantidade: termo.quantidade_fichas })}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {termo.sinonimos.map((s) => (
                          <span key={s.id} className="flex items-center gap-1 rounded-full border border-white/15 px-2 py-0.5 text-xs text-slate-200">
                            {s.sinonimo}
                            <button type="button" onClick={() => removerSinonimo(termo, s.id)} className="text-slate-500 hover:text-red-400" aria-label={t('removerSinonimo')}>
                              ✕
                            </button>
                          </span>
                        ))}
                        <input
                          className="w-40 rounded-full border border-white/15 bg-transparent px-2 py-0.5 text-xs text-ink outline-none focus:border-teal-300"
                          placeholder={t('adicionarSinonimo')}
                          value={novoSinonimo[termo.id] ?? ''}
                          onChange={(e) => setNovoSinonimo((m) => ({ ...m, [termo.id]: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') adicionarSinonimo(termo)
                          }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" className="text-xs text-teal-200 hover:underline" onClick={() => abrirConferencia(termo)}>
                          {t('conferirFichas')}
                        </button>
                        <button type="button" className="text-xs text-slate-400 hover:underline" onClick={() => editar(termo, { ativo: !termo.ativo })}>
                          {termo.ativo ? t('desativar') : t('reativar')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  )
}
