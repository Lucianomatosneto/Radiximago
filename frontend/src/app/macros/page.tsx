'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { obterSessaoAtual } from '../../lib/sessao'
import { CATEGORIAS_ALTERACOES } from '../../lib/alteracoesObservadas'
import FiltroErrosTecnicos from '../../components/pesquisa/FiltroErrosTecnicos'
import BuscaTermos from '../../components/pesquisa/BuscaTermos'
import { DENTES_FDI, itensDoVocabulario, normalizarBusca, type ItemCatalogo, type TermoVocabularioApi } from '../../lib/catalogoTermos'

// MACROS DA CURADORIA (frases prontas da equipe) + FRASES QUE A VOZ
// APRENDEU. Uma macro preenche de uma vez descricao, achados, observacoes,
// alteracoes, tipo e qualidade; e usada pelo menu "⚡ Macros" da Curadoria
// ou falando "macro <nome>". Ver backend/app/modules/macros_router.py.
// 27/10/2026: a macro usa as MESMAS listas da Curadoria e da Pesquisa
// avancada - achados (com busca pelas iniciais), origem, erros tecnicos,
// termos do vocabulario e dentes - e a tela tem "Voltar".

const API = process.env.NEXT_PUBLIC_API_URL
const PERFIS_PERMITIDOS = ['administrador', 'curador', 'suporte']
const TIPOS = ['periapical', 'panoramica', 'oclusal', 'interproximal', 'tomografia']
const QUALIDADES = ['otima', 'boa', 'regular', 'insatisfatoria']

interface Conteudo {
  descricao_didatica?: string
  achados_detalhe?: string
  observacoes_internas?: string
  alteracoes_observadas?: string[]
  tipo_radiografia?: string | null
  qualidade_tecnica?: string | null
  origem?: string | null
  erros_tecnicos?: string[]
  termos?: number[]
  dentes?: number[]
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
  conteudo: Required<Omit<Conteudo, 'tipo_radiografia' | 'qualidade_tecnica' | 'origem'>> & {
    tipo_radiografia: string
    qualidade_tecnica: string
    origem: string
  }
}

const VAZIA: Edicao['conteudo'] = {
  descricao_didatica: '',
  achados_detalhe: '',
  observacoes_internas: '',
  alteracoes_observadas: [],
  tipo_radiografia: '',
  qualidade_tecnica: '',
  origem: '',
  erros_tecnicos: [],
  termos: [],
  dentes: [],
}

const campoTexto =
  'w-full rounded-lg border border-teal-500/40 bg-teal-100/70 dark:bg-teal-600/20 px-2.5 py-1.5 text-sm text-ink outline-hidden focus:border-brand'

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
  const [carregando, setCarregando] = useState(true)
  const [macros, setMacros] = useState<Macro[]>([])
  const [frases, setFrases] = useState<Frase[]>([])
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [vocabulario, setVocabulario] = useState<TermoVocabularioApi[]>([])
  const tTermos = useTranslations('BuscaTermos')

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
      fetch(`${API}/vocabulario`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.termos && setVocabulario(d.termos))
        .catch(() => {})
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
              origem: m.conteudo.origem ?? '',
              erros_tecnicos: m.conteudo.erros_tecnicos ?? [],
              termos: m.conteudo.termos ?? [],
              dentes: m.conteudo.dentes ?? [],
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
        origem: edicao.conteudo.origem || null,
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
  const catalogoAchados: ItemCatalogo[] = CATEGORIAS_ALTERACOES.flatMap((g) =>
    g.itens.map((i) => ({ tipo: 'achado' as const, valor: i.valor, rotulo: traduzirItem(i.valor), chaves: [normalizarBusca(traduzirItem(i.valor))] }))
  )
  const catalogoVocab = itensDoVocabulario(vocabulario, (lista) => tTermos('sinonimos', { lista }))
  const mudar = (parcial: Partial<Edicao['conteudo']>) => edicao && setEdicao({ ...edicao, conteudo: { ...edicao.conteudo, ...parcial } })

  return (
    <div className="flex min-h-screen bg-base">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar />
        <main className="flex-1 space-y-6 overflow-y-auto p-6">
          <button
            type="button"
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/curadoria'))}
            className="inline-flex items-center gap-1.5 rounded-full border border-base-border px-3 py-1.5 text-sm text-slate-300 transition hover:border-brand hover:text-brand-300"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            {t('voltar')}
          </button>
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
                <div className="grid gap-3 sm:grid-cols-3">
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
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">{tOpcoes('origemRotulo')}</label>
                    <select value={c.origem} onChange={(e) => mudar({ origem: e.target.value })} className={campoTexto}>
                      <option value="">{t('naoAlterar')}</option>
                      {['ufsc', 'externa'].map((v) => <option key={v} value={v}>{tOpcoes(`origem.${v}`)}</option>)}
                    </select>
                  </div>
                </div>
                {(['descricao_didatica', 'achados_detalhe', 'observacoes_internas'] as const).map((campo) => (
                  <div key={campo}>
                    <label className="mb-1 block text-xs font-medium text-slate-400">{t(`campos.${campo}`)}</label>
                    <textarea value={c[campo]} rows={campo === 'descricao_didatica' ? 3 : 2} onChange={(e) => mudar({ [campo]: e.target.value })} className={campoTexto} />
                  </div>
                ))}
                {/* ACHADOS: a mesma lista da Curadoria, com busca pelas iniciais */}
                <BuscaTermos
                  catalogo={catalogoAchados}
                  selecionados={c.alteracoes_observadas.map((v) => ({ tipo: 'achado' as const, valor: v, rotulo: traduzirItem(v) }))}
                  onChange={(lista) => mudar({ alteracoes_observadas: lista.map((x) => x.valor) })}
                  rotuloCampo={`${t('alteracoes')} (${c.alteracoes_observadas.length})`}
                  placeholder={t('achadosPlaceholder')}
                />
                <BuscaTermos
                  catalogo={catalogoVocab}
                  selecionados={c.termos.map((id) => ({ tipo: 'vocab' as const, valor: String(id), rotulo: vocabulario.find((v) => v.id === id)?.termo ?? `#${id}` }))}
                  onChange={(lista) => mudar({ termos: lista.map((x) => Number(x.valor)) })}
                  rotuloCampo={`${t('termos')} (${c.termos.length})`}
                  placeholder={tTermos('placeholderFicha')}
                />
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-400">
                    {t('errosTecnicos')} ({c.erros_tecnicos.length})
                  </p>
                  <FiltroErrosTecnicos selecionados={c.erros_tecnicos} onChange={(v) => mudar({ erros_tecnicos: v })} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-slate-400">
                    {t('dentes')} {c.dentes.length > 0 && <span className="text-teal-300">({c.dentes.join(', ')})</span>}
                  </p>
                  <div className="space-y-1 rounded-lg border border-base-border p-1.5">
                    {[DENTES_FDI.slice(0, 16), DENTES_FDI.slice(16, 32), DENTES_FDI.slice(32, 42), DENTES_FDI.slice(42)].map((linha, i) => (
                      <div key={i} className="flex flex-wrap gap-0.5">
                        {linha.map((d) => {
                          const marcado = c.dentes.includes(d)
                          return (
                            <button
                              key={d}
                              type="button"
                              aria-pressed={marcado}
                              onClick={() =>
                                mudar({ dentes: marcado ? c.dentes.filter((x) => x !== d) : [...c.dentes, d].sort((x, y) => x - y) })
                              }
                              className={`w-8 rounded py-0.5 text-[11px] font-semibold ${marcado ? 'bg-brand text-white' : 'bg-white/5 text-slate-400 hover:bg-white/15'}`}
                            >
                              {d}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
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
                          m.conteudo.origem && tOpcoes(`origem.${m.conteudo.origem}`),
                          m.conteudo.erros_tecnicos?.length ? `${t('errosTecnicos')}: ${m.conteudo.erros_tecnicos.length}` : '',
                          m.conteudo.termos?.length ? `${t('termos')}: ${m.conteudo.termos.length}` : '',
                          m.conteudo.dentes?.length ? `${t('dentes')}: ${m.conteudo.dentes.join(', ')}` : '',
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
