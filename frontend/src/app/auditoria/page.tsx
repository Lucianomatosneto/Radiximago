'use client'

import IntegridadeAuditoria from '../../components/IntegridadeAuditoria'
import { Fragment, useEffect, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import Sidebar from '../../components/Sidebar'
import Topbar from '../../components/Topbar'
import { obterSessaoAtual } from '../../lib/sessao'
import { GRUPOS_ACOES, conhecida, detalhesLegiveis, rotuloAcao, rotuloEntidade, textoLegivel } from '../../lib/acoesAuditoria'

const PERFIS_PERMITIDOS = ['administrador']

const LIMIT = 50

const TAG_LOCALE: Record<string, string> = { pt: 'pt-BR', en: 'en-US' }

const OPCOES_RESULTADO = ['sucesso', 'negado', 'alerta', 'erro']

const CORES_RESULTADO: Record<string, string> = {
  alerta: 'bg-amber-500/15 text-amber-300 border-amber-600/40',
  sucesso: 'bg-emerald-500/15 text-emerald-300 border-emerald-600/40',
  negado: 'bg-red-500/15 text-red-300 border-red-600/40',
  erro: 'bg-orange-500/15 text-orange-300 border-orange-600/40',
}

interface AuditLogItem {
  id: number
  usuario_id: number | null
  acao: string
  entidade: string
  entidade_id: number | null
  resultado: string
  detalhes: string | null
  criado_em: string | null
  ip?: string | null
  rota?: string | null
  /** quantos registros iguais no mesmo segundo (com "agrupar repetidos") */
  vezes?: number
}

interface Usuario {
  id: number
  nome: string
}

function formatarData(valor: string | null, tagLocale: string): string {
  if (!valor) return '—'
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return '—'
  return data.toLocaleString(tagLocale)
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

export default function AuditoriaPage() {
  const router = useRouter()
  const t = useTranslations('Auditoria')
  const tComum = useTranslations('Comum')
  const tPesquisa = useTranslations('Pesquisa')
  const locale = useLocale()
  const tagLocale = TAG_LOCALE[locale] ?? 'pt-BR'

  // M3 (01/11/2026): rotulos de TODAS as acoes vem de lib/acoesAuditoria.ts
  const rotularAcao = (valor: string, detalhes?: string | null) => rotuloAcao(valor, locale, detalhes)

  function rotularResultado(valor: string): string {
    if (!OPCOES_RESULTADO.includes(valor)) return valor
    return t(`resultados.${valor}`)
  }

  const [autenticado, setAutenticado] = useState(false)
  const [carregando, setCarregando] = useState(true)

  const [filtroAcao, setFiltroAcao] = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [agrupar, setAgrupar] = useState(true)
  // quantas vezes cada acao aparece (o filtro mostra todas, inclusive antigas)
  const [contagemAcoes, setContagemAcoes] = useState<Record<string, number>>({})
  const [filtroResultado, setFiltroResultado] = useState('')
  const [dataDe, setDataDe] = useState('')
  const [dataAte, setDataAte] = useState('')

  const [itens, setItens] = useState<AuditLogItem[]>([])
  const [total, setTotal] = useState(0)
  const [skip, setSkip] = useState(0)
  const [buscando, setBuscando] = useState(false)
  const [erro, setErro] = useState('')

  const [mapaUsuarios, setMapaUsuarios] = useState<Record<number, string>>({})
  const [expandidos, setExpandidos] = useState<Set<number>>(new Set())

  useEffect(() => {
    obterSessaoAtual().then((sessao) => {
      if (!sessao) {
        router.push('/login')
        return
      }
      if (!PERFIS_PERMITIDOS.includes(sessao.perfil)) {
        router.push('/acesso-negado?de=/auditoria')
        return
      }
      setAutenticado(true)
      carregarUsuarios()
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/admin/audit-logs/acoes`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.acoes && setContagemAcoes(d.acoes))
        .catch(() => {})
      buscarLogs(0)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router])

  async function carregarUsuarios() {
    try {
      const resposta = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/users/`, {
        credentials: 'include',
      })
      if (!resposta.ok) return
      const usuarios: Usuario[] = await resposta.json()
      const mapa: Record<number, string> = {}
      for (const usuario of usuarios) mapa[usuario.id] = usuario.nome
      setMapaUsuarios(mapa)
    } catch {
      // resolucao de nome e so um extra - segue com o id se falhar
    }
  }

  async function buscarLogs(skipAtual: number) {
    setBuscando(true)
    setErro('')

    const params = new URLSearchParams()
    if (filtroAcao) params.set('acao', filtroAcao)
    if (filtroUsuario) params.set('usuario_id', filtroUsuario)
    if (agrupar) params.set('agrupar', 'true')
    if (filtroResultado) params.set('resultado', filtroResultado)
    if (dataDe) params.set('data_de', `${dataDe}T00:00:00`)
    if (dataAte) params.set('data_ate', `${dataAte}T23:59:59`)
    params.set('skip', String(skipAtual))
    params.set('limit', String(LIMIT))

    try {
      const resposta = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/admin/audit-logs?${params.toString()}`,
        { credentials: 'include' }
      )
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
      setTotal(dados.total ?? 0)
      setSkip(skipAtual)
      setExpandidos(new Set())
    } catch {
      setErro(t('erroCarregar'))
    } finally {
      setBuscando(false)
      setCarregando(false)
    }
  }

  function pesquisar() {
    if (autenticado) buscarLogs(0)
  }

  function paginaAnterior() {
    if (autenticado && skip > 0) buscarLogs(Math.max(0, skip - LIMIT))
  }

  function proximaPagina() {
    if (autenticado && skip + LIMIT < total) buscarLogs(skip + LIMIT)
  }

  function alternarDetalhes(id: number) {
    setExpandidos((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) {
        novo.delete(id)
      } else {
        novo.add(id)
      }
      return novo
    })
  }

  function nomeUsuario(usuarioId: number | null): string {
    if (usuarioId === null) return '—'
    return mapaUsuarios[usuarioId] ?? t('usuarioNumero', { id: usuarioId })
  }

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
          <h1 className="titulo-pagina tela-entra mb-6">{t('titulo')}</h1>
          <IntegridadeAuditoria />

          <section className="rounded-xl border border-base-border bg-base-surface p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">{t('campoAcao')}</label>
                <select
                  value={filtroAcao}
                  onChange={(e) => setFiltroAcao(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-hidden focus:border-brand"
                >
                  <option value="">{tPesquisa('opcaoTodas')}</option>
                  {GRUPOS_ACOES.map((grupo) => (
                    <optgroup key={grupo.chave} label={locale === 'en' ? grupo.en : grupo.pt}>
                      {grupo.itens.map((item) => (
                        <option key={item.valor} value={item.valor}>
                          {locale === 'en' ? item.en : item.pt}
                          {contagemAcoes[item.valor] ? ` (${contagemAcoes[item.valor]})` : ''}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                  {Object.keys(contagemAcoes).some((v) => !conhecida(v)) && (
                    <optgroup label={t('outrasAcoes')}>
                      {Object.keys(contagemAcoes)
                        .filter((v) => !conhecida(v))
                        .sort()
                        .map((v) => (
                          <option key={v} value={v}>
                            {textoLegivel(v)} ({contagemAcoes[v]})
                          </option>
                        ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">{t('campoUsuario')}</label>
                <select
                  value={filtroUsuario}
                  onChange={(e) => setFiltroUsuario(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-hidden focus:border-brand"
                >
                  <option value="">{tPesquisa('campoTodos')}</option>
                  {Object.entries(mapaUsuarios)
                    .sort((x, y) => x[1].localeCompare(y[1], 'pt-BR'))
                    .map(([id, nome]) => (
                      <option key={id} value={id}>
                        {nome}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">{t('campoResultado')}</label>
                <select
                  value={filtroResultado}
                  onChange={(e) => setFiltroResultado(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-hidden focus:border-brand"
                >
                  <option value="">{tPesquisa('campoTodos')}</option>
                  {OPCOES_RESULTADO.map((valor) => (
                    <option key={valor} value={valor}>
                      {t(`resultados.${valor}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">{t('campoDataInicial')}</label>
                <input
                  type="date"
                  value={dataDe}
                  onChange={(e) => setDataDe(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-hidden focus:border-brand"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-400">{t('campoDataFinal')}</label>
                <input
                  type="date"
                  value={dataAte}
                  onChange={(e) => setDataAte(e.target.value)}
                  className="w-full rounded-md border border-slate-700 bg-base-surface2 px-3 py-2 text-sm text-slate-100 outline-hidden focus:border-brand"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="h-4 w-4 accent-teal-500" />
                {t('agruparRepetidos')}
              </label>
              <button
                type="button"
                onClick={pesquisar}
                disabled={buscando}
                className="rounded-md bg-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
              >
                {buscando ? t('buscando') : t('filtrar')}
              </button>
              {erro && (
                <p className="text-sm text-red-400" role="alert">
                  {erro}
                </p>
              )}
            </div>
          </section>

          <div className="mt-6 overflow-x-auto rounded-xl border border-base-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-base-surface text-slate-400">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('colData')}</th>
                  <th className="px-4 py-3 font-medium">{t('colUsuario')}</th>
                  <th className="px-4 py-3 font-medium">{t('colAcao')}</th>
                  <th className="px-4 py-3 font-medium">{t('colEntidade')}</th>
                  <th className="px-4 py-3 font-medium">{t('colResultado')}</th>
                  <th className="px-4 py-3 font-medium">{t('colDetalhes')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-base">
                {itens.map((item) => (
                  <Fragment key={item.id}>
                    <tr className="text-slate-200">
                      <td className="px-4 py-3 text-slate-400">{formatarData(item.criado_em, tagLocale)}</td>
                      <td className="px-4 py-3">{nomeUsuario(item.usuario_id)}</td>
                      <td className="px-4 py-3">
                        {rotularAcao(item.acao, item.detalhes)}
                        {(item.vezes ?? 1) > 1 && (
                          <span className="ml-2 rounded-full border border-slate-600/50 px-1.5 text-[11px] text-slate-400" title={t('vezesDica')}>
                            {t('vezes', { n: item.vezes ?? 1 })}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400">{rotuloEntidade(item.entidade, item.entidade_id, locale)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                            CORES_RESULTADO[item.resultado] ??
                            'bg-slate-500/15 text-slate-300 border-slate-600/40'
                          }`}
                        >
                          {rotularResultado(item.resultado)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => alternarDetalhes(item.id)}
                          className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-300 hover:border-brand hover:text-brand-300"
                        >
                          {expandidos.has(item.id) ? t('ocultar') : t('detalhes')}
                        </button>
                      </td>
                    </tr>
                    {expandidos.has(item.id) && (
                      <tr className="bg-base-surface/60">
                        <td colSpan={6} className="px-4 py-3 text-xs text-slate-400">
                          {/* M3: detalhes legiveis, rotulados */}
                          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                            <dt className="font-semibold text-slate-500">{t('detalheTexto')}</dt>
                            <dd className="whitespace-pre-wrap break-words text-ink">{detalhesLegiveis(item.detalhes) || t('semDetalhes')}</dd>
                            {item.rota && (
                              <>
                                <dt className="font-semibold text-slate-500">{t('detalheRota')}</dt>
                                <dd className="font-mono">{detalhesLegiveis(item.rota)}</dd>
                              </>
                            )}
                            {item.ip && (
                              <>
                                <dt className="font-semibold text-slate-500">{t('detalheIp')}</dt>
                                <dd className="font-mono">{item.ip}</dd>
                              </>
                            )}
                            <dt className="font-semibold text-slate-500">{t('detalheRegistro')}</dt>
                            <dd>
                              nº {item.id}
                              {(item.vezes ?? 1) > 1 ? ` · ${t('vezesDica')}` : ''}
                            </dd>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}

                {itens.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      {t('nenhumRegistro')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
            <span>
              {total > 0
                ? t('mostrandoRegistros', { de: skip + 1, ate: Math.min(skip + LIMIT, total), total })
                : t('zeroRegistros')}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={paginaAnterior}
                disabled={skip === 0 || buscando}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('anterior')}
              </button>
              <button
                type="button"
                onClick={proximaPagina}
                disabled={skip + LIMIT >= total || buscando}
                className="rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('proximo')}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
