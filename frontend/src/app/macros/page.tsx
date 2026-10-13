'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { obterSessaoAtual } from '../../lib/sessao'
import { CATEGORIAS_ALTERACOES } from '../../lib/alteracoesObservadas'

// MACROS DA CURADORIA (frases prontas da equipe) + FRASES QUE A VOZ
// APRENDEU. Uma macro preenche de uma vez descricao, achados, observacoes,
// alteracoes, tipo e qualidade; e usada pelo menu "⚡ Macros" da Curadoria
// ou falando "macro <nome>". Ver backend/app/modules/macros_router.py.

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS_PERMITIDOS = ['administrador', 'curador', 'suporte']
const TIPOS = ['periapical', 'panoramica', 'oclusal', 'interproximal']
const QUALIDADES = ['otima', 'boa', 'regular', 'insatisfatoria']

interface Conteudo {
  descricao_didatica?: string
  achados_detalhe?: string
  observacoes_internas?: string
  alteracoes_observadas?: string[]
  tipo_radiografia?: string | null
  qualidade_tecnica?: string | null
}
interface Macro {
  id: number
  nome: string
  conteudo: Conteudo
  ativo: boolean
}
interface Frase {
  id: number
  frase: string
  alteracao: string
}
interface Edicao {
  id: number | null
  nome: string
  conteudo: Required<Omit<Conteudo, 'tipo_radiografia' | 'qualidade_tecnica'>> & { tipo_radiografia: string; qualidade_tecnica: string }
}

const VAZIA: Edicao['conteudo'] = {
  descricao_didatica: '',
  achados_detalhe: '',
  observacoes_internas: '',
  alteracoes_observadas: [],
  tipo_radiografia: '',
  qualidade_tecnica: '',
}

const campoTexto =
  'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 dark:bg-teal-600/20 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand'

async function lerErro(r: Response, padrao: string) {
  try {
    const dados = await r.json()
    if (typeof dados?.detail === 'string') return dados.detail
    if (Array.isArray(dados?.detail) && dados.detail[0]?.msg) return String(dados.detail[0].msg)
  } catch {
    // sem corpo legivel
  }
  return padrao
}

export default function MacrosPage() {
  const router = useRouter()
  const t = useTranslations('Macros')
  const tComum = useTranslations('Comum')
  const tOpcoes = useTranslations('Pesquisa.opcoes')
  const tItens = useTranslations('AlteracoesObservadas.itens')
  const tCategorias = useTranslations('AlteracoesObservadas.categorias')
  const [carregando, setCarregando] = useState(true)
  const [macros, setMacros] = useState<Macro[]>([])
  const [frases, setFrases] = useState<Frase[]>([])
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')

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
    setErro('')
    try {
      const [rm, rf] = await Promise.all([
        fetch(`${API}/macros?incluir_inativas=true`, { credentials: 'include' }),
        fetch(`${API}/voz/frases`, { credentials: 'include' }),
      ])
      if (!rm.ok || !rf.ok) {
        setErro(t('erroCarregar'))
        return
      }
      setMacros((await rm.json()).macros ?? [])
      setFrases((await rf.json()).frases ?? [])
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

  function editar(m: Macro | null) {
    setErro('')
    setEdicao(
      m
        ? {
            id: m.id,
            nome: m.nome,
            conteudo: {
              ...VAZIA,
              ...m.conteudo,
              alteracoes_observadas: m.conteudo.alteracoes_observadas ?? [],
              tipo_radiografia: m.conteudo.tipo_radiografia ?? '',
              qualidade_tecnica: m.conteudo.qualidade_tecnica ?? '',
            },
          }
        : { id: null, nome: '', conteudo: { ...VAZIA } }
    )
  }

  async function salvar() {
    if (!edicao) return
    setErro('')
    const corpo = {
      nome: edicao.nome,
      conteudo: {
        ...edicao.conteudo,
        tipo_radiografia: edicao.conteudo.tipo_radiografia || null,
        qualidade_tecnica: edicao.conteudo.qualidade_tecnica || null,
      },
    }
    const r = await fetch(edicao.id ? `${API}/macros/${edicao.id}` : `${API}/macros`, {
      method: edicao.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(corpo),
    })
    if (!r.ok) {
      setErro(await lerErro(r, t('erroSalvar')))
      return
    }
    setEdicao(null)
    mostrarAviso(t('salva'))
    carregar()
  }

  async function alternarAtiva(m: Macro) {
    const r = await fetch(`${API}/macros/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ativo: !m.ativo }),
    })
    if (r.ok) carregar()
    else setErro(await lerErro(r, t('erroSalvar')))
  }

  async function esquecer(f: Frase) {
    const r = await fetch(`${API}/voz/frases/${f.id}`, { method: 'DELETE', credentials: 'include' })
    if (r.ok) carregar()
  }

  function traduzirItem(valor: string) {
    try {
      return tItens(valor)
    } catch {
      return valor
    }
  }

  if (carregando) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-base">
        <p className="text-slate-300">{tComum('carregando')}</p>
      </main>
    )
  }

  const c = edicao?.conteudo
  const mudar = (parcial: Partial<Edicao['conteudo']>) => edicao && setEdicao({ ...edicao, conteudo: { ...edicao.conteudo, ...parcial } })

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 space-y-6 overflow-y-auto p-6">
          <div>
            <h1 className="titulo-pagina tela-entra">
              {t('tituloPrefixo')} <span className="text-violet-600 dark:text-violet-300">{t('tituloDestaque')}</span>
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">{t('subtitulo')}</p>
          </div>

          {erro && <p className="rounded-lg bg-red-500/10 p-3 text-sm text-red-300" role="alert">{erro}</p>}
          {aviso && <p className="rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-300">{aviso}</p>}

          <section className="rounded-2xl border border-base-border bg-base-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-ink">{t('macros')}</h2>
              <button type="button" onClick={() => editar(null)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
                + {t('nova')}
              </button>
            </div>

            {edicao && c && (
              <div className="mb-4 space-y-3 rounded-xl border border-violet-300/40 bg-violet-400/5 p-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-400">{t('nome')}</label>
                  <input value={edicao.nome} maxLength={80} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} className={campoTexto} placeholder={t('exemploNome')} />
                  <p className="mt-1 text-[11px] text-slate-500">{t('dicaNome')}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">{t('tipo')}</label>
                    <select value={c.tipo_radiografia} onChange={(e) => mudar({ tipo_radiografia: e.target.value })} className={campoTexto}>
                      <option value="">{t('naoAlterar')}</option>
                      {TIPOS.map((v) => <option key={v} value={v}>{tOpcoes(`tipoRadiografia.${v}`)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">{t('qualidade')}</label>
                    <select value={c.qualidade_tecnica} onChange={(e) => mudar({ qualidade_tecnica: e.target.value })} className={campoTexto}>
                      <option value="">{t('naoAlterar')}</option>
                      {QUALIDADES.map((v) => <option key={v} value={v}>{tOpcoes(`qualidadeTecnica.${v}`)}</option>)}
                    </select>
                  </div>
                </div>
                {(['descricao_didatica', 'achados_detalhe', 'observacoes_internas'] as const).map((campo) => (
                  <div key={campo}>
                    <label className="mb-1 block text-xs font-medium text-slate-400">{t(`campos.${campo}`)}</label>
                    <textarea value={c[campo]} rows={campo === 'descricao_didatica' ? 3 : 2} onChange={(e) => mudar({ [campo]: e.target.value })} className={campoTexto} />
                  </div>
                ))}
                <details>
                  <summary className="cursor-pointer text-xs font-medium text-slate-300">
                    {t('alteracoes')} ({c.alteracoes_observadas.length})
                  </summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {CATEGORIAS_ALTERACOES.map((g) => (
                      <div key={g.categoria}>
                        <p className="text-[11px] font-semibold text-slate-400">{tCategorias(g.categoriaChave)}</p>
                        {g.itens.map((item) => (
                          <label key={item.valor} className="flex items-center gap-1.5 text-xs text-slate-300">
                            <input
                              type="checkbox"
                              checked={c.alteracoes_observadas.includes(item.valor)}
                              onChange={() =>
                                mudar({
                                  alteracoes_observadas: c.alteracoes_observadas.includes(item.valor)
                                    ? c.alteracoes_observadas.filter((x) => x !== item.valor)
                                    : [...c.alteracoes_observadas, item.valor],
                                })
                              }
                              className="h-3 w-3"
                            />
                            {traduzirItem(item.valor)}
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setEdicao(null)} className="rounded-lg border border-base-border px-3 py-1.5 text-sm text-slate-300">
                    {t('cancelar')}
                  </button>
                  <button type="button" onClick={salvar} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
                    {t('salvar')}
                  </button>
                </div>
              </div>
            )}

            {macros.length === 0 ? (
              <p className="text-sm text-slate-500">{t('nenhuma')}</p>
            ) : (
              <ul className="divide-y divide-base-border">
                {macros.map((m) => (
                  <li key={m.id} className={`flex items-start gap-3 py-2.5 ${m.ativo ? '' : 'opacity-50'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        ⚡ {m.nome} {!m.ativo && <span className="ml-1 text-[11px] font-normal text-slate-500">({t('inativa')})</span>}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {m.conteudo.descricao_didatica || m.conteudo.achados_detalhe || m.conteudo.observacoes_internas || '—'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {[
                          m.conteudo.tipo_radiografia && tOpcoes(`tipoRadiografia.${m.conteudo.tipo_radiografia}`),
                          m.conteudo.qualidade_tecnica && tOpcoes(`qualidadeTecnica.${m.conteudo.qualidade_tecnica}`),
                          m.conteudo.alteracoes_observadas?.length ? t('nAlteracoes', { quantidade: m.conteudo.alteracoes_observadas.length }) : '',
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <button type="button" onClick={() => editar(m)} className="text-xs text-teal-200 hover:underline">{t('editar')}</button>
                    <button type="button" onClick={() => alternarAtiva(m)} className="text-xs text-slate-400 hover:text-ink">
                      {m.ativo ? t('desativar') : t('reativar')}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-base-border bg-base-surface p-4">
            <h2 className="text-base font-semibold text-ink">{t('frases')}</h2>
            <p className="mb-3 text-xs text-slate-400">{t('frasesSubtitulo')}</p>
            {frases.length === 0 ? (
              <p className="text-sm text-slate-500">{t('nenhumaFrase')}</p>
            ) : (
              <ul className="divide-y divide-base-border">
                {frases.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="italic text-slate-300">“{f.frase}”</span>
                    <span className="text-slate-500">→</span>
                    <span className="flex-1 text-ink">{traduzirItem(f.alteracao)}</span>
                    <button type="button" onClick={() => esquecer(f)} className="text-xs text-slate-400 hover:text-red-300">{t('esquecer')}</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  )
}
